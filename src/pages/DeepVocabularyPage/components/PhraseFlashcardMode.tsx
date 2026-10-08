/**
 * PhraseFlashcardMode — 短语库闪卡（词汇深度页第 7 个模式，2026-10-09）。
 *
 * 逐条移植「复习检测」(FlashcardMode) 的会话逻辑与优化体验：SM-2 五档评分、
 * 冻结会话顺序、答错延迟重排、评分后 120/300ms 自动跳下一张（单批切换 + tween 0.18）、
 * 键盘（空格 / 1-5 / S / → / Esc）、滑动手势（decideSwipe）、自动发音（共用
 * `__nativethink_vocab_autospeak`，默认开）、断点续学、错词重练、「不再出现」（带撤销）。
 *
 * 与复习检测的**有意差异**（其余尽量逐行同构，改一边先想另一边）：
 *  ① 数据 = 9 个考试短语库（phrase-bank，懒加载 + 读取层去重），进度写 use-phrase-learning
 *     —— 与语块页「短语复习 / 闪卡」同一份存储，哪个入口学都算同一份 SM-2 进度；
 *  ② 空进度也能开一轮 —— 它就是短语的**学习入口**（补新到「每日目标」，档位即本轮张数）；
 *     复习检测要求「先有已学单词」是因为那边是纯复习模式（教新词由每日学习负责）；
 *  ③ 没有生词本 / 我的助记（词库侧概念，短语存储里没有对应物）；
 *     学习时长记 'chunks'（内容域是短语，与语块闪卡同口径）。
 * 零提示契约与三个练习模式同一条：只剩「失败 / 唯一撤销入口」白名单（verify-vocab-cards ⑧d）。
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import {
  Layers, RotateCw, Volume2, Sparkles, XCircle, ArrowLeft, ChevronLeft,
  BookOpen, Gauge, Flame, History, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { IChunk } from '@/data/chunks';
import { PHRASE_LEVELS, PHRASE_LEVEL_LABELS, loadPhrases, type PhraseLevel } from '@/data/phrase-bank';
import { dedupeChunks } from '@/lib/chunk-dedupe';
import {
  usePhraseLearning, savePhraseSession, loadPhraseSession, clearPhraseSession, type ISavedPhraseSession,
} from '@/lib/use-phrase-learning';
import { useLearningStats } from '@/lib/use-learning-stats';
import { usePageMemory } from '@/lib/use-page-memory';
import { useImmersive } from '@/lib/focus-mode';
import { safeStorage } from '@/lib/safe-storage';
import { useTTS } from '@/lib/use-tts';
import { sfxComplete } from '@/lib/sfx';
import { cn, cleanText } from '@/lib/utils';
import { decideSwipe, SWIPE_THRESHOLD, SWIPE_QUALITY_UNKNOWN, SWIPE_QUALITY_KNOWN } from '@/lib/vocab-swipe';
import { createSessionOrder, scheduleRelearn, nextIndex, forecastByDay, MAX_RELEARN, type ISessionOrder } from '@/lib/vocab-session';

/** 自动发音开关 —— 与词汇侧共用：一处关闭，处处安静（只有显式存过 '0' 才关） */
const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';

const isPhraseLevel = (v: string): v is PhraseLevel => (PHRASE_LEVELS as string[]).includes(v);

