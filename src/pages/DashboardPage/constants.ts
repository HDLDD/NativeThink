import {
  Brain,
  Target,
  Puzzle,
  MessageSquare,
  Mic,
  BookOpen,
  PenLine,
  BookMarked,
  SpellCheck,
  MessagesSquare,
  GraduationCap,
} from 'lucide-react';

export const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export const QUICK_ENTRIES = [
  {
    path: '/sentences',
    label: '句子学习',
    icon: MessagesSquare,
    color: 'from-[#F59E0B] to-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    desc: '拆句 · 句型 · 造句',
  },
  {
    path: '/vocabulary',
    label: '词汇深度',
    icon: BookOpen,
    color: 'from-[#EC4899] to-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-500/15',
    desc: '每日学习 · 快速闪卡',
  },
  {
    path: '/articles',
    label: '文章阅读',
    icon: BookMarked,
    color: 'from-[#0EA5E9] to-cyan-400',
    bg: 'bg-sky-50 dark:bg-sky-500/15',
    desc: '原著 · 对照翻译',
  },
  {
    path: '/think',
    label: '母语思维训练',
    icon: Brain,
    color: 'from-[#00B894] to-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    desc: '摆脱中式英语',
  },
  {
    path: '/conversation',
    label: 'AI 对话练习',
    icon: MessageSquare,
    color: 'from-[#6366F1] to-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
    desc: '角色扮演对话',
  },
  {
    path: '/spelling',
    label: '句子拼写',
    icon: SpellCheck,
    color: 'from-amber-500 to-orange-400',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    desc: '句子/单词拼写',
  },
  {
    path: '/shadowing',
    label: '影子跟读',
    icon: Mic,
    color: 'from-[#F97316] to-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-500/15',
    desc: '训练语音语调',
  },
  {
    path: '/chunks',
    label: '语块训练',
    icon: Puzzle,
    color: 'from-[#1F2937] to-gray-600',
    bg: 'bg-gray-50 dark:bg-gray-800',
    desc: '积累地道表达',
  },
  {
    path: '/writing',
    label: 'AI 写作练习',
    icon: PenLine,
    color: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-50 dark:bg-violet-500/15',
    desc: 'AI 批改提升写作',
  },
  {
    path: '/cet',
    label: '四六级备考',
    icon: GraduationCap,
    color: 'from-teal-500 to-cyan-500',
    bg: 'bg-teal-50 dark:bg-teal-500/15',
    desc: '模考 · 听力 · 错题本',
  },
];

/** 后续要开发的模块（首页占位展示，暂不可点） */
export const COMING_SOON: { label: string; icon: typeof MessagesSquare; desc: string; color: string }[] = [];

export const MODULES = [
  { key: 'sentences', label: '句子学习', icon: MessagesSquare, color: '#F59E0B' },
  { key: 'vocabulary', label: '词汇深度', icon: BookOpen, color: '#EC4899' },
  { key: 'articles', label: '文章阅读', icon: BookMarked, color: '#0EA5E9' },
  { key: 'spelling', label: '句子拼写', icon: SpellCheck, color: '#F59E0B' },
  { key: 'think', label: '思维训练', icon: Brain, color: '#00B894' },
  { key: 'chunks', label: '语块训练', icon: Puzzle, color: '#1F2937' },
  { key: 'conversation', label: '对话练习', icon: MessageSquare, color: '#6366F1' },
  { key: 'shadowing', label: '影子跟读', icon: Mic, color: '#F97316' },
  { key: 'writing', label: '写作练习', icon: PenLine, color: '#8B5CF6' },
  { key: 'cet', label: '四六级备考', icon: GraduationCap, color: '#14B8A6' },
] as const;

export const LEARNING_OPTIONS = [
  { path: '/think', label: '母语思维训练', icon: Brain, color: 'from-[#00B894] to-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15', desc: '摆脱中式英语，建立英语思维' },
  { path: '/chunks', label: '语块训练', icon: Puzzle, color: 'from-[#1F2937] to-gray-600', bg: 'bg-gray-50 dark:bg-gray-800', desc: '积累高频母语语块' },
  { path: '/conversation', label: 'AI 对话练习', icon: MessageSquare, color: 'from-[#6366F1] to-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/15', desc: '角色扮演自由对话' },
  { path: '/shadowing', label: '影子跟读', icon: Mic, color: 'from-[#F97316] to-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/15', desc: '训练语音语调' },
  { path: '/vocabulary', label: '每日背单词', icon: Target, color: 'from-amber-500 to-orange-500', bg: 'bg-amber-50 dark:bg-amber-500/15', desc: '间隔重复科学记忆' },
  { path: '/writing', label: 'AI 写作练习', icon: PenLine, color: 'from-violet-500 to-purple-500', bg: 'bg-violet-50 dark:bg-violet-500/15', desc: 'AI 批改提升写作' },
];
