# 首页 / 学习记录 / 收藏 / 备份

> 四个"围绕其它模块"的页面：`DashboardPage`（430 行 + 9 个子组件）、`ProgressPage`（1110 行 + 2 个子组件）、`FavoritesPage`（342 行），加上数据底座 `use-favorites.ts` / `backup.ts` / `use-achievements.ts`。

## 1. 首页 `/`

无模块 key（不参与 `moduleProgress`）。组成：`HeroCard` + `OverviewPanel` + `ModuleProgressCard` + `QuickStartGrid` + `DailySentenceCard` + `WeekGlanceCard` + `HistoryCalendar`，外加 2026-10-10 新增的 `ReviewDueCard`、2026-10-17 新增的 `NoteDrillCard`、2026-10-25 新增的 `TodayPatternCard`。

**视觉分层（2026-10-21）**：主行动卡 `HeroCard.tsx` 是墨面（`--ink`）上的大字号行动块；右侧四张统计卡与墨色进度卡合并成一块 `OverviewPanel.tsx`（连续天数 + 今日目标环 + 2×2 表格式明细）；`WeekGlanceCard` 从整行挪到左栏、`DailySentenceCard` 下方；`QuickStartGrid` 去掉粉彩图标块，改成 `01-11` 编号入口（hover 反白成墨面）。每日一句卡还会列最近 3 条历史（不含今天），`onShowHistory` 仍是完整历史的出口。`ProgressCard.tsx` 已删除，`RingProgress` 仍由其它页面使用。

**今日分钟必须取整显示**（2026-10-28）：`todayMinutes` 由多次 `addStudyMinutes` 累加，存储里会出现 `1.9999999999999998` 这类浮点尾数。`HeroCard.tsx:21,38` 渲染前 `Math.round`（大于 0 且不足 1 显示 `<1`），`OverviewPanel.tsx:59,87` 早就这么做；别把原始值直接印到墨面卡上（393px 实测曾显示 `1.9999999999999998 / 30 MIN`）。

**今日待复习（`ReviewDueCard.tsx`）**：横幅复用侧边栏角标同一数据源 `useGlobalDueCount`（`DashboardPage.tsx:18,51,336` 直扫 SM-2 存储，不挂完整学习状态实例）。**口径：`dueCount <= 0` 时整卡 `return null`（`ReviewDueCard.tsx:17`）**—— 没有复习义务就不渲染"已清零"占位卡；点击进 `/vocabulary`。外层行 gate 现在是三卡版 `(lastVisit || dueCount > 0 || pendingCorrections > 0)`（`DashboardPage.tsx:324`），都空时整行不占位。

**继续上次学习 = 真实断点（`src/lib/resume-overview.ts`，2026-11-01）**：这条此前只说得出**模块名**（`__nativethink_last_visit` 里只有路由 + 时间戳），点进去还要自己找回上次那本书、那个模式。现在把各模块**早就落盘的会话断点**汇成一行（`复习检测 · 四级 · 第 12/20 张`）：词汇五个模式（`vocab-page` 的 level + tab → 对应会话键）、句子拼写（`..._resume_last` + 本轮队列）、语块复习（`ids` + `index`）、母语思维三稿会话（复用 `loadPatternResume` + `resumeStepLabel`，含两天有效期）。三条口径：① **解析一律复用模块自己的读盘函数**（`parseOrderedSession` / `parseDailySession` / `loadPatternResume`），首页不另立一套 —— 否则显示的位置和真正续学的位置会漂移；② 读不到就 `detail: null`，界面**不渲染位置行**（`DashboardPage.tsx:345-349`），不拿 0 或「上次」充数，坏数据（下标越界 / 老断点缺 queue / 快照过期）一律按没断点处理；③ 能定位到模式的 `href` 带 `?tab=` 深链（`DashboardPage.tsx:337`），点一次直接落回那个模式。标签表（词书名 + 纠偏/精听两个题池名）由页面注入（`:37` `RESUME_LABELS`），`resume-overview` 因此**零数据依赖**、守卫能直接真跑。守卫 `npm run verify-dashboard-glance`（61 断言：21 项真跑 + 接线静态 + 16 条静态变异 + 3 条真跑变异）—— 其中**六个断点键在写入方与读取方各查一遍**：写入方改键名时首页只会静默退回"只写模块名"，这条就是防它。

