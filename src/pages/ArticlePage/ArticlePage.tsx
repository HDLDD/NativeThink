import { useState, useCallback, useRef, useEffect } from 'react';
import {
  FileText, Sparkles, Languages, BookOpen, Volume2, RefreshCw, Loader2,
  Search, ExternalLink, X, Globe, Library, Mic, Wand2, BookMarked,
  GraduationCap, Clock, RotateCw, History, Newspaper, ChevronRight, Play,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { useWordLearning } from '@/lib/use-word-learning';
import { useLearningStats } from '@/lib/use-learning-stats';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText, extractJson } from '@/lib/utils';
import { toast } from 'sonner';
import type { IReadingContent, IParagraph, TransMode } from '@/data/reading';
import { buildPages } from '@/data/reading';
import type { SpeechMeta } from '@/data/speeches';
import PageReader from './components/PageReader';

// ── Types ──
type Level = 'beginner' | 'intermediate' | 'advanced';
type MainTab = 'books' | 'publications' | 'ai' | 'wikipedia' | 'speeches';

const LEVELS: { key: Level; label: string; color: string; desc: string }[] = [
  { key: 'beginner', label: '初级', color: '#00B894', desc: '简单句式，常用词汇' },
  { key: 'intermediate', label: '中级', color: '#F59E0B', desc: '复合句，丰富表达' },
  { key: 'advanced', label: '高级', color: '#6C5CE7', desc: '学术/专业级别' },
];

const TOPICS: { key: string; label: string; icon: string }[] = [
  { key: 'tech', label: '科技', icon: '💻' },
  { key: 'science', label: '科学', icon: '🔬' },
  { key: 'history', label: '历史', icon: '📜' },
  { key: 'culture', label: '文化', icon: '🎨' },
  { key: 'philosophy', label: '哲学', icon: '🤔' },
  { key: 'nature', label: '自然', icon: '🌍' },
  { key: 'business', label: '商业', icon: '💼' },
  { key: 'literature', label: '文学', icon: '📚' },
];

const MAINTABS: { key: MainTab; label: string; icon: typeof BookOpen }[] = [
  { key: 'books', label: '书籍', icon: Library },
  { key: 'publications', label: '刊物', icon: Newspaper },
  { key: 'ai', label: 'AI 生成', icon: Sparkles },
  { key: 'wikipedia', label: '维基百科', icon: Globe },
  { key: 'speeches', label: '演讲', icon: Mic },
];

