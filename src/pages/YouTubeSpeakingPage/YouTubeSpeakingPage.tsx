/**
 * 英语口语视频学习页 — YouTube/Bilibili 嵌入播放 + 同步字幕 + 重点词翻译
 *
 * 功能：
 * - 预置视频库（Bilibili），按难度筛选
 * - Bilibili iframe 嵌入播放器
 * - 字幕分段显示，播放时自动高亮当前段
 * - 点击段落跳转到对应时间
 * - 点击重点词弹出查词弹窗（复用文章阅读模式）
 * - 自定义视频：粘贴 BVID + 手动添加字幕
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Plus,
  Search,
  Volume2,
  Heart,
  Hash,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { safeStorage } from '@/lib/safe-storage';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { queryWords } from '@/data/wordbank';
import { toast } from 'sonner';
import {
  getAllVideos,
  getVideosByLevel,
  getVideoById,
  addCustomVideo,
  removeVideo,
  type VideoEntry,
  type VideoSegment,
  type VideoKeyword,
} from '@/data/speaking-videos';

const BILIBILI_ORIGIN = 'https://player.bilibili.com';

const LEVEL_TABS = [
  { key: 'all', label: '全部' },
  { key: 'beginner', label: '初级' },
  { key: 'intermediate', label: '中级' },
  { key: 'advanced', label: '高级' },
];

// ── Word lookup: same as ArticlePage ──
async function lookupWord(word: string): Promise<{ word: string; phonetic: string; meaning: string; zhMeaning: string } | null> {
  const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;

  const bankResults = queryWords({ search: cleaned, limit: 1 });
  const zhMeaning = bankResults.length > 0 ? (bankResults[0].meaning || '') : '';

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`);
    if (!res.ok) return { word: cleaned, phonetic: '', meaning: zhMeaning || '未找到释义', zhMeaning };
    const data = await res.json();
    const entry = data[0];
    const phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || '';
    const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || '';
    return { word: cleaned, phonetic, meaning, zhMeaning };
  } catch {
    return { word: cleaned, phonetic: '', meaning: zhMeaning || '未找到释义', zhMeaning };
  }
}

// ── Bilibili iframe URL builder ──
function bilibiliUrl(bvid: string, page = 1, t = 0): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page}&autoplay=0&t=${Math.floor(t)}`;
}

/** Format seconds → MM:SS */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Sub-components ──

