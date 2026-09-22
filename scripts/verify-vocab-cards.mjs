/**
 * verify-vocab-cards.mjs — 背单词卡片（复习检测）的交互契约与手势决策表。
 *
 * 为什么需要：滑动/自动发音/背面信息层次这些是"真机才能看出来"的行为，
 * 本项目没有测试框架，所以把能抽成纯函数的（手势判定）直接单测，
 * 把只能看代码结构的（autoSpeak 是否真的接了 UI、detail 是否真的懒加载并重读）用断言钉住。
 *
 * 背景（本轮实际修的）：autoSpeak 此前恒为 false 且**没有任何 UI 开关**，
 * 导致整段预合成 + 自动朗读是死代码；detail（搭配/例句/深度解释）懒加载后
 * 组件却仍用旧的 word 对象渲染，背面永远只有释义。
 *
 * 用法：node scripts/verify-vocab-cards.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

const fc = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8');
const swipeSrc = readFileSync(join(ROOT, 'src/lib/vocab-swipe.ts'), 'utf8');

// ── ① 自动发音必须有 UI 开关且持久化（否则预合成/自动朗读是死代码）──
check(/const AUTO_SPEAK_KEY = '/.test(fc), '定义了自动发音的持久化 key');
check(/safeStorage\.setItem\(AUTO_SPEAK_KEY/.test(fc), '自动发音开关写入 safeStorage');
check(/safeStorage\.getItem\(AUTO_SPEAK_KEY\) === '1'/.test(fc), '自动发音开关从 safeStorage 读回（初始 useState）');
check((fc.match(/toggleAutoSpeak/g) ?? []).length >= 3, '自动发音开关接了两个入口（概览 + 学习中）与键盘 S', `出现 ${(fc.match(/toggleAutoSpeak/g) ?? []).length} 次`);
check(/autoSpeak \? '·开' : '·关'/.test(fc), '概览开关显示当前状态');
check(/if \(!autoSpeak\) return;/.test(fc), '自动朗读/预合成受开关控制');
// 开关必须参与 effect 依赖，否则切换后不会重新预热
check(/\[queue, autoSpeak\]/.test(fc), '预热 effect 依赖 autoSpeak（切换后立即生效）');

// ── ② detail（搭配/例句/深度解释）懒加载后必须重读词条 ──
check(/preloadDetail\(\[cw\.level\]\)/.test(fc), '按当前词的等级懒加载 detail');
check(/findWord\(cw\.word\) \?\? cw/.test(fc), 'detail 到位后重新 findWord（applyDetail 是就地补字段）');
check(/\[cw, detailTick\]/.test(fc), '重读依赖 detailTick 触发重渲染');

// ── ③ 背面信息层次（模仿主流背单词 App）──
for (const [label, re] of [
  ['例句', /shown!\.examples/],
  ['常用搭配', /shown!\.collocations/],
  ['近义', /shown!\.synonyms/],
  ['反义', /shown!\.antonyms/],
  ['词族', /shown!\.wordFamily/],
  ['深度解释', /shown!\.deepExplanation/],
  ['语域', /shown!\.register/],
  ['情感色彩', /shown!\.emotion/],
  ['词频', /shown!\.frequencyRank/],
  ['主题标签', /shown!\.topics/],
]) check(re.test(fc), `背面展示「${label}」`);

// ── ④ 本轮进度与正确率 ──
check(/const progressPct = queue\.length > 0/.test(fc), '计算本轮进度百分比');
check(/const accuracy = sessionRated > 0/.test(fc), '计算本轮正确率');
check(/已评 \{sessionRated\}/.test(fc), '头部显示已评张数');
// 开始新会话必须清零本轮统计，否则正确率会跨会话累积
check(/setSessionRated\(0\); setSessionGood\(0\); setStarted\(true\)/.test(fc), '开始新一轮时清零本轮统计');

// ── ⑤ 手势决策表（纯函数，全分支单测）──
const mod = ts.transpileModule(
  swipeSrc.replace(/export const SWIPE_/g, 'const SWIPE_') + '\nexport { decideSwipe, SWIPE_THRESHOLD, SWIPE_QUALITY_UNKNOWN, SWIPE_QUALITY_KNOWN };',
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const outFile = join(process.env.TEMP || '/tmp', 'nt-vocab-swipe.mjs');
writeFileSync(outFile, mod, 'utf8');
const { decideSwipe, SWIPE_QUALITY_UNKNOWN, SWIPE_QUALITY_KNOWN } = await import(pathToFileURL(outFile).href);

const T = (o) => decideSwipe(o);
check(T({ dx: 10, isFlipped: false, rated: false }) === 'none', '手势：位移不足 → 不处理（视为点击）');
check(T({ dx: -79, isFlipped: false, rated: false }) === 'none', '手势：79px 未达阈值 → 不处理');
check(T({ dx: -80, isFlipped: false, rated: false }) === 'flip', '手势：未翻面时左滑 → 只翻面（不盲滑评分）');
check(T({ dx: 200, isFlipped: false, rated: false }) === 'flip', '手势：未翻面时右滑 → 也只翻面');
check(T({ dx: -120, isFlipped: true, rated: false }) === 'rate-unknown', '手势：已翻面左滑 → 不认识');
check(T({ dx: 120, isFlipped: true, rated: false }) === 'rate-known', '手势：已翻面右滑 → 认识');
check(T({ dx: -120, isFlipped: true, rated: true }) === 'prev', '手势：已评分左滑 → 上一张方向');
check(T({ dx: 120, isFlipped: true, rated: true }) === 'next', '手势：已评分右滑 → 下一张');
check(SWIPE_QUALITY_UNKNOWN === 2 && SWIPE_QUALITY_KNOWN === 4, '滑动映射到 SM-2 quality 2 / 4', `${SWIPE_QUALITY_UNKNOWN}/${SWIPE_QUALITY_KNOWN}`);
check(/decideSwipe\(\{ dx, isFlipped, rated \}\)/.test(fc), '组件用纯函数判定手势（不在组件里重复分支）');
check(/SWIPE_THRESHOLD/.test(fc) && !/const SWIPE_THRESHOLD/.test(fc), '阈值常量只有一处定义（lib），组件不重复声明');

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
