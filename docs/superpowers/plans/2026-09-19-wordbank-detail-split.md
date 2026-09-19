# wordbank detail 按需加载 —— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 wordbank 的 detail 字段（`collocations` / `examples` / `deepExplanation`）拆到独立文件按需加载，使 `GlobalWordSearch` 的 9 级预加载由 9.66 MB gzip 降至 ≈2.8 MB，且搜索行为完全不变。

**Architecture:** `loadLevel(level, withDetail = true)` 默认仍"核心 + detail"一起加载（故所有走 `preloadLevels` 的流程字节数与行为完全不变）；新增 `preloadCoreOnly` 供只做搜索的流程使用。唯一必需改造的消费方是 `GlobalWordSearch`。

**Tech Stack:** React 19 + TypeScript + Vite 8；Node 24（脚本）；TypeScript 编译器（`transpileModule`，作数据加载手段）；PowerShell（Windows）。

**关联设计文档：** `docs/superpowers/specs/2026-09-19-wordbank-detail-split-design.md`

## Global Constraints

- **本项目无测试框架**（无 vitest/jest）。验证手段只有五类：`npm run typecheck`、`npm run lint:eslint`、`npm run build:web`、全新 clone 构建、**V4 Node 断言工具**。**不要新建测试框架**。
- **`pre-commit` 钩子**执行 `npm run precommit`（typecheck + eslint），失败阻断提交；**禁止** `--no-verify`。
- **`post-commit` 钩子**会把提交标题追加进 `CHANGELOG.md` 并 `git add` 之，故**提交 N 的日志行落入提交 N+1**；工作树长期保留 1 条已暂存 CHANGELOG 行是**预期稳态**。
- **不允许中间态回归**：Task 2 依赖 `preloadLevels` 契约不变，因此词汇页/拼写页/阅读器**一行都不能改**。
- **`applyDetail` 必须就地修改字段**，禁止 `w = {...w, ...d}` 形式的重建（`_levelIndex`/`_allWordsCache` 持有同一批对象引用，重建会让 detail 永不可见）。
- 数据文件存在**两种引号风格**（`zhongkao`/`gaokao`/`postgraduate`/`professional` 单引号，其余双引号）；**禁止用正则解析数据文件**，一律用 `ts.transpileModule` + 动态 import。
- 日期一律 `formatDate()`；本次无 UI 设计变更，不得改动主色/圆角/阴影语言。
- 本次**不 push**。
- 所有命令工作目录：`B:\NativeThink`。

---

## File Structure

| 任务 | 动作 | 文件 |
|---|---|---|
| Task 1 | 新增（验证工具） | `scripts/verify-wordbank-split.mjs` |
| Task 2 | 新增 | `scripts/split-wordbank-detail.mjs` |
| Task 2 | 改写（数据） | `src/data/wordbank/data/{zhongkao,gaokao,cet4,cet6,ielts,toefl,postgraduate,professional,advanced}.ts` |
| Task 2 | 新增（数据） | 同名 9 个 `.detail.ts` |
| Task 2 | 修改 | `src/data/wordbank/schema.ts`、`src/data/wordbank/wordbank.ts`、`package.json`、`src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx` |
| Task 3 | 修改 | `src/components/GlobalWordSearch.tsx` |
| Task 4 | 修改 | `src/pages/ArticlePage/components/PageReader.tsx`、`src/components/AppSidebar.tsx`、`src/components/MobileBottomNav.tsx`、`AGENTS.md` |

---

## Task 1: 建立 V4 验证基线（行为不变）

**Files:**
- Create: `scripts/verify-wordbank-split.mjs`

**Interfaces:**
- Consumes: 现有 9 个数据文件（**未拆分状态**，detail 字段有真实值）
- Produces: 基线 JSON 文件（存于 `%TEMP%`，仅本次迁移用），结构：
  ```json
  { "levels": { "<level>": { "count": 18471,
      "expectedHasCollocations": { "<word>": true },
      "collocOnlyIds": ["<word>", "..."] } } }
  ```

**为什么必须最先做**：验收标准要求"`collocOnly` 结果集与改动前逐条相同"。拆分后再也无法得知"改动前"是什么——基线必须先留存。

- [ ] **Step 1: 写验证工具**

创建 `scripts/verify-wordbank-split.mjs`：

