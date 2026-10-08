import {
  HelpCircle, Brain, Puzzle, MessageSquare, Mic, BookOpen, BarChart3, PenLine,
  Sparkles, Lightbulb, Target, ChevronRight, ExternalLink, Zap, Key,
  CheckCircle2, RotateCw, Link2, Shuffle, Edit3, Headphones, Coffee,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
    intro: '一站式词汇学习系统，七大模式：每日学习、快速闪卡、复习检测、短语闪卡、词库浏览、搭配学习、词汇量测试，配合 SM-2 间隔记忆算法科学掌握词汇。九档词库：中考 / 高考 / 四级 / 六级 / 雅思 / 托福 / 考研 / 专业 / 高阶，去重后共 21,736 个可学单词。词书卡上显示的数字就是这本能出多少张卡（书内已按词去重）。',
    features: [
      { label: '每日学习', desc: '每日推送新词 + 到期待复习的旧词。六种学习方式：闪卡、选择题、拼写、听写、配对、填空。每日目标可选快捷档（5~100 词）或自定义，SM-2 自动安排复习间隔。' },
      { label: '快速闪卡', desc: '纯单词自测：认识/不认识快速过卡，答错的词隔几张重新出现。一轮结束出分色词表（可点词朗读），每轮留档可回看、可整组重练或只重练不认识的，退出后自动续上。' },
      { label: '复习检测', desc: '闪卡复习已学单词，优先展示到期待复习的词（到期过多时本轮先取前 30 个）。自动发音：正面念单词、翻面念单词+例句，评分后自动跳下一张。选"全部"可跨词库聚合复习。' },
      { label: '短语闪卡', desc: '把九个考试短语库（中考 / 高考 / 四级 / 六级 / 雅思 / 托福 / 考研 / 专业 / 高阶）搬进词汇页：五档自评、答错隔几张重排、断点续学、不想要的短语可「不再出现」。进度与语块训练页的「短语复习」共用一份。' },
      { label: '词库浏览', desc: '按等级、词性、语域、情感色彩、是否已掌握、有无中文对应概念等筛选，A-Z / 序号 / 乱序三种排序。点击单词即自动朗读，AI 生成例句和深度解析。' },
      { label: '搭配学习', desc: '左列分页浏览搭配短语，右列查看详情。按等级分区，内置近 300 条预翻译，点击"翻译"AI 即时翻译并缓存。AI 深度解析搭配用法。' },
      { label: '词汇量测试', desc: '从当前词书按词频分层抽 12 题，约 1 分钟估算词汇量并给出阶段评级，保留历史最佳成绩。' },
    ],
    tips: [
      '先在「每日学习」学新词，再到「复习检测」巩固 — 两个模式共享 SM-2 进度',
      '"全部"模式下学习与复习可跨词库聚合',
      '快速闪卡答错的词会隔几张重排回来，多过两遍自然记住',
      '点击"认识/不认识"会更新 SM-2 间隔，影响下次复习时间',
    ],
  },
  {
    id: 'chunks',
    icon: Puzzle,
    title: '语块训练',
    route: '/chunks',
    color: '#6366F1',
    intro: '积累高频母语语块而非孤立背单词。六大板块：语块库、替换练习、接龙游戏、短语库、闪卡、短语复习，预置 963 条地道语块，支持 AI 生成语块、替换题和例句。',
    features: [
      { label: '语块库', desc: '按场景/主题与难度筛选浏览地道英语语块（chunks），每个语块配有释义、英文介绍、用法与例句，可搜索、收藏、AI 扩写例句。' },
      { label: '替换练习', desc: '把句子里的生硬表达替换成合适的语块（选择题），答后 AI 讲解为什么对/错。' },
      { label: '接龙游戏', desc: '用给定语块造句，AI 判定 PASS/FAIL 并给出分析，通过越多得分越高，还可以让 AI 出新题。' },
      { label: '短语库', desc: '按字母排列全部语块，A-Z 可跳转、每段默认展开前 6 条，点击短语即朗读。' },
      { label: '闪卡', desc: '短语库的快速过卡：正面只显示短语，翻面看释义与例句，认识 / 模糊 / 不认识三档，可配分类筛选与每轮数量。' },
      { label: '短语复习', desc: 'SM-2 间隔记忆驱动的闪卡复习：今日待复习 + 随机新短语推荐。' },
    ],
    tips: [
      '收藏常用语块，在收藏本中统一复习',
      '接龙游戏适合碎片时间，跟 AI 切磋语块用法',
      '每天浏览一个场景分类，积少成多',
    ],
  },
  {
    id: 'think',
    icon: Brain,
    title: '母语思维训练',
    route: '/think',
    color: '#F59E0B',
    intro: '通过中式英语检测、思维转译、反翻译训练、思维还原四种方式帮你摆脱中式英语，建立母语思维。AI 分析你的表达，指出中英文思维差异，给出地道替代说法。',
    features: [
      { label: '中式英语检测', desc: '输入英文句子，AI 检测是否有中式英语痕迹，逐句分析并给出地道替代表达。' },
      { label: '思维转译', desc: '看到中文场景描述，用英语直接描述画面（不要逐字翻译），培养英语思维。' },
      { label: '反翻译训练', desc: '根据关键词和语境提示，扩展成完整的情境句子，对比 AI 参考表达。' },
      { label: '思维还原', desc: '看到用英语思维写出的中文，还原成地道的英语表达，体会母语者的思维逻辑。' },
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
    intro: '选择场景（咖啡店点单 / 工作面试 / 日常聊天 / 观点辩论，也可自定义），与 AI 进行多轮角色扮演对话。对话完成后生成地道度分析报告，从词汇、语法、自然度给出改进建议。',
    features: [
      { label: '场景选择', desc: '4 个预设场景：咖啡店点单、工作面试、日常聊天、观点辩论；也可以自定义场景和角色。' },
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
    intro: '逐句跟读精选母语语料，每句附语音标注与中文翻译。支持 0.5x–1.5x 无级调速、循环播放、单句重复，还能录音跟读让 AI 点评发音，训练纯正语音语调。',
    features: [
      { label: '语料库', desc: '精选日常对话、演讲发言、故事叙述等主题的英语语料，标注难度与美音/英音，每句附语音标注（重读提示）与中文翻译。' },
      { label: '逐句跟读', desc: '播放原音→跟读模仿，0.5x–1.5x 无级调速、单句循环，聚焦难点句子反复练习。' },
      { label: '录音并分析', desc: '录音跟读后实时转写，AI 与原句逐词对比，给出准确度评分、发音纠错与语调建议。' },
      { label: '发音难点分析', desc: 'AI 逐句分析连读、弱读、重音等发音难点，并给出跟读技巧。' },
      { label: 'AI 生成语料', desc: '按主题与难度 AI 生成跟读材料，也可给现有语料「增加句子」。' },
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
    intro: '100 道题库自由命题写作，AI 从总评、语法纠错、地道度、结构等维度给出批改报告。适合练习邮件、日记、议论文、读后感等各类写作场景。',
    features: [
      { label: '题库写作', desc: '100 道题目按类别与难度浏览（默认折叠，可展开全部），也可自定义题目或让 AI 生成写作题目。' },
      { label: 'AI 批改', desc: '提交后 AI 给出七个维度的报告：总分、亮点、语法修正、地道度、结构衔接、改进建议、词汇提升。' },
      { label: '草稿与历史', desc: '草稿自动保存（刷新/意外退出不丢），每次提交留档，可随时回看历史作文并朗读。' },
    ],
    tips: [
      '先自己写、再提交批改，对照修改建议学习效果更好',
      '写作题目可以自定义 — 日记、邮件、读后感都可以',
      '收藏写作题目，在收藏本里按类型筛选复习',
    ],
  },
  {
    id: 'progress',
    icon: BarChart3,
    title: '学习记录',
    route: '/progress',
    color: '#0EA5E9',
    intro: '追踪你的学习进度：月历打卡、近 30 天学习趋势、各模块占比、收藏本管理、学习成就徽章。',
    features: [
      { label: '日历打卡', desc: '月历展示每日打卡（有学习的日期高亮），可翻月查看历史，顶部显示本月已打卡与连续天数。' },
      { label: '学习统计', desc: '近 7 天学习时长柱状图、各模块占比饼图、近 30 天趋势折线图。' },
      { label: '收藏本', desc: '管理全部收藏：语块、表达、词汇、单词、思维训练、影子跟读、文章、句子拼写、写作提示，按类型筛选浏览。' },
      { label: '成就徽章', desc: '连续打卡 3/7/14/30 天、累计打卡 10/30 天、首次学习等成就，已解锁进度一目了然。' },
    ],
    tips: [
      '每天保持学习会点亮连续天数 streak 🔥',
      '收藏内容可按 9 种类型筛选（语块/表达/词汇/单词/思维/跟读/文章/拼写/写作）',
      '连续与累计打卡解锁成就，看看你能收集多少 🏆',
    ],
  },
];

// ============================================================
// FAQ
// ============================================================
const FAQS = [
  {
    q: '如何使用 AI 功能？',
    a: '不用配置也能直接用：应用出厂内置了免费额度（设置里显示为「智谱免费 · 出厂」，模型 GLM-4-Flash）。想换更快的模型或更大的额度，再点右上角 CPU 图标 → 选服务商 → 填入你自己的 API Key。Key 只保存在你本机浏览器里；用出厂额度时请求经由我们的服务端转发。',
  },
  { q: 'AI 功能需要付费吗？', a: '应用本身完全免费，出厂额度可以直接用。想换服务商就自备 Key（共 8 家可选：智谱免费出厂、DeepSeek、豆包、通义千问、GLM、硅基流动、Moonshot、Groq），多数注册即送免费 token，超出后按各家计费。' },
  { q: '我的学习数据存在哪里？', a: '默认全部只存在你这台设备的本机存储里（localStorage + IndexedDB），清除浏览器数据/重装 App 会丢，可在「学习记录 → 导出」备份。注册登录后数据会同步到云端，换设备也能接着学。' },
  {
    q: '各模块的学习顺序？', a: '建议每日 30 分钟：① 母语思维训练热身（5 分钟）→ ② 词汇深度学习新词（5 分钟）→ ③ 语块训练学 2-3 个表达（5 分钟）→ ④ AI 对话练习口语（10 分钟）→ ⑤ 影子跟读/写作轮流（5 分钟）。但最重要的不是顺序，而是每天坚持。',
  },
  { q: 'SM-2 间隔记忆是什么？', a: 'SM-2 是一种科学的间隔重复算法。你每次对单词评分（完全忘了→完全掌握），算法自动计算下次复习的最佳时间。掌握得越好，复习间隔越长（1天→3天→7天→…），效率远高于随机复习。' },
  { q: '"全部"模式和单个词库有什么区别？', a: '选单个词库（如"四级"）时，学习和复习仅限于该等级的单词。选"全部"时，系统聚合九档词库、按单词去重后共 21,736 个可学单词，一个词只会出一张卡，可以跨词库复习所有学过的单词。注意"全部"要加载九本书，手机上会慢一些，日常建议选单本。' },
];

// ============================================================
// Getting Started
// ============================================================
const GETTING_STARTED = [
  {
    num: 1, color: '#00B894', title: '选一本词书开始（AI 不用配）',
    desc: '进「词汇」会先让你选词书和学习方式，选完直接开始学。AI 功能出厂就带免费额度，不必自备 API Key；想换模型再点右上角 CPU 图标配 Key。',
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
    desc: '每天学习自动打卡 📅。在「学习记录」查看月历与统计。连续 / 累计打卡解锁成就 🏆。',
  },
];

// ============================================================
// Component
// ============================================================
const HELP_TAB_KEY = '__nativethink_help_tab';

export default function HelpGuide({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const { pathname } = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = safeStorage.getItem(HELP_TAB_KEY);
      return saved && ['modules', 'getting-started', 'faq'].includes(saved) ? saved : 'modules';
    } catch { return 'modules'; }
  });

  /*
   * 自动弹出**只在首页**触发（2026-09-29 实测缺陷）：它是模态 Radix Dialog，
   * 挂载 800ms 后无条件 setOpen(true) —— 新用户直接进 /vocabulary 时，
   * 首启三步向导还铺在下面，"使用指南"先盖上来抢位，必须先关掉它才能选词书
   * （本轮自动化验收就被它挡掉过两次点击）。全局指南该由首页这个"总入口"来发，
   * 各功能页自己的首启流程（词汇向导等）归它们管。工具栏图标始终可手动打开。
   */
  useEffect(() => {
    if (defaultOpen !== undefined) return;
    // 用 useLocation 而不是 window.location.pathname：带 basename 部署时后者会多出前缀
    if (pathname !== '/' && pathname !== '') return;
    if (hasSeenHelpGuide()) return;
    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [defaultOpen, pathname]);

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
          className="bg-muted hover:bg-muted/80 rounded-2xl text-muted-foreground hover:text-ink-teal transition-colors"
        >
          <HelpCircle className="size-4.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[85vh] rounded-[32px] p-0 overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-border bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-500/10 dark:via-teal-500/10 dark:to-cyan-500/10">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black italic text-foreground flex items-center gap-2.5">
              <div className="size-10 rounded-2xl bg-[#00B894]/15 text-ink-teal flex items-center justify-center">
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
              <TabsTrigger value="modules" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-ink-teal data-[state=active]:shadow-sm flex-1">
                <Zap className="size-3.5 mr-1.5" />功能介绍
              </TabsTrigger>
              <TabsTrigger value="getting-started" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-ink-teal data-[state=active]:shadow-sm flex-1">
                <Target className="size-3.5 mr-1.5" />快速上手
              </TabsTrigger>
              <TabsTrigger value="faq" className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-ink-teal data-[state=active]:shadow-sm flex-1">
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
                              <span className="size-5 rounded-lg bg-[#00B894]/10 text-ink-teal flex items-center justify-center shrink-0 mt-0.5">
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
                                <CheckCircle2 className="size-3.5 text-ink-teal shrink-0 mt-0.5" />
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
                              <a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-ink-teal hover:underline flex items-center gap-1">
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
                        <div className="size-8 rounded-xl bg-[#00B894]/10 text-ink-teal flex items-center justify-center shrink-0 mt-0.5">
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
          <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-ink-teal hover:underline flex items-center gap-1">
            <Key className="size-3" />获取 API Key<ExternalLink className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
