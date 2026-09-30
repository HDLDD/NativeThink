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
/**
 * 自动发音的**默认值必须是开**。
 * 这里曾经钉的是 `=== '1'`（默认关），结果用户在真机上体感就是「复习检测没有自动朗读」，
 * 报了一轮 bug。语义改成"只有显式存过 '0' 才关"，断言必须跟着重新推导，不能照抄旧值。
 */
check(/safeStorage\.getItem\(AUTO_SPEAK_KEY\) !== '0'/.test(fc), '自动发音默认开（只有显式关才为关）');
check(/catch \{ return true; \}/.test(fc), 'localStorage 不可用时自动发音仍默认开');
check((fc.match(/toggleAutoSpeak/g) ?? []).length >= 3, '自动发音开关接了两个入口（概览 + 学习中）与键盘 S', `出现 ${(fc.match(/toggleAutoSpeak/g) ?? []).length} 次`);
check(/autoSpeak \? '·开' : '·关'/.test(fc), '概览开关显示当前状态');
check(/if \(!autoSpeak\) return;/.test(fc), '自动朗读/预合成受开关控制');
// 开关必须参与 effect 依赖，否则切换后不会重新预热
check(/\[sessionEntries, autoSpeak\]/.test(fc), '预热 effect 依赖 autoSpeak（切换后立即生效）');

/**
 * ── ①b 「一处关闭，处处安静」：同一个键必须真的被四个入口读取 ──
 * 历史缺陷：FlashcardMode / DailyLearningMode / ChunkTrainingPage 都读 `__nativethink_vocab_autospeak`，
 * 而 QuickCardMode **完全不读**、出卡无条件朗读 —— 但别处的提示语写的是
 * 「与复习检测/快速闪卡共用此设置」，用户在真机上关掉后快速闪卡照样出声。
 * 2026-09-30 补齐快速闪卡：读键 + 门控朗读 effect + 面板上给开关。
 */