**今日模式（`TodayPatternCard.tsx`，2026-10-25）**：独立于三张横幅行，挂在「每日一句 / 本周概览」之后。`useThinkPatterns()` 读模式进度；`stats.tracked === 0` 整卡 `return null`（没学过模式不占位）。显示到期/延迟计数、下一个到期模式、近 7 天迁移柱（`trend`，七天补零）与 `passes/attempts`，点击进 `/think`。到期为 0 但有进度时显示「今天已完成，下次到期再来」，不退场。

**表达纠偏待重考（`NoteDrillCard.tsx`，2026-10-17）**：纠偏本三处自动收集 + 收藏页回看 + 词汇页重考 + 句子拼写是一条完整链路，但**入口原本藏在词汇页九个模式的最后一屏**，用户不会每天去翻，所以首页给一条横幅。计数口径是**还没重考过的条数**（`corrNotes.filter((n) => !n.review).length`，`DashboardPage.tsx:56`）—— 与待复习卡同一种语义：考过就退场，不把已处理的常驻催用户；`pendingCount <= 0` 整卡 `return null`。点击带深链 **`/vocabulary?tab=correction`**，由词汇页一步落进该模式（`DeepVocabularyPage.tsx:946-963`：只认 `MODES` 里的 key、`setupDone`/向导未完时不强进、进去后 `setSearchParams({}, {replace:true})` 抹参数 —— 留着刷新会再抢一次焦点）。**只 `setTab` 不 `setImmersed` 是这模块的老坑**（用户仍停在模式列表），守卫把它钉成"必须走 `enterMode`"。守卫 `npm run verify-dashboard-glance`（61 断言，静态变异 16 条 + 真跑变异 3 条）。

**本周学习概览（`WeekGlanceCard.tsx`）**：`calendar`（`__nativethink_calendar`，`useLearningStats` 直接暴露）取近 7 个自然日分钟画柱状 + 周合计/打卡天数/达标天数，点击进 `/progress`（`:405` 接线）。**日期一律 `formatDate` 循环生成再按字符串查表（`:26-29`）**—— 不能 `slice(-7)` 取数组尾：calendar 只在跨出 31 天窗口后才 push 新条目，跨天当天没学习时尾部是昨天，柱状会整体错位一天。柱状容器固定高度（当前 `h-20`，`:65`），标题/柱/星期三层不互压；守卫接受任意 `h-*` 固定高度，但不许省。`npm run verify-dashboard-glance` 共 61 断言 / 16 条静态变异 + 3 条真跑变异。

**每日一句（daily chunk）**：

| key | 位置 | 内容 |
|-----|------|------|
| `__nativethink_daily_chunk` | `:66` 读 / `:76` 写 | `{date, chunk}`，按本地日期换 |
| `__nativethink_daily_history` | `:100` 读 / `:91`、`:138` 写 | 生成过的语块，`id: ai_<ts>` |
| `__nativethink_last_visit` | `:249` | 上次访问（回访问候/断点提示）。**「继续上次学习」的 labels 表（`DashboardPage.tsx:277-289`）是"路径 → 文案"的穷举映射，不在新增页面六件套里** —— 每上一个新路由要补一行，漏了该页访问后续学条静默不出现（`/sentences` 真实漏过，2026-10-10 补上，守卫 `verify-dashboard-glance` ① 钉住）。2026-11-01 起这条只决定**去哪个模块**，位置由 `resume-overview.ts` 现读各模块自己的会话键（词汇 `vocab-page` + 五个模式断点键 / 拼写 `..._resume_last` + 队列 / 语块 `..._chunk_review_session` / 思维 `..._think_session_resume`） |
| `__nativethink_achievements` | `use-achievements.ts:16,29,49` | 成就解锁列表（判定入口 `useAchievementCheck`，挂在 `Layout.tsx:90`） |

AI 生成：`aiChat`（`:154`），system 要求**只返回一个 JSON 对象**（`{content, meaning, example, exampleZh, category, difficulty}`）。

**进度环**：`RingProgress.tsx:15` `const safeValue = Number.isFinite(value) ? value : 0;` —— 非法值回退 0，这就是坑表里「进度环 NaN」的兜底位置。

