// Lightweight wordbank metadata — does NOT import any word data files.
// Use this for word counts, level labels, etc. without pulling in ~47K words.

/** Pre-computed word counts per level */
export const WORD_COUNTS: Record<string, number> = {
  cet4: 4542,
  cet6: 7404,
  ielts: 6609,
  toefl: 10367,
  advanced: 18471,
};

export const TOTAL_WORDS = 47393;

export const LEVEL_LABELS: Record<string, string> = {
  cet4: '四级',
  cet6: '六级',
  ielts: '雅思',
  toefl: '托福',
  advanced: '高阶',
};

export const ALL_LEVELS = ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'] as const;

export const LEVEL_ORDER: Record<string, number> = {
  cet4: 0,
  cet6: 1,
  ielts: 2,
  toefl: 3,
  advanced: 4,
};
