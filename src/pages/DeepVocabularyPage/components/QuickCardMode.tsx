/**
 * QuickCardMode — 快速闪卡（纯单词自测）。
 *
 * 与复习检测（SM-2 五档评分）不同，这里只有两个选项：
 *   - 认识   → 直接下一张
 *   - 不认识 → 显示中文释义 + 音标 + 词性 + 例句，再点「下一个」继续
 *
 * 交互补齐（对齐主流背单词 App）：
 *   - **点卡片即翻面**看释义（不必先点「不认识」——先猜再看才是自测）；
 *   - 释义面附**一条例句**（可点朗读），例句随卡片按需加载 detail；
 *   - **「上一个」**回看上一张（直接展开释义，语义与复习检测的回看一致）；
 *   - 顶部常驻**上一个单词**（显示词面，点开看完整词条详情：释义/例句/搭配/近反义/深度解释）；
 *   - 一轮结束展示**本轮词表**（认识/不认识分色，点词可朗读）；
 *   - 每轮的词表**落盘留档**（quickcard-history），可回看、可整组重练、可只重练不认识的；
 *   - 「全部」档位解除每轮数量上限（一次过整本词书）。
 *   - 每轮数量（10/20/50/100/全部）**只出现在起跑页**：训练中途改档位 = 重建随机队列，
 *     本轮已作答的结果会整轮清空，所以训练页顶栏只显示只读卡数（要换数量先「返回」）。
 *
 * 认识/不认识 依然写入 SM-2 进度（5 / 1），与复习系统联动。
 */

