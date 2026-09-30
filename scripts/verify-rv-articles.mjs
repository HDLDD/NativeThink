/**
 * verify-rv-articles.mjs — 「用复习词汇生成文章」的选词 / 分篇 / 用词出队契约。
 *
 * 为什么要这个守卫（2026-09-30 真机反馈驱动）：
 *   旧实现写死 `dueForReview.slice(0, 10)` —— 词表再长也只用前 10 个，用户看到的是
 *   「生成词数只有十个左右，对不上完整的需要复习的单词」，而且生成的词没有任何书面记录，
 *   下一轮又从同一批词开始。现在改成：词表 = 到期词 − 所有现存文章用过的词（派生，不落"已用清单"），
 *   自选词汇 + 每篇词数、一次最多 RV_BATCH_LIMIT 篇，每篇成功即保存 + 进历史（可重开）。
 *
 * 这里钉三件事：
 *   ① 纯函数全边界单测（rv-articles.ts 的并集 / 出队 / 切批）；
 *   ② ArticlePage 的接线（词表真的派生、真的落盘 rvWords、真的保存可重开）；
 *   ③ 旧缺陷的正对照（写死 slice(0,10) 不能再回来）。
 *
 * 用法：node scripts/verify-rv-articles.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
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

// ── 载入被测源码 ──
// rv-articles 现在**复用** reader-highlight 的形态归并（coveredReviewWords），
// 所以这里把两个模块都真转译出来一起跑 —— 不是拿假 matcher 测自己的规则。
const TEMP = process.env.TEMP || '/tmp';
const stripImports = (s) => s.replace(/^import[^\n]*\n/gm, '');
const unexport = (s) => s.replace(/export (const|interface|function)/g, '$1');
const opts = { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } };

const rhFile = join(TEMP, 'nt-reader-highlight.mjs');
writeFileSync(rhFile,
  ts.transpileModule(unexport(stripImports(readFileSync(join(ROOT, 'src/lib/reader-highlight.ts'), 'utf8'))), opts).outputText
  + '\nexport { matchesHighlight };', 'utf8');

const rvSrc = readFileSync(join(ROOT, 'src/lib/rv-articles.ts'), 'utf8');
const page = readFileSync(join(ROOT, 'src/pages/ArticlePage/ArticlePage.tsx'), 'utf8');
const reading = readFileSync(join(ROOT, 'src/data/reading.ts'), 'utf8');

const mod = ts.transpileModule(
  unexport(rvSrc).replace("'./reader-highlight'", "'./nt-reader-highlight.mjs'"),
  opts,
).outputText + '\nexport { usedReviewWordKeys, reviewWordRecord, planRvBatches, coveredReviewWords, rvParaCount, rvRegenKeys, buildRvPrompt, tokenizeWords };';
const outFile = join(TEMP, 'nt-rv-articles.mjs');
writeFileSync(outFile, mod, 'utf8');
const { usedReviewWordKeys, reviewWordRecord, planRvBatches,
  coveredReviewWords, rvParaCount, rvRegenKeys, buildRvPrompt, tokenizeWords } = await import(pathToFileURL(outFile).href);

// ══════════ ① usedReviewWordKeys：现存文章用词并集 ══════════
{
  const arts = [
    { rvWords: ['alpha', 'beta'] },
    { rvWords: ['beta', 'gamma'] },          // 跨篇重复
    {},                                       // 自由生成的文章没有 rvWords
    { rvWords: null },                        // 显式 null（老数据/序列化残留）
    { rvWords: ['', 'delta'] },               // 空串必须被忽略（防脏数据把 '' 塞进集合）
  ];
  const used = usedReviewWordKeys(arts);
  check(used instanceof Set, '并集返回 Set');
  check(used.has('alpha') && used.has('beta') && used.has('gamma') && used.has('delta'), '收集到所有出现过的词');
  check(!used.has(''), '空串不进并集（脏数据安全）');
  check(used.size === 4, '重复词只算一次', `size=${used.size}`);
  check(usedReviewWordKeys([]).size === 0, '空文章列表 → 空集');
}

// ══════════ ② reviewWordRecord：词表 = 到期词 − 已用词（保序） ══════════
{
  const due = [
    { wordKey: 'alpha' }, { wordKey: 'beta' }, { wordKey: 'gamma' },
    { wordKey: 'delta' }, { wordKey: 'epsilon' },
  ];
  const used = new Set(['beta', 'delta']);
  const record = reviewWordRecord(due, used);
  check(record.map((w) => w.wordKey).join(',') === 'alpha,gamma,epsilon', '已用词出队，其余保持到期顺序', record.map((w) => w.wordKey).join(','));
  check(record.length === 3, '出队数量正确');

  /**
   * 「删除文章 → 词自动回到列表」：不做单独的"已用清单"，
   * 词表完全派生自现存文章的 rvWords —— 移除一篇后重算并集，被它用掉的词必须回来。
   */
  const arts = [{ rvWords: ['beta'] }, { rvWords: ['delta'] }];
  const afterDelete = reviewWordRecord(due, usedReviewWordKeys(arts.filter((a) => a.rvWords[0] !== 'beta')));
  check(afterDelete.some((w) => w.wordKey === 'beta'), '删掉用掉 beta 的文章后 beta 回到词表');
  const allGone = reviewWordRecord(due, usedReviewWordKeys([{ rvWords: ['alpha', 'beta', 'gamma', 'delta', 'epsilon'] }]));
  check(allGone.length === 0, '全部词都被用过 → 词表为空');
}

