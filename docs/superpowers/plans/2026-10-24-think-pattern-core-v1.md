# 模式复习 v1 Implementation Plan

> 后续变更：题库已扩到每模式 5+5、会话改为三稿闭环；本文保留为 v1 执行记录。
>
> **For agentic workers:** Execute task-by-task. The controller may implement directly in this session; keep each task independently verifiable.

**Goal:** 12 个模式、四层模式地图、闭卷迁移。

**Architecture:** 数据层加 `layer` 与 4 个模式；纯函数层加 `isClosedBook` / `summarizeLayers`；UI 层按层分组并在 `repetitions >= 2` 时闭卷；守卫扩充到 12 模式。

**Tech Stack:** React 19 + TypeScript + Tailwind + 现有 `verify-*.mjs` 守卫。

## Global Constraints

- 存储键与进度 schema 不变。
- 识别题三个选项都语法成立；逐项说明 `best` 必须落在 `answer`。
- 练习界面零 toast（存储写失败的系统提示除外）。
- 日期只用 `formatDate()`，禁止 `toISOString().slice(0,10)`。
- 不新增路由、不改侧边栏六件套。

---

### Task 1: 数据层 12 模式 + 四层

**Files:**
- Modify: `src/data/think-patterns.ts`

**Interfaces:**
- Produces: `ThinkPatternLayer`, `THINK_PATTERN_LAYERS`, `IThinkPattern.layer`.

- [ ] 加 4 个模式（`hedge-stance` / `register-shift` / `compliment-response` / `result-state`），每个 3 识别 + 2 迁移 + `thinkingSteps` + `why`。
- [ ] 加 12 组逐项说明（36 条），`best` 对齐 `answer`。
- [ ] 答案分布保持 0/1/2 各 12。

### Task 2: 纯函数与层统计

**Files:**
- Modify: `src/lib/think-patterns.ts`

**Interfaces:**
- Produces: `isClosedBook(progress)`, `summarizeLayers(patterns, progress, layerIds, now, today)`.

- [ ] `isClosedBook`：`repetitions >= 2`。
- [ ] `summarizeLayers`：按层返回 `total / mastered / due`，`due` 复用 `isDue`。

### Task 3: 概览模式地图

**Files:**
- Modify: `src/pages/ThinkInEnglishPage/PatternOverview.tsx`

- [ ] 加四层统计格。
- [ ] 模式库按 `THINK_PATTERN_LAYERS` 分组，保留原有卡片展开。
- [ ] 全部掌握判断仍用 `THINK_PATTERNS.length`。

### Task 4: 闭卷迁移

**Files:**
- Modify: `src/pages/ThinkInEnglishPage/PatternReviewSession.tsx`

- [ ] `const closedBook = isClosedBook(progress)`。
- [ ] 闭卷时迁移卡不渲染 thinkingSteps，显示闭卷提示与徽章。
- [ ] 反馈卡不变。

### Task 5: 守卫与文档

**Files:**
- Modify: `scripts/verify-think-patterns.mjs`
- Modify: `docs/modules/think-in-english.md`
- Modify: `docs/modules/verification.md`
- Modify: `AGENTS.md`

- [ ] 12 模式 / 36 识别 / 24 迁移 / 36 组说明 / 四层 / 闭卷 / 层统计断言。
- [ ] 新增 M14 变异：`isClosedBook` 改成 `>= 99` 必须红。
- [ ] 更新计数与模块文档。
- [ ] 跑 `npm run typecheck`、`node scripts/verify-think-patterns.mjs`、`npm run verify:all`。

## Self-Review

- 12 个模式每个都有 `layer`、3 识别、2 迁移、3 组逐项说明。
- 闭卷只在迁移阶段生效，失败重试因 `repetitions` 重置自动开卷。
- 概览没有硬编码 8 / 12；用 `THINK_PATTERNS.length` 与 `THINK_PATTERN_LAYERS`。
