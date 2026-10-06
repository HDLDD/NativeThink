// phrase-bank — 从词书搭配提取的短语词库
// 每个级别一个文件（懒加载），index 做注册表 + 类型定义
// 数据由 scripts/gen-phrase-bank.mjs 生成（只生成 per-level 数据文件，不碰本文件）

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

export type PhraseLevel =
  | 'zhongkao' | 'gaokao' | 'cet4' | 'cet6' | 'ielts'
  | 'toefl' | 'postgraduate' | 'professional' | 'advanced';

export const PHRASE_LEVELS: PhraseLevel[] = [
  'zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts',
  'toefl', 'postgraduate', 'professional', 'advanced',
];

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

const loaders: Record<PhraseLevel, () => Promise<IPhraseEntry[]>> = {
  zhongkao: () => import('./zhongkao').then(m => m.Zhongkao_PHRASES),
  gaokao: () => import('./gaokao').then(m => m.Gaokao_PHRASES),
  cet4: () => import('./cet4').then(m => m.Cet4_PHRASES),
  cet6: () => import('./cet6').then(m => m.Cet6_PHRASES),
  ielts: () => import('./ielts').then(m => m.Ielts_PHRASES),
  toefl: () => import('./toefl').then(m => m.Toefl_PHRASES),
  postgraduate: () => import('./postgraduate').then(m => m.Postgraduate_PHRASES),
  professional: () => import('./professional').then(m => m.Professional_PHRASES),
  advanced: () => import('./advanced').then(m => m.Advanced_PHRASES),
};

const cache: Partial<Record<PhraseLevel, IPhraseEntry[]>> = {};

/** 按级别加载短语（首次调用触发懒加载，之后走内存缓存） */
export async function loadPhrases(level: PhraseLevel): Promise<IPhraseEntry[]> {
  if (cache[level]) return cache[level];
  cache[level] = await loaders[level]();
  return cache[level];
}
