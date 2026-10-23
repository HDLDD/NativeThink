# /think 思维模式复习闭环 — 设计

- 日期：2026-10-23
- 状态：设计已确认，待实现计划
- 涉及模块：`/think`（模块 key `think`）
- 相关文档：[think-in-english.md](../../modules/think-in-english.md)、[storage-and-stats.md](../../modules/storage-and-stats.md)、[cloud-sync.md](../../modules/cloud-sync.md)、[verification.md](../../modules/verification.md)

## 1. 背景与问题

当前 `/think` 有四个 tab：中式英语检测、思维转译、反翻译训练、思维还原。它们能提供单句级的诊断和对比反馈，但学习单位仍是“一句话”：

- `nativetranslate.ts` 的 `thinkingPattern` 只是展示文本，不能复习、累计或迁移。
- 四个练习之间没有共享的“模式”概念，也没有到期/掌握状态。
- AI 反馈是自由 Markdown，无法形成可追踪的进步。
- 迁移只发生在当前句，隔天没有机制要求用户在新场景里再用一次。

本设计把“思维模式”变成可复习的学习单位，先做一个最小闭环：**诊断（模式状态）→ 对比 → 识别 → 迁移 → SM-2 复习 → 薄弱模式报告**。

## 2. 目标与非目标

### 目标

1. 在 `/think` 内提供第五个 tab「模式复习」，新用户默认进入。
2. 首批 8 个手写模式，每个模式有固定对比、识别题和迁移题。
3. 模式级 SM-2 调度，每日最多 10 个不同模式；失败当轮回队（最多 2 次），之后仍按 SM-2 到期。
4. 迁移题由 AI 按固定 rubric 判定；AI 不可用时降级为“参考表达 + 自评”，不阻塞复习。
5. 薄弱模式报告只基于本模式的复习记录（lapses、迁移失败率、上次反馈）。
6. 进度落 `safeStorage`，接 `useSyncDown`，刷新/换设备不丢。

### 非目标（本批不做）

- 首页“今日到期模式”横幅与 `?tab=patterns` 深链。
- 把纠偏本的历史条目自动归类到模式。
- 无中文源的看图/视频/音频直接表达（记录为未来方向）。
- AI 动态生成模式或模式内容。
- 模式成就、通知、社交。
- 会话断点续练（中途退出不保存当前阶段；未完成迁移的模式仍保持到期，下次重新进入即可）。

## 3. 用户路径

```
/think（默认落在“模式复习”）
  └─ 概览
       ├─ 到期/今日已练/已掌握
       ├─ 薄弱模式 Top 3
       ├─ 8 张模式卡（状态 + 下次到期）
       └─ 开始今日复习（N）
            └─ 单个模式
                 ├─ 对比卡：中式说法 vs 母语者说法 + 判断线索
                 ├─ 识别题：三选一（三个选项都语法成立，差在思维）
                 ├─ 迁移题：中文场景 → 写英文
                 ├─ AI 判定 / 离线自评
                 └─ 反馈卡：通过与否 + 一句反馈 + 参考表达
                      ├─ 失败：回队尾（最多 2 次）；每次失败都按 SM-2 记 lapse，超过重试次数后移出本轮
                      └─ 通过：推进 SM-2，进入下一个模式
            └─ 完成页：本轮通过/失败/下次到期
```

## 4. 模式库

### 4.1 首批 8 个模式

| id | 用户看到的名字 | 一句话原则 | 对比示例（中式 → 母语者） |
|---|---|---|---|
| `subject-first` | 让主语站出来 | 中文话题句先给话题，英文先给主语和动作 | 这个电影我看过 → I've seen this movie. |
| `verb-driven` | 把动作还给动词 | 少用“进行/处理/做…的…”这类名词化，直接用动词 | 对这个问题进行处理 → handle the issue |
| `end-focus` | 把重点放到句尾 | 英文倾向把新信息、长成分放在句尾 | 我昨天在咖啡馆遇到一个多年未见的老朋友 → I ran into an old friend yesterday at a café — someone I hadn't seen in years. |
| `soften-disagreement` | 先铺缓冲再否定 | 先承认/缓冲，再给不同意见 | 我不太喜欢这个主意 → To be honest, I'm not a huge fan of this idea. |
| `be-concrete` | 少说大词，多说具体 | 用具体动作和细节替代空泛形容词 | 这个方案很好，能带来很多好处 → This plan cuts our turnaround time in half. |
| `make-logic-explicit` | 把逻辑说清楚 | 中文靠意合，英文把因果/转折关系说出来 | 天气不好，我们没去 → We didn't go because the weather was terrible. |
| `polite-request` | 请求要有台阶 | 直接命令改成带缓冲的请求 | 把门关上 → Could you close the door? |
| `fill-references` | 该说的代词别省 | 中文常省主语/宾语，英文要补出指代 | 找到了吗？ → Did you find it? |

