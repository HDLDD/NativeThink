// Lightweight wordbank metadata — does NOT import any word data files.
// Use this for word counts, level labels, etc. without pulling in ~75K words.

/**
 * 每本词书**可学的去重单词数** —— 必须等于 `queryWords({ level })` 的池子大小，
 * 也与快速闪卡/每日学习/词库浏览/进度分母同源。
 *
 * 注意与 `WORD_ENTRIES` 区分：数据文件里同一个词可能有多条词条（不同词性/不同词频排名），
 * 出卡时只出一张，所以可学词数会小于词条数。以前这里填的是词条数（中考 3,223），
 * 而加载层又把跨书重复的词判给"先加载的那本书"，于是出现"词书写 7,404、闪卡只有 2,127"。
 * 两个数都由脚本从数据里实测得到，`verify-wordbank-loading.mjs` 会锁住它们不许漂移。
 */
export const WORD_COUNTS: Record<string, number> = {
  zhongkao: 1987,
  gaokao: 3743,
  cet4: 4542,
  cet6: 7404,
  ielts: 6609,
  toefl: 10367,
  postgraduate: 5047,
  professional: 4464,
  advanced: 18470,
};

/** 数据文件里的原始词条数（含同词多条），只用于说明词库规模，不作任何分母 */
export const WORD_ENTRIES: Record<string, number> = {
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

/** 词条总数 = 各书词条相加（同一词在多本书里各有一条） */
export const TOTAL_ENTRIES = 75113;

/** 跨书唯一单词数 —— 「全部」模式（不选具体词书）真正的池子大小 */
export const TOTAL_UNIQUE_WORDS = 21736;

/** @deprecated 语义含糊（既不是词条数也不是唯一词数），改用 TOTAL_ENTRIES / TOTAL_UNIQUE_WORDS */
export const TOTAL_WORDS = TOTAL_ENTRIES;

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
