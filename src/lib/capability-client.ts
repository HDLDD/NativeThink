/**
 * 平台 AI 能力客户端 —— 只在**真要走这条兜底路径**时才动态加载。
 *
 * `@lark-apaas/client-toolkit-lite` 是 miaoda 平台的 AI 插件客户端，只有跑在平台内才有响应；
 * 但它是四个功能页（母语思维 / 语块 / 对话 / 写作）里"用户没配 AI Key"那条 else 分支用的。
 * 静态 import 的代价是实测数字：那个 chunk **507KB raw / 160KB gzip**，
 * 四条路由每次进入都要下载并解析它 —— 而我们的两条产品线（Pages / APK）默认走出厂免费额度，
 * 这条分支基本不会被碰到。
 *
 * 用法：`const cap = await getCapabilityClient()`；拿不到（非平台环境 / 加载失败）时返回 null，
 * 调用方沿用原有的 try-catch 与"AI 服务暂不可用"提示。
 */
let pending: Promise<unknown> | null = null;

export async function getCapabilityClient(): Promise<any | null> {
  if (!pending) {
    pending = import('@lark-apaas/client-toolkit-lite')
      .then((m: any) => m?.capabilityClient ?? null)
      // 加载失败要清掉缓存，否则一次网络抖动就把这条路径永久钉死
      .catch(() => { pending = null; return null; });
  }
  return pending;
}
