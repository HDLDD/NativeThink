#!/usr/bin/env node
/**
 * verify-backup-idb.mjs — 「导出学习数据」到底有没有把整书对照翻译带上的守卫。
 *
 * 起因（读代码逐行核实，见 docs/modules/dashboard-progress-favorites.md §5.4）：
 *   `backup.ts` 文件头承诺备份覆盖「IndexedDB 里的整书对照翻译缓存（最贵的可再生产物，重翻耗时数小时）」，
 *   但 `exportBackup()` 是这样枚举章节的：
 *       for (const k of Object.keys(data)) if (k.startsWith('booktrans-') && k.endsWith('-index')) …
 *   而 `data` 全部来自 **localStorage**，`booktrans-*` 只存在于 **IndexedDB**（只有 idbSet 写过它们），
 *   于是 candidateKeys 恒为空 → `idb` 恒 undefined → `idbCount` 恒 0 → **那句话从来没兑现过**。
 *   更巧的是 ProgressPage 的「清除阅读数据」路径（:136-140）早就用对了办法：
 *   拿 BOOK_META 的书 id 去调 clearBookTranslation(id) —— 正解在同仓库里，只是备份没用。
 *
 * 本脚本两层都守：
 *   A. 真转译真跑 `book-translation.ts` 的 `dumpBookTranslationCache`（IDB 用忠实替身：
 *      同签名、同"没写过就是 null"的语义、structuredClone 存值），覆盖有缓存/无缓存/超上限，
 *      并带"旧枚举方式"的正对照 —— 证明同一份数据下旧方式确实一个键都拿不到。
 *   B. 静态守 backup.ts 的接线：不许再从 localStorage 找 booktrans-*，必须走 BOOK_META +
 *      导入书目 + dumpBookTranslationCache，恢复侧仍只接 `booktrans-` 前缀。
 *
 * 用法：node scripts/verify-backup-idb.mjs
 * 退出码：0 = 全绿；1 = 有失败；2 = 脚手架自身有问题
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'backup-idb-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

/* ───────────── A. 真跑 dumpBookTranslationCache（忠实 IDB 替身） ───────────── */
const SRC = path.join(ROOT, 'src/data/book-translation.ts');
let src = fs.readFileSync(SRC, 'utf8');

// 替身必须是忠实的：idbGet 对没写过的键返回 null，值按 structuredClone 存（与 IDB 的克隆语义一致）
const STUBS = `
const __idb = new Map();
const idbGet = async (k) => (__idb.has(k) ? structuredClone(__idb.get(k)) : null);
const idbSet = async (k, v) => { __idb.set(k, structuredClone(v)); };
const idbDelete = async (k) => { __idb.delete(k); };
const translateWithLocalMt = async (_t) => [];
const isLocalMtReady = () => false;
const getTranslateEngine = () => 'ai';
globalThis.__idb = __idb;
`;

src = src.replace(/^import type \{ IReadingContent \} from '\.\/reading';$/m, '');
src = src.replace(/^import \{ idbGet, idbSet, idbDelete \} from '@\/lib\/idb';$/m, '');
src = src.replace(
  /^import \{ translateWithLocalMt, isLocalMtReady, getTranslateEngine \} from '@\/lib\/local-mt';$/m, '',
);
src = STUBS + src;

// 脚手架自检：残留 import 会静默改变被测对象，必须先挡住
const leftover = [...src.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0].trim());
if (leftover.length) {
  console.error('脚手架错误：仍有未替换的 import ->\n' + leftover.join('\n'));
  process.exit(2);
}

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outFile = path.join(TMP, 'book-translation-under-test.mjs');
fs.writeFileSync(outFile, js);
const mod = await import(pathToFileURL(outFile).href);
if (typeof mod.dumpBookTranslationCache !== 'function') {
  console.error('脚手架错误：被测模块没有导出 dumpBookTranslationCache');
  process.exit(2);
}
const idb = globalThis.__idb;

const LIMIT = 40 * 1024 * 1024;
const BID = '1091';                       // 基督山伯爵
const CHAPTERS = [0, 1, 2];

// A1 脚手架自检：写入后可被自己的 getter 读回（替身不可用则整段结论都无意义）
idb.set(`booktrans-${BID}-index`, { chapters: CHAPTERS, chapterCount: 124, updatedAt: 1 });
for (const i of CHAPTERS) idb.set(`booktrans-${BID}-ch${i}`, [`第${i}章译文a`, `第${i}章译文b`]);
ok((await mod.getCachedBookTranslation(BID))[2]?.[0] === '第2章译文a',
  '脚手架自检：IDB 替身读写忠实（getCachedBookTranslation 能读到写入的章节）');