```js
#!/usr/bin/env node
/**
 * wordbank detail 拆分的验证工具（V4）。
 *
 * 两种模式：
 *   node scripts/verify-wordbank-split.mjs --baseline <out.json>   拆分前采集基线
 *   node scripts/verify-wordbank-split.mjs --check    <in.json>    拆分后逐项断言
 *
 * 用 tsc 转译加载数据、不用正则：数据文件是 TS 对象字面量且存在两种引号风格
 * （zhongkao/gaokao/postgraduate/professional 用单引号），正则方案会静默漏掉这 4 个等级。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
const TMP = path.join(process.env.TEMP || '/tmp', 'wb-verify-load');
fs.mkdirSync(TMP, { recursive: true });

/** 转译一个 TS 数据模块并返回其导出的数组（导出名含 WORDS 或 DETAIL） */
export async function loadModule(file, kind) {
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmp = path.join(TMP, `${path.basename(file, '.ts')}.mjs`);
  fs.writeFileSync(tmp, js);
  const mod = await import(pathToFileURL(tmp).href);
  const key = Object.keys(mod).find((k) => k.toUpperCase().includes(kind));
  if (!key) throw new Error(`${file}: 未找到含 ${kind} 的导出（实际导出：${Object.keys(mod).join(',')}）`);
  return mod[key];
}

const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); };

async function collect() {
  const out = {};
  for (const lv of LEVELS) {
    const core = await loadModule(path.join(DATA_DIR, `${lv}.ts`), 'WORDS');
    const detailFile = path.join(DATA_DIR, `${lv}.detail.ts`);
    const detail = fs.existsSync(detailFile)
      ? await loadModule(detailFile, 'DETAIL')
      : null;
    out[lv] = { core, detail };
  }
  return out;
}

async function baseline(outFile) {
  const data = await collect();
  const snap = { levels: {} };
  for (const lv of LEVELS) {
    const { core } = data[lv];
    const expectedHasCollocations = {};
    const collocOnlyIds = [];
    for (const e of core) {
      const w = e.word.toLowerCase();
      const has = Array.isArray(e.collocations) && e.collocations.length > 0;
      expectedHasCollocations[w] = has;
      if (has) collocOnlyIds.push(w);
    }
    snap.levels[lv] = { count: core.length, expectedHasCollocations, collocOnlyIds: collocOnlyIds.sort() };
  }
  fs.writeFileSync(outFile, JSON.stringify(snap));
  console.log(`基线已写入 ${outFile}`);
  for (const lv of LEVELS) {
    console.log(`  ${lv.padEnd(13)} ${String(snap.levels[lv].count).padStart(6)} 条  collocOnly=${snap.levels[lv].collocOnlyIds.length}`);
  }
}

async function check(baselineFile) {
  const snap = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const data = await collect();

  for (const lv of LEVELS) {
    const base = snap.levels[lv];
    const { core, detail } = data[lv];

    // ① 条目数与 hasCollocations 逐条一致
    ok(core.length === base.count, `${lv}: 条目数 ${core.length} ≠ 基线 ${base.count}`);
    for (const e of core) {
      const w = e.word.toLowerCase();
      const expect = base.expectedHasCollocations[w];
      if (expect === undefined) { fail.push(`${lv}: 出现基线中不存在的词 ${w}`); continue; }
      ok(e.hasCollocations === expect, `${lv}/${w}: hasCollocations=${e.hasCollocations} ≠ 基线 ${expect}`);
    }

    // ② detail 源文件与核心占位互补：有 detail 的词，核心占位必须为空
    if (!detail) {
      fail.push(`${lv}: 缺少 ${lv}.detail.ts`);
    } else {
      for (const e of core) {
        if (e.collocations.length || e.examples.length || e.deepExplanation) {
          fail.push(`${lv}/${e.word}: 核心文件仍含真实 detail（未拆分干净）`);
          break;
        }
      }
    }

    // ③ collocOnly 结果集（用 hasCollocations）与基线完全相同
    const nowIds = core.filter((e) => e.hasCollocations).map((e) => e.word.toLowerCase()).sort();
    ok(JSON.stringify(nowIds) === JSON.stringify(base.collocOnlyIds),
      `${lv}: collocOnly 结果集与基线不同（基线 ${base.collocOnlyIds.length} / 现在 ${nowIds.length}）`);
  }

  // ④ applyDetail 必须就地修改：验证共享引用
  await checkApplyDetail(data);

  if (fail.length) {
    console.log(`FAIL：${fail.length} 项`);
    for (const m of fail.slice(0, 20)) console.log('  - ' + m);
    process.exit(1);
  }
  console.log(`全部断言通过（9 个等级，共 ${LEVELS.reduce((s, l) => s + snap.levels[l].count, 0)} 条词条）`);
}

/**
 * ④ 把真实 wordbank.ts 转译后调用其真实的 applyDetail，
 *    并断言「索引里持有的同一批对象」也被更新（防 applyDetail 被写成重建对象）。
 */
async function checkApplyDetail(data) {
  const wbFile = path.resolve(__dirname, '../src/data/wordbank/wordbank.ts');
  let src = fs.readFileSync(wbFile, 'utf8');
  // 替换运行时依赖为桩，其余源码不改
  src = src.replace(/^import \{ idbGet, idbSet \} from '@\/lib\/idb';$/m,
    'const idbGet = async () => null; const idbSet = async () => {};');
  src = src.replace(/^import type \{[^}]*\} from '\.\/schema';$/m, '');
  // 若 applyDetail 尚不存在（例如在 Task 2 之前误跑 --check），给出明确提示而不是 ReferenceError
  if (!/function applyDetail/.test(src)) {
    fail.push('wordbank.ts 中尚无 applyDetail —— --check 只能在 Task 2 完成后运行（Task 1 阶段只跑 --baseline）');
    return;
  }
  // 静态守卫：levels.map(loadLevel) 会把 map 传的索引当成 withDetail，
  // 导致第一个等级（索引 0，falsy）永远不加载 detail —— 不报错，界面只是空着。
  ok(!/levels\.map\(loadLevel\)/.test(src),
    'preloadLevels 用了 levels.map(loadLevel) —— map 的索引会被当作 withDetail，第一个等级不会加载 detail');
  src += '\nexport { applyDetail, _levelCache };\n';
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmp = path.join(TMP, 'wordbank-under-test.mjs');
  fs.writeFileSync(tmp, js);
  const wb = await import(pathToFileURL(tmp).href);

  const lv = 'advanced';
  const core = data[lv].core;
  const detail = data[lv].detail;
  if (!detail) { fail.push('advanced: 无 detail，跳过 ④'); return; }

  wb._levelCache[lv] = core;
  // 模拟 ensureIndexes 的行为：把同一批对象引用放进"索引"
  const indexRefs = core.slice(0, 50);
  const sample = indexRefs.find((e) => detail[e.word.toLowerCase()]);
  if (!sample) { fail.push('advanced: 前 50 条中没有带 detail 的词，无法验证 ④'); return; }

  const beforeLen = sample.collocations.length + sample.examples.length;
  wb.applyDetail(lv, detail);
  const afterLen = sample.collocations.length + sample.examples.length;
  ok(afterLen > beforeLen, `④ applyDetail 未生效（${beforeLen} → ${afterLen}）`);

  const fromIndex = indexRefs.find((e) => e.word === sample.word);
  ok(fromIndex && (fromIndex.collocations.length + fromIndex.examples.length) > beforeLen,
    `④ 索引中持有的对象未被更新 —— applyDetail 很可能被写成重建对象（共享引用已断）`);
}

const argv = process.argv.slice(2);
const bi = argv.indexOf('--baseline');
const ci = argv.indexOf('--check');
if (bi >= 0) await baseline(argv[bi + 1]);
else if (ci >= 0) await check(argv[ci + 1]);
else { console.error('用法: --baseline <out.json> | --check <in.json>'); process.exit(2); }
```

