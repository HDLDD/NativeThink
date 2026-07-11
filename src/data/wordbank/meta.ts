// Lightweight wordbank metadata — does NOT import any word data files.
// Use this for word counts, level labels, etc. without pulling in ~75K words.

/** Pre-computed word counts per level */
export const WORD_COUNTS: Record<string, number> = {
  zhongkao: 3223,
  gaokao: 6008,
  cet4: 4542,
  cet6: 7404,
  ielts: 6609,
  toefl: 10367,
  postgraduate: 9602,
  professional: 8887,
  advanced: 18471,
};

export const TOTAL_WORDS = 75113;

export const LEVEL_LABELS: Record<string, string> = {
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

export const ALL_LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'] as const;

export const LEVEL_ORDER: Record<string, number> = {
  zhongkao: 0,
  gaokao: 1,
  cet4: 2,
  cet6: 3,
  ielts: 4,
  toefl: 5,
  postgraduate: 6,
  professional: 7,
  advanced: 8,
};

/** Level accent colors — single source of truth for all components */
export const LEVEL_COLORS: Record<string, string> = {
  zhongkao: '#EF4444',
  gaokao: '#F97316',
  cet4: '#0EA5E9',
  cet6: '#6C5CE7',
  ielts: '#F59E0B',
  toefl: '#EC4899',
  postgraduate: '#8B5CF6',
  professional: '#14B8A6',
  advanced: '#64748B',
};
