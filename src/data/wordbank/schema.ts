// Wordbank Schema - enhanced vocabulary data structure for offline word database

export interface IWordEntry {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  meaning: string;
  /** 等级: zhongkao, gaokao, cet4, cet6, ielts, toefl, postgraduate, professional, advanced */
  level: 'zhongkao' | 'gaokao' | 'cet4' | 'cet6' | 'ielts' | 'toefl' | 'postgraduate' | 'professional' | 'advanced';
  /** COCA 词频排名 (1 = most frequent) */
  frequencyRank: number;
  /** detail 字段：搭配；未加载 detail 时为空数组（真实值见 <level>.detail.ts） */
  collocations: string[];
  /** detail 字段：多条例句；未加载时为空数组 */
  examples: IExample[];
  synonyms: string[];
  antonyms: string[];
  /** 词族: 派生词 */
  wordFamily: string[];
  /** 语域 */
  register: 'formal' | 'neutral' | 'informal';
  /** 情感色彩 */
  emotion: 'positive' | 'neutral' | 'negative';
  /** 主题分类 */
  topics: string[];
  /** 是否中文无对应概念 */
  hasNoChineseEquivalent: boolean;
  /** 等价于 collocations.length > 0；让 collocOnly 过滤不依赖 detail 的加载时机 */
  hasCollocations: boolean;
  /** detail 字段：深度解释；未加载时为空字符串 */
  deepExplanation: string;
}

export interface IExample {
  en: string;
  zh: string;
}

/** detail 字段集合（按需加载，存放于 <level>.detail.ts） */
export interface IWordDetail {
  collocations: string[];
  examples: IExample[];
  deepExplanation: string;
}

/** key = word.toLowerCase() */
export type IWordDetailMap = Record<string, IWordDetail>;

/** Wordbank query parameters */
export interface IWordQuery {
  level?: string | string[];
  topic?: string;
  search?: string;
  frequencyMin?: number;
  frequencyMax?: number;
  register?: string;
  pos?: string;
  sortBy?: 'frequency' | 'alphabetical' | 'level';
  limit?: number;
  offset?: number;
}
