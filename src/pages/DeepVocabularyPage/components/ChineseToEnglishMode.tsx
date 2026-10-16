/**
 * ChineseToEnglishMode — 中译英复习（第 8 模式）。
 *
 * 与复习检测方向相反：**给中文释义，产出英文** —— 练「中文 → 英文」的主动提取，
 * 这是被动认词（看英文想中文）练不到的一环。两种作答形式，可随时切：
 *   - 选择题：4 个英文选项（1 正确 + 3 本词书干扰项）
 *   - 拼写：输入框，大小写不敏感、多余空格折叠
 *
 * 对齐既有契约：
 *   - 题目队列 = 本词书**已学词**（SM-2 progress，屏蔽词除外），到期优先排序，
 *     起跑时**冻结**——评分不改变本轮顺序（vocabulary.md 注意事项 2）；
 *   - 每答一题写一次 SM-2（对 q4 / 错 q1，**首答为准**，与快速闪卡同口径）；
 *   - 断点续学按 level 分键，恢复时校验下标越界即作废；
 *   - 零提示：不弹 toast，反馈交给界面本身（2026-09-30 用户口径）；
 *   - 每答一题计 0.2 分钟学习时长（vocabulary 域，与闪卡翻面同参）。
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import { Languages, Check, X, ArrowLeft, Keyboard, ListChecks, RotateCcw, Volume2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { IWordEntry } from '@/data/wordbank/schema';
import { queryWords, findWord, preloadDetail } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useTTS } from '@/lib/use-tts';
import { useLearningStats } from '@/lib/use-learning-stats';
import { sfxTick, sfxComplete } from '@/lib/sfx';
import { safeStorage } from '@/lib/safe-storage';
import { cn } from '@/lib/utils';

const ROUND_SIZES = [10, 20, 50, 0] as const;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ChineseToEnglishMode({ level }: { level: string }) {
  const { LazyMotionDiv: MotionDiv } = useFramerMotion();
  const { state, recordReview } = useWordLearning(level);
  const { addStudyMinutes } = useLearningStats();
  const tts = useTTS();

  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState<IWordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  /** 每题作答结果（null=未答）——首答写 SM-2，回看不重写 */
  const [results, setResults] = useState<(boolean | null)[]>([]);
  const [finished, setFinished] = useState(false);
  /** 作答形式：choice=四选一 / spell=拼写 —— 会话内可切，切型只影响后续题 */
  const [answerType, setAnswerType] = useState<'choice' | 'spell'>('choice');
  const [roundSize, setRoundSize] = useState<number>(10);
  /** 当前题的作答态 */
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const cw = queue[idx] ?? null;
  const resultsRef = useRef<(boolean | null)[]>([]);

  /** 已学词池（非屏蔽）——起跑页计数与队列来源共用这一份 */
  const learnedEntries = useMemo(
    () => Object.values(state.progress).filter((p) => !p.suspended),
    [state.progress],
  );

  // ── 断点续学（按 level 分键；恢复时校验下标越界即作废） ──
  const SESS_KEY = `__nativethink_vocab_c2e_session_${level}`;
  const restoreStateRef = useRef<'pending' | 'done'>('pending');
  useEffect(() => {
    if (restoreStateRef.current !== 'pending' || started) return;
    restoreStateRef.current = 'done';
    try {
      const raw = JSON.parse(safeStorage.getItem(SESS_KEY) || 'null') as
        | { order: string[]; index: number; results: (boolean | null)[] }
        | null;
      if (!raw || !Array.isArray(raw.order) || raw.order.length === 0) return;
      if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= raw.order.length) return;
      const entries = raw.order
        .map((k) => findWord(k) ?? queryWords({ search: k, limit: 1 })[0])
        .filter((w): w is IWordEntry => !!w);
      if (entries.length !== raw.order.length) return;
      const blanks = raw.order.map((_, i) => (raw.results?.[i] ?? null) as boolean | null);
      setQueue(entries);
      setIdx(raw.index);
      resultsRef.current = blanks;
      setResults(blanks);
      setStarted(true);
    } catch { /* 损坏即当作无断点 */ }
  }, [started, SESS_KEY]);

  useEffect(() => {
    if (!started) return;
    if (finished) { try { safeStorage.removeItem(SESS_KEY); } catch { /* ignore */ } return; }
    try {
      safeStorage.setItem(SESS_KEY, JSON.stringify({
        order: queue.map((w) => w.word.toLowerCase()),
        index: idx,
        results: resultsRef.current,
      }));
    } catch { /* ignore */ }
  }, [started, finished, queue, idx, SESS_KEY]);

  useEffect(() => { setStarted(false); setFinished(false); }, [level]);

  /** 本轮该词的详情懒加载（背卡展示例句用） */
  const [detailTick, setDetailTick] = useState(0);
  useEffect(() => {
    if (!started || !cw) return;
    let alive = true;
    Promise.resolve(preloadDetail([cw.level])).then(() => { if (alive) setDetailTick((t) => t + 1); }).catch(() => { /* 降级 */ });
    return () => { alive = false; };
  }, [started, cw?.word, cw?.level]);

  /** 选择题的 4 个选项（正确词 + 同词书 3 个干扰项）——每张卡生成一次 */
  const options = useMemo(() => {
    if (!cw || answerType !== 'choice') return [];
    const pool = queryWords({ level: level === 'all' ? undefined : level });
    const distract = shuffle(pool.filter((w) => w.word.toLowerCase() !== cw.word.toLowerCase()))
      .slice(0, 3)
      .map((w) => w.word);
    return shuffle([cw.word, ...distract]);
  }, [cw, answerType, level]);

  /** 起跑：到期优先冻结本轮队列 */
  const startRound = useCallback(() => {
    const sorted = [...learnedEntries].sort((a, b) => a.nextReview - b.nextReview);
    const picked = roundSize > 0 ? sorted.slice(0, roundSize) : sorted;
    const entries = picked
      .map((p) => findWord(p.wordKey) ?? queryWords({ search: p.wordKey, limit: 1 })[0])
      .filter((w): w is IWordEntry => !!w);
    if (entries.length === 0) return;
    setQueue(entries);
    setIdx(0);
    const blanks = entries.map(() => null) as (boolean | null)[];
    resultsRef.current = blanks;
    setResults(blanks);
    setFinished(false);
    setTyped(''); setChosen(null); setRevealed(false);
    setStarted(true);
  }, [learnedEntries, roundSize]);

  /** 答完一题的共享收尾：写 SM-2（首答）、计时长、朗读 */
  const settle = useCallback((ok: boolean) => {
    if (!cw) return;
    recordReview(cw, ok ? 4 : 1);
    addStudyMinutes(0.2, 'vocabulary');
    sfxTick();
    setRevealed(true);
    setResults((prev) => { const next = [...prev]; next[idx] = ok; resultsRef.current = next; return next; });
    tts.speak(cw.word, { rate: 0.9 });
  }, [cw, idx, recordReview, addStudyMinutes, tts]);

  const submitSpell = useCallback(() => {
    if (!cw || revealed) return;
    settle(normalize(typed) === normalize(cw.word));
  }, [cw, revealed, typed, settle]);

  const submitChoice = useCallback((opt: string) => {
    if (!cw || revealed) return;
    setChosen(opt);
    settle(normalize(opt) === normalize(cw.word));
  }, [cw, revealed, settle]);

  const next = useCallback(() => {
    setTyped(''); setChosen(null); setRevealed(false);
    if (idx + 1 >= queue.length) { setFinished(true); sfxComplete(); return; }
    setIdx((i) => i + 1);
  }, [idx, queue.length]);

  // 键盘：作答后 Enter/→ 前进；Esc 退出本轮
  useEffect(() => {
    if (!started || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) { setStarted(false); setFinished(false); return; }
      if (!revealed) return;
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, finished, revealed, next]);

  // ── 起跑页 ──
  if (!started) {
    return (
      <div className="space-y-4">
        <Card className="rounded-[32px] border-border shadow-sm">
          <CardContent className="p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 flex items-center justify-center">
                <Languages className="size-6" />
              </div>
              <div>
                <p className="text-xl font-[900] italic text-foreground">中译英</p>
                <p className="text-xs font-medium text-muted-foreground">看中文释义，拼写或选出英文 · 练主动提取</p>
              </div>
            </div>

            {learnedEntries.length === 0 ? (
              <div className="rounded-2xl border border-border/60 p-4 text-center space-y-1">
                <p className="text-sm font-black text-foreground">这本书还没有已学的单词</p>
                <p className="text-xs font-medium text-muted-foreground">先用「每日学习」学一些单词，再回来练中译英</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">本轮词数（已学 {learnedEntries.length} 词）</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ROUND_SIZES.map((n) => (
                      <button
                        key={n}
                        onClick={() => setRoundSize(n)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-[10px] font-black border transition-colors',
                          roundSize === n
                            ? 'bg-sky-500/15 text-sky-600 border-sky-400/40'
                            : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted',
                        )}
                      >
                        {n === 0 ? '全部' : n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">作答形式</p>
                  <div className="flex items-center gap-1.5">
                    {([
                      { k: 'choice', label: '四选一', icon: ListChecks },
                      { k: 'spell', label: '拼写', icon: Keyboard },
                    ] as const).map(({ k, label, icon: Icon }) => (
                      <button
                        key={k}
                        onClick={() => setAnswerType(k)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-[10px] font-black border transition-colors flex items-center gap-1.5',
                          answerType === k
                            ? 'bg-sky-500/15 text-sky-600 border-sky-400/40'
                            : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted',
                        )}
                      >
                        <Icon className="size-3.5" />{label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={startRound}
                  className="w-full py-3 rounded-2xl bg-sky-500 text-white text-sm font-black shadow-lg shadow-sky-200/50 hover:bg-sky-600 transition-all active:scale-[0.99]"
                >
                  开始中译英（{Math.min(roundSize === 0 ? learnedEntries.length : roundSize, learnedEntries.length)} 题）
                </button>
                <p className="text-[9px] font-bold text-muted-foreground/60 text-center">
                  到期的词排在最前 · 答对/答错都会更新复习进度 · Enter 提交
                </p>
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
    return (
      <div className="space-y-4">
        <MotionDiv
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="rounded-[32px] border-2 border-sky-500/20 bg-card shadow-sm p-6 sm:p-8 space-y-5"
        >
          <div className="text-center space-y-4">
            <Languages className="size-12 text-sky-500/50 mx-auto" />
            <div className="space-y-1">
              <p className="text-2xl font-black italic text-foreground">本轮完成！</p>
              <p className="text-xs font-bold text-muted-foreground">
                共 {total} 题 · 正确率 {rate}%
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => { setStarted(false); setFinished(false); }}
                className="px-5 py-2.5 rounded-2xl bg-sky-500 text-white text-xs font-black shadow-lg shadow-sky-200/50 hover:bg-sky-600"
              >
                再来一轮
              </button>
              <button
                onClick={() => { setStarted(false); setFinished(false); }}
                className="px-5 py-2.5 rounded-2xl bg-muted text-muted-foreground text-xs font-black hover:bg-muted/80"
              >
                返回
              </button>
            </div>
          </div>
          {/* 本轮词表：对错分色，点词朗读 */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto overscroll-contain">
            {queue.map((w, i) => (
              <div key={`${w.word}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30">
                {results[i] === true
                  ? <Check className="size-3.5 text-emerald-500 shrink-0" />
                  : <X className="size-3.5 text-rose-400 shrink-0" />}
                <span className="text-[11px] font-black italic text-foreground">{w.word}</span>
                <span className="text-[10px] text-muted-foreground truncate flex-1">{w.meaning}</span>
                <button onClick={() => tts.speak(w.word, { rate: 0.9 })} className="shrink-0 text-muted-foreground hover:text-ink-teal" title="朗读">
                  <Volume2 className="size-3.5" />
                </button>
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
  const shown = (cw ? (findWord(cw.word) ?? cw) : cw) as IWordEntry | null;
  return (
    <div className="space-y-4">
      {/* 顶栏：返回 / 进度 / 正确数 / 切作答形式 */}
      <div className="flex items-center gap-2">
        <button onClick={() => { setStarted(false); setFinished(false); }} className="p-2 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80" title="返回">
          <ArrowLeft className="size-4" />
        </button>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{answered}/{queue.length}</span>
        <span className="text-xs font-black text-emerald-500 tabular-nums">✓{goodCount}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {([['choice', ListChecks, '四选一'], ['spell', Keyboard, '拼写']] as const).map(([k, Icon, label]) => (
            <button
              key={k}
              onClick={() => setAnswerType(k)}
              className={cn(
                'px-2 py-1 rounded-lg text-[10px] font-black border flex items-center gap-1',
                answerType === k ? 'bg-sky-500/15 text-sky-600 border-sky-400/40' : 'bg-muted text-muted-foreground border-transparent',
              )}
              title={`切换为${label}`}
            >
              <Icon className="size-3" />{label}
            </button>
          ))}
        </div>
      </div>

      {cw && (
        <MotionDiv
          key={`${cw.word}-${idx}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Card className="rounded-[32px] border-border shadow-sm overflow-hidden">
            <CardContent className="p-6 sm:p-8 space-y-5">
              {/* 题面：中文释义（detail 到位后走 findWord 的那份，与词库浏览同源） */}
              <div className="text-center space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-sky-600">用英文说出这个意思</p>
                <p className="text-2xl sm:text-3xl font-[900] text-foreground leading-snug">{shown?.meaning}</p>
                {shown?.partOfSpeech && (
                  <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-wider">{shown.partOfSpeech}</p>
                )}
                {/* 手动朗读：听音拼写/校对 —— 用户主动点，不算泄露答案 */}
                {!revealed && (
                  <button
                    onClick={() => tts.speak(cw.word, { rate: 0.9 })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/60 text-muted-foreground text-[10px] font-black hover:bg-muted"
                    title="朗读单词（听音辅助拼写）"
                  >
                    <Volume2 className="size-3.5" />听发音
                  </button>
                )}
              </div>

              {answerType === 'choice' ? (
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt) => {
                    const isCorrect = normalize(opt) === normalize(cw.word);
                    const isChosen = chosen === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => submitChoice(opt)}
                        disabled={revealed}
                        className={cn(
                          'py-3 px-3 rounded-2xl border-2 text-sm font-black italic transition-all',
                          !revealed && 'border-border bg-muted/30 hover:border-sky-400/50 hover:bg-sky-500/5',
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
              ) : (
                <div className="space-y-2">
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!revealed) submitSpell(); else next(); } }}
                    disabled={revealed}
                    autoFocus
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    placeholder="输入英文单词…"
                    className={cn(
                      'w-full py-3 px-4 rounded-2xl border-2 text-lg font-black italic text-center outline-none transition-colors',
                      revealed
                        ? (normalize(typed) === normalize(cw.word)
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600'
                          : 'border-rose-300 bg-rose-50 dark:bg-rose-500/15 text-rose-500')
                        : 'border-border bg-muted/30 focus:border-sky-400/60',
                    )}
                  />
                  {!revealed && (
                    <>
                      <button
                        onClick={submitSpell}
                        disabled={!typed.trim()}
                        className="w-full py-2.5 rounded-2xl bg-sky-500 text-white text-xs font-black hover:bg-sky-600 disabled:opacity-40"
                      >
                        提交（Enter）
                      </button>
                      {/* 不会的出口：按答错计（q1），亮出答案后照常前进 —— 拼写卡不许有死路 */}
                      <button
                        onClick={() => settle(false)}
                        className="w-full py-2 rounded-2xl border border-dashed border-border text-muted-foreground text-[10px] font-black hover:bg-muted/40"
                      >
                        不会？看答案
                      </button>
                    </>
                  )}
                </div>
              )}

              {revealed && (
                <div className="space-y-3">
                  {/* 判定结果 + 正确答案 */}
                  <div
                    className={cn(
                      'rounded-2xl border p-4 space-y-1.5',
                      results[idx] === true
                        ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/10'
                        : 'border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-500/10',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {results[idx] === true
                        ? <Check className="size-4 text-emerald-500" />
                        : <X className="size-4 text-rose-400" />}
                      <span className={cn('text-xs font-black', results[idx] === true ? 'text-emerald-600' : 'text-rose-500')}>
                        {results[idx] === true ? '正确' : '答案是'}
                      </span>
                      {results[idx] !== true && (
                        <span className="text-base font-black italic text-foreground">{cw.word}</span>
                      )}
                      <button onClick={() => tts.speak(cw.word, { rate: 0.9 })} className="ml-auto text-muted-foreground hover:text-ink-teal" title="朗读">
                        <Volume2 className="size-4" />
                      </button>
                    </div>
                    {shown?.phonetic && <p className="text-[10px] font-bold text-muted-foreground/70 pl-6">{shown.phonetic}</p>}
                    {shown?.examples?.[0] && (
                      <p className="text-[11px] text-muted-foreground font-medium pl-6 leading-relaxed">
                        {shown.examples[0].en}
                        <span className="block text-[10px] text-muted-foreground/70">{shown.examples[0].zh}</span>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={next}
                    className="w-full py-3 rounded-2xl bg-sky-500 text-white text-sm font-black shadow-lg shadow-sky-200/50 hover:bg-sky-600 transition-all active:scale-[0.99]"
                  >
                    {idx + 1 >= queue.length ? '看结果' : '下一个'}（Enter）
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </MotionDiv>
      )}
    </div>
  );
}
