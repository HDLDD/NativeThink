# 词汇深度（`/vocabulary`）

> 代码：`src/pages/DeepVocabularyPage/`（页面 1 个 + `components/` 6 个，约 8,700 行）+ `src/lib/` 里 6 个支撑模块
> 数据来自：[词库数据层](./wordbank-data.md) · 朗读见 [朗读引擎](./tts.md) · 守卫：`npm run verify:vocab-cards`（390 断言）
> 最后校准：2026-10-13

## 这个模块是什么

背单词的主场，七种学习方式：前六个共用一套**单词**进度与 SM-2 状态；`phrasecard` 用**短语侧独立的一套**（`use-phrase-learning`，与语块页「短语复习 / 闪卡」共享 —— 哪个入口学都算同一份）：

| 模式 key | 名称 | 组件 | 干什么 |
|---|---|---|---|
| `daily` | 每日学习 | `components/DailyLearningMode.tsx` | 按每日计划学新词，内含**六小题型**（见下） |
| `quickcard` | 快速闪卡 | `components/QuickCardMode.tsx` | 只看词形，认识/不认识两键过卡，可批量留档 |
| `flashcard` | 复习检测 | `components/FlashcardMode.tsx` | SM-2 五档评分复习到期待巩固的词；滑动只翻面/前后导航，**不做滑评分**（见注意事项 18） |
| `phrasecard` | 短语闪卡 | `components/PhraseFlashcardMode.tsx` | 九个考试短语库的 SM-2 闪卡（逐条移植复习检测的会话逻辑，进度走短语侧存储，见「短语闪卡」一节） |
| `browse` | 词库浏览 | 内联在 `DeepVocabularyPage.tsx:1168-1740` | 筛选/搜索/翻页浏览整本书 |
| `collocations` | 搭配学习 | `components/CollocationsTab.tsx` | 高频搭配与短语 |
| `vocabtest` | 词汇量测试 | `components/VocabSizeTest.tsx` | 1 分钟估算词汇量，含近 10 次趋势 |

模式清单定义在 `DeepVocabularyPage.tsx:82-90`。

## 入口与状态机（改这里最容易出事）

页面有**三个正交的开关**，别把它们混成一个：

- `setupDone`（`:405-407`，键 `__nativethink_vocab_setup_done`）—— 是否完成过首启设置。
- `showWizard`（`:410`）—— 向导遮罩是否显示。首次自动 `true`。
- `immersed`（`:915`）—— 是否已进入某个模式。**模式内容写在 `{!showWizard && immersed && dataReady && <Tabs/>}`（`:1079`）里**，只改 `tab` 不改 `immersed` 的话，用户会"选完了却停在列表上"。反向同理：**模式卡列表在 `{!immersed && !showWizard && …}`（`:999`）里** —— 向导打开时列表整块让位，否则向导被渲染在七张模式卡下面（真机 393×851 上从 y≈809 才开始，视口内只剩 42px，看起来就是"点了没反应"）。

因此有两条完成路径，走的是两套代码：

| 路径 | 函数 | 行为 |
|---|---|---|
| 首次设置（三步：词书 → 方式 → 开始） | `handleWizardComplete` `:469-488` | 必须 `handleTabChange(mode)` + `setImmersed(true)`，选完直接落进该模式 |
| 换书（已设过的人） | `handleSwitchBook` `:497-502` | **点一本就切**，学习方式/每日量/复习模式全部不动，也**刻意不清**该书今日配额 |
| 继续上次 | `handleWizardContinue` `:504-514` | 同首次：直接进上次的模式 |

预载门在 `:428-445`：`!setupDone` 时**一本都不预载**（否则新人还没选书就要下载 11 本 ≈41.6MB）；预载失败走 `catch + finally` 放开 `dataReady`，不会把人卡在"加载中"。

## 每日学习的六小题型

`DailyLearningMode.tsx:27` 定义 `ReviewMode`，选择器在 `:798-806,1038-1063`，会话队列（到期优先 + 补新词）在 `startSession:357-418`：

闪卡 `:1188-1336`（评分 `handleRate:570`）· 选择题 `:1338-1403`（干扰项同词性优先 `generateChoiceOptions:494-508`）· 拼写 `:1405-1525` · 听写 `:1527-1649` · 配对 `:1651-1734`（4 词对对碰 `generateMatchPairs:510`）· 填空 `:1736-1850`（例句挖空 `getFillBlankSentence:529`）。

## SM-2 与"答错重排"

算法在 `src/lib/use-word-learning.ts` 的 `sm2Update:184-220`：

- 评分 **0 / 2 / 3 / 4 / 5**（键盘 1-5 映射见 `FlashcardMode.tsx:518`、`DailyLearningMode.tsx:921`）。
- `quality ≥ 3`：rep0 → 1 天，rep1 → 3 天，之后 `interval × EF`；`< 3` 重置 `rep=0, interval=1`。
- EF 初始 2.5、下限 1.3（`IWordProgress:27-42`）；`rep ≥ 5` 记为已掌握（`:213`）。
- 到期口径 `:287-292`，**排除 `suspended`（"不再出现"）**。
- `wrongCount` 在 `quality ≤ 2` 时累加、答对清零（`:354-356`），驱动复习检测的"错词重练"入口。

