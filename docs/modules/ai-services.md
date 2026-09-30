# AI 服务与端侧模型

> 三条线：用户自配 Key 的云端 AI、Cloudflare Pages Functions 代理、端侧模型（离线小模型 + 本地翻译）。
> APK 里 `functions/` 同时是**线上后端**，不是只有网页在用（见 `docs/modules/shell-and-navigation.md`）。

## 1. 功能

| 能力 | 入口 | 说明 |
|------|------|------|
| 对话/生成 | `useAI()` → `chat` / `streamChat` | 各页面出题、批改、翻译、讲解 |
| 服务端代理 | `POST /api/ai/chat` | 统一 OpenAI 兼容格式，多服务商 |
| 免费档回退 | 服务端按 429/5xx 换模型 | 不额外配置 |
| 端侧兜底 | `local-llm.ts`（Qwen2.5-0.5B） | API 限流/断网时自动接管 |
| 端侧翻译 | `local-mt.ts`（opus-mt-en-zh） | 整书对照翻译首选 |
| 平台内置 AI | `capability-client.ts` | 只在没配 Key 且真要用时动态加载 |

## 2. 实现方法

### 2.1 Key 的配置与优先级

```
scripts/.apikey（gitignore，.gitignore:4）
  └─ vite.config.ts:29-35 读一行 → define['__FACTORY_API_KEY__']（:112-113）
       └─ src/services/ai-config.ts:10-13 以 typeof 判断取值（未注入即空串）
```

- 用户 Key：localStorage `ai_key_<provider>`（`ai-config.ts:147-158`）；当前服务商 `ai_active_provider`（`:181-199`）。
- 出厂 Key 归属 `FACTORY_PROVIDER = 'glm'`（`:16`），`getAPIKey('factory')` **只返回内置 Key，用户不可覆盖**（`:149`）。
- 迁移规则：老默认 `glm` 且没有自有 Key 时，自动迁成 `factory`（`:185-188`）。
- 服务端优先级：**先试客户端带来的 Key**，再退环境变量 `AI_KEY_<PROVIDER>` / `SERVER_AI_KEY`（`functions/api/ai/chat.js:74-76`），都没有 → 503（`:78-80`）。
- 变更广播 `AI_CONFIG_CHANGED_EVENT`（`:161-165`），`useAI` 同时监听 `focus` 重算（`use-ai.ts:49-57`）—— 所以在别的 tab 改 Key 会生效。
- `isConfigured` = `getConfiguredProviders().length > 0`（`use-ai.ts:59` ← `ai-config.ts:204-206`）。

服务商表在前端 `PROVIDER_CONFIGS`（endpoint/默认模型/免费模型/注册链接/是否流式，`:55-140`），服务端另有一份端点与默认模型表（`chat.js:12-32`）—— **两处需人工对齐**，加服务商要同时改。

### 2.2 调用链

`apiStreamChat` / `apiChat` 一律 POST `/api/ai/chat`（`ai-service.ts:102-107,220-225`），body 含 `provider/model/messages/max_tokens/temperature/stream/task` **和 `apiKey`**（`:90-99,208-217`）。SSE 解析 `data:` 行 + `[DONE]` + `finish_reason`（`:148-189`）。503 会被翻成配置指引而不是干巴巴的失败（`:110-116,227-233`）。

服务端按任务选主模型：`translate → glm-4.7-flash`、`chat → glm-4-flash-250414`（`chat.js:38-41`，客户端同名分工 `ai-service.ts:54-57`），glm 系默认关思考（`:98-100`）。免费档回退链 `glm-4-flash-250414 → glm-4-flash → glm-4v-flash → glm-4.7-flash`，**只在 429/500/502/503/504 才换档**（`:47-52,104-133`）。

其它云函数：`/api/ai/passage`（无 Key → 503 且带 `fallback:'client'`）、`/api/ai/transcribe`（Whisper 兼容）。

### 2.3 端侧模型回落的条件

`ai-service.ts:314-361`：`streamChat`/`chat` 抛错后 ——

1. `signal.aborted` → **直接抛**，不回落（用户主动取消不该被当成服务故障）；
2. 必须同时 `isAutoFallbackEnabled() && isLocalLlmReady()` 才转 `localStreamChat`；
3. 否则提示并抛原错。

回落时 `maxTokens` 被压到 ≤600、缺省 400（`:330,353`）。提示去抖 30s（`hintOfflineFallback` `:302-312`）。开关与就绪键：`__nativethink_local_llm_auto`、`__nativethink_local_llm_state`（`local-llm.ts:11-12,38-48`）。

模型加载（`local-llm.ts:75-108`）：动态 `import('@huggingface/transformers')` → `allowLocalModels=true`、`localModelPath='/models/'`、`allowRemoteModels=true`；设备档 `navigator.gpu ? 'webgpu' : 'wasm'`；量化 LLM `q4`、opus-mt `q8`；远程源按语言/UA 排序（中文或安卓先 `hf-mirror.com`）；**45s 无进度看门狗**换下一个源。`hasBundledModel()` 靠 fetch `/models/<id>/config.json` 同源探测（`:50-58`）。

打包版为何能秒出：`scripts/android-copy-models.cjs:12-13` 把 `models-bundled/` **硬链**进 `android/app/src/main/assets/public/models`（`package:apk` 在 `capacitor copy` 之后调用，`package.json:29`），桌面同理由 `server/local-server.mjs:194-196` 伺服 `/models/*`（目录不存在就 404，让 transformers 回落远程）。网页版两者皆无 → 只能走 hf-mirror 下载。

