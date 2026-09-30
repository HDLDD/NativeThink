/**
 * 句子拼写 — 句子库存储 Hook
 * 管理拼写句子的 CRUD、从单词例句导入、AI 批量添加
 */

import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { persistJson, warnStorageFull, appendCapped } from './capped-cache';
import { extractJson } from './utils';
import type { ISpellingSentence, SpellingDifficulty, SpellingSentenceSource } from '@/types/spelling';

const SENTENCES_KEY = '__nativethink_spelling_sentences';
const BATCH_COUNTER_KEY = '__nativethink_spelling_batch_counter';

/**
 * 句子库上限。拼写句子每条 ≈ 100–200 字节（中英各一句 + 元数据），
 * 1,200 条约 150–250KB —— 再往上就是"整份句子库写不进 localStorage"的量级，
 * 而这里的条目**不可重算**（AI 生成的、收藏导入的），所以到上限时**只拒绝新增、绝不裁剪已有**，
 * 并把"本次只加进 N 条"如实告诉调用方。
 */
export const SPELLING_SENTENCE_LIMIT = 1200;

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
  // 句子库是用户/AI 创作、不可重算的：写失败必须说出来（原先整份静默丢失，
  // 症状是"导入的句子刷新后没了"）
  if (!persistJson(SENTENCES_KEY, sentences)) warnStorageFull();
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

  /** Add a single sentence (dedup by English text). false = 已存在 或 句子库已到上限 */
  const addSentence = useCallback(
    (sentence: Omit<ISpellingSentence, 'id' | 'createdAt'>): boolean => {
      // Dedup: skip if same English text already exists
      if (sentences.some((s) => s.en.trim().toLowerCase() === sentence.en.trim().toLowerCase())) {
        return false;
      }
      if (sentences.length >= SPELLING_SENTENCE_LIMIT) return false;
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

  /** Add multiple sentences at once (batch add, dedup by English text). 到上限只加得进剩下的部分 */
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
      // 封顶在这里：不裁剪已有句子，多余的拒绝写入并由调用方报出 skipped
      const { next, added } = appendCapped(sentences, newItems, SPELLING_SENTENCE_LIMIT);
      if (added > 0) persist(next);
      return added; // number actually added
    },
    [sentences, persist],
  );

  /** Upsert sentences: update existing (add level field) or insert new */
  const upsertSentences = useCallback(
    (items: Omit<ISpellingSentence, 'id' | 'createdAt'>[]): number => {
      let changed = 0;
      const updated = [...sentences];
      for (const item of items) {
        const key = item.en.trim().toLowerCase();
        const existingIdx = updated.findIndex((s) => s.en.trim().toLowerCase() === key);
        if (existingIdx >= 0) {
          // Update existing: add level field (preserve other fields)
          if (updated[existingIdx].level !== item.level) {
            updated[existingIdx] = { ...updated[existingIdx], level: item.level };
            changed++;
          }
        } else {
          if (updated.length >= SPELLING_SENTENCE_LIMIT) continue; // 到上限只更新，不再新增
          updated.push({
            ...item,
            id: generateId(),
            createdAt: Date.now(),
          });
          changed++;
        }
      }
      if (changed > 0) persist(updated);
      return changed;
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

  /** Remove all sentences with a given source (e.g. 'word_example' for rebuild) */
  const removeBySource = useCallback(
    (source: SpellingSentenceSource) => {
      const remaining = sentences.filter((s) => s.source !== source);
      if (remaining.length < sentences.length) {
        persist(remaining);
      }
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
    ): Promise<{ success: boolean; count: number; skipped?: number; error?: string }> => {
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

      // 空串 = 服务不可用（use-ai 失败返回 ''，见 use-ai.ts:82-85）。
      // 少了这道前置时，空串会被喂进 extractJson 抛错，用户看到误导性的
      // 「AI 返回数据解析失败」，其实是 Key 没配 / 限流 / 断网。
      if (!raw.trim()) {
        return { success: false, count: 0, error: 'AI 服务暂不可用，请稍后重试' };
      }

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
        // skipped 必须报出来：不报的话，"生成 20 条只进了 3 条"看起来像 AI 偷懒
        return { success: true, count: added, skipped: items.length - added };
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
    upsertSentences,
    removeSentence,
    removeBySource,
    clearAll,
    getSentence,
    importFromWordExamples,
    aiBatchAdd,
    getByDifficulty,
    getBySourceWord,
  };
}
