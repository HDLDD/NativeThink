package com.nativethink.app;

import android.content.res.AssetManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;

/**
 * 内置离线朗读引擎（sherpa-onnx + Piper VITS 音色）。
 *
 * 存在的理由：安卓系统自带的 TTS 引擎在很多机器上「没有安装本地音色」，只能联网合成，
 * 表现为起播慢、随网速波动、偶尔读不出来或只读一半，而且刚读过的句子因为缓存才变快。
 * 本插件把合成完全放在设备内完成（同方案实测 RTF≈0.08，3 秒语音约 250ms 合成完），
 * 与网速彻底无关。
 *
 * 设计取舍：
 *  - 只负责「合成」，不负责播放。合成结果落成 WAV 文件返回路径，播放仍由 WebView 端的
 *    <audio> 负责 —— 这样播放队列、暂停/续读、语速微调都能复用现有逻辑。
 *  - 结果按 (文本+语速) 哈希缓存到 cacheDir，重复朗读与预取都直接命中文件。
 *  - 模型与音色放在 assets，首次使用时摊到 filesDir：sherpa-onnx 走真实文件路径最稳，
 *    避免各家 ROM 对 asset 路径处理不一致。
 */
@CapacitorPlugin(name = "SherpaTts")
public class SherpaTtsPlugin extends Plugin {

    /** assets 下的音色目录（由 scripts/fetch-android-tts.cjs 拉取） */
    private static final String ASSET_VOICE_DIR = "piper/vits-piper-en_US-lessac-medium";
    private static final String MODEL_NAME = "en_US-lessac-medium.onnx";

    private static final String STATE_IDLE = "idle";
    private static final String STATE_LOADING = "loading";
    private static final String STATE_READY = "ready";
    private static final String STATE_ERROR = "error";

    private volatile String state = STATE_IDLE;
    private volatile String lastError = null;

    private OfflineTts tts;
    private File modelDir;
    private File wavDir;
    /** sherpa-onnx 的 generate 不是线程安全的，串行化 */
    private final Object synthLock = new Object();

    private void ensureDirs() {
        if (modelDir == null) {
            modelDir = new File(getContext().getFilesDir(), ASSET_VOICE_DIR);
        }
        if (wavDir == null) {
            wavDir = new File(getContext().getCacheDir(), "sherpa-tts");
            if (!wavDir.exists()) wavDir.mkdirs();
        }
    }

    private JSObject stateObject() {
        JSObject o = new JSObject();
        o.put("status", state);
        o.put("error", lastError);
        o.put("sampleRate", tts != null ? tts.sampleRate() : 0);
        o.put("cached", wavDir != null && wavDir.exists() ? wavDir.list().length : 0);
        return o;
    }

    /** 查询引擎状态（不触发加载） */
    @PluginMethod
    public void status(PluginCall call) {
        ensureDirs();
        call.resolve(stateObject());
    }

    /** 加载引擎（幂等；耗时较长，故放后台线程）。JS 端可提前调用预热。 */
    @PluginMethod
    public void init(PluginCall call) {
        ensureDirs();
        if (STATE_READY.equals(state) || STATE_LOADING.equals(state)) {
            call.resolve(stateObject());
            return;
        }
        state = STATE_LOADING;
        lastError = null;
        new Thread(() -> {
            try {
                long t0 = System.currentTimeMillis();
                copyAssets(ASSET_VOICE_DIR, modelDir);
                OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig(
                        new File(modelDir, MODEL_NAME).getAbsolutePath(),   // model
                        null,                                               // lexicon
                        new File(modelDir, "tokens.txt").getAbsolutePath(), // tokens
                        new File(modelDir, "espeak-ng-data").getAbsolutePath(), // dataDir
                        null,                                               // dictDir
                        0.667f,                                             // noiseScale
                        0.8f,                                               // noiseScaleW
                        1.0f);                                              // lengthScale
                OfflineTtsModelConfig model = new OfflineTtsModelConfig(
                        vits, null, null, null,
                        Math.max(2, Runtime.getRuntime().availableProcessors() / 2), // numThreads
                        false,                                              // debug
                        "cpu");                                             // provider
                OfflineTtsConfig config = new OfflineTtsConfig(model, null, null, 1, 0.2f);
                OfflineTts engine = new OfflineTts(getContext().getAssets(), config);
                tts = engine;
                state = STATE_READY;
                lastError = null;
                System.out.println("[SherpaTts] ready in " + (System.currentTimeMillis() - t0) + "ms, sampleRate=" + engine.sampleRate());
            } catch (Throwable t) {
                state = STATE_ERROR;
                lastError = t.getClass().getSimpleName() + ": " + t.getMessage();
                System.out.println("[SherpaTts] init failed: " + lastError);
            }
        }).start();
        call.resolve(stateObject());
    }

