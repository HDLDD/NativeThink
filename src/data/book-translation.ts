/**
 * book-translation — 书籍批量对照翻译引擎（纯数据层，无 UI）
 *
 * 解决"逐段 AI 翻译太慢"的痛点：按章组织翻译任务，把同一章 3-5 个连续段落
 * 合并进一次 AI 请求（编号 + 严格 JSON 回填），整章 40 段只需约 8-13 次请求；
 * 章节译文落 IndexedDB 断点续传，支持随时中止、进度回调、限流退避与失败跳过。
 *
 * 存储结构（复用 src/lib/idb.ts 的 'wordbank' KV store，key 任意）：
 *   booktrans-<bookId>-ch<chapterIdx> → string[]（该章非标题段译文，下标 = splitChapters 顺序）
 *   booktrans-<bookId>-index          → ITranslationManifest（已存章节清单 + 总章数，用于枚举/统计）
 *
 * 基本用法：
 *   import { translateBook, splitChapters, getCachedBookTranslation } from '@/data/book-translation';
 *   const ac = new AbortController();
 *   const res = await translateBook(fullBook, { signal: ac.signal, onProgress: (p) => console.log(p) });
 *
 * 详见 src/data/book-translation.README.md
 */

import type { IReadingContent } from './reading';
import { idbGet, idbSet, idbDelete } from '@/lib/idb';

// ─────────────────────────── 常量 ───────────────────────────

import { translateWithLocalMt, isLocalMtReady, getTranslateEngine } from '@/lib/local-mt';

const CHAPTER_MARKER = '##CHAPTER##';
/** 单段送入 AI 的最大字符数（与 PageReader 逐段翻译的截断口径一致） */
const MAX_SEGMENT_CHARS = 1500;
const DEFAULT_BATCH_SIZE = 4; // 规格：每批 3-5 个连续段落
const DEFAULT_CONCURRENCY = 2; // 章内 2 并发，全书串行
/** 失败退避重试间隔（ms）：3s → 8s → 15s，全部失败则跳过该段继续 */
const DEFAULT_RETRY_DELAYS_MS = [3000, 8000, 15000];

const chapterKeyOf = (bookId: string, chapterIdx: number): string =>
  `booktrans-${bookId}-ch${chapterIdx}`;
const manifestKeyOf = (bookId: string): string => `booktrans-${bookId}-index`;

/** 防止同一本书被重复启动翻译（模块级单飞守卫） */
const activeRuns = new Set<string>();

// ─────────────────────────── 类型 ───────────────────────────

/** splitChapters 切出的一章 */
export interface IBookChapter {
  /** 章节下标（0 起，按全书段落流顺序） */
  index: number;
  /** 章节标题（##CHAPTER## 之后的文本）；首个章节标记之前的正文归入 title='' 的开篇章 */
  title: string;
  /**
   * 本章待翻译段落英文原文（不含章节标题段，含空段以保持"非标题段顺序"对齐）。
   * 数组下标 = IDB 译文数组的下标。
   */
  paragraphs: string[];
}

/** translateBook 的进度回调负载（segDone/segTotal 为当前章口径） */
export interface ITranslateProgress {
  chapterIdx: number;
  chapterTitle: string;
  /** 当前章已完成段数（含缓存跳过与无需翻译的空段） */
  segDone: number;
  /** 当前章总段数 */
  segTotal: number;
  /** 全书已完成章节数 */
  chaptersDone: number;
  chaptersTotal: number;
}

export interface ITranslateBookOptions {
  /** 每次请求合并的连续段落数（建议 3-5），默认 4 */
  batchSize?: number;
  /** 章内并发请求数，默认 2（章与章之间始终串行） */
  concurrency?: number;
  /** 传入 AbortController.signal 可随时中止；已落盘进度保留，可再次运行续传 */
  signal?: AbortSignal;
  /** 进度回调 */
  onProgress?: (p: ITranslateProgress) => void;
  /** 请求失败后的退避重试间隔（ms），默认 [3000, 8000, 15000] */
  retryDelaysMs?: number[];
}

