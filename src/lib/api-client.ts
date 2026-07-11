/** Authenticated fetch wrapper for Cloudflare Pages API calls */

const TOKEN_KEY = '__nativethink_auth_token';
const DEFAULT_TIMEOUT = 15000; // 15 seconds

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

/** Fetch with timeout — rejects with a clear error after timeoutMs */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接后重试');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Safe JSON parse — returns parsed object or throws with a friendly message */
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // If the body is a Cloudflare error (e.g. "error code: 1101"), surface it clearly
    if (text.includes('error code:')) {
      throw new Error(`服务器内部错误 (${text.trim()})，请稍后重试`);
    }
    // HTML response (e.g. 404 page)
    if (text.startsWith('<!') || text.startsWith('<html')) {
      throw new Error('服务暂时不可用，请稍后重试');
    }
    throw new Error(`服务器返回异常: ${text.slice(0, 100)}`);
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
  // Only set Content-Type for requests with a body
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetchWithTimeout(path, { ...options, headers }, DEFAULT_TIMEOUT);

  // Replace .json() with safeJson for all consumers — but we can't do that without
  // breaking the Response interface. Instead, monkey-patch res.json() on error.
  const originalJson = res.json.bind(res);
  res.json = async () => {
    const text = await res.clone().text();
    try {
      return JSON.parse(text);
    } catch {
      if (text.includes('error code:')) {
        throw new Error(`服务器内部错误 (${text.trim()})，请稍后重试`);
      }
      if (text.startsWith('<!') || text.startsWith('<html')) {
        throw new Error('服务暂时不可用，请稍后重试');
      }
      throw new Error(`服务器返回异常: ${text.slice(0, 100)}`);
    }
  };

  return res;
}
