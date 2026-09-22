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
check(/\[sessionEntries, autoSpeak\]/.test(fc), '预热 effect 依赖 autoSpeak（切换后立即生效）');

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
check(/const progressPct = session\.order\.length > 0/.test(fc), '计算本轮进度百分比（按本轮会话张数）');
check(/const accuracy = sessionRated > 0/.test(fc), '计算本轮正确率');
check(/已评 \{sessionRated\}/.test(fc), '头部显示已评张数');
// 开始新会话必须清零本轮统计，否则正确率会跨会话累积
check(/const startSession = useCallback\(\(entries: IWordEntry\[\]\) => \{[\s\S]{0,400}setSessionRated\(0\); setSessionGood\(0\);/.test(fc), '开启新一轮时清零本轮统计并冻结顺序');

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

// ── ⑥ 会话排卡：答错重排 + 未来 7 天预测（纯函数，全边界单测）──
{
  const sessSrc = readFileSync(join(ROOT, 'src/lib/vocab-session.ts'), 'utf8');
  const mod2 = ts.transpileModule(
    sessSrc.replace(/export (const|interface|function)/g, '$1'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText + '\nexport { createSessionOrder, scheduleRelearn, nextIndex, forecastByDay, RELEARN_GAP, MAX_RELEARN };';
  const f2 = join(process.env.TEMP || '/tmp', 'nt-vocab-session.mjs');
  writeFileSync(f2, mod2, 'utf8');
  const S = await import(pathToFileURL(f2).href);

  const base = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let s = S.createSessionOrder(base);
  check(s.order.join('') === 'abcdefgh', '会话：初始顺序与队列一致');
  s = S.scheduleRelearn(s, 0, 'a');
  check(s.order.filter((k) => k === 'a').length === 1, '重排：同一个词在当前轮只存在一份（不重复出卡）');
  check(s.order.indexOf('a') === S.RELEARN_GAP, '重排：答错的词隔 RELEARN_GAP 张再出现', `位置=${s.order.indexOf('a')}`);
  check(s.relearnCounts.a === 1, '重排：计数 +1');

  s = S.scheduleRelearn(s, 0, 'a');
  check(s.relearnCounts.a === 2, '重排：第二次仍生效');
  const before = s.order.length;
  s = S.scheduleRelearn(s, 0, 'a');
  check(s.order.length === before && s.relearnCounts.a === 2, '重排：达到 MAX_RELEARN 后不再插入（避免队列无限增长）');
  check(S.MAX_RELEARN === 2, 'MAX_RELEARN 为 2', String(S.MAX_RELEARN));

  // 插入点超出队尾 → 放队尾，不回绕
  let s2 = S.createSessionOrder(['a', 'b']);
  s2 = S.scheduleRelearn(s2, 1, 'a', { gap: 99 });
  check(s2.order[0] === 'b' && s2.order[s2.order.length - 1] === 'a', '重排：插入点超出队尾时放到队尾（不回绕到开头）');

  check(S.nextIndex(S.createSessionOrder(['a', 'b']), 0) === 1, '下标：还有下一张');
  check(S.nextIndex(S.createSessionOrder(['a', 'b']), 1) === null, '下标：到队尾返回 null（本轮结束）');

  // 预测分桶
  const now = new Date('2026-09-22T10:00:00').getTime();
  const day = 24 * 60 * 60 * 1000;
  const f = S.forecastByDay(
    [{ nextReview: now - day }, { nextReview: now + day }, { nextReview: now + day }, { nextReview: now + 3 * day }],
    7, now,
  );
  check(f.length === 7, '预测：返回 7 个桶');
  check(f[0] === 1, '预测：逾期的算进今天', `f[0]=${f[0]}`);
  check(f[1] === 2, '预测：明天的到期数正确', `f[1]=${f[1]}`);
  check(f[3] === 1, '预测：3 天后的到期数正确', `f[3]=${f[3]}`);

  // 组件接线
  check(/createSessionOrder\(entries\.map/.test(fc), '开始复习时冻结本轮顺序');
  check(/scheduleRelearn\(s, currentIdx, key\)/.test(fc), '答错时调用重排');
  check(/quality <= 2\) \{[\s\S]{0,200}scheduleRelearn/.test(fc), '只有答错（quality<=2）才重排');
  check(/nextIndex\(session, p\)/.test(fc), '推进用会话顺序（不再用会漂的 queue 下标）');
  check(!/if \(!cw\) \{/.test(fc), '空状态判定不再误用 cw（会话未开始时 cw 也是 undefined）');
  check(/if \(queue\.length === 0\) \{/.test(fc), '空状态只由"根本没词"触发');
}

// ── ⑦ 记忆管理：屏蔽（不再出现）+ 复习负担预测 ──
{
  const uwl = readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8');
  check(/suspended\?: boolean;/.test(uwl), 'IWordProgress 增加可选的 suspended（老数据免迁移）');
  check(/!p\.suspended/.test(uwl), '屏蔽的词从 dueForReview 里排除');
  check(/const setSuspended = \(word: IWordEntry, suspended: boolean\)/.test(uwl), '导出 setSuspended');
  check(/suspendedCount,/.test(uwl) && /setSuspended,/.test(uwl), 'hook 返回 suspendedCount / setSuspended');
  check(/不再出现/.test(fc), '卡片背面有「不再出现」出口');
  check(/const suspendCurrent = useCallback/.test(fc), '屏蔽当前词并移出本轮');
  check(/action: \{ label: '撤销'/.test(fc), '屏蔽后可撤销（toast 撤销）');
  check(/恢复全部/.test(fc) && /restoreSuspended/.test(fc), '概览提供「恢复全部」找回屏蔽的词');
  check(/forecastByDay\(Object\.values\(state\.progress\)/.test(fc), '概览计算未来 7 天复习量');
  check(/下次复习：\$\{state\.progress\[shown!\.word\.toLowerCase\(\)\]\.interval\} 天后/.test(fc), '背面显示下次复习时间（解释"为什么还会再见到"）');
}

// ── ⑧ 回看上一个词 + 每日目标 + 生词本 ──
{
  // 回看：advance(-1) 必须真的往回走，并且直接翻到背面（"查看上一个词的具体信息"）
  check(/if \(direction < 0\) \{[\s\S]{0,260}setIdx\(\(p\) => Math\.max\(0, p - 1\)\)[\s\S]{0,80}setFlipped\(true\)/.test(fc),
    '回看：advance(-1) 往回走并直接展开释义（原先忽略方向符号，左滑其实还是往前走）');
  check(/onClick=\{\(\) => advance\(-1\)\} disabled=\{currentIdx === 0\}/.test(fc), '头部有「上一个」按钮且到第一张时禁用');
  check(/const viewingPast = rated && isFlipped/.test(fc), '回看态可识别（用于显示「回看第 N 张」并隐藏评分）');
  check(/isFlipped && !rated && !viewingPast/.test(fc), '回看已评过的卡时不再出现评分按钮');
  // rated 由"已评词集合"派生，否则回看时状态会错乱
  check(/const rated = !!currentKey && ratedKeys\.has\(currentKey\)/.test(fc), 'rated 由 ratedKeys 派生（回看/前进状态一致）');
  check(!/setRated\(/.test(fc), '不再有独立的 setRated 状态（已由 ratedKeys 取代）');

  // 每日目标入口
  check(/setDailyQuota\(n\)/.test(fc), '概览可直接设定每日目标');
  check(/\[10, 20, 30, 50, 100\]/.test(fc), '每日目标有 5 档预设');
  check(/今天新学 \{state\.todayLearned\.length\}\/\{dailyQuota\}/.test(fc), '显示今日进度（今天新学 x/目标）');

  // 生词本
  const reader = readFileSync(join(ROOT, 'src/pages/ArticlePage/components/PageReader.tsx'), 'utf8');
  const cwLib = readFileSync(join(ROOT, 'src/lib/custom-words.ts'), 'utf8');
  const uwl2 = readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8');
  check(/export function addCustomWord/.test(cwLib) && /export function toWordEntry/.test(cwLib), '生词本库导出 addCustomWord / toWordEntry');
  check(/level: 'custom'/.test(cwLib), '生词本词条用独立等级 custom（不污染真实词书）');
  check(/'custom'\]/.test(uwl2), "'custom' 纳入 SUB_LEVELS（生词本也能聚合与落盘）");
  check(/lookupDictionary\(clean\)\.then/.test(reader), '阅读器：词库未收录时走词典兜底');
  check(/addCustomWord\(base\)/.test(reader), '阅读器：兜底命中后写入生词本');
  check(/toWordEntry\(\{ \.\.\.base/.test(reader), '阅读器：同时把生词本词条加入复习队列');
  check(!/词库未收录 "\$\{word\}"，无法加入学习/.test(reader), '不再出现"词库未收录 → 无法加入"的断头路文案');
  check(/customList\.map\(toWordEntry\)/.test(fc), '复习队列纳入生词本词条');
  check(/setShowCustom\(true\)/.test(fc) && /removeCustomWord\(w\.word\)/.test(fc), '生词本有管理入口与移除操作');
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
