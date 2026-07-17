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
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
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
function bilibiliUrl(bvid: string, t = 0): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0&t=${Math.floor(t)}`;
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
            {fmtTime(video.duration)}
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

  // ── Compute current segment index ──
  const currentSegmentIdx = useRef(-1);
  const currentSegmentIndex = (() => {
    if (!activeVideo) return -1;
    const idx = activeVideo.segments.findIndex(
      (seg) => currentTime >= seg.start && currentTime < seg.end,
    );
    return idx;
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

  // ── Seek in player ──
  const seekTo = useCallback((time: number) => {
    // Try postMessage first
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'seek', data: { time } },
        BILIBILI_ORIGIN,
      );
    } catch { /* fallback below */ }
    // Also update local time immediately
    currentTimeRef.current = time;
    setCurrentTime(time);
  }, []);

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

  // ── Select video ──
  const handleSelectVideo = useCallback((video: VideoEntry) => {
    setActiveVideo(video);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setPlayerReady(false);
    setPlayerPlaying(false);
    segmentRefs.current = new Array(video.segments.length).fill(null);
  }, []);

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

  // ── Filter segments by search ──
  const filteredSegments = activeVideo
    ? searchQuery.trim()
      ? activeVideo.segments.filter(
          (s) =>
            s.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.zh.includes(searchQuery),
        )
      : activeVideo.segments
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

        {/* Video cards horizontal scroll */}
        {videos.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            该级别暂无视频，点击"添加视频"自定义
          </div>
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
                src={bilibiliUrl(activeVideo.bvid, Math.max(0, Math.floor(currentTime - 2)))}
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
                {filteredSegments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {activeVideo.segments.length === 0
                      ? '该视频暂无字幕段，请在数据文件中添加'
                      : '未找到匹配的字幕'}
                  </p>
                )}
                {filteredSegments.map((seg, i) => {
                  const isActive = currentSegmentIndex === i;
                  const globalIdx = activeVideo.segments.indexOf(seg);
                  return (
                    <div
                      key={i}
                      ref={(el) => { if (globalIdx >= 0) segmentRefs.current[globalIdx] = el; }}
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
                          <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
                            {seg.zh}
                          </p>
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
        <DialogContent className="max-w-sm rounded-[28px] p-0 overflow-hidden">
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
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm rounded-[28px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black">添加自定义视频</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bilibili BVID</label>
              <Input
                value={customBvid}
                onChange={(e) => setCustomBvid(e.target.value)}
                placeholder="B站链接 或 BVID（如 BV1xx411c7mD）"
                className="mt-1 rounded-xl text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                支持粘贴完整链接: bilibili.com/video/<b>BV1xx411c7mD</b>
              </p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">英文标题</label>
              <Input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="视频英文标题"
                className="mt-1 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">中文标题（可选）</label>
              <Input
                value={customTitleZh}
                onChange={(e) => setCustomTitleZh(e.target.value)}
                placeholder="视频中文标题"
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