- [ ] **Step 2: 采集基线（此时数据尚未拆分）**

```powershell
cd B:\NativeThink
node scripts/verify-wordbank-split.mjs --baseline "$env:TEMP\wb-baseline.json"
"EXIT=$LASTEXITCODE"
```

Expected: 打印 9 行等级统计，末行 `基线已写入 ...`，`EXIT=0`。条目数应为：zhongkao 3223、gaokao 6008、cet4 4542、cet6 7404、ielts 6609、toefl 10367、postgraduate 9602、professional 8887、advanced 18471。

- [ ] **Step 3: 提交**

```powershell
git add scripts/verify-wordbank-split.mjs
git commit -m "test(wordbank): 新增 detail 拆分的 V4 断言工具并采集改动前基线"
```

Expected: 提交成功（`pre-commit` 跑 typecheck + eslint，脚本在 `scripts/` 下不参与 `eslint src`）。

---

## Task 2: 数据层 + 加载层（行为等价，无体积收益）

**Files:**
- Create: `scripts/split-wordbank-detail.mjs`
- Modify: `src/data/wordbank/data/*.ts`（9 个，由脚本改写）
- Create: `src/data/wordbank/data/*.detail.ts`（9 个，由脚本产出）
- Modify: `src/data/wordbank/schema.ts`
- Modify: `src/data/wordbank/wordbank.ts`
- Modify: `package.json`
- Modify: `src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx:451`

**Interfaces:**
- Consumes: Task 1 的基线 JSON
- Produces:
  - `IWordDetail { collocations: string[]; examples: IExample[]; deepExplanation: string }`
  - `IWordDetailMap = Record<string, IWordDetail>`
  - `IWordEntry.hasCollocations: boolean`
  - `preloadCoreOnly(levels: string[]): Promise<void>`
  - `preloadDetail(levels: string[]): Promise<void>`
  - `isDetailReady(level: string): boolean`
  - `preloadLevels(levels: string[]): Promise<void>` —— **契约不变**

- [ ] **Step 1: 写拆分脚本**

创建 `scripts/split-wordbank-detail.mjs`：

```js
#!/usr/bin/env node
/**
 * 把 wordbank 每个等级的 detail 字段拆到独立的 <level>.detail.ts。
 *
 * 为什么用 tsc 转译而不是正则：数据文件是 TS 对象字面量，且存在两种引号风格
 * （zhongkao/gaokao/postgraduate/professional 用单引号，其余用双引号）。
 * 正则方案会静默漏掉这 4 个等级。
 *
 * 幂等：若 <level>.detail.ts 已存在且主文件已含 hasCollocations，则跳过。
 *
 * ⚠️ 重跑任何词库生成器后必须再跑本脚本，否则 detail 会重新混回主文件。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../src/data/wordbank/data');
const LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];
const TMP = path.join(process.env.TEMP || '/tmp', 'wb-split-load');
fs.mkdirSync(TMP, { recursive: true });

const q = (s) => JSON.stringify(String(s ?? ''));
const strArr = (a) => '[' + (Array.isArray(a) ? a : []).map(q).join(',') + ']';
const exArr = (a) => '[' + (Array.isArray(a) ? a : [])
  .map((e) => `{en:${q(e?.en)},zh:${q(e?.zh)}}`).join(',') + ']';

async function loadEntries(level) {
  const file = path.join(DATA_DIR, `${level}.ts`);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const tmp = path.join(TMP, `${level}-in.mjs`);
  fs.writeFileSync(tmp, js);
  const mod = await import(pathToFileURL(tmp).href);
  const key = Object.keys(mod).find((k) => k.toUpperCase().includes('WORDS'));
  return { file, src: fs.readFileSync(file, 'utf8'), entries: mod[key] };
}

const HEADER = (lv, n) => `// ${lv} wordbank — ${n} words
// Data source: KyleBing/english-vocabulary (MIT license)
// Generated by scripts/generate-wordbank.ts, then split by scripts/split-wordbank-detail.mjs
// detail 字段（collocations/examples/deepExplanation）已移至 ${lv}.detail.ts，此处为空占位。
import type { IWordEntry } from '../schema';

