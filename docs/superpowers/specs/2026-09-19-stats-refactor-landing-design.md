# 收尾未提交的统计重构 —— 设计文档

- 日期：2026-09-19
- 状态：待评审
- 关联：[AGENTS.md](../../../AGENTS.md)、[ROADMAP.md](../../../ROADMAP.md)
- 基线提交：`104e1a1`

---

## 1. 背景与问题

工作树积累了一批未提交改动。经逐文件核查，它们**不是单一特性**，而是五件独立的事，其中包含两个真实缺陷。

### 1.1 阻断缺陷：git 仓库当前不可构建（已实测复现）

| 事实 | 证据 |
|---|---|
| 已提交的 `src/app.tsx:19` 引用该页面 | `lazy(() => import("@/pages/CetExamPage/CetExamPage"))` |
| 已提交的 `src/components/AppSidebar.tsx:44` 同样引用 | `ROUTE_PREFETCH` 的 `/cet` 项 |
| 但 `src/pages/CetExamPage/` 在 git 中 **0 个文件** | `git ls-files src/pages/CetExamPage` 无输出 |

**实测复现**：`git archive HEAD` 导出到临时目录（= 模拟全新 clone，491 个文件）后执行生产构建：

```
19 │ const CetExamPage = lazy(() => import("@/pages/CetExamPage/CetExamPage"));
   ╰── 系统找不到指定的路径。 (os error 3)
FRESH_BUILD_EXIT=1
```

**影响**：任何从 git 全新 clone 或 CI 构建都会失败。本项目部署在 Cloudflare Pages（从 git 构建），**部署链路当前是断的**。

根因是典型的「本地能跑」：作者本地存在该文件（未跟踪），构建通过，但从未 `git add`。

### 1.2 已提交状态存在进度环缺陷

| 位置 | 状态 |
|---|---|
| 已提交 `src/pages/DashboardPage/constants.ts` 的 `MODULES` | **含** `key: 'sentences'`、`key: 'cet'`（共 10 项） |
| 已提交 `src/lib/use-learning-stats.ts` 的 `moduleProgress` | **缺** `sentences`、`cet`（仅 8 项） |

这正是 AGENTS.md 坑表所记「`moduleProgress` 缺 key 或 key 与 MODULES 不一致 → 进度环 NaN / 0%」。未提交的改动正是在修它。

### 1.3 未入库的配套资产

- `scripts/build-cet-vocab.mjs`（6.3 KiB）
- `docs/PRODUCT-SPEC.md`（7.5 KiB）—— `AGENTS.md` 已引用它，不入库则文档断链

### 1.4 工作树垃圾

`.zcode/`、`.zcode-restore-backup-20260918-224242/`、`.sentence-explain-state.json` 均未被 `.gitignore` 覆盖（`.gitignore` 中**只**忽略了 `.sentence-auto-state.json`）。

---

## 2. 目标与非目标

### 目标

1. 让 git 仓库从全新 clone 可构建（硬门禁：第 4 节 V2 通过）
2. 把未提交改动按主题拆成逻辑提交落库
3. 补齐未入库文件；工作树垃圾**只忽略、不删除**
4. 全程通过 pre-commit 门禁（typecheck + eslint）

### 非目标（本次明确不做）

- `cet` 死键治理（见 7.1）
- `sentences` / `spelling` 配色重复（见 7.2）
- `addStudyMinutes` 内部重复写盘逻辑收敛（见 7.3）
- 打包体积优化（已单独判定为不优先）
- 运行时浏览器验证（V3）

理由：已确认范围为「验证 + 补齐 + 拆分提交」。遗留问题登记于第 7 节，不静默丢弃。

---

## 3. 改动清单（按主题）

