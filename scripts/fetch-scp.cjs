/**
 * fetch-scp.cjs — 抓取 SCP 基金会文章，生成 src/data/scp.ts
 *
 * 为什么可以内置：SCP Wiki 的内容是 **CC BY-SA 3.0**，站方 licensing-guide 原文明确
 * 「people will be able to copy your work wholesale, and even sell it, provided that they
 * properly attribute you and release their work under the same license」。
 *
 * 因此本脚本必须保证两件事，否则内置就是违规：
 *   ① 每篇带上「作者（能抽到就写，抽不到退到 wiki 级）+ 原文链接 + 许可」；
 *   ② App 内展示同一许可声明（BY-SA 的 share-alike 要求）。
 *
 * 关于作者：现代 SCP 文章会在正文里渲染出 `Author:` 一行，老文章（如 SCP-173）没有 ——
 * 没有时**不编造**，退回 "SCP Wiki 社区"，并保留精确 sourceUrl 供读者核对。
 *
 * 只取文本，**不抓图片**：站方 Image Use Policy 与正文许可不同，且 SCP-173 的原图
 * （Izumi Kato《Untitled 2004》）明确不在 CC 授权内。
 *
 * 用法：node scripts/fetch-scp.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src/data/scp.ts');
const UA = 'NativeThink/2.0 (offline English reading app; https://github.com/HDLDD/NativeThink)';
const BASE = 'https://scp-wiki.wikidot.com';

/** 精选：英文圈最知名的入门篇目，优先短篇（适合分页与朗读） */
const CODES = [
  'scp-173', 'scp-682', 'scp-049', 'scp-096', 'scp-106', 'scp-087',
  'scp-999', 'scp-055', 'scp-294', 'scp-914', 'scp-500', 'scp-1025',
  'scp-131', 'scp-529', 'scp-701', 'scp-343', 'scp-1471', 'scp-2317',
  'scp-2521', 'scp-3008',
];

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&times;': '×', '&deg;': '°', '&laquo;': '«', '&raquo;': '»',
};

function decode(s) {
  let out = s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  return out;
}

function stripTags(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|blockquote|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/[ \t]+/g, ' ').trim();
}

