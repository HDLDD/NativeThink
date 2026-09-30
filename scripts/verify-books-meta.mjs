/**
 * verify-books-meta.mjs — 书目元数据一致性守卫。
 *
 * 为什么需要：`scripts/generate-books.ts` 的 BOOKS 数组声明 id→书名/作者，实际正文由
 * Gutenberg 按 id 拉取。两者一旦漂移，**重跑生成器就会静默写出错的书名/作者/中文名**。
 *
 * 已实际发生过（2026-09 发现）：生成器把 244 标成 The Time Machine、3300 标成 The Republic、
 * 3600 标成 The Wealth of Nations，而按 id 拉到的正文分别是 A Study in Scarlet /
 * The Wealth of Nations / Essays of Michel de Montaigne —— 数据文件当时是对的，生成器是错的，
 * 即"今天重跑一次就会毁掉这 3 本"。topic 也跟着串了（difficulty 由 topic 派生）。
 *
 * 本脚本把三件事钉死：
 *   ① 生成器与数据的 id 集合/顺序一致；
 *   ② 每本的 title / zhTitle / author / zhAuthor / topic 完全一致；
 *   ③ difficulty 与生成器的派生规则一致（philosophy|science → advanced，其余 intermediate）；
 *   ④ 若干"历史踩过坑"的 id 有硬锚点，防止再次被换错书。
 *
 * 用法：node scripts/verify-books-meta.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

const genSrc = readFileSync(join(ROOT, 'scripts/generate-books.ts'), 'utf8');
const dataSrc = readFileSync(join(ROOT, 'src/data/books.ts'), 'utf8');

// 书名字符串两种引号都会出现：生成器对含撇号的标题用双引号
// （title: "Alice's Adventures in Wonderland"），数据文件里则写成转义撇号
// （'Alice\'s Adventures in Wonderland'）。用统一的多引号字面量模式 + 反转义，
// 否则会**静默漏掉**这一类条目 —— 本脚本第一版就漏掉了 id=11，所以下面有覆盖度自检。
const LIT = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/;
const LIT_ALL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const unesc = (s) => s.replace(/\\(.)/g, '$1');

/** 从一段对象字面量里取 key: value（值可为双/单引号字符串或数字） */
function parseObjFields(block) {
  const out = {};
  const re = new RegExp(`(\\w+)\\s*:\\s*(?:${LIT.source}|(\\d+))`, 'g');
  let m;
  while ((m = re.exec(block))) {
    out[m[1]] = m[2] !== undefined ? unesc(m[2])
      : m[3] !== undefined ? unesc(m[3])
      : m[4];
  }
  return out;
}

// ── 解析生成器的 BOOKS 数组 ──
const booksArray = genSrc.match(/const BOOKS[^=]*=\s*\[([\s\S]*?)\n\];/);
const genBooks = [];
if (booksArray) {
  for (const m of booksArray[1].matchAll(/\{([^{}]*)\}/g)) {
    const f = parseObjFields(m[1]);
    if (f.id) genBooks.push({ id: String(f.id), title: f.title, zhTitle: f.zhTitle, author: f.author, zhAuthor: f.zhAuthor, topic: f.topic });
  }
}

// ── 解析数据里的每个 BOOK_* 调用（按位置取字符串：id/title/zhTitle/author/zhAuthor/topic/difficulty）──
const dataBooks = new Map();
for (const m of dataSrc.matchAll(/export const BOOK_(\d+): IReadingContent = bookContent\(([\s\S]*?)\n\);/g)) {
  const strs = [...m[2].matchAll(LIT_ALL)].map((x) => unesc(x[0].slice(1, -1)));
  if (strs.length < 7) continue;
  dataBooks.set(m[1], {
    declaredId: strs[0], title: strs[1], zhTitle: strs[2], author: strs[3],
    zhAuthor: strs[4], topic: strs[5], difficulty: strs[6],
  });
}

