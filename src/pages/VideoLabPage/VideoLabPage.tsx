/**
 * VideoLabPage — 视频精听：导入视频/音频 + 字幕，像「每日英语听力」那样逐句学。
 *
 * 为什么是"导入"而不是内置转录：见 `src/lib/video-lab.ts` 头注（网页版是 https 源，
 * 抓不到本机 http 的转录服务，混合内容会被浏览器拦；三形态统一走导入才有一致的行为）。
 *
 * 三条容易做错的约定：
 *  1. **object URL 必须 revoke** —— 换一课或卸载时不释放，几十 MB 的 blob 会一直挂在内存里；
 *  2. **字幕列表必须开窗** —— 一部 5 分钟的视频就有 60+ 句、长视频几百句，
 *     一次铺完首屏就废了（AGENTS「一屏渲染不完的列表」那条，verify-list-scaling 会扫）；
 *  3. **没有媒体也是合法形态**（只导入字幕）：这时原声缺席，朗读走 NativeThink 自己的 TTS，
 *     界面上要说明"无原声"而不是显示一个坏掉的播放器。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Film, Upload, Heart, Volume2, Trash2, Search, BookPlus,
  Repeat, ListVideo, Keyboard, ChevronLeft, Sparkles, FileText, Loader2, Mic,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, cleanText } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { useFavorites } from '@/lib/use-favorites';
import { addCustomWord, isCustomWord } from '@/lib/custom-words';
import { useTTS } from '@/lib/use-tts';
import { useLearningStats } from '@/lib/use-learning-stats';
import { useSpellingSentences, videoToSpellingItem, normSentenceKey } from '@/lib/use-spelling-sentences';
import { queryWords, preloadCoreOnly } from '@/data/wordbank';
import type { IWordEntry } from '@/data/wordbank';
import { safeStorage } from '@/lib/safe-storage';
import { persistJson } from '@/lib/capped-cache';
import { useAI } from '@/hooks/use-ai';
import { parseBatchTranslation } from '@/data/book-translation';
import {
  videoStore, parseSubtitle, lessonId, guessLang, mergeProgress, scoreSpeech,
  type IVideoMeta, type IVideoLesson, type IVideoSentence, type IVideoProgress, type ISpeechScore,
} from '@/lib/video-lab';

const PROGRESS_KEY = '__nativethink_video_progress';
/** 上次开着的那一课：切 tab 会把组件 state 清掉，回来必须接着上次的句子（AGENTS「切 tab 状态丢」那条） */
const LAST_OPEN_KEY = '__nativethink_video_last_open';
/** 字幕窗口：默认只渲染活动句前后这么多条（长列表不许一次铺完） */
const WINDOW = 40;
const RATES = [0.5, 0.75, 1, 1.25, 1.5];
/** 一次点「翻译本课」最多翻这么多句（剩下再点一次），免得长视频一口气打爆额度 */
const TRANSLATE_LIMIT = 30;
const TRANSLATE_BATCH = 10;
/** 与整书翻译同一套编号 JSON 口径，解析复用 parseBatchTranslation */
const TRANSLATE_SYSTEM = [
  '你是英译中译者，负责把英文字幕逐句翻译成自然流畅、符合中文母语习惯的简体中文。',
  '输入为若干带编号的英文句子（[1]、[2]……）。要求：',
  '1. 逐句翻译，译文的编号与输入严格一一对应，不增、不减、不改变顺序；',
  '2. 口语自然、避免翻译腔；人名可保留英文；',
  '3. 只输出严格 JSON：{"t":[{"i":1,"zh":"第 1 句译文"},{"i":2,"zh":"……"}]}，不要输出任何解释、注释或 markdown 代码块。',
].join('\n');

