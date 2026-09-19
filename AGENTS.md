# NativeThink Agent Guide

> 产品需求与 UI 规范见 [docs/PRODUCT-SPEC.md](./docs/PRODUCT-SPEC.md)  
> 开发路线与现状见 [ROADMAP.md](./ROADMAP.md)  
> 使用说明见 [使用攻略.md](./使用攻略.md)

---

## 项目是什么

NativeThink 是面向中文母语者的英语思维训练应用：摆脱中式英语，通过思维训练、语块、句子精讲、跟读、对话等方式建立母语者表达路径。

**形态**：Web SPA + Electron 桌面 + Capacitor Android  
**部署**：Cloudflare Pages（`nativethink.pages.dev`）  
**界面语言**：中文（学习内容为英文）

---

## 技术栈

| 层 | 选型 |
|---|---|
| UI | React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| 构建 | Vite 8（`scripts/dev.mjs` / `scripts/build.sh`） |
| 路由 | react-router-dom v7，页面 `React.lazy` 懒加载 |
| 状态/数据 | localStorage（`safeStorage`）+ IndexedDB；无后端业务库 |
| AI | `src/hooks/use-ai.ts` + `src/services/ai-service.ts`（用户自配 Key） |
| TTS | 多引擎降级：内置离线 Kokoro（11 音色）→ 系统 SpeechSynthesis → 云端 |
| 桌面 | Electron（`electron/main.mjs`） |
| 移动 | Capacitor Android |

---

## 常用命令

在 Windows 上优先用项目本地 node / tsc：

```powershell
# 开发
npm run dev

# 类型检查（提交前必跑）
npm run typecheck
# 或
& $env:MIMO_NODE "B:\NativeThink\node_modules\typescript\bin\tsc" -p "B:\NativeThink\tsconfig.app.json"

# ESLint
npm run lint:eslint

# 生产构建（web）
npm run build:web

# 桌面 / APK 打包
npm run package:web
npm run package:apk
npm run package:desktop
npm run package:all

# TTS 音色与模型资产校验（改音色后必跑）
npm run check:tts-voices
```

**提交约定**：`npm run typecheck` 通过后再提交。手机端数据只进 localStorage / IndexedDB，不写系统目录。

---

## 路由地图（当前真实页面）

| 路由 | 页面文件 | 模块 key（学习进度） |
|------|---------|---------------------|
| `/` | `DashboardPage` | — |
| `/think` | `ThinkInEnglishPage` | `think` |
| `/chunks` | `ChunkTrainingPage` | `chunks` |
| `/conversation` | `ConversationPage` | `conversation` |
| `/shadowing` | `ShadowingPage` | `shadowing` |
| `/articles` | `ArticlePage` | `articles` |
| `/vocabulary` | `DeepVocabularyPage` | `vocabulary` |
| `/favorites` | `FavoritesPage` | — |
| `/writing` | `WritingPage` | `writing` |
| `/sentences` | `SentenceLabPage` | `sentences` |
| `/spelling` | `SpellingPage` | `spelling` |
| `/cet` | `CetExamPage`（外链 CetThink，不在包内） | `cet` |
| `/progress` | `ProgressPage` | — |

新增页面时必须同步四处：

1. `src/app.tsx` 路由 + lazy
2. `src/components/AppSidebar.tsx` `NAV_ITEMS` + `ROUTE_PREFETCH`
3. `src/pages/DashboardPage/constants.ts` 的 `MODULES`（进度环）
4. `src/lib/use-learning-stats.ts` 的 `ILearningStats.moduleProgress`（如有学习数据）

---

## 目录速查

```
src/
├── app.tsx                 # 路由
├── components/
│   ├── AppSidebar.tsx      # 侧边栏 + 路由预取
│   ├── Header.tsx
│   └── ui/                 # shadcn 组件
├── lib/
│   ├── use-learning-stats.ts   # 学习统计（权威 storage 读写 + 跨实例广播）
│   ├── use-tts.ts              # TTS 多引擎
│   ├── use-favorites.ts
│   ├── safe-storage.ts
│   ├── sherpa-tts.ts           # 离线 Kokoro 封装
│   └── tts-voice-catalog.ts    # 11 音色 speakerId 表
├── pages/                  # 一页一目录
├── data/                   # 语料、词库、语块等 demo/mock 数据
└── hooks/use-ai.ts
functions/                  # Cloudflare Pages Functions（AI chat 等）
scripts/                    # 打包、TTS、语料脚本
electron/                   # 桌面主进程
android/                    # Capacitor 工程
docs/                       # 设计文档 / PRODUCT-SPEC
```

---

## 学习统计（关键约定）

- Hook：`src/lib/use-learning-stats.ts`
- Storage keys：
  - `__nativethink_learning_stats`
  - `__nativethink_calendar`
- **以 localStorage 为权威源**，多组件实例通过 `STATS_CHANGED_EVENT` / `CALENDAR_CHANGED_EVENT` 广播后重读，避免陈旧闭包覆盖进度。
- 日期一律用 `formatDate()`（本地日期），禁止 `toISOString().slice(0,10)`（东八区凌晨会错天）。
- `moduleProgress` 键必须与 `DashboardPage/constants.ts` 的 `MODULES[].key` 一一对应。
- 练习完成处调用：`addStudyMinutes(minutes, moduleKey)`。

