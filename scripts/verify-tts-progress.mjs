/**
 * verify-tts-progress.mjs — 「朗读到哪」反向映射的回归验证。
 *
 * 背景：安卓离线原生引擎没有词级回调（`currentWordIndex` 只由 SpeechSynthesis 的
 * onboundary 填充，而原生路径在 speakSS 里直接 return），所以段落高亮只能靠
 * use-tts 新增的 `onChunk(chunkIndex, wordsBefore)` 上报的**累计词数**反查段落。
 *
 * 这套映射成立的前提是一个必须被钉死的等式：
 *
 *     各段词数之和  ===  chunkText(合并文本) 各切片词数之和
 *
 * 只要这个等式成立，区间（前缀和）就把累计词数精确映射回段落，不会漂移。
 * 本脚本用**真实源码里的** cleanText / countWords / chunkText（按函数名从源文件
 * 抽出后转译，不重写实现）跑真实书目数据，断言：
 *
 *   1. 上述等式在每一页上都成立（含空段、斜杠、##CHAPTER## 标记等边界）
 *   2. 区间连续无空洞（ranges[i].endWord === ranges[i+1].startWord）
 *   3. 切片 → 段落 的映射单调不回退（否则高亮会来回跳）
 *   4. 最后一个切片仍 < 100%（进度条不会提前满格）
 *   5. 被跳过的段落只可能是"没有任何切片起始于其中"的短段，且必须报出来
 *
 * 用法：node scripts/verify-tts-progress.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(label + (detail ? ` — ${detail}` : ''));
  }
}

// ── 1. 从真实源码里按函数名抽出函数体（花括号配平），不重写实现 ──
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) throw new Error(`源码里找不到: ${header}`);
  let depth = 0;
  let j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`函数体未配平: ${header}`);
  return src.slice(i, j + 1);
}

const useTtsSrc = readFileSync(join(ROOT, 'src/lib/use-tts.ts'), 'utf8');
const utilsSrc = readFileSync(join(ROOT, 'src/lib/utils.ts'), 'utf8');

const pieces = [
  extractFn(utilsSrc, 'export function cleanText(s: string): string {'),
  extractFn(useTtsSrc, 'function countWords(text: string): number {'),
  extractFn(useTtsSrc, 'function chunkText(text: string, maxLen = 180): string[] {'),
];
const CHUNK_MAX = 180;
check(
  useTtsSrc.includes('function chunkText(text: string, maxLen = 180): string[] {'),
  '切片上限仍是 180（与云端上游 200 字符硬上限留出的安全边距）',
);

const assembled = ts.transpileModule(
  pieces.join('\n\n') + '\nexport { cleanText, countWords, chunkText };\n',
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

const tmpDir = join(process.env.TEMP || process.env.TMP || '/tmp', 'nt-tts-progress');
mkdirSync(tmpDir, { recursive: true });

// 真实书籍数据：books.ts 只依赖 ./reading
async function transpileData(file, outName) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from\s+['"]\.\/reading['"]/g, `from './reading.mjs'`);
  writeFileSync(join(tmpDir, outName), out, 'utf8');
}
await transpileData('src/data/reading.ts', 'reading.mjs');
await transpileData('src/data/books.ts', 'books.mjs');
writeFileSync(join(tmpDir, 'tts-core.mjs'), assembled, 'utf8');

const core = await import(pathToFileURL(join(tmpDir, 'tts-core.mjs')).href);
const books = await import(pathToFileURL(join(tmpDir, 'books.mjs')).href);
const { cleanText, countWords, chunkText } = core;

// ── 2. PageReader.speakCurrentPage 的算法复刻（必须与源码同形） ──
const pageReaderSrc = readFileSync(join(ROOT, 'src/pages/ArticlePage/components/PageReader.tsx'), 'utf8');
check(
  pageReaderSrc.includes("const w = cleanText(it.en).trim().split(/\\s+/).filter(Boolean).length;"),
  'buildReadRanges 的词数口径 = cleanText → split(/\\s+/)（与 countWords 同源）',
);
check(
  pageReaderSrc.includes(".map((it) => cleanText(it.en)).filter(Boolean).join(' ')"),
  '朗读文本仍是「各段 cleanText 后以单空格 join」',
);

/** 与源码 buildReadRanges 同形 */
function buildRanges(items) {
  let acc = 0;
  const ranges = [];
  for (const it of items) {
    const w = cleanText(it.en).trim().split(/\s+/).filter(Boolean).length;
    if (!w) continue;
    ranges.push({ pageIdx: it.pageIdx, paraIdx: it.paraIdx, startWord: acc, endWord: acc + w, words: w });
    acc += w;
  }
  return ranges;
}

/** 与源码 onChunk 里的反查同形 */
function hitRange(ranges, wordsBefore) {
  let hit = ranges[ranges.length - 1];
  for (const r of ranges) {
    if (wordsBefore < r.endWord) { hit = r; break; }
  }
  return hit;
}

// ── 3. 跑真实书目 ──
const contents = Object.entries(books).filter(([, v]) => v && Array.isArray(v.pages) && v.pages.length);
check(contents.length > 0, '加载到真实书目数据', `contents=${contents.length}`);

