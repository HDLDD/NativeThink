# 词汇深度（`/vocabulary`）

> 代码：`src/pages/DeepVocabularyPage/`（页面 1 个 + `components/` 5 个，约 7,700 行）+ `src/lib/` 里 6 个支撑模块
> 数据来自：[词库数据层](./wordbank-data.md) · 朗读见 [朗读引擎](./tts.md) · 守卫：`npm run verify:vocab-cards`（315 断言）
> 最后校准：2026-09-30

## 这个模块是什么

背单词的主场，六种学习方式共用一套进度与 SM-2 状态：

| 模式 key | 名称 | 组件 | 干什么 |
|---|---|---|---|
| `daily` | 每日学习 | `components/DailyLearningMode.tsx` | 按每日计划学新词，内含**六小题型**（见下） |
| `quickcard` | 快速闪卡 | `components/QuickCardMode.tsx` | 只看词形，认识/不认识两键过卡，可批量留档 |
| `flashcard` | 复习检测 | `components/FlashcardMode.tsx` | SM-2 五档评分复习到期待巩固的词 |
| `browse` | 词库浏览 | 内联在 `DeepVocabularyPage.tsx:1164-1736` | 筛选/搜索/翻页浏览整本书 |
| `collocations` | 搭配学习 | `components/CollocationsTab.tsx` | 高频搭配与短语 |
| `vocabtest` | 词汇量测试 | `components/VocabSizeTest.tsx` | 1 分钟估算词汇量，含近 10 次趋势 |

模式清单定义在 `DeepVocabularyPage.tsx:82-89`。

## 入口与状态机（改这里最容易出事）

页面有**三个正交的开关**，别把它们混成一个：

- `setupDone`（`:401-403`，键 `__nativethink_vocab_setup_done`）—— 是否完成过首启设置。
- `showWizard`（`:406`）—— 向导遮罩是否显示。首次自动 `true`。
- `immersed`（`:911`）—— 是否已进入某个模式。**模式内容写在 `{!showWizard && immersed && dataReady && <Tabs/>}`（`:1075`）里**，只改 `tab` 不改 `immersed` 的话，用户会"选完了却停在列表上"。反向同理：**模式卡列表在 `{!immersed && !showWizard && …}`（`:995`）里** —— 向导打开时列表整块让位，否则向导被渲染在六张模式卡下面（真机 393×851 上从 y≈809 才开始，视口内只剩 42px，看起来就是"点了没反应"）。

因此有两条完成路径，走的是两套代码：

| 路径 | 函数 | 行为 |
|---|---|---|
| 首次设置（三步：词书 → 方式 → 开始） | `handleWizardComplete` `:465-484` | 必须 `handleTabChange(mode)` + `setImmersed(true)`，选完直接落进该模式 |
| 换书（已设过的人） | `handleSwitchBook` `:493-498` | **点一本就切**，学习方式/每日量/复习模式全部不动，也**刻意不清**该书今日配额 |
| 继续上次 | `handleWizardContinue` `:500-510` | 同首次：直接进上次的模式 |

预载门在 `:420-436`：`!setupDone` 时**一本都不预载**（否则新人还没选书就要下载九本 ≈40MB）；预载失败走 `catch + finally` 放开 `dataReady`，不会把人卡在"加载中"。

## 每日学习的六小题型

`DailyLearningMode.tsx:27` 定义 `ReviewMode`，选择器在 `:798-806,1038-1063`，会话队列（到期优先 + 补新词）在 `startSession:357-418`：

闪卡 `:1197-1339`（评分 `handleRate:570`）· 选择题 `:1342-1406`（干扰项同词性优先 `generateChoiceOptions:494-508`）· 拼写 `:1409-1528` · 听写 `:1531-1652` · 配对 `:1655-1737`（4 词对对碰 `generateMatchPairs:510`）· 填空 `:1740-1853`（例句挖空 `getFillBlankSentence:529`）。

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

