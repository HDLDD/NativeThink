#!/usr/bin/env node
/**
 * 把内置书目的完整原文落到 public/books/<id>.txt —— 随包发布。
 *
 * 为什么需要：阅读器此前是「先渲染 books.ts 里的压缩节选（约 4800 词），再后台联网
 * 拉全文升级」。一旦联网失败（手机网络抖动、代理超时），就静默停在节选上：
 *   · 章节缺失（实测：基督山伯爵节选 1 章 vs 全文 124 章）
 *   · 译文错位（译文按章号索引查表，章号对不上 → 把别章的中文贴过来）
 * 全文落包后，阅读器直接读本地文件，零网络、零等待，也不再有这个回退态。
 *
 * 用法: node scripts/dump-book-texts.cjs [id...] [--force]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'books');
const PROXY = 'https://nativethink.pages.dev/api/gutenberg';
const EXTERNALS = '--external:@huggingface/transformers --external:onnxruntime-node --external:@capacitor/core --external:sharp';

function bundle(entry, outfile) {
  execSync(`npx esbuild ${entry} --bundle --platform=node --format=cjs --outfile="${outfile}" --log-level=error ${EXTERNALS}`,
    { cwd: ROOT, stdio: 'inherit' });
  return require(path.isAbsolute(outfile) ? outfile : path.join(ROOT, outfile));
}

/** 与 src/data/books.ts 的 bookContent('id', 'title') 一一对应 */
function loadBooks() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'books.ts'), 'utf8');
  const re = /BOOK_(\d+): IReadingContent = bookContent\(\s*'(\d+)',\s*'([^']+)'/g;
  const list = [];
  let m;
  while ((m = re.exec(src))) list.push({ id: m[1], title: m[3] });
  return list;
}

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const books = loadBooks();
  const want = args.filter((a) => /^\d+$/.test(a));
  const targets = want.length ? books.filter((b) => want.includes(b.id)) : books;
  if (targets.length === 0) { console.error('没有可导出的书'); process.exit(1); }

  // 复用应用内的解析逻辑，确保切章与阅读器完全一致（落盘的是原始文本，这里只为校验）
  const { cleanBookParagraphs } = bundle('src/data/books.ts', path.join(ROOT, '.dump-books.cjs'));
  const { splitChapters } = bundle('src/data/book-translation.ts', path.join(ROOT, '.dump-split.cjs'));

  function splitParagraphs(text) {
    return text
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.replace(/\r?\n(?!\r?\n)/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  let ok = 0;

  for (const b of targets) {
    const outFile = path.join(OUT_DIR, b.id + '.txt');
    if (!force && fs.existsSync(outFile) && fs.statSync(outFile).size > 5000) {
      const sz = fs.statSync(outFile).size;
      total += sz;
      ok++;
      console.log(`  跳过 ${b.id.padStart(5)} ${b.title.slice(0, 28).padEnd(30)} 已存在 ${(sz / 1024 / 1024).toFixed(2)}MB`);
      continue;
    }
    try {
      const r = await fetch(`${PROXY}?id=${b.id}`, { signal: AbortSignal.timeout(240000) });
      if (!r.ok) { console.error(`  ✗ ${b.id} 取文失败 HTTP ${r.status}`); continue; }
      const text = (await r.json()).text;
      if (!text || text.length < 5000) { console.error(`  ✗ ${b.id} 正文过短（${text ? text.length : 0} 字符）`); continue; }

      // 校验：这份文本切出的章节要与已入库译稿对得上，否则说明取到了不同的版本
      const chapters = splitChapters({ pages: [{ pageNumber: 1, paragraphs: cleanBookParagraphs(splitParagraphs(text)), words: 0 }] });
      const prePath = path.join(ROOT, 'public', 'translations', b.id + '.json');
      let warn = '';
      if (fs.existsSync(prePath)) {
        const pre = JSON.parse(fs.readFileSync(prePath, 'utf8'));
        const bad = chapters.filter((c) => {
          const arr = pre[String(c.index)];
          return !arr || arr.length !== c.paragraphs.length;
        });
        if (bad.length) warn = `  ⚠ 与译稿有 ${bad.length} 章段数不符`;
      }

      fs.writeFileSync(outFile, text, 'utf8');
      total += Buffer.byteLength(text, 'utf8');
      ok++;
      console.log(`  ✓ ${b.id.padStart(5)} ${b.title.slice(0, 28).padEnd(30)} ${chapters.length} 章 / ${(Buffer.byteLength(text, 'utf8') / 1024 / 1024).toFixed(2)}MB${warn}`);
    } catch (e) {
      console.error(`  ✗ ${b.id} 失败: ${e.message}`);
    }
  }

  for (const f of ['.dump-books.cjs', '.dump-split.cjs']) {
    try { fs.unlinkSync(path.join(ROOT, f)); } catch { /* ignore */ }
  }

  console.log(`\n完成 ${ok}/${targets.length} 本，合计 ${(total / 1024 / 1024).toFixed(1)}MB → public/books/`);
})().catch((e) => { console.error('导出失败:', e); process.exit(1); });
