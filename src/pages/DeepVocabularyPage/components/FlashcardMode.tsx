import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useFramerMotion } from '@/lib/lazy-framer-motion';
import {
  RotateCw, Volume2, Sparkles, XCircle, ArrowLeft, ChevronLeft, ChevronDown, ChevronUp,
  Link2, BookOpen, Gauge, Flame, PenLine, History,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { IWordEntry } from '@/data/wordbank/schema';
import { findWord, getWordCounts, getTotalLearnableCount, preloadDetail } from '@/data/wordbank';
import { useWordLearning, saveSession, loadSession, clearSession, type ISavedSession } from '@/lib/use-word-learning';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useImmersive } from '@/lib/focus-mode';
import { FitWord } from '@/components/FitWord';
import { safeStorage } from '@/lib/safe-storage';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import { useTTS } from '@/lib/use-tts';
import { sfxComplete } from '@/lib/sfx';
import { decideSwipe, SWIPE_THRESHOLD, SWIPE_QUALITY_UNKNOWN, SWIPE_QUALITY_KNOWN } from '@/lib/vocab-swipe';
import { createSessionOrder, scheduleRelearn, nextIndex, forecastByDay, MAX_RELEARN, type ISessionOrder } from '@/lib/vocab-session';
import { useCustomWords, toWordEntry } from '@/lib/custom-words';
import { useWordNote, countWordNotes } from '@/lib/word-notes';

const FL_LEVEL_COLORS: Record<string, string> = {
  all: '#00B894', zhongkao: '#EF4444', gaokao: '#F97316', cet4: '#0EA5E9', cet6: '#6C5CE7', ielts: '#F59E0B', toefl: '#EC4899', postgraduate: '#8B5CF6', professional: '#14B8A6', advanced: '#64748B',
};

/** 自动发音开关（持久化；此前 autoSpeak 恒为 false，预合成/自动朗读整段是死代码） */
const AUTO_SPEAK_KEY = '__nativethink_vocab_autospeak';

interface LevelInfo { key: string; label: string; }

/** 背面信息分区标题（模仿主流背单词 App 的信息层次） */
function SectionTitle({ icon: Icon, children }: { icon?: typeof BookOpen; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
      {Icon && <Icon className="size-3" />}{children}
    </p>
  );
}

