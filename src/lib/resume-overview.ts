/**
 * 首页「继续上次学习」的真实断点（纯逻辑，页面与守卫共用）。
 *
 * 这条横幅此前只说得出**模块名**（`__nativethink_last_visit` 里只有路由 + 时间戳），
 * 点进去还要自己找回上次那本书、那个模式。各模块其实早就把自己的会话断点落盘了
 * （背单词五个模式、拼写、三稿会话、语块复习），这里把它们汇成一句人话：
 *   复习检测 · 四级 · 第 12/20 张
 *
 * 三条口径：
 *  ① **只读不写**，解析一律复用各模块自己的读盘函数（`parseOrderedSession` /
 *     `parseDailySession` / `loadPatternResume`）—— 不在这里另立一套校验，
 *     否则首页显示的位置会和真正续学的位置漂移。
 *  ② 读不到断点就返回 `detail: null`，界面退回只写模块名；**不拿 0 或「上次」充数**。
 *  ③ 标签表由调用方注入（`labels`），本模块因此零数据依赖，守卫可以直接真跑。
 */
import { parseDailySession, parseOrderedSession, VOCAB_MODES } from '@/lib/vocab-mode-hall';
import { RESUME_LAST_KEY, resumeKeyFor } from '@/lib/spelling-resume';
import { loadPatternResume, resumeStepLabel } from '@/lib/think-session-resume';

/** 词汇页自己的页面记忆（`usePageMemory('vocab-page')`）：level + 当前模式 */
export const VOCAB_MEMORY_KEY = 'vocab-page';
export const PHRASE_BANK_KEY = 'phrase-card-bank';
export const PHRASE_SESSION_PREFIX = '__nativethink_phrase_session_';
export const CHUNK_REVIEW_SESSION_KEY = '__nativethink_chunk_review_session';

export interface IResumeStore {
  getItem(key: string): string | null;
}

export interface IResumeLabels {
  /** 词书 key → 中文名（四级 / 六级 …） */
  level: Record<string, string>;
  /** 拼写题池 key → 中文名（纠偏表达 / 视频精听两个桶不在词书表里） */
  spellingPool: Record<string, string>;
}

export interface IResumeSpot {
  /** 点击目标：能定位到模式就带 ?tab= 深链，省一次点击 */
  href: string;
  /** 断点位置；null = 没有可读的断点，界面只写模块名 */
  detail: string | null;
}

/** 有独立会话断点的词汇模式 → 单位量词 */
const VOCAB_UNITS: Record<string, string> = {
  daily: '张',
  quickcard: '张',
  flashcard: '张',
  phrasecard: '张',
  c2e: '题',
};

function vocabSessionKey(mode: string, level: string): string | null {
  switch (mode) {
    case 'daily': return `__nativethink_daily_session_${level}`;
    case 'quickcard': return `__nativethink_quickcard_session_${level || 'all'}`;
    case 'flashcard': return `__nativethink_vocab_session_${level}`;
    case 'c2e': return `__nativethink_vocab_c2e_session_${level}`;
    default: return null;
  }
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** 题库记忆是**裸字符串** JSON（`"cet4"`），不是对象 */
function parseJsonString(raw: string | null): string {
  if (!raw) return '';
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function positionText(index: number, total: number, unit: string): string {
  return `第 ${index + 1}/${total} ${unit}`;
}

function vocabSpot(store: IResumeStore, labels: IResumeLabels): IResumeSpot {
  const plain = { href: '/vocabulary', detail: null } as const;
  const memory = parseJson(store.getItem(VOCAB_MEMORY_KEY));
  if (!memory) return plain;
  const level = typeof memory.level === 'string' ? memory.level : '';
  const mode = typeof memory.tab === 'string' ? memory.tab : '';
  const unit = VOCAB_UNITS[mode];
  if (!unit) return plain;
  const modeLabel = VOCAB_MODES.find((m) => m.key === mode)?.label ?? mode;

  if (mode === 'phrasecard') {
    // 短语闪卡的题库是独立记忆；没有它就无法确定是哪一本 —— 宁可不写位置。
    const bank = parseJsonString(store.getItem(PHRASE_BANK_KEY));
    if (!bank) return { href: '/vocabulary?tab=phrasecard', detail: null };
    const resume = parseOrderedSession(store.getItem(`${PHRASE_SESSION_PREFIX}${bank}`));
    return {
      href: '/vocabulary?tab=phrasecard',
      detail: resume ? `短语闪卡 · ${positionText(resume.index, resume.total, '张')}` : null,
    };
  }

  const key = vocabSessionKey(mode, level);
  if (!key) return plain;
  const resume = (mode === 'daily' ? parseDailySession : parseOrderedSession)(store.getItem(key));
  if (!resume) return { href: `/vocabulary?tab=${mode}`, detail: null };
  const levelLabel = labels.level[level];
  return {
    href: `/vocabulary?tab=${mode}`,
    detail: `${modeLabel}${levelLabel ? ` · ${levelLabel}` : ''} · ${positionText(resume.index, resume.total, unit)}`,
  };
}

function spellingSpot(store: IResumeStore, labels: IResumeLabels): IResumeSpot {
  const plain = { href: '/spelling', detail: null } as const;
  let level: string | null = null;
  try {
    level = store.getItem(RESUME_LAST_KEY) || null;
  } catch {
    return plain;
  }
  if (!level) return plain;
  const saved = parseJson(store.getItem(resumeKeyFor(level)));
  const index = Number(saved?.currentIndex);
  if (!Number.isFinite(index) || index < 0) return plain;
  const queue = Array.isArray(saved?.queue)
    ? (saved!.queue as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const poolLabel = labels.spellingPool[level] ?? labels.level[level] ?? level;
  // 老断点没有 queue（只存了下标）：只报「第 N 句」，不编一个总数出来。
  return {
    href: '/spelling',
    detail: `${poolLabel} · ${queue.length ? positionText(index, queue.length, '句') : `第 ${index + 1} 句`}`,
  };
}

function chunkSpot(store: IResumeStore): IResumeSpot {
  const plain = { href: '/chunks', detail: null } as const;
  const saved = parseJson(store.getItem(CHUNK_REVIEW_SESSION_KEY));
  const ids = Array.isArray(saved?.ids)
    ? (saved!.ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const index = Number(saved?.index);
  if (!ids.length || !Number.isFinite(index) || index < 0 || index >= ids.length) return plain;
  return { href: '/chunks', detail: `语块复习 · ${positionText(index, ids.length, '个')}` };
}

function thinkSpot(): IResumeSpot {
  const snapshot = loadPatternResume();
  return { href: '/think', detail: snapshot ? resumeStepLabel(snapshot) : null };
}

/**
 * 该路由有没有可读的真实断点。
 * 返回 null 表示这个模块没有断点概念（首页保持原样，只写模块名）。
 */
export function findResumeSpot(
  route: string,
  store: IResumeStore,
  labels: IResumeLabels,
): IResumeSpot | null {
  switch (route) {
    case '/vocabulary': return vocabSpot(store, labels);
    case '/spelling': return spellingSpot(store, labels);
    case '/chunks': return chunkSpot(store);
    case '/think': return thinkSpot();
    default: return null;
  }
}
