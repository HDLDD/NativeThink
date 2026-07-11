/** KV client singleton — supports Vercel KV and Upstash Redis */

import { createClient } from '@vercel/kv';

function getKVConfig() {
  // Upstash Redis (selected by user)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
  }
  // Vercel KV (native)
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    };
  }
  // Legacy KV_URL format
  if (process.env.KV_URL && process.env.KV_REST_API_TOKEN) {
    return {
      url: process.env.KV_URL,
      token: process.env.KV_REST_API_TOKEN,
    };
  }
  return { url: '', token: '' };
}

let _kv: ReturnType<typeof createClient> | null = null;

export function getKV() {
  if (!_kv) {
    const cfg = getKVConfig();
    _kv = createClient({ url: cfg.url, token: cfg.token });
  }
  return _kv;
}

/** Build the KV key for user-specific data */
export function userDataKey(userId: string, key: string): string {
  return `users:data:${userId}:${key}`;
}
