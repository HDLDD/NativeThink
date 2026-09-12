import { withCors, preflight, isPreflight } from '../_lib/cors.js';
/**
 * GET /api/wikipedia?action=search&q=earth&limit=20
 * GET /api/wikipedia?action=page&title=Earth
 *
 * Proxy for the English Wikipedia API.
 * The browser never talks to Wikipedia directly — this server does —
 * so lookups work behind restrictive networks (GFW) and avoid CORS issues.
 *
 * Section headers are returned as standalone paragraphs prefixed with
 * "[SECTION] " so the frontend can render/TOC them deterministically.
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 NativeThink/1.0 (educational app)';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function wikiFetch(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(`${WIKI_API}?${qs}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  return res.json();
}

async function handler(context) {
  const { request } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'search';

  try {
    // ── Search: full-text search, returns titles + clean snippets ──
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return new Response(JSON.stringify({ results: [] }), { headers: CORS_HEADERS });
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);
      const data = await wikiFetch({
        action: 'query',
        list: 'search',
        srsearch: q,
        srlimit: String(limit),
        srprop: 'wordcount',
      });
      const results = (data.query?.search || []).map((s) => ({
        title: s.title,
        wordCount: s.wordcount || 0,
      }));
      return new Response(JSON.stringify({ results }), { headers: CORS_HEADERS });
    }

    // ── Page: plain-text extract, split into paragraphs ──
    if (action === 'page') {
      const title = (url.searchParams.get('title') || '').trim();
      if (!title) {
        return new Response(JSON.stringify({ error: 'Missing "title" parameter' }), { status: 400, headers: CORS_HEADERS });
      }
      const data = await wikiFetch({
        action: 'query',
        prop: 'extracts',
        explaintext: '1',
        redirects: '1',
        titles: title,
      });
      const page = data.query?.pages?.[0];
      if (!page || page.missing !== undefined) {
        return new Response(JSON.stringify({ error: '条目不存在' }), { status: 404, headers: CORS_HEADERS });
      }
      const extract = page.extract || '';
      const paragraphs = extract
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          // "== Section ==" headers → "[SECTION] Section" (single-level "== X ==")
          const m = s.match(/^==+ ([^=]+?) ==+$/);
          if (m) return `[SECTION] ${m[1].trim()}`;
          return s;
        })
        // Drop sub-sub-section boilerplate like "=== Sub ===" that survived
        .filter((s) => !s.startsWith('==='));
      return new Response(
        JSON.stringify({ title: page.title, paragraphs }),
        { headers: CORS_HEADERS },
      );
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `维基百科加载失败：${err.message}` }),
      { status: 502, headers: CORS_HEADERS },
    );
  }
}


// ── CORS：Capacitor APK (https://localhost) 跨域 + OPTIONS 预检 ──
export async function onRequest(context) {
  if (isPreflight(context.request)) return preflight();
  return withCors(await handler(context));
}