// ── Curated Publications ──
const PUBLICATIONS: IReadingContent[] = [
  {
    id: 'pub-tech-ai', type: 'publication',
    title: 'How AI is Reshaping the Future of Work', zhTitle: 'AI如何重塑未来工作',
    author: 'The Economist', source: 'The Economist', topic: 'tech', difficulty: 'intermediate',
    pages: buildPages([
      { en: 'Artificial intelligence is no longer a distant dream. It is here, reshaping industries from healthcare to finance. The question is no longer whether AI will change work, but how — and who will benefit.', zh: '人工智能不再是遥远的梦想。它已经到来，正在重塑从医疗保健到金融的各个行业。问题不再是AI是否会改变工作，而是如何改变——以及谁将受益。' },
      { en: 'Recent studies suggest that up to 40% of current jobs could be automated within the next two decades. But this doesn\'t mean mass unemployment. Instead, we are likely to see a fundamental shift in the nature of work itself.', zh: '最近的研究表明，未来二十年内多达40%的现有工作可能会实现自动化。但这并不意味着大规模失业。相反，我们可能会看到工作本质的根本转变。' },
      { en: 'The key is adaptability. Workers who can learn new skills and pivot quickly will thrive. Companies that invest in retraining their workforce will gain a competitive edge in the rapidly evolving marketplace.', zh: '关键在于适应能力。能够学习新技能并快速转型的工人将会蓬勃发展。投资于员工再培训的公司将在快速发展的市场中获得竞争优势。' },
      { en: 'Governments also have a role to play. Education systems need to be redesigned to prepare students for jobs that don\'t yet exist, using technologies that haven\'t been invented, to solve problems we can\'t yet imagine.', zh: '政府也可以发挥作用。教育体系需要重新设计，让学生为尚不存在的工作做好准备，使用尚未发明的技术，解决我们尚无法想象的问题。' },
    ]), totalWords: 0,
  },
  {
    id: 'pub-science-climate', type: 'publication',
    title: 'Climate Solutions: Beyond Carbon Neutral', zhTitle: '气候解决方案：超越碳中和',
    author: 'Nature Magazine', source: 'Nature', topic: 'science', difficulty: 'intermediate',
    pages: buildPages([
      { en: 'The race to net zero carbon emissions is the defining challenge of our time. Countries around the world have pledged to reach carbon neutrality by 2050. But scientists say that even this ambitious goal may not be enough.', zh: '实现净零碳排放的竞赛是我们这个时代的决定性挑战。世界各国已承诺到2050年实现碳中和。但科学家们表示，即使这一雄心勃勃的目标也可能不够。' },
      { en: 'The latest climate models suggest we need not just carbon neutrality, but carbon negativity — actively removing CO2 from the atmosphere. Technologies like direct air capture, enhanced weathering, and ocean fertilization are being explored.', zh: '最新的气候模型表明，我们不仅需要碳中和，还需要碳负排放——主动从大气中移除二氧化碳。直接空气捕获、增强风化和海洋施肥等技术正在探索中。' },
      { en: 'Renewable energy has made remarkable progress. Solar and wind power are now cheaper than fossil fuels in most parts of the world. But the intermittency problem — the fact that the sun doesn\'t always shine and the wind doesn\'t always blow — remains a major hurdle.', zh: '可再生能源取得了显著进展。太阳能和风能现在在世界大多数地区比化石燃料更便宜。但间歇性问题——太阳不会一直照耀，风不会一直吹——仍然是一个主要障碍。' },
      { en: 'The solution lies in a combination of approaches: better battery storage, smart grids that can balance supply and demand, and perhaps most importantly, a global commitment to innovation and cooperation. The window for action is closing, but it is not yet shut.', zh: '解决方案在于多种方法的结合：更好的电池存储，能够平衡供需的智能电网，也许最重要的是，全球对创新和合作的承诺。行动的时间窗口正在关闭，但尚未完全关闭。' },
    ]), totalWords: 0,
  },
  {
    id: 'pub-culture-language', type: 'publication',
    title: 'The Hidden Power of Bilingualism', zhTitle: '双语能力的隐藏力量',
    author: 'Psychology Today', source: 'Psychology Today', topic: 'culture', difficulty: 'beginner',
    pages: buildPages([
      { en: 'Speaking two languages is like having a superpower. It doesn\'t just help you order coffee in Paris or negotiate business deals in Tokyo. Research shows that bilingualism fundamentally changes the structure and function of your brain.', zh: '说两种语言就像拥有超能力。它不仅可以帮助你在巴黎点咖啡或在东京谈判商业交易。研究表明，双语能力从根本上改变了大脑的结构和功能。' },
      { en: 'Bilingual children show better executive function — the ability to focus attention, ignore distractions, and switch between tasks. These cognitive advantages persist throughout life and may even delay the onset of dementia by up to five years.', zh: '双语儿童表现出更好的执行功能——集中注意力、忽略干扰和切换任务的能力。这些认知优势贯穿一生，甚至可以将痴呆症的发病延迟长达五年。' },
      { en: 'But the benefits go beyond cognition. Bilinguals tend to be more empathetic and culturally aware. Learning a second language opens a window into another way of seeing the world, another set of values and traditions.', zh: '但好处超越了认知。双语者往往更具同理心和文化意识。学习第二语言打开了了解另一种看待世界的方式、另一套价值观和传统的窗口。' },
      { en: 'The best time to start? Right now. While children have an advantage in achieving native-like pronunciation, adults can learn vocabulary and grammar just as effectively. The key is consistency and immersion — even 15 minutes a day can make a huge difference over time.', zh: '最佳开始时间？现在。虽然儿童在实现母语般的发音方面有优势，但成年人同样可以有效地学习词汇和语法。关键是坚持和沉浸——即使每天15分钟，随着时间的推移也能产生巨大的差异。' },
    ]), totalWords: 0,
  },
  {
    id: 'pub-history-renaissance', type: 'publication',
    title: 'What the Renaissance Teaches Us About Innovation', zhTitle: '文艺复兴教给我们的创新之道',
    author: 'History Today', source: 'History Today', topic: 'history', difficulty: 'advanced',
    pages: buildPages([
      { en: 'The Renaissance was not just a period of artistic brilliance. It was a fundamental rethinking of what humans could achieve. From Leonardo da Vinci to Michelangelo, the Renaissance produced polymaths — individuals who excelled across multiple disciplines.', zh: '文艺复兴不仅仅是一个艺术辉煌的时期。它是对人类能够实现什么的根本性重新思考。从列奥纳多·达·芬奇到米开朗基罗，文艺复兴产生了通才——在多个学科中表现出色的个人。' },
      { en: 'What made the Renaissance possible? One factor was the rediscovery of classical texts. Another was the patronage system, where wealthy families like the Medici funded artists and thinkers. But perhaps the most important factor was the cross-pollination of ideas.', zh: '是什么使文艺复兴成为可能？一个因素是对古典文本的重新发现。另一个是赞助制度，像美第奇这样的富裕家族资助艺术家和思想家。但也许最重要的因素是思想的交叉传播。' },
      { en: 'Artists learned from scientists, and scientists learned from artists. The boundaries between disciplines were fluid. This is the lesson for our own time: the biggest breakthroughs often happen at the intersection of fields, not within them.', zh: '艺术家向科学家学习，科学家向艺术家学习。学科之间的界限是流动的。这对我们自己的时代是一个教训：最大的突破往往发生在领域的交叉点，而不是领域内部。' },
    ]), totalWords: 0,
  },
  {
    id: 'pub-business-startup', type: 'publication',
    title: 'The Lean Startup Method: Build, Measure, Learn', zhTitle: '精益创业方法：构建、测量、学习',
    author: 'Harvard Business Review', source: 'HBR', topic: 'business', difficulty: 'intermediate',
    pages: buildPages([
      { en: 'Most startups fail. Not because they build bad products, but because they build products nobody wants. The lean startup methodology, pioneered by Eric Ries, offers a systematic approach to creating and managing startups.', zh: '大多数初创公司会失败。不是因为他们制造了糟糕的产品，而是因为他们制造了没人想要的产品。由埃里克·里斯开创的精益创业方法论提供了一个创建和管理初创公司的系统方法。' },
      { en: 'The core idea is simple: build a minimum viable product (MVP), measure how customers respond, and learn from the data. Then iterate. This cycle of Build-Measure-Learn should happen as quickly as possible — in days or weeks, not months.', zh: '核心理念很简单：构建最小可行产品（MVP），衡量客户的反应，从数据中学习。然后迭代。这个构建-测量-学习的循环应该尽可能快地发生——在几天或几周内，而不是几个月。' },
      { en: 'Instead of writing a detailed business plan and spending years in stealth mode, lean startups embrace validated learning. Every product feature is treated as an experiment. If the data shows customers don\'t care about a feature, it gets cut without mercy.', zh: '精益创业不是写详细的商业计划书并花数年时间在隐秘模式下开发，而是拥抱经过验证的学习。每个产品功能都被视为一个实验。如果数据显示客户不关心某个功能，它就会被毫不留情地砍掉。' },
      { en: 'This approach has been adopted not just by tech startups, but by large corporations, government agencies, and even schools. The principles of lean thinking — eliminating waste, amplifying learning, and deciding as late as possible — are universal.', zh: '这种方法不仅被科技初创公司采用，还被大公司、政府机构甚至学校所采用。精益思维的原则——消除浪费、放大学习、尽可能晚做决定——是普遍适用的。' },
    ]), totalWords: 0,
  },
];

