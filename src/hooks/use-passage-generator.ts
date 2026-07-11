/** Dual-mode AI passage generator */

import { useState, useCallback } from 'react';
import { useAI } from './use-ai';
import { useAuth } from '@/lib/auth-provider';
import { apiFetch } from '@/lib/api-client';

export interface GeneratedPassage {
  id: string;
  title: string;
  content: string;
  words: string[];
  createdAt: number;
}

export function usePassageGenerator() {
  const { isConfigured, chat: aiChat } = useAI();
  const { isAuthenticated } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [lastPassage, setLastPassage] = useState<GeneratedPassage | null>(null);

  const generatePassage = useCallback(async (words: string[], level?: string): Promise<GeneratedPassage | null> => {
    setGenerating(true);
    try {
      // Try server-side first (if authenticated)
      if (isAuthenticated) {
        const res = await apiFetch('/api/ai/passage', {
          method: 'POST',
          body: JSON.stringify({ words, level, mode: 'server' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.passage) {
            setLastPassage(data.passage);
            return data.passage;
          }
        }
        // Server returned fallback → try client
      }

      // Client-side generation (user's own AI key)
      if (isConfigured) {
        const wordList = words.join(', ');
        const result = await aiChat(
          [
            {
              role: 'system',
              content: 'You generate short English review passages. Return ONLY valid JSON (no markdown): {"title":"...","content":"...","words_used":["word1",...]}.',
            },
            {
              role: 'user',
              content: `Write a short engaging English passage (150-250 words) using these words: ${wordList}. The passage should be natural and suitable for an English learner.`,
            },
          ],
          { temperature: 0.7, maxTokens: 1024 },
        );

        const match = result.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          const passage: GeneratedPassage = {
            id: crypto.randomUUID(),
            title: parsed.title || 'Review Passage',
            content: parsed.content || result,
            words: parsed.words_used || words,
            createdAt: Date.now(),
          };
          setLastPassage(passage);
          return passage;
        }
      }

      return null;
    } catch {
      return null;
    } finally {
      setGenerating(false);
    }
  }, [isAuthenticated, isConfigured, aiChat]);

  return { generatePassage, generating, lastPassage };
}
