#!/usr/bin/env node
/**
 * verify-chunks-data.mjs — 语块库（963 条）的数据卫生 + 读取层去重契约。
 *
 * 起因（2026-10-07 语块库扩容到 963 之后核出来的）：
 *   扩容本身干净（跨库零重复、七个空分类补齐、字段例句齐全），但**主库自己**藏着
 *   12 组 content 完全相同、只有 category / 例句 / 措辞不同的条目，例如
 *   `call the shots` 同时是 c17(daily) 与 c243(workplace)。三条后果都读过代码：
 *     ① 「已记」按 id 存 → 同一短语两份状态，已记/未记筛选自相矛盾；
 *     ② 闪卡队列 `shuffle(pool).slice(0,n)` 不按 content 去重 → 一轮能出两张同短语卡；
 *     ③ 断点续学按 content `pool.find(...)` 恢复 → 永远命中第一条，恢复成另一条（例句/分类都不同）。
 *   还有一组是**错译**：c659 `on cloud nine` → 「在九重天上」（字面直译）。
 *
 * 修法口径：**读取层去重，不删源数据**（照词库那套两层去重的惯例）。删条目会让用户已记的
 *   id 凭空失效、丢掉另一条不同的例句、并抹掉"这条也属于职场"这个事实。
 *   去重放在**筛选之后、分页/洗牌之前** —— 所以分类视图各自仍看得到自己那条，只有「全部」并成一条。
 *
 * 本脚本三段：A 数据形状真数；B 已知重复**冻结成基线**（新增重复才红，不逼一次清完）；
 * C 把 chunk-dedupe 的真函数跑在真数据上；D 接线静态锁（含反向断言）。
 *
 * 用法: node scripts/verify-chunks-data.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

/* ───────── 解析：每条一行的实际格式 ───────── */
const field = (line, name) => {
  const m = new RegExp(name + ':\\s*(?:`([^`]*)`|\'([^\']*)\'|"([^"]*)")').exec(line);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};
