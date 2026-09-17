#!/usr/bin/env node
/**
 * 句子语料扩量 —— 抽取候选句 → 用免费模型做「意群/主干」标注 → 结构校验 → 落盘。
 *
 * 为什么需要自动化：意群切分与主干定位原本是手工标注，一句要几分钟；要扩到上百句
 * 不现实。这里让模型标注、由**结构校验**兜底（意群必须能在原句中按顺序逐块定位、
 * 必须存在主干、字段齐全），校验不过的直接丢弃，不写进语料。
 *
 * 标注输出用行格式而非 JSON —— 之前预翻译项目吃过亏：JSON 字符串里常被塞进未转义
 * 引号与控制符，解析大批失败。行格式只需按 | 切分，容错高得多。
 *
 * 用法:
 *   node scripts/expand-sentence-corpus.cjs --extract          只看候选统计
 *   node scripts/expand-sentence-corpus.cjs --count 40         标注 40 句（可反复运行续跑）
 *   node scripts/expand-sentence-corpus.cjs --count 40 --dry    不调 API，只打印将标注哪些
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KEY_FILE = path.join(__dirname, '.apikey');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'sentence-lab-auto.ts');
const STATE_FILE = path.join(ROOT, '.sentence-auto-state.json');

const API_KEY = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '';
const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
// 实测：glm-4-flash 格式合规最好且能并发；250414 备用；4.7-flash 质量最好但免费档并发 1、限流严重
const MODELS = ['glm-4-flash', 'glm-4-flash-250414', 'glm-4.7-flash'];
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
if (args.includes('--verbose')) global.__VERBOSE = true;
const EXTRACT_ONLY = args.includes('--extract');
const COUNT = (() => {
  const i = args.indexOf('--count');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 40;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1) 抽取候选句 ────────────────────────────────────────────────

/** 已有的手写语料 id 与原文，用于去重 */
function existingSentences() {
  const out = new Set();
  for (const f of ['sentence-lab.ts', 'sentence-lab-extra.ts', 'sentence-lab-auto.ts']) {
    const p = path.join(ROOT, 'src', 'data', f);
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/\ben:\s*'((?:[^'\\]|\\.)*)'/g)) out.add(norm(m[1]));
  }
  return out;
}

