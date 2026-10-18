/**
 * video-lab — 「视频精听」的数据层：导入视频/音频 + 字幕，统一成句级与词级时间轴。
 *
 * 为什么走"导入"而不是内置转录：whisper 那类转录只能在电脑上跑（本项目三形态
 * 共用一份前端产物，网页版是 https 源、抓不到 http://127.0.0.1 的本地服务，
 * 混合内容会被浏览器直接拦掉）。所以主干是**导入已转录的结果**：
 * 支持 SRT / VTT / dshzmd（本地转录伴侣）的 JSON —— 三种形态行为一致，
 * 以后要接伴侣也只是多一个"从本地服务导入"的入口。
 *
 * 三条刻意的取舍：
 *  1. **媒体 blob 只进 IndexedDB，绝不进 localStorage**（几百 MB 会当场把配额打爆，
 *     而 safeStorage 满了是静默返回 false —— 症状会是"导入没反应"）；
 *  2. **不枚举带 blob 的记录**：列表读一条 `video-index` 轻量索引，
 *     不用 cursor 扫全 store（那等于把用户所有视频读进内存）；
 *  3. **字幕/翻译/blob 分键存**：逐句 AI 翻译要回写，若和 blob 同记录，
 *     每次回写都得重存几十 MB。
 *
 * 标注（收藏句 / 生词）不在这里 —— 走全站唯一的 `use-favorites` 与生词本，
 * 于是自动进收藏页、复习队列、云同步与备份，不再造第二套清单。
 */

import { idbMediaDelete, idbMediaGet, idbMediaPut } from './idb';

export interface IVideoWord { w: string; t0: number; t1: number }

export interface IVideoSentence {
  i: number;
  /** 起点（秒） */
  t0: number;
  /** 终点（秒） */
  t1: number;
  text: string;
  /** 词级时间戳；没有就只做句级高亮（卡拉OK 退化成整句） */
  words?: IVideoWord[];
  /** AI 逐句中文（P2 才填；缺失时界面显示"未翻译"而不是空白） */
  zh?: string;
}

export interface IVideoMeta {
  id: string;
  title: string;
  /** 秒；字幕导入且无媒体时取最后一条字幕的 t1 */
  duration: number;
  /** 'en' | 'zh' | 'ja' | '' （未知留空，界面上显示"自动"） */
  lang: string;
  /** 字节数；0 = 只有字幕没有媒体 */
  bytes: number;
  mime: string;
  sentenceCount: number;
  hasWords: boolean;
  createdAt: number;
  /** 已生成逐句中文（列表页用来决定要不要提示"翻译"） */
  hasZh?: boolean;
}

export interface IVideoLesson { meta: IVideoMeta; sentences: IVideoSentence[]; url: string | null }

export const INDEX_KEY = 'video-index';

const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;

