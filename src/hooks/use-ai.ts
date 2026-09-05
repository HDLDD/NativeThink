/**
 * Convenience hook for AI service integration.
 * Provides streaming chat, non-streaming chat, and provider status.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  streamChat,
  chat,
  buildMessages,
  appendUserMessage,
  type ChatMessage,
  type StreamCallOptions,
} from '@/services/ai-service';
import {
  getConfiguredProviders,
  AI_CONFIG_CHANGED_EVENT,
  type AIProvider,
} from '@/services/ai-config';

export interface UseAIReturn {
  /** Whether at least one AI provider has an API key configured */
  isConfigured: boolean;
  /** List of configured provider IDs */
  configuredProviders: AIProvider[];
  /**
   * Streaming chat — returns an async generator.
   * Usage: for await (const chunk of streamChat(messages)) { ... }
   */
  streamChat: (messages: ChatMessage[], options?: StreamCallOptions) => AsyncGenerator<{ content: string; done: boolean }>;
  /**
   * Non-streaming chat — returns the full response text.
   */
  chat: (messages: ChatMessage[], options?: StreamCallOptions) => Promise<string>;
  /** Build system + user messages */
  buildMessages: (systemPrompt: string, userContent: string) => ChatMessage[];
  /** Append a user message to existing messages */
  appendUserMessage: (existing: ChatMessage[], userContent: string) => ChatMessage[];
}

export function useAI(): UseAIReturn {
  const [configuredProviders, setConfiguredProviders] = useState<AIProvider[]>(() =>
    getConfiguredProviders(),
  );

  // Re-evaluate when keys change (settings dialog) or window regains focus,
  // so pages mounted before configuration enable their AI buttons without a reload.
  useEffect(() => {
    const refresh = () => setConfiguredProviders(getConfiguredProviders());
    window.addEventListener(AI_CONFIG_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(AI_CONFIG_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const isConfigured = configuredProviders.length > 0;

  const handleStreamChat = useCallback(
    async function* (messages: ChatMessage[], options?: StreamCallOptions) {
      try {
        for await (const chunk of streamChat(messages, options)) {
          yield chunk;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        const message = err?.message || 'AI 服务连接失败';
        toast.error(message);
        yield { content: '', done: true };
      }
    },
    [],
  );

  const handleChat = useCallback(
    async (messages: ChatMessage[], options?: StreamCallOptions): Promise<string> => {
      try {
        return await chat(messages, options);
      } catch (err: any) {
        if (err?.name === 'AbortError') return '';
        const message = err?.message || 'AI 服务连接失败';
        toast.error(message);
        return '';
      }
    },
    [],
  );

  return {
    isConfigured,
    configuredProviders,
    streamChat: handleStreamChat,
    chat: handleChat,
    buildMessages,
    appendUserMessage,
  };
}
