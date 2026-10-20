/**
 * CorrectionDrillMode — 纠偏重考（第 9 模式）：把纠偏本里的表达重新端上来认一遍。
 *
 * 题型只有四选一：给「中文提示（没有就给你的原句）」，从四个地道英文里挑出这句的。
 * 干扰项取自**其它纠偏条目的正确说法** —— 都是真英文，逼的是"哪句才对应这个意思"，
 * 不考拼写是因为纠偏条目是整句，逐词敲一整句太折磨人。
 *
 * 不写 SM-2 进度（句子不是词书词条，混进「已学单词清单」会污染词汇数据），
 * 复习记账走纠偏本自己的 `review`（答对/答错与上次时间），
 * 队列按「没考过 → 最久没练 → 错得多」排（`orderForDrill`），已经记住的不会反复出现。
 * 每答一题计 0.2 分钟学习时长（vocabulary 域，与中译英/闪卡翻面同参）。
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import { Wand2, Check, X, ArrowLeft, Lightbulb, Keyboard, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  useCorrectionNotes, recordCorrectionReview, orderForDrill,
  classifyCorrection, summarizeCorrections, CATEGORY_LABELS, CATEGORY_TIPS,
  type ICorrectionNote, type CorrectionCategory,
} from '@/lib/correction-notes';
import { useSpellingSentences, correctionToSpellingItem, normSentenceKey } from '@/lib/use-spelling-sentences';
import { sfxTick, sfxComplete } from '@/lib/sfx';
import { useLearningStats } from '@/lib/use-learning-stats';
import { cn } from '@/lib/utils';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SOURCE_LABEL: Record<ICorrectionNote['source'], string> = {
  think: '思维检测', writing: '写作批改', conversation: '对话分析',
};

export default function CorrectionDrillMode() {
  const { LazyMotionDiv: MotionDiv } = useFramerMotion();
  const { notes } = useCorrectionNotes();
  const { addStudyMinutes } = useLearningStats();
  const navigate = useNavigate();
  const { sentences: spellSentences, addSentence } = useSpellingSentences();

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [queue, setQueue] = useState<ICorrectionNote[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<(boolean | null)[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** 按错点类别限定重考范围（null = 全部）—— 与「开始重考」按钮联动，进题后固定不变（queue 已冻结） */
  const [drillCat, setDrillCat] = useState<CorrectionCategory | null>(null);
  const drillSummaries = useMemo(() => summarizeCorrections(notes), [notes]);
  const drillPool = useMemo(
    () => (drillCat === null ? notes : notes.filter((n) => classifyCorrection(n) === drillCat)),
    [notes, drillCat],
  );

  const cw = queue[idx] ?? null;
  // 这句地道说法是否已经在句子拼写库里（决定卡面上那颗按钮的态；不弹提示）
  const inSpellingLib = !!cw && spellSentences.some((s) => normSentenceKey(s.en) === normSentenceKey(cw.right));

  const start = useCallback(() => {
    const q = orderForDrill(drillPool);
    if (q.length === 0) return;
    setQueue(q);
    setResults(q.map(() => null));
    setIdx(0);
    setChosen(null);
    setRevealed(false);
    setFinished(false);
    setStarted(true);
  }, [drillPool]);

  /**
   * 四个选项：本条目的地道说法 + 干扰项。
   * 干扰项取自**整本纠偏本**而不是本轮题池 —— 按错点类别限定重考时某一类可能只有 1 条，
   * 只从题池取就会端出一张"只有一个选项、点了必对"的卡（2026-10-17 无头实测抓到）。
   * 用 Set 去重：不同条目的地道说法可能撞车，四个选项里不许出现两句一样的。
   */
  const options = useMemo(() => {
    if (!cw) return [];
    const others = shuffle([...new Set(notes.filter((n) => n.id !== cw.id).map((n) => n.right))]);
    return shuffle([cw.right, ...others.slice(0, 3)]);
  }, [cw, notes]);

  const submit = useCallback((opt: string) => {
    if (!cw || revealed) return;
    const ok = opt === cw.right;
    setChosen(opt);
    setRevealed(true);
    recordCorrectionReview(cw.id, ok);
    addStudyMinutes(0.2, 'vocabulary');
    if (ok) sfxTick(); else sfxComplete();
    setResults((prev) => { const next = [...prev]; next[idx] = ok; return next; });
  }, [cw, revealed, idx, addStudyMinutes]);

  const next = useCallback(() => {
    setChosen(null);
    setRevealed(false);
    if (idx + 1 >= queue.length) { setFinished(true); sfxComplete(); return; }
    setIdx((i) => i + 1);
  }, [idx, queue.length]);

  // 键盘：作答后 Enter/→ 前进，Esc 退出
  useEffect(() => {
    if (!started || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) { setStarted(false); setFinished(false); return; }
      if (revealed && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [started, finished, revealed, next]);

  // ── 起跑页 ──
  if (!started) {
    const drilled = notes.filter((n) => n.review).length;
    return (
      <div className="space-y-4">
        <Card className="rounded-[32px] border-border shadow-sm">
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-orange-50 dark:bg-orange-500/15 text-orange-500 flex items-center justify-center">
                <Wand2 className="size-6" />
              </div>
              <div>
                <p className="text-xl font-[900] italic text-foreground">纠偏重考</p>
                <p className="text-xs font-medium text-muted-foreground">AI 判过不地道的表达 · 认一遍哪句才是对的</p>
              </div>
            </div>

            {notes.length === 0 ? (
              <div className="rounded-2xl border border-border/60 p-4 text-center space-y-1.5">
                <Lightbulb className="size-6 text-orange-400/60 mx-auto" />
                <p className="text-sm font-black text-foreground">纠偏本还是空的</p>
                <p className="text-xs font-medium text-muted-foreground">
                  在「母语思维」提交英文句子、写作批改、或对话结束后的分析里，
                  被 AI 判为中式/不地道的表达会自动收进这里
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-muted/40 p-3.5 flex items-center gap-3 text-[11px] font-bold text-muted-foreground">
                  <span><b className="text-foreground text-sm">{notes.length}</b> 条待纠偏</span>
                  <span className="ml-auto">已重考过 {drilled} 条</span>
                </div>
                {/* 按错点类别限定重考：一类犯了好几次，就集中把这一类认透 */}
                {drillSummaries.length >= 2 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button data-press="strong"
                      onClick={() => setDrillCat(null)}
                      className={cn('px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                        drillCat === null ? 'border-orange-400/60 bg-orange-500/10 text-orange-600' : 'border-border text-muted-foreground hover:bg-muted/50')}
                    >
                      全部 {notes.length}
                    </button>
                    {drillSummaries.map((s) => (
                      <button data-press="strong"
                        key={s.category}
                        onClick={() => setDrillCat((cur) => (cur === s.category ? null : s.category))}
                        className={cn('px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
                          drillCat === s.category ? 'border-orange-400/60 bg-orange-500/10 text-orange-600' : 'border-border text-muted-foreground hover:bg-muted/50')}
                        title={CATEGORY_TIPS[s.category]}
                      >
                        {CATEGORY_LABELS[s.category]} {s.count}
                      </button>
                    ))}
                  </div>
                )}
                {drillCat && (
                  <p className="text-[10px] font-bold text-orange-600 leading-relaxed">{CATEGORY_TIPS[drillCat]}</p>
                )}
                <button data-press="strong"
                  onClick={start}
                  className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-lg shadow-orange-200/50 hover:bg-orange-600 transition-all"
                >
                  开始重考（{drillPool.length} 题）
                </button>
                <p className="text-[9px] font-bold text-muted-foreground/60 text-center">
                  没考过的排最前 · 考过的隔最久再出现 · 四选一，不考拼整句
                </p>
                <div className="space-y-1.5">
                  {(showAll ? drillPool : drillPool.slice(0, 5)).map((n) => (
                    <div key={n.id} className="px-3 py-2 rounded-xl bg-muted/30 space-y-0.5">
                      <p className="text-[10px] font-bold text-rose-500/80 line-through decoration-rose-300 truncate">{n.wrong}</p>
                      <p className="text-[11px] font-black italic text-emerald-600 truncate">{n.right}</p>
                    </div>
                  ))}
                  {drillPool.length > 5 && (
                    <button data-press="soft"
                      onClick={() => setShowAll((v) => !v)}
                      className="w-full py-1.5 rounded-xl border border-dashed border-border text-[10px] font-black text-muted-foreground hover:bg-muted/40"
                    >
                      {showAll ? '收起' : `展开全部 (${drillPool.length})`}
                    </button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── 完成页 ──
  if (finished) {
    const total = results.filter((r) => r !== null).length;
    const good = results.filter((r) => r === true).length;
    const rate = total > 0 ? Math.round((good / total) * 100) : 0;
    // 这轮答错的归成错点类别 —— 比"认对 62%"更有用：下次重考就点那一类
    const missed = summarizeCorrections(queue.filter((n, i) => results[i] === false));
    return (
      <div className="space-y-4">
        <MotionDiv
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="rounded-[32px] border-2 border-orange-500/20 bg-card shadow-sm p-6 sm:p-8 space-y-5"
        >
          <div className="text-center space-y-4">
            <Wand2 className="size-12 text-orange-500/50 mx-auto" />
            <div className="space-y-1">
              <p className="text-2xl font-black italic text-foreground">重考完成！</p>
              <p className="text-xs font-bold text-muted-foreground">共 {total} 题 · 认对 {rate}%</p>
            </div>
            {missed.length > 0 && (
              <div className="rounded-2xl border border-orange-200/70 dark:border-orange-500/20 bg-orange-50/50 dark:bg-orange-500/5 p-3 space-y-1.5 text-left">
                <p className="text-[9px] font-black uppercase tracking-wider text-orange-600">这轮还没认出的错点</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {missed.map((s) => (
                    <span key={s.category} className="px-2 py-0.5 rounded-full bg-orange-500/10 text-[10px] font-black text-orange-600">
                      {CATEGORY_LABELS[s.category]} ×{s.count}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">{CATEGORY_TIPS[missed[0].category]}</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-2">
              <button data-press="strong"
                onClick={() => { setStarted(false); setFinished(false); }}
                className="px-5 py-2.5 rounded-2xl bg-orange-500 text-white text-xs font-black shadow-lg shadow-orange-200/50 hover:bg-orange-600"
              >
                回纠偏本
              </button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto overscroll-contain">
            {queue.map((n, i) => (
              <div key={n.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-muted/30">
                {results[i] === true
                  ? <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  : <X className="size-3.5 text-rose-400 shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black italic text-foreground truncate">{n.right}</p>
                  <p className="text-[9px] font-bold text-rose-500/70 line-through truncate">{n.wrong}</p>
                </div>
                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-muted text-[8px] font-black text-muted-foreground">
                  {CATEGORY_LABELS[classifyCorrection(n)]}
                </span>
              </div>
            ))}
          </div>
        </MotionDiv>
      </div>
    );
  }

  // ── 答题视图 ──
  const answered = results.filter((r) => r !== null).length;
  const goodCount = results.filter((r) => r === true).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button data-press="soft"
          onClick={() => { setStarted(false); setFinished(false); }}
          className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80" title="返回"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{answered}/{queue.length}</span>
        <span className="text-xs font-black text-emerald-500 tabular-nums">✓{goodCount}</span>
        {cw && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-muted text-[9px] font-black text-muted-foreground">
            {SOURCE_LABEL[cw.source]}
          </span>
        )}
      </div>

      {cw && (
        <MotionDiv
          key={`${cw.id}-${idx}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Card className="rounded-[32px] border-border shadow-sm">
            <CardContent className="p-5 sm:p-7 space-y-4">
              <div className="space-y-1.5 text-center">
                <p className="text-[9px] font-black uppercase tracking-wider text-orange-600">这句怎么说才地道</p>
                {cw.chineseHint
                  ? <p className="text-lg sm:text-xl font-[900] text-foreground leading-snug">{cw.chineseHint}</p>
                  : <p className="text-base sm:text-lg font-black italic text-rose-500/90 leading-snug">“{cw.wrong}”</p>}
              </div>

              <div className="space-y-2">
                {options.map((opt) => {
                  const isCorrect = opt === cw.right;
                  const isChosen = chosen === opt;
                  return (
                    <button data-press="strong"
                      key={opt}
                      onClick={() => submit(opt)}
                      disabled={revealed}
                      className={cn(
                        'w-full py-2.5 px-3 rounded-2xl border-2 text-[13px] font-black italic text-left transition-all',
                        !revealed && 'border-border bg-muted/30 hover:border-orange-400/50 hover:bg-orange-500/5',
                        revealed && isCorrect && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600',
                        revealed && isChosen && !isCorrect && 'border-rose-300 bg-rose-50 dark:bg-rose-500/15 text-rose-500',
                        revealed && !isCorrect && !isChosen && 'border-border/40 bg-muted/20 text-muted-foreground/50',
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {revealed && (
                <div className="space-y-3">
                  <div className={cn(
                    'rounded-2xl border p-3.5 space-y-1',
                    results[idx] === true
                      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10'
                      : 'border-orange-200 bg-orange-50/60 dark:border-orange-500/20 dark:bg-orange-500/10',
                  )}>
                    <div className="flex items-center gap-2">
                      {results[idx] === true
                        ? <Check className="size-4 text-emerald-500" />
                        : <X className="size-4 text-orange-500" />}
                      <span className={cn('text-xs font-black', results[idx] === true ? 'text-emerald-600' : 'text-orange-600')}>
                        {results[idx] === true ? '对了' : '记一下'}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-rose-500/80 line-through decoration-rose-300 pl-6">{cw.wrong}</p>
                    <p className="text-[13px] font-black italic text-emerald-600 pl-6">{cw.right}</p>
                    {cw.note && <p className="text-[10px] text-muted-foreground pl-6 leading-relaxed">{cw.note}</p>}
                    {/* 错点归类：答完当场告诉用户这条属于哪一类中式错误（认不出类别的不硬贴） */}
                    {(() => {
                      const cat = classifyCorrection(cw);
                      if (cat === 'other') return null;
                      return (
                        <div className="pl-6 space-y-1">
                          <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-[9px] font-black text-orange-600">
                            {CATEGORY_LABELS[cat]}
                          </span>
                          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">{CATEGORY_TIPS[cat]}</p>
                        </div>
                      );
                    })()}
                  </div>
                  <button data-press="strong"
                    onClick={next}
                    className="w-full py-3 rounded-2xl bg-orange-500 text-white text-sm font-black shadow-lg shadow-orange-200/50 hover:bg-orange-600 transition-all"
                  >
                    {idx + 1 >= queue.length ? '看结果' : '下一个'}（Enter）
                  </button>
                  {/* 认出 ≠ 写得出：把这句地道说法送进句子拼写。练习界面零提示口径 ——
                      反馈挂在按钮自己的态上（在库里就变样），不弹 toast。 */}
                  <div className="flex gap-2">
                    <button data-press="strong"
                      onClick={() => addSentence(correctionToSpellingItem(cw))}
                      disabled={inSpellingLib}
                      className={cn(
                        'flex-1 py-2.5 rounded-2xl border-2 text-[11px] font-black transition-all',
                        inSpellingLib
                          ? 'border-sky-300/60 bg-sky-50/60 text-sky-600 dark:bg-sky-500/10'
                          : 'border-border bg-muted/30 hover:border-sky-400/50 hover:bg-sky-500/5',
                      )}
                      title={inSpellingLib ? '这句已在句子拼写库里' : '把这句地道说法送进句子拼写（逐词拼出来）'}
                    >
                      <Keyboard className="size-3.5 inline mr-1" />
                      {inSpellingLib ? '已进句子拼写' : '拼写这句'}
                    </button>
                    <button data-press="strong"
                      onClick={() => navigate('/spelling')}
                      className="flex-1 py-2.5 rounded-2xl border-2 border-border bg-muted/30 text-[11px] font-black hover:border-sky-400/50 hover:bg-sky-500/5 transition-all"
                      title="打开句子拼写（词库下拉里选「纠偏表达」）"
                    >
                      <ExternalLink className="size-3.5 inline mr-1" />
                      去拼写
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </MotionDiv>
      )}
    </div>
  );
}