// ── 脚手架自检：覆盖度必须等于源文件里的真实条目数（防止解析器静默漏条目）──
const genCount = [...genSrc.matchAll(/id:\s*\d+,/g)].length;
const dataCount = [...dataSrc.matchAll(/export const BOOK_\d+:/g)].length;
check(genBooks.length > 0, '自检：已解析出生成器的 BOOKS 条目', `n=${genBooks.length}`);
check(dataBooks.size > 0, '自检：已解析出数据的 BOOK_ 条目', `n=${dataBooks.size}`);
check(genBooks.length === genCount, '自检：生成器条目解析无遗漏', `解析=${genBooks.length} 实际=${genCount}`);
check(dataBooks.size === dataCount, '自检：数据条目解析无遗漏', `解析=${dataBooks.size} 实际=${dataCount}`);
check(
  genBooks.every((b) => b.title && b.zhTitle && b.author && b.zhAuthor && b.topic),
  '自检：生成器每条都取全了 5 个字段',
  genBooks.filter((b) => !(b.title && b.zhTitle && b.author && b.zhAuthor && b.topic)).map((b) => b.id).join(','),
);
check(
  [...dataBooks.values()].every((d) => d.title && d.zhTitle && d.author && d.zhAuthor && d.topic && d.difficulty),
  '自检：数据每条都取全了 6 个字段',
);
check(
  genBooks.length === dataBooks.size,
  '自检：两侧条目数一致',
  `生成器=${genBooks.length} 数据=${dataBooks.size}`,
);

// ── ① id 集合与顺序 ──
check(
  genBooks.map((b) => b.id).join(',') === [...dataBooks.keys()].join(','),
  '生成器与数据的 id 顺序完全一致',
  `生成器=[${genBooks.map((b) => b.id).join(',')}] 数据=[${[...dataBooks.keys()].join(',')}]`,
);

// ── ②③ 逐本比对元数据与 difficulty 派生规则 ──
for (const g of genBooks) {
  const d = dataBooks.get(g.id);
  if (!d) { check(false, `id=${g.id} 在数据里存在`); continue; }
  check(d.declaredId === g.id, `id=${g.id} 内嵌 id 自符`, `内嵌='${d.declaredId}'`);
  check(d.title === g.title, `id=${g.id} title 一致`, `生成器「${g.title}」vs 数据「${d.title}」`);
  check(d.zhTitle === g.zhTitle, `id=${g.id} zhTitle 一致`, `生成器「${g.zhTitle}」vs 数据「${d.zhTitle}」`);
  check(d.author === g.author, `id=${g.id} author 一致`, `生成器「${g.author}」vs 数据「${d.author}」`);
  check(d.zhAuthor === g.zhAuthor, `id=${g.id} zhAuthor 一致`, `生成器「${g.zhAuthor}」vs 数据「${d.zhAuthor}」`);
  check(d.topic === g.topic, `id=${g.id} topic 一致`, `生成器「${g.topic}」vs 数据「${d.topic}」`);
  const expected = (g.topic === 'philosophy' || g.topic === 'science') ? 'advanced' : 'intermediate';
  check(
    d.difficulty === expected,
    `id=${g.id} difficulty 符合派生规则`,
    `topic=${g.topic} 期望=${expected} 实际=${d.difficulty}`,
  );
}

// ── ④ 历史踩坑 id 的硬锚点（这些 id 曾被换成别的书）──
const ANCHORS = [
  { id: '244', title: 'A Study in Scarlet', why: 'Gutenberg 244 = A Study in Scarlet；The Time Machine 是 35' },
  { id: '3300', title: 'The Wealth of Nations', why: 'Gutenberg 3300 = 国富论；The Republic 是 1497' },
  { id: '3600', title: 'Essays of Michel de Montaigne', why: 'Gutenberg 3600 = 蒙田随笔' },
  { id: '35', title: null, why: 'The Time Machine 不在本书单内（若加入应为 35）' },
];
for (const a of ANCHORS) {
  const d = dataBooks.get(a.id);
  if (a.title === null) {
    check(!d, `锚点：id=${a.id} 不应在书单内`, a.why);
  } else if (d) {
    check(d.title === a.title, `锚点：id=${a.id} 必须是「${a.title}」`, `实际「${d.title}」— ${a.why}`);
  }
}
check(
  !genBooks.some((b) => b.title === 'The Time Machine' && b.id !== '35'),
  '生成器里 The Time Machine 的 id 若存在必须是 35',
);