## 2. 学习记录 `/progress`

图表 + 各模块分项重置 + 导出/恢复。

- **模块占比图的单一来源是 `src/lib/progress-page.ts`**（2026-10-31）：`MODULE_COLORS` / `MODULE_NAMES` 按 key 取色；`buildModuleShares()` 先过滤 0/负数/NaN，再用**最大余数法**把舍入补到余数最大的项上，保证非空项相加恰好 100。`ProgressCharts.tsx` 只消费 `{name, value: percent, color}`，tooltip 的 `${value}%` 才是真份额 —— 旧实现把 `moduleProgress` 原始分直接塞给 Recharts，三个模块各 50 分时会显示三个 50%，实际份额各 33%。缺 key 时回落 key 名 + `#94A3B8`，不丢数据。
- 饼图没有进度时显示空态（`data-chart-empty="pie"`）：「还没有模块进度 / 去任意模块学几分钟 / 回首页开始学习」。两张柱/线图的网格线改用 `var(--border)`（旧 `hsl(215 28% 20%)` 在浅色模式下是深灰线），卡片圆角回 24px。图表模块仍懒加载（recharts ~400KB）。
- **思维迁移趋势卡**（2026-11-01）：`TransferTrendCard.tsx` 只在「学习统计」tab 渲染，数据**只从 `useThinkPatterns()` 的已清洗 `dailyStats` 来**（`TransferTrendCard.tsx:31,34`），不自己读 storage —— 坏行（缺校准字段等）在 store 读盘边界就被丢掉，卡片上的数字与 `/think` 同源。窗口 14 天（`:28`），比 `/think` 的 7 天窗更长；两条线分别是「迁移尝试 / 迁移通过」，顶部三个胶囊是**真实汇总**：通过率、有尝试的天数、校准命中（`summarizeTransferTrend`，`progress-page.ts:111`）。一次都没练时**不画全 0 假折线**，只给 `data-chart-empty="transfer"` 空态与 `/think` 入口（`:77`）；x 轴标签 `月/日` 由 `formatTransferTrendLabel`（`progress-page.ts:97`）生成，末尾始终包含今天。挂载点在 `ProgressCharts.tsx:298`。
- 重置是分类型的：学习统计 `:111`、句子拼写 `:119`、阅读 `:124-143`、词汇 `:174`、按词书 `:200`、短语库 `:208`、全部 `:277`。多数提示带「刷新页面后生效」—— 因为这些模块的 hook 不在本页，内存态还在（见 `cloud-sync.md` 的陈旧内存态问题）。
- **窄屏分类条**（2026-10-28）：`ProgressPage.tsx` 在 `<sm` 隐藏四个 tab 的图标（`hidden sm:inline`）并给 `TabsList` 加 `max-w-full overflow-x-auto`。393px + 120% 字体下四个标签必须完整可见；退回原先的 `w-fit` 单行会把「成就徽章」裁出视口。
- **日历不再能翻到未来**（2026-10-31）：`isCurrentMonth` / `canGoToNextMonth` 纯函数在 `progress-page.ts`；本月时下个月按钮禁用（`disabled={!canNextMonth}`），离开本月后出现「回到本月」；`nextMonth` 自己也有一道闸门，防键盘/程序触发绕过按钮态。
- **成就已解锁排前**（2026-10-31）：`sortAchievements(definitions, unlocked ids)` 把已解锁放前、组内保持定义表原顺序；不再让解锁的和锁定的混排。未解锁卡仍有 🔒 与灰度样式。
- **成就区：进度提示 + 真实计数（2026-11-01）**，三件事一起修的：
  ① **解锁判定此前没有调用点** —— `checkAndUnlock` 只被一个同样没人引用的 `use-learning-with-achievements.ts` 调，成就页永远是一排 🔒。现在 `useAchievementCheck()`（`use-achievements.ts:113-127`）挂在 `Layout.tsx:90`，学习时长或真实计数一变就重判（两个 `loaded` 门都要过，否则首屏拿空值判一轮），那个死 hook 已删。
  ② **两条计数成就在拿进度分当次数** —— `moduleProgress.conversation` 是「分钟 × 0.5、上限 100」的分值，不是对话次数，于是「完成 10 次 AI 对话」实际是「对话练够 20 分进度分」。现在 `src/lib/achievement-sources.ts` 直接数 `__nativethink_conversation_history` / `__nativethink_shadowing_completed` 两个数组的条目数（一条 = 一次对话 / 一句跟读），坏数据一律 0 不猜。
  ③ **锁定卡说清还差多少** —— 定义与阈值搬进纯模块 `src/lib/achievements-data.ts`：每条成就同时给 `achieved(s)` 与 `progressOf(s)`，守卫拿同一组夹具比对「进度到没到 ⟺ 判没判解锁」（84 组），所以界面显示的阈值不可能和真正解锁用的阈值漂移。`formatAchievementGap` 到目标返回 null（不写「还差 0 天」），量词（天/分钟/次/句）必须出现在描述里。`goal_hit` 另修一处白送：旧写法 `todayMinutes >= dailyGoalMinutes` 在**每日目标关掉（0）+ 当天 0 分钟**时恒真，新用户第一次记账就白拿一个成就，现在要求目标 > 0。渲染在 `ProgressPage.tsx:962`（`data-achievement-progress` + 1px 细条 + 「还差 4 天 · 3/7 天」），给不出真实进度的成就才退回 🔒。
