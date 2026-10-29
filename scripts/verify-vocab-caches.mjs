/**
 * verify-vocab-caches.mjs — 缓存与存储写入基建的回归防线。
 *
 * 覆盖：
 *  ① capped-cache / colloc-ai-cache 的纯函数（封顶淘汰、合并、键序语义）；
 *  ② 各调用方的接线断言：键名拼写修正后不许再出现散落的旧键引用、
 *     三个无上限缓存（搭配释义/AI 例句/深度解析）必须有 cappedPut 封顶、
 *     持久化必须走 effect（setState 更新函数保持纯 —— StrictMode 双调用规则）；
 *  ④（2026-09-30 加）**存储写入的结果必须可见**：用注入的 localStorage 替身真跑
 *     safe-storage / capped-cache —— 配额满时 `setItem`/`persistJson` 返回 false、
 *     `warnStorageFull` 全站 60s 只提示一次；`appendCapped` 对**不可重算**的清单
 *     只拒绝新增、绝不裁剪已有条目。再断言七个用户清单的接线。
 *  ⑥（2026-10-05 加）**滚动窗口类清单的条数 + 字节双封顶**：`trimOldest` 纯函数真跑
 *     （超条数/超字节都从最旧丢、最新一条永远保留、上限 0 不越界），
 *     写作历史与跟读完成标记的接线/常量钉死，旧的"裸 setItem + slice(-50)"不许回来。
 *
 * 用法：node scripts/verify-vocab-caches.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

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

/** 把 lib 的 TS 源转成可导入的 .mjs（剥掉相对导入与 export 关键字，统一在末尾导出） */
function transpile(relPath, extraExports) {
  const src = readFileSync(join(ROOT, relPath), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export (?=(const|function|let|class))/gm, '');
  const mod = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-caches-')), relPath.replaceAll('/', '_') + '.mjs');
  writeFileSync(file, mod + `\nexport { ${extraExports} };`, 'utf8');
  return file;
}

// ── ① cappedPut：合并 + FIFO 封顶 ──
{
  const mod = await import(pathToFileURL(transpile('src/lib/capped-cache.ts', 'cappedPut')).href);
  const { cappedPut } = mod;

  let obj = {};
  obj = cappedPut(obj, 'a', 1, 5);
  obj = cappedPut(obj, 'b', 2, 5);
  obj = cappedPut(obj, 'a', 11, 5);           // 覆盖同键
  check(Object.keys(obj).length === 2 && obj.a === 11, 'cappedPut：覆盖同键不新增、值更新');

  obj = {};
  for (let i = 0; i < 5; i++) obj = cappedPut(obj, 'k' + i, i, 5);
  check(Object.keys(obj).join(',') === 'k0,k1,k2,k3,k4', 'cappedPut：上限内保留插入序');
  obj = cappedPut(obj, 'k5', 5, 5);           // 第 6 条 → 淘汰最早的 k0
  check(!('k0' in obj) && obj.k5 === 5 && Object.keys(obj).length === 5, 'cappedPut：超限淘汰最早写入（FIFO）');
  obj = cappedPut(obj, 'k2', 99, 5);          // 覆盖中间键不改变淘汰位次
  check(obj.k2 === 99 && !('k0' in obj) && 'k1' in obj, 'cappedPut：覆盖不重置插入序');
}

// ── ② mergeCollocAiCache：多键合并 + 400 上限 ──
{
  const mod = await import(pathToFileURL(transpile('src/lib/colloc-ai-cache.ts', 'mergeCollocAiCache')).href);
  const { mergeCollocAiCache } = mod;

  const merged = mergeCollocAiCache({ a: '甲' }, { b: '乙', c: '丙' });
  check(merged.a === '甲' && merged.c === '丙' && Object.keys(merged).length === 3, 'merge：批量合并保留双方');

  let cache = {};
  for (let i = 0; i < 450; i++) cache = mergeCollocAiCache(cache, { ['p' + i]: '释义' + i });
  check(Object.keys(cache).length === 400, 'merge：超 400 条封顶', `实际 ${Object.keys(cache).length}`);
  check(!('p0' in cache) && cache.p449 === '释义449', 'merge：淘汰的是最早写入的一批');
  const again = mergeCollocAiCache(cache, { p449: '更新' });
  check(again.p449 === '更新' && Object.keys(again).length === 400, 'merge：覆盖已有键不突破上限');
}

