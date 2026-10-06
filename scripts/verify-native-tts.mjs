#!/usr/bin/env node
/**
 * native-tts 插件边界的回归验证（真机 2.0.45 实测缺陷）。
 *
 * 缺陷原文（手机 APK 独有，网页/桌面看不到）：
 *   src/lib/native-tts.ts 的 getNativeTts() 是 async 函数，旧实现直接
 *   `return (mod as any).TextToSpeech ?? null` —— 把 Capacitor 插件对象**穿过 Promise 边界**。
 *   插件是 Proxy，`typeof plugin.then === 'function'` 成立，于是 Promise 同化会调用
 *   `plugin.then(resolve, reject)`；这一句被当成一次真实的原生方法调用发给 Android，
 *   而原生没有 `then` 方法 → resolve/reject 永不调用 → 该 Promise **永久 pending**
 *   （不是抛错，外层 try/catch 兜不住，因为同化发生在 try 块之外），还被缓存在模块级
 *   pluginPromise 里拖死整个会话。真机表现：朗读设置里「系统语音引擎」永远「读取中…」、
 *   点「朗读自检」永远「自检中…」、切到系统引擎后朗读完全不出声且无降级，
 *   console 每调一次多一条未捕获的 `"TextToSpeech.then()" is not implemented on android`。
 *
 * 本脚本验证的不变量：
 *   A. 替身必须能复现"永久挂死"（脚手架自证 + 正对照，否则后面的绿是假的）
 *   B. 修复后的 getNativeTts() 在 1s 内 settle，且音色列表/默认音色真跑得出结果
 *   C. 原生调用不响应时，listNativeVoices 由超时兜住（超时是真的，不是装饰）
 *   D. 静态契约：不许退回"直接 return 插件对象"，调用点必须解构持有者，自检那步必须带超时，
 *      且原生"出声证据"阈值必须单点常量（真机实测 speak 要 3160ms，旧的 2.5s 会误判好引擎）
 *
 * 用法: node scripts/verify-native-tts.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'native-tts-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
const withDeadline = (p, ms) => Promise.race([
  p.then((v) => ({ settled: true, value: v }), (e) => ({ settled: true, error: String(e && e.message || e) })),
  new Promise((res) => setTimeout(() => res({ settled: false }), ms)),
]);

// 守卫自己绝不许卡死：实现一旦回到「永久 pending」的形状，这里必须快速变红并说清原因，
// 否则 verify:all 会被拖住，红绿信号就没了。
const GUARD_DEADLINE = setTimeout(() => {
  console.log('FAIL  守卫整体超时（>45s 未跑完）：实现又回到「永久挂死」形状，B/C 段的 await 被拖住');
  console.log('---');
  console.log('守卫超时，判失败');
  process.exit(1);
}, 45_000);

// 真机上这条未捕获拒绝就是缺陷的可见症状；本脚本里它是**预期产物**，必须吞掉否则 Node 直接退出
let unhandled = 0;
process.on('unhandledRejection', () => { unhandled++; });

/* ───────────── 替身：忠实复刻 Capacitor 原生插件代理 ─────────────
 * 真机行为（逐条对齐 @capacitor/core registerPlugin + Android bridge）：
 *   · 任意字符串属性都能取到函数（所以 then 也是函数 → 会被 Promise 同化盯上）
 *   · 已实现的方法 → 正常 resolve
 *   · 未实现的方法（含 then）→ **另开一个会 reject 的 Promise**，绝不调用传进来的回调
 *     正是这第三条让 await 一个 async 返回值的同化流程永远等不到结果。
 */
const FAKE = `
const __impl = {
  getSupportedVoices: async () => ({ voices: [
    { voiceURI: 'en', name: '英语', lang: 'en', localService: true, default: false },
    { voiceURI: 'zh-Hans', name: '中文', lang: 'zh-Hans', localService: true, default: false },
    { voiceURI: 'en-network', name: 'English (network)', lang: 'en-US', localService: false, default: false },
  ] }),
  speak: async () => ({}),
  stop: async () => ({}),
  openInstall: async () => ({}),
  addListener: async () => ({ remove: async () => {} }),
};
const __hang = { getSupportedVoices: false };
const fakePlugin = new Proxy({}, {
  get(_t, name) {
    if (typeof name !== 'string') return undefined;
    if (__hang[name]) return () => new Promise(() => {});            // 模拟原生不响应：永不 settle
    if (name in __impl) return __impl[name];
    return () => Promise.reject(new Error('"TextToSpeech.' + String(name) + '()" is not implemented on android'));
  },
});
const Capacitor = { isPluginAvailable: () => true, getPlatform: () => 'android', isNativePlatform: () => true };
globalThis.__setHang = (n) => { __hang[n] = true; };
globalThis.__clearHang = (n) => { __hang[n] = false; };
globalThis.__fakeTtsModule = async () => ({ TextToSpeech: fakePlugin });
`;

