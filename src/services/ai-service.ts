/**
 * Unified AI Service for DeepSeek & Doubao (豆包)
 *
 * Both providers use OpenAI-compatible chat completions API.
 * This service provides a unified streaming interface.
 */

import {
  type AIProvider,
  PROVIDER_CONFIGS,
  getActiveProvider,
  getConfiguredProviders,
  getAPIKey,
} from './ai-config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallOptions {
  /** Override the active provider */
  provider?: AIProvider;
  /** Override the default model */
  model?: string;
  /** Max tokens for the response */
  maxTokens?: number;
  /** Temperature (0-2), default varies by use case */
  temperature?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/**
 * Core streaming chat completion.
 *
 * Usage:
 *   const stream = streamChat(messages, { temperature: 0.7 });
 *   for await (const chunk of stream) {
 *     console.log(chunk.content);
 *   }
 */
export async function* streamChat(
  messages: ChatMessage[],
  options: StreamCallOptions = {},
): AsyncGenerator<StreamChunk, void, undefined> {
  const provider = resolveProvider(options.provider);
  const config = PROVIDER_CONFIGS[provider];

  const body = {
    provider,
    model: options.model || config.freeModel,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
    apiKey: getAPIKey(provider) || undefined,
  };

  // Always route through server proxy to protect API key
  let response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  // If server proxy returns 503 (not configured), throw with setup instructions
  if (response.status === 503) {
    throw new Error(
      `服务端 AI Key 未配置。请在服务端设置 ${config.name} API Key。\n` +
        `DeepSeek: https://platform.deepseek.com\n` +
        `豆包: https://console.volcengine.com/ark`,
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    let errorMsg: string;
    try {
      const err = JSON.parse(errorText);
      errorMsg = err.error?.message || err.message || errorText;
    } catch {
      errorMsg = errorText || `HTTP ${response.status}`;
    }
    throw new Error(`${config.name} API 错误 (${response.status}): ${errorMsg}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`${config.name} 响应没有 body`);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          yield { content: '', done: true };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { content, done: false };
          }
          // Check for finish reason
          if (parsed.choices?.[0]?.finish_reason) {
            yield { content: '', done: true };
            return;
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { content, done: false };
          }
        } catch {
          // skip
        }
      }
    }

    yield { content: '', done: true };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming chat completion. Returns the full response text.
 * Routes through server proxy to protect API keys.
 */
export async function chat(
  messages: ChatMessage[],
  options: StreamCallOptions = {},
): Promise<string> {
  const provider = resolveProvider(options.provider);
  const config = PROVIDER_CONFIGS[provider];

  const body = {
    provider,
    model: options.model || config.freeModel,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: false,
    apiKey: getAPIKey(provider) || undefined,
  };

  // Route through server proxy to protect API key
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (response.status === 503) {
    throw new Error(
      `服务端 AI Key 未配置。请在服务端设置 ${config.name} API Key。\n` +
        `DeepSeek: https://platform.deepseek.com\n` +
        `豆包: https://console.volcengine.com/ark`,
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    let errorMsg: string;
    try {
      const err = JSON.parse(errorText);
      errorMsg = err.error?.message || err.message || errorText;
    } catch {
      errorMsg = errorText || `HTTP ${response.status}`;
    }
    throw new Error(`${config.name} API 错误 (${response.status}): ${errorMsg}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Resolve which provider to use:
 * 1. Explicitly specified provider
 * 2. Active provider from settings (if API key is set)
 * 3. First configured provider
 * 4. Default to 'deepseek'
 */
function resolveProvider(preferred?: AIProvider): AIProvider {
  if (preferred && getAPIKey(preferred)) {
    return preferred;
  }

  const configured = getConfiguredProviders();
  if (configured.length > 0) {
    // Use active provider if configured, otherwise first configured
    const active = getActiveProvider();
    if (configured.includes(active)) return active;
    return configured[0];
  }

  // Fallback to default — will throw when API key is missing
  return getActiveProvider();
}

/**
 * Quick helper to build system + user messages.
 */
export function buildMessages(
  systemPrompt: string,
  userContent: string,
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

/**
 * Helper to extend existing messages with a new user message.
 */
export function appendUserMessage(
  existing: ChatMessage[],
  userContent: string,
): ChatMessage[] {
  return [...existing, { role: 'user', content: userContent }];
}