三个来源叠加（`FlashcardMode.tsx`）：① 评分后停留 550/900ms；② `advance` 里"先翻回正面、`setTimeout(…,150)` 后再换下标"的干等；③ `AnimatePresence mode="wait"` 串行等退场 —— spring 要衰减到**亚像素**才算完，`spring(260/24)` 尾巴就有 ≈400ms。现在：停留 **120/300**（`FlashcardMode.tsx:433`、`DailyLearningMode.tsx:776`）+ 换卡**一次批量**（去掉 150ms，`FlashcardMode.tsx:402-416`）+ 定长 **tween 0.18s**（`FlashcardMode.tsx:872`、`DailyLearningMode.tsx:1209`）。守卫按**数值**锁（答对 < 答错、答错 ≤ 400ms），不锁字面量。

### 答错重排必须"延后到前进"（`pendingRelearnRef`）

`FlashcardMode.tsx:262` 的 ref：评分时**只记 key**，`advance` 时才 `scheduleRelearn`（`:402-405`）。原因：`cw`/`currentKey` 都取自 `session.order[currentIdx]`，若在评分那刻同步重排，该位置当场被换成下一张 → `currentKey` 变化 → `justRated`（`ratedNow === currentKey`）立即为 false → **自动跳转定时器永远排不上**，屏幕还直接换成下一个词的背面（评分按钮健在）。真机实测现象就是「点完全忘了卡死在本张」。延后之后评分那一刻 session 不动，"刚评分"成立 → 300ms 自动前进，重排词隔 4 张如约再现（CDP 实测：`trip → … → trip` 第 5 张，与 `RELEARN_GAP=4` 吻合）。

**回看态出口**：再现的重排词 `ratedKeys` 里已有它 → 回看态（无评分按钮、无「下一个」按钮，只有「已评过的卡 · 滑动 / 按 → 继续」提示，`FlashcardMode.tsx:1133-1144`）。滑动手势表同步改为 **rated 即导航**（`vocab-swipe.ts:36`）—— 旧表在"正面朝上的已评卡"上返回 `flip`，手机上滑了没反应，与卡死叠成同一个体感。

## 断点续学与存储键清单

全部经 `safeStorage`（带用户前缀），断点键**按 level 分**：

| 键 | 用途 | 位置 |
|---|---|---|
| `__nativethink_vocab_session_<level>` | 复习检测断点（读时校验下标越界即作废） | `use-word-learning.ts:143-164` |
| `__nativethink_daily_session_<level>` | 每日学习断点 | `DailyLearningMode.tsx:813-856` |
| `__nativethink_quickcard_session_<level>` | 快速闪卡断点（含作答/翻面/暂停） | `quickcard-history.ts:233-237` |
| `__nativethink_quickcard_runs` / `_pending` | 留档（≤20 轮、单轮 ≤300 词）与余数桶 | `quickcard-history.ts:18-25,129,164-206` |
| `__nativethink_daily_quota_<level>` / `__nativethink_daily_vocab_count` | 每本今日量 / 全局默认量 | `use-word-learning.ts:23-25,166-181` |
| `__nativethink_vocab_autospeak` | 自动发音开关，**默认开**（只有显式存 `'0'` 才算关）。2026-09-30 起**四处都读** —— 快速闪卡原先完全不读它、出卡无条件朗读，本轮补齐（门控 effect + 进度行开关） | `FlashcardMode.tsx:33,203-236`、`DailyLearningMode.tsx:34,275-318`、`QuickCardMode.tsx`（AUTO_SPEAK_KEY）、`ChunkTrainingPage.tsx:100,373-379` |
| `__nativethink_level_memory` | 浏览位置记忆 —— **故意用裸 `localStorage`**（不经 safeStorage 就不会因登录前缀变化而"隐身"，也因此不参与云同步，见 [storage-and-stats.md](./storage-and-stats.md) §3.2/§3.4） | `DeepVocabularyPage.tsx:323-330`、`wordbank.ts:477` |

