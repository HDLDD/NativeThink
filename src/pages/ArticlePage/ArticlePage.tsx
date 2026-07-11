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

// ── Curated Gutenberg books with Chinese translations + cover images ──
const GUTENBERG_BOOKS: { id: number; title: string; zhTitle: string; author: string; zhAuthor: string; topic: string; cover: string }[] = [
  { id: 1342, title: 'Pride and Prejudice', zhTitle: '傲慢与偏见', author: 'Jane Austen', zhAuthor: '简·奥斯汀', topic: 'literature', cover: '' },
  { id: 84, title: 'Frankenstein', zhTitle: '弗兰肯斯坦', author: 'Mary Shelley', zhAuthor: '玛丽·雪莱', topic: 'literature', cover: '' },
  { id: 11, title: 'Alice\'s Adventures in Wonderland', zhTitle: '爱丽丝梦游仙境', author: 'Lewis Carroll', zhAuthor: '刘易斯·卡罗尔', topic: 'literature', cover: '' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', zhTitle: '福尔摩斯探案集', author: 'Arthur Conan Doyle', zhAuthor: '柯南·道尔', topic: 'literature', cover: '' },
  { id: 345, title: 'Dracula', zhTitle: '德古拉', author: 'Bram Stoker', zhAuthor: '布莱姆·斯托克', topic: 'literature', cover: '' },
  { id: 2701, title: 'Moby Dick', zhTitle: '白鲸', author: 'Herman Melville', zhAuthor: '赫尔曼·梅尔维尔', topic: 'literature', cover: '' },
  { id: 43, title: 'Dr. Jekyll and Mr. Hyde', zhTitle: '化身博士', author: 'Robert Louis Stevenson', zhAuthor: '史蒂文森', topic: 'literature', cover: '' },
  { id: 174, title: 'The Picture of Dorian Gray', zhTitle: '道林·格雷的画像', author: 'Oscar Wilde', zhAuthor: '奥斯卡·王尔德', topic: 'literature', cover: '' },
  { id: 730, title: 'Oliver Twist', zhTitle: '雾都孤儿', author: 'Charles Dickens', zhAuthor: '查尔斯·狄更斯', topic: 'literature', cover: '' },
  { id: 1400, title: 'Great Expectations', zhTitle: '远大前程', author: 'Charles Dickens', zhAuthor: '查尔斯·狄更斯', topic: 'literature', cover: '' },
  { id: 2600, title: 'War and Peace', zhTitle: '战争与和平', author: 'Leo Tolstoy', zhAuthor: '列夫·托尔斯泰', topic: 'literature', cover: '' },
  { id: 1184, title: 'The Count of Monte Cristo', zhTitle: '基督山伯爵', author: 'Alexandre Dumas', zhAuthor: '大仲马', topic: 'literature', cover: '' },
  { id: 98, title: 'A Tale of Two Cities', zhTitle: '双城记', author: 'Charles Dickens', zhAuthor: '查尔斯·狄更斯', topic: 'literature', cover: '' },
  { id: 1260, title: 'Jane Eyre', zhTitle: '简·爱', author: 'Charlotte Brontë', zhAuthor: '夏洛蒂·勃朗特', topic: 'literature', cover: '' },
  { id: 768, title: 'Wuthering Heights', zhTitle: '呼啸山庄', author: 'Emily Brontë', zhAuthor: '艾米莉·勃朗特', topic: 'literature', cover: '' },
  { id: 76, title: 'Huckleberry Finn', zhTitle: '哈克贝利·费恩历险记', author: 'Mark Twain', zhAuthor: '马克·吐温', topic: 'literature', cover: '' },
  { id: 244, title: 'The Time Machine', zhTitle: '时间机器', author: 'H.G. Wells', zhAuthor: 'H.G.威尔斯', topic: 'literature', cover: '' },
  { id: 1232, title: 'The Prince', zhTitle: '君主论', author: 'Niccolò Machiavelli', zhAuthor: '马基雅维利', topic: 'philosophy', cover: '' },
  { id: 1635, title: 'Meditations', zhTitle: '沉思录', author: 'Marcus Aurelius', zhAuthor: '马可·奥勒留', topic: 'philosophy', cover: '' },
  { id: 3600, title: 'The Wealth of Nations', zhTitle: '国富论', author: 'Adam Smith', zhAuthor: '亚当·斯密', topic: 'business', cover: '' },
  { id: 1228, title: 'On the Origin of Species', zhTitle: '物种起源', author: 'Charles Darwin', zhAuthor: '查尔斯·达尔文', topic: 'science', cover: '' },
  { id: 3300, title: 'The Republic', zhTitle: '理想国', author: 'Plato', zhAuthor: '柏拉图', topic: 'philosophy', cover: '' },
];

// ── Curated Wikipedia articles with Chinese translations ──
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

// ── Famous speeches + TED talks ──
const FAMOUS_SPEECHES: { id: string; title: string; zhTitle: string; author: string; year: number; type: string; topic: string; preview: string }[] = [
  { id: 'mlk-dream', title: 'I Have a Dream', zhTitle: '我有一个梦想', author: 'Martin Luther King Jr.', year: 1963, type: '历史演讲', topic: 'history', preview: 'I am happy to join with you today in what will go down in history as the greatest demonstration for freedom in the history of our nation...' },
  { id: 'gettysburg', title: 'The Gettysburg Address', zhTitle: '葛底斯堡演说', author: 'Abraham Lincoln', year: 1863, type: '历史演讲', topic: 'history', preview: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty...' },
  { id: 'churchill-finest', title: 'Their Finest Hour', zhTitle: '最光辉的时刻', author: 'Winston Churchill', year: 1940, type: '历史演讲', topic: 'history', preview: 'What General Weygand called the Battle of France is over. I expect that the Battle of Britain is about to begin...' },
  { id: 'jfk-inaugural', title: 'Inaugural Address', zhTitle: '就职演说', author: 'John F. Kennedy', year: 1961, type: '历史演讲', topic: 'history', preview: 'We observe today not a victory of party but a celebration of freedom—symbolizing an end as well as a beginning...' },
  { id: 'susan-anthony', title: 'On Women\'s Right to Vote', zhTitle: '论妇女选举权', author: 'Susan B. Anthony', year: 1873, type: '历史演讲', topic: 'culture', preview: 'Friends and fellow citizens: I stand before you tonight under indictment for the alleged crime of having voted...' },
  // TED Talks
  { id: 'ted-robinson-school', title: 'Do Schools Kill Creativity?', zhTitle: '学校扼杀创造力吗？', author: 'Sir Ken Robinson', year: 2006, type: 'TED', topic: 'culture', preview: 'Good morning. How are you? It\'s been great, hasn\'t it? I\'ve been blown away by the whole thing...' },
  { id: 'ted-sinek-leaders', title: 'How Great Leaders Inspire Action', zhTitle: '伟大领袖如何激励行动', author: 'Simon Sinek', year: 2009, type: 'TED', topic: 'business', preview: 'How do you explain when things don\'t go as we assume? Or better, how do you explain when others are able to achieve things...' },
  { id: 'ted-brown-vulnerability', title: 'The Power of Vulnerability', zhTitle: '脆弱的力量', author: 'Brené Brown', year: 2010, type: 'TED', topic: 'culture', preview: 'So, I\'ll start with this: a couple years ago, an event planner called me because I was going to do a speaking event...' },
  { id: 'ted-cuddy-body', title: 'Your Body Language Shapes Who You Are', zhTitle: '肢体语言塑造你自己', author: 'Amy Cuddy', year: 2012, type: 'TED', topic: 'science', preview: 'So I want to start by offering you a free no-tech life hack, and all it requires of you is this...' },
  { id: 'ted-duckworth-grit', title: 'Grit: The Power of Passion and Perseverance', zhTitle: '毅力：激情与坚持的力量', author: 'Angela Duckworth', year: 2013, type: 'TED', topic: 'culture', preview: 'When I was 27 years old, I left a very demanding job in management consulting for a job that was even more demanding: teaching...' },
  { id: 'ted-harari-nationalism', title: 'Why Fascism is so Tempting', zhTitle: '法西斯主义为何诱人', author: 'Yuval Noah Harari', year: 2018, type: 'TED', topic: 'history', preview: 'So, humankind has two great stories: the story of the individual and the story of the collective...' },
  { id: 'ted-gates-climate', title: 'Innovating to Zero', zhTitle: '创新到零排放', author: 'Bill Gates', year: 2010, type: 'TED', topic: 'science', preview: 'I\'m going to talk today about energy and climate. And that might seem a bit surprising...' },
  { id: 'ted-adichie-single', title: 'The Danger of a Single Story', zhTitle: '单一故事的危险', author: 'Chimamanda Adichie', year: 2009, type: 'TED', topic: 'culture', preview: 'I\'m a storyteller. And I would like to tell you a few personal stories about what I like to call "the danger of the single story."...' },
  { id: 'ted-urban-procrastination', title: 'Inside the Mind of a Master Procrastinator', zhTitle: '拖延症大师的内心世界', author: 'Tim Urban', year: 2016, type: 'TED', topic: 'culture', preview: 'So in college, I was a government major, which means I had to write a lot of papers...' },
  { id: 'ted-godin-tribes', title: 'The Tribes We Lead', zhTitle: '我们领导的部落', author: 'Seth Godin', year: 2009, type: 'TED', topic: 'business', preview: 'Something really important is happening. The Internet has ended the age of mass marketing...' },
  // More classic speeches
  { id: 'jobs-stanford', title: 'Stanford Commencement Address', zhTitle: '斯坦福毕业演讲', author: 'Steve Jobs', year: 2005, type: '毕业演讲', topic: 'business', preview: 'I am honored to be with you today at your commencement from one of the finest universities in the world...' },
  { id: 'rowling-harvard', title: 'The Fringe Benefits of Failure', zhTitle: '失败带来的额外收益', author: 'J.K. Rowling', year: 2008, type: '毕业演讲', topic: 'culture', preview: 'President Faust, members of the Harvard Corporation and the Board of Overseers...' },
  { id: 'obama-yes-we-can', title: 'Yes We Can Speech', zhTitle: '是的，我们可以', author: 'Barack Obama', year: 2008, type: '政治演讲', topic: 'history', preview: 'If there is anyone out there who still doubts that America is a place where all things are possible...' },
  { id: 'rand-Atlas', title: 'This is John Galt Speaking', zhTitle: '约翰·高尔特演说', author: 'Ayn Rand', year: 1957, type: '文学演讲', topic: 'philosophy', preview: 'For twelve years you have been asking: Who is John Galt? This is John Galt speaking...' },
  { id: 'mandela-inaugural', title: 'Inaugural Address', zhTitle: '就职演说', author: 'Nelson Mandela', year: 1994, type: '历史演讲', topic: 'history', preview: 'Our deepest fear is not that we are inadequate. Our deepest fear is that we are powerful beyond measure...' },
  { id: 'greta-un-climate', title: 'How Dare You', zhTitle: '你们怎么敢', author: 'Greta Thunberg', year: 2019, type: 'UN演讲', topic: 'science', preview: 'My message is that we\'ll be watching you. This is all wrong. I shouldn\'t be up here...' },
  { id: 'emma-heforshe', title: 'HeForShe Gender Equality', zhTitle: '他为她性别平等', author: 'Emma Watson', year: 2014, type: 'UN演讲', topic: 'culture', preview: 'Today we are launching a campaign called "HeForShe." I am reaching out to you because I need your help...' },
  { id: 'malala-un', title: 'Education for All', zhTitle: '全民教育', author: 'Malala Yousafzai', year: 2013, type: 'UN演讲', topic: 'culture', preview: 'In the name of God, the most beneficent, the most merciful. Honorable UN Secretary General...' },
  { id: 'reagan-challenger', title: 'The Challenger Disaster Speech', zhTitle: '挑战者号灾难演说', author: 'Ronald Reagan', year: 1986, type: '历史演讲', topic: 'history', preview: 'Ladies and gentlemen, I\'d planned to speak to you tonight to report on the state of the Union...' },
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
  const searchWikipedia = useCallback(async (title?: string) => {
    const q = (title || wikiQuery).trim();
    if (!q) return;
    setWikiLoading(true);
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
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
  }, [wikiQuery, saveToHistory]);

  // ── Load Speech ──
  const fetchSpeech = useCallback(async (speech: typeof FAMOUS_SPEECHES[0]) => {
    setLoading(true);
    try {
      const knownTexts: Record<string, string> = {
        'mlk-dream': `I am happy to join with you today in what will go down in history as the greatest demonstration for freedom in the history of our nation.

Five score years ago, a great American, in whose symbolic shadow we stand today, signed the Emancipation Proclamation. This momentous decree came as a great beacon light of hope to millions of Negro slaves who had been seared in the flames of withering injustice. It came as a joyous daybreak to end the long night of their captivity.

But one hundred years later, the Negro still is not free. One hundred years later, the life of the Negro is still sadly crippled by the manacles of segregation and the chains of discrimination. One hundred years later, the Negro lives on a lonely island of poverty in the midst of a vast ocean of material prosperity. One hundred years later, the Negro is still languished in the corners of American society and finds himself an exile in his own land. And so we've come here today to dramatize a shameful condition.

In a sense we've come to our nation's capital to cash a check. When the architects of our republic wrote the magnificent words of the Constitution and the Declaration of Independence, they were signing a promissory note to which every American was to fall heir. This note was a promise that all men, yes, black men as well as white men, would be guaranteed the "unalienable Rights" of "Life, Liberty and the pursuit of Happiness."

I have a dream that one day this nation will rise up and live out the true meaning of its creed: "We hold these truths to be self-evident, that all men are created equal."

I have a dream that one day on the red hills of Georgia, the sons of former slaves and the sons of former slave owners will be able to sit down together at the table of brotherhood.

I have a dream that one day even the state of Mississippi, a state sweltering with the heat of injustice, sweltering with the heat of oppression, will be transformed into an oasis of freedom and justice.

I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character. I have a dream today!

I have a dream that one day, down in Alabama, with its vicious racists, with its governor having his lips dripping with the words of "interposition" and "nullification" — one day right there in Alabama little black boys and black girls will be able to join hands with little white boys and white girls as sisters and brothers. I have a dream today!

This is our hope, and this is the faith that I go back to the South with. With this faith, we will be able to hew out of the mountain of despair a stone of hope. With this faith, we will be able to transform the jangling discords of our nation into a beautiful symphony of brotherhood. With this faith, we will be able to work together, to pray together, to struggle together, to go to jail together, to stand up for freedom together, knowing that we will be free one day.

And when this happens, when we allow freedom to ring, when we let it ring from every village and every hamlet, from every state and every city, we will be able to speed up that day when all of God's children, black men and white men, Jews and Gentiles, Protestants and Catholics, will be able to join hands and sing in the words of the old Negro spiritual: Free at last! Free at last! Thank God Almighty, we are free at last!`,

        'gettysburg': `Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.

Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battlefield of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.

But, in a larger sense, we can not dedicate — we can not consecrate — we can not hallow — this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us — that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion — that we here highly resolve that these dead shall not have died in vain — that this nation, under God, shall have a new birth of freedom — and that government of the people, by the people, for the people, shall not perish from the earth.`,

        'jfk-inaugural': `We observe today not a victory of party but a celebration of freedom — symbolizing an end as well as a beginning — signifying renewal as well as change. For I have sworn before you and Almighty God the same solemn oath our forebears prescribed nearly a century and three quarters ago.

The world is very different now. For man holds in his mortal hands the power to abolish all forms of human poverty and all forms of human life. And yet the same revolutionary beliefs for which our forebears fought are still at issue around the globe — the belief that the rights of man come not from the generosity of the state, but from the hand of God.

Let the word go forth from this time and place, to friend and foe alike, that the torch has been passed to a new generation of Americans — born in this century, tempered by war, disciplined by a hard and bitter peace, proud of our ancient heritage — and unwilling to witness or permit the slow undoing of those human rights to which this Nation has always been committed, and to which we are committed today at home and around the world.

Let every nation know, whether it wishes us well or ill, that we shall pay any price, bear any burden, meet any hardship, support any friend, oppose any foe, in order to assure the survival and the success of liberty.

In the long history of the world, only a few generations have been granted the role of defending freedom in its hour of maximum danger. I do not shrink from this responsibility — I welcome it. I do not believe that any of us would exchange places with any other people or any other generation. The energy, the faith, the devotion which we bring to this endeavor will light our country and all who serve it — and the glow from that fire can truly light the world.

And so, my fellow Americans: ask not what your country can do for you — ask what you can do for your country.

My fellow citizens of the world: ask not what America will do for you, but what together we can do for the freedom of man.`,

        'churchill-finest': `What General Weygand called the Battle of France is over. I expect that the Battle of Britain is about to begin. Upon this battle depends the survival of Christian civilization. Upon it depends our own British life, and the long continuity of our institutions and our Empire. The whole fury and might of the enemy must very soon be turned on us.

Hitler knows that he will have to break us in this Island or lose the war. If we can stand up to him, all Europe may be free and the life of the world may move forward into broad, sunlit uplands. But if we fail, then the whole world, including the United States, including all that we have known and cared for, will sink into the abyss of a new Dark Age made more sinister, and perhaps more protracted, by the lights of perverted science.

Let us therefore brace ourselves to our duties, and so bear ourselves that, if the British Empire and its Commonwealth last for a thousand years, men will still say, "This was their finest hour."

What has happened is the result of a long and famous history. The British people have faced great dangers before. We have survived the Spanish Armada, we have survived Napoleon, we have survived the Kaiser. We shall survive Hitler and his Nazi tyranny. Hitler has not yet been withstood by a great nation with a will power the equal of his own. We shall prove ourselves once again able to defend our Island home, to ride out the storm of war, and to outlive the menace of tyranny, if necessary for years, if necessary alone.

Even though large tracts of Europe and many old and famous States have fallen or may fall into the grip of the Gestapo and all the odious apparatus of Nazi rule, we shall not flag or fail. We shall go on to the end. We shall fight in France, we shall fight on the seas and oceans, we shall fight with growing confidence and growing strength in the air, we shall defend our Island, whatever the cost may be. We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets, we shall fight in the hills; we shall never surrender.`,

        'susan-anthony': `Friends and fellow citizens: I stand before you tonight under indictment for the alleged crime of having voted at the last presidential election, without having a lawful right to vote. It shall be my work this evening to prove to you that in thus voting, I not only committed no crime, but, instead, simply exercised my citizen's rights, guaranteed to me and all United States citizens by the National Constitution, beyond the power of any state to deny.

The preamble of the Federal Constitution says: "We, the people of the United States, in order to form a more perfect union, establish justice, insure domestic tranquillity, provide for the common defense, promote the general welfare, and secure the blessings of liberty to ourselves and our posterity, do ordain and establish this Constitution for the United States of America."

It was we, the people; not we, the white male citizens; nor yet we, the male citizens; but we, the whole people, who formed the Union. And we formed it, not to give the blessings of liberty, but to secure them; not to the half of ourselves and the half of our posterity, but to the whole people — women as well as men. And it is a downright mockery to talk to women of their enjoyment of the blessings of liberty while they are denied the use of the only means of securing them provided by this democratic-republican government — the ballot.

The only question left to be settled now is: Are women persons? And I hardly believe any of our opponents will have the hardihood to say they are not. Being persons, then, women are citizens; and no state has a right to make any law, or to enforce any old law, that shall abridge their privileges or immunities. Hence, every discrimination against women in the constitutions and laws of the several states is today null and void, precisely as is every one against Negroes.`,

        'jobs-stanford': `I am honored to be with you today at your commencement from one of the finest universities in the world. I never graduated from college. Truth be told, this is the closest I've ever gotten to a college graduation. Today I want to tell you three stories from my life. That's it. No big deal. Just three stories.

The first story is about connecting the dots. I dropped out of Reed College after the first 6 months, but then stayed around as a drop-in for another 18 months or so before I really quit. So why did I drop out? It started before I was born. My biological mother was a young, unwed college graduate student, and she decided to put me up for adoption... Seventeen years later I did go to college. But I naively chose a college that was almost as expensive as Stanford, and all of my working-class parents' savings were being spent on my college tuition. After six months, I couldn't see the value in it... So I decided to drop out and trust that it would all work out OK. It was pretty scary at the time, but looking back it was one of the best decisions I ever made.

My second story is about love and loss. I was lucky — I found what I loved to do early in life. Woz and I started Apple in my parents' garage when I was 20. We worked hard, and in 10 years Apple had grown from just the two of us in a garage into a $2 billion company with over 4000 employees... And then I got fired. How can you get fired from a company you started? Well, as Apple grew we hired someone who I thought was very talented to run the company with me, and for the first year or so things went well. But then our visions of the future began to diverge and eventually we had a falling out... I didn't see it then, but it turned out that getting fired from Apple was the best thing that could have ever happened to me.

My third story is about death. When I was 17, I read a quote that went something like: "If you live each day as if it was your last, someday you'll most certainly be right." It made an impression on me... Remembering that I'll be dead soon is the most important tool I've ever encountered to help me make the big choices in life.

Your time is limited, so don't waste it living someone else's life. Don't be trapped by dogma — which is living with the results of other people's thinking. Don't let the noise of others' opinions drown out your own inner voice. And most important, have the courage to follow your heart and intuition. They somehow already know what you truly want to become. Everything else is secondary.

Stay hungry, stay foolish.`,

        'obama-yes-we-can': `If there is anyone out there who still doubts that America is a place where all things are possible, who still wonders if the dream of our founders is alive in our time, who still questions the power of our democracy, tonight is your answer.

It's the answer told by lines that stretched around schools and churches in numbers this nation has never seen, by people who waited three hours and four hours, many for the very first time in their lives, because they believed that this time must be different, that their voice could be that difference.

It's the answer spoken by young and old, rich and poor, Democrat and Republican, black, white, Latino, Asian, Native American, gay, straight, disabled and not disabled. Americans who sent a message to the world that we have never been just a collection of individuals, or a collection of red states and blue states. We are, and always will be, the United States of America.

It's the answer that led those who've been told for so long by so many to be cynical and fearful and doubtful about what we can achieve, to put their hands on the arc of history and bend it once more toward the hope of a better day.

It's been a long time coming, but tonight, because of what we did on this day, in this election, at this defining moment, change has come to America.

Yes, we can. Yes, we can. Yes, we can.

This is our moment. This is our time — to put our people back to work and open doors of opportunity for our kids; to restore prosperity and promote the cause of peace; to reclaim the American Dream and reaffirm that fundamental truth: that out of many, we are one; that while we breathe, we hope; and where we are met with cynicism and doubt, and those who tell us that we can't, we will respond with that timeless creed that sums up the spirit of a people: Yes, we can.`,

        'rowling-harvard': `President Faust, members of the Harvard Corporation and the Board of Overseers, members of the faculty, proud parents, and, above all, graduates. The first thing I would like to say is "thank you." Not only has Harvard given me an extraordinary honour, but the weeks of fear and nausea I have endured at the thought of giving this commencement address have made me lose weight. A win-win situation!

I have come up with two answers. On this wonderful day when we are gathered together to celebrate your academic success, I have decided to talk to you about the benefits of failure. And as you stand on the threshold of what is sometimes called "real life," I want to extol the crucial importance of imagination.

Why do I talk about the benefits of failure? Simply because failure meant a stripping away of the inessential. I stopped pretending to myself that I was anything other than what I was, and began to direct all my energy into finishing the only work that mattered to me... Failure gave me an inner security that I had never attained by passing examinations. Failure taught me things about myself that I could have learned no other way.

Imagination is not only the uniquely human capacity to envision that which is not, and therefore the fount of all invention and innovation. In its arguably most transformative and revelatory capacity, it is the power that enables us to empathise with humans whose experiences we have never shared... We do not need magic to change the world, we carry all the power we need inside ourselves already: we have the power to imagine better.

As is a tale, so is life: not how long it is, but how good it is, is what matters. I wish you all very good lives.`,

        'reagan-challenger': `Ladies and gentlemen, I'd planned to speak to you tonight to report on the state of the Union, but the events of earlier today have led me to change those plans. Today is a day for mourning and remembering.

Nancy and I are pained to the core by the tragedy of the shuttle Challenger. We know we share this pain with all of the people of our country. This is truly a national loss.

Nineteen years ago, almost to the day, we lost three astronauts in a terrible accident on the ground. But we've never lost an astronaut in flight; we've never had a tragedy like this. And perhaps we've forgotten the courage it took for the crew of the shuttle. But they, the Challenger Seven, were aware of the dangers, but overcame them and did their jobs brilliantly. We mourn seven heroes.

We mourn their loss as a nation together. For the families of the seven, we cannot bear, as you do, the full impact of this tragedy. But we feel the loss, and we're thinking about you so very much.

Your loved ones were daring and brave, and they had that special grace, that special spirit that says, "Give me a challenge, and I'll meet it with joy." They had a hunger to explore the universe and discover its truths. They wished to serve, and they did. They served all of us.

The crew of the space shuttle Challenger honored us by the manner in which they lived their lives. We will never forget them, nor the last time we saw them, this morning, as they prepared for their journey and waved goodbye and "slipped the surly bonds of Earth" to "touch the face of God."`,

        'ted-robinson-school': `Good morning. How are you? It's been great, hasn't it? I've been blown away by the whole thing. In fact, I'm leaving.

There have been three themes running through the conference which are relevant to what I want to talk about. One is the extraordinary evidence of human creativity in all of the presentations that we've had and in all of the people here. Just the variety of it and the range of it. The second is that it's put us in a place where we have no idea what's going to happen, in terms of the future. No idea how this may play out.

I have an interest in education. Actually, what I find is everybody has an interest in education. Don't you? I find this very interesting. If you're at a dinner party, and you say you work in education — actually, you're not often at dinner parties, frankly.

If you think of it, children starting school this year will be retiring in 2065. Nobody has a clue, despite all the expertise that's been on parade for the past four days, what the world will look like in five years' time. And yet we're meant to be educating them for it. So the unpredictability, I think, is extraordinary.

We are educating people out of their creative capacities. Picasso once said this, he said that all children are born artists. The problem is to remain an artist as we grow up. I believe this passionately, that we don't grow into creativity, we grow out of it. Or rather, we get educated out of it.

Our education system has mined our minds in the way that we strip-mine the earth: for a particular commodity. And for the future, it won't serve us. We have to rethink the fundamental principles on which we're educating our children.`,

        'ted-sinek-leaders': `How do you explain when things don't go as we assume? Or better, how do you explain when others are able to achieve things that seem to defy all of the assumptions? For example: Why is Apple so innovative? Year after year, they're more innovative than all their competition. And yet, they're just a computer company. They have the same access to the same talent, the same agencies, the same consultants, the same media. Then why is it that they seem to have something different?

As it turns out, all the great inspiring leaders and organizations in the world, whether it's Apple or Martin Luther King or the Wright brothers, they all think, act and communicate the exact same way. And it's the complete opposite to everyone else. All I did was codify it, and it's probably the world's simplest idea. I call it the golden circle.

Why? How? What? Every single person, every single organization on the planet knows what they do, 100 percent. Some know how they do it. But very, very few people or organizations know why they do what they do. And by "why" I don't mean "to make a profit." That's a result. By "why," I mean: What's your purpose? What's your cause? What's your belief?

People don't buy what you do; people buy why you do it. The goal is not to do business with everybody who needs what you have. The goal is to do business with people who believe what you believe.`,

        'ted-brown-vulnerability': `So, I'll start with this: a couple years ago, an event planner called me because I was going to do a speaking event. And she called, and she said, "I'm really struggling with how to write about you on the little flyer." And I thought, "Well, what's the struggle?" And she said, "Well, I saw you speak, and I'm going to call you a researcher, I think, but I'm afraid if I call you a researcher, no one will come, because they'll think you're boring and irrelevant."

This is where my story starts. When I was a young researcher, doctoral student, my first year I had a research professor who said, "Here's the thing, if you cannot measure it, it does not exist." And I thought he was just sweet-talking me.

So I started with connection. Because, when you ask people about love, they tell you about heartbreak. When you ask people about belonging, they'll tell you their most excruciating experiences of being excluded. And when you ask people about connection, the stories they told me were about disconnection.

This is what I have found: vulnerability is the birthplace of innovation, creativity and change. To let ourselves be seen, deeply seen, vulnerably seen; to love with our whole hearts, even though there's no guarantee. To practice gratitude and joy in those moments of terror. And to believe that we are enough. Because when we work from a place, I believe, that says, "I'm enough," then we stop screaming and start listening, we're kinder and gentler to the people around us, and we're kinder and gentler to ourselves.`,

        'ted-cuddy-body': `So I want to start by offering you a free no-tech life hack, and all it requires of you is this: that you change your posture for two minutes. But before I give it away, I want to ask you to right now do a little audit of your body and what you're doing with your body.

So how many of you are sort of making yourselves smaller? Maybe you're hunching, crossing your legs, maybe wrapping your ankles. Sometimes we hold onto our arms like this. Sometimes we spread out. I see you.

So I want to start by offering you a free no-tech life hack, and all it requires of you is this: that you change your posture for two minutes. But before I give it away, I want to ask you to right now do a little audit of your body and what you're doing with your body.

We're really fascinated with body language, and we're particularly interested in other people's body language. You know, we're interested in, like, you know, an awkward interaction, or a smile, or a contemptuous glance, or maybe a very awkward wink, or maybe even something like a handshake.

So what nonverbals am I talking about? I'm a social psychologist. I study prejudice, and I teach at a competitive business school, so it was almost inevitable that I would become interested in power dynamics. I became especially interested in nonverbal expressions of power and dominance.

Our bodies change our minds, and our minds can change our behavior, and our behavior can change our outcomes. They are not just a reflection of our minds. The mind reflects the body. Don't just fake it till you make it. Fake it till you become it. Do it enough until you actually become it and internalize.`,

        'ted-duckworth-grit': `When I was 27 years old, I left a very demanding job in management consulting for a job that was even more demanding: teaching. I went to teach seventh graders math in the New York City public schools. And like any teacher, I made quizzes and tests. I gave out homework assignments. When the work came back, I calculated grades.

What struck me was that IQ was not the only difference between my best and my worst students. Some of my strongest performers did not have stratospheric IQ scores. Some of my smartest kids weren't doing so well.

After several more years of teaching, I came to the conclusion that what we need in education is a much better understanding of students and learning from a motivational perspective, from a psychological perspective. In education, the one thing we know how to measure best is IQ. But what if doing well in school and in life depends on much more than your ability to learn quickly and easily?

So I left the classroom, and I went to graduate school to become a psychologist. I started studying kids and adults in all kinds of super challenging settings, and in every study my question was, who is successful here and why?

One characteristic emerged as a significant predictor of success. And it wasn't social intelligence. It wasn't good looks, physical health, and it wasn't IQ. It was grit. Grit is passion and perseverance for very long-term goals. Grit is having stamina. Grit is sticking with your future, day in, day out, not just for the week, not just for the month, but for years, and working really hard to make that future a reality. Grit is living life like it's a marathon, not a sprint.

In other words, we need to be gritty about getting our kids grittier.`,

        'ted-adichie-single': `I'm a storyteller. And I would like to tell you a few personal stories about what I like to call "the danger of the single story."

I grew up on a university campus in eastern Nigeria. My mother says that I started reading at the age of two, although I think four is probably close to the truth. So I was an early reader, and what I read were British and American children's books.

When I began to write, at about the age of seven, stories in pencil with crayon illustrations that my poor mother was obligated to read, I wrote exactly the kinds of stories I was reading: All my characters were white and blue-eyed, they played in the snow, they ate apples, and they talked a lot about the weather, how lovely it was that the sun had come out. Now, this despite the fact that I lived in Nigeria. I had never been outside Nigeria. We didn't have snow, we ate mangoes, and we never talked about the weather, because there was no need to.

What this demonstrates, I think, is how impressionable and vulnerable we are in the face of a story, particularly as children. Because all I had read were books in which characters were foreign, I had become convinced that books by their very nature had to have foreigners in them.

The single story creates stereotypes, and the problem with stereotypes is not that they are untrue, but that they are incomplete. They make one story become the only story.

Stories matter. Many stories matter. Stories have been used to dispossess and to malign, but stories can also be used to empower and to humanize. Stories can break the dignity of a people, but stories can also repair that broken dignity.

When we reject the single story, when we realize that there is never a single story about any place, we regain a kind of paradise.`,

        'ted-urban-procrastination': `So in college, I was a government major, which means I had to write a lot of papers. Now, when a normal student writes a paper, they might spread the work out a little like this. So, you know, you get started maybe a little slowly, but you get enough done in the first week that, with some heavier days later on, everything gets done, things stay civil. And I would want to do that like that. That would be the plan. I would have it all ready to go, but then, actually, the paper would come along, and then I would kind of do this.

And that would happen every single paper. But then came my 90-page senior thesis, a paper you're supposed to spend a year on. And I knew for a paper like that, my normal work flow was not an option. It was way too big a project. So I planned things out, and I decided it kind of had to go like this. This is how the year would go.

And then, actually, the paper came along, and of course, at some point I was just sitting there, and it was like, "Oh, man!" And it was the same thing. And that was when I had my little epiphany.

Both the Rational Decision-Maker and the Instant Gratification Monkey live in your brain. The Rational Decision-Maker will make the rational decision to do something productive, but the Monkey doesn't like that plan. The Monkey lives entirely in the present moment. The Monkey only cares about two things: easy and fun.

Now, what is this doing to our lives? It has a huge impact. We need to stay aware of the Instant Gratification Monkey. That's a job for all of us. And because there's not that many boxes left to check, I think we should all start thinking about what we're really procrastinating on. Because everyone is procrastinating on something in life. We need to think about what that really is. Maybe for all of us, the thing we need to start doing, is just to start.`,

        'ted-gates-climate': `I'm going to talk today about energy and climate. And that might seem a bit surprising, because my full-time work at the foundation is mostly about vaccines and seeds, about the things that we need to invent and deliver to help the poorest two billion live better lives. But energy and climate are extremely important to these people. In fact, more important to them than to anyone else on the planet.

The climate getting worse means that many years, their crops won't grow. There will be too much rain, not enough rain. Things will change in ways that their fragile environment simply cannot support. And that leads to starvation, it leads to uncertainty, it leads to unrest.

Now, the exact amount of how you map from a certain increase of CO2 to what temperature will be and where the positive feedbacks are, there's some uncertainty there, but not very much. And there's certainly uncertainty about how bad those effects will be, but they will be extremely bad.

So what we're going to have to do at a global scale is create a new system. And so we need energy miracles. Now, when I use the term "miracle," I don't mean something that's impossible. The microprocessor is a miracle. The Internet is a miracle. The personal computer is a miracle. So the people here have participated in the creation of many miracles.

We need to get to zero. We need to reduce CO2 emissions to zero. And we need to do it within the next few decades.`,

        'greta-un-climate': `My message is that we'll be watching you. This is all wrong. I shouldn't be up here. I should be back in school on the other side of the ocean. Yet you all come to us young people for hope. How dare you!

You have stolen my dreams and my childhood with your empty words. And yet I'm one of the lucky ones. People are suffering. People are dying. Entire ecosystems are collapsing. We are in the beginning of a mass extinction, and all you can talk about is money and fairy tales of eternal economic growth. How dare you!

For more than 30 years, the science has been crystal clear. How dare you continue to look away and come here saying that you're doing enough, when the politics and solutions needed are still nowhere in sight.

You say you hear us and that you understand the urgency. But no matter how sad and angry I am, I do not want to believe that. Because if you really understood the situation and still kept on failing to act, then you would be evil. And that I refuse to believe.

The popular idea of cutting our emissions in half in 10 years only gives us a 50% chance of staying below 1.5 degrees Celsius, and the risk of setting off irreversible chain reactions beyond human control.

You are failing us. But the young people are starting to understand your betrayal. The eyes of all future generations are upon you. And if you choose to fail us, I say: We will never forgive you.`,

        'emma-heforshe': `Today we are launching a campaign called "HeForShe." I am reaching out to you because I need your help. We want to end gender inequality — and to do that we need everyone to be involved.

This is the first campaign of its kind at the UN: we want to try and galvanize as many men and boys as possible to be advocates for gender equality. And we don't just want to talk about it, but make sure it is tangible.

I was appointed six months ago and the more I have spoken about feminism the more I have realized that fighting for women's rights has too often become synonymous with man-hating. If there is one thing I know for certain, it is that this has to stop. For the record, feminism by definition is: "The belief that men and women should have equal rights and opportunities. It is the theory of the political, economic and social equality of the sexes."

I started questioning gender-based assumptions when at eight I was confused at being called "bossy," because I wanted to direct the plays we would put on for our parents—but the boys were not. When at 14 I started being sexualized by certain elements of the press. When at 15 my girlfriends started dropping out of their sports teams because they didn't want to appear "muscly." When at 18 my male friends were unable to express their feelings. I decided I was a feminist and this seemed uncomplicated to me.

Men—I would like to take this opportunity to extend your formal invitation. Gender equality is your issue too. We don't often talk about men being imprisoned by gender stereotypes but I can see that that they are and that when they are free, things will change for women as a natural consequence. If men don't have to be aggressive in order to be accepted women won't feel compelled to be submissive. Both men and women should feel free to be sensitive. Both men and women should feel free to be strong. It is time that we all perceive gender on a spectrum not as two opposing sets of ideals.`,

        'malala-un': `In the name of God, the most beneficent, the most merciful. Honorable UN Secretary General Mr. Ban Ki-moon, respected president of the General Assembly, and dear brothers and sisters: Today, it is an honor for me to be speaking again after a long time. Being here with such honorable people is a great moment in my life.

Dear brothers and sisters, do remember one thing. Malala Day is not my day. Today is the day of every woman, every boy and every girl who have raised their voice for their rights. There are hundreds of human rights activists and social workers who are not only speaking for human rights, but who are struggling to achieve their goals of education, peace and equality. Thousands of people have been killed by the terrorists and millions have been injured. I am just one of them. So here I stand, one girl among many. I speak not for myself, but for all girls and boys. I raise up my voice — not so that I can shout, but so that those without a voice can be heard. Those who have fought for their rights: Their right to live in peace. Their right to be treated with dignity. Their right to equality of opportunity. Their right to be educated.

The terrorists thought that they would change our aims and stop our ambitions, but nothing changed in my life except this: Weakness, fear and hopelessness died. Strength, power and courage was born. I am the same Malala. My ambitions are the same. My hopes are the same. My dreams are the same.

Dear brothers and sisters, we must not forget that millions of people are suffering from poverty, injustice and ignorance. We must not forget that millions of children are out of schools. We must not forget that our sisters and brothers are waiting for a bright peaceful future.

So let us wage a global struggle against illiteracy, poverty and terrorism. Let us pick up our books and our pens. They are our most powerful weapons. One child, one teacher, one pen and one book can change the world. Education is the only solution. Education first.`,

        'ted-harari-nationalism': `So, humankind has two great stories: the story of the individual and the story of the collective. For most of history, the dominant story was the collective story. The individual was just a tiny cog in the great machine of the tribe, the kingdom, the empire. And the meaning of life came from belonging to something bigger than yourself.

But in the last few centuries, a new story has emerged. The story of the individual. That each of us has a unique inner self, with unique feelings, unique desires, unique dreams. And the highest purpose of society is to enable each individual to fulfill their unique potential.

Now, these two stories are colliding. And this collision is causing a lot of the political and social turmoil we see around the world today. People feel that something is missing. They feel disconnected, alienated.

The big question of the 21st century is not whether we will believe in one story or the other. The big question is how to combine the two. How to create a society that values both the individual and the collective. That is the challenge.

Nationalism is the attempt to go back to the collective story, but without the traditional frameworks of religion or empire. And it's very tempting. Because it offers people a sense of belonging, a sense of identity, a sense of meaning. But it also has a dark side. It can easily turn into chauvinism, xenophobia, and ultimately, war.`,

        'ted-godin-tribes': `Something really important is happening. The Internet has ended the age of mass marketing and has revived a social unit from the past: the tribe. A tribe is a group of people connected to one another, connected to a leader, and connected to an idea. For millions of years, human beings have been part of one tribe or another. A group needs only two things to be a tribe: a shared interest and a way to communicate.

Tribes need leadership. Sometimes one person speaks up and leads, sometimes the group selects a leader. What makes a tribe different from a crowd is that the members care about each other and about the shared goal.

The Beatles did not invent teenagers. They merely decided to lead them. Most organizations, most movements, spend their time trying to find people and get them to do what they're told. But that's not what tribes are about. Tribes are about finding people who share your passion and giving them a platform to connect.

What we do for a living now is find something to change, put it into a context, and connect people. The new status quo is that you don't need to be appointed by someone in power to lead. You just need to start a movement.

You don't need permission from anyone. You just need the passion to connect people and the willingness to lead them. The question isn't, "Is it possible for me to do that?" The question is, "Will I choose to do it?"`,

        'mandela-inaugural': `Our deepest fear is not that we are inadequate. Our deepest fear is that we are powerful beyond measure. It is our light, not our darkness, that most frightens us. We ask ourselves, who am I to be brilliant, gorgeous, talented and fabulous? Actually, who are you not to be?

We were born to make manifest the glory of God that is within us. And as we let our own light shine, we unconsciously give other people permission to do the same. As we are liberated from our own fear, our presence automatically liberates others.

Never, never and never again shall it be that this beautiful land will again experience the oppression of one by another and suffer the indignity of being the skunk of the world. Let freedom reign. The sun shall never set on so glorious a human achievement! God bless Africa!

Out of the experience of an extraordinary human disaster that lasted too long, must be born a society of which all humanity will be proud. We understand it still that there is no easy road to freedom. We know it well that none of us acting alone can achieve success. We must therefore act together as a united people, for national reconciliation, for nation building, for the birth of a new world.

Let there be justice for all. Let there be peace for all. Let there be work, bread, water and salt for all. Let each know that for each the body, the mind and the soul have been freed to fulfill themselves.`,

        'rand-Atlas': `For twelve years you have been asking: Who is John Galt? This is John Galt speaking. I am the man who loves his life. I am the man who does not sacrifice his love or his values. I am the man who has deprived you of victims and thus has destroyed your world.

If you wish to know why you are perishing—you who dread knowledge—I am the man who will now tell you. You have cried that man's sins are the greed and the lust for power. You have proclaimed that man must be reformed, that he must turn himself into a sacrificial animal. But what you see now in the world proves that your beliefs are wrong.

Man's mind is his basic tool of survival. Life is given to him, survival is not. His body is given to him, its sustenance is not. His mind is given to him, its content is not. To remain alive, he must act, and before he can act he must know the nature and purpose of his action.

A plant can obtain its food from the soil. An animal can obtain its food by acting on its instincts. But man cannot obtain his food from the soil, nor can he obtain it by instinct. Man must produce it. And to produce it, he must think.

This, and nothing less, is the meaning of human existence: to create, to produce, to achieve. Every form of happiness is a form of creation. Every form of suffering is a form of destruction. The choice is yours: to think or to die.`,

      };
      const content = knownTexts[speech.id] || speech.preview + '\n\n[注：此演讲稿因版权限制仅提供摘要，完整内容请访问来源网站。AI 可基于摘要生成完整学习文章。]';
      setDisplayTitle(`${speech.zhTitle} — ${speech.author} (${speech.year})`);
      setDisplayContent(content);
      setDisplayTranslation('');
      setDisplayVocab([]);
      setDisplayQuestions([]);
      setQuizMode(false);
      saveToHistory(speech.zhTitle || speech.title, content, 'speeches');
      toast.success(`已加载：${speech.zhTitle || speech.title}`);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, [saveToHistory]);

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
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Library className="size-3.5 text-amber-500" />推荐书籍 · 公版英文原著 ({GUTENBERG_BOOKS.length} 本)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
              {GUTENBERG_BOOKS.map((book) => (
                <button key={book.id} onClick={() => fetchGutenbergBook({ id: book.id, title: book.title, authors: [{ name: book.author }], subjects: [book.topic], formats: { 'text/plain': `https://www.gutenberg.org/files/${book.id}/${book.id}-0.txt` }, download_count: 0 })}
                  className="group text-left rounded-2xl bg-muted/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all border border-transparent hover:border-[#00B894]/30 hover:shadow-lg overflow-hidden">
                  {/* Book cover */}
                  <div className="aspect-[3/4] bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center relative overflow-hidden"
                    style={{ backgroundImage: book.cover ? `url(${book.cover})` : undefined, backgroundSize: 'cover' }}>
                    {!book.cover && (
                      <div className="text-center p-2">
                        <span className="text-3xl mb-1 block">📖</span>
                        <p className="text-white/90 text-[9px] font-black leading-tight line-clamp-2">{book.title}</p>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] font-black text-foreground line-clamp-1 group-hover:text-[#00B894] transition-colors">{book.title}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">{book.zhTitle}</p>
                    <p className="text-[8px] text-muted-foreground/60 mt-0.5">{book.author} · {book.zhAuthor}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">搜索更多</p>
              <div className="flex gap-2">
                <Input value={gutenbergQuery} onChange={(e) => setGutenbergQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchGutenberg()}
                  placeholder="搜索公版书籍 (英文)…" className="flex-1 rounded-2xl h-12 text-sm" />
                <Button onClick={searchGutenberg} disabled={gutenbergLoading} className="rounded-2xl px-6">
                  {gutenbergLoading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
                </Button>
              </div>
            </div>
            {gutenbergSearchDone && gutenbergResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">未找到相关书籍</p>
            )}
            {gutenbergResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {gutenbergResults.map((book) => (
                  <button key={book.id} onClick={() => fetchGutenbergBook(book)}
                    className="w-full text-left p-3 rounded-2xl bg-muted/50 hover:bg-emerald-50 transition-colors border border-transparent hover:border-[#00B894]/20">
                    <p className="text-sm font-black text-foreground">{book.title}</p>
                    <p className="text-xs text-muted-foreground">{book.authors[0]?.name || 'Unknown'}</p>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground text-center">内容来自 Project Gutenberg (public domain)</p>
          </CardContent>
        </Card>
      )}

      {source === 'wikipedia' && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Globe className="size-3.5 text-sky-500" />推荐条目 · Wikipedia ({WIKI_ARTICLES.length} 篇)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
              {WIKI_ARTICLES.map((article) => (
                <button key={article.title} onClick={() => { setWikiQuery(article.title); searchWikipedia(article.title); }}
                  className="group text-left rounded-2xl bg-muted/30 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-all border border-transparent hover:border-sky-200 hover:shadow-lg overflow-hidden">
                  {/* Topic gradient icon card */}
                  <div className="aspect-[4/3] bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
                    <span className="text-3xl">{TOPICS.find((t) => t.key === article.topic)?.icon || '📄'}</span>
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] font-black text-foreground line-clamp-1 group-hover:text-sky-500 transition-colors">{article.title}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{article.zhTitle}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">搜索更多</p>
              <div className="flex gap-2">
                <Input value={wikiQuery} onChange={(e) => setWikiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchWikipedia()}
                  placeholder="搜索 Wikipedia 条目 (英文)…" className="flex-1 rounded-2xl h-12 text-sm" />
                <Button onClick={searchWikipedia} disabled={wikiLoading} className="rounded-2xl px-6">
                  {wikiLoading ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
                </Button>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground text-center">内容来自 Wikipedia (CC BY-SA)</p>
          </CardContent>
        </Card>
      )}

      {source === 'speeches' && (
        <Card className="rounded-[28px] border-border shadow-sm">
          <CardContent className="p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">名人演讲 & TED</p>
            <div className="max-h-[500px] overflow-y-auto space-y-2">
              {FAMOUS_SPEECHES.map((speech) => (
                <button key={speech.id} onClick={() => fetchSpeech(speech)}
                  className="w-full text-left p-3 rounded-2xl bg-muted/30 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors border border-transparent hover:border-amber-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-foreground">{speech.zhTitle}</p>
                    <Badge className={cn('rounded-full px-1.5 py-0 text-[8px] font-bold shrink-0',
                      speech.type === 'TED' ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' :
                      speech.type === 'UN演讲' ? 'bg-sky-100 text-sky-600' :
                      speech.type === '毕业演讲' ? 'bg-emerald-100 text-emerald-600' :
                      'bg-amber-100 text-amber-700')}>{speech.type}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{speech.title} · {speech.author} ({speech.year})</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 line-clamp-2 italic">"{speech.preview}"</p>
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground text-center">经典演讲稿 (public domain)</p>
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
