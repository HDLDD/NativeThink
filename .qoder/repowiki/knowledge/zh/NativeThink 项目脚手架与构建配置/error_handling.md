# NativeThink 错误处理体系

## 1. 总体策略

项目采用**三层错误处理架构**：
- **React 层**：`react-error-boundary` + 自定义 `ErrorBoundary` 组件，按路由粒度隔离崩溃。
- **运行时层**：统一通过 `throw new Error(人类可读消息)` 向上抛出；UI 侧用 `sonner.toast`（success/error/info）呈现给用户。
- **服务端层**（Cloudflare Pages Functions）：在 `functions/_lib/guard.js` 中集中做 Origin 白名单、IP 限流、payload 校验，失败直接返回结构化 JSON `{ ok: false }`，由调用方转成 HTTP 错误响应。

项目中没有定义自定义错误类（未见 `class XxxError extends Error`），也没有使用 `try/catch/finally` 之外的结构化异常类型系统。所有业务错误以字符串 `Error` 表达，错误码不是数字枚举而是语义化中文消息。

## 2. React 应用边界

### 2.1 路由级 ErrorBoundary
`src/app.tsx` 对每个 `<Route>` 包裹一个 `react-error-boundary` 的 `<ErrorBoundary>`，并传入统一的 `PageErrorFallback({ page })` 组件——展示“⚠️ + {page}页面出错 + 刷新页面”按钮。

```tsx
<Route index element={
  <ErrorBoundary fallback={<PageErrorFallback page="仪表盘" />}>DashboardPage</ErrorBoundary>
/>```

覆盖路由：`/`, `/think`, `/chunks`, `/conversation`, `/shadowing`, `/articles`, `/vocabulary`, `/writing`, `/progress`, `/favorites`, `/sentences`, `/spelling`, `/video`, `/settings`，以及 `*` 404 路由。

### 2.2 布局内嵌套 ErrorBoundary
`src/components/Layout.tsx` 还实现了一个基于 `Component` + `getDerivedStateFromError` 的本地 `ErrorBoundary`，用于捕获 `<Outlet />` 内容树内的渲染期错误，并以“页面加载异常 + 刷新页面”的形式呈现。它与 `react-error-boundary` 形成双重兜底。

### 2.3 Suspense 骨架屏
异步路由和子组件都包裹在 `<Suspense fallback={<PageFallback />} >` 中，`PageFallback` 输出骨架占位，避免加载时闪烁。

## 3. 网络与 API 错误

### 3.1 `api-client.ts` — 通用 fetch 包装器
- `fetchWithTimeout(url, options, timeoutMs)`：基于 `AbortController`，超时抛出 `Error('请求超时，请检查网络连接后重试')`。
- `safeJson(res)` / monkey-patched `res.json()`：解析失败时根据响应体特征分类抛错：
  - 包含 `error code:` → `服务器内部错误(...)`
  - HTML 开头 → `服务暂时不可用，请稍后重试`
  - 其他 → `服务器返回异常: ...`
- `apiFetch(path, options?)`：自动注入 `Authorization: Bearer {token}`，token 读写用 try/catch 静默忽略（localStorage 可能不可用）。

### 3.2 `services/ai-service.ts` — AI 流式接口
- 非 2xx 响应先尝试解析 JSON（`err.error.message` / `err.message` / 原始文本），再构造 `${provider.name} API 错误 (${status}): ${errorMsg}`。
- 503 特殊处理：抛出包含 DeepSeek/豆包配置链接的引导消息。
- SSE 流：`data:` 行 JSON 解析失败被 `catch` 吞掉（`// Skip unparseable chunks`），仅跳过单条片段，不中断流。
- 支持 `silent` 选项：当为 true 时，上游 `toast.error` 被抑制，由调用方自行降级。

### 3.3 `hooks/use-ai.ts`
将 `ai-service` 抛出的错误统一转为 `toast.error(message)`，除非 `options.silent` 为真。

### 3.4 `services/asr-service.ts`
语音识别错误集中在顶部抛出：未配置 ASR、无候选结果、超时、取消等场景均 `throw new Error(...)`，由调用方 toast 显示。

## 4. Cloudflare Functions 守卫

`functions/_lib/guard.js` 是服务端入口守卫，提供三个导出函数：

