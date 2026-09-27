# NativeThink Agent Guide

> **接手项目先读 [docs/PROJECT-HANDOVER.md](./docs/PROJECT-HANDOVER.md)** —— 交接手册（现状/命令/验证体系/坑表/检查清单），本文件是日常约定速查  
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
| TTS | 多引擎降级：sherpa-onnx 离线（默认 piper lessac，可选 Kokoro int8 11 音色）→ 系统 SpeechSynthesis → 云端 |
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

# 词库回归验证（本项目无测试框架，这两个脚本就是它的回归防线；改词库或加载层后必跑）
node scripts/verify-wordbank-loading.mjs          # 加载层集成验证（无需浏览器）
node scripts/verify-wordbank-split.mjs --check <baseline.json>   # 数据层拆分校验，须先用 --baseline 采集
```

```powershell
# 朗读进度回归验证（改 TTS 切片上限或阅读器朗读逻辑后必跑）
node scripts/verify-tts-progress.mjs

# TTS 降级/预合成守卫（改降级链路或预合成后必跑）
node scripts/verify-tts-hardening.mjs
```

```powershell
# 书目/SCP 元数据一致性 + 复习词高亮逻辑（改书单、scp.ts、reader-highlight.ts 后必跑）
node scripts/verify-books-meta.mjs

# 背单词卡片交互契约 + 滑动手势决策表（改 FlashcardMode / QuickCardMode / vocab-* 后必跑）
node scripts/verify-vocab-cards.mjs

# 词汇缓存基建契约（capped-cache / colloc-ai-cache 接线改动后必跑）
node scripts/verify-vocab-caches.mjs

# 重新抓取 SCP 文章（约 1 req/s，产物 src/data/scp.ts 勿手改）
node scripts/fetch-scp.cjs

# 清词库 U+FFFD 乱码（幂等）
node scripts/clean-wordbank-mojibake.mjs

# 品牌视觉资产（APK 图标 / 启动图 / favicon / icon.ico）—— 改字标或配色后重跑
pwsh -File scripts/gen-app-brand.ps1 -Preview docs/brand-assets-preview.png

# 真机 WebView 调试（无线 adb 无 INJECT_EVENTS 时的标准通道）
# 先建转发：adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
# （socket 名：adb shell cat /proc/net/unix | grep webview_devtools_remote）
node scripts/device-eval.mjs eval "document.title"   # 求值
node scripts/device-eval.mjs tap 400 1630            # 点击（物理像素，自动折算 CSS）
node scripts/device-eval.mjs shot .screen.png        # 截图
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
| `/cet` | `CetExamPage`（外链 CetThink，不在包内） | — |
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
│   ├── use-word-learning.ts    # SM-2 复习算法 + 词汇进度权威源
│   ├── use-tts.ts              # TTS 多引擎（切片上限 180）
│   ├── sherpa-tts.ts           # 离线 sherpa 封装（合成/缓存/在途去重）
│   ├── tts-voice-catalog.ts    # 音色 speakerId 表
│   ├── use-favorites.ts        # 收藏（type=word 与背单词共用）
│   ├── quickcard-history.ts    # 快速闪卡：留档 / 当前累积 / 断点续学
│   ├── vocab-session.ts        # 复习顺序 + 答错重排（隔 4 张，最多 2 次）
│   ├── vocab-swipe.ts          # 滑动手势决策表
│   ├── custom-words.ts         # 生词本（level='custom'）
│   ├── word-notes.ts           # 每词助记
│   ├── reader-highlight.ts     # 阅读器复习词高亮
│   ├── use-stable-shuffle.ts   # 稳定洗牌 hook（洗牌列表+下标定位当前题必须用它，防漂移）
│   ├── capped-cache.ts         # localStorage JSON 缓存统一读写 + FIFO 封顶 + 键迁移
│   ├── colloc-ai-cache.ts      # 搭配 AI 翻译缓存单点归属（键名/迁移/400 上限）
│   └── safe-storage.ts         # 带用户前缀的 localStorage 封装
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
- 各实例须订阅 `STATE_EVENT` 重读（hook 内已接，带防回环：重读回来的同内容不回写）——否则模式首页角标在学完一轮后不刷新。
- 断点续学键按（模式, level）分：`__nativethink_vocab_session_<level>`（复习检测）、`__nativethink_daily_session_<level>`（每日学习）、`__nativethink_quickcard_session_<level>`（快速闪卡）、`__nativethink_chunk_review_session`（语块复习）。新增续学模式照此模式，勿混用全局键。

---

## 设计系统（不可漂移）

