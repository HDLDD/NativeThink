#!/usr/bin/env node
/**
 * 句子精讲标注 —— 为每句生成「翻译思路」与「语法点」。
 *
 * 用户要求拆句应讲清：为什么这么翻译、怎么翻译、用了什么语法。
 * 意群/主干/译文已有（见 sentence-lab*.ts），这里补上缺的两层：
 *   translation: 3 条翻译思路（语序调整 / 词义选择 / 句式处理）
 *   grammar:     句中用到的语法结构名（会与语法地图的条目对应）
 *
 * 输出 src/data/sentence-explain.ts（id → { translation, grammar }）。
 * 用法: node scripts/annotate-sentence-explain.cjs [--count N] [--rewrite]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const KEY = fs.readFileSync(path.join(__dirname, '.apikey'), 'utf8').trim();
const OUT = path.join(ROOT, 'src', 'data', 'sentence-explain.ts');
const STATE = path.join(ROOT, '.sentence-explain-state.json');
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODELS = ['glm-4-flash', 'glm-4-flash-250414', 'glm-4.7-flash'];
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const COUNT = (() => { const i = args.indexOf('--count'); return i >= 0 ? parseInt(args[i + 1], 10) : 9999; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 从三个数据文件里取出全部句子 */
function loadSentences() {
  const out = [];
  for (const f of ['sentence-lab.ts', 'sentence-lab-extra.ts', 'sentence-lab-auto.ts']) {
    const p = path.join(ROOT, 'src', 'data', f);
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    // 逐条取 id / en / zh（三行一组）—— 不用含反斜杠的正则，避免转义层层出错
    const lines = s.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const idm = lines[i].match(/id: '([^']+)'/);
      if (!idm || !/^\s*id:/.test(lines[i])) continue;
      const enL = lines[i + 1] || '';
      const zhL = lines[i + 2] || '';
      // 两种写法都要认：生成的用双引号（JSON.stringify），手写的用单引号
      const pick = (line) => {
        const d = line.match(/^\s*(?:en|zh): (".*"),?\s*$/);
        if (d) { try { return JSON.parse(d[1].replace(/,$/, '')); } catch { return null; } }
        const sgl = line.match(/^\s*(?:en|zh): '(.*)',?\s*$/);
        if (sgl) return sgl[1].replace(/'$/, '');
        return null;
      };
      const en = pick(enL);
      const zh = pick(zhL);
      if (!en || !zh) continue;
      out.push({ id: idm[1], en, zh });
    }
  }
  return out;
}

const SYS = `你是英语教学专家，为中国学习者逐句精讲。用户给一句英文和它的中文译文。

只输出一个 JSON 对象，不要代码块、不要解释：
{"translation":["中文的语序与英文不同，英文把……放前、……放后，译成中文时要调换","which 引导的定语从句在中文里拆成独立分句更自然","advice 是不可数名词，用 some advice 而不加 s"],"grammar":["定语从句","非谓语作状语","被动语态"]}

要求：
- translation：3 条，讲清「为什么这样译 / 怎么译」，分别覆盖：
  ① 语序与断句（英文结构与中文表达习惯的差异）② 词义与搭配的选择 ③ 句式处理（从句/非谓语/被动等怎么落到中文）。
  每条一句中文，具体到本句，不要泛泛而谈，不要照抄译文。
- grammar：2~5 个语法结构名（用中文术语，如「定语从句」「虚拟语气」「非谓语作状语」「强调句」「被动语态」「完成时」），只要本句真正用到的。
- 不要输出其他字段。`;

async function annotate(item, attempt = 0) {
  const model = MODELS[Math.min(attempt, MODELS.length - 1)];
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model, thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: `英文原句：${item.en}\n中文译文：${item.zh}` }],
      max_tokens: 900, temperature: 0.25, stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const txt = (j?.choices?.[0]?.message?.content || '').replace(/```(?:json)?/gi, '').trim();
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o = null;
  try { o = JSON.parse(txt.slice(a, b + 1)); } catch { return null; }
  const translation = (Array.isArray(o?.translation) ? o.translation : []).map((x) => String(x).trim()).filter(Boolean);
  const grammar = (Array.isArray(o?.grammar) ? o.grammar : []).map((x) => String(x).trim()).filter(Boolean);
  if (translation.length < 2 || grammar.length < 1) return null;
  return { translation: translation.slice(0, 4), grammar: grammar.slice(0, 5) };
}

function writeOut(state) {
  const items = state.done.filter((d) => d && d.data);
  const body = items.map((d) => {
    const t = d.data.translation.map((x) => `      ${JSON.stringify(x)},`).join('\n');
    const g = d.data.grammar.map((x) => `      ${JSON.stringify(x)},`).join('\n');
    return `  ${JSON.stringify(d.id)}: {\n    translation: [\n${t}\n    ],\n    grammar: [\n${g}\n    ],\n  },`;
  }).join('\n');
  fs.writeFileSync(OUT, `// EXPORTS: SENTENCE_EXPLAIN, ISentenceExplain
//
// 句子精讲 —— 每句的「翻译思路」与「语法点」，由 scripts/annotate-sentence-explain.cjs 生成。
// translation：为什么这样译、怎么译（语序 / 词义 / 句式三层）
// grammar：本句真正用到的语法结构，与 grammar-map 的条目对应（见 sentence-grammar-link.ts）

export interface ISentenceExplain {
  translation: string[];
  grammar: string[];
}

export const SENTENCE_EXPLAIN: Record<string, ISentenceExplain> = {
${body}
};
`, 'utf8');
}

(async () => {
  const all = loadSentences();
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { done: [] };
  if (args.includes('--rewrite')) { writeOut(state); console.log('已重写：' + state.done.filter((d) => d && d.data).length + ' 句'); return; }
  const doneIds = new Set(state.done.filter((d) => d && d.data).map((d) => d.id));
  const queue = all.filter((s) => !doneIds.has(s.id)).slice(0, COUNT);
  console.log(`共 ${all.length} 句，待标注 ${queue.length} 句`);
  if (!queue.length) { writeOut(state); return; }

  let ok = 0, fail = 0, qi = 0;
  const t0 = Date.now();
  const worker = async () => {
    while (qi < queue.length) {
      const item = queue[qi++];
      let data = null;
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        try { data = await annotate(item, attempt); if (!data) await sleep(1500); }
        catch { await sleep(5000 * (attempt + 1)); }
      }
      if (data) { state.done.push({ id: item.id, data }); ok++; }
      else { fail++; }
      writeOut(state);
      fs.writeFileSync(STATE, JSON.stringify(state), 'utf8');
      if (ok % 10 === 0 && ok) console.log(`  已标注 ${ok} 句（失败 ${fail}）· ${(ok / ((Date.now() - t0) / 60000)).toFixed(0)} 句/分钟`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeOut(state);
  console.log(`完成：成功 ${ok}，失败 ${fail}，累计 ${state.done.filter((d) => d && d.data).length} 句`);
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
