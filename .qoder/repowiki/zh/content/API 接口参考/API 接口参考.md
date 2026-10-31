# API 接口参考

<cite>
**本文引用的文件**   
- [wrangler.toml](file://wrangler.toml)
- [functions/_lib/cors.js](file://functions/_lib/cors.js)
- [functions/_lib/auth.js](file://functions/_lib/auth.js)
- [functions/_lib/jwt.js](file://functions/_lib/jwt.js)
- [functions/_lib/crypto.js](file://functions/_lib/crypto.js)
- [functions/_lib/kv.js](file://functions/_lib/kv.js)
- [functions/_lib/guard.js](file://functions/_lib/guard.js)
- [functions/_lib/types.ts](file://functions/_lib/types.ts)
- [functions/api/auth/login.js](file://functions/api/auth/login.js)
- [functions/api/auth/register.js](file://functions/api/auth/register.js)
- [functions/api/auth/me.js](file://functions/api/auth/me.js)
- [functions/api/data/sync.js](file://functions/api/data/sync.js)
- [functions/api/ai/chat.js](file://functions/api/ai/chat.js)
- [functions/api/ai/passage.js](file://functions/api/ai/passage.js)
- [functions/api/ai/transcribe.js](file://functions/api/ai/transcribe.js)
- [functions/api/tts.js](file://functions/api/tts.js)
- [functions/api/bilibili-info.js](file://functions/api/bilibili-info.js)
- [functions/api/bilibili-subtitle.js](file://functions/api/bilibili-subtitle.js)
- [functions/api/bilibili-transcribe.js](file://functions/api/bilibili-transcribe.js)
- [functions/api/gutenberg.js](file://functions/api/gutenberg.js)
- [functions/api/wikipedia.js](file://functions/api/wikipedia.js)
- [functions/api/word-image.js](file://functions/api/word-image.js)
</cite>

## 目录

1. [简介](#简介)
2. [项目结构与部署前提](#项目结构与部署前提)
3. [统一约定与错误模型](#统一约定与错误模型)
4. [认证体系](#认证体系)
5. [RESTful API 端点总览](#restful-api-端点总览)
6. [认证接口](#认证接口)
7. [数据同步接口](#数据同步接口)
8. [AI 服务接口](#ai-服务接口)
9. [TTS 接口](#tts-接口)
10. [外部资源代理接口](#外部资源代理接口)
11. [速率限制与安全策略](#速率限制与安全策略)
12. [客户端集成指南](#客户端集成指南)
13. [调试与排错](#调试与排错)
14. [性能特征与优化建议](#性能特征与优化建议)
15. [结论](#结论)

## 简介

NativeThink 的 Cloudflare Pages Functions 提供一组面向 Web、Electron 和 Capacitor APK 的前端应用的后端能力。这些函数主要承担以下职责：

- 用户注册、登录与会话验证；
- 基于 Cloudflare KV 的用户数据云同步；
- 多厂商 AI 聊天代理、阅读段落生成与语音转写；
- 通过 Google Translate TTS 代理获取 MP3 语音；
- B站视频信息、字幕与音频转写代理；
- 古腾堡公版书全文、英文维基百科词条与单词插图代理。

所有响应均附加跨域响应头，以支持 Capacitor APK 内 `https://localhost` 源直接调用云端函数。

```mermaid
graph TB
    Client["前端客户端<br/>Web / Electron / Capacitor APK"] --> Gateway["Cloudflare Pages Functions"]
    Gateway --> Auth["认证模块"]
    Gateway --> KV["Cloudflare KV"]
    Gateway --> AIProxy["AI 聊天代理"]
    Gateway --> ASR["语音转写代理"]
    Gateway --> TTS["TTS 代理"]
    Gateway --> External["外部站点<br/>B站 / Wikipedia / Gutenberg / 百度 / Bing / 上游 LLM"]

    Auth --> KV
    ASR --> External
    AIProxy --> External
    TTS --> External
```

**图示来源**  
- [functions/_lib/cors.js:1-29](file://functions/_lib/cors.js#L1-L29)
- [functions/_lib/auth.js:1-8](file://functions/_lib/auth.js#L1-L8)
- [functions/_lib/kv.js:1-6](file://functions/_lib/kv.js#L1-L6)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/ai/transcribe.js:1-345](file://functions/api/ai/transcribe.js#L1-L345)
- [functions/api/tts.js:1-69](file://functions/api/tts.js#L1-L69)

**章节来源**  
- [wrangler.toml:1-9](file://wrangler.toml#L1-L9)

## 项目结构与部署前提

### 部署配置

| 配置项 | 值或说明 |
|---|---|
| 项目名称 | `nativethink` |
| 兼容性日期 | `2024-12-01` |
| Pages 构建输出目录 | `dist/client` |
| KV 绑定名称 | `KV` |
| KV 命名空间 ID | 由部署环境配置，代码中为示例占位值 |

### 关键环境变量

| 变量名 | 用途 | 是否必填 |
|---|---|---|
| `JWT_SECRET` | JWT HS256 签名密钥 | 认证必需 |
| `AI_KEY_<PROVIDER>` | 指定 AI 提供商的 API Key，如 `AI_KEY_DEEPSEEK`、`AI_KEY_GROQ` | 按需配置 |
| `SERVER_AI_KEY` | 出厂默认 AI Key，供未显式传 `apiKey` 的请求使用 | 可选但推荐 |
| `SERVER_AI_ENDPOINT` | 段落生成使用的 AI 基础地址 | 可选 |
| `SERVER_AI_MODEL` | 段落生成使用的 AI 模型 | 可选 |
| `BILIBILI_COOKIE` | B站登录 Cookie，提升字幕与播放质量 | 可选 |
| `OPENAI_API_KEY` | B站专用 Whisper 转写所需的 OpenAI 兼容 Key | 仅 `/api/bilibili-transcribe` 需要 |
| `OPENAI_BASE_URL` | B站专用 Whisper 的基础 URL | 可选 |

**章节来源**  
- [wrangler.toml:1-9](file://wrangler.toml#L1-L9)
- [functions/_lib/jwt.js:1-26](file://functions/_lib/jwt.js#L1-L26)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/ai/passage.js:1-77](file://functions/api/ai/passage.js#L1-L77)
- [functions/api/ai/transcribe.js:1-345](file://functions/api/ai/transcribe.js#L1-L345)
- [functions/api/bilibili-transcribe.js:1-296](file://functions/api/bilibili-transcribe.js#L1-L296)

## 统一约定与错误模型

### HTTP 方法约束

大多数函数在入口处校验请求方法：

- 认证与同步接口要求明确的 `POST`；
- AI 聊天允许 `GET` 查询用量快照，其余走 `POST`；
- B站与外部资源代理多为 `GET`；
- 不支持的方法通常返回状态码 `405`。

### 统一错误字段

服务端 JSON 错误响应通常包含 `error` 字段。部分接口还会额外返回业务辅助字段，例如：

| 字段 | 含义 |
|---|---|
| `error` | 人类可读的错误消息 |
| `detail` | 上游错误或调试细节 |
| `fallback` | 提示客户端可回退到本地逻辑 |
| `code` / `message` | 透传第三方 API 的状态码与消息 |
| `text` / `segments` | 语音转写结果字段 |
| `provider` / `model` | 实际使用的 AI 或 ASR 提供商 |
| `source` | 数据来源，如 `whisper`、`bilibili`、`none` |
| `episodeList` / `totalEpisodes` | B站分集信息 |

### 成功响应结构

成功响应不采用单一固定格式，而是按功能分组：

- 认证返回 `{ token, user }`；
- 同步上传返回 `{ ok, synced, deleted }`；
- 同步下载返回 `{ data }`；
- AI 聊天返回上游聊天响应或 SSE 流；
- 转写返回 `{ text, segments, provider, model, source, episodeList }`；
- 外部代理返回各自语义化的数据结构。

### CORS 行为

所有函数统一通过中间件添加以下响应头：

| 响应头 | 值 |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization` |
| `Access-Control-Max-Age` | `86400` |

预检请求（`OPTIONS`）直接返回 `204`，不会进入业务处理器。

**章节来源**  
- [functions/_lib/cors.js:1-29](file://functions/_lib/cors.js#L1-L29)
- [functions/api/auth/login.js:1-49](file://functions/api/auth/login.js#L1-L49)
- [functions/api/auth/register.js:1-81](file://functions/api/auth/register.js#L1-L81)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/ai/transcribe.js:1-345](file://functions/api/ai/transcribe.js#L1-L345)

## 认证体系

### 令牌格式

系统使用 HS256 签发 JWT，载荷包含：

| 字段 | 类型 | 含义 |
|---|---|---|
| `sub` | 字符串 | 用户 ID |
| `email` | 字符串 | 用户邮箱 |

令牌有效期为 30 天。客户端应将其保存在安全存储中，并在后续受保护请求的 `Authorization` 头部携带 `Bearer <token>`。

### 密码存储

密码不使用明文哈希直存，而是通过 Web Crypto PBKDF2 派生：

- 盐长度：16 字节；
- 迭代次数：100,000；
- 哈希算法：SHA-256；
- 输出长度：256 位；
- 存储格式：`saltHex:hashHex`。

该实现位于 Workers 原生加密 API 上，适合无 Node.js `crypto` 的环境。

### 用户数据存储

用户记录存储在 Cloudflare KV 中，键模式如下：

| 用途 | KV 键模式 |
|---|---|
| 按邮箱查找用户 | `users:email:<email>` |
| 用户数据同步键 | `users:data:<userId>:<key>` |
| 已生成段落 | `passages:<userId>:<passageId>` |

用户对象包含：

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | 字符串 | 用户唯一标识 |
| `email` | 字符串 | 邮箱地址 |
| `passwordHash` | 字符串 | PBKDF2 哈希 |
| `createdAt` | 数字 | 创建时间戳 |

```mermaid
sequenceDiagram
    participant C as "客户端"
    participant R as "注册接口"
    participant K as "KV 存储"
    participant J as "JWT 签发"

    C->>R: "POST /api/auth/register"
    R->>R: "校验邮箱与密码"
    R->>K: "检查邮箱是否已存在"
    K-->>R: "不存在则继续"
    R->>R: "PBKDF2 密码哈希"
    R->>K: "写入 users:email:<email>"
    R->>J: "签发 30 天 JWT"
    J-->>R: "token"
    R-->>C: "{ token, user }"
```

**图示来源**  
- [functions/api/auth/register.js:1-81](file://functions/api/auth/register.js#L1-L81)
- [functions/_lib/crypto.js:1-26](file://functions/_lib/crypto.js#L1-L26)
- [functions/_lib/jwt.js:1-26](file://functions/_lib/jwt.js#L1-L26)
- [functions/_lib/kv.js:1-6](file://functions/_lib/kv.js#L1-L6)

**章节来源**  
- [functions/_lib/auth.js:1-8](file://functions/_lib/auth.js#L1-L8)
- [functions/_lib/jwt.js:1-26](file://functions/_lib/jwt.js#L1-L26)
- [functions/_lib/crypto.js:1-26](file://functions/_lib/crypto.js#L1-L26)
- [functions/_lib/kv.js:1-6](file://functions/_lib/kv.js#L1-L6)
- [functions/_lib/types.ts:1-21](file://functions/_lib/types.ts#L1-L21)

## RESTful API 端点总览

| 分类 | 方法 | URL | 认证 | 说明 |
|---|---|---|---:|---|
| 认证 | `POST` | `/api/auth/register` | 否 | 注册用户并返回 JWT |
| 认证 | `POST` | `/api/auth/login` | 否 | 登录并返回 JWT |
| 认证 | `GET` | `/api/auth/me` | 是 | 验证当前会话 |
| 同步 | `POST` | `/api/data/sync` | 是 | 批量上传本地数据 |
| 同步 | `GET` | `/api/data/sync` | 是 | 拉取云端数据 |
| AI | `POST` | `/api/ai/chat` | 否 | 多厂商 AI 聊天代理 |
| AI | `GET` | `/api/ai/chat` | 否 | 查询出厂 Key 用量快照 |
| AI | `POST` | `/api/ai/passage` | 否 | 生成复习阅读段落 |
| AI | `POST` | `/api/ai/transcribe` | 否 | 音频转写 |
| TTS | `GET` | `/api/tts` | 否 | Google Translate 语音合成 |
| B站 | `GET` | `/api/bilibili-info` | 否 | 视频与合集信息 |
| B站 | `GET` | `/api/bilibili-subtitle` | 否 | 获取 B站字幕 |
| B站 | `GET` | `/api/bilibili-transcribe` | 否 | B站音频转写 |
| 书籍 | `GET` | `/api/gutenberg` | 否 | 古腾堡公版书全文 |
| 百科 | `GET` | `/api/wikipedia` | 否 | 英文维基百科搜索与页面 |
| 词汇 | `GET` | `/api/word-image` | 否 | 单词配图检索 |

**章节来源**  
- [functions/api/auth/register.js:1-81](file://functions/api/auth/register.js#L1-L81)
- [functions/api/auth/login.js:1-49](file://functions/api/auth/login.js#L1-L49)
- [functions/api/auth/me.js:1-22](file://functions/api/auth/me.js#L1-L22)
- [functions/api/data/sync.js:1-63](file://functions/api/data/sync.js#L1-L63)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/ai/passage.js:1-77](file://functions/api/ai/passage.js#L1-L77)
- [functions/api/ai/transcribe.js:1-345](file://functions/api/ai/transcribe.js#L1-L345)
- [functions/api/tts.js:1-69](file://functions/api/tts.js#L1-L69)
- [functions/api/bilibili-info.js:1-68](file://functions/api/bilibili-info.js#L1-L68)
- [functions/api/bilibili-subtitle.js:1-158](file://functions/api/bilibili-subtitle.js#L1-L158)
- [functions/api/bilibili-transcribe.js:1-296](file://functions/api/bilibili-transcribe.js#L1-L296)
- [functions/api/gutenberg.js:1-45](file://functions/api/gutenberg.js#L1-L45)
- [functions/api/wikipedia.js:1-107](file://functions/api/wikipedia.js#L1-L107)
- [functions/api/word-image.js:1-112](file://functions/api/word-image.js#L1-L112)

## 认证接口

### 注册：`POST /api/auth/register`

#### 请求体

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `email` | 字符串 | 是 | 非空、含 `@`、长度不超过 255，自动转为小写并去除首尾空格 |
| `password` | 字符串 | 是 | 至少 6 位 |

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `token` | 字符串 | HS256 JWT |
| `user.id` | 字符串 | 用户 ID |
| `user.email` | 字符串 | 邮箱 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | JSON 无效、邮箱格式无效、密码过短 |
| `405` | 非 `POST` |
| `409` | 邮箱已注册 |
| `500` | KV 读写失败、密码哈希失败、JWT 生成失败、未知错误 |

#### 请求示例

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "learner@example.com",
  "password": "securepass"
}
```

#### 响应示例

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "a1b2c3d4",
    "email": "learner@example.com"
  }
}
```

**章节来源**  
- [functions/api/auth/register.js:1-81](file://functions/api/auth/register.js#L1-L81)
- [functions/_lib/crypto.js:1-26](file://functions/_lib/crypto.js#L1-L26)
- [functions/_lib/jwt.js:1-26](file://functions/_lib/jwt.js#L1-L26)

### 登录：`POST /api/auth/login`

#### 请求体

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `email` | 字符串 | 是 | 非空，自动转为小写 |
| `password` | 字符串 | 是 | 与注册时密码一致 |

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `token` | 字符串 | HS256 JWT |
| `user.id` | 字符串 | 用户 ID |
| `user.email` | 字符串 | 邮箱 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | JSON 无效或缺少字段 |
| `401` | 邮箱或密码错误 |
| `405` | 非 `POST` |
| `500` | KV 未配置、内部异常 |

#### 请求示例

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "learner@example.com",
  "password": "securepass"
}
```

#### 响应示例

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "a1b2c3d4",
    "email": "learner@example.com"
  }
}
```

**章节来源**  
- [functions/api/auth/login.js:1-49](file://functions/api/auth/login.js#L1-L49)
- [functions/_lib/crypto.js:1-26](file://functions/_lib/crypto.js#L1-L26)
- [functions/_lib/jwt.js:1-26](file://functions/_lib/jwt.js#L1-L26)

### 获取当前用户：`GET /api/auth/me`

#### 认证要求

必须在请求头中携带：

```
Authorization: Bearer <JWT>
```

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `user.id` | 字符串 | 当前用户 ID |
| `user.email` | 字符串 | 当前用户邮箱 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `401` | 缺少或无效的 Bearer Token |
| `500` | 内部异常 |

#### 请求示例

```http
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

#### 响应示例

```json
{
  "user": {
    "id": "a1b2c3d4",
    "email": "learner@example.com"
  }
}
```

**章节来源**  
- [functions/api/auth/me.js:1-22](file://functions/api/auth/me.js#L1-L22)
- [functions/_lib/auth.js:1-8](file://functions/_lib/auth.js#L1-L8)
- [functions/_lib/jwt.js:1-26](file://functions/_lib/jwt.js#L1-L26)

## 数据同步接口

### 批量上传：`POST /api/data/sync`

#### 认证要求

必须携带有效 Bearer Token。

#### 请求体

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| `upserts` | 对象 | 是 | 键值对，键为本地 `localStorage` 键名，值为任意可序列化值 |
| `deletes` | 数组 | 否 | 要删除的本地键名列表 |

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `ok` | 布尔 | 同步成功 |
| `synced` | 数字 | 写入 KV 的键数量 |
| `deleted` | 数字 | 删除的键数量 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | JSON 无效 |
| `401` | 未认证 |
| `500` | KV 未配置、同步失败 |

#### 请求示例

```http
POST /api/data/sync
Content-Type: application/json
Authorization: Bearer <token>

{
  "upserts": {
    "favorites": ["apple", "banana"],
    "settings.theme": "dark"
  },
  "deletes": ["old-key"]
}
```

#### 响应示例

```json
{
  "ok": true,
  "synced": 2,
  "deleted": 1
}
```

### 拉取云端数据：`GET /api/data/sync`

#### 认证要求

必须携带有效 Bearer Token。

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `data` | 对象 | 当前用户的所有 KV 数据，键为去掉前缀后的原始键名 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `401` | 未认证 |
| `500` | 认证失败、KV 未配置、同步失败 |

#### 响应示例

```json
{
  "data": {
    "favorites": ["apple", "banana"],
    "settings.theme": "dark"
  }
}
```

**章节来源**  
- [functions/api/data/sync.js:1-63](file://functions/api/data/sync.js#L1-L63)
- [functions/_lib/kv.js:1-6](file://functions/_lib/kv.js#L1-L6)

## AI 服务接口

### AI 聊天：`POST /api/ai/chat`

#### 功能概述

该接口是多厂商大语言模型聊天代理。它避免将 API Key 暴露给前端，并支持流式响应。

#### 支持的提供商

| 提供商 | 默认模型 | 说明 |
|---|---|---|
| `deepseek` | `deepseek-chat` | 默认提供商 |
| `doubao` | `doubao-lite-32k` | 火山引擎 |
| `qwen` | `qwen-turbo` | 通义千问 |
| `factory` | `glm-4-flash-250414` | 智谱出厂免费档 |
| `glm` | `glm-4-flash` | 智谱 |
| `siliconflow` | `Qwen/Qwen2.5-7B-Instruct` | 硅基流动 |
| `moonshot` | `moonshot-v1-8k` | Moonshot |
| `groq` | `llama-3.1-8b-instant` | Groq |

#### 请求体

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---:|---|
| `provider` | 字符串 | `deepseek` | 目标 AI 提供商 |
| `model` | 字符串 | 各提供商默认模型 | 覆盖默认模型 |
| `messages` | 数组 | 必填 | 聊天消息历史 |
| `max_tokens` | 数字 | `4096` | 最大输出 token |
| `temperature` | 数字 | `0.7` | 采样温度 |
| `stream` | 布尔 | `true` | 是否返回 SSE 流 |
| `apiKey` | 字符串 | 可选 | 客户端自有 Key；缺失时使用服务端 Key |
| `thinking` | 对象或布尔 | 智谱厂牌可用 | 控制思考模式 |
| `task` | 字符串 | 可选 | 任务类型，用于智谱免费档模型选择 |

#### 消息格式

`messages` 中每项必须是对象，且满足：

- `role` 为字符串；
- `content` 为字符串；
- 总数不超过 80；
- 所有 `content` 累计不超过 64,000 字符；
- 空内容消息会被过滤。

#### Key 优先级

1. 请求中的 `apiKey`；
2. 环境变量 `AI_KEY_<PROVIDER>`；
3. 环境变量 `SERVER_AI_KEY`。

#### 智谱免费档降级

当提供商为 `glm` 或 `factory` 时，若上游返回限流或服务端错误，会按候选链重试：

1. 若传入 `task=translate`，优先使用 `glm-4.7-flash`；
2. 若传入 `task=chat`，优先使用 `glm-4-flash-250414`；
3. 否则优先使用请求中的 `model`；
4. 随后依次尝试 `glm-4-flash-250414`、`glm-4-flash`、`glm-4v-flash`、`glm-4.7-flash`。

鉴权类错误（如 `401`、`403`）不会触发降级。

#### 流式响应

当 `stream=true` 时，响应头为：

| 响应头 | 值 |
|---|---|
| `Content-Type` | `text/event-stream` |
| `Cache-Control` | `no-cache` |
| `Connection` | `keep-alive` |

客户端应作为 SSE 流处理，而不是等待完整 JSON。

#### 用量快照

对同一端点发起 `GET` 请求可获取当日出厂 Key 用量统计：

| 字段 | 类型 | 含义 |
|---|---|---|
| `usage.day` | 字符串 | 统计日期 |
| `usage.factoryTotal` | 数字 | 当日出厂 Key 使用总量 |
| `usage.byProvider` | 对象 | 按提供商的计数 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | JSON 无效、消息格式非法、全部消息为空、未知提供商 |
| `403` | Origin 不在白名单 |
| `405` | 非 `GET` 或非 `POST` |
| `429` | IP 频率限制 |
| `500` | 上游请求失败 |
| `502` | 所有候选模型均失败 |
| `503` | 未配置对应提供商的 AI Key |

#### 请求示例

```http
POST /api/ai/chat
Content-Type: application/json

{
  "provider": "deepseek",
  "messages": [
    {
      "role": "user",
      "content": "用简单英语解释什么是动词时态"
    }
  ],
  "stream": true
}
```

#### 非流式响应示例

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "English tenses describe when an action happens..."
      }
    }
  ]
}
```

#### 用量快照响应示例

```json
{
  "usage": {
    "day": "2026-10-24",
    "factoryTotal": 12,
    "byProvider": {
      "factory": 8,
      "glm": 4
    }
  }
}
```

```mermaid
sequenceDiagram
    participant C as "客户端"
    participant S as "AI 聊天接口"
    participant G as "防护层"
    participant U as "上游 LLM"

    C->>S: "POST /api/ai/chat"
    S->>G: "Origin 白名单检查"
    G-->>S: "允许或拒绝"
    S->>G: "IP 分钟窗限流检查"
    G-->>S: "允许或 429"
    S->>S: "校验 messages 与 apiKey"
    S->>U: "转发聊天请求"
    alt "流式"
        U-->>S: "SSE 流"
        S-->>C: "转发 SSE 流"
    else "非流式"
        U-->>S: "JSON 响应"
        S-->>C: "JSON 响应"
    end
```

**图示来源**  
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/_lib/guard.js:1-89](file://functions/_lib/guard.js#L1-L89)

**章节来源**  
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/_lib/guard.js:1-89](file://functions/_lib/guard.js#L1-L89)

### 阅读段落生成：`POST /api/ai/passage`

#### 功能概述

根据给定词汇列表生成一篇适合英语学习者的短文，并将结果保存到 KV。

#### 请求体

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| `words` | 字符串数组 | 是 | 要自然融入的词汇 |
| `mode` | 字符串 | 否 | 若为 `client`，返回 `{ mode: "client" }` |
| `apiKey` | 字符串 | 否 | 客户端自有 Key |

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `passage.id` | 字符串 | 段落 ID |
| `passage.title` | 字符串 | 段落标题 |
| `passage.content` | 字符串 | 正文 |
| `passage.words` | 字符串数组 | 实际使用的词汇 |
| `passage.createdAt` | 数字 | 创建时间戳 |

#### 认证行为

如果请求可解析出有效 Bearer Token，段落会写入 KV 的 `passages:<userId>:<id>`；否则仅返回结果，不持久化。

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | 未提供词汇 |
| `500` | 服务端异常 |
| `502` | 上游 AI 返回错误或非 JSON |
| `503` | 未配置 AI Key |

#### 请求示例

```http
POST /api/ai/passage
Content-Type: application/json

{
  "words": ["abandon", "curious", "persistent"]
}
```

#### 响应示例

```json
{
  "passage": {
    "id": "p1a2b3c4",
    "title": "A Curious Journey",
    "content": "Tom was a curious boy who never abandoned his goals...",
    "words": ["abandon", "curious", "persistent"],
    "createdAt": 1729766400000
  }
}
```

**章节来源**  
- [functions/api/ai/passage.js:1-77](file://functions/api/ai/passage.js#L1-L77)

### 语音转写：`POST /api/ai/transcribe`

#### 功能概述

该接口同时支持两种输入方式：

1. **上传录音**：`multipart/form-data`；
2. **B站视频转写**：`application/json`。

支持的 ASR 提供商包括 `groq`、`siliconflow`、`glm`。

#### 输入模式一：上传音频

表单字段：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| `audio` | 二进制文件 | 是 | 音频文件，上限约 8 MB |
| `provider` | 字符串 | 否 | 默认 `glm` |
| `apiKey` | 字符串 | 否 | 提供商 Key |
| `language` | 字符串 | 否 | 默认 `en`，最多截取前 8 个字符 |

#### 输入模式二：B站视频转写

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| `bvid` | 字符串 | 条件必填 | B站视频编号 |
| `cid` | 字符串 | 可选 | 分 P CID |
| `page` | 数字 | 否 | 默认第 1 页 |
| `audioUrl` | 字符串 | 条件必填 | 可直接下载的音频地址 |
| `provider` | 字符串 | 否 | 默认 `groq` |
| `apiKey` | 字符串 | 否 | 提供商 Key |
| `language` | 字符串 | 否 | 默认 `en` |

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `text` | 字符串 | 合并后的转写文本 |
| `segments` | 数组 | 带时间戳的分段 |
| `provider` | 字符串 | 实际使用的 ASR 提供商 |
| `model` | 字符串 | 实际使用的模型 |
| `source` | 字符串 | 通常为 `whisper` |
| `episodeList` | 数组 | B站分集列表 |
| `totalEpisodes` | 数字 | 分集总数 |
| `error` | 字符串或空 | 成功时为 `null` |

分段对象结构：

| 字段 | 类型 | 含义 |
|---|---|---|
| `start` | 数字 | 起始秒数 |
| `end` | 数字 | 结束秒数 |
| `en` | 字符串 | 英文文本 |
| `zh` | 字符串 | 中文翻译，目前为空 |
| `keywords` | 数组 | 提取出的关键词 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | 输入格式错误、不支持的提供商 |
| `403` | Origin 不在白名单 |
| `405` | 非 `POST` |
| `429` | IP 频率限制 |
| `502` | ASR 上游失败 |
| `503` | 未配置 ASR Key |

#### 请求示例：上传音频

```http
POST /api/ai/transcribe
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="audio"; filename="recording.webm"
Content-Type: audio/webm

<binary audio data>
------WebKitFormBoundary
Content-Disposition: form-data; name="provider"

glm
------WebKitFormBoundary
Content-Disposition: form-data; name="apiKey"

your-asr-key
------WebKitFormBoundary
Content-Disposition: form-data; name="language"

en
------WebKitFormBoundary--
```

#### 请求示例：B站视频转写

```http
POST /api/ai/transcribe
Content-Type: application/json

{
  "bvid": "BV1xxxxxxx",
  "page": 1,
  "provider": "groq",
  "apiKey": "your-asr-key",
  "language": "en"
}
```

#### 响应示例

```json
{
  "text": "Hello world, this is a practice sentence.",
  "segments": [
    {
      "start": 0.0,
      "end": 1.5,
      "en": "Hello world,",
      "zh": "",
      "keywords": []
    }
  ],
  "provider": "glm",
  "model": "GLM-ASR-2512",
  "source": "whisper",
  "error": null,
  "episodeList": [],
  "totalEpisodes": 0
}
```

**章节来源**  
- [functions/api/ai/transcribe.js:1-345](file://functions/api/ai/transcribe.js#L1-L345)

## TTS 接口

### 语音合成：`GET /api/tts`

#### 功能概述

该接口代理 Google Translate TTS，从 Cloudflare 边缘节点返回 MP3 音频。相同文本会在 CDN 层缓存一年，因此首次播放后重复播放速度极快。

#### 查询参数

| 参数 | 类型 | 默认值 | 规则 |
|---|---|---|---|
| `text` | 字符串 | 必填 | 待朗读文本 |
| `lang` | 字符串 | `en` | 语言代码 |

#### 文本长度限制

上游 Google TTS 硬性上限约为 200 字符。超过该长度的请求会直接返回 `400`，客户端应自行切分文本。

#### 成功响应

- `Content-Type`：`audio/mpeg`；
- 响应体为 MP3 二进制流；
- 缓存头允许公共缓存一年且不可变。

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | 缺少文本或文本过长 |
| `500` | 代理异常 |
| `502` | 上游返回非 200 |

#### 请求示例

```http
GET /api/tts?text=hello+world&lang=en
```

#### 响应示例

```http
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Cache-Control: public, max-age=31536000, immutable

<MP3 audio bytes>
```

**章节来源**  
- [functions/api/tts.js:1-69](file://functions/api/tts.js#L1-L69)

## 外部资源代理接口

### B站视频信息：`GET /api/bilibili-info`

#### 查询参数

| 参数 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `bvid` | 字符串 | 是 | 必须以 `BV` 开头，之后至少 10 位字母数字 |

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `title` | 字符串 | 视频标题 |
| `episodes` | 数字 | 集数 |
| `duration` | 数字 | 时长 |
| `channel` | 字符串 | 频道或作者 |
| `pages` | 数组 | 分集列表，每项含 `page`、`part`、`duration` |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | BVID 无效或 B站 API 返回错误 |
| `500` | 网络异常 |

#### 请求示例

```http
GET /api/bilibili-info?bvid=BV1xxxxxxx
```

#### 响应示例

```json
{
  "title": "英语听力练习",
  "episodes": 3,
  "duration": 1200,
  "channel": "English Channel",
  "pages": [
    { "page": 1, "part": "Part One", "duration": 600 }
  ]
}
```

**章节来源**  
- [functions/api/bilibili-info.js:1-68](file://functions/api/bilibili-info.js#L1-L68)

### B站字幕：`GET /api/bilibili-subtitle`

#### 查询参数

| 参数 | 类型 | 默认值 | 规则 |
|---|---|---:|---|
| `bvid` | 字符串 | 必填 | 大小写敏感，必须匹配 `BV` + 字母数字 |
| `page` | 数字 | `1` | 目标分 P |

#### 行为说明

- 接口会先获取视频信息；
- 然后轮询 B站字幕接口，最多重试约 6 秒；
- 优先选择英文字幕轨道；
- 若只有中文 AI 字幕，则不会将其当作英文字幕返回；
- 即使全部失败也返回 `200`，由前端处理空字幕；
- 可使用 `BILIBILI_COOKIE` 启用登录态。

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `bvid` | 字符串 | 原视频编号 |
| `page` | 数字 | 请求分 P |
| `cid` | 数字 | 分 P CID |
| `part` | 字符串 | 分集标题 |
| `segments` | 数组 | 字幕分段 |
| `source` | 字符串 | 成功时可能为 `bilibili` |
| `error` | 字符串或空 | 始终为 `null` |
| `episodeList` | 数组 | 分集元数据 |
| `totalEpisodes` | 数字 | 分集总数 |

分段对象：

| 字段 | 类型 | 含义 |
|---|---|---|
| `start` | 数字 | 开始时间 |
| `end` | 数字 | 结束时间 |
| `en` | 字符串 | 英文字幕 |
| `zh` | 字符串 | 中文字幕 |
| `keywords` | 数组 | 关键词 |

#### 请求示例

```http
GET /api/bilibili-subtitle?bvid=BV1xxxxxxx&page=1
```

#### 响应示例

```json
{
  "bvid": "BV1xxxxxxx",
  "page": 1,
  "cid": 123456789,
  "part": "Part One",
  "segments": [
    {
      "start": 0.0,
      "end": 3.0,
      "en": "This is an English subtitle.",
      "zh": "这是一条英文字幕。",
      "keywords": []
    }
  ],
  "source": "bilibili",
  "error": null,
  "episodeList": [],
  "totalEpisodes": 1
}
```

**章节来源**  
- [functions/api/bilibili-subtitle.js:1-158](file://functions/api/bilibili-subtitle.js#L1-L158)

### B站音频转写：`GET /api/bilibili-transcribe`

#### 查询参数

| 参数 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| `bvid` | 字符串 | 是 | B站视频编号 |
| `cid` | 字符串 | 可选 | 分 P CID |
| `page` | 数字 | 否 | 默认第 1 页 |

#### 前置条件

该接口依赖：

- `OPENAI_API_KEY`；
- 可选 `OPENAI_BASE_URL`；
- B站 WBI 签名流程；
- B站播放接口返回 DASH 音频。

#### 成功响应

返回带时间戳的字幕分段，结构与 `/api/ai/transcribe` 类似。

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | BVID 无效 |
| `500` | 未配置 Key、B站 API 错误、未找到分集、获取音频失败 |

#### 请求示例

```http
GET /api/bilibili-transcribe?bvid=BV1xxxxxxx&page=1
```

**章节来源**  
- [functions/api/bilibili-transcribe.js:1-296](file://functions/api/bilibili-transcribe.js#L1-L296)

### 古腾堡公版书：`GET /api/gutenberg`

#### 查询参数

| 参数 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `id` | 字符串 | 是 | 1 至 5 位数字 |

#### 行为说明

接口依次尝试两个 Gutenberg 地址，任一成功且文本长度大于 1000 即返回。

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `text` | 字符串 | 公版书全文 |

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | id 格式无效 |
| `502` | 书不可达 |

#### 请求示例

```http
GET /api/gutenberg?id=1342
```

#### 响应示例

```json
{
  "text": "It was the best of times, it was the worst of times..."
}
```

**章节来源**  
- [functions/api/gutenberg.js:1-45](file://functions/api/gutenberg.js#L1-L45)

### 英文维基百科：`GET /api/wikipedia`

#### 动作枚举

| 动作 | 说明 |
|---|---|
| `search` | 全文搜索，返回标题与字数 |
| `page` | 获取纯文本页面，按段落拆分 |

#### 搜索参数

| 参数 | 类型 | 默认值 | 规则 |
|---|---|---:|---|
| `action` | 字符串 | `search` | 固定为 `search` |
| `q` | 字符串 | 必填 | 搜索词 |
| `limit` | 数字 | `20` | 最大 50 |

#### 页面参数

| 参数 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| `action` | 字符串 | 是 | 固定为 `page` |
| `title` | 字符串 | 是 | 条目标题 |

#### 搜索响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `results` | 数组 | 搜索结果 |

搜索结果项：

| 字段 | 类型 | 含义 |
|---|---|---|
| `title` | 字符串 | 条目标题 |
| `wordCount` | 数字 | 字数 |

#### 页面响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `title` | 字符串 | 页面标题 |
| `paragraphs` | 数组 | 段落文本 |

段落中若包含一级章节标题，会以 `[SECTION] 标题` 形式返回，便于前端渲染目录。

#### 错误响应

| 状态码 | 含义 |
|---|---|
| `400` | 缺少 title、未知 action |
| `404` | 条目不存在 |
| `502` | 维基百科加载失败 |

#### 请求示例

```http
GET /api/wikipedia?action=search&q=earth&limit=20
GET /api/wikipedia?action=page&title=Earth
```

#### 响应示例

```json
{
  "title": "Earth",
  "paragraphs": [
    "[SECTION] Overview",
    "Earth is the third planet from the Sun and the only astronomical object known to harbor life.",
    "[SECTION] Structure",
    "Earth's mass is ..."
  ]
}
```

**章节来源**  
- [functions/api/wikipedia.js:1-107](file://functions/api/wikipedia.js#L1-L107)

### 单词配图：`GET /api/word-image`

#### 查询参数

| 参数 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `word` | 字符串 | 是 | 小写字母、撇号、连字符和空格，首字符必须为字母，长度不超过 31 |

#### 行为说明

- 并行请求 Bing 安全搜索与百度图片建议；
- 将 HTTP 链接转为 HTTPS；
- 去重并丢弃可疑不安全 URL；
- 相关性优先：URL 中包含单词本身的链接排在前面；
- 最多返回 8 张图片。

#### 成功响应

| 字段 | 类型 | 含义 |
|---|---|---|
| `images` | 字符串数组 | 图片 URL 列表 |

#### 错误响应

- 输入非法时返回 `{ images: [] }`；
- 外部搜索失败时不会抛出异常，而是尽可能聚合可用结果。

#### 请求示例

```http
GET /api/word-image?word=apple
```

#### 响应示例

```json
{
  "images": [
    "https://example.com/apple-thumb.jpg",
    "https://example.com/apple-original.jpg"
  ]
}
```

**章节来源**  
- [functions/api/word-image.js:1-112](file://functions/api/word-image.js#L1-L112)

## 速率限制与安全策略

### Origin 白名单

AI 聊天与转写接口通过白名单防止第三方网页把后端当作免费 AI 中继。允许的 Origin 包括：

- `https://nativethink.pages.dev`；
- `https://localhost`；
- `http://localhost`；
- `http://127.0.0.1`；
- 带端口号的本地开发地址。

浏览器发出的 POST 一定携带 `Origin`；缺失或不在白名单的请求会被拒绝。

### IP 频率限制

- 窗口大小：60 秒；
- 每 IP 窗口最大请求数：30；
- 计数器保存在 isolate 内存中，不写入 KV；
- 超过限制返回 `429 Too many requests, slow down`；
- 内存映射超过 5,000 项时会清理过期条目，防止无限增长。

### 消息体防护

AI 聊天接口对 `messages` 进行严格校验：

- 必须是数组；
- 非空；
- 每项为对象；
- `role` 与 `content` 必须为字符串；
- 最多 80 条消息；
- 所有 `content` 累计不超过 64,000 字符。

### 其他安全措施

| 措施 | 位置 | 目的 |
|---|---|---|
| PBKDF2 密码哈希 | 注册与登录 | 防止明文密码泄露 |
| HS256 JWT | 认证 | 会话身份校验 |
| BVID 正则校验 | B站接口 | 防止非法输入 |
| 单词正则校验 | 单词配图 | 防止注入与滥用 |
| 文本长度限制 | TTS | 避免上游 400 错误 |
| 音频大小限制 | 语音转写 | 防止超大上传 |
| 不安全图片过滤 | 单词配图 | 学习场景内容安全 |
| Origin 白名单 | AI 接口 | 防止免费中转滥用 |
| IP 限流 | AI 接口 | 防刷 |

```mermaid
flowchart TD
    Start["请求进入"] --> Method["校验 HTTP 方法"]
    Method --> Preflight{"是否为 OPTIONS"}
    Preflight -->|是| Return204["返回 204 预检响应"]
    Preflight -->|否| Cors["附加 CORS 响应头"]
    Cors --> Protected{"是否需要认证"}
    Protected -->|是| VerifyAuth["校验 Bearer Token"]
    Protected -->|否| CheckOrigin["AI 接口：Origin 白名单"]
    VerifyAuth --> RateLimit["IP 频率限制"]
    CheckOrigin --> RateLimit
    RateLimit --> ValidateBody["校验请求体"]
    ValidateBody --> Business["执行业务逻辑"]
    Business --> Response["返回 JSON 或流式响应"]
```

**图示来源**  
- [functions/_lib/cors.js:1-29](file://functions/_lib/cors.js#L1-L29)
- [functions/_lib/auth.js:1-8](file://functions/_lib/auth.js#L1-L8)
- [functions/_lib/guard.js:1-89](file://functions/_lib/guard.js#L1-L89)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)

**章节来源**  
- [functions/_lib/guard.js:1-89](file://functions/_lib/guard.js#L1-L89)

## 客户端集成指南

### 认证流程

1. 用户填写邮箱和密码；
2. 调用 `/api/auth/register` 或 `/api/auth/login`；
3. 保存返回的 `token`；
4. 后续调用 `/api/auth/me`、`/api/data/sync` 等受保护接口时，设置 `Authorization: Bearer <token>`；
5. Token 过期后引导重新登录。

### AI 聊天集成

1. 构造 `messages` 数组；
2. 如需流式体验，设置 `stream=true`；
3. 客户端可选择自带 `apiKey`，或使用服务端出厂 Key；
4. 使用 SSE 客户端逐块读取 `text/event-stream`；
5. 遇到 `429` 时做指数退避重试；
6. 遇到 `502` 时可切换 `provider` 重试。

### 语音转写集成

- 上传录音时发送 `multipart/form-data`；
- 使用 B站视频时发送 `application/json`；
- 注意 8 MB 音频大小限制；
- 对于 B站字幕异步生成场景，前端可容忍空字幕并提示稍后再试；
- 若上游返回 `502`，建议降低并发并重试。

### TTS 集成

- 拼接 `text` 与 `lang` 查询参数；
- 将响应作为 `<audio src="/api/tts?...">` 或二进制流播放；
- 长文本需客户端切分为 200 字符以内片段；
- 利用浏览器或 CDN 缓存，避免重复请求相同文本。

### 外部资源代理集成

- B站接口需注意 `bvid` 大小写敏感；
- 维基百科接口使用 `action=search` 或 `action=page`；
- 古腾堡接口只接受数字 ID；
- 单词配图接口返回空数组不代表错误，而是输入不合法或无结果。

### WebSocket 支持

当前 API 没有独立的 WebSocket 端点。AI 聊天使用 SSE 流式传输，不是 WebSocket。客户端应按事件流处理，而不是建立 WebSocket 连接。

**章节来源**  
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/ai/transcribe.js:1-345](file://functions/api/ai/transcribe.js#L1-L345)
- [functions/api/tts.js:1-69](file://functions/api/tts.js#L1-L69)
- [functions/api/bilibili-subtitle.js:1-158](file://functions/api/bilibili-subtitle.js#L1-L158)

## 调试与排错

### 常见问题

| 现象 | 可能原因 | 解决方案 |
|---|---|---|
| 注册后无法登录 | 密码错误或 KV 未绑定 | 检查 `JWT_SECRET` 与 KV 绑定 |
| 所有接口返回跨域错误 | 预检被拦截 | 确认请求携带 `Content-Type` 或 `Authorization`，并由 `OPTIONS` 短路 |
| AI 聊天返回 `Origin not allowed` | 请求来自非白名单域名 | 检查 `Origin`，或在部署环境允许的目标域名下访问 |
| AI 聊天返回 `Too many requests` | 同一 IP 超过每分钟 30 次 | 降低请求频率，增加重试间隔 |
| TTS 返回 400 | 文本超过 200 字符 | 客户端切分文本 |
| B站字幕为空 | B站 AI 字幕尚未生成完成 | 延迟重试或改用 ASR 转写 |
| 单词配图返回空数组 | 单词不符合正则或外部搜索失败 | 检查输入并忽略错误 |
| 数据同步失败 | KV 未配置或权限不足 | 在 Cloudflare Pages 后台绑定 KV 命名空间 |

### 调试建议

- 使用浏览器开发者工具查看网络面板中的请求头、响应头与响应体；
- 对 AI 聊天使用非流式请求先验证 JSON 结构，再开启 `stream`；
- 使用 `wrangler pages dev` 本地调试 Functions；
- 在生产环境通过 Cloudflare Real-time Logs 观察结构化日志；
- 对 `/api/ai/chat` 的 `GET` 请求可观察出厂 Key 用量变化；
- 对 B站接口检查 `bvid` 是否大小写正确；
- 对 KV 相关错误检查 Cloudflare 控制台中的 KV 命名空间配置。

**章节来源**  
- [functions/_lib/guard.js:1-89](file://functions/_lib/guard.js#L1-L89)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/tts.js:1-69](file://functions/api/tts.js#L1-L69)
- [functions/api/bilibili-subtitle.js:1-158](file://functions/api/bilibili-subtitle.js#L1-L158)

## 性能特征与优化建议

### 缓存特性

| 接口 | 缓存策略 |
|---|---|
| `/api/tts` | CDN 层 `public, max-age=31536000, immutable` |
| `/api/ai/chat` | 流式响应，`no-cache` |
| `/api/data/sync` | 无内置缓存，每次同步都会读写 KV |
| `/api/bilibili-*` | 无内置缓存，依赖上游与 CDN |
| `/api/wikipedia` | 无内置缓存 |
| `/api/gutenberg` | 无内置缓存 |
| `/api/word-image` | 无内置缓存 |

### 计算成本

- 注册接口执行 PBKDF2 哈希，迭代 100,000 次，属于 CPU 密集型操作；
- 语音转写涉及音频上传或远程下载；
- AI 聊天可能触发多个上游候选模型重试；
- B站字幕接口可能多次轮询字幕接口。

### 优化建议

- 客户端对相同 TTS 文本复用已有音频；
- 对 AI 聊天使用增量上下文，避免过长 `messages`；
- 对 B站字幕失败场景设计友好重试 UI；
- 对高频读操作考虑在客户端缓存；
- 避免短时间内重复调用 `/api/ai/chat`；
- 对大数据量同步分批上传，减少单次 KV 写入压力。

**章节来源**  
- [functions/api/tts.js:1-69](file://functions/api/tts.js#L1-L69)
- [functions/_lib/crypto.js:1-26](file://functions/_lib/crypto.js#L1-L26)
- [functions/api/ai/chat.js:1-192](file://functions/api/ai/chat.js#L1-L192)
- [functions/api/bilibili-subtitle.js:1-158](file://functions/api/bilibili-subtitle.js#L1-L158)

## 结论

NativeThink 的 Cloudflare Pages Functions API 围绕“认证 + KV 同步 + AI 代理 + 外部资源代理”四个核心能力展开。其设计重点在于：

- 通过 Bearer JWT 管理受保护会话；
- 通过 KV 提供轻量级云同步；
- 通过多厂商 AI 代理隐藏密钥并提供流式响应；
- 通过 B站、Wikipedia、Gutenberg 与图片代理解决跨域与网络可达性问题；
- 通过 Origin 白名单、IP 限流与输入校验降低滥用风险。

客户端集成时应重点关注：

- 正确处理认证与 Token 生命周期；
- 将 AI 聊天视为 SSE 流而非普通 JSON；
- 遵守文本长度、音频大小与频率限制；
- 对外部代理失败保持优雅降级；
- 利用 TTS 与 CDN 缓存提升用户体验。