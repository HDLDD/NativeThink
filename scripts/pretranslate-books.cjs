#!/usr/bin/env node
/**
 * pretranslate-books — 预翻译内置书籍（离线流水线）。
 *
 * 为什么：逐段/逐章实时翻译受网络与限流影响，慢且耗额度。
 * 预翻译把「翻译」只做一次，结果作为数据随包分发：
 *   - 用户打开章节即有中文对照，零等待、零 API 消耗、断网可用
 *   - 对作者也是最省力的方案：跑一次脚本，全站生效
 *
 * 用法：
 *   node scripts/pretranslate-books.cjs --list              # 列出可翻译书籍
 *   node scripts/pretranslate-books.cjs 11                  # 翻译 id=11（爱丽丝）
 *   node scripts/pretranslate-books.cjs 11 84 --max-chapters 5
 *   node scripts/pretranslate-books.cjs --all               # 全部（耗时长，可中断续跑）
 *
 * 产物：public/translations/<bookId>.json  形如 { "0": ["译文", ...], "1": [...] }
 * 应用侧自动读取并写入本地缓存（见 src/data/book-translation.ts 的 tryLoadPrebaked）。
 * 每章完成即落盘 —— 中断后重跑只补缺失段落。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'translations');
const API_KEY = fs.existsSync(path.join(__dirname, '.apikey'))
  ? fs.readFileSync(path.join(__dirname, '.apikey'), 'utf8').trim()
  : '';
const GLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
/**
 * 批量固定走 glm-4-flash。实测（真实长段落，每批 4 段、约 590 输出 token/请求）：
 *   glm-4-flash        10 并发 54 段/分钟、20 并发 93 段/分钟（均 0 失败）、40 并发起 429
 *   glm-4-flash-250414 4/8/16 并发都只有 2/24 成功 —— 额度已基本耗尽，打不了主力
 * 故取 20 并发作甜点。250414 只作重试备用档：它单 token 更快（28ms vs 67ms），
 * 额度若恢复能派上用场；同时它是出厂 app 的对话默认档，让开主力位用户端就不受批量影响。
 * 不用 glm-4v-flash：会复述格式指令（输出「第一段译文：」）、产生幻觉且慢一倍。
 *
 * 注意：不要靠高频重试去「榨」已耗尽模型的额度 —— 那等于对免费接口刷被拒请求，会连累账号。
 */
const MODELS = ['glm-4-flash', 'glm-4-flash-250414'];
const BATCH = 4;
/** 实测甜点：20 并发零限流（40 并发开始 429），相比最初 2 并发吞吐提升约 4 倍 */
const CONCURRENCY = 20;
const PROXY = 'https://nativethink.pages.dev/api/gutenberg';

/**
 * 各书体量（实测段落数）—— 用于 --all 时按升序排，让中小体量的书先翻完，
 * 巨著排最后（否则用户要等 20+ 小时才看到第一本完整的中文对照）。
 */
const BOOK_SIZE_HINT = {
  '1635': 203, '43': 368, '1232': 408, '244': 836, '84': 826, '11': 834,
  '1228': 1328, '174': 1551, '768': 1984, '345': 2223, '3300': 2259,
  '76': 2281, '1342': 2515, '1661': 2563, '98': 3375, '730': 3933,
  '1400': 3979, '1260': 4122, '3600': 5573, '2600': 12115, '1184': 15104,
};
const EXTERNALS = '--external:@huggingface/transformers --external:onnxruntime-node --external:@capacitor/core --external:sharp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 去掉控制字符（保留换行与制表符）—— 模型常在 JSON 字符串里塞裸控制符导致解析失败 */
function stripControlChars(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out += (c < 9 || (c > 10 && c < 32)) ? ' ' : str.charAt(i);
  }
  return out;
}

function loadBooks() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'books.ts'), 'utf8');
  const re = /bookContent\(\s*'(\d+)',\s*'([^']+)'/g;
  const list = [];
  let m;
  while ((m = re.exec(src))) list.push({ id: m[1], title: m[2] });
  return list;
}

/** 用 esbuild 打包应用内的逻辑，确保章节切分与线上完全一致 */
function bundle(entry, outfile) {
  execSync(`npx esbuild ${entry} --bundle --platform=node --format=cjs --outfile="${outfile}" --log-level=error ${EXTERNALS}`, { cwd: ROOT, stdio: 'inherit' });
  return require(outfile);
}