答错重排：`RELEARN_GAP = 4`、`MAX_RELEARN = 2`（`src/lib/vocab-session.ts:14-16`），插入前先移除旧位置、超出队尾不回绕（`:37-53`）。

> ⚠️ **重排有三份平行实现**：`vocab-session.ts`（复习检测用）、`DailyLearningMode.tsx:546-557`（自写 splice，**不去旧位置**）、`QuickCardMode.tsx:388-404`（queue 与 results 同步 splice）。改一处参数**不会**同步另两处。

### 复习检测的换卡节奏（2026-09-30 提速，别把值调回去）

用户报「闪卡模式切换下一张等待时间长」。无头 Chrome 按帧实测（393×851）点完评分到**下一张词进 DOM**：

| 路径 | 旧 | 现 |
|---|---|---|
| 复习检测（答对） | 1122ms | **322-335ms** |
| 复习检测（答错） | 卡死不动（见下） | 489-505ms |
| 快速闪卡 | ~200ms | 不变 |

三个来源叠加（`FlashcardMode.tsx`）：① 评分后停留 550/900ms；② `advance` 里"先翻回正面、`setTimeout(…,150)` 后再换下标"的干等；③ `AnimatePresence mode="wait"` 串行等退场 —— spring 要衰减到**亚像素**才算完，`spring(260/24)` 尾巴就有 ≈400ms。现在：停留 FM **120/300**（`FlashcardMode.tsx:438`）、DL 答对 **0** / 答错 300（`DailyLearningMode.tsx:769`）+ 换卡**一次批量**（去掉 150ms，`FlashcardMode.tsx:403-421`）+ 定长 **tween 0.18s**（`FlashcardMode.tsx:956`、`DailyLearningMode.tsx:1201`）。守卫按**数值**锁（答对 < 答错、答错 ≤ 400ms），不锁字面量。

### 答错重排必须"延后到前进"（`pendingRelearnRef`）

`FlashcardMode.tsx:266` 的 ref：评分时**只记 key**，`advance` 时才 `scheduleRelearn`（`:409`）。原因：`cw`/`currentKey` 都取自 `session.order[currentIdx]`，若在评分那刻同步重排，该位置当场被换成下一张 → `currentKey` 变化 → `justRated`（`ratedNow === currentKey`）立即为 false → **自动跳转定时器永远排不上**，屏幕还直接换成下一个词的背面（评分按钮健在）。真机实测现象就是「点完全忘了卡死在本张」。延后之后评分那一刻 session 不动，"刚评分"成立 → 300ms 自动前进，重排词隔 4 张如约再现（CDP 实测：`trip → … → trip` 第 5 张，与 `RELEARN_GAP=4` 吻合）。

**回看态（浏览回看）的出口**：翻回已评过的卡 → 无评分按钮，但有**可点的「已评过的卡 · 继续」按钮**（2026-10-14 加：原为纯 span 提示，手机点不了 —— 点卡片只会来回翻同一张，用户报「只要进入了回看单词的功能就会卡住，进入一个单词循环」；`FlashcardMode.tsx:1225-1240`，短语闪卡同构 `:982-997`）+ 滑动 / 键盘 → 照常可用（rated 即导航，`vocab-swipe.ts:42`；2026-10-13 起复习检测另传 `allowRate:false`，见注意事项 18）。**错词重排再现的那张自 2026-10-14 起不再进回看态**：重排落位时从 `ratedKeys` 撤出该词（`FlashcardMode.tsx:418-421` / `PhraseFlashcardMode.tsx:364-367`），再现时以正常卡片**可重评**（后评覆盖前评写 SM-2），详见注意事项 20。

### 一轮结束态与跨词书空态（2026-10-14 用户三连反馈）

- **结束态**：`FlashcardMode.advance` 到队尾原先静默 `setIdx(0)` 回开头（短语闪卡同款），评过的卡全成"回看态"，**没有任何结束出口** —— 用户原话「复习完一轮单词，没有结束功能，只能往回查看单词」。现在队尾进**完成页**（`finished`：`FlashcardMode.tsx:102,418,563-608`；短语闪卡 `PhraseFlashcardMode.tsx:110,369,510-555` 同构）：本轮完成！ + 共 N 张 · 记得率 X% · 最佳连对 + 记得/需加强 + 「返回概览 / 回看本轮」双出口（回看=浏览已评卡，再走到队尾回到完成页）。完成页上键盘不参与（`if (finished) return;`，否则空格会把会话又搅起来）；复位点六处（开轮/续学/换书/返回/Esc）。基准 = 每日学习/快速闪卡既有的「本轮完成！」完成页。
- **跨词书空态指路**：角标/首页横幅走 `getGlobalDueCount`（**全词书**），而复习队列按**当前词书**取 —— 当前书没学过、到期词都在别的书时是死路（实测：横幅 7 个到期、当前书「四六级高频」进复习检测显示"当前没有已学习的单词"）。空态现在按 `getDueCountsByLevel()`（`use-word-learning.ts:152`）给「《当前书》没有可复习的单词，其他词书还有 N 个到期」+「去《X》复习（n 个）」一步切书按钮（排除当前书与生词本，`FlashcardMode.tsx:623-666`）；模式卡在「当前书 0 到期、全站 >0」时显示「其他词书 N 个到期」兜底（`DeepVocabularyPage.tsx:926,1038-1044,1180` —— 页面把 `levels` + `onLevelChange=handleSwitchBook` 传给了复习检测）。⚠️ **单本词书看不见生词本**仍是设计（见注意事项 15 的提醒），所以指路按钮刻意不给 custom。
- **换等级的状态切换必须走渲染期**（同批挖出的数据竞态，是"点进去还是空"的更深根因）：`useWordLearning` 的 reload effect 与 persist effect 同在 `[level]` 变化的 commit 里跑，persist 闭包握**旧 state** + **新 level** → 把旧书状态整份写进新书存储键。实测：空态点「去《中考》复习」后，中考的 3 个到期词被四六级高频的空状态冲掉，点进去仍空。现改为渲染期同步调整（`use-word-learning.ts:306-312`，React "adjusting state when props change"），persist 只剩"内容不变就不写"。**改这段前先读注释 —— effect 版会复现写坏新书存储键**（守卫 `verify-vocab-cards` ⑰d 正反双向锁）。