// Fix total words for publications
PUBLICATIONS.forEach((p) => {
  (p as any).totalWords = p.pages.reduce((sum, page) =>
    sum + page.paragraphs.reduce((s, para) => s + para.en.split(/\s+/).filter(Boolean).length, 0), 0);
});

// ── Wikipedia curated list ──
const WIKI_ARTICLES: { title: string; zhTitle: string; topic: string }[] = [
  { title: 'Climate change', zhTitle: '气候变化', topic: 'science' },
  { title: 'Artificial intelligence', zhTitle: '人工智能', topic: 'tech' },
  { title: 'Renaissance', zhTitle: '文艺复兴', topic: 'history' },
  { title: 'Industrial Revolution', zhTitle: '工业革命', topic: 'history' },
  { title: 'Quantum mechanics', zhTitle: '量子力学', topic: 'science' },
  { title: 'Ancient Egypt', zhTitle: '古埃及', topic: 'history' },
  { title: 'Solar System', zhTitle: '太阳系', topic: 'science' },
  { title: 'World War II', zhTitle: '第二次世界大战', topic: 'history' },
  { title: 'Democracy', zhTitle: '民主', topic: 'culture' },
  { title: 'Globalization', zhTitle: '全球化', topic: 'culture' },
  { title: 'Neuroscience', zhTitle: '神经科学', topic: 'science' },
  { title: 'Buddhism', zhTitle: '佛教', topic: 'culture' },
  { title: 'Roman Empire', zhTitle: '罗马帝国', topic: 'history' },
  { title: 'Internet', zhTitle: '互联网', topic: 'tech' },
  { title: 'Evolution', zhTitle: '进化论', topic: 'science' },
  { title: 'French Revolution', zhTitle: '法国大革命', topic: 'history' },
  { title: 'Renewable energy', zhTitle: '可再生能源', topic: 'science' },
  { title: 'Psychology', zhTitle: '心理学', topic: 'science' },
  { title: 'Ancient Greece', zhTitle: '古希腊', topic: 'history' },
  { title: 'Blockchain', zhTitle: '区块链', topic: 'tech' },
  { title: 'Philosophy', zhTitle: '哲学', topic: 'philosophy' },
  { title: 'Great Wall of China', zhTitle: '万里长城', topic: 'history' },
];

interface WikiPage { title: string; extract: string; pageid: number; thumbnail?: { source: string }; }