const SHARED_KEY = '__nativethink_vocab_autospeak';
const qc = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/QuickCardMode.tsx'), 'utf8');
const dl = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx'), 'utf8');
const ct = readFileSync(join(ROOT, 'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx'), 'utf8');
for (const [name, src] of [['快速闪卡', qc], ['每日学习', dl], ['语块复习', ct]]) {
  check(src.includes(SHARED_KEY), `${name} 读同一个自动发音持久化键（否则「共用此设置」是假话）`);
}
check(/const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';/.test(qc), '快速闪卡定义共享键');
check(/if \(!inSession \|\| !cw \|\| !autoSpeak\) return;/.test(qc), '快速闪卡的自动朗读受开关门控');
check(/\[inSession, cw, idx, tts, autoSpeak\]/.test(qc), '快速闪卡朗读 effect 依赖 autoSpeak（切换后立即生效）');
check(/safeStorage\.getItem\(AUTO_SPEAK_KEY\) !== '0'/.test(qc), '快速闪卡默认开（与其余三处同口径）');
check(/onClick=\{toggleAutoSpeak\}/.test(qc), '快速闪卡有自动发音开关入口（不能只读键不给开关）');
// 正对照：门控真的在 speak 之前，而不是写在后面当摆设
const qcSpeakIdx = qc.indexOf('tts.speak(cw.word');
const qcGuardIdx = qc.indexOf('!autoSpeak) return');
check(qcGuardIdx >= 0 && qcGuardIdx < qcSpeakIdx, '正对照：快速闪卡的开关判断位于朗读之前');
check((qc.match(/AUTO_SPEAK_KEY/g) ?? []).length >= 3, '快速闪卡读键 + 写键都在（切换能持久化）', `出现 ${(qc.match(/AUTO_SPEAK_KEY/g) ?? []).length} 次`);

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
/**
 * 2026-09-30：答错重排的词回插队列后是 front 朝上的**回看态**，旧表在这个状态返回 'flip'，
 * 手机上表现为"滑了没反应"（与"答错卡死"叠成同一个体感）。已评分的卡滑动必须直接导航；
 * 上面 113/114 两条（未评分只翻面）就是这次改动的正对照 —— 防盲滑的保护不许松。
 */
check(T({ dx: -120, isFlipped: false, rated: true }) === 'prev', '手势：已评分未翻面左滑 → 直接上一张（回看态不必先翻面）');
check(T({ dx: 120, isFlipped: false, rated: true }) === 'next', '手势：已评分未翻面右滑 → 直接下一张');
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
  /**
   * 答错重排：评分时只记 key，**前进时才插回**（2026-09-30 按帧实测的修复）。
   * 旧写法在评分那刻就 `setSession((s) => scheduleRelearn(s, currentIdx, key))`，
   * 而 cw/currentKey 都取自 `session.order[currentIdx]` —— 重排当场把该位置换成下一张 →
   * currentKey 变化 → justRated 立即为 false → 自动跳转的定时器永远排不上，
   * 屏幕还直接换成下一个词的背面（评分按钮健在）。现象：「点完全忘了卡死在本张」。
   */
  check(/quality <= 2\) \{[\s\S]{0,400}?pendingRelearnRef\.current = key;/.test(fc), '答错时只把 key 记进待重排（不在评分那刻动 session）');
  check(!/setSession\(\(s\) => scheduleRelearn/.test(fc), '评分时同步重排的旧写法已消失（正对照在下面的 advance 两条）');
  check(/const applies = pending !== null && pending === session\.order\[currentIdx\];/.test(fc), 'advance：只有"待重排的就是当前这张"才插回（回看路径不乱插）');
  check(/setSession\(scheduleRelearn\(session, currentIdx, pending\)\)/.test(fc), 'advance 里真正执行重排（scheduleRelearn 仍在用）');
  check(/setIdx\(applies \? currentIdx : next\);/.test(fc), '重排把下一张顶到原位 → applies 时下标不动也等于前进');
  check(/nextIndex\(session, currentIdx\)/.test(fc), '推进用会话顺序（下标从冻结的 session.order 来，不再用会漂的 queue）');
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
  check(/const viewingPast = rated && !justRated/.test(fc), '回看态 = 已评过且非本次刚评（不能再用 isFlipped：刚评完卡也是背面）');
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
  check(/setShowCustom\(true\)/.test(fc) && /removeCustom\(w\.word\)/.test(fc), '生词本有管理入口与移除操作');
}

// ── ⑨ 助记 / 连击 / 断点续学 / 周报 / 入口角标 ──
{
  const notes = readFileSync(join(ROOT, 'src/lib/word-notes.ts'), 'utf8');
  const sidebar = readFileSync(join(ROOT, 'src/components/AppSidebar.tsx'), 'utf8');
  const uwl3 = readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8');

  // 助记
  check(/export function setWordNote/.test(notes) && /export function useWordNote/.test(notes), '助记库导出读写与订阅');
  check(/delete next\[key\]/.test(notes), '助记清空时删键（不留空字符串）');
  check(/useWordNote\(shown\?\.word \?\? ''\)/.test(fc), '卡片背面按当前词读写助记');
  check(/我的助记/.test(fc) && /Textarea/.test(fc), '背面有可编辑的助记区');

  // 连击
  check(/const \[combo, setCombo\]/.test(fc), '有连击状态');
  check(/setCombo\(0\);?[\s\S]{0,20}\}/.test(fc) || /else \{\s*setCombo\(0\);/.test(fc), '答错清零连击');
  check(/combo >= 3 && \(/.test(fc), '连对 3 个以上才显示连击提示（避免噪音）');
  check(/next % 5 === 0/.test(fc), '每 5 连给一次即时反馈');

  // 断点续学
  check(/export function saveSession/.test(uwl3) && /export function loadSession/.test(uwl3) && /export function clearSession/.test(uwl3), '会话断点的存/取/清三件套');
  check(/if \(typeof p\.index !== 'number' \|\| p\.index < 0 \|\| p\.index >= p\.order\.length\) return null;/.test(uwl3), '断点读取时校验下标（越界视为失效）');
  check(/const resumeSession = useCallback/.test(fc), '概览提供"接着上次"');
  check(/saveSession\(currentLevel, \{ order: session\.order, index: currentIdx/.test(fc), '学习中持续保存断点');
  check(/clearSession\(currentLevel\); \/\/ 新开一轮/.test(fc), '新开一轮时丢弃旧断点');
  check(/setRatedKeys\(new Set\(\)\); setRatedNow\(null\);\s*\/\/ 必须清空/.test(fc), '新一轮必须清空 ratedKeys 与刚评分标记（否则卡片会被当成已评、评分按钮不出现）');
  check(/接着上次（还剩/.test(fc), '续学按钮显示剩余张数');

  // 周报（跨天可回溯）
  check(/history\?: Record<string, \{ learned: number; reviewed: number; good: number \}>;/.test(uwl3), 'ILearningState 增加 history（可选，老数据免迁移）');
  check(/const bumpHistory = \(s: ILearningState, isNew: boolean\)/.test(uwl3), '每次评分写入当日 history 桶');
  check(/s\.history = h;/.test(uwl3) && /bumpHistory\(next, !existing\)/.test(uwl3), 'all 模式与内存态都记 history');
  check(/const weekHistory = useMemo/.test(fc), '概览聚合最近 7 天');
  check(/本周学习量/.test(fc) && /记得 \{weekAccuracy\}%/.test(fc), '概览显示本周学习量与正确率');

  // 入口角标
  check(/export function getGlobalDueCount/.test(uwl3) && /export function useGlobalDueCount/.test(uwl3), '全局到期数（角标）');
  check(/!p\.suspended && p\.status !== 'new' && p\.nextReview <= now/.test(uwl3), '角标口径：排除屏蔽与未学，只算到期');
  check(/const dueCount = useGlobalDueCount\(\)/.test(sidebar), '侧边栏读取角标数');
  check(/item\.path === '\/vocabulary' && dueCount > 0/.test(sidebar), '角标只挂在「词汇」入口');
  check(/dispatchEvent\(new CustomEvent\(STATE_EVENT\)\)/.test(uwl3), '状态变更广播（角标能自动刷新）');
}

// ── ⑩ 图标语言一致性（emoji → lucide）与界面契约 ──
{
  const page = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8');
  // 词书/模式/复习方式的图标必须是 lucide 组件：emoji 在不同平台字形与基线不同、
  // 无法继承主题色，深色模式下对比度不可控。
  check(!/icon: '[^']*'/u.test(page.match(/const BOOKS[\s\S]*?\n\];/)?.[0] ?? ''), '词书图标不使用 emoji 字符串');
  check(!/icon: '[^']*'/u.test(page.match(/const MODES[\s\S]*?\n\];/)?.[0] ?? ''), '模式图标不使用 emoji 字符串');
  check(!/icon: '[^']*'/u.test(page.match(/const REVIEW_MODES[\s\S]*?\n\];/)?.[0] ?? ''), '复习方式图标不使用 emoji 字符串');
  check(/icon: LucideIcon/.test(page), '图标字段声明为 LucideIcon 类型（TS 会拦住 emoji 混用）');
  check(/background: `\$\{color\}1a`, color/.test(page), '图标块吃各自的强调色（深浅主题都稳）');
  check(!/\{icon\}/.test(page) && !/\{m\.icon\}/.test(page), '没有把组件当 ReactNode 渲染的残留写法');

  // 本轮修的几个真实问题
  const uwl4 = readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8');
  check(/merged\.history!\[day\] = \{/.test(uwl4), "'all' 模式聚合 history（否则概览默认视图的本周报告恒为空）");
  check(/if \(!force && t - _dueCacheAt < 800\) return _dueCache;/.test(uwl4), '角标计数带 800ms 缓存（避免每张卡都反序列化 10 个等级）');
  check(/setTimeout\(\(\) => \{ timer = null; setN\(getGlobalDueCount\(true\)\); \}, 400\)/.test(uwl4), '角标订阅做了 400ms 节流');
  check(/getGlobalDueCount\(true\)\s*\)/.test(uwl4) || /useState<number>\(\(\) => getGlobalDueCount\(true\)\)/.test(uwl4), '挂载时绕过缓存取真实值');
  check(/t\?\.closest\?\.\('textarea, input, \[contenteditable="true"\]'\)/.test(fc), '滑动手势避开输入控件（助记文本框里拖动不会误评分）');
  check(/const next = combo \+ 1;\s*\n\s*setCombo\(next\);/.test(fc), '连击不在 setState 更新函数里做副作用（StrictMode 不会双弹提示）');
  check(/const \[savedSession, setSavedSession\] = useState<ISavedSession \| null>/.test(fc), '断点用 state（初值只求值一次会导致"接着上次"不刷新）');
  check(/useEffect\(\(\) => \{ setSavedSession\(loadSession\(currentLevel\)\); \}, \[currentLevel, started\]\);/.test(fc), '回到概览/切换等级时刷新断点');
  const cwLib2 = readFileSync(join(ROOT, 'src/lib/custom-words.ts'), 'utf8');
  check(/return \{ words, remove \};/.test(cwLib2), 'useCustomWords 返回 { words, remove }（不再往数组上挂方法）');
  check(!/Object\.assign\(list, \{ remove \}\)/.test(cwLib2), '去掉了数组挂方法的写法');
}


// ── ⑪ 评分后自动跳下一张 + 系统栏避让 ──
{
  // 用户明确要求：点了熟悉程度就应该翻到下一张，不该再点一次「下一个」
  check(/if \(!started \|\| !justRated\) return;/.test(fc), '自动跳转的前置条件（只有"本次刚评分"才跳）');
  check(/setTimeout\(\(\) => advanceRef\.current\(1\), delay\)/.test(fc), '评分后定时自动进入下一张');
  /**
   * 停留时长**按数值锁**，不锁字面量（2026-09-30 用户报"切换下一张等待时间长"）：
   * 无头 Chrome 按帧实测，旧值 550/900 + advance 里另走一拍的 150ms + spring 尾巴
   * = 点完评分到下一张进 DOM 1122ms。现在 120/300 + 定长 tween ≈ 300ms。
   * 数值断言：答对必须短于答错，且答错不超过 400ms —— 谁把值调回 550/900，这里就红。
   */
  const dwellM = fc.match(/const delay = lastQualityRef\.current >= 3 \? (\d+) : (\d+);/);
  check(!!dwellM, '自动跳转的停留时长可解析（答对/答错三元式）');
  check(!!dwellM && Number(dwellM[1]) < Number(dwellM[2]), '答对停留短于答错（让人看清反馈）', dwellM ? `${dwellM[1]}ms vs ${dwellM[2]}ms` : '未匹配');
  check(!!dwellM && Number(dwellM[2]) <= 400, '答错停留 ≤ 400ms（实测基线：旧值合计 1122ms 才进下一张）', dwellM ? `${dwellM[2]}ms` : '未匹配');
  check(/transition=\{\{ duration: 0\.18, ease: 'easeOut' \}\}/.test(fc), '卡片退场用定长 tween（spring 必须衰减到亚像素才算完，尾巴 ≈400ms）');
  check(/advanceRef\.current = advance;/.test(fc), 'advance 同步到 ref（避免 effect 反复重置定时器）');
  check(/评完自动跳下一个/.test(fc), '提示文案说明会自动跳转');
  // 回看时不能自动跳（否则刚点开上一个词就被抢走）
  check(/const justRated = !!currentKey && ratedNow === currentKey;/.test(fc)
    && /useEffect\(\(\) => \{ setRatedNow\(null\); \}, \[currentKey\]\);/.test(fc),
    '换卡时清掉"刚评分"标记（区分「刚评完」与「回看已评的卡」）');

  // 顶部被状态栏遮住：targetSdk 36 → Android 15+ 强制 edge-to-edge，
  // 没有 viewport-fit=cover 时 env(safe-area-inset-*) 恒为 0，外壳无法给状态栏留位。
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8');
  const layout = readFileSync(join(ROOT, 'src/components/Layout.tsx'), 'utf8');
  const nav = readFileSync(join(ROOT, 'src/components/MobileBottomNav.tsx'), 'utf8');
  check(/viewport-fit=cover/.test(html), 'index.html 声明 viewport-fit=cover（否则 env(safe-area-*) 恒为 0）');
  check(/\.safe-area-top \{ padding-top: env\(safe-area-inset-top/.test(css), '定义 safe-area-top 工具类');
  check(/\.safe-area-bottom \{ padding-bottom: env\(safe-area-inset-bottom/.test(css), '定义 safe-area-bottom（MobileBottomNav 一直在用但此前从未定义）');
  check(/className="safe-area-top safe-area-left safe-area-right"/.test(layout), '外壳补状态栏/侧边 inset');
  check(/safe-area-bottom/.test(nav), '底部导航补手势条 inset');

  /**
   * 空 sticky 条会**压在内容上**（真机实测，别再犯）：
   * `sticky top-20 z-30 bg-background/95` 那个 div 只在浏览 tab 有内容，
   * 其它 tab 下是纯 pb-3 的 12px 不透明横条，sticky 到 y≈143 正好盖住
   * 复习检测会话栏的「错词重练中 / 1/14 已评 0」和概览卡片的标题。
   */
  const page = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8');
  check(/\{tab === 'browse' && \(\s*<div className="sticky top-20/.test(page), '空 sticky 条只在浏览 tab 渲染（不再遮挡其它模式顶部）');
  check(!/\{false && \(<TabsList/.test(page), '清掉恒为 false 的死 TabsList');
  check(/<p className="text-\[11px\] font-black italic text-foreground">SM-2 间隔记忆 · 巩固已学单词<\/p>/.test(fc),
    '复习检测概览卡用一句说明代替重复标题');

  /**
   * 切换词书必须一步生效（2026-09-29 用户报）：以前点书只 setChosenLevel，
   * 真正写回 selectedLevel 的是走完"选方式"之后的 onComplete —— 换本书被迫多点一步，
   * 中途关向导等于没换。从此换书与首启三步向导是两条路。
   */
  check(/onSwitchBook\?: \(level: string\) => void;/.test(page), '向导有可选的"换书"回调 prop（换书/首启两条路）');
  check(/if \(onSwitchBook\) \{ onSwitchBook\(level\); return; \}/.test(page),
    '已设过词书时点书直接切，不再跳去"选方式"那一步');
  const switchBody = (page.match(/const handleSwitchBook = \(level: string\) => \{[\s\S]{0,400}?\};/) || [])[0] || '';
  check(switchBody.length > 0, '脚手架自检：抓到 handleSwitchBook 函数体（抓不到就没法判）');
  check(/setSelectedLevel\(level\);/.test(switchBody) && /setMemory\(\(p\) => \(\{ \.\.\.p, level \}\)\);/.test(switchBody),
    '换书真的写回 selectedLevel + 记忆（不是只关掉向导）');
  check(!/removeItem\(`__nativethink_daily_quota_/.test(switchBody),
    '换书不清该书的每日配额（正对照：只有向导显式改每日量才重置）');
  check(/onSwitchBook=\{setupDone \? handleSwitchBook : undefined\}/.test(page),
    '只有完成过首启的用户才走一步换书，新人仍是三步向导');
  check(/onSwitchBook && 'hidden'/.test(page), '换书模式不显示三步进度条（否则看着像还要走三步）');
  check(/if \(mode === 'daily'\) setStep\(2\);/.test(page) && /else onComplete\(chosenLevel, mode, 10\);/.test(page),
    '正对照：首启三步向导的分支仍在（加换书路径没把首启流程改坏）');
  check(!/selectedLevel === 'all' \? 'cet4' : selectedLevel/.test(page),
    '选「全部」时不再拿四级的图标冒充当前词书');

  /**
   * 向导必须在**点开的那一刻就看得见**（2026-09-30 真机反馈"点击切换词书无法切换"）。
   *
   * 真机 393×851 复现：点按钮后向导渲染在六张模式卡**下面**，从 y≈809 才开始、
   * 高度 1133px —— 视口内只有 42px，屏幕看起来毫无变化（切换逻辑本身是好的，
   * 坏的是"用户根本看不见有东西弹出来"）。三处一起修：
   *  ①首页模式块与向导互斥渲染（向导打开时让位），②打开即回顶，③向导带「当前」标记与关闭出口。
   * 无头 Chrome 场景脚本（TEMP/nt-switchbook-clean.mjs，12 断言）量过 visiblePx 42 → 685。
   */
  check(/\{!immersed && !showWizard && \(/.test(page),
    '首页模式卡与向导互斥渲染（向导打开时让位，不再把向导挤到 800px 之下）');
  const openWizBody = (page.match(/const handleOpenWizard = \(\) => \{[\s\S]{0,600}?\};/) || [])[0] || '';
  check(openWizBody.length > 0, '脚手架自检：抓到 handleOpenWizard 函数体');
  check(/window\.scrollTo\(\{ top: 0/.test(openWizBody) && /setShowWizard\(true\)/.test(openWizBody),
    '打开向导即回到顶部（否则用户停在滚动位置，向导仍在视口外）');
  check(/document\.querySelector\('main'\)\?\.scrollTo\?\.\(\{ top: 0 \}\)/.test(openWizBody),
    '同时归零 <main> 滚动容器（Layout 里内容是 overflow-y-auto，窄屏可能由它滚）');
  check(/onClose\?: \(\) => void;/.test(page) && /aria-label="关闭向导"/.test(page),
    '向导有可选关闭出口（误点开不用走完三步才能退出）');
  check(/onClose=\{\(\) => setShowWizard\(false\)\}/.test(page), '页面把关闭出口接上（关掉向导、不动任何选择）');
  check(/currentLevel\?: string;/.test(page) && /\{onSwitchBook && currentLevel === key && \(/.test(page) && /\{onSwitchBook && currentLevel === 'all' && \(/.test(page),
    '换书向导给当前词书打「当前」标记（单个词书 + 全部词库两处都要）');
  check(/currentLevel=\{selectedLevel\}/.test(page), '页面把当前词书传给向导（标记的数据源）');
  check(/onSwitchBook && currentLevel === key \? 'border-\[#00B894\]/.test(page),
    '当前词书卡片有视觉强调（正对照：只在换书模式 + 命中当前书时）');

  /**
   * 走完向导必须**直接落进所选模式**（2026-09-29 真机化验收时发现的另一半"多点一步"）：
   * 模式整块内容写在 `{!showWizard && immersed && ...}` 里，而 onComplete 过去只 setTab(mode)，
   * 于是用户选完词书+方式（甚至点了"开始学习"）仍回到模式列表，得再点一次卡片才开始。
   */
  const completeBody = (page.match(/const handleWizardComplete = \(level: string[\s\S]{0,2000}?\n {2}\};/) || [])[0] || '';
  check(completeBody.length > 0, '脚手架自检：抓到 handleWizardComplete 函数体');
  check(/handleTabChange\(mode\);/.test(completeBody),
    '向导完成走和首页点卡片同一条进模式路径（含 browse 滚动恢复等副作用）');
  check(/setImmersed\(true\);/.test(completeBody), '向导完成即进入沉浸态，不再停在模式列表');
  check(!/^\s*setTab\(mode\);/m.test(completeBody), '正对照：没有残留裸 setTab(mode)（那正是"回到列表要点第二下"的根因）');
  check(/immersed && dataReady/.test(page), '模式内容仍由 immersed 把关（上面那句 setImmersed 才有意义）');
  const continueBody = (page.match(/const handleWizardContinue = \(\) => \{[\s\S]{0,600}?\n  \};/) || [])[0] || '';
  check(/handleTabChange\(lastTab\);/.test(continueBody) && /setImmersed\(true\);/.test(continueBody),
    '「继续上次的选择」同样直接进上次的模式');
  check(!/setImmersed/.test(switchBody),
    '一步换书不动沉浸态：在模式里换书留在该模式，在首页换书仍留在首页');

  /**
   * 使用指南不许抢词汇首启向导的位（2026-09-29 无头 Chrome 复现）。
   * HelpGuide 挂载 800ms 后无条件自动弹**模态** Dialog，新用户一进 /vocabulary
   * 就被它盖住，必须先关掉才能选词书（自动化验收也被它挡掉过两次真实点击）。
   */
  const help = readFileSync(join(ROOT, 'src/components/HelpGuide.tsx'), 'utf8');
  const autoOpen = (help.match(/useEffect\(\(\) => \{[\s\S]{0,600}?setOpen\(true\)[\s\S]{0,120}?\}, \[defaultOpen, pathname\]\);/) || [])[0] || '';
  check(autoOpen.length > 0, '脚手架自检：抓到 HelpGuide 的自动弹出 effect（含 pathname 依赖）');
  check(/pathname !== '\/' && pathname !== ''/.test(autoOpen),
    '使用指南只在首页自动弹（各功能页的首启流程归该页自己管）');
  check(/useLocation\(\)/.test(help), '路由判定用 useLocation（带 basename 部署时 window.location.pathname 会多前缀）');

  /**
   * 首启向导阶段一本都不许预载（2026-09-29 性能体检）。
   * selectedLevel 默认 'all'，挂载 effect 以前会把 9 本书连 detail 全拉进来 ——
   * 实测全新 profile 进 /vocabulary：18 个词库 chunk / 3.16MB（压缩后 ≈40MB 源码）、
   * 15 个长任务合计 1.6s、堆 69MB，而用户连一本都还没选。
   * 现在：没 setupDone 直接 return；模式子树等 dataReady 才挂载（否则渲染期用
   * queryWords() 算出来的派生数据是空的，而 memo 依赖里没有"数据到位"这一项，
   * 晚到的数据不会让它重算 —— 表现就是"选了书、本书进度整块消失"）。
   */
  const preloadEffect = (page.match(/useEffect\(\(\) => \{[\s\S]{0,900}?preloadLevels\(levels\)[\s\S]{0,300}?\}, \[selectedLevel, setupDone\]\);/) || [])[0] || '';
  check(preloadEffect.length > 0, '脚手架自检：抓到 [selectedLevel, setupDone] 预载 effect');
  check(/if \(!setupDone\) return;/.test(preloadEffect), '首启向导挂着时不做任何预载');
  check(/\.catch\([\s\S]{0,240}\)\s*\.finally\(/.test(preloadEffect),
    '预载失败也放行（finally 放开 dataReady），不会把人永久卡在"加载中"');
  check(/\{!showWizard && immersed && dataReady && \(/.test(page),
    '模式子树等 dataReady 才挂载（防"数据晚到但 memo 不重算"）');
  check((page.match(/preloadLevels\(/g) || []).length === 1,
    'preloadLevels 只剩一个真正调用点：向导完成 / 继续 / 换书都交给同一个 effect（不再各调一遍）',
    `实际 ${(page.match(/preloadLevels\(/g) || []).length} 处`);

  /**
   * 两张柱状图（未来 7 天复习量 / 本周学习量）的容器必须容得下「数值+柱+星期」三层。
   * 原来写死 h-12，8px 文字行盒 ~13px，13+34+8+13=68 > 48 → 数值从顶部溢出压住标题。
   */
  const chartBoxes = (fc.match(/flex items-end gap-1\.5 h-\[72px\]/g) ?? []).length;
  check(chartBoxes >= 2, '两张柱状图容器高度 ≥ 三层文字所需（不再溢出去压标题）', `找到 ${chartBoxes} 处`);
  check(!/flex items-end gap-1\.5 h-12/.test(fc), '没有残留写死 h-12 的旧图表容器');

  /**
   * 自动朗读的"已读过的卡"记录必须**每轮清空**。
   * ref 不随组件重挂载归零，而每轮都从下标 0 正面开始 ——
   * 不清空就会出现"第二轮起第一张卡不读单词"（用户反馈：只朗读句子不朗读单词）。
   */
  const resetCount = (fc.match(/lastSpokenKey\.current = '';/g) ?? []).length;
  check(resetCount >= 2, 'startSession / resumeSession 都清空朗读记录', `找到 ${resetCount} 处`);
  check(/clearSession\(currentLevel\);[\s\S]{0,120}lastSpokenKey\.current = '';/.test(fc), '新开一轮时清空（紧跟 clearSession）');

  /**
   * 「答错待重排」是同样性质的每轮 ref：startSession / resumeSession / suspendCurrent /
   * advance 消费后都要清。漏了 startSession 就会把上一轮没消费的 key 插进新一轮队列。
   * suspendCurrent 那条是必要条件 —— scheduleRelearn 只认 key、不看词还在不在队里，
   * 不清就会把"不再出现"的词复活。
   */
  const pendClear = (fc.match(/pendingRelearnRef\.current = null;/g) ?? []).length;
  check(pendClear >= 4, '待重排在 开始/续学/前进消费/屏蔽 四处都被清', `找到 ${pendClear} 处`);
  check(/if \(pendingRelearnRef\.current === word\.word\.toLowerCase\(\)\) pendingRelearnRef\.current = null;/.test(fc),
    '屏蔽当前词时撤销它的待重排（否则下次前进会把它插回队里）');
}

// ── ⑫ 复习检测：取消「下一个」按钮 + 快速闪卡交互补齐 ──
{
  // 用户明确要求「下一个按钮去掉」：评分后自动跳转已经足够，多一个按钮只是负担
  check(!/onClick=\{\(\) => advance\(\)\}/.test(fc), '复习检测不再有「下一个」按钮');
  check(/即将进入下一张/.test(fc), '评分后改为「即将进入下一张」过渡提示');
  check(/rated && !viewingPast && \(/.test(fc), '过渡提示只在本次刚评分时显示（回看态不显示）');
  // 回看态（含答错重排再现的卡）没有评分按钮也没有「下一个」按钮 → 必须给出可见的继续出口，
  // 否则手机用户滑了没反应 = 卡死（2026-09-30 与"答错卡死"同一批修）。
  check(/已评过的卡 · 滑动 \/ 按 → 继续/.test(fc), '回看态显示「滑动 / 按 → 继续」出口');

  /**
   * 背面自动朗读必须**先读单词再读例句**（用户反馈「只朗读句子，不朗读单词」）。
   * 断言用 includes 逐字钉住这一句 —— 正则里的 `${}` 和反引号太容易写歪。
   */
  check(
    fc.includes('`${word.word}. ${cleanText(word.examples[0].en)}`'),
    '背面自动朗读是「单词 + 例句」一次 speak（保证单词先出声且不被掐断）',
  );
  check(!/setTimeout\(\(\) => \{ ttsRef\.current\.speak\(cleanText\(word\.examples\[0\]\.en\)/.test(fc),
    '去掉了"只读例句"的旧写法');

  const qc = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/QuickCardMode.tsx'), 'utf8');
  const hist = readFileSync(join(ROOT, 'src/lib/quickcard-history.ts'), 'utf8');

  // ① 点卡片即翻面（先猜再看才是自测）
  check(/if \(!revealed\) setRevealed\(true\)/.test(qc), '快速闪卡点卡片即翻面看释义');
  check(/点卡片看释义/.test(qc), '未翻面时有「点卡片看释义」提示');
  check(/e\.stopPropagation\(\); speak\(cw\.word\)/.test(qc), '卡片内的发音按钮不复用翻面事件');

  // ② 例句：只在翻面后按需拉 detail；必须用 isDetailReady 兜住死循环
  check(/const example = cw\.examples\[0\];/.test(qc), '释义面展示第一条例句');
  check(/preloadDetail\(\[cw\.level\]\)/.test(qc), '翻面后按当前词等级懒加载 detail');
  check(/if \(isDetailReady\(cw\.level\)\) return;/.test(qc), 'detail 已就绪且无例句时不再重试（否则 tick 死循环）');
  check(/speak\(example\.en\)/.test(qc), '例句可点读');

  // ③ 上一个（回看上一张，语义与复习检测一致：直接展开释义）
  check(/const prev = useCallback/.test(qc), '快速闪卡有「上一个」');
  check(/if \(idx === 0\) return;[\s\S]{0,160}setRevealed\(true\);/.test(qc), '回看上一张时直接展开释义');
  check(/上一个/.test(qc), '「上一个」有可见入口');

  // ④ 每轮词表留档：完成页列表 + 可重练 + 持久化
  check(/runWords\.map/.test(qc), '完成页列出本轮词表');
  check(/absorbQuickCardRun\(level, roundSize, runWords\)/.test(qc), '一轮结束按「选择的数量」切分落档');
  check(/savedSeqRef\.current === runSeq/.test(qc), '同一轮只落一条记录（幂等）');
  check(/useQuickCardRuns\(level\)/.test(qc), '留档按当前词书订阅');
  check(/const drillRun = useCallback\(\(run: IQuickCardRun, onlyUnknown = false\)/.test(qc), '留档可整组重练 / 只重练不认识的');
  check(/<HistoryPanel/.test(qc), '完成页与游戏中都能打开学习记录');

  check(/const MAX_RUNS = 20;/.test(hist), '留档条数上限（防止 localStorage 无限增长）');
  check(/const MAX_WORDS_PER_RUN = 300;/.test(hist), '单轮落盘词数上限（「全部」档位可能几千词）');
  check(/words: run\.words\.slice\(0, MAX_WORDS_PER_RUN\)/.test(hist), '落盘时截断');
  check(/export function listQuickCardRuns/.test(hist) && /export function saveQuickCardRun/.test(hist), '留档读写导出完整');
  check(/window\.addEventListener\(EVENT, onChange\)/.test(hist), '留档跨组件广播');

  // ⑤ 「单词上限解开」= 增加不限量档位
  check(/const ROUND_ALL = 0;/.test(qc), '定义「全部」档位（0 = 不限量）');
  check(/v === ROUND_ALL \|\| \(ROUND_SIZES as readonly number\[\]\)\.includes\(v\)/.test(qc), '「全部」档位能持久化（0 不被回退成 20）');
  check(/全部/.test(qc), '「全部」有可见入口');

  // ⑥ 返回必须真的返回：原先 setQueue([]) 会被重建队列的 effect 立刻填回去
  check(/if \(paused\) return;/.test(qc), '暂停态不自动重建队列');
  check(/cfgRef\.current === cfg/.test(qc), '配置签名去重（否则从留档重练会被随机队列冲掉）');
  check(/const exitRun = useCallback/.test(qc), '「返回」走 exitRun（停在起跑页）');
  check(/onClick=\{exitRun\}/.test(qc), '顶栏返回按钮接到 exitRun');

  // ⑦ 顶部「上一个单词」+ 点开词条详情
  check(/const prevWord = idx > 0 \? queue\[idx - 1\] : undefined;/.test(qc), '派生上一个单词');
  check(/上一个单词/.test(qc), '顶部常驻「上一个单词」标签');
  check(/onClick=\{\(\) => setDetailWord\(prevWord\)\}/.test(qc), '点上一个单词打开详情');
  check(/\{prevWord\.word\}/.test(qc), '顶部显示的是**具体词面**而不只是"上一个"三个字');
  check(/const \[detailWord, setDetailWord\] = useState<IWordEntry \| null>\(null\)/.test(qc), '详情弹窗状态');
  check(/findWord\(detailWord\.word\) \?\? detailWord/.test(qc), '详情按 detailTick 重新 findWord（applyDetail 是就地补字段）');
  check(/<WordInfoDialog/.test(qc), '渲染词条详情弹窗');
  check(/entry\.examples\.length > 0 && \(/.test(qc) && /entry\.collocations\.length > 0 && \(/.test(qc)
    && /entry\.deepExplanation && \(/.test(qc), '详情含例句/搭配/深度解释');
  check(/entry\.synonyms\.length > 0 && \(/.test(qc) && /entry\.antonyms\.length > 0 && \(/.test(qc), '详情含近义/反义');
  check(/if \(document\.querySelector\('\[role="dialog"\]'\)\) return;/.test(qc), '弹窗打开时不抢键盘（Esc 不会顺手退出本轮、1/2 不会偷偷评分）');
  check(/window\.addEventListener\('keydown', onKey, true\);/.test(qc) && /window\.removeEventListener\('keydown', onKey, true\);/.test(qc),
    '键盘监听在捕获阶段（弹窗关闭由 Radix 同步 flush，冒泡阶段已看不到 dialog）');

  // ⑧ 收藏：卡片 / 词表 / 详情弹窗 / 收藏面板 + 写进收藏页同源数据
  check(/useFavorites\(\)/.test(qc) && /addFavorite\(\{[\s\S]{0,120}type: 'word'/.test(qc), '收藏走 useFavorites 的 word 类型（与收藏页同源）');
  check(/const toggleFav = useCallback\(\(w: IWordEntry\)/.test(qc), '有统一的收藏开关');
  check(/title=\{isFav\(cw\.word\) \? '取消收藏' : '收藏这个单词'\}/.test(qc), '卡片上可收藏（正反面都在）');
  check(/<WordChip/.test(qc), '词表用带星标的词片');
  check(/function WordChip\(/.test(qc) && /onToggleFav/.test(qc), 'WordChip 支持收藏');
  check(/function FavoritesPanel\(/.test(qc), '有收藏面板');
  check(/只练收藏的词/.test(qc), '收藏可单独成组重练');
  check(/const drillFavorites = useCallback/.test(qc), '收藏重练回调存在');
  check(/收藏\{favWords\.length > 0 \? ` \$\{favWords\.length\}` : ''\}/.test(qc), '顶栏收藏入口带数量');
  const favPage = readFileSync(join(ROOT, 'src/pages/FavoritesPage/FavoritesPage.tsx'), 'utf8');
  check(/'all', 'vocabulary', 'word'/.test(favPage), '收藏页有「单词」过滤项（否则收藏的词只能在全部里翻）');

  // ⑧b 静默契约（2026-09-29 用户要求：快速闪卡里"不认识"和"收藏"都不要弹提示）
  //     锁住"不许再加回来"，同时用锚点断言证明不是把整块功能删掉换来的绿。
  const toggleFavBody = (qc.match(/const toggleFav = useCallback\([\s\S]{0,700}?\}, \[favorites, addFavorite, removeFavorite, level\]\);/) || [])[0] || '';
  check(toggleFavBody.length > 0, '脚手架自检：抓到 toggleFav 函数体（抓不到就没法判静默）');
  check(!/toast\./.test(toggleFavBody), '收藏 / 取消收藏不弹 toast');
  check(/addFavorite\(\{/.test(toggleFavBody) && /removeFavorite\(existing\.id\)/.test(toggleFavBody),
    '正对照：收藏开关仍然真的在写数据（不是靠删功能变静默）');
  //（"不认识不弹提示"的反向断言在 ⑪ 重排那一节，与旧文案一同维护，避免两处重复）
  check(/if \(\(relearnCounts\[key\] \?\? 0\) < MAX_RELEARN\) \{[\s\S]{0,200}scheduleRelearn\(cw\);/.test(qc),
    '正对照：重排机制本身仍在（只是不再播报）');
  check(!/已收藏「|已取消收藏「/.test(qc), '文件里不再出现收藏类 toast 文案');

  // ⑨ 释义必须带词性
  check(/cw\.partOfSpeech\}/.test(qc) && /tracking-wider text-ink-violet/.test(qc), '卡片释义行内显示词性');
  check(/entry\.partOfSpeech\}/.test(qc), '详情弹窗释义行内显示词性');

  // ⑩ 断点续学 + 按数量切分留档
  const hist2 = readFileSync(join(ROOT, 'src/lib/quickcard-history.ts'), 'utf8');
  check(/loadQuickCardSession/.test(qc) && /saveQuickCardSession\(\{/.test(qc), '快速闪卡会存/读未学完的那一轮');
  check(/saveQuickCardSession\(\{[\s\S]{0,220}order: queue\.map\(\(w\) => w\.word\)[\s\S]{0,120}results:/.test(qc), '断点含顺序/位置/每张卡的作答/是否停在起跑页');
  check(/restoreStateRef/.test(qc) && /restoredRunRef/.test(qc), '恢复与"重建队列"两个 effect 有先后与去重（否则恢复会被随机队列覆盖）');
  check(/继续本轮（第 \{idx \+ 1\}\/\{queue\.length\} 张）/.test(qc), '起跑页能继续未学完的那一轮');
  check(/absorbQuickCardRun\(level, roundSize, runWords\)/.test(qc), '学完一轮按「选择的数量」切分留档');
  check(/while \(rest\.length >= size\)/.test(hist2), '切分逻辑：每满一份就存一条记录');
  check(/writePending\(rest\.length > 0 \? \{ level, size, words: rest \} : null\)/.test(hist2), '不足一份的余数留在「当前累积」');
  check(/当前累积 \{pending\.words\.length\}/.test(qc), '学习记录里能看到当前累积');
  check(/size <= 0[\s\S]{0,200}saveQuickCardRun/.test(hist2), '「全部」档位（size=0）不切分，整轮存一条');

  /**
   * 词条详情弹窗必须在**三个分支**都渲染：进行中 / 完成页 / 起跑页。
   * 只在"进行中"渲染过一次，结果完成页和起跑页的词表点了没反应（用户反馈"列表的单词要能点击查看详细信息"）。
   */
  check(/const detailDialog = \(/.test(qc), '详情弹窗抽成一个节点复用');
  const dialogUses = (qc.match(/\{detailDialog\}/g) ?? []).length;
  check(dialogUses >= 3, '进行中 / 完成页 / 起跑页都渲染详情弹窗', `找到 ${dialogUses} 处`);
  check(/const favoritesPanel = \(/.test(qc), '收藏面板抽成一个节点复用（完成页与起跑页都能打开）');

  /**
   * ⑪ 答错的词要「在后面刷词过程中再出现」= 隔 RELEARN_GAP 张重新插回同一轮队列。
   * queue 与 results 必须同步 splice —— 只插一个会让下标错位，作答结果串到别的词上。
   */
  check(/const RELEARN_GAP = 4;/.test(qc) && /const MAX_RELEARN = 2;/.test(qc), '重刷参数（间隔 / 上限）');
  /**
   * 2026-09 重构断言重新推导：scheduleRelearn 改为**事件层用 queueRef/resultsRef
   * 一次性算好**（签名 word: IWordEntry）。旧实现有两个真 bug 被修掉：
   *  ① setState updater 里嵌套 setState + 改 ref —— StrictMode 双调用把词插两遍、results 错位；
   *  ② 完成判定用闭包 queue.length —— 最后一张卡答错因重排插入前的旧长度被直接判完成。
   * 不变量保持：插回位置 = 当前 +1 + 间隔；queue 与 results 同步插入。
   */
  check(/const scheduleRelearn = useCallback\(\(word: IWordEntry\)/.test(qc), '有重刷排期函数（事件层 ref 计算，IWordEntry 签名）');
  check(/const at = Math\.min\(queueRef\.current\.length, idx \+ 1 \+ RELEARN_GAP\);/.test(qc), '插回位置 = 当前 +1 + 间隔');
  check(/nextQueue\.splice\(at, 0, word\)[\s\S]{0,200}resNext\.splice\(at, 0, null\)/.test(qc), 'queue 与 results 同步插入（下标不错位）');
  check(/idx \+ 1 >= queueRef\.current\.length/.test(qc), '完成判定用 queueRef 最新长度（最后一张卡答错仍会重排）');
  check(!/setRelearnCounts\(\(c\) => \{[\s\S]{0,120}setQueue\(/.test(qc), '重排计数 updater 内无嵌套 setState（StrictMode 约定）');
  check(/if \(\(relearnCounts\[key\] \?\? 0\) < MAX_RELEARN\)/.test(qc), '同一个词一轮最多重排 MAX_RELEARN 次');
  // 2026-09-29 用户要求：重排本身保留，但不再弹提示（卡片紧接着翻面就是反馈）。
  // 断言随之**反向**——不是删掉这条，而是改锁新契约；同节 ⑧b 还有"重排仍在"的正对照。
  check(!/这个词稍后会再出现一次/.test(qc), '重排不再弹提示（旧文案不许回来）');

  // ⑫ 同一个词不重复计入/列出（重刷后统计与词表都要按词去重）
  check(/const uniqueResults = useMemo/.test(qc), '结果按词去重（取最后一次作答）');
  check(/const uniqueTotal = useMemo\(\(\) => new Set\(queue\.map\(\(w\) => w\.word\)\)\.size/.test(qc), '分母用不同单词数');
  check(/const firstSeen = new Map<string, number>\(\)/.test(qc), '完成页词表按首次出现顺序去重');
  check(/answeredCount\}\/\{uniqueTotal\}/.test(qc), '进度显示 已答/不同单词数（重刷不倒退）');

  // ⑬ 留档去重：同一份词表只留一条
  check(/export function listSignature/.test(hist2), '词表指纹函数');
  check(/const rest = read\(\)\.filter\(\(r\) => !\(r\.level === entry\.level && listSignature\(r\.words\) === sig\)\)/.test(hist2),
    '同一词书 + 同词表 → 替换旧条目而不是新增（列表不重复）');
}

console.log('');console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