- **收藏本 tab 只留总览**（2026-10-31）：类型计数 + 最近 3 条 + 「去收藏页管理」；完整列表、搜索、类型筛选、12 条增量与「开始回顾」只在 `/favorites`。`data-favorites-summary` / `data-favorites-entry="manage"` 是稳定钩子。入口没有删——只是不再在 `/progress` 维护第二套完整收藏界面。
- **重置学习统计不再虚报成功**（2026-10-29）：`use-learning-stats` 的 `resetAll()` 现在返回 stats/calendar 两次真实写入的与；`ProgressPage.tsx:112-119` 只在两者都成功时提示「学习统计已重置」，否则提示检查可用空间。「重置全部」同样按 `statsOk` 分流（`:251-287`）。核心进度写入统一走 `persistText`，守卫 `verify-vocab-caches` ⑧。

## 3. 收藏 `/favorites`

`use-favorites.ts`：

```
FAVORITES_KEY   = __nativethink_favorites        （safeStorage，会同步）
LEGACY_KEY      = __nativethink_favorites_v2     （裸 localStorage，读一次即删 :21,26）
```

- 类型联合 9 个：`chunk | expression | vocabulary | think | shadowing | word | article | writing_prompt | spelling`（`:10`）。
- **去重口径 = `content + type` 相同即拒**（`:77`）。所以写作题收藏的是 `title`、句子学习收藏的是 `item.en`、句型收藏的是 `'模式:' + id`、造句收藏的是用户自己写的原文 —— **同一句英文在不同模块会产生不同条目**（`type` 不同），而 `type` 相同时靠 `content` 判重。
- 跨实例广播 `nativethink-favorites-changed`（`:60,70`），并且它**是三个订阅 `nativethink-sync-down` 的 hook 之一**（`:53`）。
- **读盘边界做形状清洗（2026-10-17）**：`sanitizeFavorites(raw)`（`use-favorites.ts:73`）先把每条收成合法形状 —— 缺 `id`/缺 `content` 的条目丢出视图、`content` 是对象就整条丢（直出会让 React 抛错、ErrorBoundary 接走**整页**）、数字/布尔收成字符串（**不丢用户的条目**）、`example` 为 null/缺失时不凭空造键。为什么必须有：收藏是全站唯一不校验的清单加载器，而它有**两条外部来源**（`__nativethink_favorites_v2` 旧键迁移 + 云同步下行），渲染层却是 `{f.content}` 直出 + `cleanText(f.example)`（对非字符串直接 `.replace`）。回写判据刻意用**条数变化**而不是序列化比较 —— 清洗会重建对象、键序变了，按比较结果写就会**每次挂载都落盘**。守卫 `verify-vocab-cards` ㉔ 真跑（11 条，变异 5 条逐条验红）。
**收藏列表（2026-10-30）**：搜索收藏内容/释义/例句/分类；类型 chips 带计数（全部/单词/语块/表达…）；默认 12 条，按 12 条增量加载、可收起；筛选状态存 `favorites-filter`（`usePageMemory`），空结果仍保留搜索与类型入口并可清除。卡片带 `data-favorite-id` 稳定钩子。`verify-list-scaling` 27 条断言里同时钉住「`/progress` 不再维护第二套完整收藏列表」。

