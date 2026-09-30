# NativeThink Agent Guide

**本文件是索引，不是百科。** 它只放跨模块的约定、命令、路由表和通用坑；模块级的实现细节与注意事项在 [`docs/modules/`](./docs/modules/) 下，按模块一篇。

| 我要… | 去读 |
|-------|------|
| 刚接手这个项目，先建立全局认识 | [docs/PROJECT-HANDOVER.md](./docs/PROJECT-HANDOVER.md)（交接手册） |
| 产品需求 / UI 规范 | [docs/PRODUCT-SPEC.md](./docs/PRODUCT-SPEC.md) |
| 现状与下一步 | [ROADMAP.md](./ROADMAP.md) |
| 面向用户的使用说明 | [使用攻略.md](./使用攻略.md) |
| 开发日志 | [CHANGELOG.md](./CHANGELOG.md) |
| 常见 bug 的完整修复模式 | `.claude/skills/nativethink-fix.md`、架构速查 `.claude/skills/nativethink.md` |

---

## 项目是什么

NativeThink 是面向中文母语者的英语思维训练应用：摆脱中式英语，通过思维训练、语块、句子精讲、跟读、对话等方式建立母语者表达路径。

**形态**：Web SPA + Electron 桌面 + Capacitor Android，三个形态共用一份 `dist/client` 与一套 `functions/` 云函数。
**部署**：Cloudflare Pages（`nativethink.pages.dev`），由 **Pages 自己的 Git 集成**从 `main` 构建 —— 仓库内**没有部署 workflow**（2026-09-28 删掉两条长期失败的冗余 Actions；`.github` 目录不存在）。**push 即改线上，先跑验证。**
**界面语言**：中文（学习内容为英文）。

---

## 模块索引

**改任何模块前先读对应那篇** —— 里面的坑都是逐条读代码核实过的，包含本文件已经写错或被模块文档推翻的地方。

