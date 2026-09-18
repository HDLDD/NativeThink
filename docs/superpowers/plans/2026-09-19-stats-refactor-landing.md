# 收尾未提交的统计重构 —— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 git 仓库从全新 clone 可构建，并把工作树中已完成的统计重构等改动按主题拆成 7 个逻辑提交落库。

**Architecture:** 代码改动**已经写完**（在工作树中，未提交），因此本计划不含编码任务，只含「精确暂存 → 门禁验证 → 提交 → 构建证据」四类步骤。核心风险有两点：一是 git 钩子会在每次提交后自动改动并暂存 `CHANGELOG`，导致提交内容相互串联；二是临时验证目录里的 `node_modules` 是 junction 链接，误删会连带删除真实 `node_modules`。

**Tech Stack:** React 19 + TypeScript + Vite 8；git 2.55（`core.hooksPath=.githooks`）；PowerShell（Windows）。

**关联设计文档：** `docs/superpowers/specs/2026-09-19-stats-refactor-landing-design.md`

## Global Constraints

- **本项目无测试框架**：不存在 vitest / jest。验证手段仅四类：`npm run typecheck`、`npm run lint:eslint`、`npm run build:web`、全新 clone 构建。不要新建测试框架。
- **`pre-commit` 钩子**执行 `npm run precommit`（= `concurrently npm:typecheck npm:lint:eslint`），失败即阻断提交。**禁止**使用 `--no-verify` 或 `SKIP_GIT_HOOKS=1` 绕过。
- **`post-commit` 钩子**（`.githooks/post-commit`）会把本次提交标题追加进 `CHANGELOG.md`（带短 SHA）、`cp` 到 `public/CHANGELOG.md`、并 `git add` 两者。因此**提交 N 的日志行会落进提交 N+1**，这是预期行为，不是错误。
- **顺序硬约束**：提交 1 必须最先（否则仓库不可构建）；提交 3 必须先于提交 4（在提交 3 之前 `moduleProgress` 无 `sentences` 键，埋点会静默失效）。
- **工作树垃圾只忽略、不删除**：`.zcode/`、`.zcode-restore-backup-*/`、`.sentence-explain-state.json` 是本地工具数据。
- 日期一律用 `formatDate()`（本地日期）；**禁止** `toISOString().slice(0, 10)`（东八区 00:00–07:59 会错天）。
- 本次**无** UI 设计变更，不得改动主色 / 圆角 / 阴影语言。
- 本次**不 push**（AGENTS.md 工作约定：未明确要求不 push）。
- 提交信息使用中文，格式 `<type>(<scope>): <描述>`，与仓库既有风格一致。

---

## File Structure

| 任务 | 动作 | 文件 |
|---|---|---|
| Task 1 | 入库（未跟踪→跟踪） | `src/pages/CetExamPage/CetExamPage.tsx`、`scripts/build-cet-vocab.mjs` |
| Task 2 | 提交既有改动 | `src/lib/use-phrase-learning.ts`、`src/lib/use-spelling-learning.ts`、`src/pages/DashboardPage/HistoryCalendar.tsx` |
| Task 3 | 提交既有改动 | `src/lib/use-learning-stats.ts` |
| Task 4 | 提交既有改动 | `src/pages/SentenceLabPage/components/BuildPractice.tsx`、`src/pages/SentenceLabPage/components/ChunkDrill.tsx`、`src/pages/SpellingPage/SpellingPage.tsx` |
| Task 5 | 提交既有改动 | `src/pages/DashboardPage/ModuleProgressCard.tsx`、`src/pages/DashboardPage/QuickStartGrid.tsx`、`src/pages/DashboardPage/RingProgress.tsx`、`src/pages/ProgressPage/components/ProgressCharts.tsx`、`src/components/AppSidebar.tsx` |
| Task 6 | 提交既有改动 | `src/components/TTSSettings.tsx` |
| Task 7 | 编辑 + 入库 | `.gitignore`（编辑）、`AGENTS.md`、`docs/PRODUCT-SPEC.md`、`docs/superpowers/specs/2026-09-19-stats-refactor-landing-design.md`、`CHANGELOG.md`、`public/CHANGELOG.md` |
| Task 8 | 终态验证 | 无文件改动 |