export interface ITranslateBookResult {
  /** 是否完整跑完全书（false = 被中止；已完成的章节进度已落盘） */
  completed: boolean;
  /** 本次新翻译成功的段落数 */
  translated: number;
  /** 重试后仍失败被跳过的段落数（缓存留空，再次运行会自动补翻） */
  failed: number;
  chaptersDone: number;
  chaptersTotal: number;
}

export interface IBookTranslationStats {
  /** 已有缓存记录的章节数（传入 book 时只统计整章全部段落已译的） */
  translatedChapters: number;
  /** 全书总章数：优先按传入 book 实时切分；否则用上次翻译记录；均无则为 null */
  totalChapters: number | null;
  /** 已译（非空）段落数 */
  translatedSegments: number;
  /** 全书总段数（口径同 totalChapters，未知为 null） */
  totalSegments: number | null;
}

/** booktrans-<bookId>-index 清单记录（IDB 无 key 枚举能力，用它登记已写章节） */
interface ITranslationManifest {
  /** 已写入章节缓存的章节下标 */
  chapters: number[];
  /** 最近一次翻译时的全书总章数 */
  chapterCount: number;
  updatedAt: number;
}

interface IResolvedOptions {
  batchSize: number;
  concurrency: number;
  retryDelaysMs: number[];
  signal?: AbortSignal;
  onProgress?: (p: ITranslateProgress) => void;
}

/** translateBatch 的产物：localIdx（批内 0 起）→ 译文 */
interface IBatchOutcome {
  translations: Map<number, string>;
  failedCount: number;
}

// ─────────────────────────── 章节切分 ───────────────────────────

/**
 * 从 book.pages 的段落流里按 ##CHAPTER## 切出章节数组。
 * 章节标题段只用于定界，不算翻译对象；标题前/书首无标记的正文归入 title='' 的开篇章；
 * 连续空章节会被丢弃，最终 index 连续化。空段保留在 paragraphs 里以保持与
 * "该章非标题段顺序"严格对齐（翻译时自动视为无需处理）。
 */
export function splitChapters(book: Pick<IReadingContent, 'pages'>): IBookChapter[] {
  const chapters: IBookChapter[] = [];
  let current: IBookChapter | null = null;

  const closeCurrent = () => {
    if (current && current.paragraphs.length > 0) chapters.push(current);
    current = null;
  };

  for (const page of book.pages ?? []) {
    for (const para of page?.paragraphs ?? []) {
      const en = para?.en ?? '';
      if (en.startsWith(CHAPTER_MARKER)) {
        closeCurrent();
        current = {
          index: chapters.length,
          title: en.slice(CHAPTER_MARKER.length).trim(),
          paragraphs: [],
        };
      } else {
        if (!current) current = { index: chapters.length, title: '', paragraphs: [] };
        current.paragraphs.push(en);
      }
    }
  }
  closeCurrent();

  // 丢弃空章节后重新连续编号
  return chapters.map((c, i) => ({ ...c, index: i }));
}

// ─────────────────────────── Prompt 与解析 ───────────────────────────

/** 批量翻译 system prompt：编号一一对应 + 严格 JSON 输出 */
const BATCH_SYSTEM_PROMPT = [
  '你是一位经验丰富的文学翻译，负责把英文原著段落翻译成自然流畅、符合中文母语习惯的简体中文。',
  '输入为若干带编号的英文段落（[1]、[2]……）。要求：',
  '1. 逐段翻译，译文的编号与输入严格一一对应，不增、不减、不改变顺序；',
  '2. 译文符合母语者表达习惯，避免翻译腔；人名可保留英文；',
  '3. 去掉原文中的斜体标记（成对下划线 _..._），译文中不要出现下划线；',
  '4. 只输出严格 JSON：{"t":[{"i":1,"zh":"第 1 段译文"},{"i":2,"zh":"……"}]}，不要输出任何解释、注释或 markdown 代码块。',
].join('\n');

