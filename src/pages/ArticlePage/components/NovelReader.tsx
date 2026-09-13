/**
 * NovelReader — 小说模式阅读视图（起点式）。
 *
 * 两个子视图：
 *  - catalog：章节目录（封面信息 + 章节列表 + 词数/预计时长 + 开始/继续阅读）
 *  - chapter：章内自然滚动阅读（顶部固定栏 + 章内进度条 + 章末"下一章"大按钮）
 *
 * 共享能力（查词/收藏/翻译/朗读/主题/字号）由 PageReader 持有，通过 props 注入；
 * 批注（黄色下划线 + 角标 + 章末批注列表）为本组件私有功能。
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  X, ChevronLeft, ChevronRight, ArrowLeft, Type, Play, StickyNote, Loader2, Globe, ListTree, Languages,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn, cleanText } from '@/lib/utils';
import { safeStorage } from '@/lib/safe-storage';
import { toast } from 'sonner';
import type { IReadingContent, IParagraph, TransMode } from '@/data/reading';
import {
  paraNoteKey, chapterEstMinutes, readerNotesStorageKey,
  type NovelChapter, type ParaNote, type ReaderFontSize, type ReaderProgress,
} from './reader-shared';
import ReaderParagraph from './ReaderParagraph';

// ── 段落批注持久化（__nativethink_reader_notes_<contentId>） ──
function useReaderNotes(contentId: string) {
  const storageKey = readerNotesStorageKey(contentId);
  const [notes, setNotes] = useState<Record<string, ParaNote>>(() => {
    try {
      const raw = safeStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const saveNote = useCallback((paraKey: string, en: string, note: string) => {
    setNotes((prev) => {
      const next = { ...prev, [paraKey]: { en, note, ts: Date.now() } };
      try { safeStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [storageKey]);
  const removeNote = useCallback((paraKey: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[paraKey];
      try { safeStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [storageKey]);
  return { notes, saveNote, removeNote };
}

interface NovelReaderProps {
  content: IReadingContent;
  chapters: NovelChapter[];
  chapterIdx: number;
  fontSize: ReaderFontSize;
  transMode: TransMode;
  fullTextLoading: boolean;
  fullTextDone: boolean;
  /** 进度对象（含每章位置） — 与 PageReader 共享的 ref，写入后立即可读 */
  progressRef: { current: ReaderProgress | null };
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenToc: () => void;
  onChapterChange: (idx: number) => void;
  onProgress: (chapterIdx: number, ratio: number) => void;
  onWordClick: (e: React.MouseEvent, word: string) => void;
  onSpeakPara: (text: string) => void;
  onTranslatePara: (pageIdx: number, paraIdx: number) => void;
  paraTranslating: string | null;
  onToggleParaFav: (para: IParagraph) => void;
  isParaFaved: (en: string) => boolean;
  needsTranslation: boolean;
  onTranslateChapter: () => void;
  transLoading: boolean;
  transProgress: { done: number; total: number } | null;
  /** 整书预翻译进度（null = 未在运行） */
  bookTranslation: { chaptersDone: number; chaptersTotal: number; chapterTitle: string; segDone: number; segTotal: number } | null;
  onStartBookTranslation: () => void;
  onStopBookTranslation: () => void;
}