**所有命令的工作目录**：`B:\NativeThink`（除 Task 1 的 V2 验证需切到临时目录，该步骤内已注明）。

---

## Task 1: 修复仓库完整性 —— 补入未入库的 CetExamPage

**Files:**
- Add（当前未跟踪）: `src/pages/CetExamPage/CetExamPage.tsx`
- Add（当前未跟踪）: `scripts/build-cet-vocab.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `@/pages/CetExamPage/CetExamPage` 的默认导出组件，供已提交的 `src/app.tsx:19`（`lazy(() => import(...))`）与 `src/components/AppSidebar.tsx:44`（`ROUTE_PREFETCH['/cet']`）解析。本任务完成后仓库方可构建。

- [ ] **Step 1: 把已在暂存区的 CHANGELOG 降为未暂存**

原因：让提交 1 只含 2 个文件。这 3 条 TTS 补记不会丢失，`post-commit` 会在提交 1 后重新暂存它们。

```powershell
git restore --staged CHANGELOG.md public/CHANGELOG.md
git diff --cached --name-only
```

Expected: `git diff --cached --name-only` **无任何输出**（暂存区已空）。

- [ ] **Step 2: 只暂存这 2 个文件**

```powershell
git add src/pages/CetExamPage/CetExamPage.tsx scripts/build-cet-vocab.mjs
git diff --cached --name-only
```

Expected: 恰好 2 行：
```
scripts/build-cet-vocab.mjs
src/pages/CetExamPage/CetExamPage.tsx
```

- [ ] **Step 3: 提交**

```powershell
git commit -m "fix(repo): 补入未入库的 CetExamPage 与四六级词库脚本"
```

Expected: 提交成功。`pre-commit` 会执行 typecheck + eslint；若失败会打印 `✗ pre-commit: 校验未通过，已阻断提交` 并中止——此时**不要**用 `--no-verify`，而是排查失败原因。

- [ ] **Step 4: 确认该提交恰好 2 个文件**

```powershell
git show --stat --oneline HEAD
```

Expected: `2 files changed`，且文件列表恰为上述 2 个。若出现 `CHANGELOG.md`，说明 Step 1 未生效，需回退重来。

- [ ] **Step 5: V2 门禁 —— 全新 clone 构建（本任务的核心验收）**

```powershell
Set-Location B:\NativeThink
$tmp = Join-Path $env:TEMP 'nt-freshcheck'
if (Test-Path "$tmp\node_modules") { cmd /c rmdir "$tmp\node_modules" | Out-Null }
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
git archive HEAD | tar -x -C $tmp
New-Item -ItemType Junction -Path "$tmp\node_modules" -Target "B:\NativeThink\node_modules" | Out-Null
Set-Location $tmp
node node_modules/vite/bin/vite.js build --outDir dist/client --emptyOutDir 2>&1 | Select-Object -Last 6
"FRESH_BUILD_EXIT=$LASTEXITCODE"
```

Expected: 输出含 `✓ built in`，且 `FRESH_BUILD_EXIT=0`。

对比基线：修复前同一命令为 `FRESH_BUILD_EXIT=1`，报错在 `src/app.tsx:19` 的 `CetExamPage` 导入（`系统找不到指定的路径。 (os error 3)`）。

- [ ] **Step 6: 安全清理临时目录**

**破坏性风险**：`$tmp\node_modules` 是指向真实 `node_modules` 的 junction。直接 `Remove-Item -Recurse` 会**穿透链接删除真实内容**。必须先单独摘除链接。

```powershell
Set-Location B:\NativeThink
cmd /c rmdir "$tmp\node_modules"
Remove-Item $tmp -Recurse -Force
"临时目录已删除：$(-not (Test-Path $tmp))"
"node_modules 完好：$(Test-Path B:\NativeThink\node_modules\vite)"
```

Expected: `临时目录已删除：True` 且 `node_modules 完好：True`。

- [ ] **Step 7: 提交（无新文件，本任务结束）**

无需额外提交。进入 Task 2。

---

## Task 2: 时区修复 —— 统一用本地日期

**Files:**
- Modify: `src/lib/use-phrase-learning.ts`（`todayKey()`）
- Modify: `src/lib/use-spelling-learning.ts`（`todayKey()`）
- Modify: `src/pages/DashboardPage/HistoryCalendar.tsx`（`todayStr`）

**Interfaces:**
- Consumes: `formatDate(date: Date): string`（来自 `src/lib/utils.ts`，已存在于基线）
- Produces: 无对外接口变化；`todayKey()` 返回值语义不变（`YYYY-MM-DD`），仅改为本地时区口径。

- [ ] **Step 1: 确认工作树中这 3 个文件的改动已就位**

```powershell
git diff --name-only -- src/lib/use-phrase-learning.ts src/lib/use-spelling-learning.ts src/pages/DashboardPage/HistoryCalendar.tsx
```

Expected: 3 行全部列出。

- [ ] **Step 2: 确认改动内容正确（3 处均为 formatDate 替换）**

```powershell
git diff -- src/lib/use-phrase-learning.ts src/lib/use-spelling-learning.ts src/pages/DashboardPage/HistoryCalendar.tsx 2>&1 | Select-String -Pattern 'formatDate|toISOString'
```

Expected: 每处 `-` 行为 `toISOString().slice(0, 10)`，`+` 行为 `formatDate(new Date())`；出现 `toISOString` 的 `+` 行数为 0。

- [ ] **Step 3: 暂存并提交**

```powershell
git add src/lib/use-phrase-learning.ts src/lib/use-spelling-learning.ts src/pages/DashboardPage/HistoryCalendar.tsx
git commit -m "fix(dates): 统一用本地日期，修东八区凌晨错天"
```

Expected: 提交成功，`pre-commit` 门禁通过。

- [ ] **Step 4: 确认提交内容**

```powershell
git show --stat --oneline HEAD
```

Expected: 文件列表包含上述 3 个文件，并包含 `CHANGELOG.md` 与 `public/CHANGELOG.md`（后者是 `post-commit` 自动追加的上一个提交的日志行，属预期）。

---

## Task 3: 统计重构 —— storage 权威源 + 键补全 + 广播 + 跨天感知

**Files:**
- Modify: `src/lib/use-learning-stats.ts`

**Interfaces:**
- Consumes: `safeStorage`（`src/lib/safe-storage.ts`）、`formatDate`（`src/lib/utils.ts`）
- Produces:
  - `ILearningStats.moduleProgress` 新增两个键：`sentences: number`、`cet: number`（与 `src/pages/DashboardPage/constants.ts` 的 `MODULES` 共 10 项对齐）
  - 导出常量 `STATS_CHANGED_EVENT = 'nativethink-stats-changed'`、`CALENDAR_CHANGED_EVENT = 'nativethink-calendar-changed'`
  - `useLearningStats()` 返回值签名不变：`{ stats, calendar, loaded, addStudyMinutes, setDailyGoal, resetAll, setStats, setCalendar }`
  - `addStudyMinutes(minutes: number, module: string): void` 签名不变（Task 4 依赖）

- [ ] **Step 1: 确认改动已就位**

```powershell
git diff --name-only -- src/lib/use-learning-stats.ts
```

Expected: 列出该文件。

- [ ] **Step 2: 确认键补全与旧数据兜底都在**

```powershell
Select-String -Path src/lib/use-learning-stats.ts -Pattern 'sentences:|cet:|mergeStats|STATS_CHANGED_EVENT'
```

Expected: 命中 `sentences:`、`cet:`（`DEFAULT_STATS` 中）、`mergeStats`（函数定义与调用）、`STATS_CHANGED_EVENT`（导出与监听）。

- [ ] **Step 3: 类型检查（本任务的关键验证）**

```powershell
npm run typecheck
"TYPECHECK_EXIT=$LASTEXITCODE"
```

Expected: `TYPECHECK_EXIT=0`。

- [ ] **Step 4: 暂存并提交**

```powershell
git add src/lib/use-learning-stats.ts
git commit -m "refactor(stats): storage 为权威源 + 键补全与旧数据兜底 + 跨实例广播 + 跨天感知"
```

Expected: 提交成功。

- [ ] **Step 5: 确认提交内容**

```powershell
git show --stat --oneline HEAD
```

Expected: 文件列表含 `src/lib/use-learning-stats.ts`、`CHANGELOG.md`、`public/CHANGELOG.md`。
**不得**出现 Task 4 的 3 个文件（本提交先于它们）。

---

## Task 4: 埋点接入 —— 句子学习 / 句子拼写上报学习时长

**Files:**
- Modify: `src/pages/SentenceLabPage/components/BuildPractice.tsx`
- Modify: `src/pages/SentenceLabPage/components/ChunkDrill.tsx`
- Modify: `src/pages/SpellingPage/SpellingPage.tsx`

**Interfaces:**
- Consumes: Task 3 产出的 `useLearningStats().addStudyMinutes(minutes, module)`，以及 `moduleProgress` 中的 `sentences` 键
- Produces: 无新接口

**依赖说明：** 必须在 Task 3 之后。在 Task 3 之前，`'sentences' in moduleProgress` 为假，`addStudyMinutes` 会跳过模块进度更新（不报错但功能不生效）。

- [ ] **Step 1: 确认 3 处埋点调用存在且模块键正确**

```powershell
Select-String -Path src/pages/SentenceLabPage/components/BuildPractice.tsx,src/pages/SentenceLabPage/components/ChunkDrill.tsx,src/pages/SpellingPage/SpellingPage.tsx -Pattern "addStudyMinutes\("
```

Expected: 3 行命中，模块键分别为 `'sentences'`、`'sentences'`、`'spelling'`：
- `BuildPractice.tsx`: `addStudyMinutes(0.5, 'sentences')`
- `ChunkDrill.tsx`: `if (!demo) addStudyMinutes(0.3, 'sentences')`
- `SpellingPage.tsx`: `addStudyMinutes(0.3, 'spelling')`

- [ ] **Step 2: 确认 SpellingPage 的 useCallback 依赖数组已补 addStudyMinutes**

```powershell
Select-String -Path src/pages/SpellingPage/SpellingPage.tsx -Pattern 'calculateQuality, recordAttempt, tts, addStudyMinutes'
```

Expected: 命中 1 行（避免陈旧闭包）。

- [ ] **Step 3: 暂存并提交**

```powershell
git add src/pages/SentenceLabPage/components/BuildPractice.tsx src/pages/SentenceLabPage/components/ChunkDrill.tsx src/pages/SpellingPage/SpellingPage.tsx
git commit -m "feat(stats): 句子学习/句子拼写接入学习时长上报"
```

Expected: 提交成功。

- [ ] **Step 4: 确认提交内容**

```powershell
git show --stat --oneline HEAD
```

Expected: 含上述 3 个文件 + 2 个 CHANGELOG。

---

## Task 5: 进度环与图表适配 10 个模块

**Files:**
- Modify: `src/pages/DashboardPage/ModuleProgressCard.tsx`
- Modify: `src/pages/DashboardPage/QuickStartGrid.tsx`
- Modify: `src/pages/DashboardPage/RingProgress.tsx`
- Modify: `src/pages/ProgressPage/components/ProgressCharts.tsx`
- Modify: `src/components/AppSidebar.tsx`

**Interfaces:**
- Consumes: Task 3 产出的 `sentences` / `cet` 模块键
- Produces: 无新接口

- [ ] **Step 1: 确认 5 处改动都在**

```powershell
$sel = @(
  @{f='src/pages/DashboardPage/ModuleProgressCard.tsx'; p='lg:grid-cols-5'},
  @{f='src/pages/DashboardPage/QuickStartGrid.tsx';   p="color.includes\('teal'\)"},
  @{f='src/pages/DashboardPage/RingProgress.tsx';     p='Number.isFinite'},
  @{f='src/pages/ProgressPage/components/ProgressCharts.tsx'; p="cet: '四六级备考'"},
  @{f='src/components/AppSidebar.tsx';                p="'/sentences':"}
)
foreach ($x in $sel) {
  $hit = Select-String -Path $x.f -Pattern $x.p
  "$($x.f) -> $(if ($hit) {'命中'} else {'未命中'})"
}
```

Expected: 5 行全部 `命中`。

- [ ] **Step 2: 暂存并提交**

```powershell
git add src/pages/DashboardPage/ModuleProgressCard.tsx src/pages/DashboardPage/QuickStartGrid.tsx src/pages/DashboardPage/RingProgress.tsx src/pages/ProgressPage/components/ProgressCharts.tsx src/components/AppSidebar.tsx
git commit -m "fix(dashboard): 进度环与图表适配 10 个模块（含 NaN 兜底）"
```

Expected: 提交成功。

- [ ] **Step 3: 确认提交内容**

```powershell
git show --stat --oneline HEAD
```

Expected: 含上述 5 个文件 + 2 个 CHANGELOG。

---

## Task 6: 删除 TTSSettings 中失效的动态导入

**Files:**
- Modify: `src/components/TTSSettings.tsx`

**Interfaces:**
- Consumes: `sherpaSpeak`（`src/lib/sherpa-tts.ts`，已由同文件第 24 行的静态导入提供）
- Produces: 无

**背景：** 该文件第 375 行原有 `const { sherpaSpeak } = await import('@/lib/sherpa-tts')`，但同文件第 24 行已静态导入同一模块，因此该动态导入无法起到分包作用（构建告警 `INEFFECTIVE_DYNAMIC_IMPORT`）。已改为静态引用。

- [ ] **Step 1: 确认动态导入已删除、静态导入已补 sherpaSpeak**

```powershell
Select-String -Path src/components/TTSSettings.tsx -Pattern "import\('@/lib/sherpa-tts'\)"
"(以上应无输出)"
Select-String -Path src/components/TTSSettings.tsx -Pattern 'reenableBundledEngine, sherpaSpeak, warmSherpa'
```

Expected: 第一条命令无输出；第二条命中 1 行。

- [ ] **Step 2: 暂存并提交**

```powershell
git add src/components/TTSSettings.tsx
git commit -m "refactor(tts): 删除 TTSSettings 中失效的动态导入"
```

Expected: 提交成功。

- [ ] **Step 3: 确认提交内容**

```powershell
git show --stat --oneline HEAD
```

Expected: 含 `src/components/TTSSettings.tsx` + 2 个 CHANGELOG。

---

## Task 7: 文档与 gitignore 收口

**Files:**
- Modify: `.gitignore`
- Add（已修改未提交）: `AGENTS.md`
- Add（未跟踪）: `docs/PRODUCT-SPEC.md`
- Add（未跟踪）: `docs/superpowers/specs/2026-09-19-stats-refactor-landing-design.md`
- Add（未跟踪）: `docs/superpowers/plans/2026-09-19-stats-refactor-landing.md`（本计划文档自身）
- Add（部分已在暂存区）: `CHANGELOG.md`、`public/CHANGELOG.md`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 编辑 `.gitignore`，追加 3 条忽略规则**

在文件末尾（`# 句料扩量脚本的断点状态（本地用，不入库）` 与 `.sentence-auto-state.json` 之后）追加：

