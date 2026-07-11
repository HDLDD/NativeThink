/** Cloudflare Workers KV helper */
// Access via context.env.KV (binding name must be "KV" in Cloudflare dashboard)

export function userDataKey(userId, key) {
  return `users:data:${userId}:${key}`;
}
