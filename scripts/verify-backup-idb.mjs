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
const idbGet = async (k) => { if (globalThis.__backupReadFailure === k) throw new Error('read failed'); return __idb.has(k) ? structuredClone(__idb.get(k)) : null; };
const idbGetStrict = idbGet;
const idbSet = async (k, v) => { __idb.set(k, structuredClone(v)); };
const idbDelete = async (k) => { __idb.delete(k); };
const translateWithLocalMt = async (_t) => [];
const isLocalMtReady = () => false;
const getTranslateEngine = () => 'ai';
globalThis.__idb = __idb;
`;

src = src.replace(/^import type \{ IReadingContent \} from '\.\/reading';$/m, '');
src = src.replace(/^import \{ idbGet, idbSet, idbDelete(?:, idbGetStrict)? \} from '@\/lib\/idb';$/m, '');
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
for (const key of [`booktrans-${BID}-index`, `booktrans-${BID}-ch1`]) {
  globalThis.__backupReadFailure = key;
  const failedRead = await mod.dumpBookTranslationCache(BID, LIMIT);
  ok(failedRead.skipped === true, `译文读取失败必须报告省略 ${key}`);
}
delete globalThis.__backupReadFailure;

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

const compile = (source, imports = {}, globals = {}) => {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', ...Object.keys(globals), code)((name) => {
    if (!(name in imports)) throw new Error(`Missing test dependency: ${name}`);
    return imports[name];
  }, exports, ...Object.values(globals));
  return exports;
};
const rejects = async (action) => {
  try { await action(); return false; } catch { return true; }
};
const IDB_RAW = fs.readFileSync(path.join(ROOT, 'src/lib/idb.ts'), 'utf8');
const IMPORTED_RAW = fs.readFileSync(path.join(ROOT, 'src/data/imported-books.ts'), 'utf8');
const READING_RAW = fs.readFileSync(path.join(ROOT, 'src/data/reading.ts'), 'utf8');
const reading = compile(READING_RAW);
function database(mode = 'commit', seed = new Map(), idbSource = IDB_RAW) {
  const values = new Map(seed);
  const state = { mode, readFailed: false, writes: 0, committed: false };
  const indexedDB = {
    open() {
      const request = {};
      setTimeout(() => {
        if (state.mode === 'open-error') {
          request.error = new Error('open denied');
          request.onerror?.();
          return;
        }
        request.result = {
          transaction(_store, transactionMode) {
            const tx = {
              objectStore() {
                const perform = (key, record) => {
                  const req = {};
                  setTimeout(() => {
                    if ((record && state.mode === 'request-error') || (!record && state.readFailed)) {
                      req.error = new Error('request denied');
                      req.onerror?.();
                      tx.onerror?.();
                      tx.onabort?.();
                      return;
                    }
                    req.result = record ? key : structuredClone(values.get(key));
                    req.onsuccess?.();
                    setTimeout(() => {
                      if (state.mode === 'abort' || (state.mode === 'write-abort' && transactionMode === 'readwrite')) { tx.onabort?.(); return; }
                      if (record) { values.set(key, structuredClone(record)); state.committed = true; }
                      tx.oncomplete?.();
                    }, 0);
                  }, 0);
                  return req;
                };
                return {
                  get: (key) => perform(key),
                  put: (record) => { state.writes++; return perform(record.key, record); },
                };
              },
            };
            return tx;
          },
        };
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };
  return { values, state, api: compile(idbSource, {}, { indexedDB }) };
}
for (const mode of ['open-error', 'request-error', 'abort']) {
  const db = database(mode);
  ok(await rejects(() => db.api.idbSet('proof', 'value')), `IDB ${mode} 不许谎报写入成功`);
  ok(!db.values.has('proof'), `IDB ${mode} 替身确实没有提交数据`);
}
const committed = database();
await committed.api.idbSet('proof', 'value');
ok(committed.state.committed && committed.values.get('proof')?.value === 'value', 'idbSet 等事务提交后才兑现');
const BOOK_KEY = 'imported-books-v1';
function backupHarness(options = {}) {
  const db = database(options.mode);
  const local = new Map([['scope:__nativethink_favorites', '[]'], ['other:secret', 'private']]);
  const storage = {
    getPrefixedKey: () => 'scope:',
    setItem: (key, value) => {
      if (options.localFailed) return false;
      local.set(`scope:${key}`, value); return true;
    },
  };
  const imported = compile(options.importedSource ?? IMPORTED_RAW, { './reading': reading, '@/lib/idb': db.api });
  const backup = compile(options.backupSource ?? BK_RAW, {
    './safe-storage': { safeStorage: storage }, './idb': db.api,
    '@/data/books-meta': { BOOK_META: [{ id: 'bundled' }] },
    '@/data/imported-books': imported,
    '@/data/book-translation': { dumpBookTranslationCache: async (id) => {
      if (options.cacheFailed) throw new Error('cache unavailable');
      return { entries: { [`booktrans-${id}-ch0`]: ['中文译文'] }, skipped: false, bytes: 8 };
    } },
  }, { localStorage: {
    get length() { return local.size; }, key: (index) => [...local.keys()][index],
    getItem: (key) => local.get(key) ?? null,
  } });
  return { db, local, imported, backup };
}
const oldBackup = { app: 'NativeThink', version: 2, exportedAt: '', data: { progress: 'saved' }, idb: { 'booktrans-x-ch0': ['旧译文'], arbitrary: 'denied' } };
const failLocal = backupHarness({ localFailed: true });
const failedLocal = await failLocal.backup.importBackup(oldBackup);
ok(failedLocal.restored === 0 && failedLocal.failed === 1, 'localStorage 返回 false 不计成功且计失败');
const old = backupHarness();
const oldResult = await old.backup.importBackup(oldBackup);
ok(oldResult.restored === 1 && oldResult.restoredIdb === 1, '旧 v2 备份仍可恢复本地键及译文');
ok(!old.db.values.has('arbitrary'), '备份不能向 IDB 注入任意键');
for (const mode of ['open-error', 'abort']) {
  const h = backupHarness({ mode });
  const result = await h.backup.importBackup(oldBackup);
  ok(result.restoredIdb === 0 && result.failedIdb === 1, `恢复 ${mode} 只计失败不计成功`);
}
const source = backupHarness();
const book = await source.imported.importBookFromText({ title: '备份原书', text: 'Chapter 1\n\nThe original book body survives the backup.\n\nChapter 2\n\nAnother original paragraph.' });
const exported = await source.backup.exportBackup();
ok(exported.importedBookCount === 1 && JSON.stringify(exported.file.importedBooks) === JSON.stringify([book]), '导出保留导入书的全部正文与元数据');
ok(!Object.hasOwn(exported.file.data, 'secret') && exported.localStorageCount === 1, '导出限定当前用户前缀');
const target = backupHarness();
const resident = { ...book, id: 'imp_resident', title: '本地原书' };
target.db.values.set(BOOK_KEY, { key: BOOK_KEY, value: [resident, { ...book, title: '同 id 旧稿' }] });
const restored = await target.backup.importBackup(exported.file);
const restoredBooks = await target.imported.loadImportedBooks();
ok(restored.restoredBooks === 1 && restoredBooks.length === 2 && restoredBooks.some((b) => b.id === resident.id), '恢复导入书保留备份中不存在的本地书');
ok(JSON.stringify(restoredBooks.find((b) => b.id === book.id)) === JSON.stringify(book), '同 id 导入书按备份覆盖且正文精确往返');
for (const data of [[], null, 'bad']) {
  const h = backupHarness();
  ok(await rejects(() => h.backup.importBackup({ ...oldBackup, data })), `拒绝非法 data 形状 ${JSON.stringify(data)}`);
  ok(h.local.size === 2 && h.db.state.writes === 0, `非法 data 在任何写入前拒绝 ${JSON.stringify(data)}`);
}
for (const importedBooks of [[{ ...book, pages: [{ paragraphs: [{ en: {}, zh: '' }], pageNumber: 1 }] }], [book, book], {}]) {
  const h = backupHarness();
  ok(await rejects(() => h.backup.importBackup({ ...oldBackup, importedBooks })), '损坏或重复导入书在恢复前拒绝');
  ok(h.local.size === 2 && h.db.state.writes === 0, '损坏导入书不导致部分写入');
}
const readFail = backupHarness();
readFail.db.state.readFailed = true;
const blocked = await readFail.backup.importBackup({ ...oldBackup, data: {}, idb: {}, importedBooks: [book] });
ok(blocked.restoredBooks === 0 && blocked.failedBooks === 1 && readFail.db.state.writes === 0, '读不到现有书库时禁止覆盖并报告失败');
ok(await rejects(() => readFail.backup.exportBackup()), '读不到用户原书时导出必须失败而不是交付不完整备份');
const allAbort = backupHarness({ mode: 'abort' });
const blockedRead = await allAbort.backup.importBackup({ ...oldBackup, data: {}, idb: {}, importedBooks: [book] });
ok(blockedRead.restoredBooks === 0 && blockedRead.failedBooks === 1 && allAbort.db.state.writes === 0, '全 abort 保留覆盖：只读事务失败不得继续写入书库');
// readonly 必须成功，否则只测到了 loadImportedBooks，根本碰不到 persist。
const writeFail = backupHarness({ mode: 'write-abort' });
const blockedWrite = await writeFail.backup.importBackup({ ...oldBackup, data: {}, idb: {}, importedBooks: [book] });
ok(writeFail.db.state.writes === 1 && !writeFail.db.values.has(BOOK_KEY), '书库写失败用例必须真正尝试 persist 且未提交');
ok(blockedWrite.restoredBooks === 0 && blockedWrite.failedBooks === 1, '书库事务失败不计恢复成功');
const cacheFail = await backupHarness({ cacheFailed: true }).backup.exportBackup();
ok(cacheFail.idbSkipped === true, '派生缓存导出失败明确报告省略');
const BACKUP_HOOK_RAW = fs.readFileSync(path.join(ROOT, 'src/lib/use-backup-actions.ts'), 'utf8').replace(/\r\n/g, '\n');
const PROGRESS_PAGE_RAW = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');
const SETTINGS_PAGE_RAW = fs.readFileSync(path.join(ROOT, 'src/pages/SettingsPage/SettingsPage.tsx'), 'utf8');
const ARTICLE_RAW = fs.readFileSync(path.join(ROOT, 'src/pages/ArticlePage/ArticlePage.tsx'), 'utf8');
function callback(source, name, globals) {
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!initializer) throw new Error(`Missing callback ${name}`);
  return compile(`export const action = ${initializer}`, {}, globals).action;
}
async function importFeedback(source, result) {
  const events = [];
  const run = callback(source, 'handleImportFile', {
    useCallback: (f) => f,
    importBackup: async () => {
      events.push(['import-start']);
      await Promise.resolve();
      events.push(['imported']);
      return result;
    },
    emitSyncDown: () => events.push(['sync']),
    backupBusyRef: { current: false }, setBackupBusy: () => {},
    setBackupReport: (report) => events.push(['report', report]),
    toast: { success: (s) => events.push(['success', s]), error: (s) => events.push(['error', s]) },
    window: { location: { reload: () => events.push(['reload']) } },
    setTimeout: (f) => f(),
  });
  await run({ text: async () => JSON.stringify(oldBackup) });
  return events;
}
const PARTIAL_RESULT = { restored: 1, restoredIdb: 0, restoredBooks: 0, failed: 1, failedIdb: 1, failedBooks: 1 };
const COMPLETE_RESULT = { restored: 1, restoredIdb: 2, restoredBooks: 3, failed: 0, failedIdb: 0, failedBooks: 0 };
// 忽略开始时清空报告，但不能忽略恢复后的通知或报告的先后顺序。
const feedbackOrder = (events) => events.filter(([event, report]) => event !== 'report' || report).map(([event]) => event).join(',');
const partial = await importFeedback(BACKUP_HOOK_RAW, PARTIAL_RESULT);
ok(!partial.some(([event]) => event === 'success' || event === 'reload') && partial.some(([event]) => event === 'error'), '部分恢复失败不报成功、不自动刷新');
ok(partial.filter(([event]) => event === 'report').at(-1)?.[1]?.includes('未恢复'), '部分恢复结果留在页面供重试前核对');
ok(feedbackOrder(partial) === 'import-start,imported,sync,report,error', '部分恢复先等写入结束再通知 hook 重读，随后保留失败报告且不刷新', feedbackOrder(partial));
const complete = await importFeedback(BACKUP_HOOK_RAW, COMPLETE_RESULT);
ok(complete.some(([event, text]) => event === 'success' && text.includes('3 本')) && complete.some(([event]) => event === 'reload'), '完整恢复展示原书数量并刷新');
ok(feedbackOrder(complete) === 'import-start,imported,sync,report,success,reload', '完整恢复同样先通知 hook 重读，再报告成功并刷新', feedbackOrder(complete));
const deletion = [];
await callback(ARTICLE_RAW, 'removeImported', {
  deleteImportedBook: async () => { throw new Error('quota'); },
  setImportedBooks: () => deletion.push('changed'),
  toast: { success: () => deletion.push('success'), error: () => deletion.push('error') },
})({ stopPropagation() {} }, 'imp_one').catch(() => deletion.push('uncaught'));
ok(JSON.stringify(deletion) === JSON.stringify(['error']), '删除导入书写失败保留界面条目且报告错误');

async function mutation(label, source, before, after, check) {
  if (source.split(before).length !== 2) throw new Error(`Mutation must match exactly once: ${label}`);
  ok(await check(source), `${label} 基线为真`);
  ok(!(await check(source.replace(before, after))), `${label} 变异必须被捕获`);
}
await mutation('M1 写入失败不得计成功', BK_RAW, 'if (safeStorage.setItem(key, value)) restored++;', 'if (true) { safeStorage.setItem(key, value); restored++; }', async (backupSource) => {
  const r = await backupHarness({ backupSource, localFailed: true }).backup.importBackup(oldBackup);
  return r.restored === 0 && r.failed === 1;
});
await mutation('M2 原书必须进文件', BK_RAW, '\n    importedBooks,\n', '\n    importedBooks: [],\n', async (backupSource) => {
  const h = backupHarness({ backupSource });
  h.db.values.set(BOOK_KEY, { key: BOOK_KEY, value: [book] });
  return (await h.backup.exportBackup()).file.importedBooks?.length === 1;
});
await mutation('M3 保留不冲突的本地书', IMPORTED_RAW, '...current.filter((book) => !restoredIds.has(book.id))', '...current.filter((book) => restoredIds.has(book.id))', async (importedSource) => {
  const h = backupHarness({ importedSource });
  h.db.values.set(BOOK_KEY, { key: BOOK_KEY, value: [resident] });
  await h.backup.importBackup({ ...oldBackup, importedBooks: [book] });
  return (await h.imported.loadImportedBooks()).some((b) => b.id === resident.id);
});
await mutation('M4 事务失败必须抛错', IDB_RAW, "if (!result.ok) throw new Error('本地数据库写入失败，请检查可用存储空间后重试');", 'if (!result.ok) return;', async (idbSource) => rejects(() => database('abort', new Map(), idbSource).api.idbSet('proof', 1)));
await mutation('M5 读失败不冒充空书库', IDB_RAW, "if (!result.ok) throw new Error('本地数据库读取失败，请重试');", 'if (!result.ok) return null;', async (idbSource) => rejects(() => database('open-error', new Map(), idbSource).api.idbGetStrict(BOOK_KEY)));
await mutation('M6 请求成功不算提交', IDB_RAW, 'req.onsuccess = () => { value = (req.result ?? null) as T | null; };', 'req.onsuccess = () => { value = (req.result ?? null) as T | null; resolve({ ok: true, value }); };', async (idbSource) => {
  const db = database('commit', new Map(), idbSource);
  await db.api.idbSet('proof', 1);
  return db.state.committed;
});
await mutation('M7 导入书校验不可省略', BK_RAW, 'if (file.importedBooks !== undefined) imported.validateImportedBooks(file.importedBooks);', '', async (backupSource) => {
  const h = backupHarness({ backupSource });
  return rejects(() => h.backup.importBackup({ ...oldBackup, importedBooks: [{}] }));
});
await mutation('M8 部分恢复不走全成功', BACKUP_HOOK_RAW, 'if (failed + failedIdb + failedBooks > 0)', 'if (false)', async (source) => {
  const events = await importFeedback(source, { restored: 1, restoredIdb: 0, restoredBooks: 0, failed: 1, failedIdb: 0, failedBooks: 0 });
  return events.some(([event]) => event === 'error') && !events.some(([event]) => event === 'reload' || event === 'success');
});
await mutation('M9 拒绝数组形状备份', BK_RAW, ' || Array.isArray(file.data)', '', async (backupSource) => rejects(() => backupHarness({ backupSource }).backup.importBackup({ ...oldBackup, data: [] })));
await mutation('M10 IDB 白名单不放行未知键', BK_RAW, 'if (!key.startsWith(IDB_BACKUP_PREFIX)) continue;', '', async (backupSource) => {
  const h = backupHarness({ backupSource });
  await h.backup.importBackup(oldBackup);
  return !h.db.values.has('arbitrary');
});
await mutation('M11 导出缓存失败必须提示', BK_RAW, '} catch { idbSkipped = true; }', '} catch {}', async (backupSource) => (await backupHarness({ backupSource, cacheFailed: true }).backup.exportBackup()).idbSkipped);
await mutation('M12 原书恢复失败必须计数', BK_RAW, 'catch { failedBooks = file.importedBooks.length; }', 'catch { failedBooks = 0; }', async (backupSource) => {
  const h = backupHarness({ backupSource, mode: 'open-error' });
  const r = await h.backup.importBackup({ ...oldBackup, importedBooks: [book] });
  return r.failedBooks === 1 && r.restoredBooks === 0;
});
const partialNotification = async (source) => feedbackOrder(await importFeedback(source, PARTIAL_RESULT)) === 'import-start,imported,sync,report,error';
const completeNotification = async (source) => feedbackOrder(await importFeedback(source, COMPLETE_RESULT)) === 'import-start,imported,sync,report,success,reload';
await mutation('M13 恢复后不能省略重读通知', BACKUP_HOOK_RAW, '      emitSyncDown();', '', partialNotification);
await mutation('M14 不能只在全成功时通知', BACKUP_HOOK_RAW, '      emitSyncDown();', '      if (failed + failedIdb + failedBooks === 0) emitSyncDown();', partialNotification);
const importResultLine = '      const { restored, restoredIdb, restoredBooks, failed, failedIdb, failedBooks } = await importBackup(parsed);';
const importThenNotify = `${importResultLine}\n      // 部分恢复不刷新，也必须重读已落盘数据，避免陈旧 hook 下一次写回覆盖它。\n      emitSyncDown();`;
await mutation('M15 不能在恢复落盘前通知', BACKUP_HOOK_RAW, importThenNotify, `      emitSyncDown();\n${importResultLine}`, partialNotification);
await mutation('M16 完整恢复通知不能延后到反馈之后', BACKUP_HOOK_RAW, '      emitSyncDown();', '      Promise.resolve().then(emitSyncDown);', completeNotification);
await mutation('M17 部分恢复报告不能随后被清空', BACKUP_HOOK_RAW, "        toast.error('部分数据未恢复，请查看下方结果并重试');", "        toast.error('部分数据未恢复，请查看下方结果并重试');\n        setBackupReport('');", async (source) => {
  const events = await importFeedback(source, PARTIAL_RESULT);
  return events.filter(([event]) => event === 'report').at(-1)?.[1]?.includes('未恢复');
});
await mutation('M18 persist 不得吞掉原书写入错误', IMPORTED_RAW, '  await idbSet(IDB_KEY, list);', '  try { await idbSet(IDB_KEY, list); } catch {}', async (importedSource) => {
  const h = backupHarness({ importedSource, mode: 'write-abort' });
  const r = await h.backup.importBackup({ ...oldBackup, data: {}, idb: {}, importedBooks: [book] });
  return h.db.state.writes === 1 && !h.db.values.has(BOOK_KEY) && r.restoredBooks === 0 && r.failedBooks === 1;
});

