package com.nativethink.app;

import android.content.res.AssetManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsMatchaModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内置离线朗读引擎（sherpa-onnx）。
 *
 * 存在的理由：安卓系统自带的 TTS 引擎在很多机器上「没有安装本地音色」，只能联网合成，
 * 表现为起播慢、随网速波动、偶尔读不出来或只读一半，而且刚读过的句子因为缓存才变快。
 * 本插件把合成完全放在设备内完成（同方案实测 RTF≈0.08，3 秒语音约 250ms 合成完），
 * 与网速彻底无关。
 *
 * 支持多音色：一个 Kokoro 模型内含 103 个音色，由 JS 侧传 speakerId 选择。
 * 音色元数据（名字/口音/speakerId 映射）归前端 src/lib/tts-voice-catalog.ts，
 * 本插件只认 modelId → 配置，不维护音色表。
 *
 * 设计取舍：
 *  - 只负责「合成」，不负责播放。合成结果落成 WAV 文件返回路径，播放仍由 WebView 端的
 *    <audio> 负责 —— 这样播放队列、暂停/续读、语速微调都能复用现有逻辑。
 *  - 结果按 (模型+音色+文本+语速) 哈希缓存到 cacheDir，重复朗读与预取都直接命中文件。
 *    缓存 key 必须含音色，否则换音色会播出上一个音色的音频。
 *  - 模型放在 assets，首次使用时摊到 filesDir：sherpa-onnx 走真实文件路径最稳，
 *    避免各家 ROM 对 asset 路径处理不一致。
 *  - 引擎按需加载（Kokoro 109MB，开机即载会拖慢冷启动），已加载的常驻不释放。
 */
@CapacitorPlugin(name = "SherpaTts")
public class SherpaTtsPlugin extends Plugin {

    // ── 模型注册表 ──
    // 新增模型时同步更新 scripts/check-tts-voices.cjs 的 MODELS 表，二者必须一致。
    private static final String MODEL_KOKORO = "kokoro-v1_1";
    private static final String MODEL_LESSAC = "piper-lessac";

    /** Kokoro：assets/tts/ 下的多音色模型（int8 量化，103 个音色，24000Hz） */
    private static final String KOKORO_ASSET_DIR = "tts/kokoro-int8-multi-lang-v1_1";
    /** Piper 兜底音色：assets/piper/ 下（22050Hz，单音色，真机已验证可跑） */
    private static final String LESSAC_ASSET_DIR = "piper/vits-piper-en_US-lessac-medium";

    /** espeak-ng-data 的父目录 —— Kokoro 复用 Piper 这份数据（实测 355 个文件完全一致），不重复打包 */
    private static final String SHARED_ESPEAK_PARENT = LESSAC_ASSET_DIR;

    private static final String STATE_IDLE = "idle";
    private static final String STATE_LOADING = "loading";
    private static final String STATE_READY = "ready";
    private static final String STATE_ERROR = "error";

    private volatile String state = STATE_IDLE;
    private volatile String lastError = null;
    /** 初始化实际走通的路线（始终为 files：assets 直读曾导致原生层崩溃） */
    private volatile String route = null;

    /** 已加载的引擎，按 modelId 索引 */
    private final Map<String, OfflineTts> engines = new ConcurrentHashMap<>();
    /** 各模型加载失败原因 —— Kokoro 失败不应掩盖 lessac 的可用性 */
    private final Map<String, String> modelErrors = new ConcurrentHashMap<>();
    /** 各模型摊包后的目录（诊断用） */
    private final Map<String, File> modelDirs = new ConcurrentHashMap<>();

    private File wavDir;
    /** 初始化进度日志 —— 原生崩溃接不住，只能靠它定位崩在哪一步 */
    private File progressLog;
    /** sherpa-onnx 的 generate 不是线程安全的，串行化 */
    private final Object synthLock = new Object();

    private void ensureDirs() {
        if (wavDir == null) {
            wavDir = new File(getContext().getCacheDir(), "sherpa-tts");
            if (!wavDir.exists()) wavDir.mkdirs();
        }
        if (progressLog == null) {
            progressLog = new File(getContext().getFilesDir(), "sherpa-init.log");
        }
    }

    /** 追加一行进度（崩溃后靠它定位卡在哪一步） */
    private void step(String msg) {
        try {
            String line = System.currentTimeMillis() + "  " + msg + System.lineSeparator();
            try (FileOutputStream fos = new FileOutputStream(progressLog, true)) {
                fos.write(line.getBytes("UTF-8"));
            }
            System.out.println("[SherpaTts] " + msg);
        } catch (Throwable ignored) { /* 日志失败不影响主流程 */ }
    }

