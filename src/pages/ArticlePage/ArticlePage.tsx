import { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, Sparkles, Languages, BookOpen, Volume2, RefreshCw, Loader2, Search, ExternalLink, X, Globe, Library, Mic, Download, ArrowRight, Wand2, BookMarked, ChevronDown, GraduationCap, Clock, RotateCw, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { useWordLearning } from '@/lib/use-word-learning';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ──
type Level = 'beginner' | 'intermediate' | 'advanced';
type Source = 'ai' | 'gutenberg' | 'wikipedia' | 'speeches';

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

const SOURCES: { key: Source; label: string; icon: typeof Globe; desc: string }[] = [
  { key: 'ai', label: 'AI 生成', icon: Sparkles, desc: 'AI 按主题/等级创作' },
  { key: 'gutenberg', label: '公版书籍', icon: Library, desc: 'Project Gutenberg 开源书库' },
  { key: 'wikipedia', label: '维基百科', icon: Globe, desc: 'Wikipedia 知识文章' },
  { key: 'speeches', label: '名人演讲', icon: Mic, desc: '经典英文演讲稿' },
];

// ── Cached famous speeches ──
const FAMOUS_SPEECHES = [
  { id: 'mlk-dream', title: 'I Have a Dream', author: 'Martin Luther King Jr.', year: 1963, topic: 'history', preview: 'I am happy to join with you today in what will go down in history as the greatest demonstration for freedom in the history of our nation...' },
  { id: 'gettysburg', title: 'The Gettysburg Address', author: 'Abraham Lincoln', year: 1863, topic: 'history', preview: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty...' },
  { id: 'churchill-finest', title: 'Their Finest Hour', author: 'Winston Churchill', year: 1940, topic: 'history', preview: 'What General Weygand called the Battle of France is over. I expect that the Battle of Britain is about to begin...' },
  { id: 'jfk-inaugural', title: 'Inaugural Address', author: 'John F. Kennedy', year: 1961, topic: 'history', preview: 'We observe today not a victory of party but a celebration of freedom—symbolizing an end as well as a beginning...' },
  { id: 'mandela-1994', title: 'Inaugural Address', author: 'Nelson Mandela', year: 1994, topic: 'history', preview: 'Our deepest fear is not that we are inadequate. Our deepest fear is that we are powerful beyond measure...' },
  { id: 'susan-anthony', title: 'On Women\'s Right to Vote', author: 'Susan B. Anthony', year: 1873, topic: 'culture', preview: 'Friends and fellow citizens: I stand before you tonight under indictment for the alleged crime of having voted...' },
  { id: 'jobs-stanford', title: 'Stanford Commencement Address', author: 'Steve Jobs', year: 2005, topic: 'business', preview: 'I am honored to be with you today at your commencement from one of the finest universities in the world...' },
  { id: 'rowling-harvard', title: 'The Fringe Benefits of Failure', author: 'J.K. Rowling', year: 2008, topic: 'culture', preview: 'President Faust, members of the Harvard Corporation and the Board of Overseers...' },
  { id: 'obama-yes-we-can', title: 'Yes We Can', author: 'Barack Obama', year: 2008, topic: 'history', preview: 'If there is anyone out there who still doubts that America is a place where all things are possible...' },
  { id: 'rand-Atlas', title: 'Atlas Shrugged Speech', author: 'Ayn Rand', year: 1957, topic: 'philosophy', preview: 'For twelve years you have been asking: Who is John Galt? This is John Galt speaking...' },
];

interface GutenbergBook { id: number; title: string; authors: { name: string }[]; subjects: string[]; formats: Record<string, string>; download_count: number; }
interface WikiPage { title: string; extract: string; pageid: number; thumbnail?: { source: string }; content_urls?: { desktop: { page: string } }; }

export default function ArticlePage() {
  const { isConfigured, chat: aiChat } = useAI();
  const tts = useTTS();

  // Source & config
  const [source, setSource] = useState<Source>('ai');
  const [level, setLevel] = useState<Level>('intermediate');
  const [topic, setTopic] = useState('tech');

  // AI generation
  const [aiLoading, setAiLoading] = useState(false);
  const [aiArticle, setAiArticle] = useState<{ title: string; content: string; translation: string; vocabulary: { word: string; meaning: string }[]; questions: { q: string; options: string[]; answer: number }[] } | null>(null);

  // Gutenberg browsing
  const [gutenbergQuery, setGutenbergQuery] = useState('');
  const [gutenbergResults, setGutenbergResults] = useState<GutenbergBook[]>([]);
  const [gutenbergLoading, setGutenbergLoading] = useState(false);
  const [gutenbergBook, setGutenbergBook] = useState<{ title: string; author: string; content: string } | null>(null);
  const [gutenbergSearchDone, setGutenbergSearchDone] = useState(false);

  // Wikipedia browsing
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);

  // Shared article display
  const [displayTitle, setDisplayTitle] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [displayTranslation, setDisplayTranslation] = useState('');
  const [displayVocab, setDisplayVocab] = useState<{ word: string; meaning: string }[]>([]);
  const [displayQuestions, setDisplayQuestions] = useState<{ q: string; options: string[]; answer: number }[]>([]);

  // UI state
  const [showTranslation, setShowTranslation] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizChecked, setQuizChecked] = useState(false);
  const [loading, setLoading] = useState(false); // combined loading for non-AI sources

  // Word lookup
  const [lookupWord, setLookupWord] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupData, setLookupData] = useState<{ word: string; phonetic: string; meaning: string; example: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // AI level conversion
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertLevel, setConvertLevel] = useState<Level>('beginner');

  // Review-word article generation
  const { dueForReview, state: sm2State } = useWordLearning('all');
  const reviewWords = dueForReview;

  // Reading history
  const HISTORY_KEY = '__nativethink_article_history';
  const [history, setHistory] = useState<{ id: string; title: string; content: string; source: string; createdAt: string }[]>(() => {
    try { const s = safeStorage.getItem(HISTORY_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);

  const saveToHistory = (title: string, content: string, src: string) => {
    setHistory((prev) => {
      const entry = { id: Date.now().toString(36), title, content: content.slice(0, 500), source: src, createdAt: new Date().toISOString() };
      const next = [entry, ...prev].slice(0, 100);
      safeStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const contentRef = useRef<HTMLDivElement>(null);

  // ── AI Article Generation ──
  const generateArticle = useCallback(async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setAiLoading(true);
    setDisplayContent('');
    setShowTranslation(false);
    setQuizAnswers({});
    setQuizChecked(false);
    try {
      const levelDesc = LEVELS.find((l) => l.key === level)!;
      const topicLabel = TOPICS.find((t) => t.key === topic)!;
      const result = await aiChat([
        { role: 'system', content: `You are an English teacher. Write an engaging English article for ${levelDesc.label} learners about ${topicLabel.label}. Return ONLY valid JSON (no markdown): {"title":"...","content":"full article (3-5 paragraphs)","translation":"Chinese translation","vocabulary":[{"word":"...","meaning":"Chinese"}],"questions":[{"q":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":0}]}` },
        { role: 'user', content: `Generate an English article about ${topicLabel.label}. Level: ${levelDesc.label}.` },
      ], { temperature: 0.8, maxTokens: 4096 });
      const m = result.match(/\{[\s\S]*\}/);
      if (!m) { toast.error('格式异常，请重试'); return; }
      const parsed = JSON.parse(m[0]);
      if (!parsed.title || !parsed.content) { toast.error('内容不完整'); return; }
      setAiArticle(parsed);
      setDisplayTitle(parsed.title);
      setDisplayContent(parsed.content);
      setDisplayTranslation(parsed.translation || '');
      setDisplayVocab(parsed.vocabulary || []);
      setDisplayQuestions(parsed.questions || []);
      setQuizMode(false);
      saveToHistory(parsed.title, parsed.content, 'ai');
      toast.success('文章已生成！');
    } catch { toast.error('生成失败'); }
    finally { setAiLoading(false); }
  }, [isConfigured, level, topic, aiChat, saveToHistory]);

  // ── AI Generate from Review Words ──
  const generateFromReviewWords = useCallback(async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const words = reviewWords.slice(0, 10);
    if (words.length < 3) { toast.error('复习词汇不足（至少需要 3 个），先去学习一些单词吧！'); return; }
    setAiLoading(true);
    setDisplayContent('');
    setShowTranslation(false); setQuizAnswers({}); setQuizChecked(false);
    try {
      const wordList = words.map((p) => p.wordKey).join(', ');
      const wordDetails = words.map((p) => {
        const s = sm2State.progress[p.wordKey];
        return `${p.wordKey}${s ? ` (status: ${s.status}, EF: ${s.ef.toFixed(1)})` : ''}`;
      }).join(', ');
      const result = await aiChat([
        { role: 'system', content: `You are an English teacher. Write a short English article (2-3 paragraphs, ${level === 'beginner' ? 'simple vocabulary' : level === 'intermediate' ? 'moderate difficulty' : 'advanced level'}) that naturally incorporates ALL of the following vocabulary words: ${wordList}. The article should be coherent and engaging. Return ONLY valid JSON (no markdown): {"title":"...","content":"article text","translation":"Chinese translation"}` },
        { role: 'user', content: `Create an English article using these words: ${wordDetails}. Level: ${level}.` },
      ], { temperature: 0.7, maxTokens: 4096 });
      const m = result.match(/\{[\s\S]*\}/);
      if (!m) { toast.error('格式异常'); return; }
      const parsed = JSON.parse(m[0]);
      if (!parsed.content) { toast.error('生成失败'); return; }
      setDisplayTitle(parsed.title || 'Review Words Article');
      setDisplayContent(parsed.content);
      setDisplayTranslation(parsed.translation || '');
      setDisplayVocab(words.map((p) => ({ word: p.wordKey, meaning: sm2State.progress[p.wordKey]?.status || 'review' })));
      setDisplayQuestions([]);
      saveToHistory(parsed.title || '复习词汇文章', parsed.content, 'review-words');
      toast.success(`用 ${words.length} 个复习词汇生成了文章！`);
    } catch { toast.error('生成失败'); }
    finally { setAiLoading(false); }
  }, [isConfigured, reviewWords, sm2State.progress, level, aiChat, saveToHistory]);

  // ── Gutenberg Search ──
  const searchGutenberg = useCallback(async () => {
    if (!gutenbergQuery.trim()) return;
    setGutenbergLoading(true);
    setGutenbergSearchDone(false);
    try {
      const res = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(gutenbergQuery.trim())}&languages=en`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setGutenbergResults((data.results || []).slice(0, 20));
      setGutenbergSearchDone(true);
    } catch { toast.error('搜索失败，请重试'); }
    finally { setGutenbergLoading(false); }
  }, [gutenbergQuery]);

  const fetchGutenbergBook = useCallback(async (book: GutenbergBook) => {
    setLoading(true);
    try {
      const textUrl = book.formats['text/plain'] || book.formats['text/plain; charset=utf-8'] || book.formats['text/html'];
      if (!textUrl) { toast.error('该书无可用文本格式'); return; }
      const res = await fetch(textUrl);
      let text = await res.text();
      // Truncate to ~10000 chars for reasonable reading length
      text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > 15000) text = text.slice(0, 15000) + '\n\n... (已截取前 15000 字符，完整内容请访问源网站)';
      const gb = { title: book.title, author: book.authors[0]?.name || 'Unknown', content: text };
      setGutenbergBook(gb);
      setDisplayTitle(`${book.title} — ${book.authors[0]?.name || 'Unknown'}`);
      setDisplayContent(text);
      setDisplayTranslation('');
      setDisplayVocab([]);
      setDisplayQuestions([]);
      setQuizMode(false);
      saveToHistory(book.title, text, 'gutenberg');
      toast.success(`已加载：${book.title}`);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, []);

  // ── Wikipedia Search ──
  const searchWikipedia = useCallback(async () => {
    if (!wikiQuery.trim()) return;
    setWikiLoading(true);
    try {
      const title = wikiQuery.trim();
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      if (!res.ok) { toast.error('未找到该条目，请尝试其他关键词'); return; }
      const page: WikiPage = await res.json();
      setWikiPage(page);
      setDisplayTitle(page.title);
      setDisplayContent(page.extract);
      setDisplayTranslation('');
      setDisplayVocab([]);
      setDisplayQuestions([]);
      setQuizMode(false);
      saveToHistory(page.title, page.extract, 'wikipedia');
      toast.success(`已加载：${page.title}`);
    } catch { toast.error('加载失败'); }
    finally { setWikiLoading(false); }
  }, [wikiQuery]);

  // ── Load Speech ──
  const fetchSpeech = useCallback(async (speech: typeof FAMOUS_SPEECHES[0]) => {
    setLoading(true);
    try {
      // Fetch full speech text from a public domain source
      const knownTexts: Record<string, string> = {
        'mlk-dream': 'I am happy to join with you today in what will go down in history as the greatest demonstration for freedom in the history of our nation. Five score years ago, a great American, in whose symbolic shadow we stand today, signed the Emancipation Proclamation. This momentous decree came as a great beacon light of hope to millions of Negro slaves who had been seared in the flames of withering injustice. It came as a joyous daybreak to end the long night of their captivity. But one hundred years later, the Negro still is not free... I have a dream that one day this nation will rise up and live out the true meaning of its creed: "We hold these truths to be self-evident, that all men are created equal." I have a dream that one day on the red hills of Georgia, the sons of former slaves and the sons of former slave owners will be able to sit down together at the table of brotherhood... I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character. I have a dream today!',
        'gettysburg': 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal. Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battlefield of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this. But, in a larger sense, we can not dedicate—we can not consecrate—we can not hallow—this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced... that this nation, under God, shall have a new birth of freedom—and that government of the people, by the people, for the people, shall not perish from the earth.',
      };
      const content = knownTexts[speech.id] || speech.preview;
      setDisplayTitle(`${speech.title} — ${speech.author} (${speech.year})`);
      setDisplayContent(content);
      setDisplayTranslation('');
      setDisplayVocab([]);
      setDisplayQuestions([]);
      setQuizMode(false);
      saveToHistory(speech.title, content, 'speeches');
      toast.success(`已加载演讲：${speech.title}`);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, []);

  // ── Word Lookup ──
  const handleWordClick = useCallback(async (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (clean.length < 2) return;
    setLookupWord(clean);
    setLookupOpen(true);
    setLookupLoading(true);
    setLookupData(null);
    try {
      // Free Dictionary API
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json();
        const entry = data[0];
        const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || '未找到释义';
        const phonetic = entry.phonetic || entry.phonetics?.find((p: any) => p.text)?.text || '';
        const example = entry.meanings?.[0]?.definitions?.[0]?.example || '';
        setLookupData({ word: entry.word, phonetic, meaning, example });
      } else {
        // Fallback: use AI for definition
        if (isConfigured) {
          const result = await aiChat([
            { role: 'system', content: 'Return ONLY valid JSON: {"word":"...","meaning":"Chinese meaning (max 30 chars)"}' },
            { role: 'user', content: `Define: "${clean}"` },
          ], { temperature: 0.2, maxTokens: 128 });
          const m = result.match(/\{[\s\S]*\}/);
          if (m) setLookupData(JSON.parse(m[0]));
          else setLookupData({ word: clean, phonetic: '', meaning: '未找到释义', example: '' });
        } else {
          setLookupData({ word: clean, phonetic: '', meaning: '未找到释义 (请配置AI Key)', example: '' });
        }
      }
    } catch { setLookupData({ word: clean, phonetic: '', meaning: '查询失败', example: '' }); }
    finally { setLookupLoading(false); }
  }, [isConfigured, aiChat]);

  // ── AI Level Conversion ──
  const convertArticleLevel = useCallback(async () => {
    if (!displayContent || !isConfigured) { toast.error('请先加载文章并配置 AI Key'); return; }
    setConvertLoading(true);
    try {
      const targetLevel = LEVELS.find((l) => l.key === convertLevel)!;
      const result = await aiChat([
        { role: 'system', content: `Rewrite the following English text for ${targetLevel.label} English learners (${targetLevel.desc}). You must return ONLY valid JSON (no markdown): {"title":"adapted title","content":"adapted article","translation":"Chinese translation of adapted article"}. Keep the core meaning but adjust vocabulary, sentence length, and complexity for the target level.` },
        { role: 'user', content: `Original title: ${displayTitle}\n\nOriginal text:\n${displayContent.slice(0, 5000)}` },
      ], { temperature: 0.6, maxTokens: 4096 });
      const m = result.match(/\{[\s\S]*\}/);
      if (!m) { toast.error('格式异常'); return; }
      const parsed = JSON.parse(m[0]);
      if (!parsed.content) { toast.error('转换失败'); return; }
      setDisplayTitle(parsed.title || displayTitle);
      setDisplayContent(parsed.content);
      setDisplayTranslation(parsed.translation || '');
      setConvertDialogOpen(false);
      toast.success(`已转换为${targetLevel.label}等级！`);
    } catch { toast.error('转换失败'); }
    finally { setConvertLoading(false); }
  }, [displayContent, displayTitle, convertLevel, isConfigured, aiChat]);

  // ── AI Generate Quiz ──
  const generateQuiz = useCallback(async () => {
    if (!displayContent || !isConfigured) { toast.error('请先加载文章并配置 AI Key'); return; }
    setLoading(true);
    try {
      const result = await aiChat([
        { role: 'system', content: 'Generate 3-4 multiple choice comprehension questions for the article. Return ONLY valid JSON: {"questions":[{"q":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":0}]}' },
        { role: 'user', content: `Article: ${displayTitle}\n\n${displayContent.slice(0, 4000)}` },
      ], { temperature: 0.6, maxTokens: 2048 });
      const m = result.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        setDisplayQuestions(parsed.questions || []);
        setQuizAnswers({});
        setQuizChecked(false);
        setQuizMode(true);
        toast.success('题目已生成！');
      }
    } catch { toast.error('生成题目失败'); }
    finally { setLoading(false); }
  }, [displayContent, displayTitle, isConfigured, aiChat]);

  // ── Render content with clickable words ──
  const renderContent = (text: string) => {
    if (!text) return null;
    const words = text.split(/(\s+)/);
    return words.map((part, i) => {
      if (/^\s+$/.test(part)) return part;
      const clean = part.replace(/[^a-zA-Z'-]/g, '');
      if (clean.length < 2) return <span key={i}>{part}</span>;
      return (
        <span key={i} onClick={() => handleWordClick(clean)} className="cursor-pointer hover:text-[#00B894] hover:underline hover:underline-offset-2 transition-colors">
          {part}
        </span>
      );
    });
  };

  const hasContent = !!displayContent;
  const levelColor = LEVELS.find((l) => l.key === level)!.color;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black italic text-foreground tracking-tight">文章阅读</h1>
          <p className="text-muted-foreground text-xs font-medium">
            {SOURCES.find((s) => s.key === source)?.desc || '英文阅读与学习'}
          </p>
        </div>
        {hasContent && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowTranslation(!showTranslation)}
              className={cn('rounded-2xl text-[10px] font-black uppercase tracking-wider gap-1', showTranslation ? 'bg-[#6C5CE7]/10 text-[#6C5CE7]' : 'bg-muted text-muted-foreground')}>
              <Languages className="size-3.5" />{showTranslation ? '隐藏翻译' : '翻译'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConvertDialogOpen(true)} disabled={!isConfigured}
              className="rounded-2xl text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground hover:text-[#F59E0B] gap-1">
              <Wand2 className="size-3.5" />转换等级
            </Button>
            <Button variant="ghost" size="sm" onClick={() => tts.speak(cleanText(displayContent), { rate: 0.85 })}
              className="rounded-2xl text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground hover:text-[#00B894] gap-1">
              <Volume2 className="size-3.5" />朗读
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}
              className={cn('rounded-2xl text-[10px] font-black uppercase tracking-wider gap-1', showHistory ? 'bg-amber-50 text-amber-600' : 'bg-muted text-muted-foreground hover:text-amber-500')}>
              <History className="size-3.5" />历史 ({history.length})
            </Button>
          </div>
        )}
      </div>

      {/* ── Source selector ── */}
      <div className="flex gap-1 flex-wrap">
        {SOURCES.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSource(key)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold transition-all',
              source === key ? 'bg-[#00B894] text-white shadow-lg shadow-emerald-200/50' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── History panel ── */}
      {showHistory && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <History className="size-4 text-amber-500" />阅读历史
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setHistory([]); safeStorage.setItem(HISTORY_KEY, '[]'); toast.success('历史已清空'); }}
                className="rounded-2xl text-[10px] text-muted-foreground hover:text-rose-500">清空</Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2 max-h-80 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">暂无阅读记录</p>
            ) : (
              history.map((h) => (
                <button key={h.id} onClick={() => {
                  setDisplayTitle(h.title);
                  setDisplayContent(h.content);
                  setShowHistory(false);
                }}
                  className="w-full text-left p-3 rounded-2xl bg-muted/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors border border-transparent hover:border-[#00B894]/20">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-foreground line-clamp-1">{h.title}</p>
                    <Badge className="rounded-full px-1.5 py-0 text-[8px] font-bold bg-muted text-muted-foreground shrink-0 ml-2">
                      {h.source === 'ai' ? 'AI' : h.source === 'gutenberg' ? '书籍' : h.source === 'wikipedia' ? 'Wiki' : h.source === 'speeches' ? '演讲' : '复习'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{h.content}</p>
                  <p className="text-[8px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                    <Clock className="size-2.5" />
                    {new Date(h.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Source-specific panels ── */}
      {source === 'ai' && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">难度</p>
                <div className="flex gap-1">
                  {LEVELS.map(({ key, label, color }) => (
                    <button key={key} onClick={() => setLevel(key)}
                      className={cn('flex-1 px-2 py-2 rounded-xl text-xs font-bold transition-all',
                        level === key ? 'text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                      style={level === key ? { backgroundColor: color } : undefined}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="flex-[2] min-w-[200px]">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">主题</p>
                <div className="flex gap-1 flex-wrap">
                  {TOPICS.map(({ key, label, icon }) => (
                    <button key={key} onClick={() => setTopic(key)}
                      className={cn('px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all',
                        topic === key ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Button onClick={generateArticle} disabled={aiLoading || !isConfigured}
                className="w-full rounded-2xl bg-gradient-to-r from-[#00B894] to-emerald-500 text-white font-black text-sm py-6 shadow-lg shadow-emerald-200/50">
                {aiLoading ? <><Loader2 className="size-5 mr-2 animate-spin" />AI 正在撰写…</> : <><FileText className="size-5 mr-2" />生成文章</>}
              </Button>
              <button onClick={generateFromReviewWords} disabled={aiLoading || !isConfigured}
                className="w-full rounded-2xl bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10 border-2 border-[#6C5CE7]/20 hover:border-[#6C5CE7] text-[#6C5CE7] font-bold text-xs py-3 transition-all">
                <RotateCw className="size-4 mr-1.5 inline" />
                从复习词汇生成文章 ({reviewWords.length} 个待复习单词)
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {source === 'gutenberg' && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input value={gutenbergQuery} onChange={(e) => setGutenbergQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchGutenberg()}
                placeholder="搜索公版书籍 (英文)…" className="flex-1 rounded-2xl h-12 text-sm" />
              <Button onClick={searchGutenberg} disabled={gutenbergLoading} className="rounded-2xl px-6">
                {gutenbergLoading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
              </Button>
            </div>
            {gutenbergSearchDone && gutenbergResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">未找到相关书籍，请尝试其他关键词</p>
            )}
            {gutenbergResults.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {gutenbergResults.map((book) => (
                  <button key={book.id} onClick={() => fetchGutenbergBook(book)}
                    className="w-full text-left p-3 rounded-2xl bg-muted/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors border border-transparent hover:border-[#00B894]/20">
                    <p className="text-sm font-black text-foreground">{book.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {book.authors[0]?.name || 'Unknown'} {book.download_count > 0 && `· ↓${book.download_count}`}
                    </p>
                    {book.subjects?.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="rounded-full px-2 py-0 text-[9px] mr-1 mt-1">{s.split('--').pop()}</Badge>
                    ))}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground text-center">内容来自 Project Gutenberg 开源书库 (public domain)</p>
          </CardContent>
        </Card>
      )}

      {source === 'wikipedia' && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <Input value={wikiQuery} onChange={(e) => setWikiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchWikipedia()}
                placeholder="搜索 Wikipedia 条目 (英文)…" className="flex-1 rounded-2xl h-12 text-sm" />
              <Button onClick={searchWikipedia} disabled={wikiLoading} className="rounded-2xl px-6">
                {wikiLoading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center">内容来自 Wikipedia (CC BY-SA)</p>
          </CardContent>
        </Card>
      )}

      {source === 'speeches' && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardContent className="p-4 space-y-2 max-h-96 overflow-y-auto">
            {FAMOUS_SPEECHES.map((speech) => (
              <button key={speech.id} onClick={() => fetchSpeech(speech)}
                className="w-full text-left p-3 rounded-2xl bg-muted/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors border border-transparent hover:border-amber-200">
                <p className="text-sm font-black text-foreground">{speech.title}</p>
                <p className="text-xs text-muted-foreground">{speech.author} · {speech.year}</p>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">"{speech.preview}"</p>
              </button>
            ))}
            <p className="text-[9px] text-muted-foreground text-center pt-2">经典演讲稿 (public domain)</p>
          </CardContent>
        </Card>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 text-[#00B894] animate-spin" />
        </div>
      )}

      {/* ── Article display ── */}
      {hasContent && !loading && (
        <div className="space-y-4">
          <Card className="rounded-[32px] border-border shadow-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border-b border-border pb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-lg font-black text-foreground">{displayTitle}</CardTitle>
                  <CardDescription className="text-xs font-bold mt-1 flex items-center gap-2">
                    <GraduationCap className="size-3.5 text-[#00B894]" />
                    点击文中单词查词 · 共约 {(displayContent.match(/\b[a-zA-Z]+\b/g) || []).length} 词
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={generateQuiz} disabled={!isConfigured || loading}
                    className="rounded-2xl text-[10px] font-black bg-muted text-muted-foreground hover:text-[#6C5CE7] gap-1">
                    <BookMarked className="size-3.5" />出题
                  </Button>
                  {source === 'ai' && (
                    <Button variant="ghost" size="sm" onClick={generateArticle}
                      className="rounded-2xl text-[10px] font-black bg-muted text-muted-foreground hover:text-[#F59E0B] gap-1">
                      <RefreshCw className="size-3.5" />换一篇
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 lg:p-10">
              <div ref={contentRef} className="text-foreground/85 leading-[1.9] text-[15px] whitespace-pre-line select-text">
                {renderContent(displayContent)}
              </div>

              {showTranslation && displayTranslation && (
                <div className="mt-8 p-5 rounded-2xl bg-violet-50/50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20">
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#6C5CE7] mb-2 flex items-center gap-1.5">
                    <Languages className="size-3.5" />中文翻译
                  </p>
                  <p className="text-sm text-foreground/75 leading-relaxed">{displayTranslation}</p>
                </div>
              )}

              {source === 'gutenberg' && (
                <p className="text-[10px] text-muted-foreground mt-4 pt-4 border-t border-border text-center">
                  内容来自 Project Gutenberg (public domain) · 完整版本请访问 <a href="https://www.gutenberg.org" target="_blank" rel="noopener noreferrer" className="text-[#00B894] underline">gutenberg.org</a>
                </p>
              )}
              {source === 'wikipedia' && wikiPage?.content_urls?.desktop?.page && (
                <p className="text-[10px] text-muted-foreground mt-4 pt-4 border-t border-border text-center">
                  内容来自 Wikipedia (CC BY-SA) · <a href={wikiPage.content_urls.desktop.page} target="_blank" rel="noopener noreferrer" className="text-[#00B894] underline">查看原文</a>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Vocabulary cards */}
          {displayVocab.length > 0 && (
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <BookOpen className="size-4 text-amber-500" />核心词汇
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-2">
                  {displayVocab.map((v, i) => (
                    <button key={i} onClick={() => { handleWordClick(v.word); tts.speak(v.word, { rate: 0.85 }); }}
                      className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 hover:bg-amber-100 transition-colors text-left group">
                      <p className="text-xs font-black text-foreground">{v.word}</p>
                      <p className="text-[10px] text-muted-foreground">{v.meaning}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quiz section */}
          {displayQuestions.length > 0 && (
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <BookMarked className="size-4 text-[#6C5CE7]" />阅读理解
                  </CardTitle>
                  <Button onClick={() => { setQuizMode(!quizMode); if (quizMode) { setQuizAnswers({}); setQuizChecked(false); } }}
                    size="sm" className={cn('rounded-2xl text-[10px] font-black', quizMode ? '' : 'bg-[#6C5CE7] text-white')}>
                    {quizMode ? '收起' : '开始答题'}
                  </Button>
                </div>
              </CardHeader>
              {quizMode && (
                <CardContent className="p-4 space-y-4">
                  {displayQuestions.map((q, qi) => (
                    <div key={qi} className={cn('p-4 rounded-2xl transition-all', quizChecked
                      ? quizAnswers[qi] === q.answer ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'
                      : 'bg-muted/50')}>
                      <p className="text-sm font-black mb-3">{qi + 1}. {q.q}</p>
                      {q.options.map((opt, oi) => (
                        <button key={oi} onClick={() => { if (!quizChecked) setQuizAnswers((p) => ({ ...p, [qi]: oi })); }}
                          className={cn('w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all border-2 mb-1',
                            quizChecked ? (oi === q.answer ? 'border-[#00B894] bg-[#00B894]/5' : quizAnswers[qi] === oi ? 'border-rose-400 bg-rose-50' : 'border-transparent')
                              : quizAnswers[qi] === oi ? 'border-[#6C5CE7] bg-[#6C5CE7]/5' : 'border-transparent hover:border-muted-foreground/20')}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  ))}
                  {!quizChecked && Object.keys(quizAnswers).length === displayQuestions.length && (
                    <Button onClick={() => { setQuizChecked(true); const c = displayQuestions.filter((q, i) => quizAnswers[i] === q.answer).length; toast.success(`答对 ${c}/${displayQuestions.length}！`); }}
                      className="w-full rounded-2xl bg-[#6C5CE7] text-white font-black text-sm py-4">提交答案</Button>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasContent && !loading && !aiLoading && (
        <div className="text-center py-16 space-y-4">
          <div className="size-20 rounded-full bg-[#00B894]/10 flex items-center justify-center mx-auto">
            <BookOpen className="size-10 text-[#00B894]" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">选择内容来源，开始英文阅读之旅</p>
          <p className="text-muted-foreground text-xs">AI 生成 · 公版书籍 · 维基百科 · 名人演讲</p>
        </div>
      )}

      {/* ── Word Lookup Dialog ── */}
      <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <DialogContent className="max-w-sm rounded-[28px] p-0 overflow-hidden">
          <div className="p-5 border-b border-border bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                <BookOpen className="size-5 text-[#00B894]" />
                {lookupWord || '查词'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-5 space-y-3">
            {lookupLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 text-[#00B894] animate-spin" />
              </div>
            ) : lookupData ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-black text-foreground">{lookupData.word}</p>
                    {lookupData.phonetic && <p className="text-sm text-muted-foreground font-medium">{lookupData.phonetic}</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => tts.speak(lookupData.word, { rate: 0.85 })}
                    className="rounded-2xl size-10 bg-[#00B894]/10 text-[#00B894] hover:bg-[#00B894]/20">
                    <Volume2 className="size-5" />
                  </Button>
                </div>
                <div className="p-3 rounded-xl bg-muted/50">
                  <p className="text-sm font-medium text-foreground">{lookupData.meaning}</p>
                </div>
                {lookupData.example && (
                  <div className="p-3 rounded-xl bg-[#00B894]/5 border border-[#00B894]/10">
                    <p className="text-xs text-muted-foreground italic">"{lookupData.example}"</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">未找到释义</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Level Conversion Dialog ── */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-sm rounded-[28px] p-0 overflow-hidden">
          <div className="p-5 border-b border-border bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <Wand2 className="size-5 text-[#F59E0B]" />转换文章等级
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">将当前文章改写为适合不同学习等级的版本</p>
            <div className="flex gap-2">
              {LEVELS.map(({ key, label, color, desc }) => (
                <button key={key} onClick={() => setConvertLevel(key)}
                  className={cn('flex-1 py-3 rounded-2xl text-center transition-all border-2',
                    convertLevel === key ? 'text-white shadow-lg' : 'bg-muted text-muted-foreground border-transparent hover:border-muted-foreground/20')}
                  style={convertLevel === key ? { backgroundColor: color, borderColor: color } : undefined}>
                  <p className="text-sm font-black">{label}</p>
                  <p className="text-[9px] font-bold opacity-70">{desc}</p>
                </button>
              ))}
            </div>
            <Button onClick={convertArticleLevel} disabled={convertLoading}
              className="w-full rounded-2xl bg-gradient-to-r from-[#F59E0B] to-amber-500 text-white font-black text-sm py-5 shadow-lg">
              {convertLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Wand2 className="size-4 mr-2" />}
              {convertLoading ? '转换中…' : '开始转换'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