## 收藏 / 生词本 / 助记

- 收藏与 `FavoritesPage` 同源（`use-favorites.ts`，键 `__nativethink_favorites`）。⚠️ **同一个"收藏单词"存两种 type**：词库浏览用 `'vocabulary'`（`DeepVocabularyPage.tsx:901-908`），每日学习与快速闪卡用 `'word'`（`DailyLearningMode.tsx:424-442`、`QuickCardMode.tsx:163-182`）。判重/统计必须同时看两个 type。
- 生词本 `custom-words.ts`（键 `__nativethink_custom_words`）：阅读器收集词库未收录的词，词条 `level:'custom'`（`:106`），进度经 `SUB_LEVELS` 走独立一路；复习队列把**已有进度记录的生词本词排在队首**（`FlashcardMode.tsx:147-150`），2026-10-05 起**不再要求账号另有词库进度**，且跳过被「不再出现」屏蔽的词（见注意事项 15）。
- 助记 `word-notes.ts`（键 `__nativethink_word_notes`）：**目前只有复习检测卡背接了线**（`FlashcardMode.tsx:1066-1089`），其它模式不显示。

## 注意事项

1. **`memo` 依赖里必须有"数据到位"信号**：`filteredWords` 的 deps 带 `dataReady, dataVersion`（`:564`）；`DailyLearningMode` 的「本书进度」memo 只依赖 `progressKeyCount`（`:73-84`）—— 所以模式子树必须等 `dataReady` 才挂载，否则数据晚到不会重算，表现为"选了书、进度条整块消失"。
2. **本轮顺序必须冻结**：队列若直接依赖 `state.progress`，每评一次分就重算、当前题会漂（`FlashcardMode.tsx:56-60,119-155`）。`use-stable-shuffle` 只被思维页与语块页使用，**本模块没有用它**。
3. **ref 不随组件重挂载归零**：`lastSpokenKey` 一类要在每轮开始显式清空（`FlashcardMode.tsx:165-172,446,471`、`QuickCardMode.tsx:147,198,242`），否则"第二轮起第一张卡不出声"。
4. **`setState` updater 里不许有副作用**（toast / 落盘 / 改 ref）—— StrictMode 双调用会翻倍（`DailyLearningMode.tsx:227-233`、`QuickCardMode.tsx:384-387`）。
5. **完成判定不能读闭包里的 `queue.length`**：重排插入后那是旧值，最后一卡答错会被直接判完成（`QuickCardMode.tsx:365` 用 `queueRef.current.length`）。
6. **Esc 监听阶段不一致**：`QuickCardMode.tsx:489` 与 `DailyLearningMode.tsx:899` 用**捕获阶段**（AGENTS.md 规定），而 `FlashcardMode.tsx:272-282` 用冒泡阶段 + `!document.querySelector('[role="dialog"]')` 守卫 —— 按同一条坑，Radix 在 document 冒泡阶段已同步 flush 掉 dialog，这个守卫可能失效。改这块请照捕获阶段那两处写。
7. **嵌套按钮一律 `span` + `stopPropagation`**（`DeepVocabularyPage.tsx:1317,1330`），否则触发 React 的 button 嵌套告警且父级 `onClick` 会重复执行。
8. **已知未接线**：向导里的「已学单词 (SM-2) / 整本随机」选择会写 `__nativethink_review_mode`（`:479`）并被页面读进 state（`:408`），**但没有任何消费方** —— `FlashcardMode` 只收 `level` 与 `counts`（`:1161`）。目前这个选择无实际效果。
9. **`AnimatePresence mode="wait"` 里别用慢弹簧**：退场动画必须**衰减到亚像素**才算完成，`spring` 的参数调得再"脆"也有几百毫秒尾巴，`mode="wait"` 会把这段尾巴整段加到换卡延迟上。换卡类动画用定长 `tween`（本模块都是 `duration: 0.18, ease: 'easeOut'`）。
10. **评分回调里不要动 `session.order[currentIdx]`**：当前卡的 key 就是靠这个下标取的，一动当前卡就"变脸"（评分按钮消失/串到下个词）。任何"重排当前卡"的动作都要延后到 `advance`（`pendingRelearnRef` 的模式）；同理，改动评分流程后要真机/按帧确认"它自己会翻到下一张"。
11. **向导必须能一步打开、一眼看见、一键退出**（2026-09-30 真机反馈"点了切换词书没反应"）：三件事缺一不可 —— 首页模式卡与向导**互斥渲染**（`DeepVocabularyPage.tsx`，向导曾在 y≈809 之下，视口内只有 42px）、打开时 `window.scrollTo` + `main.scrollTo` 归零、向导带「当前」标记与「关闭」出口。切换逻辑本身没错，坏在"看不见有东西弹出来"。
12. **快速闪卡的每轮数量只能在起跑页改**（2026-09-30 用户要求）：`ROUND_SIZES` 档位按钮组**只出现在** `if (paused)` 那块（`QuickCardMode.tsx:712-747`，`changeRoundSize` 全文件仅这两个调用点）。原因：`changeRoundSize` → `roundSize` 变 → 重建队列的 effect（`:257-267`）会**重新随机抽一轮**，本轮已作答的认识/不认识整轮清空 —— 以前训练页顶栏也铺着同一排按钮，练到第 15 张改主意点一下，进度就没了。训练页现在只留一块只读 `SPAN` 报 `本轮 {uniqueTotal} 词 · 换数量请返回`（`:819-825`，分母与进度条同源，断点续学回来不会报成档位数字）。守卫：`verify-vocab-cards` ⑤b（含"起跑页档位仍可点"的正对照，防止把它当成"删功能"）。CDP 393×851 真点另钉一条：这块只读标签**不换行也不把顶栏挤破**（`scrollWidth 393 = innerWidth`）。

