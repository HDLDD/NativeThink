import { useState, useCallback, useRef, useEffect } from 'react';
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
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import type { IReadingContent, TransMode, IParagraph } from '@/data/reading';
import { buildPages } from '@/data/reading';

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

// ── Word lookup + favorite ──
async function lookupWord(word: string): Promise<{ word: string; phonetic: string; meaning: string } | null> {
  const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data[0];
    const phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || '';
    const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || '';
    return { word: cleaned, phonetic, meaning };
  } catch { return null; }
}

interface Props {
  content: IReadingContent;
  onClose: () => void;
}

export default function PageReader({ content, onClose }: Props) {
  const tts = useTTS();
  const { isConfigured, chat: aiChat } = useAI();
  const { addFavorite, isFavorited, favorites, removeFavorite } = useFavorites();
  const totalPages = content.pages.length;

  // ── State ──
  const [pageIdx, setPageIdx] = useState(() => loadProgress(content.id).page);
  const [transMode, setTransMode] = useState<TransMode>('bilingual');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupWord_State, setLookupWordState] = useState('');
  const [lookupData, setLookupData] = useState<{ word: string; phonetic: string; meaning: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
      const m = result.match(/\{[\s\S]*\}/);
      if (!m) { toast.error('格式异常'); return; }
      const parsed = JSON.parse(m[0]);
      if (!parsed.paragraphs?.length) { toast.error('转换失败'); return; }
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

  // Clamp page
  const currentPage = Math.max(0, Math.min(pageIdx, activePages - 1));

  // Save progress
  useEffect(() => { saveProgress(activeContent.id, currentPage); }, [activeContent.id, currentPage]);

  // TTS — paragraph-by-paragraph sequential playback
  const [speakingPara, setSpeakingPara] = useState(-1);
  const ttsCancelRef = useRef(false);

  const speakPage = async () => {
    const page = activeContent.pages[currentPage];
    if (!page) return;
    // Cancel any ongoing playback
    tts.cancel();
    ttsCancelRef.current = true;
    await new Promise((r) => setTimeout(r, 150));
    ttsCancelRef.current = false;

    const paras = page.paragraphs.map((p) => cleanText(p.en)).filter((t) => t.length > 0);
    for (let i = 0; i < paras.length; i++) {
      if (ttsCancelRef.current) break;
      setSpeakingPara(i);
      await new Promise<void>((resolve) => {
        tts.speak(paras[i], { rate: 0.9 });
        // Poll until speaking stops (paragraph complete or cancelled)
        const check = setInterval(() => {
          if (!tts.isSpeaking || ttsCancelRef.current) {
            clearInterval(check);
            setTimeout(resolve, 200); // small gap between paragraphs
          }
        }, 200);
      });
    }
    setSpeakingPara(-1);
  };

  const stopSpeaking = () => {
    ttsCancelRef.current = true;
    tts.cancel();
    setSpeakingPara(-1);
  };

  // Page navigation
  const goPrev = () => setPageIdx((p) => Math.max(0, p - 1));
  const goNext = () => setPageIdx((p) => Math.min(activePages - 1, p + 1));
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
        <Button variant="ghost" size="sm" onClick={favPage} className="rounded-xl text-[10px] font-bold gap-1">
          <Heart className="size-3.5" />收藏
        </Button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div ref={contentRef} className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {page.paragraphs.map((para, i) => (
            <ParagraphBlock
              key={i}
              para={para}
              transMode={transMode}
              onWordClick={handleWordClick}
              isSpeaking={speakingPara === i}
            />
          ))}
        </div>
      </div>

      {/* ── Pagination Footer ── */}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentPage === 0} className="rounded-xl text-[10px] font-bold gap-1">
          <ChevronLeft className="size-4" />上一页
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{currentPage + 1} / {activePages}</span>
          <Input
            type="number"
            min={1}
            max={activePages}
            className="w-14 h-8 text-center text-xs font-bold rounded-xl"
            placeholder={`${currentPage + 1}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = parseInt((e.target as HTMLInputElement).value);
                if (n >= 1 && n <= totalPages) jumpPage(n);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={goNext} disabled={currentPage >= totalPages - 1} className="rounded-xl text-[10px] font-bold gap-1">
          下一页<ChevronRight className="size-4" />
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
            ) : lookupData?.meaning ? (
              <p className="text-sm text-foreground/80 leading-relaxed">{lookupData.meaning}</p>
            ) : (
              <p className="text-sm text-muted-foreground">未找到释义</p>
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

// ── Paragraph block with word-click support ──
function ParagraphBlock({
  para, transMode, onWordClick, isSpeaking,
}: {
  para: IParagraph; transMode: TransMode; onWordClick: (e: React.MouseEvent, word: string) => void;
  isSpeaking?: boolean;
}) {
  const words = para.en.split(/\s+/).filter(Boolean);
  return (
    <div className="space-y-1">
      {(transMode === 'en' || transMode === 'bilingual') && (
        <p className={cn(
          'text-base leading-8 text-foreground/90 font-medium transition-colors rounded-lg px-1 -mx-1',
          isSpeaking && 'bg-[#00B894]/10 text-[#00B894]',
        )}>
          {words.map((w, i) => {
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
          })}
        </p>
      )}
      {(transMode === 'zh' || transMode === 'bilingual') && para.zh && (
        <p className="text-sm text-muted-foreground leading-7 pl-3 border-l-2 border-[#00B894]/30 italic">
          {para.zh}
        </p>
      )}
    </div>
  );
}