/** 逐段兜底翻译 system prompt（与 PageReader 逐段翻译口径一致） */
const SINGLE_SYSTEM_PROMPT =
  'Translate the following English passage into natural, fluent Simplified Chinese ' +
  '(native-speaker phrasing, no translationese). Keep personal names in English. ' +
  'Ignore italic markers (underscores). Return ONLY the Chinese translation — no extra text, no markdown.';

/** 清理模型回显：剥掉可能带上的 "[1]" 编号前缀与首尾空白 */
function cleanZhText(s: string): string {
  return s.replace(/^\s*\[\d+\]\s*[:：]?\s*/, '').trim();
}

/**
 * 健壮解析批量翻译响应 → Map<localIdx(批内 0 起), zh>。
 * 容忍：markdown 代码栅栏、前后夹带的说明文字、缺项/错号、
 * {"t":[{i,zh}]} / [{i,zh}] / ["译文",…] / {"1":"译文"} 等返回形态。
 * 解析失败返回空 Map（调用方据此退化为逐段翻译）。
 */
export function parseBatchTranslation(raw: string, expectedCount: number): Map<number, string> {
  const out = new Map<number, string>();
  if (!raw) return out;

  let text = String(raw).trim();
  // 1) 剥 markdown 代码栅栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) text = fence[1].trim();

  // 2) 依次尝试：原文 → 截取 {…} → 截取 […]（容忍模型在 JSON 前后夹带文字）
  let parsed: unknown = null;
  const candidates = [text];
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) candidates.push(text.slice(objStart, objEnd + 1));
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) candidates.push(text.slice(arrStart, arrEnd + 1));
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      /* 尝试下一个候选 */
    }
  }
  if (parsed == null) return out;

  const put = (num: unknown, zhRaw: unknown) => {
    const idx = Math.round(Number(num)) - 1;
    const zh = cleanZhText(typeof zhRaw === 'string' ? zhRaw : '');
    if (Number.isFinite(idx) && idx >= 0 && idx < expectedCount && zh) out.set(idx, zh);
  };
  const putItem = (item: unknown, fallbackNum: number) => {
    if (typeof item === 'string') {
      put(fallbackNum, item);
      return;
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      put(rec.i ?? rec.index ?? fallbackNum, rec.zh ?? rec.translation ?? rec.text);
    }
  };

  if (Array.isArray(parsed)) {
    parsed.forEach((item, n) => putItem(item, n + 1));
  } else if (typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.t)) {
      obj.t.forEach((item, n) => putItem(item, n + 1));
    } else {
      // 形如 {"1":"译文","2":"……"} 的键值映射
      for (const [key, value] of Object.entries(obj)) {
        if (/^\d+$/.test(key)) {
          put(key, typeof value === 'string' ? value : (value as Record<string, unknown>)?.zh);
        }
      }
    }
  }
  return out;
}

// ─────────────────────────── 低层工具 ───────────────────────────

function abortError(): Error {
  const e = new Error('书籍翻译已中止');
  e.name = 'AbortError';
  return e;
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

/** 可被 signal 打断的 sleep（中止时立即 reject，不空等） */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * 带退避重试的请求执行器：失败后按 retryDelaysMs 依次等待重试，
 * 全部失败抛出最后一个错误；中止错误立即透传。
 */
async function withRetries<T>(
  fn: () => Promise<T>,
  retryDelaysMs: number[],
  signal: AbortSignal | undefined,
  label: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) throw err;
      lastError = err;
      if (attempt >= retryDelaysMs.length) break;
      const delay = retryDelaysMs[attempt];
      console.warn(
        `[book-translation] ${label} 请求失败，${delay}ms 后重试（第 ${attempt + 1}/${retryDelaysMs.length} 次）`,
        err,
      );
      await sleep(delay, signal);
    }
  }
  throw lastError;
}

// ─────────────────────────── AI 请求 ───────────────────────────