- **收藏回顾（`FavoriteReviewMode`）现在只有一个宿主**：`/favorites` 的「开始回顾」（`FavoritesPage.tsx`）。学习记录页 2026-10-31 起只留总览，不再渲染 `FavoriteReviewMode`；因此 `LazyFramerProvider` 只需要在收藏页包一层。该组件内部走 `useFramerMotion()`，旧实现在缺 provider 时**直接 throw**（2026-10-17 真机收藏页裸渲染），现在 hook 缺 provider 时退化成无动画 + 一次性 `console.warn`（`lazy-framer-motion.tsx`），守卫 `verify-overlay-fit` ⑦ 已收敛为**唯一宿主**。
- `clearAll()` 是一次 `persist([])`，注释写明原因：「循环调 `removeFavorite` 会因陈旧闭包只删掉最后一条（ProgressPage 重置踩过）」（`:96-99`）。`/progress` 的重置仍走 `clearAll()`。
- **空态出入口（2026-10-29）**：`FavoritesPage.tsx:241-256` 的 `EmptyState` 增加「去词汇学习」按钮（`navigate('/vocabulary')`），底部提示去掉 `/60` 透明度；393px 实测按钮 134×42、bottom 482 在首屏内。空态不再是只有说明、没有下一步的终点。


### 表达纠偏本（2026-10-16 新增，`src/lib/correction-notes.ts`）

键 `__nativethink_correction_notes`（上限 200，**appendCapped 只拒绝新增、绝不裁剪** —— 用户练习产物不可重算）。AI 判定"你说得不地道"的表达自动收集，三个完成点各喂各的 Markdown 表格：思维检测 detector（`Chinglish Expression | Natural English | Notes`）、写作批改（`Original | Correction | Explanation`，**错=对的噪声行跳过**）、对话分析（`我的表达 | 中文翻译 | 更地道的说法 | 原因分析` 四列，中文进 `chineseHint`）。共用纯函数 `parseMarkdownTables`（表头/分隔行不进数据、无表返空），守卫 `verify-correction-notes`(89) 转译真跑三源样本 + **store 整段真跑**（去重/记账/删除/填满上限只拒不裁/落盘失败可见）+ **错点归纳十类规则真跑**。收藏页顶部区块回看：默认 6 条折叠 + 来源标签 + 错点类别徽标 + 逐条删除（误判有出口）；收集路径零 toast。云同步/备份按 `__nativethink_` 前缀整片覆盖，新键零成本继承。写盘失败必须可见（`safeStorage` 配额满返回 false 不抛错，教训见 vocabulary.md 收藏一节）。

**二期（2026-10-16 已做）**：条目变成主动提取题 —— 词汇页**第 9 模式「纠偏重考」**（`CorrectionDrillMode.tsx`，四选一，题干用 `chineseHint`、答案用 `right`、干扰项取**整本**其它条目的 `right`）。条目多一个可选 `review: { lastAt, correct, wrong }`，`recordCorrectionReview` 记账、`orderForDrill` 按「没考过 → 最久没练 → 错得多」排队；**不写 SM-2**（句子不是词书词条），细节与行号见 [词汇深度](./vocabulary.md) 的「纠偏重考」一节。

**区块必须两个分支都渲染（2026-10-17 无头实测抓到并修掉）**：收藏页在 `favorites.length === 0` 时走「收藏本是空的」早退分支，而纠偏区块原先只写在浏览视图里 —— **一条收藏都没有的账号打开收藏页，纠偏本完全没有入口**（同一份夹具在词汇页能看到「3 条待纠偏」，在收藏页却什么都不渲染）。现在区块提成 `correctionBlock`（`FavoritesPage.tsx:114`），空态与浏览态各渲染一次（`:244`、`:287`）；守卫 `verify-correction-notes` ⑦ 钉「≥2 处 `{correctionBlock}`」，变异 M9（撤掉空态那处）验红。

