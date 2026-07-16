/**
 * 句子拼写 — 句子库存储 Hook
 * 管理拼写句子的 CRUD、从单词例句导入、AI 批量添加
 */

import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { extractJson } from './utils';
import type { ISpellingSentence, SpellingDifficulty } from '@/types/spelling';

const SENTENCES_KEY = '__nativethink_spelling_sentences';
const BATCH_COUNTER_KEY = '__nativethink_spelling_batch_counter';

function generateId(): string {
  return `spell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadSentences(): ISpellingSentence[] {
  try {
    const saved = safeStorage.getItem(SENTENCES_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function saveSentences(sentences: ISpellingSentence[]) {
  safeStorage.setItem(SENTENCES_KEY, JSON.stringify(sentences));
}

export function useSpellingSentences() {
  const [sentences, setSentences] = useState<ISpellingSentence[]>(loadSentences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
  }, []);

  // Reload on cloud sync
  useEffect(() => {
    const onSyncDown = () => setSentences(loadSentences());
    window.addEventListener('nativethink-sync-down', onSyncDown);
    return () => window.removeEventListener('nativethink-sync-down', onSyncDown);
  }, []);

  const persist = useCallback((items: ISpellingSentence[]) => {
    setSentences(items);
    saveSentences(items);
  }, []);

  /** Add a single sentence (dedup by English text) */
  const addSentence = useCallback(
    (sentence: Omit<ISpellingSentence, 'id' | 'createdAt'>): boolean => {
      // Dedup: skip if same English text already exists
      if (sentences.some((s) => s.en.trim().toLowerCase() === sentence.en.trim().toLowerCase())) {
        return false;
      }
      const newItem: ISpellingSentence = {
        ...sentence,
        id: generateId(),
        createdAt: Date.now(),
      };
      persist([...sentences, newItem]);
      return true;
    },
    [sentences, persist],
  );

  /** Add multiple sentences at once (batch add) */
  const addSentences = useCallback(
    (items: Omit<ISpellingSentence, 'id' | 'createdAt'>[]): number => {
      const existingTexts = new Set(sentences.map((s) => s.en.trim().toLowerCase()));
      const newItems: ISpellingSentence[] = [];
      for (const item of items) {
        const key = item.en.trim().toLowerCase();
        if (!existingTexts.has(key)) {
          existingTexts.add(key);
          newItems.push({
            ...item,
            id: generateId(),
            createdAt: Date.now(),
          });
        }
      }
      if (newItems.length > 0) {
        persist([...sentences, ...newItems]);
      }
      return newItems.length; // number actually added
    },
    [sentences, persist],
  );

  /** Remove a sentence by ID */
  const removeSentence = useCallback(
    (id: string) => {
      persist(sentences.filter((s) => s.id !== id));
    },
    [sentences, persist],
  );

  /** Clear all sentences */
  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  /** Get a sentence by ID */
  const getSentence = useCallback(
    (id: string): ISpellingSentence | undefined => {
      return sentences.find((s) => s.id === id);
    },
    [sentences],
  );

  /** Import example sentences from word bank */
  const importFromWordExamples = useCallback(
    (examples: { en: string; zh: string }[], sourceWord: string, difficulty: SpellingDifficulty): number => {
      const items: Omit<ISpellingSentence, 'id' | 'createdAt'>[] = examples
        .filter((ex) => ex.en && ex.zh)
        .map((ex) => ({
          en: ex.en.trim(),
          zh: ex.zh.trim(),
          source: 'word_example' as const,
          sourceWord,
          difficulty,
        }));
      return addSentences(items);
    },
    [addSentences],
  );

  /** AI 批量添加句子 */
  const aiBatchAdd = useCallback(
    async (
      aiChat: (messages: any[]) => Promise<string>,
      buildMessages: (sys: string, user: string) => any[],
      topic: string,
      difficulty: SpellingDifficulty,
      count: number,
    ): Promise<{ success: boolean; count: number; error?: string }> => {
      const systemPrompt = `你是一位英语教师，正在创建句子拼写练习。

请生成 ${count} 条英文句子，每条句子需满足：
1. 与主题「${topic}」相关
2. 难度级别：${difficulty === 'beginner' ? '初级（使用基础词汇和简单句型）' : difficulty === 'intermediate' ? '中级（使用日常词汇和中等长度句子）' : '高级（使用复杂词汇和句型）'}
3. 句子长度适中（8-18个单词）
4. 附带准确的中文翻译

请严格按以下 JSON 格式返回，不要包含其他内容：
{
  "sentences": [
    { "en": "英文句子", "zh": "中文翻译" }
  ]
}`;

      const userContent = `请生成 ${count} 条关于「${topic}」的${difficulty === 'beginner' ? '初级' : difficulty === 'intermediate' ? '中级' : '高级'}英语句子用于拼写练习。`;

      const messages = buildMessages(systemPrompt, userContent);
      const raw = await aiChat(messages);

      try {
        const result = extractJson<{ sentences: { en: string; zh: string }[] }>(raw);
        if (!result.sentences || !Array.isArray(result.sentences) || result.sentences.length === 0) {
          return { success: false, count: 0, error: 'AI 返回格式异常，未解析到句子' };
        }

        const items: Omit<ISpellingSentence, 'id' | 'createdAt'>[] = result.sentences
          .filter((s) => s.en && s.zh)
          .map((s) => ({
            en: s.en.trim(),
            zh: s.zh.trim(),
            source: 'ai_generated' as const,
            difficulty,
            batchId: `batch_${Date.now()}`,
          }));

        const added = addSentences(items);
        return { success: true, count: added };
      } catch (e) {
        return { success: false, count: 0, error: 'AI 返回数据解析失败，请重试' };
      }
    },
    [addSentences],
  );

  /** Get sentences by difficulty level */
  const getByDifficulty = useCallback(
    (difficulty: SpellingDifficulty): ISpellingSentence[] => {
      return sentences.filter((s) => s.difficulty === difficulty);
    },
    [sentences],
  );

  /** Get sentences by source word */
  const getBySourceWord = useCallback(
    (word: string): ISpellingSentence[] => {
      return sentences.filter((s) => s.sourceWord === word);
    },
    [sentences],
  );

  return {
    sentences,
    loaded,
    addSentence,
    addSentences,
    removeSentence,
    clearAll,
    getSentence,
    importFromWordExamples,
    aiBatchAdd,
    getByDifficulty,
    getBySourceWord,
  };
}