/** 一次合并请求：同一章 indices（章内全局下标，连续）→ 编号 prompt → JSON 回填 */
async function requestBatchTranslation(
  indices: number[],
  chapter: IBookChapter,
  o: IResolvedOptions,
): Promise<Map<number, string>> {
  const { chat } = await import('@/services/ai-service');
  const userContent = indices
    .map((gi, n) => `[${n + 1}] ${chapter.paragraphs[gi].slice(0, MAX_SEGMENT_CHARS)}`)
    .join('\n\n');
  const raw = await chat(
    [
      { role: 'system', content: BATCH_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { temperature: 0.3, maxTokens: 4096, signal: o.signal, task: 'translate' },
  );
  return parseBatchTranslation(raw, indices.length);
}

/** 逐段兜底翻译单段，失败返回 ''（中止错误透传） */
async function translateSingle(
  chapter: IBookChapter,
  segIdx: number,
  o: IResolvedOptions,
): Promise<string> {
  try {
    const { chat } = await import('@/services/ai-service');
    const raw = await withRetries(
      () =>
        chat(
          [
            { role: 'system', content: SINGLE_SYSTEM_PROMPT },
            { role: 'user', content: chapter.paragraphs[segIdx].slice(0, MAX_SEGMENT_CHARS) },
          ],
          { temperature: 0.3, maxTokens: 1024, signal: o.signal, task: 'translate' },
        ),
      o.retryDelaysMs,
      o.signal,
      `ch${chapter.index}#${segIdx}`,
    );
    return cleanZhText(raw);
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) throw err;
    console.warn(`[book-translation] ch${chapter.index}#${segIdx} 单段翻译失败，跳过`, err);
    return '';
  }
}

/**
 * 翻译一批连续段落：先走合并请求（带退避重试）；
 * JSON 可解析但缺个别段 → 只对缺失段逐段补翻；
 * 请求失败 / JSON 不可解析 → 整批退化为逐段翻译；仍失败的段计入 failedCount。
 */
async function translateBatch(
  indices: number[],
  chapter: IBookChapter,
  o: IResolvedOptions,
): Promise<IBatchOutcome> {
  const label = `ch${chapter.index}[${indices[0]}-${indices[indices.length - 1]}]`;

  // ── 引擎策略：local = 只用本地；否则 AI 优先，失败/缺段由本地模型兜底 ──
  // （实测 AI 批量约 0.2s/段远快于本地单线程 WASM 约 5s/段；本地负责在限流/断网时保证完成）
  const engine = getTranslateEngine();
  const localFirst = engine === 'local';

  if (localFirst && isLocalMtReady()) {
    try {
      const texts = indices.map((gi) => chapter.paragraphs[gi] || '');
      const zh = await translateWithLocalMt(texts, { signal: o.signal });
      const map = new Map<number, string>();
      indices.forEach((_, n) => { const t = (zh[n] || '').trim(); if (t) map.set(n, t); });
      return { translations: map, failedCount: indices.length - map.size };
    } catch (e) {
      if (o.signal?.aborted) throw e;
      console.warn(`[book-translation] ${label} 本地模型失败，回落 AI`, e);
    }
  }

  /** AI 失败/缺段时用本地模型补齐（不联网、不限流） */
  const fillWithLocal = async (map: Map<number, string>): Promise<Map<number, string>> => {
    const missing = indices.filter((_, n) => !map.get(n));
    const need = indices.filter((_, n) => !map.get(n)).length;
    if (need === 0) return map;
    if (!isLocalMtReady()) return map;
    try {
      const texts = missing.map((gi) => chapter.paragraphs[gi] || '');
      console.info(`[book-translation] ${label} AI 缺 ${need} 段 → 本地模型兜底`);
      const zh = await translateWithLocalMt(texts, { signal: o.signal });
      missing.forEach((gi, n) => {
        const idxLocal = indices.indexOf(gi);
        const t = (zh[n] || '').trim();
        if (t && idxLocal >= 0) map.set(idxLocal, t);
      });
    } catch { /* 兜底失败就保持原样 */ }
    return map;
  };

  try {
    const map = await withRetries(
      () => requestBatchTranslation(indices, chapter, o),
      o.retryDelaysMs,
      o.signal,
      label,
    );
    const missing: number[] = [];
    for (let n = 0; n < indices.length; n++) {
      if (!map.get(n)) missing.push(n);
    }
    if (missing.length === 0) return { translations: map, failedCount: 0 };
    // 本地模型兜底：把 AI 没给出的段补齐
    const filled = await fillWithLocal(map);
    const stillMissing = indices.filter((_, n) => !filled.get(n)).length;
    if (stillMissing === 0) return { translations: filled, failedCount: 0 };
    map.clear();
    for (const [k, v] of filled) map.set(k, v);

    console.warn(`[book-translation] ${label} 批量结果缺 ${missing.length} 段，逐段补翻`);
    const translations = new Map(await fillWithLocal(map));
    let failedCount = 0;
    for (const n of missing) {
      if (translations.get(n)) continue; // 本地兜底已补齐
      const zh = await translateSingle(chapter, indices[n], o);
      if (zh) translations.set(n, zh);
      else failedCount += 1;
    }
    return { translations, failedCount };
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) throw err;
    console.warn(`[book-translation] ${label} 批量翻译失败，退化为逐段翻译`, err);
  }

  const translations = new Map<number, string>();
  let failedCount = 0;
  for (let n = 0; n < indices.length; n++) {
    const zh = await translateSingle(chapter, indices[n], o);
    if (zh) translations.set(n, zh);
    else failedCount += 1;
  }
  return { translations, failedCount };
}

