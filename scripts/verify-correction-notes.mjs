/**
 * verify-correction-notes.mjs — 表达纠偏本契约（store + 三源抽取 + 收藏页回看）
 *
 * 覆盖：
 *  ① 真跑 parseMarkdownTables / 三个 extract*Rows（提取纯函数段转译执行，含表头/分隔行/加粗噪声）；
 *  ② store 语义：appendCapped 只拒不裁、写失败 warnStorageFull、云同步下行"先作废再重读"、上限 200；
 *  ③ 三处收集接线（think detector / writing / conversation analysis 的完成点）与收藏页列表（折叠 6 条 + 删除）。
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

let pass = 0, fail = 0, failures = [];
for (const r of results) {
  if (r.pass) pass++; else { fail++; failures.push(r.name); }
}
console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
failures.forEach((f) => console.log('  ✗ ' + f));
process.exit(fail ? 1 : 0);