| 模块 / 路由 | 文档 | 一句话 |
|-----------|------|--------|
| 背单词 `/vocabulary` | [modules/vocabulary.md](./docs/modules/vocabulary.md) | 6 种模式、三个正交开关（`setupDone`/`showWizard`/`immersed`）、SM-2、三套并行重排实现 |
| 词库数据 | [modules/wordbank-data.md](./docs/modules/wordbank-data.md) | 两层去重、核心/detail 拆分、IDB 主 + localStorage 兜底、改完必跑的两个脚本 |
| 阅读 `/articles` | [modules/reading.md](./docs/modules/reading.md) | 五种来源一套阅读器、运行时全文升级、**两套切章必须对齐**、复习词文章词表是派生的（删文章即回词表） |
| 朗读 TTS | [modules/tts.md](./docs/modules/tts.md) | 引擎降级链、切片 180 由上游 200 硬上限钉死、闪退自愈、音色四处同步 |
| AI 服务与端侧模型 | [modules/ai-services.md](./docs/modules/ai-services.md) | Key 优先级、服务端免费档回退、端侧回落条件、`extractJson` 规定由 `verify:ai-parse` 全仓扫 |
| 母语思维 `/think` | [modules/think-in-english.md](./docs/modules/think-in-english.md) | 4 tab；换题不 abort 导致流式内容串题 |
| 语块 `/chunks` | [modules/chunks.md](./docs/modules/chunks.md) | 2713 行最大单文件；练习池走 `useStableShuffle`、短语库按字母段折叠（4,805→1,148 元素） |
| 对话 `/conversation` | [modules/conversation.md](./docs/modules/conversation.md) | 场景选择↔聊天；`mountedRef` 每轮挂载需复位（dev 下曾恒 false 让对话永远空白） |
| 影子跟读 `/shadowing` | [modules/shadowing.md](./docs/modules/shadowing.md) | 连播/循环/录音评分；完成标记按**合并索引**存，索引换算单点在 `shadowing-progress.ts` |
| 写作 `/writing` | [modules/writing.md](./docs/modules/writing.md) | 100 题 + AI 批改（Markdown 不是 JSON）；默认折叠 12 张 |
| 句子学习 `/sentences` | [modules/sentence-lab.md](./docs/modules/sentence-lab.md) | 158 句语料、意群运行时定位；主干候选与评分**同一来源**（`verify:sentence-lab` 守） |
| 句子拼写 `/spelling` | [modules/spelling.md](./docs/modules/spelling.md) | 2×2 玩法、四条题目来源、断点按 level 分键（`spelling-resume.ts`） |
| 首页 / 记录 / 收藏 / 备份 | [modules/dashboard-progress-favorites.md](./docs/modules/dashboard-progress-favorites.md) | 每日一句、分项重置、收藏判重口径；整书译文随备份导出由 `verify:backup-idb` 守 |
| 外壳与导航 | [modules/shell-and-navigation.md](./docs/modules/shell-and-navigation.md) | 启动顺序、双层 ErrorBoundary、预取时机、**新增页面实际是六处** |
| 存储与学习统计 | [modules/storage-and-stats.md](./docs/modules/storage-and-stats.md) | 四套存储、safeStorage 前缀自愈、`addStudyMinutes` 真实语义、同步边界 |
| 云同步与账号 | [modules/cloud-sync.md](./docs/modules/cloud-sync.md) | 两条上行口径不同；回声抑制/失败提示/按需补推由 `verify:cloud-sync` 守；仍只有 3 个 hook 订阅下行 |
| 反馈链路 | [modules/feedback.md](./docs/modules/feedback.md) | 本机优先 + 三档诚实结果 + KV/飞书双出路；限流记账时机 |
| 构建与发布 | [modules/build-release.md](./docs/modules/build-release.md) | 脚本地图与重复 bump、**缺资产静默出残包**、APK 版本线与产物命名 |
| 验证体系 | [modules/verification.md](./docs/modules/verification.md) | 19 个契约守卫 + 无头 Chrome/CDP + 真机通道 + 写守卫四条硬规矩 |

---

## 技术栈

| 层 | 选型 |
|---|---|
| UI | React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| 构建 | Vite 8（`scripts/dev.mjs` / `scripts/build.sh`） |
| 路由 | react-router-dom v7，页面 `React.lazy` 懒加载 |
| 状态/数据 | localStorage（`safeStorage`）+ IndexedDB；无后端业务库 |
| AI | `src/hooks/use-ai.ts` + `src/services/ai-service.ts`（用户自配 Key，内置出厂 Key） |
| TTS | 多引擎降级：sherpa-onnx 离线（默认 piper lessac，可选 Kokoro int8）→ 系统 SpeechSynthesis → 云端 |
| 桌面 | Electron（`electron/main.mjs` + `server/local-server.mjs` 复刻 `/api/*`） |
| 移动 | Capacitor Android |

**typecheck 是弱守卫**：`tsconfig.app.json` 从 `@lark-apaas/coding-presets-react` 继承了 `strict: false` / `noImplicitAny: false` / `noUnusedLocals: false`。"过了类型"不等于"检查过了"。

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

# ESLint / 生产构建
npm run lint:eslint
npm run build:web          # 产纯 web 包用这个；不要用 package:web（见 build-release.md §5.1）

# 桌面 / APK 打包
npm run package:web
npm run package:apk
npm run package:desktop
npm run package:all