13. **练习界面零提示（用户两次加码后的硬口径）**：2026-09-29 先要求快速闪卡「不认识 / 收藏」不出声；2026-09-30 报「复习检测每点一次熟练度就提示一次」，随后把口径提到**「不要在练习界面有任何提示」**。现在三个练习模式（复习检测 / 每日学习 / 快速闪卡）里 `toast` 只剩白名单五处，全部是"不解释就等于坏了"的：①「上次的进度已失效，请重新开始」「暂时没有可学的单词，请稍后再试」「收藏的词在词库里找不到了」「搭配翻译失败」（点了没反应类）；②「已把「x」移出学习队列」（**撤销按钮只挂在这条提示上**，撤了就等于丢功能）。被撤掉的：档位名播报、答错重排播报、连对里程碑（复习检测每 5、每日学习每 10）、整轮完成、接着上次继续、自动发音开关、收藏/取消收藏、到期堆积提示、每日目标已设为、从生词本移除、切换练法、重练 N 个词、开始练收藏的 N 个词、今日目标已完成、已恢复 N 个词。反馈改由界面承担：卡面序号、顶部**已评** / **Flame 连对数** / **今天新学 x/y**、★ 实心、按钮选中态、进度条走满；**音效刻意保留**（`sfxTick` / `sfxComplete` 是声音不是弹窗，要一起安静得另说）。守卫 ⑧c + ⑧d 共 13 条：白名单逐行匹配（新增任何 toast 必须先改白名单）+ 三条正对照钉住 `recordReview` / `pendingRelearnRef` / 撤销入口 / 界面计数。⚠️ 判"函数体里有没有 toast"要用**声明 → deps 锚点切片**，别用定长正则（变异实测：函数体多 80 字符就把 1400 字节窗口撑爆，抓空后反向断言变成真空通过）。

