import { useState, useCallback, useEffect, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, BookOpen, Heart, Globe,
  Sparkles, Hash, Wand2, Loader2, Volume2,
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
import { queryWords, preloadAll, isAllReady } from '@/data/wordbank';

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
  const tts = useTTS();

  // Cleanup TTS on unmount
  useEffect(() => { return () => tts.cancel(); }, []);

  // ── State ──
  const [pageIdx, setPageIdx] = useState(() => {
    const saved = loadProgress(content.id);
    return saved.page > 0 ? saved.page : startPage;
  });
  const [transMode, setTransMode] = useState<TransMode>('bilingual');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('lg');
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
      setPageIdx(0);
      toast.success(`已转换为${lvl.label}等级！`);
    } catch { toast.error('转换失败'); }
    finally { setConvertLoading(false); }
  };

  const activeContent = displayContent;
  const activePages = activeContent.pages.length;
  const currentPage = Math.max(0, Math.min(pageIdx, activePages - 1));

  // Preload wordbank for Chinese word lookup
  useEffect(() => { if (!isAllReady()) preloadAll(); }, []);

  // Save progress
  useEffect(() => { saveProgress(activeContent.id, currentPage); }, [activeContent.id, currentPage]);

  // Page navigation
  const goPrev = () => setPageIdx((p) => Math.max(0, p - 1));
  const goNext = () => setPageIdx((p) => Math.min(activePages - 1, p + 1));

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
  const currentPageData = activeContent.pages[currentPage];
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
    const page = activeContent.pages[pageNum];
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
      const updatedPages = [...activeContent.pages];
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
        {/* View mode: 原文 / 对照 / 译文 */}
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
        {/* Font size */}
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
        {/* Level conversion */}
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
        {/* AI Translation */}
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
        {/* Speak page */}
        <Button
          variant="ghost" size="sm"
          onClick={() => {
            const page = activeContent.pages[currentPage];
            if (!page) return;
            const text = page.paragraphs
              .filter(p => !p.en.startsWith('##CHAPTER##'))
              .map(p => cleanText(p.en)).join(' ');
            if (text) tts.speak(text, { rate: 0.85 });
          }}
          className="rounded-xl text-[10px] font-bold gap-1"
        >
          <Volume2 className="size-3.5" />朗读本页
        </Button>
        {/* Favorite */}
        <Button
          variant="ghost" size="sm"
          onClick={favArticle}
          className={cn('rounded-xl text-[10px] font-bold gap-1', articleFaved && 'text-rose-500')}
        >
          <Heart className={cn('size-3.5', articleFaved && 'fill-current')} />{articleFaved ? '已收藏' : '收藏'}
        </Button>
      </div>

      {/* ── Content (current page only) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
          {activeContent.pages[currentPage]?.paragraphs.map((para, i) => {
            const displayEn = para.en.startsWith('##CHAPTER##') ? para.en.replace('##CHAPTER##', '') : para.en;
            const isChapter = para.en.startsWith('##CHAPTER##');
            const fontSizeClass = fontSize === 'sm' ? 'text-base leading-7' : fontSize === 'base' ? 'text-lg leading-8' : 'text-xl leading-9';

            return (
              <div key={i} className={isChapter ? 'text-center py-2' : ''}>
                {isChapter ? (
                  <h3 className="text-sm font-black text-[#00B894]">{displayEn}</h3>
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
                          onClick={() => tts.speak(cleanText(displayEn), { rate: 0.85 })}
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

      {/* ── Pagination Footer ── */}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentPage === 0} className="rounded-xl text-[10px] font-bold gap-1">
          <ChevronLeft className="size-4" />上一页
        </Button>
        <span className="text-xs font-bold text-muted-foreground tabular-nums">{currentPage + 1} / {activePages}</span>
        <Input
          type="number" min={1} max={activePages}
          className="w-14 h-8 text-center text-xs font-bold rounded-xl"
          placeholder={`${currentPage + 1}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = parseInt((e.target as HTMLInputElement).value);
              if (n >= 1 && n <= activePages) setPageIdx(n - 1);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={goNext} disabled={currentPage >= activePages - 1} className="rounded-xl text-[10px] font-bold gap-1">
          下一页<ChevronRight className="size-4" />
        </Button>
      </div>

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
                onClick={() => tts.speak(lookupWord_State, { rate: 0.85 })}
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