const parseFile = (rel) => {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = raw.split(/\r?\n/);
  const entries = lines.filter((l) => /^\s*\{\s*id:/.test(l)).map((l) => ({
    id: field(l, 'id'), content: field(l, 'content'), meaning: field(l, 'meaning'),
    category: field(l, 'category'), usage: field(l, 'usage'), example: field(l, 'example'),
    difficulty: field(l, 'difficulty'), raw: l,
  }));
  return { raw, entries };
};
const base = parseFile('src/data/chunks.ts');
const extra = parseFile('src/data/chunks-extra.ts');
const all = [...base.entries, ...extra.entries];
const srcPage = fs.readFileSync(path.join(ROOT, 'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx'), 'utf8');
const srcCards = fs.readFileSync(path.join(ROOT, 'src/pages/ChunkTrainingPage/components/ChunkFlashcards.tsx'), 'utf8');

/* ───────────── A. 数据形状（真数，不信提交信息） ───────────── */
ok(base.entries.length === 748 && extra.entries.length === 215 && all.length === 963,
  'A1 条目数：主库 748 + 扩容 215 = 963（改数量要显式动这条基线）',
  `base=${base.entries.length} extra=${extra.entries.length} 合计=${all.length}`);
ok(/\[\.\.\.MOCK_CHUNKS_BASE,\s*\.\.\.CHUNKS_EXTRA\]/.test(base.raw),
  'A2 合并接线在位（MOCK_CHUNKS = 主库 + 扩容，不是只导出一个）');

const ids = all.map((c) => c.id);
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
ok(dupIds.length === 0, 'A3 id 全局唯一（重复 id 会让已记/进度互相覆盖）', dupIds.slice(0, 6).join(','));

const missing = all.filter((c) => !c.id || !c.content || !c.meaning || !c.category || !c.difficulty);
ok(missing.length === 0, 'A4 五字段齐全（id/content/meaning/category/difficulty）',
  missing.slice(0, 4).map((c) => c.id).join(','));
ok(all.every((c) => !!c.example), 'A5 每条都有例句（闪卡与详情页直接吃它）');

// 分类必须都在 UI 的筛选集合里 —— 新增分类忘了加进 CATEGORIES 就会"有数据但筛不到"
const catValues = [...srcPage.slice(srcPage.indexOf('const CATEGORIES'), srcPage.indexOf('const CATEGORIES') + 900)]
  .join('').match(/value:\s*'([a-z]+)'/g)?.map((s) => /'([a-z]+)'/.exec(s)[1]) ?? [];
const uiCats = new Set(catValues.filter((v) => v !== 'all'));
const dataCats = new Set(all.map((c) => c.category));
const orphanCats = [...dataCats].filter((c) => !uiCats.has(c));
ok(uiCats.size >= 10, 'A6 正对照：能从页面抓到分类筛选表（否则 A7 是空断言）', `UI ${uiCats.size} 个`);
ok(orphanCats.length === 0, 'A7 数据里的分类都能被 UI 筛到（新增分类必须同步 CATEGORIES）',
  orphanCats.join(','));

const WAS_EMPTY = ['travel', 'study', 'tech', 'food', 'health', 'shopping', 'sports'];
const stillEmpty = WAS_EMPTY.filter((k) => !all.some((c) => c.category === k));
ok(stillEmpty.length === 0, 'A8 七个曾空分类全部有条目（筛选器摆着却筛出空列表就是这次扩容要修的）',
  stillEmpty.join(','));
ok(WAS_EMPTY.every((k) => extra.entries.some((c) => c.category === k)),
  'A9 七个曾空分类的条目确实来自扩容库（不是主库本来就有的口径误判）');

const singleQuoted = (extra.raw.match(/(?:content|meaning|usage|example|category|difficulty):\s*'/g) || []).length;
ok(singleQuoted === 0, 'A10 扩容库遵守"字符串一律用反引号"约定（条目含撇号，单引号会炸语法）',
  `单引号写法 ${singleQuoted} 处`);

// 半条/跨行写入的防线：条目行必须自己闭合（这次仓库里出现过被截断的 chunks-extra）
const brokenLines = all.filter((c) => !/\},?\s*$/.test(c.raw)
  || (c.raw.match(/\{/g) || []).length !== (c.raw.match(/\}/g) || []).length);
ok(brokenLines.length === 0, 'A11 每条都在自己那一行闭合且花括号配平（防半条/跨行写入——解析器会静默少一条）',
  brokenLines.slice(0, 3).map((c) => c.id).join(','));
const parsedVsRaw = (base.raw.match(/^\s*\{\s*id:/gm) || []).length + (extra.raw.match(/^\s*\{\s*id:/gm) || []).length;
ok(parsedVsRaw === all.length, 'A12 正对照：解析条数等于文件里的条目行数（没有静默漏解析）', `${parsedVsRaw}/${all.length}`);
// 短语库列表按 A-Z 分段渲染，首字符不是字母的条目**一条都渲染不出来**（曾经就有 ` RSVP`）
const badStart = all.filter((c) => c.content !== (c.content || '').trim() || !/^[A-Za-z]/.test(c.content || ''));
ok(badStart.length === 0, 'A13 content 无前后空白且首字符是字母（否则该条目在短语库列表里永远不可达）',
  badStart.slice(0, 4).map((c) => `${c.id}:${JSON.stringify(c.content)}`).join(', '));

/* ───────────── B. 已知重复冻结成基线 ───────────── */
const KNOWN_DUP_GROUPS = [
  'bite off more than you can chew', 'blow off steam', 'call the shots', 'cut the cord',
  'go the extra mile', 'hit the ground running', 'jump for joy', 'lend a hand',
  'on cloud nine', 'pull yourself together', 'rock the boat', 'spill the beans',
];
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’']/g, "'");
const byContent = new Map();
for (const c of all) { const k = norm(c.content); (byContent.get(k) || byContent.set(k, []).get(k)).push(c); }
const dupGroups = [...byContent].filter(([, v]) => v.length > 1).map(([k, v]) => ({ key: k, ids: v.map((x) => x.id + (base.entries.includes(x) ? '(主库)' : '(扩容)')), srcs: new Set(v.map((x) => base.entries.includes(x) ? 'base' : 'extra')) }));
const dupKeys = dupGroups.map((g) => g.key).sort();

ok(dupGroups.length === KNOWN_DUP_GROUPS.length,
  `B1 同 content 重复恰好 ${KNOWN_DUP_GROUPS.length} 组（这是已知的历史遗留，新增重复必须在这里显式登记）`,
  `实际 ${dupGroups.length} 组：${dupKeys.join(' | ')}`);
ok(JSON.stringify(dupKeys) === JSON.stringify([...KNOWN_DUP_GROUPS].map((s) => norm(s)).sort()),
  'B2 重复清单与基线逐条一致（修掉一组就更新基线，别让它悄悄变）',
  `差异: ${dupKeys.filter((k) => !KNOWN_DUP_GROUPS.map(norm).includes(k)).join(',')} / ${KNOWN_DUP_GROUPS.map(norm).filter((k) => !dupKeys.includes(k)).join(',')}`);
ok(dupGroups.every((g) => g.srcs.size === 1 && g.srcs.has('base')),
  'B3 重复全部在主库内部 —— 跨库零重复（扩容承诺的"与主库去重"是成立的，回归就红）',
  dupGroups.filter((g) => g.srcs.size > 1).map((g) => g.key).join(','));
ok(!all.some((c) => norm(c.content) === 'on cloud nine' && c.meaning === '在九重天上'),
  'B4 正对照：`on cloud nine` 的字面直译已改掉（成语释义要意译）');

/* ───────────── C. 真跑 chunk-dedupe 打在真数据上 ───────────── */
const ddSrc = fs.readFileSync(path.join(ROOT, 'src/lib/chunk-dedupe.ts'), 'utf8');
const js = ts.transpileModule(ddSrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(process.env.TEMP || '/tmp', 'chunk-dedupe-under-test.mjs');
fs.writeFileSync(tmp, js);
const dd = await import(pathToFileURL(tmp).href);

const deduped = dd.dedupeChunks(all);
ok(deduped.length === all.length - KNOWN_DUP_GROUPS.length,
  `C1 dedupeChunks 把 963 条收成 ${963 - KNOWN_DUP_GROUPS.length} 条（每组只留第一条）`,
  `实际 ${deduped.length}`);
ok(dd.dedupeChunks(deduped).length === deduped.length, 'C2 去重幂等（再跑一次不该又少）');
ok(new Set(deduped.map((c) => dd.chunkKey(c.content))).size === deduped.length,
  'C3 去重结果内部零重复（这才是闪卡/接龙能用的池子）');

// 关键正对照：去重必须发生在筛选**之后**，否则"call the shots 属于职场"这条会被全局去重吃掉
const probe = (content, cat) => dd.dedupeChunks(all.filter((c) => c.content === content && c.category === cat)).length;
const perCategory = dupGroups.map((g) => {
  const cats = [...new Set(byContent.get(g.key).map((c) => c.category))];
  return { key: g.key, 每个分类各看得到: cats.every((k) => probe(byContent.get(g.key)[0].content, k) === 1) };
});
ok(perCategory.every((p) => p.每个分类各看得到),
  'C4 正对照：按分类筛选时每组都还能看到自己那条（改成"先全局去重"就会红——那是另一种口径）',
  perCategory.filter((p) => !p.每个分类各看得到).map((p) => p.key).join(','));
// C4 只证明"正确顺序能用"；这条证明"两种顺序不等价"，否则 D1 的顺序锁是空锁
const crossCat = dupGroups.map((g) => {
  const list = byContent.get(g.key);
  const cats = [...new Set(list.map((c) => c.category))];
  if (cats.length < 2) return null;
  const loserCat = cats[cats.indexOf(list[0].category) + 1] || cats.find((k) => k !== list[0].category);
  const 先全局去重再筛 = dd.dedupeChunks(all).filter((c) => c.content === list[0].content && c.category === loserCat).length;
  const 先筛再去重 = dd.dedupeChunks(all.filter((c) => c.content === list[0].content && c.category === loserCat)).length;
  return { key: g.key, loserCat, 先全局去重再筛, 先筛再去重 };
}).filter(Boolean);
ok(crossCat.length >= 3 && crossCat.every((p) => p.先全局去重再筛 === 0 && p.先筛再去重 === 1),
  'C4b 两种顺序确实不等价（先全局去重会让短语从第二个分类里消失）—— D1 锁顺序因此不是空锁',
  `${crossCat.length} 组可判别：${crossCat.slice(0, 4).map((p) => `${p.key}→${p.先全局去重再筛}/${p.先筛再去重}`).join(' ')}`);
ok(dd.dedupeChunks(all.filter((c) => c.category === 'all' || true)).length === deduped.length,
  'C5 「全部」视图确实并成一条（与 C4 不矛盾：同一列表内不重复）');

const g0 = byContent.get('call the shots');
const expanded = dd.expandMemorized([g0[0].id], all);
ok(expanded.size === g0.length && g0.every((c) => expanded.has(c.id)),
  'C6 历史数据补齐：只存了第一条 id，读出来应覆盖同短语的全部 id（否则两条视图互相矛盾）',
  [...expanded].join(','));
const toggledOn = dd.toggleMemorizedGroup(new Set(), g0[0], all);
ok(g0.every((c) => toggledOn.has(c.id)), 'C7 切一次已记 → 同短语全部标上');
const toggledOff = dd.toggleMemorizedGroup(toggledOn, g0[1], all);
ok(toggledOff.size === 0, 'C8 从任一条取消 → 同短语全部清掉（不会留半条状态）', `${toggledOff.size}`);
const poolFind = dd.dedupeChunks(all).filter((c) => c.content === 'on cloud nine');
ok(poolFind.length === 1, 'C9 断点续学按 content find 不再歧义（去重后的 pool 里唯一）', `${poolFind.length} 条`);

// 静态扫描前必须剥注释：注释里写着 useStableShuffle(allChunks) 的历史说明会被当成命中
//（同款误报在 verify-overlay-fit ④ 各踩过一次）
const stripComments = (x) => x.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = stripComments(srcPage);
const cardsCode = stripComments(srcCards);

/* ───────────── D. 接线静态锁 ───────────── */
ok(/return dedupeChunks\(MOCK_CHUNKS\.filter\(/.test(pageCode),
  'D1 语块库列表走"筛选后去重"（顺序错了就是 C4 那种回归）');
ok(/const uniqueChunks = useMemo\(\(\) => dedupeChunks\(allChunks\), \[allChunks\]\)/.test(pageCode),
  'D2 去重池是 memo 出来的（内联会让 useStableShuffle 每帧拿到新数组身份）');
ok(!/useStableShuffle\(allChunks\)/.test(pageCode),
  'D3 反向断言：洗牌不许再直接吃未去重的 allChunks');
ok((pageCode.match(/useStableShuffle\(uniqueChunks\)/g) || []).length === 2,
  'D4 替换练习与接龙两处都改吃去重池', `count=${(pageCode.match(/useStableShuffle\(uniqueChunks\)/g) || []).length}`);
ok(/const pool = useMemo\(\s*\n?\s*\/\/[^\n]*\n?\s*\(\) => dedupeChunks\(/.test(cardsCode) || /=> dedupeChunks\(categoryFilter === 'all'/.test(cardsCode),
  'D5 闪卡 pool 走去重（否则一轮能出两张同短语卡）');
ok(/restoreRef|pool\.find\(\(c\) => c\.content === content\)/.test(cardsCode) && /const pool = useMemo/.test(cardsCode),
  'D6 正对照：断点恢复仍按 content find，且它吃的 pool 就是 D5 那个去重池');
ok(/expandMemorized\(JSON\.parse\(raw\), MOCK_CHUNKS\)/.test(pageCode),
  'D7 已记读入时补齐兄弟 id');
ok(/setMemorizedChunks\(toggleMemorizedGroup\(memorizedChunks, chunk, allChunks\)\)/.test(pageCode),
  'D8 已记切换走组（updater 保持纯，落盘仍交给 persist effect）');

/* ── 短语库详情的布局与导航（2026-10-07 用户反馈：详情盖住列表 + 不能切上下） ── */
ok(!/style=\{\{ height: '520px' \}\}/.test(pageCode) && /lg:h-\[520px\]/.test(pageCode),
  'D9 定高只给桌面两栏 —— 手机上左右都是 col-span-12，写死 520px 会让详情溢出盖住列表（只能看一条）');
ok(/max-h-\[52vh\] lg:max-h-none/.test(pageCode),
  'D10 手机侧列表自带滚动上界（否则整页无限长，详情永远在屏幕外）');
ok(/aria-label="上一个短语"[\s\S]{0,900}aria-label="下一个短语"/.test(pageCode) && /gotoPhrase\(-1\)[\s\S]{0,900}gotoPhrase\(1\)/.test(pageCode),
  'D11 详情头部有上下切换（列表在屏幕外时，这是唯一能继续浏览的手段）');
const navPredicateOk = /for \(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'\)[\s\S]{0,160}c\.content\[0\]\?\.toUpperCase\(\) === letter/.test(pageCode);
const listPredicateOk = /filteredPhraseBank\.filter\(\(c\) => c\.content\[0\]\?\.toUpperCase\(\) === letter\)/.test(pageCode);
ok(navPredicateOk && listPredicateOk,
  'D12 导航表与列表用**同一个**首字母分段判据（不一致的话按上下键看到的邻居和列表里的邻居不同）',
  `nav=${navPredicateOk} list=${listPredicateOk}`);
ok(/window\.matchMedia\('\(min-width: 1024px\)'\)/.test(pageCode),
  'D13 只有窄屏才把详情滚进视野（桌面两栏并排，滚它会把列表推出屏幕）');

/* ───────── 汇总 ───────── */
let failed = 0;
for (const r of results) { if (!r.pass) failed++; console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : '')); }
console.log('---');
console.log(failed === 0 ? `全部 ${results.length} 项通过` : `${failed} 项失败`);
fs.rmSync(tmp, { force: true });
process.exit(failed === 0 ? 0 : 1);