- 主色青蓝/青绿：主按钮、激活导航、进度环；品牌锚点 `#00B894`
- 圆角：卡片 `rounded-xl` ~ `rounded-[32px]`/`rounded-[48px]`，按钮 `rounded-2xl`
- 阴影：默认 `shadow-sm`，hover `shadow-md`；卡片以边框为主
- 反馈色（柔和，勿用考试红）：
  - 成功/地道：`hsl(150 55% 42%)`
  - 警告/中式：`hsl(35 85% 55%)`
  - 错误：低饱和红，克制使用
- 深浅主题：`src/tailwind-theme.css` CSS 变量；UI 语言中文
- 完整视觉 token 与反模式见 `docs/PRODUCT-SPEC.md`「UI 设计指南」

---

## AI 与 TTS

### AI

- 配置：设置页写入 Key；`useAI()` → `isConfigured` / `chat()`
- 失败兜底：toast「AI 服务暂不可用，请稍后重试」；不要静默失败
- JSON 响应用 `extractJson()`（`src/lib/utils.ts`），勿用贪婪正则

### TTS

- 统一走 `use-tts.ts`，不要在页面里直接 `speechSynthesis`
- 离线引擎是 sherpa-onnx：**默认 piper lessac**（真机 RTF 0.076），Kokoro int8（11 音色，24000Hz）为音质选项但 RTF≈1.008，长文会断续；`speakerId` 表在 `tts-voice-catalog.ts`
- **云端上游硬上限恰好 200 字符**（205 → 502）；客户端切片上限 180（`chunkText`），改大整条云端链路失败并静默降级
- 原生模型注册表（`SherpaTtsPlugin.java` 的 `MODEL_*`）必须与 `scripts/check-tts-voices.cjs` 的 `MODELS` **同步改**
- 长段落朗读：拆句 + 防双重触发（`onEnd` 与 timeout 不可同时推进）；"读到哪"只能靠 `onChunk(chunkIndex, wordsBefore)`（原生引擎无词级回调）
- 改音色后跑 `npm run check:tts-voices`；改切片/进度跑 `npm run verify:tts-progress`；改降级链路跑 `verify-tts-hardening.mjs`
- 词汇模块自动发音共用持久化键 `__nativethink_vocab_autospeak`（每日学习/复习检测/快速闪卡/语块复习：一处关闭处处安静）。**配对模式不自动朗读**（视觉任务，真机反馈）；拼写/填空不自动朗读（会念出答案）

---

## 已知坑（改代码前先看）