`;

let changed = 0;
for (const lv of LEVELS) {
  const detailFile = path.join(DATA_DIR, `${lv}.detail.ts`);
  const { file, src, entries } = await loadEntries(lv);

  if (fs.existsSync(detailFile) && src.includes('hasCollocations:')) {
    console.log(`${lv.padEnd(13)} 已拆分，跳过`);
    continue;
  }

  // ── 核心文件：核心字段 + hasCollocations + detail 空占位 ──
  const coreLines = entries.map((e) => {
    const has = Array.isArray(e.collocations) && e.collocations.length > 0;
    return '  {'
      + `word:${q(e.word)},phonetic:${q(e.phonetic)},partOfSpeech:${q(e.partOfSpeech)},`
      + `meaning:${q(e.meaning)},level:${q(e.level)},frequencyRank:${Number(e.frequencyRank) || 0},`
      + `register:${q(e.register)},emotion:${q(e.emotion)},topics:${strArr(e.topics)},`
      + `hasNoChineseEquivalent:${Boolean(e.hasNoChineseEquivalent)},hasCollocations:${has},`
      + `collocations:[],examples:[],deepExplanation:"",`
      + `synonyms:${strArr(e.synonyms)},antonyms:${strArr(e.antonyms)},wordFamily:${strArr(e.wordFamily)}`
      + '},';
  }).join('\n');
  fs.writeFileSync(file, `${HEADER(lv, entries.length)}export const ${lv.toUpperCase()}_WORDS: IWordEntry[] = [\n${coreLines}\n];\n`);

  // ── detail 文件：只收录真的有内容的词条 ──
  const detailRows = [];
  for (const e of entries) {
    const collocations = Array.isArray(e.collocations) ? e.collocations : [];
    const examples = Array.isArray(e.examples) ? e.examples : [];
    const deepExplanation = e.deepExplanation || '';
    if (!collocations.length && !examples.length && !deepExplanation) continue;
    detailRows.push(`  ${q(e.word.toLowerCase())}:{collocations:${strArr(collocations)},examples:${exArr(examples)},deepExplanation:${q(deepExplanation)}},`);
  }
  fs.writeFileSync(detailFile,
    `// ${lv} wordbank detail — 由 scripts/split-wordbank-detail.mjs 产出，请勿手改
import type { IWordDetailMap } from '../schema';

export const ${lv.toUpperCase()}_DETAIL: IWordDetailMap = {
${detailRows.join('\n')}
};
`);
  console.log(`${lv.padEnd(13)} 核心 ${entries.length} 条 / detail ${detailRows.length} 条`);
  changed++;
}
console.log(changed ? `已拆分 ${changed} 个等级` : '全部已拆分，无改动');
```

- [ ] **Step 2: 运行拆分脚本**

```powershell
cd B:\NativeThink
node scripts/split-wordbank-detail.mjs
"EXIT=$LASTEXITCODE"
```

Expected: 打印 9 行「核心 N 条 / detail M 条」，末行 `已拆分 9 个等级`，`EXIT=0`。若打印「已拆分，跳过」说明脚本重跑过，属正常幂等行为。

- [ ] **Step 3: 确认产物形态**

```powershell
cd B:\NativeThink
"=== 核心文件应含 hasCollocations 与空占位 ==="
Select-String -Path src\data\wordbank\data\advanced.ts -Pattern 'hasCollocations:true' | Select-Object -First 1
Select-String -Path src\data\wordbank\data\advanced.ts -Pattern 'collocations:\[\],examples:\[\],deepExplanation:""' | Select-Object -First 1
"=== detail 文件应存在且已入库（9 个） ==="
(Get-ChildItem src\data\wordbank\data\*.detail.ts).Count
```

Expected: 前两条各命中 1 行；最后输出 `9`。

- [ ] **Step 4: 改 `schema.ts`**

在 `src/data/wordbank/schema.ts` 中，于 `IExample` 定义之后插入：

```ts
/** detail 字段集合（按需加载，存放于 <level>.detail.ts） */
export interface IWordDetail {
  collocations: string[];
  examples: IExample[];
  deepExplanation: string;
}

/** key = word.toLowerCase() */
export type IWordDetailMap = Record<string, IWordDetail>;
```