    /** 读取初始化日志（诊断用） */
    @PluginMethod
    public void readLog(PluginCall call) {
        ensureDirs();
        JSObject r = new JSObject();
        try {
            if (progressLog.exists() && progressLog.length() < 64 * 1024) {
                byte[] buf = new byte[(int) progressLog.length()];
                try (InputStream in = new java.io.FileInputStream(progressLog)) {
                    int n = in.read(buf);
                    r.put("log", new String(buf, 0, Math.max(0, n), "UTF-8"));
                }
            } else {
                r.put("log", "");
            }
        } catch (Throwable t) {
            r.put("log", "read_failed: " + t.getMessage());
        }
        call.resolve(r);
    }

    private JSObject stateObject() {
        JSObject o = new JSObject();
        OfflineTts main = engines.get(MODEL_KOKORO);
        o.put("status", state);
        o.put("error", lastError);
        o.put("sampleRate", main != null ? main.sampleRate() : 0);
        o.put("cached", wavDir != null && wavDir.exists() ? wavDir.list().length : 0);
        o.put("route", route);

        // 已加载的模型与各自能力 —— 设置页据此显示「已载 N 个音色 / 采样率」
        JSArray loaded = new JSArray();
        for (Map.Entry<String, OfflineTts> e : engines.entrySet()) {
            JSObject m = new JSObject();
            m.put("modelId", e.getKey());
            m.put("sampleRate", e.getValue().sampleRate());
            m.put("numSpeakers", e.getValue().numSpeakers());
            loaded.put(m);
        }
        o.put("loadedModels", loaded);

        JSObject errs = new JSObject();
        for (Map.Entry<String, String> e : modelErrors.entrySet()) {
            errs.put(e.getKey(), e.getValue());
        }
        o.put("errorByModel", errs);

        try {
            File dir = modelDirs.get(MODEL_KOKORO);
            if (dir != null) {
                File model = new File(dir, "model.int8.onnx");
                o.put("modelBytes", model.exists() ? model.length() : 0);
            }
            File espeak = new File(new File(getContext().getFilesDir(), SHARED_ESPEAK_PARENT), "espeak-ng-data");
            o.put("espeakFiles", espeak.isDirectory() && espeak.list() != null ? espeak.list().length : 0);
        } catch (Throwable ignored) { /* 仅诊断用 */ }
        return o;
    }

    /** 查询引擎状态（不触发加载） */
    @PluginMethod
    public void status(PluginCall call) {
        ensureDirs();
        call.resolve(stateObject());
    }

    /**
     * 预热默认模型（Kokoro）。前端进入阅读/学习页时提前调用。
     *
     * 只能走「摊到内部存储 + 真实文件路径」，原因两条：
     *  1) espeak-ng 用 fopen 读音素数据，assets 里的它读不到 —— 之前试过 assets 直读，
     *     真机实测直接闪退；
     *  2) dataDir 的约定是 espeak-ng-data 的**父目录**：原生库里有 %s/espeak-ng-data
     *     这个格式串，说明它内部还会再拼一层。
     * 另外把 ESPEAK_DATA_PATH 也设上，兜住不同构建的路径约定差异。
     */
    @PluginMethod
    public void init(PluginCall call) {
        ensureDirs();
        if (STATE_READY.equals(state) || STATE_LOADING.equals(state)) {
            call.resolve(stateObject());
            return;
        }
        state = STATE_LOADING;
        lastError = null;
        try { if (progressLog != null && progressLog.exists()) progressLog.delete(); } catch (Throwable ignored) { /* ignore */ }
        new Thread(() -> {
            try {
                ensureModel(MODEL_KOKORO);
                route = "files";
                state = STATE_READY;
                lastError = null;
            } catch (Throwable t) {
                // Kokoro 不可用不是致命的 —— lessac 兜底仍能朗读，故不置全局 error 让前端放弃
                state = STATE_ERROR;
                lastError = describe(t);
            }
            call.resolve(stateObject());
        }).start();
    }

    /** 一个模型的全部配置 */
    private static final class ModelDef {
        final String assetDir;      // assets 下的源目录
        final String kind;          // "kokoro" | "vits"
        final String modelFile;
        final String tokensFile;
        final String voicesFile;    // kokoro 专用
        final String lexiconFile;   // kokoro 专用，无则 null
        final String lang;          // kokoro 专用，无则 null
        final boolean sharedEspeak; // espeak 数据是否指向共享的 Piper 目录

        ModelDef(String assetDir, String kind, String modelFile, String tokensFile,
                 String voicesFile, String lexiconFile, String lang, boolean sharedEspeak) {
            this.assetDir = assetDir;
            this.kind = kind;
            this.modelFile = modelFile;
            this.tokensFile = tokensFile;
            this.voicesFile = voicesFile;
            this.lexiconFile = lexiconFile;
            this.lang = lang;
            this.sharedEspeak = sharedEspeak;
        }
    }