async function requestTranslation(texts, attempt) {
  const model = MODELS[Math.min(attempt || 0, MODELS.length - 1)];
  const sys = 'Translate each numbered English paragraph into natural fluent Chinese. Output each translation right after its marker, e.g. [[1]]first translation [[2]]second translation. Rules: keep [[n]] markers exactly 1:1 with the input; one translation per paragraph; do NOT wrap translations in quotes; no JSON, no markdown, no explanations; drop "_italic_" markers.';
  // 标记格式必须与系统提示、解析器一致都用 [[n]]。
  // 实测（Dracula 长段落 12 批）：发单括号 [1] 时模型照抄输入格式回单括号，
  // 解析器认不出 → 0/12 解析成功；改用 [[1]] 后 12/12 成功。
  const user = texts.map((t, i) => `[[${i + 1}]] ${t.slice(0, 1500)}`).join('\n\n');
  const res = await fetch(GLM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model,
      thinking: { type: 'disabled' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      max_tokens: 4096,
      temperature: 0.3,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'api error');
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  const cleaned = stripControlChars((msg && msg.content) || '');
  const out = new Array(texts.length).fill('');

  // 主解析：[[n]] 标记（不受引号/换行影响）
  const markerRe = /\[\[(\d+)\]\]\s*([^[]*)/g;
  let mk;
  while ((mk = markerRe.exec(cleaned))) {
    const idx = Number(mk[1]) - 1;
    const seg = mk[2].replace(/\s+/g, ' ').trim();
    if (idx >= 0 && idx < texts.length && seg) out[idx] = seg;
  }

  // 叠加兜底：模型偶尔镜像输入回单括号 [n]（历史上正是这个不一致吃掉了大量段落）。
  // 用后行断言避免吃掉分隔符，且只补仍为空的槽位 —— 混合格式的响应也能救回来。
  const singleRe = /(?<!\[)\[(\d+)\]\s*([^[]*)/g;
  while ((mk = singleRe.exec(cleaned))) {
    const idx = Number(mk[1]) - 1;
    const seg = mk[2].replace(/\s+/g, ' ').trim();
    if (idx >= 0 && idx < texts.length && seg && !out[idx]) out[idx] = seg;
  }

  // 兼容：若模型仍返回 JSON
  if (!out.some(Boolean)) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const item of parsed.t || []) {
          const idx = Number(item.i) - 1;
          if (idx >= 0 && idx < texts.length) out[idx] = String(item.zh || '').trim();
        }
      } catch { /* ignore */ }
    }
  }
  if (!out.some(Boolean)) throw new Error('unparseable');
  return out;
}