并在 `IWordEntry` 的 `hasNoChineseEquivalent: boolean;` 之后插入：

```ts
  /** 等价于 collocations.length > 0；让 collocOnly 过滤不依赖 detail 的加载时机 */
  hasCollocations: boolean;
```

- [ ] **Step 5: 改 `wordbank.ts` 的加载层**

**(a)** 在 `const _loading: Map<string, Promise<void>> = new Map();` 之后插入：

```ts
// ── detail 按需加载状态（与核心的 _loaded / _loading 正交）──
const _detailCache: Record<string, IWordDetailMap> = {};
const _detailLoaded: Set<string> = new Set();
const _detailLoading: Map<string, Promise<void>> = new Map();
const DETAIL_IDB_PREFIX = 'wb_detail_';
const DETAIL_LS_PREFIX = '__nativethink_wbd_';
```

**(b)** 把 `CACHE_VERSION` 由 `2` 改为 `3`，并在其后追加注释：

```ts
const CACHE_VERSION = 3; // v3: detail 拆分为独立文件 + 词条新增 hasCollocations
```

**(c)** 在**原 `loadLevel`（下一步会被重命名为 `loadCore`）之后**插入 `loadDetail` 与 `applyDetail`。顺序最终为：`loadCore` → `loadDetail` / `applyDetail` → `loadLevel` 包装。

```ts
/** 把 detail 就地补齐到已加载的核心词条上（禁止重建对象，见下方注释） */
function applyDetail(level: string, map: IWordDetailMap): void {
  const words = _levelCache[level];
  if (!words) return;
  for (const w of words) {
    const d = map[w.word.toLowerCase()];
    if (!d) continue;
    w.collocations = d.collocations ?? [];
    w.examples = d.examples ?? [];
    w.deepExplanation = d.deepExplanation ?? '';
  }
}
// 注意：以上必须就地改字段。ensureIndexes() 的 deduped.push(w)/all.push(w) 推入的是
// 同一批对象引用，就地补齐可自动对 _levelIndex/_allWordsCache/_wordIndex 生效；
// 若写成 w = {...w, ...d} 重建对象，三个索引仍指向旧对象，detail 将永远不可见且不报错。

async function loadDetail(level: string): Promise<void> {
  if (_detailLoaded.has(level)) return;
  if (_detailLoading.has(level)) { await _detailLoading.get(level); return; }

  const p = (async () => {
    // 缓存命中
    try {
      const idb = await idbGet<{ v: number; d: IWordDetailMap }>(`${DETAIL_IDB_PREFIX}${level}`);
      if (idb?.v === CACHE_VERSION && idb.d) {
        _detailCache[level] = idb.d; applyDetail(level, idb.d); _detailLoaded.add(level); return;
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(`${DETAIL_LS_PREFIX}${level}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.v === CACHE_VERSION && parsed.d) {
          idbSet(`${DETAIL_IDB_PREFIX}${level}`, parsed).catch(() => {});
          _detailCache[level] = parsed.d; applyDetail(level, parsed.d); _detailLoaded.add(level); return;
        }
      }
    } catch { /* ignore */ }

    // 网络加载
    let mod: Record<string, IWordDetailMap>;
    switch (level) {
      case 'zhongkao': mod = await import('./data/zhongkao.detail'); break;
      case 'gaokao': mod = await import('./data/gaokao.detail'); break;
      case 'cet4': mod = await import('./data/cet4.detail'); break;
      case 'cet6': mod = await import('./data/cet6.detail'); break;
      case 'ielts': mod = await import('./data/ielts.detail'); break;
      case 'toefl': mod = await import('./data/toefl.detail'); break;
      case 'postgraduate': mod = await import('./data/postgraduate.detail'); break;
      case 'professional': mod = await import('./data/professional.detail'); break;
      case 'advanced': mod = await import('./data/advanced.detail'); break;
      default: return;
    }
    const key = Object.keys(mod).find((k) => k.toUpperCase().includes('DETAIL'));
    const map: IWordDetailMap = key ? (mod as any)[key] : {};
    _detailCache[level] = map;
    applyDetail(level, map);
    _detailLoaded.add(level);

    const data = { v: CACHE_VERSION, d: map };
    idbSet(`${DETAIL_IDB_PREFIX}${level}`, data).catch(() => {});
    try { localStorage.setItem(`${DETAIL_LS_PREFIX}${level}`, JSON.stringify(data)); } catch { /* quota */ }
  })();

  _detailLoading.set(level, p);
  try { await p; } finally { _detailLoading.delete(level); }
}
```

**(d)** 把现有 `loadLevel` **重命名为 `loadCore`**，再新增一个薄包装作为新的 `loadLevel`。

**为什么必须这样改（不要在原函数末尾追加）**：现有 `loadLevel` 在命中缓存时会 `return` 提前退出：

```ts
  const cached = await loadFromCache(level);
  if (cached) { _levelCache[level] = cached; _loaded.add(level); invalidateIndexes(); return; }
