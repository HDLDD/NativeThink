import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  Loader2,
  Users,
  Coffee,
  Briefcase,
  MessageCircle,
  Swords,
  StopCircle,
  FileText,
  X,
  Plus,
  Trash2,
  Plane,
  ShoppingBag,
  Stethoscope,
  GraduationCap,
  Languages,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { capabilityClient } from '@lark-apaas/client-toolkit-lite';
import { toast } from 'sonner';
import { PLUGIN_IDS } from '@/lib/plugin-ids';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useAI } from '@/hooks/use-ai';
import { cn } from '@/lib/utils';
import { useCustomScenarios, ICON_OPTIONS, COLOR_OPTIONS, type IconName } from '@/lib/use-custom-scenarios';
import { useTTS } from '@/lib/use-tts';
import { usePageMemory } from '@/lib/use-page-memory';

interface IMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

interface IScenario {
  id: string;
  name: string;
  description: string;
  role: string;
  icon: typeof Coffee;
  color: string;
  bg: string;
}

const SCENARIOS: IScenario[] = [
  {
    id: 'coffee',
    name: '咖啡店点单',
    description: '在咖啡店点一杯你喜欢的饮品，练习日常点单用语',
    role: 'You are a friendly barista at a cozy coffee shop. Speak naturally and casually.',
    icon: Coffee,
    color: '#F97316',
    bg: 'from-orange-50 to-amber-50 dark:from-orange-500/10 dark:to-amber-500/10',
  },
  {
    id: 'interview',
    name: '工作面试',
    description: '模拟一场英文工作面试，练习职场表达',
    role: 'You are a professional HR manager conducting a job interview. Ask structured questions and give brief feedback.',
    icon: Briefcase,
    color: '#6366F1',
    bg: 'from-indigo-50 to-violet-50 dark:from-indigo-500/10 dark:to-violet-500/10',
  },
  {
    id: 'chat',
    name: '日常聊天',
    description: '和一位新朋友闲聊，练习日常话题表达',
    role: 'You are a friendly person you just met at a social event. Chat naturally about hobbies, work, travel, etc.',
    icon: MessageCircle,
    color: '#00B894',
    bg: 'from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10',
  },
  {
    id: 'debate',
    name: '观点辩论',
    description: '就一个话题进行观点交锋，练习论证表达',
    role: 'You are a debate opponent. Challenge my arguments and present counterpoints clearly and respectfully.',
    icon: Swords,
    color: '#EC4899',
    bg: 'from-pink-50 to-rose-50 dark:from-pink-500/10 dark:to-rose-500/10',
  },
];

const ICON_MAP: Record<IconName, LucideIcon> = {
  Coffee,
  Briefcase,
  MessageCircle,
  Swords,
  Plane,
  ShoppingBag,
  Stethoscope,
  GraduationCap,
};