export default function NovelReader({
  content,
  chapters,
  chapterIdx,
  fontSize,
  transMode,
  fullTextLoading,
  fullTextDone,
  progressRef,
  onClose,
  onOpenSettings,
  onOpenToc,
  onChapterChange,
  onProgress,
  onWordClick,
  onSpeakPara,
  onTranslatePara,
  paraTranslating,
  onToggleParaFav,
  isParaFaved,
  needsTranslation,
  onTranslateChapter,
  transLoading,
  transProgress,

  bookTranslation,
  onStartBookTranslation,
  onStopBookTranslation,}: NovelReaderProps) {
  const { notes, saveNote, removeNote } = useReaderNotes(content.id);

  const [view, setView] = useState<'catalog' | 'chapter'>('catalog');
  const scrollRef = useRef<HTMLDivElement>(null);
  // 章内进度条 — 滚动时直接改 DOM 宽度，避免高频 setState 重渲染整章段落
  const barRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(0);
  const chapterIdxRef = useRef(chapterIdx);
  chapterIdxRef.current = chapterIdx;
  const lastSaveRef = useRef(0);
  const paraRefs = useRef(new Map<number, HTMLElement>());

  // onProgress 通过 ref 读取 — 滚动/保存回调不因父级重建函数而失效
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const setBar = useCallback((ratio: number) => {
    if (barRef.current) barRef.current.style.width = `${Math.round(ratio * 1000) / 10}%`;
  }, []);

  const currentChapter = chapters[chapterIdx] || null;

  // ── 批注编辑 ──
  const [noteEditor, setNoteEditor] = useState<{ paraKey: string; en: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const editingHasNote = noteEditor ? !!notes[noteEditor.paraKey] : false;

  const openNoteEditor = useCallback((para: IParagraph) => {
    const key = paraNoteKey(para.en);
    setNoteEditor({ paraKey: key, en: cleanText(para.en).slice(0, 200) });
    setNoteDraft(notes[key]?.note || '');
  }, [notes]);

  const openNoteFromKey = useCallback((key: string) => {
    const n = notes[key];
    if (!n) return;
    setNoteEditor({ paraKey: key, en: n.en });
    setNoteDraft(n.note);
  }, [notes]);

  const handleSaveNote = () => {
    if (!noteEditor) return;
    const text = noteDraft.trim();
    if (!text) { toast.info('批注内容为空'); return; }
    saveNote(noteEditor.paraKey, noteEditor.en, text);
    toast.success('批注已保存');
    setNoteEditor(null);
  };

  const handleDeleteNote = () => {
    if (!noteEditor) return;
    removeNote(noteEditor.paraKey);
    toast('批注已删除');
    setNoteEditor(null);
  };

  // ── 本章批注列表（章末展示） + 全书各章批注数（目录角标） ──
  const chapterNoteEntries = useMemo(() => {
    if (!currentChapter) return [] as { key: string; itemIdx: number; note: ParaNote }[];
    const out: { key: string; itemIdx: number; note: ParaNote }[] = [];
    currentChapter.items.forEach((it, ii) => {
      const k = paraNoteKey(it.para.en);
      const n = notes[k];
      if (n) out.push({ key: k, itemIdx: ii, note: n });
    });
    return out;
  }, [currentChapter, notes]);

  const chapterNoteCounts = useMemo(
    () => chapters.map((ch) => ch.items.reduce((c, it) => (notes[paraNoteKey(it.para.en)] ? c + 1 : c), 0)),
    [chapters, notes],
  );

  // ── 进度：章节进入/离开/滚动 ──
  const flushProgress = useCallback(() => {
    onProgressRef.current(chapterIdxRef.current, ratioRef.current);
  }, []);

  const enterChapter = useCallback((idx: number) => {
    if (chapters.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, chapters.length - 1));
    flushProgress(); // 保存离开章节的位置
    onChapterChange(clamped);
    setView('chapter');
  }, [chapters.length, flushProgress, onChapterChange]);

  const backToCatalog = useCallback(() => {
    flushProgress();
    setView('catalog');
  }, [flushProgress]);

  // 章节进入/切换：恢复该章上次的阅读位置（记住每章阅读位置）
  useEffect(() => {
    if (view !== 'chapter') return;
    const el = scrollRef.current;
    if (!el) return;
    setBar(0);
    const saved = progressRef.current?.perChapter?.[String(chapterIdx)] || 0;
    const raf = requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight;
      const target = saved > 0 ? Math.min(max, saved * max) : 0;
      el.scrollTop = target;
      const r = max > 0 ? el.scrollTop / max : 0;
      ratioRef.current = r;
      setBar(r);
      onProgressRef.current(chapterIdx, r);
    });
    return () => cancelAnimationFrame(raf);
  }, [view, chapterIdx, progressRef, setBar]);

  // 卸载兜底保存（切换阅读模式 / 退出阅读器）
  useEffect(() => () => { flushProgress(); }, [flushProgress]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const ratio = max > 0 ? el.scrollTop / max : 0;
    ratioRef.current = ratio;
    setBar(ratio);
    const now = Date.now();
    if (now - lastSaveRef.current > 600) {
      lastSaveRef.current = now;
      onProgressRef.current(chapterIdxRef.current, ratio);
    }
  }, [setBar]);

  const locateNote = useCallback((itemIdx: number) => {
    paraRefs.current.get(itemIdx)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── 目录视图数据 ──
  const prog = progressRef.current;
  const savedChapter = prog && typeof prog.chapter === 'number' && chapters[prog.chapter] ? prog.chapter : -1;
  const hasProgress = savedChapter > 0 || (savedChapter === 0 && (prog?.ratio || 0) > 0.02);
  const firstRealIdx = useMemo(() => {
    const i = chapters.findIndex((c) => !c.isFrontMatter);
    return i >= 0 ? i : 0;
  }, [chapters]);
  const resumeIdx = hasProgress ? savedChapter : firstRealIdx;
  const totalMinutes = chapterEstMinutes(content.totalWords);
  const totalTimeLabel = totalMinutes >= 90 ? `${(totalMinutes / 60).toFixed(1)} 小时` : `${totalMinutes} 分钟`;

  // ═══════════ 目录视图 ═══════════
  if (view === 'catalog') {
    return (
      <>
        <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm z-10">
          <div className="px-3 sm:px-4 py-2.5 flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl size-9 shrink-0" title="退出阅读">
              <X className="size-5" />
            </Button>
            <div className="flex-1 min-w-0 text-center px-1">
              <h2 className="text-sm font-black text-foreground truncate">{content.zhTitle || content.title}</h2>
              <p className="text-[10px] font-medium text-muted-foreground truncate">目录 · {chapters.length} 章</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onOpenSettings} className="rounded-xl size-9 shrink-0" title="阅读设置">
              <Type className="size-4.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
            {/* 封面信息卡 */}
            <div className="flex items-start gap-4 p-4 sm:p-5 rounded-2xl border border-border bg-card">
              <div className="size-14 sm:size-16 rounded-2xl bg-gradient-to-br from-[#00B894]/15 to-emerald-100 dark:to-emerald-500/20 flex items-center justify-center text-2xl sm:text-3xl shrink-0">
                📖
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-black text-foreground leading-snug flex items-center gap-2">
                  <span className="truncate">{content.zhTitle || content.title}</span>
                  {fullTextLoading && <Loader2 className="size-3.5 shrink-0 animate-spin text-[#00B894]" />}
                  {!fullTextLoading && fullTextDone && (
                    <span className="shrink-0 text-[9px] font-black text-[#00B894] bg-[#00B894]/10 px-1.5 py-0.5 rounded-full">完整版</span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {content.author ? content.author + ' · ' : ''}{content.source}
                </p>
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  {chapters.length} 章 · {content.totalWords.toLocaleString()} 词 · 约{totalTimeLabel}
                </p>
              </div>
            </div>

            {/* AI 预翻译全书 */}
            <div className="mt-4 p-4 rounded-2xl border border-violet-200/60 dark:border-violet-500/20 bg-violet-50/50 dark:bg-violet-500/5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <Languages className="size-3.5 text-violet-500 shrink-0" />
                    AI 对照翻译全书
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                    后台批量翻译全部章节，阅读到哪章自动显示中文对照
                  </p>
                </div>
                {bookTranslation ? (
                  <Button size="sm" variant="outline" onClick={onStopBookTranslation} className="rounded-xl text-[10px] font-black shrink-0">
                    停止
                  </Button>
                ) : (
                  <Button size="sm" onClick={onStartBookTranslation} className="rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-[10px] font-black shrink-0">
                    开始
                  </Button>
                )}
              </div>
              {bookTranslation && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-violet-600 dark:text-violet-300 mb-1">
                    <span className="truncate">{bookTranslation.chapterTitle}</span>
                    <span className="shrink-0 tabular-nums">{bookTranslation.chaptersDone}/{bookTranslation.chaptersTotal} 章</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${(bookTranslation.chaptersDone / Math.max(1, bookTranslation.chaptersTotal)) * 100}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground/70 mt-1">
                    当前章 {bookTranslation.segDone}/{bookTranslation.segTotal} 段 · 进度已自动保存，可关闭稍后继续
                  </p>
                </div>
              )}
            </div>

            {/* 开始 / 继续阅读 */}
            <Button
              onClick={() => enterChapter(resumeIdx)}
              className="w-full mt-4 h-12 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white text-sm font-black gap-2"
            >
              <Play className="size-4 fill-current shrink-0" />
              <span className="truncate">
                {hasProgress
                  ? `继续阅读 · 第 ${resumeIdx + 1} 章 ${chapters[resumeIdx]?.title || ''}`
                  : '开始阅读'}
              </span>
            </Button>
            {hasProgress && (
              <p className="text-center text-[10px] text-muted-foreground mt-2">
                上次读到 第 {savedChapter + 1} 章 · 已读 {Math.round(((savedChapter + 1) / chapters.length) * 100)}%
              </p>
            )}

            {/* 章节列表 */}
            <div className="mt-5 space-y-1">
              {chapters.map((ch, i) => {
                const noteCount = chapterNoteCounts[i] || 0;
                const isCurrent = hasProgress && i === savedChapter;
                return (
                  <button
                    key={i}
                    onClick={() => enterChapter(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-muted/70',
                      isCurrent && 'bg-[#00B894]/10 hover:bg-[#00B894]/15',
                    )}
                  >
                    <span className={cn('text-[11px] font-black tabular-nums w-6 shrink-0', isCurrent ? 'text-[#00B894]' : 'text-muted-foreground/50')}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={cn('flex-1 min-w-0 truncate text-sm font-bold', isCurrent ? 'text-[#00B894]' : 'text-foreground/85')}>
                      {ch.title}
                    </span>
                    {noteCount > 0 && (
                      <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                        <StickyNote className="size-2.5" />{noteCount}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
                      <span className="hidden sm:inline">{ch.wordCount.toLocaleString()} 词 · </span>
                      {chapterEstMinutes(ch.wordCount)} 分钟
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ═══════════ 章节阅读视图 ═══════════
  return (
    <>
      {/* 顶部固定栏：返回目录 + 章节标题 + 上一章/下一章 + 目录 + 设置 */}
      <div className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm z-10">
        <div className="px-1.5 sm:px-4 py-2 flex items-center gap-0.5 sm:gap-1">
          <Button variant="ghost" size="icon" onClick={backToCatalog} className="rounded-xl size-9 shrink-0" title="返回目录">
            <ArrowLeft className="size-4.5" />
          </Button>
          <div className="flex-1 min-w-0 text-center px-1">
            <p className="text-xs sm:text-sm font-black text-foreground truncate">{currentChapter?.title}</p>
            <p className="text-[10px] font-medium text-muted-foreground truncate">
              {chapterIdx + 1}/{chapters.length} · {content.zhTitle || content.title}
              {fullTextLoading && <Loader2 className="size-3 inline ml-1.5 animate-spin text-[#00B894]" />}
              {!fullTextLoading && fullTextDone && <span className="ml-1.5 text-[9px] font-black text-[#00B894]">完整版</span>}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => enterChapter(chapterIdx - 1)} disabled={chapterIdx <= 0} className="rounded-xl size-9 shrink-0" title="上一章">
            <ChevronLeft className="size-4.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => enterChapter(chapterIdx + 1)} disabled={chapterIdx >= chapters.length - 1} className="rounded-xl size-9 shrink-0" title="下一章">
            <ChevronRight className="size-4.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenToc} className="rounded-xl size-9 shrink-0 hidden sm:inline-flex" title="章节目录">
            <ListTree className="size-4.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenSettings} className="rounded-xl size-9 shrink-0" title="阅读设置">
            <Type className="size-4.5" />
          </Button>
        </div>
        {/* 章内滚动进度条 */}
        <div className="h-0.5 bg-muted/60">
          <div ref={barRef} className="h-full bg-[#00B894] transition-[width] duration-150 ease-out" style={{ width: '0%' }} />
        </div>
      </div>

      {/* 章节内容 — 章内自然滚动，不分页 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div key={chapterIdx} className="page-enter max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* 章节标题 */}
          <div className="pt-4 pb-6 text-center">
            <h3 className="text-xl sm:text-2xl font-black text-foreground tracking-wide">{currentChapter?.title}</h3>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="h-px w-10 sm:w-16 bg-[#00B894]/30" />
              <span className="size-1.5 rounded-full bg-[#00B894]/50" />
              <span className="h-px w-10 sm:w-16 bg-[#00B894]/30" />
            </div>
          </div>

          {/* AI 对照翻译横条 */}
          {needsTranslation && (
            <button
              onClick={onTranslateChapter}
              disabled={transLoading}
              className="w-full mb-6 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-[#00B894]/10 border border-[#00B894]/30 hover:bg-[#00B894]/20 hover:border-[#00B894]/50 transition-all text-xs font-black text-[#00B894] disabled:opacity-60"
            >
              {transLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  AI 翻译中 {transProgress ? `${transProgress.done}/${transProgress.total}` : '…'} 段
                </>
              ) : (
                <>
                  <Globe className="size-4" />
                  AI 对照翻译本章（约 10~60 秒）
                </>
              )}
            </button>
          )}

          {/* 段落 */}
          <div className="space-y-5">
            {currentChapter?.items.map((it, ii) => {
              if (it.para.en.startsWith('##CHAPTER##')) return null; // 章首标记已作为标题渲染
              const key = paraNoteKey(it.para.en);
              return (
                <div
                  key={`${it.pageIdx}-${it.paraIdx}`}
                  ref={(el) => { if (el) paraRefs.current.set(ii, el); else paraRefs.current.delete(ii); }}
                >
                  <ReaderParagraph
                    para={it.para}
                    fontSize={fontSize}
                    transMode={transMode}
                    pageIdx={it.pageIdx}
                    paraIdx={it.paraIdx}
                    translating={paraTranslating === `${it.pageIdx}-${it.paraIdx}`}
                    onWordClick={onWordClick}
                    onSpeak={onSpeakPara}
                    onTranslate={onTranslatePara}
                    onToggleFav={onToggleParaFav}
                    faved={isParaFaved(it.para.en)}
                    hasNote={!!notes[key]}
                    onOpenNote={openNoteEditor}
                  />
                </div>
              );
            })}
          </div>

          {/* 章末：本章批注 + 下一章大按钮 */}
          <div className="pt-10 pb-6 space-y-6">
            {chapterNoteEntries.length > 0 && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
                <p className="text-xs font-black text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                  <StickyNote className="size-3.5" />本章批注 · {chapterNoteEntries.length}
                </p>
                <div className="space-y-2">
                  {chapterNoteEntries.map(({ key, itemIdx, note }) => (
                    <div key={key} className="rounded-xl bg-card/80 border border-border/60 p-3 text-left">
                      <p className="text-[11px] text-muted-foreground italic leading-relaxed line-clamp-2">{note.en}</p>
                      <p className="text-xs text-foreground/90 mt-1.5 whitespace-pre-wrap break-words">{note.note}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <button onClick={() => locateNote(itemIdx)} className="text-[10px] font-black text-[#00B894] hover:underline">定位原文</button>
                        <button onClick={() => { locateNote(itemIdx); openNoteFromKey(key); }} className="text-[10px] font-black text-muted-foreground hover:underline">编辑</button>
                        <button onClick={() => { removeNote(key); toast('批注已删除'); }} className="text-[10px] font-black text-rose-500/80 hover:underline">删除</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center text-[11px] font-bold text-muted-foreground/60 tracking-widest">— 本章完 —</div>

            {chapterIdx < chapters.length - 1 ? (
              <button
                onClick={() => enterChapter(chapterIdx + 1)}
                className="w-full py-4 px-5 rounded-2xl border-2 border-[#00B894]/40 bg-[#00B894]/5 hover:bg-[#00B894]/15 hover:border-[#00B894]/60 transition-all text-left flex items-center gap-3 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">下一章</p>
                  <p className="text-sm font-black text-foreground truncate mt-0.5 group-hover:text-[#00B894] transition-colors">
                    {chapters[chapterIdx + 1]?.title}
                  </p>
                </div>
                <ChevronRight className="size-5 text-[#00B894] shrink-0" />
              </button>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm font-black text-foreground">已读完全书，恭喜！</p>
                <Button variant="outline" size="sm" onClick={backToCatalog} className="rounded-xl text-xs font-bold">返回目录</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 批注编辑 Dialog */}
      <Dialog open={!!noteEditor} onOpenChange={(o) => { if (!o) setNoteEditor(null); }}>
        <DialogContent className="max-w-md rounded-[24px] p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-1">
            <DialogTitle className="text-sm font-black text-foreground flex items-center gap-1.5">
              <StickyNote className="size-4 text-amber-500" />
              {editingHasNote ? '编辑批注' : '添加批注'}
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-3">
            {noteEditor && (
              <p className="text-xs text-muted-foreground/80 leading-relaxed border-l-2 border-amber-400/60 pl-2.5 line-clamp-3 italic">
                {noteEditor.en}
              </p>
            )}
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={4}
              placeholder="写下你的批注、疑问或笔记…"
              className="rounded-xl text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              {editingHasNote && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteNote}
                  className="rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border-rose-200 dark:border-rose-500/30"
                >
                  删除
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSaveNote}
                disabled={!noteDraft.trim()}
                className="flex-1 rounded-xl text-xs font-bold bg-[#00B894] hover:bg-[#00a882] text-white"
              >
                保存批注
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
