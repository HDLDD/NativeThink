/**
 * verify-list-scaling.mjs — 「一屏渲染不完的列表必须折叠/分页」的回归守卫。
 *
 * 起因（2026-09-29 性能体检）：写作页题库有 **100 道**，"全部题目"面板一次性全渲染 ——
 * 实测手机视口下页面高 17,604px（约 21 屏），挂载期主线程长任务 4 个合计 1055ms（4× CPU 节流）。
 * 改成默认 12 张 + "展开其余 N 题"后：页高 2,634px（-85%），长任务 2 个合计 118ms（-89%），
 * 且 100 题仍然一次点击全部可达（折叠不是删内容 —— 用户入口不许被削弱）。
 *
 * 本脚本守的是源码级契约（渲染路径 + 上限常量），真实数字由无头 Chrome 量（见交接手册）。
 *
 * 用法：node scripts/verify-list-scaling.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++; else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

/* ── 写作页题库 ── */
{
  const src = read('src/pages/WritingPage/WritingPage.tsx');
  const prompts = (src.match(/\bid:\s*['"]/g) || []).length;
  check(prompts >= 100, `脚手架自检：题库确实有 ${prompts} 道（少于 100 说明解析失效或题库缩了）`);

  // 抓组件体：从 PromptGrid 到下一个顶层 function（非贪婪的 \n} 会被内部提前截断）
  const gStart = src.indexOf('function PromptGrid(');
  const gEnd = src.indexOf('\nfunction ', gStart + 10);
  const grid = gStart >= 0 && gEnd > gStart ? src.slice(gStart, gEnd) : '';
  check(grid.length > 200, `脚手架自检：抓到 PromptGrid 组件体（${grid.length} 字符）`);
  check(/list\.slice\(0, 12\)/.test(grid), '题卡默认只渲染前 12 张');
  check(/showAll \? list : list\.slice/.test(grid), '展开后渲染完整列表（折叠不是丢内容）');
  check(/展开其余 \$\{list\.length - 12\} 题/.test(grid) && /收起/.test(grid), '有"展开其余 N 题"与"收起"两个入口');

  // 源码里只有两个字面 TabsContent 块（四个分类由 .map 生成），两处都必须走 PromptGrid
  const panels = (src.match(/<TabsContent[\s\S]{0,400}?<\/TabsContent>/g) || []).filter((b) => /PromptCard|PromptGrid/.test(b));
  check(panels.length === 2, `脚手架自检：抓到 ${panels.length} 个字面题目面板（全部 + 分类模板）`);
  check(panels.every((b) => /<PromptGrid/.test(b)), '全部题目与分类模板面板都走 PromptGrid（没有漏网的全量 map）');
  check(!/allPrompts\.map\(/.test(src) && !/catMap\[cat\)\]\.map\(/.test(src),
    '正对照：不再存在对整份题库的直接 .map 渲染');
}

/* ── 词库浏览分页（同一个不变量的另一处，防止被改回全量渲染） ── */
{
  const src = read('src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx');
  check(/pagedWords = useMemo\(\s*\(\) => filteredWords\.slice\(wordPage \* browsePageSize/.test(src),
    '词库浏览仍按页取词（不是把整本书一次性渲染）');
  check(/setWordPage\(0\); \}, \[filteredWords\.length\]\)/.test(src),
    '筛选条件变化时回到第一页（否则会停在空白页）');
}

/* ── 短语库（748 条按字母分组）：每段默认折叠，A-Z 跳转仍指向全部字母段 ── */
{
  const src = read('src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx');
  const chunkCount = (read('src/data/chunks.ts').match(/^  \{ id:/gm) || []).length;
  check(chunkCount >= 700, `脚手架自检：MOCK_CHUNKS 确实有 ${chunkCount} 条（少于 700 说明计数失效）`);

  // 实测（本机 headless Chrome，393×851 / DPR 3 / 4× CPU 节流，直接落在短语库 tab）：
  //   全量铺开 4,805 DOM 元素 / 797 按钮；折叠后 1,148 元素 / 205 按钮（-76%），展开一段回到 1,244
  // —— 说明折叠真的减了节点，而不是只是加了个按钮
  check(/chunks\.slice\(0, PHRASE_LETTER_PREVIEW\)/.test(src), '每个字母段默认只铺前 6 条');
  check(/const PHRASE_LETTER_PREVIEW = 6;/.test(src), '折叠上限写成命名常量（改数字要显式改这里）');
  check(/显示其余 \$\{chunks\.length - PHRASE_LETTER_PREVIEW\} 条/.test(src) && /收起，只看前 6 条/.test(src),
    '有"显示其余 N 条"与"收起"两个入口（折叠不是删内容，一次点击全可达）');
  check(/expandedLetters\.has\(letter\)/.test(src) && /toggleLetterExpanded\(letter\)/.test(src),
    '展开状态按字母维护（不是全局一刀切）');
  check(/const next = new Set\(expandedLetters\);[\s\S]{0,200}setExpandedLetters\(next\)/.test(src),
    '更新函数保持纯：Set 复制在 updater 外做（StrictMode 会双调用 updater）');
  check(/id=\{`phrase-l-\$\{letter\}`\}/.test(src) && /scrollIntoView/.test(src),
    'A-Z 跳转目标仍逐段存在（折叠不能把跳转入口弄失效）');
  check(!/\{chunks\.map\(\(chunk\) =>/.test(src),
    '正对照：字母段内不再有对整段 chunks 的直接 .map 全量渲染');
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) { failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