**三期（2026-10-17）＝产出侧出口**：每条右侧的键盘钮把 `right` 送进**句子拼写**的 `correction` 桶（`sendToSpelling` `FavoritesPage.tsx:66` + 按钮 `:173`），到拼写页词库下拉选「纠偏表达」就能逐词拼自己那句地道说法（形状、难度分档与三条硬约束见 [句子拼写](./spelling.md) §2.1、注意事项 15）。四选一证明"认得出"，拼出来才算"写得出"。

**四期（2026-10-17）＝错点归纳**：一条一条重认看不出"我到底老犯哪一类中式思维"，于是把 AI 写的原因说明归进十类（`classifyCorrection` / `summarizeCorrections`，`correction-notes.ts:250-268`；类别名与建议 `:205-230`）。收藏页区块头部是一行类别 chips（`全部 5 · 词性混用 1 · 单复数 1 …`，只在类别 ≥2 时出现 —— 一类没什么好筛的），点某类**只列这一类**（`shownNotes` `FavoritesPage.tsx:107`，折叠计数同源，不另算整本）并直接给一句针对性建议；每条右侧多一枚类别徽标（`:165`）。同一套判据在词汇页重考前限定题池（「只重考这一类」），答完当卡与完成页也都按类回话 —— 见 vocabulary.md「错点归纳与按类重考」。**两条口径是统计的意义所在**：规则**有序、首个命中定型**；证据**先看说明列**，说明为空才退中文提示列（中文提示里出现"昨天/已经/完成"是句子内容，不是错误原因，当主证据会把好句子误判成时态错）。守卫 ⑨ 十类各一条样本 + 这两条口径 + 「计数之和 = 条目数」，变异 M1-M5 验红；认不出的落 `other`，**卡面上连标签都不贴**（错的分类比没分类更误导）。

## 4. 备份与恢复（`src/lib/backup.ts`）

`IBackupFile = { app:'NativeThink', version:2, exportedAt, data, idb?, importedBooks? }`，旧 v2 文件没有 `importedBooks` 也可恢复。

- `exportBackup()`（`backup.ts:17`）：只导出当前 safeStorage 前缀下的键；导入书正文与元数据单独放 `importedBooks`。原书不可重算，读取失败就拒绝导出，不得悄悄省略；40 Mi 字符预算只约束可重算的译文缓存，超限或读取失败标 `idbSkipped`。
- `importBackup()`（`backup.ts:63`）：写入前校验 app/version/data/idb 与全部导入书形状；localStorage 返回 false 不计成功。原书按 id 覆盖同一本，保留其它本地书（`imported-books.ts:137`）；读取现有书库失败时禁止覆盖。译文只允许 `booktrans-` 键，逐条等待事务提交。
- 返回 `restored/failed`、`restoredBooks/failedBooks`、`restoredIdb/failedIdb` 三组真实计数。UI（`ProgressPage.tsx:293`）互斥导出/恢复，原书数量明确显示；拿到恢复结果后先调用统一的 `emitSyncDown()`（`:333-335`），通知已挂载 hook 重读并沿用订阅者的缓存作废逻辑，避免陈旧收藏下一次写回覆盖刚恢复的条目。部分失败保留报告、不自动刷新，可重新选同一文件重试；完整成功也先通知，再报告并刷新（`:337-344`）。
- 页面明确说明备份不含视频精听媒体及字幕，恢复覆盖同键进度，建议先导出当前数据。并非全部设备资产都在这个 JSON 中。
- **单一实现（2026-10-31）**：导出/恢复搬进 `src/lib/use-backup-actions.ts`，`ProgressPage` 顶部按钮与 `SettingsPage` 的「学习数据」区共用 `useBackupActions()`；隐藏 file input 用共享的 `BackupFileInput`。导出成功后写 `__nativethink_last_backup_at`，设置页显示「上次备份」，失败不会更新该时间。设置页另显示 `measureLocalStorage` 的前缀内条目/字节与 `navigator.storage.estimate()` 估算（不支持时显示「—」）。「管理学习记录」跳 `/progress?reset=1`，记录页挂载时打开现有重置弹窗并把参数抹掉（刷新/返回不重复弹）。

## 5. 注意事项

