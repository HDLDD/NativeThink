/**
 * POST /api/ai/chat — AI chat proxy (streaming)
 *
 * Proxies AI requests through the server to avoid exposing API keys in the frontend.
 * Supports all configured providers via the `provider` field in the request body.
 *
 * Request body: { provider?, model?, messages, max_tokens?, temperature?, stream?, apiKey? }
 * Response: SSE stream (when stream=true) or JSON
 */

const PROVIDER_ENDPOINTS = {
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};

const PROVIDER_DEFAULT_MODELS = {
  deepseek: 'deepseek-chat',
  doubao: 'doubao-lite-32k',
  qwen: 'qwen-turbo',
  glm: 'glm-4-flash',
  siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
  moonshot: 'moonshot-v1-8k',
  groq: 'llama-3.1-8b-instant',
};

export async function onRequest(context) {
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

  const { provider = 'deepseek', model, messages, max_tokens = 4096, temperature = 0.7, stream = true, apiKey: clientApiKey } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'Messages array is required' }, { status: 400 });
  }

  // Get API key: prefer client-sent key, fallback to server env (AI_KEY_<PROVIDER> or SERVER_AI_KEY)
  const envKey = `AI_KEY_${provider.toUpperCase()}`;
  const apiKey = clientApiKey || env[envKey] || env.SERVER_AI_KEY;

  if (!apiKey) {
    return Response.json({ error: `Server AI key not configured for ${provider}` }, { status: 503 });
  }

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  const modelId = model || PROVIDER_DEFAULT_MODELS[provider] || 'deepseek-chat';

  try {
    const aiResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens,
        temperature,
        stream,
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => 'Unknown error');
      return Response.json({ error: `AI provider error: ${aiResp.status}`, detail: errorText }, { status: 502 });
    }

    // Stream the response back to the client
    if (stream && aiResp.body) {
      return new Response(aiResp.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming: return JSON
    const data = await aiResp.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: `Request failed: ${err.message}` }, { status: 500 });
  }
}