// A2 有缓存的书：manifest + 每一章都要进备份，键名格式与写入侧一致
const dump = await mod.dumpBookTranslationCache(BID, LIMIT);
const keys = Object.keys(dump.entries).sort();
ok(keys.includes(`booktrans-${BID}-index`),
  '导出含章节清单键（恢复时靠它枚举章节）');
ok(CHAPTERS.every((i) => keys.includes(`booktrans-${BID}-ch${i}`)),
  '导出逐章齐全，且键名沿用 booktrans-<id>-ch<n>（与 clear/写入侧同源）',
  keys.join(','));
ok(dump.bytes > 0 && dump.skipped === false,
  '未超上限时 skipped=false 且 bytes 有真实大小', `bytes=${dump.bytes}`);
ok(structuredClone(dump.entries[`booktrans-${BID}-ch1`])[1] === '第1章译文b',
  '章节译文按原值带出（不是引用到可变对象）');

// A3 从没翻译过的书：必须是空结果，而不是抛错或带上别人的键
const empty = await mod.dumpBookTranslationCache('9999', LIMIT);
ok(Object.keys(empty.entries).length === 0 && empty.bytes === 0,
  '无缓存的书返回空导出（不会误带别的书）');

// A4 体积封顶：预算只够 1 章时，标记 skipped 且不越界
const small = await mod.dumpBookTranslationCache(BID, 40);
ok(small.skipped === true && small.bytes <= 40,
  '超过 maxBytes 时如实标 skipped 并停止累加（宁可少备份也不要导出失败）',
  `bytes=${small.bytes} keys=${Object.keys(small.entries).length}`);

// A5 正对照：旧实现从 localStorage 的键里找 booktrans-* —— 同一份数据下它一个都找不到
const localStorageLike = {
  '__nativethink_learning_stats': '{}',
  '__nativethink_reader_prefs': '{}',
  '__nativethink_favorites': '[]',
};
const oldWay = Object.keys(localStorageLike).filter(
  (k) => k.startsWith('booktrans-') && k.endsWith('-index'),
);
ok(oldWay.length === 0,
  '正对照：旧枚举方式（在 localStorage 里找 booktrans-*）拿到 0 个键 —— 守卫确实能区分两种实现',
  `oldWay=[${oldWay.join(',')}]`);
ok(keys.length > 0,
  '正对照配对：新方式在同一场景下拿到真实章节键（否则上一条为真说明不了什么）',
  `keys=${keys.length}`);

/* ───────────── B. backup.ts 接线 ───────────── */
const BK_RAW = fs.readFileSync(path.join(ROOT, 'src/lib/backup.ts'), 'utf8');
// 只看代码：文件里保留了"此前写的是 …"的历史注释，若连注释一起匹配会把解释当成缺陷
const BK = BK_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 常量形式（IDB_BACKUP_PREFIX）与字面量形式都要挡住 —— 变异实测发现只匹配字面量会漏
ok(
  !/Object\.keys\(data\)[\s\S]{0,160}(booktrans-|IDB_BACKUP_PREFIX)/.test(BK),
  '备份不再从 localStorage 的键里枚举 booktrans-*（历史缺陷根因）',
);
ok(
  /IDB_BACKUP_PREFIX/.test(BK) && !/for \(const k of Object\.keys\(data\)\)/.test(BK),
  'IDB_BACKUP_PREFIX 只在恢复侧做前缀白名单，不再用于枚举',
);
ok(/BOOK_META/.test(BK) && /loadImportedBooks/.test(BK),
  '书 id 来自 BOOK_META + 用户导入书目（随包 22 本之外的书也要覆盖）');
ok(/dumpBookTranslationCache\(/.test(BK),
  '取缓存走 book-translation 的导出函数（键格式知识单点归属，备份不再自己拼键名）');
ok(/IDB_LIMIT_BYTES - bytes/.test(BK) && /idbSkipped = true/.test(BK),
  '导出侧仍有体积封顶并如实回报 skipped');
ok(/key\.startsWith\(IDB_BACKUP_PREFIX\)/.test(BK) && /await idbSet\(key, value\)/.test(BK),
  '恢复侧只写 booktrans- 前缀键、逐条 idbSet（不会把任意键塞进 IDB）');
ok(/version: 2/.test(BK),
  '备份文件仍标 version 2（键格式没变，旧备份文件依旧可读）');

/* ───────────── 汇总 ───────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 整书翻译缓存确实进得了备份，且封顶/隔离/恢复口径都守住');