```gitignore

# 本地工具目录与脚本断点状态（本地用，不入库）
.zcode/
.zcode-restore-backup-*/
.sentence-explain-state.json
```

- [ ] **Step 2: 验证忽略规则生效且未误伤已跟踪文件**

```powershell
git check-ignore -v .zcode .sentence-explain-state.json
"--- 已跟踪文件不应被忽略 ---"
git check-ignore -v src/pages/CetExamPage/CetExamPage.tsx
"(第二条应无输出)"
```

Expected: 前两条各返回一条匹配规则；第三条**无输出**（已被跟踪的文件不受影响）。

- [ ] **Step 3: 确认其余待提交文件都已就位**

```powershell
git status --short
```

Expected: 应看到 `M AGENTS.md`、`?? docs/PRODUCT-SPEC.md`（或已暂存）、`M .gitignore`，且 `.zcode/`、`.zcode-restore-backup-*/`、`.sentence-explain-state.json` **不再出现**。

- [ ] **Step 4: 暂存并提交（含 CHANGELOG，收口全部遗留日志）**

```powershell
git add .gitignore AGENTS.md docs/PRODUCT-SPEC.md docs/superpowers/specs/2026-09-19-stats-refactor-landing-design.md docs/superpowers/plans/2026-09-19-stats-refactor-landing.md CHANGELOG.md public/CHANGELOG.md
git commit -m "docs: AGENTS.md 拆分 + PRODUCT-SPEC 入库 + 设计文档 + CHANGELOG 补记 + gitignore 补漏"
```

