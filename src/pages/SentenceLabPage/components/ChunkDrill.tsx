import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, Heart, Lightbulb, Loader2, Mic,
  PlayCircle, RotateCcw, Scissors, Search, Shuffle, Target, Volume2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { useSentenceReview } from '@/lib/use-sentence-review';
import { lookupWord, type IWordLookup } from '@/lib/word-lookup';
import { cn } from '@/lib/utils';
import { SENTENCE_LAB, READ_STEPS, type ISentenceLabItem } from '@/data/sentence-lab';
import { resolveSegments, standardBreaks, tokenize, splitByBreaks } from '@/lib/sentence-parse';
import { SpeakBack } from './SpeakBack';

type Phase = 'split' | 'backbone' | 'reveal';

const ROLE_STYLE: Record<string, { chip: string; label: string }> = {
  core: { chip: 'bg-[#00B894]/10 text-ink-teal border-[#00B894]/30', label: '主干' },
  mod: { chip: 'bg-muted text-muted-foreground border-border', label: '修饰' },
  conn: { chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20', label: '连接' },
};

type SourceFilter = '全部' | '书籍' | '演讲' | '刊物';
type LevelFilter = '全部' | '入门' | '进阶' | '高阶';

const srcOf = (it: ISentenceLabItem) =>
  it.source.includes('演讲') ? '演讲' : it.source === '站内刊物' ? '刊物' : '书籍';
const lvLabel = (l: string) => (l === 'beginner' ? '入门' : l === 'intermediate' ? '进阶' : '高阶');

/**
 * 拆句训练 —— 三步读句法：找动词 → 定主干 → 切意群。
 *
 * 交互要点（按反馈重做过一版）：
 *  · 导航（上一句/下一句/随机 + 来源与难度筛选）**始终可见**，不再只在揭晓后出现；
 *  · 「看示例」一键演示三步，避免第一次进来不知道要做什么；
 *  · 词间分隔符做得看得见、点得到（虚线 + 悬停放大），首句还带动画提示；
 *  · 预测分「漏切/多切」统计，让「读得快又读得准」有可测量的抓手。
 */
export function ChunkDrill() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('split');
  const [userBreaks, setUserBreaks] = useState<Set<number>>(new Set());
  const [backbonePick, setBackbonePick] = useState<number | null>(null);
  const [showZh, setShowZh] = useState(false);
  const [showSpeak, setShowSpeak] = useState(false);
  const [score, setScore] = useState<{ hit: number; missed: number; wrong: number } | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [srcFilter, setSrcFilter] = useState<SourceFilter>('全部');
  const [lvFilter, setLvFilter] = useState<LevelFilter>('全部');
  const [demo, setDemo] = useState(false);
  const [lookup, setLookup] = useState<{ word: string; data: IWordLookup | null; loading: boolean } | null>(null);
  const { speak } = useTTS();
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();
  const { grade, dueIds, stats } = useSentenceReview();

  // 语料池：复习模式 = 到期的句子；否则按来源/难度筛选
  const dueSet = useMemo(() => new Set(dueIds), [dueIds]);
  const deck = useMemo(() => {
    if (reviewMode) return SENTENCE_LAB.filter((s) => dueSet.has(s.id));
    return SENTENCE_LAB.filter(
      (s) => (srcFilter === '全部' || srcOf(s) === srcFilter) && (lvFilter === '全部' || lvLabel(s.level) === lvFilter),
    );
  }, [reviewMode, dueSet, srcFilter, lvFilter]);

  const item: ISentenceLabItem = deck[Math.min(idx, Math.max(0, deck.length - 1))] ?? SENTENCE_LAB[0];

  const tokens = useMemo(() => tokenize(item.en), [item]);
  const breaks = useMemo(() => standardBreaks(item), [item]);
  const resolved = useMemo(() => resolveSegments(item), [item]);
  const stdParts = useMemo(() => splitByBreaks(item.en, breaks), [item, breaks]);
  const coreCount = useMemo(() => item.segments.filter((s) => s.r === 'core').length, [item]);
  const faved = isFavorited(item.en, 'expression');

  const reset = useCallback(() => {
    setPhase('split');
    setUserBreaks(new Set());
    setBackbonePick(null);
    setScore(null);
    setShowZh(false);
    setShowSpeak(false);
    setLookup(null);
    setDemo(false);
  }, []);

  useEffect(() => { reset(); }, [idx, reset]);
  useEffect(() => { if (idx >= deck.length) setIdx(0); }, [deck.length, idx]);
  useEffect(() => { if (reviewMode && deck.length === 0) setReviewMode(false); }, [reviewMode, deck.length]);

  const goto = (n: number) => setIdx(((n % deck.length) + deck.length) % deck.length);

  const toggleBreak = (wordIdx: number) => {
    if (phase !== 'split' || demo) return;
    setUserBreaks((prev) => {
      const next = new Set(prev);
      if (next.has(wordIdx)) next.delete(wordIdx);
      else next.add(wordIdx);
      return next;
    });
  };

  const checkSplit = () => {
    let hit = 0;
    breaks.forEach((b) => { if (userBreaks.has(b)) hit++; });
    const missed = breaks.size - hit;
    const wrong = userBreaks.size - hit;
    setScore({ hit, missed, wrong });
    setPhase('backbone');
    if (missed === 0 && wrong === 0) toast.success(`断句完全正确 · ${breaks.size} 处断点全中`);
    else toast.info(`命中 ${hit}/${breaks.size} · 漏切 ${missed} · 多切 ${wrong}`);
  };

  /** 揭晓即结账：把这次表现折算成 SM-2 的 quality 记入复习队列 */
  const reveal = () => {
    setPhase('reveal');
    const splitPerfect = !!score && score.missed === 0 && score.wrong === 0;
    const backboneRight = backbonePick !== null && item.segments[backbonePick]?.r === 'core';
    const quality = splitPerfect && backboneRight ? 5 : backboneRight ? 3 : 2;
    grade(item.id, quality);
    if (quality < 3 && !demo) toast.info('这句已加入复习队列', { duration: 1800 });
  };

  /** 一键演示：自动切好 → 展示标准切分 → 揭晓拆解，让第一次来的人立刻看懂 */
  const runDemo = () => {
    setDemo(true);
    setUserBreaks(new Set(breaks));
    setBackbonePick(null);
    setPhase('backbone');
    toast.info('示例：先看标准切分，再看主干与每块的作用', { duration: 2200 });
    window.setTimeout(() => setPhase('reveal'), 1800);
  };

  const openLookup = async (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '');
    if (clean.length < 2) return;
    setLookup({ word: clean, data: null, loading: true });
    const data = await lookupWord(clean);
    setLookup((cur) => (cur && cur.word === clean ? { word: clean, data, loading: false } : cur));
  };

  const toggleFav = () => {
    if (faved) {
      const f = favorites.find((x) => x.content === item.en && x.type === 'expression');
      if (f) removeFavorite(f.id);
      toast.info('已取消收藏');
      return;
    }
    addFavorite({ type: 'expression', content: item.en, meaning: item.zh, category: '句子学习', example: item.source });
    toast.success('已收藏到表达本');
  };

  return (
    <div className="space-y-4">
      {/* 方法 + 示例入口 */}
      <div className="rounded-3xl border border-border/60 bg-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">三步读句法</p>
          <Button size="sm" variant="outline" className="rounded-xl text-[10px] font-black"
            onClick={runDemo}>
            <PlayCircle className="size-3.5" /> 看示例（自动演示本句）
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {READ_STEPS.map((s) => (
            <div key={s.n} className="flex items-start gap-2.5">
              <span className="size-6 shrink-0 rounded-full bg-[#00B894]/10 text-ink-teal grid place-items-center text-[11px] font-black">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">{s.name}</p>
                <p className="text-[10px] font-bold text-muted-foreground leading-snug">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
        {/* 语料池切换 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setReviewMode(false); setIdx(0); }}
            className={cn(
              'px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all',
              !reviewMode ? 'border-[#00B894] bg-[#00B894]/10 text-ink-teal' : 'border-border text-muted-foreground hover:border-muted-foreground/40',
            )}
          >
            全部语料 · {SENTENCE_LAB.length}
          </button>
          <button
            type="button"
            onClick={() => { setReviewMode(true); setIdx(0); toast.info(stats.due ? `复习 ${stats.due} 句待巩固` : '暂无待复习'); }}
            className={cn(
              'px-3 py-1.5 rounded-xl text-[10px] font-black border transition-all flex items-center gap-1.5',
              reviewMode ? 'border-[#00B894] bg-[#00B894]/10 text-ink-teal' : 'border-border text-muted-foreground hover:border-muted-foreground/40',
            )}
          >
            复习队列
            <span className={cn(
              'px-1.5 py-0.5 rounded-full text-[9px] font-black',
              stats.due > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-muted text-muted-foreground',
            )}>
              {stats.due}
            </span>
          </button>
          {stats.tracked > 0 && (
            <span className="text-[10px] font-bold text-muted-foreground">
              已掌握 {stats.mastered} · 学习中 {stats.learning} · 今日已练 {stats.reviewedToday}
            </span>
          )}
        </div>

        {/* 导航与筛选 —— 始终可见，随时换句 */}
        {!reviewMode && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(['全部', '书籍', '演讲', '刊物'] as SourceFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSrcFilter(s); setIdx(0); }}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                    srcFilter === s ? 'border-[#00B894] bg-[#00B894]/5 text-ink-teal' : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <span className="w-px h-4 bg-border" />
            <div className="flex flex-wrap gap-1.5">
              {(['全部', '入门', '进阶', '高阶'] as LevelFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setLvFilter(s); setIdx(0); }}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                    lvFilter === s ? 'border-[#00B894] bg-[#00B894]/5 text-ink-teal' : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-black text-foreground tabular-nums shrink-0">
              第 {Math.min(idx + 1, deck.length)} / {deck.length} 句
            </span>
            <span className="text-[10px] font-bold text-muted-foreground truncate">
              {item.source} · {lvLabel(item.level)}
            </span>
            {item.auto && (
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0"
                title="该句的意群与主干由脚本自动标注（经结构校验），说明文字可能不如人工标注精细"
              >
                自动标注
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="rounded-xl h-8 px-2 text-[10px] font-black"
              onClick={() => goto(idx - 1)} disabled={deck.length < 2}>
              <ChevronLeft className="size-3.5" /> 上一句
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl h-8 px-2 text-[10px] font-black"
              onClick={() => goto(idx + 1)} disabled={deck.length < 2}>
              下一句 <ChevronRight className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2 text-[10px] font-black"
              onClick={() => goto(Math.floor(Math.random() * deck.length))} disabled={deck.length < 2}>
              <Shuffle className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* 句子工具（带文字，不用图标猜） */}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={() => speak(item.en)}>
            <Volume2 className="size-3.5" /> 朗读
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={() => setShowZh((v) => !v)}>
            {showZh ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {showZh ? '隐藏中文' : '看中文'}
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={toggleFav}>
            <Heart className={cn('size-3.5', faved && 'fill-rose-500 text-rose-500')} /> {faved ? '已收藏' : '收藏'}
          </Button>
          {phase === 'reveal' && (
            <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={() => setShowSpeak((v) => !v)}>
              <Mic className="size-3.5" /> {showSpeak ? '收起跟读' : '跟读评价'}
            </Button>
          )}
        </div>

        {/* 句子本体 */}
        {phase === 'split' ? (
          <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal">
              第 1 步 · 点单词之间的「虚线竖条」切出意群（已切 {userBreaks.size} 处）
            </p>
            <p className="text-[15px] leading-loose font-medium text-foreground">
              {tokens.map((tk, i) => {
                if (!tk.isWord) return <span key={i}>{tk.text}</span>;
                const wordIdx = tokens.slice(0, i).filter((t) => t.isWord).length;
                const picked = userBreaks.has(wordIdx);
                return (
                  <span key={i}>
                    {wordIdx > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleBreak(wordIdx)}
                        aria-label={`在第 ${wordIdx} 个词前断句`}
                        className={cn(
                          'inline-flex items-center justify-center align-middle mx-[3px] rounded-md transition-all',
                          'w-2.5 h-6 border border-dashed',
                          picked
                            ? 'bg-[#00B894] border-[#00B894]'
                            : 'border-muted-foreground/40 bg-background/60 hover:bg-[#00B894]/30 hover:border-[#00B894] hover:scale-y-110',
                        )}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => openLookup(tk.text)}
                      className="hover:text-ink-teal transition-colors"
                      aria-label={`查词 ${tk.text}`}
                    >
                      {tk.text}
                    </button>
                  </span>
                );
              })}
            </p>
            {showZh && (
              <p className="pt-2 border-t border-border/60 text-xs font-bold text-muted-foreground leading-relaxed">
                {item.zh}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal">
                  第 3 步 · 标准切分（{stdParts.length} 个意群）
                </p>
                {score && (
                  <p className="text-[10px] font-black text-ink-teal">
                    命中 {score.hit}/{breaks.size} · 漏切 {score.missed} · 多切 {score.wrong}
                  </p>
                )}
              </div>
              <p className="text-[14px] font-bold text-foreground leading-loose">
                {stdParts.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="inline-block w-1 h-4 align-middle mx-1.5 rounded-full bg-[#00B894]" />}
                    {p}{' '}
                  </span>
                ))}
              </p>
              {showZh && (
                <p className="mt-3 pt-3 border-t border-border/60 text-xs font-bold text-muted-foreground leading-relaxed">
                  {item.zh}
                </p>
              )}
            </div>

            {phase === 'backbone' && (
              <div className="space-y-2">
                <p className="text-[11px] font-black text-foreground flex items-center gap-2">
                  <Target className="size-4 text-ink-teal" />
                  第 2 步：哪一块是这句的主干（谁 + 做了什么）？
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stdParts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBackbonePick(i)}
                      className={cn(
                        'px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all text-left max-w-full',
                        backbonePick === i
                          ? 'border-[#00B894] bg-[#00B894]/10 text-ink-teal'
                          : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40',
                      )}
                    >
                      {p.length > 50 ? p.slice(0, 50) + '…' : p}
                    </button>
                  ))}
                </div>
                <Button size="sm" className="rounded-xl text-[10px] font-black bg-[#00B894] hover:bg-[#00A383]"
                  onClick={reveal}>
                  <BookOpen className="size-3.5" /> 揭晓拆解
                </Button>
              </div>
            )}

            {phase === 'reveal' && resolved && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-[#00B894]/5 border border-[#00B894]/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal mb-1">
                    主干读出来，整句其实就是这一句
                  </p>
                  <p className="text-[13px] font-black text-foreground">{item.backboneGloss}</p>
                </div>
                <div className="space-y-1.5">
                  {resolved.map((rs, i) => {
                    const st = ROLE_STYLE[rs.seg.r];
                    const isPicked = backbonePick === i;
                    const wrongPick = isPicked && rs.seg.r !== 'core';
                    const rightPick = isPicked && rs.seg.r === 'core';
                    return (
                      <div key={i} className={cn(
                        'flex items-start gap-2.5 rounded-2xl border p-2.5',
                        wrongPick ? 'border-rose-300 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5'
                          : rightPick ? 'border-[#00B894] bg-[#00B894]/5'
                            : 'border-border/60',
                      )}>
                        <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black border', st.chip)}>
                          {st.label}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[12px] font-bold text-foreground leading-snug">{rs.seg.t}</p>
                          {rs.seg.note && (
                            <p className="text-[10px] font-bold text-muted-foreground leading-snug">{rs.seg.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[10px] font-bold text-muted-foreground">
                    主干 {coreCount} 块 · 修饰 {item.segments.length - coreCount} 块
                    {backbonePick !== null && (item.segments[backbonePick]?.r === 'core'
                      ? ' · 你选对了 ✓'
                      : ' · 主干通常只有一块，再体会一下 backbone 那句')}
                  </p>
                  <Button size="sm" variant="ghost" className="rounded-xl text-[10px] font-black" onClick={reset}>
                    <RotateCcw className="size-3.5" /> 重做本句
                  </Button>
                </div>
                {showSpeak && <SpeakBack item={item} />}
              </div>
            )}
          </div>
        )}

        {/* 读法提示 */}
        <div className="flex items-start gap-2 rounded-2xl bg-[#00B894]/5 border border-[#00B894]/20 p-3">
          <Lightbulb className="size-4 shrink-0 text-ink-teal mt-0.5" />
          <p className="text-[11px] font-bold text-foreground/80 leading-relaxed">{item.tip}</p>
        </div>

        {phase === 'split' && !demo && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
              <Search className="size-3" /> 点单词可查词；不确定就先点「看示例」
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="rounded-xl text-[10px] font-black"
                onClick={() => setUserBreaks(new Set())}>
                <RotateCcw className="size-3.5" /> 清空
              </Button>
              <Button size="sm" className="rounded-xl text-[10px] font-black bg-[#00B894] hover:bg-[#00A383]"
                onClick={() => {
                  if (userBreaks.size === 0) { toast.info('先切开至少一处，再对照答案'); return; }
                  checkSplit();
                }}>
                <Scissors className="size-3.5" /> 对照答案
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 查词浮层 */}
      {lookup && (
        <div
          className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 z-50 rounded-3xl border border-border bg-card shadow-xl p-4 space-y-2"
          role="dialog"
          aria-label="查词"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-black text-foreground truncate">{lookup.word}</p>
              {lookup.data?.phonetic && (
                <p className="text-[11px] font-bold text-muted-foreground">/{lookup.data.phonetic}/</p>
              )}
              {lookup.data?.fromForm && (
                <p className="text-[10px] font-bold text-muted-foreground">原形：{lookup.data.fromForm}</p>
              )}
            </div>
            <Button size="sm" variant="ghost" className="rounded-xl h-7 px-1.5 shrink-0" onClick={() => setLookup(null)} aria-label="关闭">
              <X className="size-4" />
            </Button>
          </div>
          {lookup.loading ? (
            <p className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> 查询中…
            </p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {lookup.data?.zhMeaning && (
                <p className="text-[12px] font-bold text-foreground leading-snug">{lookup.data.zhMeaning}</p>
              )}
              {lookup.data?.meaning && lookup.data.meaning !== lookup.data.zhMeaning && (
                <p className="text-[11px] font-medium text-muted-foreground leading-snug">{lookup.data.meaning}</p>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="rounded-xl text-[10px] font-black"
              onClick={() => speak(lookup.word)}>
              <Volume2 className="size-3.5" /> 朗读
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl text-[10px] font-black"
              onClick={() => {
                const w = lookup.word;
                setLookup(null);
                const hit = SENTENCE_LAB.find((s) => new RegExp(`\\b${w}\\b`, 'i').test(s.en));
                if (hit) {
                  setReviewMode(false);
                  setSrcFilter('全部');
                  setLvFilter('全部');
                  setIdx(Math.max(0, SENTENCE_LAB.findIndex((s) => s.id === hit.id)));
                  toast.info(`已切到含「${w}」的句子`);
                } else {
                  toast.info('内置语料里没有其他含这个词的句子');
                }
              }}>
              找含此词的句子
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