/** 把缺失段落下标按"连续段"分组并切成 ≤batchSize 的批次（保持章内顺序） */
function buildBatches(indices: number[], batchSize: number): number[][] {
  const batches: number[][] = [];
  let run: number[] = [];
  const flushRun = () => {
    for (let i = 0; i < run.length; i += batchSize) {
      batches.push(run.slice(i, i + batchSize));
    }
    run = [];
  };
  for (const idx of indices) {
    if (run.length === 0 || idx === run[run.length - 1] + 1) run.push(idx);
    else {
      flushRun();
      run.push(idx);
    }
  }
  flushRun();
  return batches;
}

// ─────────────────────────── IDB 缓存 ───────────────────────────

/**
 * 预翻译包：public/translations/<bookId>.json
 * 由 scripts/pretranslate-books.cjs 生成并随包分发 —— 打开书籍即得中文对照，
 * 零等待、零 API 消耗、断网可用。首次访问后写入 IndexedDB，之后完全离线。
 */
const prebakedLoaded = new Set<string>();
async function tryLoadPrebaked(bookId: string, chapterIdx: number): Promise<string[] | null> {
  if (prebakedLoaded.has(bookId)) return null;
  prebakedLoaded.add(bookId);
  try {
    const res = await fetch(`/translations/${bookId}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, string[]>;
    const entries = Object.entries(data);
    if (entries.length === 0) return null;
    // 整本写入本地缓存（断网后依然可用）
    await Promise.all(entries.map(async ([k, arr]) => {
      const idx = Number(k);
      if (Number.isInteger(idx) && Array.isArray(arr)) {
        await idbSet(chapterKeyOf(bookId, idx), arr).catch(() => {});
      }
    }));
    const hit = data[String(chapterIdx)];
    return Array.isArray(hit) ? hit : null;
  } catch { return null; }
}

async function loadChapterCache(bookId: string, chapterIdx: number): Promise<string[] | null> {
  // 本地缓存未命中 → 尝试随包分发的预翻译
  const cached0 = await loadChapterCacheRaw(bookId, chapterIdx);
  if (cached0 && cached0.some(Boolean)) return cached0;
  const prebaked = await tryLoadPrebaked(bookId, chapterIdx);
  if (prebaked && prebaked.some(Boolean)) return prebaked;
  return cached0;
}

async function loadChapterCacheRaw(bookId: string, chapterIdx: number): Promise<string[] | null> {
  const raw = await idbGet<unknown>(chapterKeyOf(bookId, chapterIdx));
  if (!Array.isArray(raw)) return null;
  return raw.map((s) => (typeof s === 'string' ? s : ''));
}

/** 与当前章节段数对齐：多截少补，非法项清空 */
function alignCache(cached: string[] | null, total: number): string[] {
  const zh = new Array<string>(total).fill('');
  if (cached) {
    for (let i = 0; i < Math.min(cached.length, total); i++) {
      if (cached[i]) zh[i] = cached[i];
    }
  }
  return zh;
}

/** 落盘章节译文并同步清单（每批完成后调用 → 断点续传粒度为批） */
async function saveChapterCache(
  bookId: string,
  chapterIdx: number,
  zh: string[],
  chapterCount: number,
): Promise<void> {
  await idbSet(chapterKeyOf(bookId, chapterIdx), zh);
  const manifest =
    (await idbGet<ITranslationManifest>(manifestKeyOf(bookId))) ??
    ({ chapters: [], chapterCount, updatedAt: 0 } as ITranslationManifest);
  if (!manifest.chapters.includes(chapterIdx)) manifest.chapters.push(chapterIdx);
  manifest.chapterCount = chapterCount;
  manifest.updatedAt = Date.now();
  await idbSet(manifestKeyOf(bookId), manifest);
}

// ─────────────────────────── 整书翻译队列 ───────────────────────────

function resolveOptions(opts: ITranslateBookOptions): IResolvedOptions {
  return {
    batchSize: Math.min(8, Math.max(1, opts.batchSize ?? DEFAULT_BATCH_SIZE)),
    concurrency: Math.min(4, Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY)),
    retryDelaysMs: opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    signal: opts.signal,
    onProgress: opts.onProgress,
  };
}

/**
 * 整书批量翻译队列：章节按顺序串行，章内 batchSize 个连续段落合并为一次请求、
 * concurrency 路并发；每批完成即写 IndexedDB（断点续传）；再次运行自动跳过
 * 已完成章节/段落，只补缺失部分。随时可通过 opts.signal 中止。
 *
 * 返回统计；被中止时 completed=false 且不抛错（已落盘进度保留）。
 * 同一本书重复调用会抛错（防止单飞重复消耗额度）。
 */
export async function translateBook(
  book: IReadingContent,
  opts: ITranslateBookOptions = {},
): Promise<ITranslateBookResult> {
  const o = resolveOptions(opts);
  const chapters = splitChapters(book);
  const chaptersTotal = chapters.length;
  const result: ITranslateBookResult = {
    completed: false,
    translated: 0,
    failed: 0,
    chaptersDone: 0,
    chaptersTotal,
  };

  if (chaptersTotal === 0) {
    result.completed = true;
    return result;
  }
  if (activeRuns.has(book.id)) {
    throw new Error(`[book-translation] 《${book.title}》已在翻译中，请勿重复启动`);
  }
  activeRuns.add(book.id);

  try {
    for (const chapter of chapters) {
      if (o.signal?.aborted) throw abortError();

      const total = chapter.paragraphs.length;
      const zh = alignCache(await loadChapterCache(book.id, chapter.index), total);
      // 空源段无需翻译，天然视为已完成
      const segDoneOf = () =>
        zh.reduce((sum, t, i) => sum + (t || !chapter.paragraphs[i].trim() ? 1 : 0), 0);
      let segDone = segDoneOf();
      const emit = () =>
        o.onProgress?.({
          chapterIdx: chapter.index,
          chapterTitle: chapter.title || `第 ${chapter.index + 1} 章`,
          segDone,
          segTotal: total,
          chaptersDone: result.chaptersDone,
          chaptersTotal,
        });
      emit();

      if (segDone < total) {
        const missing: number[] = [];
        for (let i = 0; i < total; i++) {
          if (!zh[i] && chapter.paragraphs[i].trim()) missing.push(i);
        }
        const queue = buildBatches(missing, o.batchSize);
        const worker = async (): Promise<void> => {
          while (queue.length > 0) {
            if (o.signal?.aborted) throw abortError();
            const batch = queue.shift()!;
            const outcome = await translateBatch(batch, chapter, o);
            for (const [localIdx, text] of outcome.translations) {
              const gi = batch[localIdx];
              if (gi === undefined || zh[gi]) continue;
              zh[gi] = text;
              result.translated += 1;
              segDone += 1;
              emit();
            }
            result.failed += outcome.failedCount;
            // 每批完成即落盘 → 断点续传粒度为批
            await saveChapterCache(book.id, chapter.index, zh, chaptersTotal);
          }
        };
        const settled = await Promise.allSettled(
          Array.from({ length: Math.min(o.concurrency, queue.length) }, () => worker()),
        );
        if (o.signal?.aborted) throw abortError();
        for (const s of settled) {
          if (s.status === 'rejected') throw s.reason;
        }
        segDone = segDoneOf();
      }

      if (segDone >= total) result.chaptersDone += 1;
      await saveChapterCache(book.id, chapter.index, zh, chaptersTotal);
      emit();
    }
    result.completed = true;
    return result;
  } catch (err) {
    // 中止：保留已完成进度，静默返回（completed=false）
    if (o.signal?.aborted || isAbortError(err)) return result;
    throw err;
  } finally {
    activeRuns.delete(book.id);
  }
}

/** 单章翻译进度 */
export interface IChapterTranslateProgress {
  segDone: number;
  segTotal: number;
}

/**
 * 翻译单章（复用整书队列的合并批量/限流退避/落盘逻辑）。
 * 返回该章译文数组（下标 = splitChapters 该章非标题段顺序），调用方按
 * 段落原文对号回填。中途中止/个别段失败时返回已得部分（可重跑补翻）。
 */
export async function translateChapterByIndex(
  book: IReadingContent,
  chapterIdx: number,
  opts: ITranslateBookOptions = {},
): Promise<{ zh: string[]; failed: number; chapterTitle: string }> {
  const o = resolveOptions(opts);
  const chapters = splitChapters(book);
  const chapter = chapters[chapterIdx];
  if (!chapter) throw new Error(`[book-translation] 章节不存在: ${chapterIdx}`);
  if (activeRuns.has(book.id)) {
    throw new Error(`[book-translation] 《${book.title}》已在翻译中，请勿重复启动`);
  }
  activeRuns.add(book.id);

  const total = chapter.paragraphs.length;
  const zh = alignCache(await loadChapterCache(book.id, chapterIdx), total);
  let failed = 0;
  try {
    const missing: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!zh[i] && chapter.paragraphs[i].trim()) missing.push(i);
    }
    if (missing.length > 0) {
      const queue = buildBatches(missing, o.batchSize);
      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          if (o.signal?.aborted) throw abortError();
          const batch = queue.shift()!;
          const outcome = await translateBatch(batch, chapter, o);
          for (const [localIdx, text] of outcome.translations) {
            const gi = batch[localIdx];
            if (gi === undefined || zh[gi]) continue;
            zh[gi] = text;
          }
          failed += outcome.failedCount;
          o.onProgress?.({
            chapterIdx,
            chapterTitle: chapter.title || `第 ${chapterIdx + 1} 章`,
            segDone: zh.reduce((sum, t, i) => sum + (t || !chapter.paragraphs[i].trim() ? 1 : 0), 0),
            segTotal: total,
            chaptersDone: 0,
            chaptersTotal: 1,
          });
          await saveChapterCache(book.id, chapterIdx, zh, chapters.length);
        }
      };
      const settled = await Promise.allSettled(
        Array.from({ length: Math.min(o.concurrency, queue.length) }, () => worker()),
      );
      for (const st of settled) {
        if (st.status === 'rejected') throw st.reason;
      }
    }
    return { zh, failed, chapterTitle: chapter.title || `第 ${chapterIdx + 1} 章` };
  } catch (err) {
    if (o.signal?.aborted || isAbortError(err)) {
      return { zh, failed, chapterTitle: chapter.title || `第 ${chapterIdx + 1} 章` };
    }
    throw err;
  } finally {
    activeRuns.delete(book.id);
  }
}

// ─────────────────────────── 查询接口 ───────────────────────────

/** 读取某章缓存译文（下标 = splitChapters 该章非标题段顺序）；无记录返回 null */
export async function getChapterTranslation(
  bookId: string,
  chapterIdx: number,
): Promise<string[] | null> {
  const raw = await idbGet<unknown>(chapterKeyOf(bookId, chapterIdx));
  if (Array.isArray(raw) && raw.some((v) => typeof v === 'string' && v)) {
    return raw.map((s) => (typeof s === 'string' ? s : ''));
  }
  // 本地没有 → 尝试随包分发的预翻译（阅读器切章即显示中文，零 API 消耗）
  const prebaked = await tryLoadPrebaked(bookId, chapterIdx);
  if (prebaked && prebaked.some(Boolean)) return prebaked;
  if (Array.isArray(raw)) return raw.map((s) => (typeof s === 'string' ? s : ''));
  return null;
}

/** 读取全书缓存：{ [chapterIdx]: string[] }（仅包含已落盘的章节） */
export async function getCachedBookTranslation(
  bookId: string,
): Promise<Record<number, string[]>> {
  const manifest = await idbGet<ITranslationManifest>(manifestKeyOf(bookId));
  const idxs = manifest?.chapters?.filter((n) => Number.isInteger(n) && n >= 0) ?? [];
  const entries = await Promise.all(
    idxs.map(async (idx) => [idx, await getChapterTranslation(bookId, idx)] as const),
  );
  const out: Record<number, string[]> = {};
  for (const [idx, arr] of entries) {
    if (arr) out[idx] = arr;
  }
  return out;
}

/** 清空某本书的全部翻译缓存（章节记录 + 清单） */
export async function clearBookTranslation(bookId: string): Promise<void> {
  const manifest = await idbGet<ITranslationManifest>(manifestKeyOf(bookId));
  if (manifest?.chapters?.length) {
    await Promise.all(manifest.chapters.map((idx) => idbDelete(chapterKeyOf(bookId, idx))));
  }
  await idbDelete(manifestKeyOf(bookId));
}

/** 翻译统计：已译章节数 / 总章数（传入 book 时按实时切分精确统计整章完成度） */
export async function getBookTranslationStats(
  bookId: string,
  book?: IReadingContent,
): Promise<IBookTranslationStats> {
  const manifest = await idbGet<ITranslationManifest>(manifestKeyOf(bookId));
  const cached = await getCachedBookTranslation(bookId);
  const idxs = Object.keys(cached)
    .map(Number)
    .sort((a, b) => a - b);
  const translatedSegments = idxs.reduce((sum, i) => sum + cached[i].filter(Boolean).length, 0);

  let totalChapters: number | null = null;
  let totalSegments: number | null = null;
  let translatedChapters = idxs.length;

  if (book) {
    const chapters = splitChapters(book);
    totalChapters = chapters.length;
    // 只统计实际可翻译的段（空段无法翻译，不计入总数，避免进度永远到不了 100%）
    totalSegments = chapters.reduce((sum, c) => sum + c.paragraphs.filter((s) => s.trim()).length, 0);
    translatedChapters = chapters.filter((c) => {
      const arr = cached[c.index];
      if (!arr) return false;
      return c.paragraphs.every((src, i) => !src.trim() || !!arr[i]);
    }).length;
  } else if (manifest && manifest.chapterCount > 0) {
    totalChapters = manifest.chapterCount;
  }

  return { translatedChapters, totalChapters, translatedSegments, totalSegments };
}