Expected: 提交成功。

- [ ] **Step 5: 确认提交内容**

```powershell
git show --stat --oneline HEAD
```

Expected: 含 `.gitignore`、`AGENTS.md`、`docs/PRODUCT-SPEC.md`、设计文档、本计划文档、2 个 CHANGELOG。

---

## Task 8: 终态验证

**Files:** 无改动

- [ ] **Step 1: 工作树只剩 1 条 CHANGELOG 行**

```powershell
git status --short
```

Expected: 仅 1 条 `M  CHANGELOG.md`（或 `M  public/CHANGELOG.md` 同时出现）——即 Task 7 提交自身的日志行，由 `post-commit` 自动暂存。这是项目既有稳态，**不算未完成**。不得出现任何未跟踪源码文件。

- [ ] **Step 2: 提交历史符合预期（7 个提交，顺序正确）**

```powershell
git log --oneline -7
```

Expected（由新到旧）：
```
docs: AGENTS.md 拆分 + PRODUCT-SPEC 入库 + 设计文档 + CHANGELOG 补记 + gitignore 补漏
refactor(tts): 删除 TTSSettings 中失效的动态导入
fix(dashboard): 进度环与图表适配 10 个模块（含 NaN 兜底）
feat(stats): 句子学习/句子拼写接入学习时长上报
refactor(stats): storage 为权威源 + 键补全与旧数据兜底 + 跨实例广播 + 跨天感知
fix(dates): 统一用本地日期，修东八区凌晨错天
fix(repo): 补入未入库的 CetExamPage 与四六级词库脚本
```

