/** Vercel KV client singleton */

import { createClient } from '@vercel/kv';

const KV_URL = process.env.KV_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

let _kv: ReturnType<typeof createClient> | null = null;

export function getKV() {
  if (!_kv) {
    _kv = createClient({
      url: KV_URL || process.env.KV_REST_API_URL || '',
      token: KV_TOKEN,
    });
  }
  return _kv;
}

/** Build the KV key for user-specific data */
export function userDataKey(userId: string, key: string): string {
  return `users:data:${userId}:${key}`;
}