import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import {
  Zap, Check, X, RefreshCw, ArrowRight, ArrowLeft, Volume2, VolumeX, Shuffle, Target,
  BookOpen, History, RotateCcw, Trash2, ChevronDown, ChevronUp, ListChecks,
  ChevronLeft, Eye, Link2, Sparkles, Quote, Star,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { IWordEntry } from '@/data/wordbank/schema';
import { queryWords, findWord, preloadDetail, isDetailReady } from '@/data/wordbank';
import { useWordLearning } from '@/lib/use-word-learning';
import { useTTS } from '@/lib/use-tts';
import { useImmersive } from '@/lib/focus-mode';
import { useLearningStats } from '@/lib/use-learning-stats';
import { sfxTick, sfxComplete } from '@/lib/sfx';
import { FitWord } from '@/components/FitWord';
import { safeStorage } from '@/lib/safe-storage';
import { cleanText, cn } from '@/lib/utils';
import { useFavorites, type IFavoriteItem } from '@/lib/use-favorites';
import {
  absorbQuickCardRun, useQuickCardRuns,
  loadQuickCardSession, saveQuickCardSession, clearQuickCardSession,
  type IQuickCardRun, type IQuickCardWordResult, type IQuickCardPending,
} from '@/lib/quickcard-history';

const ROUND_SIZES = [10, 20, 50, 100] as const;
/** 0 = 不限量（整本）——「单词上限解开」 */
const ROUND_ALL = 0;
/** 答错的词隔几张卡重新插回队列（与复习检测的即时巩固同参） */
const RELEARN_GAP = 4;
/** 同一个词一轮最多重排几次，防止一个词反复出现拖长一轮 */
const MAX_RELEARN = 2;
/**
 * 自动发音开关 —— 与复习检测/每日学习/语块复习共用同一个持久化键
 * （`FlashcardMode.tsx:33`、`DailyLearningMode.tsx:34`、`ChunkTrainingPage.tsx:100`）。
 * 此前快速闪卡**完全不读它**，出卡无条件朗读：用户在别处关了自动发音，
 * 进快速闪卡照样出声，而别处的提示语写着「与复习检测/快速闪卡共用此设置」。
 */
const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';
const ROUND_KEY = '__nativethink_quickcard_round';
const POS_KEY = '__nativethink_quickcard_pos';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseRoundSize(raw: string | null): number {
  const v = parseInt(raw || '', 10);
  if (!Number.isFinite(v)) return 20;
  return v === ROUND_ALL || (ROUND_SIZES as readonly number[]).includes(v) ? v : 20;
}

/** 词表里的一个词（结果页 / 留档共用） */
interface IWordResult { word: string; known: boolean }

export default function QuickCardMode({ level }: { level: string }) {
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const { recordReview } = useWordLearning(level);
  const { addStudyMinutes } = useLearningStats();
  const tts = useTTS();

  /** 自动发音：默认**开**（只有显式存过 '0' 才算关），与其余三处同口径；localStorage 不可用也返回 true */
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try { return safeStorage.getItem(AUTO_SPEAK_KEY) !== '0'; } catch { return true; }
  });
  const toggleAutoSpeak = useCallback(() => {
    // 持久化与提示放在更新函数**外** —— StrictMode 下更新函数被调用两次会双弹提示
    const next = !autoSpeak;
    setAutoSpeak(next);
    try { safeStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    toast(next ? '已开启自动发音' : '已关闭自动发音', { duration: 1200 });
  }, [autoSpeak]);

  const [roundSize, setRoundSize] = useState<number>(() => {
    try { return parseRoundSize(safeStorage.getItem(ROUND_KEY)); } catch { return 20; }
  });
  // 每轮起始位置（继续上次进度用）
  const [pos, setPos] = useState<number>(() => {
    try {
      const saved = JSON.parse(safeStorage.getItem(POS_KEY) || '{}');
      return saved?.level === level ? (saved.pos || 0) : 0;
    } catch { return 0; }
  });
  const [queue, setQueue] = useState<IWordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  /** 每张卡的结果，下标与 queue 对齐；null = 还没作答 */
  const [results, setResults] = useState<(boolean | null)[]>([]);
  const [done, setDone] = useState(false);
  /** 停在起跑页（返回/Esc）—— 此时不要自动重建队列 */
  const [paused, setPaused] = useState(false);
  /** detail（例句）加载完成后 +1，强制重渲染把例句画出来 */
  const [detailTick, setDetailTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  /** 正在查看详情的词（null = 关闭）—— 顶部「上一个单词」点开就是它 */
  const [detailWord, setDetailWord] = useState<IWordEntry | null>(null);
  /** 收藏面板 */
  const [showFavs, setShowFavs] = useState(false);
  /**
   * 本轮每个词被"重刷"了几次。
   *
   * 算法：答错的词**隔 RELEARN_GAP 张后重新插回队列**（不是等下一轮），
   * 这样"后面刷词的过程中"它一定会再出现一次；同一词最多重排 MAX_RELEARN 次，
   * 避免一个词反复出现把一轮拖长（与复习检测的即时巩固同源，参数取自 vocab-session）。
   * 连续答对后再出现时按"最后一次作答"计入结果。
   */
  const [relearnCounts, setRelearnCounts] = useState<Record<string, number>>({});

  const resultsRef = useRef<(boolean | null)[]>([]);
  /**
   * 已经自动朗读过的 `${下标}-${单词}`。
   * **每开一轮必须清空**：ref 不随重挂载归零，而"重练这一组"会把同一批词按同一顺序再来一遍，
   * 不清空则新的一轮第一张卡命中旧 key，静默不出声。
   * （声明位置必须在 startRun 之前：startRun 里会写它。）
   */
  const lastSpokenRef = useRef('');
  /** 断点恢复状态机：pending → done（挂载后只恢复一次） */
  const restoreStateRef = useRef<'pending' | 'done'>('pending');
  /** 本轮队列是由断点恢复来的 → 重建 effect 不要覆盖它 */
  const restoredRunRef = useRef(false);
  /** 每开一轮 +1；用于「一轮只落一条记录」的幂等键 */
  const [runSeq, setRunSeq] = useState(0);
  const savedSeqRef = useRef(-1);
  /** 起跑页点「开始」时 +1，让重建队列的 effect 有明确触发源 */
  const [runToken, setRunToken] = useState(0);
  /** 上一次建队列的配置签名（见重建队列 effect 的注释②） */
  const cfgRef = useRef('');

  const { runs, pending, remove: removeRun } = useQuickCardRuns(level);
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();

  /** 收藏的词（与收藏页同源，用于「只练收藏的词」与卡片上的 ★ 态） */
  const favWords = useMemo(() => favorites.filter((f) => f.type === 'word'), [favorites]);
  const isFav = useCallback((word: string) => isFavorited(word, 'word'), [isFavorited]);

  /**
   * 收藏（type='word'，与收藏页同源，在「收藏」页也能看到）。
   * 刻意**不弹 toast**（2026-09-29 用户要求）：★ 图标本身会立刻变成实心金色，
   * 连点几十个词时每条提示只会挡视线 —— 反馈交给控件本身，交给位置固定的收藏计数。
   */
  const toggleFav = useCallback((w: IWordEntry) => {
    const existing = favorites.find((f) => f.type === 'word' && f.content === w.word);
    if (existing) {
      removeFavorite(existing.id);
    } else {
      addFavorite({
        type: 'word',
        content: w.word,
        meaning: w.meaning,
        example: w.examples[0]?.en,
        category: `快速闪卡 · ${level === 'all' ? '全部词库' : level}`,
      });
    }
  }, [favorites, addFavorite, removeFavorite, level]);

  const allWords = useMemo(() => queryWords({ level: level === 'all' ? undefined : level }), [level]);

  /** 开一轮：queue 直接给定（词书随机抽 or 从留档重练） */
  const startRun = useCallback((entries: IWordEntry[]) => {
    const blanks = new Array(entries.length).fill(null) as (boolean | null)[];
    resultsRef.current = blanks;
    setResults(blanks);
    setQueue(entries);
    setIdx(0);
    setRevealed(false);
    setDone(false);
    lastSpokenRef.current = '';   // 新一轮必须忘掉上一轮的朗读记录（重练同一组时尤其重要）
    setRelearnCounts({});          // 新一轮重刷次数清零
    setRunSeq((s) => s + 1);
  }, []);

  /** 构建一轮队列：从当前词书随机抽取 roundSize 个（roundSize=0 → 整本） */
  const buildQueue = useCallback(() => {
    if (allWords.length === 0) { setQueue([]); return; }
    const n = roundSize === ROUND_ALL ? allWords.length : Math.min(roundSize, allWords.length);
    startRun(shuffle(allWords).slice(0, n));
  }, [allWords, roundSize, startRun]);

  /**
   * ① 断点续学（只试一次，且必须排在重建队列的 effect **前面**）。
   *
   * 退出快速闪卡 / 切走 tab / 杀掉 App 再回来，都要回到原来的顺序、位置和作答结果。
   * 两个 ref 的分工：`restoreStateRef` 让重建 effect 先等一等（词库还没加载完时不能急着建队列），
   * `restoredRunRef` 告诉重建 effect "这一轮的队列由恢复提供，别覆盖"。
   */
  useEffect(() => {
    if (restoreStateRef.current !== 'pending') return;
    if (allWords.length === 0) return;   // 等词库就绪再恢复（否则 findWord 全落空）
    restoreStateRef.current = 'done';
    const saved = loadQuickCardSession(level);
    if (!saved) return;
    // 恢复结果必须按**原下标**对齐：词库换版导致 findWord 落空的词，
    // 连同它的作答结果一起剔除 —— 此前 filter 压缩后按下标取，第一个缺失词
    // 之后的所有结果整体前移一位，认识/不认识贴错词
    const entries: IWordEntry[] = [];
    const res: (boolean | null)[] = [];
    saved.order.forEach((k, i) => {
      const w = findWord(k);
      if (!w) return;
      entries.push(w);
      res.push(typeof saved.results[i] === 'boolean' ? saved.results[i] : null);
    });
    if (entries.length === 0) return;
    resultsRef.current = res;
    setResults(res);
    setQueue(entries);
    setIdx(Math.max(0, Math.min(saved.index, entries.length - 1)));
    setRevealed(saved.revealed);
    setPaused(saved.paused);
    setDone(false);
    lastSpokenRef.current = '';
    setRelearnCounts({});
    setRunSeq((s) => s + 1);
    restoredRunRef.current = true;
  }, [allWords, level]);

  /**
   * ② 词书 / 每轮数量 / 「开始」变化 → 重建队列。
   *
   * 两个坑：
   *  ①`paused` 必须参与判断 —— 原先「返回」只是 setQueue([])，紧接着 effect 又把队列填回去，
   *    于是「返回」看起来毫无反应（点了又立刻出新卡）；
   *  ② 必须用配置签名去重 —— 从留档重练是**手工**设队列的，如果只看 paused，
   *    重练时把 paused 置回 false 会连带触发 effect，把刚设好的词表冲掉。
   */
  useEffect(() => {
    if (paused) return;
    if (restoreStateRef.current === 'pending') return;   // 等 ① 先决定要不要恢复
    const cfg = `${level}|${roundSize}|${allWords.length}|${runToken}`;
    if (cfgRef.current === cfg) return;
    cfgRef.current = cfg;
    if (restoredRunRef.current) { restoredRunRef.current = false; return; }   // 本轮队列来自断点，别覆盖
    if (allWords.length === 0) { setQueue([]); return; }
    const n = roundSize === ROUND_ALL ? allWords.length : Math.min(roundSize, allWords.length);
    startRun(shuffle(allWords).slice(0, n));
  }, [level, roundSize, allWords, paused, runToken, startRun]);

  const cw = queue[idx];
  const inSession = !!cw && !done;
  useImmersive(inSession);

  /** 上一个单词（顶部常驻 + 点开看详情用） */
  const prevWord = idx > 0 ? queue[idx - 1] : undefined;

  /**
   * 同一个词在一轮里可能被"重刷"多次（答错后重新插回队列），所以
   * **统计与词表都按词去重，取最后一次作答的结果** —— 否则同一个词会被数两遍，
   * 完成页词表里也会出现两次（用户明确要求"相同的单词列表不要重复列出"）。
   */
  const uniqueResults = useMemo(() => {
    const map = new Map<string, boolean>();
    queue.forEach((w, i) => {
      const r = results[i];
      if (typeof r === 'boolean') map.set(w.word, r);
    });
    return map;
  }, [queue, results]);

  const knownCount = useMemo(() => [...uniqueResults.values()].filter(Boolean).length, [uniqueResults]);
  const unknownCount = useMemo(() => [...uniqueResults.values()].filter((v) => !v).length, [uniqueResults]);
  const answeredCount = knownCount + unknownCount;
  /** 本轮真正涉及的不同单词数（重刷不重复计数） */
  const uniqueTotal = useMemo(() => new Set(queue.map((w) => w.word)).size, [queue]);

  // 进度持久化
  useEffect(() => {
    try { safeStorage.setItem(POS_KEY, JSON.stringify({ level, pos })); } catch { /* ignore */ }
  }, [level, pos]);

  /**
   * 详情弹窗里的词条：detail（例句/搭配/深度解释）到位后重新 findWord 才拿得到，
   * 因为 applyDetail 是**就地补字段**。点开弹窗时才拉起 detail，不预取。
   */
  const detailShown = useMemo(
    () => (detailWord ? (findWord(detailWord.word) ?? detailWord) : null),
    [detailWord, detailTick],
  );

  useEffect(() => {
    if (!detailShown) return;
    if (detailShown.examples.length > 0) return;
    if (isDetailReady(detailShown.level)) return;   // 已就绪且确实没有例句 → 不再重试（否则 tick 死循环）
    let alive = true;
    preloadDetail([detailShown.level])
      .then(() => { if (alive) setDetailTick((t) => t + 1); })
      .catch(() => { /* 降级：只显示核心字段 */ });
    return () => { alive = false; };
  }, [detailShown, detailTick]);

  // 自动朗读当前单词 —— 与复习检测/每日学习/语块共用 __nativethink_vocab_autospeak，
  // 关了就该真的安静（原先无条件朗读，与别处「与快速闪卡共用此设置」的提示矛盾）
  useEffect(() => {
    if (!inSession || !cw || !autoSpeak) return;
    const key = `${idx}-${cw.word}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    try { tts.speak(cw.word, { rate: 0.9 }); } catch { /* ignore */ }
  }, [inSession, cw, idx, tts, autoSpeak]);

  /**
   * 翻面后才按需拉 detail —— 例句/搭配只在真正要看释义时才需要，
   * 不在出卡时预取（「全部」档位可能跨 9 个等级，会白拉几十 MB）。
   * preloadDetail 是原地改写缓存对象，所以用一个 tick 触发重渲染。
   * `isDetailReady` 必须判断：detail 里本来就没有例句的词如果只看 examples.length，
   * 会 tick → 重跑 → 再 tick，变成死循环。
   */
  useEffect(() => {
    if (!inSession || !cw || !revealed) return;
    if (cw.examples.length > 0) return;
    if (isDetailReady(cw.level)) return;
    let alive = true;
    preloadDetail([cw.level])
      .then(() => { if (alive) setDetailTick((t) => t + 1); })
      .catch(() => { /* 降级：只显示核心字段 */ });
    return () => { alive = false; };
  }, [inSession, cw, revealed, detailTick]);

  const setResultAt = useCallback((i: number, v: boolean) => {
    const next = [...resultsRef.current];
    next[i] = v;
    resultsRef.current = next;
    setResults(next);
  }, []);

  /** 队列的 ref 镜像 —— 完成判定与答错重排都用它拿**最新**长度/内容 */
  const queueRef = useRef<IWordEntry[]>([]);
  queueRef.current = queue;

  const next = useCallback(() => {
    setRevealed(false);
    // 用 ref 里的最新长度判定完成 —— 答错重排在**同一事件里**先插词再推进，
    // 闭包里的 queue.length 是插入前的旧值：最后一卡答错会被直接判成完成，
    // 重排的词永远不出现（toast 却承诺"稍后会再出现"）
    if (idx + 1 >= queueRef.current.length) {
      setDone(true);
      sfxComplete();
    } else {
      setIdx((i) => i + 1);
      setPos((p) => p + 1);
    }
  }, [idx]);

  /** 上一个：回看上一张，直接展开释义（没作答的保持未作答，作答过的可重评） */
  const prev = useCallback(() => {
    if (idx === 0) return;
    setIdx((i) => i - 1);
    setPos((p) => Math.max(0, p - 1));
    setRevealed(true);
  }, [idx]);

  /**
   * 答错的词隔 RELEARN_GAP 张**重新插回同一轮队列**（"在后面刷词过程中再出现一次"）。
   * queue 与 results 必须同步 splice，否则下标错位、作答结果会串到别的词上。
   * 全部在事件层用 ref 一次性算好 —— 此前在 setState updater 里再调 setState + 改 ref，
   * StrictMode 下 updater 双调用会把词插两遍、results 错位（更新函数必须纯）。
   */
  const scheduleRelearn = useCallback((word: IWordEntry) => {
    const key = word.word.toLowerCase();
    const used = relearnCounts[key] ?? 0;
    if (used >= MAX_RELEARN) return;
    // 该词在当前位置之后已经有排期的不重复插
    if (queueRef.current.slice(idx + 1).some((x) => x.word.toLowerCase() === key)) return;
    const at = Math.min(queueRef.current.length, idx + 1 + RELEARN_GAP);
    const nextQueue = [...queueRef.current];
    nextQueue.splice(at, 0, word);
    const resNext = [...resultsRef.current];
    resNext.splice(at, 0, null);
    queueRef.current = nextQueue;
    resultsRef.current = resNext;
    setQueue(nextQueue);
    setResults(resNext);
    setRelearnCounts((c) => ({ ...c, [key]: used + 1 }));
  }, [idx, relearnCounts]);

  const markKnown = useCallback(() => {
    if (!cw) return;
    // 回看时改判：不重复累计学习时长，只改结论
    if (resultsRef.current[idx] == null) {
      recordReview(cw, 5);
      addStudyMinutes(0.15, 'vocabulary');
    }
    setResultAt(idx, true);
    sfxTick();
    next();
  }, [cw, idx, recordReview, addStudyMinutes, next, setResultAt]);

  const markUnknown = useCallback(() => {
    if (!cw) return;
    if (resultsRef.current[idx] == null) {
      recordReview(cw, 1);
      addStudyMinutes(0.15, 'vocabulary');
      const key = cw.word.toLowerCase();
      if ((relearnCounts[key] ?? 0) < MAX_RELEARN) {
        // 只重排，不弹提示（2026-09-29 用户要求）：卡片紧接着翻面显示释义，
        // 且它在同一轮里真的会再出现 —— 再叠一条 toast 只是刷屏。
        scheduleRelearn(cw);
      }
    }
    setResultAt(idx, false);
    if (!revealed) setRevealed(true);
    else next();
  }, [cw, idx, revealed, relearnCounts, scheduleRelearn, recordReview, addStudyMinutes, next, setResultAt]);

  const speak = (text: string) => { try { tts.speak(cleanText(text), { rate: 0.9 }); } catch { /* ignore */ } };

  /** 退出当前一轮，回到起跑页 */
  const exitRun = useCallback(() => {
    setPaused(true);
    setQueue([]);
    setDone(false);
    setShowHistory(false);
  }, []);

  /** 从起跑页开始一轮（靠 runToken 触发重建队列的 effect） */
  const beginRun = useCallback(() => {
    setPaused(false);
    setShowHistory(false);
    setRunToken((t) => t + 1);
  }, []);

  /**
   * 继续未学完的那一轮。必须把当前配置登记为"已处理" ——
   * 否则暂停页改过每轮数量后点继续，effect ② 会因 cfg 变化重建随机队列，
   * 把刚承诺续学的断点轮整轮覆盖掉。
   */
  const resumeRun = useCallback(() => {
    cfgRef.current = `${level}|${roundSize}|${allWords.length}|${runToken}`;
    setPaused(false);
  }, [level, roundSize, allWords.length, runToken]);

  // 键盘：1/← 不认识，2/→ 认识，空格 翻面/下一个，Backspace 上一个，Esc 返回
  useEffect(() => {
    if (!inSession) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      /**
       * 词条详情弹窗打开时不抢键盘 —— 否则 Esc 会"关弹窗 + 顺手退出本轮"，
       * 1/2/空格 还会在弹窗后面偷偷评分。
       *
       * 必须用**捕获阶段**监听（下面的 addEventListener 第三参 true）：
       * Radix 的 DismissableLayer 在 document 冒泡阶段处理 Esc 并同步关掉弹窗
       * （React 对 keydown 这类离散事件是同步 flush），等冒泡到 window 时
       * `[role="dialog"]` 已经不在 DOM 里了 —— 只在冒泡阶段判断等于没判断，
       * 真机上就是"按 Esc 关弹窗，同时本轮也被退出"。
       */
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape') { exitRun(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); prev(); return; }
      if (revealed) {
        if (e.code === 'Space' || e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
        return;
      }
      if (e.key === '1' || e.key === 'ArrowLeft') { e.preventDefault(); markUnknown(); }
      else if (e.key === '2' || e.key === 'ArrowRight') { e.preventDefault(); markKnown(); }
      else if (e.code === 'Space') { e.preventDefault(); setRevealed(true); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [inSession, revealed, markKnown, markUnknown, next, prev, exitRun]);

  const changeRoundSize = (n: number) => {
    setRoundSize(n);
    try { safeStorage.setItem(ROUND_KEY, String(n)); } catch { /* ignore */ }
  };

  /**
   * 本轮词表 —— 按**首次出现顺序**排列，同一个词只出现一次，取最后一次作答的结果。
   * （重刷机制会把答错的词插回队列，不去重的话完成页词表里会有重复词、统计也会翻倍。）
   */
  const runWords = useMemo<IWordResult[]>(() => {
    const firstSeen = new Map<string, number>();
    queue.forEach((w, i) => { if (!firstSeen.has(w.word)) firstSeen.set(w.word, i); });
    return [...firstSeen.entries()]
      .filter(([word]) => uniqueResults.has(word))
      .sort((a, b) => a[1] - b[1])
      .map(([word]) => ({ word, known: uniqueResults.get(word) === true }));
  }, [queue, uniqueResults]);

  /**
   * 一轮结束 → 落留档（同一轮只落一次）。
   *
   * 切分规则：按**当时选择的数量**把词表切成整份记录；不足一份的余数进「当前累积」，
   * 下一轮补满再自动升格成完整记录（absorbQuickCardRun 负责）。
   * 一轮没学完就直接退出的话，走下面的断点续学，不会在这里落档。
   */
  useEffect(() => {
    if (!done) return;
    if (savedSeqRef.current === runSeq) return;
    if (runWords.length === 0) return;
    savedSeqRef.current = runSeq;
    absorbQuickCardRun(level, roundSize, runWords);
    clearQuickCardSession(level);   // 这一轮已经结算成记录，断点作废
  }, [done, runSeq, runWords, level, roundSize]);

  /** 断点续学：把"没学完的那一轮"存下来（顺序 + 位置 + 每张卡的作答 + 是否停在起跑页）。
      切词书的同一帧本 effect 会先于队列重建跑（新 level + 旧队列）——
      断点已按词书分键，这里再挡一层队列归属，避免把旧词书写进新书的名下 */
  useEffect(() => {
    if (done || queue.length === 0) return;
    if (level !== 'all' && queue[0] && queue[0].level !== level) return;
    saveQuickCardSession({
      level,
      order: queue.map((w) => w.word),
      index: idx,
      results: queue.map((_, i) => (typeof results[i] === 'boolean' ? results[i] : null)),
      revealed,
      paused,
    });
  }, [done, queue, idx, results, revealed, paused, level]);

  /** 从留档重练：能查到的词还原成词条，查不到的（词库删过）忽略 */
  const drillRun = useCallback((run: IQuickCardRun, onlyUnknown = false) => {
    const picked = onlyUnknown ? run.words.filter((w) => !w.known) : run.words;
    const entries = picked
      .map((w) => findWord(w.word) ?? queryWords({ search: w.word, limit: 1 })[0])
      .filter((w): w is IWordEntry => !!w);
    if (entries.length === 0) { setShowHistory(false); return; }
    startRun(entries);
    setPaused(false);
    setShowHistory(false);
    setOpenRunId(null);
    toast.info(`重练 ${entries.length} 个词`, { duration: 1500 });
  }, [startRun]);

  /**
   * 打开某个词的详情。
   *
   * 三级兜底：**先从本轮 queue 里取**（词一定在，且是当前词书里的那一份），
   * 再 findWord，最后按词面搜。只写 findWord 一层的话，任何一次查不到都会静默变成
   * `setDetailWord(null)` —— 表现就是"点了没反应"，很难查。
   */
  const openDetail = useCallback((word: string) => {
    const hit = queue.find((q) => q.word === word)
      ?? findWord(word)
      ?? queryWords({ search: word, limit: 1 })[0]
      ?? null;
    setDetailWord(hit);
  }, [queue]);

  /** 只练收藏的词 —— 收藏的真正用途：把"我特意存下来的词"单独过一遍 */  const drillFavorites = useCallback((words: string[]) => {
    const entries = words
      .map((w) => findWord(w) ?? queryWords({ search: w, limit: 1 })[0])
      .filter((w): w is IWordEntry => !!w);
    if (entries.length === 0) { toast.info('收藏的词在词库里找不到了', { duration: 2000 }); return; }
    startRun(entries);
    setPaused(false);
    setShowFavs(false);
    setShowHistory(false);
    toast.info(`开始练收藏的 ${entries.length} 个词`, { duration: 1500 });
  }, [startRun]);

  /**
   * 词条详情弹窗 —— **三个分支（进行中 / 完成页 / 起跑页）都要渲染它**。
   * 踩过的坑：一开始只在"进行中"那个 return 里渲染，结果完成页和起跑页的词表点了没反应
   * （setDetailWord 生效了，但没有任何地方画这个弹窗）。
   */
  const detailDialog = (
    <WordInfoDialog
      entry={detailShown}
      onClose={() => setDetailWord(null)}
      onSpeak={speak}
      fav={!!detailShown && isFav(detailShown.word)}
      onToggleFav={() => { if (detailShown) toggleFav(detailShown); }}
    />
  );
  const favoritesPanel = (
    <FavoritesPanel
      words={favWords}
      onDrill={drillFavorites}
      onRemove={(word) => { const e = findWord(word); if (e) toggleFav(e); }}
      onSpeak={speak}
      onOpen={(word) => openDetail(word)}
    />
  );

  // ── 完成页 ──
  if (done) {
    const total = runWords.length;
    const rate = total > 0 ? Math.round((knownCount / total) * 100) : 0;
    const wrongWords = runWords.filter((w) => !w.known);
    return (
      <div className="space-y-4">
        <MotionDiv
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="rounded-[32px] border-2 border-[#00B894]/20 bg-card shadow-sm p-6 sm:p-8 space-y-5"
        >
          <div className="text-center space-y-5">
            <Target className="size-12 text-muted-foreground/40 mx-auto" />
            <div className="space-y-1">
              <p className="text-2xl font-black italic text-foreground">本轮完成！</p>
              <p className="text-xs font-bold text-muted-foreground">
                共 {total} 张 · 认识率 {rate}% · 已存入学习记录
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 dark:border-emerald-500/20">
                <p className="text-xl font-black text-ink-teal">{knownCount}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">认识</p>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 dark:border-amber-500/20">
                <p className="text-xl font-black text-amber-500">{unknownCount}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">不认识</p>
              </div>
            </div>
          </div>

          {/* 本轮词表 —— 点词看详情，星标收藏 */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ListChecks className="size-3.5 text-muted-foreground" />
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                本轮词表 · {total} 词（点词看详情 · ★ 收藏）
              </span>
              <button
                onClick={() => setShowFavs((v) => !v)}
                className={cn('ml-auto px-2 py-0.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1',
                  showFavs ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
              >
                <Star className={cn('size-3', favWords.length > 0 && !showFavs && 'fill-amber-400 text-amber-400')} />
                收藏 {favWords.length}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-muted/30 p-2">
              <div className="flex flex-wrap gap-1.5">
                {runWords.map((w, i) => (
                  <WordChip
                    key={`${w.word}-${i}`}
                    word={w.word}
                    known={w.known}
                    fav={isFav(w.word)}
                    onOpen={() => openDetail(w.word)}
                    onToggleFav={() => { const e = findWord(w.word); if (e) toggleFav(e); }}
                  />
                ))}
              </div>
            </div>
          </div>

          {showFavs && favoritesPanel}

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={exitRun} className="flex-1 rounded-2xl text-xs font-black">
              返回
            </Button>
            {wrongWords.length > 0 && (
              <Button
                variant="outline"
                onClick={() => drillRun({ id: '', level, at: Date.now(), known: knownCount, unknown: unknownCount, words: runWords }, true)}
                className="flex-1 rounded-2xl text-xs font-black border-amber-200 text-amber-600 hover:bg-amber-50"
              >
                <RotateCcw className="size-3.5 mr-1.5" />只重练不认识的（{wrongWords.length}）
              </Button>
            )}
            <Button onClick={buildQueue} className="flex-1 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white text-xs font-black">
              <RefreshCw className="size-3.5 mr-1.5" />再来一组
            </Button>
          </div>
        </MotionDiv>

        {/* 学习记录 —— 每轮留档，可整组重练 */}
        <HistoryPanel
          runs={runs}
          pending={pending}
          openRunId={openRunId}
          setOpenRunId={setOpenRunId}
          onDrill={drillRun}
          onRemove={removeRun}
          isFav={isFav}
          onOpen={(word) => openDetail(word)}
          onToggleFav={(word) => { const e = findWord(word); if (e) toggleFav(e); }}
        />
        {detailDialog}
      </div>
    );
  }

  // ── 起跑页（返回 / Esc 后停在这里，选完数量再开一轮） ──
  if (paused) {
    return (
      <div className="space-y-4">
        <div className="rounded-[32px] border-2 border-[#00B894]/20 bg-card shadow-sm p-8 text-center space-y-5">
          <Zap className="size-12 text-ink-teal/60 mx-auto" />
          <div className="space-y-1">
            <p className="text-xl font-black italic text-foreground">快速闪卡</p>
            <p className="text-xs font-bold text-muted-foreground">
              只显示单词，认识就过、不认识看释义 · 本轮可出 {roundSize === ROUND_ALL ? `全部 ${allWords.length}` : Math.min(roundSize, allWords.length)} 词
            </p>
          </div>
          <div className="flex items-center justify-center gap-1 flex-wrap">
            <Shuffle className="size-3 text-muted-foreground" />
            {ROUND_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => changeRoundSize(n)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all',
                  roundSize === n ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => changeRoundSize(ROUND_ALL)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all',
                roundSize === ROUND_ALL ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
              title="不限量：一次过完整本词书"
            >
              全部
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {/* 断点续学：上次没学完的那一轮还在（退出/切 tab/杀 App 都保留） */}
            {queue.length > 0 && idx < queue.length && (
              <Button
                onClick={resumeRun}
                className="rounded-2xl bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white text-xs font-black px-6 py-4"
              >
                <History className="size-4 mr-1.5" />继续本轮（第 {idx + 1}/{queue.length} 张）
              </Button>
            )}
            <Button
              onClick={beginRun}
              disabled={allWords.length === 0}
              className={cn('rounded-2xl text-white text-xs font-black px-8 py-4',
                queue.length > 0 && idx < queue.length ? 'bg-muted-foreground/40 hover:bg-muted-foreground/50' : 'bg-[#00B894] hover:bg-[#00a882]')}
            >
              <Zap className="size-4 mr-1.5" />
              {allWords.length === 0 ? '词书加载中…' : queue.length > 0 && idx < queue.length ? '重新开一轮' : '开始闪卡'}
            </Button>
          </div>
        </div>
        {favoritesPanel}
        <HistoryPanel
          runs={runs}
          pending={pending}
          openRunId={openRunId}
          setOpenRunId={setOpenRunId}
          onDrill={drillRun}
          onRemove={removeRun}
          isFav={isFav}
          onOpen={(word) => openDetail(word)}
          onToggleFav={(word) => { const e = findWord(word); if (e) toggleFav(e); }}
        />
        {detailDialog}
      </div>
    );
  }

  if (!cw) {
    return (
      <div className="text-center py-16 space-y-3">
        <Zap className="size-10 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">词书加载中…</p>
      </div>
    );
  }

  const example = cw.examples[0];

  return (
    <div className="space-y-4">
      {/* 顶栏：返回 + 本轮词数（只读）+ 收藏/记录 + 进度 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost" size="icon"
          onClick={exitRun}
          className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-teal"
          title="返回概览 (Esc)"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex items-center gap-1.5">
          <Zap className="size-4 text-ink-teal" />
          <span className="text-xs font-black italic text-foreground">快速闪卡</span>
        </div>
        {/*
          每轮数量**只给在起跑页**（下面的 `if (paused)` 分支）。
          训练页这里原本有一排 10/20/50/100/全部：点一下 → roundSize 变 → 重建队列的 effect ②
          直接把这一轮**重新随机抽**，已作答的认识/不认识整轮清空（用户反馈：练到一半换数量，进度没了）。
          所以这里换成只读标签，要改数量先「返回」到起跑页 —— 中途不存在可点的档位。
        */}
        <div className="flex items-center gap-1 ml-auto flex-wrap justify-end">
          <span
            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-muted text-muted-foreground"
            title={`本轮 ${uniqueTotal} 词 —— 每轮数量在「返回」后的起跑页调整；训练中改档位会重开一轮，本轮进度会没`}
          >
            本轮 {uniqueTotal} 词 · 换数量请返回
          </span>
          <button
            onClick={() => { setShowFavs((v) => !v); setShowHistory(false); }}
            className={cn(
              'ml-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1',
              showFavs ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
            title="收藏的单词"
          >
            <Star className={cn('size-3', favWords.length > 0 && !showFavs && 'fill-amber-400 text-amber-400')} />
            收藏{favWords.length > 0 ? ` ${favWords.length}` : ''}
          </button>
          <button
            onClick={() => { setShowHistory((v) => !v); setShowFavs(false); }}
            className={cn(
              'ml-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1',
              showHistory ? 'bg-[#00B894] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
            title="学习记录（每轮留档）"
          >
            <History className="size-3" />记录{runs.length > 0 ? ` ${runs.length}` : ''}
          </button>
        </div>
      </div>

      {showFavs && (
        <FavoritesPanel
          words={favWords}
          onDrill={drillFavorites}
          onRemove={(word) => { const e = findWord(word); if (e) toggleFav(e); }}
          onSpeak={speak}
          onOpen={(word) => openDetail(word)}
        />
      )}

      {showHistory && (
        <HistoryPanel
          runs={runs}
          pending={pending}
          openRunId={openRunId}
          setOpenRunId={setOpenRunId}
          onDrill={drillRun}
          onRemove={removeRun}
                    isFav={isFav}
          onOpen={(word) => openDetail(word)}
          onToggleFav={(word) => { const e = findWord(word); if (e) toggleFav(e); }}
        />
      )}

      {/*
        上一个单词 —— 常驻顶部，**显示词面**（"刚刚那个词到底是什么"是最高频的回头需求）。
        点它打开完整词条详情；要回到那张卡用下方的「上一个」按钮，两者职责分开。
      */}
      {prevWord && (
        <div className="flex items-center gap-2 -mt-1">
          <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-muted-foreground/70">
            上一个单词
          </span>
          <button
            onClick={() => setDetailWord(prevWord)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-border bg-card max-w-[62%] transition-colors hover:border-[#00B894]/40 hover:bg-[#00B894]/5 active:scale-[0.98]"
            title={`查看「${prevWord.word}」详情`}
          >
            <ChevronLeft className="size-3 shrink-0 text-muted-foreground" />
            <span className="text-[11px] font-black italic text-foreground truncate">{prevWord.word}</span>
            <Eye className="size-3 shrink-0 text-muted-foreground" />
          </button>
          <span className="shrink-0 text-[9px] font-bold text-muted-foreground/50">点开看详情</span>
        </div>
      )}

      {/* 进度条 —— 分母用「不同单词数」，重刷不会让进度条倒退或超过 100% */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00B894] to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (answeredCount / Math.max(1, uniqueTotal)) * 100)}%` }}
          />
        </div>
        <span className="text-xs font-black text-muted-foreground tabular-nums">{answeredCount}/{uniqueTotal}</span>
        <span className="text-[10px] font-bold text-emerald-600 tabular-nums">✓{knownCount}</span>
        <span className="text-[10px] font-bold text-amber-500 tabular-nums">✗{unknownCount}</span>
        {/* 自动发音开关：与复习检测/每日学习/语块共用同一个设置，一处关闭处处安静 */}
        <button
          type="button"
          onClick={toggleAutoSpeak}
          aria-label={autoSpeak ? '关闭自动发音（与复习检测/每日学习共用此设置）' : '开启自动发音（与复习检测/每日学习共用此设置）'}
          title="自动发音 —— 与复习检测/每日学习/语块复习共用此设置"
          className={cn(
            'shrink-0 size-7 rounded-xl flex items-center justify-center border transition-colors',
            autoSpeak
              ? 'border-[#00B894]/40 bg-[#00B894]/10 text-ink-teal'
              : 'border-border bg-muted/40 text-muted-foreground',
          )}
        >
          {autoSpeak ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        </button>
      </div>

      {/* 卡片：只有单词 —— 点一下即翻面看释义 */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <MotionDiv
            key={cw.word + (revealed ? '-r' : '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg"
          >
            <Card
              onClick={() => { if (!revealed) setRevealed(true); }}
              className={cn(
                'rounded-[32px] border-2 shadow-lg transition-all min-h-[220px] flex flex-col justify-center',
                !revealed && 'cursor-pointer active:scale-[0.995]',
                revealed ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10' : 'border-border bg-card',
              )}
            >
              <CardContent className="p-8 text-center space-y-3">
                <div data-fit-box className="flex items-center justify-center gap-2 max-w-full">
                  <h2 className="text-foreground min-w-0 max-w-full">
                    {/* reserve 必须覆盖**两个**按钮（朗读 + 收藏 ≈ 96px）——
                        此前只留 52px，长单词按 (宽-52) 缩放，右端被按钮盖住（真机反馈） */}
                    <FitWord text={cw.word} maxPx={48} minPx={20} reservePx={100} />
                  </h2>
                  <Button
                    variant="ghost" size="icon"
                    onClick={(e) => { e.stopPropagation(); speak(cw.word); }}
                    className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-teal shrink-0"
                  >
                    <Volume2 className="size-4.5" />
                  </Button>
                  {/* 收藏：正反面都在，随手就能标（同步进「收藏」页） */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFav(cw); }}
                    className={cn('shrink-0 rounded-2xl p-2 transition-colors',
                      isFav(cw.word) ? 'bg-amber-400/15 text-amber-500' : 'bg-muted text-muted-foreground hover:text-amber-500')}
                    title={isFav(cw.word) ? '取消收藏' : '收藏这个单词'}
                  >
                    <Star className={cn('size-4.5', isFav(cw.word) && 'fill-amber-400 text-amber-400')} />
                  </button>
                </div>

                {revealed ? (
                  <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 pt-1">
                    <div className="space-y-1">
                      {cw.phonetic && <p className="text-sm font-bold text-ink-violet">{cw.phonetic}</p>}
                      {/* 释义必须带词性 —— 只给中文意思，用户没法判断词能不能这么用 */}
                      <p className="text-xl font-black text-foreground">
                        <span className="mr-1.5 align-middle text-xs font-black uppercase tracking-wider text-ink-violet">
                          {cw.partOfSpeech}
                        </span>
                        {cw.meaning}
                      </p>
                    </div>

                    {/* 例句：跟着单词一起看，点句子可朗读 */}
                    {example ? (
                      <div
                        onClick={(e) => { e.stopPropagation(); speak(example.en); }}
                        className="cursor-pointer rounded-2xl bg-white/60 dark:bg-foreground/10 border border-violet-100 p-3 space-y-1 text-left group/ex"
                      >
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                          <BookOpen className="size-3" />例句（点句子朗读）
                        </div>
                        <p className="text-sm text-foreground/85 italic font-medium group-hover/ex:text-ink-violet transition-colors">
                          {cleanText(example.en)}
                        </p>
                        {example.zh && <p className="text-xs text-muted-foreground">{cleanText(example.zh)}</p>}
                      </div>
                    ) : cw.collocations.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {cw.collocations.slice(0, 4).map((c) => (
                          <span key={c} className="px-2 py-1 rounded-lg bg-[#6C5CE7]/8 text-[11px] font-bold text-foreground/80">{c}</span>
                        ))}
                      </div>
                    ) : null}
                  </MotionDiv>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    点卡片看释义 · 认识就直接下一张
                  </p>
                )}
              </CardContent>
            </Card>
          </MotionDiv>
        </AnimatePresence>
      </div>

      {/* 三个操作：上一个 / 不认识 / 认识 */}
      <div className="flex justify-center gap-3">
        <button
          onClick={prev}
          disabled={idx === 0}
          className={cn(
            'shrink-0 px-4 py-4 rounded-2xl border-2 border-border text-muted-foreground font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1.5',
            idx === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:border-[#00B894]/40 hover:text-ink-teal',
          )}
          title="上一个 (Backspace)"
        >
          <ArrowLeft className="size-4" />上一个
        </button>
        <button
          onClick={markUnknown}
          className="flex-1 max-w-[150px] py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <X className="size-4" />不认识 <span className="text-[9px] opacity-70">1</span>
        </button>
        <button
          onClick={markKnown}
          className="flex-1 max-w-[150px] py-4 rounded-2xl bg-[#00B894] hover:bg-[#00a882] text-white font-black text-sm shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Check className="size-4" />认识 <span className="text-[9px] opacity-70">2</span>
        </button>
      </div>

      {revealed && (
        <div className="flex justify-center">
          <Button
            onClick={next}
            className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-10 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg gap-2"
          >
            下一个<ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      <p className="text-center text-[9px] text-muted-foreground/60 font-bold">
        点卡片翻面 · 键盘：1 不认识 · 2 认识 · 空格 翻面/下一个 · Backspace 上一个 · Esc 返回
      </p>
      <p className="text-center text-[9px] text-muted-foreground/50">
        <Badge variant="secondary" className="rounded-full px-2 py-0 text-[9px] font-bold bg-muted mr-1">
          认识/不认识会同步到复习进度
        </Badge>
      </p>

      {/* 词条详情 —— 卡片上的「上一个单词」/ 各处词表里的词都能打开 */}
      {detailDialog}
    </div>
  );
}

/**
 * 词条详情弹窗 —— 把一个词的**全部**词库信息摊开：
 * 词头/音标/释义 → 难度标签（词频·语域·情感·中文无对应）→ 例句 → 常用搭配 → 近义/反义/词族 → 深度解释。
 * 信息层次与复习检测的卡背保持一致，避免同一个词在两个模式里长得不一样。
 * 导出复用：每日学习的顶部「上一个单词」点开的就是它（同一份弹窗，两个模式长得一样）。
 */
export function WordInfoDialog({
  entry, onClose, onSpeak, fav, onToggleFav,
}: {
  entry: IWordEntry | null;
  onClose: () => void;
  onSpeak: (text: string) => void;
  fav: boolean;
  onToggleFav: () => void;
}) {
  const section = (icon: ReactNode, text: string) => (
    <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
      {icon}{text}
    </p>
  );
  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-[24px] max-h-[85vh] overflow-y-auto overscroll-contain">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">{entry.word} 词条详情</DialogTitle>
              <div className="text-center space-y-1.5">
                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-2xl font-black italic text-foreground">{entry.word}</h2>
                  <button
                    onClick={() => onSpeak(entry.word)}
                    className="rounded-2xl bg-muted p-1.5 text-muted-foreground hover:text-ink-teal transition-colors"
                    title="朗读单词"
                  >
                    <Volume2 className="size-4" />
                  </button>
                  <button
                    onClick={onToggleFav}
                    className={cn('rounded-2xl p-1.5 transition-colors',
                      fav ? 'bg-amber-400/15 text-amber-500' : 'bg-muted text-muted-foreground hover:text-amber-500')}
                    title={fav ? '取消收藏' : '收藏这个单词'}
                  >
                    <Star className={cn('size-4', fav && 'fill-amber-400 text-amber-400')} />
                  </button>
                </div>
                {entry.phonetic && <p className="text-xs font-bold text-ink-violet">{entry.phonetic}</p>}
                {/* 释义带词性（与卡片背面一致） */}
                <p className="text-base font-black text-foreground">
                  <span className="mr-1.5 align-middle text-[11px] font-black uppercase tracking-wider text-ink-violet">
                    {entry.partOfSpeech}
                  </span>
                  {entry.meaning || '（无释义）'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
                  {entry.frequencyRank > 0 && (
                    <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground border-0">
                      词频 #{entry.frequencyRank}
                    </Badge>
                  )}
                  <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground border-0">
                    {entry.register === 'formal' ? '正式' : entry.register === 'informal' ? '口语' : '中性'}
                  </Badge>
                  {entry.emotion !== 'neutral' && (
                    <Badge className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold border-0',
                      entry.emotion === 'positive' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500')}>
                      {entry.emotion === 'positive' ? '褒义' : '贬义'}
                    </Badge>
                  )}
                  {entry.hasNoChineseEquivalent && (
                    <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-600 border-0">中文无对应</Badge>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3.5 pt-1">
              {entry.examples.length > 0 && (
                <div className="rounded-2xl bg-muted/40 border border-border p-3 space-y-2">
                  {section(<Quote className="size-3" />, `例句 · ${entry.examples.length} 条（点句子朗读）`)}
                  {entry.examples.slice(0, 3).map((ex, i) => (
                    <div key={i} className="cursor-pointer group/ex" onClick={() => onSpeak(ex.en)}>
                      <p className="text-sm text-foreground/85 italic font-medium group-hover/ex:text-ink-violet transition-colors">
                        {cleanText(ex.en)}
                      </p>
                      {ex.zh && <p className="text-xs text-muted-foreground mt-0.5">{cleanText(ex.zh)}</p>}
                    </div>
                  ))}
                </div>
              )}

              {entry.collocations.length > 0 && (
                <div className="space-y-1.5">
                  {section(<Link2 className="size-3" />, '常用搭配')}
                  <div className="flex flex-wrap gap-1.5">
                    {entry.collocations.slice(0, 8).map((c) => (
                      <span key={c} className="px-2 py-1 rounded-lg bg-[#6C5CE7]/8 text-[11px] font-bold text-foreground/80 cursor-pointer"
                        onClick={() => onSpeak(c)}>{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {entry.synonyms.length > 0 && (
                <div className="space-y-1.5">
                  {section(<Sparkles className="size-3" />, '近义 ≈')}
                  <div className="flex flex-wrap gap-1.5">
                    {entry.synonyms.slice(0, 8).map((s) => (
                      <span key={s} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {entry.antonyms.length > 0 && (
                <div className="space-y-1.5">
                  {section(<Sparkles className="size-3" />, '反义 ≠')}
                  <div className="flex flex-wrap gap-1.5">
                    {entry.antonyms.slice(0, 8).map((s) => (
                      <span key={s} className="px-2 py-1 rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-600 dark:text-rose-400">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {entry.wordFamily.length > 0 && (
                <div className="space-y-1.5">
                  {section(<Sparkles className="size-3" />, '词族')}
                  <div className="flex flex-wrap gap-1.5">
                    {entry.wordFamily.slice(0, 8).map((s) => (
                      <span key={s} className="px-2 py-1 rounded-lg bg-muted text-[11px] font-bold text-foreground/80">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {entry.deepExplanation && (
                <div className="space-y-1.5">
                  {section(<Sparkles className="size-3" />, '深度解释')}
                  <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">{cleanText(entry.deepExplanation)}</p>
                </div>
              )}

              {entry.examples.length === 0 && entry.collocations.length === 0 && !entry.deepExplanation && (
                <p className="text-[11px] font-bold text-muted-foreground/60 text-center py-2">
                  这个词条暂无例句/搭配/深度解释
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 词表里的一枚词片：[词（点开详情）] + [★ 收藏]。
 * 完成页、学习记录、收藏面板共用，保证"收藏"在快速闪卡各处长得一样、都在同一个位置。
 */
function WordChip({
  word, known, fav, onOpen, onToggleFav, tone = 'result',
}: {
  word: string;
  known?: boolean;
  fav: boolean;
  onOpen: () => void;
  onToggleFav: () => void;
  tone?: 'result' | 'plain';
}) {
  const toneCls = tone === 'plain'
    ? 'bg-muted text-foreground/80'
    : (known ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400');
  return (
    <span className={cn('inline-flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded-lg text-[11px] font-bold', toneCls)}>
      <button onClick={onOpen} className="hover:underline underline-offset-2" title={`查看「${word}」详情`}>
        {word}
      </button>
      <button
        onClick={onToggleFav}
        className={cn('p-0.5 rounded transition-colors', fav ? 'text-amber-500' : 'text-muted-foreground/50 hover:text-amber-500')}
        title={fav ? '取消收藏' : '收藏'}
      >
        <Star className={cn('size-3', fav && 'fill-amber-400 text-amber-400')} />
      </button>
    </span>
  );
}

/** 收藏面板：收藏的词集中看 / 朗读 / 取消 / **只练收藏的词** */
function FavoritesPanel({
  words, onDrill, onRemove, onSpeak, onOpen,
}: {
  words: IFavoriteItem[];
  onDrill: (words: string[]) => void;
  onRemove: (word: string) => void;
  onSpeak: (text: string) => void;
  onOpen: (word: string) => void;
}) {
  return (
    <div className="rounded-[28px] border-2 border-amber-200/60 bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Star className="size-3.5 fill-amber-400 text-amber-400" />
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          我的收藏 · {words.length} 词（与「收藏」页同源）
        </span>
        {words.length > 0 && (
          <button
            onClick={() => onDrill(words.map((w) => w.content))}
            className="ml-auto px-2.5 py-1 rounded-xl bg-amber-400/15 text-amber-600 text-[10px] font-black hover:bg-amber-400/25"
          >
            只练收藏的词
          </button>
        )}
      </div>
      {words.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 font-bold py-2">
          还没有收藏 —— 卡片上、词表里、词条详情里都能点 ★ 收藏，收藏的词还能单独成组重练。
        </p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto overscroll-contain">
          {words.map((w) => (
            <div key={w.id} className="flex items-center gap-2 p-2 rounded-xl border border-border/60">
              <button onClick={() => onSpeak(w.content)} className="shrink-0 text-muted-foreground hover:text-ink-teal" title="朗读">
                <Volume2 className="size-3.5" />
              </button>
              <button onClick={() => onOpen(w.content)} className="flex-1 min-w-0 text-left">
                <p className="text-[11px] font-black italic text-foreground truncate">{w.content}</p>
                {w.meaning && <p className="text-[10px] text-muted-foreground truncate">{w.meaning}</p>}
              </button>
              <button
                onClick={() => onRemove(w.content)}
                className="shrink-0 p-1 rounded-lg text-amber-500 hover:bg-amber-400/10"
                title="取消收藏"
              >
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 学习记录面板：每轮留档 → 回看词表 / 整组重练 / 只重练不认识的 */
function HistoryPanel({
  runs, pending, openRunId, setOpenRunId, onDrill, onRemove, isFav, onOpen, onToggleFav,
}: {
  runs: IQuickCardRun[];
  pending: IQuickCardPending | null;
  openRunId: string | null;
  setOpenRunId: (id: string | null) => void;
  onDrill: (run: IQuickCardRun, onlyUnknown?: boolean) => void;
  onRemove: (id: string) => void;
  isFav: (word: string) => boolean;
  onOpen: (word: string) => void;
  onToggleFav: (word: string) => void;
}) {
  const asRun = (words: IQuickCardWordResult[], id: string, at: number, size: number): IQuickCardRun => ({
    id, level: '', at, size,
    known: words.filter((w) => w.known).length,
    unknown: words.filter((w) => !w.known).length,
    words,
  });
  return (
    <div className="rounded-[28px] border-2 border-border bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <History className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          学习记录 · 最近 {runs.length} 轮
        </span>
      </div>

      {/* 当前累积：学完的词表按"选择的数量"切份，不足一份的余数先存在这里 */}
      {pending && pending.words.length > 0 && (
        <div className="rounded-2xl border border-dashed border-[#00B894]/50 bg-[#00B894]/5 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-ink-teal">
              当前累积 {pending.words.length}
              {pending.size > 0 ? `/${pending.size}` : ''} 词
            </span>
            <span className="text-[9px] font-bold text-muted-foreground">
              攒满 {pending.size > 0 ? `${pending.size} 个` : '一份'}就自动成为一条完整记录
            </span>
            <button
              onClick={() => onDrill(asRun(pending.words, 'pending', Date.now(), pending.size))}
              className="ml-auto shrink-0 px-2.5 py-1 rounded-xl bg-[#00B894]/10 text-ink-teal text-[10px] font-black hover:bg-[#00B894]/20"
            >
              重练这 {pending.words.length} 个
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pending.words.map((w, i) => (
              <WordChip
                key={`${w.word}-${i}`}
                word={w.word}
                known={w.known}
                fav={isFav(w.word)}
                onOpen={() => onOpen(w.word)}
                onToggleFav={() => onToggleFav(w.word)}
              />
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 font-bold py-2">
          还没有记录 —— 每学完一轮会自动按「选择的数量」把词表存成记录，方便下次重练。
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto overscroll-contain">
          {runs.map((r) => {
            const open = openRunId === r.id;
            const wrong = r.words.filter((w) => !w.known).length;
            const rate = r.words.length ? Math.round((r.known / r.words.length) * 100) : 0;
            return (
              <div key={r.id} className="rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2 p-2.5">
                  <button onClick={() => setOpenRunId(open ? null : r.id)} className="flex-1 text-left min-w-0">
                    <p className="text-[11px] font-black text-foreground truncate">
                      {new Date(r.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      <span className="ml-2 font-bold text-muted-foreground">
                        {r.words.length} 词 · 认识率 {rate}%
                      </span>
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground/80">
                      ✓{r.known} · ✗{wrong}
                    </p>
                  </button>
                  <button
                    onClick={() => onDrill(r)}
                    className="shrink-0 px-2.5 py-1.5 rounded-xl bg-[#00B894]/10 text-ink-teal text-[10px] font-black hover:bg-[#00B894]/20 flex items-center gap-1"
                  >
                    <RotateCcw className="size-3" />重练
                  </button>
                  {wrong > 0 && (
                    <button
                      onClick={() => onDrill(r, true)}
                      className="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-500/12 text-amber-600 text-[10px] font-black hover:bg-amber-500/20"
                    >
                      只练✗{wrong}
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(r.id)}
                    className="shrink-0 p-1.5 rounded-xl text-muted-foreground/60 hover:text-rose-500 hover:bg-rose-500/10"
                    title="删除这条记录"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <button onClick={() => setOpenRunId(open ? null : r.id)} className="shrink-0 p-1 rounded-lg text-muted-foreground/60">
                    {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                </div>
                {open && (
                  <div className="px-2.5 pb-2.5 flex flex-wrap gap-1.5">
                    {r.words.map((w, i) => (
                      <WordChip
                        key={`${w.word}-${i}`}
                        word={w.word}
                        known={w.known}
                        fav={isFav(w.word)}
                        onOpen={() => onOpen(w.word)}
                        onToggleFav={() => onToggleFav(w.word)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
