import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, BookOpen, Heart, Globe,
  Sparkles, Hash, Wand2, Loader2, Volume2, ChevronDown, ChevronUp, ListTree, Repeat, Copy, Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText, extractJson } from '@/lib/utils';
import { toast } from 'sonner';
import type { IReadingContent, TransMode, IParagraph } from '@/data/reading';
import { buildPages } from '@/data/reading';
import { queryWords, preloadLevels, getEssentialLevels, isAllReady } from '@/data/wordbank';

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

// ── Word lookup: wordbank Chinese + dictionary API English ──
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

  // ── 连读（auto-read) refs — declared before useTTS so the onEnd closure
  // can read the latest page state without stale-closure pitfalls ──
  const autoReadRef = useRef(false);
  const currentPageRef = useRef(0);
  const activePagesRef = useRef(0);
  const turnRef = useRef<(target: number, dir: 'next' | 'prev') => void>(() => {});
  const speakPageRef = useRef<() => void>(() => {});
  const [autoReadPages, setAutoReadPages] = useState(false);

  const tts = useTTS({
    // When 连读 is on, advance to the next page and keep reading after each page
    onEnd: () => {
      if (!autoReadRef.current) return;
      setTimeout(() => {
        if (!autoReadRef.current) return;
        if (currentPageRef.current < activePagesRef.current - 1) {
          turnRef.current(currentPageRef.current + 1, 'next');
          setTimeout(() => speakPageRef.current(), 380);
        } else {
          autoReadRef.current = false;
          setAutoReadPages(false);
          toast.success('整篇连读完成');
        }
      }, 420);
    },
  });

  // Cleanup on unmount: stop TTS + release heavy references for GC
  useEffect(() => { return () => { try { tts.cancel(); } catch { /* */ } }; }, []);
  useEffect(() => { return () => {
    // Help GC by clearing translation cache and display content on unmount
    setTransCache({});
    setDisplayContent(content);
  }; }, []);

  // Safe speak wrapper — prevents crashes on unsupported devices
  const safeSpeak = useCallback((text: string, opts?: { rate?: number }) => {
    try { tts.speak(text, opts); } catch { /* TTS not available — silent */ }
  }, [tts]);

  // ── State ──
  const [pageIdx, setPageIdx] = useState(() => {
    const saved = loadProgress(content.id);
    return saved.page > 0 ? saved.page : startPage;
  });
  const [transMode, setTransMode] = useState<TransMode>('bilingual');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>(() => {
    try {
      const prefs = JSON.parse(safeStorage.getItem('__nativethink_reader_prefs') || '{}');
      if (['sm', 'base', 'lg', 'xl'].includes(prefs.fontSize)) return prefs.fontSize;
    } catch { /* ignore */ }
    return 'lg';
  });
  // ── 沉浸式阅读：点击内容区切换工具栏；设置面板；阅读主题 ──
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerTheme, setReaderTheme] = useState<'light' | 'paper' | 'night'>(() => {
    try {
      const prefs = JSON.parse(safeStorage.getItem('__nativethink_reader_prefs') || '{}');
      if (['light', 'paper', 'night'].includes(prefs.theme)) return prefs.theme;
    } catch { /* ignore */ }
    return 'light';
  });
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);
  // Persist reader preferences
  useEffect(() => {
    try { safeStorage.setItem('__nativethink_reader_prefs', JSON.stringify({ fontSize, theme: readerTheme })); } catch { /* quota */ }
  }, [fontSize, readerTheme]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupWord_State, setLookupWordState] = useState('');
  const [lookupData, setLookupData] = useState<{ word: string; phonetic: string; meaning: string; zhMeaning: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Translation cache
  const TR_CACHE_KEY = `__reader_trans_${content.id}`;
  const [transCache, setTransCache] = useState<Record<number, string[]>>(() => {
    try { const r = safeStorage.getItem(TR_CACHE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
  });
  const [transLoading, setTransLoading] = useState(false);
  const [paraTranslating, setParaTranslating] = useState<string | null>(null);
  const [transAllLoading, setTransAllLoading] = useState(false);

  // Level conversion
  const [convertLevel, setConvertLevel] = useState<string>(content.difficulty || 'intermediate');
  const [convertLoading, setConvertLoading] = useState(false);
  const [displayContent, setDisplayContent] = useState(content);

  // Mobile toolbar collapse
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  const [toolbarExpanded, setToolbarExpanded] = useState(false);

  // Chapter TOC — built from ##CHAPTER## markers; recomputed after AI level conversion
  const [tocOpen, setTocOpen] = useState(false);
  const chapters = useMemo(() => {
    const list: { title: string; page: number }[] = [];
    displayContent.pages.forEach((pg) => {
      pg.paragraphs.forEach((p) => {
        if (p.en.startsWith('##CHAPTER##')) {
          list.push({ title: p.en.replace('##CHAPTER##', '').trim(), page: pg.pageNumber - 1 });
        }
      });
    });
    return list;
  }, [displayContent]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Touch swipe navigation (refs + state declared early, handlers below after page vars) ──
  const SWIPE_THRESHOLD = 80; // minimum displacement (px) to trigger page change
  const SWIPE_LOCK_THRESHOLD = 20; // minimum movement to decide scroll vs swipe
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isSwipingRef = useRef(false);
  const gestureDecidedRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeOffsetRef = useRef(0); // ref for tracking during gesture (no re-render)
  const [isAnimating, setIsAnimating] = useState(false); // controls CSS transition
  const [swipeOffset, setSwipeOffset] = useState(0); // state for final animation only

  const convertArticleLevel = async (targetLevel: string) => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    const lvl = LEVELS.find((l) => l.key === targetLevel)!;
    setConvertLevel(targetLevel);
    setConvertLoading(true);
    try {
      const allText = validPages.map((p) => p.paragraphs.map((pp) => pp.en).join(' ')).join('\n\n');
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
      setPageIdx(0);
      toast.success(`已转换为${lvl.label}等级！`);
    } catch { toast.error('转换失败'); }
    finally { setConvertLoading(false); }
  };

  const activeContent = displayContent;
  // Guard against malformed content (missing pages array, null paragraphs)
  const validPages = activeContent?.pages?.filter(p => p && Array.isArray(p.paragraphs)) || [];
  const activePages = validPages.length;
  const currentPage = activePages > 0 ? Math.max(0, Math.min(pageIdx, activePages - 1)) : 0;
  const currentPageData = validPages[currentPage] || null;

  // Preload only essential wordbank levels for Chinese word lookup (not all 9 levels)
  useEffect(() => {
    if (!isAllReady()) {
      const essential = getEssentialLevels(); // User's level + 1 adjacent (~3 levels max)
      preloadLevels(essential);
    }
  }, []);

  // Save progress
  useEffect(() => { saveProgress(activeContent.id, currentPage); }, [activeContent.id, currentPage]);

  // Page navigation — with directional slide animation.
  // turnTo sets the anim class BEFORE the page renders so the remounted
  // content (key={currentPage}) plays page-turn-next / page-turn-prev.
  const [pageAnim, setPageAnim] = useState<'next' | 'prev' | null>(null);
  const pageAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnTo = useCallback((target: number, dir: 'next' | 'prev') => {
    setPageIdx(target);
    setPageAnim(dir);
    if (pageAnimTimer.current) clearTimeout(pageAnimTimer.current);
    pageAnimTimer.current = setTimeout(() => setPageAnim(null), 260);
  }, []);
  const goPrev = () => { if (currentPage > 0) turnTo(currentPage - 1, 'prev'); };
  const goNext = () => { if (currentPage < activePages - 1) turnTo(currentPage + 1, 'next'); };

  // Sync refs for the 连读 onEnd closure
  currentPageRef.current = currentPage;
  activePagesRef.current = activePages;
  turnRef.current = turnTo;

  /** 朗读当前页（连读模式的核心步骤，也被工具栏按钮调用） */
  const speakCurrentPage = useCallback(() => {
    const data = validPages[currentPageRef.current];
    if (!data) return;
    const text = data.paragraphs
      .filter((p) => !p.en.startsWith('##CHAPTER##'))
      .map((p) => cleanText(p.en))
      .join(' ');
    if (text) safeSpeak(text, { rate: 0.85 });
  }, [validPages, safeSpeak]);
  speakPageRef.current = speakCurrentPage;

  /** 切换连读：开启即从当前页开始朗读，结束/关闭自动停止 */
  const toggleAutoRead = useCallback(() => {
    const next = !autoReadRef.current;
    autoReadRef.current = next;
    setAutoReadPages(next);
    if (next) {
      toast.success('连读已开启 — 读完本页自动继续下一页');
      speakCurrentPage();
    } else {
      tts.cancel();
    }
  }, [speakCurrentPage, tts]);

  // Touch swipe handlers (must be after goPrev/goNext and currentPage/activePages are defined)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isSwipingRef.current = false;
    gestureDecidedRef.current = false;
    swipeOffsetRef.current = 0;
    setIsAnimating(false);
    if (contentRef.current) {
      contentRef.current.style.transition = 'none';
      contentRef.current.style.transform = 'translateX(0px)';
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    e.stopPropagation();

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // If gesture not yet decided, determine scroll vs swipe
    if (!gestureDecidedRef.current) {
      if (absDeltaX < SWIPE_LOCK_THRESHOLD && absDeltaY < SWIPE_LOCK_THRESHOLD) return;

      // Vertical movement dominates -> scroll
      if (absDeltaY > absDeltaX * 1.5) {
        touchStartRef.current = null;
        return;
      }

      // Horizontal dominates -> lock into swipe mode
      gestureDecidedRef.current = true;
      isSwipingRef.current = true;
    }

    // Swipe mode -- update DOM directly via ref (no React re-render)
    if (isSwipingRef.current) {
      let clamped = deltaX;
      if (deltaX > 0 && currentPage === 0) {
        clamped = deltaX * Math.max(0.1, 0.4 - deltaX * 0.001);
      }
      if (deltaX < 0 && currentPage >= activePages - 1) {
        clamped = deltaX * Math.max(0.1, 0.4 - Math.abs(deltaX) * 0.001);
      }
      swipeOffsetRef.current = clamped;
      if (contentRef.current) {
        contentRef.current.style.transform = `translateX(${clamped}px)`;
      }
    }
  }, [currentPage, activePages]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchStartRef.current) return;

    const dx = swipeOffsetRef.current;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);

    const shouldChange = Math.abs(dx) > SWIPE_THRESHOLD || (Math.abs(dx) > 40 && velocity > 0.5);

    if (shouldChange && isSwipingRef.current) {
      if (dx < 0 && currentPage < activePages - 1) goNext();
      else if (dx > 0 && currentPage > 0) goPrev();
    }

    // Snap back with CSS transition
    setIsAnimating(true);
    if (contentRef.current) {
      contentRef.current.style.transition = '';
      contentRef.current.style.transform = '';
    }
    setSwipeOffset(0);

    touchStartRef.current = null;
    isSwipingRef.current = false;
    gestureDecidedRef.current = false;
    swipeOffsetRef.current = 0;
  }, [currentPage, activePages]);

  const handleTouchCancel = useCallback(() => {
    setIsAnimating(true);
    if (contentRef.current) {
      contentRef.current.style.transition = '';
      contentRef.current.style.transform = '';
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
    isSwipingRef.current = false;
    gestureDecidedRef.current = false;
    swipeOffsetRef.current = 0;
  }, []);

  // Keyboard navigation: ← → for pages, Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePages, onClose]);

  // Word click — lookup Chinese + English definitions
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

  // Favorite article
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

  // ── AI Translation ──
  const needsTranslation = transMode !== 'en' && currentPageData?.paragraphs.some((p) => !p.zh);

  const translateCurrentPage = async () => {
    if (!isConfigured || !currentPageData || !needsTranslation) return;
    setTransLoading(true);
    try {
      const untranslated = currentPageData.paragraphs.filter((p) => !p.zh);
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
      const updatedPages = [...validPages];
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
      const allUntranslated = validPages.flatMap(
        (p, pi) => p.paragraphs.map((pp, ppi) => ({ en: pp.en, pageIdx: pi, paraIdx: ppi })).filter((x) => !validPages[x.pageIdx].paragraphs[x.paraIdx].zh),
      );
      if (allUntranslated.length === 0) { toast('所有页面已有翻译'); return; }
      const newCache = { ...transCache };
      let updatedPages = [...validPages];
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

  // Translate a single paragraph
  const translateParagraph = async (pageNum: number, paraIdx: number) => {
    if (!isConfigured) return;
    const page = validPages[pageNum];
    if (!page) return;
    const para = page.paragraphs[paraIdx];
    if (!para || para.zh || para.en.startsWith('##CHAPTER##')) return;
    const key = `${pageNum}-${paraIdx}`;
    setParaTranslating(key);
    try {
      const result = await aiChat([
        { role: 'system', content: 'Translate the following English to natural Chinese. Return ONLY the Chinese translation, no extra text, no markdown.' },
        { role: 'user', content: para.en.slice(0, 1500) },
      ], { temperature: 0.3, maxTokens: 1024 });
      const zh = result.trim();
      const updatedPages = [...validPages];
      updatedPages[pageNum] = {
        ...page,
        paragraphs: page.paragraphs.map((p, i) => i === paraIdx ? { ...p, zh } : p),
      };
      setDisplayContent({ ...activeContent, pages: updatedPages });
    } catch { /* silent */ }
    finally { setParaTranslating(null); }
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
        const updatedPages = [...validPages];
        updatedPages[currentPage] = { ...currentPageData, paragraphs: updated };
        setDisplayContent((prev) => ({ ...prev, pages: updatedPages }));
      }
    }
  }, [currentPage, transMode]);

  if (!validPages.length) {
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

  return (
    <div className={cn('fixed inset-0 z-50 bg-background flex flex-col', readerTheme === 'paper' && 'reader-paper', readerTheme === 'night' && 'reader-night')}>
      {/* ── 阅读进度条（当前页/总页） ── */}
      {activePages > 0 && (
        <div className="shrink-0 h-0.5 bg-muted/60">
          <div
            className="h-full bg-[#00B894] transition-all duration-300 ease-out"
            style={{ width: `${((currentPage + 1) / activePages) * 100}%` }}
          />
        </div>
      )}
      {/* ── Header（沉浸式 — 点击内容区可隐藏/呼出） ── */}
      <header className={cn(
        'shrink-0 overflow-hidden transition-all duration-200 border-b border-border/60 bg-background/95 backdrop-blur-sm z-10',
        chromeVisible ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0 border-b-0',
      )}>
        <div className="px-3 sm:px-4 py-2.5 flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl size-9 shrink-0" title="退出阅读">
            <X className="size-5" />
          </Button>
          <div className="flex-1 min-w-0 text-center px-1">
            <h2 className="text-sm font-black text-foreground truncate">{activeContent.zhTitle || activeContent.title}</h2>
            <p className="text-[10px] font-medium text-muted-foreground truncate">
              {activeContent.author ? activeContent.author + ' · ' : ''}{activeContent.source}
            </p>
          </div>
          {chapters.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setTocOpen(true)} className="rounded-xl size-9 shrink-0" title="目录">
              <ListTree className="size-4.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} className="rounded-xl size-9 shrink-0" title="阅读设置">
            <Type className="size-4.5" />
          </Button>
        </div>
      </header>

      {/* ── Content (current page only) with touch swipe ── */}
      <div
        ref={contentRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overscroll-contain relative",
          isAnimating && "transition-transform duration-200 ease-out"
        )}
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        onClick={toggleChrome}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Swipe edge indicators -- visual feedback during horizontal swipe */}
        {swipeOffset > 20 && (
          <div
            className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
            style={{ background: `linear-gradient(to right, rgba(0,184,148,${Math.min((swipeOffset - 20) / 80, 0.6)}), transparent)` }}
          >
            <ChevronLeft className="absolute left-3 top-1/2 -translate-y-1/2 size-6 text-[#00B894]" style={{ opacity: Math.min((swipeOffset - 20) / 80, 0.6) }} />
          </div>
        )}
        {swipeOffset < -20 && (
          <div
            className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
            style={{ background: `linear-gradient(to left, rgba(0,184,148,${Math.min((-swipeOffset - 20) / 80, 0.6)}), transparent)` }}
          >
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 size-6 text-[#00B894]" style={{ opacity: Math.min((-swipeOffset - 20) / 80, 0.6) }} />
          </div>
        )}
        {/* Page content with swipe translate; keyed by page → directional turn animation */}
        <div
          key={currentPage}
          className={cn(
            'max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5',
            pageAnim === 'next' && 'page-turn-next',
            pageAnim === 'prev' && 'page-turn-prev',
          )}
        >
          {currentPageData?.paragraphs.map((para, i) => {
            const displayEn = para.en.startsWith('##CHAPTER##') ? para.en.replace('##CHAPTER##', '') : para.en;
            const isChapter = para.en.startsWith('##CHAPTER##');
            const fontSizeClass = fontSize === 'sm' ? 'text-base leading-7' : fontSize === 'base' ? 'text-lg leading-8' : fontSize === 'lg' ? 'text-xl leading-9' : 'text-2xl leading-10';

            return (
              <div key={i} className={isChapter ? 'text-center pt-10 pb-3' : ''}>
                {isChapter ? (
                  <div className="flex items-center justify-center gap-3">
                    <span className="h-px w-8 sm:w-12 bg-[#00B894]/30" />
                    <h3 className="text-base sm:text-lg font-black text-[#00B894] tracking-wide">{displayEn}</h3>
                    <span className="h-px w-8 sm:w-12 bg-[#00B894]/30" />
                  </div>
                ) : (
                  <>
                    {/* English — clickable words + paragraph speak */}
                    {(transMode === 'en' || transMode === 'bilingual') && (
                      <div className="flex items-start gap-2 group/para">
                        <p className={cn(fontSizeClass, 'text-foreground/85 font-medium flex-1')}>
                          {displayEn.split(/\s+/).filter(Boolean).map((w, wi) => {
                            const clean = w.replace(/[^a-zA-Z'-]/g, '');
                            const isWord = clean.length >= 2;
                            return (
                              <span key={wi}>
                                {wi > 0 && ' '}
                                <span
                                  className={cn(
                                    isWord && 'cursor-pointer hover:text-[#00B894] hover:underline underline-offset-2 transition-colors',
                                  )}
                                  onClick={isWord ? (e) => handleWordClick(e, w) : undefined}
                                >
                                  {w}
                                </span>
                              </span>
                            );
                          })}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); safeSpeak(cleanText(displayEn), { rate: 0.85 }); }}
                          className="shrink-0 text-muted-foreground/25 hover:text-[#00B894] transition-colors mt-0.5 opacity-0 group-hover/para:opacity-100"
                          title="朗读段落"
                        >
                          <Volume2 className="size-3.5" />
                        </button>
                        {!para.zh && (
                          <button
                            onClick={(e) => { e.stopPropagation(); translateParagraph(currentPage, i); }}
                            disabled={paraTranslating === `${currentPage}-${i}`}
                            className="shrink-0 text-muted-foreground/25 hover:text-amber-500 transition-colors mt-0.5 opacity-0 group-hover/para:opacity-100"
                            title="翻译本段"
                          >
                            {paraTranslating === `${currentPage}-${i}` ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Chinese translation */}
                    {(transMode === 'zh' || transMode === 'bilingual') && para.zh && (
                      <p className="text-base text-muted-foreground leading-7 mt-1.5 pl-3 border-l-2 border-[#00B894]/50">
                        {para.zh}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 底栏：上一页 / 进度滑杆 / 下一页（沉浸式） ── */}
      <footer className={cn(
        'shrink-0 overflow-hidden transition-all duration-200 border-t border-border/60 bg-background/95 backdrop-blur-sm z-10',
        chromeVisible ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0 border-t-0',
      )}>
        <div className="px-3 sm:px-5 py-2 flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={currentPage === 0} className="rounded-xl size-8 p-0 shrink-0">
            <ChevronLeft className="size-4" />
          </Button>
          <input
            type="range"
            min={1}
            max={Math.max(activePages, 1)}
            value={currentPage + 1}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10) - 1;
              if (n !== currentPage) turnTo(n, n > currentPage ? 'next' : 'prev');
            }}
            className="reader-slider flex-1 min-w-0"
            aria-label="阅读进度"
          />
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums shrink-0">{currentPage + 1}<span className="opacity-60">/{activePages}</span></span>
          <Button variant="ghost" size="sm" onClick={goNext} disabled={currentPage >= activePages - 1} className="rounded-xl size-8 p-0 shrink-0">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </footer>

      {/* ── 阅读设置面板 ── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm rounded-[28px] p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle className="text-base font-black text-foreground">阅读设置</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-6 space-y-5">
            {/* 显示模式 */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">显示模式</p>
              <div className="flex items-center gap-0.5 bg-muted rounded-xl p-1">
                {([{ key: 'en', label: '原文' }, { key: 'bilingual', label: '对照' }, { key: 'zh', label: '译文' }] as { key: TransMode; label: string }[]).map(({ key, label }) => (
                  <button key={key} onClick={() => setTransMode(key)}
                    className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
                      transMode === key ? 'bg-background text-[#00B894] shadow-sm' : 'text-muted-foreground')}>{label}</button>
                ))}
              </div>
            </div>
            {/* 字号 */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">字号</p>
              <div className="flex items-center gap-2">
                {(['sm', 'base', 'lg', 'xl'] as const).map((key, i) => (
                  <button key={key} onClick={() => setFontSize(key)}
                    className={cn('flex-1 h-9 rounded-xl font-black transition-all border',
                      fontSize === key ? 'border-[#00B894] text-[#00B894] bg-[#00B894]/5' : 'border-border text-muted-foreground')}
                    style={{ fontSize: 12 + i * 3 }}>A</button>
                ))}
              </div>
            </div>
            {/* 阅读主题 */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">阅读主题</p>
              <div className="grid grid-cols-3 gap-2">
                {([{ key: 'light', label: '浅色', bg: '#FFFFFF', fg: '#374151' }, { key: 'paper', label: '纸张', bg: '#F6F1E6', fg: '#5B4F3A' }, { key: 'night', label: '夜间', bg: '#16181B', fg: '#D6D3CC' }] as const).map(({ key, label, bg, fg }) => (
                  <button key={key} onClick={() => setReaderTheme(key)}
                    className={cn('rounded-xl border-2 p-2 flex flex-col items-center gap-1.5 transition-all',
                      readerTheme === key ? 'border-[#00B894]' : 'border-border hover:border-muted-foreground/30')}>
                    <span className="w-full h-7 rounded-lg border border-black/5 flex items-center justify-center" style={{ background: bg }}>
                      <span className="text-[9px] font-bold" style={{ color: fg }}>Aa</span>
                    </span>
                    <span className={cn('text-[10px] font-bold', readerTheme === key ? 'text-[#00B894]' : 'text-muted-foreground')}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* 朗读 */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">朗读</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={speakCurrentPage} className="flex-1 rounded-xl text-xs font-bold gap-1">
                  <Volume2 className="size-3.5" />朗读本页
                </Button>
                <Button variant="outline" size="sm" onClick={toggleAutoRead}
                  className={cn('flex-1 rounded-xl text-xs font-bold gap-1', autoReadPages && 'bg-[#00B894] hover:bg-[#00a882] text-white border-transparent')}>
                  <Repeat className={cn('size-3.5', autoReadPages && 'animate-pulse')} />{autoReadPages ? '连读中…' : '连读全篇'}
                </Button>
              </div>
            </div>
            {/* AI 工具 */}
            {isConfigured && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">AI 工具</p>
                <div className="flex gap-2">
                  {needsTranslation && (
                    <Button variant="outline" size="sm" onClick={translateCurrentPage} disabled={transLoading} className="flex-1 rounded-xl text-xs font-bold gap-1">
                      {transLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}翻译本页
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={translateAllPages} disabled={transAllLoading} className="flex-1 rounded-xl text-xs font-bold gap-1">
                    {transAllLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}翻译全部
                  </Button>
                </div>
                <div className="flex gap-2 mt-2">
                  {LEVELS.map(({ key, label, color }) => (
                    <button key={key} onClick={() => convertArticleLevel(key)} disabled={convertLoading || !isConfigured}
                      className={cn('flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border',
                        convertLevel === key ? 'text-white border-transparent' : 'border-border text-muted-foreground')}
                      style={convertLevel === key ? { backgroundColor: color } : undefined}>
                      {convertLoading && convertLevel === key ? <Loader2 className="size-2.5 animate-spin inline" /> : null}{label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 收藏 */}
            <Button variant="outline" size="sm" onClick={favArticle}
              className={cn('w-full rounded-xl text-xs font-bold gap-1', articleFaved ? 'border-rose-300 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10' : '')}>
              <Heart className={cn('size-3.5', articleFaved && 'fill-current')} />{articleFaved ? '已收藏本篇' : '收藏本篇'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Chapter TOC Dialog ── */}
      <Dialog open={tocOpen} onOpenChange={setTocOpen}>
        <DialogContent className="max-w-md rounded-[28px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <ListTree className="size-5 text-[#00B894]" />
              目录 · {chapters.length} 章
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] px-3 pb-4">
            <div className="space-y-0.5">
              {chapters.map((ch, i) => (
                <button
                  key={i}
                  onClick={() => { turnTo(ch.page, ch.page > currentPage ? 'next' : 'prev'); setTocOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-colors hover:bg-muted',
                    ch.page === currentPage ? 'text-[#00B894] bg-muted/60' : 'text-foreground/80',
                  )}
                >
                  <span className="text-[10px] text-muted-foreground mr-2 tabular-nums">P{ch.page + 1}</span>
                  {ch.title}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── Word Lookup Dialog — Chinese + English definitions ── */}
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
              <p className="text-sm text-muted-foreground">查询中…</p>
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
                onClick={() => safeSpeak(lookupWord_State, { rate: 0.85 })}
                variant="outline"
                className="rounded-xl text-xs font-bold gap-1 flex-1"
              >
                <Volume2 className="size-3.5" />发音
              </Button>
              <Button
                size="sm"
                onClick={toggleWordFav}
                className={cn('rounded-xl text-xs font-bold gap-1 flex-1', favWord ? 'bg-rose-500 hover:bg-rose-600 text-white' : '')}
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
