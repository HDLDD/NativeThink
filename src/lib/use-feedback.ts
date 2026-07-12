import { useState, useEffect, useCallback } from 'react';
import { safeStorage } from './safe-storage';

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

  const persist = useCallback((items: IFeedbackItem[]) => {
    setFeedbacks(items);
    try {
      safeStorage.setItem(FEEDBACK_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, []);

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
      };

      persist([newItem, ...feedbacks]);
      recordSubmission();
      return newItem;
    },
    [feedbacks, persist],
  );

  const deleteFeedback = useCallback(
    (id: string) => {
      persist(feedbacks.filter((f) => f.id !== id));
    },
    [feedbacks, persist],
  );

  return {
    feedbacks,
    loaded,
    addFeedback,
    deleteFeedback,
  };
}

// --- Webhook ---
/**
 * Build-time webhook URL (from VITE_FEISHU_WEBHOOK_URL env var).
 * @deprecated Use submitFeedbackToServer() instead to avoid exposing webhook URL in frontend.
 */
export function getBuildWebhookUrl(): string {
  try {
    // @ts-expect-error — Vite injects import.meta.env at build time
    return (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FEISHU_WEBHOOK_URL) || '';
  } catch {
    return '';
  }
}

/** Submit feedback via server proxy (preferred — hides webhook URL from client) */
export async function submitFeedbackToServer(feedback: IFeedbackItem): Promise<boolean> {
  try {
    const resp = await fetch('/api/feedback/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: feedback.type,
        title: feedback.title,
        description: feedback.description,
        rating: feedback.rating,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Send a feedback item to a Feishu webhook */
export async function sendToFeishu(feedback: IFeedbackItem, webhookUrl: string): Promise<boolean> {
  const TYPE_EMOJI: Record<string, string> = {
    bug: '🐛',
    feature: '💡',
    general: '💬',
  };
  const TYPE_TEXT: Record<string, string> = {
    bug: 'Bug 报告',
    feature: '功能建议',
    general: '一般反馈',
  };
  const RATING_STARS = feedback.rating > 0 ? '⭐'.repeat(feedback.rating) : '';

  // Build safe user agent string (truncated, no special chars)
  const ua = (navigator.userAgent || '').replace(/[<>"'&]/g, '').slice(0, 80);
  const lang = (navigator.language || 'unknown').replace(/[<>"'&]/g, '').slice(0, 10);

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: `${TYPE_EMOJI[feedback.type]} ${TYPE_TEXT[feedback.type]}: ${feedback.title || feedback.description.slice(0, 30)}`,
            },
            template: feedback.type === 'bug' ? 'red' : feedback.type === 'feature' ? 'blue' : 'wathet',
          },
          elements: [
            {
              tag: 'div',
              text: { tag: 'lark_md', content: feedback.description },
            },
            ...(feedback.rating > 0
              ? [{ tag: 'div' as const, text: { tag: 'lark_md' as const, content: `**评分:** ${RATING_STARS} (${feedback.rating}/5)` } }]
              : []),
            {
              tag: 'hr',
            },
            {
              tag: 'note',
              elements: [
                {
                  tag: 'plain_text',
                  content: `📅 ${new Date(feedback.createdAt).toLocaleString('zh-CN')} | 🌐 ${lang} | 🔧 ${ua}`,
                },
              ],
            },
          ],
        },
      }),
    });

    const result = await resp.json() as { code?: number; msg?: string };
    return result.code === 0;
  } catch {
    return false;
  }
}
