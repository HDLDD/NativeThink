import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';
import { APP_VERSION, platformTag } from './app-env';

const FEEDBACK_KEY = '__nativethink_feedback_list';
const RATE_LIMIT_KEY = '__nativethink_feedback_ratelimit';

// --- Rate limiting ---
const MAX_SUBMISSIONS_PER_HOUR = 3;
const MIN_INTERVAL_MS = 60_000; // 1 minute between submissions

interface IRateLimitEntry { timestamp: number }
interface IRateLimitStore { entries: IRateLimitEntry[] }

function getRateLimitStore(): IRateLimitStore {
  try {
    const raw = safeStorage.getItem(RATE_LIMIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { entries: [] };
}

function saveRateLimitStore(store: IRateLimitStore): void {
  try {
    safeStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

/** Returns null if allowed, or a reason string if blocked */
export function checkRateLimit(): string | null {
  const now = Date.now();
  const store = getRateLimitStore();

  // Purge entries older than 1 hour
  const oneHourAgo = now - 3_600_000;
  store.entries = store.entries.filter((e) => e.timestamp > oneHourAgo);

  // Check max per hour
  if (store.entries.length >= MAX_SUBMISSIONS_PER_HOUR) {
    const oldestTime = store.entries[0].timestamp;
    const waitMinutes = Math.ceil((oldestTime - oneHourAgo) / 60_000);
    return `提交过于频繁，请 ${waitMinutes} 分钟后再试。`;
  }

  // Check min interval
  if (store.entries.length > 0) {
    const lastTime = store.entries[store.entries.length - 1].timestamp;
    const elapsed = now - lastTime;
    if (elapsed < MIN_INTERVAL_MS) {
      const waitSeconds = Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000);
      return `请等待 ${waitSeconds} 秒后再提交。`;
    }
  }

  return null;
}

/** Record a successful submission */
export function recordSubmission(): void {
  const store = getRateLimitStore();
  store.entries.push({ timestamp: Date.now() });
  // Keep only last hour
  const oneHourAgo = Date.now() - 3_600_000;
  store.entries = store.entries.filter((e) => e.timestamp > oneHourAgo);
  saveRateLimitStore(store);
}

// --- Input sanitization ---
const HTML_TAG_RE = /<[^>]*>/g;
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeInput(input: string): string {
  return input
    .replace(HTML_TAG_RE, '')     // strip HTML tags
    .replace(CONTROL_CHAR_RE, '') // strip control characters
    .trim();
}

// --- Feedback data model ---
export interface IFeedbackItem {
  id: string;
  type: 'bug' | 'feature' | 'general';
  title: string;
  description: string;
  rating: number; // 0 = no rating, 1-5
  createdAt: string; // ISO timestamp
  appVersion?: string;
  /**
   * 服务端接收状态：undefined = 历史数据（旧版本没有这个字段，不显示状态标签）；
   * false = 已存本地但服务端没收到（可在历史列表重试）；true = 服务端已接住。
   */
  synced?: boolean;
}

// --- Hook ---
export function useFeedback() {
  const [feedbacks, setFeedbacks] = useState<IFeedbackItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = safeStorage.getItem(FEEDBACK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setFeedbacks(parsed);
      }
    } catch {
      // storage unavailable — use defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  /**
   * 落盘走 effect：状态更新函数保持纯（StrictMode 会双调用 updater，
   * 在里面写 storage 等于写两遍）。`loaded` 之前不写 ——
   * 否则首帧的空数组会把磁盘上的历史反馈抹掉。
   */
  useEffect(() => {
    if (!loaded) return;
    try {
      safeStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbacks));
    } catch {
      // 配额满：保留内存态，不炸页面
    }
  }, [feedbacks, loaded]);

  const addFeedback = useCallback(
    (item: Omit<IFeedbackItem, 'id' | 'createdAt'>) => {
      // Sanitize
      const sanitized: Omit<IFeedbackItem, 'id' | 'createdAt'> = {
        ...item,
        title: sanitizeInput(item.title).slice(0, 100),
        description: sanitizeInput(item.description).slice(0, 1000),
        rating: Math.max(0, Math.min(5, Math.round(item.rating))),
      };

      const newItem: IFeedbackItem = {
        ...sanitized,
        id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        // 版本由 hook 统一盖章（调用方不该各写各的口径）
        appVersion: APP_VERSION || undefined,
        synced: false,
      };

      // 函数式合并：提交是异步的，用点击时的旧数组回写会盖掉期间新增的反馈
      setFeedbacks((prev) => [newItem, ...prev]);
      recordSubmission();
      return newItem;
    },
    [],
  );

  /** 服务端接收结果回写 —— 只有真的被接住才标 synced=true，失败时保持 false 好让用户重试 */
  const markSynced = useCallback((id: string, synced = true) => {
    setFeedbacks((prev) => prev.map((f) => (f.id === id ? { ...f, synced } : f)));
  }, []);

  const deleteFeedback = useCallback((id: string) => {
    setFeedbacks((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return {
    feedbacks,
    loaded,
    addFeedback,
    deleteFeedback,
    markSynced,
  };
}

// --- Server submission ---
/**
 * 提交结果分三档，UI 必须如实区分（以前只回 boolean，"服务端根本没配反馈通道"
 * 也被显示成提交成功，用户以为意见发出去了）：
 *  - delivered：服务端已推给即时通道（飞书群）；
 *  - stored：服务端已留档但没能即时推送 —— 反馈没丢，开发者仍能看到；
 *  - failed：请求没成功（离线、503、解析失败），本地已存，可重试。
 */
export type FeedbackSubmitResult =
  | { status: 'delivered' }
  | { status: 'stored' }
  | { status: 'failed'; reason: string };

export async function submitFeedbackToServer(feedback: IFeedbackItem): Promise<FeedbackSubmitResult> {
  try {
    const resp = await fetch('/api/feedback/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 带上运行环境，便于定位"只有手机上出问题"这类反馈
      body: JSON.stringify({
        type: feedback.type,
        title: feedback.title,
        description: feedback.description,
        rating: feedback.rating,
        platform: platformTag(),
        appVersion: feedback.appVersion || APP_VERSION || undefined,
        locale: typeof navigator !== 'undefined' ? navigator.language || '' : '',
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) return { status: 'failed', reason: `http_${resp.status}` };

    // 服务端返回 { delivered, archived }。响应不是 JSON（网关改写等）时保守判成
    // stored —— 请求确实被服务端 2xx 接住了，不谎报 delivered，也不吓唬用户重试。
    let data: { delivered?: boolean; archived?: boolean } | null = null;
    try { data = await resp.json(); } catch { data = null; }
    if (!data) return { status: 'stored' };
    if (data.delivered) return { status: 'delivered' };
    if (data.archived) return { status: 'stored' };
    return { status: 'failed', reason: 'server_rejected' };
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error ? e.message : 'network' };
  }
}