/** 批量 + 限流退避 + 批量失败逐段兜底 */
async function translateSegments(texts) {
  const result = new Array(texts.length).fill('');
  const queue = [];
  for (let i = 0; i < texts.length; i += BATCH) queue.push({ start: i, items: texts.slice(i, i + BATCH) });

  const worker = async () => {
    while (queue.length) {
      const job = queue.shift();
      let ok = false;
      for (let retry = 0; retry < 3 && !ok; retry++) {
        try {
          const zh = await requestTranslation(job.items, retry);
          zh.forEach((v, k) => { if (v) result[job.start + k] = v; });
          ok = true;
        } catch (e) {
          if (retry < 2) await sleep(4000 * (retry + 1));
          else console.warn(`   段 ${job.start + 1}-${job.start + job.items.length} 批量失败，逐段兜底`);
        }
      }
      if (!ok) {
        for (let k = 0; k < job.items.length; k++) {
          for (let retry = 0; retry < 2; retry++) {
            try {
              const zh = await requestTranslation([job.items[k]], retry);
              if (zh[0]) { result[job.start + k] = zh[0]; break; }
            } catch { await sleep(3000); }
          }
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return result;
}

(async () => {
  const args = process.argv.slice(2);
  const books = loadBooks();
  if (args.length === 0 || args.includes('--list')) {
    console.log('可翻译的内置书籍：');
    books.forEach((b) => console.log(`  ${String(b.id).padStart(5)}  ${b.title}`));
    console.log('\n用法: node scripts/pretranslate-books.cjs <id...> [--max-chapters N] [--no-gaps|--gaps-only]  或  --all');
    return;
  }
  if (!API_KEY) { console.error('缺少 scripts/.apikey（出厂 API Key）'); process.exit(1); }

  const flagValues = new Set();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-chapters' && args[i + 1]) flagValues.add(args[i + 1]);
  }
  const maxChaptersIdx = args.indexOf('--max-chapters');
  const maxChapters = maxChaptersIdx >= 0 ? parseInt(args[maxChaptersIdx + 1], 10) : Infinity;
  /**
   * 近满章的零星空段单独处理 —— 一章只差 1~2 段也要占掉一个请求，且这类碎片段
   * 常让模型省掉 [[n]] 标记导致解析失败，再走「逐段兜底 + 3s 退避」，性价比极低，
   * 会把整章未译的正经活拖住。
   *   --no-gaps   只翻整章未译的章节，零星空段留到全部正文翻完后再统一回填
   *   --gaps-only 反过来，只回填零星空段
   */
  const skipGaps = args.includes('--no-gaps');
  const gapsOnly = args.includes('--gaps-only');
  const ids = args.includes('--all')
    ? books
        .map((b) => b.id)
        .sort((a, b) => (BOOK_SIZE_HINT[a] || 99999) - (BOOK_SIZE_HINT[b] || 99999))
    : args.filter((a) => /^\d+$/.test(a) && !flagValues.has(a));
  if (ids.length === 0) { console.error('未指定书籍 id'); process.exit(1); }

  const splitFile = path.join(ROOT, '.split-chapters.cjs');
  const cleanFile = path.join(ROOT, '.books-clean.cjs');
  const { splitChapters } = bundle('src/data/book-translation.ts', splitFile);
  const { cleanBookParagraphs } = bundle('src/data/books.ts', cleanFile);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const id of ids) {
    const meta = books.find((b) => b.id === id);
    const outFile = path.join(OUT_DIR, id + '.json');
    let existing = {};
    if (fs.existsSync(outFile)) {
      try { existing = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { existing = {}; }
    }
    console.log('\n=== ' + id + ' ' + (meta ? meta.title : '(未知)') + ' ===');

    const r = await fetch(PROXY + '?id=' + id, { signal: AbortSignal.timeout(180000) });
    if (!r.ok) { console.error('  取全文失败 HTTP', r.status); continue; }
    const body = await r.json();
    const text = body.text;
    const paras = text
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.replace(/\r?\n(?!\r?\n)/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 1);
    // 与线上一致：先段落化，再用应用同款清洗得到章节标记
    const fake = { id, pages: [{ pageNumber: 1, paragraphs: cleanBookParagraphs(paras), words: 0 }] };
    const chapters = splitChapters(fake);
    console.log('  共 ' + chapters.length + ' 章');

    let processed = 0;
    for (const ch of chapters) {
      if (processed >= maxChapters) { console.log('  已达 --max-chapters ' + maxChapters + '，停止'); break; }
      const key = String(ch.index);
      const prev = existing[key] || [];
      const need = ch.paragraphs.map((p, i) => (p.trim() && !prev[i] ? i : -1)).filter((i) => i >= 0);
      if (need.length === 0) { processed++; continue; }
      const isGap = need.length < ch.paragraphs.length;
      if (skipGaps && isGap) { processed++; continue; }
      if (gapsOnly && !isGap) { processed++; continue; }
      const titleShort = String(ch.title || '').slice(0, 24);
      console.log('  第 ' + (ch.index + 1) + ' 章「' + titleShort + '」待译 ' + need.length + '/' + ch.paragraphs.length + ' 段');
      const zh = await translateSegments(need.map((i) => ch.paragraphs[i]));
      const arr = prev.length === ch.paragraphs.length ? [...prev] : new Array(ch.paragraphs.length).fill('');
      need.forEach((gi, k) => { if (zh[k]) arr[gi] = zh[k]; });
      existing[key] = arr;
      fs.writeFileSync(outFile, JSON.stringify(existing));
      processed++;
    }
    const filled = Object.values(existing).reduce((s, a) => s + a.filter(Boolean).length, 0);
    console.log('  ✓ ' + Object.keys(existing).length + ' 章 / ' + filled + ' 段 → ' + path.relative(ROOT, outFile));
  }

  for (const f of [splitFile, cleanFile]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
})().catch((e) => { console.error('预翻译失败:', e); process.exit(1); });