1. ~~**首页的 AI 生成把「服务不可用」报成「格式异常」**，而且走禁用的贪婪正则~~（**已修 2026-09-30**）：现在先判 `!result.trim()` 给「AI 服务暂不可用」，解析走 `extractJson`。顺带把 `category` / `difficulty` 夹到 `IChunk` 的取值域 —— 原先 `parsed.category || 'daily'` 会把模型随口返回的陌生值原样存进每日一句与历史，取色/标签处按联合类型查表会拿到 undefined。守卫：`npm run verify:ai-parse`（全仓 30 个解析点，带元判据固件）。
2. **`MODULES` / `MODULE_COLORS` / `MODULE_NAMES` / `MODULE_PROGRESS_KEYS` 四份清单要靠人对齐**，其中 `MODULE_PROGRESS_KEYS`（`use-learning-stats.ts:70-80`）是白名单投影，漏了它新模块的进度会被 `mergeStats` **静默丢弃**。详见 `shell-and-navigation.md` §4。
3. **重置类操作分模块、且大多要刷新才生效**。加新重置项时照 `handleResetReading` 的做法：先按 `localStorage` 键名扫一遍（`:128-133`，注意它匹配的是**含前缀的完整键名**，用 `k.includes(...)` / `k.endsWith(...)`），再单独处理 IndexedDB。
4. ~~**【已确认缺陷】备份从来不含整书翻译缓存**~~ → **【已修，2026-09-30】** 留档备查：`exportBackup()` 原先这样找章节：

   ```
   for (const k of Object.keys(data)) {            // data = localStorage 里带前缀的应用键
     if (k.startsWith('booktrans-') && k.endsWith('-index')) manifestKeys.push(k);
   }
   ```

   `booktrans-*` **只存在于 IndexedDB**，所以 `manifestKeys` 恒空 → `idb` 恒 `undefined`、`idbCount` 恒 0，`idb.ts` 也没有枚举键的 API（只有 `idbGet/idbSet/idbDelete/idbHas/idbClear`）。

   现在的形态：`book-translation.ts` 新增 `dumpBookTranslationCache(bookId, maxBytes)`（**键格式知识留在拥有它的模块里**，按 manifest 登记的章节导出，含清单键本身）；`backup.ts` 用 `BOOK_META` + `loadImportedBooks()` 拿到随包 22 本与用户导入书的 id，逐本导出，累计到 `IDB_LIMIT_BYTES` 就停并如实标 `idbSkipped`。
   **守卫：`npm run verify:backup-idb`（106 断言，18 组变异）** —— 真跑译文导出、IDB 提交、导入书往返与共享 hook 的恢复 callback，另钉两页挂载、LAST_BACKUP 时间戳、本地占用统计与 reset 深链。书库失败夹具保留全 `abort`，另用 `readonly` 成功 / `readwrite` abort（`verify-backup-idb.mjs:192-208,305-313`）明确断言写入已尝试、未提交且 `failedBooks=1`；否则失败停在 `loadImportedBooks`，根本测不到 `persist`。页面判据（`:328-358`）钉恢复结束→通知重读→报告的顺序，部分失败不刷新且保留报告，完整成功再刷新。新增 M13–M18（`:416-430`）分别检出漏通知、仅成功通知、提前通知、延后通知、清空失败报告、吞掉 `persist` 错误；每组均有基线真与变异假两条断言。
5. **`importBackup` 会覆盖同键进度**，拿旧备份恢复仍可能让进度回退；页面已明示。导入书按 id 合并而非整库替换，坏格式在任何写入前拒绝，存储错误则如实报告部分恢复，不声称跨 localStorage/IDB 原子回滚。
6. **收藏的判重是 `content + type`**，所以想给同一句英文做"跨模块统一收藏"需要显式设计，不是把 `type` 改一改就能合并 —— 历史数据已经按 type 分开了。
7. **成就的读盘与判定分两处**：`use-achievements.ts` 订阅 `nativethink-sync-down`（下行后重读解锁列表），而**判定**由 `Layout.tsx:90` 的 `useAchievementCheck()` 触发 —— 二者都在这一个文件里（`use-achievements.ts:29,49,113-127`）。2026-11-01 之前它是"订阅了但没人判定"，成就页永远一排 🔒；守卫 `verify-progress-page` 的 M20 专门盯"外壳不再挂判定"这种回退。