// ── ⑤ 阅读进度百分比必须在「保存时的量纲」里算 ──
// 真机实测过 516% / 484%：books.ts 是压缩节选（每本约 4800 词 → 约 19 页），而阅读器会运行时
// 升级为完整版全文，小说模式存的 page 是全文分页下的"章起始页" → 用节选页数当分母就爆表。
const articleSrc = readFileSync(join(ROOT, 'src/pages/ArticlePage/ArticlePage.tsx'), 'utf8');
const sharedSrc = readFileSync(join(ROOT, 'src/pages/ArticlePage/components/reader-shared.ts'), 'utf8');
const pageReaderSrc = readFileSync(join(ROOT, 'src/pages/ArticlePage/components/PageReader.tsx'), 'utf8');

check(
  /total\?:\s*number;/.test(sharedSrc),
  'ReaderProgress 有 total 字段（保存时的总页数，供外部列表同量纲算百分比）',
);
check(
  /chapters\?:\s*number;/.test(sharedSrc),
  'ReaderProgress 有 chapters 字段（保存时的总章数）',
);
check(
  /chapters: novelChapters\.length/.test(pageReaderSrc),
  '小说模式保存进度时一并写入阅读器自己的总章数',
);
// 分母必须是**保存时**的章数：/books/index.json 的 chapters 是另一套算法算的，与阅读器切章不一致
// —— 真机实测弗兰肯斯坦 index=29 而 chapter 已到 32（perChapter 里有 key "42"），拿 index 当分母
// 会算出 111%。这条断言就是钉住"分母来自保存时"。
check(
  /p\.chapters && p\.chapters > 0 \? p\.chapters : \(bookStats\[bookId\]\?\.chapters \?\? 0\)/.test(articleSrc),
  '总章数优先用保存时的 chapters，index.json 只作老数据回落',
);
check(
  /page: currentPage, total: validPages\.length/.test(pageReaderSrc),
  '翻页模式保存进度时一并写入 total',
);
check(
  /page: ch \? ch\.startPage : prev\.page,\s*\r?\n\s*total: validPages\.length,/.test(pageReaderSrc),
  '小说模式保存进度时一并写入 total',
);
check(
  /p\.chapter != null && chapters > 0/.test(articleSrc),
  '小说模式进度按「章」算（chapter / 真实章数）',
);
check(
  /const total = p\.total && p\.total > 0 \? p\.total : fallbackPages;/.test(articleSrc),
  '翻页模式进度用保存时的 total，老数据才回落到节选页数',
);
check(
  !/Math\.round\(\(progress\.page \/ totalPages\) \* 100\)/.test(articleSrc),
  '不再用「页码 ÷ 当前书对象页数」算百分比（量纲不一致的原始 bug）',
);
// 数值验证：真实章数下任意 chapter/ratio 都落在 0-100；且旧的错误算法确实会溢出
{
  let stats = {};
  try { stats = JSON.parse(readFileSync(join(ROOT, 'public/books/index.json'), 'utf8')); } catch { /* 清单缺失则跳过 */ }
  const ids = Object.keys(stats);
  check(ids.length > 0, '自检：读到 public/books/index.json 的真实章数', `n=${ids.length}`);

  let over = 0, maxPct = 0;
  for (const id of ids) {
    const chapters = stats[id]?.chapters ?? 0;
    if (!chapters) continue;
    for (const [ch, ratio] of [[0, 0], [1, 0.5], [Math.floor(chapters / 2), 0.333], [chapters - 1, 0.999], [chapters, 1]]) {
      const pct = Math.min(100, Math.max(0, Math.round(((ch + ratio) / chapters) * 100)));
      if (pct < 0 || pct > 100) over++;
      maxPct = Math.max(maxPct, pct);
    }
  }
  check(over === 0, '新算法：真实章数下百分比恒在 0-100', `越界=${over}`);
  check(maxPct === 100, '新算法：读完能到 100%（不会算不到头）', `max=${maxPct}`);
  // 旧算法：真机出现过的 page=98 ÷ 节选页数(约 19) → 516%
  const oldPct = Math.round((98 / 19) * 100);
  check(oldPct > 100, '自检：旧的「页码÷节选页数」算法确实会溢出（断言非恒真）', `旧算法=${oldPct}%`);
}