### 4.2 内容模型

新增 `src/data/think-patterns.ts`：

```ts
export interface IThinkPatternChoice {
  id: string;
  /** 中文情境或英文题干 */
  prompt: string;
  /** 三个都语法成立、差在思维模式的选项 */
  options: [string, string, string];
  /** 正确项下标 0 | 1 | 2 */
  answer: 0 | 1 | 2;
  /** 为什么这个选项更像母语者 */
  explanation: string;
}

export interface IThinkPatternTransfer {
  id: string;
  /** MVP 仍用中文场景；未来替换为图片/视频/音频提示 */
  situation: string;
  /** 给 AI 的判定重点（用户不可见） */
  rubricFocus: string;
  /** 用户提交后展示的参考表达 */
  modelAnswer: string;
}

export interface IThinkPattern {
  id: string;
  name: string;
  oneLiner: string;
  contrast: {
    chineseThinking: string;
    native: string;
    note: string;
  };
  cues: string[];
  recognition: IThinkPatternChoice[]; // 每模式 3 道
  transfer: IThinkPatternTransfer[]; // 每模式 2 道
}

export const THINK_PATTERNS: IThinkPattern[] = [/* 8 个模式 */];
```

内容要求：

- 三个识别选项都必须语法成立；错误选项只体现“中式思维/信息结构不自然”，不能靠明显语法错误送分。
- 每个模式至少 2 条判断线索，语言要短、可执行。
- 每个模式 3 道识别 + 2 个迁移场景，共 40 个内容项。
- 迁移参考表达由人写，AI 只判分，不让 AI 生成参考答案。

## 5. 复习调度

### 5.1 进度结构

新增 `src/lib/think-patterns.ts`（纯函数）与 `src/lib/use-think-patterns.ts`（存储 hook）。

```ts
export interface IThinkPatternProgress {
  patternId: string;
  status: 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;
  lastReview: number;
  lapses: number;
  firstReviewedAt: number;
  /** 首次复习的本地日期键（YYYY-MM-DD），由调用方用 formatDate 传入 */
  firstReviewedOn: string;
  recognitionCorrect: number;
  recognitionTotal: number;
  transferPasses: number;
  transferAttempts: number;
  /** 只统计 AI 判定的迁移通过；自评不计入，mastered 用它兜底 */
  aiTransferPasses: number;
  lastAttempt?: {
    at: number;
    /** 本次尝试的本地日期键，供队列判断“今天已通过/今天失败” */
    on: string;
    pass: boolean;
    recognitionCorrect: boolean;
    answer: string;    // 截断 300 字符
    feedback: string;  // 截断 400 字符
    evidence?: string; // AI 给出的证据短语，截断 200 字符
    source: 'ai' | 'self';
  };
}

export interface IThinkPatternState {
  progress: Record<string, IThinkPatternProgress>;
  /** 日期 → 当天练过的模式 id（用于今日计数与去重） */
  daily: Record<string, string[]>;
}
```

`daily` 只保留最近 31 天，读取时顺手裁剪，避免长期增长。

### 5.2 SM-2

复用句子复习的口径（`use-sentence-review.ts` 的调度）：`quality` 0–5，`<3` 视为失败。

| 本次表现 | quality | 结果 |
|---|---|---|
| 识别对 + 迁移过 | 5 | 正常推进 |
| 识别错 + 迁移过 | 4 | 正常推进，ease 轻微下降 |
| 迁移失败 | 2 | `repetitions=0`、`interval=0`、`nextReview=now`、`lapses+1` |
| AI 不可用 + 自评“做到” | 3 | 推进，但 `source='self'` |
| AI 不可用 + 自评“没做到” | 2 | 失败口径 |