## 断点续学与存储键清单

全部经 `safeStorage`（带用户前缀），断点键**按 level 分**：

| 键 | 用途 | 位置 |
|---|---|---|
| `__nativethink_vocab_session_<level>` | 复习检测断点（读时校验下标越界即作废） | `use-word-learning.ts:172-193` |
| `__nativethink_phrase_session_<bank>` | 短语闪卡断点（按短语库分键，与单词侧断点分开命名；读时校验越界即作废） | `use-phrase-learning.ts:113-132` |
| `__nativethink_daily_session_<level>` | 每日学习断点 | `DailyLearningMode.tsx:813-856` |
| `__nativethink_quickcard_session_<level>` | 快速闪卡断点（含作答/翻面/暂停） | `quickcard-history.ts:233-237` |
| `__nativethink_quickcard_runs` / `_pending` | 留档（≤20 轮、单轮 ≤300 词）与余数桶 | `quickcard-history.ts:18-25,129,164-206` |
| `__nativethink_daily_quota_<level>` / `__nativethink_daily_vocab_count` | 每本今日量 / 全局默认量 | `use-word-learning.ts:23-25,195-209` |
| `__nativethink_vocab_autospeak` | 自动发音开关，**默认开**（只有显式存 `'0'` 才算关）。2026-09-30 起**四处都读** —— 快速闪卡原先完全不读它、出卡无条件朗读，本轮补齐（门控 effect + 进度行开关）；2026-10-09 短语闪卡（第 7 模式）成为第五处 | `FlashcardMode.tsx:33,203-236`、`DailyLearningMode.tsx:34,275-318`、`QuickCardMode.tsx`（AUTO_SPEAK_KEY）、`ChunkTrainingPage.tsx:100,373-379`、`PhraseFlashcardMode.tsx:45,97-99` |
| `__nativethink_level_memory` | 浏览位置记忆 —— **故意用裸 `localStorage`**（不经 safeStorage 就不会因登录前缀变化而"隐身"，也因此不参与云同步，见 [storage-and-stats.md](./storage-and-stats.md) §3.2/§3.4） | `DeepVocabularyPage.tsx:353-359`、`wordbank.ts:477` |

### 短语闪卡（第 7 模式，2026-10-09）

用户需求：「在词汇深度界面，做一个对各短语库进行学习的闪卡学习功能，功能需要模仿复习闪卡的逻辑，实现其对应有的功能以及同样的优化体验，这样就可以不用挤在短语库那小的界面里了」。`PhraseFlashcardMode.tsx`（约 988 行）**逐条移植复习检测的会话逻辑**：冻结会话顺序、SM-2 五档 + 键盘 `[0,2,3,4,5]`、答错延迟重排（`pendingRelearnRef` 模式）、评分后 120/300ms 自动跳卡 + 定长 tween 0.18、滑动手势（同一张 `decideSwipe` 决策表，**保留滑动评分** —— 复习检测 2026-10-13 起禁，见注意事项 18）、共用自动发音键（默认开，预热门控）、「不再出现」带撤销、断点续学。

- **数据**：9 个考试短语库（`src/data/phrase-bank/`，共 ≈7.6MB）**按需懒加载**，一次一本；映射成 `IChunk` 兼容对象（`id: pbc_<bank>_<i>`、`usage: 来源词：x`）后过 `dedupeChunks` 读取层去重 —— 与语块页短语库同一映射口径。
- **进度**：写 `use-phrase-learning`（键 `__nativethink_phrase_learning` / `__nativethink_phrase_daily_quota`）—— 与语块页「短语复习 / 闪卡」**同一份 SM-2**，哪个入口学都算数；本次为该 store 加了 `wrongCount` / `suspended` / `todayLearned` / `history` 加法项与 `normalize()` 老存档补齐。
- **与复习检测的有意差异只有三条**：① 空进度也能开一轮（补新到「每日目标」，档位即本轮张数）—— 它是短语的**学习入口**，复习检测是纯复习模式所以要求先有已学；② 没有生词本 / 助记入口（词库侧概念）；③ 学习时长记 `'chunks'`（内容域是短语，与语块闪卡同口径，翻面直计 0.2 分）。
- **「每日目标」档位即本轮补新张数（2026-10-09 用户要求「学习单词量要可调」）**：此前档位只改计数标签（今天新学 x/N），本轮写死 20，点 100 档「开始学习」仍是 20 张。现 `fillCount = Math.max(0, dailyQuota - dueCards.length - otherCards.length)`，且队列 memo 依赖含 `dailyQuota`（漏了＝改档位张数不变，得重挂载才生效）。到期（≤30）/ 已学未到期两支照旧参与，所以有复习义务时总数可能大于档位。
- 零提示契约同一条（见注意事项 13）；守卫 `verify-vocab-cards` ⑮a-d：接线 / 懒加载去重 / 会话同构 / 存储扩展四组，变异 6 组全红；⑮c 另有「档位即补新张数」2 条断言（去掉 `dailyQuota` 或写回 20，各红 1 条）。

