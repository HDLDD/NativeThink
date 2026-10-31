/**
 * 背单词模式大厅 — 9 个模式的分组与状态行（纯逻辑，页面与守卫共用）。
 *
 * 首页不再是一排只有说明的入口：每个模式尽量给一行真实状态
 * （到期 / 断点 / 待重考 / 已记 / 最好成绩），没有状态就退回模式说明，
 * 不拿 0 冒充状态，也不为了取状态去加载整本词库。
 */

export type VocabModeKey =
  | 'daily'
  | 'quickcard'
  | 'flashcard'
  | 'phrasecard'
  | 'c2e'
  | 'correction'
  | 'browse'
  | 'collocations'
  | 'vocabtest';

export type VocabModeGroupKey = 'main' | 'review' | 'output' | 'tool';

export interface IVocabModeMeta {
  key: VocabModeKey;
  label: string;
  desc: string;
  group: VocabModeGroupKey;
  color: string;
}

export interface IVocabModeGroup {
  key: VocabModeGroupKey;
  label: string;
  desc: string;
}

export interface IModeResume {
  index: number;
  total: number;
}

export interface IVocabHallInput {
  todayLearned: number;
  dailyQuota: number;
  dueCurrent: number;
  dueGlobal: number;
  dailyResume: IModeResume | null;
  quickcardResume: IModeResume | null;
  quickcardPending: number;
  flashcardResume: IModeResume | null;
  phraseResume: IModeResume | null;
  phraseBankLabel: string;
  c2eResume: IModeResume | null;
  correctionPending: number;
  correctionTotal: number;
  browseMemorized: number;
  vocabTestBest: number | null;
}

export type VocabStatusTone = 'due' | 'resume' | 'pending' | 'neutral';

export interface IVocabModeDisplay extends IVocabModeMeta {
  /** null = 没有真实状态，界面退回 desc */
  status: string | null;
  badge: string | null;
  tone: VocabStatusTone;
  resumable: boolean;
}

export interface IVocabHallGroup extends IVocabModeGroup {
  items: IVocabModeDisplay[];
}

export interface IVocabHall {
  daily: IVocabModeDisplay;
  /** 给首页 hero 画进度条；不把 quota/learned 塞进 display 的状态文案里 */
  dailyProgress: { learned: number; quota: number };
  groups: IVocabHallGroup[];
}

export const VOCAB_MODE_GROUPS: IVocabModeGroup[] = [
  { key: 'main', label: '主线', desc: '每天推进新词' },
  { key: 'review', label: '复习与巩固', desc: '把学过的词拿回来' },
  { key: 'output', label: '主动输出', desc: '从中文或错句出发，把词用出来' },
  { key: 'tool', label: '工具', desc: '浏览、搭配与词汇量' },
];

export const VOCAB_MODES: IVocabModeMeta[] = [
  { key: 'daily', label: '每日学习', desc: '按计划每天学新词', group: 'main', color: 'var(--brand)' },
  { key: 'quickcard', label: '快速闪卡', desc: '只单词 · 认识/不认识', group: 'review', color: '#0EA5E9' },
  { key: 'flashcard', label: '复习检测', desc: 'SM-2 间隔记忆复习', group: 'review', color: '#6C5CE7' },
  { key: 'phrasecard', label: '短语闪卡', desc: '九个考试短语库 · SM-2 闪卡', group: 'review', color: '#14B8A6' },
  { key: 'c2e', label: '中译英', desc: '看中文拼/选英文 · 主动提取', group: 'output', color: '#0EA5E9' },
    { key: 'correction', label: '纠偏重考', desc: 'AI 判过的中式表达 · 四选一重考', group: 'output', color: '#F97316' },
  { key: 'browse', label: '词库浏览', desc: '自由浏览全部词汇', group: 'tool', color: '#64748B' },
  { key: 'collocations', label: '搭配学习', desc: '常用搭配与短语', group: 'tool', color: '#F59E0B' },
  { key: 'vocabtest', label: '词汇量测试', desc: '1分钟估算词汇量', group: 'tool', color: '#EC4899' },
];

/** 千分位固定 en-US，守卫读数不随运行环境漂移 */
export function formatHallCount(n: number): string {
  return Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)).toLocaleString('en-US');
}

function cleanResume(r: IModeResume | null | undefined): IModeResume | null {
  if (!r) return null;
  const total = Math.floor(Number(r.total));
  const index = Math.floor(Number(r.index));
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(index) || index < 0 || index >= total) return null;
  return { index, total };
}

/** 断点只接受 0..total-1 的下标；坏数据当没有断点，页面仍可正常进入 */
export function parseOrderedSession(raw: string | null): IModeResume | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { order?: unknown; index?: unknown };
    if (!Array.isArray(p?.order) || p.order.length === 0) return null;
    return cleanResume({ index: Number(p.index), total: p.order.length });
  } catch {
    return null;
  }
}

/** 每日学习的断点字段是 words + index（与其它模式的 order 不同） */
export function parseDailySession(raw: string | null): IModeResume | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { words?: unknown; index?: unknown };
    if (!Array.isArray(p?.words) || p.words.length === 0) return null;
    return cleanResume({ index: Number(p.index), total: p.words.length });
  } catch {
    return null;
  }
}

