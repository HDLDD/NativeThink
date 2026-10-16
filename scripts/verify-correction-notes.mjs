/**
 * verify-correction-notes.mjs — 表达纠偏本契约（store + 三源抽取 + 收藏页回看 + 纠偏重考）
 *
 * 覆盖：
 *  ① 真跑 parseMarkdownTables / 三个 extract*Rows（提取纯函数段转译执行，含表头/分隔行/加粗噪声）；
 *  ② store 语义的静态口径（appendCapped / 上限 / 写失败 / 下行作废重读 / 零提示）；
 *  ③ 三处收集接线（think detector / writing / conversation analysis 的完成点）与收藏页列表（折叠 6 条 + 删除）；
 *  ④ store **整段转译真跑**：归一化去重、重考记账 review、删除、填满上限只拒不裁、落盘失败可见；
 *  ⑤ orderForDrill 真跑（没考过 → 最久没练 → 错得多，四判据缺一即红）；
 *  ⑥ 词汇页第 9 模式接线（MODES ↔ TabsContent 全量对齐）与重考卡面契约（不写 SM-2、计时、干扰项、零 toast）。
 * 用法：node scripts/verify-correction-notes.mjs（verify:all 自动发现）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const lib = read('src/lib/correction-notes.ts');
const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const code = stripComments(lib);

/* ── ① 纯函数真跑：norm/parseMarkdownTables/clean/extract* 段（store 之前，无 React 依赖） ── */
{
  const start = code.indexOf('function norm(');
  const end = code.indexOf('let _cache');
  ok(start >= 0 && end > start, '真跑脚手架：抓到 norm→parse→clean→extract 纯函数段');
  if (start >= 0 && end > start) {
    const seg = code.slice(start, end)
      .replace(/export /g, '')
      .replace(/: Omit<ICorrectionNote, 'id' \| 'source' \| 'createdAt'>\[\]/g, '')
      .replace(/: string\[3\]\[\]|: string\[\]\[\]\[\]|: string\[\]\[\]|: string/g, '')
      .replace(/<ICorrectionNote, 'id' \| 'source' \| 'createdAt'>\[/g, '[')
      .replace(/\)\s*\{(\s*const out[^=]*=)\s*\[\];/g, '){$1[];');
    const jsSrc = ts.transpileModule(
      seg.replace(/function parseMarkdownTables\(md\)/, 'function parseMarkdownTables(md)') + '\nmodule.exports={parseMarkdownTables,extractDetectorRows,extractWritingRows,extractConversationRows};',
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', jsSrc)(mod, mod.exports);
    const { parseMarkdownTables, extractDetectorRows, extractWritingRows, extractConversationRows } = mod.exports;

    const tables = parseMarkdownTables([
      'intro',
      '| a | b |',
      '|---|---|',
      '| r1c1 | r1c2 |',
      '',
      '| x | y | z |',
      '| :-- | :- | --: |',
      '| r2 | r3 | r4 |',
    ].join('\n'));
    ok(tables.length === 2, '真跑：两个表格都解析出来', String(tables.length));
    ok(tables[0][0].join(',') === 'r1c1,r1c2' && tables[1][0].join(',') === 'r2,r3,r4',
      '真跑：表头与分隔行都不进数据行');
    ok(parseMarkdownTables('没有表格的纯文本').length === 0, '真跑：无表格返回空（不误造行）');

    const det = extractDetectorRows([
      '### ✅ Natural Alternatives',
      '| Chinglish Expression | Natural English | Notes |',
      '|----------------------|---------------|-------|',
      '| **I very like it** | **I really like it** | 程度副词位置 |',
      '| open the light | turn on the light | 搭配 |',
    ].join('\n'));
    ok(det.length === 2 && det[0].wrong === 'I very like it' && det[0].right === 'I really like it',
      '真跑：检测表抽两行、剥掉 ** 加粗噪声', JSON.stringify(det[0] || null));

    const wr = extractWritingRows([
      '| Original | Correction | Explanation |',
      '|---|---|---|',
      '| I am agree | I agree | 动词而非形容词 |',
      '| the same | the same | 误报原样跳过 |',
    ].join('\n'));
    ok(wr.length === 1 && wr[0].wrong === 'I am agree',
      '真跑：批改表跳过表头行与"错=对"的噪声行', JSON.stringify(wr));

    const cv = extractConversationRows([
      '| 我的表达 | 中文翻译 | 更地道的说法 | 原因分析 |',
      '|---|---|---|---|',
      '| You gave me a good advice | 你给了我很好的建议 | You gave me some great advice | advice 不可数 |',
    ].join('\n'));
    ok(cv.length === 1 && cv[0].chineseHint === '你给了我很好的建议' && cv[0].right === 'You gave me some great advice',
      '真跑：对话分析四列表（中文提示落在 chineseHint）', JSON.stringify(cv[0] || null));
  }
}

/* ── ② store 语义 ── */
ok(/appendCapped\(list, fresh, MAX_NOTES\)/.test(code), '入库走 appendCapped：满了拒绝新增、绝不裁剪（用户数据）');
ok(/const MAX_NOTES = 200;/.test(code), '上限 200 冻结为常量');
ok(/if \(!persistJson\(KEY, list\)\) warnStorageFull\(\);/.test(code), '写失败必须可见（safeStorage 配额满返回 false 不抛错）');
ok(/known\.has\(norm\(r\.wrong\)\)/.test(code), '按 wrong 归一化去重（同句反复被抓只留最早）');
ok(/useSyncDown\(\(\) => \{ invalidateCorrectionNotesCache\(\); reload\(\); \}\)/.test(code),
  '云同步下行：先作废模块缓存再重读（否则重读变摆设）');
ok(!/toast/.test(code), '收集路径零提示（练习/批改界面不弹 toast 的既定口径）');

/* ── ③ 三处接线 + 收藏页回看 ── */
const think = stripComments(read('src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx'));
const writing = stripComments(read('src/pages/WritingPage/WritingPage.tsx'));
const conv = stripComments(read('src/pages/ConversationPage/ConversationPage.tsx'));
const fav = stripComments(read('src/pages/FavoritesPage/FavoritesPage.tsx'));
ok(/addCorrectionNotes\('think', extractDetectorRows\(full\)\)/.test(think), '思维检测完成点收集（detector Natural Alternatives 表）');
ok(/addCorrectionNotes\('writing', extractWritingRows\(full\)\)/.test(writing), '写作批改完成点收集（Original|Correction 表）');
ok(/addCorrectionNotes\('conversation', extractConversationRows\(full\)\)/.test(conv), '对话分析完成点收集（我的表达|中文翻译|更地道 表）');
ok(/useCorrectionNotes\(\)/.test(fav) && /corrNotes\.slice\(0, 6\)/.test(fav) && /展开查看全部 \(\$\{corrNotes\.length\}\)/.test(fav),
  '收藏页有纠偏本区块（默认 6 条折叠，长列表不一次铺完）');
ok(/removeNote\(n\.id\)/.test(fav), '纠偏条目可删除（误判条目有出口）');
ok(/思维检测.*写作批改.*对话分析/s.test(fav), '三处来源在列表里有标签（回忆上下文）');

/* ── ④⑤ store + 排序整段真跑（KEY→…→orderForDrill，不含 React hook） ── */
{
  const start = code.indexOf('const KEY =');
  const end = code.indexOf('export function invalidateCorrectionNotesCache');
  ok(start >= 0 && end > start, '真跑脚手架：抓到 store 整段（含 norm/抽取/入库/记账/排序）');
  if (start >= 0 && end > start) {
    const jsSrc = ts.transpileModule(
      code.slice(start, end)
        + '\nmodule.exports={addCorrectionNotes,removeCorrectionNote,recordCorrectionReview,orderForDrill,MAX_NOTES};',
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText;
    // 替身照抄真实语义：safeStorage.setItem 只返回布尔、不抛错（safe-storage.ts:175）；
    // persistJson = try { return safeStorage.setItem(k, JSON.stringify(v)) } catch { false }
    const store = new Map();
    let writes = 0, warns = 0, failing = false;
    const events = [];
    const safeStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { if (failing) return false; store.set(k, v); return true; },
    };
    const persistJson = (k, v) => { writes++; return safeStorage.setItem(k, JSON.stringify(v)); };
    const warnStorageFull = () => { warns++; };
    const appendCapped = (items, additions, max) => {
      const room = Math.max(0, Math.floor(max) - items.length);
      const taken = additions.slice(0, room);
      return { next: [...items, ...taken], added: taken.length };
    };
    const window = { dispatchEvent: (e) => events.push(e && e.type) };
    class CustomEvent { constructor(type) { this.type = type; } }
    const mod = { exports: {} };
    new Function('module', 'exports', 'safeStorage', 'persistJson', 'warnStorageFull', 'appendCapped', 'window', 'CustomEvent', jsSrc)(
      mod, mod.exports, safeStorage, persistJson, warnStorageFull, appendCapped, window, CustomEvent);
    const { addCorrectionNotes, removeCorrectionNote, recordCorrectionReview, orderForDrill, MAX_NOTES } = mod.exports;
    const stored = () => JSON.parse([...store.values()][0] ?? '[]');

    const added1 = addCorrectionNotes('think', [
      { wrong: 'I very like it', right: 'I really like it', chineseHint: '', note: '程度副词' },
      { wrong: 'open the light', right: 'turn on the light', chineseHint: '', note: '' },
    ]);
    ok(added1 === 2 && stored().length === 2 && writes === 1, '真跑：一次收两条、只写盘一次');

    const added2 = addCorrectionNotes('writing', [{ wrong: 'I VERY  like it', right: 'whatever', chineseHint: '', note: '' }]);
    ok(added2 === 0 && writes === 1, '真跑：同句反复被抓只留最早（归一化去重，大小写/多余空格都算同句）');
    ok(stored()[0].source === 'think' && stored()[0].right === 'I really like it',
      '真跑：重复的后来条目整条丢弃（不覆盖最早那条的来源与地道说法）');

    const firstId = stored()[0].id;
    recordCorrectionReview(firstId, true);
    const rv1 = stored()[0].review;
    ok(rv1 && rv1.correct === 1 && rv1.wrong === 0 && rv1.lastAt > 0,
      '真跑：首答答对 → review{correct:1, wrong:0, lastAt}', JSON.stringify(rv1 || null));
    recordCorrectionReview(firstId, false);
    const rv2 = stored()[0].review;
    ok(rv2.correct === 1 && rv2.wrong === 1, '真跑：答错只累加 wrong、不清零 correct（重考统计是累计的）');
    const writesBefore = writes;
    recordCorrectionReview('cn_already-removed', true);
    ok(writes === writesBefore, '真跑：条目不在本子里就不写盘（hit 判定，省掉无谓落盘与广播）');
    ok(events.length === writes, '真跑：每次写盘都广播 changed（收藏页/重考页重读的前提）');

    removeCorrectionNote(stored()[1].id);
    ok(stored().length === 1, '真跑：删除真的落盘（回看列表那个 × 对应的行为）');

    const filled = addCorrectionNotes('think',
      Array.from({ length: 250 }, (_, i) => ({ wrong: `sentence ${i}`, right: `better ${i}`, chineseHint: '', note: '' })));
    ok(filled === MAX_NOTES - 1 && stored().length === MAX_NOTES, `真跑：填满 ${MAX_NOTES} 条上限`, String(stored().length));
    const wFull = writes;
    const overflow = addCorrectionNotes('writing', [{ wrong: 'one too many', right: 'x', chineseHint: '', note: '' }]);
    ok(overflow === 0 && stored().length === MAX_NOTES && writes === wFull,
      '真跑：满了拒绝新增、已有条目一条不裁、也不再写盘（用户数据不悄悄删）');

    failing = true;
    recordCorrectionReview(stored()[0].id, true);
    ok(warns === 1, '真跑：落盘失败必须 warnStorageFull（setItem 配额满只返回 false，不抛错兜不住）');

    /* ⑤ 重考排序 */
    const mk = (id, extra) => ({ id, source: 'think', wrong: `w-${id}`, right: `r-${id}`, chineseHint: '', note: '', createdAt: 0, ...extra });
    const fixture = [
      mk('drilled-old', { createdAt: 5, review: { lastAt: 500, correct: 1, wrong: 3 } }),
      mk('fresh-1', { createdAt: 100 }),
      mk('drilled-new', { createdAt: 4, review: { lastAt: 900, correct: 2, wrong: 0 } }),
      mk('fresh-2', { createdAt: 200 }),
      mk('tie-wrong', { createdAt: 3, review: { lastAt: 500, correct: 0, wrong: 5 } }),
      mk('old-few', { createdAt: 2, review: { lastAt: 100, correct: 5, wrong: 0 } }),
    ];
    const order = orderForDrill(fixture).map((n) => n.id);
    ok(order.join(',') === 'fresh-2,fresh-1,old-few,tie-wrong,drilled-old,drilled-new',
      '真跑：队列=没考过(新抓优先)→最久没练→错得多（四个判据缺一即红）', order.join(','));
    ok(fixture[0].id === 'drilled-old', '真跑：orderForDrill 不改写输入（纯函数，视图直接喂 notes 才安全）');
  }
}

/* ── ⑥ 词汇页第 9 模式接线 + 重考卡面契约 ── */
{
  const page = stripComments(read('src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'));
  const drillSrc = read('src/pages/DeepVocabularyPage/components/CorrectionDrillMode.tsx');
  ok(/import CorrectionDrillMode from '\.\/components\/CorrectionDrillMode'/.test(page),
    '第 9 模式已 import（漏了不会报错，只会静默不显示）');
  ok(/\{ key: 'correction', label: '纠偏重考'/.test(page), 'MODES 里有「纠偏重考」条目（模式列表与顶部标题同源）');

  // 接线总闸：MODES 每个 key 必须有对应 TabsContent（历史上"写了组件没挂载"就是这么露的）
  const modesBlock = page.slice(page.indexOf('const MODES:'), page.indexOf('const REVIEW_MODES:'));
  const modeKeys = [...modesBlock.matchAll(/\{ key: '([a-z0-9]+)'/g)].map((m) => m[1]);
  ok(modeKeys.length >= 9, `MODES 条数抓到 ${modeKeys.length} 个 key`, modeKeys.join(','));
  const orphan = modeKeys.filter((k) => !page.includes(`<TabsContent value="${k}"`));
  ok(orphan.length === 0, 'MODES 每个 key 都有 TabsContent（无孤儿 = 列表里点得到的模式真的挂了组件）', orphan.join(','));
  ok(/<TabsContent value="correction"[\s\S]{0,120}<CorrectionDrillMode\s*\/>/.test(page),
    'correction 的 TabsContent 渲染 CorrectionDrillMode');

  ok(!/toast|sonner/.test(drillSrc), '重考路径零提示（练习界面不弹 toast 的既定口径）');
  ok(!/use-word-learning|recordReview\(/.test(drillSrc),
    '重考不写 SM-2（句子不是词书词条，写进去会污染「已学单词清单」与到期数）');
  ok(/recordCorrectionReview\(cw\.id, ok\)/.test(drillSrc), '重考记账走纠偏本自己的 review');
  ok(/addStudyMinutes\(0\.2, 'vocabulary'\)/.test(drillSrc), '每答一题计 0.2 分钟（与中译英/闪卡翻面同参）');
  ok(/const q = orderForDrill\(notes\);\s*\n\s*if \(q\.length === 0\) return;\s*\n\s*setQueue\(q\);/,
    drillSrc.replace(/\r/g, ''), '起跑时排一次并冻结（答题过程中的写盘广播不许改变本轮顺序）');
  ok(/queue\.filter\(\(n\) => n\.id !== cw\.id\)\.map\(\(n\) => n\.right\)/.test(drillSrc),
    '干扰项取自其它条目的地道说法（都是真英文，逼"哪句才对应这个意思"）');
  ok(/window\.addEventListener\('keydown', onKey, true\)/.test(drillSrc),
    '键盘监听走捕获阶段（Radix 冒泡阶段同步关弹窗，Esc 会连带退出重考）');
  ok(/思维检测[\s\S]{0,40}写作批改[\s\S]{0,40}对话分析/.test(drillSrc),
    '空态有指路（告诉用户三个来源会自动收集，而不是只说"暂无"）');
}

let pass = 0, fail = 0, failures = [];
for (const r of results) {
  if (r.pass) pass++; else { fail++; failures.push(r.name); }
}
console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(fail ? 1 : 0);