function buildModule() {
  let src = fs.readFileSync(path.join(ROOT, 'src/lib/native-tts.ts'), 'utf8');
  src = src.replace(/^import \{ Capacitor \} from '@capacitor\/core';$/m, '');
  src = src.replace(/await import\('@capacitor-community\/text-to-speech'\)/g, 'await globalThis.__fakeTtsModule()');
  src += '\nexport { getNativeTts, listNativeVoices, listNativeEnglishVoices, pickPreferredEnglishVoice, nativeVoiceLabel };\n';
  // 脚手架自检：残留 import 会让"模块加载失败"被误判成产品缺陷
  const leftover = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
  if (leftover.length) { console.error('脚手架错误：仍有未替换的 import ->\n' + leftover.join('\n')); process.exit(2); }
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const file = path.join(TMP, 'native-tts-under-test.mjs');
  fs.writeFileSync(file, FAKE + js);
  return file;
}

/* ───────────────────────── A. 脚手架自证：挂死是真的能复现 ───────────────────────── */
{
  const fake = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string') return undefined;
      return () => Promise.reject(new Error('"TextToSpeech.' + String(name) + '()" is not implemented on android'));
    },
  });
  ok(typeof fake.then === 'function' && typeof fake.getSupportedVoices === 'function',
    'A1 替身与真机同形：任意属性都是函数（所以 then 也是函数）');
  const hang = async () => fake;                      // ← 旧实现就是这个形状
  const r = await withDeadline(hang(), 400);
  ok(r.settled === false,
    'A2 正对照：async 直接 return 插件对象 → 永久 pending（复现真机"自检中…"永不返回）',
    r.settled ? '竟然 settle 了 → 替身不忠实，本脚本其余结论作废' : 'still pending');
  ok(unhandled > 0,
    'A3 正对照：同化过程还留下一条未捕获拒绝（＝真机 console 那条 not implemented）',
    `unhandled=${unhandled}`);
}

/* ───────────────────────── B. 修复后的模块真跑 ───────────────────────── */
{
  const mod = await import(pathToFileURL(buildModule()).href);

  const got = await withDeadline(mod.getNativeTts(), 1000);
  ok(got.settled && got.value && 'plugin' in got.value && typeof got.value.plugin === 'object',
    'B1 getNativeTts() 1s 内 settle，且拿到的是持有者 { plugin }',
    got.settled ? JSON.stringify(Object.keys(got.value || {})) : '超时＝又挂死了');

  const before = unhandled;
  const voices = await withDeadline(mod.listNativeVoices(), 1000);
  ok(voices.settled && Array.isArray(voices.value) && voices.value.length === 3,
    'B2 listNativeVoices() 真跑出 3 条语音（替身给的）',
    voices.settled ? `len=${voices.value && voices.value.length}` : '超时/异常');
  ok(unhandled === before,
    'B3 走一遍取用路径不再产生未捕获拒绝（真机每调一次多一条）',
    `新增=${unhandled - before}`);

  const enR = await withDeadline(mod.listNativeEnglishVoices(), 1500);
  const en = (enR.settled && Array.isArray(enR.value)) ? enR.value : null;
  ok(en && en.length === 2 && en.every((v) => /^en/i.test(v.lang)),
    'B4 英语音色过滤正确（2 条，且标签可区分）',
    en ? en.map((v) => v.label).join(' | ') : '超时/异常');
  ok(en && new Set(en.map((v) => v.label)).size === en.length,
    'B5 音色标签不重名（否则用户又看到一排"看起来一样"的声音）');

  const pref = await withDeadline(mod.pickPreferredEnglishVoice(), 1000);
  ok(pref.settled && pref.value && pref.value.localService === true && /^en/i.test(pref.value.lang),
    'B6 默认挑到「本地」英语音色（网络音色＝朗读要等两秒的那个坑）',
    pref.settled ? (pref.value ? pref.value.uri : 'null') : '超时');

  /* ── C. 超时是真的：让替身装死，listNativeVoices 必须有界返回 ── */
  globalThis.__setHang('getSupportedVoices');
  const hung = await withDeadline(mod.listNativeVoices(), 1200);
  ok(hung.settled === false,
    'C1 正对照：原生装死后 1.2s 内不该返回（说明超时上限确实兜着，不是恰好快）');
  const bounded = await withDeadline(mod.listNativeVoices(), 9000);
  ok(bounded.settled && Array.isArray(bounded.value) && bounded.value.length === 0,
    'C2 原生不响应时 listNativeVoices 由超时兜成 []（界面停在"读取中…"就是缺这条）',
    bounded.settled ? `len=${bounded.value.length}` : '仍然挂死');
  globalThis.__clearHang('getSupportedVoices');
  const backR = await withDeadline(mod.listNativeVoices(), 1500);
  ok(backR.settled && Array.isArray(backR.value) && backR.value.length === 3,
    'C3 超时不会把后续正常调用一起废掉（缓存的是句柄不是失败结果）',
    backR.settled ? `len=${backR.value.length}` : '仍然挂死');
}