# TTS 音色与模型资产校验（改音色后必跑；已嵌进 package:apk 前置，失败阻断打包）
npm run check:tts-voices
```

**回归守卫**（本项目没有测试框架，这些就是防线；当前实测全绿，断言数见 [verification.md](./docs/modules/verification.md)）：

```powershell
node scripts/verify-wordbank-loading.mjs          # 45  加载层集成（无需浏览器）
node scripts/verify-wordbank-split.mjs --check <baseline.json>   # 数据层拆分（基线任意时刻可重采）
node scripts/verify-tts-progress.mjs              # 6175 朗读切片与进度反查表
node scripts/verify-tts-hardening.mjs             # 15   TTS 降级/在途去重/桌面限定（注意：没有 npm script）
node scripts/verify-books-meta.mjs                # 222  书目元数据 + 复习词高亮
node scripts/verify-vocab-cards.mjs               # 284  背单词卡片契约 + 手势决策表 + 换卡节奏 + 答错重排延后
node scripts/verify-vocab-caches.mjs              # 67   缓存封顶 + 存储写失败可见（替身真跑）
node scripts/verify-overlay-fit.mjs               # 16   窄视口浮层契约
node scripts/verify-bundle-budget.mjs             # 10   首屏下载预算（先 build:web）
node scripts/verify-list-scaling.mjs              # 18   长列表必须折叠/分页（写作题库 + 词库浏览 + 短语库字母段）
node scripts/verify-shadowing-completion.mjs      # 23   跟读完成标记的索引契约（纯函数真跑 + 接线）
node scripts/verify-backup-idb.mjs                # 16   导出学习数据真的含整书译文
node scripts/verify-cloud-sync-hygiene.mjs        # 18   云同步：下行回声/失败可见/按需补推（真跑真实模块）
node scripts/verify-sentence-lab.mjs              # 16   拆句训练主干判定索引同源（真转译跑出分歧）
node scripts/verify-spelling-resume.mjs           # 24   拼写断点按词书分键 + 迁移 + 重置枚举
node scripts/verify-ai-parse.mjs                  # 10   AI 解析约定：24 个解析点判空 + 无贪婪正则（元判据固件自证）
npm run verify:feedback-loop                      # 58   反馈链路（后端 handler 用忠实替身真实执行）
npm run verify:rv-articles                        # 55   复习词汇文章：选词/分篇/用词出队/可重开（含旧 slice(0,10) 正对照）
npm run verify:study-credit                       # 74   学习时长记账：闸门真跑 + 七个提交点接线 + 口径双向锁（本地动作不许套闸门）
```

**数据生成 / 资产**：

```powershell
npm run wordbank:split        # 改词库后必跑（见工作约定第 6 条）
npm run books:gen-meta        # 改书目后重生成 books-meta.ts
node scripts/fetch-scp.cjs    # 重新抓取 SCP（约 1 req/s，产物 src/data/scp.ts 勿手改）
node scripts/clean-wordbank-mojibake.mjs   # 清词库 U+FFFD 乱码（幂等）
node scripts/fetch-android-tts.cjs         # 拉 TTS 资产（幂等，--force 重取）

# 品牌视觉资产（APK 图标/启动图/favicon），改字标或配色后重跑
pwsh -File scripts/gen-app-brand.ps1 -Preview docs/brand-assets-preview.png

