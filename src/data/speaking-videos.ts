/**
 * 英语口语视频库 — 预置 Bilibili 视频 + 字幕数据
 *
 * 使用方式：
 *   1. 在 Bilibili 打开一个英语口语视频
 *   2. 从 URL 中提取 BVID（如 BV1xx411c7mD）
 *   3. 在此添加一条 VideoEntry 记录，填入字幕段数据
 */

export interface VideoKeyword {
  word: string;
  meaning: string;
}

export interface VideoSegment {
  start: number; // 起始秒数
  end: number;   // 结束秒数
  en: string;    // 英文原文
  zh: string;    // 中文翻译
  keywords: VideoKeyword[]; // 重点词汇
}

export interface VideoEntry {
  id: string;
  bvid: string;          // Bilibili 视频 BVID
  title: string;         // 英文标题
  titleZh: string;       // 中文标题
  channel: string;       // 频道名称
  level: 'beginner' | 'intermediate' | 'advanced';
  duration: number;      // 总时长（秒）
  episodes?: number;     // 合集集数（多集视频）
  thumbnail: string;     // 封面图 URL（B站封面: https://i0.hdslb.com/bfs/archive/{hash}.jpg）
  segments: VideoSegment[];
}

// ── 预置视频库 ──
// 下方为示例数据，BVID 需替换为真实的 Bilibili 视频 ID
const _library: VideoEntry[] = [
  {
    id: 'youtube_podcast_beginner',
    bvid: 'BV1MN4dewEQZ',
    title: 'Best YouTube English Podcasts - Beginner',
    titleZh: 'YouTube最好的英语播客·初级版',
    channel: 'YouTube口语精选',
    level: 'beginner',
    duration: 27426,
    thumbnail: '',
    episodes: 26,
    segments: [],
  },
  {
    id: 'youtube_podcast_intermediate',
    bvid: 'BV1p3txezEnP',
    title: 'Best YouTube English Podcasts - Intermediate',
    titleZh: 'YouTube最好的英语播客·中阶版',
    channel: 'YouTube口语精选',
    level: 'intermediate',
    duration: 24645,
    thumbnail: '',
    episodes: 23,
    segments: [],
  },
  {
    id: 'youtube_podcast_advanced',
    bvid: 'BV12Qt8eoEQ3',
    title: 'Best YouTube English Podcasts - Advanced',
    titleZh: 'YouTube最好的英语播客·高阶版',
    channel: 'YouTube口语精选',
    level: 'advanced',
    duration: 34140,
    thumbnail: '',
    episodes: 30,
    segments: [],
  },
  {
    id: 'ted_talks_100',
    bvid: 'BV1UbyZB9ERb',
    title: '100 TED Talks Collection',
    titleZh: '必看100场TED演讲合集',
    channel: 'YouTube英语课堂',
    level: 'intermediate',
    duration: 72471,
    thumbnail: '',
    episodes: 100,
    segments: [],
  },
];

// ── Public API ──

export function getAllVideos(): VideoEntry[] {
  return _library;
}

export function getVideosByLevel(level?: string): VideoEntry[] {
  if (!level || level === 'all') return _library;
  return _library.filter((v) => v.level === level);
}

export function getVideoById(id: string): VideoEntry | undefined {
  return _library.find((v) => v.id === id);
}

export function addCustomVideo(video: VideoEntry): void {
  _library.push(video);
}

export function removeVideo(id: string): void {
  const idx = _library.findIndex((v) => v.id === id);
  if (idx !== -1) _library.splice(idx, 1);
}