// ══════════ ③ planRvBatches：切批 + 上限 + 余量不消费 ══════════
{
  const words = (n) => Array.from({ length: n }, (_, i) => ({ wordKey: `w${i}` }));

  let p = planRvBatches(words(20), 10, 3);
  check(p.batches.length === 2 && p.batches.every((b) => b.length === 10), '整除：20 词 / 每篇 10 → 2 篇整');
  check(p.skippedBatches === 0, '整除：无剩余批次');

  p = planRvBatches(words(25), 10, 3);
  check(p.batches.map((b) => b.length).join(',') === '10,10,5', '余数：25 词 / 每篇 10 → [10,10,5]', p.batches.map((b) => b.length).join(','));
  check(p.batches[2][0].wordKey === 'w20', '余数篇从正确下标开始（不重不漏）');

  p = planRvBatches(words(40), 10, 3);
  check(p.batches.length === 3, '上限：40 词最多保留 3 篇（RV_BATCH_LIMIT 语义）');
  check(p.skippedBatches === 1, '上限：被截掉的 1 篇要报出来（对应词留在词表，不静默丢弃）');

  p = planRvBatches(words(7), 10, 3);
  check(p.batches.length === 1 && p.batches[0].length === 7, '不足一篇：7 词 → 1 篇 7 词');

  p = planRvBatches(words(3), 0, 3);
  check(p.batches.length === 3 && p.batches.every((b) => b.length === 1), '每篇词数 ≤0 时夹到 1（不产生死循环/空批）');

  p = planRvBatches(words(5), 10, 0);
  check(p.batches.length === 0 && p.skippedBatches === 1, '上限 0 → 0 篇且全部记入 skipped（不吞词）');

  p = planRvBatches(words(30), 8, 3);
  check(p.batches.map((b) => b.length).join(',') === '8,8,8' && p.skippedBatches === 1, '档位 8：30 词 → 3×8 保留 + 1 批（6 词）留词表');

  const kept = planRvBatches(words(30), 8, 10);
  check(kept.batches.flat().length === 30, '上限足够时全部词都进批次（不丢词）');
  check(new Set(kept.batches.flat().map((w) => w.wordKey)).size === 30, '批次间不重复用词');
}

