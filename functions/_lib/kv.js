/** Cloudflare Workers KV helper */
// Access via context.env.KV (binding name must be "KV" in Cloudflare dashboard)

export function userDataKey(userId, key) {
  return `users:data:${userId}:${key}`;
}

/**
 * 反馈留档键 —— 前缀固定 `feedback:`，键名用 13 位毫秒时间戳打头，
 * 这样 KV.list 按字典序返回时天然就是时间序（定宽数字 = 数值序）。
 * 与用户数据分开命名空间，避免被 data/sync 的前缀扫描捞走。
 */
export function feedbackKey(id, atMs) {
  return `feedback:${String(atMs).padStart(13, '0')}:${id}`;
}