const fmt = (s: number) => {
  const n = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/** 活动句：字幕时间轴有序，线性扫对几十~几百句足够，且比二分少一个 off-by-one 的来源 */
function activeIndexOf(sentences: IVideoSentence[], t: number): number {
  let i = -1;
  for (let k = 0; k < sentences.length; k++) {
    if (sentences[k].t0 <= t + 0.05) i = k; else break;
  }
  return i;
}

export default function VideoLabPage() {
  const tts = useTTS();
  const { addFavorite, isFavorited, isWordFavorited, favorites, removeFavorite } = useFavorites();
  const { addStudyMinutes } = useLearningStats();
  const { addSentence: addSpelling, sentences: spellSentences } = useSpellingSentences();
  const { isConfigured: aiReady, chat: aiChat } = useAI();

  const [list, setList] = useState<IVideoMeta[]>([]);
  const [lesson, setLesson] = useState<IVideoLesson | null>(null);
  const [idx, setIdx] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loopOne, setLoopOne] = useState(false);
  const [ab, setAb] = useState<{ a: number; b: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [lookup, setLookup] = useState<{ word: string; entry: IWordEntry | null } | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [recording, setRecording] = useState(false);
  const [spoken, setSpoken] = useState('');
  const [score, setScore] = useState<ISpeechScore | null>(null);
  const [micNote, setMicNote] = useState('');
  const [zhBusy, setZhBusy] = useState('');
  const [zhNote, setZhNote] = useState('');

  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const subInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const pendingMedia = useRef<File | null>(null);
  const recRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  /** 每课"已经计过时的句子"—— 只在这次会话里有效，容量被索引封顶（50 课）钉住 */
  const reachedRef = useRef<Map<string, Set<number>>>(new Map());

  const sentences = lesson?.sentences || [];
  const cur = sentences[idx] || null;
  /** 「听写这句」的按钮态用同一个归一口径判断（练习界面零提示：不给 toast，给界面状态） */
  const inSpellingBook = !!cur && spellSentences.some((s) => normSentenceKey(s.en) === normSentenceKey(cur.text));

  /* ── 列表载入 ── */
  useEffect(() => {
    let alive = true;
    videoStore.list().then((items) => { if (alive) setList(items); });
    return () => { alive = false; };
  }, []);

  /* ── 卸载时释放 object URL（泄漏比缓存贵），并收掉还在听的识别 ── */
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    try { recRef.current?.abort(); } catch { /* 已经自己结束了 */ }
  }, []);

  const openLesson = useCallback(async (id: string) => {
    setBusy('读取…');
    const l = await videoStore.load(id);
    setBusy('');
    if (!l) { setNote('这一课的记录读不出来了，重新导入一份字幕即可'); return; }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = l.url;
    setNote('');           // 上一课的"时长元数据不可靠"之类提示不许跟着带到这一课
    setLesson(l);
    setShowAll(false);
    setLookup(null);
    const prog: Record<string, IVideoProgress> = (() => {
      try { return JSON.parse(safeStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
    })();
    setIdx(Math.min(prog[id]?.lastI || 0, Math.max(0, l.sentences.length - 1)));
    setAb(prog[id]?.ab || null);
    setRate(prog[id]?.rate || 1);
    safeStorage.setItem(LAST_OPEN_KEY, id);
  }, []);

  /* ── 回到本页时接着上次那一课（列表已读出来后才有 id 可校验，所以挂在 list 之后） ── */
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !list.length) return;
    restoredRef.current = true;
    const last = safeStorage.getItem(LAST_OPEN_KEY);
    if (last && last !== lesson?.meta.id && list.some((m) => m.id === last)) openLesson(last);
  }, [list, lesson, openLesson]);

  const removeLesson = useCallback(async (id: string) => {
    await videoStore.remove(id);
    if (safeStorage.getItem(LAST_OPEN_KEY) === id) safeStorage.removeItem(LAST_OPEN_KEY);
    if (lesson?.meta.id === id) {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setLesson(null);
    }
    setList(await videoStore.list());
  }, [lesson]);

  /* ── 导入：字幕（必需）+ 媒体（可选） ── */
  const onSubtitle = useCallback(async (file: File) => {
    setBusy('解析字幕…');
    try {
      const text = await file.text();
      const { list: parsed, format } = parseSubtitle(text);
      if (parsed.length === 0) {
        setNote(`没解析出任何一句（识别为 ${format}）。SRT / VTT / 转录伴侣导出的 JSON 都支持，检查一下文件内容`);
        setBusy('');
        return;
      }
      const media = pendingMedia.current;
      const duration = Math.max(parsed[parsed.length - 1].t1, media ? 0 : 0);
      const meta: IVideoMeta = {
        id: lessonId(media?.name || file.name, duration, media?.size || 0),
        title: (media?.name || file.name).replace(/\.[^.]+$/, ''),
        duration,
        lang: guessLang(parsed.slice(0, 12).map((s) => s.text).join(' ')),
        bytes: media?.size || 0,
        mime: media?.type || '',
        sentenceCount: parsed.length,
        hasWords: parsed.some((s) => (s.words?.length || 0) > 0),
        createdAt: Date.now(),
      };
      let blob: Blob | null = null;
      if (media) {
        setBusy('存媒体（大文件会慢一点）…');
        blob = media;
      }
      const saved = await videoStore.save(meta, parsed, blob);
      if (!saved) {
        // 配额满是最常见原因；存不下媒体时退化成"只有字幕"，功能不整条废掉
        if (blob && await videoStore.save(meta, parsed, null)) {
          setNote('本机存储装不下这个视频，已按「只有字幕」保存 —— 原声缺席，朗读可用 NativeThink 的语音');
        } else {
          setNote('保存失败（多半是本地存储配额满了）');
          setBusy('');
          return;
        }
      }
      pendingMedia.current = null;
      setNote('');
      setList(await videoStore.list());
      setBusy('');
      await openLesson(meta.id);
    } catch (e) {
      setNote(`导入失败：${(e as Error).message || '未知错误'}`);
      setBusy('');
    }
  }, [openLesson]);

  /* ── 播放：timeupdate 驱动活动句、单句循环、A-B 复读 ── */
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !lesson) return;
    const onTime = () => {
      const t = el.currentTime;
      setTime(t);
      const i = activeIndexOf(sentences, t);
      if (i >= 0 && i !== idx) {
        setIdx(i);
        // 每**认到新的一句**记 0.2 分钟（与闪卡/中译英同参）。必须按课去重：
        // 往回拖再看一遍会反复进入同一句，不去重就成了刷时长。
        const seen = reachedRef.current.get(lesson.meta.id)
          || (() => { const s = new Set<number>(); reachedRef.current.set(lesson.meta.id, s); return s; })();
        if (!seen.has(i)) { seen.add(i); addStudyMinutes(0.2, 'video'); }
      }
      if (ab && t >= ab.b) el.currentTime = ab.a;
      else if (loopOne && cur && t >= cur.t1) el.currentTime = cur.t0;
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [lesson, sentences, idx, ab, loopOne, cur, addStudyMinutes]);

  useEffect(() => { if (mediaRef.current) mediaRef.current.playbackRate = rate; }, [rate, lesson]);

  /** 进度落盘（小记录，走 safeStorage → 自动进云同步与备份） */
  useEffect(() => {
    if (!lesson) return;
    try {
      const all: Record<string, IVideoProgress> = JSON.parse(safeStorage.getItem(PROGRESS_KEY) || '{}');
      persistJson(PROGRESS_KEY, mergeProgress(all, lesson.meta.id, { lastI: idx, listened: Math.max(all[lesson.meta.id]?.listened || 0, idx + 1), ab, rate }));
    } catch { /* 进度写失败不影响学习，界面上也不弹（练习界面零提示口径） */ }
  }, [idx, lesson, ab, rate]);

  const seekTo = useCallback((i: number, autoplay = true) => {
    const s = sentences[i];
    if (!s) return;
    setIdx(i);
    const el = mediaRef.current;
    if (el) {
      el.currentTime = s.t0;
      // 暂停中点一句就直接播起来；正在播则只跳位置，别把用户的手势播放按停
      if (autoplay && el.paused) el.play().catch(() => { /* 自动播放被拦是常态，不提示 */ });
    }
  }, [sentences]);

  /**
   * 流媒体下载站给的 m4a 常见"头写 100 分钟、实际只有 5 分钟"（截断下载，moov 里声明的时长没改）。
   * 原生控件会照显示那个假时长，用户看到进度条对不上就以为功能坏了 —— 所以把它说破：
   * 跳转/复读/A-B 全部按字幕时间走，不受元素时长影响。
   */
  const checkDuration = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const expect = lesson?.meta.duration || 0;
    const got = el.duration;
    if (!Number.isFinite(got) || (expect > 1 && (got / expect > 1.6 || got / expect < 0.6))) {
      setNote(`这段媒体自带的时长元数据不可靠（播放器报 ${fmt(got || 0)}，字幕只到 ${fmt(expect)}）—— 大概是下载被截断。点句跳转、单句循环、A-B 复读都按字幕时间走，不受它影响`);
    } else if (expect > 1) {
      setNote('');
    }
  }, [lesson]);

  const toggle = useCallback(() => {
    const el = mediaRef.current;
    if (!el) { if (cur) tts.speak(cur.text); return; }
    if (el.paused) el.play().catch(() => {}); else el.pause();
  }, [cur, tts]);

  /* ── 点词查词 ── */
  const lookupWord = useCallback(async (raw: string) => {
    const word = raw.replace(/[^A-Za-z'’-]/g, '').toLowerCase();
    if (!word) return;
    let hit = queryWords({ search: word, limit: 1 }).find((w) => w.word.toLowerCase() === word) || null;
    if (!hit) {
      // 词库核心层没预热时查不到 —— 先预热再查一次，而不是直接显示"没找到"
      await preloadCoreOnly(['cet4', 'cet6', 'gaokao']);
      hit = queryWords({ search: word, limit: 1 }).find((w) => w.word.toLowerCase() === word) || null;
    }
    setLookup({ word, entry: hit });
  }, []);

  const toggleFavWord = useCallback((entry: IWordEntry | null, word: string) => {
    const key = cleanText(entry?.word || word);
    if (isWordFavorited(key)) {
      const fav = favorites.find((f) => f.content === key && (f.type === 'vocabulary' || f.type === 'word'));
      if (fav) removeFavorite(fav.id);
      return;
    }
    addFavorite({
      type: 'vocabulary', content: key,
      meaning: entry?.meaning || '', example: entry?.examples?.[0]?.en || '',
      category: entry?.level || 'video',
    });
  }, [addFavorite, favorites, isFavorited, removeFavorite]);

  const toggleFavSentence = useCallback((s: IVideoSentence) => {
    const content = cleanText(s.text);
    if (isFavorited(content, 'video')) {
      const fav = favorites.find((f) => f.type === 'video' && f.content === content);
      if (fav) removeFavorite(fav.id);
      return;
    }
    addFavorite({ type: 'video', content, meaning: s.zh || '', example: `${fmt(s.t0)}–${fmt(s.t1)}`, category: lesson?.meta.title || 'video' });
  }, [addFavorite, favorites, isFavorited, lesson, removeFavorite]);

  /* ── 跟读评分：识别到的词序 vs 本句词序 ── */
  useEffect(() => { setSpoken(''); setScore(null); setMicNote(''); }, [idx]);

  const shadowThis = useCallback(() => {
    if (!cur) return;
    const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!API) {
      // 说实话并给替代路，不假装能打的分（注意：安卓 WebView 实测**有**这个对象但服务不在，
      // 那种情况由下面的看门狗兜，不要以为"存在就能用"）
      setScore(null); setSpoken('');
      setMicNote('这台设备没有语音识别通道，跟读评分用不了；可以先「朗读」听原句，再点「听写这句」用拼写检验');
      return;
    }
    if (recording) { recRef.current?.stop(); return; }
    setMicNote(''); setSpoken(''); setScore(null); setRecording(true);
    /**
     * WebView 常常是"对象能构造、start() 当场抛"（无语音服务时 NotSupportedError），
     * 也可能 onerror/onend 一个都不回 —— 这两种都会把按钮卡在"正在听…"，
     * 就是 AGENTS 那条"点了没反应／转圈不结束"。所以：try/catch + 看门狗各自兜一层。
     */
    let got = false;
    let rec: any;
    const stopWatch = () => { if (watch) { clearTimeout(watch); watch = null; } };
    let watch: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!got) setMicNote('识别服务没有回应（这台设备的 WebView 多半不带语音识别服务）；可以先「朗读」听原句，再点「听写这句」用拼写检验');
      try { rec?.stop(); } catch { /* 已经自己死了 */ }
      setRecording(false);
    }, 9000);
    try {
      rec = new API();
      rec.lang = lesson?.meta.lang === 'zh' ? 'zh-CN' : lesson?.meta.lang === 'ja' ? 'ja-JP' : 'en-US';
      rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        got = true; stopWatch();
        const t = String(e?.results?.[0]?.[0]?.transcript || '');
        setSpoken(t);
        setScore(scoreSpeech(cur.text, t));
      };
      rec.onerror = (e: any) => setMicNote(
        e?.error === 'not-allowed' || e?.error === 'service-not-allowed'
          ? '麦克风权限被拒绝 —— 允许后再点一次'
          : e?.error === 'no-speech' ? '没听到声音，再试一次' : `这一次没识别出来（${e?.error || '未知原因'}），再点一次试试`,
      );
      rec.onend = () => { stopWatch(); setRecording(false); };
      recRef.current = rec;
      rec.start();
    } catch (e) {
      stopWatch();
      setRecording(false);
      setMicNote(`这台设备 start() 就失败了（${(e as Error).name || '未知原因'}）—— 跟读评分用不了，可以点「听写这句」用拼写检验`);
    }
  }, [cur, recording, lesson]);

  /* ── 双语字幕：按编号批量翻，翻完分键存回 IDB ── */
  const translateLesson = useCallback(async () => {
    if (!lesson) return;
    const sents = lesson.sentences;
    const todo = sents.map((s, k) => ({ s, k })).filter((x) => !x.s.zh);
    if (!todo.length) return;
    if (!aiReady) { setZhNote('还没配 AI Key，翻不出译文 —— 逐句跳转、复读、查词、朗读都不受影响'); return; }
    const zhArr: (string | undefined)[] = sents.map((s) => s.zh || undefined);
    const part = todo.slice(0, TRANSLATE_LIMIT);
    let stopped = '';
    for (let k = 0; k < part.length; k += TRANSLATE_BATCH) {
      const batch = part.slice(k, k + TRANSLATE_BATCH);
      setZhBusy(`翻译中 ${k}/${part.length}…`);
      const raw = await aiChat([
        { role: 'system', content: TRANSLATE_SYSTEM },
        { role: 'user', content: batch.map((x, i) => `[${i + 1}] ${x.s.text}`).join('\n') },
      ]);
      if (!String(raw).trim()) { stopped = 'AI 这次没返回内容（服务不可用或额度用完），已翻好的先留下'; break; }
      const parsed = parseBatchTranslation(raw, batch.length);
      if (parsed.size === 0) { stopped = 'AI 返回的编号对不上，已翻好的先留下，再点一次重试剩下的'; break; }
      parsed.forEach((zh, idx) => { const hit = batch[idx]; if (hit && zh) zhArr[hit.k] = zh; });
    }
    setLesson({ ...lesson, sentences: sents.map((s, k) => ({ ...s, zh: zhArr[k] })) });
    const saved = await videoStore.saveZh(lesson.meta.id, zhArr);
    const done = zhArr.filter(Boolean).length;
    setZhNote(!saved ? `译文存不下来（本机存储可能满了），这次只显示、下次要重翻（已翻 ${done} 句）`
      : stopped || `已翻译 ${done}/${sents.length} 句${todo.length > part.length ? `（本轮只翻 ${part.length} 句，再点一次接着翻）` : ''}`);
    setZhBusy('');
  }, [lesson, aiReady, aiChat]);

  /* ── 字幕窗口（长列表不一次铺完） ── */
  const windowed = useMemo(() => {
    if (showAll) return sentences.map((s, i) => ({ s, i }));
    const from = Math.max(0, idx - Math.floor(WINDOW / 3));
    const to = Math.min(sentences.length, from + WINDOW);
    return sentences.slice(from, to).map((s, k) => ({ s, i: from + k }));
  }, [sentences, idx, showAll]);

  /* ── 快捷键（弹窗开着时不劫持；Radix 冒泡阶段同步关弹窗，所以用捕获阶段） ── */
  useEffect(() => {
    if (!lesson) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;
      const el = mediaRef.current;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight' && !e.shiftKey) { if (el) el.currentTime = Math.min(el.duration || 1e9, el.currentTime + 5); }
      else if (e.key === 'ArrowLeft') { if (el) el.currentTime = Math.max(0, el.currentTime - 5); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); seekTo(Math.min(sentences.length - 1, idx + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); seekTo(Math.max(0, idx - 1)); }
      else if (e.key === 'Enter') { if (el && cur) { el.currentTime = cur.t0; el.play().catch(() => {}); } }
      else if (e.key.toLowerCase() === 'f') setLoopOne((v) => !v);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [lesson, idx, sentences.length, cur, toggle, seekTo]);

  /* ── 渲染 ── */
  if (!lesson) {
    return (
      <div className="space-y-4">
        <Card className="rounded-[32px] border-border shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-teal-50 dark:bg-teal-500/15 text-teal-600 flex items-center justify-center">
                <Film className="size-6" />
              </div>
              <div>
                <p className="text-xl font-[900] italic text-foreground">视频精听</p>
                <p className="text-xs font-medium text-muted-foreground">导入视频 + 字幕 · 逐句跳转复读 · 点词查词 · 收藏与朗读</p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border p-4 space-y-3">
              <p className="text-[11px] font-black text-foreground">导入一课</p>
              <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
                字幕支持 SRT / VTT，以及本地转录伴侣（dshzmd）导出的 JSON —— 带词级时间戳就能逐词高亮。
                视频/音频可选：只导字幕也能学，原声缺席时用朗读代替。
              </p>
              <div className="flex flex-wrap gap-2">
                <input ref={mediaInputRef} type="file" accept="video/*,audio/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { pendingMedia.current = f; subInputRef.current?.click(); } e.target.value = ''; }} />
                <input ref={subInputRef} type="file" accept=".srt,.vtt,.ass,.json,.txt" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onSubtitle(f); e.target.value = ''; }} />
                <Button size="sm" variant="outline" className="rounded-2xl text-[11px] font-black" disabled={!!busy}
                  onClick={() => mediaInputRef.current?.click()}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  选视频（含音频）
                </Button>
                <Button size="sm" variant="outline" className="rounded-2xl text-[11px] font-black" disabled={!!busy}
                  onClick={() => subInputRef.current?.click()}>
                  <FileText className="size-3.5" /> 只导字幕
                </Button>
              </div>
              {busy && <p className="text-[10px] font-bold text-teal-600">{busy}</p>}
              {note && <p className="text-[10px] font-bold text-amber-600 leading-relaxed">{note}</p>}
            </div>

            {list.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">已导入 {list.length} 课</p>
                {list.slice(0, 12).map((m) => (
                  <button key={m.id} onClick={() => openLesson(m.id)}
                    className="w-full text-left px-3 py-2.5 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-black text-foreground truncate flex-1">{m.title}</span>
                      <span className="text-[9px] font-bold text-muted-foreground tabular-nums shrink-0">{fmt(m.duration)}</span>
                      <span onClick={(e) => { e.stopPropagation(); removeLesson(m.id); }}
                        className="shrink-0 p-1 text-muted-foreground/50 hover:text-rose-400"><Trash2 className="size-3.5" /></span>
                    </div>
                    <p className="text-[9px] font-bold text-muted-foreground mt-0.5">
                      {m.sentenceCount} 句 · {m.hasWords ? '逐词时间戳' : '句级时间戳'} · {m.bytes ? `${(m.bytes / 2 ** 20).toFixed(0)} MB 原声` : '仅字幕'}{m.hasZh ? ' · 已翻译' : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {list.length === 0 && (
          <EmptyState icon={ListVideo} title="还没有导入的课程"
            description="在转录伴侣里点「导出 SRT」，或把任何 .srt / .vtt 字幕连同视频拖进来" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="rounded-2xl px-2" onClick={() => { safeStorage.removeItem(LAST_OPEN_KEY); setLesson(null); if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } videoStore.list().then(setList); }}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-[12px] font-black text-foreground truncate flex-1">{lesson.meta.title}</span>
        <span className="text-[9px] font-bold text-muted-foreground tabular-nums shrink-0">{idx + 1}/{sentences.length}</span>
      </div>

      <Card className="rounded-[28px] border-border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {lesson.url ? (
            <video ref={mediaRef} src={lesson.url} controls playsInline className="w-full max-h-[46vh] bg-black"
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={checkDuration} />
          ) : (
            <div className="w-full h-24 bg-muted/40 flex items-center justify-center gap-2">
              <Volume2 className="size-4 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground">仅字幕课程 · 用「朗读本句」听 NativeThink 的语音</span>
            </div>
          )}
          {/* 媒体自带的时长元数据不可靠时（截断下载的 m4a 常报 100 分钟），把话说破在播放器下面 */}
          {note && <p className="px-3 pt-2 text-[10px] font-bold text-amber-600 leading-relaxed">{note}</p>}
          <div className="p-3 space-y-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={toggle} className="size-9 rounded-2xl bg-teal-500 text-white flex items-center justify-center shrink-0"
                title={lesson.url ? (playing ? '暂停' : '播放') : '朗读本句'}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <span className="text-[10px] font-black text-muted-foreground tabular-nums w-20 shrink-0">{fmt(time)} / {fmt(lesson.meta.duration)}</span>
              <button onClick={() => setLoopOne((v) => !v)} title="单句循环（F）"
                className={cn('px-2 py-1 rounded-xl text-[10px] font-black border shrink-0',
                  loopOne ? 'border-teal-400/60 bg-teal-500/10 text-teal-600' : 'border-border text-muted-foreground')}>
                <Repeat className="size-3 inline mr-0.5" />单句
              </button>
              <button onClick={() => { if (!cur) return; setAb(ab?.a === cur.t0 ? null : { a: cur.t0, b: cur.t1 }); }}
                title="A-B 复读当前句区间"
                className={cn('px-2 py-1 rounded-xl text-[10px] font-black border shrink-0',
                  ab ? 'border-teal-400/60 bg-teal-500/10 text-teal-600' : 'border-border text-muted-foreground')}>
                A-B {ab ? `${fmt(ab.a)}–${fmt(ab.b)}` : ''}
              </button>
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} title="播放速度"
                className="px-1.5 py-1 rounded-xl border border-border text-[10px] font-black text-muted-foreground bg-background shrink-0">
                {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
              </select>
              {cur && (
                <button onClick={() => tts.speak(cur.text)} title="朗读本句"
                  className="px-2 py-1 rounded-xl border border-border text-[10px] font-black text-muted-foreground shrink-0 hover:text-teal-600">
                  <Volume2 className="size-3 inline mr-0.5" />朗读
                </button>
              )}
              {cur && (
                <button onClick={shadowThis} title="跟读这句并比对"
                  className={cn('px-2 py-1 rounded-xl border text-[10px] font-black shrink-0',
                    recording ? 'border-teal-400/60 bg-teal-500/10 text-teal-600' : 'border-border text-muted-foreground hover:text-teal-600')}>
                  <Mic className="size-3 inline mr-0.5" />{recording ? '正在听…' : '跟读'}
                </button>
              )}
              <button onClick={translateLesson} disabled={!!zhBusy} title="把这课字幕翻成中文"
                className="px-2 py-1 rounded-xl border border-border text-[10px] font-black text-muted-foreground shrink-0 hover:text-teal-600 disabled:opacity-50">
                <Sparkles className="size-3 inline mr-0.5" />{zhBusy || '翻译字幕'}
              </button>
            </div>
            {cur && (
              <div className="rounded-2xl bg-muted/40 p-3 space-y-1.5">
                <p className="text-[14px] font-black leading-relaxed text-foreground">
                  {/* 只有转录伴侣导出的 JSON 带词级时间戳；普通 SRT 必须按空白切成词面，
                      否则"点词查词"在最常见的那种字幕上整个退化成点一句（2026-10-18 走查抓到） */}
                  {(cur.words?.length ? cur.words : cur.text.split(/\s+/).filter(Boolean).map((w) => ({ w, t0: cur.t0, t1: cur.t1 }))).map((w, k) => (
                    <span key={`${k}-${w.w}`} onClick={() => lookupWord(w.w)}
                      className={cn('cursor-pointer hover:text-teal-600',
                        // 只有真有词级时间戳才逐词点亮（整句合成的那种会一整条一起下划线，没意义）
                        cur.words?.length && time >= w.t0 && time < w.t1 && 'text-teal-600 underline decoration-2')}>
                      {w.w}{' '}
                    </span>
                  ))}
                </p>
                {cur.zh && <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">{cur.zh}</p>}
                <div className="flex items-center gap-2 pt-0.5">
                  <button onClick={() => toggleFavSentence(cur)} title="收藏这句"
                    className={cn('p-1', isFavorited(cleanText(cur.text), 'video') ? 'text-rose-500' : 'text-muted-foreground/50 hover:text-rose-400')}>
                    <Heart className={cn('size-3.5', isFavorited(cleanText(cur.text), 'video') && 'fill-current')} />
                  </button>
                  <button onClick={() => addSpelling(videoToSpellingItem({ en: cur.text, zh: cur.zh || '' }))}
                    disabled={inSpellingBook}
                    title={inSpellingBook ? '这句已经在听写本里' : '送进句子拼写（听写这句）'}
                    className={cn('p-1', inSpellingBook ? 'text-sky-500' : 'text-muted-foreground/50 hover:text-sky-500')}><Keyboard className="size-3.5" /></button>
                  <button onClick={() => { if (mediaRef.current) { mediaRef.current.currentTime = cur.t0; } }}
                    title="重播本句（Enter）" className="p-1 text-muted-foreground/50 hover:text-teal-600"><Play className="size-3.5" /></button>
                  <span className="ml-auto text-[9px] font-bold text-muted-foreground/70 tabular-nums">{fmt(cur.t0)}–{fmt(cur.t1)}</span>
                </div>
                {/* 跟读比对结果就显示在卡里（练习界面零提示口径：不弹 toast） */}
                {(score || micNote) && (
                  <div className="rounded-2xl border border-border/60 bg-background/60 p-2.5 space-y-1">
                    {score && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-muted-foreground">识别到</span>
                        <span className="text-[12px] font-black tabular-nums"
                          style={{ color: score.accuracy >= 0.8 ? 'hsl(150 55% 42%)' : score.accuracy >= 0.5 ? 'hsl(35 85% 55%)' : 'hsl(0 55% 52%)' }}>
                          {Math.round(score.accuracy * 100)}%
                        </span>
                        <span className="flex-1 min-w-0 h-1.5 rounded-full bg-muted overflow-hidden">
                          <span className="block h-full rounded-full bg-teal-500" style={{ width: `${Math.round(score.accuracy * 100)}%` }} />
                        </span>
                      </div>
                    )}
                    {score && <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">{spoken}</p>}
                    {score && score.missed.length > 0 && (
                      <p className="text-[10px] font-bold leading-relaxed">
                        <span className="text-muted-foreground">没读准：</span>
                        {score.missed.map((w) => (
                          <span key={w} onClick={() => lookupWord(w)} className="cursor-pointer text-amber-600 mr-1.5 underline decoration-dotted">{w}</span>
                        ))}
                      </p>
                    )}
                    {micNote && <p className="text-[10px] font-bold text-amber-600 leading-relaxed">{micNote}</p>}
                  </div>
                )}
              </div>
            )}
            {zhNote && <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">{zhNote}</p>}
          </div>
        </CardContent>
      </Card>

      {lookup && (
        <Card className="rounded-[24px] border-teal-200/70 dark:border-teal-500/20 shadow-sm">
          <CardContent className="p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <Search className="size-3.5 text-teal-600" />
              <span className="text-[13px] font-black text-foreground">{lookup.word}</span>
              {lookup.entry && <span className="text-[10px] font-bold text-muted-foreground">{lookup.entry.phonetic} · {lookup.entry.partOfSpeech}</span>}
              <button onClick={() => setLookup(null)} className="ml-auto text-[9px] font-black text-muted-foreground">收起</button>
            </div>
            {lookup.entry ? (
              <>
                <p className="text-[11px] font-bold text-foreground leading-relaxed">{cleanText(lookup.entry.meaning)}</p>
                {lookup.entry.collocations?.[0] && (
                  <p className="text-[10px] font-medium text-muted-foreground">搭配：{lookup.entry.collocations.slice(0, 3).join(' · ')}</p>
                )}
                {lookup.entry.examples?.[0]?.en && (
                  <p className="text-[10px] font-black italic text-teal-700">{cleanText(lookup.entry.examples[0].en)}</p>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  <button onClick={() => { addCustomWord({ word: lookup.entry.word, phonetic: lookup.entry.phonetic, partOfSpeech: lookup.entry.partOfSpeech, meaning: lookup.entry.meaning, source: `视频精听：${lesson?.meta.title || ''}` });
                    setLookup({ ...lookup }); }}
                    className="px-2 py-1 rounded-xl border border-border text-[10px] font-black text-muted-foreground hover:text-teal-600">
                    <BookPlus className="size-3 inline mr-0.5" />
                    {isCustomWord(lookup.entry.word) ? '已在生词本' : '加进生词本（进 SM-2 复习）'}
                  </button>
                  <button onClick={() => toggleFavWord(lookup.entry, lookup.word)}
                    className={cn('px-2 py-1 rounded-xl border text-[10px] font-black',
                      isWordFavorited(lookup.entry.word) ? 'border-rose-300 text-rose-500' : 'border-border text-muted-foreground')}>
                    <Heart className="size-3 inline mr-0.5" />收藏这个词
                  </button>
                  <button onClick={() => tts.speak(lookup.entry.word)} className="px-2 py-1 rounded-xl border border-border text-[10px] font-black text-muted-foreground">
                    <Volume2 className="size-3 inline mr-0.5" />读
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
                词库里没有这个词的词条（可能是词组或变形）。可以收藏这句连上下文一起留着，或交给「母语思维」分析。
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-[28px] border-border shadow-sm">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="size-3 text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">字幕 · {sentences.length} 句</span>
            {sentences.length > WINDOW && (
              <button onClick={() => setShowAll((v) => !v)} className="ml-auto text-[9px] font-black text-teal-600">
                {showAll ? '收回收音窗口' : `展开全部（当前只渲染 ${windowed.length} 条）`}
              </button>
            )}
          </div>
          <ol className="space-y-1">
            {windowed.map(({ s, i }) => (
              <li key={`${s.i}-${i}`}>
                <button onClick={() => seekTo(i)}
                  className={cn('w-full text-left px-2.5 py-2 rounded-2xl transition-colors',
                    i === idx ? 'bg-teal-500/10 border border-teal-400/40' : 'hover:bg-muted/50 border border-transparent')}>
                  <div className="flex items-start gap-2">
                    <span className="text-[8px] font-black text-muted-foreground/70 tabular-nums pt-0.5 shrink-0">{fmt(s.t0)}</span>
                    <span className={cn('text-[11px] font-bold leading-relaxed flex-1', i === idx ? 'text-teal-700' : 'text-foreground')}>
                      {cleanText(s.text)}
                    </span>
                    <span onClick={(e) => { e.stopPropagation(); toggleFavSentence(s); }}
                      className={cn('shrink-0 p-0.5', isFavorited(cleanText(s.text), 'video') ? 'text-rose-500' : 'text-muted-foreground/30 hover:text-rose-400')}>
                      <Heart className={cn('size-3', isFavorited(cleanText(s.text), 'video') && 'fill-current')} />
                    </span>
                  </div>
                  {s.zh && <p className="text-[9px] font-medium text-muted-foreground mt-0.5 pl-8">{s.zh}</p>}
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
