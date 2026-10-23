#!/usr/bin/env node
/**
 * verify-shadowing-asr.mjs — 路线 2（录音 → 转写 → 词级评分）契约守卫。
 *
 * 起因：影子跟读原先只把 Web Speech 的文本交给 AI，录音 Blob 既不上传也不参与评分；
 * APK WebView 的识别通道又不可靠。路线 2 改成：
 *   MediaRecorder → 16k mono WAV → /api/ai/transcribe（multipart）→ scoreSpeech。
 *
 * 本脚本守四层：
 *   A. 纯函数真跑：provider 选择、响应归一（GLM 只回 text）、语速、WAV 编码。
 *   B. 服务端真跑 normalizeTranscript：GLM 的 {text} 不能因为只读 segments 被丢掉。
 *   C. 页面接线：MediaRecorder / WAV 转换 / 转写调用 / 词级评分 / 清理 / 隐私边界。
 *   D. 反向断言：旧 Web Speech 路径必须已从影子跟读移除。
 *
 * 用法：node scripts/verify-shadowing-asr.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const strip = (s) => ts.transpileModule(s, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.Preserve,
    removeComments: true,
  },
}).outputText;

/* ───────── A. ASR 纯函数与 WAV 编码真跑 ───────── */
const asrSrc = strip(read('src/lib/asr.ts'))
  .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/speech-score['"];?/g, '');
const speechSrc = strip(read('src/lib/speech-score.ts'));
const asrJs = ts.transpileModule(
  asrSrc + '\n' + speechSrc +
  '\nmodule.exports={pickAsrCandidates,filenameForAudio,normalizeAsrResponse,speechPace,tokenizeSpeech};',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const asrMod = { exports: {} };
new Function('module', 'exports', asrJs)(asrMod, asrMod.exports);
const A = asrMod.exports;

ok(typeof A.pickAsrCandidates === 'function' && typeof A.speechPace === 'function',
  '真跑脚手架：ASR 纯函数已加载');
{
  const cands = A.pickAsrCandidates({ glm: 'g', groq: 'r', siliconflow: 's' });
  ok(cands.map((c) => c.provider).join(',') === 'glm,groq,siliconflow',
    'provider 优先级：出厂 GLM → Groq → 硅基流动', cands.map((c) => c.provider).join(','));
  ok(cands.every((c) => c.model), '每个候选都带模型名');
  ok(A.pickAsrCandidates({ glm: '  ', groq: null }).length === 0,
    '空白 / null Key 不入选（不会拿空 Key 去请求）');
  ok(A.filenameForAudio('audio/webm;codecs=opus') === 'take.webm', 'WebM 录音文件名');
  ok(A.filenameForAudio('audio/wav') === 'take.wav', 'WAV 录音文件名');
  ok(A.filenameForAudio('audio/mp4') === 'take.m4a', 'Safari MP4 录音文件名');
}

{
  const n1 = A.normalizeAsrResponse({ text: ' hello ', segments: [] });
  ok(n1.text === 'hello' && n1.segments.length === 0,
    'GLM 只回 text：客户端不能因为 segments 为空就丢掉转写');
  const n2 = A.normalizeAsrResponse({ segments: [{ start: 0.2, end: 1.1, en: 'hello world' }] });
  ok(n2.text === 'hello world' && n2.segments[0].start === 0.2,
    'segments 存在时也能兜底出 text（Groq/SiliconFlow）');
  const n3 = A.normalizeAsrResponse({ results: [{ text: 'a' }, { text: 'b' }] });
  ok(n3.text === 'a b', 'results 形状也能归一');
  ok(A.normalizeAsrResponse(null).text === '', '空响应不抛错，返回空文本');
}

{
  const p1 = A.speechPace('one two three four', 1040);
  ok(p1.wordCount === 4 && p1.expectedMs === 1040 && p1.label === 'ok',
    '语速：4 词 × 260ms 正好贴合', JSON.stringify(p1));
  ok(A.speechPace('one two', 1000).label === 'slow', '语速偏慢 >20% 判 slow');
  ok(A.speechPace('one two', 500).label === 'fast', '语速偏快 >20% 判 fast');
  ok(A.speechPace('', 1000).expectedMs === 800,
    '空目标句仍有 800ms 下限，不出现 0 参考时长');
}

const wavJs = ts.transpileModule(
  strip(read('src/lib/wav.ts')) + '\nmodule.exports={encodeWavMono16k};',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const wavMod = { exports: {} };
new Function('module', 'exports', wavJs)(wavMod, wavMod.exports);
const W = wavMod.exports;
{
  const asText = (view, offset, len) =>
    Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
  const buf = W.encodeWavMono16k([new Float32Array(16000)], 16000);
  ok(buf instanceof ArrayBuffer, 'WAV 编码返回 ArrayBuffer');
  const v = new DataView(buf);
  ok(asText(v, 0, 4) === 'RIFF' && asText(v, 8, 4) === 'WAVE' && asText(v, 12, 4) === 'fmt ',
    'WAV 头是 RIFF/WAVE/fmt');
  ok(v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1
    && v.getUint32(24, true) === 16000 && v.getUint16(34, true) === 16,
    'PCM / mono / 16kHz / 16-bit（GLM 能吃的形状）');
  ok(v.getUint32(40, true) === 32000, '1 秒 16kHz 单声道 = 32000 字节');
  const buf48 = W.encodeWavMono16k([new Float32Array(48000)], 48000);
  ok(new DataView(buf48).getUint32(40, true) === 32000, '48kHz 录音重采样到 16kHz');
  const stereo = W.encodeWavMono16k(
    [new Float32Array([1, 1]), new Float32Array([-1, -1])], 16000,
  );
  ok(new DataView(stereo).getInt16(44, true) === 0, '立体声混合成单声道');
  const clip = W.encodeWavMono16k([new Float32Array([2, -2])], 16000);
  const cv = new DataView(clip);
  ok(cv.getInt16(44, true) === 32767 && cv.getInt16(46, true) === -32768,
    '削波到 ±1（不把溢出样本回绕成噪声）');
  ok(W.encodeWavMono16k([], 16000) === null
    && W.encodeWavMono16k([new Float32Array(0)], 16000) === null,
    '空输入返回 null（调用方退回原 Blob，不传半截文件）');
}

/* ───────── B. 服务端 normalizeTranscript 真跑 ───────── */
const serverMod = await import(pathToFileURL(path.join(ROOT, 'functions/api/ai/transcribe.js')).href);
{
  const N = serverMod.normalizeTranscript;
  ok(typeof N === 'function', '真跑脚手架：服务端 normalizeTranscript 已导出');
  const s1 = N({ text: ' hello ' });
  ok(s1.text === 'hello' && s1.segments.length === 0,
    '服务端 text 兜底：GLM 的 {text} 不再被 segments-only 解析丢掉');
  const s2 = N({ segments: [{ start: 1, end: 2, text: 'hello there' }] });
  ok(s2.text === 'hello there' && s2.segments[0].en === 'hello there' && s2.segments[0].start === 1,
    '服务端 segments 归一（仍保持视频精听要的 en/start/end）');
  const s3 = N({ results: [{ text: 'a' }, { text: 'b' }] });
  ok(s3.text === 'a b', '服务端 results 兜底');
}

/* ───────── C/D. 接线与反向断言（剥注释后扫） ───────── */
const page = strip(read('src/pages/ShadowingPage/ShadowingPage.tsx'));
const service = strip(read('src/services/asr-service.ts'));
const server = strip(read('functions/api/ai/transcribe.js'));
const probe = strip(read('scripts/probe-shadowing-asr.mjs'));

{
  ok(/new MediaRecorder\(/.test(page), '页面用 MediaRecorder 录音');
  ok(/getUserMedia\(\{\s*audio:\s*true\s*\}\)/.test(page), '页面请求麦克风');
  ok(/blobToWav16k\(/.test(page), '录音先转 16k mono WAV 再上传');
  ok(/transcribeRecording\(/.test(page), '页面接上转写服务');
  ok(/scoreSpeech\(currentSentence\?\.text \|\| ''/.test(page),
    '用目标句与转写文本做词级评分（同一 scoreSpeech 口径）');
  ok(/speechPace\(currentSentence\.text, recordingMs\)/.test(page),
    '语速用录音总时长（GLM 没有逐词时间戳也能给）');
  ok(!/webkitSpeechRecognition|SpeechRecognition/.test(page),
    '反向：旧 Web Speech 路径已从影子跟读移除');
  ok(/cancelRecording\(\);[\s\S]{0,250}clearRecordedAudio\(\);[\s\S]{0,250}cancelPendingAdvance\(\);/.test(page),
    '卸载时停录音、释放 Blob URL、撤自动前进定时器');
  ok(/currentSentenceIdx, cancelRecording, clearRecordedAudio/.test(page),
    '换句/换语料会清录音与评分，旧结果不跟到下一句');
  ok(/不保存音频/.test(page) && /不评音素发音/.test(page),
    '隐私与能力边界写在录音按钮旁');
  ok(/基于转写文本/.test(page), 'AI 反馈标明基于转写文本');
  ok(/ASR_NOT_CONFIGURED/.test(page), '无 ASR Key 有明确失败退路');
}

{
  ok(/fetch\('\/api\/ai\/transcribe'/.test(service), 'service 调用 /api/ai/transcribe');
  ok(/form\.append\('audio'/.test(service) && /filenameForAudio\(blob\.type\)/.test(service),
    'service 用 multipart 上传音频并给正确文件名');
  ok(/for \(const candidate of candidates\)/.test(service),
    '一个 provider 失败后依次尝试下一个已配置 Key');
  ok(/ASR_NOT_CONFIGURED/.test(service) && /AbortController/.test(service)
    && /opts\.signal\?\.addEventListener/.test(service),
    '无 Key 明确报错，且转写可取消');
}

{
  ok(/request\.formData\(\)/.test(server), '服务端接收 multipart 录音');
  ok(/normalizeTranscript/.test(server) && /data\?\.text/.test(server),
    '服务端补了 text 兜底（否则 GLM 的转写会被丢成空 segments）');
  ok(/checkOrigin\(request\)/.test(server) && /checkRate\(ip\)/.test(server),
    'Origin 白名单 + IP 限流守卫');
  ok(/MAX_UPLOAD_BYTES/.test(server) && /audio\.size > MAX_UPLOAD_BYTES/.test(server),
    '上传音频有 8MB 上限');
  ok(/trackFactoryUsage/.test(server), '服务端出厂 Key 用量记账');
  ok(/multipart\/form-data/.test(server), '服务端有 multipart 分支');
}

{
  ok(/src\/lib\/speech-score\.ts/.test(probe), '探针用真实 speech-score.ts 打分');
  ok(/multipart/.test(probe) && /--via-function/.test(probe), '探针覆盖 multipart 与现有端点');
}

/* ───────── 汇总 ───────── */
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  if (!r.pass) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
}
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 影子跟读路线 2（录音 → 转写 → 词级评分）契约成立');