- `repetitions 1 → interval 1`，`2 → 3`，之后 `interval = round(interval × easeFactor)`。
- `easeFactor` 按 SM-2 公式更新，最低 1.3。
- `applyPatternResult` 接收调用方传入的 `today`（`formatDate(new Date(now))`），写入 `firstReviewedOn` 与 `lastAttempt.on`；纯函数内部不再取当前日期。
- 状态迁移：失败 → `learning`；通过 → `reviewing`；满足掌握条件 → `mastered`。
- `mastered` 条件：`repetitions >= 4 && interval >= 21 && aiTransferPasses >= 2`。自评不计入 `aiTransferPasses`，避免离线自评把模式刷成已掌握。
- 时间一律用毫秒时间戳；日期统计用 `formatDate()`（禁止 `toISOString().slice(0,10)`）。

### 5.3 队列与每日上限

纯函数：

```ts
buildReviewQueue({
  patterns,
  progress,
  now,
  today,              // 调用方用 formatDate(new Date(now)) 传入
  maxPatterns = 10,
  maxNewPerDay = 2,
}): string[]
```

规则：

1. 到期：`nextReview <= now && status !== 'mastered'`，按 `nextReview` 升序。
2. 今天已经**通过**的模式不再进本轮：`lastAttempt?.pass === true && lastAttempt.on === today`；今天失败的模式（`lastAttempt.pass === false`）仍可回队。`daily` 只用于“今日已练”计数，不参与队列判定。
3. 新模式：没有 progress 的模式，按数据顺序；每天最多引入 2 个（用 `firstReviewedOn === today` 统计今天已引入数）。
4. 合并后截断到 `maxPatterns`（10 个不同模式）。
5. 一轮内失败：组件把该模式 id 推到会话队尾，最多重试 2 次；超过后移出本轮，但 `nextReview=now` 会让它在下一次会话再次出现。
6. 每日上限按“不同模式”算，重试不重复计数。
7. `newIntroducedToday` 取 `progress` 中 `firstReviewedOn === today` 的条数；`newBudget = max(0, maxNewPerDay - newIntroducedToday)`。纯函数不自己取当前日期，`today` 由调用方用 `formatDate()` 传入，保证守卫可注入固定日期。

### 5.4 识别/迁移题轮换

- 识别题：`progress.recognitionTotal % pattern.recognition.length`。
- 迁移题：`progress.transferAttempts % pattern.transfer.length`。
- 这样同一模式多次复习会覆盖全部题目，不依赖随机数。

## 6. AI 判定与离线降级

### 6.1 调用

使用非流式 `aiChat`（`use-ai.ts`），temperature 0.2，maxTokens 512。**不接平台 capability 插件**：插件返回的是散文，无法稳定拿到 `pass/feedback`；没有用户 Key 时直接走自评降级。每次迁移提交前：

1. `creditOnce('think', creditKey('pattern', pattern.id, answer))`（默认 1 分钟，按动作计；AI 失败不撤销）。
2. 生成 `judgeSeq`，只有当前序号的回调能写状态（离开/换题后旧 Promise 结果丢弃）。
3. `isConfigured` 为假或调用失败 → 直接进入自评降级，不弹“AI 返回格式异常”。

### 6.2 Prompt 与 JSON

System prompt 要点：

- 你是英语思维教练，只判断用户是否在新场景里用上了目标模式。
- 目标模式、原则、线索、对比、场景、用户答案全部给全。
- 语法正确但完全没体现目标模式 → `pass=false`。
- 不要重写整句，只给一句中文反馈和一个证据短语。
- 只返回 JSON：

```json
{
  "pass": true,
  "feedback": "中文 1–2 句，指出是否用上模式、最值得改的一处",
  "evidence": "用户句子里支撑判定的短语或结构；没有就空字符串"
}
```

解析：

- 先 `if (!result.trim())` → 降级；
- `extractJson` 失败、`typeof pass !== 'boolean'`、`feedback` 非字符串 → 降级；
- 成功才把 `pass/feedback` 写入 `lastAttempt`。

### 6.3 自评降级

AI 不可用时：

1. 展示该迁移题的 `modelAnswer`。
2. 两个按钮：“我用上了这个模式” / “还没做到”。
3. 映射 quality 3 / 2，`source='self'`，反馈写“自评：已对照参考表达”。
4. 自评不计入 `mastered` 的 AI 通过次数；报告中标记为“自评”。

## 7. 薄弱模式报告

数据只来自 `progress`：

- 排序：`lapses` 降序 → 迁移失败率降序 → `nextReview` 升序。
- 迁移失败率 = `transferAttempts === 0 ? 0 : (transferAttempts - transferPasses) / transferAttempts`。
- 取前 3 个有 `lapses > 0` 或 `transferPasses < transferAttempts` 的模式。
- 每项展示：模式名、lapses、迁移通过/尝试、上次反馈摘要、上次参考表达（如已有）。
- 没有薄弱项时显示“还没有薄弱模式，继续复习即可”。
- 不做跨模块归因（纠偏本接入留给未来）。

