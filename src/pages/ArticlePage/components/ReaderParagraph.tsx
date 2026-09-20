/**
 * ReaderParagraph — 阅读段落渲染器（小说模式 / 翻页模式共用）。
 *
 * 从 PageReader 原段落 JSX 抽出：章节标记标题、可点词查词、段落朗读、
 * 单段 AI 翻译、句子收藏；小说模式额外支持批注（黄色下划线 + 批注按钮角标）。
 */
import { memo } from 'react';
import { Volume2, Globe, Loader2, Heart, StickyNote, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  /** 正在被朗读 —— 高亮该段，让"读到哪"可见（安卓离线引擎无词级回调，只能到段） */
  reading?: boolean;
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
  reading,
}: ReaderParagraphProps) {
  const displayEn = para.en.startsWith('##CHAPTER##') ? para.en.replace('##CHAPTER##', '') : para.en;
  const isChapter = para.en.startsWith('##CHAPTER##');

  return (
    <div
      data-read-para={isChapter ? undefined : paraIdx}
      className={cn(
        isChapter
          ? 'text-center pt-10 pb-3'
          // -mx/px 抵消：给高亮留出左右内边距，但文字位置与纵向间距完全不变（避免高亮移动时版面跳动）
          : 'rounded-xl transition-colors duration-300 -mx-2 px-2',
        !isChapter && reading && 'bg-[#00B894]/10 ring-1 ring-inset ring-[#00B894]/30',
      )}
    >
      {isChapter ? (
        <div className="flex items-center justify-center gap-3">
          <span className="h-px w-8 sm:w-12 bg-[#00B894]/30" />
          <h3 className="text-base sm:text-lg font-black text-ink-teal tracking-wide">{displayEn}</h3>
          <span className="h-px w-8 sm:w-12 bg-[#00B894]/30" />
        </div>
      ) : (
        <>
          {/* English — clickable words + paragraph actions */}
          {(transMode === 'en' || transMode === 'bilingual') && (
            <div className="relative flex items-start gap-2 group/para">
              <p
                className={cn(
                  FONT_SIZE_CLASSES[fontSize],
                  // pr-16 = 64px：右侧动作区是两个 28px 按钮 + 间距，留净空后长句不会跑到按钮底下
                  'text-foreground/85 font-medium flex-1 pr-16',
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
                          isWord && 'cursor-pointer hover:text-ink-teal hover:underline underline-offset-2 transition-colors',
                        )}
                        onClick={isWord ? (e) => onWordClick(e, w) : undefined}
                      >
                        {w}
                      </span>
                    </span>
                  );
                })}
              </p>
              {/*
                动作区 —— 必须**横向**排列，高度恒为 28px。
                原先竖排 4 个按钮高 124px，而短段落（尤其对话行）只有 28~92px 高，
                于是相邻段落的按钮列互相压在一起（真机实测 8 对重叠、最多叠 73px）。
                现在只留「朗读段落」这一个常用动作，其余收进「更多」菜单：
                高度 = 单行高度，任何段落都装得下，永不堆叠。
              */}
              <div className="absolute right-0 top-0 flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onSpeak(cleanText(displayEn)); }}
                  className="shrink-0 size-7 rounded-lg bg-background border border-border/70 shadow-sm flex items-center justify-center text-muted-foreground hover:text-ink-teal hover:border-ink-teal/50 transition-colors"
                  title="朗读段落"
                >
                  <Volume2 className="size-3.5" />
                </button>
                {(onTranslate || onOpenNote || onToggleFav) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'shrink-0 size-7 rounded-lg bg-background border border-border/70 shadow-sm flex items-center justify-center transition-colors hover:border-ink-teal/50',
                          (faved || hasNote) ? 'text-ink-teal' : 'text-muted-foreground hover:text-ink-teal',
                        )}
                        title="更多操作"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-xl">
                      {!para.zh && onTranslate && (
                        <DropdownMenuItem
                          disabled={translating}
                          onClick={() => onTranslate(pageIdx, paraIdx)}
                          className="gap-2 text-xs font-bold"
                        >
                          {translating ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
                          翻译本段
                        </DropdownMenuItem>
                      )}
                      {onOpenNote && (
                        <DropdownMenuItem onClick={() => onOpenNote(para)} className="gap-2 text-xs font-bold">
                          <StickyNote className={cn('size-3.5', hasNote && 'fill-amber-400/30 text-amber-500')} />
                          {hasNote ? '查看/编辑批注' : '添加批注'}
                        </DropdownMenuItem>
                      )}
                      {onToggleFav && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onToggleFav(para)} className="gap-2 text-xs font-bold">
                            <Heart className={cn('size-3.5', faved && 'fill-current text-rose-500')} />
                            {faved ? '取消收藏本句' : '收藏本句'}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
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
