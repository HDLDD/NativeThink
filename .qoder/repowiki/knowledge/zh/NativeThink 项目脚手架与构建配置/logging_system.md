## 概述

本项目没有引入任何第三方日志框架（如 pino、winston、bunyan、log4js、debug）。日志输出全部通过宿主环境原生的 `console.log` / `console.warn` / `console.error` 完成，并按运行时代码分为三类：Web/前端、Cloudflare Functions 服务端脚本、Electron 主进程与各类构建/数据脚本。

## 关键位置

- **Cloudflare Functions（serverless API）**：`functions/_lib/guard.js` 是唯一一处刻意使用结构化日志的位置，将工厂 Key 用量以 JSON 字符串形式输出到 CF Real-time Logs / `wrangler tail`；其余 Functions 入口（`functions/api/auth/login.js`、`me.js`、`api/data/sync.js`）仅用 `console.error('xxx error:', e)` 输出错误堆栈。
- **Electron 主进程**：`electron/main.mjs` 通过带 `[NativeThink]` 前缀的 `console.log` / `console.warn` 输出注入 SESSDATA 等运行时事件。
- **Web 应用（src/）**：散落在各页面与服务逻辑中的 `console.warn` / `console.error`，典型模式是 `[模块名] 中文描述 + err`，例如 `book-translation.ts` 中大量 `[book-translation] ch${chapter.index}#${segIdx} ...` 的结构化前缀；`lazy-framer-motion.tsx` 中 `[framer] ...`；`ConversationPage.tsx` 中直接描述错误的英文消息。
- **构建/数据处理脚本（scripts/）**：纯 `console.log` 报告进度与统计，无级别区分。

## 架构与约定

1. **无集中 logger 实例**：仓库内不存在 `logger.ts`、`logging/`、`src/lib/logger.*` 之类的封装。每个调用方自行 `console.*`。
2. **结构化日志仅存在于 serverless 层**：`functions/_lib/guard.js` 明确注释“`console.log(JSON.stringify({ type: 'ai_factory_usage', day, provider, model, ip }))`”——这是仓库里唯一有意识的结构化字段设计，目的是让 CF 控制台可检索。
3. **错误分级靠方法选择**：正常信息用 `console.log`，警告用 `console.warn`，异常用 `console.error`；没有自定义 level 枚举或开关。
4. **上下文前缀约定**：前端代码普遍以 `[module-name]` 作为 `console.warn` / `console.error` 的第一个参数，便于在浏览器控制台过滤，例如 `[book-translation]`、`[framer]`。
5. **无日志开关/等级配置**：没有在 `app-env.ts`、`package.json`、Vite 配置或 `.env` 中发现日志级别控制；也没有对 `process.env.NODE_ENV` 做不同分支。
6. **无日志转储/文件写入**：`logs/` 目录为空，代码中未见 fs 写入日志的行为。
7. **Android 侧**：Java 端未见 `android/util/Log` 相关封装，仅通过 Capacitor 桥接 TTS 等业务能力。

## 约束与规则（来自实际实现）

- Cloudflare Functions 的工厂 Key 用量监控强制以 JSON 对象字符串输出（见 `functions/_lib/guard.js` 注释），以便被 CF Real-time Logs / `wrangler pages deployment tail` 检索。
- IP 限流与 Origin 白名单的判定结果不记录日志，仅返回布尔值给调用方；只有“出厂 Key 用量”这一指标会落盘到 stdout。
- 前端错误处理统一采用 `catch (e) { console.error('... failed:', e); toast.error(...) }` 双轨：控制台记录 + UI 提示，但两者之间没有共享的日志管道。

## 评估

这是一个极轻量的日志系统：依赖宿主环境的 `console` API，按运行时代码分段，仅有 serverless 层存在少量结构化字段。它适合当前规模，但不提供跨平台统一格式、日志级别过滤、采样或持久化能力。