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
  collocations: string[];
  /** 多条例句 */
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
  /** 深度解释 */
  deepExplanation: string;
}

export interface IExample {
  en: string;
  zh: string;
}

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
