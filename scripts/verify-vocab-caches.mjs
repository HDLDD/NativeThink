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

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