## 收藏 / 生词本 / 助记

- 收藏与 `FavoritesPage` 同源（`use-favorites.ts`，键 `__nativethink_favorites`）。⚠️ **同一个"收藏单词"存两种 type**：词库浏览用 `'vocabulary'`（`DeepVocabularyPage.tsx:910`），每日学习与快速闪卡用 `'word'`（`DailyLearningMode.tsx:424-442`、`QuickCardMode.tsx:163-182`）。判重/统计必须同时看两个 type —— **2026-10-15 起三处学习卡的 `isFav`/`toggleFav` 已按此实现**（`isFavorited(word,'word') || isFavorited(word,'vocabulary')`，取消移除任一来源那条；守卫 ㉑d 三模式点名）—— 此前只查单一 type，"浏览里收藏过的词"在学习卡上显示未收藏、再点就同词存两条（用户：「同样单词但是收藏情况不同的列表」）。
- 生词本 `custom-words.ts`（键 `__nativethink_custom_words`）：阅读器收集词库未收录的词，词条 `level:'custom'`（`:106`），进度经 `SUB_LEVELS` 走独立一路；复习队列把**已有进度记录的生词本词排在队首**（`FlashcardMode.tsx:149-152`），2026-10-05 起**不再要求账号另有词库进度**，且跳过被「不再出现」屏蔽的词（见注意事项 15）。
- 助记 `word-notes.ts`（键 `__nativethink_word_notes`）：**目前只有复习检测卡背接了线**（`FlashcardMode.tsx:1142-1165`），其它模式不显示。

## 注意事项

1. **`memo` 依赖里必须有"数据到位"信号**：`filteredWords` 的 deps 带 `dataReady, dataVersion`（`:564`）；`DailyLearningMode` 的「本书进度」memo 只依赖 `progressKeyCount`（`:73-84`）—— 所以模式子树必须等 `dataReady` 才挂载，否则数据晚到不会重算，表现为"选了书、进度条整块消失"。
2. **本轮顺序必须冻结**：队列若直接依赖 `state.progress`，每评一次分就重算、当前题会漂（`FlashcardMode.tsx:56-62,119-164`）。`use-stable-shuffle` 只被思维页与语块页使用，**本模块没有用它**。
3. **ref 不随组件重挂载归零**：`lastSpokenKey` 一类要在每轮开始显式清空（`FlashcardMode.tsx:165-172,446,471`、`QuickCardMode.tsx:147,198,242`），否则"第二轮起第一张卡不出声"。
4. **`setState` updater 里不许有副作用**（toast / 落盘 / 改 ref）—— StrictMode 双调用会翻倍（`DailyLearningMode.tsx:227-233`、`QuickCardMode.tsx:384-387`）。
5. **完成判定不能读闭包里的 `queue.length`**：重排插入后那是旧值，最后一卡答错会被直接判完成（`QuickCardMode.tsx:365` 用 `queueRef.current.length`）。
6. **Esc 监听阶段不一致**：`QuickCardMode.tsx:489` 与 `DailyLearningMode.tsx:899` 用**捕获阶段**（AGENTS.md 规定），而 `FlashcardMode.tsx:272-282` 用冒泡阶段 + `!document.querySelector('[role="dialog"]')` 守卫 —— 按同一条坑，Radix 在 document 冒泡阶段已同步 flush 掉 dialog，这个守卫可能失效。改这块请照捕获阶段那两处写。
7. **嵌套按钮一律 `span` + `stopPropagation`**（`DeepVocabularyPage.tsx:1317,1330`），否则触发 React 的 button 嵌套告警且父级 `onClick` 会重复执行。
8. **已知未接线**：向导里的「已学单词 (SM-2) / 整本随机」选择会写 `__nativethink_review_mode`（`:483`）并被页面读进 state（`:412`），**但没有任何消费方** —— `FlashcardMode` 只收 `level` 与 `counts`。目前这个选择无实际效果。
9. **`AnimatePresence mode="wait"` 里别用慢弹簧**：退场动画必须**衰减到亚像素**才算完成，`spring` 的参数调得再"脆"也有几百毫秒尾巴，`mode="wait"` 会把这段尾巴整段加到换卡延迟上。换卡类动画用定长 `tween`（本模块都是 `duration: 0.18, ease: 'easeOut'`）。
10. **评分回调里不要动 `session.order[currentIdx]`**：当前卡的 key 就是靠这个下标取的，一动当前卡就"变脸"（评分按钮消失/串到下个词）。任何"重排当前卡"的动作都要延后到 `advance`（`pendingRelearnRef` 的模式）；同理，改动评分流程后要真机/按帧确认"它自己会翻到下一张"。
11. **向导必须能一步打开、一眼看见、一键退出**（2026-09-30 真机反馈"点了切换词书没反应"）：三件事缺一不可 —— 首页模式卡与向导**互斥渲染**（`DeepVocabularyPage.tsx`，向导曾在 y≈809 之下，视口内只有 42px）、打开时 `window.scrollTo` + `main.scrollTo` 归零、向导带「当前」标记与「关闭」出口。切换逻辑本身没错，坏在"看不见有东西弹出来"。
12. **快速闪卡的每轮数量只能在起跑页改**（2026-09-30 用户要求）：`ROUND_SIZES` 档位按钮组**只出现在** `if (paused)` 那块（`QuickCardMode.tsx:712-747`，`changeRoundSize` 全文件仅这两个调用点）。原因：`changeRoundSize` → `roundSize` 变 → 重建队列的 effect（`:257-267`）会**重新随机抽一轮**，本轮已作答的认识/不认识整轮清空 —— 以前训练页顶栏也铺着同一排按钮，练到第 15 张改主意点一下，进度就没了。训练页现在只留一块只读 `SPAN` 报 `本轮 {uniqueTotal} 词 · 换数量请返回`（`:819-825`，分母与进度条同源，断点续学回来不会报成档位数字）。守卫：`verify-vocab-cards` ⑤b（含"起跑页档位仍可点"的正对照，防止把它当成"删功能"）。CDP 393×851 真点另钉一条：这块只读标签**不换行也不把顶栏挤破**（`scrollWidth 393 = innerWidth`）。

