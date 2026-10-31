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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const pfm = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/PhraseFlashcardMode.tsx'), 'utf8');
for (const [name, src] of [['快速闪卡', qc], ['每日学习', dl], ['语块复习', ct], ['短语闪卡', pfm]]) {
  check(src.includes(SHARED_KEY), `${name} 读同一个自动发音持久化键（否则「共用此设置」是假话）`);
}
check(/const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';/.test(qc), '快速闪卡定义共享键');
check(/if \(!inSession \|\| !cw \|\| !autoSpeak\) return;/.test(qc), '快速闪卡的自动朗读受开关门控');
check(/\[inSession, cw, idx, tts, autoSpeak, queue\]/.test(qc), '快速闪卡朗读 effect 依赖 autoSpeak（切换后立即生效）+ queue（预合成下一张）');
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
check(SWIPE_QUALITY_UNKNOWN === 2 && SWIPE_QUALITY_KNOWN === 4, '滑动映射到 SM-2 quality 2 / 4（短语闪卡口径）', `${SWIPE_QUALITY_UNKNOWN}/${SWIPE_QUALITY_KNOWN}`);

/**
 * ⑤b 复习检测禁用「滑动评分」（2026-10-13 用户口径：不要用左右划判断熟悉与否）——
 * 已翻面未评分的滑动必须返回 'none'（不评分、不动作），只认五档评分按钮 / 数字键；
 * 未翻面→翻面、已评分→前后导航两条保留。纯函数新加 allowRate 档实现，
 * 上面 112-119、125-126 那张默认表**一字不改**：它就是短语闪卡（不传 allowRate）的契约与正对照。
 */
check(T({ dx: -120, isFlipped: true, rated: false, allowRate: false }) === 'none', '手势（FM 禁用滑动评分）：已翻面左滑 → 不评分不动作');
check(T({ dx: 120, isFlipped: true, rated: false, allowRate: false }) === 'none', '手势（FM）：已翻面右滑 → 不评分不动作');
check(T({ dx: -120, isFlipped: false, rated: false, allowRate: false }) === 'flip', '手势（FM）：未翻面左滑 → 仍只翻面');
check(T({ dx: 120, isFlipped: false, rated: false, allowRate: false }) === 'flip', '手势（FM）：未翻面右滑 → 仍只翻面');
check(T({ dx: -120, isFlipped: false, rated: true, allowRate: false }) === 'prev', '手势（FM）：已评分左滑 → 回看导航保留');
check(T({ dx: 120, isFlipped: true, rated: true, allowRate: false }) === 'next', '手势（FM）：已评分右滑 → 回看导航保留');
check(T({ dx: -120, isFlipped: true, rated: false, allowRate: true }) === 'rate-unknown', '正对照：显式 allowRate:true 仍走滑动评分（默认表未被破坏）');
check(/decideSwipe\(\{ dx, isFlipped, rated, allowRate: false \}\)/.test(fc), '复习检测调用处传 allowRate:false（组件不重复分支）');
check(!/markWithQuality\(action === 'rate-unknown'/.test(fc), '复习检测删掉了滑动 → quality 的评分映射');
check(!/swipeHint/.test(fc), '复习检测删掉了滑动方向提示（不认识/认识覆盖层）');
check(/decideSwipe\(\{ dx, isFlipped, rated \}\)/.test(pfm), '正对照：短语闪卡仍走默认决策表（滑动评分）');
check(/markWithQuality\(action === 'rate-unknown' \? SWIPE_QUALITY_UNKNOWN : SWIPE_QUALITY_KNOWN\)/.test(pfm), '正对照：短语闪卡保留滑动评分映射');
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
  /**
   * 【2026-10-05 修复钉住】只有生词本的账号（新装 / 换设备还没同步 / 把 AI 词表灌进生词本）
   * 曾被空队列判据挡掉：dueWords 与 otherWords 都用只查词库的 findWord() 解析，词库未收录的
   * 生词本词两支都进不去 → 队列空，而入口角标按进度算，照样显示「N 个到期」。
   * 用户视角就是"点了没反应"。下面四条钉住修好的顺序、判据、补量与屏蔽承诺。
   */
  const ixCustom = fc.indexOf('const customEntries = customList.map(toWordEntry)');
  const ixEmpty = fc.indexOf('dueWords.length === 0 && staleOtherKeys.length === 0');
  check(ixCustom > -1 && ixEmpty > -1 && ixCustom < ixEmpty,
    '生词本词条在「空队列判据」之前算出（顺序反了纯生词本账号就永远出不了卡）', `ixCustom=${ixCustom} ixEmpty=${ixEmpty}`);
  check(/dueWords\.length === 0 && staleOtherKeys\.length === 0 && customEntries\.length === 0/.test(fc),
    '空队列判据含第三个条件 customEntries（中间条件 2026-10-14 起为 staleOtherKeys 存在性 —— 预算耗尽 ≠ 没内容）');
  check(!/if \(dueWords\.length === 0 && otherWords\.length === 0\) \{/.test(fc),
    '旧判据（只看两支词库解析结果）必须消失 —— 反向正对照，防退回旧逻辑');
  check(/Math\.max\(0, dailyQuota - customEntries\.length\)/.test(fc),
    '本轮预算先扣掉生词本词数（2026-10-14 起总张数受「每日目标」约束 —— ⑳/㉑；扣减生词本的口径不变）');
  check(/const customEntries = customList\.map\(toWordEntry\)\.filter\(\(w\) => \{[\s\S]{0,240}!prog\.suspended/.test(fc),
    '被「不再出现」屏蔽的生词本词也不进队列（与上面 otherWords 的屏蔽承诺一致）');
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
  check(/<BookIcon[^>]*style=\{\{ color \}\}/.test(page) && /<ModeIcon[^>]*style=\{\{ color \}\}/.test(page)
    && /style=\{\{ background: color \}\}/.test(page),
    '强调色挂在图标与书脊上（不再用大面积淡色图标块；深浅主题都稳）');
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
  check(/safe-area-bottom/.test(nav) || /env\(safe-area-inset-bottom/.test(nav),
    '底部导航补手势条 inset（safe-area-bottom 类，或用 env() 直接抬底）');

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
  check(/onSwitchBook && currentLevel === key \? 'border-\[var\(--brand\)\]/.test(page),
    '当前词书卡片有视觉强调（正对照：只在换书模式 + 命中当前书时；品牌色走 --brand，换主题会跟着变）');

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
  check(/const enterMode = \(key[^)]*\) => \{[\s\S]{0,260}?if \(!setupDone\) \{ handleOpenWizard\(\); return; \}/.test(page),
    '未完成首设时点模式卡回到向导（否则预载被 setupDone 拦住，永久停在“词库加载中”）');
  check(/\{onContinue && \(/.test(page) && /onContinue=\{setupDone \? handleWizardContinue : undefined\}/.test(page),
    '首次向导不显示“继续上次的选择”（没有上次选择时 default level 是 all）');
  check(/\{showWizard \? '先选一本，再挑练法' : '选择一个模式开始'\}/.test(page),
    '向导打开时副标题说明先选一本词书');
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
  /**
   * 用户明确要求「下一个按钮去掉」：**评分后**（`rated && !viewingPast`）自动跳转已经足够，
   * 多一个按钮只是负担。2026-10-14 按新语义**重新推导**（不是放宽）：该断言的意图是
   * "评分后不出现下一个按钮"，不是"全文件禁掉 advance 按钮" —— 本轮回看态（viewingPast）
   * 加了**唯一**的「已评过的卡 · 继续」按钮（用户：「进入回看就卡住，一个单词循环」，
   * 原纯 span 手机点不了）。两条断言合起来：评分后无按钮 + 全文件唯一的 advance 按钮
   * 就是那个"继续"（防悄悄在别处再塞一个）。
   */
  check(!/rated && !viewingPast && \([\s\S]{0,400}?<button/.test(fc),
    '复习检测评分后仍无「下一个」按钮（自动跳转已足够）');
  check((fc.match(/onClick=\{\(\) => advance\(\)\}/g) ?? []).length === 1
    && /viewingPast && \([\s\S]{0,460}?onClick=\{\(\) => advance\(\)\}[\s\S]{0,460}?已评过的卡 · 继续/.test(fc),
    '全文件唯一的 advance 按钮 = 回看态「继续」（2026-10-14 回看态出口；别处不许再冒出第二个）');
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

  /**
   * ⑤b 每轮数量**只能在起跑页改**（2026-09-30 用户要求）。
   *
   * 训练页顶栏原先有一排 10/20/50/100/全部：`changeRoundSize` → `roundSize` 变 →
   * 重建队列的 effect ② 重新随机抽一轮，**本轮已作答的认识/不认识全部清空**。
   * 所以断言分两侧，缺一不可：
   *   - 起跑页（`if (paused)` → `if (!cw)`）仍然给得出档位 —— 不许把功能整个删掉；
   *   - 训练页（`if (!cw)` 之后到组件 return 结束）没有任何 `changeRoundSize` 调用点。
   * 区域用两个分支标记切，不按行号。**两侧都是必需的**：只留"训练页没有"这一侧，
   * 实现把起跑页的档位一起删掉也算过 —— 那正是本项目明令禁止的"削弱用户入口"。
   * 变异实测（把档位塞回训练页 / 把起跑页档位点掉，共 5 条）见临时脚本 nt-mutate-roundsize.mjs，全红。
   */
  const pausedAt = qc.indexOf('if (paused) {');
  const loadingAt = qc.indexOf('if (!cw) {');
  check(pausedAt > 0 && loadingAt > pausedAt, '⑤b 起跑页 / 加载中 / 训练页三个分支能按标记切开');
  const setupPage = qc.slice(pausedAt, loadingAt);
  /** 训练页主体（顶栏 + 卡片 + 进度条）；后面的 WordChip / 面板 / 详情弹窗是子组件，另算 */
  const practicePage = qc.slice(loadingAt, qc.indexOf('\nfunction WordChip'));
  const sizeCalls = [...qc.matchAll(/changeRoundSize\(/g)];
  check(sizeCalls.length === 2 && sizeCalls.every((m) => m.index > pausedAt && m.index < loadingAt),
    `⑤b 全文件的档位调用点只有起跑页那两处（实际 ${sizeCalls.length} 处）—— 训练页与子组件一个都没有`);
  check(!/ROUND_SIZES\.map/.test(practicePage), '⑤b 训练页顶栏不再铺 10/20/50/100 按钮组');
  check(setupPage.includes('onClick={() => changeRoundSize(n)}') && setupPage.includes('onClick={() => changeRoundSize(ROUND_ALL)}'),
    '⑤b 起跑页仍可挑档位（10/20/50/100 + 全部）—— 只挪走入口，不削功能');
  check(/本轮可出 \{roundSize === ROUND_ALL/.test(setupPage), '⑤b 起跑页把本轮出词数写在标题里');
  check(/本轮 \{uniqueTotal\} 词/.test(practicePage),
    '⑤b 训练页保留**只读**的本轮词数提示（分母与进度条同源，断点续学后也不会说错数）');
  check(/换数量请返回/.test(practicePage), '⑤b 只读提示说清去哪改数量');

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
  // 2026-10-15 重推：收藏练习从「只练收藏的词」单按钮升级为「词数档位 + 轮转去重」，
  // 起跑入口仍在（正对照是 onDrill 接线 + 档位 chips，见 ㉓a）
  check(/FAV_ROUND_SIZES/.test(qc) && /onDrill=\{drillFavorites\}/.test(qc), '收藏可单独成组重练（词数档位 + 起跑接线）');
  check(/const drillFavorites = useCallback/.test(qc), '收藏重练回调存在');
  check(/收藏\{favWords\.length > 0 \? ` \$\{favWords\.length\}` : ''\}/.test(qc), '顶栏收藏入口带数量');
  const favPage = readFileSync(join(ROOT, 'src/pages/FavoritesPage/FavoritesPage.tsx'), 'utf8');
  check(/'all', 'vocabulary', 'word'/.test(favPage), '收藏页有「单词」过滤项（否则收藏的词只能在全部里翻）');

  // ⑧b 静默契约（2026-09-29 用户要求：快速闪卡里"不认识"和"收藏"都不要弹提示）
  //     锁住"不许再加回来"，同时用锚点断言证明不是把整块功能删掉换来的绿。
  const tfStart = qc.indexOf('const toggleFav = useCallback(');
  const tfEnd = qc.indexOf('}, [favorites, addFavorite, removeFavorite, level]);', tfStart + 1);
  const toggleFavBody = tfStart >= 0 && tfEnd > tfStart ? qc.slice(tfStart, tfEnd) : '';
  check(toggleFavBody.length > 200, `脚手架自检：抓到 toggleFav 函数体（实际 ${toggleFavBody.length} 字符，抓不到就没法判静默）`);
  check(!/toast\./.test(toggleFavBody), '收藏 / 取消收藏不弹 toast');
  check(/addFavorite\(\{/.test(toggleFavBody) && /removeFavorite\(existing\.id\)/.test(toggleFavBody),
    '正对照：收藏开关仍然真的在写数据（不是靠删功能变静默）');
  //（"不认识不弹提示"的反向断言在 ⑪ 重排那一节，与旧文案一同维护，避免两处重复）
  check(/if \(\(relearnCounts\[key\] \?\? 0\) < MAX_RELEARN\) \{[\s\S]{0,200}scheduleRelearn\(cw\);/.test(qc),
    '正对照：重排机制本身仍在（只是不再播报）');
  check(!/已收藏「|已取消收藏「/.test(qc), '文件里不再出现收藏类 toast 文案');

  /**
   * ⑧c 复习检测的评分静默（2026-09-30 用户要求：「每点击一个单词的熟练度就会提示一次」）
   *
   * 以前 `markWithQuality` 每次评分都 `toast(labels[quality])` 播报档位名，答错还额外弹一条
   * 「答错的词稍后会再出现一次」—— 一轮 30 张就是 30~60 条提示。反馈应该由界面自己给：
   * 卡片自己翻到下一张、音效已经响过；**只有里程碑才说话**（连对 5 个、整轮完成）。
   * 三条正向断言是必需的：否则"把评分函数整个删掉"也能让前两条变绿。
   */
  const mkStart = fc.indexOf('const markWithQuality = useCallback(');
  const mkEnd = fc.indexOf('}, [cw, rated, recordReview, session.relearnCounts]);', mkStart + 1);
  /** 用"声明 → deps 锚点"切片，不用定长正则：函数体以后只会变长，定长窗口会静默抓空 → 反向断言变真空通过 */
  const markBody = mkStart >= 0 && mkEnd > mkStart ? fc.slice(mkStart, mkEnd) : '';
  check(markBody.length > 200, `脚手架自检：抓到 markWithQuality 函数体（实际 ${markBody.length} 字符，抓不到就没法判静默）`);
  check(!/toast\(/.test(markBody), '复习检测：点熟练度不再逐次弹提示');
  check(!/答错的词稍后会再出现/.test(fc), '复习检测：答错那条播报也一起撤掉（与快速闪卡同口径）');
  check(!/答错的词稍后会再出现/.test(dl), '每日学习：同一条答错播报也撤掉（三个模式口径一致）');
  check(/const scheduleRelearnWord = \(word: IWordEntry\)[\s\S]{0,420}next\.splice\(at, 0, word\);/.test(dl),
    '正对照：每日学习的答错重排仍在（只是不出声）');
  check(/recordReview\(cw, quality\)/.test(markBody) && /setRatedKeys\(\(prev\) => new Set\(prev\)\.add/.test(markBody),
    '正对照：评分仍然真的在写 SM-2 与"已评"状态（不是靠删功能换静默）');
  check(/pendingRelearnRef\.current = key;/.test(markBody), '正对照：答错重排的排期仍在（只是不出声）');

  /**
   * ⑧d 练习界面零提示（2026-09-30 用户要求：「不要在练习界面有任何提示」）
   *
   * 四个练习模式文件里**剩下每一个 toast 调用点都必须逐字命中白名单**，白名单只有两类：
   *   ① 失败 / 空队列 —— 不解释就变成"点了没反应"（AGENTS.md 坑表里那条）；
   *   ② 「不再出现」的撤销 —— 撤销按钮只挂在这条提示上，撤了就是丢功能。
   * 其余（档位名播报、连对里程碑、整轮完成、进场续学、自动发音开关、收藏、到期堆积、每日目标、
   * 从生词本移除、切换练法）全部撤掉，反馈改由界面承担：卡面序号、顶部「已评 / 连对 / 今天新学」、
   * ★ 实心、按钮选中态、进度条走满。音效刻意保留（那是声音，不是弹窗）。
   */
  const ALLOW_TOAST = [
    /上次的进度已失效/,
    /已把「\$\{word\.word\}」移出学习队列/,
    /已把「\$\{card\.content\}」移出学习队列/,
    /搭配翻译失败/,
    /暂时没有可学的单词/,
    /收藏的词在词库里找不到了/,
  ];
  for (const [name, src] of [['FlashcardMode', fc], ['DailyLearningMode', dl], ['QuickCardMode', qc], ['PhraseFlashcardMode', pfm]]) {
    const lines = src.split('\n').map((l) => l.trim())
      .filter((l) => /(^|[^.\w])toast(\.\w+)?\(/.test(l) && !l.startsWith('//') && !l.startsWith('*') && !/from 'sonner'/.test(l));
    const bad = lines.filter((l) => !ALLOW_TOAST.some((re) => re.test(l)));
    check(lines.length > 0 && bad.length === 0,
      `⑧d ${name}：练习界面只剩白名单提示（失败/撤销），实测 ${lines.length} 处`, bad.join(' ⧸ ').slice(0, 160));
  }
  check(!/连对 \$\{next\} 个|连对 \$\{n\} 个|完成一整轮|接着上次继续|已开启自动发音|已收藏「|已取消收藏「|到期复习 \$\{|每日目标已设为|已从生词本移除|切换至 \$\{|重练 \$\{|开始练收藏的|今日目标已完成|已恢复 \$\{/.test(fc + '\n' + dl + '\n' + qc + '\n' + pfm),
    '⑧d 播报类文案在四个练习模式里全部消失（新增提示必须先改这条白名单）');
  check(/action: \{ label: '撤销'/.test(fc) && /action: \{ label: '撤销'/.test(dl) && /action: \{ label: '撤销'/.test(pfm),
    '⑧d 正对照：「不再出现」的撤销入口仍挂在提示上（不许靠删功能变静默）');
  check(/连对 \{combo\}/.test(fc) && /今天新学 \{state\.todayLearned\.length\}\/\{dailyQuota\}/.test(fc) && /已评/.test(fc),
    '⑧d 正对照：反馈改由界面承担（连对 Flame 数字 / 今天新学 x/y / 已评计数在位）');
  check(/连对 \{combo\}/.test(pfm) && /今天新学 \{state\.todayLearned\.length\}\/\{dailyQuota\}/.test(pfm) && /已评 \{sessionRated\}/.test(pfm),
    '⑧d 正对照：短语闪卡同样以界面反馈替代提示（连对 / 今天新学 x/y / 已评 计数在位）');

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

  /**
   * ⑭ 卡面单词 = 按词长三档字号（2026-10-01 用户口径：「单词卡片大小不一，有得太大有得太小，
   * 还有的会后面变小，都回退到之前的模样」）。
   *
   * 819a007 引入的 FitWord（canvas measureText 按容器宽缩放、nowrap 永不换行）在真机上的
   * 观感被用户否掉：同一轮里每个词一个字号、同屏对比忽大忽小，短词被容器宽拉满显得过大，
   * 长词缩到很小；且 ResizeObserver 首帧后重算，用户看到"先大后小"的跳变。
   * 回退 = 改造前原样：break-words 的 h2 + 三档字号（≤10 最大 / 11–14 中 / >14 小）。
   * data-fit-box 是无样式锚点（自动化找词面用，verification.md §3 有记载），保留。
   *
   * 2026-10-13 第 21 测重推导（真机 109 反馈「telecommunications 和 compatible 都分行」）：
   * 真机布局视口是 393 CSS（此前按 428=1283÷3 估算，错），且 MainActivity 的
   * settings.setTextZoom(120) 会把全部字号再 ×1.2 —— 实验室须以 393 + text-size-adjust:120%
   * 仿真才复现（4 词 × DL/QC 两模式共 8/8 折行、几何逐项对齐真机，见 verification.md 第 21 测）。
   * 修法：每日学习 / 快速闪卡手机(<sm)档对齐复习检测既有小档 24/30/36（FM 自 2026-10-01
   * 回退 FitWord 起即此 sm: 分档、本次未动；真机实测其 telecom 28.8px / h2W=282 / 单行 ——
   * 该参考档有真机实证），sm: 保各自桌面原档（30/36/48）——桌面像素不变，手机档对齐是
   * **统一到已验证档**（≠ 取消档位差异：「勿顺手统一」在 ≥sm 仍成立）。
   */
  check(!existsSync(join(ROOT, 'src/components/FitWord.tsx')) && !/FitWord/.test(fc + dl + qc),
    '⑭ 自适应字号组件已删除且三模式无引用（防止无人重推导就复活）');
  const tieredWord = [
    // 复习检测：已真机验证的基准档（最短档 ≤10 字母桌面就到此为止，无 sm: 变体）
    ['FlashcardMode', fc, /shown!\.word\.length > 14 \? 'text-2xl sm:text-3xl' : shown!\.word\.length > 10 \? 'text-3xl sm:text-4xl' : 'text-4xl'/],
    // 每日学习 / 快速闪卡：手机档与复习检测同组，sm: 保桌面原档
    ['DailyLearningMode', dl, /currentWord\.word\.length > 14 \? 'text-2xl sm:text-3xl' : currentWord\.word\.length > 10 \? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'/],
    ['QuickCardMode', qc, /cw\.word\.length > 14 \? 'text-2xl sm:text-3xl' : cw\.word\.length > 10 \? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl'/],
    // 正对照：短语闪卡四档本次未动（用户只报了复习/每日/快速三个模式的卡面）
    ['PhraseFlashcardMode', pfm, /cw\.content\.length > 24 \? 'text-xl sm:text-2xl' : cw\.content\.length > 14 \? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'/],
  ];
  for (const [name, src, re] of tieredWord) {
    check(re.test(src), `⑭ ${name}：单词按词长分档字号（档位字面量锁定，短词大长词小）`);
    check(/'font-black italic text-foreground tracking-tight break-words min-w-0',/.test(src),
      `⑭ ${name}：词面保留 break-words（长词可以折，不再 nowrap 硬缩）`);
  }
  /**
   * ⑭c 卡片内边距 = 词排可用宽度的唯一变量（第 21 测 393 仿真）：
   * p-8 时 QC 词排只有 293px，14 字母的 recommendation 在手机档 text-3xl（真机 36px）
   * 要 298px → 折两截；收到 p-7 后三个模式词排同为 301px，8 词矩阵全单行。
   */
  check(/<CardContent className="p-7 text-center space-y-3">/.test(qc), '⑭c 快速闪卡卡内边距 p-7（词排 301px 与复习检测/每日学习同宽）');

  /**
   * ⑭b 词面与动作按钮同一行时，按钮组必须能**整体换行**（2026-10-13 真机反馈
   * 「快速闪卡长单词会被分割为两列」）。
   *
   * 词排 = 单词 h2 + 朗读钮 + 收藏钮（同一 flex 行）。卡片 w-full，真机 393 CSS 宽的布局
   * 视口（第 19 测按 428 仿真是错的，第 21 测起改 393 + textZoom 仿真）里词排只有 ~293px
   * （报障时仍 p-8；⑭c 收到 p-7 后 301px），两个按钮固定吃 ~86px；长词被挤进 ~207px 的
   * 窄列里，break-words 从词中间折成两截。
   * 修法 = 词排 flex-wrap + 两按钮包进一个 shrink-0 组：短词并排（版式不变），长词时按钮组
   * **整组**落到下一行，词面拿回整行宽；不许逐项换行拆成「词+🔊 一行 / ⭐ 一行」的碎排。
   * 8 词矩阵（第 19 测 428×925 采的修复前后对照；第 21 测已按 393 重验）见 verification.md §5。
   */
  check(/<div data-fit-box className="flex flex-wrap items-center justify-center gap-2 max-w-full">/.test(qc),
    '⑭b 快速闪卡词排允许换行（长词时按钮组落下一行，词面拿整行宽）');
  check(/<div className="flex items-center gap-2 shrink-0">\s*<Button/.test(qc),
    '⑭b 朗读/收藏包在 shrink-0 组里整体换行（不许拆成「词+🔊 / ⭐」的碎排）');
  /**
   * ⑭b（续）2026-10-13 用户：「复习检测的也有同样的问题」—— 复习检测/每日学习/短语闪卡
   * 三个模式的词排是同构的（h2 + 单个朗读钮），快速闪卡修好后同样的折两截在它们身上仍会复现
   * （桌面 1280 实测 FM telecom 被折进第二行）。同修 = 词排加 flex-wrap + 朗读钮 shrink-0。
   */
  const wrapRows = [
    ['复习检测', fc, 'mb-2', 'violet'],
    ['每日学习', dl, 'mb-3', 'teal'],
    ['短语闪卡', pfm, 'mb-2', 'teal'],
  ];
  for (const [name, src, mb, tone] of wrapRows) {
    check(new RegExp(`<div data-fit-box className="flex flex-wrap items-center justify-center gap-3 ${mb} max-w-full">`).test(src),
      `⑭b ${name}词排允许换行（长词拿整行宽，不再被朗读钮挤折两截）`);
    check(new RegExp(`rounded-2xl bg-muted text-muted-foreground hover:text-ink-${tone} shrink-0"`).test(src),
      `⑭b ${name}朗读钮 shrink-0（换行决策时钮不被压缩）`);
  }

  /**
   * ⑮ 短语闪卡（词汇深度页第 7 个模式，2026-10-09）——「复习检测」的短语库移植。
   *
   * 用户需求：「在词汇深度界面，做一个对各短语库进行学习的闪卡学习功能，功能需要模仿
   * 复习闪卡的逻辑，实现其对应有的功能以及同样的优化体验，这样就可以不用挤在短语库那小的界面里」。
   * 本节钉四件事，缺一条就不算"逐条移植"：
   *   ① 接线：MODES 第 7 条 + TabsContent 挂载（漏了就是"两端都写了却点不到"）；
   *   ② 数据与进度：9 个短语库懒加载 + 读取层去重；进度写 use-phrase-learning，与语块页
   *      「短语复习 / 闪卡」同一份 SM-2（哪个入口学都算数）；
   *   ③ 会话机制与复习检测逐条同构（冻结顺序 / 答错延迟重排 / 120·300ms 自动跳卡 /
   *      0.18s 定长 tween / 共用自动发音键且默认开 / 断点续学 / 「不再出现」撤销出口）；
   *   ④ 有意差异只有三条（空进度也能开轮=学习入口 / 无生词本助记 / 学习时长记 'chunks'）。
   */
  const dvp = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8');
  const phraseLib = readFileSync(join(ROOT, 'src/lib/use-phrase-learning.ts'), 'utf8');
  const vhSrc = readFileSync(join(ROOT, 'src/lib/vocab-mode-hall.ts'), 'utf8');
  const hallSrc = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/VocabModeHall.tsx'), 'utf8');

  // ⑮a 接线：模式标签/分组/颜色单点在 VOCAB_MODES，页面只登记图标；大厅按分组渲染
  check(/\{ key: 'phrasecard', label: '短语闪卡',[\s\S]{0,80}group: 'review', color: '#14B8A6' \}/.test(vhSrc) &&
    /phrasecard: Layers/.test(dvp),
    '⑮a 短语闪卡登记在 VOCAB_MODES（标签/分组/颜色单点），页面只登记图标');
  check(/import PhraseFlashcardMode from '\.\/components\/PhraseFlashcardMode';/.test(dvp), '⑮a 组件被导入');
  check(/<TabsContent value="phrasecard" className="mt-0">/.test(dvp) && /<PhraseFlashcardMode level=\{selectedLevel\} \/>/.test(dvp),
    '⑮a TabsContent 挂载 + 传当前词书作默认短语库');
  check(/VOCAB_MODE_GROUPS\.filter\(\(g\) => g\.key !== 'main'\)/.test(hallSrc) &&
    /items\.map\(\(mode\) =>/.test(hallSrc) &&
    !/key !== 'phrasecard'/.test(dvp + hallSrc),
    '⑮a 首页按分组渲染全部非主线模式（短语闪卡不靠/不受排除名单影响）');

  // ⑮b 数据与进度：懒加载 + 去重 + 共享存储
  check(/loadPhrases\(bank\)\.then\(/.test(pfm), '⑮b 短语库按需懒加载（9 库共 ~7.6MB，不许全量进内存）');
  check(/setEntries\(dedupeChunks\(mapped\)\)/.test(pfm), '⑮b 读取层去重（与语块页短语库同一口径）');
  check(pfm.includes('`pbc_${bank}_${i}`'), '⑮b 映射成 IChunk 兼容 id 带库前缀（存储/复习逻辑零改动）');
  check(pfm.includes('来源词：${e.sourceWord}'), '⑮b usage 保留来源词（短语库信息不丢）');
  check(/usePhraseLearning\(entries\)/.test(pfm), '⑮b 进度走 usePhraseLearning（与语块页两个入口同一份 SM-2）');
  check(/const \{ state, dueForReview, recordReview, setSuspended, dailyQuota, setDailyQuota, phraseKey \} = usePhraseLearning\(entries\);/.test(pfm),
    '⑮b 用上 store 的全部扩展项（wrongCount/suspended/history 的行为才生效）');

  // ⑮c 会话机制：与复习检测逐条同构
  check(/const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';/.test(pfm) && /safeStorage\.getItem\(AUTO_SPEAK_KEY\) !== '0'/.test(pfm),
    '⑮c 自动发音共用词汇侧键且默认开（与其余四处同口径）');
  check(/transition=\{\{ duration: 0\.18, ease: 'easeOut' \}\}/.test(pfm),
    '⑮c 退场定长 tween 0.18（mode="wait" 下 spring 实测 ~400ms，是"下一张来得慢"的来源）');
  check(/const delay = lastQualityRef\.current >= 3 \? 120 : 300;/.test(pfm) && /setTimeout\(\(\) => advanceRef\.current\(1\), delay\)/.test(pfm),
    '⑮c 评分后 120/300ms 自动跳下一张（advanceRef 镜像避免定时器反复重置）');
  check(/setSession\(createSessionOrder\(list\.map\(\(c\) => phraseKey\(c\)\)\)\)/.test(pfm),
    '⑮c 会话顺序开始时冻结（不能直接用随评分变化的 queue 配下标）');
  check(/if \(\(session\.relearnCounts\[key\] \?\? 0\) < MAX_RELEARN\) pendingRelearnRef\.current = key;/.test(pfm)
    && /setSession\(scheduleRelearn\(session, currentIdx, pending\)\)/.test(pfm)
    && /setIdx\(applies \? currentIdx : next\)/.test(pfm),
    '⑮c 答错延迟重排：评分只记下、advance 时才插回（评分那刻同步重排会让自动跳转永远排不上）');
  check(/markWithQuality\(\[0, 2, 3, 4, 5\]\[parseInt\(e\.key, 10\) - 1\]\)/.test(pfm),
    '⑮c 键盘 1-5 映射 SM-2 五档 [0,2,3,4,5]');
  check(/const MAX_DUE = 30;/.test(pfm) && /if \(dueCards\.length < MAX_DUE\) dueCards\.push\(c\);/.test(pfm),
    '⑮c 到期封顶 30 张/轮');
  check(/\r?\n      if \(!dueSet\.has\(k\) \|\| seen\.has\(k\)\) continue;\r?\n      seen\.add\(k\);/.test(pfm),
    '⑮c 超额的到期卡也要记入 seen（否则它们会从"已学"分支再进场，本轮超过 30 张）');
  check(/const fillCount = Math\.max\(0, dailyQuota - dueCards\.length - otherCards\.length\);/.test(pfm),
    '⑮c 补新到「每日目标」开轮（学习入口；档位即本轮张数，复习检测是纯复习口径、要求先有已学）');
  check(/\}, \[wrongDrill, wrongEntries, entries, dueForReview, state\.progress, phraseKey, dailyQuota\]\);/.test(pfm),
    '⑮c 队列 memo 依赖必须含 dailyQuota（漏掉＝改档位后张数不变，得重挂载才生效）');
  check(/lastSpokenKey\.current = '';/.test(pfm) && (pfm.match(/lastSpokenKey\.current = '';/g) ?? []).length >= 3,
    '⑮c 每开一轮/续学/换库都清空朗读去重键（否则新一轮第一张不出声）');
  check(pfm.includes('`${card.content}. ${example}`'),
    '⑮c 背面自动朗读是「短语 + 例句」一次 speak（拆两次会互相打断；same 时跳过重复例句）');
  check(/toast\.success\(`已把「\$\{card\.content\}」移出学习队列`/.test(pfm)
    && /action: \{ label: '撤销', onClick: \(\) => setSuspended\(card, false\) \}/.test(pfm),
    '⑮c 「不再出现」带撤销出口（撤了就是丢功能）');
  check(/const removed = session\.order\.filter\(\(k\) => k !== key\);/.test(pfm)
    && /setIdx\(Math\.min\(currentIdx, Math\.max\(0, removed\.length - 1\)\)\);/.test(pfm)
    && /if \(pendingRelearnRef\.current === key\) pendingRelearnRef\.current = null;/.test(pfm),
    '⑮c 屏蔽后从本轮移除（下标夹紧）+ 撤销它的待重排（否则下次前进又插回）');
  check(/const saved = loadPhraseSession\(bank\);/.test(pfm)
    && /savePhraseSession\(bank, \{ order: session\.order, index: currentIdx, savedAt: Date\.now\(\) \}\)/.test(pfm),
    '⑮c 断点续学：按库存/读（顺序 + 位置）');
  check(/useEffect\(\(\) => \{ setRatedNow\(null\); \}, \[currentKey\]\);/.test(pfm)
    && /const rated = !!currentKey && ratedKeys\.has\(currentKey\);/.test(pfm),
    '⑮c 「刚评分」与「回看已评卡」两种状态分离（回看不自动跳、不出评分按钮）');
  check(/const action = decideSwipe\(\{ dx, isFlipped, rated \}\);/.test(pfm),
    '⑮c 滑动手势走同一张决策表 decideSwipe（未翻面→翻 / 未评→左右滑评分 / 已评→前后翻）');
  check(/if \(document\.querySelector\('\[role="dialog"\]'\)\) return;/.test(pfm),
    '⑮c 弹窗打开时不抢键盘（与复习检测同一条守卫）');
  check(/addStudyMinutes\(0\.2, 'chunks'\)/.test(pfm) && !/creditOnce/.test(pfm),
    '⑮c 学习时长翻面直计 0.2 分（内容域=短语，与语块闪卡同口径；详见 verify-study-credit ④）');
  check(/不再出现/.test(pfm) && /恢复全部/.test(pfm) && /suspendedInBank > 0/.test(pfm),
    '⑮c 屏蔽有出口：卡片「不再出现」+ 概览「恢复全部」（只作用于本库，与计数同口径）');
  check(/const \[savedSession, setSavedSession\] = useState<ISavedPhraseSession \| null>\(\(\) => loadPhraseSession\(bank\)\)/.test(pfm)
    && /接着上次（还剩 \{Math\.max\(0, savedSession\.order\.length - savedSession\.index\)\} 张）/.test(pfm),
    '⑮c 概览给「接着上次」续学入口（带剩余张数）');
  check(/开始学习（\$\{queue\.length\} 张卡片）/.test(pfm) && /PHRASE_LEVELS\.map\(\(lv\) => \(/.test(pfm),
    '⑮c 概览有选库 chips 与开始按钮（9 个库任选）');
  check(/h-\[72px\]/.test(pfm) && /未来 7 天复习量/.test(pfm),
    '⑮c 7 天负担图容器高度容下「数值+柱+星期」三层（勿压回 h-12）');

  // ⑮d 存储扩展：老存档可读（normalize）+ 屏蔽过滤 + 错词/新学/历史口径
  check(/function normalize\(state: Partial<IPhraseLearningState> \| null \| undefined\): IPhraseLearningState \{/.test(phraseLib)
    && (phraseLib.match(/return normalize\(/g) ?? []).length >= 4,
    '⑮d 所有读档出口都过 normalize 补 todayLearned/history（UI 直读 state.todayLearned.length，漏一个就崩）');
  check(/p\.nextReview <= now && p\.status !== 'new' && !p\.suspended/.test(phraseLib),
    '⑮d 到期队列过滤「不再出现」（屏蔽的短语不许再从到期进来）');
  check(/wrongCount: quality <= 2 \? \(existing\?\.wrongCount \|\| 0\) \+ 1 : 0/.test(phraseLib),
    '⑮d 错词口径与词汇侧一致（quality<=2 累计，答对清零）');
  check(/todayLearned: existing[\s\S]{0,60}\? prev\.todayLearned/.test(phraseLib),
    '⑮d 「今天新学」只在首次复习时计入（重复复习同一条不虚报）');
  check(/history\[day\] = \{ reviewed: cur\.reviewed \+ 1, good: cur\.good \+ \(quality >= 3 \? 1 : 0\) \};/.test(phraseLib),
    '⑮d 每日历史按天分桶（本周学习量/正确率跨天回溯）');
  check(/progress: \{ \.\.\.prev\.progress, \[key\]: \{ \.\.\.\(prev\.progress\[key\] \|\| base\), suspended \} \}/.test(phraseLib),
    '⑮d setSuspended 对没学过的短语自动补记录（"没学过也能直接屏蔽"）');
  check(/const PHRASE_SESSION_KEY_PREFIX = '__nativethink_phrase_session_';/.test(phraseLib)
    && /if \(typeof p\.index !== 'number' \|\| p\.index < 0 \|\| p\.index >= p\.order\.length\) return null;/.test(phraseLib),
    '⑮d 断点键按库分开（不覆盖单词侧 __nativethink_vocab_session_）+ 越界断点判无效');
  check(/if \(safeStorage\.getItem\(STORAGE_KEY\) === json\) return;/.test(phraseLib),
    '⑮d 一字不差就不写（掐掉下行重读→回写的云同步回声）');
  check(/useSyncDown\(\(\) => \{/.test(phraseLib), '⑮d 云同步下行后重读（否则本机拿着陈旧状态覆盖远端）');
}

// ── ⑯ 每日学习：卡片几何恒定 + 答对零等待（2026-10-13 用户：「每日学习的闪卡切换慢且卡，同时卡片太大」）──
{
  /**
   * 测量基线（428×925 无头 Chrome，verification.md §5 第 20 测）：
   * - 卡宽随词伸缩：同一轮 425/400/392/356/379px，切换瞬间 Δw 最高 ±139px（"卡"的来源之一），
   *   20 字符词时 460px 超出 428 视口并出现横向滚动条；桌面 1280 背卡宽 1200px（无上限）；
   * - 背卡无高度上限（overflowY=visible），CardContent p-10 / 正卡 min-h-[300px] 比复习检测 bulky；
   * - 答对停留 120ms 是"比快速闪卡慢"的全部差值：tNew 实测 315ms vs 195ms。
   * 修法 = MotionDiv w-full max-w-md（428 上恒 396px、桌面封 448px）+ Card 前后分支几何与
   * 复习检测逐字对齐 + 答对 0ms（不许改回任何 >0 的停留：那正是本轮用户报的"慢"）。
   */
  check(/className="w-full max-w-md"/.test(dl), '⑯ DL 卡片宽度恒定（修前 425→356 逐卡跳变、20 词 460px 溢出视口）');
  check(/'border-border bg-card min-h-\[260px\] flex flex-col justify-center'/.test(dl),
    '⑯ DL 正卡几何与复习检测对齐（min-h-[260px]，原 300 + p-10 是"卡片太大"的一半）');
  check(/'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 dark:border-indigo-500\/30 dark:from-indigo-500\/10 dark:to-violet-500\/10 max-h-\[62vh\] overflow-y-auto'/.test(dl),
    '⑯ DL 背卡有高度上限且可滚动（原无上限，桌面实测背卡宽 1200px 且不封高）');
  check(/<CardContent className="p-7 text-center">/.test(dl), '⑯ DL 卡内边距收到 p-7（与复习检测一致）');
  check(/transition=\{\{ duration: 0\.18, ease: 'easeOut' \}\}/.test(dl),
    '⑯ DL 退场定长 tween 0.18（mode="wait" 下 spring 长尾 ~400ms，与两闪卡同一条曲线）');
  const dlDwellM = dl.match(/const delay = lastQualityRef\.current >= 3 \? (\d+) : (\d+);/);
  check(!!dlDwellM, '⑯ DL 自动跳转停留时长可解析');
  check(!!dlDwellM && Number(dlDwellM[1]) === 0,
    '⑯ DL 答对零等待（与快速闪卡同速；120ms 停留即 tNew 315 vs 195 的全部差值）', dlDwellM ? `${dlDwellM[1]}ms` : '未匹配');
  check(!!dlDwellM && Number(dlDwellM[2]) <= 400, '⑯ DL 答错停留 ≤ 400ms（看反馈但不拖节奏）', dlDwellM ? `${dlDwellM[2]}ms` : '未匹配');
}

// ── ⑰ 复习一轮的「结束态」与跨词书空态指路（2026-10-14 用户三连反馈之①+②）──
{
  /**
   * 用户原话：「复习完一轮单词，没有结束功能，只能往回查看单词」「打开软件明明显示有需要
   * 复习的单词，但是点进去是空的」。
   *
   * 无头 Chrome 实测基线（dist 走 20 张全评完）：卡面序号跳回 `1/20`、出现「回看第 1 张 /
   * 已评过的卡 · 滑动 / 按 → 继续」，全程无完成页 —— 旧 `advance` 到队尾静默 `setIdx(0)`，
   * 评过的卡全成"回看态"，没有任何结束出口（短语闪卡同款，`:362-366`）。
   *
   * ② 的根因在数据口径而不是组件：角标/首页横幅走 `getGlobalDueCount`（**全词书**），
   * 复习队列按 `useWordLearning(level)` 只取**当前词书** —— 当前书没学过、到期词都在别的
   * 书时（实测：横幅 7 个到期、当前书「四六级高频」进复习检测显示"当前没有已学习的单词"）
   * 就是死路。修法 = 空态按书拆分指路 + 一步切书；模式卡给兜底提示。
   *
   * 扫描前剥注释：上面这些说明文字本身就写着 `setIdx(0)` / 关键字样，
   * 不剥的话我们自己的注释会把反向断言判红（verify-chain-verdict 的老坑）。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fcSrc = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8'));
  const pfmSrc = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/PhraseFlashcardMode.tsx'), 'utf8'));
  const dvpSrc = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8'));
  const uwlSrc = stripComments(readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8'));
  const vhSrc = stripComments(readFileSync(join(ROOT, 'src/lib/vocab-mode-hall.ts'), 'utf8'));

  // ⑰a 队尾 → 完成页（正反双向：新形态在、旧形态不许回来）
  for (const [name, src] of [['复习检测', fcSrc], ['短语闪卡', pfmSrc]]) {
    check(/if \(next === null\) \{[\s\S]{0,260}?setFinished\(true\);/.test(src),
      `⑰a ${name} 到队尾 → 完成页（setFinished(true)）`);
    check(!/if \(next === null\) \{[\s\S]{0,260}?setIdx\(0\);/.test(src),
      `⑰a ${name} 队尾分支不许再 setIdx(0)（回看态陷阱：评完只能往回翻，无结束出口）`);
  }

  // ⑰b 完成页结构与出口（与快速闪卡/每日学习的「本轮完成！」完成页同一套语言）
  for (const [name, src] of [['复习检测', fcSrc], ['短语闪卡', pfmSrc]]) {
    check(/if \(finished\) \{/.test(src) && /本轮完成！/.test(src), `⑰b ${name} 完成页在位（finished 分支 +「本轮完成！」）`);
    check(/返回概览/.test(src) && /回看本轮（\{/.test(src), `⑰b ${name} 完成页有「返回概览 / 回看本轮」两个出口`);
    check(/if \(finished\) return;/.test(src), `⑰b ${name} 完成页上键盘不参与（else 空格会把会话又搅起来）`);
    check((src.match(/setFinished\(false\)/g) ?? []).length >= 6,
      `⑰b ${name} 所有复位点都清 finished（开轮/续学/换书/返回/Esc）`,
      `实际 ${(src.match(/setFinished\(false\)/g) ?? []).length} 处`);
  }

  // ⑰c 跨词书到期口径 + 空态指路 + 模式卡兜底
  check(/export function getDueCountsByLevel\(\)/.test(uwlSrc),
    '⑰c use-word-learning 提供按书到期口径 getDueCountsByLevel（空态指路的唯一数据源）');
  check(/getDueCountsByLevel\(\)\.filter\(\(x\) => x\.level !== currentLevel && x\.level !== 'custom'\)/.test(fcSrc),
    '⑰c 空态指路排除当前书与生词本（生词本不在词书选择器里，切过去没有意义）');
  check(/其他词书还有 \$\{otherTotal\} 个到期/.test(fcSrc) && /onLevelChange\(top\.level\)/.test(fcSrc) && /去《\{topLabel\}》复习/.test(fcSrc),
    '⑰c 空态明说"其他词书还有 N 个到期"+ 一步切书按钮（去《X》复习（n 个））');
  check(/levels=\{LEVELS\} onLevelChange=\{handleSwitchBook\}/.test(dvpSrc),
    '⑰c 页面把 levels + onLevelChange 传给复习检测（复用"换书一步生效"路径）');
  check(/其他词书 \$\{dueGlobal\} 个到期/.test(vhSrc) && /buildVocabModeHall/.test(dvpSrc),
    '⑰c 模式卡兜底提示（当前书 0 到期、全站 >0 时明说；文案在单点状态层）');

  // ⑰d 换等级的状态回调必须走渲染期（effect 版有"旧书 state 写进新书键"的竞态，实测复现）
  check(/if \(stateLevel !== level\) \{/.test(uwlSrc) && /loadedFromStorageRef\.current = next;\s*\n\s*setState\(next\);\s*\n\s*\}/.test(uwlSrc),
    '⑰d 换等级状态切换在渲染期同步调整（stateLevel 闸门 + 读新档 + setState）');
  check(!/useEffect\(\(\) => \{[\s\S]{0,300}?loadState\(level\)[\s\S]{0,160}?\}, \[level, isAllLevels\]\);/.test(uwlSrc),
    '⑰d 旧的 reload effect 形态不许回来（会与新 level 的 persist 闭包竞态，写坏新书存储键）');
}

// ── ⑱ 错词重排再现的那张必须可重评（2026-10-14 用户：「复习检测学着学着就无法对下一个单词做熟悉度点击」）──
{
  /**
   * 根因：`advance` 的 applies 分支只把错词挪到 +4 位置（scheduleRelearn），没有把它从
   * `ratedKeys` 撤出 —— 再现时被判成"已评过"→ 回看态：背面**没有五档按钮**、只有
   * 「已评过的卡 · 滑动 / 按 → 继续」，手机用户就卡在"点不了熟悉度"。
   * 无头 Chrome 基线（第 1 张 apple 评「完全忘了」）：再现卡正面/背面均
   * `pastPrompt=true / hasRateBtns=false`；修法 = 落位时 `setRatedKeys(delete(pending))`。
   * 同样剥注释后扫描（上面的说明文字里就写着 setRatedKeys / ratedKeys）。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8'));
  const pfmCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/PhraseFlashcardMode.tsx'), 'utf8'));
  for (const [name, src] of [['复习检测', fcCode], ['短语闪卡', pfmCode]]) {
    check(/if \(applies\) \{[\s\S]{0,520}?setRatedKeys\(\(prev\) =>/.test(src),
      `⑱a ${name} 重排落位时从 ratedKeys 撤出该词（否则再现成"已评过"回看态，背面没有五档按钮）`);
    check(/next\.delete\(pending\)/.test(src),
      `⑱a ${name} 撤出的正是被重排的那个词（delete(pending)）`);
    check(/viewingPast && \([\s\S]{0,460}?<button[\s\S]{0,460}?onClick=\{\(\) => advance\(\)\}[\s\S]{0,460}?已评过的卡 · 继续/.test(src),
      `⑱b ${name} 回看态有**可点**的「继续」按钮（原纯 span 手机点不了 —— 点卡片只会来回翻同一张）`);
    check(!/已评过的卡 · 滑动 \/ 按 → 继续/.test(src),
      `⑱b ${name} 旧的不可点提示形态不许回来`);
  }
}

// ── ⑲ 同日已评不回队（2026-10-14 用户：「复习完还不记作复习完成，再次点击开始复习还是同样的单词」）──
{
  /**
   * 无头实测基线：整轮评完（20 词，断点 order 留档）→ 回概览（待复习 0）→ 再开一轮，
   * 前 4 词与第一轮 **4/4 全重叠**（apple/water/happy/bottle）—— "其他已学词"支不排除
   * 今天刚评过的词，复习永远"做不完"。修法 = 队列构建跳过 `lastReview ≥ 今日零点` 的词
   * （两模式同构；SM-2 本来就把它们排到明天，错词要再练走「错词重练」）；
   * 空态补「今天的复习已完成」分支（同日全评完 ≠ "没有已学习的单词"）。
   * 剥注释后扫描（本注释里就写着判据字面量）。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8'));
  const pfmCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/PhraseFlashcardMode.tsx'), 'utf8'));
  check(/!p\.suspended && p\.lastReview < todayStart\.getTime\(\) && !!findWord\(key\)/.test(fcCode),
    '⑲a 复习检测「其他已学」合格集排除同日已评的词（刚复习完的一轮不许原地再来；2026-10-14 起收进 staleOtherKeys 过滤器）');
  check(/p && !p\.suspended && p\.lastReview < todayStart\.getTime\(\)/.test(pfmCode),
    '⑲a 短语闪卡「已学未到期」支同构排除同日已评');
  check(/今天的复习已完成/.test(fcCode) && /reviewedToday > 0\s*\?/.test(fcCode),
    '⑲b 空态有「今天的复习已完成」分支（同日全评完不许谎报"没有已学习的单词"）');
}

// ── ⑳ 每日目标档位必须真实作用于复习队列总张数（2026-10-14 用户：「一次复习太多单词」「每日学习目标跟摆设一样设置的」）──
{
  /**
   * 复习检测概览的 10/20/30/50/100 档原本只改「今天新学 x/N」的显示数字：
   * 补新写死 20（quota 场景实测点 100 档按钮仍是 20 张），且 otherWords 支**不设上限**
   * —— 几百张已学词照出，档位管不住总量。修法 = 本轮**总张数 ≤ 每日目标**（Anki 式
   * 每日上限）：quotaLeft = 档位 − 生词本；到期 ≤ min(30, 余量)（超额的仍是到期、
   * 明天继续）；其他已学受余量约束；补新吃剩余。剥注释后扫描。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8'));
  check(/const quotaLeft = Math\.max\(0, dailyQuota - customEntries\.length\);/.test(fcCode),
    '⑳ 本轮预算 = 每日目标 − 生词本（档位管总量，不是只管补新）');
  check(/Math\.min\(MAX_DUE, quotaLeft\)/.test(fcCode) && /if \(left <= 0\) break;/.test(fcCode),
    '⑳ 到期支 ≤ min(30, 余量)、其他已学支受余量约束（超额的明天继续）');
  check(/\}, \[wrongDrill, wrongEntries, dueForReview, state\.progress, getNewWords, customList, dailyQuota\]\);/.test(fcCode),
    '⑳ 队列 memo 依赖含 dailyQuota（漏掉＝改档位后张数不变，得重挂载才生效）');
}

// ── ㉑ 断点 v2：已评状态随断点存取 + 有断点时「接着上次」是主按钮（2026-10-14 用户：「只要中途退出就进度清零」）──
{
  /**
   * 两处"清零"体感：① 断点只存位置不存已评状态 —— 续学回来「已评 0」、走过的卡还能重评；
   * ② 主按钮是开始复习，一点就把断点丢掉重排。修法 = 断点携带 rated/ratedCount/goodCount
   * （可选字段，老断点免迁移，loadSession 校验），续学恢复；有断点时「接着上次」升为主按钮，
   * 「重新开始」退居次位并明说丢弃断点。剥注释后扫描。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8'));
  const uwlCode = stripComments(readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8'));
  check(/rated: Array\.from\(ratedKeys\), ratedCount: sessionRated, goodCount: sessionGood/.test(fcCode),
    '㉑a 断点携带本轮已评状态与计数（只存位置 = 续学回来"已评 0"）');
  check(/setRatedKeys\(new Set\(Array\.isArray\(saved\.rated\) \? saved\.rated\.filter\(\(k\) => order\.includes\(k\)\) : \[\]\)\)/.test(fcCode)
    && /typeof saved\.ratedCount === 'number' \? saved\.ratedCount : 0/.test(fcCode),
    '㉑a 续学恢复已评状态与计数（老断点无字段 → 干净状态，向后兼容）');
  check(/p\.rated !== undefined && !Array\.isArray\(p\.rated\)/.test(uwlCode),
    '㉑a loadSession 校验 v2 字段（坏断点判无效而不是半恢复）');
  check(/savedSession && \([\s\S]{0,160}?onClick=\{resumeSession\}/.test(fcCode)
    && /接着上次（还剩 \{Math\.max\(0, savedSession\.order\.length - savedSession\.index\)\} 张）/.test(fcCode),
    '㉑b 有断点时「接着上次」是主按钮（旧版主按钮 = 开始复习，一点就丢断点重排）');
  check(/重新开始（\$\{queue\.length\} 张）/.test(fcCode),
    '㉑b 「重新开始」明示与开始复习不同（不许再伪装成普通的"开始复习"误导续学）');
  check(/title=\{isFav\(shown!\.word\) \? '取消收藏' : '收藏这个单词'\}/.test(fcCode)
    && /toggleFav\(shown!\)/.test(fcCode)
    && /type: 'word',\s*\n?\s*content: w\.word,/.test(fcCode),
    '㉑c 复习检测词排有收藏 ★（2026-10-14 用户：「复习检测无法收藏单词」——此前只有朗读钮；type=\'word\' 与每日学习/快速闪卡同源收藏页）');
  // ㉑d 收藏判重必须同时看两个 type（2026-10-15 用户：「同样单词但是收藏情况不同的列表」）：
  // 词库浏览存 'vocabulary'、学习卡存 'word' —— 只查单一 type 会让"浏览里收藏过的词"
  // 在学习卡上显示未收藏，再点一次就同词存两条（收藏页出现同词两来源的重复项）。
  const qcCode2 = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/QuickCardMode.tsx'), 'utf8'));
  const dlCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx'), 'utf8'));
  for (const [name, src] of [['复习检测', fcCode], ['快速闪卡', qcCode2], ['每日学习', dlCode]]) {
    check(/isFavorited\(word, 'word'\) \|\| isFavorited\(word, 'vocabulary'\)/.test(src)
      && /\(f\.type === 'word' \|\| f\.type === 'vocabulary'\) && f\.content === w\.word/.test(src),
      `㉑d ${name} 收藏判重同时看 'word' 与 'vocabulary' 两个 type（同词两来源不许存两条）`);
  }
  // ㉑e hook 单点 + 全部词族调用方（2026-10-15 用户：「快速闪卡有时候会无法收藏单词」）：
  // 存量双条目（旧版单一 type 判重时代产生）下点一下只删一条 → 星标看起来"点了没反应"。
  const favLib = readFileSync(join(ROOT, 'src/lib/use-favorites.ts'), 'utf8');
  const dvpCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8'));
  const gwsCode = stripComments(readFileSync(join(ROOT, 'src/components/GlobalWordSearch.tsx'), 'utf8'));
  const prCode = stripComments(readFileSync(join(ROOT, 'src/pages/ArticlePage/components/PageReader.tsx'), 'utf8'));
  check(/export function isWordFavType/.test(favLib) && /export function dedupeWordFavs/.test(favLib),
    '㉑e use-favorites 导出词族判型与去重纯函数（供守卫真跑）');
  check(/f\.type === item\.type \|\| \(isWordFavType\(item\.type\) && isWordFavType\(f\.type\)\)/.test(favLib),
    '㉑e addFavorite 词族判重（跨来源收藏不再同词存两条）');
  check(/isWordFavType\(target\.type\) && isWordFavType\(f\.type\) && f\.content === target\.content/.test(favLib),
    '㉑e removeFavorite 词族删除（存量双条目一次点按全清，星标不再"点了没反应"）');
  check(/const cleaned = dedupeWordFavs\(sanitizeFavorites\(raw\)\);/.test(favLib),
    '㉑e 载入时同词去重并回写（存量脏数据自愈，不派事件防循环；2026-10-17 起先去重前清洗形状，见 ㉔）');
  for (const [name, src] of [['词汇深度页', dvpCode], ['全局单词搜索', gwsCode], ['阅读器查词', prCode]]) {
    check(/isWordFavorited\(/.test(src),
      `㉑e ${name} 词族判重（学习卡 'word' 与词库浏览 'vocabulary' 视为同一条）`);
  }
  // ㉑f 真跑 dedupeWordFavs（提取纯函数转译执行）：双条目留新、无重复原样、非词族不误伤
  {
    const m = favLib.match(/export function isWordFavType[\s\S]*?export function dedupeWordFavs[\s\S]*?\n\}/);
    check(!!m, '㉑f 提取到 isWordFavType + dedupeWordFavs 纯函数段（转译真跑）');
    if (m) {
      const mod = { exports: {} };
      new Function('exports', 'module', ts.transpileModule(m[0], { compilerOptions: { module: 'commonjs' } }).outputText)(mod.exports, mod);
      const dedupe = mod.exports.dedupeWordFavs;
      const mk = (id, type, content, createdAt) => ({ id, type, content, meaning: '', category: '', createdAt });
      const dup = dedupe([mk('a', 'word', 'x', 100), mk('b', 'vocabulary', 'x', 200)]);
      check(dup.length === 1 && dup[0].id === 'b',
        '㉑f 真跑：同词 word+vocabulary 双条目去重、保留较新一条（旧数据自愈）');
      const clean = dedupe([mk('a', 'word', 'x', 100), mk('b', 'word', 'y', 100)]);
      check(clean.length === 2, '㉑f 真跑：不同词原样保留');
      const mixed = dedupe([mk('a', 'expression', 'x', 100), mk('b', 'word', 'x', 100)]);
      check(mixed.length === 2,
        '㉑f 真跑：非词族 type（expression）同串不误伤');
    }
  }
}

// ── ㉒ 快速闪卡专项（2026-10-15 用户：「部分单词无法自动朗读，点击却可以」「把列表按日期整理」）──
{
  /**
   * ① 自动朗读缺失：QC 原先只预热本轮前 5 张（sessionEntries.slice(0, 5)），第 6 张起
   *    按需合成 —— sherpa 按需合成的时延造成"部分单词不自动朗读，点击却有声"
   *    （点的时候已入缓存）。桌面 SpeechSynthesis 路径插桩复现不出（逐词都有日志）→
   *    安卓离线引擎专属。修法 = 镜像复习检测：读当前 + 预合成下一张。
   * ② 学习记录按本地日期分组（今天/昨天/具体日期；formatDate，禁 toISOString）。
   * 剥注释后扫描。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const qcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/QuickCardMode.tsx'), 'utf8'));
  check(/const nxt = queue\[idx \+ 1\];/.test(qcCode) && /tts\.prewarm\(nxt\.word, \{ rate: 0\.9 \}\)/.test(qcCode),
    '㉒a 快速闪卡读当前 + 预合成下一张（只预热前 5 张 = 第 6 张起按需合成，安卓上"部分不读"）');
  check(/formatDate\(new Date\(r\.at\)\)/.test(qcCode) && /今天/.test(qcCode) && /昨天/.test(qcCode),
    '㉒b 学习记录按本地日期分组（formatDate，今天/昨天/具体日期；禁 toISOString 错天）');
  check(!/toISOString/.test(qcCode), '㉒b 快速闪卡不使用 toISOString（东八区凌晨错天）');
}

// ── ㉓ 四件新事（2026-10-15 用户需求批）──
{
  /**
   * ㉓a 收藏练习分批轮转：词数档位（10/20/50/100/全部）+ 练过的下一轮不再重复。
   * ㉓b 已学单词清单：复习检测概览「词书掌握度」块可展开已学词（分页，不一次铺完）。
   * ㉓c 中译英第 8 模式：看中文拼/选英文；已学词到期优先冻结队列；对 q4/错 q1 首答写 SM-2。
   * ㉓d 统一进度口径：浏览「已记」同步 SM-2（markLearned，不计今日复习量）；掌握度统计排除屏蔽词。
   * 剥注释后扫描；轮转与判定的关键行为靠锚点切片（声明→deps）防"删功能换绿"。
   */
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const qcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/QuickCardMode.tsx'), 'utf8'));
  const qchCode = stripComments(readFileSync(join(ROOT, 'src/lib/quickcard-history.ts'), 'utf8'));
  const fcCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'), 'utf8'));
  const dvpCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8'));
  const vhCode = stripComments(readFileSync(join(ROOT, 'src/lib/vocab-mode-hall.ts'), 'utf8'));
  const c2eCode = stripComments(readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/ChineseToEnglishMode.tsx'), 'utf8'));
  const uwlCode = stripComments(readFileSync(join(ROOT, 'src/lib/use-word-learning.ts'), 'utf8'));

  // ㉓a 收藏练习轮转
  check(/const FAV_ROUND_SIZES = \[10, 20, 50, 100, 0\] as const;/.test(qcCode),
    '㉓a 收藏练习有词数档位（10/20/50/100/0=全部；0 档保留旧"一次练完"行为不削弱入口）');
  check(/words\.filter\(\(w\) => !favSeen\.includes\(w\)\)/.test(qcCode),
    '㉓a 分批只从没练过的收藏里取（favSeen 过滤 = 下一轮不重复同一批）');
  check(/saveFavSeen\(nextSeen\); setFavSeen\(nextSeen\);/.test(qcCode) && /words\.every\(\(w\) => seenSet\.has\(w\)\) \? \[\] : \[\.\.\.seenSet\]/.test(qcCode),
    '㉓a 起跑即记轮转指针 + 收藏全部练过自动清空从头再转');
  check(/export function listFavSeen/.test(qchCode) && /export function saveFavSeen/.test(qchCode) && /export function resetFavSeen/.test(qchCode),
    '㉓a 轮转指针存储三件套（quickcard-history，独立键不混留档语义）');
  check(/FAV_SEEN_KEY = '__nativethink_quickcard_fav_seen'/.test(qchCode),
    '㉓a 轮转指针独立存储键（不走 MAX_RUNS 滚动淘汰窗口）');
  check(/已轮转 \{words\.length - remaining\}\/\{words\.length\}/.test(qcCode) && /重置轮转/.test(qcCode),
    '㉓a 面板可见轮转进度与重置入口（指针不是黑箱）');

  // ㉓a' 收藏写失败必须可见（2026-10-16 用户："快速闪卡无法收藏还是存在，彻底排除"）
  //     safeStorage.setItem 配额满返回 false 而不抛错 —— persist 只写 try/catch 时写失败
  //     完全无声：星标内存里点亮、退出回来就没了，与"无法收藏"症状逐字吻合。
  const favLibCode = stripComments(readFileSync(join(ROOT, 'src/lib/use-favorites.ts'), 'utf8'));
  {
    const psStart = favLibCode.indexOf('const persist = useCallback(');
    const psEnd = favLibCode.indexOf('}, []);', psStart + 1);
    const psBody = psStart >= 0 && psEnd > psStart ? favLibCode.slice(psStart, psEnd) : '';
    check(psBody.length > 100, `㉓a' 脚手架自检：抓到 persist 函数体（实际 ${psBody.length} 字符）`);
    check(/if \(!safeStorage\.setItem\(FAVORITES_KEY, JSON\.stringify\(items\)\)\)/.test(psBody) && /warnStorageFull\(\)/.test(psBody),
      '㉓a' + "' 收藏落盘检查 setItem 返回值并在失败时喊出来（配额满不许静默丢）");
    check(/dispatchEvent\(new Event\('nativethink-favorites-changed'\)\)/.test(psBody),
      "㉓a' 正对照：收藏广播仍在（不是靠删通知换绿）");
    check(/import \{ warnStorageFull \} from '\.\/capped-cache';/.test(favLibCode),
      "㉓a' warnStorageFull 接线在场（全站 60s 去抖那条 toast）");
  }

  // ㉓b 已学单词清单
  check(/const \[showLearnedList, setShowLearnedList\]/.test(fcCode) && /已学单词清单 · \{learnedList\.length\}/.test(fcCode),
    '㉓b 复习检测概览有已学单词清单（默认折叠，点开列出）');
  check(/\.filter\(\(p\) => !p\.suspended\)/.test(fcCode) && /arr\.sort\(\(a, b\) => a\.wordKey\.localeCompare\(b\.wordKey\)\)/.test(fcCode),
    '㉓b 清单非屏蔽词按词面排序（屏蔽词有自己的出口，不混进清单）');
  check(/learnedList\.slice\(0, learnedListLimit\)/.test(fcCode) && /显示更多（还有 \{learnedList\.length - learnedListLimit\} 个）/.test(fcCode),
    '㉓b 清单分页展开（整书几千词不许一次铺进 DOM）');

  // ㉓c 中译英第 8 模式
  check(/\{ key: 'c2e', label: '中译英'/.test(vhCode) &&
    /c2e: Languages/.test(dvpCode) &&
    /<TabsContent value="c2e"[\s\S]{0,60}<ChineseToEnglishMode level=\{selectedLevel\} \/>/.test(dvpCode),
    '㉓c VOCAB_MODES 注册 c2e（页面登记图标）+ TabsContent 挂载（挂了才点得到）');
  check(/import ChineseToEnglishMode from '\.\/components\/ChineseToEnglishMode';/.test(dvpCode),
    '㉓c 组件 import 在场（正对照：不是只写了标签）');
  check(/sort\(\(a, b\) => a\.nextReview - b\.nextReview\)/.test(c2eCode) && /setQueue\(entries\)/.test(c2eCode),
    '㉓c 队列=已学词到期优先，起跑时冻结（评分不改本轮顺序）');
  check(/recordReview\(cw, ok \? 4 : 1\)/.test(c2eCode),
    '㉓c 作答写 SM-2：对 q4 / 错 q1（中译英与复习系统同进度）');
  check(/setResults\(\(prev\) => \{ const next = \[\.\.\.prev\]; next\[idx\] = ok;/.test(c2eCode) && /if \(!cw \|\| revealed\) return;/.test(c2eCode),
    '㉓c 首答为准（revealed 守卫 = 回看/重复提交不重写）');
  check(/normalize\(typed\) === normalize\(cw\.word\)/.test(c2eCode) && /(function normalize\(s: string\)|const normalize = \(s: string\))/.test(c2eCode),
    '㉓c 拼写判定走归一化（大小写不敏感、空格折叠）');
  check(/queryWords\(\{ level: level === 'all' \? undefined : level \}\)/.test(c2eCode),
    '㉓c 选择题干扰项取同词书池（跨书抽词会超出学习范围）');
  check(/vocab_c2e_session_/.test(c2eCode) && /safeStorage\.(getItem|setItem)\(SESS_KEY\)/.test(c2eCode) && /raw\.index < 0 \|\| raw\.index >= raw\.order\.length/.test(c2eCode),
    '㉓c 断点按 level 分键走 safeStorage + 下标越界作废');
  check(!/toast/.test(c2eCode), '㉓c 中译英零提示（练习界面不许弹 toast）');
  // 拼写卡不许有死路：不会 → 看答案（按答错计）照常前进；题面有手动朗读（听音辅助拼写）
  check(/不会？看答案/.test(c2eCode) && /onClick=\{\(\) => settle\(false\)\}/.test(c2eCode),
    '㉓c 拼写卡「不会？看答案」接 settle(false)（答错计 + 亮答案 + 可前进）');
  check(/听音辅助拼写/.test(c2eCode) && /tts\.speak\(cw\.word, \{ rate: 0\.9 \}\)/.test(c2eCode),
    '㉓c 题面有手动朗读（听发音；用户主动点，零提示契约不受影响）');
  check(/addStudyMinutes\(0\.2, 'vocabulary'\)/.test(c2eCode), '㉓c 每题计学习时长（vocabulary 域，与闪卡同参）');

  // ㉓d 统一进度口径
  check(/const markLearned = \(word: IWordEntry\) =>/.test(uwlCode) && /markLearned,/.test(uwlCode),
    '㉓d use-word-learning 暴露 markLearned（浏览「已记」纳入 SM-2 的单点）');
  {
    const mkStart = uwlCode.indexOf('const markLearned = (word: IWordEntry) =>');
    const mkEnd = uwlCode.indexOf('const resetProgress', mkStart + 1);
    const body = mkStart >= 0 && mkEnd > mkStart ? uwlCode.slice(mkStart, mkEnd) : '';
    check(body.length > 200, `㉓d 脚手架自检：抓到 markLearned 函数体（实际 ${body.length} 字符）`);
    check(!/todayReviewed/.test(body) && !/bumpHistory/.test(body),
      '㉓d markLearned 不计今日复习量/历史（词表点一下「已记」不是一次复习动作）');
    check(/if \(!sourceState\.progress\[key\]\)/.test(body) && /if \(prev\.progress\[key\]\) return prev;/.test(body),
      '㉓d 已有 SM-2 进度的词不动（别处学过的那份更权威）');
  }
  check(/const marking = !memorizedWords\.has\(key\);/.test(dvpCode) && /if \(e\) markLearned\(e\);/.test(dvpCode),
    '㉓d 浏览标记「已记」同步 SM-2（marking 在 updater 外算 —— updater 非同步）');
  check(/if \(p\.suspended\) \{ suspended\+\+; continue; \}/.test(fcCode),
    '㉓d 掌握度分布排除已屏蔽词（与 dueForReview 口径一致）');
}

// ── ㉔ 收藏读盘层的形状清洗（2026-10-17 真机：收藏页「开始回顾」整页白屏那批排查） ──
// 收藏是全站唯一不校验的清单加载器，而数据有两条外部来源（旧键迁移 + 云同步下行）；
// 渲染层直接 {f.content} 直出 + cleanText(f.example)，字段类型一坏就是整页崩，不是某条显示异常。
{
  const favLib = readFileSync(join(ROOT, 'src/lib/use-favorites.ts'), 'utf8');
  const m = favLib.match(/function asText[\s\S]*?export function sanitizeFavorites[\s\S]*?\n\}/);
  check(!!m, '㉔ 提取到 asText + sanitizeFavorites 纯函数段（转译真跑）');
  if (m) {
    const mod = { exports: {} };
    new Function('exports', 'module', ts.transpileModule(m[0] + '\nmodule.exports={sanitizeFavorites};',
      { compilerOptions: { module: 'commonjs' } }).outputText)(mod.exports, mod);
    const sanitize = mod.exports.sanitizeFavorites;
    const healthy = [
      { id: 'a', type: 'word', content: 'outweigh', meaning: '比…重要', category: '', createdAt: 1 },
      { id: 'b', type: 'vocabulary', content: 'stuff', meaning: '东西', example: 'Put it away.', category: 'cet4', createdAt: 2 },
      { id: 'c', type: 'legacy', content: 'abc', meaning: '老类型', category: '', createdAt: 3 },
    ];
    const kept = sanitize(healthy);
    check(kept.length === 3 && kept[1].example === 'Put it away.' && kept[2].type === 'legacy',
      '㉔ 真跑：健康条目原样保留（未知 type 也只降级标签，不许替用户丢条目）', JSON.stringify(kept[2]));
    check(sanitize([{ id: 'x', type: 'expression', content: { en: 'boom' }, meaning: '对象' }]).length === 0,
      '㉔ 真跑：content 是对象 → 丢出视图（直出会让 ErrorBoundary 接走整页）');
    check(sanitize([{ type: 'word', content: 'abc', meaning: 'm' }, null, 'oops']).length === 0,
      '㉔ 真跑：缺 id 的条目丢掉（没有 id 就删不掉、词族去重也拿不到键）');
    check(sanitize([{ id: 'y', meaning: 'm' }, { id: 'z', content: '', meaning: 'm' }]).length === 0,
      '㉔ 真跑：content 缺失或空串丢掉，条目不是对象/null 也不抛错');
    const coerced = sanitize([{ id: 'n', type: 'chunk', content: 123, meaning: true, example: ['a', 'b'], category: { x: 1 }, createdAt: '2026' }]);
    check(coerced.length === 1 && coerced[0].content === '123' && coerced[0].meaning === 'true'
      && coerced[0].example === '' && coerced[0].category === '' && coerced[0].createdAt === 2026,
      '㉔ 真跑：能收成字符串的就收（不丢用户条目），收不了的落空串', JSON.stringify(coerced[0] || null));
    check(sanitize([null, 'oops', 42]).length === 0,
      '㉔ 真跑：条目本身不是对象（null / 字符串 / 数字）只丢不抛');
    check(sanitize({ notes: [] }).length === 0 && sanitize(null).length === 0 && sanitize('x').length === 0,
      '㉔ 真跑：整份不是数组（同步下行写坏/半写）→ 空清单而不是抛错');
    check(sanitize([{ id: 'e', type: 'word', content: 'ok', example: null, meaning: undefined }]).length === 1
      && !('example' in sanitize([{ id: 'e', type: 'word', content: 'ok', example: null }])[0]),
      '㉔ 真跑：example 为 null/缺失时不凭空造键（否则健康数据也会被判定"变了"而每次挂载回写）');
    // 读盘入口必须真的走清洗，并且只在条数变化时回写
    check(/const cleaned = dedupeWordFavs\(sanitizeFavorites\(raw\)\);/.test(favLib),
      '㉔ loadFromStorage 必经 sanitizeFavorites（清洗后再词族去重）');
    check(/if \(Array\.isArray\(raw\) && cleaned\.length !== rawArr\.length\)/.test(favLib),
      '㉔ 回写判据=条数变化：字段修正不改条数，按序列化比较会每次挂载都写盘（键序被重建）');
  }
}

console.log('');console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