| 主题 | 内容 | 文件 |
|---|---|---|
| **A. 统计重构** | 补 `sentences`/`cet` 键；`mergeStats()` 旧数据兜底；抽出 `readStatsFromStorage` 等纯函数；新增 `STATS_CHANGED_EVENT`/`CALENDAR_CHANGED_EVENT` 跨实例广播；`setDailyGoal`/`addStudyMinutes` 改为「以 storage 为权威源」防陈旧闭包；新增跨天感知 `todayStr`（30s 轮询 + `visibilitychange`） | `src/lib/use-learning-stats.ts` |
| **B. 时区修复** | 3 处 `new Date().toISOString().slice(0, 10)` → `formatDate(new Date())`（东八区 00:00–07:59 会落在 UTC「昨天」） | `use-phrase-learning.ts`、`use-spelling-learning.ts`、`DashboardPage/HistoryCalendar.tsx` |
| **C. 埋点接入** | 练习完成时上报学习时长：`sentences` ×2、`spelling` ×1 | `SentenceLabPage/components/BuildPractice.tsx`、`ChunkDrill.tsx`、`SpellingPage/SpellingPage.tsx` |
| **D. 十模块 UI 适配** | 进度环网格列数（`md:grid-cols-6` → `md:grid-cols-3 lg:grid-cols-5`）；`RingProgress` 加 `Number.isFinite` 防 NaN；`ProgressCharts` 配色与名称补全；`QuickStartGrid` 补 teal 阴影；`AppSidebar` 补 `/sentences` 路由预取 | `DashboardPage/ModuleProgressCard.tsx`、`QuickStartGrid.tsx`、`RingProgress.tsx`、`ProgressPage/components/ProgressCharts.tsx`、`components/AppSidebar.tsx` |
| **E. 完整性补齐** | 见 1.3、1.4 | 见第 6 节 |

---

## 4. 验证方案

### V1 静态门禁

```
npm run typecheck      # 实测 exit 0
npm run lint:eslint    # 实测 exit 0
```

`pre-commit` 钩子执行的 `npm run precommit` 即 `concurrently typecheck + eslint`，与本项一致。

### V2 全新 clone 构建（硬门禁）

```
$tmp = Join-Path $env:TEMP 'nt-freshcheck'
New-Item -ItemType Directory $tmp
git archive <commit> | tar -x -C $tmp
New-Item -ItemType Junction "$tmp\node_modules" -Target "B:\NativeThink\node_modules"
Set-Location $tmp
node node_modules/vite/bin/vite.js build --outDir dist/client --emptyOutDir
```

- 修复前实测 **exit 1**（证据见 1.1）
- 修复后**必须 exit 0**
- 在提交 1 完成后立即执行一次，作为该提交的验收

**清理注意（破坏性风险）**：`node_modules` 是 junction 链接，直接用 `Remove-Item -Recurse` 删除临时目录会**穿透链接删掉真实的 `B:\NativeThink\node_modules`**。必须先 `cmd /c rmdir "$tmp\node_modules"` 单独摘除链接，再删目录。

---

## 5. Git 钩子行为

项目已启用 `core.hooksPath = .githooks`，两个钩子对提交方案有决定性影响：

| 钩子 | 行为 |
|---|---|
| `pre-commit` | 执行 `npm run precommit`（typecheck + eslint），不通过则**阻断提交** |
| `post-commit` | 把提交标题追加进 `CHANGELOG.md`（带短 SHA）、`cp` 到 `public/CHANGELOG.md`、并 `git add` 两者 |

**推论**：提交 N 的日志行会被自动暂存，从而落进提交 N+1。这是该项目的既有稳态——当前暂存区里那 3 条 TTS 补记（`104e1a1`、`35dc142`、`064836a`）正是历史提交的残留。

因此 CHANGELOG 的落库时机与提交顺序耦合，处理方式见第 6 节预步骤。

---

## 6. 提交计划（共 7 个）

### 顺序约束

- **提交 1 必须最先**：否则中间态仓库不可构建
- **提交 3 必须先于提交 4**：提交 3 之前 `moduleProgress` 无 `sentences` 键，埋点调用会因 `modKey in newModuleProgress` 为假而**静默失效**（不报错，但功能不生效）
- 提交 2、5、6 无顺序依赖

### 预步骤

```
git restore --staged CHANGELOG.md public/CHANGELOG.md
```

