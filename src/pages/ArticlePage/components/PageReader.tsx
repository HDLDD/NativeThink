import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, Volume2, BookOpen, Heart, Globe,
  Sparkles, Hash, Wand2, Loader2, Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { useTTS } from '@/lib/use-tts';
import { useAI } from '@/hooks/use-ai';
import { useFavorites } from '@/lib/use-favorites';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText, extractJson } from '@/lib/utils';
import { toast } from 'sonner';
import type { IReadingContent, TransMode, IParagraph } from '@/data/reading';
import { buildPages } from '@/data/reading';
import { queryWords, preloadAll, isAllReady } from '@/data/wordbank';

// ── Sentence splitter ──
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

const LEVELS = [
  { key: 'beginner' as const, label: '初级', color: '#00B894' },
  { key: 'intermediate' as const, label: '中级', color: '#F59E0B' },
  { key: 'advanced' as const, label: '高级', color: '#6C5CE7' },
];

// ── Reading progress persistence ──
function loadProgress(contentId: string): { page: number } {
  try {
    const raw = safeStorage.getItem(`__reader_progress_${contentId}`);
    return raw ? JSON.parse(raw) : { page: 0 };
  } catch { return { page: 0 }; }
}
function saveProgress(contentId: string, page: number) {
  try { safeStorage.setItem(`__reader_progress_${contentId}`, JSON.stringify({ page })); } catch { /* */ }
}