### 2.4 本地翻译（整书对照的首选引擎）

`local-mt.ts`：引擎偏好键 `__nativethink_translate_engine`（`:17,38-47`），APK/桌面默认优先本地（`preferLocalMtByDefault()` `:134-137`）；单段截断 900 字符（`:122-124`）；**失败段留空**，由调用方决定补翻（`:107-131`）。消费点 `book-translation.ts:25,388`。

### 2.5 平台内置 AI 的隔离

`src/lib/capability-client.ts`：模块级单飞 `pending`，`import('@lark-apaas/client-toolkit-lite')` 后取 `capabilityClient`，失败把 `pending` 置 null 以便重试，**永远返回 `null` 而不是抛**。8 个调用点（思维/语块/对话/写作）。该 chunk 实测 507KB raw / 160KB gzip —— 静态引入它等于给四个 AI 路由各压 160KB 首屏（这正是 `perf(bundle)` 那轮修掉的）。

## 3. 注意事项

1. **`extractJson()` 是硬规定，且现在由守卫全仓扫**。历史上违反过两件事，2026-09-30 已全部清零：
   - **贪婪正则**：`use-passage-generator.ts:59`、`ChunkTrainingPage.tsx`（原 `:954`）、`DashboardPage.tsx:161`、`DailyLearningMode.tsx:157` 四处用 `match(/\{[\s\S]*\}/)` 之类 —— 贪婪 `.*` 会跨多个 JSON 片段把中间说明文字一起吞进同一个匹配（`utils.ts:34` 注释就是这条的理由）。现在四处都换 `extractJson`。
   - **缺判空前置**：原记 4 处，**实际清点出 7 处**（`ArticlePage.tsx` 3 处、`DeepVocabularyPage.tsx` 3 处、`use-spelling-sentences.ts` 1 处）—— 这类问题只会随新增调用点继续长，所以做成了全仓扫描的守卫。

   **守卫：`npm run verify:ai-parse`**（24 个解析点，注释行不参与判定）。元判据自证：同一段 `inspect()` 函数先跑三个固件（缺判空 / 贪婪正则 / 写对了），前两个必须各报 1 条、第三个必须 0 条 —— 否则"全仓 0 违规"可能只是检查器坏了。另有行为证据：真转译 `extractJson` 并断言 `extractJson('')` 抛的就是那句会被误读成"格式异常"的文案，以及同一份夹带文本的输入下贪婪匹配比 `extractJson` 多吞一段。变异实测：删掉任一判空前置会立刻红。

2. **空串不等于解析失败**。`use-ai.ts:61-89` 失败时 toast 后返回 `''` / `yield {content:'',done:true}`，AbortError 静默返回。所以调用方**必须先判 `!result.trim()`** 当作「服务不可用」，再谈解析。全仓 24 个解析点现在都有这道前置，由 `npm run verify:ai-parse` 每次扫。

3. **AGENTS.md 旧说法有误**：use-ai 失败并**不**统一 toast「AI 服务暂不可用，请稍后重试」，它 toast 的是 `err.message`（`use-ai.ts:69,84`）；那句文案是各页面自己发的。

4. **`ai-service.ts:101` 注释「Always route through server proxy to protect API key」与实现不符**：`:98` 把 `apiKey` 放进请求体，Key 也存在 localStorage，服务端只是"优先用客户端 Key"（`chat.js:76`）。别把这句注释当安全边界。

5. **端侧模型体积的文案口径不一致**：磁盘实测 `model_q4.onnx` = 786,156,820 B ≈ **750 MiB**，但 `local-llm.ts:5` 和 `AISettings.tsx:434` 写「约 400MB」，`local-mt.ts:4` 写 750MB。设置页那句「约 400MB」是**用户可见的误导**，要改文案。

6. **`local-llm` 因为被 `ai-service.ts:16-20` 静态引用而内联在入口 chunk**（产物 `index-*.js` 里能 grep 到 `onnx-community/Qwen2.5-0.5B-Instruct`）。这本身不重（就是个包装 + 状态机），真正的 22.5MB `ort-wasm-simd-threaded.asyncify-*.wasm` 和 538KB `transformers.web-*.js` 都只在 `import()` 里。但**任何往 `local-llm.ts` 顶部加静态 import 的改动都会直接进首屏** —— 改完跑 `npm run verify:bundle-budget`，它是从产物反查入口静态依赖图的。

7. **`scripts/.apikey` 必须留在 gitignore 里**（`.gitignore:4`）。提交它等于把 Key 推到公开仓库。

8. **`models-bundled/` 878MB，绝不能进 `src/` 或 `public/`**：它靠硬链接进 APK/桌面的 assets 目录，构建产物里只是引用。硬链接断了会变成真实拷贝，`.git` 和打包都会炸。

9. **`/api/ai/*` 的 CORS 三件套每个函数都要挂**（`functions/_lib/cors.js:6-29`：ACAO `*`、允许 `Content-Type, Authorization`、Max-Age 86400、OPTIONS → 204）。动机是 APK 内源是 `https://localhost`。新增函数忘记挂 `onRequest` 会在网页正常、APK 全挂。

10. **网页版和打包版走的是完全不同的模型可得性**：网页必须联网下载 22.5MB wasm + 模型，国内直连 huggingface.co 不通、靠 `hf-mirror` 排序；APK/桌面同源 `/models/` 命中即秒出。**测端侧兜底时别用网页结论推断 APK**。
