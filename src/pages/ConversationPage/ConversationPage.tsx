import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
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
  Copy,
  Plane,
  ShoppingBag,
  Stethoscope,
  GraduationCap,
  Building2,
  UtensilsCrossed,
  PhoneCall,
  PartyPopper,
  Headset,
  CarTaxiFront,
  Lightbulb,
  Languages,
  Volume2,
  History,
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
import { getCapabilityClient } from '@/lib/capability-client';
import { toast } from 'sonner';
import { addCorrectionNotes, extractConversationRows } from '@/lib/correction-notes';
import { PLUGIN_IDS } from '@/lib/plugin-ids';
import { useStudyCredit, creditKey } from '@/lib/study-credit';
import { useAI } from '@/hooks/use-ai';
import { cn } from '@/lib/utils';
import { useCustomScenarios, ICON_OPTIONS, COLOR_OPTIONS, type IconName } from '@/lib/use-custom-scenarios';
import { useTTS } from '@/lib/use-tts';
import { usePageMemory } from '@/lib/use-page-memory';
import { safeStorage } from '@/lib/safe-storage';
import { persistText } from '@/lib/capped-cache';

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
  difficulty?: '日常' | '进阶';
  /** 场景核心词/短语，帮用户在对话前做准备 */
  keyPhrases?: string[];
}

/** Persisted conversation record (per scenario — resume where you left off) */
interface ISavedConversation {
  scenarioId: string;
  scenarioName: string;
  scenarioDescription: string;
  scenarioRole: string;
  scenarioIcon: string; // IconName key into ICON_MAP
  scenarioColor: string;
  scenarioBg: string;
  messages: IMessage[];
  analysis?: string;
  updatedAt: number;
}

const CONV_HISTORY_KEY = '__nativethink_conversation_history';