/** 从页面 HTML 抽出正文段落 + 作者 */
function extract(html, code) {
  // 去掉评分模块、页脚、许可角标等非正文容器
  let body = html;
  const cut = body.indexOf('id="page-content"');
  if (cut < 0) return { paragraphs: [], author: null };
  // 从 id="page-content" 那个标签的 **结束尖括号之后** 开始，否则会把 `id="page-content">`
  // 这段属性当成正文文字留在首段里（真机产物里出现过）
  const gt = body.indexOf('>', cut);
  body = body.slice(gt >= 0 ? gt + 1 : cut);
  // 正文结束于页面底部工具区
  for (const marker of ['id="page-info"', 'class="page-tags"', 'id="page-options-bottom"', 'id="action-area"']) {
    const i = body.indexOf(marker);
    if (i > 0) body = body.slice(0, i);
  }
  body = body
    .replace(/<div[^>]*class="[^"]*page-rate-widget-box[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*creditRate[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*licensebox[^"]*"[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*footnotes-footer[^"]*"[\s\S]*$/i, '');

  // 作者：现代文章会渲染出「Author:」标签，值与标签常分属不同 div（去标签后各占一行），
  // 所以先在纯文本行里定位标签，再取本行剩余或下一行的名字。抽不到就**不编造**。
  const textLines = stripTags(body).split('\n').map((s) => s.trim()).filter(Boolean);
  let author = null;
  for (let i = 0; i < textLines.length; i++) {
    const m = textLines[i].match(/^Author\s*:?\s*(.*)$/i);
    if (!m) continue;
    let cand = (m[1] || '').trim();
    if (cand.length < 2) {
      const nxt = (textLines[i + 1] || '').trim();
      if (nxt && !/^(Author|License|Image|Rate|Rating|Item #|Object Class)\b/i.test(nxt)) cand = nxt;
    }
    // 只接受像人名的短串；带冒号/竖线/方括号的通常是模板残留，
    // 以 SCP-编号 开头的更是"另一个条目"的交叉引用而非作者（真机踩过：2317 抓成 SCP-166）
    if (cand.length >= 2 && cand.length <= 60 && !/[:|\[\]{}<>]/.test(cand)
      && !/^Author$/i.test(cand) && !/^SCP-\d+/i.test(cand)) {
      author = cand;
      break;
    }
  }

  const rawParas = body.split(/<\/p>|<br\s*\/?>\s*<br\s*\/?>/i);
  const paragraphs = [];
  for (const raw of rawParas) {
    let t = stripTags(raw);
    if (!t) continue;
    // 丢掉站内噪声
    if (/^>?\s*rating\s*:/i.test(t)) continue;
    if (/^(?:&?[–\-+]\s*x|x|options|report|edit|history|files|print|site tools)/i.test(t)) continue;
    if (/^SCP Wiki|^Unless otherwise stated|^Powered by Wikidot/i.test(t)) continue;
    if (/^Author\s*:?/i.test(t)) continue;
    if (/^Image (?:caption|credit)/i.test(t)) continue;
    // 图片授权信息块（Filename:/Author:/License: 三连）是"图片"的署名，不是正文。
    // 本脚本只取文本，这些块留着既是噪声、又会让"产物不含图片"的守卫误报。
    if (/^Filename\s*:/i.test(t)) continue;
    if (/\.(?:jpe?g|png|gif|webp)\b/i.test(t) && /(?:Author|License|Name)\s*:/i.test(t)) continue;
    // 合并换行，段落化
    t = t.split('\n').map((x) => x.trim()).filter(Boolean).join(' ');
    if (t.length < 2) continue;
    paragraphs.push(t);
  }
  // 超长段落按句切开，避免单段几千词把阅读器分页压垮
  const out = [];
  for (const p of paragraphs) {
    if (p.length <= 1200) { out.push(p); continue; }
    let buf = '';
    for (const sent of p.split(/(?<=[.!?])\s+/)) {
      if ((buf + ' ' + sent).trim().length > 900) { out.push(buf.trim()); buf = sent; }
      else buf += ' ' + sent;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return { paragraphs: out, author };
}

async function fetchPage(code) {
  const res = await fetch(`${BASE}/${code}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

(async () => {
  const articles = [];
  for (const code of CODES) {
    try {
      const html = await fetchPage(code);
      const { paragraphs, author } = extract(html, code);
      const titleMatch = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
      const rawTitle = titleMatch ? decode(titleMatch[1]).replace(/\s*-\s*SCP Foundation\s*$/i, '').trim() : code.toUpperCase();
      const words = paragraphs.reduce((s, p) => s + p.split(/\s+/).filter(Boolean).length, 0);
      articles.push({ code, title: rawTitle, author, paragraphs, words });
      console.log(`  ✓ ${code.padEnd(11)} 段=${String(paragraphs.length).padStart(3)} 词=${String(words).padStart(5)} 作者=${author || '(wiki 级)'}`);
    } catch (e) {
      console.log(`  ✗ ${code}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1100)); // 对站点友好：约 1 req/s
  }

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const lines = [];
  lines.push('/**');
  lines.push(' * scp.ts — SCP 基金会精选文章（**由 scripts/fetch-scp.cjs 生成，勿手改**）');
  lines.push(' *');
  lines.push(' * 许可：SCP Wiki 内容为 CC BY-SA 3.0。BY-SA 的硬要求有两条，改这个文件时不要破坏：');
  lines.push(' *   ① 每篇必须带作者/来源与原文链接（作者抽不到时退回 "SCP Wiki 社区"，不得编造）；');
  lines.push(' *   ② App 内必须展示同一许可声明（share-alike）。');
  lines.push(' *');
  lines.push(' * 只取文本、不取图片：图片另有 Image Use Policy，且 SCP-173 原图不在 CC 授权内。');
  lines.push(' */');
  lines.push("import type { IReadingContent, IParagraph } from './reading';");
  lines.push("import { buildPages } from './reading';");
  lines.push('');
  lines.push('/** 许可与署名（UI 必须展示） */');
  lines.push('export const SCP_LICENSE = {');
  lines.push("  name: 'CC BY-SA 3.0',");
  lines.push("  url: 'https://creativecommons.org/licenses/by-sa/3.0/',");
  lines.push("  sourceName: 'SCP Wiki',");
  lines.push("  sourceUrl: 'https://scp-wiki.wikidot.com/',");
  lines.push("  note: '本页文章来自 SCP Wiki，按 CC BY-SA 3.0 授权使用；作者与原文链接见每篇卡片。App 对文本的排版与翻译等衍生内容同样按 CC BY-SA 3.0 提供。',");
  lines.push('} as const;');
  lines.push('');
  for (const a of articles) {
    const varName = 'SCP_' + a.code.replace(/[^a-z0-9]/gi, '_').toUpperCase();
    lines.push(`const ${varName}_TEXT: string[] = [`);
    for (const p of a.paragraphs) lines.push(`  '${esc(p)}',`);
    lines.push('];');
    lines.push(`export const ${varName}: IReadingContent = {`);
    lines.push(`  id: '${a.code}',`);
    lines.push("  type: 'publication',");
    lines.push(`  title: '${esc(a.title)}',`);
    lines.push(`  zhTitle: '${esc(a.title)}',`);
    lines.push(`  author: '${esc(a.author || 'SCP Wiki 社区')}',`);
    lines.push("  source: 'SCP Wiki · CC BY-SA 3.0',");
    lines.push(`  sourceUrl: '${BASE}/${a.code}',`);
    lines.push("  topic: 'fiction',");
    lines.push("  difficulty: 'advanced',");
    lines.push(`  pages: buildPages(${varName}_TEXT.map((en): IParagraph => ({ en, zh: '' }))),`);
    lines.push(`  totalWords: ${a.words},`);
    lines.push('};');
    lines.push('');
  }
  lines.push('/** 精选篇目（按上面的顺序） */');
  lines.push('export const SCP_ARTICLES: IReadingContent[] = [');
  for (const a of articles) {
    lines.push('  SCP_' + a.code.replace(/[^a-z0-9]/gi, '_').toUpperCase() + ',');
  }
  lines.push('];');
  lines.push('');
  fs.writeFileSync(OUT, lines.join('\n'), 'utf-8');
  const totalWords = articles.reduce((s, a) => s + a.words, 0);
  console.log(`\n写入 ${path.relative(ROOT, OUT)}：${articles.length} 篇，共 ${totalWords} 词`);
})();