function VideoCard({
  video,
  active,
  onClick,
  onDelete,
}: {
  video: VideoEntry;
  active: boolean;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={cn(
      'shrink-0 w-48 rounded-2xl overflow-hidden border-2 transition-all duration-200 relative group',
      active
        ? 'border-[#00B894] shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30'
        : 'border-border/50 hover:border-[#00B894]/50',
    )}>
      <button onClick={onClick} className="w-full text-left">
        {/* Thumbnail placeholder */}
        <div className="aspect-video bg-gradient-to-br from-muted to-muted-foreground/10 flex items-center justify-center relative">
          <Play className="size-8 text-muted-foreground/30" />
          <span className="absolute bottom-1 right-1 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
            {video.episodes ? `${video.episodes}集` : fmtTime(video.duration)}
          </span>
        </div>
        {/* Info */}
        <div className="p-2.5 space-y-1">
          <p className="text-xs font-bold text-foreground leading-tight line-clamp-2">
            {video.titleZh || video.title}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{video.channel}</p>
          <Badge
            variant="secondary"
            className={cn(
              'text-[9px] font-bold px-1.5 py-0 rounded',
              video.level === 'beginner' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
              video.level === 'intermediate' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              video.level === 'advanced' && 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
            )}
          >
            {video.level === 'beginner' ? '初级' : video.level === 'intermediate' ? '中级' : '高级'}
          </Badge>
        </div>
      </button>
      {/* Delete button — visible on hover */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ── Main Page ──

export default function YouTubeSpeakingPage() {
  const tts = useTTS();
  const { addFavorite, isFavorited, favorites, removeFavorite } = useFavorites();

  // Video library
  const [levelFilter, setLevelFilter] = useState('all');
  const [videos, setVideos] = useState<VideoEntry[]>(() => getAllVideos());
  const [activeVideo, setActiveVideo] = useState<VideoEntry | null>(null);

  // Player state
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const currentTimeRef = useRef(0);

  // Episode navigation
  const [currentPage, setCurrentPage] = useState(1);
  const [episodeList, setEpisodeList] = useState<{ page: number; part: string; duration: number }[]>([]);

  // Transcript
  const [searchQuery, setSearchQuery] = useState('');

  // Word lookup dialog
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupWord_State, setLookupWordState] = useState('');
  const [lookupData, setLookupData] = useState<{ word: string; phonetic: string; meaning: string; zhMeaning: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Custom video dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [customBvid, setCustomBvid] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customTitleZh, setCustomTitleZh] = useState('');
  const [customLevel, setCustomLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');

  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-fetch state
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [fetchedInfo, setFetchedInfo] = useState<{ title: string; episodes: number; channel: string } | null>(null);

  // Subtitle state
  const [fetchedSegments, setFetchedSegments] = useState<VideoSegment[] | null>(null);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [subtitleSource, setSubtitleSource] = useState<'bilibili' | 'ai' | 'stt' | null>(null);
  const [showAddSubtitle, setShowAddSubtitle] = useState(false);
  const [pastedTranscript, setPastedTranscript] = useState('');
  const [aiProcessing, setAiProcessing] = useState(false);
  const ai = useAI();

  // Speech-to-text state
  const [sttActive, setSttActive] = useState(false);
  const sttRef = useRef<any>(null);
  const sttBufferRef = useRef('');
  const sttSegmentCountRef = useRef(0);
  const sttProcessingRef = useRef(false);

  // ── Filter videos by level ──
  useEffect(() => {
    setVideos(getVideosByLevel(levelFilter));
  }, [levelFilter]);

  // ── Bilibili postMessage listener ──
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== BILIBILI_ORIGIN) return;
      const data = e.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'timeupdate':
        case 'seeked':
          if (typeof data.data?.currentTime === 'number') {
            currentTimeRef.current = data.data.currentTime;
            setCurrentTime(data.data.currentTime);
          }
          break;
        case 'play':
          setPlayerPlaying(true);
          break;
        case 'pause':
          setPlayerPlaying(false);
          break;
        case 'ended':
          setPlayerPlaying(false);
          break;
        case 'loaded':
          setPlayerReady(true);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Fallback: track time via interval when playing ──
  useEffect(() => {
    if (!playerPlaying || !activeVideo) return;
    const interval = setInterval(() => {
      currentTimeRef.current += 0.25;
      setCurrentTime((t) => t + 0.25);
    }, 250);
    return () => clearInterval(interval);
  }, [playerPlaying, activeVideo]);

  // ── Subtitle cache key (includes page for multi-episode videos) ──
  const subtitleCacheKey = activeVideo ? `__speaking_subtitle_${activeVideo.bvid}_p${currentPage}` : null;

  // ── Auto-fetch subtitles when video or page changes ──
  useEffect(() => {
    if (!activeVideo) { setFetchedSegments(null); setSubtitleSource(null); return; }

    // Check localStorage cache first
    if (subtitleCacheKey) {
      try {
        const cached = safeStorage.getItem(subtitleCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setFetchedSegments(parsed.segments || null);
          setSubtitleSource(parsed.source || null);
          return;
        }
      } catch { /* ignore */ }
    }

    // Fetch from API
    setSubtitleLoading(true);
    fetch(`/api/bilibili-subtitle?bvid=${activeVideo.bvid}&page=${currentPage}`)
      .then((r) => r.json())
      .then((data) => {
        // Set episode list (for collections)
        if (data.episodeList && data.episodeList.length > 1) {
          setEpisodeList(data.episodeList);
        } else if (activeVideo.episodes && activeVideo.episodes > 1 && episodeList.length === 0) {
          const eps = [];
          for (let i = 1; i <= activeVideo.episodes; i++) {
            eps.push({ page: i, part: `Episode ${i}`, duration: 0 });
          }
          setEpisodeList(eps);
        }
        // Set segments
        if (data.segments && data.segments.length > 0) {
          setFetchedSegments(data.segments);
          setSubtitleSource('bilibili');
          if (subtitleCacheKey) {
            try { safeStorage.setItem(subtitleCacheKey, JSON.stringify({ segments: data.segments, source: 'bilibili' })); } catch { /* */ }
          }
        } else {
          setFetchedSegments(null);
          setSubtitleSource(null);
        }
      })
      .catch(() => {
        setFetchedSegments(null);
        setSubtitleSource(null);
        // Fallback episode names
        if (activeVideo.episodes && activeVideo.episodes > 1 && episodeList.length === 0) {
          const eps = [];
          for (let i = 1; i <= activeVideo.episodes; i++) {
            eps.push({ page: i, part: `Episode ${i}`, duration: 0 });
          }
          setEpisodeList(eps);
        }
      })
      .finally(() => setSubtitleLoading(false));
  }, [activeVideo?.id, currentPage]);

  // ── Segments to display (prefer live segments > fetched > built-in) ──
  const displaySegments = activeVideo?.segments && activeVideo.segments.length > 0
    ? activeVideo.segments
    : (fetchedSegments || []);

  // ── Compute current segment index ──
  const currentSegmentIndex = (() => {
    if (!activeVideo || displaySegments.length === 0) return -1;
    return displaySegments.findIndex(
      (seg) => currentTime >= seg.start && currentTime < seg.end,
    );
  })();

  // ─- Auto-scroll transcript to current segment ──
  useEffect(() => {
    if (currentSegmentIndex >= 0 && segmentRefs.current[currentSegmentIndex]) {
      segmentRefs.current[currentSegmentIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentSegmentIndex]);

  // ── Seek in player (postMessage + iframe reload fallback) ──
  const seekTo = useCallback((time: number) => {
    if (!activeVideo) return;
    // Try postMessage first
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'seek', data: { time } },
        BILIBILI_ORIGIN,
      );
    } catch { /* fallback below */ }
    // Also reload iframe with t= parameter as reliable seek
    const newSrc = bilibiliUrl(activeVideo.bvid, currentPage, time);
    if (iframeRef.current && iframeRef.current.src !== newSrc) {
      iframeRef.current.src = newSrc;
    }
    currentTimeRef.current = time;
    setCurrentTime(time);
  }, [activeVideo, currentPage]);

  // ── Word click handler ──
  const handleKeywordClick = useCallback(async (word: string) => {
    const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (!cleaned || cleaned.length < 2) return;
    setLookupWordState(cleaned);
    setLookupOpen(true);
    setLookupLoading(true);
    setLookupData(null);
    const data = await lookupWord(cleaned);
    setLookupData(data);
    setLookupLoading(false);
  }, []);

  // ── Favorite word ──
  const favWord = isFavorited(lookupWord_State, 'word');
  const toggleWordFav = useCallback(() => {
    if (!lookupWord_State) return;
    if (favWord) {
      const f = favorites.find((x) => x.content === lookupWord_State && x.type === 'word');
      if (f) removeFavorite(f.id);
      toast('已取消收藏');
    } else {
      addFavorite({ type: 'word', content: lookupWord_State, meaning: lookupData?.meaning || '', category: 'speaking' });
      toast.success(`已收藏 "${lookupWord_State}"`);
    }
  }, [lookupWord_State, favWord, favorites, addFavorite, removeFavorite, lookupData]);

  // Ref-based addSegment to avoid stale closure in inline STT
  const addSegmentRef = useRef(addSegment);
  addSegmentRef.current = addSegment;

  // ── Select video → start STT immediately (within click gesture) ──
  const handleSelectVideo = useCallback((video: VideoEntry) => {
    setActiveVideo(video);
    setCurrentPage(1);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setPlayerReady(false);
    setPlayerPlaying(false);
    setFetchedSegments(null);
    setSubtitleSource(null);
    setEpisodeList([]);
    setSearchQuery('');
    segmentRefs.current = [];
    setShowAddSubtitle(false);

    // Start STT immediately (within user click gesture so browser allows mic)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const segFn = (text: string) => addSegmentRef.current(text);

    setSubtitleSource('stt');
    sttBufferRef.current = '';
    sttSegmentCountRef.current = 0;
    sttProcessingRef.current = false;
    setFetchedSegments([]);
    setSttActive(true);

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let newFinal = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newFinal = event.results[i][0].transcript.trim();
        }
      }
      if (!newFinal || newFinal.split(/\s+/).length < 2) return;
      if (!sttProcessingRef.current) {
        segFn(newFinal);
      } else {
        sttBufferRef.current += ' ' + newFinal;
      }
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (sttBufferRef.current.trim()) {
        segFn(sttBufferRef.current.trim());
        sttBufferRef.current = '';
      }
      if (sttActive) {
        try { recognition.start(); } catch { setSttActive(false); }
      }
    };

    sttRef.current = recognition;
    recognition.start();
  }, []);

  // ── Switch episode within collection ──
  const handleSwitchEpisode = useCallback((page: number) => {
    if (!activeVideo || page === currentPage) return;
    setCurrentPage(page);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setFetchedSegments(null);
    setSubtitleSource(null);
    setSearchQuery('');
    segmentRefs.current = [];
  }, [activeVideo, currentPage]);

  // ── Segments to display (prefer live segments > fetched > built-in) ──

  // ── Delete video ──
  const handleDeleteVideo = useCallback((e: React.MouseEvent, video: VideoEntry) => {
    e.stopPropagation();
    if (!confirm(`确定删除「${video.titleZh || video.title}」？`)) return;
    removeVideo(video.id);
    setVideos(getVideosByLevel(levelFilter));
    if (activeVideo?.id === video.id) {
      setActiveVideo(null);
      setCurrentTime(0);
      currentTimeRef.current = 0;
    }
    toast.success('已删除');
  }, [levelFilter, activeVideo]);

  // ── Auto-fetch video info from Bilibili ──
  const handleFetchInfo = useCallback(async () => {
    const input = customBvid.trim();
    if (!input) { toast.error('请先输入 BVID 或 B站链接'); return; }
    const match = input.match(/BV[A-Za-z0-9]{10,}/);
    if (!match) { toast.error('无法识别 BVID'); return; }
    const bvid = match[0].toUpperCase();
    setFetchingInfo(true);
    setFetchedInfo(null);
    try {
      const res = await fetch(`/api/bilibili-info?bvid=${bvid}`);
      if (!res.ok) { toast.error('获取信息失败'); return; }
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setFetchedInfo({ title: data.title, episodes: data.episodes, channel: data.channel });
      setCustomTitle(data.title || '');
      setCustomTitleZh('');
      toast.success(`已获取：${data.title}（${data.episodes}集）`);
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setFetchingInfo(false);
    }
  }, [customBvid]);

  // ── Add custom video ──
  const handleAddCustom = useCallback(() => {
    if (!customBvid.trim()) { toast.error('请输入 BVID 或 B站视频链接'); return; }
    if (!customTitle.trim()) { toast.error('请输入视频标题'); return; }

    // Extract BVID from URL or plain text
    let bvid = customBvid.trim();
    // Try to match BV... in URL (supports full URLs like https://www.bilibili.com/video/BV1xx411c7mD?p=1)
    const bvMatch = bvid.match(/BV[A-Za-z0-9]{10,}/);
    if (bvMatch) {
      bvid = bvMatch[0].toUpperCase();
    } else {
      bvid = bvid.toUpperCase();
      // Fallback: check if it looks like a raw BVID
      if (!/^BV[A-Za-z0-9]{10,}$/.test(bvid)) {
        toast.error('无法识别 BVID，请粘贴 B站视频链接或 BVID');
        return;
      }
    }

    // Don't duplicate
    const existing = getAllVideos();
    if (existing.some((v) => v.bvid === bvid)) {
      toast.error('该视频已在库中');
      return;
    }

    const newVideo: VideoEntry = {
      id: `custom_${Date.now()}`,
      bvid,
      title: customTitle.trim(),
      titleZh: customTitleZh.trim() || customTitle.trim(),
      channel: '自定义',
      level: customLevel,
      duration: 0,
      thumbnail: '',
      segments: [],
    };
    // Add to library directly
    addCustomVideo(newVideo);
    setVideos(getVideosByLevel(levelFilter));
    handleSelectVideo(newVideo);
    setShowAddDialog(false);
    setCustomBvid('');
    setCustomTitle('');
    setCustomTitleZh('');
    toast.success('已添加视频！请在下方添加字幕段');
  }, [customBvid, customTitle, customTitleZh, customLevel, levelFilter, handleSelectVideo]);

  // ── AI process pasted transcript ──
  const handleProcessTranscript = useCallback(async () => {
    if (!pastedTranscript.trim() || !activeVideo || !ai.isConfigured) {
      if (!ai.isConfigured) toast.error('请先配置 AI API Key');
      return;
    }
    setAiProcessing(true);
    try {
      const prompt = `You are a bilingual subtitle generator. Take the following English transcript text and split it into natural segments (by sentence or short phrase group). For each segment, provide the Chinese translation and highlight 1-3 key vocabulary words with their Chinese meanings.

Return ONLY a valid JSON array, no markdown, no extra text:
[
  {
    "en": "English text",
    "zh": "Chinese translation",
    "keywords": [{"word": "key_word", "meaning": "中文释义"}]
  }
]

Transcript text:
${pastedTranscript.slice(0, 8000)}`;

      const result = await ai.chat([
        { role: 'system', content: 'You are a bilingual transcript processor. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.3, maxTokens: 4096 });

      // Try to extract JSON from response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (!jsonMatch) { toast.error('AI 返回格式错误，请重试'); return; }
      const segments = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(segments) || segments.length === 0) {
        toast.error('AI 未能生成字幕段'); return;
      }

      // Calculate timestamps based on word count (avg speaking rate ~2.5 words/sec)
      const WORDS_PER_SEC = 2.7;
      let cursor = 0;
      const validSegments: VideoSegment[] = segments.map((s: any) => {
        const en = (s.en || '').trim();
        const wordCount = en.split(/\s+/).filter(Boolean).length;
        const duration = Math.max(2, wordCount / WORDS_PER_SEC);
        const start = cursor;
        const end = cursor + duration;
        cursor += duration;
        return {
          start,
          end,
          en,
          zh: (s.zh || '').trim(),
          keywords: (s.keywords || []).filter((k: any) => k.word).map((k: any) => ({ word: k.word, meaning: k.meaning || '' })),
        };
      }).filter((s) => s.en);

      if (validSegments.length === 0) { toast.error('字幕段为空'); return; }

      setFetchedSegments(validSegments);
      setSubtitleSource('ai');
      segmentRefs.current = new Array(validSegments.length).fill(null);

      // Cache
      if (subtitleCacheKey) {
        try { safeStorage.setItem(subtitleCacheKey, JSON.stringify({ segments: validSegments, source: 'ai' })); } catch { /* */ }
      }

      toast.success(`已生成 ${validSegments.length} 条字幕`);
      setShowAddSubtitle(false);
      setPastedTranscript('');
    } catch {
      toast.error('处理失败，请重试');
    } finally {
      setAiProcessing(false);
    }
  }, [pastedTranscript, activeVideo, ai, subtitleCacheKey]);

  // ── Speech-to-text via Web Speech API (real-time AI translation) ──

  /** Translate a single sentence via AI and add to segments */
  const addSegment = useCallback(async (text: string, translatedZh?: string) => {
    if (!text.trim()) return;
    sttProcessingRef.current = true;

    let en = text.trim();
    let zh = translatedZh || '';

    // If no translation yet, try AI
    if (!zh && ai.isConfigured) {
      try {
        const result = await ai.chat([
          { role: 'system', content: 'Translate the following English sentence to Chinese. Return ONLY valid JSON like {"zh":"..."}' },
          { role: 'user', content: `{"en":"${en.replace(/"/g, '\\"')}"}` },
        ], { temperature: 0.2, maxTokens: 256 });
        const m = result.match(/"zh"\s*:\s*"([^"]+)"/);
        if (m) zh = m[1];
      } catch { /* show English only */ }
    }

    // Extract keywords
    const words = en.split(/\s+/).filter(Boolean);
    const keywords = [];
    const seen = new Set();
    for (const w of words) {
      const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (clean.length > 4 && !seen.has(clean) && keywords.length < 4) {
        seen.add(clean);
        keywords.push({ word: clean, meaning: '' });
      }
    }

    const idx = sttSegmentCountRef.current;
    sttSegmentCountRef.current = idx + 1;
    const newSegment: VideoSegment = {
      start: idx * 3,
      end: (idx + 1) * 3,
      en,
      zh,
      keywords,
    };

    setFetchedSegments((prev) => {
      const updated = [...(prev || []), newSegment];
      if (subtitleCacheKey) {
        try { safeStorage.setItem(subtitleCacheKey, JSON.stringify({ segments: updated, source: 'stt' })); } catch { /* */ }
      }
      return updated;
    });

    // Scroll into view
    setTimeout(() => {
      const refs = segmentRefs.current;
      const el = refs[refs.length - 1];
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);

    sttProcessingRef.current = false;
  }, [ai, subtitleCacheKey]);

  const handleSTTStart = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error('当前浏览器不支持语音识别'); return; }
    if (!activeVideo) { toast.error('请先选择视频'); return; }

    setSubtitleSource('stt');
    sttBufferRef.current = '';
    sttSegmentCountRef.current = 0;
    sttProcessingRef.current = false;
    setFetchedSegments([]);
    segmentRefs.current = [];
    setSttActive(true);

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let newFinal = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newFinal = event.results[i][0].transcript.trim();
        }
      }
      if (!newFinal || newFinal.split(/\s+/).length < 2) return;

      // Always process every final result immediately if not busy
      if (!sttProcessingRef.current) {
        addSegment(newFinal);
      } else {
        sttBufferRef.current += ' ' + newFinal;
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast.error(`语音识别错误: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Process buffered text
      if (sttBufferRef.current.trim()) {
        addSegment(sttBufferRef.current.trim());
        sttBufferRef.current = '';
      }
      // Auto-restart if still active
      if (sttActive) {
        try { recognition.start(); } catch { setSttActive(false); }
      }
    };

    sttRef.current = recognition;
    recognition.start();
    toast.success('语音识别已开始，自动翻译中…');
  }, [activeVideo, addSegment]);


  const handleSTTStop = useCallback(() => {
    if (sttRef.current) {
      try { sttRef.current.stop(); } catch { /* */ }
      sttRef.current = null;
    }
    if (sttBufferRef.current.trim()) {
      addSegment(sttBufferRef.current.trim());
      sttBufferRef.current = '';
    }
    setSttActive(false);
    toast.success('语音识别已停止');
  }, [addSegment]);

  // ── Filter segments by search ──
  const filteredSegments = activeVideo
    ? searchQuery.trim()
      ? displaySegments.filter(
          (s) =>
            s.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.zh.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : displaySegments
    : [];

  // ── Render ──
  return (
    <div className="flex flex-col h-full">
      {/* ── Title ── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
        <h1 className="text-lg font-black text-foreground">英语口语视频学习</h1>
        <p className="text-xs text-muted-foreground mt-0.5">观看视频 → 同步字幕 → 重点词汇学习</p>
      </div>

      {/* ── Library section ── */}
      <div className="px-4 sm:px-6 pb-3 space-y-3">
        {/* Level filter tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {LEVEL_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setLevelFilter(tab.key)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                levelFilter === tab.key
                  ? 'bg-[#00B894] text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="shrink-0 rounded-xl text-xs font-bold gap-1"
          >
            <Plus className="size-3.5" />添加视频
          </Button>
        </div>

        {/* Video cards — grouped by level when showing "全部" */}
        {videos.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            该级别暂无视频，点击"添加视频"自定义
          </div>
        ) : levelFilter === 'all' ? (
          (['beginner', 'intermediate', 'advanced'] as const).map((lvl) => {
            const levelVideos = videos.filter((v) => v.level === lvl);
            if (levelVideos.length === 0) return null;
            const levelLabel = lvl === 'beginner' ? '初级' : lvl === 'intermediate' ? '中级' : '高级';
            const levelColor = lvl === 'beginner' ? 'text-emerald-600' : lvl === 'intermediate' ? 'text-amber-600' : 'text-rose-600';
            return (
              <div key={lvl}>
                <h3 className={cn('text-xs font-black uppercase tracking-wider mb-2', levelColor)}>
                  {levelLabel} · {levelVideos.length} 个合集
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none">
                  {levelVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      active={activeVideo?.id === video.id}
                      onClick={() => handleSelectVideo(video)}
                      onDelete={(e) => handleDeleteVideo(e, video)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                active={activeVideo?.id === video.id}
                onClick={() => handleSelectVideo(video)}
                onDelete={(e) => handleDeleteVideo(e, video)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Player + Transcript (side by side on desktop) ── */}
      {activeVideo ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 px-4 sm:px-6 pb-4 sm:pb-6">
          {/* Player column */}
          <div className="lg:w-[55%] xl:w-[60%] shrink-0">
            <div className="aspect-video bg-black rounded-2xl overflow-hidden">
              <iframe
                ref={iframeRef}
                src={bilibiliUrl(activeVideo.bvid, currentPage, Math.max(0, Math.floor(currentTime - 2)))}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={activeVideo.title}
              />
            </div>
            {/* Video info */}
            <div className="mt-2 flex items-start gap-2 px-1">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-foreground truncate">
                  {activeVideo.titleZh || activeVideo.title}
                </h2>
                <p className="text-[10px] text-muted-foreground">{activeVideo.channel}</p>
              </div>
              <Badge
                className={cn(
                  'shrink-0 text-[10px] font-bold',
                  activeVideo.level === 'beginner' && 'bg-emerald-100 text-emerald-700',
                  activeVideo.level === 'intermediate' && 'bg-amber-100 text-amber-700',
                  activeVideo.level === 'advanced' && 'bg-rose-100 text-rose-700',
                )}
              >
                {activeVideo.level === 'beginner' ? '初级' : activeVideo.level === 'intermediate' ? '中级' : '高级'}
              </Badge>
            </div>

            {/* Episode navigation — for multi-episode collections */}
            {episodeList.length > 1 && (
              <div className="mt-3 px-1">
                <div className="flex items-center gap-1">
                  {/* Prev button */}
                  <button
                    onClick={() => handleSwitchEpisode(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className={cn(
                      'shrink-0 size-7 rounded-lg flex items-center justify-center transition-all text-xs font-bold',
                      currentPage <= 1
                        ? 'text-muted-foreground/30 cursor-not-allowed'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <ChevronLeft className="size-4" />
                  </button>

                  {/* Episode chips — scrollable + wheel support */}
                  <div
                    className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1"
                    onWheel={(e) => {
                      e.currentTarget.scrollLeft += e.deltaY > 0 ? 60 : -60;
                    }}
                  >
                    {episodeList.map((ep) => (
                      <button
                        key={ep.page}
                        onClick={() => handleSwitchEpisode(ep.page)}
                        className={cn(
                          'shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap',
                          currentPage === ep.page
                            ? 'bg-[#00B894] text-white shadow-sm'
                            : 'bg-muted text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {ep.part.length > 18 ? ep.part.slice(0, 16) + '…' : ep.part}
                      </button>
                    ))}
                  </div>

                  {/* Next button */}
                  <button
                    onClick={() => handleSwitchEpisode(Math.min(episodeList.length, currentPage + 1))}
                    disabled={currentPage >= episodeList.length}
                    className={cn(
                      'shrink-0 size-7 rounded-lg flex items-center justify-center transition-all text-xs font-bold',
                      currentPage >= episodeList.length
                        ? 'text-muted-foreground/30 cursor-not-allowed'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                {/* Page indicator */}
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  第 {currentPage} 集 / 共 {episodeList.length} 集
                </p>
              </div>
            )}
          </div>

          {/* Transcript column */}
          <div className="flex-1 flex flex-col min-h-0 lg:pl-4 mt-3 lg:mt-0">
            {/* Search */}
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索字幕..."
                className="w-full h-9 pl-9 pr-4 text-xs rounded-xl border border-border/50 bg-muted/50 outline-none focus:border-[#00B894] focus:ring-2 focus:ring-[#00B894]/20 transition-all"
              />
            </div>

            {/* Segments list */}
            <ScrollArea className="flex-1 rounded-2xl border border-border/50 bg-muted/20">
              <div className="p-3 space-y-1">
                {/* Subtitle source badge and controls */}
                {displaySegments.length > 0 && subtitleSource && (
                  <div className="flex items-center justify-between px-1 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        字幕来源: {subtitleSource === 'bilibili' ? 'B站' : subtitleSource === 'ai' ? 'AI生成' : subtitleSource === 'stt' ? '语音识别' : '手动'}
                      </span>
                      {sttActive && (
                        <span className="flex items-center gap-1">
                          <span className="size-2 rounded-full bg-[#00B894] animate-pulse" />
                          <span className="text-[10px] text-[#00B894] font-bold">识别中</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sttActive ? (
                        <button onClick={handleSTTStop} className="text-[10px] font-bold text-rose-500 hover:underline">
                          停止
                        </button>
                      ) : subtitleSource === 'stt' ? (
                        <>
                          <button onClick={handleSTTStart} className="text-[10px] font-bold text-[#00B894] hover:underline">
                            继续识别
                          </button>
                          <button onClick={() => setShowAddSubtitle(true)} className="text-[10px] font-bold text-muted-foreground hover:underline">
                            重新生成
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setShowAddSubtitle(true)} className="text-[10px] font-bold text-[#00B894] hover:underline">
                          重新生成
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty / No subtitles state */}
                {displaySegments.length === 0 && !subtitleLoading && (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {subtitleSource === 'stt' && sttActive
                        ? '等待语音识别…'
                        : subtitleSource === null
                          ? 'B站未提供字幕'
                          : searchQuery.trim() ? '未找到匹配的字幕' : '暂无字幕'}
                    </p>

                    {!sttActive ? (
                      <div className="flex flex-col gap-2 items-center">
                        <Button
                          size="sm"
                          onClick={handleSTTStart}
                          className="rounded-xl text-xs font-bold gap-1.5 bg-[#00B894] hover:bg-[#00a882]"
                        >
                          <Volume2 className="size-3.5" />语音识别生成字幕
                        </Button>
                        <span className="text-[10px] text-muted-foreground">
                          播放视频后点此，浏览器会自动识别英文并翻译
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setShowAddSubtitle(true)}
                          variant="outline"
                          className="rounded-xl text-xs font-bold gap-1"
                        >
                          <Plus className="size-3.5" />粘贴文本
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 justify-center">
                          <span className="relative flex size-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00B894] opacity-75" />
                            <span className="relative inline-flex size-3 rounded-full bg-[#00B894]" />
                          </span>
                          <span className="text-xs font-bold text-[#00B894]">识别翻译中…</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSTTStop}
                          variant="outline"
                          className="rounded-xl text-xs font-bold gap-1"
                        >
                          <X className="size-3.5" />停止
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Subtitle loading */}
                {subtitleLoading && (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">正在获取字幕…</span>
                  </div>
                )}

                {/* Segment list */}
                {filteredSegments.map((seg, i) => {
                  const isActive = currentSegmentIndex === i;
                  return (
                    <div
                      key={i}
                      ref={(el) => { if (i < segmentRefs.current.length) segmentRefs.current[i] = el; }}
                      onClick={() => seekTo(seg.start)}
                      className={cn(
                        'group rounded-xl p-3 cursor-pointer transition-all duration-200',
                        isActive
                          ? 'bg-[#00B894]/10 border-l-4 border-[#00B894]'
                          : 'hover:bg-muted border-l-4 border-transparent',
                      )}
                    >
                      {/* Time + English */}
                      <div className="flex items-start gap-2">
                        <span className="shrink-0 text-[10px] font-mono font-bold text-muted-foreground mt-0.5 min-w-[3.5em]">
                          {fmtTime(seg.start)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm leading-relaxed',
                            isActive ? 'font-bold text-foreground' : 'text-foreground/80',
                          )}>
                            {highlightKeywords(seg.en, seg.keywords, handleKeywordClick, isActive)}
                          </p>
                          {/* Chinese translation */}
                          {seg.zh && (
                            <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
                              {seg.zh}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      ) : (
        /* Empty state — no video selected */
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Play className="size-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">选择一个视频开始学习</p>
          </div>
        </div>
      )}

      {/* ── Word Lookup Dialog (same pattern as ArticlePage) ── */}
      <Dialog open={lookupOpen} onOpenChange={setLookupOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-sm rounded-[28px] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2">
              <Hash className="size-5 text-[#00B894]" />
              {lookupWord_State}
              {lookupData?.phonetic && (
                <span className="text-sm font-normal text-muted-foreground">{lookupData.phonetic}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            {lookupLoading ? (
              <p className="text-sm text-muted-foreground">查询中…</p>
            ) : (
              <div className="space-y-3">
                {lookupData?.zhMeaning && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">中文释义</p>
                    <p className="text-sm font-bold text-[#00B894]">{lookupData.zhMeaning}</p>
                  </div>
                )}
                {lookupData?.meaning && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">英文释义</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{lookupData.meaning}</p>
                  </div>
                )}
                {!lookupData?.meaning && !lookupData?.zhMeaning && (
                  <p className="text-sm text-muted-foreground">未找到释义</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => tts.speak(lookupWord_State, { rate: 0.85 })}
                variant="outline"
                className="rounded-xl text-xs font-bold gap-1 flex-1"
              >
                <Volume2 className="size-3.5" />发音
              </Button>
              <Button
                size="sm"
                onClick={toggleWordFav}
                className={cn('rounded-xl text-xs font-bold gap-1 flex-1', favWord ? 'bg-rose-500 hover:bg-rose-600 text-white' : '')}
                variant={favWord ? 'default' : 'outline'}
              >
                <Heart className={cn('size-3.5', favWord && 'fill-current')} />
                {favWord ? '已收藏' : '收藏'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Custom Video Dialog ── */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setFetchedInfo(null); setFetchingInfo(false); } setShowAddDialog(open); }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black">添加合集视频</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* BVID input + auto-fetch button */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">B站链接 / BVID</label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={customBvid}
                  onChange={(e) => { setCustomBvid(e.target.value); setFetchedInfo(null); }}
                  placeholder="粘贴 B站链接 或 BVID"
                  className="flex-1 rounded-xl text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleFetchInfo}
                  disabled={fetchingInfo}
                  variant="outline"
                  className="shrink-0 rounded-xl text-xs font-bold"
                >
                  {fetchingInfo ? <Loader2 className="size-3.5 animate-spin" /> : '获取信息'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                粘贴完整链接自动提取 BVID，点击"获取信息"自动填写
              </p>
            </div>

            {/* Fetched info display */}
            {fetchedInfo && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 space-y-1">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 truncate">{fetchedInfo.title}</p>
                <div className="flex gap-3 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <span>{fetchedInfo.episodes} 集</span>
                  <span>{fetchedInfo.channel}</span>
                </div>
              </div>
            )}

            {/* Title - auto-filled from fetch */}
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">标题</label>
              <Input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="视频标题（自动获取后自动填充）"
                className="mt-1 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">中文标题（可选）</label>
              <Input
                value={customTitleZh}
                onChange={(e) => setCustomTitleZh(e.target.value)}
                placeholder="中文标题"
                className="mt-1 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">难度</label>
              <div className="flex gap-2 mt-1">
                {(['beginner', 'intermediate', 'advanced'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setCustomLevel(lvl)}
                    className={cn(
                      'flex-1 py-1.5 rounded-xl text-xs font-bold transition-all',
                      customLevel === lvl
                        ? 'bg-[#00B894] text-white'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {lvl === 'beginner' ? '初级' : lvl === 'intermediate' ? '中级' : '高级'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl text-xs font-bold">
              取消
            </Button>
            <Button onClick={handleAddCustom} className="rounded-xl text-xs font-bold bg-[#00B894] hover:bg-[#00a882]">
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Subtitle / AI Generate Dialog ── */}
      <Dialog open={showAddSubtitle} onOpenChange={setShowAddSubtitle}>
        <DialogContent aria-describedby={undefined} className="max-w-lg rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black">添加字幕</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">粘贴英文原文</label>
              <textarea
                value={pastedTranscript}
                onChange={(e) => setPastedTranscript(e.target.value)}
                placeholder="从 YouTube 或其他来源复制视频的英文转录文本，粘贴到这里..."
                rows={8}
                className="w-full mt-1 rounded-xl border border-border/50 bg-muted/50 p-3 text-sm outline-none focus:border-[#00B894] focus:ring-2 focus:ring-[#00B894]/20 transition-all resize-y"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                AI 会自动分段、翻译中文、标注重点词汇
              </p>
            </div>
            <Button
              onClick={handleProcessTranscript}
              disabled={aiProcessing || !pastedTranscript.trim() || !ai.isConfigured}
              className="w-full rounded-xl text-xs font-bold bg-[#00B894] hover:bg-[#00a882] gap-2"
            >
              {aiProcessing ? (
                <><Loader2 className="size-4 animate-spin" />AI 处理中…</>
              ) : (
                <><Sparkles className="size-4" />AI 自动生成字幕</>
              )}
            </Button>
            {!ai.isConfigured && (
              <p className="text-xs text-rose-500 text-center">请先在 AI 对话页面配置 API Key</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Helper: render keyword-highlighted text ──
function highlightKeywords(
  text: string,
  keywords: VideoKeyword[],
  onClick: (word: string) => void,
  isActive: boolean,
): React.ReactNode {
  if (!keywords || keywords.length === 0) return text;

  // Sort keywords by length (longest first) to match multi-word phrases first
  const sorted = [...keywords].sort((a, b) => b.word.length - a.word.length);

  // Build regex
  const escaped = sorted.map((k) => k.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const kw = sorted.find((k) => k.word.toLowerCase() === part.toLowerCase());
    if (kw) {
      return (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); onClick(kw.word); }}
          className={cn(
            'inline font-medium border-b border-dotted transition-colors',
            isActive
              ? 'text-[#00B894] border-[#00B894]/50 hover:border-[#00B894]'
              : 'text-amber-600 dark:text-amber-400 border-amber-400/30 hover:border-amber-400',
          )}
          title={kw.meaning}
        >
          {part}
        </button>
      );
    }
    return part;
  });
}
