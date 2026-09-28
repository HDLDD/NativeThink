import { withCors, preflight, isPreflight } from '../../_lib/cors.js';
import { feedbackKey } from '../../_lib/kv.js';
/**
 * POST /api/feedback/submit — 反馈接收端（前端 + APK 共用）
 *
 * 两条出路，按可用性叠加：
 *   1) 先写 Cloudflare KV 留档（`feedback:<毫秒时间戳>:<id>`）—— 只要配了 KV binding 就不丢；
 *   2) 再尝试推飞书群机器人（`FEISHU_WEBHOOK_URL`）—— 没配就跳过，不算失败。
 * 这样即便飞书通道没开通，反馈仍然落在 KV 里可查；反过来飞书挂了也不丢档。
 *
 * 返回体是**诚实的**：`delivered` = 有没有真的推进飞书，`archived` = 有没有落 KV。
 * 前端据此区分「已送达」「仅留档」「都没成功」三种提示 —— 以前非 2xx 一律显示
 * 「感谢你的反馈」，用户以为发出去了，其实服务端 503 直接丢弃。
 *
 * Request body: { type, title, description, rating?, platform?, appVersion?, locale?, hp? }
 * Response: { ok, delivered, archived, id }
 */

const TYPES = new Set(['bug', 'feature', 'general']);
const TYPE_TEXT = { bug: 'Bug 报告', feature: '功能建议', general: '一般反馈' };
const TYPE_EMOJI = { bug: '🐛', feature: '💡', general: '💬' };

const MAX_TITLE = 100;
const MAX_DESC = 1000;
const MAX_TEXT = 2000;         // platform/locale 等附带字段的上限，防灌包
const MAX_UA = 200;

/** 收敛成安全短字符串：去 HTML 标签与控制符、限长、去首尾空白 */
function clean(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, max);
}

async function handler(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 蜜罐：真人看不见这个字段，机器人会填。填了就假装成功丢弃，不给爬虫可辨识的信号
  if (clean(body.hp, MAX_TEXT) !== '') {
    return Response.json({ ok: true, delivered: false, archived: false, filtered: true });
  }

  const description = clean(body.description, MAX_DESC);
  if (!description) {
    return Response.json({ error: 'Description is required' }, { status: 400 });
  }

  const type = TYPES.has(body.type) ? body.type : 'general';
  const title = clean(body.title, MAX_TITLE);
  const ratingRaw = Number(body.rating);
  const rating = Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, Math.round(ratingRaw))) : 0;

  const at = Date.now();
  const id = `fb_${at}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    at,
    createdAt: new Date(at).toISOString(),
    type,
    title,
    description,
    rating,
    platform: clean(body.platform, MAX_TEXT),
    appVersion: clean(body.appVersion, MAX_TEXT),
    locale: clean(body.locale, MAX_TEXT),
    ua: clean(request.headers.get('User-Agent'), MAX_UA),
  };

  // ── 1) KV 留档（先落盘再推送：飞书超时/挂掉都不会让反馈消失）──
  let archived = false;
  if (env.KV) {
    try {
      await env.KV.put(feedbackKey(id, at), JSON.stringify(record));
      archived = true;
    } catch (e) {
      console.error('feedback KV put failed:', e);
    }
  }

  // ── 2) 飞书推送（可选通道，未配置不算错误）──
  let delivered = false;
  const webhookUrl = env.FEISHU_WEBHOOK_URL;
  let webhookError = null;

  if (webhookUrl) {
    const RATING_STARS = rating > 0 ? '⭐'.repeat(rating) : '';
    const meta = [record.platform, record.appVersion, record.locale].filter(Boolean).join(' · ');
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'interactive',
          card: {
            header: {
              title: {
                tag: 'plain_text',
                content: `${TYPE_EMOJI[type]} ${TYPE_TEXT[type]}: ${title || description.slice(0, 30)}`,
              },
              template: type === 'bug' ? 'red' : type === 'feature' ? 'blue' : 'wathet',
            },
            elements: [
              { tag: 'div', text: { tag: 'lark_md', content: description } },
              ...(rating > 0
                ? [{ tag: 'div', text: { tag: 'lark_md', content: `**评分:** ${RATING_STARS} (${rating}/5)` } }]
                : []),
              { tag: 'div', text: { tag: 'lark_md', content: `**类型:** ${TYPE_TEXT[type]}` } },
              ...(meta ? [{ tag: 'div', text: { tag: 'lark_md', content: `**来源:** ${meta}` } }] : []),
            ],
          },
        }),
      });

      if (resp.ok) {
        // 飞书机器人即使参数不对也常回 200，得看 body 里的 code 才算真送达
        try {
          const j = await resp.json();
          delivered = j && (j.code === undefined || j.code === 0);
          if (!delivered) webhookError = `feishu_code_${j?.code}:${clean(j?.msg, 120)}`;
        } catch {
          delivered = true; // 200 但非 JSON：按送达处理，避免误报失败
        }
      } else {
        webhookError = `feishu_http_${resp.status}`;
      }
    } catch (e) {
      webhookError = `feishu_fetch:${clean(e.message, 120)}`;
    }
  } else {
    webhookError = 'webhook_not_configured';
  }

  // 两条出路都没走通才报错，前端好提示"稍后重试"
  if (!archived && !delivered) {
    return Response.json({ error: 'Feedback storage unavailable', detail: webhookError }, { status: 503 });
  }

  return Response.json({ ok: true, delivered, archived, id, ...(webhookError ? { detail: webhookError } : {}) });
}


// ── CORS：Capacitor APK (https://localhost) 跨域 + OPTIONS 预检 ──
export async function onRequest(context) {
  if (isPreflight(context.request)) return preflight();
  return withCors(await handler(context));
}