# 真机 WebView 调试（无线 adb 无 INJECT_EVENTS 时的标准通道）
# 先建转发：adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
# （socket 名：adb shell cat /proc/net/unix | grep webview_devtools_remote）
node scripts/device-eval.mjs eval "document.title"
node scripts/device-eval.mjs tap 400 1630    # 物理像素，自动折算 CSS
node scripts/device-eval.mjs shot .screen.png
```

**提交约定**：`npm run typecheck` 通过后再提交。有 pre-commit hook（`npm run lint` = typecheck + eslint 并行），**hook 失败就修根因，不要 `--no-verify`**。手机端数据只进 localStorage / IndexedDB，不写系统目录。

---

## 路由地图（当前真实页面）

| 路由 | 页面文件 | 模块 key | 模块文档 |
|------|---------|----------|---------|
| `/` | `DashboardPage` | — | dashboard-progress-favorites |
| `/think` | `ThinkInEnglishPage` | `think` | think-in-english |
| `/chunks` | `ChunkTrainingPage` | `chunks` | chunks |
| `/conversation` | `ConversationPage` | `conversation` | conversation |
| `/shadowing` | `ShadowingPage` | `shadowing` | shadowing |
| `/articles` | `ArticlePage` | `articles` | reading |
| `/vocabulary` | `DeepVocabularyPage` | `vocabulary` | vocabulary |
| `/favorites` | `FavoritesPage` | — | dashboard-progress-favorites |
| `/writing` | `WritingPage` | `writing` | writing |
| `/sentences` | `SentenceLabPage` | `sentences` | sentence-lab |
| `/spelling` | `SpellingPage` | `spelling` | spelling |
| `/cet` | `CetExamPage`（外链 CetThink，不在包内） | — | — |
| `/progress` | `ProgressPage` | — | dashboard-progress-favorites |

**新增页面必须同步六处**（前两处漏了会坏，后四处漏了**静默不显示**，详见 [shell-and-navigation.md](./docs/modules/shell-and-navigation.md) §4）：

1. `src/app.tsx` 路由 + lazy
2. `src/components/AppSidebar.tsx` `NAV_ITEMS` + `ROUTE_PREFETCH`（**注意 `MobileBottomNav.tsx:14-22` 还有一份复制的 7 条预取表**）
3. `src/pages/DashboardPage/constants.ts` 的 `MODULES`（进度环）
4. `src/lib/use-learning-stats.ts` 的 `ILearningStats.moduleProgress` 类型 + 默认值
5. 同文件 `:70-80` 的 **`MODULE_PROGRESS_KEYS` 白名单** —— 漏了会被 `mergeStats` 丢弃
6. `ProgressPage/components/ProgressCharts.tsx` 的 `MODULE_COLORS` + `MODULE_NAMES`

---

## 目录速查

```
src/
├── app.tsx                 # 路由（13 页全 lazy，每条一个 ErrorBoundary）
├── index.tsx               # 启动顺序、唯一的 <Toaster />、SafeShell
├── components/
│   ├── AppSidebar.tsx      # 侧边栏 + 路由预取
│   ├── Layout.tsx          # Suspense /  safe-area / focus 模式
│   ├── Header.tsx          # 反馈入口挂载点
│   └── ui/                 # shadcn 组件（dialog 基座含窄视口兜底）
├── lib/
│   ├── use-learning-stats.ts   # 学习统计（storage 权威 + 跨实例广播）
│   ├── use-word-learning.ts    # SM-2 复习算法 + 词汇进度权威源
│   ├── use-tts.ts              # TTS 多引擎（切片上限 180）
│   ├── sherpa-tts.ts           # 离线 sherpa 封装（合成/缓存/在途去重/闪退自愈）
│   ├── tts-voice-catalog.ts    # 音色 speakerId 表（在前端，不在原生）
│   ├── use-favorites.ts        # 收藏（type=word 与背单词共用）
│   ├── quickcard-history.ts    # 快速闪卡：留档 / 当前累积 / 断点续学
│   ├── vocab-session.ts        # 复习顺序 + 答错重排（隔 4 张，最多 2 次）
│   ├── vocab-swipe.ts          # 滑动手势决策表
│   ├── custom-words.ts         # 生词本（level='custom'）
│   ├── word-notes.ts           # 每词助记
│   ├── reader-highlight.ts     # 阅读器复习词高亮
│   ├── use-stable-shuffle.ts   # 稳定洗牌（洗牌列表 + 下标定位当前题必须用它）
│   ├── capped-cache.ts         # localStorage JSON 缓存统一读写 + FIFO 封顶 + 键迁移
│   ├── colloc-ai-cache.ts      # 搭配 AI 翻译缓存单点归属
│   ├── app-env.ts              # 版本与运行平台单一来源
│   ├── safe-storage.ts         # 带用户前缀的 localStorage 封装（云同步双写挂在这）
│   ├── use-cloud-sync.ts       # 上行/下行/防抖双写
│   └── idb.ts                  # IndexedDB KV（无枚举键的 API）
├── pages/                  # 一页一目录
├── data/                   # 语料、词库、语块等数据
└── hooks/use-ai.ts
functions/                  # Cloudflare Pages Functions（APK/桌面也用它）
scripts/                    # 打包、TTS、语料、verify-* 守卫
electron/ + server/         # 桌面主进程 + 本地 API 服务
android/                    # Capacitor 工程（SherpaTtsPlugin.java 是原生 TTS）
docs/                       # PRODUCT-SPEC / PROJECT-HANDOVER / modules/
```

---

## 学习统计（关键约定）

细节见 [storage-and-stats.md](./docs/modules/storage-and-stats.md)。

- Hook：`src/lib/use-learning-stats.ts`；键 `__nativethink_learning_stats` / `__nativethink_calendar`。
- **以 localStorage 为权威源**，多实例通过 `STATS_CHANGED_EVENT` / `CALENDAR_CHANGED_EVENT` 广播后重读。
- 日期一律 `formatDate()`（本地日期），**禁止 `toISOString().slice(0,10)`**（东八区凌晨会错天）。
- `moduleProgress` 键必须与 `MODULES[].key` 一一对应；写不存在的键**静默无效**（`if (modKey in …)`）。
- `addStudyMinutes(minutes, key)` 实际是 `moduleProgress[key] += minutes * 0.5`，**上限 100**。
- 各实例须订阅 `STATE_EVENT` 重读（hook 内已接，带防回环），否则模式首页角标学完一轮不刷新。
- 断点续学按（模式, level）分键：`__nativethink_vocab_session_<level>` / `_daily_session_` / `_quickcard_session_` / `__nativethink_chunk_review_session` / `__nativethink_spelling_resume_<level>`（拼写那份可注入替身真跑，见 `verify:spelling-resume`）。

---

## 设计系统（不可漂移）

- 主色青蓝/青绿：主按钮、激活导航、进度环；品牌锚点 `#00B894`
- 圆角：卡片 `rounded-xl` ~ `rounded-[32px]`/`rounded-[48px]`，按钮 `rounded-2xl`
- 阴影：默认 `shadow-sm`，hover `shadow-md`；卡片以边框为主
- 反馈色（柔和，勿用考试红）：成功/地道 `hsl(150 55% 42%)`，警告/中式 `hsl(35 85% 55%)`，错误用低饱和红、克制使用
- 深浅主题：`src/tailwind-theme.css` CSS 变量；UI 语言中文
- 完整视觉 token 与反模式见 `docs/PRODUCT-SPEC.md`「UI 设计指南」

