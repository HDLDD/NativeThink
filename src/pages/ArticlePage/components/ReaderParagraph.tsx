/**
 * ReaderParagraph — 阅读段落渲染器（小说模式 / 翻页模式共用）。
 *
 * 从 PageReader 原段落 JSX 抽出：章节标记标题、可点词查词、段落朗读、
 * 单段 AI 翻译、句子收藏；小说模式额外支持批注（黄色下划线 + 批注按钮角标）。
 */
import { memo } from 'react';
import { Volume2, Globe, Loader2, Heart, StickyNote } from 'lucide-react';
import { cn, cleanText } from '@/lib/utils';
import type { IParagraph, TransMode } from '@/data/reading';
import { FONT_SIZE_CLASSES, type ReaderFontSize } from './reader-shared';

interface ReaderParagraphProps {
  para: IParagraph;
  fontSize: ReaderFontSize;
  transMode: TransMode;
  /** 段落所在分页索引 + 段内索引 — 父级据此定位单段翻译状态 */
  pageIdx: number;
  paraIdx: number;
  translating: boolean;
  onWordClick: (e: React.MouseEvent, word: string) => void;
  onSpeak: (text: string) => void;
  onTranslate?: (pageIdx: number, paraIdx: number) => void;
  onToggleFav: (para: IParagraph) => void;
  faved: boolean;
  /** 小说模式批注：有批注的段落显示黄色下划线，批注按钮常亮 */
  hasNote?: boolean;
  onOpenNote?: (para: IParagraph) => void;
}

function ReaderParagraphImpl({
  para,
  fontSize,
  transMode,
  pageIdx,
  paraIdx,
  translating,
  onWordClick,
  onSpeak,
  onTranslate,
  onToggleFav,
  faved,
  hasNote,
  onOpenNote,
}: ReaderParagraphProps) {
  const displayEn = para.en.startsWith('##CHAPTER##') ? para.en.replace('##CHAPTER##', '') : para.en;
  const isChapter = para.en.startsWith('##CHAPTER##');

  return (
    <div className={isChapter ? 'text-center pt-10 pb-3' : ''}>
      {isChapter ? (
        <div className="flex items-center justify-center gap-3">
          <span className="h-px w-8 sm:w-12 bg-[#00B894]/30" />
          <h3 className="text-base sm:text-lg font-black text-[#00B894] tracking-wide">{displayEn}</h3>
          <span className="h-px w-8 sm:w-12 bg-[#00B894]/30" />
        </div>
      ) : (
        <>
          {/* English — clickable words + paragraph actions */}
          {(transMode === 'en' || transMode === 'bilingual') && (
            <div className="flex items-start gap-2 group/para">
              <p
                className={cn(
                  FONT_SIZE_CLASSES[fontSize],
                  'text-foreground/85 font-medium flex-1',
                  hasNote && 'underline decoration-amber-400/60 decoration-2 underline-offset-[6px]',
                )}
              >
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
                        onClick={isWord ? (e) => onWordClick(e, w) : undefined}
                      >
                        {w}
                      </span>
                    </span>
                  );
                })}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); onSpeak(cleanText(displayEn)); }}
                className="shrink-0 text-muted-foreground/25 hover:text-[#00B894] transition-colors mt-0.5 opacity-0 group-hover/para:opacity-100"
                title="朗读段落"
              >
                <Volume2 className="size-3.5" />
              </button>
              {!para.zh && onTranslate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTranslate(pageIdx, paraIdx); }}
                  disabled={translating}
                  className="shrink-0 text-muted-foreground/25 hover:text-amber-500 transition-colors mt-0.5 opacity-0 group-hover/para:opacity-100"
                  title="翻译本段"
                >
                  {translating ? <Loader2 className="size-3 animate-spin" /> : <Globe className="size-3" />}
                </button>
              )}
              {/* 段落批注 — 有批注时常亮（角标），悬停出现入口 */}
              {onOpenNote && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenNote(para); }}
                  className={cn(
                    'shrink-0 mt-0.5 transition-colors',
                    hasNote
                      ? 'text-amber-500'
                      : 'text-muted-foreground/25 hover:text-amber-500 opacity-0 group-hover/para:opacity-100',
                  )}
                  title={hasNote ? '查看/编辑批注' : '添加批注'}
                >
                  <StickyNote className={cn('size-3.5', hasNote && 'fill-amber-400/30')} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFav(para); }}
                className={cn(
                  'shrink-0 mt-0.5 transition-colors opacity-0 group-hover/para:opacity-100',
                  faved ? 'text-rose-500' : 'text-muted-foreground/25 hover:text-rose-500',
                )}
                title={faved ? '取消收藏本句' : '收藏本句'}
              >
                <Heart className={cn('size-3.5', faved && 'fill-current')} />
              </button>
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
}

/** 段落渲染为纯 props 驱动 — memo 化后滚动/工具栏状态变化不会重渲染整章段落 */
export default memo(ReaderParagraphImpl);