| 函数 | 职责 | 失败表现 |
|---|---|---|
| `checkOrigin(request)` | Origin 白名单校验 | 返回 `{ ok: false, origin }` |
| `checkRate(ip)` | IP 分钟窗限流（内存 Map，60s 窗口，最多 30 次） | 返回 `{ ok: boolean, count }` |
| `validateMessages(messages)` | 数组长度 ≤80、每条 role/content 为 string、总长度 ≤64KB | 返回 `boolean` |
| `trackFactoryUsage(...)` | 出厂 Key 用量监控，写入内存计数 + `console.log(JSON.stringify(...))` | 无返回值 |

白名单来源：`https://nativethink.pages.dev`、`https://localhost`、`http://localhost`、`http://127.0.0.1`。限流 Map 超过 5000 项时批量清理过期条目，防止 isolate 内存泄漏。

## 5. 数据解析与健壮性

- `src/lib/utils.ts#extractJson(raw)`：从 AI 返回文本中剥离 markdown 代码块、再用平衡括号匹配提取对象或数组，全部失败后抛出 `Error('无法从 AI 返回中提取有效 JSON')`。
- `src/data/book-fulltext.ts`：Gutenberg 全文抓取大量使用 try/catch 包裹 `idbSet` 缓存写入，失败只记录不阻塞主流程（注释 `quota — 不阻塞`）。
- `src/lib/api-client.ts` 的 localStorage 读写、`Layout.tsx` 的 last-visit 存储、Android TTS 提示等均使用 try/catch 静默忽略，体现“用户可见路径必须成功，后台缓存可失败”的分层容错理念。

## 6. UI 反馈约定

- 成功：`toast.success(...)`（如 API Key 保存、登录成功、连接成功）。
- 失败：`toast.error(...)`（如 API Key 为空、AI 连接失败、清除离线模型失败）。
- 信息：`toast.info(...)`（如 Android 英语语音安装引导、AI 切换离线模型提示）。
- 所有 toast 来自 `sonner`，通过 `import { toast } from 'sonner'` 引入。

## 7. 观察到的约束与规则

- **路由级隔离**：每个页面路由独立包裹 `react-error-boundary`，单个页面崩溃不影响其他页面。（依据：`src/app.tsx` 中对所有 `<Route>` 的装饰模式一致）
- **网络错误统一封装**：所有对外 HTTP 请求走 `apiFetch`，禁止裸 `fetch` 直接消费；超时、HTML 响应、CF error code 均被转化为带中文提示的 `Error`。（依据：`src/lib/api-client.ts` 的实现及 `ai-service.ts`、`asr-service.ts` 的调用方式）
- **AI 流降级优先于报错**：SSE chunk 解析失败被吞掉继续流式输出；当 provider 不可用时回退到本地小模型并通过 `toast.info` 通知，而非直接中断用户操作。（依据：`ai-service.ts` 的 `silent` 选项与 503 分支）
- **服务端防滥用三件套**：所有 `/api/ai/*` 入口必须依次调用 `checkOrigin` → `checkRate` → `validateMessages`，任一失败立即返回 4xx/429，不再进入业务逻辑。（依据：`guard.js` 的导出契约与各 handler 的引用模式）
- **后台操作静默失败**：localStorage、IndexedDB 缓存写入、Analytics 埋点等辅助操作一律 try/catch 忽略，不阻断主流程。（依据：多处 `catch { /* ignore */ }` 模式）

## 8. 关键文件清单

- `src/app.tsx` — 路由级 ErrorBoundary 装配
- `src/components/Layout.tsx` — 布局内 ErrorBoundary + Suspense 骨架屏
- `src/lib/api-client.ts` — 超时 + 安全 JSON 解析的统一 fetch 包装
- `src/services/ai-service.ts` — AI 流式调用、多 Provider 错误归一化
- `src/hooks/use-ai.ts` — AI 错误的 toast 呈现
- `src/services/asr-service.ts` — 语音识别错误集中抛出
- `functions/_lib/guard.js` — Origin/IP/payload 守卫与用量监控
- `src/lib/utils.ts#extractJson` — AI 返回 JSON 的鲁棒解析
- `src/data/book-fulltext.ts` — 后台缓存失败的静默容错示例

## 9. 缺失或不完整之处

- 没有自定义错误类（如 `NotFoundError`、`NetworkError`、`ValidationError`），错误类型只能通过消息字符串区分，不利于程序化判断。
- 没有在根级别设置全局 `unhandledrejection` / `onerror` 监听来上报未捕获异常。
- 服务端 Functions 各 handler 的错误日志风格不一致：部分用 `console.error`，部分直接 `throw`，没有统一的错误响应中间件。
- 没有 Sentry/Bugsnag 等第三方错误上报集成，生产环境依赖 CF Real-time Logs 中的 `console.log` 人工排查。