/** 按句末标点切句（段落里常含多句） */
function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    // 句末标点后可能跟着引号/右括号（例如 ." 或 !”），之后才是空格
    .split(/(?<=[.!?][""')\u201d\u2019]?)\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const norm = (s) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim();

/** 句子是否「值得拆」：够长、有从句或非谓语、不是对白碎片 */
function isInteresting(s) {
  const words = s.trim().split(/\s+/).length;
  if (words < 18 || words > 44) return false;
  if (/^["“']/.test(s.trim())) return false;                  // 引号开头的对白，常是碎片
  if (/[_\[\]]/.test(s)) return false;                        // 下划线/方括号是原书排版标记
  if ((s.match(/[A-Z]{3,}/g) || []).length > 1) return false;  // 全大写标题
  const clauses = (s.match(/\b(which|that|who|whom|whose|when|while|because|although|though|if|unless|as|since|where|before|after|nor)\b/gi) || []).length;
  const nonfinite = (s.match(/\b(\w+ing|\w+ed)\b/g) || []).length;
  const preps = (s.match(/\b(in|on|at|with|without|by|for|from|of|to|into|through|against|among|across|beyond|upon|within)\b/gi) || []).length;
  return clauses + (nonfinite > 2 ? 1 : 0) + (preps >= 4 ? 1 : 0) >= 2;
}

/** 刊物：自带中英对照，最省力也最可靠 */
function fromPublications() {
  const items = [];
  const files = ['publications-extra.ts', path.join('..', 'pages', 'ArticlePage', 'ArticlePage.tsx')];
  for (const rel of files) {
    const p = path.join(ROOT, 'src', 'data', rel);
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    // paras: [en, zh] 形式
    for (const m of s.matchAll(/\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g)) {
      const en = m[1].replace(/\\'/g, "'");
      const zh = m[2].replace(/\\'/g, "'");
      for (const sent of splitSentences(en)) {
        if (isInteresting(sent)) items.push({ en: sent, zhHint: '', source: '站内刊物' });
      }
    }
    // { en: '...', zh: '...' } 形式
    for (const m of s.matchAll(/\{\s*en:\s*'((?:[^'\\]|\\.)*)'\s*,\s*zh:\s*'((?:[^'\\]|\\.)*)'/g)) {
      const en = m[1].replace(/\\'/g, "'");
      const zh = m[2].replace(/\\'/g, "'");
      for (const sent of splitSentences(en)) {
        if (isInteresting(sent)) items.push({ en: sent, zhHint: '', source: '站内刊物' });
      }
    }
  }
  return items;
}

/** 演讲：模板字符串正文，按篇名标注来源 */
function fromSpeeches() {
  const items = [];
  const p = path.join(ROOT, 'src', 'data', 'speeches.ts');
  const s = fs.readFileSync(p, 'utf8');
  const meta = {};
  for (const m of s.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*zhTitle:\s*'([^']*)',\s*author:\s*'([^']*)'/g)) {
    meta[m[1]] = { title: m[2].replace(/\\'/g, "'"), zhTitle: m[3], author: m[4] };
  }
  for (const m of s.matchAll(/SPEECH_TEXTS\['([^']+)'\]\s*=\s*`([\s\S]*?)`;/g)) {
    const info = meta[m[1]] || {};
    const label = `演讲·${info.zhTitle || m[1]}`;
    for (const sent of m[2].replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)) {
      if (isInteresting(sent)) items.push({ en: sent.trim(), zhHint: '', source: label });
    }
  }
  return items;
}

/** 书籍：只用 corpus 里最典型的几本，避免同一本堆太多 */
function fromBooks(perBook = 12) {
  const books = [
    ['11', '《爱丽丝梦游仙境》'], ['1342', '《傲慢与偏见》'], ['98', '《双城记》'],
    ['84', '《弗兰肯斯坦》'], ['768', '《呼啸山庄》'], ['2701', '《白鲸》'],
    ['345', '《德古拉》'], ['244', '《血字的研究》'], ['174', '《道林·格雷的画像》'],
    ['1260', '《简·爱》'], ['1635', '《沉思录》'], ['1232', '《君主论》'],
  ];
  const items = [];
  for (const [id, label] of books) {
    const p = path.join(ROOT, 'public', 'books', id + '.txt');
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8').replace(/\s+/g, ' ');
    let taken = 0;
    for (const sent of text.split(/(?<=[.!?])\s+/)) {
      if (taken >= perBook) break;
      if (!isInteresting(sent)) continue;
      if (/_/.test(sent) || /Gutenberg|Project|Chapter|CHAPTER/.test(sent)) continue;
      items.push({ en: sent.trim(), zhHint: '', source: label });
      taken++;
    }
  }
  return items;
}

// ── 2) 模型标注 ──────────────────────────────────────────────────

const SYS = `你是英语教学专家。把用户给的英文长句切成 3~7 个意群，按语法边界切分（介词短语 / 从句 / 非谓语短语 / 插入语各自成块）。

只输出一个 JSON 对象，不要代码块、不要解释：
{"segments":[{"t":"You will rejoice","r":"core","note":"主干：主语 + 谓语"},{"t":"to hear","r":"mod","note":"不定式作原因状语，修饰 rejoice"}],"zh":"整句中文翻译","tip":"读法要点","backbone":"英文主干 — 中文意思","level":"intermediate"}

字段要求：
- segments：3~7 块，按顺序排列。每块：
  - t：**原句的连续片段，必须逐字照抄原文**，不得改写、不得增删单词（块之间的空格可自行处理）。所有 t 按顺序拼起来必须等于原句（允许空格差异）。
  - r：core = 主干（谁 + 做了什么，去掉句子就不成立）；mod = 修饰（定语/状语/同位语，去掉仍成立）；conn = 连接词或插入语。
  - note：中文说明，写清「什么结构 + 修饰谁」，例如「定语从句，修饰 enterprise（哪项事业）」。
- 整句至少 1 块 core（通常只有 1 块）。
- backbone：把主干读成一句简单的话，格式「英文主干 — 中文意思」。
- zh：自然的整句中文翻译，不要逐字硬译。
- tip：一句话说明这句该怎么读，不要重复语法术语。
- level：beginner / intermediate / advanced 三选一。`;

function buildUser(item) {
  return item.zhHint
    ? `英文原句：${item.en}\n参考译文（可润色，不要照抄错译）：${item.zhHint}`
    : `英文原句：${item.en}`;
}

async function annotate(item, attempt = 0) {
  const model = MODELS[Math.min(attempt, MODELS.length - 1)];
  const res = await fetch(GLM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model,
      thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: buildUser(item) }],
      max_tokens: 1600,
      temperature: 0.2,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (global.__DEBUG_ONE) {
    console.log('--- 原始输出 ---\n' + text.slice(0, 1200) + '\n--- 结束 ---');
  }
  const obj = parseRaw(text);
  const built = buildSegments(item.en, obj);
  if (built) return built;
  // 结构不合格时返回空意群，交给 validate 判定并触发重试
  return {
    segments: [],
    backbone: '',
    zh: String(obj?.zh ?? '').trim(),
    tip: String(obj?.tip ?? '').trim(),
    level: '',
  };
}

/** 解析模型输出的 JSON（容错：去代码围栏、取首尾大括号、修常见瑕疵） */
function parseRaw(text) {
  let body = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  body = body.slice(a, b + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(body.replace(/[\u201c\u201d]/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/[\r\n]+/g, ' '));
    } catch { return null; }
  }
}

/**
/**
 * 把模型给的片段文本定位回原句。
 *
 * 为什么不用「词序号」：模型数不准词序（实测断点落在 after 中间、把谓语拆开）。
 * 它擅长给文本，所以我们接受文本，再用**宽容匹配**（空白/撇号/引号/破折号）逐块按
 * 顺序定位；定位不到就判该次输出不合格、触发重试 —— 既拿到好的切分，又保证每块
 * 都是原句真实片段（不会被改写）。
 */
const fold = (x) => x.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-');

function locate(en, segments) {
  let cursor = 0;
  const hay = fold(en);
  const out = [];
  for (const seg of segments) {
    const raw = String(seg?.t ?? '').trim();
    if (!raw) return { error: '有空片段' };
    const pattern = fold(raw)
      .split(/\s+/)
      .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+');
    const re = new RegExp(pattern, 'g');
    re.lastIndex = cursor;
    const m = re.exec(hay);
    if (!m) return { error: `片段无法定位回原句：「${raw.slice(0, 40)}」` };
    out.push({ t: raw, r: seg.r, note: String(seg.note ?? '').trim(), start: m.index, end: m.index + m[0].length });
    cursor = m.index + m[0].length;
  }
  return { segments: out };
}

/** 模型给片段文本 → 校验并归一化为意群 */
function buildSegments(en, obj) {
  const raw = Array.isArray(obj?.segments) ? obj.segments : [];
  if (raw.length < 2 || raw.length > 9) return null;
  const located = locate(en, raw);
  if (located.error) {
    if (global.__VERBOSE) console.error('    · ' + located.error);
    return null;
  }
  const segs = located.segments.map((x) => ({
    t: x.t,
    r: ['core', 'mod', 'conn'].includes(String(x.r ?? '').toLowerCase()) ? String(x.r).toLowerCase() : 'mod',
    note: x.note,
  }));
  if (!segs.some((x) => x.r === 'core')) segs[0].r = 'core';
  return {
    segments: segs,
    backbone: String(obj?.backbone ?? '').trim(),
    zh: String(obj?.zh ?? '').trim(),
    tip: String(obj?.tip ?? '').trim(),
    level: String(obj?.level ?? '').toLowerCase().trim(),
  };
}


// ── 3) 结构校验 ──────────────────────────────────────────────────

/** 撇号/引号/破折号折叠，避免排版差异导致匹配失败 */

/** 与 src/lib/sentence-parse.ts 同规则：逐块在原文中按顺序定位 */
function segmentsResolve(en, segments) {
  let cursor = 0;
  const hay = fold(en);
  for (const seg of segments) {
    const raw = seg.t.trim();
    if (!raw) return false;
    const pattern = fold(raw).split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const re = new RegExp(pattern, 'g');
    re.lastIndex = cursor;
    const m = re.exec(hay);
    if (!m) return false;
    cursor = m.index + m[0].length;
  }
  return true;
}

function validate(item, ann) {
  const errs = [];
  if (!ann.segments.length) errs.push('无意群');
  if (ann.segments.length > 9) errs.push('意群过多');
  if (!ann.segments.some((s) => s.r === 'core')) errs.push('无主干');
  if (!ann.zh || ann.zh.length < 4) errs.push('缺译文');
  if (!ann.tip || ann.tip.length < 4) errs.push('缺读法提示');
  if (!ann.backbone) errs.push('缺主干释义');
  if (!['beginner', 'intermediate', 'advanced'].includes(ann.level)) errs.push('档位非法');
  const missing = ann.segments.map((s, i) => (s.note ? -1 : i)).filter((i) => i >= 0);
  if (missing.length) errs.push(`第 ${missing.join('/')} 块缺说明`);
  return errs;
}

/**
 * 难度归一化 —— 模型倾向把绝大多数句子判成 intermediate（实测 184 句里 179 句），
 * 分级形同虚设。这里按可量化的结构指标重算：词数、从句引导词数、非谓语数量。
 */
function normalizeLevel(en) {
  const words = en.split(/\s+/).filter(Boolean).length;
  const subs = (en.match(/\b(which|that|who|whom|whose|when|while|because|although|though|if|unless|since|where|before|after|nor|as)\b/gi) || []).length;
  const nonfinite = (en.match(/\b\w+(?:ing|ed)\b/g) || []).length;
  if (words <= 21 && subs <= 1 && nonfinite <= 1) return 'beginner';
  if (words >= 34 || subs >= 3) return 'advanced';
  return 'intermediate';
}

// ── 4) 落盘 ──────────────────────────────────────────────────────

function writeOut(done) {
  // 跳过项（ann 为 null）不能参与渲染，否则整批落盘会崩；
  // 同时做一次与 App 相同的结构校验：每块必须含至少一个词 ——
  // 只有标点的块（如单独的「—」或「, and」）无法用词边界表示，
  // 会让「标准切分」与意群数对不上（实测 6 例），这类句子直接不写入。
  const hasWord = (t) => /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/.test(t);
  // 主干必须含限定动词 —— 模型偶尔把状语或从句标成 core。
  // 用词表判断而非正则：正则的词边界层层转义容易出错（已踩过）。
  const AUX = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
    'do', 'does', 'did', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must']);
  const hasFiniteVerb = (t) => {
    const words = String(t).toLowerCase().split(/[^a-z']+/).filter(Boolean);
    if (words.some((w) => AUX.has(w))) return true;
    return words.some((w) => w.length > 3 && (w.endsWith('ed') || w.endsWith('es') || w.endsWith('s')));
  };
  const kept = done.filter(
    (d) =>
      d &&
      d.ann &&
      Array.isArray(d.ann.segments) &&
      d.ann.segments.length >= 2 &&
      d.ann.segments.every((x) => x && hasWord(x.t)) &&
      d.ann.segments.filter((x) => x.r === 'core').every((x) => hasFiniteVerb(x.t)) &&
      d.ann.segments.some((x) => x.r === 'core'),
  );
  const items = kept.map(({ en, ann, source }, i) => {
    const id = `a${String(i + 1).padStart(3, '0')}`;
    const segs = ann.segments.map((s) => {
      const parts = [`t: ${JSON.stringify(s.t)}`, `r: '${s.r}'`];
      if (s.note) parts.push(`note: ${JSON.stringify(s.note)}`);
      return `      { ${parts.join(', ')} },`;
    }).join('\n');
    return `  {
    id: '${id}',
    en: ${JSON.stringify(en)},
    zh: ${JSON.stringify(ann.zh)},
    source: ${JSON.stringify(source)},
    level: '${normalizeLevel(en)}',
    auto: true,
    tip: ${JSON.stringify(ann.tip)},
    backboneGloss: ${JSON.stringify(ann.backbone)},
    segments: [
${segs}
    ],
  },`;
  }).join('\n');

  const header = `// EXPORTS: SENTENCE_LAB_AUTO
//
// 自动标注语料 —— 由 scripts/expand-sentence-corpus.cjs 生成，请勿手改。
//
// 来源：站内刊物（自带中英对照）、30 篇演讲、22 本公版书全文。
// 标注（意群切分 / 主干 / 中文说明）由免费模型生成，并经**结构校验**：
// 每块意群必须能在原句里按顺序逐字定位、必须存在主干、译文与读法提示齐全 ——
// 校验不过的句子直接丢弃，不会写进这里。原文未经模型改写（校验会拦住）。

import type { ISentenceLabItem } from './sentence-lab';

export const SENTENCE_LAB_AUTO: ISentenceLabItem[] = [
${items}
];
`;
  fs.writeFileSync(OUT_FILE, header, 'utf8');
}

// ── 主流程 ───────────────────────────────────────────────────────

(async () => {
  const existing = existingSentences();
  const seen = new Set(existing);
  const candidates = [];
  // 刊物优先（有现成译文，标注最可靠），然后演讲、书籍
  for (const group of [fromPublications(), fromSpeeches(), fromBooks(10)]) {
    for (const it of group) {
      const k = norm(it.en);
      if (seen.has(k)) continue;
      seen.add(k);
      candidates.push(it);
    }
  }

  console.log(`已有语料 ${existing.size} 句；新候选 ${candidates.length} 句`);
  const bySource = {};
  for (const c of candidates) bySource[c.source] = (bySource[c.source] || 0) + 1;
  const top = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('来源分布（前 12）:', top.map(([k, v]) => `${k}:${v}`).join(' · '));
  if (EXTRACT_ONLY) return;

  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { done: [] };
  if (args.includes('--rewrite')) {
    // 只按已有 state 重新渲染（不调 API），用于调整落盘格式/难度分级
    writeOut(state.done);
    console.log('已按 state 重写输出：' + state.done.filter((d) => d && d.ann).length + ' 句');
    return;
  }
  const doneKeys = new Set(state.done.map((d) => norm(d.en)));
  const queue = candidates.filter((c) => !doneKeys.has(norm(c.en))).slice(0, COUNT);
  console.log(`本轮要标注 ${queue.length} 句（可反复运行续跑）`);
  if (DRY) { queue.slice(0, 5).forEach((q) => console.log('  ·', q.source, '|', q.en.slice(0, 70))); return; }
  if (!API_KEY) { console.error('缺少 scripts/.apikey'); process.exit(1); }

  if (args.includes('--debug')) {
    global.__DEBUG_ONE = true;
    global.__VERBOSE = true;
    const item = queue[0];
    console.log('调试句子:', item.source, '|', item.en.slice(0, 90));
    const a = await annotate(item, 0);
    console.log('解析出的意群数:', a.segments.length);
    a.segments.forEach((x, i) => console.log(`  ${i + 1}. [${x.r}] ${JSON.stringify(x.t)}  ← ${x.note}`));
    console.log('主干:', a.backbone);
    console.log('译文:', a.zh);
    console.log('提示:', a.tip, '| 档位:', a.level);
    console.log('校验:', validate(item, a).join('；') || '✓ 通过');
    return;
  }

  let ok = 0;
  let rejected = 0;
  let failed = 0;
  let qi = 0;
  const t0 = Date.now();

  const worker = async () => {
    while (qi < queue.length) {
      const item = queue[qi++];
      let ann = null;
      for (let attempt = 0; attempt < 3 && !ann; attempt++) {
        try {
          const a = await annotate(item, attempt);
          const errs = validate(item, a);
          if (errs.length === 0) { ann = a; break; }
          // 结构校验不过：把错误回喂一次，让模型修正
          if (attempt === 0) {
            try {
              const retry = await annotate({ ...item, zhHint: (item.zhHint ? item.zhHint + '\n' : '') + `（上次输出被校验拒绝：${errs.join('；')}。请确保每个 SEG 片段都逐字出现在原句中，并至少有一块 core）` }, 1);
              if (validate(item, retry).length === 0) { ann = retry; break; }
            } catch { /* 落到下一次重试 */ }
          }
          rejected++;
        } catch (err) {
          if (global.__VERBOSE) console.error('    ✗ 调用失败:', String(err && err.message || err).slice(0, 120));
          await sleep(6000 * (attempt + 1));
        }
      }
      if (ann) {
        state.done.push({ en: item.en, ann, source: item.source });
        writeOut(state.done);
        ok++;
        if (ok % 5 === 0) {
          const min = (Date.now() - t0) / 60000;
          console.log(`  已标注 ${ok} 句（拒绝 ${rejected}，失败 ${failed}）· ${(ok / Math.max(0.01, min)).toFixed(1)} 句/分钟`);
        }
      } else {
        failed++;
        state.done.push({ en: item.en, ann: null, source: item.source, skipped: true });
        writeOut(state.done.filter((d) => d.ann));
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const kept = state.done.filter((d) => d.ann);
  console.log(`\n完成：本轮成功 ${ok} 句，拒绝 ${rejected}，失败 ${failed}`);
  console.log(`累计入库 ${kept.length} 句 → ${path.relative(ROOT, OUT_FILE)}`);
})().catch((e) => { console.error('扩量失败:', e); process.exit(1); });