export default function PhraseFlashcardMode({ level }: { level?: string }) {
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const { addStudyMinutes } = useLearningStats();
  const tts = useTTS();

  /** 默认跟当前词书同级别（短语库与词书是同一套 key）；'all' 或脏值回退四级 */
  const defaultBank: PhraseLevel = level && isPhraseLevel(level) ? level : 'cet4';
  const [bankStored, setBank] = usePageMemory<string>('phrase-card-bank', defaultBank);
  const bank: PhraseLevel = isPhraseLevel(bankStored) ? bankStored : defaultBank;

  // ── 短语库数据（懒加载 + 读取层去重；重试用 reloadTick 重新触发同一个 effect）──
  const [entries, setEntries] = useState<IChunk[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankFailed, setBankFailed] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setBankLoading(true);
    setBankFailed(false);
    loadPhrases(bank).then((list) => {
      if (cancelled) return;
      // 映射成 IChunk 兼容对象，让存储/复习逻辑零改动（与语块页短语库同一映射口径）
      const mapped: IChunk[] = list.map((e, i) => ({
        id: `pbc_${bank}_${i}`,
        content: e.content,
        meaning: e.meaning || e.sourceWord,
        category: 'daily' as const,
        usage: `来源词：${e.sourceWord}`,
        example: e.exampleEn || '',
        exampleZh: e.exampleZh,
        difficulty: 'intermediate' as const,
      }));
      setEntries(dedupeChunks(mapped));
      setBankLoading(false);
    }).catch(() => {
      if (!cancelled) { setBankFailed(true); setBankLoading(false); setEntries([]); }
    });
    return () => { cancelled = true; };
  }, [bank, reloadTick]);

  const { state, dueForReview, recordReview, setSuspended, dailyQuota, setDailyQuota, phraseKey } = usePhraseLearning(entries);

  const [currentIdx, setIdx] = useState(0);
  /** 本轮会话：开始时**冻结**顺序（不能直接用依赖 state.progress 的 queue 配下标，每评一次分会漂） */
  const [session, setSession] = useState<ISessionOrder>(() => createSessionOrder([]));
  const [sessionEntries, setSessionEntries] = useState<IChunk[]>([]);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    // 默认**开**：主流背单词 App 出场即自动发音；只有用户显式关过（存 '0'）才保持关闭
    try { return safeStorage.getItem(AUTO_SPEAK_KEY) !== '0'; } catch { return true; }
  });
  const [sessionReviewCount, setSessionReviewCount] = useState(0);
  // 连对连击：连续 quality>=3 的计数，答错清零（即时正反馈）
  const [combo, setCombo] = useState(0);
  /** 已评分过的短语 key 集合 —— rated 由它派生：回看上一张时状态才不会错乱 */
  const [ratedKeys, setRatedKeys] = useState<Set<string>>(() => new Set());
  const [sessionRated, setSessionRated] = useState(0);
  const [sessionGood, setSessionGood] = useState(0);
  const [started, setStarted] = useState(false);
  const [wrongDrill, setWrongDrill] = useState(false);
  // 滑动位移（跟随手指）；>0 右滑=认识，<0 左滑=不认识
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);
  /** 本次访问中**刚**评分过的短语 key（区分"刚评完→自动跳"与"回看已评卡"） */
  const [ratedNow, setRatedNow] = useState<string | null>(null);
  /** 最近一次评分（决定自动跳转的停留时长）；用 ref 避免把它放进 effect 依赖 */
  const lastQualityRef = useRef(4);
  /** advance 的 ref 镜像：自动跳转的 effect 用它，避免 advance 每次重建导致定时器反复重置 */
  const advanceRef = useRef<(direction?: number) => void>(() => {});
  /**
   * 「答错待重排」的短语 key —— 评分时只记下，**等真正前进时再插回**。
   * 评分那一刻就同步重排会让 `session.order[currentIdx]` 就地换成下一张，
   * `justRated` 立即失效、自动跳转永远排不上（复习检测 2026-09-30 实测过的卡死坑）。
   */
  const pendingRelearnRef = useRef<string | null>(null);
  /**
   * 已经自动朗读过的 `${卡片下标}-${正反面}`。**每开一轮必须清空** ——
   * ref 不随重渲染归零，新一轮第一张的"0-front"会命中旧 key 被跳过（"第一张不读"的旧 bug）。
   */
  const lastSpokenKey = useRef('');
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const toggleAutoSpeak = useCallback(() => {
    // 持久化放在更新函数**外** —— StrictMode 下更新函数会被调用两次
    const next = !autoSpeak;
    setAutoSpeak(next);
    try { safeStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  }, [autoSpeak]);

  // 换库 = 换一本短语书：会话整体复位（ref 不随重渲染归零，必须显式清）
  useEffect(() => {
    setStarted(false); setWrongDrill(false);
    setIdx(0); setFlipped(false); setDir(0);
    setSession(createSessionOrder([]));
    setSessionEntries([]);
    setRatedKeys(new Set()); setRatedNow(null);
    setSessionRated(0); setSessionGood(0); setCombo(0);
    pendingRelearnRef.current = null;
    lastSpokenKey.current = '';
  }, [bank]);

  // ── 错词重练队列（答错过的短语，随机排序避免每轮顺序相同）──
  const wrongEntries = useMemo(() => {
    const out = entries.filter((c) => {
      const p = state.progress[phraseKey(c)];
      return !!p && (p.wrongCount || 0) > 0 && !p.suspended;
    });
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }, [entries, state.progress, phraseKey]);

  /**
   * 本轮队列 = 到期(≤30) + 已学未到期 + 补新到「每日目标」。
   * ① 「不再出现」的短语必须跳过（到期由 store 过滤，已学/补新在这里过滤）；
   * ② 与复习检测不同：**空进度也补新**（这是学习入口，见文件头差异 ②）；
   * ③ 补新目标吃 `dailyQuota`（概览档位）而不是写死 20 ——
   *    2026-10-09 用户要求「学习单词量要可调」：档位即本轮张数
   *    （到期/已学两支照旧参与，所以有复习量时总数可能大于档位，这是复习义务）。
   */
  const queue = useMemo(() => {
    if (wrongDrill) return wrongEntries;
    const MAX_DUE = 30;
    const seen = new Set<string>();
    const dueSet = new Set(dueForReview.map((p) => p.phraseKey));
    const dueCards: IChunk[] = [];
    for (const c of entries) {
      const k = phraseKey(c);
      if (!dueSet.has(k) || seen.has(k)) continue;
      seen.add(k);
      if (dueCards.length < MAX_DUE) dueCards.push(c);
    }
    const otherCards: IChunk[] = [];
    for (const c of entries) {
      const k = phraseKey(c);
      if (seen.has(k)) continue;
      const p = state.progress[k];
      if (p && !p.suspended) { seen.add(k); otherCards.push(c); }
    }
    const fillCount = Math.max(0, dailyQuota - dueCards.length - otherCards.length);
    const newCards: IChunk[] = [];
    if (fillCount > 0) {
      for (const c of entries) {
        if (newCards.length >= fillCount) break;
        const k = phraseKey(c);
        if (seen.has(k) || state.progress[k]) continue;
        seen.add(k); newCards.push(c);
      }
      // 新卡随机取样，否则每轮都从库里开头几条开始
      for (let i = newCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newCards[i], newCards[j]] = [newCards[j], newCards[i]];
      }
    }
    return [...dueCards, ...otherCards, ...newCards];
  }, [wrongDrill, wrongEntries, entries, dueForReview, state.progress, phraseKey, dailyQuota]);

  const cw = useMemo(() => {
    const k = session.order[currentIdx];
    if (!k) return undefined;
    return sessionEntries.find((c) => phraseKey(c) === k) ?? entries.find((c) => phraseKey(c) === k);
  }, [session.order, currentIdx, sessionEntries, entries, phraseKey]);
  useImmersive(started && !!cw);
  const currentKey = session.order[currentIdx];
  const rated = !!currentKey && ratedKeys.has(currentKey);
  const justRated = !!currentKey && ratedNow === currentKey;
  /** 回看：已评过、但不是本次刚评的（从「上一个」翻回来）—— 不出评分按钮、也不自动跳 */
  const viewingPast = rated && !justRated;
  // 换卡时清掉"刚评分"标记
  useEffect(() => { setRatedNow(null); }, [currentKey]);

  // ── 自动发音：会话预热前 5 张 → 首卡朗读零等待；翻面/换卡按 ${下标}-${面} 去重 ──
  useEffect(() => {
    if (!autoSpeak) return;
    sessionEntries.slice(0, 5).forEach((c, i) => {
      setTimeout(() => ttsRef.current.prewarm(c.content, { rate: 0.85 }), 120 * i);
    });
  }, [sessionEntries, autoSpeak]);
  useEffect(() => {
    if (!autoSpeak) return;
    const card = cw;
    if (!card) return;
    const side = isFlipped ? 'back' : 'front';
    const key = `${currentIdx}-${side}`;
    if (lastSpokenKey.current === key) return;
    lastSpokenKey.current = key;
    if (!isFlipped) {
      ttsRef.current.speak(card.content, { rate: 0.85 });
      const nk = session.order[currentIdx + 1];
      const next = nk ? entries.find((c) => phraseKey(c) === nk) : undefined;
      if (next) ttsRef.current.prewarm(next.content, { rate: 0.85 });
    } else {
      /**
       * 背面：短语 + 例句拼成**一次** speak 顺序播放 —— 拆成两次会互相打断
       * （speak() 开头 stopAudio，快速翻面时听感"只有句子"）。
       * 例句与短语文本完全一样时不重复读（短语库数据里大量 exampleEn === content）。
       */
      const example = card.example ? cleanText(card.example) : '';
      const same = !!example && example.trim().toLowerCase() === card.content.trim().toLowerCase();
      const text = example && !same ? `${card.content}. ${example}` : card.content;
      const timer = setTimeout(() => { ttsRef.current.speak(text, { rate: 0.85 }); }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoSpeak, currentIdx, isFlipped, cw, session.order, entries, phraseKey]);

  /** 本轮该短语已被重排几次（背面提示"本轮已重排 N 次"） */
  const relearnUsed = useCallback((content: string) => session.relearnCounts[content.toLowerCase()] ?? 0, [session.relearnCounts]);

  /** 未来 7 天到期预测（含今天逾期）—— 让用户对复习负担有预期（只统计当前库） */
  const bankKeys = useMemo(() => new Set(entries.map((c) => phraseKey(c))), [entries, phraseKey]);
  const forecast = useMemo(
    () => forecastByDay(Object.values(state.progress).filter((p) => !p.suspended && bankKeys.has(p.phraseKey)), 7),
    [state.progress, bankKeys],
  );

  /** 断点（概览里显示"接着上次"按钮）。用 state 而不是 useState 初值 —— 初值只在挂载时求值一次 */
  const [savedSession, setSavedSession] = useState<ISavedPhraseSession | null>(() => loadPhraseSession(bank));
  useEffect(() => { setSavedSession(loadPhraseSession(bank)); }, [bank, started, entries]);

  /** 本周学习量（最近 7 天，按天聚合 history；老数据没有 history 时全 0） */
  const weekHistory = useMemo(() => {
    const out: { date: string; label: string; count: number; good: number }[] = [];
    const d = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(d.getTime() - i * 86400000);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const h = state.history?.[key];
      out.push({ date: key, label: '日一二三四五六'[day.getDay()], count: h?.reviewed ?? 0, good: h?.good ?? 0 });
    }
    return out;
  }, [state.history]);
  const weekTotal = weekHistory.reduce((s, x) => s + x.count, 0);
  const weekGood = weekHistory.reduce((s, x) => s + x.good, 0);
  const weekAccuracy = weekTotal > 0 ? Math.round((weekGood / weekTotal) * 100) : 0;

  const stats = useMemo(() => {
    let mastered = 0, learning = 0, startedInBank = 0;
    for (const [k, p] of Object.entries(state.progress)) {
      if (!bankKeys.has(k)) continue;
      startedInBank++;
      if (p.status === 'mastered') mastered++;
      else if (p.status === 'reviewing' || p.status === 'learning') learning++;
    }
    const dueInBank = dueForReview.filter((p) => bankKeys.has(p.phraseKey)).length;
    return { mastered, learning, new: Math.max(0, entries.length - startedInBank), total: entries.length, due: dueInBank };
  }, [state.progress, bankKeys, dueForReview, entries.length]);

  /** 当前库被「不再出现」屏蔽的条数（恢复出口只作用于本库，与计数同一口径） */
  const suspendedInBank = useMemo(
    () => entries.filter((c) => state.progress[phraseKey(c)]?.suspended).length,
    [entries, state.progress, phraseKey],
  );

  /** 恢复所有被「不再出现」屏蔽的短语（不弹提示：旁边计数会当场归零） */
  const restoreSuspended = useCallback(() => {
    for (const c of entries) {
      if (state.progress[phraseKey(c)]?.suspended) setSuspended(c, false);
    }
  }, [entries, state.progress, setSuspended, phraseKey]);

  const flip = useCallback(() => { setFlipped((f) => { if (!f) addStudyMinutes(0.2, 'chunks'); return !f; }); }, [addStudyMinutes]);

  const markWithQuality = useCallback((quality: number) => {
    if (!cw || rated) return;
    recordReview(cw, quality);
    lastQualityRef.current = quality;
    setSessionReviewCount((p) => p + 1);
    setSessionRated((p) => p + 1);
    if (quality >= 3) {
      setSessionGood((p) => p + 1);
      // 连击：连续答对累加，每 5 连给一次音效反馈（提示音在提示音白名单外——声音不是弹窗）
      const next = combo + 1;
      setCombo(next);
      if (next > 0 && next % 5 === 0) sfxComplete();
    } else {
      setCombo(0);
    }
    setRatedKeys((prev) => new Set(prev).add(phraseKey(cw)));
    setRatedNow(phraseKey(cw));
    // 答错重排：先记下，等 advance 时再插回（见 pendingRelearnRef 注释）
    if (quality <= 2) {
      const key = phraseKey(cw);
      if ((session.relearnCounts[key] ?? 0) < MAX_RELEARN) pendingRelearnRef.current = key;
    }
  }, [cw, rated, recordReview, session.relearnCounts, combo, phraseKey]);

  /**
   * 前后翻卡。
   *  - 向前：按会话顺序推进；到队尾则本轮结束并回到开头。
   *  - 向后（direction < 0）：回到上一张并**直接翻到背面**（用户点"上一个"就是为了看释义）。
   */
  const advance = useCallback((direction = 1) => {
    if (direction < 0) {
      setDir(-1); setFlipped(true);
      setIdx((p) => Math.max(0, p - 1));
      return;
    }
    setDir(direction); setFlipped(false);
    // 前进时才把"答错待重排"的短语插回队列（为什么不能提前到评分那一刻：见 pendingRelearnRef）。
    // 重排把它从 currentIdx 抽走再插到 +RELEARN_GAP 处，原顺序的下一张移到 currentIdx ——
    // 所以 applies 时 `setIdx(currentIdx)`（下标不动）本身就是"前进到下一张"。
    const pending = pendingRelearnRef.current;
    const applies = pending !== null && pending === session.order[currentIdx];
    if (applies) {
      pendingRelearnRef.current = null;
      setSession(scheduleRelearn(session, currentIdx, pending));
    }
    const next = nextIndex(session, currentIdx);
    if (next === null) {
      // 走到队尾：本轮结束，回开头再来一轮（重排插入的短语也已经消费完）。
      // 不弹提示（练习界面零提示口径）——"练完一轮"由界面自己说：卡面序号回到 1/N、
      // 顶部「已评」继续累加、进度条走满；音效保留（那是声音，不是弹窗）。
      sfxComplete();
      setIdx(0);
      return;
    }
    setIdx(applies ? currentIdx : next);
  }, [session, currentIdx]);
  advanceRef.current = advance;

  /**
   * 评分后**自动**进入下一张（主流背单词 App 的换卡节奏）。
   * 停留只作"这一下点到了"的即时确认（答错稍久）：120/300ms + 定长 tween 退场（0.18s），
   * 与复习检测/快速闪卡同一条曲线；想更快按空格 / → / 滑动即可立刻跳。
   */
  useEffect(() => {
    if (!started || !justRated) return;
    const delay = lastQualityRef.current >= 3 ? 120 : 300;
    const t = setTimeout(() => advanceRef.current(1), delay);
    return () => clearTimeout(t);
  }, [started, justRated, currentKey]);

  /** 开启一轮学习：把当时的队列**冻结**成会话顺序（此后评分不再改变本轮的出卡顺序） */
  const startSession = useCallback((list: IChunk[]) => {
    setSessionEntries(list);
    setSession(createSessionOrder(list.map((c) => phraseKey(c))));
    setIdx(0); setFlipped(false); setDir(0);
    setRatedKeys(new Set()); setRatedNow(null);   // 必须清空：否则新一轮里这些卡会被当成"已评"
    setSessionRated(0); setSessionGood(0);
    setCombo(0);
    clearPhraseSession(bank); // 新开一轮就丢掉旧断点
    lastSpokenKey.current = '';  // 新一轮必须忘掉上一轮的朗读记录，否则第一张卡不出声
    pendingRelearnRef.current = null;  // 上一轮没消费完的"待重排"不跨轮
    setStarted(true);
  }, [bank, phraseKey]);

  /** 断点续学：恢复上次没读完的那一轮（顺序与位置都还原） */
  const resumeSession = useCallback(() => {
    const saved = loadPhraseSession(bank);
    if (!saved) return;
    const resolved: IChunk[] = [];
    const missing: string[] = [];
    for (const k of saved.order) {
      const c = entries.find((x) => phraseKey(x) === k);
      if (c) resolved.push(c); else missing.push(k);
    }
    if (!resolved.length) { clearPhraseSession(bank); toast.info('上次的进度已失效，请重新开始'); return; }
    const order = saved.order.filter((k) => !missing.includes(k));
    const idx = Math.max(0, Math.min(saved.index, order.length - 1));
    setSessionEntries(resolved);
    setSession({ order, relearnCounts: {} });
    setIdx(idx);
    setFlipped(false); setDir(0);
    setRatedKeys(new Set()); setRatedNow(null);
    setSessionRated(0); setSessionGood(0); setCombo(0);
    lastSpokenKey.current = '';  // 同上：恢复的那一轮也要从第一张卡正常出声
    pendingRelearnRef.current = null;  // 断点里不保存"待重排"，续学从干净状态开始
    setStarted(true);
  }, [bank, entries, phraseKey]);

  /** 本轮断点（顺序 + 当前位置）—— 中途退出后仍可续学 */
  useEffect(() => {
    if (!started || !session.order.length) return;
    savePhraseSession(bank, { order: session.order, index: currentIdx, savedAt: Date.now() });
  }, [started, bank, session.order, currentIdx]);

  /** 已会/不感兴趣 → 屏蔽该短语，并从本轮移除 */
  const suspendCurrent = useCallback(() => {
    if (!cw) return;
    const card = cw;
    const key = phraseKey(card);
    // 屏蔽的短语若正处在"答错待重排"，这张待办必须一起撤销 —— 否则下次前进会把它插回队里
    if (pendingRelearnRef.current === key) pendingRelearnRef.current = null;
    setSuspended(card, true);
    const removed = session.order.filter((k) => k !== key);
    setSession({ order: removed, relearnCounts: session.relearnCounts });
    setIdx(Math.min(currentIdx, Math.max(0, removed.length - 1)));
    setFlipped(false);
    toast.success(`已把「${card.content}」移出学习队列`, {
      duration: 5000,
      action: { label: '撤销', onClick: () => setSuspended(card, false) },
    });
  }, [cw, session, currentIdx, setSuspended, phraseKey]);

  // ── 全键盘操作：空格翻面/默认好评，1-5 评分，→ 下一个，S 开关自动发音 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || !cw) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!started) { if (e.code === 'Space') { e.preventDefault(); startSession(queue); } return; }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped) flip();
        else if (rated) advance();
        else markWithQuality(4);
      } else if (isFlipped && !rated && ['1', '2', '3', '4', '5'].includes(e.key)) {
        markWithQuality([0, 2, 3, 4, 5][parseInt(e.key, 10) - 1]);
      } else if (e.key === 'ArrowRight' && rated) {
        advance();
      } else if (e.key.toLowerCase() === 's' && !isFlipped) {
        toggleAutoSpeak();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cw, isFlipped, rated, started, flip, advance, markWithQuality, toggleAutoSpeak, startSession, queue]);

  // 专注模式下 ESC 退出到概览
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setStarted(false); setWrongDrill(false); setIdx(0); setFlipped(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started]);

  // ── 滑动手势：未翻面→翻面；已翻面未评分→左滑不认识 / 右滑认识；已评分→切换上一张/下一张 ──
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current == null) return;
    setDragX(e.touches[0].clientX - dragStart.current);
  };
  const onTouchEnd = () => {
    const dx = dragX;
    dragStart.current = null;
    setDragX(0);
    const action = decideSwipe({ dx, isFlipped, rated });
    if (action === 'none') return;
    if (action === 'flip') { flip(); return; }
    if (action === 'next') { advance(1); return; }
    if (action === 'prev') { advance(-1); return; }
    markWithQuality(action === 'rate-unknown' ? SWIPE_QUALITY_UNKNOWN : SWIPE_QUALITY_KNOWN);
  };

  // ── 概览：标题 + 选库 + 统计 + 开始/续学 ──
  if (!started || !cw) {
    const masteredPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
    const learningPct = stats.total > 0 ? Math.round((stats.learning / stats.total) * 100) : 0;
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-[#14B8A6]/10 flex items-center justify-center text-ink-teal">
              <Layers className="size-4.5" />
            </div>
            {/* 不重复页面 H1「短语闪卡」——沉浸态标题已在顶部，重复只会在小屏叠成两行 */}
            <div>
              <p className="text-[11px] font-black italic text-foreground">SM-2 间隔记忆 · 九个考试短语库</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" onClick={toggleAutoSpeak}
              className={cn('rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5',
                autoSpeak ? 'border-[#14B8A6]/40 text-ink-teal bg-[#14B8A6]/5' : 'border-border text-muted-foreground')}
              title="自动发音（快捷键 S）"
            >
              <Volume2 className="size-3.5" />自动发音{autoSpeak ? '·开' : '·关'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setWrongDrill(true); startSession(wrongEntries); }}
              disabled={wrongEntries.length === 0}
              className="rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5 border-border hover:border-rose-300 hover:text-rose-500"
            >
              <XCircle className="size-3.5" />
              错词重练 ({wrongEntries.length})
            </Button>
          </div>
        </div>

        {/* 短语库选择（懒加载：只加载选中的那本） */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground flex items-center gap-1"><Layers className="size-3" />短语库</span>
            <span className="text-muted-foreground/80 normal-case font-bold">
              {bankLoading ? '加载中…' : `${entries.length.toLocaleString()} 条`}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {PHRASE_LEVELS.map((lv) => (
              <button
                key={lv}
                onClick={() => setBank(lv)}
                className={cn(
                  'px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all border',
                  bank === lv ? 'border-[#14B8A6] text-ink-teal bg-[#14B8A6]/10' : 'border-border text-muted-foreground hover:border-[#14B8A6]/40',
                )}
              >
                {PHRASE_LEVEL_LABELS[lv]}
              </button>
            ))}
          </div>
          {bankFailed && (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-[9px] font-bold text-rose-500">短语库加载失败</span>
              <button onClick={() => setReloadTick((t) => t + 1)}
                className="text-[9px] font-black uppercase tracking-wider text-ink-teal hover:text-[#0d9488]">
                重试
              </button>
            </div>
          )}
        </div>

        {/* SM-2 Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-100 text-center">
            <p className="text-lg font-black text-rose-500">{stats.due}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-rose-600">待复习</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100 text-center">
            <p className="text-lg font-black text-ink-teal">{stats.mastered}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-emerald-600">已掌握</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100 text-center">
            <p className="text-lg font-black text-amber-500">{stats.learning}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-amber-600">学习中</p>
          </div>
          <div className="p-2.5 rounded-xl bg-[#14B8A6]/5 border border-[#14B8A6]/10 text-center">
            <p className="text-lg font-black text-ink-teal">{sessionReviewCount}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-ink-teal/70">本次学习</p>
          </div>
        </div>

        {/* 短语库掌握度分布 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground flex items-center gap-1"><Gauge className="size-3" />短语库掌握度</span>
            <span className="text-ink-teal tabular-nums">{masteredPct}%</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden bg-muted flex">
            <div className="h-full bg-[#14B8A6] transition-all" style={{ width: `${masteredPct}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${learningPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[9px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-[#14B8A6] inline-block" />已掌握 {stats.mastered}</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-amber-400 inline-block" />学习中 {stats.learning}</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-muted-foreground/30 inline-block" />未学 {stats.new}</span>
            <span className="ml-auto">共 {stats.total.toLocaleString()}</span>
          </div>
        </div>

        {/* 未来 7 天复习负担 + 已屏蔽出口（图表容器高度须容下「数值+柱+星期」三层，勿压回 h-12） */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground">未来 7 天复习量</span>
            <span className="text-muted-foreground/80 normal-case font-bold">
              明天 {forecast[1] ?? 0} 条
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-[72px]">
            {forecast.map((n, i) => {
              const max = Math.max(1, ...forecast);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${i === 0 ? '今天（含逾期）' : `${i} 天后`}：${n} 条`}>
                  <span className="text-[8px] font-black tabular-nums text-muted-foreground">{n || ''}</span>
                  <div className={cn('w-full rounded-t-md transition-all', i === 0 ? 'bg-rose-400' : 'bg-[#14B8A6]/60')}
                    style={{ height: `${Math.max(2, (n / max) * 34)}px` }} />
                  <span className="text-[8px] font-bold text-muted-foreground/70">{i === 0 ? '今' : i}</span>
                </div>
              );
            })}
          </div>
          {suspendedInBank > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-[9px] font-bold text-muted-foreground">已屏蔽（不再出现）{suspendedInBank} 条</span>
              <button onClick={restoreSuspended}
                className="text-[9px] font-black uppercase tracking-wider text-ink-teal hover:text-[#0d9488]">
                恢复全部
              </button>
            </div>
          )}
        </div>

        {/* 每日目标 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">每日目标</span>
            <span className="text-[9px] font-bold text-muted-foreground/80">今天新学 {state.todayLearned.length}/{dailyQuota}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} onClick={() => setDailyQuota(n)}
                className={cn('flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all border',
                  dailyQuota === n ? 'border-[#14B8A6] text-ink-teal bg-[#14B8A6]/10' : 'border-border text-muted-foreground hover:border-[#14B8A6]/40')}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* 本周学习量（来自 history，跨天可回溯） */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground">本周学习量</span>
            <span className="text-muted-foreground/80 normal-case font-bold">
              共 {weekTotal} 次{weekTotal > 0 && ` · 记得 ${weekAccuracy}%`}
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-[72px]">
            {weekHistory.map((d, i) => {
              const max = Math.max(1, ...weekHistory.map((x) => x.count));
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}：复习 ${d.count} 次`}>
                  <span className="text-[8px] font-black tabular-nums text-muted-foreground">{d.count || ''}</span>
                  <div className={cn('w-full rounded-t-md transition-all',
                    i === weekHistory.length - 1 ? 'bg-[#14B8A6]' : 'bg-muted-foreground/30')}
                    style={{ height: `${Math.max(2, (d.count / max) * 34)}px` }} />
                  <span className="text-[8px] font-bold text-muted-foreground/70">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center gap-2 pt-2 flex-wrap">
          <Button
            onClick={() => { setWrongDrill(false); startSession(queue); }}
            disabled={queue.length === 0 || bankLoading}
            className="bg-[#14B8A6] hover:bg-[#0d9488] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-teal-200/50 gap-2"
          >
            {bankLoading ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
            {bankLoading ? '短语库加载中…' : `开始学习（${queue.length} 张卡片）`}
          </Button>
          {/* 断点续学：上次没读完的那一轮 */}
          {savedSession && (
            <Button
              variant="outline" onClick={resumeSession}
              disabled={bankLoading || entries.length === 0}
              className="rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-wider gap-2 border-[#14B8A6]/40 text-ink-teal"
              title="恢复上次的顺序与位置"
            >
              <History className="size-4" />接着上次（还剩 {Math.max(0, savedSession.order.length - savedSession.index)} 张）
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── 学习中 ──
  const accuracy = sessionRated > 0 ? Math.round((sessionGood / sessionRated) * 100) : 0;
  const progressPct = session.order.length > 0 ? Math.round((sessionRated / session.order.length) * 100) : 0;
  const swipeHint = Math.abs(dragX) < SWIPE_THRESHOLD ? null : (dragX < 0 ? 'left' : 'right');
  const cwProgress = state.progress[cw.content.toLowerCase()];
  return (
    <div className="space-y-4">
      {/* 学习中头部：返回 + 本轮进度条 + 正确率 */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { setStarted(false); setWrongDrill(false); setIdx(0); setFlipped(false); }}
          className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-teal"
          title="返回概览"
        >
          <ArrowLeft className="size-5" />
        </Button>
        {wrongDrill && (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black bg-rose-500/10 text-rose-500 border-0">
            错词重练中
          </Badge>
        )}
        {viewingPast && (
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black bg-[#14B8A6]/10 text-ink-teal border-0">
            回看第 {currentIdx + 1} 张
          </Badge>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-[#14B8A6] transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
            <span className="tabular-nums">{currentIdx + 1}/{session.order.length}</span>
            <span className="tabular-nums">已评 {sessionRated}</span>
            {sessionRated > 0 && <span className={cn('tabular-nums', accuracy >= 70 ? 'text-emerald-600' : 'text-amber-600')}>记得 {accuracy}%</span>}
            {combo >= 3 && (
              <span className="flex items-center gap-0.5 text-amber-500 tabular-nums animate-pulse" title="连续答对">
                <Flame className="size-3" />连对 {combo}
              </span>
            )}
          </div>
        </div>
        {/* 上一个短语 —— 回看刚看过的短语的具体信息（右滑也可以） */}
        <Button
          variant="ghost" size="icon" onClick={() => advance(-1)} disabled={currentIdx === 0}
          className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-teal disabled:opacity-30"
          title="上一个短语（查看它的具体信息）· 右滑也可以"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="ghost" size="icon" onClick={toggleAutoSpeak}
          className={cn('rounded-xl size-9 shrink-0', autoSpeak ? 'text-ink-teal' : 'text-muted-foreground/60')}
          title={`自动发音${autoSpeak ? '（已开）' : '（已关）'} · 快捷键 S`}
        >
          <Volume2 className="size-4.5" />
        </Button>
      </div>

      {/* Flashcard（退场必须定长 tween 0.18s —— mode="wait" 下 spring 要衰减到亚像素，
          实测退场 ~400ms，是"下一张来得慢"的来源；与复习检测/快速闪卡同一曲线） */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          <MotionDiv key={cw.content + (isFlipped ? '-back' : '-front')}
            initial={{ opacity: 0, x: dir * 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 100 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-sm"
          >
            <div
              className="relative touch-pan-y"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)`, transition: dragStart.current == null ? 'transform 200ms ease' : 'none' }}
            >
              {/* 滑动方向提示（左=不认识，右=认识） */}
              {swipeHint && (
                <div className={cn('absolute inset-0 z-10 rounded-[32px] border-2 flex items-center justify-center pointer-events-none',
                  swipeHint === 'left' ? 'border-rose-400 bg-rose-500/10' : 'border-emerald-400 bg-emerald-500/10')}>
                  <span className={cn('text-lg font-black uppercase tracking-wider', swipeHint === 'left' ? 'text-rose-500' : 'text-emerald-600')}>
                    {swipeHint === 'left' ? '不认识' : '认识'}
                  </span>
                </div>
              )}
              <Card
                className={cn('rounded-[32px] border-2 shadow-xl transition-all cursor-pointer',
                  isFlipped
                    ? 'border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-500/10 dark:to-cyan-500/10 max-h-[62vh] overflow-y-auto'
                    : 'border-border bg-card min-h-[260px] flex flex-col justify-center')}
                onClick={() => { if (Math.abs(dragX) < SWIPE_THRESHOLD) flip(); }}
              >
                <CardContent className={cn('p-7 text-center', isFlipped && 'text-left')}>
                  {!isFlipped ? (
                    <>
                      <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-4">
                        {currentIdx + 1} / {session.order.length}
                        {cwProgress && (
                          <span className="ml-1.5 text-ink-teal">
                            · {cwProgress.status === 'mastered' ? '已掌握' : '复习中'}
                          </span>
                        )}
                      </Badge>
                      {/* 短语按长度三档字号（比单词短——上限收到 4xl 以内，长短语可折行不硬缩） */}
                      <div data-fit-box className="flex items-center justify-center gap-3 mb-2 max-w-full">
                        <h2 className={cn(
                          'font-black italic text-foreground tracking-tight break-words min-w-0',
                          cw.content.length > 24 ? 'text-xl sm:text-2xl' : cw.content.length > 14 ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl',
                        )}>{cw.content}</h2>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); try { tts.speak(cw.content, { rate: 0.9 }); } catch { /* ignore */ } }}
                          className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-teal"><Volume2 className="size-5" /></Button>
                      </div>
                      <p className="text-sm font-bold text-ink-teal mb-1">{PHRASE_LEVEL_LABELS[bank]}短语库</p>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">
                        <Sparkles className="size-3.5 inline mr-1 text-ink-teal" />点击翻转查看释义
                      </p>
                      <p className="text-[9px] text-muted-foreground/70 font-bold mt-1.5">手机：左右滑动 · 键盘：空格 / 1-5 / S</p>
                    </>
                  ) : (
                    <div className="space-y-3.5">
                      {/* 短语 + 发音 + 来源词 */}
                      <div className="text-center">
                        <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-teal-100 dark:bg-teal-500/20 text-ink-teal">
                          {cw.usage}
                        </Badge>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <p className="text-lg font-black text-foreground">{cw.content}</p>
                          <button onClick={(e) => { e.stopPropagation(); try { tts.speak(cw.content, { rate: 0.9 }); } catch { /* ignore */ } }}
                            className="text-muted-foreground hover:text-ink-teal"><Volume2 className="size-4" /></button>
                        </div>
                        <p className="text-lg font-black text-foreground mt-2">{cw.meaning}</p>
                      </div>

                      {/* 例句 —— 点英文可再听一遍 */}
                      {cw.example && (
                        <div className="rounded-2xl bg-white/60 dark:bg-foreground/10 border border-teal-100 p-3 space-y-1.5">
                          <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                            <BookOpen className="size-3" />例句（点句子朗读）
                          </p>
                          <div
                            className="cursor-pointer group/ex"
                            onClick={(e) => { e.stopPropagation(); try { tts.speak(cleanText(cw.example), { rate: 0.85 }); } catch { /* ignore */ } }}
                          >
                            <p className="text-sm text-foreground/85 italic font-medium group-hover/ex:text-ink-teal transition-colors">
                              {cleanText(cw.example)}
                            </p>
                            {cw.exampleZh && <p className="text-xs text-muted-foreground mt-0.5">{cleanText(cw.exampleZh)}</p>}
                          </div>
                        </div>
                      )}

                      {/* 记忆状态与出口 —— 让用户知道"为什么还会再看到它"，并给一个「别再来烦我」的出口 */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-teal-100/70">
                        <div className="text-[9px] font-bold text-muted-foreground">
                          {rated && cwProgress
                            ? `下次复习：${cwProgress.interval} 天后 · 间隔 ${cwProgress.interval}d`
                            : (cwProgress
                              ? `当前间隔 ${cwProgress.interval} 天`
                              : '首次学习 · 答对后 1 天再见')}
                          {relearnUsed(cw.content) > 0 && ` · 本轮已重排 ${relearnUsed(cw.content)} 次`}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); suspendCurrent(); }}
                          className="shrink-0 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="已会 / 不感兴趣 —— 从学习队列移除（可撤销）"
                        >
                          不再出现
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </MotionDiv>
        </AnimatePresence>
      </div>

      {/* SM-2 Quality rating */}
      {isFlipped && !rated && !viewingPast && (
        <div className="flex justify-center gap-2 flex-wrap">
          {[
            { q: 0, label: '完全忘了', color: 'bg-rose-500 hover:bg-rose-600' },
            { q: 2, label: '有点印象', color: 'bg-orange-500 hover:bg-orange-600' },
            { q: 3, label: '基本记得', color: 'bg-amber-500 hover:bg-amber-600' },
            { q: 4, label: '比较熟悉', color: 'bg-emerald-500 hover:bg-emerald-600' },
            { q: 5, label: '完全掌握', color: 'bg-[#14B8A6] hover:bg-[#0d9488]' },
          ].map(({ q, label, color }, i) => (
            <button key={q} onClick={() => markWithQuality(q)}
              className={cn('relative px-3 py-2 rounded-2xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-all hover:scale-105', color)}>
              {label}
              <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-black/25 text-[8px] font-black flex items-center justify-center">{i + 1}</span>
            </button>
          ))}
          <span className="w-full text-center text-[9px] text-muted-foreground font-bold mt-1">
            手机：左滑不认识 / 右滑认识 · 键盘：空格 翻面 / 1-5 评分 · 评完自动跳下一个
          </span>
        </div>
      )}
      {/* 评分后不再有「下一个」按钮：点完熟悉程度就自动翻页，这里只是"点到了"的一闪 */}
      {rated && !viewingPast && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
            <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
            即将进入下一张…
          </span>
        </div>
      )}
      {/* 回看态（含答错重排再现的那张）必须有可见的继续出口 */}
      {viewingPast && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
            已评过的卡 · 滑动 / 按 → 继续
          </span>
        </div>
      )}
    </div>
  );
}