    private static final Map<String, ModelDef> REGISTRY = new HashMap<>();
    static {
        REGISTRY.put(MODEL_KOKORO, new ModelDef(
                KOKORO_ASSET_DIR, "kokoro", "model.int8.onnx", "tokens.txt",
                "voices.bin", "lexicon-us-en.txt", "en-us", true));
        REGISTRY.put(MODEL_LESSAC, new ModelDef(
                LESSAC_ASSET_DIR, "vits", "en_US-lessac-medium.onnx", "tokens.txt",
                null, null, null, false));
    }

    /**
     * 按需加载模型（幂等）。Kokoro 109MB，首次摊包+建引擎需数秒，故调用方一般在后台线程里调。
     * 已加载的常驻不释放 —— 反复换音色不该反复付加载代价。
     */
    private OfflineTts ensureModel(String modelId) throws Exception {
        ModelDef def = REGISTRY.get(modelId);
        if (def == null) throw new IllegalArgumentException("unknown_model:" + modelId);

        OfflineTts cached = engines.get(modelId);
        if (cached != null) return cached;

        // 已经失败过的不再重试（避免每次朗读都白等一次加载超时）
        String prevErr = modelErrors.get(modelId);
        if (prevErr != null) throw new IllegalStateException("model_load_failed:" + modelId + ":" + prevErr);

        synchronized (synthLock) {
            cached = engines.get(modelId);
            if (cached != null) return cached;
            try {
                File dir = new File(getContext().getFilesDir(), def.assetDir);
                modelDirs.put(modelId, dir);
                step("ensureModel " + modelId + ": copying assets → " + dir);
                copyAssets(def.assetDir, dir);

                // 共享 espeak：Kokoro 不打包 espeak-ng-data，靠 Piper 这份数据工作。
                // 正常流程里 Piper 资产已由 fetch-android-tts.cjs 就位，这里兜住异常情况。
                File espeakParent;
                if (def.sharedEspeak) {
                    File shared = new File(getContext().getFilesDir(), SHARED_ESPEAK_PARENT);
                    if (!new File(shared, "espeak-ng-data").isDirectory()) {
                        step("shared espeak missing; copying " + SHARED_ESPEAK_PARENT);
                        copyAssets(SHARED_ESPEAK_PARENT, shared);
                    }
                    espeakParent = shared;
                } else {
                    espeakParent = dir;
                }
                try {
                    android.system.Os.setenv("ESPEAK_DATA_PATH", espeakParent.getAbsolutePath(), true);
                } catch (Throwable ignored) { /* 不是所有 ROM 都允许设置，失败不影响主路径 */ }

                long t0 = System.currentTimeMillis();
                step("creating engine " + modelId + " kind=" + def.kind);
                // assetManager 必须传 null！OfflineTts 的构造函数有这个分支：
                //   assetManager == null → newFromFile（按真实文件系统路径）
                //   assetManager != null → newFromAsset（把路径当 assets 里的名字解析）
                // 前面几版一直传 getAssets()，于是 filesDir 的绝对路径被当成 assets 名
                // 去查 → 找不到 → 原生层直接崩。这就是「内置引擎崩溃」的真凶。
                OfflineTts engine = new OfflineTts(
                        (AssetManager) null, buildConfig(getContext(), def, espeakParent));
                engines.put(modelId, engine);
                modelErrors.remove(modelId);
                step("ready " + modelId + " in " + (System.currentTimeMillis() - t0)
                        + "ms, sampleRate=" + engine.sampleRate()
                        + " numSpeakers=" + engine.numSpeakers());
                return engine;
            } catch (Throwable t) {
                String msg = describe(t);
                modelErrors.put(modelId, msg);
                step("failed " + modelId + ": " + msg);
                throw new Exception(msg, t);
            }
        }
    }