export default function FlashcardMode({ level, onLevelChange, levels, counts }: { level?: string; onLevelChange?: (key: string) => void; levels?: LevelInfo[]; counts?: Record<string, number> }) {
  const { LazyMotionDiv: MotionDiv, LazyAnimatePresence: AnimatePresence } = useFramerMotion();
  const currentLevel = level || 'all';
  const { addStudyMinutes } = useLearningStats();
  const { state, dueForReview, getNewWords, recordReview, setSuspended, suspendedCount, dailyQuota, setDailyQuota } = useWordLearning(currentLevel);
  // 生词本：阅读里收集、词库未收录的词（进度走独立的 'custom' 一路）
  const { words: customList, remove: removeCustom } = useCustomWords();
  const tts = useTTS();

  const [currentIdx, setIdx] = useState(0);
  /**
   * 本轮会话：**开始时冻结**顺序（原先直接用依赖 state.progress 的 queue 配下标，
   * 每评一次分 queue 就重算，会话中途顺序会漂）。答错的词按 RELEARN_GAP 重新插回队尾方向。
   */
  const [session, setSession] = useState<ISessionOrder>(() => createSessionOrder([]));
  const [sessionEntries, setSessionEntries] = useState<IWordEntry[]>([]);
  const [isFlipped, setFlipped] = useState(false);
  const [dir, setDir] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    // 默认**开**：主流背单词 App 出场即自动发音。此前默认关，用户感知就是"没有自动朗读功能"。
    // 只有用户显式关过（存 '0'）才保持关闭。
    try { return safeStorage.getItem(AUTO_SPEAK_KEY) !== '0'; } catch { return true; }
  });
  const [sessionReviewCount, setSessionReviewCount] = useState(0);
  // 连对连击：连续 quality>=3 的计数，答错清零（即时正反馈）
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  /** 已评分过的词集合（按 key）—— rated 由它派生：回看上一张时状态才不会错乱 */
  const [ratedKeys, setRatedKeys] = useState<Set<string>>(() => new Set());
  // 本轮统计：已评分张数 / 其中记得的（quality>=3）—— 用于顶部进度条与正确率
  const [sessionRated, setSessionRated] = useState(0);
  const [sessionGood, setSessionGood] = useState(0);
  const [showDeep, setShowDeep] = useState(false);
  // 滑动位移（跟随手指）；>0 右滑=认识，<0 左滑=不认识
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);
  const [detailTick, setDetailTick] = useState(0);
  const [showCustom, setShowCustom] = useState(false);
  // 助记：按当前词读写（useWordNote 内部订阅变更）
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const toggleAutoSpeak = useCallback(() => {
    // 持久化/提示放在更新函数**外** —— StrictMode 下更新函数会被调用两次，会双弹提示
    const next = !autoSpeak;
    setAutoSpeak(next);
    try { safeStorage.setItem(AUTO_SPEAK_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  }, [autoSpeak]);

  const allCounts = useMemo(() => getWordCounts(), []);
  // 「全部」用按词去重的总数（一词一张卡，跨书不重复）；单本词书用该书的池子
  const totalForLevel = currentLevel === 'all' ? getTotalLearnableCount() : (allCounts[currentLevel] || 0);

  // ── 错词重练队列 ──
  const [wrongDrill, setWrongDrill] = useState(false);
  const [started, setStarted] = useState(false); // 概览 vs 学习中
  const wrongEntries = useMemo(() => {
    const out: IWordEntry[] = [];
    for (const [key, p] of Object.entries(state.progress)) {
      if ((p.wrongCount || 0) > 0) {
        const w = findWord(key);
        if (w) out.push(w);
      }
    }
    // 随机排序，避免每次重练顺序相同
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }, [state.progress]);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    if (wrongDrill) return wrongEntries;
    const dueWords: IWordEntry[] = [];
    for (const p of dueForReview) {
      const w = findWord(p.wordKey);
      if (w && !seen.has(w.word.toLowerCase())) {
        seen.add(w.word.toLowerCase());
        dueWords.push(w);
      }
    }
    // 复习减负：到期堆积过多时本轮只取前 30 个，避免心理压力
    const MAX_DUE = 30;
    const cappedDue = dueWords.slice(0, MAX_DUE);
    const otherWords: IWordEntry[] = [];
    for (const key of Object.keys(state.progress)) {
      // 屏蔽（不再出现）的词**必须**跳过 —— 此前只滤了 dueForReview，
      // 屏蔽过的词以"其他已学词"身份每轮照常出卡，屏蔽承诺失效
      if (state.progress[key].suspended) continue;
      if (!seen.has(key)) {
        const w = findWord(key);
        if (w) { seen.add(key); otherWords.push(w); }
      }
    }
    // Only add new words if there are no due or learning words
    // This prevents random word switching when user hasn't learned anything yet
    if (dueWords.length === 0 && otherWords.length === 0) {
      return []; // Return empty queue - show "no words to review" message
    }
    // Otherwise, fill with new words to reach 20 cards
    const fillCount = Math.max(0, 20 - cappedDue.length - otherWords.length);
    // 生词本的词优先排进来（它们来自用户真实阅读，意愿最强）
    const customEntries = customList.map(toWordEntry).filter((w) => !seen.has(w.word.toLowerCase()) && state.progress[w.word.toLowerCase()]);
    customEntries.forEach((w) => seen.add(w.word.toLowerCase()));
    const newWords = fillCount > 0 ? getNewWords(fillCount).filter((w) => !seen.has(w.word.toLowerCase())) : [];
    return [...customEntries, ...cappedDue, ...otherWords, ...newWords];
  }, [wrongDrill, wrongEntries, dueForReview, state.progress, getNewWords, customList]);

  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  /**
   * 已经自动朗读过的 `${卡片下标}-${正反面}`。
   *
   * **每开一轮必须清空**（见 startSession/resumeSession）—— ref 不会随组件重挂载自动归零，
   * 而每轮都从下标 0 正面开始，于是第二轮起第一张卡的"0-front"永远命中旧 key 被跳过：
   * 用户看到的现象就是"第一张卡不读单词"（反馈：复习检测只朗读句子、不朗读单词）。
   */
  const lastSpokenKey = useRef('');
  /**
   * 会话当前词。**必须声明在下面的朗读 effect 之前** —— 否则 `cw` 出现在 effect 的依赖
   * 数组里就是 TDZ（AGENTS.md 已记的坑：hook/const 声明顺序）。
   */
  const cw = useMemo(() => {
    const key = session.order[currentIdx];
    if (!key) return undefined;
    return sessionEntries.find((w) => w.word.toLowerCase() === key) ?? findWord(key);
  }, [session.order, currentIdx, sessionEntries]);
  useImmersive(started && !!cw);
  const currentKey = session.order[currentIdx];
  /** 当前卡是否已评分（派生）—— 回看上一张时仍显示"已评"，不会又冒出评分按钮 */
  const rated = !!currentKey && ratedKeys.has(currentKey);
  /**
   * 本次访问中**刚**评分的词 key —— 用来区分「刚评完」与「回看已评过的卡」。
   *
   * 踩过的坑：原先用 `viewingPast = rated && isFlipped` 当自动跳转的排除条件，
   * 但"刚评分完"时卡也正好是背面 → viewingPast 为真 → **自动跳转永远不触发**。
   * 而且守卫当时把这个错误定义一起锁住了（断言写的就是同一份错定义），
   * 所以修的时候必须连断言一起改 —— 否则真机永远跳不了。
   */
  const [ratedNow, setRatedNow] = useState<string | null>(null);
  /** 当前卡是不是"本次刚评的"（决定是否自动跳下一张） */
  const justRated = !!currentKey && ratedNow === currentKey;
  /** 回看：已评过、但不是本次刚评的（从「上一个」翻回来）—— 不出评分按钮、也不自动跳 */
  const viewingPast = rated && !justRated;
  // 换卡时清掉"刚评分"标记
  useEffect(() => { setRatedNow(null); }, [currentKey]);
  // 会话预热：进入队列时预合成前 5 个词，首词朗读零等待
  useEffect(() => {
    if (!autoSpeak) return;
    sessionEntries.slice(0, 5).forEach((w, i) => {
      setTimeout(() => ttsRef.current.prewarm(w.word, { rate: 0.85 }), 120 * i);
    });
  }, [sessionEntries, autoSpeak]);
  useEffect(() => {
    if (!autoSpeak) return;
    const word = cw;
    if (!word) return;
    const side = isFlipped ? 'back' : 'front';
    const key = `${currentIdx}-${side}`;
    if (lastSpokenKey.current === key) return;
    lastSpokenKey.current = key;
    if (!isFlipped) {
      ttsRef.current.speak(word.word, { rate: 0.85 });
      const nk = session.order[currentIdx + 1];
      const next = nk ? findWord(nk) : undefined;
      if (next) ttsRef.current.prewarm(next.word, { rate: 0.85 });
    } else if (word.examples[0]) {
      /**
       * 背面：**先读单词，再读例句**。
       *
       * 原先只读例句，用户直接反馈「朗读是只朗读句子，不朗读单词」。
       * 而且拆成两次 speak（单词一次 + 400ms 后例句一次）也有毛病：
       * speak() 开头就会 stopAudio()，用户快速翻面时会把还没读完的单词掐掉 ——
       * 听感上仍然"只有句子"。拼成一次 speak 交给 chunkText 顺序播放，
       * 既保证单词一定先出声，也不存在互相打断。
       */
      const timer = setTimeout(() => {
        ttsRef.current.speak(`${word.word}. ${cleanText(word.examples[0].en)}`, { rate: 0.85 });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoSpeak, currentIdx, isFlipped, cw, session.order]);

  useEffect(() => {
    setIdx(0); setFlipped(false); setDir(0); setShowDeep(false);
  }, [currentLevel]);

  /**
   * 展示用的词条：detail（搭配/例句/深度解释）是**懒加载并按原对象就地补齐**的
   * （见 wordbank.applyDetail），所以 detail 到位后重新 findWord 就能拿到完整内容。
   */
  const shown = useMemo(() => (cw ? (findWord(cw.word) ?? cw) : cw), [cw, detailTick]);
  // 当前词的助记（必须声明在 shown 之后；切词时 hook 会自动重读）
  const [note, setNote] = useWordNote(shown?.word ?? '');
  /** 最近一次评分（决定自动跳转的停留时长）；用 ref 避免把它放进 effect 依赖 */
  const lastQualityRef = useRef(4);
  /** advance 的 ref 镜像：自动跳转的 effect 用它，避免 advance 每次重建导致定时器反复重置 */
  const advanceRef = useRef<(dir?: number) => void>(() => {});
  /**
   * 「答错待重排」的词 key —— 评分时只记下，**等真正前进时再插回队列**。
   *
   * 2026-09-30 按帧实测的坑：以前在 markWithQuality 里同步 `setSession(scheduleRelearn(...))`，
   * 而 cw / currentKey 都取自 `session.order[currentIdx]`，重排会把该位置就地换成下一张，
   * 于是同一次批处理里 currentKey 就变了 —— `justRated`（ratedNow === currentKey）立即变
   * false，自动跳转的定时器永远排不上；屏幕上还直接换成下一个词的背面（评分按钮健在）。
   * 现象：点「完全忘了」后卡死不动。重排挪到 advance 里做，评分那一刻 session 不动。
   */
  const pendingRelearnRef = useRef<string | null>(null);

  // 进入一张卡时确保该词的等级 detail 已加载 —— 否则背面只有释义，没有搭配/例句
  useEffect(() => {
    if (!started || !cw) return;
    let alive = true;
    Promise.resolve(preloadDetail([cw.level])).then(() => { if (alive) setDetailTick((t) => t + 1); }).catch(() => { /* 降级：只显示核心字段 */ });
    return () => { alive = false; };
  }, [started, cw?.word, cw?.level]);

  // 专注模式下 ESC 退出到概览
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        setStarted(false); setWrongDrill(false); setIdx(0); setFlipped(false); setShowDeep(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started]);

  /** 本轮该词已被重排几次（背面提示"本轮已重排 N 次"） */
  const relearnUsed = useCallback((word: string) => session.relearnCounts[word.toLowerCase()] ?? 0, [session.relearnCounts]);

  /** 未来 7 天到期预测（含今天逾期）—— 让用户对复习负担有预期 */
  const forecast = useMemo(
    () => forecastByDay(Object.values(state.progress).filter((p) => !p.suspended), 7),
    [state.progress],
  );

  /** 断点（概览里显示"接着上次"按钮）。用 state 而不是 useState 初值 ——
   *  初值只在挂载时求值一次，导致"读完一轮回到概览"或"切换等级"后按钮不会刷新。 */
  const [savedSession, setSavedSession] = useState<ISavedSession | null>(() => loadSession(currentLevel));
  useEffect(() => { setSavedSession(loadSession(currentLevel)); }, [currentLevel, started]);

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
  const noteCount = countWordNotes();

  /** 恢复所有被「不再出现」屏蔽的词（不弹提示：按钮旁边「已屏蔽 N 个」的计数会当场归零） */
  const restoreSuspended = useCallback(() => {
    for (const k of Object.values(state.progress).filter((p) => p.suspended).map((p) => p.wordKey)) {
      const w = findWord(k);
      if (w) setSuspended(w, false);
    }
  }, [state.progress, setSuspended]);

  const stats = useMemo(() => {
    let mastered = 0, learning = 0;
    for (const p of Object.values(state.progress)) {
      if (p.status === 'mastered') mastered++;
      else if (p.status === 'reviewing' || p.status === 'learning') learning++;
    }
    const unstarted = Math.max(0, totalForLevel - Object.keys(state.progress).length);
    return { mastered, learning, new: unstarted, total: totalForLevel, due: dueForReview.length };
  }, [state.progress, totalForLevel, dueForReview.length]);

  const flip = useCallback(() => { setFlipped((f) => { if (!f) addStudyMinutes(0.2, 'vocabulary'); return !f; }); }, [addStudyMinutes]);

  const markWithQuality = useCallback((quality: number) => {
    if (!cw || rated) return;
    recordReview(cw, quality);
    lastQualityRef.current = quality;
    setSessionReviewCount((p) => p + 1);
    setSessionRated((p) => p + 1);
    if (quality >= 3) {
      setSessionGood((p) => p + 1);
      // 连击：连续答对累加；每 5 连给一次反馈。
      // 注意不能把 toast/sfx 放进 setState 更新函数里 —— StrictMode 下更新函数会被调用两次，
      // 会弹两次提示、响两次音（答错重排那里踩过同一个坑）。
      const next = combo + 1;
      setCombo(next);
      setBestCombo((b) => Math.max(b, next));
      if (next > 0 && next % 5 === 0) {
        sfxComplete();
      }
    } else {
      setCombo(0);
    }
    setRatedKeys((prev) => new Set(prev).add(cw.word.toLowerCase()));
    setRatedNow(cw.word.toLowerCase());
    // 答错重排：**先记下，等 advance 时再插回**（隔 RELEARN_GAP 张，最多 MAX_RELEARN 次）——
    // 主流 SRS（Anki learning steps）的即时巩固环节。为什么不在这里 setSession 见
    // pendingRelearnRef 的注释（同步重排会让"刚评分"状态立刻失效，卡死在本张）。
    if (quality <= 2) {
      const key = cw.word.toLowerCase();
      // 先判断是否还会重排再记 pending —— 不要把 toast/sfx 放进 setState 更新函数里（StrictMode 下会弹两次）
      if ((session.relearnCounts[key] ?? 0) < MAX_RELEARN) {
        pendingRelearnRef.current = key;
      }
    }
    /**
     * 评分**不弹任何提示**（2026-09-30 用户要求：每点一次熟练度就被播报一次）。
     * 反馈交给界面本身：卡片自己翻到下一张、音效已经响过、连对里程碑与整轮完成才说话。
     * 与快速闪卡「不认识 / 收藏不弹提示」同一条口径（见 ⑧b 静默契约）。
     */
  }, [cw, rated, recordReview, session.relearnCounts]);

  /**
   * 前后翻卡。
   *  - 向前：按会话顺序推进；到队尾则本轮结束并回到开头。
   *  - 向后（direction < 0）：回到上一张并**直接翻到背面** —— 用户点"上一个"就是为了
   *    看那个词的具体信息（释义/搭配/例句），停在正面等于什么都没看到。
   *    （原先 advance 忽略 direction 符号，左滑"上一个"其实还是往前走，是 bug。）
   */
  const advance = useCallback((direction = 1) => {
    if (direction < 0) {
      setDir(-1); setShowDeep(false);
      setIdx((p) => Math.max(0, p - 1));
      setFlipped(true);
      return;
    }
    setDir(direction); setFlipped(false); setShowDeep(false);
    /**
     * 一次批量切换，**不再"先翻回正面、150ms 后再换下标"**。
     *
     * 2026-09-30 按帧实测：AnimatePresence mode="wait" 下这两次相邻的 key 变化会被
     * 合并成一次「退场 + 入场」，中间那 150ms 是纯粹的干等（旧写法点完评分到下一张
     * 进 DOM 要 1122ms）。批量切换后 key 只变一次，内容同样是下一张的正面。
     * 副作用（sfx/toast）也顺手挪出了 setState 更新函数 —— 更新函数必须纯，
     * 否则 StrictMode 双调用会把完成提示弹两次。
     */
    // 前进时才把"答错待重排"的词插回队列（为什么不能提前到评分那一刻：见 pendingRelearnRef）。
    // 重排会把它从 currentIdx 抽走再插到 +RELEARN_GAP 处，原顺序的下一张移到 currentIdx ——
    // 所以 applies 时 `setIdx(currentIdx)`（下标不动）本身就是"前进到下一张"。
    const pending = pendingRelearnRef.current;
    const applies = pending !== null && pending === session.order[currentIdx];
    if (applies) {
      pendingRelearnRef.current = null;
      setSession(scheduleRelearn(session, currentIdx, pending));
    }
    const next = nextIndex(session, currentIdx);
    if (next === null) {
      // 走到队尾：本轮结束，回开头再来一轮（重排插入的词也已经消费完）。
      // 不弹 toast（2026-09-30 用户要求练习界面零提示）——"练完一轮"由界面自己说：
      // 卡面序号回到 1/N、顶部「已评」继续累加、进度条走满；音效保留（那是声音，不是弹窗）。
      sfxComplete();
      setIdx(0);
      return;
    }
    setIdx(applies ? currentIdx : next);
  }, [session, sessionReviewCount, currentIdx]);
  advanceRef.current = advance;

  /**
   * 评分后**自动**进入下一张 —— 主流背单词 App 都是这样：点完熟悉程度就翻页，
   * 不需要再点一次「下一个」。这里的停留只作"这一下点到了"的即时确认（答错稍久一点）。
   *
   * 2026-09-30 无头 Chrome 按帧实测（用户反馈"闪卡切换下一张等待时间长"）：
   * 旧值 550/900 停留 + advance 里另走一拍的 150ms + 串行等退场 spring(260/24)，
   * 点完评分到**下一张词进 DOM 1122ms、眼睛能看清约 1.7s**。
   * 现在：停留 120/300 + 定长 tween 退场（见卡片那处注释），同一路径 ≈300ms。
   * 想更快：停留窗口内按空格 / → 或滑动一下就会立刻跳（advance 会清掉这个定时器）。
   * 回看态 / 未开始 / 未评分都不触发；卡片一换 effect 自动清理定时器。
   */
  useEffect(() => {
    if (!started || !justRated) return;
    const delay = lastQualityRef.current >= 3 ? 120 : 300;
    const t = setTimeout(() => advanceRef.current(1), delay);
    return () => clearTimeout(t);
  }, [started, justRated, currentKey]);
  /** 开启一轮复习：把当时的队列**冻结**成会话顺序（此后评分不再改变本轮的出卡顺序） */
  const startSession = useCallback((entries: IWordEntry[]) => {
    setSessionEntries(entries);
    setSession(createSessionOrder(entries.map((w) => w.word.toLowerCase())));
    setIdx(0); setFlipped(false); setDir(0); setShowDeep(false);
    setRatedKeys(new Set()); setRatedNow(null);   // 必须清空：否则新一轮里这些卡会被当成"已评"，评分按钮不出现
    setSessionRated(0); setSessionGood(0);
    setCombo(0); setBestCombo(0);
    clearSession(currentLevel); // 新开一轮就丢掉旧断点
    lastSpokenKey.current = '';  // 新一轮必须忘掉上一轮的朗读记录，否则第一张卡不出声
    pendingRelearnRef.current = null;  // 上一轮没消费完的"待重排"不跨轮
    setStarted(true);
  }, [currentLevel]);

  /** 断点续学：恢复上次没读完的那一轮（顺序与位置都还原） */
  const resumeSession = useCallback(() => {
    const saved = loadSession(currentLevel);
    if (!saved) return;
    const entries: IWordEntry[] = [];
    const missing: string[] = [];
    for (const k of saved.order) {
      const custom = customList.find((x) => x.word.toLowerCase() === k);
      const w = findWord(k) ?? (custom ? toWordEntry(custom) : undefined);
      if (w) entries.push(w); else missing.push(k);
    }
    const order = saved.order.filter((k) => !missing.includes(k));
    if (!entries.length) { clearSession(currentLevel); toast.info('上次的进度已失效，请重新开始'); return; }
    const idx = Math.max(0, Math.min(saved.index, order.length - 1));
    setSessionEntries(entries);
    setSession({ order, relearnCounts: {} });
    setIdx(idx);
    setFlipped(false); setDir(0); setShowDeep(false);
    setRatedKeys(new Set()); setSessionRated(0); setSessionGood(0);
    setCombo(0); setBestCombo(0);
    lastSpokenKey.current = '';  // 同上：恢复的那一轮也要从第一张卡正常出声
    pendingRelearnRef.current = null;  // 同上：断点里不保存"待重排"，续学从干净状态开始
    setStarted(true);
  }, [currentLevel, customList]);

  /** 本轮断点（顺序 + 当前位置）—— 中途退出后仍可续学 */
  useEffect(() => {
    if (!started || !session.order.length) return;
    saveSession(currentLevel, { order: session.order, index: currentIdx, savedAt: Date.now() });
  }, [started, currentLevel, session.order, currentIdx]);

  /** 已会/不感兴趣 → 屏蔽该词，并从本轮移除 */
  const suspendCurrent = useCallback(() => {
    if (!cw) return;
    const word = cw;
    // 屏蔽的词若正处在"答错待重排"，这张待办必须一起撤销 —— 否则下次前进会把它插回队里，
    // 「不再出现」的承诺就失效了（scheduleRelearn 只认 key，不看词是否还在队中）。
    if (pendingRelearnRef.current === word.word.toLowerCase()) pendingRelearnRef.current = null;
    setSuspended(word, true);
    setSession((s) => {
      const key = word.word.toLowerCase();
      const removed = s.order.filter((k) => k !== key);
      const nextIdx = Math.min(currentIdx, Math.max(0, removed.length - 1));
      setIdx(nextIdx);
      return { order: removed, relearnCounts: s.relearnCounts };
    });
    setFlipped(false); setShowDeep(false);
    toast.success(`已把「${word.word}」移出学习队列`, {
      duration: 5000,
      action: { label: '撤销', onClick: () => setSuspended(word, false) },
    });
  }, [cw, setSuspended, currentIdx]);

  // ── 全键盘操作：空格翻面/默认好评，1-5 评分，→ 下一个，S 开关自动发音 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || !cw) return;
      // 生词本管理等弹窗打开时不抢键盘 —— 否则空格会在弹窗后面直接开始一轮复习
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
  }, [cw, isFlipped, rated, started, flip, advance, markWithQuality, toggleAutoSpeak]);

  // ── 滑动手势：未翻面→翻面；已翻面未评分→左滑不认识 / 右滑认识；已评分→切换下一张 ──
  // 拖动手势必须避开输入控件：卡片背面有"我的助记"文本框，如果在里面拖动/选中文字
  // 被当成滑卡，会直接把当前卡评掉（真机上很容易误触）。
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('textarea, input, [contenteditable="true"]')) { dragStart.current = null; return; }
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
    if (action === 'next') { advance(dx < 0 ? -1 : 1); return; }
    if (action === 'prev') { advance(-1); return; }
    markWithQuality(action === 'rate-unknown' ? SWIPE_QUALITY_UNKNOWN : SWIPE_QUALITY_KNOWN);
  };

  // 只有"根本没词可复习"才走空状态；会话未开始时 cw 也是 undefined，不能混为一谈
  if (queue.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-ink-violet">
            <RotateCw className="size-4" />
          </div>
          <h2 className="text-sm font-black italic text-foreground">复习检测</h2>
        </div>
        <div className="text-center py-16 space-y-4">
          <div className="size-16 rounded-full bg-[#6C5CE7]/10 flex items-center justify-center mx-auto">
            <RotateCw className="size-8 text-ink-violet" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            {stats.due > 0
              ? `还有 ${stats.due} 个单词待复习，开始巩固记忆吧！`
              : stats.learning > 0
                ? `有 ${stats.learning} 个单词正在学习中，继续加油！`
                : '当前没有已学习的单词，请先到「每日学习」模式学习新单词后再来复习。'}
          </p>
          {stats.due === 0 && stats.learning === 0 && (
            <p className="text-xs text-muted-foreground/70 mt-2">
              复习模式需要先有已学习的单词才能使用
            </p>
          )}
        </div>
      </div>
    );
  }
  // ── 概览：标题 + 统计 + 开始按钮（进入学习后隐藏，<- 返回） ──
  if (!started) {
    const masteredPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
    const learningPct = stats.total > 0 ? Math.round((stats.learning / stats.total) * 100) : 0;
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-[#6C5CE7]/10 flex items-center justify-center text-ink-violet">
              <RotateCw className="size-4.5" />
            </div>
            {/*
              这里**不再重复「复习检测」标题**：页面顶部已经有了同名 H1，
              再来一个只会在小屏上叠成两行一样的字（用户反馈"顶部看着糊/被遮住"）。
              保留图标 + 一句说明即可，顺带把首屏那 22px 让给真正的数据。
            */}
            <div>
              <p className="text-[11px] font-black italic text-foreground">SM-2 间隔记忆 · 巩固已学单词</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm" onClick={toggleAutoSpeak}
              className={cn('rounded-xl text-[10px] font-black uppercase tracking-wider gap-1.5',
                autoSpeak ? 'border-[#6C5CE7]/40 text-ink-violet bg-[#6C5CE7]/5' : 'border-border text-muted-foreground')}
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
          <div className="p-2.5 rounded-xl bg-[#6C5CE7]/5 border border-[#6C5CE7]/10 text-center">
            <p className="text-lg font-black text-ink-violet">{sessionReviewCount}</p>
            <p className="text-[8px] font-black uppercase tracking-wider text-ink-violet/70">本次复习</p>
          </div>
        </div>

        {/* 词书掌握度分布 —— 主流背单词 App 的"今日任务"式总览 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground flex items-center gap-1"><Gauge className="size-3" />词书掌握度</span>
            <span className="text-ink-teal tabular-nums">{masteredPct}%</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden bg-muted flex">
            <div className="h-full bg-[#00B894] transition-all" style={{ width: `${masteredPct}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${learningPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[9px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-[#00B894] inline-block" />已掌握 {stats.mastered}</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-amber-400 inline-block" />学习中 {stats.learning}</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-muted-foreground/30 inline-block" />未学 {stats.new}</span>
            <span className="ml-auto">共 {stats.total.toLocaleString()}</span>
          </div>
        </div>

        {/* 未来 7 天复习负担 + 已屏蔽出口 —— 预期管理，避免"怎么又来一堆"的挫败 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground">未来 7 天复习量</span>
            <span className="text-muted-foreground/80 normal-case font-bold">
              明天 {forecast[1] ?? 0} 个
            </span>
          </div>
          {/*
            图表容器高度必须容得下「数值 + 柱 + 星期」三层 ——
            原来写死 h-12（48px），而 8px 文字的行盒约 13px：
            13 + 34(最高柱) + 8(gap) + 13 = 68px > 48px，多出来的部分从顶部溢出，
            数值就压在标题「未来 7 天复习量 / 明天 N 个」上（用户反馈"单词和文字重叠"）。
          */}
          <div className="flex items-end gap-1.5 h-[72px]">
            {forecast.map((n, i) => {
              const max = Math.max(1, ...forecast);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${i === 0 ? '今天（含逾期）' : `${i} 天后`}：${n} 个`}>
                  <span className="text-[8px] font-black tabular-nums text-muted-foreground">{n || ''}</span>
                  <div className={cn('w-full rounded-t-md transition-all', i === 0 ? 'bg-rose-400' : 'bg-[#6C5CE7]/60')}
                    style={{ height: `${Math.max(2, (n / max) * 34)}px` }} />
                  <span className="text-[8px] font-bold text-muted-foreground/70">{i === 0 ? '今' : i}</span>
                </div>
              );
            })}
          </div>
          {suspendedCount > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-[9px] font-bold text-muted-foreground">已屏蔽（不再出现）{suspendedCount} 个</span>
              <button onClick={restoreSuspended}
                className="text-[9px] font-black uppercase tracking-wider text-ink-violet hover:text-[#5A4BD1]">
                恢复全部
              </button>
            </div>
          )}
        </div>

        {/* 每日目标 + 生词本 —— 主流 App 都会把"今天学多少"和"我的生词"放在伸手可及处 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">每日目标</span>
            <span className="text-[9px] font-bold text-muted-foreground/80">今天新学 {state.todayLearned.length}/{dailyQuota}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} onClick={() => setDailyQuota(n)}
                className={cn('flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all border',
                  dailyQuota === n ? 'border-[#6C5CE7] text-ink-violet bg-[#6C5CE7]/10' : 'border-border text-muted-foreground hover:border-[#6C5CE7]/40')}>
                {n}
              </button>
            ))}
          </div>
          {customList.length > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-[9px] font-bold text-muted-foreground">
                生词本 {customList.length} 个（阅读中收集、词库未收录）
              </span>
              <button onClick={() => setShowCustom(true)} className="text-[9px] font-black uppercase tracking-wider text-ink-violet hover:text-[#5A4BD1]">
                查看 / 管理
              </button>
            </div>
          )}
        </div>

        {/* 本周学习量（来自 history，跨天可回溯）+ 助记数 */}
        <div className="rounded-2xl border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-muted-foreground">本周学习量</span>
            <span className="text-muted-foreground/80 normal-case font-bold">
              共 {weekTotal} 次 · 记得 {weekAccuracy}%{noteCount > 0 && ` · 助记 ${noteCount} 个`}
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-[72px]">
            {weekHistory.map((d, i) => {
              const max = Math.max(1, ...weekHistory.map((x) => x.count));
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1"
                  title={`${d.date}：复习 ${d.count} 次`}>
                  <span className="text-[8px] font-black tabular-nums text-muted-foreground">{d.count || ''}</span>
                  <div className={cn('w-full rounded-t-md transition-all',
                    i === weekHistory.length - 1 ? 'bg-[#00B894]' : 'bg-muted-foreground/30')}
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
            disabled={queue.length === 0}
            className="bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-violet-200/50 gap-2"
          >
            <RotateCw className="size-4" />开始复习（{queue.length} 张卡片）
          </Button>
          {/* 断点续学：上次没读完的那一轮 */}
          {savedSession && (
            <Button
              variant="outline" onClick={resumeSession}
              className="rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-wider gap-2 border-[#6C5CE7]/40 text-ink-violet"
              title="恢复上次的顺序与位置"
            >
              <History className="size-4" />接着上次（还剩 {Math.max(0, savedSession.order.length - savedSession.index)} 张）
            </Button>
          )}
        </div>

        {/* 生词本管理：朗读 / 移除（这些词已进复习队列，SM-2 与屏蔽同样适用） */}
        <Dialog open={showCustom} onOpenChange={setShowCustom}>
          <DialogContent className="max-w-md rounded-[24px]">
            <DialogHeader>
              <DialogTitle className="text-sm font-black">生词本（{customList.length}）</DialogTitle>
            </DialogHeader>
            <div className="max-h-[55vh] overflow-y-auto space-y-1.5">
              {customList.map((w) => (
                <div key={w.word} className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60">
                  <button onClick={() => tts.speak(w.word, { rate: 0.9 })} className="shrink-0 text-muted-foreground hover:text-ink-violet">
                    <Volume2 className="size-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-foreground truncate">
                      {w.word}{w.phonetic && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">{w.phonetic}</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{w.meaning || '（无释义）'}</p>
                    {w.source && <p className="text-[9px] text-muted-foreground/70 truncate">{w.source}</p>}
                  </div>
                  <button onClick={() => removeCustom(w.word)}
                    className="shrink-0 p-1 text-muted-foreground hover:text-rose-500" title="从生词本移除">
                    <XCircle className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
  }
  const accuracy = sessionRated > 0 ? Math.round((sessionGood / sessionRated) * 100) : 0;
  const progressPct = session.order.length > 0 ? Math.round((sessionRated / session.order.length) * 100) : 0;
  const swipeHint = Math.abs(dragX) < SWIPE_THRESHOLD ? null : (dragX < 0 ? 'left' : 'right');
  return (
    <div className="space-y-4">
        {/* 学习中头部：返回 + 本轮进度条 + 正确率 */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setStarted(false); setWrongDrill(false); setIdx(0); setFlipped(false); setShowDeep(false); }}
            className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-violet"
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
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black bg-[#6C5CE7]/10 text-ink-violet border-0">
              回看第 {currentIdx + 1} 张
            </Badge>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-[#6C5CE7] transition-all duration-300" style={{ width: `${progressPct}%` }} />
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
          {/* 上一个词 —— 回看刚看过的词的具体信息（左滑也可以） */}
          <Button
            variant="ghost" size="icon" onClick={() => advance(-1)} disabled={currentIdx === 0}
            className="rounded-xl size-9 shrink-0 text-muted-foreground hover:text-ink-violet disabled:opacity-30"
            title="上一个词（查看它的具体信息）· 左滑也可以"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="ghost" size="icon" onClick={toggleAutoSpeak}
            className={cn('rounded-xl size-9 shrink-0', autoSpeak ? 'text-ink-violet' : 'text-muted-foreground/60')}
            title={`自动发音${autoSpeak ? '（已开）' : '（已关）'} · 快捷键 S`}
          >
            <Volume2 className="size-4.5" />
          </Button>
        </div>
      {/* Flashcard */}
      <div className="flex justify-center">
        {/* 退场和入场在这里是串行的（mode="wait"：新卡要等旧卡退场**完全结束**才挂载），
            所以别用 spring —— 它要衰减到亚像素才算结束（260/24 实测退场 ~420ms，
            即使换成很紧的 460/34 仍有 ~400ms 的长尾）。定长 tween 0.18s 精确可控，
            与快速闪卡的换卡动画同一条曲线，两个闪卡模式手感一致。 */}
        <AnimatePresence mode="wait">
          <MotionDiv key={shown?.word + (isFlipped ? '-back' : '-front')}
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
              {/* 滑动方向提示（模仿主流卡片：左=不认识，右=认识） */}
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
                  ? 'border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10 max-h-[62vh] overflow-y-auto'
                  : 'border-border bg-card min-h-[260px] flex flex-col justify-center')}
              onClick={() => { if (Math.abs(dragX) < SWIPE_THRESHOLD) flip(); }}
            >
              <CardContent className={cn('p-7 text-center', isFlipped && 'text-left')}>
                {!isFlipped ? (
                  <>
                    <Badge className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground mb-4">
                      {currentIdx + 1} / {session.order.length}
                      {state.progress[shown!.word.toLowerCase()] && (
                        <span className="ml-1.5 text-ink-violet">
                          · {state.progress[shown!.word.toLowerCase()].status === 'mastered' ? '已掌握' : '复习中'}
                        </span>
                      )}
                    </Badge>
                    <div data-fit-box className="flex items-center justify-center gap-2 mb-4 max-w-full">
                      <h2 className="text-foreground min-w-0 max-w-full">
                        <FitWord text={shown!.word} maxPx={40} minPx={18} reservePx={52} />
                      </h2>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); tts.speak(shown!.word, { rate: 0.9 }); }}
                        className="rounded-2xl bg-muted text-muted-foreground hover:text-ink-violet"><Volume2 className="size-5" /></Button>
                    </div>
                    <p className="text-sm font-bold text-ink-violet mb-1">{shown!.partOfSpeech}</p>
                    <p className="text-sm text-muted-foreground font-medium">{shown!.phonetic}</p>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-4">
                      <Sparkles className="size-3.5 inline mr-1 text-ink-violet" />点击翻转查看释义
                    </p>
                    <p className="text-[9px] text-muted-foreground/70 font-bold mt-1.5">手机：左右滑动 · 键盘：空格 / 1-5 / S</p>
                  </>
                ) : (
                  <div className="space-y-3.5">
                    {/* 词头：词 + 音标 + 发音 */}
                    <div className="text-center">
                      <Badge className="rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-violet-100 dark:bg-violet-500/20 text-ink-violet">
                        {shown!.partOfSpeech}
                      </Badge>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <p className="text-lg font-black text-foreground">{shown!.word}</p>
                        <button onClick={(e) => { e.stopPropagation(); tts.speak(shown!.word, { rate: 0.9 }); }}
                          className="text-muted-foreground hover:text-ink-violet"><Volume2 className="size-4" /></button>
                      </div>
                      {shown!.phonetic && <p className="text-xs text-muted-foreground font-medium">{shown!.phonetic}</p>}
                      <p className="text-lg font-black text-foreground mt-2">{shown!.meaning}</p>
                      {/* 语域 / 情感 / 词频：主流 App 常见的"难度标签" */}
                      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                        <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground border-0">
                          词频 #{shown!.frequencyRank}
                        </Badge>
                        <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground border-0">
                          {shown!.register === 'formal' ? '正式' : shown!.register === 'informal' ? '口语' : '中性'}
                        </Badge>
                        {shown!.emotion !== 'neutral' && (
                          <Badge className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold border-0',
                            shown!.emotion === 'positive' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500')}>
                            {shown!.emotion === 'positive' ? '褒义' : '贬义'}
                          </Badge>
                        )}
                        {shown!.hasNoChineseEquivalent && (
                          <Badge className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-600 border-0">中文无对应</Badge>
                        )}
                      </div>
                    </div>

                    {/* 例句 —— 点英文可再听一遍 */}
                    {shown!.examples.length > 0 && (
                      <div className="rounded-2xl bg-white/60 dark:bg-foreground/10 border border-violet-100 p-3 space-y-2">
                        <SectionTitle icon={BookOpen}>例句 · {shown!.examples.length} 条（点句子可朗读）</SectionTitle>
                        {shown!.examples.slice(0, 3).map((ex, i) => (
                          <div key={i}
                            className="cursor-pointer group/ex"
                            onClick={(e) => { e.stopPropagation(); tts.speak(cleanText(ex.en), { rate: 0.85 }); }}>
                            <p className="text-sm text-foreground/85 italic font-medium group-hover/ex:text-ink-violet transition-colors">
                              {cleanText(ex.en)}
                            </p>
                            {ex.zh && <p className="text-xs text-muted-foreground mt-0.5">{cleanText(ex.zh)}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 常用搭配 */}
                    {shown!.collocations.length > 0 && (
                      <div>
                        <SectionTitle icon={Link2}>常用搭配</SectionTitle>
                        <div className="flex flex-wrap gap-1.5">
                          {shown!.collocations.slice(0, 8).map((c) => (
                            <span key={c} className="px-2 py-1 rounded-lg bg-[#6C5CE7]/8 text-[11px] font-bold text-foreground/80">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 近义 / 反义 / 词族 */}
                    {(shown!.synonyms.length > 0 || shown!.antonyms.length > 0 || shown!.wordFamily.length > 0) && (
                      <div className="space-y-2">
                        {shown!.synonyms.length > 0 && (
                          <div>
                            <SectionTitle>近义 ≈</SectionTitle>
                            <div className="flex flex-wrap gap-1.5">
                              {shown!.synonyms.slice(0, 8).map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {shown!.antonyms.length > 0 && (
                          <div>
                            <SectionTitle>反义 ≠</SectionTitle>
                            <div className="flex flex-wrap gap-1.5">
                              {shown!.antonyms.slice(0, 8).map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-600 dark:text-rose-400">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {shown!.wordFamily.length > 0 && (
                          <div>
                            <SectionTitle>词族</SectionTitle>
                            <div className="flex flex-wrap gap-1.5">
                              {shown!.wordFamily.slice(0, 10).map((s) => (
                                <span key={s} className="px-2 py-1 rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 深度解释（可折叠，避免背面过长） */}
                    {shown!.deepExplanation && (
                      <div className="rounded-2xl border border-violet-100 bg-white/50 dark:bg-foreground/5">
                        <button
                          className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-black uppercase tracking-wider text-ink-violet"
                          onClick={(e) => { e.stopPropagation(); setShowDeep((v) => !v); }}
                        >
                          <span>深度解释</span>
                          {showDeep ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                        {showDeep && (
                          <p className="px-3 pb-3 text-xs text-foreground/80 leading-relaxed">{shown!.deepExplanation}</p>
                        )}
                      </div>
                    )}

                    {/* 主题标签 */}
                    {shown!.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {shown!.topics.slice(0, 6).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-[9px] font-bold text-muted-foreground">#{t}</span>
                        ))}
                      </div>
                    )}
                    {/* 记忆状态与出口 —— 让用户知道"为什么还会再看到它"，
                        并给熟练用户一个「别再来烦我」的出口（主流 App 都有，缺了会流失） */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-violet-100/70">
                      <div className="text-[9px] font-bold text-muted-foreground">
                        {rated && state.progress[shown!.word.toLowerCase()]
                          ? `下次复习：${state.progress[shown!.word.toLowerCase()].interval} 天后 · 间隔 ${state.progress[shown!.word.toLowerCase()].interval}d`
                          : (state.progress[shown!.word.toLowerCase()]
                            ? `当前间隔 ${state.progress[shown!.word.toLowerCase()].interval} 天`
                            : '首次学习 · 答对后 1 天再见')}
                        {relearnUsed(shown!.word) > 0 && ` · 本轮已重排 ${relearnUsed(shown!.word)} 次`}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); suspendCurrent(); }}
                        className="shrink-0 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="已会 / 不感兴趣 —— 从学习队列移除（可撤销）"
                      >
                        不再出现
                      </button>
                    </div>

                    {/* 我的助记 —— 用户自己写的线索记忆效果最好（自我参照效应） */}
                    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 dark:bg-amber-500/5 p-3">
                      <button
                        className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-600"
                        onClick={(e) => { e.stopPropagation(); setEditingNote((v) => !v); }}
                      >
                        <span className="flex items-center gap-1"><PenLine className="size-3" />我的助记{note ? '' : '（点这里写一个）'}</span>
                        {editingNote ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </button>
                      {editingNote ? (
                        <Textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onBlur={() => { setNote(noteDraft); setEditingNote(false); }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="写点能让你记住它的东西：拆词、联想、你自己的例句…"
                          className="mt-2 min-h-[64px] text-xs rounded-xl"
                          autoFocus
                        />
                      ) : note ? (
                        <p className="mt-1.5 text-xs text-foreground/85 leading-relaxed whitespace-pre-wrap">{note}</p>
                      ) : null}
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
            { q: 5, label: '完全掌握', color: 'bg-[#6C5CE7] hover:bg-[#5A4BD1]' },
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
      {/*
        评分后**不再有「下一个」按钮** —— 主流背单词 App 点完熟悉程度就自动翻页，
        多按一次是纯负担。这里只留一条过渡提示；停留窗口已缩到 120/300ms，
        所以它只是"点到了"的一闪。想更快：空格 / → / 滑动都能立刻跳。
        回看态不显示：那时停留多久由用户决定。
      */}
      {rated && !viewingPast && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/60 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
            <RotateCw className="size-3.5 animate-spin [animation-duration:1.6s]" />
            即将进入下一张…
          </span>
        </div>
      )}
      {/*
        回看态（含答错重排再现的那张）**必须有可见的继续出口**：
        没有评分按钮、也没有「下一个」按钮，光靠"滑动/按 →"的隐藏手势会让手机用户
        直接卡在这张上。滑动手势本身也改成 rated 即导航（见 vocab-swipe.ts）。
      */}
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
