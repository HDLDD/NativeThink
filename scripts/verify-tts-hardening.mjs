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
    // globalThis.__ttsTail 打开时模拟原生 synthLock：**在任何一个 await 之前**取走队尾并接上自己，
    // 所以"谁先调用"就是"谁先合成"。（写成 await 之后再赋值的话，两个调用会读到同一个旧队尾 →
    // 替身其实是在并行跑，那条"首包等两次合成"的断言就成了假绿。）
    const one = () => {
      globalThis.__ttsTestSpeakCalls++;
      globalThis.__ttsLog = globalThis.__ttsLog || [];
      globalThis.__ttsActive = (globalThis.__ttsActive || 0) + 1;
      if (globalThis.__ttsActive > 1) globalThis.__ttsOverlapped = true;   // 串行替身绝不该重入
      globalThis.__ttsLog.push(['start', o.text]);
      return new Promise((r) => setTimeout(r, 15)).then(() => {
        globalThis.__ttsLog.push(['end', o.text]);
        globalThis.__ttsActive--;
        return { path: '/fake/' + globalThis.__ttsTestSpeakCalls + '.wav', bytes: 100, durationMs: 900, cached: false, ms: 12 };
      });
    };
    if (!globalThis.__ttsTail) return one();
    const job = globalThis.__ttsTail.then(one);
    globalThis.__ttsTail = job.catch(() => {});   // 前一件失败不许把后面的全带倒
    return job;
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

/* ───────────────────────── C. 朗读设置面板的网络卫生 ───────────────────────── */
const ttsUi = fs.readFileSync(path.join(ROOT, 'src/components/TTSSettings.tsx'), 'utf8');
const voicesFetch = ttsUi.match(/.{0,260}fetch\('\/api\/tts-voices'\)/s)?.[0] ?? '';
ok(voicesFetch.length > 0, '脚手架自检：抓到 /api/tts-voices 调用点附近的上下文');
ok(/platformTag\(\) === 'desktop'/.test(voicesFetch),
  'C1 /api/tts-voices 只在桌面版调用（web 每路由一次 404、APK 还多一次真实往返）');
ok(/import \{[^}]*platformTag[^}]*\} from '@\/lib\/app-env'/.test(ttsUi),
  'C2 平台判定复用 app-env 的 platformTag（不在组件里另写 UA 嗅探）');
// 正对照：桌面本地服务确实实现了这个路由，不是"为了过断言而留着死代码"
const localServer = fs.readFileSync(path.join(ROOT, 'server/local-server.mjs'), 'utf8');
ok(/pathname === '\/api\/tts-voices'/.test(localServer),
  'C3 正对照：server/local-server.mjs 确实实现了该路由（桌面这条路径是活的）');
ok(/startServer/.test(fs.readFileSync(path.join(ROOT, 'electron/main.mjs'), 'utf8')),
  'C4 正对照：Electron 主进程会起这个本地服务（所以只有桌面版值得请求）');

/* ───────── D. 内置离线引擎的入队顺序（首包不该等两次合成） ───────── */
/**
 * 原生侧 synthLock 把合成串行化，所以"谁先入队"直接决定首包：
 * 旧写法在 speak(本片) 之前先 sherpaPrewarm(下一片) → 本片排在第二个 → 首包 = 2×单片合成。
 * 下面先用**串行替身真跑**证明这个差别是真的（比的是"本片排在队列第几件"这种确定性证据，不是毫秒数 ——
 * 计时断言在本机抖过一次：43/16 与 43/31 两种读数都能出现），再从源码钉住 shipped 的写法确实是"本片先入队"。
 */
{
  // 两轮各用一对**不同**文本：sherpaSpeak 那层有 urlCache，同一句第二次直接命中缓存、根本不下到替身
  const headIdx = (log) => log.filter((e) => e[0] === 'start').findIndex((e) => /HEAD/.test(e[1]));
  // 旧写法：预取先入队，本片排在它后面 → 首包要等两次合成
  globalThis.__ttsTail = Promise.resolve(); globalThis.__ttsLog = []; globalThis.__ttsOverlapped = false;
  await Promise.all([mod.sherpaSpeak('TAIL one.'), mod.sherpaSpeak('HEAD one.')]);
  const oldLog = globalThis.__ttsLog.slice();
  // 新写法：本片先入队，预取排在后面
  globalThis.__ttsTail = Promise.resolve(); globalThis.__ttsLog = []; globalThis.__ttsOverlapped = false;
  await Promise.all([mod.sherpaSpeak('HEAD two.'), mod.sherpaSpeak('TAIL two.')]);
  const newLog = globalThis.__ttsLog.slice();

  ok(headIdx(oldLog) === 1 && headIdx(newLog) === 0,
    'D1 替身真跑：预取排前面时本片是队列里的第二件（首包等两次合成）；改成本片先入队后它是第一件',
    `旧序 start ${oldLog.filter((e) => e[0] === 'start').map((e) => e[1].split(' ')[0])} · 新序 ${newLog.filter((e) => e[0] === 'start').map((e) => e[1].split(' ')[0])}`);
  ok(!globalThis.__ttsOverlapped
    && oldLog.slice(0, 2).map((e) => e[0]).join() === 'start,end' && newLog.slice(0, 2).map((e) => e[0]).join() === 'start,end',
    'D2 正对照：替身真的串行（两次合成从不重叠，start/end 严格交替）—— 否则 D1 只是在比噪声',
    `重叠=${String(globalThis.__ttsOverlapped)} · 旧 ${oldLog.map((e) => e[0]).join(',')} · 新 ${newLog.map((e) => e[0]).join(',')}`);

  const useTts = fs.readFileSync(path.join(ROOT, 'src/lib/use-tts.ts'), 'utf8');
  const piperBranch = useTts.match(/if \(engine === 'piper'\)[\s\S]{0,1200}?\n      \}/)?.[0] ?? '';
  ok(piperBranch.length > 0, 'D3 脚手架自检：抓到 use-tts 的 piper 分支本体');
  const iSpeak = piperBranch.indexOf('sherpaSpeak(chunks[idx]');
  const iPre = piperBranch.indexOf('sherpaPrewarm(next');
  ok(iSpeak >= 0 && iPre >= 0 && iSpeak < iPre,
    'D4 shipped 写法确实是"本片先入队、预取排在后面"', `speak@${iSpeak} prewarm@${iPre}`);
  ok(/sherpaInFlightCount\(\) <= 1/.test(piperBranch),
    'D5 背压门槛用「≤1」：本片自己刚入队就算 1，写「===0」等于预取永不触发（每个切片边界都要现合成）');
  // 选了就要说清代价（用户反复报过"参数写成装饰"）：Kokoro 的长文断续必须写在选它的那个面板上
  ok(/selectedLocalVoice\?\.modelId === 'kokoro'/.test(ttsUi) && /RTF≈1\.2~1\.7/.test(ttsUi),
    'D6 选中 Kokoro 时，设置页就地写明"合成慢于播放 → 长文每句之间会有停顿"（不许只在文档里说）');
}

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