## 8. UI 与页面集成

### 8.1 页面

`ThinkInEnglishPage.tsx`：

- `usePageMemory('think-tab', 'patterns')` 默认值改为 `'patterns'`；已存过 tab 的老用户仍回到上次位置。
- Tabs 第一位加「模式复习」trigger，图标用 `Repeat` 或 `Layers`（lucide）。
- 对应 `TabsContent` 渲染 `<PatternReviewMode />`。
- 现有四个 tab 不动。

### 8.2 新组件

`src/pages/ThinkInEnglishPage/PatternReviewMode.tsx`：

- 状态：`overview | review | complete`。
- 复习阶段：`contrast | recognition | transfer | judging | feedback`。
- 概览：
  - 统计行：到期 / 今日已练 / 已掌握。
  - 主按钮「开始今日复习（N）」；N=0 且没有新额度时显示下次到期。
  - 薄弱模式 Top 3。
  - 8 张模式卡：状态、lapses、下次到期；点击可看对比卡（不直接改进度）。
- 复习：
  - 顶部 `第 x / N 个模式` + 模式名 + oneLiner。
  - 对比卡：中式说法（灰/删除线）→ 母语者说法（强调色）+ note + cues。
  - 识别题：三个选项；选中后立即显示解释；答错也允许继续，但要记录 `recognitionCorrect=false`。
  - 迁移题：场景 + textarea + 提交；提交后禁用输入并显示判定中。
  - 反馈卡：通过/未通过、AI 反馈/自评、参考表达、继续按钮；失败时文案提示“下次复习会再遇到它”。
- 完成页：本轮模式数、通过数、失败数、下次到期摘要；按不同模式计数，重试不重复；返回概览。
- 移动端 393px 不横向溢出；所有按钮沿用现有 `Button`，不新增自定义按压逻辑。
- 练习界面不弹评分/翻面/判定类 toast；错误与降级只内联展示。唯一例外是存储写失败的系统级 `warnStorageFull()`（全站 60s 去抖一条），它属于数据安全提示，不是练习反馈。

### 8.3 与现有页面的关系

- 不新增路由，不改侧边栏/底部导航。
- 不改 `MODULES`/`MODULE_PROGRESS_KEYS`；学习时长仍记 `think`，进度环自然增长。
- 现有四个 tab 的 AI、TTS、收藏、纠偏本收集逻辑不动。

## 9. 数据、存储、云同步、计时

- 新键：`__nativethink_think_pattern_progress`，走 `safeStorage`。
- `useSyncDown(() => reload())`：下行后重读，避免多设备状态陈旧。
- updater 保持纯：`grade()` 只算 next state；落盘走 `useEffect` + `loadedFromStorageRef` 跳过下行回声；`safeStorage.setItem` 返回 false 时 `warnStorageFull()`。
- 备份：`backup.ts` 按 `__nativethink_` 前缀导出，新键自动包含；无需单独改。
- 计时：迁移提交 `creditOnce('think', creditKey('pattern', pattern.id, answer))`；不新增 `moduleProgress` 键。
- 不把模式进度写进 `use-sentence-review`，避免句子复习统计/备份语义混在一起。

## 10. 文件改动清单

新增：

- `src/data/think-patterns.ts`
- `src/lib/think-patterns.ts`（纯函数 + SM-2 + 队列 + 薄弱排序）
- `src/lib/use-think-patterns.ts`（safeStorage + useSyncDown + state）
- `src/pages/ThinkInEnglishPage/PatternReviewMode.tsx`
- `scripts/verify-think-patterns.mjs`

修改：

- `src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx`（第五个 tab + 默认值）
- `scripts/verify-cloud-sync-hygiene.mjs`（订阅者 13 → 14）
- `scripts/verify-study-credit.mjs`（新增模式迁移计时点）
- `scripts/verify-ai-parse.mjs`（如解析点计数需要更新）
- `docs/modules/think-in-english.md`（新模式一节 + 注意事项）
- `docs/modules/cloud-sync.md`（订阅者数量）
- `docs/modules/verification.md`、`AGENTS.md`（守卫登记与基线）
- `CHANGELOG.md`（实现完成后补一条）

## 11. 验证计划

### 11.1 新守卫 `verify-think-patterns.mjs`

数据：

