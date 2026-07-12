/**
 * POST /api/feedback/submit — Feedback webhook proxy
 *
 * Proxies feedback submissions to Feishu webhook server-side,
 * so the webhook URL is not exposed in the frontend bundle.
 *
 * Request body: { type, title, description, rating? }
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const webhookUrl = env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return Response.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type = 'general', title, description, rating = 0 } = body;

  if (!description) {
    return Response.json({ error: 'Description is required' }, { status: 400 });
  }

  const TYPE_EMOJI = { bug: '🐛', feature: '💡', general: '💬' };
  const TYPE_TEXT = { bug: 'Bug 报告', feature: '功能建议', general: '一般反馈' };
  const RATING_STARS = rating > 0 ? '⭐'.repeat(rating) : '';

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
              content: `${TYPE_EMOJI[type] || '💬'} ${TYPE_TEXT[type] || '反馈'}: ${title || description.slice(0, 30)}`,
            },
            template: type === 'bug' ? 'red' : type === 'feature' ? 'blue' : 'wathet',
          },
          elements: [
            { tag: 'div', text: { tag: 'lark_md', content: description } },
            ...(rating > 0
              ? [{ tag: 'div', text: { tag: 'lark_md', content: `**评分:** ${RATING_STARS} (${rating}/5)` } }]
              : []),
            { tag: 'div', text: { tag: 'lark_md', content: `**类型:** ${TYPE_TEXT[type] || type}` } },
          ],
        },
      }),
    });

    if (!resp.ok) {
      return Response.json({ error: `Webhook error: ${resp.status}` }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: `Request failed: ${err.message}` }, { status: 500 });
  }
}