/* ───────────────────────── D. 静态契约（防改回去） ───────────────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/native-tts.ts'), 'utf8');
  const body = src.slice(src.indexOf('export function getNativeTts'), src.indexOf('/** 原生调用超时上限'));
  ok(!/return \(mod as any\)\.TextToSpeech \?\? null/.test(src) && !/return mod\.TextToSpeech/.test(src),
    'D1 反向断言：旧的「直接 return 插件对象」写法已消失（它才是根因）');
  ok(/return \{ plugin: \(mod as any\)\.TextToSpeech \?\? null \}/.test(body) && /return \{ plugin: null \}/.test(body),
    'D2 getNativeTts 的每条出口都返回持有者字面量（两条分支都不能漏）');
  ok(/interface INativeTtsHandle/.test(src) && /Promise<INativeTtsHandle>/.test(src),
    'D3 返回类型写成具名持有者，类型层面也挡不住"顺手 return 插件"');
  ok(/withTimeout\(plugin\.getSupportedVoices\(\)/.test(src),
    'D4 取语音列表真的过了一层超时（不是只在注释里写了要兜）');

  const useTts = fs.readFileSync(path.join(ROOT, 'src/lib/use-tts.ts'), 'utf8');
  ok(!/\.then\(\(t\) => t\?\.stop/.test(useTts) && !/\.then\(async \(plugin\) =>/.test(useTts),
    'D5 反向断言：调用点没有残留"把句柄当插件用"的旧形状');
  const stopCalls = (useTts.match(/getNativeTts\(\)\.then\(\(\{ plugin: t \}\)/g) || []).length;
  ok(stopCalls === 2, 'D6 两处 stop 接线都改成解构持有者（漏一处就是静默不停止）', `count=${stopCalls}`);
  ok(/\.then\(async \(\{ plugin \}\) =>/.test(useTts),
    'D7 native speak 分支解构持有者（这条挂过＝切系统引擎后完全不出声）');
  const probe = useTts.slice(useTts.indexOf('export async function probeTtsEngines'), useTts.indexOf('// 2) 云端通道'));
  ok(/Promise\.race\(\[\s*getNativeTts\(\),/.test(probe),
    'D8 朗读自检第一步带超时（与云端那步 8s 同口径；缺它就是"自检中…"永不返回）');
  ok(/type INativeTtsHandle/.test(useTts),
    'D9 超时兜底分支复用同一个句柄类型（不靠 any 蒙过 typecheck）');

  /* 阈值单点 + 数值锁：真机实测系统引擎 speak 要 3160ms 才 resolve，
     旧的 2.5s 把可用引擎判成"无语音包"，且「只用系统引擎」时降级没有下一环 → 静默无声 */
  const m = useTts.match(/const NATIVE_AUDIO_EVIDENCE_MS = (\d+);/);
  ok(!!m, 'D10 原生"出声证据"阈值有单点常量（不许两处各写一个字面量）');
  ok(m && Number(m[1]) >= 5000,
    'D11 阈值 ≥ 5000ms（真机 Redmi Turbo 3 实测 speak resolve 3160ms 且从不派发 onRangeStart）',
    m ? `${m[1]}ms` : '常量缺失');
  const watchdogs = (useTts.match(/NATIVE_AUDIO_EVIDENCE_MS\)/g) || []).length;
  ok(watchdogs === 2, 'D12 播放看门狗与朗读自检两处都吃这个常量（漏一处就是自检与实播口径不一致）', `count=${watchdogs}`);
  ok(!/,\s*2500\)/.test(useTts),
    'D13 反向断言：native 那两处 2500 字面量不许回来（URL 引擎的 25000 是另一回事，不在此列）');
}

/* ───────────────────────── 汇总 ───────────────────────── */
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
}
console.log('---');
console.log(failed === 0 ? `全部 ${results.length} 项通过` : `${failed} 项失败`);
clearTimeout(GUARD_DEADLINE);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
