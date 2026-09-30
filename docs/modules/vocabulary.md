# 词汇深度（`/vocabulary`）

> 代码：`src/pages/DeepVocabularyPage/`（页面 1 个 + `components/` 5 个，约 7,700 行）+ `src/lib/` 里 6 个支撑模块
> 数据来自：[词库数据层](./wordbank-data.md) · 朗读见 [朗读引擎](./tts.md) · 守卫：`npm run verify:vocab-cards`（254 断言）
> 最后校准：2026-09-29

## 这个模块是什么

背单词的主场，六种学习方式共用一套进度与 SM-2 状态：

| 模式 key | 名称 | 组件 | 干什么 |
|---|---|---|---|
| `daily` | 每日学习 | `components/DailyLearningMode.tsx` | 按每日计划学新词，内含**六小题型**（见下） |
| `quickcard` | 快速闪卡 | `components/QuickCardMode.tsx` | 只看词形，认识/不认识两键过卡，可批量留档 |
| `flashcard` | 复习检测 | `components/FlashcardMode.tsx` | SM-2 五档评分复习到期待巩固的词 |
| `browse` | 词库浏览 | 内联在 `DeepVocabularyPage.tsx:1114-1685` | 筛选/搜索/翻页浏览整本书 |
| `collocations` | 搭配学习 | `components/CollocationsTab.tsx` | 高频搭配与短语 |
| `vocabtest` | 词汇量测试 | `components/VocabSizeTest.tsx` | 1 分钟估算词汇量，含近 10 次趋势 |

模式清单定义在 `DeepVocabularyPage.tsx:78-85`。

## 入口与状态机（改这里最容易出事）

页面有**三个正交的开关**，别把它们混成一个：

- `setupDone`（`:371-377`，键 `__nativethink_vocab_setup_done`）—— 是否完成过首启设置。
- `showWizard`（`:377`）—— 向导遮罩是否显示。首次自动 `true`。
- `immersed`（`:847`）—— 是否已进入某个模式。**模式内容写在 `{!showWizard && immersed && dataReady && <Tabs/>}`（`:1018-1025`）里**，只改 `tab` 不改 `immersed` 的话，用户会"选完了却停在列表上"。

因此有两条完成路径，走的是两套代码：

| 路径 | 函数 | 行为 |
|---|---|---|
| 首次设置（三步：词书 → 方式 → 开始） | `handleWizardComplete` `:425-444` | 必须 `handleTabChange(mode)` + `setImmersed(true)`，选完直接落进该模式 |
| 换书（已设过的人） | `handleSwitchBook` `:453-458` | **点一本就切**，学习方式/每日量/复习模式全部不动，也**刻意不清**该书今日配额 |
| 继续上次 | `handleWizardContinue` `:460-470` | 同首次：直接进上次的模式 |

预载门在 `:391-407`：`!setupDone` 时**一本都不预载**（否则新人还没选书就要下载九本 ≈40MB）；预载失败走 `catch + finally` 放开 `dataReady`，不会把人卡在"加载中"。

## 每日学习的六小题型

`DailyLearningMode.tsx:27` 定义 `ReviewMode`，选择器在 `:792-799,1036-1055`，会话队列（到期优先 + 补新词）在 `startSession:352-413`：

闪卡 `:1191-1331`（评分 `handleRate:565`）· 选择题 `:1334-1398`（干扰项同词性优先 `generateChoiceOptions:489-502`）· 拼写 `:1401-1520` · 听写 `:1523-1645` · 配对 `:1647-1730`（4 词对对碰 `generateMatchPairs:505`）· 填空 `:1732-1847`（例句挖空 `getFillBlankSentence:524`）。

## SM-2 与"答错重排"

算法在 `src/lib/use-word-learning.ts` 的 `sm2Update:184-220`：

- 评分 **0 / 2 / 3 / 4 / 5**（键盘 1-5 映射见 `FlashcardMode.tsx:480`、`DailyLearningMode.tsx:916`）。
- `quality ≥ 3`：rep0 → 1 天，rep1 → 3 天，之后 `interval × EF`；`< 3` 重置 `rep=0, interval=1`。
- EF 初始 2.5、下限 1.3（`IWordProgress:27-42`）；`rep ≥ 5` 记为已掌握（`:213`）。
- 到期口径 `:287-292`，**排除 `suspended`（"不再出现"）**。
- `wrongCount` 在 `quality ≤ 2` 时累加、答对清零（`:354-356`），驱动复习检测的"错词重练"入口。

答错重排：`RELEARN_GAP = 4`、`MAX_RELEARN = 2`（`src/lib/vocab-session.ts:14-16`），插入前先移除旧位置、超出队尾不回绕（`:37-53`）。

> ⚠️ **重排有三份平行实现**：`vocab-session.ts`（复习检测用）、`DailyLearningMode.tsx:541-552`（自写 splice，**不去旧位置**）、`QuickCardMode.tsx:366-382`（queue 与 results 同步 splice）。改一处参数**不会**同步另两处。

## 断点续学与存储键清单

全部经 `safeStorage`（带用户前缀），断点键**按 level 分**：

