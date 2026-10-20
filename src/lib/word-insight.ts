import { readJson, cappedPut, persistJson } from './capped-cache';
import { extractJson } from './utils';

/**
 * 单词「词根拆解 + 近义辨析」的 AI 派生数据。
 *
 * 只读不写学习状态：结果按词缓存在 localStorage（FIFO 300），不参与 SM-2。
 * 词库现有的 synonyms 只是词表，这里补的是"差别在哪"——这正是背单词最缺的一层。
 */
export interface IWordInsight {
  word: string;
  parts: { part: string; gloss: string }[];
  rootMeaning: string;
  synonyms: { word: string; difference: string }[];
  tip: string;
}

const CACHE_KEY = '__nativethink_word_insight';
const CACHE_MAX = 300;

export type InsightChat = (
  messages: { role: 'system' | 'user'; content: string }[],
  options?: { signal?: AbortSignal; maxTokens?: number },
) => Promise<string>;

/** 词根解析是小任务，20 秒拿不到就收摊 —— 不让界面永远停在"生成中" */
const INSIGHT_TIMEOUT_MS = 20000;

export function readInsightCache(): Record<string, IWordInsight> {
  return readJson<Record<string, IWordInsight>>(CACHE_KEY, {});
}

function normalize(word: string, raw: unknown): IWordInsight | null {
  const v = raw as Partial<IWordInsight> | null;
  if (!v || typeof v !== 'object') return null;
  const parts = Array.isArray(v.parts)
    ? v.parts
        .filter((p) => p && typeof p.part === 'string')
        .slice(0, 4)
        .map((p) => ({ part: String(p.part), gloss: String(p.gloss || '') }))
    : [];
  const synonyms = Array.isArray(v.synonyms)
    ? v.synonyms
        .filter((s) => s && typeof s.word === 'string')
        .slice(0, 4)
        .map((s) => ({ word: String(s.word), difference: String(s.difference || '') }))
    : [];
  if (!parts.length && !synonyms.length) return null;
  return {
    word,
    parts,
    rootMeaning: typeof v.rootMeaning === 'string' ? v.rootMeaning : '',
    synonyms,
    tip: typeof v.tip === 'string' ? v.tip : '',
  };
}

export async function getWordInsight(chat: InsightChat, word: string): Promise<IWordInsight | null> {
  const key = word.trim().toLowerCase();
  if (!key) return null;
  const cache = readInsightCache();
  if (cache[key]) return cache[key];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), INSIGHT_TIMEOUT_MS);
  let raw: string;
  try {
    raw = await chat([
    {
      role: 'system',
      content:
        '你是英语词源与词汇辨析老师。只输出一个 JSON 对象，不要 markdown、不要解释。字段：' +
        'parts（数组，元素 {part, gloss}，词根/词缀拆解，1-3 项；拆不出就给空数组）, ' +
        'rootMeaning（字符串，词根合起来的核心义）, ' +
        'synonyms（数组，元素 {word, difference}，2-3 个近义词，difference 说明"和本词差在哪"，中文，一句话）, ' +
        'tip（字符串，一条记忆钩子，中文，≤40 字）。',
    },
      { role: 'user', content: key },
    ], { signal: ctrl.signal, maxTokens: 700 });
  } finally {
    clearTimeout(timer);
  }
  if (!String(raw).trim()) return null;
  const parsed = normalize(key, extractJson<unknown>(raw));
  if (!parsed) return null;

  persistJson(CACHE_KEY, cappedPut(cache, key, parsed, CACHE_MAX));
  return parsed;
}