    /**
     * 组装 sherpa-onnx 配置。
     *
     * 注意：这些配置类由 Kotlin 生成，字符串参数全是**非空类型**，
     * 构造函数里有 Intrinsics.checkNotNullParameter —— 传 null 会立刻抛
     * NullPointerException（前几版「内置引擎加载失败」就是踩了这个：
     * lexicon/dictDir/matcha/kokoro/kitten/ruleFsts/ruleFars 一律要传空值或空实例）。
     *
     * Kokoro 的参数顺序不可错位：lang 在 lexicon 之后、dictDir 之前。位置传错会把
     * 语言当词典路径，加载直接失败。
     *
     * @param ctx 用于推导模型自身目录（模型文件都在那里）
     * @param espeakParent espeak-ng-data 的父目录。共享时为 Piper 音色目录，否则为模型自身目录。
     */
    private static OfflineTtsConfig buildConfig(android.content.Context ctx, ModelDef def, File espeakParent) {
        File dir = new File(ctx.getFilesDir(), def.assetDir);
        String dataDirPath = espeakParent.getAbsolutePath();

        OfflineTtsVitsModelConfig vits;
        OfflineTtsKokoroModelConfig kokoro;
        if ("kokoro".equals(def.kind)) {
            vits = new OfflineTtsVitsModelConfig("", "", "", "", "", 0.667f, 0.8f, 1.0f);
            kokoro = new OfflineTtsKokoroModelConfig(
                    new File(dir, def.modelFile).getAbsolutePath(),     // model
                    new File(dir, def.voicesFile).getAbsolutePath(),    // voices
                    new File(dir, def.tokensFile).getAbsolutePath(),    // tokens
                    dataDirPath,                                        // dataDir（espeak 父目录）
                    def.lexiconFile == null ? "" : new File(dir, def.lexiconFile).getAbsolutePath(),
                    def.lang == null ? "" : def.lang,
                    "",                                                 // dictDir：中文分词用，英文传空
                    1.0f);                                              // lengthScale：语速走 generate 的 speed
        } else {
            vits = new OfflineTtsVitsModelConfig(
                    new File(dir, def.modelFile).getAbsolutePath(),
                    "",
                    new File(dir, def.tokensFile).getAbsolutePath(),
                    dataDirPath,
                    "",
                    0.667f, 0.8f, 1.0f);
            kokoro = new OfflineTtsKokoroModelConfig("", "", "", "", "", "", "", 1.0f);
        }

        OfflineTtsModelConfig model = new OfflineTtsModelConfig(
                vits,
                new OfflineTtsMatchaModelConfig(),   // 未使用，但必须给空实例
                kokoro,
                new OfflineTtsKittenModelConfig(),   // 同上
                Math.max(2, Runtime.getRuntime().availableProcessors() / 2), // numThreads
                false,      // debug
                "cpu");     // provider
        return new OfflineTtsConfig(model, "", "", 1, 0.2f);
    }

    /** 异常 → 可读文本（带首个栈帧，便于定位原生还是资源问题） */
    private static String describe(Throwable t) {
        StringBuilder sb = new StringBuilder();
        sb.append(t.getClass().getSimpleName());
        if (t.getMessage() != null) sb.append(": ").append(t.getMessage());
        StackTraceElement[] st = t.getStackTrace();
        if (st != null && st.length > 0) sb.append(" @").append(st[0].toString());
        String s = sb.toString();
        return s.length() > 300 ? s.substring(0, 300) : s;
    }

    /**
     * 合成一段文本为 WAV。
     * 参数: { text: string, modelId?: string, speakerId?: number, speed?: number (1.0=原速) }
     * 返回: { path, bytes, durationMs, cached, ms }
     */
    @PluginMethod
    public void speak(PluginCall call) {
        ensureDirs();
        final String text = call.getString("text", "");
        final String modelId = call.getString("modelId", MODEL_LESSAC);
        final Integer speakerIdOpt = call.getInt("speakerId", 0);
        Double speedOpt = call.getDouble("speed", 1.0);
        final double speed = speedOpt == null ? 1.0 : speedOpt;

        if (text == null || text.trim().isEmpty()) {
            call.reject("empty_text");
            return;
        }
        if (modelId == null || !REGISTRY.containsKey(modelId)) {
            // 未知模型直接拒绝，不静默换别的模型 —— 否则会读出错误音色且难以察觉
            call.reject("unknown_model:" + modelId);
            return;
        }

        new Thread(() -> {
            try {
                OfflineTts engine = ensureModel(modelId);

                final int sid = speakerIdOpt == null ? 0 : speakerIdOpt;
                int nsp = engine.numSpeakers();
                if (sid < 0 || sid >= nsp) {
                    // 越界必须在这里挡住：原生层拿它当数组下标，传下去会直接崩
                    call.reject("speaker_out_of_range:" + sid + "/" + nsp);
                    return;
                }

                // 缓存 key 必须含 modelId 与 speakerId：只按文本+语速缓存会让换音色播出上一个音色
                File wav = new File(wavDir, sha1(modelId + "|" + sid + "|" + speed + "|" + text) + ".wav");
                boolean cached = wav.exists() && wav.length() > 1024;
                long t0 = System.currentTimeMillis();
                if (!cached) {
                    float[] samples;
                    int sampleRate;
                    synchronized (synthLock) {
                        GeneratedAudio audio = engine.generate(text, sid, (float) speed);
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