export default function ConversationPage() {
  const { addStudyMinutes } = useLearningStats();
  const { isConfigured, streamChat: aiStream, chat: aiChat } = useAI();
  const { scenarios: customScenarios, addScenario, removeScenario } = useCustomScenarios();
  const tts = useTTS();
  const [selectedScenario, setSelectedScenario] = useState<IScenario | null>(null);
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoRead, setAutoRead] = usePageMemory('conv-auto-read', false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; abortRef.current?.abort(); }; }, []);
  const abortRef = useRef<AbortController | null>(null);

  // Translation state
  const [translationTexts, setTranslationTexts] = useState<Record<number, string>>({});
  const [visibleTranslations, setVisibleTranslations] = useState<Record<number, boolean>>({});
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);

  // Custom scenario dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newScenario, setNewScenario] = useState({
    name: '',
    description: '',
    role: '',
    icon: 'MessageCircle' as IconName,
    color: '#00B894',
    bg: 'from-emerald-50 to-teal-50',
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startScenario = (scenario: IScenario) => {
    setSelectedScenario(scenario);
    setMessages([]);
    setAnalysis('');
    setShowAnalysis(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: IMessage = { role: 'user', content: text, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    addStudyMinutes(1, 'conversation');

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';

    try {
      const history = newMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n');

      const aiMsg: IMessage = { role: 'ai', content: '', timestamp: Date.now() };
      setMessages([...newMessages, aiMsg]);

      if (isConfigured) {
        // Use DeepSeek/Doubao AI service
        const systemPrompt = selectedScenario?.role || 'You are a friendly English conversation partner.';
        const conversationCtx = newMessages
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n');

        const stream = aiStream(
          [
            {
              role: 'system',
              content: `${systemPrompt}\n\nImportant rules:\n1. Reply in English only, no Chinese\n2. Keep responses 2-5 sentences, natural and conversational\n3. Stay in character, don't break the fourth wall\n4. If the user makes grammar mistakes, briefly note corrections in parentheses at the end`,
            },
            { role: 'user', content: conversationCtx },
          ],
          { temperature: 0.8, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (!mountedRef.current) break;
          if (chunk.content) {
            full += chunk.content;
            setMessages([...newMessages, { ...aiMsg, content: full }]);
          }
        }
      } else {
        // Fallback to Lark plugin
        const plugin = capabilityClient?.load?.(PLUGIN_IDS.AI_CONVERSATION);
        if (!plugin) { toast.error('AI 插件未加载'); setIsLoading(false); return; }
        const stream = plugin.callStream('textGenerate', {
          scenario: selectedScenario?.name,
          role_setting: selectedScenario?.role,
          conversation_history: history,
          user_message: text,
        });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (!mountedRef.current) break;
          if (chunk.content) {
            full += chunk.content;
            setMessages([...newMessages, { ...aiMsg, content: full }]);
          }
        }
      }
    } catch (err) {
      console.error('AI conversation send failed:', err);
      toast.error('AI 服务暂不可用，请稍后重试');
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      // Auto-read AI response if enabled (only last ~500 chars to avoid long playback)
      if (autoRead && full && mountedRef.current) {
        const snippet = full.length > 500 ? full.slice(-500).replace(/^[\s\S]*?\.\s*/, '') : full;
        setTimeout(() => { if (mountedRef.current) tts.speak(snippet, { rate: 0.95 }); }, 300);
      }
    }
  };

  const endConversation = async () => {
    if (messages.length < 2) {
      toast.info('至少完成一轮对话后才能分析哦');
      return;
    }

    setAnalyzing(true);
    setShowAnalysis(true);

    try {
      const history = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n');

      let full = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an English language coach. Analyze the following conversation for naturalness and fluency. Provide a structured report in Chinese. Follow this format exactly — pay special attention to separating AI expressions from User expressions:

## 整体评估
评分：X/10 — 简短总体评价

---

## 🤖 AI 的地道表达（值得学习）
分析 AI 在对话中使用的地道词汇、短语和句式，这些是你应该学习和模仿的。

| AI 的地道表达 | 中文翻译 | 为什么地道 | 你可以怎么用 |
|-------------|---------|-----------|------------|
| ... | ... | ... | ... |

---

## ✍️ 我的表达分析（需要改进）
分析你在对话中的表达，找出不自然、中式英语或用词不当的地方。

| 我的表达 | 中文翻译 | 更地道的说法 | 原因分析 |
|---------|---------|------------|---------|
| ... | ... | ... | ... |

## ✅ 我做得好的地方
- 要点1（附对话中的具体例子）
- 要点2

---

## 💡 对话关键句子翻译
把对话中最有价值的句子挑出来，给出中文翻译，帮助理解。

| 说话者 | 原文 | 中文翻译 |
|-------|-----|---------|
| AI | ... | ... |
| 我 | ... | ... |

## 📋 下一步建议
- 可操作的建议1
- 可操作的建议2`,
            },
            {
              role: 'user',
              content: `Scenario: ${selectedScenario?.name || 'Conversation'}\n\nConversation:\n${history}`,
            },
          ],
          { temperature: 0.4 },
        );

        for await (const chunk of stream) {
          if (!mountedRef.current) break;
          if (chunk.content) {
            full += chunk.content;
            setAnalysis(full);
          }
        }
      } else {
        const plugin2 = capabilityClient?.load?.(PLUGIN_IDS.NATURALNESS_ANALYSIS);
        if (!plugin2) { toast.error('AI 插件未加载'); setAnalyzing(false); return; }
        const stream = plugin2.callStream('textGenerate', {
          conversation_history: history,
          scenario: selectedScenario?.name || '',
        });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (!mountedRef.current) break;
          if (chunk.content) {
            full += chunk.content;
            setAnalysis(full);
          }
        }
      }
    } catch (err) {
      console.error('Conversation analysis failed:', err);
      toast.error('分析服务暂不可用');
      setAnalysis('> ⚠️ 分析服务连接失败，请稍后重试。');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleTranslate = async (idx: number, content: string) => {
    // Toggle visibility if already translated
    if (translationTexts[idx]) {
      setVisibleTranslations((prev) => ({ ...prev, [idx]: !prev[idx] }));
      return;
    }

    // Translate via AI
    setTranslatingIdx(idx);
    try {
      const prompt = `Translate the following English text to natural Chinese. Only return the Chinese translation, nothing else:\n\n${content}`;
      const result = await aiChat(
        [
          { role: 'system', content: 'You are a translator. Translate English to natural, colloquial Chinese. Return ONLY the Chinese text, no explanations.' },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, maxTokens: 512 },
      );
      if (result) {
        setTranslationTexts((prev) => ({ ...prev, [idx]: result.trim() }));
        setVisibleTranslations((prev) => ({ ...prev, [idx]: true }));
      }
    } catch (e) {
      console.error('Message translation failed:', e);
      toast.error('翻译失败，请稍后重试');
    } finally {
      setTranslatingIdx(null);
    }
  };

  const handleCreateScenario = () => {
    if (!newScenario.name.trim() || !newScenario.role.trim()) {
      toast.error('请至少填写场景名称和 AI 角色设定');
      return;
    }
    addScenario(newScenario);
    setShowCreateDialog(false);
    setNewScenario({
      name: '',
      description: '',
      role: '',
      icon: 'MessageCircle',
      color: '#00B894',
      bg: 'from-emerald-50 to-teal-50',
    });
    toast.success('自定义场景已创建');
  };

  const handleDeleteScenario = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeScenario(id);
    toast.success('场景已删除');
  };

  const goBack = () => {
    setSelectedScenario(null);
    setMessages([]);
    setAnalysis('');
    setShowAnalysis(false);
    // Reset translations when leaving a scenario
    setTranslationTexts({});
    setVisibleTranslations({});
    setTranslatingIdx(null);
  };

  if (!selectedScenario) {
    return (
      <div className="space-y-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
            AI Conversation
          </p>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black italic text-foreground tracking-tight">
              AI 对话练习
            </h1>
          </div>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            选择一个场景，开始与 AI 角色扮演对话练习
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...SCENARIOS.map((s) => ({ ...s, isCustom: false } as IScenario & { isCustom: boolean })),
            ...customScenarios.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              role: s.role,
              icon: ICON_MAP[s.icon],
              color: s.color,
              bg: s.bg,
              isCustom: true,
            } as IScenario & { isCustom: boolean })),
          ].map((scenario) => {
            const Icon = scenario.icon;
            return (
              <Card
                key={scenario.id}
                onClick={() => startScenario(scenario)}
                className="cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1 group rounded-[32px] border-border overflow-hidden relative"
              >
                {scenario.isCustom && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDeleteScenario(e, scenario.id)}
                    className="absolute top-3 right-3 z-10 size-7 rounded-full bg-white/70 hover:bg-red-50 dark:bg-foreground/10 dark:hover:bg-red-500/15 hover:text-red-500 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
                <CardContent className={`p-6 bg-gradient-to-br ${scenario.bg}`}>
                  <div
                    className="size-14 rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform shadow-lg"
                    style={{ backgroundColor: scenario.color }}
                  >
                    <Icon className="size-6" />
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2">{scenario.name}</h3>
                  <p className="text-sm text-muted-foreground font-medium mb-4">
                    {scenario.description}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider" style={{ color: scenario.color }}>
                    开始对话
                    <Plus className="size-3.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* 自定义场景入口卡片 */}
          <Card
            onClick={() => setShowCreateDialog(true)}
            className="cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1 group rounded-[32px] border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-transparent"
          >
            <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
              <div className="size-14 rounded-2xl flex items-center justify-center bg-muted text-muted-foreground mb-4 group-hover:scale-110 group-hover:bg-[#00B894] group-hover:text-white transition-all shadow-lg">
                <Plus className="size-7" />
              </div>
              <h3 className="text-xl font-black text-muted-foreground mb-2 group-hover:text-foreground transition-colors">
                自定义场景
              </h3>
              <p className="text-sm text-muted-foreground/60 font-medium">
                创建你自己的角色扮演场景
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Custom scenario creation dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-lg rounded-[32px] p-0 overflow-hidden">
            <div className="p-6 border-b border-border">
              <DialogHeader>
                <DialogTitle className="text-xl font-black italic text-foreground">
                  创建自定义场景
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  场景名称 <span className="text-red-400">*</span>
                </label>
                <Input
                  value={newScenario.name}
                  onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                  placeholder="例如：酒店入住"
                  className="rounded-2xl"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  场景描述
                </label>
                <Input
                  value={newScenario.description}
                  onChange={(e) => setNewScenario({ ...newScenario, description: e.target.value })}
                  placeholder="例如：在酒店前台办理入住手续"
                  className="rounded-2xl"
                />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  AI 角色设定 <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={newScenario.role}
                  onChange={(e) => setNewScenario({ ...newScenario, role: e.target.value })}
                  placeholder="例如：You are a hotel front desk receptionist. Greet the guest, check their reservation, and help them check in."
                  rows={3}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00B894]/20 focus:border-[#00B894]"
                />
              </div>

              {/* Icon selection */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  图标
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((opt) => {
                    const IconComp = ICON_MAP[opt.name];
                    const selected = newScenario.icon === opt.name;
                    return (
                      <button
                        key={opt.name}
                        type="button"
                        onClick={() => setNewScenario({ ...newScenario, icon: opt.name })}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border-2',
                          selected
                            ? 'border-[#00B894] bg-emerald-50 dark:bg-emerald-500/15 text-[#00B894]'
                            : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        <IconComp className="size-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color selection */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  主题色
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((opt) => {
                    const selected = newScenario.color === opt.color;
                    return (
                      <button
                        key={opt.color}
                        type="button"
                        onClick={() => setNewScenario({ ...newScenario, color: opt.color, bg: opt.bg })}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border-2',
                          selected
                            ? 'border-current'
                            : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                        )}
                        style={selected ? { color: opt.color } : undefined}
                      >
                        <span
                          className="size-4 rounded-full border-2 border-current"
                          style={{ backgroundColor: opt.color }}
                        />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                className="rounded-2xl"
              >
                取消
              </Button>
              <Button
                onClick={handleCreateScenario}
                className="rounded-2xl bg-[#00B894] hover:bg-[#00A080] text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
              >
                <Plus className="size-4 mr-1.5" />
                创建场景
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    );
  }

  const Icon = selectedScenario.icon;

  return (
    <div className="space-y-6">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            className="rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-[#00B894]"
          >
            <X className="size-4 mr-1.5" />
            返回场景
          </Button>
          <div
            className="size-10 rounded-2xl flex items-center justify-center text-white shadow-md"
            style={{ backgroundColor: selectedScenario.color }}
          >
            <Icon className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-black italic text-foreground">{selectedScenario.name}</h1>
            <p className="text-xs text-muted-foreground font-medium">{selectedScenario.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoRead(!autoRead)}
            className={cn(
              'rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5 h-7',
              autoRead ? 'bg-[#00B894]/10 text-[#00B894]' : 'bg-muted text-muted-foreground hover:text-[#00B894]',
            )}
          >
            <Volume2 className="size-3" />
            {autoRead ? '自动朗读:开' : '自动朗读:关'}
          </Button>
          <Badge variant="secondary" className="rounded-full px-3 py-1 bg-muted text-[10px] font-black uppercase tracking-wider">
            {messages.filter((m) => m.role === 'user').length} 轮对话
          </Badge>
          <Dialog open={showAnalysis} onOpenChange={setShowAnalysis}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={endConversation}
                disabled={analyzing}
                className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[#00B894] hover:text-[#00B894]"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <FileText className="size-3.5 mr-1.5" />
                    地道度分析
                  </>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl rounded-[32px] p-0 overflow-hidden">
              <div className="p-6 border-b border-border">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                    <Sparkles className="size-5 text-[#00B894]" />
                    地道度分析报告
                  </DialogTitle>
                </DialogHeader>
              </div>
              <ScrollArea className="max-h-[60vh] px-6 py-4">
                {analysis ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin mr-2" />
                    正在分析你的对话...
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 对话区 */}
      <Card className="rounded-[40px] border-border shadow-sm overflow-hidden flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
        <ScrollArea className="flex-1 px-6 py-6">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div
                  className="size-20 rounded-3xl mx-auto mb-4 flex items-center justify-center text-white shadow-lg"
                  style={{ backgroundColor: selectedScenario.color }}
                >
                  <MessageSquare className="size-9" />
                </div>
                <h3 className="text-xl font-black text-foreground mb-2">开始对话吧！</h3>
                <p className="text-sm text-muted-foreground font-medium">
                  在下方输入框中输入英文，开始与 AI 练习对话
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] px-5 py-3 rounded-3xl text-sm leading-relaxed relative group/msg',
                    msg.role === 'user'
                      ? 'bg-[#00B894] text-white rounded-br-md shadow-md shadow-emerald-200/30 dark:shadow-emerald-900/20'
                      : 'bg-muted text-foreground rounded-bl-md',
                  )}
                >
                  {msg.content || (
                    <span className="inline-flex items-center gap-1">
                      <span className="size-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="size-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="size-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                  {/* TTS + Translation buttons */}
                  {msg.content && (
                    <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          tts.speak(msg.content);
                        }}
                        className="size-6 rounded-full flex items-center justify-center shadow-sm bg-background text-muted-foreground hover:text-[#00B894] hover:bg-emerald-50 dark:hover:bg-emerald-500/15"
                      >
                        <Volume2 className="size-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTranslate(idx, msg.content);
                        }}
                        disabled={translatingIdx === idx}
                        className={cn(
                          'size-6 rounded-full flex items-center justify-center shadow-sm',
                          visibleTranslations[idx]
                            ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                            : 'bg-background text-muted-foreground hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/15',
                        )}
                      >
                        {translatingIdx === idx ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Languages className="size-3" />
                        )}
                      </button>
                    </div>
                  )}
                  {/* Translation result */}
                  {visibleTranslations[idx] && translationTexts[idx] && (
                    <div
                      className={cn(
                        'mt-2 pt-2 border-t border-white/20 text-xs italic',
                        msg.role === 'user'
                          ? 'text-white/80'
                          : 'text-muted-foreground border-l-2 border-emerald-400 pl-2 border-t-0',
                      )}
                    >
                      {translationTexts[idx]}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border bg-card">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="用英文输入你想说的话..."
              disabled={isLoading}
              className="py-5 px-5 rounded-3xl border-border bg-muted/30 text-base focus-visible:ring-2 focus-visible:ring-emerald-200"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-[#00B894] hover:bg-[#00A080] text-white px-6 rounded-3xl shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
            >
              {isLoading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </Button>
          </form>
        </div>
      </Card>

    </div>
  );
}