13. **练习界面零提示（用户两次加码后的硬口径）**：2026-09-29 先要求快速闪卡「不认识 / 收藏」不出声；2026-09-30 报「复习检测每点一次熟练度就提示一次」，随后把口径提到**「不要在练习界面有任何提示」**。现在四个练习模式（复习检测 / 每日学习 / 快速闪卡 / 短语闪卡）里 `toast` 只剩白名单七处，全部是"不解释就等于坏了"的：①「上次的进度已失效，请重新开始」「暂时没有可学的单词，请稍后再试」「收藏的词在词库里找不到了」「搭配翻译失败」（点了没反应类）；②「已把「x」移出学习队列」（**撤销按钮只挂在这条提示上**，撤了就等于丢功能）。被撤掉的：档位名播报、答错重排播报、连对里程碑（复习检测每 5、每日学习每 10）、整轮完成、接着上次继续、自动发音开关、收藏/取消收藏、到期堆积提示、每日目标已设为、从生词本移除、切换练法、重练 N 个词、开始练收藏的 N 个词、今日目标已完成、已恢复 N 个词。反馈改由界面承担：卡面序号、顶部**已评** / **Flame 连对数** / **今天新学 x/y**、★ 实心、按钮选中态、进度条走满；**音效刻意保留**（`sfxTick` / `sfxComplete` 是声音不是弹窗，要一起安静得另说）。守卫 ⑧c + ⑧d 共 14 条：白名单逐行匹配（新增任何 toast 必须先改白名单）+ 四条正对照钉住 `recordReview` / `pendingRelearnRef` / 撤销入口 / 界面计数（含短语闪卡）。⚠️ 判"函数体里有没有 toast"要用**声明 → deps 锚点切片**，别用定长正则（变异实测：函数体多 80 字符就把 1400 字节窗口撑爆，抓空后反向断言变成真空通过）。

14. **卡面单词字号 = 按词长三档；手机(<sm)档统一到已真机验证的那一档，不要再引入自适应缩放**（2026-10-01 用户口径：「单词卡片大小不一，有得太大有得太小还有的会后面变小，都回退到之前的模样」）：819a007 曾引入 `FitWord`（canvas `measureText` 按容器宽解算字号 + `nowrap`，用于消灭长词折行）。真机观感被否：同轮里每个词一个字号 —— 短词被容器宽撑得过大、长词缩到很小，同屏对比忽大忽小；且首帧后 `ResizeObserver` 重算，用户看到"先大后小"的跳变。该组件已删除，三模式全部回到改造前的 `break-words` h2 + 三档（≤10 最大 / 11–14 中 / >14 小）。`data-fit-box` 是**无样式锚点**（自动化趁正面抓词面用，见 [验证体系](./verification.md) §3），保留。守卫 ⑭：FitWord 不许复活（文件不许存在 + 三模式不许引用）+ 逐模式档位字面量 + `break-words` 在位，变异 4/4 变红。**2026-10-13 第 21 测两处更正**：① 真机布局视口是 **393 CSS**（此前按 428=1283÷3 估算，错），且 `MainActivity.java:22` 的 `setTextZoom(120)` 让全部字号再 ×1.2 —— 真机 `telecommunications` 实渲 36px、`compatible` 57.6px 折两截即这两个叠加的结果；② 手机(<sm)档**统一到复习检测既有小档 24/30/36**（FM 自 2026-10-01 回退 FitWord 起就是这档、本次未动、真机实测其 telecom 28.8px / h2W=282 / 单行；DL/QC 本轮跟进对齐），sm: 保各自桌面原档（30/36/48）—— 桌面像素不变，「档位差异」在 ≥sm 仍不许"顺手统一"（第 21 测变异 M3 顺手改 DL 桌面档 / M4 顺手统一 PFM 档，两条都红）。

    **同排的两个动作按钮（朗读/收藏）必须能整组换行**（2026-10-13 真机反馈「快速闪卡长单词会被分割为两列」）：词排是「单词 + 两按钮」同一 flex 行，卡片定宽 `w-full`，393 CSS 真机视口里词排 301px（报障时 QC 仍 p-8 只有 ~293px，⑭c 收到 p-7 后 301px）里按钮固定吃 ~86px，长词（>14 字母手机档实渲 36px ≈250px+）被挤进 ~215px 窄列折成两截；修法 = 词排 `flex-wrap` + 两按钮包进一个 `shrink-0` 组（`QuickCardMode.tsx:952,960`）—— 短词并排版式不变，长词时按钮组**整组**落到下一行，不许逐项换行拆成「词+🔊 / ⭐」的碎排。守卫 ⑭b 2 条（变异 2/2：去 `flex-wrap`、解组按钮各恰好红 1 条）、⑭c 1 条（QC 卡内边距 p-7：p-8 时词排 293px < `recommendation` 手机档需要的 298px，M7b 回 p-8 验红）；行为矩阵见 [验证体系](./verification.md) §5 第 19 测（428×925 采的修复前后对照，第 21 测已按 393 重验）。

    ⑭b 于同日下半场**扩到复习检测/每日学习/短语闪卡的单词词排**（四个同构词排同修，+6 条断言）—— 短语闪卡是本轮顺带：同构缺陷不留给下一轮，见 §5 第 20 测。**第 21 测的档位修法只动手机(<sm)档与 QC 卡内边距，没动 `break-words`、没复活 `nowrap`/自适应；短语闪卡无折行报告（词排与 FM 同构）保持原样**。