let pagesTested = 0;
let chunksTested = 0;
let maxPagesTested = 0;
let maxParasPerPage = 0;
let maxChunksPerPage = 0;
let skippedTotal = 0;
const skippedSamples = [];

for (const [name, content] of contents) {
  content.pages.forEach((page, pageIdx) => {
    if (!page || !Array.isArray(page.paragraphs)) return;
    pagesTested++;
    maxPagesTested++;

    // —— 与 speakCurrentPage 逐字同形 ——
    const items = page.paragraphs
      .map((p, i) => ({ en: p.en, pageIdx, paraIdx: i }))
      .filter((it) => !it.en.startsWith('##CHAPTER##'));
    const ranges = buildRanges(items);
    const text = items.map((it) => cleanText(it.en)).filter(Boolean).join(' ');
    if (!ranges.length) return;

    maxParasPerPage = Math.max(maxParasPerPage, ranges.length);
    const chunks = chunkText(text, CHUNK_MAX);
    chunksTested += chunks.length;
    maxChunksPerPage = Math.max(maxChunksPerPage, chunks.length);

    const totalFromRanges = ranges[ranges.length - 1].endWord;
    const totalFromChunks = chunks.reduce((s, c) => s + countWords(c), 0);

    // ① 核心等式
    check(
      totalFromRanges === totalFromChunks,
      `词数等式 ${name} p${pageIdx}`,
      `ranges=${totalFromRanges} chunks=${totalFromChunks}`,
    );

    // ② 区间连续无空洞
    for (let i = 1; i < ranges.length; i++) {
      check(
        ranges[i].startWord === ranges[i - 1].endWord,
        `区间连续 ${name} p${pageIdx} #${i}`,
        `${ranges[i - 1].endWord} → ${ranges[i].startWord}`,
      );
    }

    // ③ 映射单调不回退（长段落会连续命中同一个段落，所以是"非递减"而非"严格递增"）；
    //    ④ 末切片未满格；⑤ 统计被跳过的短段
    let prevPara = -1;
    const hitParas = new Set();
    for (let ci = 0; ci < chunks.length; ci++) {
      let wordsBefore = 0;
      for (let k = 0; k < ci; k++) wordsBefore += countWords(chunks[k]);
      const hit = hitRange(ranges, wordsBefore);
      check(
        hit.paraIdx >= prevPara,
        `映射单调不回退 ${name} p${pageIdx} chunk#${ci}`,
        `wordsBefore=${wordsBefore} 命中段落 ${hit.paraIdx}（上一段 ${prevPara}）`,
      );
      prevPara = hit.paraIdx;
      hitParas.add(hit.paraIdx);
      if (ci === chunks.length - 1) {
        const ratio = totalFromRanges > 0 ? Math.min(1, wordsBefore / totalFromRanges) : 0;
        check(ratio < 1, `末切片未满格 ${name} p${pageIdx}`, `ratio=${ratio.toFixed(3)}`);
      }
    }
    check(prevPara >= 0, `至少命中一段 ${name} p${pageIdx}`);

    // ⑤ 被跳过的段落：只能是"没有任何切片起始于其中"的短段
    const skipped = ranges.filter((r) => !hitParas.has(r.paraIdx) && r.paraIdx !== 0);
    if (skipped.length) {
      skippedTotal += skipped.length;
      if (skippedSamples.length < 5) {
        skippedSamples.push(
          `${name} p${pageIdx}: ` + skipped.map((r) => `#${r.paraIdx}(${r.words}词)`).join(', '),
        );
      }
      const tooLong = skipped.filter((r) => r.words > 40);
      check(
        tooLong.length === 0,
        `被跳过的段落都是短段 ${name} p${pageIdx}`,
        tooLong.map((r) => `#${r.paraIdx}=${r.words}词`).join(', '),
      );
    }
  });
}

// ── 4. 脚手架自检：确认"词数等式"断言不是恒真（否则上面的断言①就是空的）──
{
  const probe = 'The quick brown fox jumps over the lazy dog near the river bank today.';
  const good = chunkText(probe, 20);
  const dropped = good.map((c, i) => (i === 0 ? c.split(/\s+/).slice(0, -1).join(' ') : c));
  const words = (cs) => cs.reduce((s, c) => s + countWords(c), 0);
  check(good.length > 1, '自检：探针确实被切成多片');
  check(words(good) === countWords(probe), '自检：正常切片词数守恒');
  check(
    words(dropped) !== countWords(probe),
    '自检：丢词的切片会被词数等式抓住（断言①非恒真）',
  );
}

// ── 5. 汇总 ──
console.log('');
console.log('被抽出的真实实现：cleanText / countWords / chunkText（源码文本按函数名提取后转译）');
console.log(`书目数=${contents.length}  页数=${pagesTested}  切片数=${chunksTested}`);
console.log(`单页最多段落=${maxParasPerPage}  单页最多切片=${maxChunksPerPage}`);
console.log(`被跳过（无切片起始）的段落总数=${skippedTotal}`);
skippedSamples.forEach((s) => console.log('  跳过样例: ' + s));
console.log('');

if (failures.length) {
  console.log(`失败 ${fail} 项：`);
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  console.log(`\n断言 ${pass}/${pass + fail} 通过`);
  process.exit(1);
}
console.log(`断言 ${pass}/${pass + fail} 通过 ✓`);
