# 模式复习 v1：12 模式、四层地图与闭卷迁移

- 日期：2026-10-24
- 状态：设计已定，待实现
- 上游：[PRODUCT-DIRECTION.md](../../PRODUCT-DIRECTION.md)
- 现有闭环：[2026-10-23-think-pattern-loop-design.md](./2026-10-23-think-pattern-loop-design.md)

## 1. 目标

在现有第五个 tab「模式复习」上做第一版主线增强：

1. 模式库从 8 个扩到 12 个，补齐“结果表达、断言力度、赞美回应、语域切换”。
2. 给每个模式加 `layer` 元数据，概览按四层分组显示“模式地图 + 每层已掌握/到期”。
3. 加“闭卷迁移”：`repetitions >= 2` 时迁移卡收起“先想三步”，先把组织过程交给用户。

## 2. 非目标

- 不做思维体检 / 跨模式诊断。
- 不做独立延迟探测（7/21/60 天）。
- 不做首页横幅、`?tab=patterns` 深链。
- 不改存储键与进度的 schema。
- 不让 AI 生成模式内容。

## 3. 数据模型

`src/data/think-patterns.ts`：

```ts
export type ThinkPatternLayer = 'structure' | 'verb' | 'clarity' | 'pragmatics';

export interface IThinkPatternLayerMeta {
  id: ThinkPatternLayer;
  name: string;
  description: string;
}

export const THINK_PATTERN_LAYERS: IThinkPatternLayerMeta[] = [
  { id: 'structure', name: '信息结构', description: '谁在前、什么在后、指代是否补全' },
  { id: 'verb', name: '动词与焦点', description: '动作由谁承担、结果怎么落在句子里' },
  { id: 'clarity', name: '逻辑与信息', description: '关系是否明说、断言力度、细节是否足够' },
  { id: 'pragmatics', name: '语域与语用', description: '正式度、面子、请求/拒绝/赞美的默认脚本' },
];

export interface IThinkPattern {
  // 现有字段...
  layer: ThinkPatternLayer;
}
```

新增 4 个模式：

| id | 层 | 名字 | 核心 |
|---|---|---|---|
| `hedge-stance` | clarity | 把断言调到可讨论 | may/might/tend to/seem to；区分事实、推断、概括 |
| `register-shift` | pragmatics | 先看场景再选正式度 | 邮件/论文可正式，聊天/会议要直接；名词化不是一律错 |
| `compliment-response` | pragmatics | 赞美先接住 | 先感谢/接受，再补充，不先自贬 |
| `result-state` | verb | 把结果说进句子里 | 中文“把…V得…”→ 英文 V + O + adj 或单个动词 |

每个新模式仍为 3 识别 + 2 迁移 + 每识别题 3 条逐项说明。全库变为 **12 模式 / 36 识别 / 24 迁移 / 36 组逐项说明**，答案下标 0/1/2 各 12。

## 4. 纯函数

`src/lib/think-patterns.ts` 新增：

```ts
export function isClosedBook(
  progress?: Pick<IThinkPatternProgress, 'repetitions'> | null,
): boolean {
  return (progress?.repetitions ?? 0) >= 2;
}

export interface PatternLayerSummary {
  layerId: ThinkPatternLayer;
  total: number;
  mastered: number;
  due: number;
}

export function summarizeLayers(
  patterns: IThinkPattern[],
  progress: Record<string, IThinkPatternProgress>,
  layerIds: readonly ThinkPatternLayer[],
  now: number,
  today: string,
): PatternLayerSummary[];
```

- `isClosedBook`：第 3 次及以后复习进入闭卷；失败会重置 `repetitions`，所以重试卡自动回到开卷。
- `summarizeLayers`：只读 progress，不改任何记录；`due` 用 `isDue` 口径，未开始的模式不计入 due。

## 5. UI

### 5.1 概览

- 统计三格不变。
- 新增“模式地图”四格：每层 `已掌握/总数` 与 `到期 N`。
- 模式库按 `THINK_PATTERN_LAYERS` 分组，每组一个标题 + 描述 + 该层模式卡。
- 卡片内容与展开行为不变；全部掌握判断仍用 `THINK_PATTERNS.length`。

### 5.2 会话

- 迁移卡标题旁显示 `闭卷` 徽章（`isClosedBook(progress)`）。
- 闭卷时：
  - 不渲染「写之前先想三步」的 `<details>`；
  - 显示一行“这次闭卷：先自己组织，提交后再对照三步与线索”；
  - 反馈卡不变（仍给 why、线索、AI 证据）。
- 开卷时行为与现在完全一致。

## 6. 守卫

`scripts/verify-think-patterns.mjs`：

- 12 个模式，id 顺序追加 4 个新 id。
- 36 道识别，答案 0/1/2 各 12；24 个迁移。
- 36 组逐项说明，`best` 必须落在 `answer`。
- 每个模式有合法 `layer`；四层各至少 2 个模式；`THINK_PATTERN_LAYERS` 4 项且 id 唯一。
- `isClosedBook` 真跑：repetitions 0/1 → false，2/3 → true。
- `summarizeLayers` 真跑：总数、已掌握、到期三项。
- UI 接线：概览按层分组、会话使用 `isClosedBook` 且闭卷不渲染 thinkingSteps。
- 新增变异 M14：把 `isClosedBook` 改成 `>= 99` 必须红。

## 7. 成功标准

- 新用户能在概览看到四层模式地图与 12 张卡。
- 同一模式第 3 次复习进入闭卷迁移，失败重试回到开卷。
- 12 个模式的内容结构、答案分布、逐项说明全绿。
- `npm run typecheck`、`node scripts/verify-think-patterns.mjs`、相关全量守卫通过；393px 无横向溢出。