---

## 设计系统（不可漂移）

- 主色青蓝/青绿：主按钮、激活导航、进度环；品牌锚点 `#00B894`
- 圆角：卡片 `rounded-xl` ~ `rounded-[32px]`/`rounded-[48px]`，按钮 `rounded-2xl`
- 阴影：默认 `shadow-sm`，hover `shadow-md`；卡片以边框为主
- 反馈色（柔和，勿用考试红）：
  - 成功/地道：`hsl(150 55% 42%)`
  - 警告/中式：`hsl(35 85% 55%)`
  - 错误：低饱和红，克制使用
- 深浅主题：`tailwind-theme.css` CSS 变量；UI 语言中文
- 完整视觉 token 与反模式见 `docs/PRODUCT-SPEC.md`「UI 设计指南」

---

## AI 与 TTS

### AI

- 配置：设置页写入 Key；`useAI()` → `isConfigured` / `chat()`
- 失败兜底：toast「AI 服务暂不可用，请稍后重试」；不要静默失败
- JSON 响应用 `extractJson()`（`src/lib/utils.ts`），勿用贪婪正则

### TTS

- 统一走 `use-tts.ts`，不要在页面里直接 `speechSynthesis`
- 内置离线引擎：Kokoro int8，24000Hz，11 音色；`speakerId` 表在 `tts-voice-catalog.ts`
- 原生模型注册表（`SherpaTtsPlugin.java` 的 `MODEL_*`）必须与 `scripts/check-tts-voices.cjs` 的 `MODELS` **同步改**
- 长段落朗读：拆句 + 防双重触发（`onEnd` 与 timeout 不可同时推进）
- 改音色后跑 `npm run check:tts-voices`

---

## 已知坑（改代码前先看）

| 现象 | 原因 | 修法 |
|------|------|------|
| 白屏 `Cannot access X before initialization` | TDZ：hook/const 声明顺序 | `useState`/`useRef`/`useMemo` 放到使用之前 |
| 页面永远 loading | `setLoaded(true)` 在 try 内，出错不执行 | `finally { setLoaded(true) }` |
| 进度环 NaN / 0% | `moduleProgress` 缺 key 或 key 与 MODULES 不一致 | 键对齐；`RingProgress` 对非法值回退 0 |
| 刷新后记忆丢失 | `safeStorage` 前缀随登录变化 | 用户学习数据用原生 `localStorage` 或带事件同步的 hook |
| 东八区凌晨日期错一天 | `toISOString().slice(0,10)` | 用 `formatDate()` |
| 父子双 `onClick` 触发两次 | 事件冒泡重复绑定 | 只保留外层 handler |
| button 嵌套 DOM 警告 | `<button>` 内再嵌 button | 内层改 `span role="button"` |
| 维基百科加载失败 | 网络限制 | `origin=*` + `AbortSignal.timeout(10000)` |
| 朗读卡顿/跳句 | onEnd 与超时双触发 | 只超时驱动 + advanced 标志 |

调试入口：`.claude/skills/nativethink-fix.md`（本仓库内完整模式表）。

---

## 工作约定

1. **先读再改**：动进度/存储前先读 `use-learning-stats.ts` 与目标页现有 hook 用法。
2. **新增模块四件套**：路由、侧边栏+预取、MODULES、moduleProgress key。
3. **typecheck 必过**：`npm run typecheck`（或上方 tsc 全路径）。
4. **不引入考试焦虑视觉**；不改主色/圆角/阴影语言。
5. **打包体积敏感**：APK/Electron 不要往 `public/` 塞大文件；大模型走硬链接与 `scripts/` 流程。
6. **改词库后必须重跑 `npm run wordbank:split`**：`src/data/wordbank/data/<level>.ts` 只保留核心字段，detail（搭配/例句/深度解释）在 `<level>.detail.ts`。任何词库生成器都会重新写出全字段主文件，重跑拆分脚本即可恢复。脚本幂等，可安全重复执行；`preloadLevels` 默认仍加载 detail，只有 `preloadCoreOnly` 才跳过。
7. **产品需求勿覆盖**：`docs/PRODUCT-SPEC.md` 是需求规格；本 AGENTS.md 是 agent 工作指南。
8. **Git**：未明确要求不要 commit/push；仓库已用 worktree 时避免在主工作树做跨分支 git 操作。

---

## 相关文档

| 文件 | 用途 |
|------|------|
| [docs/PRODUCT-SPEC.md](./docs/PRODUCT-SPEC.md) | 产品需求 + UI 设计指南（原 AGENTS.md 内容） |
| [ROADMAP.md](./ROADMAP.md) | 现状与下一步 |
| [使用攻略.md](./使用攻略.md) | 用户向使用说明 |
| [CHANGELOG.md](./CHANGELOG.md) | 开发日志 |
| `.claude/skills/nativethink.md` | 架构与开发模式速查 |
| `.claude/skills/nativethink-fix.md` | 常见 bug 修复手册 |
| `docs/superpowers/` | TTS 等专项设计/计划 |
