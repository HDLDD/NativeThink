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

/* ───────────── E. 取消的代际令牌（2026-10-20 快速闪卡"部分单词/句子读不出来"的根因） ─────────────
   旧写法靠 abortedRef 这个布尔判取消，但 speak() 是 `abortedRef=true → 取消 → abortedRef=false`
   同步走完的，被掐那条链的 onerror 之后才跑，读到的已经是 false → 旧链继续降级/进下一句，
   第一件事就是 playUrl → stopAudio() → 把刚起播的新朗读掐了。模拟器 APK 受控夹具实测：
   13 张里 caregiver 的自动朗读发了两次 play、两次都 AbortError。 */
{
  const U = fs.readFileSync(path.join(ROOT, 'src/lib/use-tts.ts'), 'utf8');
  const iChain = U.indexOf('const playChunkWithFallback = useCallback');
  const entry = U.slice(iChain, U.indexOf('const playUrl = (', iChain));
  ok(/chainGenRef = useRef\(0\)/.test(U), 'E1 有单调递增的代际令牌（不是靠布尔判取消）');
  const bumps = (U.match(/chainGenRef\.current\+\+/g) || []).length;
  ok(bumps === 2, `E2 speak() 与 cancel() 各开一代（当前 ${bumps} 处，必须恰好 2）`);
  const sp = U.slice(U.indexOf('const speak = useCallback'), U.indexOf('const speak = useCallback') + 900);
  ok(sp.indexOf('chainGenRef.current++') >= 0 && sp.indexOf('chainGenRef.current++') < sp.indexOf('abortedRef.current = true'),
    'E2 顺序钉死：speak() 里先开新一代，再动 abortedRef/取消 —— 反过来的话旧链的回调仍可能赶在新一代之前复活');
  ok(/gen = chainGenRef\.current/.test(U), 'E3 链入口把代际作为形参带下去（递归时必须原样传）');
  const iGuard = entry.indexOf('if (gen !== chainGenRef.current) return;');
  const iEngines = entry.indexOf('const engines');
  ok(iGuard >= 0 && iEngines >= 0 && iGuard < iEngines,
    'E3 链体第一件事就是比代际（排在 engines 组装之前，否则旧链会先跑到 stopAudio 再返回）');
  /** 续链（带 idx/engineIdx 变量）必须沿用同一代；从 0 起头的是新链，取当前代即可 */
  const 续链 = (U.match(/playChunkWithFallback\(chunks, (?:idx[^)]*)\)/g) || []);
  const 漏传 = 续链.filter((c) => !/gen\)/.test(c));
  ok(续链.length >= 5 && 漏传.length === 0,
    `E4 ${续链.length} 处"续链"调用全部带 gen（漏一处，那一跳之后代际判定就废了 —— 实测漏过原生恢复重播那条）`,
    漏传.slice(0, 3).join(' | '));
  const pu = U.slice(U.indexOf('const playUrl = ('), U.indexOf('/** 供 URL 引擎使用的两个回调'));
  const guards = (pu.match(/gen !== chainGenRef\.current/g) || []).length;
  ok(guards >= 5, `E5 playUrl 的每条退出路径都比代际（入口/onended/onerror/25s 看门狗/play().catch，当前 ${guards} 处）`);
  const sa = U.slice(U.indexOf('const stopAudio = () =>'), U.indexOf('const stopAudio = () =>') + 700);
  ok(/onplay = null[\s\S]{0,120}pause\(\); [^\n]*src = ''/.test(sa)
    && /onended = null/.test(sa) && /onerror = null/.test(sa) && /onpause = null/.test(sa),
    'E6 stopAudio 先把四个回调摘干净再掐音频 —— src=\'\' 触发的 AbortError 属于上一条链，留着回调就等于让它复活');
  ok(!/if \(audioRef\.current\) \{ audioRef\.current\.pause\(\); audioRef\.current\.src = ''; \}/.test(U),
    'E6 反向：不许退回"直接 pause + 清 src"的旧形状（那正是互相掐的入口）');
  /* 自证：把链入口那句判定抽掉，E3 的判据必须变假 —— 否则 E3 是恒真 */
  const sabotaged = entry.replace('if (gen !== chainGenRef.current) return;', '');
  ok(!/if \(gen !== chainGenRef\.current\) return;/.test(sabotaged),
    'E7 正对照：抽掉入口判定后该判据确实为假（不是随便写个正则都过）');
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