- 恰好 8 个模式，id 唯一；
- 每模式有 contrast/oneLiner/cues（≥2）；
- recognition 恰好 3 道，每道 3 个选项、answer 在 0–2、解释非空、选项互不相同；
- transfer 恰好 2 道，situation/rubricFocus/modelAnswer 非空；
- 8 个模式覆盖全部 8 个 id。

纯函数真跑：

- `applyPatternResult` 五种 quality 映射；失败重置 repetitions/interval/lapses；
- mastered 需要 reps≥4、interval≥21、≥2 次 AI 迁移通过；
- `buildReviewQueue`：到期优先、每日 10 个上限、每天最多 2 个新模式、今天已通过的不回队、今天失败的可回队；
- `getWeakPatterns` 排序（lapses → 失败率 → 到期时间）；
- `daily` 31 天裁剪。

接线：

- 页面有第五个 tab、默认 `patterns`、渲染组件；
- hook 使用 safeStorage、useSyncDown、纯 updater + persist effect、写失败可见；
- 组件 `creditOnce` 在 AI 调用之前；AI 空串/解析失败走自评降级；有 `judgeSeq` 防旧结果；
- 练习界面除存储写失败的系统级 `warnStorageFull()` 外无 toast。

变异（每条单独施加，必须恰好红对应一条）：

- M1 去掉每日 10 上限；
- M2 去掉失败回队；
- M3 去掉每天 2 个新模式上限；
- M4 失败不重置 repetitions（SM-2 失败口径被破坏）；
- M5 mastered 不看 AI 通过次数；
- M6 去掉 useSyncDown；
- M7 去掉 creditOnce；
- M8 JSON 解析失败不降级（改成抛错/弹格式异常）；
- M9 薄弱排序丢掉 lapses 优先；
- M10 识别/迁移轮换不按次数推进。

### 11.2 现有守卫与全量

- `verify-cloud-sync-hygiene`：订阅者清单加 `use-think-patterns`，13 → 14。
- `verify-study-credit`：新增模式迁移计时点，仍按“提交动作计 + 同一作答只记一次”。
- `verify-ai-parse`：新增的 `extractJson` 点有 `.trim()` 判空。
- `verify-imports-tracked`：新增文件都被 git 跟踪。
- `npm run typecheck`；`npm run verify:all`。
- 页面冒烟：开发服务器打开 `/think`，完成一轮模式复习；AI 关闭时走自评；刷新后进度/到期时间保留；失败模式回队；薄弱报告显示真实数据。

## 12. 风险与取舍

- **内容质量是最大成本**：8 个模式 × 5 个内容项，识别选项必须“语法都对、思维不同”，不能靠明显错误送分。
- **AI rubric 稳定性**：temperature 0.2 + 严格 prompt；解析失败一律降级，不把格式问题误报成用户失败。
- **自评会高估**：自评只给 quality 3，且不计入 mastered 的 AI 通过次数；报告标记来源。
- **发现入口**：MVP 只靠默认 tab；如果使用率低，下一版再加首页横幅/深链。
- **不做会话断点**：中途退出未完成迁移的模式仍然到期，下次重进即可；避免为 MVP 增加一套 session 存储。

## 13. 未来方向（不在本批实现）

1. **无中文源直接表达**：把 `transfer.situation` 从中文场景替换为图片/短视频/音频提示（“看图直接说”），复用同一套模式库、rubric、SM-2 与进度存储。需要新增媒体资产与内容管线。
2. **首页到期入口**：加“今日到期模式 N 个”横幅 + `?tab=patterns` 深链，沿用现有 `?tab=` 三道门。
3. **纠偏本归因**：把检测/写作/对话收集的错句按模式分类，作为“待诊断”候选；需要一层规则或 AI 分类。
4. **AI 生成额外迁移场景**：固定题用于可比进度，AI 生成题用于防背诵；生成题不进入 master 判定。
5. **模式 TTS**：给对比句和参考表达加手动喇叭，复用 `useTTS`。

## 14. 成功标准

- 新用户进入 `/think` 默认看到「模式复习」，能完成一轮 ≤10 个模式的对比 → 识别 → 迁移。
- 迁移通过后 SM-2 到期时间推进；失败模式当轮回队，最多 2 次；刷新后不丢。
- AI 可用时返回结构化判定；AI 不可用时能看参考表达自评完成，不误报格式异常。
- 薄弱模式报告显示真实 lapses、迁移通过/尝试与上次反馈。
- `npm run typecheck`、`npm run verify:all`、页面冒烟全绿。