---

## 通用坑（跨模块）

只留"在任何文件都可能撞上"的；模块专属坑已搬进 `docs/modules/`。

| 现象 | 原因 | 修法 |
|------|------|------|
| 刷新后"记忆丢失" | `safeStorage` 前缀随登录状态变化（`getUserId()` 在平台 user 出现后会变），且 `_prefix` 缓存整会话不变 | 迁移只覆盖旧格式 `__miaoda_<appId>__:`，anonId 自愈只匹配 `__global__` —— **平台登录态的前缀不在恢复范围**。新键先决定走 `safeStorage` 还是裸 `localStorage`（后者不随前缀变，但完全不同步），见 [storage-and-stats.md](./docs/modules/storage-and-stats.md) §3.2 |
| 进度环 NaN / 0% | `moduleProgress` 缺 key，或写进了不存在的 key（`if (modKey in …)` 静默无效） | 键对齐六处清单；`RingProgress` 对非法值回退 0 |
| 白屏 `Cannot access X before initialization` | TDZ：hook/const 声明顺序 | `useState`/`useRef`/`useMemo` 放到使用之前 |
| 页面永远 loading | `setLoaded(true)` 在 try 内，出错不执行 | `finally { setLoaded(true) }` |
| ref 记录"第一次对、之后静默失效" | **ref 不随组件重挂载归零** | 每轮开始显式清空。真实案例：`ConversationPage.tsx:151-152` 的 `mountedRef` 在 StrictMode 双挂载后恒 false → dev 下对话永远空白 |
| 切 tab/退出/杀 App 后状态丢 | 切 Tab 卸载组件，state 随之消失 | 显式持久化 + 挂载后恢复（`Layout.tsx:122` 的 `key={location.pathname}` 会让每次导航都重挂载） |
| 洗牌列表 + 下标定位当前题悄悄漂移 | `useMemo(() => shuffle(items), [items])` 依赖数组身份 | 用 `use-stable-shuffle.ts`；接入点索引加守卫 |
| StrictMode 双调用使副作用翻倍 | setState updater 里再调 setState / 写 storage | 副作用提到事件层，updater 保持纯（`capped-cache.ts:32-35`） |
| 首屏白背一坨永不执行的代码 | 给只用懒加载页面的库写强制 `manualChunks`，或壳里同步 `require` SDK —— 都会变成**入口 chunk 的静态依赖** | 删掉强制分块规则 / 改 `import()`；用 `npm run verify:bundle-budget` 从**产物**反查 |
| 窄视口浮层点不到底部控件 | Popover 是 portal，页面滚动救不了；Dialog 基座 `translate-y-[-50%]` 超高时**上下两头一起溢出** | 外层 `max-h-[calc(var(--radix-popover-content-available-height)-1.5rem)] flex flex-col`，标题 `shrink-0`，正文 `flex-1 min-h-0 overflow-y-auto overscroll-contain`；正文里的嵌套小滚动在移动端去掉 `max-h + overflow-y-auto` |
| 一屏渲染不完的列表拖垮首屏 | 一次性铺全部条目 | 默认折叠/分页 + 展开入口（**不许削弱用户入口**）；补 `verify-list-scaling` 式断言 |
| 弹窗打开时按 Esc 连带退出当前流程 | Radix 在 document 冒泡阶段**同步 flush** 关弹窗 | 键盘监听用捕获阶段 `addEventListener('keydown', fn, true)` |
| 按词累积的缓存撑爆 localStorage | 只增不减，写失败后整份静默丢失（症状是"刷新后数据没了"） | **分两类**：AI 派生可重算 → `cappedPut` FIFO 封顶；用户创作不可重算 → `appendCapped` **只拒绝新增、绝不裁剪** |
| 落盘失败完全无声 | `safeStorage.setItem` 过去 `catch {}` 吞掉配额错误 | 现在返回布尔（`safe-storage.ts:175`）；写用户清单的 effect 一律 `if (!persistJson(k, x)) warnStorageFull()`（全站 60s 去抖一条 toast，`capped-cache.ts:48`） |
| AI 生成内容"格式异常"误报 | `use-ai` 失败返回 `''`，页面把空串当解析失败 | **先判 `result.trim()` 为空 → 服务不可用**；解析一律 `extractJson`，勿用贪婪正则。全仓 24 个解析点由 `npm run verify:ai-parse` 扫 |
| 功能"两端都写了却点不到" | 组件与云函数都存在，但没有页面挂载；静态检查看不出断线 | 挂载点写进回归断言（`verify:feedback-loop` 检查 Header 是否渲染 `<FeedbackDialog />`）；新功能入口必须真机/真页面验证可达 |
| 提交类操作谎报成功 | 后端只有一个 boolean，503（通道未配）与网络失败都归成"没成功"，UI 一律 toast 成功 | 结果分档返回（`delivered`/`stored`/`failed`），UI 按档给不同提示；失败保留条目并提供重试入口 |
| 全站 toast 提示不出现 | `ui/sonner.tsx` 有 `Toaster` 但没人挂载 | 唯一出口在 `src/index.tsx`；新页面不要再挂第二个，`verify:feedback-loop` 会断言 |
| 顶部内容被一条空条遮住 | 无内容但带 `bg-*` 的 sticky 元素仍占位 | 只在有内容时渲染 |
| 图表数值压住标题 | 容器高度装不下「值+柱+轴」三层 | 容器高度 ≥ 三层实测高度 |
| 装 APK 后部分本地数据"消失" | 某些 ROM 上 WebView localStorage 随更新被清 | 重装前用「学习记录 → 导出」备份；重要数据登录走云同步 |