15. **生词本的词必须自己就能进队列**（2026-10-05 修）：`queue` 的两支（到期词、其它已学词）都用**只查词库**的 `findWord()` 解析，而空队列判据原先只看这两支 —— 于是"只有生词本"的账号（新装、换设备还没同步、或 agent 把 AI 词表灌进生词本）点复习检测是**空态**，可入口角标按进度算，照样显示「N 个到期」，用户视角就是"点了没反应"。现在把 `customEntries` 提到判据之前（`FlashcardMode.tsx:149-152`），判据加第三个条件（`:156`），补量 `fillCount` 也扣掉它（`:161`，会话仍是"补到 20 张"，不会在 20 之外再加一层）；顺带补上同一个筛选里漏掉的**屏蔽承诺**（`!prog.suspended`，之前被「不再出现」的生词本词照样出卡，与上面 otherWords 的处理不一致）。守卫 ⑧ 加 5 条：声明顺序、判据第三条件、旧判据必须消失（反向正对照）、补量扣减、屏蔽跳过 —— 4 组变异 5 条红点全中。行为对照：本机独立 profile、**零词库进度**灌 3 个词 → 修复前空态，修复后复习检测首张即 `goblemuch`。⚠️ **单本词书仍然看不见生词本**（`state.progress` 里没有 custom 键，只有 `'all'` 聚合才有）—— 这是设计而非 bug，但它让"选一本词书背生词本"这条路径不成立，改这里前先想清楚要不要连它一起统一。
16. **搭配页的滚动位置写盘是 debounce 的**（2026-10-05）：`handleCollocListScroll` 原来每个 scroll 事件都同步 `localStorage.setItem`（主线程磁盘 I/O，长列表滚动掉帧），现在 400ms 防抖（`CollocationsTab.tsx:181-189`）。两个已知边角：定时器**没在卸载时 clear**，但回调里有 `if (collocListRef.current)` 判空 —— 卸载后那次只会跳过，不会报错也不会写脏数据；代价是**滚完 400ms 内就切页会丢这一次位置**（重进页面位置略旧，属于可接受取舍）。要接新的滚动记忆就照这份抄，别退回逐事件写盘。

17. **每日学习的卡片几何 = 恒定宽度 + 封顶背卡；答对零等待**（2026-10-13 用户：「每日学习的闪卡切换慢且卡，同时卡片太大」）：`DailyLearningMode.tsx:1196,1205-1211,1217,1223` 换卡那段与两个闪卡对齐 —— MotionDiv `w-full max-w-md`（修前无宽度类、卡随内容伸缩逐卡跳变 425→356px、20 词共 460px 溢出视口 —— 428 视口下的旧测量，第 21 测起口径为真机 393 / 卡恒 361px、桌面封 448px）、Card 前后分支按复习检测拆开（正卡 `min-h-[260px] flex flex-col justify-center`、背卡 `max-h-[62vh] overflow-y-auto`、`CardContent p-7`）。⚠️ **`justify-center` 的列方向容器不许直接挂 `overflow-y-auto`**：内容超高时溢出从上下两头同时裁，上端裁进滚动区外够不着；前后分支拆开正是为避开它。答对停留 `120 → 0`（`:769`；实测那 120ms 就是 tNew 315 vs 195 的全部差值，"与快速闪卡同速"自此成立）—— 改这里**别顺手把定时器换成同步 `handleNext()`**：`ratedNow` 已有自动跳页 effect，双触发会一次推进两张。守卫 ⑯ 8 条（卡宽类 / 正卡 / 背卡 / p-7 / tween / dwell 精确 0 + 答错 ≤400），变异 M5-M11 七条逐条验红，见 [验证体系](./verification.md) §5 第 20 测。

