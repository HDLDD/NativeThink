import {
  HelpCircle, Brain, Puzzle, MessageSquare, Mic, BookOpen, BarChart3, PenLine,
  Sparkles, Lightbulb, Target, ChevronRight, ExternalLink, Zap, Key,
  CheckCircle2, RotateCw, Link2, Shuffle, Edit3, Headphones, Coffee,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { safeStorage } from '@/lib/safe-storage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ============================================================
// First-visit detection
// ============================================================
const SEEN_KEY = '__nativethink_help_guide_seen';

export function hasSeenHelpGuide(): boolean {
  try { return safeStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() { safeStorage.setItem(SEEN_KEY, '1'); }

// ============================================================
// Module definitions
// ============================================================
interface ModuleGuide {
  id: string;
  icon: typeof Brain;
  title: string;
  route: string;
  color: string;
  intro: string;
  features: { label: string; desc: string }[];
  tips: string[];
}

const MODULES: ModuleGuide[] = [
  {
    id: 'vocabulary',
    icon: BookOpen,
    title: '词汇深度',
    route: '/vocabulary',
    color: '#00B894',
    intro: '一站式词汇学习系统，集成学习、复习、浏览、搭配四大模块，配合 SM-2 间隔记忆算法科学掌握词汇。覆盖四级/六级/雅思/托福/高阶五个等级词库。',
    features: [
      { label: '学习模式', desc: '每日推送新词 + 到期待复习的旧词。六种学习方式：闪卡翻面、选择题、拼写、听写、配对、填空。设置每日目标（10~500 词），SM-2 自动安排复习间隔。' },
      { label: '复习模式', desc: '闪卡复习已学单词，优先展示到期待复习的词。支持"百词斩朗读"自动播放（念单词→翻面→念例句→暂停→下一张）、1x/1.25x 调速。选"全部"可跨词库聚合复习。' },
      { label: '词库浏览', desc: '按等级、词性、语域、情感色彩、词频、有无中文对应概念等多维筛选。A-Z 字母索引导航，自动朗读模式，AI 生成例句和深度解析。' },
      { label: '搭配学习', desc: '左列分页浏览搭配短语，右列查看详情。按等级分区，内置 ~230 条预翻译，点击"翻译"AI 即时翻译并缓存。AI 深度解析搭配用法。' },
    ],
    tips: [
      '先在学习模式学新词，再到复习模式巩固 — 两个模块共享 SM-2 进度',
      '"全部"模式下复习可跨词库聚合所有已学单词',
      '搭配学习选中词库后才加载数据，避免一次性计算全部等级',
      '点击"认识/不认识"会更新 SM-2 间隔，影响下次复习时间',
    ],
  },
  {
    id: 'chunks',
    icon: Puzzle,
    title: '语块训练',
    route: '/chunks',
    color: '#6366F1',
    intro: '积累高频母语语块而非孤立背单词。按场景分类浏览地道表达，通过替换练习和接龙游戏巩固记忆。支持 AI 生成语块例句和翻译。',
    features: [
      { label: '语块库', desc: '按场景/主题分类浏览地道英语语块（chunks），每个语块配有释义、例句和来源。支持搜索、收藏。' },
      { label: '替换练习', desc: '将生硬的中式表达替换为地道语块，AI 实时反馈替换效果。' },
      { label: '接龙游戏', desc: '用包含指定语块的句子接龙，答对越多分越高，游戏化巩固记忆。' },
      { label: '每日学习', desc: 'SM-2 间隔记忆驱动，每日推送待复习语块，设置每日目标数量。' },
    ],
    tips: [
      '收藏常用语块，在学习记录的收藏本中统一复习',
      '接龙游戏适合碎片时间，挑战自己的最高分',
      '每天浏览一个场景分类，积少成多',
    ],
  },
  {
    id: 'think',
    icon: Brain,
    title: '母语思维训练',
    route: '/think',
    color: '#F59E0B',
    intro: '通过中式英语检测、思维转译、反翻译训练三种方式帮你摆脱中式英语，建立母语思维。AI 分析你的表达，指出中英文思维差异，给出地道替代说法。',
    features: [
      { label: '中式英语检测', desc: '输入英文句子，AI 检测是否有中式英语痕迹，逐句分析并给出地道替代表达。' },
      { label: '思维转译', desc: '看到中文场景描述，用英语直接描述画面（不要逐字翻译），培养英语思维。' },
      { label: '反翻译训练', desc: '根据关键词和语境提示，扩展成完整的情境句子，对比 AI 参考表达。' },
    ],
    tips: [
      '点击示例句子快速填充，试试看效果',
      '提交前先闭上眼睛，用英语在脑中过一遍画面',
      '查看"母语者参考表达"对比差异，理解地道的表达方式',
    ],
  },
  {
    id: 'conversation',
    icon: MessageSquare,
    title: 'AI 对话练习',
    route: '/conversation',
    color: '#EC4899',
    intro: '选择真实场景（咖啡店/面试/聊天/辩论/购物等），与 AI 进行多轮角色扮演对话。对话完成后生成地道度分析报告，从词汇、语法、自然度给出改进建议。',
    features: [
      { label: '场景选择', desc: '预设多种真实场景（点单/面试/闲聊/辩论/购物/就医），也可自定义场景。' },
      { label: '多轮对话', desc: 'AI 扮演对应角色，进行自然的多轮对话。对话历史自动保存，可随时回来继续。' },
      { label: '地道度分析', desc: '完成对话后点击"地道度分析"，AI 从词汇选择、语法准确度、表达自然度三个维度评估并给出改进建议。' },
    ],
    tips: [
      '至少完成 2-3 轮对话后再分析，越充分报告越详细',
      '试着用刚学的语块和表达，学以致用',
      '对话历史自动保存，可以回来继续未完成的对话',
    ],
  },
  {
    id: 'shadowing',
    icon: Mic,
    title: '影子跟读',
    route: '/shadowing',
    color: '#F97316',
    intro: '逐句跟读精选母语语料，文本标注连读、弱读等语音现象。支持调速（0.75x/1x/1.25x）、循环播放、单句重复，训练纯正语音语调。',
    features: [
      { label: '语料库', desc: '精选多主题英语语料，按难度/类型筛选，文本标注语音现象（连读/弱读/省音）。' },
      { label: '逐句跟读', desc: '播放原音→跟读模仿，可调速、单句循环，聚焦难点句子反复练习。' },
      { label: 'AI 生成语料', desc: '根据自定义主题 AI 生成跟读材料，扩展练习内容。' },
    ],
    tips: [
      '先用 0.75x 速度跟读，熟练后再用原速',
      '关注标注的语音现象，它们是地道口音的关键',
      '每天 10 分钟比每周 2 小时效果更好',
    ],
  },
  {
    id: 'writing',
    icon: PenLine,
    title: 'AI 写作练习',
    route: '/writing',
    color: '#8B5CF6',
    intro: '自由命题写作，AI 帮你修正语法错误并给出地道润色建议。适合练习邮件、日记、议论文、读后感等各类写作场景。',
    features: [
      { label: '自由写作', desc: '输入或选择主题，开始自由写作。支持自定义写作提示（prompt）。' },
      { label: 'AI 润色', desc: '提交后 AI 逐句检查语法错误，给出润色版本和修改说明。' },
      { label: '对比学习', desc: '并排对比原始版本和润色版本，理解每处修改的原因，积累地道表达。' },
    ],
    tips: [
      '先不看润色自己写，写完再对照学习效果更好',
      '写作主题可以自定义 — 日记、邮件、读后感都可以',
      '收藏润色后的地道表达，下次写作时参考',
    ],
  },
  {
    id: 'progress',
    icon: BarChart3,
    title: '学习记录',
    route: '/progress',
    color: '#0EA5E9',
    intro: '追踪你的学习进度：日历热力图展示每日打卡、各模块学习时长统计、收藏本管理、学习成就徽章。',
    features: [
      { label: '日历打卡', desc: '热力图展示最近 30 天学习情况，有学习的日期高亮显示，一目了然。' },
      { label: '学习统计', desc: '各模块学习时长柱状图，今日/本周/总计分类统计。设置每日学习目标并追踪完成度。' },
      { label: '收藏本', desc: '管理所有收藏的语块、表达、词汇和搭配短语，按类型筛选浏览。' },
      { label: '成就徽章', desc: '连续打卡 3/7/14/30 天解锁对应成就，激励持续学习。' },
    ],
    tips: [
      '每天保持学习会点亮连续天数 streak 🔥',
      '收藏的内容可以按类型筛选（语块/表达/词汇/搭配）',
      '连续打卡解锁成就，看看你能收集多少 🏆',
    ],
  },
];

// ============================================================
// FAQ
// ============================================================
const FAQS = [
  {
    q: '如何使用 AI 功能？',
    a: '点击右上角齿轮图标 ⚙️ → 选择 AI 服务商（推荐 DeepSeek）→ 输入 API Key 保存。DeepSeek 注册送 500 万 token 免费额度。Key 只存在你的浏览器里，不会上传到任何服务器。',
  },
  { q: 'AI 功能需要付费吗？', a: '应用本身完全免费。AI 功能需要你提供 API Key（向服务商注册获取）。推荐 DeepSeek（注册送 500 万 token）或 Groq（免费额度）。其他支持：通义千问、智谱 GLM、硅基流动。' },
  { q: '我的学习数据存在哪里？', a: '所有数据（学习记录、收藏、进度）都存在你的浏览器本地存储中，不会上传到任何服务器。注意：清除浏览器缓存会丢失数据。' },
  {
    q: '各模块的学习顺序？', a: '建议每日 30 分钟：① 母语思维训练热身（5 分钟）→ ② 词汇深度学习新词（5 分钟）→ ③ 语块训练学 2-3 个表达（5 分钟）→ ④ AI 对话练习口语（10 分钟）→ ⑤ 影子跟读/写作轮流（5 分钟）。但最重要的不是顺序，而是每天坚持。',
  },
  { q: 'SM-2 间隔记忆是什么？', a: 'SM-2 是一种科学的间隔重复算法。你每次对单词评分（完全忘了→完全掌握），算法自动计算下次复习的最佳时间。掌握得越好，复习间隔越长（1天→3天→7天→…），效率远高于随机复习。' },
  { q: '"全部"模式和单个词库有什么区别？', a: '选单个词库（如"四级"）时，学习和复习仅限于该等级的单词。选"全部"时，系统聚合所有五个等级的进度，可以跨词库复习所有学过的单词。' },
];

// ============================================================
// Getting Started
// ============================================================
const GETTING_STARTED = [
  {
    num: 1, color: '#00B894', title: '配置 AI 服务',
    desc: '点击右上角 ⚙️ → 选择服务商 → 输入 API Key。推荐 DeepSeek（注册送 500 万 token）或 Groq（免费额度）。',
    links: [
      { name: 'DeepSeek（推荐）', url: 'https://platform.deepseek.com' },
      { name: 'Groq（免费）', url: 'https://console.groq.com' },
      { name: '通义千问', url: 'https://dashscope.console.aliyun.com' },
      { name: '智谱 GLM', url: 'https://open.bigmodel.cn' },
    ],
  },
  {
    num: 2, color: '#6366F1', title: '设置每日目标',
    desc: '点击右上角 🎯 → 选择每日学习时长。建议从 20-30 分钟开始。首页仪表盘会显示每日进度和连续学习天数。',
  },
  {
    num: 3, color: '#F97316', title: '开始每日学习（推荐流程）',
    desc: '',
    routine: [
      { time: '5 min', module: '母语思维训练', desc: '检测一句中式英语，看 AI 分析' },
      { time: '5 min', module: '词汇深度', desc: '学习新词 + 到期待复习的词' },
      { time: '5 min', module: '语块训练', desc: '浏览 2-3 个新语块，做替换练习' },
      { time: '10 min', module: 'AI 对话练习', desc: '选一个场景和 AI 聊 3-5 轮' },
      { time: '5 min', module: '轮流练习', desc: '影子跟读 / 搭配学习 / AI 写作 三选一' },
    ],
  },
  {
    num: 4, color: '#EC4899', title: '坚持打卡 & 解锁成就',
    desc: '每天学习自动打卡 📅。在"学习记录"查看热力图和统计。连续打卡 3/7/14/30 天解锁成就 🏆。',
  },
];

// ============================================================
// Component
// ============================================================
const HELP_TAB_KEY = '__nativethink_help_tab';

export default function HelpGuide({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = safeStorage.getItem(HELP_TAB_KEY);
      return saved && ['modules', 'getting-started', 'faq'].includes(saved) ? saved : 'modules';
    } catch { return 'modules'; }
  });

  // Auto-show for new users
  useEffect(() => {
    if (defaultOpen === undefined && !hasSeenHelpGuide()) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, [defaultOpen]);

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) markSeen();
  };

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    try { safeStorage.setItem(HELP_TAB_KEY, val); } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="使用帮助"
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-[#00B894] transition-colors"
        >
          <HelpCircle className="size-4.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[85vh] rounded-[32px] p-0 overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-500/10 dark:via-teal-500/10 dark:to-cyan-500/10">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic text-foreground flex items-center gap-2.5">
              <div className="size-10 rounded-2xl bg-[#00B894]/15 text-[#00B894] flex items-center justify-center">
                <Sparkles className="size-5.5" />
              </div>
              使用指南
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground font-medium mt-3 ml-12">
            了解全部功能，快速上手 NativeThink
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <div className="px-6 pt-4">
            <TabsList className="bg-muted p-1.5 rounded-3xl h-auto w-full">
              <TabsTrigger value="modules" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm flex-1">
                <Zap className="size-3.5 mr-1.5" />功能介绍
              </TabsTrigger>
              <TabsTrigger value="getting-started" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm flex-1">
                <Target className="size-3.5 mr-1.5" />快速上手
              </TabsTrigger>
              <TabsTrigger value="faq" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm flex-1">
                <HelpCircle className="size-3.5 mr-1.5" />常见问题
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ===== Modules Tab ===== */}
          <TabsContent value="modules">
            <div className="px-6 pb-6">
              <div className="space-y-4 pt-2">
                {MODULES.map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <Card key={mod.id} className="rounded-[28px] border-border shadow-sm overflow-hidden hover:shadow-md transition-all">
                      <div className="p-6" style={{ background: `linear-gradient(135deg, ${mod.color}08, ${mod.color}04)` }}>
                        <div className="flex items-start gap-4 mb-5">
                          <div className="size-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg" style={{ backgroundColor: mod.color }}>
                            <Icon className="size-5.5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg font-black text-foreground">{mod.title}</h3>
                            <p className="text-sm text-muted-foreground font-medium mt-1 leading-relaxed">{mod.intro}</p>
                          </div>
                        </div>

                        {/* Features */}
                        <div className="space-y-2 mb-5">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">核心功能</p>
                          {mod.features.map((f, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 bg-white/70 dark:bg-white/10 rounded-2xl p-3">
                              <span className="size-5 rounded-lg bg-[#00B894]/10 text-[#00B894] flex items-center justify-center shrink-0 mt-0.5">
                                <ChevronRight className="size-3" />
                              </span>
                              <div>
                                <span className="text-sm font-black text-foreground">{f.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">{f.desc}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Tips */}
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
                            <Lightbulb className="size-3 inline mr-1 -mt-0.5" />小技巧
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {mod.tips.map((tip, idx) => (
                              <div key={idx} className="flex items-start gap-2 bg-white/70 dark:bg-white/10 rounded-xl p-2.5">
                                <CheckCircle2 className="size-3.5 text-[#00B894] shrink-0 mt-0.5" />
                                <span className="text-xs text-foreground/80 font-medium leading-relaxed">{tip}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ===== Getting Started Tab ===== */}
          <TabsContent value="getting-started">
            <div className="px-6 pb-6">
              <div className="space-y-5 pt-2">
                {GETTING_STARTED.map((step) => (
                  <Card key={step.num} className="rounded-[28px] border-border shadow-sm overflow-hidden">
                    <div className="p-6" style={{ background: `linear-gradient(135deg, ${step.color}08, ${step.color}03)` }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-2xl text-white flex items-center justify-center text-lg font-black shadow-lg" style={{ backgroundColor: step.color }}>{step.num}</div>
                        <h3 className="text-lg font-black text-foreground">{step.title}</h3>
                      </div>
                      {step.desc && <p className="text-sm text-foreground/80 font-medium leading-relaxed mb-4">{step.desc}</p>}
                      {step.links && (
                        <div className="bg-white/70 dark:bg-white/10 rounded-2xl p-4 mb-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">API Key 获取链接</p>
                          <div className="grid grid-cols-2 gap-2">
                            {step.links.map((l) => (
                              <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#00B894] hover:underline flex items-center gap-1">
                                {l.name}<ExternalLink className="size-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {step.routine && (
                        <div className="space-y-2">
                          {step.routine.map((item) => (
                            <div key={item.module} className="flex items-center gap-3 bg-white/70 dark:bg-white/10 rounded-2xl p-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-[#F97316] bg-orange-100 dark:bg-orange-500/20 px-2.5 py-1 rounded-xl shrink-0">{item.time}</span>
                              <div><span className="text-sm font-black text-foreground">{item.module}</span><span className="text-xs text-muted-foreground ml-2">{item.desc}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ===== FAQ Tab ===== */}
          <TabsContent value="faq">
            <div className="px-6 pb-6">
              <div className="space-y-3 pt-2">
                {FAQS.map((faq, idx) => (
                  <Card key={idx} className="rounded-[24px] border-border shadow-sm overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="size-8 rounded-xl bg-[#00B894]/10 text-[#00B894] flex items-center justify-center shrink-0 mt-0.5">
                          <HelpCircle className="size-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-foreground mb-2">{faq.q}</h4>
                          <p className="text-sm text-muted-foreground font-medium leading-relaxed">{faq.a}</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between sticky bottom-0 bg-background">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">NativeThink — 用母语思维，说地道英语</p>
          <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-[#00B894] hover:underline flex items-center gap-1">
            <Key className="size-3" />获取 API Key<ExternalLink className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