export default function ArticlePage() {
  const { isConfigured, chat: aiChat } = useAI();
  const tts = useTTS();
  const { dueForReview, state: sm2State } = useWordLearning('all');
  const { addStudyMinutes } = useLearningStats();

  // ── Reading session timer ──
  const readingStartRef = useRef(0);

  // ── Tab + config state ──
  const [mainTab, setMainTab] = useState<MainTab>('books');
  const [level, setLevel] = useState<Level>('intermediate');
  const [topic, setTopic] = useState('tech');

  // ── Reader state ──
  const [readerContent, setReaderContent] = useState<IReadingContent | null>(null);
  const [readerVisible, setReaderVisible] = useState(false);

  // ── Lazy-loaded data (books & speeches are large, load on tab switch) ──
  const [books, setBooks] = useState<IReadingContent[] | null>(null);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [speechMeta, setSpeechMeta] = useState<SpeechMeta[] | null>(null);
  const [buildSpeechFn, setBuildSpeechFn] = useState<((id: string) => IReadingContent | null) | null>(null);
  const [speechesLoaded, setSpeechesLoaded] = useState(false);

  // Load books data when books tab is first selected
  useEffect(() => {
    if (mainTab !== 'books' || booksLoaded) return;
    setBooksLoaded(true);
    import('@/data/books').then((m) => setBooks(m.ALL_BOOKS)).catch(() => setBooks([]));
  }, [mainTab, booksLoaded]);

  // ── AI article generation (shared by free-form + topic grid) ──
  const generateAiArticle = useCallback(async (topic: string) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setAiLoading(true);
    try {
      const levelLabel = LEVELS.find((l) => l.key === level)!.label;
      const result = await aiChat([
        { role: 'system', content: `Write an English article about "${topic}" for ${levelLabel} learners (3-5 paragraphs). Return ONLY valid JSON: {"title":"...","paragraphs":[{"en":"paragraph","zh":"Chinese translation"}]}` },
        { role: 'user', content: `Topic: ${topic}. Level: ${levelLabel}.` },
      ], { temperature: 0.8, maxTokens: 4096 });
      const parsed = extractJson<{ title?: string; paragraphs?: IParagraph[] }>(result);
      if (!parsed || !parsed.paragraphs?.length) { toast.error('AI 生成失败，请重试'); return; }
      // Safety: ensure all paragraphs have en/zh fields
      const safeParagraphs: IParagraph[] = (parsed.paragraphs || []).map((p: any) => ({ en: p?.en || '', zh: p?.zh || '' })).filter((p: IParagraph) => p.en.trim());
      if (!safeParagraphs.length) { toast.error('AI 生成内容为空，请重试'); return; }
      const content: IReadingContent = {
        id: `ai_topic_${Date.now()}`, type: 'ai',
        title: parsed.title || topic, zhTitle: parsed.title || topic,
        source: 'AI 生成', topic, difficulty: level,
        pages: buildPages(safeParagraphs),
        totalWords: safeParagraphs.reduce((s: number, p: IParagraph) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
      };
      openReader(content);
      saveAiArticle(content);
      saveToHistory(parsed.title || topic, content.totalWords.toString(), 'ai');
      setAiTopicInput('');
      toast.success('文章已生成！');
    } catch { toast.error('生成失败，请重试'); }
    finally { setAiLoading(false); }
  }, [isConfigured, aiChat, level]);

  // ── Reading progress check ──
  const getBookProgress = (bookId: string): { page: number; total: number } | null => {
    try {
      const raw = safeStorage.getItem(`__reader_progress_${bookId}`);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p.page > 0 ? { page: p.page, total: 0 } : null;
    } catch { return null; }
  };

  // Load speech data when speeches tab is first selected
  useEffect(() => {
    if (mainTab !== 'speeches' || speechesLoaded) return;
    setSpeechesLoaded(true);
    import('@/data/speeches').then((m) => {
      setSpeechMeta(m.FAMOUS_SPEECHES_META);
      setBuildSpeechFn(() => m.buildSpeechContent);
    }).catch(() => { setSpeechMeta([]); });
  }, [mainTab, speechesLoaded]);

  // ── AI generation ──
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTitle, setAiTitle] = useState('');
  const [aiTopicInput, setAiTopicInput] = useState('');

  // ── Saved AI articles ──
  const AI_ARTICLES_KEY = '__nativethink_ai_articles';
  const [aiArticles, setAiArticles] = useState<IReadingContent[]>(() => {
    try { const s = safeStorage.getItem(AI_ARTICLES_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  const saveAiArticle = (content: IReadingContent) => {
    setAiArticles((prev) => {
      const next = [content, ...prev].slice(0, 50);
      safeStorage.setItem(AI_ARTICLES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const deleteAiArticle = (id: string) => {
    setAiArticles((prev) => {
      const next = prev.filter((a) => a.id !== id);
      safeStorage.setItem(AI_ARTICLES_KEY, JSON.stringify(next));
      return next;
    });

  // Reload AI articles when cloud sync pulls data from other devices
  useEffect(() => {
    const reload = () => {
      try {
        const s = safeStorage.getItem(AI_ARTICLES_KEY);
        if (s) setAiArticles(JSON.parse(s));
      } catch { /* */ }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes("__nativethink_ai_articles")) reload();
    };
    window.addEventListener("storage", onStorage);
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  };

  // ── Wikipedia ──
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiThumbnails, setWikiThumbnails] = useState<Record<string, string>>({});
  const wikiThumbsLoaded = useRef(false);

  // ── History ──
  const HISTORY_KEY = '__nativethink_article_history';
  interface HistoryEntry { id: string; title: string; source: string; createdAt: string; meta?: { wikiTitle?: string; speechId?: string; bookId?: string; pubId?: string; }; }
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { const s = safeStorage.getItem(HISTORY_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);

  const saveToHistory = (title: string, _wordCount: string, source: string, meta?: HistoryEntry['meta']) => {
    setHistory((prev) => {
      const entry: HistoryEntry = { id: Date.now().toString(36), title, source, createdAt: new Date().toISOString(), meta };
      return [entry, ...prev].slice(0, 100);
    });
  };

  const handleHistoryClick = (entry: HistoryEntry) => {
    if (!entry.meta) return;
    const { wikiTitle, speechId, bookId } = entry.meta;
    if (wikiTitle) {
      setWikiQuery(wikiTitle);
      searchWikipedia(wikiTitle);
    } else if (speechId) {
      // Switch to speeches tab and load
      setMainTab('speeches');
      // Delay to ensure speechMeta is loaded
      setTimeout(() => loadSpeech(speechId), 100);
    } else if (bookId) {
      // Books can only be reopened from the books tab
      const book = books?.find((b) => b.id === bookId);
      if (book) { openReader(book); }
    }
  };

  // ── AI generate dialog ──
  const [genDialogOpen, setGenDialogOpen] = useState(false);
  const [genType, setGenType] = useState<'article' | 'book' | 'publication'>('article');
  const [genTopic, setGenTopic] = useState('technology');
  const [genLevel, setGenLevel] = useState<Level>('intermediate');
  const [genChapters, setGenChapters] = useState(3);

  // ── AI generation (articles + book chapters) ──
  const generateContent = useCallback(async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setAiLoading(true);
    try {
      const levelLabel = LEVELS.find((l) => l.key === genLevel)!.label;
      if (genType === 'book') {
        // Generate book chapters
        const result = await aiChat([
          { role: 'system', content: `You are an English writer. Write a mini-book with ${genChapters} chapters about "${genTopic}" for ${levelLabel} English learners. Each chapter should be 2-3 paragraphs. Return ONLY valid JSON: {"title":"book title","chapters":[{"chapterTitle":"Chapter 1 title","paragraphs":[{"en":"English paragraph","zh":"Chinese translation"}]}]}` },
          { role: 'user', content: `Write a ${genChapters}-chapter mini-book about ${genTopic}. Level: ${levelLabel}.` },
        ], { temperature: 0.8, maxTokens: 4096 });
        const parsed = extractJson<{ title?: string; chapters?: { chapterTitle?: string; paragraphs: IParagraph[] }[] }>(result);
        if (!parsed?.chapters?.length) { toast.error('AI 生成失败，请重试'); return; }
        const allParagraphs: IParagraph[] = [];
        for (const ch of parsed.chapters) {
          if (!ch?.paragraphs) continue;
          allParagraphs.push({ en: `📖 ${ch.chapterTitle || ''}`, zh: '' });
          for (const p of ch.paragraphs) allParagraphs.push(p);
        }
        const content: IReadingContent = {
          id: `ai_book_${Date.now()}`, type: 'ai',
          title: parsed.title || genTopic, zhTitle: parsed.title || genTopic,
          author: 'AI Generated', source: 'AI 生成书籍', topic: genTopic, difficulty: genLevel,
          pages: buildPages(allParagraphs),
          totalWords: allParagraphs.reduce((s, p) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
        };
        openReader(content);
        saveAiArticle(content);
        toast.success(`已生成 ${genChapters} 章书籍！`);
      } else {
        // Generate article/publication
        const result = await aiChat([
          { role: 'system', content: `You are an English writer. Write an engaging English ${genType === 'publication' ? 'magazine article' : 'article'} about "${genTopic}" for ${levelLabel} learners (4-6 paragraphs). Return ONLY valid JSON: {"title":"...","paragraphs":[{"en":"English paragraph","zh":"Chinese translation"}]}` },
          { role: 'user', content: `Write an article about ${genTopic}. Level: ${levelLabel}.` },
        ], { temperature: 0.8, maxTokens: 4096 });
        const parsed = extractJson<{ title?: string; paragraphs?: IParagraph[] }>(result);
        if (!parsed?.paragraphs?.length) { toast.error('AI 生成失败，请重试'); return; }
        const safeParagraphs: IParagraph[] = (parsed.paragraphs || []).map((p: any) => ({ en: p?.en || '', zh: p?.zh || '' })).filter((p: IParagraph) => p.en.trim());
        if (!safeParagraphs.length) { toast.error('AI 生成内容为空，请重试'); return; }
        const content: IReadingContent = {
          id: `ai_${genType}_${Date.now()}`, type: 'ai',
          title: parsed.title || genTopic, zhTitle: parsed.title || genTopic,
          author: 'AI Generated', source: genType === 'publication' ? 'AI 生成刊物' : 'AI 生成文章',
          topic: genTopic, difficulty: genLevel,
          pages: buildPages(safeParagraphs),
          totalWords: safeParagraphs.reduce((s: number, p: IParagraph) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
        };
        openReader(content);
        saveAiArticle(content);
        toast.success(genType === 'publication' ? '刊物文章已生成！' : '文章已生成！');
      }
      setGenDialogOpen(false);
    } catch { toast.error('生成失败'); }
    finally { setAiLoading(false); }
  }, [isConfigured, genType, genTopic, genLevel, genChapters, aiChat]);

  // ── Wikipedia ──
  const searchWikipedia = useCallback(async (title?: string) => {
    const q = (title || wikiQuery).trim();
    if (!q) return;
    setWikiLoading(true);
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
      if (!res.ok) { toast.error('未找到该条目'); return; }
      const page: WikiPage = await res.json();
      if (!page.extract) { toast.error('该条目内容为空'); return; }
      const paragraphs: IParagraph[] = (page.extract || '')
        .split(/\n\n+/)
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter((p) => p.length > 40)
        .map((en) => ({ en, zh: '' }));
      if (!paragraphs.length) { toast.error('该条目无可读内容'); return; }
      const content: IReadingContent = {
        id: `wiki_${page.pageid}`, type: 'wikipedia',
        title: page.title, zhTitle: page.title,
        source: 'Wikipedia', topic: 'general', difficulty: 'advanced' as Level,
        cover: page.thumbnail?.source,
        pages: buildPages(paragraphs),
        totalWords: paragraphs.reduce((s, p) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
      };
      openReader(content);
      saveToHistory(page.title, content.totalWords.toString(), 'wikipedia', { wikiTitle: page.title });
      toast.success(`已加载：${page.title}`);
    } catch { toast.error('加载失败'); }
    finally { setWikiLoading(false); }
  }, [wikiQuery]);

  // ── Speech ──
  const loadSpeech = useCallback(async (speechId: string) => {
    const meta = speechMeta?.find((m) => m.id === speechId);
    if (!meta) { toast.error('未找到演讲'); return; }
    const existing = buildSpeechFn?.(speechId);
    if (existing) {
      openReader(existing);
      saveToHistory(meta.zhTitle || meta.title, existing.totalWords.toString(), 'speeches', { speechId });
      toast.success(`已加载：${meta.zhTitle}`);
      return;
    }
    toast.error('该演讲暂不可用');
  }, [speechMeta, buildSpeechFn]);

  // ── AI article generation (from review words) ──
  const generateFromReviewWords = useCallback(async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const words = dueForReview.slice(0, 10);
    if (words.length < 3) { toast.error('复习词汇不足（至少需要 3 个）'); return; }
    setAiLoading(true);
    try {
      const wordList = words.map((p) => p.wordKey).join(', ');
      const result = await aiChat([
        { role: 'system', content: `Write a short English article (3-5 paragraphs) that naturally incorporates ALL these words: ${wordList}. Return ONLY valid JSON: {"title":"...","paragraphs":[{"en":"paragraph","zh":"Chinese translation"}]}` },
        { role: 'user', content: `Create an article using these words: ${wordList}. Level: ${level}.` },
      ], { temperature: 0.7, maxTokens: 4096 });
      const parsed = extractJson<{ title?: string; paragraphs?: IParagraph[] }>(result);
      if (!parsed?.paragraphs?.length) { toast.error('AI 生成失败，请重试'); return; }
      const content: IReadingContent = {
        id: `rv_${Date.now()}`, type: 'ai',
        title: parsed.title || '复习词汇文章', zhTitle: parsed.title || '复习词汇文章',
        author: 'AI Generated', source: '复习词汇生成',
        topic: 'vocabulary', difficulty: level,
        pages: buildPages(parsed.paragraphs || []),
        totalWords: (parsed.paragraphs || []).reduce((s: number, p: IParagraph) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
      };
      openReader(content);
      saveToHistory(parsed.title || '复习词汇文章', content.totalWords.toString(), 'review-words');
      toast.success(`用 ${words.length} 个词汇生成了文章！`);
    } catch { toast.error('生成失败'); }
    finally { setAiLoading(false); }
  }, [isConfigured, dueForReview, level, aiChat]);

  useEffect(() => { safeStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }, [history]);

  // ── Wikipedia thumbnails ──
  useEffect(() => {
    if (mainTab !== 'wikipedia' || wikiThumbsLoaded.current) return;
    wikiThumbsLoaded.current = true;
    let cancelled = false;
    (async () => {
      // Load thumbnails in parallel batches of 5
      const batchSize = 5;
      for (let i = 0; i < WIKI_ARTICLES.length && !cancelled; i += batchSize) {
        const batch = WIKI_ARTICLES.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(async (article) => {
          if (cancelled) return;
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article.title)}`,
              { signal: controller.signal },
            );
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              if (data.thumbnail?.source) setWikiThumbnails((prev) => ({ ...prev, [article.title]: data.thumbnail.source }));
            }
          } catch { /* skip failed thumbnails */ }
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [mainTab]);

  // ── TOC (table of contents) for books/publications ──
  const [tocVisible, setTocVisible] = useState(false);
  const [tocContent, setTocContent] = useState<IReadingContent | null>(null);
  const [readerStartPage, setReaderStartPage] = useState(0);

  const showToc = (content: IReadingContent) => {
    setTocContent(content);
    setTocVisible(true);
  };

  const startReading = (startPage: number) => {
    if (!tocContent) return;
    setTocVisible(false);
    readingStartRef.current = Date.now();
    setReaderStartPage(startPage);
    setReaderContent(tocContent);
    setReaderVisible(true);
  };

  // ── Reader open/close — track reading time ──
  const openReader = (content: IReadingContent, startPage = 0) => {
    readingStartRef.current = Date.now();
    setReaderStartPage(startPage);
    setReaderContent(content);
    setReaderVisible(true);
  };

  const closeReader = () => {
    if (readingStartRef.current > 0) {
      const minutes = Math.round((Date.now() - readingStartRef.current) / 60000 * 10) / 10;
      if (minutes >= 0.1) addStudyMinutes(minutes, 'articles');
      readingStartRef.current = 0;
    }
    setReaderVisible(false);
  };

  // For books/publications: show TOC first instead of opening reader directly
  const handleOpenBook = (content: IReadingContent) => {
    if (content.pages.length > 4) {
      showToc(content); // multi-page → show TOC
    } else {
      openReader(content); // short → open directly
    }
  };

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black italic text-foreground tracking-tight">文章阅读</h1>
          <p className="text-muted-foreground text-xs font-medium">英文阅读与学习</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="rounded-2xl text-[10px] font-bold gap-1">
            <Clock className="size-3.5" />历史
          </Button>
          <Button variant="outline" size="sm" onClick={() => setGenDialogOpen(true)} className="rounded-2xl text-[10px] font-bold gap-1 bg-[#00B894]/5 border-[#00B894]/30 text-[#00B894]">
            <Wand2 className="size-3.5" />AI 生成
          </Button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <Card className="rounded-[28px] border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-black">阅读历史</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无记录</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {history.slice(0, 20).map((h) => {
                  const clickable = !!h.meta?.wikiTitle || !!h.meta?.speechId || (!!h.meta?.bookId && !!books);
                  return (
                  <button
                    key={h.id}
                    onClick={() => clickable && handleHistoryClick(h)}
                    disabled={!clickable}
                    className={cn(
                      'w-full flex items-center gap-2 text-xs text-left',
                      clickable ? 'hover:bg-muted rounded-lg p-1 -mx-1 cursor-pointer' : 'p-1',
                    )}
                    title={clickable ? '点击重新打开' : (h.source === 'ai' || h.source === 'review-words' ? 'AI 生成内容无法恢复' : '数据未加载')}
                  >
                    <Badge className="text-[8px] rounded-full px-2 py-0 shrink-0">{h.source}</Badge>
                    <span className="font-medium truncate flex-1">{h.title}</span>
                    <span className="text-muted-foreground shrink-0">{new Date(h.createdAt).toLocaleDateString('zh-CN')}</span>
                    {clickable && <ExternalLink className="size-3 text-muted-foreground/40 shrink-0" />}
                  </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Tab selector */}
      <div className="flex gap-1 bg-muted rounded-2xl p-1 overflow-x-auto">
        {MAINTABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all',
                mainTab === tab.key ? 'bg-white dark:bg-card text-[#00B894] shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* ── BOOKS TAB ── */}
      {mainTab === 'books' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Library className="size-5 text-[#00B894]" />
            <span className="text-sm font-black">{books ? `${books.length} 本公版书籍` : '加载中...'} · 点击阅读</span>
          </div>
          {!books ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-[24px] border-border border bg-muted/30 animate-pulse p-5">
                  <div className="flex items-start gap-3">
                    <div className="size-12 rounded-2xl bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded-lg w-3/4" />
                      <div className="h-3 bg-muted rounded-lg w-1/2" />
                      <div className="flex gap-2">
                        <div className="h-4 bg-muted rounded-full w-12" />
                        <div className="h-4 bg-muted rounded-full w-10" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => {
              const progress = getBookProgress(book.id);
              const totalPages = book.pages.length;
              const pct = progress && totalPages > 0 ? Math.round((progress.page / totalPages) * 100) : 0;
              return (
              <Card
                key={book.id}
                className="rounded-[24px] border-border hover:border-[#00B894]/40 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => { handleOpenBook(book); saveToHistory(book.zhTitle, '', 'books', { bookId: book.id }); }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="size-12 rounded-2xl bg-gradient-to-br from-[#00B894]/10 to-emerald-100 dark:to-emerald-500/20 flex items-center justify-center text-2xl shrink-0">
                      📖
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black text-foreground group-hover:text-[#00B894] transition-colors line-clamp-2">
                        {book.zhTitle}
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{book.zhAuthor} · {book.title}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className="text-[8px] rounded-full px-2 py-0 bg-muted">{book.difficulty}</Badge>
                        <Badge className="text-[8px] rounded-full px-2 py-0 bg-muted">{book.topic}</Badge>
                        <span className="text-[9px] text-muted-foreground ml-auto">{book.totalWords.toLocaleString()} 词</span>
                      </div>
                      {/* Reading progress */}
                      {progress && progress.page > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="font-bold text-[#00B894]">继续阅读 (第{progress.page}页)</span>
                            <span className="text-muted-foreground font-bold">{pct}%</span>
                          </div>
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-[#00B894] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* ── PUBLICATIONS TAB ── */}
      {mainTab === 'publications' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Newspaper className="size-5 text-[#00B894]" />
            <span className="text-sm font-black">{PUBLICATIONS.length} 篇刊物文章</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PUBLICATIONS.map((pub) => (
              <Card
                key={pub.id}
                className="rounded-[24px] border-border hover:border-[#00B894]/40 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => { handleOpenBook(pub); saveToHistory(pub.zhTitle, '', 'publications'); }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-500/10 dark:to-indigo-500/20 flex items-center justify-center text-lg shrink-0">
                      📰
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black text-foreground group-hover:text-[#00B894] transition-colors line-clamp-2">
                        {pub.zhTitle}
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{pub.author} · {pub.title?.slice(0, 60)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className="text-[8px] rounded-full px-2 py-0 bg-blue-50 dark:bg-blue-500/15 text-blue-600">{pub.source}</Badge>
                        <Badge className="text-[8px] rounded-full px-2 py-0 bg-muted">{pub.difficulty}</Badge>
                        <span className="text-[9px] text-muted-foreground ml-auto">{pub.totalWords.toLocaleString()} 词</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── AI TAB ── */}
      {mainTab === 'ai' && (
        <div className="space-y-4">
          {/* Generate from review words */}
          <Card className="rounded-[28px] border-border bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-foreground">用复习词汇生成文章</h3>
                  <p className="text-[10px] text-muted-foreground">用 SM-2 待复习单词创作文章（需 AI Key）</p>
                </div>
                <Button size="sm" onClick={generateFromReviewWords} disabled={aiLoading || !isConfigured} className="rounded-2xl bg-violet-500 hover:bg-violet-600 text-white text-[10px] font-bold">
                  {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  <span className="ml-1">生成 ({dueForReview.length}词)</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Free-form AI article generation */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">AI 自由生成文章</h3>
            <p className="text-[10px] text-muted-foreground mb-3">输入任意主题，生成英文文章（不限类型）</p>
            <div className="flex gap-2 mb-4">
              <Input
                value={aiTopicInput}
                onChange={(e) => setAiTopicInput(e.target.value)}
                placeholder="输入任何你想阅读的主题…（如：太空探索、咖啡文化、古希腊神话）"
                className="flex-1 rounded-xl text-xs font-bold border-border"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && aiTopicInput.trim() && isConfigured && !aiLoading) {
                    generateAiArticle(aiTopicInput.trim());
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => aiTopicInput.trim() && generateAiArticle(aiTopicInput.trim())}
                disabled={!aiTopicInput.trim() || aiLoading || !isConfigured}
                className="rounded-xl bg-[#00B894] hover:bg-[#00a882] text-white text-[10px] font-bold px-4"
              >
                {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                <span className="ml-1">生成</span>
              </Button>
            </div>
          </div>

          {/* Topic grid for quick AI article generation */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">或选择预设主题</h3>
            <div className="grid grid-cols-4 gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => generateAiArticle(t.label)}
                  disabled={aiLoading}
                  className={cn(
                    'p-4 rounded-2xl border-2 text-center transition-all',
                    'border-border hover:border-[#00B894]/50 hover:bg-[#00B894]/5',
                    'disabled:opacity-50',
                  )}
                >
                  <div className="text-2xl mb-1">{t.icon}</div>
                  <div className="text-xs font-bold">{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Saved AI articles */}
          {aiArticles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  已保存的 AI 文章 ({aiArticles.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {aiArticles.map((a) => (
                  <Card
                    key={a.id}
                    className="rounded-2xl border-border hover:border-[#00B894]/40 hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => openReader(a)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-black text-foreground group-hover:text-[#00B894] transition-colors line-clamp-1">
                            {a.zhTitle || a.title}
                          </h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {a.totalWords.toLocaleString()} 词 · {a.difficulty}
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteAiArticle(a.id); }}
                          className="shrink-0 p-1 rounded-lg text-muted-foreground/30 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                          title="删除"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── WIKIPEDIA TAB ── */}
      {mainTab === 'wikipedia' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex gap-2">
            <Input
              value={wikiQuery}
              onChange={(e) => setWikiQuery(e.target.value)}
              placeholder="搜索 Wikipedia 英文条目..."
              className="rounded-2xl text-sm"
              onKeyDown={(e) => e.key === 'Enter' && searchWikipedia()}
            />
            <Button onClick={() => searchWikipedia()} disabled={wikiLoading} className="rounded-2xl">
              {wikiLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>
          {/* Curated articles */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">精选条目</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {WIKI_ARTICLES.map((a) => (
                <Card
                  key={a.title}
                  className="rounded-2xl border-border hover:border-[#00B894]/40 hover:shadow-sm transition-all cursor-pointer overflow-hidden"
                  onClick={() => searchWikipedia(a.title)}
                >
                  {wikiThumbnails[a.title] && (
                    <img
                      src={wikiThumbnails[a.title]}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      className="w-full h-24 object-cover"
                    />
                  )}
                  <CardContent className="p-3">
                    <p className="text-xs font-bold line-clamp-2">{a.zhTitle}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{a.title}</p>
                    <Badge className="text-[7px] rounded-full px-2 py-0 mt-1">{a.topic}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SPEECHES TAB ── */}
      {mainTab === 'speeches' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Mic className="size-5 text-[#00B894]" />
            <span className="text-sm font-black">{speechMeta ? `${speechMeta.length} 篇演讲` : '加载中...'} · 点击阅读</span>
          </div>
          {!speechMeta ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-[24px] border-border border bg-muted/30 animate-pulse overflow-hidden">
                  <div className="h-32 bg-muted" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-muted rounded-full w-16" />
                    <div className="h-4 bg-muted rounded-lg w-3/4" />
                    <div className="h-3 bg-muted rounded-lg w-1/2" />
                    <div className="h-3 bg-muted rounded-lg w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {speechMeta.map((speech) => {
              // Mark speeches without full text content
              const hasContent = speech.id !== 'ted-gates-climate' && speech.id !== 'ted-adichie-single' && speech.id !== 'ted-urban-procrastination' && speech.id !== 'ted-godin-tribes' && speech.id !== 'rand-Atlas' && speech.id !== 'mandela-inaugural' && speech.id !== 'greta-un-climate' && speech.id !== 'emma-heforshe' && speech.id !== 'malala-un';
              return (
              <Card
                key={speech.id}
                className={cn(
                  'rounded-[24px] border-border hover:shadow-md transition-all overflow-hidden group',
                  hasContent ? 'hover:border-[#00B894]/40 cursor-pointer' : 'opacity-60 cursor-default',
                )}
                onClick={() => hasContent && loadSpeech(speech.id)}
              >
                {speech.image ? (
                  <img
                    src={speech.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center text-3xl">🎙️</div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge className="text-[8px] rounded-full px-2 py-0 bg-amber-50 dark:bg-amber-500/15 text-amber-600">{speech.type}</Badge>
                    {!hasContent && (
                      <Badge className="text-[8px] rounded-full px-2 py-0 bg-rose-50 dark:bg-rose-500/15 text-rose-500">即将上线</Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-black text-foreground group-hover:text-[#00B894] transition-colors line-clamp-2">
                    {speech.zhTitle}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{speech.author} · {speech.year}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2 italic">{speech.preview}</p>
                </CardContent>
              </Card>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* ── AI Generate Dialog ── */}
      <Dialog open={genDialogOpen} onOpenChange={setGenDialogOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden">
          <div className="p-6 border-b border-border bg-gradient-to-r from-[#00B894]/5 to-emerald-50 dark:to-emerald-500/10">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <Wand2 className="size-5 text-[#00B894]" />AI 生成内容
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            {/* Type selector */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 block">内容类型</label>
              <div className="flex gap-2">
                {([
                  { key: 'article' as const, label: '文章' },
                  { key: 'book' as const, label: '书籍章节' },
                  { key: 'publication' as const, label: '刊物文章' },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setGenType(t.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                      genType === t.key ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]' : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                    )}
                  >{t.label}</button>
                ))}
              </div>
            </div>
            {/* Topic */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 block">主题</label>
              <Input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="输入主题..." className="rounded-xl" />
            </div>
            {/* Level */}
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 block">难度等级</label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => setGenLevel(l.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                      genLevel === l.key ? 'border-[#00B894] bg-[#00B894]/10 text-[#00B894]' : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                    )}
                  >{l.label}</button>
                ))}
              </div>
            </div>
            {/* Chapters (book mode) */}
            {genType === 'book' && (
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 block">章节数: {genChapters}</label>
                <input type="range" min={2} max={8} value={genChapters} onChange={(e) => setGenChapters(Number(e.target.value))} className="w-full" />
              </div>
            )}
            {/* Generate button */}
            <Button
              onClick={generateContent}
              disabled={aiLoading || !isConfigured}
              className="w-full rounded-2xl bg-[#00B894] hover:bg-[#00A080] text-white text-sm font-black"
            >
              {aiLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Wand2 className="size-4 mr-2" />}
              生成
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── TOC Dialog (chapter selection for books/publications) ── */}
      <Dialog open={tocVisible} onOpenChange={setTocVisible}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden max-h-[80vh] flex flex-col">
          <div className="p-5 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 shrink-0">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                <BookOpen className="size-5 text-[#00B894]" />
                {tocContent?.zhTitle || tocContent?.title || '目录'}
              </DialogTitle>
              {tocContent?.author && (
                <p className="text-xs text-muted-foreground mt-1">{tocContent.author}</p>
              )}
            </DialogHeader>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-1">
              {tocContent?.pages.map((page, i) => {
                const firstPara = page.paragraphs[0];
                const preview = firstPara?.en?.slice(0, 200) || `第 ${i + 1} 页`;
                const zhPreview = firstPara?.zh?.slice(0, 120) || '';
                const wordCount = page.paragraphs.reduce((s, p) => s + p.en.split(/\s+/).filter(Boolean).length, 0);
                return (
                  <button key={i} onClick={() => startReading(i)}
                    className="w-full text-left p-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors border border-transparent hover:border-[#00B894]/20 group">
                    <div className="flex gap-2">
                      <span className="size-7 rounded-xl bg-[#00B894]/10 text-[#00B894] flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground group-hover:text-[#00B894] transition-colors line-clamp-2 leading-relaxed">
                          {preview}{preview.length >= 200 ? '…' : ''}
                        </p>
                        {zhPreview ? (
                          <p className="text-[11px] text-[#6C5CE7]/70 line-clamp-1 mt-0.5 leading-relaxed">
                            {zhPreview}{zhPreview.length >= 120 ? '…' : ''}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {page.paragraphs.length} 段 · ~{wordCount} 词
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-muted-foreground/60">{page.paragraphs.length} 段 · ~{wordCount} 词</span>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-[#00B894] transition-colors shrink-0 self-center" />
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── PageReader Fullscreen ── */}
      {readerVisible && readerContent && (
        <PageReader content={readerContent} onClose={closeReader} startPage={readerStartPage} />
      )}
    </div>
  );
}