把已在暂存区的 3 条 TTS 补记降为未暂存。它们**不会被丢弃**：`post-commit` 会在提交 1 结束后立刻把 `CHANGELOG` 重新加入暂存区，因此这 3 条补记将随**提交 2** 落库。

这样做的唯一目的是让提交 1（`fix(repo)`）保持干净——它应当**只含 2 个文件**。若不做此预步骤，3 条补记会混进提交 1。

### 提交列表

| # | 提交信息 | 文件 |
|---|---|---|
| 1 | `fix(repo): 补入未入库的 CetExamPage 与四六级词库脚本` | `src/pages/CetExamPage/CetExamPage.tsx`、`scripts/build-cet-vocab.mjs` |
| 2 | `fix(dates): 统一用本地日期，修东八区凌晨错天` | 主题 B 的 3 个文件 |
| 3 | `refactor(stats): storage 为权威源 + 键补全与旧数据兜底 + 跨实例广播 + 跨天感知` | `src/lib/use-learning-stats.ts` |
| 4 | `feat(stats): 句子学习/句子拼写接入学习时长上报` | 主题 C 的 3 个文件 |
| 5 | `fix(dashboard): 进度环与图表适配 10 个模块（含 NaN 兜底）` | 主题 D 的 5 个文件 |
| 6 | `refactor(tts): 删除 TTSSettings 中失效的动态导入` | `src/components/TTSSettings.tsx` |
| 7 | `docs: AGENTS.md 拆分 + PRODUCT-SPEC 入库 + CHANGELOG 补记 + gitignore 补漏` | `AGENTS.md`、`docs/PRODUCT-SPEC.md`、`.gitignore`、`CHANGELOG.md`、`public/CHANGELOG.md`、**本设计文档** `docs/superpowers/specs/2026-09-19-stats-refactor-landing-design.md`、**实施计划** `docs/superpowers/plans/2026-09-19-stats-refactor-landing.md` |

**与已批准的 6 提交方案的差异**：多出提交 6。原因是 `src/components/TTSSettings.tsx` 的改动产生于本次会话早先的排查（删除一个失效的动态导入），原方案制定时未计入，但它同样需要归位，故总数为 7。它不属于统计重构，因此独立成提交而非并入主题 A 或 D。

### 预期终态

工作树仅剩 **1 条已暂存的 CHANGELOG 行**（第 7 个提交自身的日志），与项目既有稳态一致，不视为未完成。

---

## 7. 已知遗留（本次不修，登记备查）

### 7.1 `cet` 是死键

全项目 `addStudyMinutes` 共 21 处调用，覆盖 `think`、`chunks`、`conversation`、`shadowing`、`vocabulary`、`writing`、`articles`、`spelling`、`sentences` **共 9 个模块，`cet` 为 0 处**——因为 `/cet` 只是跳转到 `cetthink.pages.dev` 的外链页。

结果：「四六级备考」进度环恒为 0%。需产品决策：接入上报、还是从 `MODULES` 移除该环。

### 7.2 配色重复

`MODULES` 中 `sentences` 与 `spelling` 的 `color` 同为 `#F59E0B`；`ProgressCharts` 的 `MODULE_COLORS` 忠实复制了该重复，两模块图表同色。

### 7.3 `addStudyMinutes` 未复用 `saveStats`

该函数内部重复了 `setStats` / `writeStatsToStorage` / `notifyChanged` 三步，与 `saveStats` 行为一致但代码重复。

### 7.4 写入方自触发重读（非缺陷）

写入实例也监听 `STATS_CHANGED_EVENT`，因此自己的写入会触发一次冗余 `loadFromStorage`。行为幂等（读回同值），仅多一次状态更新，无死循环（`loadFromStorage` 不广播）。

---

## 8. 验收标准

1. V1：`npm run typecheck` 与 `npm run lint:eslint` 均 exit 0
2. V2：提交 1 之后，全新 clone 构建 exit 0（修复前为 exit 1）
3. 7 个提交按第 6 节顺序落库，且每个提交后的仓库状态可构建
4. 无残留的未跟踪源码文件（`.zcode/` 等已由 `.gitignore` 覆盖）
5. 工作树剩余改动仅为 1 条 CHANGELOG 行
