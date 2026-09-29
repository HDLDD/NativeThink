#!/usr/bin/env node
/**
 * gen-books-meta.cjs — 从 src/data/books.ts 生成**只含元数据**的 src/data/books-meta.ts。
 *
 * 为什么要这一层：书单卡片只需要 标题 / 作者 / 等级 / 词数 / 页数，
 * 而 `import('@/data/books')` 会把 22 本书的**全部段落文本**（620KB 源码 / 231KB gzip）
 * 一起拉进来 —— 实测 /articles 冷加载里 books-*.js 占 231KB，是那一页最大的一块。
 * 真正打开某本书时才需要正文（且阅读器会升级到 public/books/<id>.txt 的随包全文）。
 *
 * 用法：node scripts/gen-books-meta.cjs
 * 幂等：books.ts 变了重跑即可；生成物里的 pageCount / totalWords 全部来自真实计算，不手填。
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src/data/books.ts');
const OUT = path.join(ROOT, 'src/data/books-meta.ts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'books-meta-'));

(async () => {
  const js = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const stubPath = path.join(TMP, 'reading.cjs');
  // 用**真实的** buildPages（reading.ts 是纯模块、无相对依赖）——
  // 桩成"一段一页"会让 pageCount 与真实页数对不上，进度百分比就错了
  fs.writeFileSync(stubPath, ts.transpileModule(fs.readFileSync(path.join(ROOT, 'src/data/reading.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText);
  const outFile = path.join(TMP, 'books.cjs');
  // books.ts 现在从 ./book-clean 取清洗函数（2026-09-29 拆分），临时目录里也得带上它
  fs.writeFileSync(
    path.join(TMP, 'book-clean.cjs'),
    ts.transpileModule(fs.readFileSync(path.join(ROOT, 'src/data/book-clean.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  // 只把相对 require 换成临时目录里的真实模块（不桩：桩出来的页数会与真实不一致）
  fs.writeFileSync(
    outFile,
    js
      .replace(/require\((["'])\.\/reading\1\)/g, `require(${JSON.stringify(stubPath.replace(/\\/g, '/'))})`)
      .replace(/require\((["'])\.\/book-clean\1\)/g, () => `require(${JSON.stringify(path.join(TMP, 'book-clean.cjs').replace(/\\/g, '/'))})`),
  );

  const mod = require(outFile);
  const books = mod.ALL_BOOKS;
  if (!Array.isArray(books) || books.length === 0) {
    console.error('✗ 没解析到 ALL_BOOKS（导出名或文件结构变了，去改本脚本）');
    process.exit(1);
  }

  const rows = books.map((b) => ({
    id: b.id,
    title: b.title,
    zhTitle: b.zhTitle,
    author: b.author || '',
    zhAuthor: b.zhAuthor || '',
    topic: b.topic,
    difficulty: b.difficulty,
    totalWords: b.totalWords,
    pageCount: (b.pages || []).length,
    gutenbergId: b.gutenbergId ?? null,
  }));

  const body = rows.map((r) => '  ' + JSON.stringify(r) + ',').join('\n');
  const file = `/**
 * 书单元数据 —— 由 \`node scripts/gen-books-meta.cjs\` 从 books.ts 生成，**不要手改**。
 *
 * 只放卡片要显示的字段（外加 pageCount / totalWords 这类预计算好的计数），
 * 目的是让「书单列表」不必把 22 本书的正文（231KB gzip）一起下载。
 * 正文仍归 books.ts（节选兜底）与 public/books/<id>.txt（随包全文）管。
 */

export interface IBookMeta {
  id: string;
  title: string;
  zhTitle: string;
  author: string;
  zhAuthor: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  totalWords: number;
  /** 节选版页数：进度百分比用它，别再为了算长度去 import 正文 */
  pageCount: number;
  gutenbergId: number | null;
}

export const BOOK_META: IBookMeta[] = [
${body}
];

export const BOOK_META_BY_ID: Record<string, IBookMeta> = Object.fromEntries(
  BOOK_META.map((b) => [b.id, b]),
);
`;
  fs.writeFileSync(OUT, file);
  fs.rmSync(TMP, { recursive: true, force: true });
  const kb = (fs.readFileSync(OUT, 'utf8').length / 1024).toFixed(1);
  const srcKb = (fs.readFileSync(SRC, 'utf8').length / 1024).toFixed(0);
  console.log(`✓ 已生成 ${path.relative(ROOT, OUT)}：${rows.length} 本书 / ${kb}KB（正文源 books.ts 是 ${srcKb}KB）`);
})();