    /**
     * 合成一段文本为 WAV。
     * 参数: { text: string, speed?: number (1.0=原速, 越大越快) }
     * 返回: { path, bytes, durationMs, cached }
     */
    @PluginMethod
    public void speak(PluginCall call) {
        ensureDirs();
        final String text = call.getString("text", "");
        Double speedOpt = call.getDouble("speed", 1.0);
        final double speed = speedOpt == null ? 1.0 : speedOpt;
        if (text == null || text.trim().isEmpty()) {
            call.reject("empty_text");
            return;
        }
        if (tts == null) {
            call.reject("engine_not_ready:" + state + (lastError != null ? ":" + lastError : ""));
            return;
        }
        new Thread(() -> {
            try {
                File wav = new File(wavDir, sha1(text + "|" + speed) + ".wav");
                boolean cached = wav.exists() && wav.length() > 1024;
                long t0 = System.currentTimeMillis();
                if (!cached) {
                    float[] samples;
                    int sampleRate;
                    synchronized (synthLock) {
                        GeneratedAudio audio = tts.generate(text, 0, (float) speed);
                        samples = audio != null ? audio.getSamples() : null;
                        sampleRate = audio != null ? audio.getSampleRate() : 0;
                    }
                    if (samples == null || samples.length == 0) throw new IOException("generate_returned_empty");
                    File tmp = new File(wav.getAbsolutePath() + ".part");
                    writeWav(tmp, samples, sampleRate);
                    if (!tmp.renameTo(wav)) throw new IOException("rename_failed");
                }
                JSObject r = new JSObject();
                r.put("path", wav.getAbsolutePath());
                r.put("bytes", wav.length());
                r.put("durationMs", estimateDurationMs(wav));
                r.put("cached", cached);
                r.put("ms", System.currentTimeMillis() - t0);
                call.resolve(r);
            } catch (Throwable t) {
                call.reject(t.getClass().getSimpleName() + ": " + t.getMessage());
            }
        }).start();
    }

    /** 清空合成缓存（设置页的「清理朗读缓存」用） */
    @PluginMethod
    public void purge(PluginCall call) {
        ensureDirs();
        int n = 0;
        File[] files = wavDir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.delete()) n++;
            }
        }
        JSObject r = new JSObject();
        r.put("removed", n);
        call.resolve(r);
    }

    // ── 内部工具 ──

    /** 递归把 assets 下的音色目录摊到内部存储（已存在且大小一致则跳过） */
    private void copyAssets(String assetPath, File dst) throws IOException {
        AssetManager am = getContext().getAssets();
        String[] children = am.list(assetPath);
        if (children != null && children.length > 0) {
            if (!dst.exists() && !dst.mkdirs()) throw new IOException("mkdir_failed:" + dst);
            for (String child : children) {
                copyAssets(assetPath + "/" + child, new File(dst, child));
            }
            return;
        }
        long assetSize = -1;
        try (InputStream in = am.open(assetPath)) {
            assetSize = in.available();
        } catch (IOException e) {
            return; // 既不是目录也打不开，跳过
        }
        if (dst.exists() && assetSize > 0 && dst.length() == assetSize) return;
        File parent = dst.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("mkdir_failed:" + parent);
        try (InputStream in = am.open(assetPath); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    /** 写成 16-bit PCM 单声道 WAV（自己写，避免依赖库的保存格式细节） */
    private static void writeWav(File out, float[] samples, int sampleRate) throws IOException {
        int n = samples.length;
        ByteBuffer bb = ByteBuffer.allocate(44 + n * 2).order(ByteOrder.LITTLE_ENDIAN);
        bb.put("RIFF".getBytes("US-ASCII"));
        bb.putInt(36 + n * 2);
        bb.put("WAVE".getBytes("US-ASCII"));
        bb.put("fmt ".getBytes("US-ASCII"));
        bb.putInt(16);
        bb.putShort((short) 1);            // PCM
        bb.putShort((short) 1);            // mono
        bb.putInt(sampleRate);
        bb.putInt(sampleRate * 2);         // byte rate
        bb.putShort((short) 2);            // block align
        bb.putShort((short) 16);           // bits
        bb.put("data".getBytes("US-ASCII"));
        bb.putInt(n * 2);
        for (int i = 0; i < n; i++) {
            float s = samples[i];
            if (s > 1f) s = 1f;
            if (s < -1f) s = -1f;
            bb.putShort((short) Math.round(s * 32767f));
        }
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(bb.array());
        }
    }

    /** 由 WAV 头读出采样率与时长（44 字节头 + 单声道 16bit） */
    private static long estimateDurationMs(File wav) {
        try (InputStream in = new java.io.FileInputStream(wav)) {
            byte[] head = new byte[44];
            if (in.read(head) < 44) return 0;
            ByteBuffer bb = ByteBuffer.wrap(head).order(ByteOrder.LITTLE_ENDIAN);
            int sampleRate = bb.getInt(24);
            int dataBytes = bb.getInt(40);
            if (sampleRate <= 0) sampleRate = 22050;
            long total = Math.max(dataBytes, wav.length() - 44);
            return (total / 2) * 1000L / sampleRate;
        } catch (IOException e) {
            return 0;
        }
    }

    private static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 12; i++) sb.append(String.format("%02x", d[i]));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(s.hashCode());
        }
    }
}
