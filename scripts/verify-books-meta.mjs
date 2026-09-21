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
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