18. **复习检测不做左右滑评分**（2026-10-13 用户：「复习检测不要做左右划来判断单词熟悉还是不熟悉」）：`decideSwipe` 新增 `allowRate?: boolean`（`vocab-swipe.ts:29`，缺省即旧行为），复习检测调用点传 `allowRate: false`（`FlashcardMode.tsx:555`）—— 未翻面仍→`flip`（`vocab-swipe.ts:43`）、已翻面未评分→`'none'`（拖拽回弹，不评也不切，`:44`）、已评分→`prev`/`next` 导航（`:42`）。短语闪卡**保留滑动评分**（不传该参，`PhraseFlashcardMode.tsx:501`）—— 它就是"默认表未破坏"的正对照。守卫 ⑤b 12 条按 `(face, rated, allowRate?)` 组合穷举（含 2 条短语闪卡正对照）；第 21 测变异 M5（FM 去掉 `allowRate:false`）/ M6（纯函数删 allowRate 档）/ M7（评分映射复活）/ M8（swipeHint 方向提示复活）/ M9（PFM 也传 `allowRate:false`，正对照）/ M10（默认表破坏）6 条全部验红。背景：旧表在"未翻分的背面"一滑就成评分并直接跳词（第 21 测 CDP 实测：拖一下 `rated=1` 换词，覆盖层「不认识/认识」还在屏幕上）。

19. **复习/短语闪卡一轮结束必须进完成页（不许静默回开头）；换等级的状态切换必须走渲染期**（2026-10-14，详见上方「一轮结束态与跨词书空态」）：前者两个模式同构（`verify-vocab-cards` ⑰a/⑰b 正反双向锁 —— 队尾分支出现 `setIdx(0);` 即红）；后者是 `useWordLearning` 的**数据竞态**：reload effect 先把新等级状态读进来，但同一 commit 里 persist effect 的闭包还握旧 state、读到的 `level` 已是新的，于是 `saveState(新level, 旧state)` **把新书的存储键整份覆盖**（实测：切书后目标书 3 个到期词被冲掉，用户视角"点进去是空的"）。修法 = `stateLevel` 闸门 + 渲染期 `loadState` + `setState`（`use-word-learning.ts:306-312`），旧 effect 形态由 ⑰d 反向断言钉死；变异 M4（闸门失效）/ M5（旧 effect 复活）各验红。

20. **回看态必须可点退出；错词重排再现必须是可重评的普通卡**（2026-10-14 两连修）：① 回看态（头部 ◀ 回上一个 / 完成页「回看本轮」浏览）原有提示是**纯 span** —— 手机点卡片只会翻面、反复点就卡在同一个词来回翻、唯一出路"右滑"没人知道方向，用户报「只要进入了回看单词的功能就会卡住，进入一个单词循环」。现改为**可点按钮「已评过的卡 · 继续」**（两模式同构，`FlashcardMode.tsx:1225-1240` / `PhraseFlashcardMode.tsx:982-997`，滑动 / 键盘 → 照常可用）——守卫 ⑱b 锁"可点 + onClick advance"，旧 span 形态反向断言。② 重排落位时必须把该词从 `ratedKeys` 撤出（`FlashcardMode.tsx:418-421` / `PhraseFlashcardMode.tsx:364-367`）：否则再现卡被判"已评过"→ 回看态背面**没有五档按钮**（用户「学着学着就无法对下一个单词做熟悉度点击」；守卫 ⑱a 4 条锁两模式）。③ 评分后的"即将进入下一张"状态**仍不许**加「下一个」按钮 —— ⑫ 的老断言按新语义**重新推导**（旧判据是"全文件禁 `onClick={() => advance()}`"，语义已变宽；改成"评分后无按钮 + 全文件唯一 advance 按钮 = 回看态继续"）。

21. **同日已评的词不再从「其他已学」支回队**（2026-10-14 用户：「复习完还不记作复习完成，再次点击开始复习还是同样的单词」）：无头实测，整轮评完再开一轮，前 4 词与上一轮 **4/4 全重叠** —— `otherWords` 支不排除今天刚评过的词，复习永远"做不完"。修法 = 队列构建跳过 `lastReview ≥ 今日零点`（`FlashcardMode.tsx:136-144` otherWords 支 / `PhraseFlashcardMode.tsx:191-197` otherCards 支同构）—— SM-2 本来就把它们排到明天；要再练走「错词重练」（wrongCount>0 不受影响）。同日全部评完后再进复习检测会落到空态的新分支**「今天的复习已完成：N 个单词都已过一遍，明天按间隔再来」**（`FlashcardMode.tsx:649-674`；不再谎报"没有已学习的单词"；空队列判据三条件契约不变 —— 它在补新之前返回是刻意的：复习检测不教新词，新词归「每日学习」）。守卫 ⑲ 3 条。

