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
  thumbnail: string;     // 封面图 URL（B站封面: https://i0.hdslb.com/bfs/archive/{hash}.jpg）
  segments: VideoSegment[];
}

// ── 预置视频库 ──
// 下方为示例数据，BVID 需替换为真实的 Bilibili 视频 ID
const _library: VideoEntry[] = [
  {
    id: 'english_with_lucy_1',
    bvid: 'BV1GJ411x7x8', // ⚠️ 替换为真实 BVID
    title: '10 English Words You Pronounce Wrong',
    titleZh: '你读错的 10 个英语单词',
    channel: 'English with Lucy',
    level: 'intermediate',
    duration: 420,
    thumbnail: '',
    segments: [
      {
        start: 0, end: 12,
        en: 'Hello everyone, welcome back to English with Lucy.',
        zh: '大家好，欢迎回到 English with Lucy。',
        keywords: [
          { word: 'welcome back', meaning: '欢迎回来' },
        ],
      },
      {
        start: 12, end: 30,
        en: 'Today I want to talk about ten words that English learners often pronounce incorrectly.',
        zh: '今天我想谈谈英语学习者经常发音错误的十个单词。',
        keywords: [
          { word: 'incorrectly', meaning: '错误地' },
          { word: 'pronounce', meaning: '发音' },
        ],
      },
      {
        start: 30, end: 52,
        en: 'These are common words that you use every day, but you might be saying them wrong.',
        zh: '这些是你每天使用的常见词，但你可能会读错。',
        keywords: [
          { word: 'common', meaning: '常见的' },
          { word: 'might', meaning: '可能' },
        ],
      },
      {
        start: 52, end: 75,
        en: 'The first word is "vegetable". Many people say "ve-ge-ta-ble" but it should be "veg-ta-ble".',
        zh: '第一个词是 "vegetable"。很多人说成 "ve-ge-ta-ble"，但应该是 "veg-ta-ble"。',
        keywords: [
          { word: 'vegetable', meaning: '蔬菜' },
          { word: 'should', meaning: '应该' },
        ],
      },
      {
        start: 75, end: 95,
        en: 'The second word is "comfortable". Not "com-for-ta-ble", but "comf-ta-ble".',
        zh: '第二个词是 "comfortable"。不是 "com-for-ta-ble"，而是 "comf-ta-ble"。',
        keywords: [
          { word: 'comfortable', meaning: '舒适的' },
        ],
      },
      {
        start: 95, end: 120,
        en: 'The third word is "probably". Many learners say "pro-ba-bly" but the correct pronunciation is "prob-ly".',
        zh: '第三个词是 "probably"。很多学习者说 "pro-ba-bly"，但正确发音是 "prob-ly"。',
        keywords: [
          { word: 'probably', meaning: '很可能' },
          { word: 'pronunciation', meaning: '发音' },
        ],
      },
    ],
  },
  {
    id: 'bbc_learning_1',
    bvid: 'BV1nE411k7qW', // ⚠️ 替换为真实 BVID
    title: 'How to Speak English Fluently',
    titleZh: '如何流利说英语',
    channel: 'BBC Learning English',
    level: 'intermediate',
    duration: 360,
    thumbnail: '',
    segments: [
      {
        start: 0, end: 15,
        en: 'Hello and welcome to BBC Learning English.',
        zh: '你好，欢迎来到 BBC 学习英语。',
        keywords: [
          { word: 'welcome', meaning: '欢迎' },
        ],
      },
      {
        start: 15, end: 35,
        en: 'In this lesson we will look at how to speak English more fluently and naturally.',
        zh: '在本课中，我们将学习如何更流利、更自然地讲英语。',
        keywords: [
          { word: 'fluently', meaning: '流利地' },
          { word: 'naturally', meaning: '自然地' },
        ],
      },
      {
        start: 35, end: 58,
        en: 'One important tip is to practice speaking every day, even if only for five minutes.',
        zh: '一个重要建议是每天练习口语，即使只有五分钟。',
        keywords: [
          { word: 'important', meaning: '重要的' },
          { word: 'tip', meaning: '建议、窍门' },
          { word: 'practice', meaning: '练习' },
        ],
      },
      {
        start: 58, end: 82,
        en: 'Another tip is to think in English instead of translating from your native language.',
        zh: '另一个建议是用英语思考，而不是从母语翻译。',
        keywords: [
          { word: 'instead of', meaning: '而不是' },
          { word: 'native language', meaning: '母语' },
        ],
      },
      {
        start: 82, end: 105,
        en: 'You can also watch English movies and TV shows to improve your listening skills.',
        zh: '你也可以看英语电影和电视节目来提高听力技能。',
        keywords: [
          { word: 'improve', meaning: '提高、改善' },
          { word: 'listening skills', meaning: '听力技能' },
        ],
      },
    ],
  },
  {
    id: 'ted_talk_1',
    bvid: 'BV1nE411k7qW', // ⚠️ 替换为真实 BVID
    title: 'The Power of Body Language',
    titleZh: '肢体语言的力量',
    channel: 'TED Talks',
    level: 'advanced',
    duration: 600,
    thumbnail: '',
    segments: [
      {
        start: 0, end: 18,
        en: 'When we think about communication, we often focus on the words we use.',
        zh: '当我们想到交流时，我们常常关注使用的词语。',
        keywords: [
          { word: 'communication', meaning: '交流、沟通' },
          { word: 'focus on', meaning: '专注于' },
        ],
      },
      {
        start: 18, end: 42,
        en: 'But research shows that body language can be even more important than the words we say.',
        zh: '但研究表明，肢体语言可能比我们说的话更重要。',
        keywords: [
          { word: 'research', meaning: '研究' },
          { word: 'body language', meaning: '肢体语言' },
        ],
      },
      {
        start: 42, end: 65,
        en: 'Our gestures, facial expressions, and posture all send powerful messages to others.',
        zh: '我们的手势、面部表情和姿势都在向他人传递强有力的信息。',
        keywords: [
          { word: 'gestures', meaning: '手势' },
          { word: 'facial expressions', meaning: '面部表情' },
          { word: 'posture', meaning: '姿势' },
        ],
      },
    ],
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
