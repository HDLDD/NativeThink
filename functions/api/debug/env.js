/** GET /api/debug/env — lists env keys (KV bindings) for debugging */
export async function onRequest(context) {
  const { env } = context;
  const keys = Object.keys(env).filter(k => k !== 'KV' || typeof env.KV !== 'undefined');
  return Response.json({
    envKeys: Object.keys(env),
    hasKV: 'KV' in env,
    kvType: typeof env.KV,
    kvIsObject: env.KV !== null && typeof env.KV === 'object',
  });
}
