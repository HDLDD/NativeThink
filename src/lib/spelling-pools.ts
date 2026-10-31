/**
 * 句子拼写题池 — 数据表与状态描述（纯逻辑，供页面与守卫共用）。
 *
 * 纠偏表达 / 视频精听 / 11 本词书 / 全部词库共用一套卡片语言：
 * 词数（或句数）、已完成、断点位置。页面只管渲染，判断在这里。
 */
import {
  ALL_LEVELS,
  LEVEL_COLORS,
  LEVEL_LABELS,
  TOTAL_UNIQUE_WORDS,
  WORD_COUNTS,
} from '@/data/wordbank/meta';
import { CORRECTION_LEVEL, VIDEO_LEVEL } from '@/lib/use-spelling-sentences';

export type SpellingPoolGroup = 'special' | 'exam' | 'all';
export type SpellingPoolKind = 'correction' | 'video' | 'wordbook' | 'all';

export interface ISpellingPool {
  key: string;
  label: string;
  desc: string;
  group: SpellingPoolGroup;
  kind: SpellingPoolKind;
  color: string;
  wordCount: number;
}

export interface ISpellingPoolGroup {
  key: SpellingPoolGroup;
  label: string;
  desc: string;
}

export interface ISpellingPoolProgress {
  loaded: boolean;
  total: number;
  completed: number;
  /** 0 基下标；null = 没有断点（不能拿 0 冒充"有断点"） */
  resumeIndex: number | null;
}

export interface ISpellingPoolStatus {
  primary: string;
  secondary: string;
  resumable: boolean;
}

export const SPELLING_POOL_GROUPS: ISpellingPoolGroup[] = [
  { key: 'special', label: '专属题池', desc: '自己的错句与看中的原句，优先练' },
  { key: 'exam', label: '考试词书', desc: '按词书抽例句，随机不重复' },
  { key: 'all', label: '全部词库', desc: '跨书合并，首次加载较慢' },
];

export const SPELLING_POOLS: ISpellingPool[] = [
  {
    key: CORRECTION_LEVEL,
    label: '纠偏表达',
    desc: 'AI 判过的中式表达 · 逐词拼出地道说法',
    group: 'special',
    kind: 'correction',
    color: '#F97316',
    wordCount: 0,
  },
  {
    key: VIDEO_LEVEL,
    label: '视频精听',
    desc: '精听页送来的原句 · 单独成池',
    group: 'special',
    kind: 'video',
    color: '#14B8A6',
    wordCount: 0,
  },
  ...ALL_LEVELS.map((key): ISpellingPool => ({
    key,
    label: LEVEL_LABELS[key] ?? key,
    desc: '词库例句 · 随机抽句',
    group: 'exam',
    kind: 'wordbook',
    color: LEVEL_COLORS[key] ?? '#64748B',
    wordCount: WORD_COUNTS[key] ?? 0,
  })),
  {
    key: 'all',
    label: '全部词库',
    desc: `跨 ${ALL_LEVELS.length} 本合并 · 首次加载较慢`,
    group: 'all',
    kind: 'all',
    color: '#0EA5E9',
    wordCount: TOTAL_UNIQUE_WORDS,
  },
];

/** 千分位固定用 en-US，避免不同运行环境的 locale 让守卫读数漂移 */
export function formatPoolCount(n: number): string {
  return Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)).toLocaleString('en-US');
}

export function filterSpellingPools(pools: ISpellingPool[], query: string): ISpellingPool[] {
  const q = query.trim().toLowerCase();
  if (!q) return pools;
  return pools.filter((p) =>
    `${p.label} ${p.desc} ${p.key}`.toLowerCase().includes(q),
  );
}

/**
 * 一张题池卡只给两行字：
 *  - 已加载：已完成 x/y 句 + 上次位置（或"从头开始"）
 *  - 未加载但有断点：上次第 N 句 + 词数 · 继续这本
 *  - 都没有：词数/还没有句子 + 未开始（或入口指引）
 */
export function describeSpellingPool(
  pool: ISpellingPool,
  progress?: ISpellingPoolProgress,
): ISpellingPoolStatus {
  const resumeIndex = progress?.resumeIndex ?? null;
  const loaded = !!progress?.loaded && (progress?.total ?? 0) > 0;

  if (loaded) {
    const completed = progress?.completed ?? 0;
    return {
      primary: `已完成 ${formatPoolCount(completed)}/${formatPoolCount(progress!.total)} 句`,
      secondary: resumeIndex != null
        ? `上次第 ${resumeIndex + 1} 句`
        : completed > 0
          ? '继续这本'
          : '从头开始',
      resumable: resumeIndex != null,
    };
  }

  if (pool.kind === 'correction' || pool.kind === 'video') {
    if (resumeIndex != null) {
      return { primary: `上次第 ${resumeIndex + 1} 句`, secondary: '继续', resumable: true };
    }
    return {
      primary: '还没有句子',
      secondary: pool.kind === 'correction'
        ? '在收藏页纠偏本点「拼写这句」'
        : '在精听字幕卡点「听写这句」',
      resumable: false,
    };
  }

  if (resumeIndex != null) {
    return {
      primary: `上次第 ${resumeIndex + 1} 句`,
      secondary: `${formatPoolCount(pool.wordCount)} 词 · 继续这本`,
      resumable: true,
    };
  }

  return {
    primary: `${formatPoolCount(pool.wordCount)} 词`,
    secondary: pool.kind === 'all' ? '未开始 · 加载较慢' : '未开始',
    resumable: false,
  };
}