export function parseVocabTestBest(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { estimate?: unknown };
    const n = Number(p?.estimate);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

function statusOf(key: VocabModeKey, input: IVocabHallInput): Pick<IVocabModeDisplay, 'status' | 'badge' | 'tone' | 'resumable'> {
  const dailyResume = cleanResume(input.dailyResume);
  const quickResume = cleanResume(input.quickcardResume);
  const flashResume = cleanResume(input.flashcardResume);
  const phraseResume = cleanResume(input.phraseResume);
  const c2eResume = cleanResume(input.c2eResume);
  const dueCurrent = Math.max(0, Math.floor(input.dueCurrent));
  const dueGlobal = Math.max(0, Math.floor(input.dueGlobal));

  switch (key) {
    case 'daily': {
      const learned = Math.max(0, Math.floor(input.todayLearned));
      const quota = Math.max(0, Math.floor(input.dailyQuota));
      const remaining = quota > 0 ? Math.max(0, quota - learned) : 0;
      const base = quota > 0
        ? `今日已学 ${learned}/${quota} 词${remaining > 0 ? ` · 还可新学 ${remaining}` : ' · 今日目标已完成'}`
        : `今日已学 ${learned} 词`;
      // hero 的状态行在 393px + 120% 字号下只够放今日进度；断点位置放进角标，
      // 不另起一行把「张」挤到第二行。
      return {
        status: base,
        badge: dailyResume ? `继续 ${dailyResume.index + 1}/${dailyResume.total}` : quota > 0 && learned >= quota ? '今日完成' : null,
        tone: dailyResume ? 'resume' : 'neutral',
        resumable: !!dailyResume,
      };
    }
    case 'flashcard':
      // 到期优先：有到期时先看今天该复习多少，断点只是进入后的续学位置
      if (dueCurrent > 0) {
        return { status: `当前书 ${dueCurrent} 个到期`, badge: '到期', tone: 'due', resumable: false };
      }
      if (flashResume) {
        return { status: `可续学 第 ${flashResume.index + 1}/${flashResume.total} 张`, badge: '继续', tone: 'resume', resumable: true };
      }
      if (dueGlobal > 0) {
        return { status: `其他词书 ${dueGlobal} 个到期`, badge: '到期', tone: 'due', resumable: false };
      }
      return { status: '当前书暂无到期', badge: null, tone: 'neutral', resumable: false };
    case 'quickcard':
      if (quickResume) {
        return { status: `可续学 第 ${quickResume.index + 1}/${quickResume.total} 张`, badge: '继续', tone: 'resume', resumable: true };
      }
      if (input.quickcardPending > 0) {
        return { status: `当前累积 ${Math.floor(input.quickcardPending)} 张`, badge: null, tone: 'neutral', resumable: false };
      }
      return { status: null, badge: null, tone: 'neutral', resumable: false };
    case 'phrasecard':
      if (phraseResume) {
        return {
          status: `可续学 第 ${phraseResume.index + 1}/${phraseResume.total} 张 · ${input.phraseBankLabel}`,
          badge: '继续',
          tone: 'resume',
          resumable: true,
        };
      }
      return { status: null, badge: null, tone: 'neutral', resumable: false };
    case 'c2e':
      if (c2eResume) {
        return { status: `可续学 第 ${c2eResume.index + 1}/${c2eResume.total} 题`, badge: '继续', tone: 'resume', resumable: true };
      }
      return { status: null, badge: null, tone: 'neutral', resumable: false };
    case 'correction': {
      const pending = Math.max(0, Math.floor(input.correctionPending));
      const total = Math.max(0, Math.floor(input.correctionTotal));
      if (pending > 0) {
        // 纠偏重考模式会把"考过的"也再端上来（没考过的排最前）—— 只报未考过的数量
        // 会让人以为只有 1 题；总数大于未考数时把总数一起说清楚。
        const suffix = total > pending ? ` · 共 ${total} 条` : '';
        return { status: `待重考 ${pending} 条${suffix}`, badge: '待重考', tone: 'pending', resumable: false };
      }
      if (total > 0) {
        return { status: `已重考完 ${total} 条`, badge: null, tone: 'neutral', resumable: false };
      }
      return { status: '纠偏本还没有内容', badge: null, tone: 'neutral', resumable: false };
    }
    case 'browse': {
      const memorized = Math.max(0, Math.floor(input.browseMemorized));
      return memorized > 0
        ? { status: `已记 ${memorized} 词`, badge: null, tone: 'neutral', resumable: false }
        : { status: null, badge: null, tone: 'neutral', resumable: false };
    }
    case 'vocabtest': {
      const best = input.vocabTestBest;
      return typeof best === 'number' && Number.isFinite(best) && best > 0
        ? { status: `最好成绩约 ${formatHallCount(best)} 词`, badge: null, tone: 'neutral', resumable: false }
        : { status: null, badge: null, tone: 'neutral', resumable: false };
    }
    case 'collocations':
    default:
      return { status: null, badge: null, tone: 'neutral', resumable: false };
  }
}

function displayOf(meta: IVocabModeMeta, input: IVocabHallInput): IVocabModeDisplay {
  return { ...meta, ...statusOf(meta.key, input) };
}

/**
 * 大厅只消费调用方已经读好的状态。
 * 关键约束：这里**不做任何词库加载**（不 queryWords / preloadLevels / loadPhrases），
 * 否则首页会为了一个角标把整本书拉进来。
 */
export function buildVocabModeHall(input: IVocabHallInput): IVocabHall {
  const dailyMeta = VOCAB_MODES.find((m) => m.key === 'daily');
  if (!dailyMeta) throw new Error('VOCAB_MODES 缺少 daily');
  const groups = VOCAB_MODE_GROUPS
    .filter((g) => g.key !== 'main')
    .map((g) => ({
      ...g,
      items: VOCAB_MODES.filter((m) => m.group === g.key).map((m) => displayOf(m, input)),
    }));
  return {
    daily: displayOf(dailyMeta, input),
    dailyProgress: {
      learned: Math.max(0, Math.floor(input.todayLearned)),
      quota: Math.max(0, Math.floor(input.dailyQuota)),
    },
    groups,
  };
}