| 键 | 用途 | 位置 |
|---|---|---|
| `__nativethink_vocab_session_<level>` | 复习检测断点（读时校验下标越界即作废） | `use-word-learning.ts:143-164` |
| `__nativethink_daily_session_<level>` | 每日学习断点 | `DailyLearningMode.tsx:807-846` |
| `__nativethink_quickcard_session_<level>` | 快速闪卡断点（含作答/翻面/暂停） | `quickcard-history.ts:233-237` |
| `__nativethink_quickcard_runs` / `_pending` | 留档（≤20 轮、单轮 ≤300 词）与余数桶 | `quickcard-history.ts:18-25,129,164-206` |
| `__nativethink_daily_quota_<level>` / `__nativethink_daily_vocab_count` | 每本今日量 / 全局默认量 | `use-word-learning.ts:23-25,166-181` |
| `__nativethink_vocab_autospeak` | 自动发音开关，**默认开**（只有显式存 `'0'` 才算关）。2026-09-30 起**四处都读** —— 快速闪卡原先完全不读它、出卡无条件朗读，本轮补齐（门控 effect + 进度行开关） | `FlashcardMode.tsx:33,64-67`、`DailyLearningMode.tsx:34,219-221`、`QuickCardMode.tsx`（AUTO_SPEAK_KEY）、`ChunkTrainingPage.tsx:100,373-379` |
| `__nativethink_level_memory` | 浏览位置记忆 —— **故意用裸 `localStorage`**（不经 safeStorage 就不会因登录前缀变化而"隐身"，也因此不参与云同步，见 [storage-and-stats.md](./storage-and-stats.md) §3.2/§3.4） | `DeepVocabularyPage.tsx:322-328`、`wordbank.ts:477` |

## 收藏 / 生词本 / 助记

- 收藏与 `FavoritesPage` 同源（`use-favorites.ts`，键 `__nativethink_favorites`）。⚠️ **同一个"收藏单词"存两种 type**：词库浏览用 `'vocabulary'`（`DeepVocabularyPage.tsx:858-865`），每日学习与快速闪卡用 `'word'`（`DailyLearningMode.tsx:422-437`、`QuickCardMode.tsx:151-164`）。判重/统计必须同时看两个 type。
- 生词本 `custom-words.ts`（键 `__nativethink_custom_words`）：阅读器收集词库未收录的词，词条 `level:'custom'`（`:106`），进度经 `SUB_LEVELS` 走独立一路；复习队列优先纳入已学过的 custom 词（`FlashcardMode.tsx:151-154`）。
- 助记 `word-notes.ts`（键 `__nativethink_word_notes`）：**目前只有复习检测卡背接了线**（`FlashcardMode.tsx:1024-1045`），其它模式不显示。

## 注意事项

1. **`memo` 依赖里必须有"数据到位"信号**：`filteredWords` 的 deps 带 `dataReady, dataVersion`（`:524`）；`DailyLearningMode` 的「本书进度」memo 只依赖 `progressKeyCount`（`:73-84`）—— 所以模式子树必须等 `dataReady` 才挂载，否则数据晚到不会重算，表现为"选了书、进度条整块消失"。
2. **本轮顺序必须冻结**：队列若直接依赖 `state.progress`，每评一次分就重算、当前题会漂（`FlashcardMode.tsx:56-60,119-155`）。`use-stable-shuffle` 只被思维页与语块页使用，**本模块没有用它**。
3. **ref 不随组件重挂载归零**：`lastSpokenKey` 一类要在每轮开始显式清空（`FlashcardMode.tsx:165-172,412,436`、`QuickCardMode.tsx:120-126,177,221`），否则"第二轮起第一张卡不出声"。
4. **`setState` updater 里不许有副作用**（toast / 落盘 / 改 ref）—— StrictMode 双调用会翻倍（`DailyLearningMode.tsx:223-227`、`QuickCardMode.tsx:360-364`）。
5. **完成判定不能读闭包里的 `queue.length`**：重排插入后那是旧值，最后一卡答错会被直接判完成（`QuickCardMode.tsx:338-350` 用 `queueRef.current.length`）。
6. **Esc 监听阶段不一致**：`QuickCardMode.tsx:467` 与 `DailyLearningMode.tsx:893` 用**捕获阶段**（AGENTS.md 规定），而 `FlashcardMode.tsx:263-270` 用冒泡阶段 + `!document.querySelector('[role="dialog"]')` 守卫 —— 按同一条坑，Radix 在 document 冒泡阶段已同步 flush 掉 dialog，这个守卫可能失效。改这块请照捕获阶段那两处写。
7. **嵌套按钮一律 `span` + `stopPropagation`**（`DeepVocabularyPage.tsx:1266-1294,1428`），否则触发 React 的 button 嵌套告警且父级 `onClick` 会重复执行。
8. **已知未接线**：向导里的「已学单词 (SM-2) / 整本随机」选择会写 `__nativethink_review_mode`（`:439`）并被页面读进 state（`:378`），**但没有任何消费方** —— `FlashcardMode` 只收 `level` 与 `counts`（`:1111`）。目前这个选择无实际效果。

## 怎么验证

```bash
npm run typecheck
node scripts/verify-vocab-cards.mjs      # 254 断言：手势决策表、排卡、评分后翻页、断点、静默契约、换书一步生效、预载门
```
交互类改动（"点了没反应"、状态不写回）静态检查看不出来 —— 用本机无头 Chrome + CDP 真点一遍（见 [验证体系](./verification.md)）。