- [ ] **Step 3: V1 静态门禁复跑**

```powershell
npm run typecheck
"TYPECHECK_EXIT=$LASTEXITCODE"
npm run lint:eslint
"ESLINT_EXIT=$LASTEXITCODE"
```

Expected: 两个 exit 均为 0。

- [ ] **Step 4: V2 全新 clone 构建复跑（终态仓库可构建）**

```powershell
$tmp = Join-Path $env:TEMP 'nt-freshcheck'
if (Test-Path "$tmp\node_modules") { cmd /c rmdir "$tmp\node_modules" | Out-Null }
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
Set-Location B:\NativeThink
git archive HEAD | tar -x -C $tmp
New-Item -ItemType Junction -Path "$tmp\node_modules" -Target "B:\NativeThink\node_modules" | Out-Null
Set-Location $tmp
node node_modules/vite/bin/vite.js build --outDir dist/client --emptyOutDir 2>&1 | Select-Object -Last 6
"FRESH_BUILD_EXIT=$LASTEXITCODE"
Set-Location B:\NativeThink
cmd /c rmdir "$tmp\node_modules"
Remove-Item $tmp -Recurse -Force
"node_modules 完好：$(Test-Path B:\NativeThink\node_modules\vite)"
```

Expected: `FRESH_BUILD_EXIT=0` 且 `node_modules 完好：True`。

- [ ] **Step 5: 本地生产构建复跑**

```powershell
npm run build:web
"BUILD_EXIT=$LASTEXITCODE"
```

Expected: `BUILD_EXIT=0`。

---

## 验收对照（设计文档第 8 节）

| 验收标准 | 对应步骤 |
|---|---|
| V1：typecheck 与 eslint 均 exit 0 | Task 3 Step 3、Task 8 Step 3 |
| V2：提交 1 后全新 clone 构建 exit 0（修复前为 exit 1） | Task 1 Step 5、Task 8 Step 4 |
| 7 个提交按顺序落库 | Task 1–7，Task 8 Step 2 |
| 无残留未跟踪源码文件 | Task 7 Step 2–3、Task 8 Step 1 |
| 工作树剩余改动仅 1 条 CHANGELOG 行 | Task 8 Step 1 |
