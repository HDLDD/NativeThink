#!/usr/bin/env node
/**
 * TTS 加固的回归验证。
 *
 * 背景（真机崩溃栈确证）：
 *   java.lang.OutOfMemoryError: pthread_create (1040KB stack) failed: Try again
 *     at com.nativethink.app.SherpaTtsPlugin.speak(SherpaTtsPlugin.java:440)   ← new Thread().start()
 *   speak() 每次调用新建一条 OS 线程，而 generate() 被 synthLock 串行化 →
 *   并发请求各自占一条线程（1MB 栈）阻塞在锁上 → 线程数耗尽 → 整个 App 闪退。
 *
 * 本脚本验证修复后的两条不变量：
 *   A. 原生侧：不再存在「每次调用 new Thread(...).start()」的写法，且走有界线程池 + 队列上限
 *   B. JS 侧：相同 (音色,文本,语速) 的并发合成只提交给原生一次（在途去重）
 *
 * 用法: node scripts/verify-tts-hardening.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'tts-hardening-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

/* ───────────────────────── A. 原生侧静态守卫 ───────────────────────── */
const JAVA = path.join(ROOT, 'android/app/src/main/java/com/nativethink/app/SherpaTtsPlugin.java');
const java = fs.readFileSync(JAVA, 'utf8');

ok(!/new Thread\(\(\)\s*->/.test(java),
  '原生 speak/init 不再「每次调用 new Thread(...).start()」（崩溃根因）');

ok(/newSingleThreadExecutor/.test(java) && /ExecutorService/.test(java),
  '原生改用有界线程池（newSingleThreadExecutor）');

ok(/submitTts\(/.test(java) && /MAX_PENDING_TTS/.test(java),
  '原生有队列上限（MAX_PENDING_TTS）与拒绝路径');

ok(/loadWorker\.execute/.test(java),
  '模型加载走独立的 loadWorker，不再 new Thread');

/* ───────────────────────── B. JS 在途去重（真实模块 + 桩） ───────────────────────── */
let nativeSpeakCalls = 0;
let nativeInitCalls = 0;

const STUBS = `
const nativeSpeakCallsRef = globalThis.__ttsTestSpeakCalls;
const fakePlugin = {
  init: async () => { globalThis.__ttsTestInitCalls++; return { status: 'ready', error: null, sampleRate: 24000, cached: 0, loadedModels: [] }; },
  status: async () => ({ status: 'ready', error: null, sampleRate: 24000, cached: 0 }),
  speak: async (o) => {
    globalThis.__ttsTestSpeakCalls++;
    await new Promise((r) => setTimeout(r, 15));   // 模拟原生合成耗时，让并发真的重叠
    return { path: '/fake/' + globalThis.__ttsTestSpeakCalls + '.wav', bytes: 100, durationMs: 900, cached: false, ms: 12 };
  },
  purge: async () => ({ removed: 0 }),
  readLog: async () => ({ log: '' }),
};
const Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => 'android',
  convertFileSrc: (p) => 'file://' + p,
  registerPlugin: () => fakePlugin,
};
const registerPlugin = () => fakePlugin;
const safeStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const toast = { info: () => {}, error: () => {} };
const DEFAULT_LOCAL_VOICE_ID = 'kokoro:af_sarah';
const FALLBACK_VOICE = { id: 'piper:lessac', name: 'Lessac', gender: 'female', accent: '美音', modelId: 'piper-lessac', speakerId: 0, note: '' };
const KOKORO_VOICES = [];
const listLocalVoices = () => [FALLBACK_VOICE];
function findLocalVoice(id) {
  if (id === FALLBACK_VOICE.id) return FALLBACK_VOICE;
  return { id, name: 'Test', gender: 'female', accent: '美音', modelId: 'kokoro', speakerId: 1, note: '' };
}
`;

let src = fs.readFileSync(path.join(ROOT, 'src/lib/sherpa-tts.ts'), 'utf8');
src = src.replace(/^import .*from '@capacitor\/core';$/m, '');
src = src.replace(/^import .*from '\.\/safe-storage';$/m, '');
src = src.replace(/^import .*from 'sonner';$/m, '');
src = src.replace(/^import .*from '\.\/tts-voice-catalog';$/m, '');
src = src.replace(/^export \{[^}]*\} from '\.\/tts-voice-catalog';$/m, '');
src = src.replace(/^export type \{[^}]*\} from '\.\/tts-voice-catalog';$/m, '');
src += '\nexport { sherpaSpeak, sherpaInFlightCount, sherpaPrewarm };\n';
src = STUBS + src;

// 脚手架自检：若还有未处理的 import，直接报错，避免把脚手架问题误判成产品缺陷
const leftover = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
if (leftover.length) {
  console.error('脚手架错误：仍有未替换的 import ->\n' + leftover.join('\n'));
  process.exit(2);
}

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outFile = path.join(TMP, 'sherpa-tts-under-test.mjs');
fs.writeFileSync(outFile, js);

globalThis.__ttsTestSpeakCalls = 0;
globalThis.__ttsTestInitCalls = 0;

const mod = await import(pathToFileURL(outFile).href);

// B1: 相同文本并发 5 次 → 只应提交原生 1 次
const TEXT = 'Concurrency dedupe probe.';
const rs = await Promise.all(Array.from({ length: 5 }, () => mod.sherpaSpeak(TEXT)));
nativeSpeakCalls = globalThis.__ttsTestSpeakCalls;
ok(nativeSpeakCalls === 1, '同一文本并发 5 次只提交原生 1 次（在途去重）', `nativeSpeak=${nativeSpeakCalls}`);
ok(rs.every((r) => r.url === rs[0].url), '并发调用返回同一个结果 URL', rs[0].url);
ok(mod.sherpaInFlightCount() === 0, '完成后在途计数归零', String(mod.sherpaInFlightCount()));

// B2: 重复调用同一文本 → 命中结果缓存，不再提交原生
await mod.sherpaSpeak(TEXT);
ok(globalThis.__ttsTestSpeakCalls === 1, '重复调用命中缓存，不重复提交原生',
  `nativeSpeak=${globalThis.__ttsTestSpeakCalls}`);

// B3: 不同文本 → 各自提交一次（去重不能吃掉不同请求）
await Promise.all([mod.sherpaSpeak('Alpha probe.'), mod.sherpaSpeak('Beta probe.')]);
ok(globalThis.__ttsTestSpeakCalls === 3, '不同文本各自提交（去重不误伤）',
  `nativeSpeak=${globalThis.__ttsTestSpeakCalls}`);

// B4: 并发上限守卫用的在途计数在空闲时为 0
ok(mod.sherpaInFlightCount() === 0, '空闲时在途计数为 0（预合成守卫依赖它）',
  String(mod.sherpaInFlightCount()));

/* ───────────────────────── 汇总 ───────────────────────── */
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
}
console.log('---');
console.log(failed === 0 ? `全部 ${results.length} 项通过` : `${failed} 项失败`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