/** `00:01:02,500` / `01:02.500` / `750` → 秒；认不出返回 NaN（调用方丢条，不猜） */
export function parseTimestamp(raw: string): number {
  const s = String(raw || '').trim().replace(',', '.');
  if (!s) return NaN;
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** 字幕里常见的内联标记（`<i>`、`<c.yellow>`、`{\an8}`、`v 说话人:`）全部剥掉 */
export function stripCueTags(line: string): string {
  return String(line || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/^\s*v(?:oicer)?\s+[^:]*:\s*/i, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&l?[trc];/gi, '')
    .trim();
}

function normalize(list: Omit<IVideoSentence, 'i'>[]): IVideoSentence[] {
  return list
    .filter((s) => Number.isFinite(s.t0) && Number.isFinite(s.t1) && s.text)
    // 时间轴乱序的字幕不少见（分块导出的 SRT 会这样）：按起点排，不信任原编号
    .sort((a, b) => a.t0 - b.t0)
    .map((s, i) => ({
      i,
      t0: round(s.t0),
      t1: round(Math.max(s.t1, s.t0)),
      text: s.text,
      ...(s.words && s.words.length ? { words: s.words.map((w) => ({ w: w.w, t0: round(w.t0), t1: round(w.t1) })) } : {}),
    }));
}

/** SRT：`序号 / 00:00:01,000 --> 00:00:03,000 / 文本(可多行) / 空行` */
export function parseSrt(text: string): Omit<IVideoSentence, 'i'>[] {
  const body = String(text || '').replace(/^\uFEFF/, '');
  const out: Omit<IVideoSentence, 'i'>[] = [];
  for (const block of body.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const text = stripCueTags(lines.slice(ti + 1).join(' ').replace(/\s+/g, ' '));
    if (!text) continue;
    out.push({ t0: parseTimestamp(a), t1: parseTimestamp(b), text });
  }
  return out;
}

/** VTT：头部 `WEBVTT` + 可选 `Kind/Language`，cue 与 SRT 同构；`NOTE` 块要跳过 */
export function parseVtt(text: string): Omit<IVideoSentence, 'i'>[] {
  const body = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cleaned = body.split(/\n{2,}/).filter((blk) => !/^NOTE\b/.test(blk)).join('\n\n');
  return parseSrt(cleaned);
}

/**
 * dshzmd（本地转录伴侣）导出的 JSON：
 * `{result:{video_name,duration,language,sentences:[{i,t0,t1,text,words:[{w,t0,t1}]}]}}`
 * 也接受裸的 `{sentences:[...]}`。字段名与它保持一致，别在这层改名 ——
 * 以后接实时服务时这一条解析器可以直接吃 SSE 的最终结果。
 */
export function parseDshJson(text: string): { meta: Partial<IVideoMeta>; list: Omit<IVideoSentence, 'i'>[] } {
  const raw = JSON.parse(String(text || '{}'));
  const r = raw?.result ?? raw;
  const src: any[] = Array.isArray(r?.sentences) ? r.sentences : Array.isArray(r) ? r : [];
  const list = src.map((s) => ({
    t0: Number(s.t0 ?? s.start ?? 0),
    t1: Number(s.t1 ?? s.end ?? s.t0 ?? 0),
    text: stripCueTags(String(s.text ?? s.content ?? '')),
    ...(Array.isArray(s.words) && s.words.length
      ? { words: s.words.map((w: any) => ({ w: String(w.w ?? (typeof w === 'string' ? w : '')), t0: Number(w.t0 ?? w.start ?? 0), t1: Number(w.t1 ?? w.end ?? 0) })) }
      : {}),
  }));
  return {
    meta: {
      title: String(r?.video_name || r?.title || ''),
      duration: Number(r?.duration || 0),
      lang: String(r?.language || ''),
    },
    list,
  };
}

/** 导入时按内容判格式（用户不会先知道自己是 VTT 还是 SRT） */
export function detectSubtitleFormat(text: string): 'srt' | 'vtt' | 'json' | 'unknown' {
  const s = String(text || '').replace(/^\uFEFF/, '').trim();
  if (/^WEBVTT/i.test(s)) return 'vtt';
  if (s.startsWith('{') || s.startsWith('[')) return 'json';
  return /\d{1,2}:\d{2}(:\d{2})?[,.]\d{1,3}\s*-->/i.test(s) ? 'srt' : 'unknown';
}

/** 解析成字幕条目；判不出格式时按 SRT 兜一次（很多导出文件没有头部） */
export function parseSubtitle(text: string): { list: IVideoSentence[]; format: string } {
  const format = detectSubtitleFormat(text);
  if (format === 'json') {
    const { list, meta } = parseDshJson(text);
    return { list: normalize(list), format: `json:${meta.title ? 'dshzmd' : 'json'}` };
  }
  const list = format === 'vtt' ? parseVtt(text) : parseSrt(text);
  return { list: normalize(list), format };
}

/** 稳定 id：同一份字幕+同一时长重复导入只有一条（换电脑重进不会堆一堆重复课程） */
export function lessonId(title: string, duration: number, bytes: number): string {
  const src = `${String(title || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${round(duration)}|${bytes}`;
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return `v${(h >>> 0).toString(36)}`;
}

/** 从文件名/标题猜语种（只判中英日，判不出留空给"自动"） */
export function guessLang(text: string): string {
  const s = String(text || '');
  if (/[\u3040-\u30ff]/.test(s)) return 'ja';
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  if (/[a-z]/i.test(s)) return 'en';
  return '';
}

/* ───────────────────────── IndexedDB 读写（分键，不枚举 blob） ───────────────────────── */

type Writer = <T>(id: string, rec: T) => Promise<boolean>;
type Reader = <T>(id: string) => Promise<T | null>;
type Deleter = (id: string) => Promise<unknown>;

export interface IVideoIndexRecord { id: string; items: IVideoMeta[] }
interface IMediaRecord { id: string; blob: Blob }
interface ISubsRecord { id: string; sentences: IVideoSentence[] }
interface IZhRecord { id: string; zh: (string | undefined)[] }

/**
 * 依赖注入而不是直接 import idb：守卫要在 Node 里真跑整段（浏览器没有 IndexedDB，
 * 而"索引更新会不会漏掉一条 / 写失败会不会谎报成功"正是最容易悄悄坏掉的地方）。
 */
export function createVideoStore(api: { put: Writer; get: Reader; del: Deleter }) {
  const readIndex = async (): Promise<IVideoMeta[]> => {
    const rec = await api.get<IVideoIndexRecord>(INDEX_KEY);
    return Array.isArray(rec?.items) ? rec!.items : [];
  };
  const writeIndex = async (items: IVideoMeta[]) => (await api.put<IVideoIndexRecord>(INDEX_KEY, { id: INDEX_KEY, items }));

  async function list(): Promise<IVideoMeta[]> {
    const items = await readIndex();
    return [...items].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** 保存一课。任何一步写失败都返回 false 并**不**更新索引（不留半条课程） */
  async function save(meta: IVideoMeta, sentences: IVideoSentence[], blob: Blob | null): Promise<boolean> {
    if (!meta.id || !sentences.length) return false;
    if (blob && !(await api.put<IMediaRecord>(`m:${meta.id}`, { id: `m:${meta.id}`, blob }))) return false;
    if (!(await api.put<ISubsRecord>(`s:${meta.id}`, { id: `s:${meta.id}`, sentences }))) return false;
    const items = await readIndex();
    const next = [meta, ...items.filter((x) => x.id !== meta.id)];
    // 索引封顶：50 课足够用，超出的**旧**条目连媒体一起删（不然几百 MB 永远躺在盘上）
    const dropped = next.slice(50);
    for (const d of dropped) {
      await api.del(`m:${d.id}`);
      await api.del(`s:${d.id}`);
      await api.del(`z:${d.id}`);
    }
    return writeIndex(next.slice(0, 50));
  }

  /** 读一课；blob 换成 object URL（**调用方必须 revoke**，泄漏比缓存更贵） */
  async function load(id: string): Promise<IVideoLesson | null> {
    const items = await readIndex();
    const meta = items.find((x) => x.id === id);
    if (!meta) return null;
    const subs = await api.get<ISubsRecord>(`s:${id}`);
    const zh = await api.get<IZhRecord>(`z:${id}`);
    const media = await api.get<IMediaRecord>(`m:${id}`);
    const sentences = (subs?.sentences || []).map((s, i) => ({ ...s, zh: zh?.zh?.[i] || s.zh }));
    /**
     * 只有字幕、没有媒体是**合法形态**（网页版导入 SRT 就是这样，播放器位置显示"用朗读代替原声"）；
     * 而 blob 取不回/不是 Blob（记录被半途中断写坏、别的浏览器导出的）时也不许把页面掀翻 ——
     * 宁可 url=null 退化成"无原声"，所以这里判类型 + 兜异常。
     */
    let url: string | null = null;
    const blob = (media as { blob?: unknown } | null)?.blob;
    if (typeof Blob !== 'undefined' && blob instanceof Blob) {
      try { url = URL.createObjectURL(blob); } catch { url = null; }
    }
    return { meta, sentences, url };
  }

  async function saveZh(id: string, zh: (string | undefined)[]): Promise<boolean> {
    const okWrite = await api.put<IZhRecord>(`z:${id}`, { id: `z:${id}`, zh });
    if (!okWrite) return false;
    const items = await readIndex();
    const hit = items.find((x) => x.id === id);
    if (hit) { hit.hasZh = zh.some(Boolean); await writeIndex([...items]); }
    return true;
  }

  async function remove(id: string): Promise<boolean> {
    await api.del(`m:${id}`);
    await api.del(`s:${id}`);
    await api.del(`z:${id}`);
    const items = await readIndex();
    return writeIndex(items.filter((x) => x.id !== id));
  }

  return { list, save, load, saveZh, remove };
}

/** 进度与复读点（小、可同步）：一条媒体一份，存 safeStorage */
export interface IVideoProgress { lastI: number; listened: number; ab: { a: number; b: number } | null; rate: number; updatedAt: number }

/** 全站唯一入口：页面只 import 这个，别处不再自己拼 idb 键名 */
export const videoStore = createVideoStore({
  put: (id, rec) => idbMediaPut({ ...(rec as object), id } as { id: string }),
  get: (id) => idbMediaGet(id),
  del: (id) => idbMediaDelete(id),
});

export function mergeProgress(
  all: Record<string, IVideoProgress>,
  id: string,
  patch: Partial<IVideoProgress>,
  now = Date.now(),
  cap = 80,
): Record<string, IVideoProgress> {
  const prev = all[id] || { lastI: 0, listened: 0, ab: null, rate: 1, updatedAt: 0 };
  const next = { ...all, [id]: { ...prev, ...patch, updatedAt: now } };
  const keys = Object.keys(next);
  if (keys.length > cap) {
    keys.sort((a, b) => next[a].updatedAt - next[b].updatedAt)
      .slice(0, keys.length - cap)
      .forEach((k) => { delete next[k]; });
  }
  return next;
}

/** 跟读比对用的归一分词：小写、剥标点（撇号也剥，识别引擎加不加缩写字母各家不一样），空 token 丢掉 */
export function tokenizeSpeech(s: string): string[] {
  return String(s ?? '').toLowerCase().split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
}

export interface ISpeechScore {
  /** 0–1：按目标句的词序命中比例（最长公共子序列 / 目标词数） */
  accuracy: number;
  targetWords: string[];
  /** 目标句里没被认出来的词（去重、保序） */
  missed: string[];
  spokenWords: string[];
}

/**
 * 跟读评分：把识别到的串和目标句按词序对齐。
 * 用 LCS 而不是集合交集 —— "the book is on the table" 里 the 出现两次，
 * 只答对一次不该算两次；也不用编辑距离，多说的插入词不该压低命中数。
 */
export function scoreSpeech(target: string, spoken: string): ISpeechScore {
  const a = tokenizeSpeech(target);
  const b = tokenizeSpeech(spoken);
  if (a.length === 0) return { accuracy: 0, targetWords: [], missed: [], spokenWords: b };
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 沿 DP 表走一遍，标出被认出的目标词；没标上的就是漏读/读错的
  const matched = new Array(a.length).fill(false);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { matched[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const seen = new Set<string>();
  const missed: string[] = [];
  a.forEach((w, k) => { if (!matched[k] && !seen.has(w)) { seen.add(w); missed.push(w); } });
  return { accuracy: (dp[0][0] || 0) / a.length, targetWords: a, missed, spokenWords: b };
}

/**
 * 字幕批量翻译的调度层 —— 页面只负责喂 ask/parse，并发、批次、增量回调都收在这里，
 * 因为只有这一层能被守卫真跑（页面里的 setState 看不见摸不着）。
 */
export interface IBatchTranslateInput {
  /** 待翻条目：k 是它在整课里的下标（译文要落回原位） */
  items: { k: number; text: string }[];
  /** 每批句数，默认 8 */
  batchSize?: number;
  /** 并发批数，默认 3（出厂免费档上游只允许 1 路，页面据此传 1） */
  concurrency?: number;
  /** 发一批出去，拿回原始文本；通道坏了/超时就在 resolve 里给空串 */
  ask: (numberedBody: string, count: number) => Promise<string>;
  /** 把原始文本收成「批内序号 → 译文」（整书翻译那套编号 JSON 口径） */
  parse: (raw: string, count: number) => Map<number, string>;
  /** 每批完成就回调，带的是到目前为止攒下的全部译文（k → zh） */
  onBatch: (filled: ReadonlyMap<number, string>) => void;
  /** 每批取活前问一次：课程已换走 / 页面已卸载就别再往下打 */
  stopped?: () => boolean;
  /** 拿不到内容的批次退回队尾重试一次（默认开）；连坏两批才整轮收摊 */
  retryFailed?: boolean;
}
export interface IBatchTranslateResult {
  filled: Map<number, string>;
  /** 这一轮排了多少批 */
  batches: number;
  /** 实际发出的请求数（含重试；比 batches 大＝有批被重试过） */
  attempted: number;
  /** 退回队尾重试过的批数 */
  retried: number;
  /** items 里最终没拿到译文的句数 */
  missed: number;
  /** 是否因为连着两批拿不到内容而提前结束 */
  haltedEarly: boolean;
}

/**
 * 编号 JSON 的批次翻译调度：小批 + 每批增量回调。四条规定都是实测换来的：
 * 1. 每批完成立刻 onBatch，调用方据此上屏落盘 —— 让用户几十秒里一直等最后一个字节是不可接受的；
 * 2. 单批拿不到内容（服务不可用 / 被限流 / 超时不回包，实测真遇到过）退回队尾重试一次，
 *    一次抖动不该把整轮几十句一起废掉；连着两批都坏才收摊，别把额度打在死通道上；
 * 3. stopped() 为真就不再取新活，已经在途的那批回来照样收下（译文属于它自己那一课）；
 * 4. 并发由调用方给：上游免费档只允许 1 路，抢并发只会把每批从 4 秒拖成 30 秒。
 */
export async function runBatchTranslation(o: IBatchTranslateInput): Promise<IBatchTranslateResult> {
  const size = Math.max(1, Math.floor(o.batchSize ?? 8));
  const queue: { lines: { k: number; text: string }[]; fresh: boolean }[] = [];
  for (let i = 0; i < o.items.length; i += size) queue.push({ lines: o.items.slice(i, i + size), fresh: true });
  const filled = new Map<number, string>();
  const batches = queue.length;
  let haltedEarly = false;
  let attempted = 0;
  let retried = 0;
  let consecutiveBad = 0;
  const worker = async () => {
    while (!haltedEarly && !o.stopped?.()) {
      const task = queue.shift();
      if (!task) return;
      attempted++;
      const raw = await o.ask(task.lines.map((x, i) => `[${i + 1}] ${x.text}`).join('\n'), task.lines.length);
      const parsed = o.parse(String(raw || ''), task.lines.length);
      if (!parsed.size) {
        consecutiveBad++;
        /** 先判收摊再谈重试：连着两批拿不到内容就说明通道此刻是坏的/被限流，继续发只会白烧额度 */
        if (consecutiveBad >= 2) { haltedEarly = true; return; }
        if (task.fresh && o.retryFailed !== false) { task.fresh = false; queue.push(task); retried++; }
        continue;   // 只坏过一次的批记进 missed，后面的照常翻
      }
      consecutiveBad = 0;
      parsed.forEach((zh, idx) => {
        const hit = task.lines[idx];
        if (hit && zh) filled.set(hit.k, zh);
      });
      o.onBatch(filled);
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(Math.max(1, o.concurrency ?? 3), queue.length) }, () => worker()));
  return { filled, batches, attempted, retried, missed: o.items.filter((x) => !filled.has(x.k)).length, haltedEarly };
}
