// 翻译性能基准：比较免费模型的单请求延迟/吞吐、批量大小、并发度
// 用法: node scripts/bench-translate.cjs
const fs = require('fs');
const path = require('path');

const KEY = fs.readFileSync(path.join(__dirname, '.apikey'), 'utf8').trim();
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const PARA = 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.';

const SYS_BATCH = `You are a literary translator. Translate each numbered English paragraph into natural fluent Chinese.
Rules: 1) Keep the [n] numbering exactly 1:1, do not merge or split. 2) Output STRICT JSON only: {"t":[{"i":1,"zh":"..."}]}. 3) No markdown fences, no explanations.`;

async function call(model, paragraphs, maxTokens = 4096) {
  const user = paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: SYS_BATCH }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false,
    }),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* raw */ }
  const content = parsed?.choices?.[0]?.message?.content || '';
  const ok = content.includes('"zh"') || content.includes('"t"');
  return { ms, status: res.status, ok, tokens: parsed?.usage?.completion_tokens || 0, err: parsed?.error?.message };
}

function pct(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

(async () => {
  console.log('=== 1) 单请求延迟（4 段合并，各 3 次）===');
  for (const model of ['glm-4-flash', 'glm-4-flash-250414', 'glm-4.5-flash']) {
    const times = [];
    let okCount = 0;
    for (let i = 0; i < 3; i++) {
      const r = await call(model, [PARA, PARA, PARA, PARA]);
      times.push(r.ms);
      if (r.ok && r.status === 200) okCount++;
      if (r.err) console.log('   err:', String(r.err).slice(0, 50));
    }
    console.log(`${model}: p50=${pct(times, 0.5)}ms max=${Math.max(...times)}ms 成功=${okCount}/3`);
  }

  console.log('\n=== 2) 批量大小对单请求耗时的影响（glm-4-flash-250414）===');
  for (const n of [4, 6, 8]) {
    const paras = Array.from({ length: n }, () => PARA);
    const r = await call(glm4Fast, paras);
    console.log(`${n} 段/请求: ${r.ms}ms ok=${r.ok} tokens=${r.tokens}`);
  }

  console.log('\n=== 3) 并发吞吐（12 段总量，不同并发度）===');
  for (const conc of [2, 4, 6]) {
    const batches = [[PARA, PARA], [PARA, PARA], [PARA, PARA], [PARA, PARA], [PARA, PARA], [PARA, PARA]];
    const queue = [...batches];
    const t0 = Date.now();
    let ok = 0, fail = 0;
    const worker = async () => {
      while (queue.length) {
        const b = queue.shift();
        const r = await call('glm-4-flash-250414', b);
        if (r.ok && r.status === 200) ok++; else fail++;
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));
    const total = Date.now() - t0;
    console.log(`并发 ${conc}: 总耗时 ${total}ms（12 段）→ ${Math.round(12000 / total * 10) / 10} 段/秒, 成功 ${ok} 失败 ${fail}`);
  }
})().catch((e) => console.error('bench failed:', e));

const glm4Fast = 'glm-4-flash-250414';