/* ───────────── E. 设置页「学习数据」与共享备份实现 ───────────── */
const usageSrc = fs.readFileSync(path.join(ROOT, 'src/lib/storage-usage.ts'), 'utf8');
const usageFile = path.join(TMP, 'storage-usage.mjs');
fs.writeFileSync(usageFile, ts.transpileModule(usageSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText);
const usage = await import(pathToFileURL(usageFile).href);
const usageEntries = new Map([['scope:a', 'xx'], ['other:b', 'secret'], ['scope:c', 'yyyy']]);
const fakeStorage = {
  length: usageEntries.size,
  key: (i) => [...usageEntries.keys()][i] ?? null,
  getItem: (k) => usageEntries.get(k) ?? null,
};
const measured = usage.measureLocalStorage(fakeStorage, 'scope:');
ok(measured.entries === 2 && measured.bytes === 40,
  '本地占用只数当前用户前缀，UTF-16 字节数按 (key+value)×2 计', JSON.stringify(measured));
ok(usage.formatBytes(0) === '0 B' && usage.formatBytes(1023) === '1023 B' &&
  usage.formatBytes(1024) === '1 KB' && usage.formatBytes(1536) === '1.5 KB' &&
  usage.formatBytes(1024 * 1024) === '1 MB',
  '存储容量格式化（B/KB/MB，去掉多余 .0）');

const exportBlock = BACKUP_HOOK_RAW.slice(
  BACKUP_HOOK_RAW.indexOf('const exportLearningData'),
  BACKUP_HOOK_RAW.indexOf('const handleImportFile'),
);
ok(exportBlock.length > 100 && /await exportBackup\(\)/.test(exportBlock),
  '导出逻辑在共享 hook 里调用真实 exportBackup');
ok(/safeStorage\.setItem\(LAST_BACKUP_KEY, completedAt\)/.test(exportBlock) &&
  exportBlock.indexOf('await exportBackup()') < exportBlock.indexOf('setLastBackupAt(completedAt)'),
  '上次备份时间只在导出成功后写入（失败不能谎报备份时间）');
ok(/setLastBackupAt\(completedAt\)/.test(exportBlock),
  '设置页可在导出完成后立即看到上次备份时间');
ok(/from '@\/lib\/use-backup-actions'/.test(PROGRESS_PAGE_RAW) &&
  /useBackupActions\(\)/.test(PROGRESS_PAGE_RAW) &&
  /<BackupFileInput/.test(PROGRESS_PAGE_RAW),
  '学习记录页改用共享 hook + 共享文件输入');
ok(!/const \[backupBusy/.test(PROGRESS_PAGE_RAW) &&
  !/const \[backupReport/.test(PROGRESS_PAGE_RAW) &&
  !/exportBackup|importBackup/.test(PROGRESS_PAGE_RAW),
  '学习记录页不再自己维护第二套备份实现');
ok(/from '@\/lib\/use-backup-actions'/.test(SETTINGS_PAGE_RAW) &&
  /useBackupActions\(\)/.test(SETTINGS_PAGE_RAW) &&
  /<BackupFileInput/.test(SETTINGS_PAGE_RAW),
  '设置页复用同一套导出/恢复与文件输入');
ok(/measureLocalStorage/.test(SETTINGS_PAGE_RAW) &&
  /navigator\.storage\?\.estimate/.test(SETTINGS_PAGE_RAW) &&
  /formatBytes/.test(SETTINGS_PAGE_RAW),
  '设置页展示本地条目/字节与浏览器存储估算（不支持时显示 —）');
ok(/data-settings-data/.test(SETTINGS_PAGE_RAW) &&
  /lastBackupAt/.test(SETTINGS_PAGE_RAW) &&
  /还没有导出过/.test(SETTINGS_PAGE_RAW),
  '学习数据区有稳定标记，并显示上次备份/未导出态');
ok(/navigate\('\/progress\?reset=1'\)/.test(SETTINGS_PAGE_RAW),
  '设置页「管理学习记录」走 /progress?reset=1 深链');
ok(/searchParams\.get\('reset'\)/.test(PROGRESS_PAGE_RAW) &&
  /setShowResetDialog\(true\)/.test(PROGRESS_PAGE_RAW) &&
  /next\.delete\('reset'\)/.test(PROGRESS_PAGE_RAW) &&
  /setSearchParams\(next, \{ replace: true \}\)/.test(PROGRESS_PAGE_RAW),
  '记录页消费 reset 深链：打开现有弹窗并抹掉参数（不重复弹）');

/* ───────────── 汇总 ───────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 整书翻译缓存确实进得了备份，且封顶/隔离/恢复口径都守住');