// ── ③ 接线断言：键名单点归属 + 三缓存必封顶 + 持久化走 effect ──
{
  const dlm = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx'), 'utf8');
  const ct = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/components/CollocationsTab.tsx'), 'utf8');
  const page = readFileSync(join(ROOT, 'src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'), 'utf8');
  const cacheLib = readFileSync(join(ROOT, 'src/lib/colloc-ai-cache.ts'), 'utf8');

  // 两个组件都必须走共享模块，且组件内不再出现拼写错误的键名字面量
  check(/from '@\/lib\/colloc-ai-cache'/.test(dlm), '每日学习：搭配缓存走共享模块');
  check(/from '@\/lib\/colloc-ai-cache'/.test(ct), '搭配学习：缓存走共享模块');
  check(!dlm.includes('__nativethink_colloc_ai_tranlations'), '每日学习：不再内联旧拼写键');
  check(!ct.includes('__nativethink_colloc_ai_tranlations'), '搭配学习：不再内联旧拼写键');
  check(cacheLib.includes("export const COLLOC_AI_TRANSLATIONS_KEY = '__nativethink_colloc_ai_translations'"), '正确键名只在共享模块定义一次');
  check(cacheLib.includes("COLLOC_AI_TRANSLATIONS_LEGACY_KEY = '__nativethink_colloc_ai_tranlations'") && cacheLib.includes('migrateStorageKey'), '旧键由共享模块迁移');

  // 封顶
  check(/cappedPut\(prev, key, \{ meaning: detail\.meaning/.test(page), '搭配释义缓存（colloc_cache）封顶');
  check(/cappedPut\(prev, key, \{ \.\.\.prev\[key\], sentences/.test(page), 'AI 例句缓存（word_ai_data）封顶');
  check(/cappedPut\(prev, key, text, 300\)/.test(page), 'AI 深度解析缓存（word_deep）封顶');
  check((page.match(/persistJson\('/g) ?? []).length >= 3, '三个缓存的落盘统一走 persist effect');

  // setState 更新函数必须纯：落盘不写在 updater 里（StrictMode 双调用）
  check(!/setCollocCache\(\(prev\) => \{[\s\S]{0,200}safeStorage\.setItem/.test(page), 'collocCache 更新函数内无落盘副作用');
  check(!/setDeepData\(\(prev\) => \{[\s\S]{0,200}safeStorage\.setItem/.test(page), 'deepData 更新函数内无落盘副作用');

  // ProgressPage 清理清单：新键必清，旧键保留只为兜底
  const progress = readFileSync(join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');
  check(progress.includes("'__nativethink_colloc_ai_translations'"), 'ProgressPage 清理清单包含正确键名');
}

// ── ④ 存储写入结果可见：注入 localStorage 替身，真跑 safe-storage + capped-cache ──
{
  const dir = mkdtempSync(join(tmpdir(), 'nt-storage-'));
  // sonner 替身：只记调用（warnStorageFull 的去抖要能被真跑观察到）
  writeFileSync(join(dir, 'sonner.mjs'),
    'export const toast = { error: (...a) => { (globalThis.__toasts ||= []).push(a); }, success: () => {}, info: () => {} };\n', 'utf8');

  const emit = (rel, exports, renames = []) => {
    let src = readFileSync(join(ROOT, rel), 'utf8');
    renames.forEach(([from, to]) => { src = src.split(from).join(to); });
    src = src.replace(/^export (?=(const|function|let|class))/gm, '');
    const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const name = basename(rel).replace(/\.ts$/, '.mjs');
    writeFileSync(join(dir, name), out + `\nexport { ${exports} };\n`, 'utf8');
    return name;
  };
  emit('src/lib/safe-storage.ts', 'safeStorage');
  emit('src/lib/capped-cache.ts', 'persistJson, appendCapped, warnStorageFull, readJson',
    [['from \'./safe-storage\'', 'from \'./safe-storage.mjs\''], ['from \'sonner\'', "from './sonner.mjs'"]]);

  /** 可切换"配额满"的 localStorage 替身 */
  const mkStub = () => {
    const store = new Map();
    const api = {
      full: false,
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        if (api.full) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        store.set(k, String(v));
      },
      removeItem: (k) => store.delete(k),
      store,
    };
    return api;
  };
  const stub = mkStub();
  globalThis.localStorage = stub;
  globalThis.window = globalThis;

  const ss = await import(pathToFileURL(join(dir, 'safe-storage.mjs')).href);
  const cc = await import(pathToFileURL(join(dir, 'capped-cache.mjs')).href);
  const { safeStorage } = ss;
  const { persistJson, appendCapped, warnStorageFull } = cc;

  check(safeStorage.setItem('nt_probe', 'v1') === true, '④ setItem 写成功返回 true');
  check(safeStorage.getItem('nt_probe') !== null, '④ 写进去的东西能读回来（替身确实被驱动）');
  stub.full = true;
  check(safeStorage.setItem('nt_probe2', 'v2') === false,
    '④ 配额满时 setItem 返回 false（过去这里 catch{} 吞掉，唯一症状是"刷新后数据没了"）');
  check(persistJson('nt_probe3', { a: 1 }) === false, '④ persistJson 把失败如实传给调用方');
  stub.full = false;
  check(persistJson('nt_probe4', { a: 1 }) === true, '④ 空间恢复后 persistJson 返回 true');

  globalThis.__toasts = [];
  warnStorageFull();
  warnStorageFull();
  warnStorageFull();
  check(globalThis.__toasts.length === 1,
    '④ warnStorageFull 60 秒去抖：连撞三次只提示一次', `实际 ${globalThis.__toasts.length} 条`);
  check(/空间不足/.test(String(globalThis.__toasts[0]?.[0])), '④ 提示说的是"存储空间不足"，不是笼统的失败');
  check(/清理/.test(String(globalThis.__toasts[0]?.[1]?.description || '')), '④ 提示给了出路（去哪清理）');

  // appendCapped：不可重算的清单只拒绝新增，绝不裁剪已有
  const base = ['a', 'b', 'c'];
  const ok = appendCapped(base, ['d'], 5);
  check(ok.next.join('') === 'abcd' && ok.added === 1, '④ appendCapped：有余量时正常追加');
  const part = appendCapped(base, ['d', 'e', 'f', 'g'], 5);
  check(part.added === 2 && part.next.length === 5 && part.next.slice(0, 3).join('') === 'abc',
    '④ appendCapped：只加得进剩下的 2 条，已有三条一条没动（拒绝 ≠ 裁剪）', JSON.stringify(part));
  const none = appendCapped(base, ['x', 'y'], 3);
  check(none.added === 0 && none.next.length === 3, '④ appendCapped：满了就整批拒绝并如实报 added=0');
  check(appendCapped(base, ['d'], 0).added === 0, '④ appendCapped：上限 0 不越界');
}

// ── ⑤ 接线：七个"用户创作、不可重算"的清单写失败都要可见 ──
{
  const KEY_SITES = [
    ['src/pages/WritingPage/WritingPage.tsx', '__nativethink_custom_prompts'],
    ['src/pages/ShadowingPage/ShadowingPage.tsx', '__nativethink_custom_shadowing'],
    ['src/pages/ShadowingPage/ShadowingPage.tsx', '__nativethink_shadowing_extra'],
    ['src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx', '__nativethink_custom_chunks'],
    ['src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx', '__nativethink_custom_translations'],
    ['src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx', '__nativethink_custom_backs'],
    ['src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx', '__nativethink_custom_natives'],
    ['src/lib/use-spelling-sentences.ts', '__nativethink_spelling_sentences'],
    ['src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx', '__nativethink_browse_memorized'],
  ];
  const cache = {};
  for (const [file, key] of KEY_SITES) {
    cache[file] = cache[file] ?? readFileSync(join(ROOT, file), 'utf8');
    const src = cache[file];
    // 有的地方直接写字面量，有的先定义 *_KEY 常量 —— 两种都算，但常量必须确实等于这个键
    const viaConst = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=(?:\\s*'${key}')`).exec(src);
    const pattern = viaConst
      ? new RegExp(`if \\(!persistJson\\(${viaConst[1]}[,)]`)
      : new RegExp(`if \\(!persistJson\\('${key}'[,)]`);
    check(pattern.test(src), `${key}：写入失败走 warnStorageFull 分支`);
    check(!new RegExp(`safeStorage\\.setItem\\('${key}'`).test(src),
      `${key}：不再用吞异常的裸 setItem 落盘`);
  }

  // 句子库到上限要**说出来**，而且区分"到上限"与"都导入过"
  const spelling = readFileSync(join(ROOT, 'src/pages/SpellingPage/SpellingPage.tsx'), 'utf8');
  // 钉"插值里真的把 skipped 说出来"，只查 `result.skipped` 这个 token 不够 ——
  // 三元判断的条件也在用它，把数字偷偷换成 0 仍然会有 token 残留（N8 变异就是这么溜掉的）。
  check(/\$\{result\.skipped\} 条未加入/.test(spelling),
    '拼写：AI 批量生成的 skipped 数字会展示给用户');
  check(/result\.count === 0[\s\S]{0,120}一条也没加进去/.test(spelling),
    '拼写：满库时"0 条"有独立说法，不写成"成功添加 0 条"');
  check((spelling.match(/句子库已到/g) ?? []).length >= 3,
    '拼写：三处都区分"已到上限"与"都导入过"', `实际 ${(spelling.match(/句子库已到/g) ?? []).length}`);
  const hook = cache['src/lib/use-spelling-sentences.ts'];
  check(/appendCapped\(sentences, newItems, SPELLING_SENTENCE_LIMIT\)/.test(hook),
    '拼写：批量添加用 appendCapped（拒绝新增而非裁剪已有）');
  check(/export const SPELLING_SENTENCE_LIMIT = 1200;/.test(hook), '拼写：句子库上限钉死 1200 条');
  check(/if \(sentences\.length >= SPELLING_SENTENCE_LIMIT\) return false;/.test(hook),
    '拼写：单条添加在满库时如实返回 false');
  check(!/\.slice\(-?SPELLING_SENTENCE_LIMIT\)/.test(hook) && !/splice\(/.test(hook),
    '正对照：拼写句子库里不许出现"按上限裁剪已有句子"的写法');

  // AI 派生缓存（可重算）才允许 FIFO
  const chunks = cache['src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx'];
  check(/cappedPut\(p, chunk\.id, zh, CHUNK_EXAMPLE_TRANS_KEYS\)/.test(chunks), '语块：例句翻译按 400 键封顶');
  check(/cappedPut\(\s*prev,\s*chunk\.id,[\s\S]{0,160}CHUNK_AI_SENTENCE_KEYS/.test(chunks), '语块：AI 例句按 200 键封顶');
  check(/\.slice\(-CHUNK_AI_SENTENCES_PER_KEY\)/.test(chunks), '语块：单个语块的例句数也封顶（保留最近的）');
  check(/cappedPut\(\s*prev,\s*key,[\s\S]{0,200}CHUNK_PHRASE_EXAMPLE_KEYS/.test(chunks), '短语：AI 例句按 300 键封顶');
  check(/from '@\/lib\/capped-cache'/.test(chunks), '语块页引入 capped-cache');
  // 上限值本身也要钉住 —— 只断言"用了常量名"的话，把 200 改成 2_000_000 照样绿
  check(/const CHUNK_AI_SENTENCE_KEYS = 200;/.test(chunks), '语块：例句键上限钉死 200');
  check(/const CHUNK_AI_SENTENCES_PER_KEY = 30;/.test(chunks), '语块：单语块例句上限钉死 30');
  check(/const CHUNK_EXAMPLE_TRANS_KEYS = 400;/.test(chunks), '语块：例句翻译上限钉死 400');
  check(/const CHUNK_PHRASE_EXAMPLE_KEYS = 300;/.test(chunks), '短语：例句上限钉死 300');
}

// ── ⑥ 滚动窗口类清单：条数 + 字节双封顶（2026-10-05 加）──
{
  const mod = await import(pathToFileURL(transpile('src/lib/capped-cache.ts', 'trimOldest')).href);
  const { trimOldest } = mod;

  const five = [1, 2, 3, 4, 5];
  check(trimOldest(five, 50, 1e9).join('') === '12345', '⑥ trimOldest：未超限原样保留');
  check(trimOldest(five, 3, 1e9).join('') === '345', '⑥ trimOldest：超条数保留最新，从最旧丢');
  // JSON.stringify('aaaa') = '"aaaa"'（6 字符）
  const byBytes = trimOldest(['aaaa', 'bbbb', 'cccc'], 50, 13);
  check(byBytes.join(',') === 'bbbb,cccc', '⑥ trimOldest：超字节时丢最旧（最新两条 12 ≤ 13）', JSON.stringify(byBytes));
  const huge = trimOldest(['aaaa', 'x'.repeat(100)], 50, 10);
  check(huge.length === 1 && huge[0].startsWith('x'), '⑥ trimOldest：单条就超预算时至少保留最新那条（丢更旧的）');
  check(trimOldest(five, 0, 1e9).length === 0, '⑥ trimOldest：条数上限 0 → 空（不许 slice(-0) 把整份放过去）');
  check(trimOldest([], 10, 10).length === 0, '⑥ trimOldest：空清单不炸');

  const wr = readFileSync(join(ROOT, 'src/pages/WritingPage/WritingPage.tsx'), 'utf8');
  check(/const WRITING_HISTORY_KEY = '__nativethink_writing_history';/.test(wr), '⑥ 写作历史键名单点定义');
  check(/const WRITING_HISTORY_LIMIT = 50;/.test(wr), '⑥ 写作历史条数上限钉死 50');
  check(/const WRITING_HISTORY_MAX_BYTES = 256 \* 1024;/.test(wr), '⑥ 写作历史字节上限钉死 256KB');
  check(/if \(!persistJson\(WRITING_HISTORY_KEY, trimOldest\(history, WRITING_HISTORY_LIMIT, WRITING_HISTORY_MAX_BYTES\)\)\)/.test(wr),
    '⑥ 写作历史：落盘走 trimOldest 双封顶');
  check(/warnStorageFull\(\)/.test(wr) && /persistJson\(WRITING_HISTORY_KEY/.test(wr), '⑥ 写作历史：写失败走 warnStorageFull 分支');
  check(!/safeStorage\.setItem\('__nativethink_writing_history'/.test(wr), '⑥ 写作历史不再用裸 setItem（吞异常）落盘');
  check(!/history\.slice\(-50\)/.test(wr), '⑥ 旧写法（slice(-50) 直接落盘）已消失');

  const sh = readFileSync(join(ROOT, 'src/pages/ShadowingPage/ShadowingPage.tsx'), 'utf8');
  check(/const SHADOWING_COMPLETED_LIMIT = 2000;/.test(sh), '⑥ 跟读完成标记条数上限钉死 2000');
  check(/const SHADOWING_COMPLETED_MAX_BYTES = 64 \* 1024;/.test(sh), '⑥ 跟读完成标记字节上限钉死 64KB');
  check(/if \(!persistJson\(COMPLETED_KEY, trimOldest\(\[\.\.\.completedSentences\], SHADOWING_COMPLETED_LIMIT, SHADOWING_COMPLETED_MAX_BYTES\)\)\)/.test(sh),
    '⑥ 跟读完成标记：落盘走 trimOldest 双封顶');
  check(/warnStorageFull\(\)/.test(sh) && /persistJson\(COMPLETED_KEY/.test(sh), '⑥ 跟读完成标记：写失败走 warnStorageFull 分支');
  check(!/safeStorage\.setItem\(COMPLETED_KEY/.test(sh), '⑥ 跟读完成标记不再用裸 setItem（吞异常）落盘');
}

// ── ⑦ 生词本/助记：真实存储链 + 页面回调；所有变异仅在内存中运行 ──
{
  const source = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const customSrc = source('src/lib/custom-words.ts');
  const notesSrc = source('src/lib/word-notes.ts');
  const storageSrc = source('src/lib/safe-storage.ts');
  const cappedSrc = source('src/lib/capped-cache.ts');
  const readerSrc = source('src/pages/ArticlePage/components/PageReader.tsx');
  const flashSrc = source('src/pages/DeepVocabularyPage/components/FlashcardMode.tsx');
  const word = { word: 'serendipity', phonetic: '/s/', partOfSpeech: 'n.', meaning: '旧释义', source: '阅读' };
  const seedWord = { ...word, addedAt: 1234 };
  const specs = [
    { label: '生词本', src: customSrc, key: '__nativethink_custom_words', event: 'nativethink-custom-words-changed', seed: [seedWord], arg: 'list' },
    { label: '助记', src: notesSrc, key: '__nativethink_word_notes', event: 'nativethink-word-notes-changed', seed: { serendipity: '旧助记' }, arg: 'next' },
  ];
  const compile = (src, globals = {}, dependencies = {}) => {
    const exports = {};
    const js = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, removeComments: true },
    }).outputText;
    runInNewContext(js, {
      ...globals, exports,
      require: (name) => {
        if (!(name in dependencies)) throw new Error(`未提供替身：${name}`);
        return dependencies[name];
      },
    });
    return exports;
  };
  const harness = (spec, src = spec.src) => {
    const store = new Map(), events = [], warnings = [];
    const h = { full: false, writes: 0, events, warnings };
    const globals = {
      localStorage: {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => {
          h.writes++;
          if (h.full) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
          store.set(k, String(v));
        },
        removeItem: (k) => store.delete(k),
      },
      window: {
        appId: 'cache-test', _userInfo: { user_id: 'test' },
        dispatchEvent: (e) => { events.push({ type: e.type, raw: h.raw(), cache: JSON.stringify(h.api.readForTest()) }); },
      },
      CustomEvent: class { constructor(type) { this.type = type; } },
    };
    const storage = compile(storageSrc, globals);
    const capped = compile(cappedSrc, globals, {
      './safe-storage': storage,
      sonner: { toast: { error: (...args) => warnings.push(args) } },
    });
    h.storage = storage.safeStorage;
    h.raw = () => h.storage.getItem(spec.key);
    h.storage.setItem(spec.key, JSON.stringify(spec.seed));
    h.writes = 0;
    h.api = compile(src + '\nexport { read as readForTest };', globals, {
      './safe-storage': storage, './capped-cache': capped,
      react: { useCallback: (fn) => fn, useState: (init) => [init(), () => {}], useEffect: () => {} },
      './sync-down': { useSyncDown: () => {} },
    });
    return h;
  };
  const rows = [];
  const record = (bag, label, cond) => bag.push({ label, cond: !!cond });
  const cases = (spec) => spec.label === '生词本' ? [
    { name: '新增', run: (a) => a.addCustomWord({ ...word, word: '  Ephemeral  ' }), result: 'added', valid: (a) => a.isCustomWord('ephemeral') && a.getCustomWords().length === 2 },
    { name: '更新', run: (a) => a.addCustomWord({ ...word, word: ' SERENDIPITY ', meaning: '新释义' }), result: 'updated', valid: (a) => a.getCustomWords().length === 1 && a.getCustomWords()[0].meaning === '新释义' && a.getCustomWords()[0].addedAt === 1234 },
    { name: '删除', run: (a) => a.removeCustomWord(' SERENDIPITY '), valid: (a) => !a.isCustomWord('serendipity') && a.getCustomWords().length === 0 },
  ] : [
    { name: '新增', run: (a) => a.setWordNote(' EPHEMERAL ', ' 新助记 '), result: true, valid: (a) => a.getWordNote('ephemeral') === '新助记' && a.countWordNotes() === 2 },
    { name: '更新', run: (a) => a.setWordNote(' SERENDIPITY ', ' 新助记 '), result: true, valid: (a) => a.getWordNote('serendipity') === '新助记' && a.countWordNotes() === 1 },
    { name: '删除', run: (a) => a.setWordNote(' SERENDIPITY ', '  '), result: true, valid: (a) => !a.hasWordNote('serendipity') && a.countWordNotes() === 0 },
    { name: 'hook setter', run: (a) => a.useWordNote('serendipity')[1]('新助记'), result: true, valid: (a) => a.getWordNote('serendipity') === '新助记' },
  ];
  const storeChecks = (spec, src = spec.src) => {
    const bag = [];
    for (const c of cases(spec)) {
      const h = harness(spec, src), a = h.api;
      const cache = a.readForTest(), before = JSON.stringify(cache), raw = h.raw();
      h.full = true;
      const result = c.run(a), prefix = `${spec.label}/${c.name}`;
      if ('result' in c) record(bag, `${prefix}/失败返回`, result === (spec.label === '生词本' ? 'failed' : false));
      record(bag, `${prefix}/失败缓存不变`, a.readForTest() === cache && JSON.stringify(a.readForTest()) === before);
      record(bag, `${prefix}/失败存储不变`, h.raw() === raw && h.writes === 1);
      record(bag, `${prefix}/失败不广播`, h.events.length === 0);
      record(bag, `${prefix}/失败提示`, h.warnings.length === 1 && /空间不足/.test(h.warnings[0][0]));
      // 重置读缓存也不能把失败的改动读回来。
      if (spec.label === '生词本') a.invalidateCustomWordsCache(); else a.invalidateWordNotesCache();
      record(bag, `${prefix}/失败重读不变`, JSON.stringify(a.readForTest()) === before);
      h.full = false;
      const eventCount = h.events.length;
      const retried = c.run(a);
      if ('result' in c) record(bag, `${prefix}/重试返回`, retried === c.result);
      record(bag, `${prefix}/重试成功`, c.valid(a) && h.raw() === JSON.stringify(a.readForTest()));
      const event = h.events[eventCount];
      record(bag, `${prefix}/成功广播`, h.events.length === eventCount + 1 && event?.type === spec.event && event.raw === h.raw() && event.cache === h.raw());
      record(bag, `${prefix}/成功不警告`, h.warnings.length === 1);
    }
    const h = harness(spec, src), before = h.raw();
    const result = spec.label === '生词本' ? h.api.addCustomWord({ ...word, word: ' ' }) : h.api.setWordNote(' ', '助记');
    record(bag, `${spec.label}/空词拒绝`, result === (spec.label === '生词本' ? 'failed' : false) && h.raw() === before && h.writes === 0 && h.events.length === 0);
    return bag;
  };
  specs.forEach((s) => rows.push(...storeChecks(s)));

  const findNodes = (src, predicate) => {
    const file = ts.createSourceFile('site.tsx', src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
    const found = [];
    const visit = (node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
    visit(file);
    return found;
  };
  const only = (nodes) => {
    if (nodes.length !== 1) throw new Error(`回调锚点应唯一，实际 ${nodes.length}`);
    return nodes[0];
  };
  const callback = (text, globals) => compile(`export const callback = ${text};`, globals).callback;
  const readerChecks = async (src) => {
    const bag = [];
    const node = only(findNodes(src, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'addToLearning'));
    const text = node.initializer.arguments[0].getText();
    for (const existing of [false, true]) {
      const spec = { ...specs[0], seed: existing ? [seedWord] : [] };
      const h = harness(spec), reviews = [], successes = [], infos = [];
      const action = callback(text, {
        findWord: () => undefined,
        lookupDictionary: async () => ({ translation: '新释义' }),
        addCustomWord: h.api.addCustomWord, toWordEntry: h.api.toWordEntry,
        recordWordLearn: (...args) => reviews.push(args),
        toast: { success: (s) => successes.push(s), info: (s) => infos.push(s) },
        content: { title: '测试书' },
      });
      const prefix = `阅读器/${existing ? '更新' : '新增'}`;
      h.full = true;
      action(word.word);
      await new Promise(setImmediate);
      record(bag, `${prefix}/失败拦截`, reviews.length === 0 && successes.length === 0 && infos.length === 0 && h.warnings.length === 1);
      reviews.length = 0;
      successes.length = 0;
      h.full = false;
      action(word.word);
      await new Promise(setImmediate);
      record(bag, `${prefix}/成功进度`, reviews.length === 1 && reviews[0][0].word === word.word && reviews[0][0].level === 'custom' && reviews[0][1] === 0);
      record(bag, `${prefix}/成功文案`, successes.length === 1 && (existing ? /已在生词本中/.test(successes[0]) : /已存入生词本/.test(successes[0])));
    }
    return bag;
  };
  const noteChecks = (src) => {
    const bag = [];
    const textarea = only(findNodes(src, (n) => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'Textarea' && n.attributes.properties.some((p) => p.name?.getText() === 'value' && p.initializer?.expression?.getText() === 'noteDraft')));
    const handler = (name) => only(textarea.attributes.properties.filter((p) => p.name?.getText() === name)).initializer.expression.getText();
    const h = harness(specs[1]);
    const state = { noteDraft: '', editing: false, noteWord: '' };
    const globals = {
      setNote: h.api.useWordNote(word.word)[1],
      setEditingNote: (v) => { state.editing = typeof v === 'function' ? v(state.editing) : v; },
      setNoteDraft: (v) => { state.noteDraft = v; },
      setNoteWord: (v) => { state.noteWord = v; },
    };
    const toggleNode = only(findNodes(src, (n) => ts.isJsxAttribute(n) && n.name.getText() === 'onClick' && n.parent.parent.tagName?.getText() === 'button' && n.initializer.getText().includes('setEditingNote')));
    const toggle = () => callback(toggleNode.initializer.expression.getText(), {
      ...globals, note: h.api.getWordNote(word.word), noteDraft: state.noteDraft,
      editingNote: state.editing, isEditingNote: state.editing && state.noteWord === word.word,
      shown: { word: word.word },
    })({ stopPropagation() {} });
    toggle();
    record(bag, '助记界面/打开沿用已保存内容', state.editing && state.noteDraft === '旧助记');
    const ownsDraft = (shownWord) => {
      const node = findNodes(src, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'isEditingNote')[0];
      return node ? callback(`() => (${node.initializer.getText()})`, { editingNote: state.editing, noteWord: state.noteWord, shown: { word: shownWord } })() : state.editing;
    };
    record(bag, '助记界面/切词不沿用编辑器', ownsDraft(word.word) && !ownsDraft('ephemeral'));
    const editorBranch = only(findNodes(src, (n) => ts.isConditionalExpression(n) && n.whenTrue.getText().includes('value={noteDraft}')));
    record(bag, '助记界面/编辑器绑定词面', editorBranch.condition.getText() === 'isEditingNote');
    callback(handler('onChange'), globals)({ target: { value: '修改后的草稿' } });
    record(bag, '助记界面/受控草稿', state.noteDraft === '修改后的草稿');
    const blur = () => callback(handler('onBlur'), { ...globals, noteDraft: state.noteDraft })();
    h.full = true;
    toggle();
    record(bag, '助记界面/收起失败保留草稿', state.editing && state.noteDraft === '修改后的草稿' && h.api.getWordNote(word.word) === '旧助记');
    blur();
    record(bag, '助记界面/失败保留草稿', state.editing && state.noteDraft === '修改后的草稿' && h.api.getWordNote(word.word) === '旧助记');
    h.full = false;
    blur();
    record(bag, '助记界面/成功收起', !state.editing && h.api.getWordNote(word.word) === '修改后的草稿' && h.events.length === 1);
    h.api.setWordNote(word.word, '另一端更新的助记');
    toggle();
    record(bag, '助记界面/再次打开重读内容', state.editing && state.noteDraft === '另一端更新的助记');
    return bag;
  };
  rows.push(...await readerChecks(readerSrc), ...noteChecks(flashSrc));
  rows.forEach((r) => check(r.cond, `⑦ ${r.label}`));

  // 只有真基线全绿才做变异，防止原本就红的断言冒充变异检出。
  if (rows.every((r) => r.cond)) {
    const replaceOnce = (src, from, to) => {
      if (src.split(from).length !== 2) throw new Error(`变异锚点不唯一：${from}`);
      return src.replace(from, to);
    };
    const caught = (name, mutated, target, positive) => {
      check(mutated.some((r) => target(r.label) && !r.cond), `⑦ 变异 ${name} 必须验红`);
      const controls = mutated.filter((r) => positive(r.label));
      check(controls.length > 0 && controls.every((r) => r.cond), `⑦ 变异 ${name} 成功正对照仍绿`);
    };
    for (const spec of specs) {
      const guard = `if (!persistJson(KEY, ${spec.arg})) {`;
      const variants = [
        ['忽略 persist 返回值', guard, `if (!(persistJson(KEY, ${spec.arg}), true)) {`, '/失败返回'],
        ['失败也改缓存', guard, `${guard}\n    _cache = ${spec.arg};`, '/失败缓存不变'],
        ['失败也广播', guard, `${guard}\n    window.dispatchEvent(new CustomEvent(EVENT));`, '/失败不广播'],
        ['失败不提示', 'warnStorageFull();', '', '/失败提示'],
      ];
      for (const [name, from, to, suffix] of variants) {
        caught(`${spec.label}/${name}`, storeChecks(spec, replaceOnce(spec.src, from, to)), (s) => s.endsWith(suffix), (s) => s.endsWith('/重试成功'));
      }
    }
    caught('阅读器不拦 failed', await readerChecks(replaceOnce(readerSrc, "if (result === 'failed') return;", '')), (s) => s.endsWith('/失败拦截'), (s) => /\/成功(进度|文案)$/.test(s));
    caught('助记无条件收起', noteChecks(replaceOnce(flashSrc, 'onBlur={() => { if (setNote(noteDraft)) setEditingNote(false); }}', 'onBlur={() => { setNote(noteDraft); setEditingNote(false); }}')), (s) => s.endsWith('/失败保留草稿'), (s) => s.endsWith('/成功收起'));
    caught('助记打开不读原文', noteChecks(replaceOnce(flashSrc, 'setNoteDraft(note);', "setNoteDraft('');")), (s) => s.endsWith('/打开沿用已保存内容'), (s) => s.endsWith('/成功收起'));
    caught('助记不隔离词面', noteChecks(replaceOnce(flashSrc, 'editingNote && noteWord === shown?.word', 'editingNote')), (s) => s.endsWith('/切词不沿用编辑器'), (s) => s.endsWith('/成功收起'));
    caught('助记编辑器绕过隔离', noteChecks(replaceOnce(flashSrc, '{isEditingNote ? (', '{editingNote ? (')), (s) => s.endsWith('/编辑器绑定词面'), (s) => s.endsWith('/成功收起'));
  }
}

// ── ⑧ 核心学习数据写失败可见（2026-10-29） ──
// safeStorage.setItem 在配额满时返回 false 而不抛错；核心进度如果只包 try/catch，
// 数据会静默丢在内存里、刷新后回退。这里钉住 persistText 闸门与各核心模块的接线。
{
  const capped = readFileSync(join(ROOT, 'src/lib/capped-cache.ts'), 'utf8');
  check(/export function persistText[\s\S]{0,300}?if \(!ok\) warnStorageFull\(\);/.test(capped),
    '⑧ persistText：setItem 返回 false 时必须 warnStorageFull');
  const core = {
    'src/lib/use-learning-stats.ts': 2,
    'src/lib/use-word-learning.ts': 4,
    'src/lib/use-phrase-learning.ts': 3,
    'src/lib/use-spelling-learning.ts': 3,
    'src/lib/quickcard-history.ts': 4,
    'src/lib/use-sentence-review.ts': 1,
    'src/lib/use-achievements.ts': 1,
    'src/lib/use-custom-scenarios.ts': 1,
    'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx': 2,
    'src/pages/DeepVocabularyPage/components/CollocationsTab.tsx': 2,
    'src/pages/ArticlePage/ArticlePage.tsx': 4,
    'src/pages/ProgressPage/ProgressPage.tsx': 1,
  };
  for (const [rel, min] of Object.entries(core)) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const n = (src.match(/persistText\(/g) || []).length;
    check(n >= min, `⑧ ${rel}：核心学习数据写入走 persistText（≥${min} 处）`, `实际 ${n}`);
  }
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 100).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
