// phrase-bank — 从词书搭配提取的短语词库（gen-phrase-bank.mjs 生成）
// 每个级别一个文件（懒加载），index 做注册表 + 类型定义

export interface IPhraseEntry {
  /** 短语文本（如 "with abandon"） */
  content: string;
  /** 来源单词（如 "abandon"） */
  sourceWord: string;
  /** 来源单词的中文释义主干 */
  meaning: string;
  /** 预翻译例句（英文）—— 从词书例句中匹配，覆盖约 80% 条目 */
  exampleEn?: string;
  /** 预翻译例句（中文） */
  exampleZh?: string;
}

export type PhraseLevel = 'zhongkao' | 'gaokao' | 'cet4' | 'cet6' | 'ielts' | 'toefl' | 'postgraduate' | 'professional' | 'advanced';

export const PHRASE_LEVELS: PhraseLevel[] = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'];

export const PHRASE_LEVEL_LABELS: Record<PhraseLevel, string> = {
  zhongkao: '中考',
  gaokao: '高考',
  cet4: '四级',
  cet6: '六级',
  ielts: '雅思',
  toefl: '托福',
  postgraduate: '考研',
  professional: '专业',
  advanced: '高阶',
};