14. **卡面单词字号 = 按词长三档，不要再引入自适应缩放**（2026-10-01 用户口径：「单词卡片大小不一，有得太大有得太小还有的会后面变小，都回退到之前的模样」）：819a007 曾引入 `FitWord`（canvas `measureText` 按容器宽解算字号 + `nowrap`，用于消灭长词折行）。真机观感被否：同轮里每个词一个字号 —— 短词被容器宽撑得过大、长词缩到很小，同屏对比忽大忽小；且首帧后 `ResizeObserver` 重算，用户看到"先大后小"的跳变。该组件已删除，三模式全部回到改造前的 `break-words` h2 + 三档（≤10 最大 / 11–14 中 / >14 小；**三模式档位本就不同，勿"顺手统一"**）。`data-fit-box` 是**无样式锚点**（自动化趁正面抓词面用，见 [验证体系](./verification.md) §3），保留。守卫 ⑭：FitWord 不许复活（文件不许存在 + 三模式不许引用）+ 逐模式档位字面量 + `break-words` 在位，变异 4/4 变红。
15. **生词本的词必须自己就能进队列**（2026-10-05 修）：`queue` 的两支（到期词、其它已学词）都用**只查词库**的 `findWord()` 解析，而空队列判据原先只看这两支 —— 于是"只有生词本"的账号（新装、换设备还没同步、或 agent 把 AI 词表灌进生词本）点复习检测是**空态**，可入口角标按进度算，照样显示「N 个到期」，用户视角就是"点了没反应"。现在把 `customEntries` 提到判据之前（`FlashcardMode.tsx:147-150`），判据加第三个条件（`:154`），补量 `fillCount` 也扣掉它（`:159`，会话仍是"补到 20 张"，不会在 20 之外再加一层）；顺带补上同一个筛选里漏掉的**屏蔽承诺**（`!prog.suspended`，之前被「不再出现」的生词本词照样出卡，与上面 otherWords 的处理不一致）。守卫 ⑧ 加 5 条：声明顺序、判据第三条件、旧判据必须消失（反向正对照）、补量扣减、屏蔽跳过 —— 4 组变异 5 条红点全中。行为对照：本机独立 profile、**零词库进度**灌 3 个词 → 修复前空态，修复后复习检测首张即 `goblemuch`。⚠️ **单本词书仍然看不见生词本**（`state.progress` 里没有 custom 键，只有 `'all'` 聚合才有）—— 这是设计而非 bug，但它让"选一本词书背生词本"这条路径不成立，改这里前先想清楚要不要连它一起统一。
16. **搭配页的滚动位置写盘是 debounce 的**（2026-10-05）：`handleCollocListScroll` 原来每个 scroll 事件都同步 `localStorage.setItem`（主线程磁盘 I/O，长列表滚动掉帧），现在 400ms 防抖（`CollocationsTab.tsx:181-189`）。两个已知边角：定时器**没在卸载时 clear**，但回调里有 `if (collocListRef.current)` 判空 —— 卸载后那次只会跳过，不会报错也不会写脏数据；代价是**滚完 400ms 内就切页会丢这一次位置**（重进页面位置略旧，属于可接受取舍）。要接新的滚动记忆就照这份抄，别退回逐事件写盘。

## 怎么验证

```bash
npm run typecheck
node scripts/verify-vocab-cards.mjs      # 310 断言：手势决策表、排卡、换卡节奏（数值锁）、答错重排延后、回看出口、断点、静默契约、换书一步生效、预载门、单词三档字号
```
交互类改动（"点了没反应"、状态不写回）静态检查看不出来 —— 用本机无头 Chrome + CDP 真点一遍（见 [验证体系](./verification.md)）。换卡耗时这类体感问题同样要按帧量：`TEMP/nt-flip-timing.mjs` 会点真实评分按钮、按帧采样卡片 DOM，直接报"进 DOM 毫秒数"。