// ══════════ ④ ArticlePage 接线：词表派生 + 用词落盘 + 可重开 ══════════
check(/const rvUsedKeys = useMemo\(\(\) => usedReviewWordKeys\(aiArticles\)/.test(page),
  '词表来源 = 所有现存 AI 文章的用词并集（删文章即回词表）');
check(/const rvRecord = useMemo\(\(\) => reviewWordRecord\(dueForReview, rvUsedKeys\)/.test(page),
  '「记录」= 到期词 − 已用词（保持到期顺序）');
check(/planRvBatches\(rvSelectedWords, rvPerArticle, RV_BATCH_LIMIT\)/.test(page),
  '切批用共享常量 RV_BATCH_LIMIT（上限只有一处定义）');
check(!/dueForReview\.slice\(0, 10\)/.test(page),
  '正对照：写死「只取前 10 个词」的旧缺陷不能再出现');
check(/const RV_BATCH_LIMIT = 6;/.test(page) && /const RV_PER_OPTIONS = \[8, 10, 15, 20, 30, 50\];/.test(page),
  '每篇词数档位（放开到 50）与批次上限（6 篇）是模块级常量（UI 与逻辑同源）');

// 生成的每篇必须：带上**真的出现在正文里**的用词（出队依据） + 仍然高亮被点名的词 + 落盘 + 进历史
check(/rvWords: args\.covered,/.test(page), 'rvWords 记的是 coveredReviewWords 的结果，不是"点名清单"（漏用的词回词表）');
check(/highlightWords: args\.keys,/.test(page), 'highlightWords 仍交给阅读器整批点名的词');
check(/const covered = coveredReviewWords\(keys, text\);/.test(page), '生成路径真跑 coveredReviewWords 判覆盖');
check(/const text = safeParagraphs\.map\(\(p\) => p\.en\)\.join\(' '\);/.test(page), '覆盖判定只看正文英文，不把译文算进去');
check(/usedWords \+= covered\.length; dropped \+= keys\.length - covered\.length;/.test(page),
  '成功计数按实际用掉的词，漏用的另记 dropped');
check(/个词没进正文，已退回词表/.test(page), '有词没进正文时如实告诉用户（不再"点名即消失"）');
check(/const keys = batch\.map\(\(w\) => w\.wordKey\);/.test(page), 'keys 取自本批词（不是整个选择）');
check(/if \(!result\.trim\(\)\) \{ failed\+\+; continue; \}/.test(page),
  '空串（服务不可用）按本篇失败跳过，不误判格式错误、不中断整轮');
check(/if \(!safeParagraphs\.length\) \{ failed\+\+; continue; \}/.test(page), '解析不出段落 → 本篇失败、对应词不消费');
check(/saveAiArticle\(content\);/.test(page) && /saveToHistory\(content\.title, content\.totalWords\.toString\(\), 'review-words', \{ aiId: content\.id \}\)/.test(page),
  '每篇成功即保存 + 历史带 aiId（可重新打开）');
{
  // 正对照：保存必须发生在计数器之前 —— 若先 done++ 再存，失败/未存也会算作已消费。
  // 必须**限定在生成函数体内**：全文件别处也有 saveAiArticle(content)（自由生成那两条路径），
  // 用整页 indexOf 会量到别的行，变异在函数内换序也照绿（本轮变异测试实测踩到过）
  const iFn = page.indexOf('const generateFromReviewWords = useCallback');
  // 依赖数组会随功能增长（体裁/主题进来后又多了几项）—— 锚点取"这一段的收尾"，不写死整串 deps
  const iEnd = page.indexOf('}, [isConfigured, rvPlan,', iFn);
  const fnBody = iFn >= 0 && iEnd > iFn ? page.slice(iFn, iEnd) : '';
  const iSave = fnBody.indexOf('saveAiArticle(content);');
  const iDone = fnBody.indexOf('done++;');
  check(fnBody.length > 0, '生成函数体可定位（正对照的前提）');
  check(iSave >= 0 && iDone > iSave, '正对照：先落盘再计成功（消费与保存同生共死）');
}
check(/for \(let bi = 0; bi < batches\.length; bi\+\+\)/.test(page), '逐篇串行生成（不并发轰炸 AI 服务）');
check(/setRvProgress\(`生成中 \$\{bi \+ 1\}\/\$\{batches\.length\} 篇`\)/.test(page), '生成中显示「第几篇/共几篇」');

// 选词 UI 与闸门
check(/const toggleRv = \(key: string\)/.test(page) && /onClick=\{\(\) => toggleRv\(w\.wordKey\)\}/.test(page),
  '词条点击 = 切换选中（自选词汇）');
check(/const selectFirstRvBatch = \(\) => setRvSelected\(new Set\(rvRecord\.slice\(0, rvPerArticle\)/.test(page),
  '「选前 N 词」按当前每篇词数从记录里取');
check(/setRvSelected\(new Set\(\)\)/.test(page), '清空选择入口存在');
check(/disabled=\{aiLoading \|\| !isConfigured \|\| rvSelectedWords\.length < 3\}/.test(page),
  '至少 3 词才能生成（与回调内的守卫同口径）');
check(/if \(rvSelectedWords\.length < 3\) \{ toast\.error\('请至少选择 3 个词'\); return; \}/.test(page),
  '回调内二次校验（按钮禁用不是唯一防线）');
check(/RV_MAX_CHIPS/.test(page) && /展开全部/.test(page), '长词表折叠为「展开全部」（当前 RV_MAX_CHIPS 个封顶）');

// 历史可重开（此前 review-words 条目一律不可点）
check(/\(!!h\.meta\?\.aiId && aiArticles\.some\(\(a\) => a\.id === h\.meta!\.aiId\)\)/.test(page),
  '历史条目在文章仍存在时可重新打开（aiId 对上了）');
check(/title=\{clickable \? '点击重新打开'\n?\s*: h\.meta\?\.aiId \? '文章已被删除'/.test(page),
  '文章被删后历史给「文章已被删除」而不是沉默');

// 保存列表：收藏 + 删除（判重口径必须与阅读器一致，否则「我的收藏」跳不回来）
const favFnMatch = page.match(/const toggleAiArticleFav = \(a: IReadingContent\) => \{[\s\S]*?\n  \};/);
check(!!favFnMatch, '已保存列表有收藏开关（函数体可定位）');
{
  const favBody = favFnMatch ? favFnMatch[0] : '';
  check(/if \(isFavorited\(a\.id, 'article'\)\)/.test(favBody), '收藏判重按 article 类型（不是 word）');
  check(/favorites\.find\(\(x\) => x\.type === 'article' && x\.content === a\.id\)/.test(favBody), '取消收藏按 (type=article, content=id) 精确定位');
  check(/addFavorite\(\{ type: 'article', content: a\.id/.test(favBody), '收藏写入 type=article + content=id（我的收藏可跳回打开）');
}
{
  const iList = page.indexOf('{/* Saved AI articles */}');
  const iNext = page.indexOf('{/* ── SPEECHES TAB ── */}');
  const listBody = iList >= 0 && iNext > iList ? page.slice(iList, iNext) : '';
  check(listBody.length > 0, '保存列表区块可定位（正对照的前提）');
  check(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); toggleAiArticleFav\(a\); \}\}/.test(listBody), '心形按钮接的是文章收藏开关');
  check(/isFavorited\(a\.id, 'article'\)\s*\?\s*'text-rose-500'/.test(listBody), '已收藏时心形点亮（按 article 判重）');
  check(/deleteAiArticle\(a\.id\)/.test(listBody), '删除入口仍在（删掉后用词回词表）');
}

// ══════════ ⑤ 数据字段：rvWords 是可选扩展，不动既有字段语义 ══════════
{
  const iface = reading.match(/export interface IReadingContent \{[\s\S]*?\n\}/);
  check(iface && /rvWords\?: string\[\];/.test(iface[0]), 'IReadingContent 增加可选 rvWords（老数据无此字段仍然合法）');
  check(iface && /highlightWords\?: string\[\];/.test(iface[0]), 'highlightWords 仍在（阅读器高亮不受影响）');
  check(/刻意不做单独的"已用清单"（两份真相一定漂移）/.test(reading), '字段注释写明派生口径（防后人再加一份"已用清单"）');
}

// ══════════ ⑥ 放开词数后新增的纯函数：覆盖判定 / 段落数 / 提示词 / 重写取词 ══════════
{
  // 覆盖判定复用阅读器那套形态归并 —— 两处口径必须一致
  check(coveredReviewWords(['abandon', 'benefit'], 'We abandoned the plan and it benefited us.').join(',') === 'abandon,benefit',
    'coveredReviewWords：变形（abandoned/benefited）算命中（与高亮同源）');
  check(coveredReviewWords(['abandon'], 'The plan was dropped.').join(',') === '',
    'coveredReviewWords：没出现的词判为漏用（它会退回词表，不再"点名即消失"）');
  check(coveredReviewWords(['elegant'], 'She is elegant.').join(',') === 'elegant', 'coveredReviewWords：原形命中');
  // 正对照：不许过度归并 —— curiosity 不是 curious 的命中，否则无关词会被记成"已复习"
  check(coveredReviewWords(['curious'], 'Human curiosity is old.').join(',') === '',
    '正对照：curiosity 不算 curious（宁少不错，口径与 matchesHighlight 一致）');
  check(coveredReviewWords(['keeps'], 'He keeps the keys.').join(',') === 'keeps', 'coveredReviewWords：键本身带后缀也能命中');
  check(coveredReviewWords(['well-known'], 'a well known fact').join(',') === 'well-known',
    'coveredReviewWords：短语键按连续 token 序列匹配');
  check(coveredReviewWords(['take off'], 'The plane will take off soon.').join(',') === 'take off',
    'coveredReviewWords：多词短语命中');
  check(coveredReviewWords(['take off'], 'They took it off the shelf.').join(',') === '',
    '正对照：短语中间插了别的词不算命中（不做激进模糊匹配）');
  check(coveredReviewWords(['', 'alpha'], 'alpha').join(',') === 'alpha', 'coveredReviewWords：空键被忽略');
  check(coveredReviewWords(['alpha'], '').join(',') === '', 'coveredReviewWords：空正文一律算漏用');
  check(tokenizeWords("Don't put the well-known idea off.").join(',') === "don't,put,the,well-known,idea,off",
    'tokenizeWords：词内撇号/连字符保留，标点剥掉');
}
{
  check(rvParaCount(3) === 3 && rvParaCount(8) === 3, 'rvParaCount：下限 3 段（短文也要有起承转合）');
  check(rvParaCount(20) === 7 && rvParaCount(30) === 10, 'rvParaCount：约每 3 词 1 段');
  check(rvParaCount(50) === 12 && rvParaCount(200) === 12, 'rvParaCount：上限 12 段（防 4096 token 回复被截断）');
  check(rvParaCount(0) === 3 && rvParaCount(-5) === 3, 'rvParaCount：0/负数夹到下限（不产生 0 段的提示词）');
}
{
  const p = buildRvPrompt({
    keys: ['abandon', 'benefit'], paraCount: 5, level: 'cet4',
    genre: 'narrative', topic: 'tech', genreLabel: '记叙文', topicLabel: '科技',
  });
  check(p.system.includes('abandon, benefit'), 'buildRvPrompt：全部选中的词进提示词');
  check(p.system.includes('exactly 5 paragraphs'), 'buildRvPrompt：段落数按 rvParaCount 的结果写死');
  check(p.system.includes('记叙文'), 'buildRvPrompt：体裁进了提示词（选了就要有用）');
  check(p.system.includes('科技'), 'buildRvPrompt：主题进了提示词');
  check(p.system.includes('Return ONLY valid JSON'), 'buildRvPrompt：仍要求纯 JSON（extractJson 那套约定）');
  check(p.user.includes('abandon'), 'buildRvPrompt：user 消息也点名一次');

  const free = buildRvPrompt({
    keys: ['alpha'], paraCount: 3, level: 'all',
    genre: 'letter', topic: 'free', genreLabel: '书信', topicLabel: '',
  });
  check(!/topic of/.test(free.system), '正对照：选「不限」时不该硬塞主题进去');
  check(free.system.includes('书信'), '正对照：不限主题时体裁仍然生效（提示词用的是中文体裁名）');
}
{
  check(rvRegenKeys({ rvWords: ['a', 'b'] }).join(',') === 'a,b', 'rvRegenKeys：优先用文章记下的用词');
  check(rvRegenKeys({ rvWords: [], highlightWords: ['c'] }).join(',') === 'c',
    'rvRegenKeys：老文章没记 rvWords 时退回高亮词表（至少能重写）');
  check(rvRegenKeys({}).join(',') === '', 'rvRegenKeys：两者都没有 → 空（不显示重写入口）');
  check(rvRegenKeys({ rvWords: ['a', '', null] }).join(',') === 'a', 'rvRegenKeys：脏数据里的空项被滤掉');
}

// ══════════ ⑦ 主题化 / 单篇重写的接线 ══════════
{
  check(/const RV_GENRES: \{ key: string; label: string \}\[\] = \[/.test(page), '体裁表是模块级常量（提示词与 UI 同源）');
  check(/const \[rvGenre, setRvGenre\] = useState\('expository'\)/.test(page), '体裁有默认值（不选也能生成）');
  check(/const \[rvTopic, setRvTopic\] = useState\(RV_TOPIC_FREE\)/.test(page), '主题默认「不限」');
  check(/RV_GENRES\.map\(\(g\) => \(\s*<button/.test(page), '体裁在面板上有可选芯片');
  check(/TOPICS\.map\(\(t\) => \(\s*<button/.test(page), '主题芯片复用 AI 生成 tab 的 TOPICS（不另造一套）');
  check(/genre: rvGenre, topic: rvTopic,/.test(page), '生成时把当前体裁/主题传给 buildRvPrompt');
  check(/rvGenre: args\.genre,/.test(page), '体裁随文章落盘（重写才谈得上"保持同风格"）');

  const iRegen = page.indexOf('const regenerateRvArticle = useCallback');
  const iRegenEnd = page.indexOf('}, [isConfigured, rvRegenId, level, aiChat]);');
  const regenBody = iRegen >= 0 && iRegenEnd > iRegen ? page.slice(iRegen, iRegenEnd) : '';
  check(regenBody.length > 0, '重写函数体可定位（正对照的前提）');
  check(/const keys = rvRegenKeys\(a\);/.test(regenBody), '重写取词走 rvRegenKeys（同一来源）');
  check(/id: a\.id,/.test(regenBody), '重写保持原 id（收藏 content=文章 id 与历史 meta.aiId 不断链）');
  check(/replaceAiArticle\(content\);/.test(regenBody), '重写在原位替换而非新增一份');
  check(!/deleteAiArticle\(a\.id\)/.test(regenBody), '正对照：重写不许靠"先删再存"实现（会让词表瞬间回涨）');
  check(/a\.rvGenre && RV_GENRES\.some\(\(g\) => g\.key === a\.rvGenre\) \? a\.rvGenre : 'expository'/.test(regenBody),
    '重写沿用文章自己的体裁，脏值才回落到默认');
  check(/已保留原来那篇/.test(regenBody), '重写失败时如实说明原文没动');
  check(/if \(rvRegenId\) return;/.test(regenBody), '同时只允许一篇在途（两个回包不互相覆盖）');

  const iList = page.indexOf('{/* Saved AI articles */}');
  const iNext = page.indexOf('{/* ── SPEECHES TAB ── */}');
  const listBody = iList >= 0 && iNext > iList ? page.slice(iList, iNext) : '';
  check(/regenerateRvArticle\(a\)/.test(listBody), '保存列表里有重写入口');
  check(/!!rvRegenKeys\(a\)\.length &&/.test(listBody), '只有能取到用词的文章才显示重写按钮');
  check(/disabled=\{!!rvRegenId \|\| aiLoading \|\| !isConfigured\}/.test(listBody), '重写期间禁用入口');
}

// ── 汇总 ──
console.log(`\nverify-rv-articles: ${pass} 通过, ${fail} 失败`);
if (failures.length) {
  console.log('\n失败项：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
