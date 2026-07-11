/** POST /api/ai/passage — generate review passage from today's words */

import { authenticateRequest } from '../_lib/auth-middleware.js';
import { getKV } from '../_lib/kv.js';
import type { GeneratedPassage } from '../_lib/types.js';

export const config = { runtime: 'edge' };

const DEFAULT_AI_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_AI_MODEL = 'deepseek-chat';

export async function POST(request: Request) {
  let body: { words?: string[]; level?: string; mode?: 'server' | 'client' };
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const words = body.words || [];
  if (words.length === 0) {
    return Response.json({ error: 'No words provided' }, { status: 400 });
  }

  // Client-side mode: return immediately, client calls AI directly
  if (body.mode === 'client') {
    return Response.json({ mode: 'client' });
  }

  // Server-side mode
  const apiKey = process.env.SERVER_AI_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Server AI not configured', fallback: 'client' }, { status: 503 });
  }

  const endpoint = process.env.SERVER_AI_ENDPOINT || DEFAULT_AI_ENDPOINT;
  const model = process.env.SERVER_AI_MODEL || DEFAULT_AI_MODEL;
  const wordList = words.join(', ');

  const prompt = `You are an English teacher. Write a short, engaging English passage (150-250 words) that naturally incorporates these vocabulary words: ${wordList}. The passage should be at an appropriate difficulty level for an English learner and use the words in natural context. Return ONLY valid JSON (no markdown code fences): {"title": "passage title", "content": "the full passage text", "words_used": ["word1", "word2", ...]}`;

  try {
    const aiResp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You generate short English passages for vocabulary review. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!aiResp.ok) {
      return Response.json({ error: `AI error: ${aiResp.status}`, fallback: 'client' }, { status: 502 });
    }

    const data: any = await aiResp.json();
    const content = data.choices?.[0]?.message?.content || '';
    // Extract JSON from response (handle possible markdown fences)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: 'AI did not return valid JSON', fallback: 'client' }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const passage: GeneratedPassage = {
      id: crypto.randomUUID(),
      title: parsed.title || 'Review Passage',
      content: parsed.content || content,
      words: parsed.words_used || words,
      createdAt: Date.now(),
    };

    // Save to KV if user is authenticated
    const session = await authenticateRequest(request);
    if (session) {
      const kv = getKV();
      await kv.set(`passages:${session.userId}:${passage.id}`, JSON.stringify(passage));
    }

    return Response.json({ passage });
  } catch (err: any) {
    return Response.json({ error: err.message, fallback: 'client' }, { status: 500 });
  }
}
