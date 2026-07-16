/**
 * 句子拼写功能类型定义
 * Sentence Spelling — 听写填空 & 单词填空
 */

/** 句子来源 */
export type SpellingSentenceSource = 'word_example' | 'ai_generated' | 'user_created';

/** 拼写模式 */
export type SpellingMode = 'dictation' | 'fill';

/** 音频播放模式 */
export type SpellingAudioMode = 'sentence' | 'word';

/** 难度等级 */
export type SpellingDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** 拼写句子 */
export interface ISpellingSentence {
  id: string;
  en: string;                    // English sentence
  zh: string;                    // Chinese translation
  source: SpellingSentenceSource;
  sourceWord?: string;           // originating word (if from word example)
  level?: string;                // word bank level (e.g. 'cet4')
  difficulty: SpellingDifficulty;
  batchId?: string;              // for tracking AI-generated batches
  createdAt: number;
}

/** 句子拼写进度 (SM-2) */
export interface ISpellingProgress {
  sentenceId: string;
  status: 'new' | 'learning' | 'reviewing' | 'mastered';
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: number;            // timestamp
  lastReview: number;            // timestamp
  wrongWords: Record<string, number>;  // word -> error count
  totalAttempts: number;
  correctAttempts: number;
  lastMode: SpellingMode;        // last practice mode used
}

/** 拼写学习状态 */
export interface ISpellingLearningState {
  progress: Record<string, ISpellingProgress>;
  todayPracticed: string[];      // sentence IDs practiced today
  lastActiveDate: string;        // YYYY-MM-DD
}

/** 拼写会话 */
export interface ISpellingSession {
  queue: string[];               // ordered sentence IDs to practice
  currentIndex: number;          // current position in queue
  mode: SpellingMode;
  audioMode: SpellingAudioMode;
  mistakes: string[];            // words user got wrong this session
  startedAt: number;
}