// ── Word lookup: dictionary API + wordbank Chinese ──
async function lookupWord(word: string): Promise<{ word: string; phonetic: string; meaning: string; zhMeaning: string } | null> {
  const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;

  // Try wordbank first (offline, instant Chinese)
  const bankResults = queryWords({ search: cleaned, limit: 1 });
  const zhMeaning = bankResults.length > 0 ? (bankResults[0].meaning || '') : '';

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`);
    if (!res.ok) return { word: cleaned, phonetic: '', meaning: zhMeaning || '未找到释义', zhMeaning };
    const data = await res.json();
    const entry = data[0];
    const phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || '';
    const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || '';
    return { word: cleaned, phonetic, meaning, zhMeaning };
  } catch {
    return { word: cleaned, phonetic: '', meaning: zhMeaning || '未找到释义', zhMeaning };
  }
}

interface Props {
  content: IReadingContent;
  onClose: () => void;
  startPage?: number;
}

export default function PageReader({ content, onClose, startPage = 0 }: Props) {
  const { isConfigured, chat: aiChat } = useAI();
  const { addFavorite, isFavorited, favorites, removeFavorite } = useFavorites();
  const totalPages = content.pages.length;

  // TTS paragraph queue — sequential playback with onEnd callback
  const [speakingPara, setSpeakingPara] = useState(-1);
  const paraQueueRef = useRef<string[]>([]);
  const paraIdxRef = useRef(0);
  const onEndRef = useRef<() => void>(null);

  const tts = useTTS({
    onEnd: () => onEndRef.current?.(),
  });

  // Cleanup on unmount: stop TTS and nullify onEnd to prevent setState on unmounted
  useEffect(() => {
    return () => {
      onEndRef.current = null;
      tts.cancel();
      paraQueueRef.current = [];
    };
  }, []);

  // ── State ──
  const [pageIdx, setPageIdx] = useState(() => {
    const saved = loadProgress(content.id);
    return saved.page > 0 ? saved.page : startPage;
  });
  const [transMode, setTransMode] = useState<TransMode>('bilingual');
  const [sentenceMode, setSentenceMode] = useState(false);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('lg');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupWord_State, setLookupWordState] = useState('');
  const [lookupData, setLookupData] = useState<{ word: string; phonetic: string; meaning: string; zhMeaning: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const wheelDebounceRef = useRef(0);

  // TTS cleanup on unmount
  useEffect(() => {
    return () => { tts.cancel(); };
  }, []);

  // Scroll wheel → page navigation
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 4;
    const atTop = scrollTop <= 4;
    const now = Date.now();
    if (now - wheelDebounceRef.current < 600) return;

    if (e.deltaY > 30 && atBottom && currentPage < activePages - 1) {
      wheelDebounceRef.current = now;
      goNext();
    } else if (e.deltaY < -30 && atTop && currentPage > 0) {
      wheelDebounceRef.current = now;
      goPrev();
    }
  }, [currentPage, activePages]);

  // Translation cache state
  const TR_CACHE_KEY = `__reader_trans_${content.id}`;
  const [transCache, setTransCache] = useState<Record<number, string[]>>(() => {
    try { const r = safeStorage.getItem(TR_CACHE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
  });
  const [transLoading, setTransLoading] = useState(false);
  const [transAllLoading, setTransAllLoading] = useState(false);

  // Level conversion
  const [convertLevel, setConvertLevel] = useState<string>(content.difficulty || 'intermediate');
  const [convertLoading, setConvertLoading] = useState(false);
  const [displayContent, setDisplayContent] = useState(content);

  const convertArticleLevel = async (targetLevel: string) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const lvl = LEVELS.find((l) => l.key === targetLevel)!;
    setConvertLevel(targetLevel);
    setConvertLoading(true);
    try {
      const allText = displayContent.pages.map((p) => p.paragraphs.map((pp) => pp.en).join(' ')).join('\n\n');
      const result = await aiChat([
        { role: 'system', content: `Rewrite the following English text for ${lvl.label} English learners. Return ONLY valid JSON (no markdown): {"title":"adapted title","paragraphs":[{"en":"English paragraph","zh":"Chinese translation"}]}. Keep the core meaning but adjust vocabulary, sentence length, and complexity.` },
        { role: 'user', content: `Title: ${displayContent.title}\n\n${allText.slice(0, 5000)}` },
      ], { temperature: 0.6, maxTokens: 4096 });
      const parsed = extractJson<{ title?: string; paragraphs?: IParagraph[] }>(result);
      if (!parsed?.paragraphs?.length) { toast.error('转换失败，请重试'); return; }
      const newContent: IReadingContent = {
        ...displayContent,
        title: parsed.title || displayContent.title,
        pages: buildPages(parsed.paragraphs),
        difficulty: targetLevel as any,
        totalWords: parsed.paragraphs.reduce((s: number, p: IParagraph) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
      };
      setDisplayContent(newContent);
      setPageIdx(0); // Reset to first page
      toast.success(`已转换为${lvl.label}等级！`);
    } catch { toast.error('转换失败'); }
    finally { setConvertLoading(false); }
  };

  // Use displayContent for rendering
  const activeContent = displayContent;
  const activePages = activeContent.pages.length;

  // ── Chapter index ──
  interface ChapterInfo { title: string; pageIndex: number; }
  const chapters = useMemo<ChapterInfo[]>(() => {
    const result: ChapterInfo[] = [];
    for (let pi = 0; pi < activeContent.pages.length; pi++) {
      for (const p of activeContent.pages[pi].paragraphs) {
        if (p.en.startsWith('##CHAPTER##')) {
          result.push({ title: p.en.replace('##CHAPTER##', ''), pageIndex: pi });
        }
      }
    }
    return result;
  }, [activeContent.pages]);
  const hasChapters = chapters.length > 0;
  const [viewMode, setViewMode] = useState<'toc' | 'reading'>(hasChapters ? 'toc' : 'reading');
  const [currentChapter, setCurrentChapter] = useState(0);

  // Clamp page
  const currentPage = Math.max(0, Math.min(pageIdx, activePages - 1));

  // Calculate chapter-relative paragraph numbering for current page
  // Returns an array of per-paragraph numbers (1-based, within chapter, non-header only)
  const paraChapterNumbers = useMemo<number[]>(() => {
    const cp = activeContent.pages[currentPage];
    if (!cp) return [];
    if (!hasChapters) {
      // No chapters: global sequential across all pages
      let globalCount = 0;
      for (let pi = 0; pi < currentPage; pi++) {
        globalCount += activeContent.pages[pi].paragraphs.filter((p) => !p.en.startsWith('##CHAPTER##')).length;
      }
      const result: number[] = [];
      for (const p of cp.paragraphs) {
        if (p.en.startsWith('##CHAPTER##')) { result.push(0); continue; }
        result.push(++globalCount);
      }
      return result;
    }
    // Has chapters: reset counter at each chapter start
    let chIdx = chapters.length - 1;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (currentPage >= chapters[i].pageIndex) { chIdx = i; break; }
    }
    // Count paragraphs from chapter start up to current page
    let count = 0;
    for (let pi = chapters[chIdx].pageIndex; pi <= currentPage; pi++) {
      for (const p of activeContent.pages[pi].paragraphs) {
        if (p.en.startsWith('##CHAPTER##')) continue;
        if (pi < currentPage) count++;
      }
    }
    // Now assign numbers to current page paragraphs
    const result: number[] = [];
    for (const p of cp.paragraphs) {
      if (p.en.startsWith('##CHAPTER##')) { result.push(0); continue; }
      result.push(++count);
    }
    return result;
  }, [hasChapters, chapters, currentPage, activeContent.pages]);

  // Preload wordbank for Chinese word lookup
  useEffect(() => { if (!isAllReady()) preloadAll(); }, []);

  // Save progress
  useEffect(() => { saveProgress(activeContent.id, currentPage); }, [activeContent.id, currentPage]);

  // Sync currentChapter with page changes
  useEffect(() => {
    if (!hasChapters || viewMode !== 'reading') return;
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (pageIdx >= chapters[i].pageIndex) { setCurrentChapter(i); break; }
    }
  }, [pageIdx, hasChapters, chapters, viewMode]);

  // Reset to TOC when content changes (new book opened)
  useEffect(() => {
    setViewMode(hasChapters ? 'toc' : 'reading');
    setCurrentChapter(0);
  }, [content.id]);

  const cancelRef = useRef(false);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playNextParagraph = () => {
    if (cancelRef.current) {
      setSpeakingPara(-1);
      paraQueueRef.current = [];
      return;
    }
    const idx = paraIdxRef.current;
    if (idx >= paraQueueRef.current.length) {
      setSpeakingPara(-1);
      paraQueueRef.current = [];
      return;
    }
    setSpeakingPara(idx);
    const text = paraQueueRef.current[idx];
    paraIdxRef.current = idx + 1;

    // Clear previous timer
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current);

    // Set onEnd — fires when TTS finishes naturally
    onEndRef.current = () => {
      if (cancelRef.current) return;
      speakTimerRef.current = setTimeout(() => playNextParagraph(), 400);
    };

    // Fallback timer: if onEnd never fires, auto-advance
    const estimatedMs = Math.max(3000, text.length * 50);
    speakTimerRef.current = setTimeout(() => {
      if (cancelRef.current) return;
      playNextParagraph();
    }, estimatedMs + 600);

    tts.speak(text, { rate: 0.85 });
  };

  const speakPage = () => {
    const page = activeContent.pages[currentPage];
    if (!page) return;
    stopSpeaking();
    setTimeout(() => {
      cancelRef.current = false;
      const paras = page.paragraphs.map((p) => cleanText(p.en)).filter((t) => t.length > 0);
      if (paras.length === 0) return;
      paraQueueRef.current = paras;
      paraIdxRef.current = 0;
      playNextParagraph();
    }, 150);
  };

  const stopSpeaking = () => {
    cancelRef.current = true;
    onEndRef.current = null;
    if (speakTimerRef.current) { clearTimeout(speakTimerRef.current); speakTimerRef.current = null; }
    tts.cancel();
    setSpeakingPara(-1);
    paraQueueRef.current = [];
  };

  // Page navigation — stop speaking on page change
  const goPrev = () => { stopSpeaking(); setPageIdx((p) => Math.max(0, p - 1)); };
  const goNext = () => { stopSpeaking(); setPageIdx((p) => Math.min(activePages - 1, p + 1)); };
  const jumpPage = (n: number) => setPageIdx(Math.max(0, Math.min(activePages - 1, n - 1)));

  // Word click
  const handleWordClick = useCallback(async (e: React.MouseEvent, word: string) => {
    e.stopPropagation();
    const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (!cleaned || cleaned.length < 2) return;
    setLookupWordState(cleaned);
    setLookupOpen(true);
    setLookupLoading(true);
    setLookupData(null);
    const data = await lookupWord(cleaned);
    setLookupData(data);
    setLookupLoading(false);
  }, []);

  // Favorite word
  const favWord = isFavorited(lookupWord_State, 'word');
  const toggleWordFav = () => {
    if (!lookupWord_State) return;
    if (favWord) {
      const f = favorites.find((x) => x.content === lookupWord_State && x.type === 'word');
      if (f) removeFavorite(f.id);
      toast('已取消收藏');
    } else {
      addFavorite({ type: 'word', content: lookupWord_State, meaning: lookupData?.meaning || '', category: '' });
      toast.success(`已收藏 "${lookupWord_State}"`);
    }
  };

  // Favorite current page (as expression)
  const favPage = () => {
    const page = activeContent.pages[currentPage];
    if (!page) return;
    const snippet = page.paragraphs.slice(0, 3).map((p) => cleanText(p.en).slice(0, 100)).join(' ');
    addFavorite({ type: 'expression', content: snippet, meaning: page.paragraphs[0]?.zh || '', category: activeContent.topic });
    toast.success('已收藏当前页');
  };

  // Favorite entire article
  const articleFaved = isFavorited(activeContent.id, 'article');
  const favArticle = () => {
    if (articleFaved) {
      const f = favorites.find((x) => x.content === activeContent.id && x.type === 'article');
      if (f) removeFavorite(f.id);
      toast('已取消收藏');
    } else {
      addFavorite({
        type: 'article',
        content: activeContent.id,
        meaning: activeContent.zhTitle || activeContent.title,
        example: activeContent.source,
        category: activeContent.type,
      });
      toast.success('已收藏文章');
    }
  };

  // ── AI Translation for untranslated content ──
  const currentPageData = activeContent.pages[currentPage];
  const needsTranslation = transMode !== 'en' && currentPageData?.paragraphs.some((p) => !p.zh);
  const pageHasCache = currentPageData && transCache[currentPage];

  const translateCurrentPage = async () => {
    if (!isConfigured || !currentPageData || !needsTranslation) return;
    setTransLoading(true);
    try {
      const untranslated = currentPageData.paragraphs.filter((p) => !p.zh);
      // Translate each paragraph individually for reliable alignment
      const zhResults: string[] = [];
      for (const p of untranslated) {
        const result = await aiChat([
          { role: 'system', content: 'Translate the following English to natural Chinese. Return ONLY the Chinese translation, no extra text, no markdown.' },
          { role: 'user', content: p.en.slice(0, 1500) },
        ], { temperature: 0.3, maxTokens: 1024 });
        zhResults.push(result.trim());
      }
      const newCache = { ...transCache, [currentPage]: zhResults };
      setTransCache(newCache);
      safeStorage.setItem(TR_CACHE_KEY, JSON.stringify(newCache));
      const updatedPages = [...activeContent.pages];
      let zi = 0;
      updatedPages[currentPage] = {
        ...currentPageData,
        paragraphs: currentPageData.paragraphs.map((p) => (!p.zh && zi < zhResults.length ? { ...p, zh: zhResults[zi++] } : p)),
      };
      setDisplayContent({ ...activeContent, pages: updatedPages });
    } catch { toast.error('翻译失败'); }
    finally { setTransLoading(false); }
  };

  const translateAllPages = async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setTransAllLoading(true);
    let count = 0;
    try {
      const allUntranslated = activeContent.pages.flatMap(
        (p, pi) => p.paragraphs.map((pp, ppi) => ({ en: pp.en, pageIdx: pi, paraIdx: ppi })).filter((x) => !activeContent.pages[pi].paragraphs[ppi].zh),
      );
      if (allUntranslated.length === 0) { toast('所有页面已有翻译'); return; }
      const newCache = { ...transCache };
      let updatedPages = [...activeContent.pages];
      for (const item of allUntranslated) {
        const result = await aiChat([
          { role: 'system', content: 'Translate the following English to natural Chinese. Return ONLY the Chinese translation, no extra text.' },
          { role: 'user', content: item.en.slice(0, 1500) },
        ], { temperature: 0.3, maxTokens: 1024 });
        const zh = result.trim();
        updatedPages[item.pageIdx] = {
          ...updatedPages[item.pageIdx],
          paragraphs: updatedPages[item.pageIdx].paragraphs.map((p, i) =>
            i === item.paraIdx ? { ...p, zh } : p,
          ),
        };
        count++;
        // Update cache per page
        const pg = updatedPages[item.pageIdx];
        newCache[item.pageIdx] = pg.paragraphs.filter((p) => p.zh).map((p) => p.zh);
      }
      setTransCache(newCache);
      safeStorage.setItem(TR_CACHE_KEY, JSON.stringify(newCache));
      setDisplayContent({ ...activeContent, pages: updatedPages });
      toast.success(`已翻译 ${count} 个段落！`);
    } catch { toast.error('批量翻译失败'); }
    finally { setTransAllLoading(false); }
  };

  // Apply cached translations on page change
  useEffect(() => {
    if (!currentPageData || transMode === 'en') return;
    const cached = transCache[currentPage];
    if (cached && cached.length > 0) {
      let ci = 0;
      const updated = currentPageData.paragraphs.map((p) => {
        if (!p.zh && ci < cached.length) return { ...p, zh: cached[ci++] };
        return p;
      });
      if (updated.some((p, i) => p.zh !== currentPageData.paragraphs[i]?.zh)) {
        const updatedPages = [...activeContent.pages];
        updatedPages[currentPage] = { ...currentPageData, paragraphs: updated };
        setDisplayContent((prev) => ({ ...prev, pages: updatedPages }));
      }
    }
  }, [currentPage, transMode]);

  if (!activeContent.pages.length) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="size-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">内容为空</p>
          <Button variant="outline" onClick={onClose} className="mt-4 rounded-2xl">返回</Button>
        </div>
      </div>
    );
  }

  const page = activeContent.pages[currentPage];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl shrink-0">
          <X className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black text-foreground truncate">{activeContent.zhTitle || activeContent.title}</h2>
          <p className="text-[10px] font-medium text-muted-foreground truncate">
            {activeContent.author && `${activeContent.author} · `}{activeContent.source} · {activeContent.difficulty}
          </p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="shrink-0 px-4 py-2 flex items-center gap-1.5 border-b border-border/50 flex-wrap">
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {([
            { key: 'en', label: '原文' },
            { key: 'bilingual', label: '对照' },
            { key: 'zh', label: '译文' },
          ] as { key: TransMode; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTransMode(key)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                transMode === key ? 'bg-white dark:bg-card text-[#00B894] shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >{label}</button>
          ))}
        </div>
        {/* Sentence mode toggle */}
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          onClick={() => setSentenceMode((v) => !v)}
          className={cn(
            'px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
            sentenceMode ? 'bg-white dark:bg-card text-[#00B894] shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >逐句</button>
        {/* Font size toggle */}
        <div className="w-px h-4 bg-border mx-0.5" />
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {([
            { key: 'sm' as const, label: '小' },
            { key: 'base' as const, label: '中' },
            { key: 'lg' as const, label: '大' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFontSize(key)}
              className={cn(
                'px-2 py-1 rounded-md text-[10px] font-bold transition-all',
                fontSize === key ? 'bg-white dark:bg-card text-[#00B894] shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >{label}</button>
          ))}
        </div>
        {/* Inline level conversion — click to convert current article */}
        <div className="w-px h-4 bg-border mx-0.5" />
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {LEVELS.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => convertArticleLevel(key)}
              disabled={convertLoading || !isConfigured}
              className={cn('px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all',
                convertLevel === key ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              style={convertLevel === key ? { backgroundColor: color } : undefined}
              title={`转换为${label}等级`}
            >
              {convertLoading && convertLevel === key ? <Loader2 className="size-2.5 animate-spin inline mr-0.5" /> : null}
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {needsTranslation && isConfigured && (
          <Button
            variant="ghost" size="sm"
            onClick={translateCurrentPage}
            disabled={transLoading}
            className="rounded-xl text-[10px] font-bold gap-1 text-amber-600 hover:text-amber-700"
          >
            {transLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
            AI翻译
          </Button>
        )}
        {isConfigured && (
          <Button
            variant="ghost" size="sm"
            onClick={translateAllPages}
            disabled={transAllLoading}
            className="rounded-xl text-[10px] font-bold gap-1"
          >
            {transAllLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            翻译全部
          </Button>
        )}
        {speakingPara >= 0 ? (
          <Button variant="ghost" size="sm" onClick={stopSpeaking} className="rounded-xl text-[10px] font-bold gap-1 text-[#00B894]">
            <Pause className="size-3.5" />停止
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={speakPage} className="rounded-xl text-[10px] font-bold gap-1">
            <Volume2 className="size-3.5" />朗读
          </Button>
        )}
        <Button
          variant="ghost" size="sm"
          onClick={favArticle}
          className={cn('rounded-xl text-[10px] font-bold gap-1', articleFaved && 'text-rose-500')}
        >
          <Heart className={cn('size-3.5', articleFaved && 'fill-current')} />{articleFaved ? '已收藏' : '收藏'}
        </Button>
        {hasChapters && viewMode === 'reading' && (
          <Button variant="ghost" size="sm" onClick={() => { setViewMode('toc'); }} className="rounded-xl text-[10px] font-bold gap-1">
            <BookOpen className="size-3.5" />目录
          </Button>
        )}
      </div>

      {/* ── Chapter Navigation ── */}
      {hasChapters && viewMode === 'reading' && (
        <div className="shrink-0 px-4 py-1.5 flex items-center justify-center gap-2 border-b border-border/30 bg-muted/30">
          <Button
            variant="ghost" size="icon"
            onClick={() => {
              const prev = Math.max(0, currentChapter - 1);
              setCurrentChapter(prev);
              setPageIdx(chapters[prev].pageIndex);
            }}
            disabled={currentChapter <= 0}
            className="rounded-lg size-7 text-muted-foreground hover:text-[#00B894]"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <button
              onClick={() => setViewMode('toc')}
              className="text-[10px] font-black text-foreground hover:text-[#00B894] transition-colors line-clamp-1 px-1"
            >
              {chapters[currentChapter]?.title || activeContent.title}
            </button>
            <p className="text-[8px] text-muted-foreground">
              {currentChapter + 1} / {chapters.length}
            </p>
          </div>
          <Button
            variant="ghost" size="icon"
            onClick={() => {
              const next = Math.min(chapters.length - 1, currentChapter + 1);
              setCurrentChapter(next);
              setPageIdx(chapters[next].pageIndex);
            }}
            disabled={currentChapter >= chapters.length - 1}
            className="rounded-lg size-7 text-muted-foreground hover:text-[#00B894]"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}

      {/* ── TOC / Reading Content ── */}
      <div
        ref={scrollAreaRef}
        onWheel={handleWheel}
        className="flex-1 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch"
      >
        {viewMode === 'toc' && hasChapters ? (
          /* ── TABLE OF CONTENTS ── */
          <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-4">
            <div className="text-center mb-6">
              <BookOpen className="size-10 text-[#00B894] mx-auto mb-3" />
              <h2 className="text-xl font-black italic text-foreground">{activeContent.zhTitle || activeContent.title}</h2>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                {activeContent.author || activeContent.source} · {chapters.length} 章节
              </p>
            </div>
            <div className="space-y-2">
              {chapters.map((ch, i) => {
                const endPage = i < chapters.length - 1 ? chapters[i + 1].pageIndex : activePages;
                const startPage = ch.pageIndex + 1;
                const rangeLabel = startPage === endPage ? `第${startPage}页` : `第${startPage}-${endPage}页`;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentChapter(i);
                      setPageIdx(ch.pageIndex);
                      setViewMode('reading');
                    }}
                    className="w-full text-left p-4 rounded-2xl border-2 border-border hover:border-[#00B894]/50 hover:bg-[#00B894]/5 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 size-8 rounded-xl bg-muted flex items-center justify-center text-xs font-black text-muted-foreground group-hover:bg-[#00B894]/10 group-hover:text-[#00B894]">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-black text-foreground group-hover:text-[#00B894] transition-colors line-clamp-1">
                          {ch.title}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{rangeLabel}</p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-[#00B894]" />
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Continue reading button */}
            <div className="pt-4">
              <Button
                onClick={() => {
                  // Jump to last saved page or first chapter
                  const saved = loadProgress(activeContent.id);
                  if (saved.page > 0) {
                    setPageIdx(saved.page);
                    const ch = chapters.findIndex((c, i) => {
                      const nextStart = i < chapters.length - 1 ? chapters[i + 1].pageIndex : activePages;
                      return saved.page >= c.pageIndex && saved.page < nextStart;
                    });
                    if (ch >= 0) setCurrentChapter(ch);
                  } else {
                    setPageIdx(chapters[0].pageIndex);
                    setCurrentChapter(0);
                  }
                  setViewMode('reading');
                }}
                className="w-full rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg shadow-emerald-200/50"
              >
                📖 继续阅读
              </Button>
            </div>
          </div>
        ) : (
          /* ── READING MODE ── */
          <div ref={contentRef} className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 bg-white/80 rounded-2xl my-2">
            {page.paragraphs.map((para, i) => (
                <ParagraphBlock
                  key={i}
                  para={para}
                  paraIndex={paraChapterNumbers[i] || 0}
                  transMode={transMode}
                  sentenceMode={sentenceMode}
                  fontSize={fontSize}
                  onWordClick={handleWordClick}
                  isSpeaking={speakingPara === i}
                  tts={tts}
                />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination Footer ── */}
      <div className="shrink-0 border-t border-border px-3 sm:px-4 py-3 flex items-center justify-center gap-2 sm:gap-3">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentPage === 0} className="rounded-xl text-[10px] font-bold gap-1 px-2 sm:px-3">
          <ChevronLeft className="size-4" /><span className="hidden sm:inline">上一页</span>
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground tabular-nums whitespace-nowrap">{currentPage + 1} / {activePages}</span>
          <Input
            type="number"
            min={1}
            max={activePages}
            className="w-12 sm:w-14 h-8 text-center text-xs font-bold rounded-xl"
            placeholder={`${currentPage + 1}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = parseInt((e.target as HTMLInputElement).value);
                if (n >= 1 && n <= activePages) jumpPage(n);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={goNext} disabled={currentPage >= activePages - 1} className="rounded-xl text-[10px] font-bold gap-1 px-2 sm:px-3">
          <span className="hidden sm:inline">下一页</span><ChevronRight className="size-4" />
        </Button>
      </div>

      {/* ── Word Lookup Dialog ── */}
      <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <DialogContent className="max-w-sm rounded-[28px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2">
              <Hash className="size-5 text-[#00B894]" />
              {lookupWord_State}
              {lookupData?.phonetic && (
                <span className="text-sm font-normal text-muted-foreground">{lookupData.phonetic}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            {lookupLoading ? (
              <p className="text-sm text-muted-foreground">查询中...</p>
            ) : (
              <div className="space-y-3">
                {lookupData?.zhMeaning && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">中文释义</p>
                    <p className="text-sm font-bold text-[#00B894]">{lookupData.zhMeaning}</p>
                  </div>
                )}
                {lookupData?.meaning && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">英文释义</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{lookupData.meaning}</p>
                  </div>
                )}
                {!lookupData?.meaning && !lookupData?.zhMeaning && (
                  <p className="text-sm text-muted-foreground">未找到释义</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => { tts.speak(lookupWord_State); }}
                variant="outline"
                className="rounded-xl text-xs font-bold gap-1"
              >
                <Volume2 className="size-3.5" />发音
              </Button>
              <Button
                size="sm"
                onClick={toggleWordFav}
                className={cn('rounded-xl text-xs font-bold gap-1', favWord ? 'bg-rose-500 hover:bg-rose-600 text-white' : '')}
                variant={favWord ? 'default' : 'outline'}
              >
                <Heart className={cn('size-3.5', favWord && 'fill-current')} />
                {favWord ? '已收藏' : '收藏'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Paragraph block with word-click + individual TTS + sentence mode + chapter support ──
const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];

const FONT_SIZES: Record<string, string> = { sm: 'text-base leading-7', base: 'text-lg leading-8', lg: 'text-xl leading-9' };

function ParagraphBlock({
  para, paraIndex, transMode, sentenceMode, fontSize, onWordClick, isSpeaking, tts,
}: {
  para: IParagraph; paraIndex?: number; transMode: TransMode; sentenceMode: boolean;
  fontSize?: 'sm' | 'base' | 'lg';
  onWordClick: (e: React.MouseEvent, word: string) => void;
  isSpeaking?: boolean;
  tts: ReturnType<typeof useTTS>;
}) {
  const textClass = FONT_SIZES[fontSize || 'base'];
  const numLabel = paraIndex && paraIndex <= 20 ? CIRCLED[paraIndex - 1] : paraIndex ? `(${paraIndex})` : null;
  const isChapter = para.en.startsWith('##CHAPTER##');
  const displayEn = isChapter ? para.en.replace('##CHAPTER##', '') : para.en;
  const words = displayEn.split(/\s+/).filter(Boolean);

  // Chapter header rendering
  if (isChapter) {
    return (
      <div className="flex items-center gap-3 py-2 my-1">
        <div className="flex-1 h-px bg-[#00B894]/20" />
        <h3 className="text-xs font-black uppercase tracking-widest text-[#00B894] whitespace-nowrap px-2">
          {displayEn}
        </h3>
        <div className="flex-1 h-px bg-[#00B894]/20" />
      </div>
    );
  }

  const renderWordBlock = (text: string) => {
    const sWords = text.split(/\s+/).filter(Boolean);
    return sWords.map((w, i) => {
      const clean = w.replace(/[^a-zA-Z'-]/g, '');
      const isWord = clean.length >= 2;
      return (
        <span key={i}>
          {i > 0 && ' '}
          <span
            className={cn(
              isWord && 'cursor-pointer hover:text-[#00B894] hover:underline underline-offset-2 transition-colors',
            )}
            onClick={isWord ? (e) => onWordClick(e, w) : undefined}
          >
            {w}
          </span>
        </span>
      );
    });
  };

  if (sentenceMode) {
    const sentences = splitSentences(displayEn);
    return (
      <div className="space-y-2 py-1">
        <div className="flex items-start gap-2">
          <button
            onClick={() => tts.speak(cleanText(displayEn), { rate: 0.9 })}
            className="shrink-0 text-muted-foreground/30 hover:text-[#00B894] transition-colors mt-1"
            title="朗读本段"
          >
            <Volume2 className="size-3.5" />
          </button>
          {numLabel && (
            <span className="shrink-0 text-xs font-bold text-muted-foreground/50 mt-0.5 select-none">{numLabel} </span>
          )}
          <div className="space-y-2 flex-1">
            {(transMode === 'en' || transMode === 'bilingual') &&
              sentences.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground/40 mt-1.5 shrink-0 w-5 text-right tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      textClass, 'text-gray-900 font-bold transition-colors rounded-lg px-1 -mx-1',
                      isSpeaking && 'bg-[#00B894]/10 text-[#00B894]',
                    )}>
                      {renderWordBlock(s)}
                    </p>
                  </div>
                  <button
                    onClick={() => tts.speak(cleanText(s), { rate: 0.85 })}
                    className="shrink-0 text-muted-foreground/30 hover:text-[#00B894] transition-colors mt-1"
                    title="朗读本句"
                  >
                    <Volume2 className="size-3" />
                  </button>
                </div>
              ))}
            {(transMode === 'zh' || transMode === 'bilingual') && para.zh && (
              <p className="text-base text-gray-700 leading-7 pl-3 border-l-2 border-[#00B894]/50">
                {para.zh}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normal paragraph mode
  return (
    <div className="space-y-1 group/para">
      {(transMode === 'en' || transMode === 'bilingual') && (
        <div className="flex items-start gap-2">
          <button
            onClick={() => tts.speak(cleanText(displayEn), { rate: 0.9 })}
            className="shrink-0 text-muted-foreground/40 hover:text-[#00B894] transition-colors mt-1"
            title="朗读本段"
          >
            <Volume2 className="size-3.5" />
          </button>
          {numLabel && (
            <span className="shrink-0 text-xs font-bold text-muted-foreground/50 mt-0.5 select-none">{numLabel} </span>
          )}
          <p className={cn(
            textClass, 'text-gray-900 font-bold transition-colors rounded-lg px-1 -mx-1 flex-1',
            isSpeaking && 'bg-[#00B894]/10 text-[#00B894]',
          )}>
            {renderWordBlock(displayEn)}
          </p>
        </div>
      )}
      {(transMode === 'zh' || transMode === 'bilingual') && para.zh && (
        <p className="text-base text-gray-700 leading-7 pl-3 border-l-2 border-[#00B894]/50 ml-6">
          {para.zh}
        </p>
      )}
    </div>
  );
}