function loadConvHistory(): ISavedConversation[] {
  try {
    const raw = safeStorage.getItem(CONV_HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as ISavedConversation[]) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
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
    difficulty: '日常' as const,
    keyPhrases: ["I'll have a...", 'Could I get...', 'For here or to go'],
  },
  {
    id: 'interview',
    name: '工作面试',
    description: '模拟一场英文工作面试，练习职场表达',
    role: 'You are a professional HR manager conducting a job interview. Ask structured questions and give brief feedback.',
    icon: Briefcase,
    color: '#6366F1',
    bg: 'from-indigo-50 to-violet-50 dark:from-indigo-500/10 dark:to-violet-500/10',
    difficulty: '进阶' as const,
    keyPhrases: ['I have experience in...', 'My biggest strength is...', "I'm looking for an opportunity to..."],
  },
  {
    id: 'chat',
    name: '日常聊天',
    description: '和一位新朋友闲聊，练习日常话题表达',
    role: 'You are a friendly person you just met at a social event. Chat naturally about hobbies, work, travel, etc.',
    icon: MessageCircle,
    color: 'var(--brand)',
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
    difficulty: '进阶' as const,
    keyPhrases: ['I see your point, but...', "That's a fair argument, however...", 'Let me push back on that'],
  },
  {
    id: 'shopping',
    name: '商场购物',
    description: '试穿、询价、退换货，练日常消费口语',
    role: 'You are a helpful store assistant at a clothing store. Help the customer find items, suggest sizes and colors, mention prices and discounts naturally.',
    icon: ShoppingBag,
    color: '#8B5CF6',
    bg: 'from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10',
    difficulty: '日常' as const,
    keyPhrases: ['Do you have this in...', 'How much is it?', "I'm just looking, thanks"],
  },
  {
    id: 'hotel',
    name: '酒店入住',
    description: '办理入住、询问设施，练旅行英语',
    role: 'You are a warm, professional hotel front desk receptionist. Greet the guest, ask about their reservation, mention check-in time and amenities. Offer help with luggage or directions.',
    icon: Building2,
    color: '#0EA5E9',
    bg: 'from-sky-50 to-blue-50 dark:from-sky-500/10 dark:to-blue-500/10',
    difficulty: '日常' as const,
    keyPhrases: ['I have a reservation under...', 'What time is check-out?', 'Is breakfast included?'],
  },
  {
    id: 'restaurant',
    name: '餐厅点餐',
    description: '看菜单、点菜、买单，练餐饮场景对话',
    role: 'You are a waiter at a popular restaurant. Present the menu, make recommendations when asked, take the order, and check on the customer. Mention daily specials naturally.',
    icon: UtensilsCrossed,
    color: '#F59E0B',
    bg: 'from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10',
    difficulty: '日常' as const,
    keyPhrases: ['Could I see the menu?', "I'll have the...", 'Could we get the check?'],
  },
  {
    id: 'taxi',
    name: '打车出行',
    description: '告诉司机去哪、问路费，练出行英语',
    role: 'You are a taxi/rideshare driver making small talk with the passenger. Ask where they are headed, mention traffic, and chat casually about the city.',
    icon: CarTaxiFront,
    color: '#10B981',
    bg: 'from-green-50 to-emerald-50 dark:from-green-500/10 dark:to-emerald-500/10',
    difficulty: '日常' as const,
    keyPhrases: ['Could you take me to...', 'How long will it take?', 'Keep the change'],
  },
  {
    id: 'party',
    name: '派对寒暄',
    description: '在派对上认识新朋友、聊兴趣，练社交英语',
    role: 'You are a friendly, outgoing person at a house party. Make small talk, ask about hobbies and interests, share funny stories, and introduce the user to other imaginary guests.',
    icon: PartyPopper,
    color: '#F43F5E',
    bg: 'from-rose-50 to-pink-50 dark:from-rose-500/10 dark:to-pink-500/10',
    difficulty: '日常' as const,
    keyPhrases: ['So how do you know...?', 'Have you tried...?', "That's hilarious!"],
  },
  {
    id: 'doctor',
    name: '看病就诊',
    description: '描述症状、听医嘱，练医疗英语',
    role: 'You are a caring doctor at a clinic. Ask about the patient\'s symptoms, how long they\'ve had them, and their medical history. Explain your diagnosis simply and prescribe basic treatment.',
    icon: Stethoscope,
    color: '#EF4444',
    bg: 'from-red-50 to-rose-50 dark:from-red-500/10 dark:to-rose-500/10',
    difficulty: '进阶' as const,
    keyPhrases: ["I've been having...", 'It hurts when I...', 'How long will it take to recover?'],
  },
  {
    id: 'airport',
    name: '机场出行',
    description: '值机、安检、问路，练机场英语',
    role: 'You are an airline check-in agent at the airport. Help the passenger check in, ask about luggage, mention the gate and boarding time. Be efficient but friendly.',
    icon: Plane,
    color: '#06B6D4',
    bg: 'from-cyan-50 to-teal-50 dark:from-cyan-500/10 dark:to-teal-500/10',
    difficulty: '进阶' as const,
    keyPhrases: ["I'd like to check in", 'I have one bag to check', 'Which gate is...'],
  },
  {
    id: 'phone',
    name: '电话沟通',
    description: '打电话预约、咨询，练电话英语（没有肢体语言辅助）',
    role: 'You are a customer service representative answering a phone call. Since this is a phone conversation, rely on verbal communication only. Ask how you can help, confirm details, and be patient if the caller asks you to repeat.',
    icon: PhoneCall,
    color: '#A855F7',
    bg: 'from-purple-50 to-fuchsia-50 dark:from-purple-500/10 dark:to-fuchsia-500/10',
    difficulty: '进阶' as const,
    keyPhrases: ['Hello, this is...', "I'm calling to...", 'Could you repeat that?'],
  },
  {
    id: 'support',
    name: '客服投诉',
    description: '描述问题、要求解决，练客服英语',
    role: 'You are a customer service agent handling a complaint. Listen to the issue, apologize empathetically, ask clarifying questions, and offer a solution (refund, replacement, or escalation). Stay calm and professional.',
    icon: Headset,
    color: '#64748B',
    bg: 'from-slate-50 to-gray-50 dark:from-slate-500/10 dark:to-slate-500/10',
    difficulty: '进阶' as const,
    keyPhrases: ["I'd like to report a problem with...", 'This is the third time...', 'What can you do about this?'],
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

/**
 * AI 回复末尾的 `---SUGGEST---` 分隔符后跟 2-3 条用户可能想说的英文。
 * 解析失败（AI 没跟格式）就整体当正文，建议列表为空 → UI 回退到「卡住了？」提示。
 */
function parseSuggestions(content: string): { text: string; suggestions: string[] } {
  const SEP = '\n---SUGGEST---\n';
  const idx = content.indexOf(SEP);
  if (idx < 0) return { text: content, suggestions: [] };
  return {
    text: content.slice(0, idx).trim(),
    suggestions: content.slice(idx + SEP.length)
      .split('\n')
      .map((s) => s.replace(/^[-\d.]*\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3),
  };
}

/** 对话教练 system prompt：教 AI 当角色 + 当老师 */
function buildSystemPrompt(scenario: IScenario): string {
  const base = `${scenario.role}

Important rules:
1. Reply in English only, no Chinese
2. Keep responses 2-5 sentences, natural and conversational
3. Stay in character, don't break the fourth wall
4. If the user makes a grammar mistake, add the correction at the very end in this exact format on a new line: "💡 ...corrected version..." — keep it brief, one correction per response
5. At the VERY END of your response, add a line '---SUGGEST---' followed by 2-3 short English sentences (one per line, no numbering) that the user might naturally say next in this conversation. Keep them simple and appropriate for an English learner.`;
  if (scenario.keyPhrases?.length) {
    return `${base}\n6. Key phrases for this scenario that the user should practice: ${scenario.keyPhrases.join(', ')}. Work them into the conversation naturally.`;
  }
  return base;
}

export default function ConversationPage() {
  const { creditOnce } = useStudyCredit();
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
  const [convHistory, setConvHistory] = useState<ISavedConversation[]>(loadConvHistory);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  /**
   * 必须在 effect 体内把 `mountedRef` 置回 true：`useRef(true)` 只在首帧初始化，
   * 而 cleanup 会把它置 false。开发环境 `src/index.tsx:86` 开着 `<StrictMode>`，
   * effect 是「mount → cleanup → mount」，于是第二次挂载后它**恒为 false**，
   * 而 `:214/:281/:393` 都是 `if (!mountedRef.current) break;`
   * → dev 下对话页永远空白、且不报任何错（生产构建不受影响）。
   * 这正是 AGENTS.md 坑表「ref 不随组件重挂载归零」的教科书案例。
   */
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; abortRef.current?.abort(); };
  }, []);
  const abortRef = useRef<AbortController | null>(null);

  // Translation state
  const [translationTexts, setTranslationTexts] = useState<Record<number, string>>({});
  const [visibleTranslations, setVisibleTranslations] = useState<Record<number, boolean>>({});
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  // AI 建议回复（从 AI 回复末尾解析，用户可一键填入）
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Custom scenario dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newScenario, setNewScenario] = useState({
    name: '',
    description: '',
    role: '',
    icon: 'MessageCircle' as IconName,
    color: 'var(--brand)',
    bg: 'from-emerald-50 to-teal-50',
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startScenario = (scenario: IScenario) => {
    // 切场景先打断在途流并复位 isLoading —— 此前场景 A 的开场白流会继续
    // setMessages，把 A 的开场白写进 B 的聊天窗，且 B 的输入框卡在禁用态
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setSelectedScenario(scenario);
    setMessages([]);
    setAnalysis('');
    setShowAnalysis(false);
    setSuggestions([]);
    // Duolingo 式：AI 角色先开口，进入场景即刻有真实语境
    requestOpening(scenario);
  };

  /** 让 AI 角色生成场景开场白；失败必须给提示（不许静默回到空态） */
  const requestOpening = async (scenario: IScenario) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    if (isLoading) return;
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    const aiMsg: IMessage = { role: 'ai', content: '', timestamp: Date.now() };
    setMessages([aiMsg]);
    try {
      const stream = aiStream(
        [
          { role: 'system', content: buildSystemPrompt(scenario) },
          {
            role: 'user',
            content: "Open the conversation in character: greet me naturally and set the scene in one short turn (at most one question). Do not describe the scene in stage directions — just speak.",
          },
        ],
        { temperature: 0.9, signal: controller.signal },
      );
      for await (const chunk of stream) {
        if (!mountedRef.current) break;
        if (chunk.content) {
          full += chunk.content;
          setMessages([{ role: 'ai', content: full, timestamp: aiMsg.timestamp }]);
        }
      }
      if (!mountedRef.current) return;
      if (full.trim()) {
        const { text, suggestions: sug } = parseSuggestions(full);
        if (sug.length) setSuggestions(sug);
        if (text !== full) setMessages([{ role: 'ai', content: text, timestamp: aiMsg.timestamp }]);
        if (autoRead) { try { tts.speak(text); } catch { /* ignore */ } }
      } else {
        setMessages([]);
        toast.error('开场白生成失败，请点击「换一个场景」或重新进入重试', { duration: 4000 });
      }
    } catch {
      if (mountedRef.current) {
        setMessages([]);
        toast.error('AI 服务暂不可用，请稍后重试');
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
      abortRef.current = null;
    }
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
    setSuggestions([]);
    // 口径：按「发出去一句」的动作计时；同一场景同一句话只记一次（连点/重发不刷进度环）
    creditOnce('conversation', creditKey('send', selectedScenario?.name, text));

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
        const systemPrompt = selectedScenario
          ? buildSystemPrompt(selectedScenario)
          : 'You are a friendly English conversation partner.';
        const conversationCtx = newMessages
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n');

        const stream = aiStream(
          [
            { role: 'system', content: systemPrompt },
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
        if (mountedRef.current && full.trim()) {
          const { text, suggestions: sug } = parseSuggestions(full);
          if (sug.length) {
            setSuggestions(sug);
            setMessages([...newMessages, { ...aiMsg, content: text }]);
          }
        }
      } else {
        // Fallback to Lark plugin
        const plugin = (await getCapabilityClient())?.load?.(PLUGIN_IDS.AI_CONVERSATION);
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
    const controller = new AbortController();
    abortRef.current = controller;

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
          { temperature: 0.4, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (!mountedRef.current) break;
          if (chunk.content) {
            full += chunk.content;
            setAnalysis(full);
          }
        }
      } else {
        const plugin2 = (await getCapabilityClient())?.load?.(PLUGIN_IDS.NATURALNESS_ANALYSIS);
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
      // 表达纠偏本：分析里的「我的表达 → 更地道的说法」表自动收集（按 wrong 去重）
      if (full.trim()) addCorrectionNotes('conversation', extractConversationRows(full));
      // 流式正常结束但为空 = AI 调用失败（use-ai 吞错只 toast）——
      // 不许把用户留在一张空分析弹窗里
      if (!full.trim()) {
        toast.error('AI 服务暂不可用，请稍后重试');
        setShowAnalysis(false);
        return;
      }
    } catch (err) {
      console.error('Conversation analysis failed:', err);
      toast.error('分析服务暂不可用');
      setAnalysis('> ⚠️ 分析服务连接失败，请稍后重试。');
    } finally {
      setAnalyzing(false);
      abortRef.current = null;
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
      color: 'var(--brand)',
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
    // 返回也打断在途流并复位 isLoading（与 startScenario 同款防护）
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setSelectedScenario(null);
    setMessages([]);
    setAnalysis('');
    setShowAnalysis(false);
    setSuggestions([]);
    // Reset translations when leaving a scenario
    setTranslationTexts({});
    setVisibleTranslations({});
    setTranslatingIdx(null);
  };

  // ── Conversation persistence: auto-save the active conversation (debounced) ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selectedScenario || messages.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // 800ms debounce — streaming updates messages on every chunk
    saveTimerRef.current = setTimeout(() => {
      const iconName = (Object.keys(ICON_MAP) as IconName[]).find(
        (k) => ICON_MAP[k] === selectedScenario.icon,
      ) ?? 'MessageCircle';
      const record: ISavedConversation = {
        scenarioId: selectedScenario.id,
        scenarioName: selectedScenario.name,
        scenarioDescription: selectedScenario.description,
        scenarioRole: selectedScenario.role,
        scenarioIcon: iconName,
        scenarioColor: selectedScenario.color,
        scenarioBg: selectedScenario.bg,
        messages: messages.slice(-100),
        analysis: analysis || undefined,
        updatedAt: Date.now(),
      };
      setConvHistory((prev) => {
        const next = [record, ...prev.filter((c) => c.scenarioId !== record.scenarioId)].slice(0, 20);
        persistText(CONV_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    }, 800);
  }, [messages, analysis, selectedScenario]);

  const findScenarioById = (id: string): IScenario | undefined => {
    const builtin = SCENARIOS.find((s) => s.id === id);
    if (builtin) return builtin;
    const custom = customScenarios.find((s) => s.id === id);
    if (custom) return { ...custom, icon: ICON_MAP[custom.icon] ?? MessageCircle };
    return undefined;
  };

  const resumeConversation = (record: ISavedConversation) => {
    const scenario: IScenario = findScenarioById(record.scenarioId) ?? {
      id: record.scenarioId,
      name: record.scenarioName,
      description: record.scenarioDescription,
      role: record.scenarioRole,
      icon: ICON_MAP[record.scenarioIcon as IconName] ?? MessageCircle,
      color: record.scenarioColor,
      bg: record.scenarioBg,
    };
    setSelectedScenario(scenario);
    setMessages(record.messages);
    setAnalysis(record.analysis ?? '');
    setShowAnalysis(false);
    setSuggestions([]);
    setTranslationTexts({});
    setVisibleTranslations({});
    setTranslatingIdx(null);
  };

  const deleteSavedConversation = (scenarioId: string) => {
    setConvHistory((prev) => {
      const next = prev.filter((c) => c.scenarioId !== scenarioId);
      persistText(CONV_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
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

        {/* 继续上次对话 */}
        {convHistory.length > 0 && (
          <Card className="rounded-[32px] border-border p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="size-4 text-ink-teal" />
              <h2 className="text-sm font-black uppercase tracking-wider text-foreground">继续上次对话</h2>
            </div>
            <div className="space-y-2">
              {convHistory.map((c) => {
                const CIcon = ICON_MAP[c.scenarioIcon as IconName] ?? MessageCircle;
                return (
                  <div
                    key={c.scenarioId}
                    className="flex items-center gap-3 rounded-2xl border border-border p-3 hover:border-[var(--brand)]/40 transition-colors"
                  >
                    <div
                      className="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: c.scenarioColor }}
                    >
                      <CIcon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{c.scenarioName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.messages.filter((m) => m.role === 'user').length} 轮对话 ·{' '}
                        {new Date(c.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteSavedConversation(c.scenarioId)}
                      className="rounded-xl text-muted-foreground hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => resumeConversation(c)}
                      className="rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white shrink-0"
                    >
                      继续
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="stagger grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <CardContent className="p-6 bg-card">
                  <div
                    className="size-12 rounded-2xl flex items-center justify-center mb-4 border border-border/60"
                    style={{ backgroundColor: `${scenario.color}14`, color: scenario.color }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-black text-foreground">{scenario.name}</h3>
                    {scenario.difficulty && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border-none',
                          scenario.difficulty === '日常'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
                        )}
                      >
                        {scenario.difficulty}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-medium mb-4">
                    {scenario.description}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
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
              <div className="size-12 rounded-2xl flex items-center justify-center bg-muted text-muted-foreground mb-4 group-hover:bg-muted/70 transition-colors">
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
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 focus:border-[var(--brand)]"
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
                            ? 'border-[var(--brand)] bg-emerald-50 dark:bg-emerald-500/15 text-ink-teal'
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
                className="rounded-2xl bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
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
            className="rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-ink-teal"
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
              autoRead ? 'bg-[var(--brand)]/10 text-ink-teal' : 'bg-muted text-muted-foreground hover:text-ink-teal',
            )}
          >
            <Volume2 className="size-3" />
            {autoRead ? '自动朗读:开' : '自动朗读:关'}
          </Button>
          <Badge variant="secondary" className="rounded-full px-3 py-1 bg-muted text-[10px] font-black uppercase tracking-wider">
            {messages.filter((m) => m.role === 'user').length} 轮对话
          </Badge>
          <Dialog open={showAnalysis} onOpenChange={setShowAnalysis}>
            {/* 不用 DialogTrigger 自动开 —— endConversation 在对话不足两轮时只提示不分析，
                触发器无条件开弹窗会让分析弹窗空转圈；改为校验通过后受控打开 */}
            <Button
              variant="outline"
              size="sm"
              onClick={endConversation}
              disabled={analyzing}
              className="rounded-2xl text-[10px] font-black uppercase tracking-wider border-border hover:border-[var(--brand)] hover:text-ink-teal"
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
            <DialogContent className="max-w-2xl rounded-[32px] p-0 overflow-hidden">
              <div className="p-6 border-b border-border">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
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
                {selectedScenario.keyPhrases?.length ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 px-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">试试这些：</span>
                    {selectedScenario.keyPhrases.map((p) => (
                      <button
                        key={p}
                        onClick={() => setInput(p)}
                        className="px-2 py-0.5 rounded-full bg-muted/60 text-[11px] font-bold text-muted-foreground hover:text-ink-teal hover:bg-emerald-500/10 transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : null}
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
                      ? 'bg-[var(--brand)] text-white rounded-br-md shadow-md shadow-emerald-200/30 dark:shadow-emerald-900/20'
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
                  {/* TTS + Copy + Translation buttons */}
                  {msg.content && (
                    <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-all">
                      {msg.role === 'ai' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            try {
                              navigator.clipboard?.writeText(msg.content).then(() => toast.success('已复制'));
                            } catch { /* clipboard unavailable */ }
                          }}
                          title="复制回复"
                          className="size-6 rounded-full flex items-center justify-center shadow-sm bg-background text-muted-foreground hover:text-ink-teal hover:bg-emerald-50 dark:hover:bg-emerald-500/15"
                        >
                          <Copy className="size-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          tts.speak(msg.content);
                        }}
                        className="size-6 rounded-full flex items-center justify-center shadow-sm bg-background text-muted-foreground hover:text-ink-teal hover:bg-emerald-50 dark:hover:bg-emerald-500/15"
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
          {/* AI 建议回复：AI 回复后出现，一键填入输入框 */}
          {suggestions.length > 0 && !isLoading && (
            <div className="max-w-3xl mx-auto mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-[12px] font-bold text-ink-teal whitespace-nowrap transition-colors border border-emerald-200/50 dark:border-emerald-500/20"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {/* 卡住求助：无 AI 建议时的兜底 */}
          {suggestions.length === 0 && messages.length <= 1 && !input.trim() && (
            <div className="max-w-3xl mx-auto mb-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 shrink-0">卡住了？</span>
              {[
                'Could you say that again more slowly?',
                'How do you say ______ in English?',
                'What should I say in this situation?',
                'Sorry, I am not sure how to respond.',
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => setInput(p)}
                  className="px-2.5 py-1 rounded-full bg-muted/70 hover:bg-emerald-500/10 hover:text-ink-teal text-[11px] font-bold text-muted-foreground transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
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
              className="bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white px-6 rounded-3xl shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
            >
              {isLoading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </Button>
          </form>
        </div>
      </Card>

    </div>
  );
}