// ── ⑥ SCP 内容（CC BY-SA 3.0）的许可合规与数据完整性 ──
// BY-SA 的硬要求：每篇必须署名到来源、App 内声明同一许可。这条断言就是防止
// 以后重新生成 scp.ts 时把 author/sourceUrl 丢掉 —— 那会直接变成违规使用。
{
  const scpSrc = readFileSync(join(ROOT, 'src/data/scp.ts'), 'utf8');
  const arts = [...scpSrc.matchAll(/export const (SCP_[A-Z0-9_]+): IReadingContent = \{([\s\S]*?)\n\};/g)]
    .map((m) => ({ name: m[1], body: m[2] }));
  check(arts.length >= 15, 'SCP 篇目数量足够（≥15）', `n=${arts.length}`);
  const noAuthor = arts.filter((a) => !/author: '[^']+'/.test(a.body));
  check(noAuthor.length === 0, 'SCP 每篇都有署名（抽不到作者时退回 wiki 级）', noAuthor.map((a) => a.name).join(','));
  check(
    arts.every((a) => /source: 'SCP Wiki · CC BY-SA 3\.0'/.test(a.body)),
    'SCP 每篇都标注 CC BY-SA 3.0 来源',
  );
  check(
    arts.every((a) => /sourceUrl: 'https:\/\/scp-wiki\.wikidot\.com\/scp-\d+'/.test(a.body)),
    'SCP 每篇都带精确原文链接',
  );
  check(/export const SCP_LICENSE = \{[\s\S]*?name: 'CC BY-SA 3\.0'/.test(scpSrc), '导出 SCP_LICENSE 许可声明');
  check(/share-alike|同协议|CC BY-SA 3\.0 提供/.test(scpSrc), 'SCP_LICENSE.note 含 share-alike 声明');
  // 只取文本：产物里不应出现任何 <img>/图片链接
  const imgs = [...scpSrc.matchAll(/<img|\.jpg|\.png|\.jpeg|wikidot\.com\/local--files/gi)];
  check(imgs.length === 0, 'SCP 产物不含图片（图片另有 Image Use Policy，且 173 原图不在 CC 内）', `命中=${imgs.length}`);
  check(!/page-content|Authors' Pages|Powered by Wikidot|rating: \+/.test(scpSrc), 'SCP 产物无站内噪声残留');
}

// ── ⑦ 复习词高亮：把 matchesHighlight 的真实实现抽出来做单元测试 ──
// 形态归并很容易写成"过度匹配"（把无关词也框起来），所以必须真测。
{
  const hlSrc = readFileSync(join(ROOT, 'src/lib/reader-highlight.ts'), 'utf8');
  const grab = (header) => {
    const i = hlSrc.indexOf(header);
    if (i < 0) throw new Error('missing ' + header);
    let d = 0, j = hlSrc.indexOf('{', i), start = j;
    for (; j < hlSrc.length; j++) {
      if (hlSrc[j] === '{') d++;
      else if (hlSrc[j] === '}') { d--; if (d === 0) break; }
    }
    return hlSrc.slice(i, j + 1);
  };
  const normSrc = grab('function norm(');
  const matchSrc = grab('export function matchesHighlight(');
  const mod = ts.transpileModule(
    `${normSrc}\n${matchSrc}\nexport { matchesHighlight };`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const outFile = join(process.env.TEMP || '/tmp', 'nt-highlight-test.mjs');
  writeFileSync(outFile, mod, 'utf8');
  const { matchesHighlight } = await import(pathToFileURL(outFile).href);

  check(matchesHighlight('run', ['run']) === true, '高亮：原形命中');
  check(matchesHighlight('Running', ['run']) === true, '高亮：大小写 + ing 命中');
  check(matchesHighlight('stopped', ['stop']) === true, '高亮：双写辅音 + ed 命中');
  check(matchesHighlight('studies', ['study']) === false, '高亮：y→ies 不误判（保守策略，宁少不错）');
  check(matchesHighlight('carpet', ['car']) === false, '高亮：不做词干化，carpet 不该命中 car');
  check(matchesHighlight('the', []) === false, '高亮：词表为空时一律不高亮');
  check(matchesHighlight('resilient', ['resilient']) === true, '高亮：长词精确命中');

  const appSrc2 = readFileSync(join(ROOT, 'src/pages/ArticlePage/ArticlePage.tsx'), 'utf8');
  // 2026-09-30 重推导：复习词汇文章改造后，用词字段在 buildRvContent 里统一构造
  // （点名的一批交给阅读器高亮，只有真出现在正文里的记为 rvWords）。
  // 旧断言钉的是 `highlightWords: words.map(...)` 这个早已不存在的写法 —— rv-articles 改造当天它就已失效，
  // 因为当时只跑了 rv-articles 那条守卫没人跑到这里。教训见 docs/modules/verification.md §5。
  check(/highlightWords: args\.keys,[\s\S]{0,120}rvWords: args\.covered,/.test(appSrc2),
    '「用复习词汇生成文章」把点名词交给阅读器高亮，只把真用上的记为 rvWords');
  check(/highlightWords\?: string\[\];/.test(readFileSync(join(ROOT, 'src/data/reading.ts'), 'utf8')), 'IReadingContent 有 highlightWords 字段');
  /**
   * 2026-09-30 真机（83/2.0.38）实测到的断层：改造前存下的复习词文章只带 `rvWords`，
   * 阅读器只认 `highlightWords` —— 列表行写着「复习词 42」，点进去一个词都不高亮，
   * 阅读设置里连「待复习词的颜色」那一行都不出现。词表口径改成与 `rvRegenKeys` 一致（highlightWords 优先、否则 rvWords）。
   */
  check(/const reviewWords = useMemo\(\s*\(\) => \(content\.highlightWords\?\.length \? content\.highlightWords : content\.rvWords \?\? \[\]\)/.test(pageReaderSrc),
    '阅读器复习词表按 highlightWords → rvWords 回退（与 rvRegenKeys 同口径）');
  check(/setHighlightWords\(reviewWords\.length \? reviewWords : null\)/.test(pageReaderSrc), '进入阅读器下发回退后的词表');
  check(/return \(\) => setHighlightWords\(null\)/.test(pageReaderSrc), '退出阅读器清掉高亮词表');
  check((pageReaderSrc.match(/setHighlightWords\(/g) || []).length === 2,
    'setHighlightWords 只有"下发"与"卸载清空"两处调用点');
  check(!/setHighlightWords\(content\.highlightWords \?\? null\)/.test(pageReaderSrc),
    '旧写法（只认 highlightWords）已消失 —— 留着它老复习词文章就没有高亮');
  check(/reviewWords\.length > 0 && \(/.test(pageReaderSrc), '⑥「待复习词的颜色」那一行跟着回退后的词表出现');
  check(/HIGHLIGHT_COLORS\.map/.test(pageReaderSrc), '阅读设置里提供可选颜色');
  check(/matchesHighlight\(w, reviewWords\)/.test(readFileSync(join(ROOT, 'src/pages/ArticlePage/components/ReaderParagraph.tsx'), 'utf8')), '段落渲染按复习词加框');
}


// ── ⑪ 词库数据不得含 U+FFFD（乱码）──
// 真机上背单词卡片曾显示「小规??的」「事??」：生成环节丢了单个汉字，变成替换符。
// 已由 scripts/clean-wordbank-mojibake.mjs 清理 5909 处；这条断言防止它再回来。
{
  const dir = join(ROOT, 'src/data/wordbank/data');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  let bad = 0;
  const offenders = [];
  for (const f of files) {
    const n = (readFileSync(join(dir, f), 'utf8').match(/\uFFFD/g) || []).length;
    if (n) { bad += n; offenders.push(`${f}:${n}`); }
  }
  check(files.length > 0, '自检：读到词库数据文件', `n=${files.length}`);
  check(bad === 0, '词库数据无 U+FFFD 乱码（改生成逻辑后重跑 clean-wordbank-mojibake.mjs）', offenders.join(','));
}
// ── ⑤ 书库拆分：元数据 / 正文 / 清洗函数三者不许再互相拖累（2026-09-29 性能体检） ──
{
  const cleanSrc = readFileSync(join(ROOT, 'src/data/book-clean.ts'), 'utf8');
  const metaSrc = readFileSync(join(ROOT, 'src/data/books-meta.ts'), 'utf8');
  const fulltext = readFileSync(join(ROOT, 'src/data/book-fulltext.ts'), 'utf8');

  check(/export function cleanBookParagraphs/.test(cleanSrc), 'book-clean.ts 导出 cleanBookParagraphs');
  check(!/_p\d+: string\[\]/.test(cleanSrc), 'book-clean.ts 是纯函数模块，不含任何书的正文');
  check(/import \{ cleanBookParagraphs \} from '\.\/book-clean';/.test(dataSrc) && !/^function cleanBookParagraphs/m.test(dataSrc),
    'books.ts 从 book-clean 取清洗函数，自己不再内联一份');
  check(/from '\.\/book-clean'/.test(fulltext) && !/from '\.\/books'/.test(fulltext),
    'book-fulltext 只依赖 book-clean —— 阅读器不必为一个纯函数下载整个书库（231KB gzip）');
  check(!/from '\.\/books'/.test(metaSrc) && !/pages:/.test(metaSrc),
    'books-meta.ts 不引用正文模块，也不带 pages 数组');

  // 真把两个模块跑起来对账（不是比字符串）：元数据必须与 ALL_BOOKS 逐项吻合
  const TMP = join(process.env.TEMP || '/tmp', 'nt-books-split-check');
  const { mkdirSync, rmSync } = await import('node:fs');
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const toCjs = (src) => ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
    // CJS 不认无扩展名的相对 require，补上 .cjs
    .replace(/require\((["'])\.\/(reading|book-clean|books-meta)\1\)/g, 'require("./$2.cjs")');
  writeFileSync(join(TMP, 'reading.cjs'), toCjs(readFileSync(join(ROOT, 'src/data/reading.ts'), 'utf8')), 'utf8');
  writeFileSync(join(TMP, 'book-clean.cjs'), toCjs(cleanSrc), 'utf8');
  writeFileSync(join(TMP, 'books.cjs'), toCjs(dataSrc), 'utf8');
  writeFileSync(join(TMP, 'books-meta.cjs'), toCjs(metaSrc), 'utf8');
  const books = require(join(TMP, 'books.cjs')).ALL_BOOKS;
  const meta = require(join(TMP, 'books-meta.cjs')).BOOK_META;
  check(Array.isArray(books) && books.length === 22, `正文模块解析成功且为 22 本（实际 ${books ? books.length : 'null'}）`);
  check(books.length === meta.length, `元数据条数 = 正文条数（${meta.length}）`);
  let mismatch = 0, first = '';
  books.forEach((b, i) => {
    const m = meta[i];
    const ok = m && m.id === b.id && m.title === b.title && m.zhTitle === b.zhTitle
      && m.zhAuthor === b.zhAuthor && m.totalWords === b.totalWords
      && m.pageCount === (b.pages || []).length && m.difficulty === b.difficulty;
    if (!ok) {
      mismatch++;
      if (!first) first = `${b.id}: meta=${JSON.stringify(m)} vs 正文=${b.title}/${(b.pages || []).length}页/${b.totalWords}词`;
    }
  });
  check(mismatch === 0, 'BOOK_META 与 ALL_BOOKS 逐字段一致（id/书名/译者/词数/页数/难度）', first);
  rmSync(TMP, { recursive: true, force: true });

  // 消费方必须走元数据；正文只能在"点开某本书"时动态取
  const page = readFileSync(join(ROOT, 'src/pages/ArticlePage/ArticlePage.tsx'), 'utf8');
  check(/import\('@\/data\/books-meta'\)/.test(page), 'ArticlePage 的书单从 books-meta 取');
  check(!/^\s*import .* from '@\/data\/books'/m.test(page),
    'ArticlePage 不静态引入正文模块（只允许点开某本书时 import()）');
  const progress = readFileSync(join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');
  check(/@\/data\/books-meta/.test(progress) && !/import\('@\/data\/books'\)/.test(progress),
    'ProgressPage 清翻译缓存用元数据，不下载书库');
}

// ── ⑥ 应用内帮助中心（HelpGuide）与实况对齐 ──
// 这份文案比代码旧过很多次（曾写"必须自备 API Key""五个等级""数据不会上传任何服务器"），
// 而它是用户在 App 里唯一能看到的说明 —— 说错了就是误导，所以钉成断言。
{
  const help = readFileSync(join(ROOT, 'src/components/HelpGuide.tsx'), 'utf8');
  const meta = readFileSync(join(ROOT, 'src/data/wordbank/meta.ts'), 'utf8');
  const aiCfg = readFileSync(join(ROOT, 'src/services/ai-config.ts'), 'utf8');

  const unique = Number((meta.match(/TOTAL_UNIQUE_WORDS\s*=\s*([\d_]+)/) || [])[1]?.replace(/_/g, ''));
  const entries = Number((meta.match(/TOTAL_ENTRIES\s*=\s*([\d_]+)/) || [])[1]?.replace(/_/g, ''));
  check(unique === 21736, '脚手架自检：从 meta.ts 读到去重词数', String(unique));
  // 光断言"文里出现了 21,736"是假的（同一段里出现两次，改错一处仍绿）——
  // 真正的口径是：**不许出现词条总数**（这仓库踩过"把 75,113 当可学词数"的坑）
  check((help.match(/21,736/g) || []).length >= 1 && !new RegExp(String(entries) + '|' + entries.toLocaleString('en-US')).test(help),
    `帮助里的"全部"词数只用去重词数 ${unique.toLocaleString('en-US')}，不出现词条总数 ${entries.toLocaleString('en-US')}`);
  check(/九档词库|聚合九档/.test(help) && !/五个等级/.test(help),
    '词库档数写的是九档（"五个等级"这条过期文案不许回来）');
  check(/中考[\s\S]{0,40}高考[\s\S]{0,40}四级[\s\S]{0,40}六级[\s\S]{0,40}雅思[\s\S]{0,40}托福[\s\S]{0,40}考研[\s\S]{0,40}专业[\s\S]{0,40}高阶/.test(help),
    '九档名字逐个列全（用户能对着找）');

  const provBlock = aiCfg.slice(aiCfg.indexOf('export const ALL_PROVIDERS'), aiCfg.indexOf('];', aiCfg.indexOf('export const ALL_PROVIDERS')));
  const providers = (provBlock.match(/'[a-z]+'/g) || []).map((s) => s.replace(/'/g, ''));
  check(providers.length === 8 && providers.includes('factory'), '脚手架自检：服务商清单 8 家且含出厂档', providers.join(','));
  check(/8 家|八家/.test(help) || providers.every((p) => p !== 'factory' || /出厂/.test(help)),
    '帮助里的服务商数量/口径与 ai-config 对齐');
  check(!/需要你提供 API Key|必须自备 API Key|输入 API Key 保存/.test(help),
    '不再写"必须自备 Key"（出厂即带免费额度）');
  check(!/不会上传到任何服务器|不上传任何服务器/.test(help),
    '不再写"不会上传到任何服务器"（有云同步与反馈上报，这句是错的）');
  check(/IndexedDB|本机存储/.test(help) && /导出|备份/.test(help), '说清数据默认在本机、且给了备份入口');
}

// ── 输出 ──
console.log('');
console.log(`生成器条目=${genBooks.length}  数据条目=${dataBooks.size}`);
console.log(`已钉住的锚点=${ANCHORS.length}`);
if (failures.length) {
  console.log(`\n失败 ${fail} 项：`);
  failures.slice(0, 25).forEach((f) => console.log('  ✗ ' + f));
  console.log(`\n断言 ${pass}/${pass + fail} 通过`);
  process.exit(1);
}
console.log(`\n断言 ${pass}/${pass + fail} 通过 ✓`);
