import { useState, useCallback, useRef, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, Volume2, BookOpen, Heart, Globe,
  Sparkles, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import type { IReadingContent, TransMode, IParagraph } from '@/data/reading';

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

  // Clamp page
  const currentPage = Math.max(0, Math.min(pageIdx, totalPages - 1));

  // Save progress
  useEffect(() => { saveProgress(content.id, currentPage); }, [content.id, currentPage]);

  // TTS
  const speakPage = () => {
    const page = content.pages[currentPage];
    if (!page) return;
    const text = page.paragraphs.map((p) => cleanText(p.en)).join(' ');
    tts.speak(text, { rate: 0.9 });
  };

  // Page navigation
  const goPrev = () => setPageIdx((p) => Math.max(0, p - 1));
  const goNext = () => setPageIdx((p) => Math.min(totalPages - 1, p + 1));
  const jumpPage = (n: number) => setPageIdx(Math.max(0, Math.min(totalPages - 1, n - 1)));

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
    const page = content.pages[currentPage];
    if (!page) return;
    const snippet = page.paragraphs.slice(0, 3).map((p) => cleanText(p.en).slice(0, 100)).join(' ');
    addFavorite({ type: 'expression', content: snippet, meaning: page.paragraphs[0]?.zh || '', category: content.topic });
    toast.success('已收藏当前页');
  };

  if (!content.pages.length) {
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

  const page = content.pages[currentPage];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl shrink-0">
          <X className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black text-foreground truncate">{content.zhTitle || content.title}</h2>
          <p className="text-[10px] font-medium text-muted-foreground truncate">
            {content.author && `${content.author} · `}{content.source} · {content.difficulty}
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
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={speakPage} className="rounded-xl text-[10px] font-bold gap-1">
          <Volume2 className="size-3.5" />朗读
        </Button>
        <Button variant="ghost" size="sm" onClick={favPage} className="rounded-xl text-[10px] font-bold gap-1">
          <Heart className="size-3.5" />收藏
        </Button>
      </div>

      {/* ── Content ── */}
      <ScrollArea className="flex-1">
        <div ref={contentRef} className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {page.paragraphs.map((para, i) => (
            <ParagraphBlock
              key={i}
              para={para}
              transMode={transMode}
              onWordClick={handleWordClick}
            />
          ))}
        </div>
      </ScrollArea>

      {/* ── Pagination Footer ── */}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentPage === 0} className="rounded-xl text-[10px] font-bold gap-1">
          <ChevronLeft className="size-4" />上一页
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{currentPage + 1} / {totalPages}</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
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
  para, transMode, onWordClick,
}: {
  para: IParagraph; transMode: TransMode; onWordClick: (e: React.MouseEvent, word: string) => void;
}) {
  const words = para.en.split(/\s+/).filter(Boolean);
  return (
    <div className="space-y-1">
      {(transMode === 'en' || transMode === 'bilingual') && (
        <p className="text-base leading-8 text-foreground/90 font-medium">
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