| 现象 | 原因 | 修法 |
|------|------|------|
| 白屏 `Cannot access X before initialization` | TDZ：hook/const 声明顺序 | `useState`/`useRef`/`useMemo` 放到使用之前 |
| 页面永远 loading | `setLoaded(true)` 在 try 内，出错不执行 | `finally { setLoaded(true) }` |
| 进度环 NaN / 0% | `moduleProgress` 缺 key 或 key 与 MODULES 不一致 | 键对齐；`RingProgress` 对非法值回退 0 |
| 刷新后记忆丢失 | `safeStorage` 前缀随登录变化 | 用户学习数据用原生 `localStorage` 或带事件同步的 hook |
| 退出/切 tab/杀 App 后状态丢 | 切 Tab 会卸载组件，state 随之消失 | 显式持久化 + 挂载后恢复（参考 `quickcard-history.ts` 与 `FlashcardMode` 的 `saveSession`） |
| ref 记录"第一次对、之后静默失效" | **ref 不随组件重挂载归零**（`lastSpokenKey` 一类） | 每轮开始显式清空 |
| 东八区凌晨日期错一天 | `toISOString().slice(0,10)` | 用 `formatDate()` |
| 父子双 `onClick` 触发两次 | 事件冒泡重复绑定 | 只保留外层 handler |
| button 嵌套 DOM 警告 | `<button>` 内再嵌 button | 内层改 `span role="button"` |
| 顶部内容被一条空条遮住 | 无内容但带 `bg-*` 的 sticky 元素仍占位遮挡 | 只在有内容时渲染（`{tab === 'browse' && (...)}`） |
| 图表数值压住标题 | 容器高度装不下「值+柱+轴」三层 | 容器高度 ≥ 三层实测高度 |
| 弹窗打开时按 Esc 连带退出当前流程 | Radix 在 document 冒泡阶段**同步 flush** 关弹窗，window 冒泡监听已看不到 dialog | 键盘监听用**捕获阶段** `addEventListener('keydown', fn, true)` |
| 维基百科加载失败 | 网络限制 | `origin=*` + `AbortSignal.timeout(10000)` |
| 朗读卡顿/跳句 | onEnd 与超时双触发 | 只超时驱动 + advanced 标志 |
| 洗牌列表 + 下标定位当前题，AI 出题/删题后当前题悄悄漂移 | `useMemo(() => shuffle(items), [items])` 依赖数组身份 | 用 `use-stable-shuffle.ts`（首帧同步初始化 + 只增量增删）；接入点索引加守卫 |
| 恢复到某个 tab 时挂载即白屏 | 洗牌 hook 首帧返回空数组，`items[currentIdx].field` 崩 | hook 首帧同步初始化顺序（已修）；接入点保留 `?.` |
| setState updater 里再调 setState / 改 ref | StrictMode 双调用使副作用翻倍（词插两遍、results 错位） | 副作用提到事件层，用 ref 拿最新状态各 set 一次（参考 QuickCardMode `scheduleRelearn`） |
| 最后一卡答错被直接判完成，重排词永不出现 | 完成判定用闭包 `queue.length`，重排插入后是旧值 | 完成判定读 ref 镜像的最新长度（`queueRef.current.length`） |
| 断点续学被另一本书覆盖 | 切词书同帧"新 level + 旧队列"先于重建落盘 | 断点按 level 分键 + 落盘前校验队列归属 |
| 屏蔽（不再出现）的词又回来了 | 只在 dueForReview 里过滤，别的出卡路径漏滤 | 所有出卡路径统一过滤 `suspended`（复习检测 `otherWords` 曾漏） |
| 整页/整章翻译错位一行 | 失败段被 filter 后按"成功顺序"回填 | 翻译缓存 v2 按段索引 byIdx 精确回填；旧顺序缓存段数不吻合宁可不显示 |
| 长任务结束时覆盖运行期间的新数据 | 用点击时的陈旧快照直接 set | 合并用 `setX((prev) => ...)` 函数式；长任务与其它写路径互斥守卫 |
| 按词累积的缓存撑爆 localStorage | 只增不减（AI 例句/搭配翻译/深度解析） | 新缓存一律走 `capped-cache.ts`（FIFO 封顶）；落盘走 persist effect，updater 保持纯 |
| AI 生成内容填充后"格式异常"误报 | use-ai 失败返回 `''`，页面把空串当解析失败 | 先判 `result.trim()` 为空 → 服务不可用（hook 已 toast）；解析一律 `extractJson` |
| 无线 adb 无法注入输入（`input tap` 报 SecurityException） | 该 ROM 不给 TLS shell INJECT_EVENTS | 用 `scripts/device-eval.mjs`（CDP 截图/求值/点击，坐标给物理像素自动折算） |
| 重装 APK 后部分本地数据"消失" | WebView localStorage 在该 ROM 上可能随更新被清 | 重装前用「学习记录 → 导出」备份；重要数据登录走云同步 |
| 词库"详情面板空白" | `loadLevel` 内 `try{loadDetail}catch{}` 静默吞错；模块表还会缓存失败结果 | 用 `isDetailReady()` 判断，失败走 `window.location.reload()`（原地重试无效） |

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
9. **APK 版本号与产物命名**：`android/version.properties` 的 `versionCode` **每次打包必须递增**（Android 拒绝非递增的升级安装，会要求先卸载 → 丢数据）；`versionName` 走 `major.minor.patch`，`npm run version:apk-bump` 每次只递增 **patch**（2.0.0 → 2.0.1）。要切新的 minor/major，手改该文件的 `versionName` 即可，脚本会沿用你写的 `major.minor`。当前线：**2.x**。
   **产物命名**（`release/` 已被 gitignore）：`release/NativeThink-mobile-debug.apk` 是**当前版本线**，`npm run package:apk` 每次覆盖它——这正是期望行为；**已冻结的旧版本线**用 `release/NativeThink-mobile-debug-<major>.x.apk`（如 `-1.x.apk`），**永不覆盖**。切新大版本时：把当时的规范名改名为 `-<旧major>.x.apk` 冻结，新线继续占用规范名。改完文件名务必用 `aapt dump badging` 核验内嵌 `versionCode/versionName`，确认没有改名改混。

---

## 相关文档

| 文件 | 用途 |
|------|------|
| [docs/PROJECT-HANDOVER.md](./docs/PROJECT-HANDOVER.md) | **交接手册**：仓库现状、验证体系、真机通道、坑表、检查清单（接手先读） |
| [docs/PRODUCT-SPEC.md](./docs/PRODUCT-SPEC.md) | 产品需求 + UI 设计指南（原 AGENTS.md 内容） |
| [ROADMAP.md](./ROADMAP.md) | 现状与下一步 |
| [使用攻略.md](./使用攻略.md) | 用户向使用说明 |
| [CHANGELOG.md](./CHANGELOG.md) | 开发日志 |
| `.claude/skills/nativethink.md` | 架构与开发模式速查 |
| `.claude/skills/nativethink-fix.md` | 常见 bug 修复手册 |
| `docs/superpowers/` | TTS 等专项设计/计划 |