22. **每日目标档位必须真实作用于各模式的本轮张数**（2026-10-14 用户：「每日目标和学习的卡片的单词数量不挂钩」）：复习检测概览的 10/20/30/50/100 档原本只改「今天新学 x/N」的显示数字，队列补新**写死 20**、memo 依赖缺 `dailyQuota`（无头实测：点 100 档后开始按钮仍是「开始复习（20 张卡片）」）—— 档位纯标签。修法 = `fillCount` 吃 `dailyQuota` + 依赖补齐（`FlashcardMode.tsx:168-171`），与短语闪卡 ⑮c（2026-10-09）、每日学习（`DailyLearningMode.tsx:356-361`，一直挂钩）三模式同口径。守卫 ⑳ 2 条；⑧ 补量断言按新语义重推（`dailyQuota - … - customEntries`，扣减生词本口径不变）。

23. **本轮总张数以「每日目标」为上限（Anki 式每日复习上限）**（2026-10-14 用户：「复习检测一次复习太多单词」「每日学习目标跟摆设一样设置的」）：`otherWords` 支原先**不设上限**，几百张已学词照出 —— 档位只管补新、管不住总量。修法 = `quotaLeft = 档位 − 生词本`；到期 ≤ `min(30, quotaLeft)`（超额的仍是到期、明天继续，待复习数不清零）；其他已学受余量约束；补新吃剩余（细化和覆盖注意事项 22 的补新口径）。空队列判据改用**存在性**（`staleOtherKeys`：未屏蔽 + 非今日已评 + 词库可解析）而非预算后数量 —— 预算耗尽 ≠ 没内容。无头实测：3 到期 + 40 隔日已学，默认档恰好 20 张、100 档 43 张（全部合格词）、回 20 档 20 张。守卫 ⑳ 3 条 + ⑧ 重推。

24. **断点 v2：已评状态随断点存取；有断点时「接着上次」是主按钮**（2026-10-14 用户：「只要中途退出就进度清零」）：两处"清零"体感 —— ① 断点只存位置，续学回来「已评 0」、走过的卡还能重评；② 主按钮是开始复习，一点就把断点丢掉重排。修法 = 断点携带 `rated/ratedCount/goodCount`（可选字段，老断点免迁移，`loadSession` 校验坏断点判无效），续学恢复已评状态与计数（实测：评 5 张退出 → 续学后 已评 5 / 位置 6/20 原样）；有断点时主按钮 = **接着上次（还剩 N 张）**，「重新开始（N 张）」退居次位并在 title 明说丢弃断点。守卫 ㉑ 5 条。

25. **复习检测卡面有收藏 ★**（2026-10-14 用户：「复习检测无法收藏单词」——卡面上此前只有朗读钮）：词排 = 朗读 + ★（`FlashcardMode.tsx` 词排 shrink-0 组），与快速闪卡同款交互：`type='word'` 同源收藏页、★ 即时变实心、**不弹提示**。守卫 ㉑c。

26. **快速闪卡：读当前 + 预合成下一张；学习记录按日期分组**（2026-10-15 用户：「部分单词无法自动朗读，但是点击朗读却可以朗读」「把列表添加按照日期整理的功能」）：① 自动朗读缺失 —— QC 原先只预热本轮**前 5 张**（`sessionEntries.slice(0, 5)`），第 6 张起按需合成，sherpa 按需合成时延造成"部分不读、点击有声"（点时已入缓存）；桌面 SpeechSynthesis 路径插桩复现不出（逐词都有日志）→ 安卓离线引擎专属。修法 = 镜像复习检测：朗读当前 + `tts.prewarm(queue[idx+1])`（`QuickCardMode.tsx` 朗读 effect）。② 学习记录按本地日期分组（今天/昨天/具体日期，`formatDate(new Date(r.at))`，禁 toISOString）。守卫 ㉒ 3 条。

27. **收藏判重同时看两个 type（三处学习卡）**（2026-10-15 用户：「快速闪卡重练过程中收藏单词……同样单词但是收藏情况不同的列表」）：QC/DL/FM 的 `isFav`/`toggleFav` 原先只查 `'word'` 单一 type —— 词库浏览收藏过的词（`'vocabulary'`）在学习卡上显示未收藏，再点就**同词存两条**（收藏页出现两来源重复项）。修法 = 判重看 `'word' || 'vocabulary'`、取消移除任一来源那条、再收藏统一落 `'word'`（三模式同构，守卫 ㉑d 逐模式点名；实'verify'：注入 'vocabulary'-type 收藏 → QC 记录面板 chip 立即实心）。详见上方「收藏 / 生词本 / 助记」。

## 怎么验证

```bash
npm run typecheck
node scripts/verify-vocab-cards.mjs      # 409 断言：手势决策表（含复习检测禁滑动评分 allowRate:false，短语闪卡正对照）、排卡、换卡节奏（数值锁）、答错重排延后、回看出口、断点、静默契约、换书一步生效、预载门、单词分档字号（DL/QC 手机档=FM 档，PFM 正对照）、词面按钮组整组换行（⑭b：四个模式长词不折两截）、快速闪卡卡内边距（⑭c）、每日学习卡片几何与答对零等待（⑯）、短语闪卡（接线/懒加载去重/会话同构/存储扩展）、复习结束态/跨词书空态/换等级竞态（⑰）
```
交互类改动（"点了没反应"、状态不写回）静态检查看不出来 —— 用本机无头 Chrome + CDP 真点一遍（见 [验证体系](./verification.md)）。换卡耗时这类体感问题同样要按帧量：`TEMP/nt-flip-timing.mjs` 会点真实评分按钮、按帧采样卡片 DOM，直接报"进 DOM 毫秒数"。