```

若把 detail 加载追加到函数末尾，**缓存命中路径会直接 return，detail 永远不会加载** —— 老用户二次访问时详情面板会全空。因此必须用包装函数保证两条路径都覆盖。

第一步，把：

```ts
async function loadLevel(level: string): Promise<void> {
```

改为：

```ts
async function loadCore(level: string): Promise<void> {
```

第二步，在 `loadDetail` 定义之后新增包装（注意 `loadLevel` 必须在 `loadCore` 与 `loadDetail` 都定义之后）：

```ts
/**
 * 加载等级。withDetail 默认为 true —— 与改动前行为完全一致（核心 + detail），
 * 因此所有走 preloadLevels 的既有消费方无需任何改动。
 * 只做搜索/查词的流程用 preloadCoreOnly 跳过 detail。
 */
async function loadLevel(level: string, withDetail = true): Promise<void> {
  await loadCore(level);
  if (withDetail) {
    try { await loadDetail(level); } catch { /* detail 失败不阻断核心可用 */ }
  }
}
```

第三步，确认其余引用仍指向 `loadLevel`（它们本就是调用 `loadLevel`，无需改动）：`loadAll` 内的 `await loadLevel(lvl)`、`preloadLevels` 内的 `levels.map(loadLevel)`、`preloadProgressive` 内的 `loadLevel(level)`。

**(e)** 在 `preloadLevels` 之后追加新导出：

```ts
/** 只加载核心字段（不含 detail）—— 供仅做搜索/查词的流程使用 */
export function preloadCoreOnly(levels: string[]): Promise<void> {
  return Promise.all(levels.map((l) => loadLevel(l, false))).then(() => {});
}

/** 按需加载 detail（幂等、并发安全、失败静默） */
export function preloadDetail(levels: string[]): Promise<void> {
  return Promise.all(levels.map((l) => loadDetail(l).catch(() => {}))).then(() => {});
}

export function isDetailReady(level: string): boolean { return _detailLoaded.has(level); }
```

**(f)** 文件顶部 import 行补上类型：

```ts
import type { IWordEntry, IWordQuery, IWordDetailMap } from './schema';
```

**(g) 必须修 `preloadLevels` 的 `map` 传参 —— 否则第一个等级永远不会加载 detail**

现有实现是：

```ts
export function preloadLevels(levels: string[]): Promise<void> {
  return Promise.all(levels.map(loadLevel)).then(() => {});
}
```

`Array.prototype.map` 会把 **(元素, 索引, 数组)** 三个参数都传给回调。给 `loadLevel` 加上第二参数 `withDetail` 后，`map` 传进去的**索引**就成了 `withDetail`：第一个等级得到 `0`（falsy）→ **detail 不加载**；其余等级得到 `1`、`2`…（truthy）→ 正常加载。这是一个不报错、只让第一个等级详情面板变空的隐蔽 bug。

改为显式箭头函数：

```ts
export function preloadLevels(levels: string[]): Promise<void> {
  return Promise.all(levels.map((l) => loadLevel(l, true))).then(() => {});
}
```

同时确认 `loadAll` 内的 `await loadLevel(lvl)` 与 `preloadProgressive` 内的 `await loadLevel(level)` 都是显式单参调用（它们本就是，无需改动）。

- [ ] **Step 6: 加 npm 脚本**

在 `package.json` 的 `scripts` 中，`"check:tts-voices"` 之后插入：

```json
    "wordbank:split": "node scripts/split-wordbank-detail.mjs",
```

- [ ] **Step 7: 改 `DeepVocabularyPage.tsx:451` 的 `collocOnly` 过滤**

把：

```ts
    if (collocOnly) words = words.filter((w) => w.collocations.length > 0);
```

改为：

```ts
    if (collocOnly) words = words.filter((w) => w.hasCollocations);
```

- [ ] **Step 8: 跑 V1 与 V2**

```powershell
cd B:\NativeThink
npm run typecheck 2>&1 | Select-Object -Last 4; "TYPECHECK_EXIT=$LASTEXITCODE"
npm run lint:eslint 2>&1 | Select-Object -Last 4; "ESLINT_EXIT=$LASTEXITCODE"
npm run build:web 2>&1 | Select-Object -Last 2; "BUILD_EXIT=$LASTEXITCODE"
```

Expected: 三个 exit 均为 0。

- [ ] **Step 9: 跑 V4 断言（对照 Task 1 基线）**

```powershell
cd B:\NativeThink
node scripts/verify-wordbank-split.mjs --check "$env:TEMP\wb-baseline.json"
"VERIFY_EXIT=$LASTEXITCODE"
```

Expected: 末行 `全部断言通过（9 个等级，共 75113 条词条）`，`VERIFY_EXIT=0`。

若 ④ 失败并提示"共享引用已断"，说明 `applyDetail` 被写成了重建对象——按 Step 5(c) 的注释改回就地赋值。

- [ ] **Step 10: 提交**

```powershell
git add scripts/split-wordbank-detail.mjs src/data/wordbank src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx package.json
git commit -m "refactor(wordbank): detail 字段拆分为独立文件 + 按需加载层（preloadLevels 契约不变）"
```

Expected: 提交成功。

---

## Task 3: GlobalWordSearch 改用仅核心预加载（体积收益落地）

**Files:**
- Modify: `src/components/GlobalWordSearch.tsx`

**Interfaces:**
- Consumes: Task 2 的 `preloadCoreOnly` / `preloadDetail` / `isDetailReady`
- Produces: 无新接口

**为什么这是唯一必需改造的消费方**：其余消费方都走 `preloadLevels`（核心 + detail），契约未变即正确。

- [ ] **Step 1: import 补上新 API**

把第 22 行的 import 改为（在现有列表中加入三个新函数）：

```ts
import { queryWords, preloadLevels, preloadCoreOnly, preloadDetail, isDetailReady, getEssentialLevels, isAllReady, getWordCounts, WORD_COUNTS } from '@/data/wordbank';
```

> 若 lint 报 `preloadLevels` 未使用，直接从 import 列表中删掉它即可（Step 2 会把两处调用都换成 `preloadCoreOnly`）。

- [ ] **Step 2: 两处预加载改为仅核心**

第 69 行：

```ts
      preloadLevels(essential).then(() => {
```
改为：
```ts
      preloadCoreOnly(essential).then(() => {
```

第 75 行：

```ts
        remaining.forEach(level => preloadLevels([level]));
```
改为：
```ts
        remaining.forEach(level => preloadCoreOnly([level]));
```

- [ ] **Step 3: 新增 detail 按需加载**

在第 61 行 `const [expandedWord, setExpandedWord] = useState<string | null>(null);` 之后插入：

```ts
  // 展开词的 detail 按需加载：完整词库只预加载了核心字段
  const [detailReady, setDetailReady] = useState(false);
```

并在第 78 行 `}, [open, dataReady]);` 之后插入：

```ts
  // 展开某词时才加载该等级的 detail（幂等；已在缓存中则同步就绪）
  useEffect(() => {
    if (!expandedWord) { setDetailReady(false); return; }
    const entry = results.find((w) => w.word.toLowerCase() === expandedWord.toLowerCase());
    if (!entry) { setDetailReady(false); return; }
    if (isDetailReady(entry.level)) { setDetailReady(true); return; }
    let alive = true;
    setDetailReady(false);
    preloadDetail([entry.level]).then(() => { if (alive) setDetailReady(true); });
    return () => { alive = false; };
  }, [expandedWord, results]);
```

- [ ] **Step 4: 详情面板在 detail 未就绪时显示占位**

在第 288 行 `{word.examples.length > 0 && (` 之前插入：

```tsx
                          {!detailReady && (
                            <p className="text-xs text-muted-foreground">正在加载搭配与例句…</p>
                          )}
```

- [ ] **Step 5: 跑 V1 / V2 / V4**

```powershell
cd B:\NativeThink
npm run typecheck 2>&1 | Select-Object -Last 4; "TYPECHECK_EXIT=$LASTEXITCODE"
npm run lint:eslint 2>&1 | Select-Object -Last 4; "ESLINT_EXIT=$LASTEXITCODE"
node scripts/verify-wordbank-split.mjs --check "$env:TEMP\wb-baseline.json"; "VERIFY_EXIT=$LASTEXITCODE"
npm run build:web 2>&1 | Select-Object -Last 2; "BUILD_EXIT=$LASTEXITCODE"
```

Expected: 四个 exit 均为 0。

- [ ] **Step 6: 提交**

```powershell
git add src/components/GlobalWordSearch.tsx
git commit -m "perf(wordbank): 全局搜索改用仅核心预加载，展开词时按需加载 detail"
```

---

## Task 4: 可选优化三处 + 文档约定

**Files:**
- Modify: `src/pages/ArticlePage/components/PageReader.tsx`
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 2 的 `preloadCoreOnly`
- Produces: 无

**为什么可选**：这三处只做查词/预热，从不使用 detail 字段（已由全量 grep 确认），改为仅核心可再省约 1.75 MB gzip，且各只改一行。

- [ ] **Step 1: `PageReader.tsx` 改为仅核心**

import 行加入 `preloadCoreOnly`，并把第 393 行：

```ts
      preloadLevels(essential);
```
改为：
```ts
      preloadCoreOnly(essential);
```

随后从该文件的 import 列表中移除已不再使用的 `preloadLevels`。

- [ ] **Step 2: `AppSidebar.tsx` 改为仅核心**

import 行加入 `preloadCoreOnly`，并把第 94、95 行两处：

```ts
preloadLevels(['cet4'])
```
均改为：
```ts
preloadCoreOnly(['cet4'])
```

随后移除已不再使用的 `preloadLevels` 导入。

- [ ] **Step 3: `MobileBottomNav.tsx` 改为仅核心**

同 Step 2：import 换 `preloadCoreOnly`，第 49 行的 `preloadLevels(['cet4'])` 改为 `preloadCoreOnly(['cet4'])`。

- [ ] **Step 4: 跑 V1 / V2 / V3**

```powershell
cd B:\NativeThink
npm run typecheck 2>&1 | Select-Object -Last 4; "TYPECHECK_EXIT=$LASTEXITCODE"
npm run lint:eslint 2>&1 | Select-Object -Last 4; "ESLINT_EXIT=$LASTEXITCODE"
npm run build:web 2>&1 | Select-Object -Last 2; "BUILD_EXIT=$LASTEXITCODE"
```

Expected: 三个 exit 均为 0。

- [ ] **Step 5: V3 全新 clone 构建**

```powershell
Set-Location B:\NativeThink
$tmp = Join-Path $env:TEMP 'nt-freshcheck'
if (Test-Path "$tmp\node_modules") { cmd /c rmdir "$tmp\node_modules" | Out-Null }
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
git archive HEAD | tar -x -C $tmp
New-Item -ItemType Junction -Path "$tmp\node_modules" -Target "B:\NativeThink\node_modules" | Out-Null
Set-Location $tmp
node node_modules/vite/bin/vite.js build --outDir dist/client --emptyOutDir 2>&1 | Select-Object -Last 3
"FRESH_BUILD_EXIT=$LASTEXITCODE"
Set-Location B:\NativeThink
cmd /c rmdir "$tmp\node_modules"
Remove-Item $tmp -Recurse -Force
"node_modules 完好：$(Test-Path B:\NativeThink\node_modules\vite)"
```

Expected: `FRESH_BUILD_EXIT=0` 且 `node_modules 完好：True`。

> **破坏性风险**：`$tmp\node_modules` 是指向真实 `node_modules` 的 junction。直接 `Remove-Item -Recurse` 会穿透链接删除真实内容——**必须先 `cmd /c rmdir` 单独摘除**。

- [ ] **Step 6: 在 `AGENTS.md` 补充词库拆分约定**

在「工作约定」小节中「5. 打包体积敏感」之后插入：

```markdown
6. **改词库后必须重跑 `npm run wordbank:split`**：`src/data/wordbank/data/<level>.ts` 只保留核心字段，detail（搭配/例句/深度解释）在 `<level>.detail.ts`。任何词库生成器都会重新写出全字段主文件，重跑拆分脚本即可恢复。拆分脚本幂等，可安全重复执行。
```

并把原第 6、7 条顺延为 7、8。

- [ ] **Step 7: 提交**

```powershell
git add src/pages/ArticlePage/components/PageReader.tsx src/components/AppSidebar.tsx src/components/MobileBottomNav.tsx AGENTS.md
git commit -m "perf(wordbank): 查词/预热路径改为仅核心加载 + 补充改词库后重跑拆分的约定"
```

---

## V5 体积验收（Task 3 或 4 之后执行一次）

- [ ] **Step 1: 测量拆分后各级核心的体积与 gzip**

```powershell
$script = @'
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const base = 'B:/NativeThink/src/data/wordbank/data/';
const levels = ['zhongkao','gaokao','cet4','cet6','ielts','toefl','postgraduate','professional','advanced'];
const MB = (n) => (n/1024/1024).toFixed(2);
let cg = 0, dg = 0;
console.log('等级'.padEnd(14)+'核心gzip'.padStart(10)+'细节gzip'.padStart(10));
for (const lv of levels) {
  const core = gzipSync(readFileSync(base+lv+'.ts')).length;
  const det  = gzipSync(readFileSync(base+lv+'.detail.ts')).length;
  cg += core; dg += det;
  console.log(lv.padEnd(14)+MB(core).padStart(10)+MB(det).padStart(10));
}
console.log('-'.repeat(34));
console.log('合计'.padEnd(12)+MB(cg).padStart(10)+MB(dg).padStart(10));
console.log(`核心合计 ${MB(cg)} MB（改动前 9 级全量 9.66 MB）`);
'@
$p = Join-Path $env:TEMP 'wb-v5.mjs'
Set-Content -Path $p -Value $script -Encoding UTF8
node $p
Remove-Item $p -ErrorAction SilentlyContinue
```

Expected: 核心合计 **≤3.2 MB**（预期 ≈2.8 MB）。若明显偏高（接近 9.66），说明空占位未被压缩掉或 detail 未真正移除，须回到 Task 2 Step 2 检查。

- [ ] **Step 2: 清理临时产物**

```powershell
Remove-Item "$env:TEMP\wb-baseline.json" -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\wb-verify-load","$env:TEMP\wb-split-load" -Recurse -Force -ErrorAction SilentlyContinue
"已清理"
```

---

## 验收对照（设计文档 §5）

| 验收标准 | 对应步骤 |
|---|---|
| V1 typecheck / eslint exit 0 | Task 2 Step 8、Task 3 Step 5、Task 4 Step 4 |
| V2 build:web exit 0 | Task 2 Step 8、Task 3 Step 5、Task 4 Step 4 |
| V3 全新 clone 构建 exit 0 | Task 4 Step 5 |
| V4 四项断言全过（含 75,113 条全量 + 共享引用） | Task 1 Step 2（基线）、Task 2 Step 9、Task 3 Step 5 |
| V5 核心合计 gzip ≤3.2 MB | V5 Step 1 |
| `preloadLevels` 契约未变、调用点数量未变 | Task 2 Step 5(e) 只新增不修改；词汇页/拼写页/阅读器在 Task 2 中零改动 |
| `collocOnly` 结果集逐条相同 | V4 ③ |
| 搜索行为不变（结果条数/顺序/字段） | `queryWords` 未改动；仅预加载路径改变 |