---

## 工作约定

1. **先读再改**：动任何模块前先读 `docs/modules/<模块>.md`；动进度/存储前先读 `use-learning-stats.ts`、`safe-storage.ts` 与目标页现有 hook 用法。
2. **新增页面六件套**：见上面路由地图那节。
3. **typecheck 必过**：`npm run typecheck`；pre-commit 会跑 `lint`（typecheck + eslint），不要绕过 hook。
4. **不引入考试焦虑视觉**；不改主色/圆角/阴影语言。
5. **打包体积敏感**：不要往 `public/` 塞大文件 —— 但 `public/books/`（23MB 随包全文）**是例外且有原因的**，删之前先读 [reading.md](./docs/modules/reading.md) §3.1。大模型走 `models-bundled/` 硬链接与 `scripts/` 流程。
6. **改词库后必须重跑 `npm run wordbank:split`**：`src/data/wordbank/data/<level>.ts` 只保留核心字段，detail 在 `<level>.detail.ts`。任何词库生成器都会重新写出全字段主文件，重跑拆分脚本即可恢复；脚本幂等。`preloadLevels` 默认仍加载 detail，只有 `preloadCoreOnly` 跳过。
7. **产品需求勿覆盖**：`docs/PRODUCT-SPEC.md` 是需求规格；本文件是 agent 工作指南。
8. **Git**：未明确要求不要 commit/push；仓库已用 worktree 时避免在主工作树做跨分支 git 操作。
9. **APK 版本号与产物命名**：`android/version.properties` 的 `versionCode` **每次打包必须递增**（Android 拒绝非递增升级 → 要求卸载 → 丢数据）；`versionName` 走 `major.minor.patch`，`npm run version:apk-bump` 只递增 patch。产物命名规则与"缺资产会静默出残包"的完整清单见 [build-release.md](./docs/modules/build-release.md) §2、§5.2。
10. **验证要真**：改完要跑对应守卫；语义变了就**重新推导断言**而不是放宽它，元判据要带正对照。断言"过了"之前先问这条断言在实现被故意改坏时会不会红（见 [verification.md](./docs/modules/verification.md) §4）。
11. **文档也要核实**：本轮模块文档写作中，本文件的三处旧说法被推翻并已修正 —— 云同步前缀过滤的真实作用、学习数据实际走 `safeStorage`、自动朗读键的实际生效范围（快速闪卡**不读**它）。

---

## 提交前清单

- [ ] `npm run typecheck`
- [ ] 跑与改动相关的 `scripts/verify-*.mjs`（当前基线：45 / 222 / 284 / 67 / 6175 / 15 / 16 / 10 / 18 / 23 / 16 / 18 / 10 / 16 / 24 / 55 / 74 + feedback-loop 58）
- [ ] 改过词库 → `npm run wordbank:split` + `node scripts/verify-wordbank-loading.mjs`
- [ ] 改过音色/模型 → `npm run check:tts-voices`；改过切片/进度 → `verify-tts-progress`；改过降级 → `verify-tts-hardening`
- [ ] 改过 `vite.config` 的 chunk 或壳里的静态 import → `npm run build:web` + `npm run verify:bundle-budget`
- [ ] 改过 `ui/dialog` 基座或设置面板 → `verify-overlay-fit`
- [ ] 改过 `functions/` → 想清楚网页/APK/桌面三条路；动过反馈 → `npm run verify:feedback-loop`
- [ ] 新增/修改模块行为 → 同步更新 `docs/modules/` 对应那篇（**带 `文件:行号`**）
