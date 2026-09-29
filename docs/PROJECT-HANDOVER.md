# NativeThink 项目交接手册（Agent Handover）

> 面向**接手的 AI agent / 新同事**：只读这一份就能开工。
> 最后校准：2026-09-29（已装机 APK 2.0.28 / versionCode 73；本轮词汇向导改动**尚未打包**，下一版 74 / 2.0.29）。
> 相关文档：`AGENTS.md`（日常约定速查）、`ROADMAP.md`（路线）、`docs/PRODUCT-SPEC.md`（需求与 UI 规范）、`CHANGELOG.md`（提交级日志）。

---

## 0. 30 秒速览

| 问题 | 答案 |
|---|---|
| 这是什么 | 面向中文母语者的**英语思维训练 App**（摆脱中式英语）：思维训练、语块、句精讲、跟读、对话、文章精读、词汇深度、拼写 |
| 形态 | Web SPA + Electron 桌面 + Capacitor Android（**同一份前端**）；没有独立业务服务，云端只有 Cloudflare Pages Functions + KV |
| 重点在哪 | **APK 与网站是两条重点研发线**，Electron 桌面只是顺带产物。两端共用 `dist/client`，但 APK 的 `/api/*` 打到线上站点 —— 改 functions 会同时影响两端 |
| 技术栈 | React 19 + TS + Vite 8 + Tailwind v4 + shadcn/ui；状态存 localStorage / IndexedDB |
| 现在改哪 | 主要战场是 `src/pages/DeepVocabularyPage/`（背单词）与 `src/pages/ArticlePage/`（阅读器 + 朗读）；2026-09 两轮全站质量优化已把拼写/跟读/写作/对话/语块也扫过一遍 |
| 怎么验 | **没有测试框架**。`npm run typecheck` + `npm run lint:eslint` + `npm run build:web` + 9 个 `scripts/verify-*.mjs` 断言脚本（2026-09-29 全绿：loading 42 · books-meta 202 · vocab-cards 251 · vocab-caches 21 · tts-progress 6175 · tts-hardening 15 · feedback-loop 56 · overlay-fit 16 · bundle-budget 8） |
| 怎么装机 | `npm run version:apk-bump` → `npm run package:apk` → `adb install -r release/NativeThink-mobile-debug.apk`（产物约 804MB，装一次 1~2 分钟；`node scripts/report-apk-size.cjs` 看真实构成） |
| 部署 | Cloudflare Pages 从 GitHub `main` 构建（`nativethink.pages.dev`），`pages_build_output_dir = "dist/client"`。**站点 functions 同时是 APK 的线上后端**（`index.html` 把 APK 内 `/api/*` 重写到 pages.dev） |
| 最容易踩的坑 | ①改动 TTS 切片上限会让云端链路静默失败 ②ref 不随组件重挂载归零 ③`public/` 不能放大文件 ④推送用 SSH over 443 ⑤洗牌列表 + 下标定位当前题必须用 `use-stable-shuffle`（否则当前题悄悄漂移） |

---

## 1. 产品与技术栈

### 1.1 页面与路由（`src/app.tsx`）

| 路由 | 页面 | 学习进度 key |
|---|---|---|
| `/` | DashboardPage | — |
| `/think` | ThinkInEnglishPage | `think` |
| `/chunks` | ChunkTrainingPage | `chunks` |
| `/conversation` | ConversationPage | `conversation` |
| `/shadowing` | ShadowingPage | `shadowing` |
| `/articles` | ArticlePage | `articles` |
| `/vocabulary` | DeepVocabularyPage | `vocabulary` |
| `/favorites` | FavoritesPage | — |
| `/writing` | WritingPage | `writing` |
| `/sentences` | SentenceLabPage | `sentences` |
| `/spelling` | SpellingPage | `spelling` |
| `/cet` | CetExamPage（外链 CetThink，不在包内） | — |
| `/progress` | ProgressPage | — |

**新增页面要同步四处**（否则侧边栏/进度环/统计会缺项）：
1. `src/app.tsx` 路由 + `React.lazy`
2. `src/components/AppSidebar.tsx` 的 `NAV_ITEMS` 与 `ROUTE_PREFETCH`
3. `src/pages/DashboardPage/constants.ts` 的 `MODULES`（进度环）
4. `src/lib/use-learning-stats.ts` 的 `ILearningStats.moduleProgress`

### 1.2 语料规模（改数据前先看这里）

- **词库**：**9 本词书共 75,113 条词条**（同一词会在多本书里各有一条），去重后**跨书 21,736 个不同单词**。
  每本词书「可学去重词数」（= 词书卡显示值 = 各模式池子）：中考 1,987 / 高考 3,743 / 四级 4,542 / 六级 7,404 / 雅思 6,609 / 托福 10,367 / 考研 5,047 / 专业 4,464 / 高阶 18,470。
  原始词条数（只用于说明规模，**不许当分母**）见 `meta.ts` 的 `WORD_ENTRIES`；两份表都由 `verify-wordbank-loading.mjs` 从数据实测复核。
  数据在 `src/data/wordbank/data/<level>.ts`（仅核心字段）+ `<level>.detail.ts`（搭配/例句/深度解释，按需加载）。
- **书库**：22 本公版书（`src/data/books.ts`，635KB，含中文对照），中文对照离线随包。
- **SCP 文章**：20 篇 / 约 27.9k 词（`src/data/scp.ts`，由 `scripts/fetch-scp.cjs` 抓取，CC BY-SA 3.0，**勿手改**）。
- **句库/语块/跟读**：`sentence-lab*.ts` / `chunks.ts` / `shadowing.ts`。

---

## 2. 仓库现状（接手前必须知道）

| 项 | 现状 |
|---|---|
| 分支 | `main`，HEAD = `3dcee7e`。**与 `origin/main` 完全同步**（`git rev-list --count origin/main..HEAD` = 0） |
| 未提交改动 | 稳态两条：`M CHANGELOG.md` + `M public/CHANGELOG.md`（上一条提交的日志落入这一条，**是预期**）。反馈链路一轮（未提交）：`M src/index.tsx`（挂 Toaster）`M src/components/{Header,FeedbackDialog}.tsx` `M src/lib/use-feedback.ts` `?? src/lib/app-env.ts` `M functions/api/feedback/submit.js` `M functions/_lib/kv.js` `M vite.config.ts` `M package.json` `?? scripts/verify-feedback-loop.mjs` + 本轮文档（AGENTS/ROADMAP/交接手册/使用攻略）。另有 2 个真机截图残留未跟踪：`.screen1.png`、`.screen2.png`（别 commit） |
| 远端 | `ssh://git@ssh.github.com:443/HDLDD/NativeThink.git`（**HTTPS 通道在本机不可用**：SSL unable to get local issuer certificate）。`core.sshCommand` 已指向系统 ssh，普通 `git push` 可用 |
| 部署 | **Cloudflare Pages 的 Git 集成**从 `main` 构建并直接上 production（`nativethink.pages.dev`）—— 证据：Pages 部署记录里 production 那条的 Source 就是刚推的 commit sha，而 2026-09-28 那次 push 的两条 GitHub Actions 全是红的，线上照样更新。**仓库内不再有部署 workflow**（`deploy-cf.yml` 与 `deploy.yml` 已于 2026-09-28 删除：前者缺 `CLOUDFLARE_API_TOKEN` 长期失败、且与 Git 集成重复；后者指向从来没启用的 GitHub Pages，`hdlld.github.io/NativeThink` 实测 404）。**push 即上线**，所以 push 前必须跑过 typecheck + guards + 相关 verify 脚本 |
| Git 钩子 | `core.hooksPath=.githooks`。`pre-commit` 跑 `npm run precommit`（typecheck + eslint，失败即阻断，**不要 `--no-verify`**）；`post-commit` 把提交标题追加进 `CHANGELOG.md` + `public/CHANGELOG.md` 并 `git add` |
| 已知钩子缺陷 | 日期标题 `###`/`##` 不一致的那条**已修**（现在写与查都是 `## $COMMIT_DATE`）。仍存：插入日期标题时带固定空行 → `CHANGELOG.md` 文件头累积了 4 行空行（无害，看着难受） |
| 稳态现象 | 工作树长期保留 **1 条已暂存的 CHANGELOG 行**（提交 N 的日志落入提交 N+1），这是预期，不要"清理干净" |
| 版本线 | APK **2.x**（已装 2.0.28 / versionCode 73）。`android/version.properties` 的 `versionCode` 每次打包必须递增 |

### 2.1 APK / 桌面产物约定

- `release/NativeThink-mobile-debug.apk` = **当前版本线**，`npm run package:apk` 每次覆盖（期望行为，别手动备份）。
- `release/NativeThink-mobile-debug-1.x.apk` = 冻结的旧线（v43/1.43.0），**永不覆盖**。切大版本时把当时的规范名改名为 `-<旧major>.x.apk`。
- 核验内嵌身份**不能看文件名**，用 aapt：
  `"$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt.exe" dump badging <apk> | Select-String "^package:"`
- `release/CetThink-mobile.apk`（227.8MB）是**正式发布产物**（另仓 CetThink 的安装包，含离线朗读模型），合法，别删；但它**绝不能进 `public/`**。
- **禁止往 `public/` 放 APK 或大二进制**：Vite 会把 `public/` 原样拷进 `dist/client`，导致 web / 主 APK / 桌面三份产物各白背体积（历史事故：227.5MB 的 CetThink apk 回流进 public，主 APK 里又套一个 APK）。
- **当前 APK 体积构成**（2.0.25 实测，`node scripts/report-apk-size.cjs`，包内占用 = 压缩后）：离线小模型 541.3MB（未压 877.9MB）+ Kokoro 113.0MB + Piper 音色 65.1MB + web 产物 40.3MB + 原生库 29.3MB + dex/res 14.7MB = **803.7MB**。要减体积先动 `models-bundled`（离线 LLM/翻译模型），别去动 TTS 栈。
- **首屏下载口径**（2026-09-29 起）：`npm run verify:bundle-budget` 守的是"入口 chunk 沿**静态** import 递归出来的集合"，实测 12 个 chunk / **237.7KB gzip**。APK 里 WebView 不压缩本地资源，所以这个数直接就是手机首次进 App 的下载 + 解析量。

---

## 3. 目录地图与关键文件

```
src/
├── app.tsx                 路由（懒加载）
├── index.tsx               入口：模块初始化时同步跑 checkBundledEngineHealth()（原生引擎闪退护栏，勿动）
├── components/
│   ├── AppSidebar.tsx      侧边栏 + 路由预取 + 待复习角标
│   ├── Header.tsx / Layout.tsx / MobileBottomNav.tsx
│   ├── FitWord.tsx         长词自适应字号
│   └── ui/                 shadcn 组件（勿改）
├── lib/                    ★ 业务逻辑主战场（见下表）
├── pages/<Page>/<Page>.tsx + components/
├── data/                   语料（勿手改生成物）
└── hooks/use-ai.ts         AI 调用（用户自配 Key）
functions/                  Cloudflare Pages Functions（如 api/tts.js 云端 TTS 代理）
electron/                   桌面主进程
android/                    Capacitor 工程（SherpaTtsPlugin.java = 原生离线 TTS）
scripts/                    打包 / TTS / 语料 / **验证脚本**
docs/                       设计与交接文档
```

### 3.1 `src/lib/` 关键模块（按重要性）

| 文件 | 职责 / 注意点 |
|---|---|
| `use-tts.ts` | **TTS 总入口**（所有页面都必须走它，别直接用 `speechSynthesis`）。多引擎降级：sherpa 离线 → 系统 → 云端。`chunkText(text, maxLen = 180)` 是硬约束（云端上游上限恰好 200 字符）。`onChunk(chunkIndex, wordsBefore)` 是"读到哪"的唯一来源（原生引擎没有词级回调） |
| `sherpa-tts.ts` | 离线引擎封装（合成到文件 URL + 缓存 + 在途去重）。原生合成**串行**，重复提交同样文本曾把线程数耗尽导致闪退，故有 `inflight` 去重 |
| `tts-settings.ts` / `tts-voice-catalog.ts` | 音色设置与 speakerId 表（改音色必跑 `npm run check:tts-voices`） |
| `use-word-learning.ts` | **SM-2 复习算法 + 词汇进度权威源**。含 `suspended`（屏蔽）、`history`（跨天聚合）、`getGlobalDueCount` 缓存、`saveSession/loadSession`（复习断点） |
| `use-learning-stats.ts` | 学习统计/日历（`__nativethink_learning_stats`、`__nativethink_calendar`）。**以 localStorage 为权威**，跨实例靠 `STATS_CHANGED_EVENT` 广播 |
| `vocab-session.ts` | 复习会话顺序：`createSessionOrder` / `scheduleRelearn`（答错隔 4 张重排，最多 2 次）/ `forecastByDay` |
| `vocab-swipe.ts` | 滑动手势决策表（阈值 80，左滑=不认识，右滑=认识） |
| `quickcard-history.ts` | **快速闪卡持久化**：每轮留档（`_runs`）、当前累积桶（`_pending`）、断点续学（`_session`）。切分与去重规则见文件头注释 |
| `use-stable-shuffle.ts` | 稳定洗牌 hook。**凡是「洗牌列表 + 下标定位当前题」的地方都必须用它**（首帧同步初始化 + 只增量增删），否则 AI 出题/删题后当前题悄悄漂移；首帧返空数组还会让恢复挂载直接白屏 |
| `capped-cache.ts` | localStorage JSON 缓存的统一读写 + FIFO 封顶 + 键迁移。**按词累积的新缓存一律走它**（曾有四个只增不减的库把配额撑爆） |
| `colloc-ai-cache.ts` | 搭配 AI 翻译缓存的单点归属（键名 / 旧键迁移 / 400 上限），页面不要再自己拼键名 |
| `custom-words.ts` | 生词本（词库未收录的词），`level: 'custom'` 走独立进度 |
| `word-notes.ts` | 每词助记笔记（`_word_notes`） |
| `reader-highlight.ts` | 阅读器复习词高亮（6 色，`matchesHighlight`） |
| `use-favorites.ts` | 收藏（type: chunk/expression/vocabulary/**word**/…），与收藏页同源 |
| `safe-storage.ts` | 带用户前缀的 localStorage 封装（**用户学习数据要用它或原生 localStorage + 事件同步**） |
| `focus-mode.tsx` | 沉浸模式（学习中隐藏全局 Header/底部导航） |
| `backup.ts` / `use-cloud-sync.ts` | 本地备份与云同步 |
| `utils.ts` | `cn`、`cleanText`（清 TTS 不该读的符号）、`extractJson`（**解析 AI JSON 必须用它，别用贪婪正则**）、`formatDate`（**禁止 `toISOString().slice(0,10)`**，东八区凌晨会错天） |

### 3.2 背单词模块（当前改动最密集）

`src/pages/DeepVocabularyPage/`：
- `DeepVocabularyPage.tsx` —— 页面骨架：词书/方式向导、模式切换、顶部 sticky（**只在 browse tab 渲染**，见坑表）、词库浏览、搭配、词汇量测试。
- `components/DailyLearningMode.tsx` —— 每日学习（SM-2 主推路径）：**六方式**（闪卡/选择/拼写/听写/配对/填空）+ 断点续学（`_daily_session_<level>`，2026-09-27 补齐）+ 背面『不再出现』+ 我的助记。
- `components/FlashcardMode.tsx`（约 1100 行）—— **复习检测**：五档评分、冻结本轮顺序、答错即时重排、屏蔽/恢复、未来 7 天预测、本周报告、连击、助记、生词本、断点续学、自动朗读（默认开）、卡片背面"单词+例句"连读。
- `components/QuickCardMode.tsx`（约 1400 行）—— **快速闪卡**：点卡片翻面、上一个单词（常驻顶部可点开详情）、收藏（各处 ★）、完成页词表、学习记录留档 + 当前累积 + 重练、重刷算法、断点续学、"全部"档位。状态机三连修的教训见坑表（StrictMode 双插 / 最后一卡答错 / 继续本轮被覆盖）。
- `components/WordInfoDialog` —— **不是独立文件**，它是 `QuickCardMode.tsx` 里 `export function WordInfoDialog`（约第 1042 行起）；`DailyLearningMode.tsx` 通过 `import { WordInfoDialog } from './QuickCardMode'` 复用，内含『我的助记』读写与生词本入口。
- `components/CollocationsTab.tsx` / `VocabTestTab.tsx`（后者含近 10 次词汇量趋势条）。

其它模块（2026-09 两轮优化的落点，改动时注意同源约定）：`SpellingPage`（错词重练入口、听写语速滑杆）、`ShadowingPage`（100% 完成成就横幅）、`WritingPage`（reset/换题打断在途批改流）、`ArticlePage`（整书翻译断点队列 + 翻译缓存 v2 按段索引回填）、`ChunkTrainingPage`（语块复习断点续学 + 自动发音共键）。

### 3.3 网站与云端 functions（APK 的后端，另一条主战场）

- **部署**：Cloudflare Pages 项目 `nativethink` → `nativethink.pages.dev`，**由 Pages 自己的 Git 集成从 `main` 构建**（仓库内已无部署 workflow，见第 2 节）。`wrangler.toml` 里 `pages_build_output_dir = "dist/client"`，KV 绑定名必须是 `KV`（wrangler.toml 写的 id 是 `68391cb5146345739b4ca78181141017`；**该 id 与 Pages 项目实际绑定的命名空间是否同一个仍待核** —— 线上写进去的键在这个命名空间里查不到）。SPA 路由兜底靠**构建时把 `index.html` 复制成 `404.html`** + `public/_redirects`（`/api/* 200` 透传、`/models/* 404` 是**故意**的 —— 404 让 transformers 回落远程下载、`/* → /index.html`）。`public/_headers` 给 COOP/COEP 头（多线程 WASM 需要）。
- **APK 为什么依赖站点**：`index.html` 头部脚本 `if (window.Capacitor)` 把 `/api/*` 重写成 `https://nativethink.pages.dev/api/*`，`functions/_lib/cors.js` 为 APK 的 `https://localhost` 源补 CORS 头 + OPTIONS 预检。**少任何一个 `withCors` 包一层，手机端该类请求就全挂**，而网页版照常 —— 极易误判成"只有手机有问题"。
- **端点清单**（`functions/api/`）：`ai/chat`（SSE 流式；8 个 provider；GLM 免费档按 `[task 主选, 请求模型, glm-4-flash-250414, glm-4-flash, glm-4v-flash, glm-4.7-flash]` 链式降级，只在 429/5xx 重试）、`ai/passage`、`ai/transcribe`、`tts`（代理 Google TTS，**上游硬上限 200 字符**，边缘缓存 1 年 immutable）、`auth/register|login|me`、`data/sync`（KV 批量 upsert/delete + 按前缀 list 下载）、`feedback/submit`、`gutenberg`、`wikipedia`、`word-image`、`bilibili-info|subtitle|transcribe`。公共层 `functions/_lib/`：`cors.js` / `jwt.js`（HS256，**`JWT_SECRET` 缺失直接抛错**，30 天有效）/ `auth.js`（Bearer → verify）/ `kv.js`（`users:data:<userId>:<key>`）/ `crypto.js`。
- **Key 的来源与优先级**：`api/ai/chat` 取 `客户端 body.apiKey` → `env[AI_KEY_<PROVIDER 大写>]` → `env.SERVER_AI_KEY`，都没有就返回 503（前端会提示"服务端 AI Key 未配置"）。出厂 Key 走另一条路：`vite.config.ts` 读 gitignore 的 `scripts/.apikey` 注入 `__FACTORY_API_KEY__`，**不进仓库**，换 Key 只改该文件重新打包。
- **dev 侧**：`vite.config.ts` 把 `/api/*` 全部代理到线上 pages.dev —— **新加 functions 端点要同时在这里补一条 proxy**，否则 dev 环境该功能静默 404（历史上插图接口就这么漏配过）。
- **端侧兜底**：`src/lib/local-llm.ts`（Qwen2.5-0.5B-Instruct，q4）+ `local-mt.ts`（Xenova/opus-mt-en-zh，q8）。APK/桌面从同源 `/models/` 零下载（`assets/public/models` 878MB），网页版回落 hf-mirror 现下；`streamChat/chat` 在云端失败、且自动回落开关（`__nativethink_local_llm_auto`）打开、小模型已就位时才切端侧，否则原样抛错并 toast 提示可下载离线备用模型。设置入口在 `components/AISettings.tsx` 的「离线备用小模型」卡片。

### 3.4 反馈链路（2026-09-28 补全前后端对接）

`src/components/FeedbackDialog.tsx`（弹窗，自带触发按钮）→ `src/lib/use-feedback.ts`（本地历史 + 限流 + 提交）→ `functions/api/feedback/submit.js`（服务端）→ 两条出路：**先写 KV 留档**（`feedback:<13位毫秒时间戳>:<id>`，见 `functions/_lib/kv.js` 的 `feedbackKey`），**再推飞书群机器人**（`FEISHU_WEBHOOK_URL`，可选通道）。

- **曾经的真相**：组件和函数都写好了，但**没有任何页面挂载弹窗**，而且提交失败一律 toast 成功。现在入口挂在 `Header.tsx` 工具栏（`<FeedbackDialog />`，非沉浸模式下可见），后端返回 `{delivered, archived, id}` 三档真实状态，前端分别提示；失败条目留在「历史反馈」里可**重试**。
- **服务端必做的收敛**：`type` 白名单、`title≤100` / `description≤1000`、`rating` 钳到 0..5、HTML 标签与控制符清洗、蜜罐 `hp` 命中则假装成功且不落库；飞书即使回 200 也要看 body 的 `code`，非 0 不算送达。
- **`use-feedback` 的写入规则**（照仓库既有约定）：`setFeedbacks` 用函数式合并，落盘走 `useEffect([feedbacks, loaded])`，且 `loaded` 之前绝不写 —— 否则首帧空数组会抹掉本机历史。
- **版本与平台**：`src/lib/app-env.ts` 单一来源（`__APP_VERSION__` 由 `vite.config.ts` 从 `android/version.properties` 注入，读不到退回 `package.json`），随反馈一起上报，用来区分"只有手机上出问题"。
- **线上现状（2026-09-28 实测）**：`wrangler pages secret list --project-name=nativethink` 只列出 `JWT_SECRET`，**没有 `FEISHU_WEBHOOK_URL`**，所以飞书那一路必然不通；但新版函数已上线 —— POST 线上回 `200 {"ok":true,"delivered":false,"archived":true,...,"detail":"webhook_not_configured"}`，反馈不再被丢弃。**待核**：用本账号能列出的唯一命名空间（`68391cb5146345739b4ca78181141017`，title `KV`，也就是 `wrangler.toml` 里那个）查不到任何键 —— `kv key list --binding=KV --prefix=feedback` 返回 `[]`，按返回 id 反推的键名 `kv key get` 也 "Value not found"。说明 Pages 项目实际绑的命名空间可能不是这个 id，去 Pages → Settings → Functions → KV namespace bindings 核对后再回填本节。要真"送达"自己，加 `FEISHU_WEBHOOK_URL` secret：`npx wrangler pages secret put FEISHU_WEBHOOK_URL --project-name=nativethink`。
- **回归防线**：`npm run verify:feedback-loop`（56 断言）—— 用**忠实的 KV / webhook 替身真实执行 handler**（留档顺序、飞书业务码、蜜罐、截断、CORS、405/400/503 全覆盖），并断言挂载点存在。正对照已实测会报红：把 `<FeedbackDialog />` 从 Header 摘掉、或把 `<Toaster />` 的 `position` 改掉，脚本立刻 FAIL。
- **顺带修掉的全站缺陷**：`src/components/ui/sonner.tsx` 里有 shadcn 的 `Toaster`，但**过去没有任何地方挂载它**（全项目搜不到 `<Toaster`）—— 于是几十处 `toast.*`（AI 不可用、每日目标、音色回退、朗读降级提示、反馈结果…）全部静默。现在 `src/index.tsx` 挂唯一出口：`position="top-center"`、`offset.top=88px`（避开 sticky 头）、`mobileOffset.top=calc(env(safe-area-inset-top)+84px)`（APK edge-to-edge 不被状态栏吃掉）。**新页面不要再挂第二个 Toaster**。
- **真浏览器验收（2026-09-28，无头 Chrome + CDP 打预览服 4173）**：顶栏按钮存在 → 弹出「用户反馈」→ 填描述 → 提交 → 因线上无接收通道，实测 toast 为「反馈暂未送出 / 内容已保存在本机「历史反馈」，可在里面点重试」；本机 `feedback_list` 该条 `synced:false`、`appVersion:"2.0.25"`，历史区显示「未送达 · 已存本机」+「重试」。限流同样实测生效（紧接着第二次提交被"请等待 N 秒后再提交"挡住）。

```powershell
# 开发 / 构建
npm run dev                 # Web 开发服务器
npm run typecheck           # tsc -p tsconfig.app.json（提交前必跑）
npm run lint:eslint         # eslint src
npm run build:web           # 生产构建 → dist/client（同时生成 404.html）
npm run preview             # 本地预览构建产物（:4173）

# 验证（本项目没有测试框架，这些就是回归防线）
node scripts/verify-wordbank-loading.mjs     # 词库加载层集成验证（42 项：显示数=出卡池子、九本全载不互抢）
node scripts/verify-wordbank-split.mjs --baseline <out.json>   # 数据层拆分校验：采基线（拆分前后都能采）
node scripts/verify-wordbank-split.mjs --check <in.json>
npm run verify:books-meta        # 书目/SCP 元数据 + 复习词高亮 + 乱码（202 断言）
npm run verify:vocab-cards       # 背单词卡片交互契约（251 断言）
npm run verify:vocab-caches      # 词汇缓存基建契约（capped-cache / colloc-ai-cache 接线，21 断言）
npm run verify:feedback-loop     # 反馈链路契约（挂载点 + 三档状态 + 后端 KV/飞书替身真实执行，56 断言）
npm run verify:overlay-fit       # 窄视口浮层契约（Dialog 基座夹高度 + 朗读/AI 设置内部滚动，16 断言）
npm run verify:bundle-budget     # 首屏下载预算（从产物反查入口静态依赖图，8 断言；跑前必须先 build:web）
npm run verify:tts-progress      # 朗读切片/进度（6175 断言）
node scripts/verify-tts-hardening.mjs        # TTS 降级/预合成守卫 + 设置面板网络卫生（15 项）
npm run check:tts-voices         # 音色与模型资产一致性（package:apk 前置）
npm run wordbank:split           # 改词库后必跑：把 detail 拆出主文件（幂等）

# 语料
node scripts/fetch-scp.cjs               # 重抓 SCP 文章（约 1 req/s，产物勿手改）
node scripts/clean-wordbank-mojibake.mjs # 清 U+FFFD 乱码（幂等）

# 品牌视觉资产（APK 图标 + 启动图 + favicon + icon.ico）
pwsh -File scripts/gen-app-brand.ps1 -Preview docs/brand-assets-preview.png

# 打包（版本号必须先递增！）
npm run version:apk-bump    # 只 +patch，如 2.0.25 → 2.0.26
npm run package:apk         # 校验音色 → capacitor copy → 拷模型 → gradle → 落 release/
npm run package:desktop
npm run package:all         # web 只构建一次，APK 与桌面并行（约 45s）

# 真机
adb pair <IP>:<端口> <6位配对码>   # 首次；端口靠 adb mdns services 发现
adb install -r release/NativeThink-mobile-debug.apk
```

---

## 5. 验证体系（改完必须跑）

| 层 | 手段 | 覆盖 |
|---|---|---|
| 静态 | `npm run typecheck` + `npm run lint:eslint` | 全量；pre-commit 强制 |
| 构建 | `npm run build:web` | 打包可行性 + chunk 体积 |
| 契约 | 7 个 `scripts/verify-*.mjs` | 词库加载/拆分、书目元数据、背单词卡片、背单词缓存、TTS 切片与进度、TTS 降级、反馈链路（前后端对接 + 后端替身执行） |
| 真机 | adb + CDP（见第 7 节） | 只能在设备上发现的：safe-area、原生 TTS、手势、持久化 |

**写守卫脚本的经验（血泪）**：
1. **断言要重新推导，不能照抄**。改语义时必须连断言一起改 —— 历史上 `viewingPast = rated && isFlipped` 这个**错误定义被断言一起锁死**，导致"评分后自动跳转"永远不触发却一直是绿的。
2. 断言里加**脚手架自检**（例如"解析到的条目数必须等于源文件条目数"），否则正则会静默漏项（曾漏掉含撇号的书名）。
3. 数据文件混用单/双引号，正则要写 `(?:[^"\\]|\\.)*`；解析 TS 数据优先用 `ts.transpileModule` 而不是正则。
4. 断言数会随功能增长（`verify-vocab-cards` 135 → 225 → 246），**只增不减**，除非删功能。

---

## 6. 不可漂移的约定

### 6.1 UI / 设计系统
- 主色青蓝/青绿，品牌锚点 `#00B894`；圆角 卡片 `rounded-xl`~`rounded-[48px]`、按钮 `rounded-2xl`；阴影默认 `shadow-sm`。
- 反馈色柔和（成功 `hsl(150 55% 42%)`、警告 `hsl(35 85% 55%)`、错误低饱和红）；**不要考试焦虑视觉**。
- 深浅主题靠 `src/tailwind-theme.css` 的 CSS 变量；界面语言中文，学习内容是英文。
- 图标统一用 `lucide-react`（**不要 emoji 当图标**：不继承主题色、跨平台不一致）。完整规范见 `docs/PRODUCT-SPEC.md`。

### 6.2 存储与数据
- 手机端数据**只进 localStorage / IndexedDB**，不写系统目录。
- 用户学习数据用 `safeStorage`（带用户前缀）或原生 localStorage + 事件广播；**不要依赖 `safeStorage` 前缀不变**。
- 日期一律 `formatDate()`；禁用 `toISOString().slice(0,10)`。
- `moduleProgress` 的 key 必须与 `DashboardPage/constants.ts` 的 `MODULES[].key` 一一对应。
- 主要 storage key 前缀 `__nativethink_`，例如：
  `_learning_stats` / `_calendar` / `_word_learning` / `_daily_quota` / `_favorites` / `_word_notes` /
  `_custom_words` / `_tts_settings` / `_sherpa_off` / `_sherpa_try` / `_spelling_progress` / `_achievements` / `_theme`。
  **断点续学键按（模式, level）分**，勿混用全局键：`_vocab_session_<level>`（复习检测）、`_daily_session_<level>`（每日学习）、
  `_quickcard_session_<level>`（快速闪卡）、`_chunk_review_session`（语块复习）。
  自动发音共键：`_vocab_autospeak`（每日/复习检测/快速闪卡/语块复习一处关闭处处安静）。
  快速闪卡留档三件套：`_quickcard_runs` / `_quickcard_pending` / `_quickcard_session*`。
  要完整清单就 `grep -rho "__nativethink_[a-z_]*" src | sort -u`（当前 90 多个不同键）—— 这里刻意不列全，列全会过期（缓存类的封顶规则见 `capped-cache.ts` / `colloc-ai-cache.ts`）。

### 6.3 TTS（最脆弱，改前必读）
- 云端上游（Google Translate TTS，经 `functions/api/tts.js`）硬上限**恰好 200 字符**（205 → 502）；客户端切片上限 **180**，改大整条云端链路失败并静默降级。
- 默认离线音色 `piper:lessac`：真机 RTF **0.076**（428ms 合成 / 5789ms 音频）；Kokoro int8 RTF **1.008** —— RTF ≥ 1 物理上无法维持长文连续播放，故只作音质选项。
- 长文朗读只靠**超时驱动 + advanced 标志**推进，`onEnd` 与超时不可同时推进（否则跳句/卡顿）。
- 改音色 → 跑 `npm run check:tts-voices`；改切片/进度 → 跑 `npm run verify:tts-progress`。
- 不要把 TTS 栈拆出主包（实测负优化，见 AGENTS.md 记忆条）。

### 6.4 品牌视觉资产

- 生成器：`scripts/gen-app-brand.ps1`（PowerShell + GDI+，4× 超采样后双三次下采样；仓库无 canvas/sharp 依赖）。
  一条命令重建全部 51 张图：24 张图标 mipmap（自适应底色/前景 + 旧版方形/圆形 × 6 密度）+ 26 张启动图（port/land × day/night × 6 密度）+ `public/favicon.svg` + `icon.ico`。
- 设计规范：品牌色 `#00B894`（渐变 `#14D9A8 → #00A183`），字标 = 白色 **N** 折线 + 右上角四角星（think 意象）。
- **改字标前注意**：自适应图标 XML（`mipmap-anydpi-v26/ic_launcher.xml`）对背景与前景各 inset 16.7%，
  所以前景 PNG 里的字标要占画布约 **78%**，缩放后才落在 66dp 安全区内；旧版方形/圆形图标无 inset，字标取 62~66%。
- 启动图尺寸**沿用现有文件**（脚本读 PNG 头取宽高），不要改文件名或目录，否则会漏改。
- Android 12+ 系统启动画面在 `values/styles.xml` 的 `AppTheme.NoActionBarLaunch` 里对齐成品牌绿底 + 白字标。
- 改完 `-Preview` 出图自查（`docs/brand-assets-preview.png`），再 `npm run package:apk`。

### 6.5 打包
- `versionCode` 每次打包**必须递增**，否则 Android 拒绝升级安装（要求先卸载 → 丢数据）。
- `post-commit` 会改 CHANGELOG，工作树有 1 条已暂存 CHANGELOG 是稳态。
- 未明确要求**不要 push**。仓库里已经没有部署 workflow（2026-09-28 删除），**push 就等于直接改线上**：Cloudflare Pages 的 Git 集成会自动构建并切 production。真要恢复 CI 部署，在 GitHub 加 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secret，并从提交 `28a51f9` 取回 `.github/workflows/deploy-cf.yml`（缺 token 时该步会报 `In a non-interactive environment…CLOUDFLARE_API_TOKEN`）。

---

## 7. 真机调试通道（已验证可复用）

设备：Redmi 25053RT47C / HyperOS / Android 16（SDK 36），CSS 视口 393×851，dpr 3.256，safe-area 顶 **47px** / 底 **16px**。

**日常首选 `scripts/device-eval.mjs`**（它把 forward + CDP 都包好了，端口默认 9223，可用 `CDP_PORT` 覆盖）：

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l                     # 若同一台机器出现两条（IP:port + mDNS），先 disconnect 掉重复那条
& $adb shell pidof com.nativethink.app
& $adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>   # socket 名：adb shell cat /proc/net/unix | grep webview_devtools_remote
node scripts/device-eval.mjs eval "document.title"   # 求值（awaitPromise 已开）
node scripts/device-eval.mjs tap 400 1630            # 点击，坐标给**物理像素**，内部按 innerWidth 折算
node scripts/device-eval.mjs shot .screen.png        # 截图（落在仓库根的 .screen*.png 属调试残留，别 commit）
node scripts/device-eval.mjs back
```

要自己发 CDP 时才用底层通道：`Invoke-RestMethod http://127.0.0.1:9223/json` 拿 `webSocketDebuggerUrl`。

**关键限制与对策**
0. **先报备再动手机** —— 走查/装机/点击都会干扰用户真机，动手前先在对话里说清要做什么；走查收尾必须 `force-stop` 归位。
1. **HyperOS 禁止 `adb shell input`**（`SecurityException: INJECT_EVENTS`）—— tap/keyevent 全不可用。改用 **CDP** 驱动 WebView：
   - `Runtime.evaluate` 执行 `el.click()` 驱动 React（合成 click 可用；**合成 TouchEvent 不可靠**，滑动验证请用真手指）。
   - 键盘交互可用 `window.dispatchEvent(new KeyboardEvent('keydown', {...}))`，但注意**在 window 上派发的事件不会传播到 document**（Radix 的 Esc 处理挂在 document 上，所以这样测"Esc 关弹窗"会假失败）。
2. 坐标：CDP 是 CSS px，`adb exec-out screencap` 是物理 px（物理 = CSS × dpr）；`device-eval.mjs tap` 已自动折算，直接给截图上量到的像素即可。
3. `Page.reload` / force-stop 后 pid 会变，需重建 forward；忘了重建会报 `no page target` 或 CDP 调用超时（脚本给的提示是"页面可能在后台被冻结，把 App 调到前台再试"）。
4. 读 safe-area 真值：探针 div + `getComputedStyle().paddingTop`（`env()` 不能直接读）。
5. 无线调试会掉线，需要手机上重新出 6 位配对码。
6. 长参数/JCJK 表达式走**文件**（`node evalfile.mjs expr.js`），别用 PowerShell 拼字符串（解析器会吃掉引号和 emoji）。

---

## 8. 已知坑与反模式（改代码前先扫一眼）

| 现象 | 真正原因 | 修法 |
|---|---|---|
| 白屏 `Cannot access X before initialization` | TDZ：hook/const 声明顺序（`cw` 出现在 effect 依赖里） | `useState/useRef/useMemo` 放到使用之前 |
| 页面永远 loading | `setLoaded(true)` 写在 try 内 | 放 `finally` |
| 进度环 NaN / 0% | `moduleProgress` 缺 key 或与 MODULES 不一致 | 键对齐；`RingProgress` 非法值回退 0 |
| 刷新后记忆丢失 | 用了带用户前缀的 `safeStorage` 又期望前缀不变 | 学习数据用原生 localStorage 或带事件同步的 hook |
| **退出/切 tab/杀 App 后状态丢** | 组件卸载即丢 state（切 Tab 会卸载） | 显式持久化（见 `quickcard-history.ts` 的三段式：断点 + 留档 + 累积桶），恢复时用 ref 状态机与"重建"effect 分先后 |
| **ref 记录不生效（第一次对，之后静默失效）** | **ref 不随组件重挂载归零**（`lastSpokenKey` 一类） | 每轮开始显式清空（`startSession`/`startRun`） |
| 东八区凌晨日期错一天 | `toISOString().slice(0,10)` | 用 `formatDate()` |
| 父子双 `onClick` 触发两次 | 事件冒泡重复绑定 | 只保留外层 handler |
| `<button>` 嵌 `<button>` 警告 | 内层也是 button | 内层改 `span role="button"` |
| **空 sticky 条压住内容** | 无内容但带 `bg-*` 的 sticky 元素仍占位并遮挡 | 只在有内容时渲染（`{tab === 'browse' && (...)}`） |
| **柱状图数值压标题** | 容器高度不够三层（值+柱+轴） | 容器高度 ≥ 三层实测高度（本项目 `h-[72px]`） |
| 弹窗打开时 Esc 连带退出当前流程 | Radix 在 document 冒泡阶段**同步 flush** 关闭弹窗，window 冒泡监听已看不到 dialog | 键盘监听用**捕获阶段**（`addEventListener('keydown', fn, true)`） |
| 朗读卡顿/跳句 | `onEnd` 与超时双触发 | 只超时驱动 + advanced 标志 |
| 词库"详情面板空白" | `loadLevel` 内 `try{loadDetail}catch{}` 静默吞错 | 用 `isDetailReady()` 判断，失败提示 `window.location.reload()`（模块表会缓存失败结果，原地重试无效） |
| 维基百科加载失败 | 网络限制 | `origin=*` + `AbortSignal.timeout(10000)` |
| 主包体积想优化 | TTS 栈**无法**懒加载（首屏多处引用 + 入口同步自检） | 已实测为负优化，别再试；优先级低于 wordbank 分片 |
| 词书卡显示 7,404、快速闪卡只出 2,127 张（九本全载时考研池子=0，2026-09-29 已修） | `ensureIndexes()` 原来用一个 `seen` 贯穿所有等级 → 先遍历到的书独占该词，池子还随"哪几本被加载"变；计数表填的是词条数；"全部"用各本相加 | 书内去重决定池子、全局去重只用于 `_allWordsCache`；`WORD_COUNTS`=池子（守卫从数据实测复核），`WORD_ENTRIES`=词条数；"全部"用 `getTotalLearnableCount()` |
| 手机上浮层"无法下滑"，底部控件（语速/测试/自检）永远点不到（2026-09-28 已修 `TTSSettings`） | Popover 是 portal 浮层，**页面滚动救不了它**；旧写法只有 `overflow-hidden` 又没有高度上限，超出视口的部分被直接裁掉 | 外层 `max-h-[calc(var(--radix-popover-content-available-height)-1.5rem)]` + `flex flex-col`，标题 `shrink-0`、正文 `flex-1 min-h-0 overflow-y-auto overscroll-contain`；正文里嵌套的 `max-h + overflow-y-auto` 小滚动要拿掉，否则手势被它吃掉 |

**2026-09 两轮全站质量优化新增的坑**（下表只列最容易复发的，完整表以 `AGENTS.md`「已知坑」为准）：

| 现象 | 真正原因 | 修法 |
|---|---|---|
| 洗牌列表 + 下标定位当前题，AI 出题/删题后当前题悄悄漂移 | `useMemo(() => shuffle(items), [items])` 依赖数组身份，每次重算都换顺序 | 用 `use-stable-shuffle.ts`（首帧同步初始化 + 只增量增删）；接入点索引加守卫 |
| 恢复到某个 tab 时挂载即白屏 | 洗牌 hook 首帧返回空数组，`items[currentIdx].field` 崩 | hook 首帧同步初始化顺序（已修）；接入点保留 `?.` |
| StrictMode 下副作用翻倍（词插两遍、results 错位） | setState updater 里再调 setState / 改 ref，双调用把副作用跑了两遍 | 副作用提到事件层，用 ref 拿最新状态各 set 一次（参考 QuickCardMode `scheduleRelearn`） |
| 最后一卡答错被直接判完成，重排词永不出现 | 完成判定用闭包 `queue.length`，重排插入后是旧值 | 读 ref 镜像的最新长度（`queueRef.current.length`） |
| 断点续学被另一本书覆盖 | 切词书同帧"新 level + 旧队列"先于重建落盘 | 断点按 level 分键 + 落盘前校验队列归属 |
| 屏蔽（不再出现）的词又回来了 | 只在一个出卡路径过滤 `suspended`，别的漏滤 | **所有**出卡路径统一过滤（复习检测 `otherWords` 曾漏） |
| 整页/整章翻译错位一行 | 失败段被 filter 后按"成功顺序"回填 | 翻译缓存 v2 按段索引 byIdx 精确回填；旧顺序缓存段数不吻合宁可不显示 |
| 长任务结束时覆盖运行期间的新数据 | 用点击时的陈旧快照直接 set | 合并用 `setX((prev) => ...)` 函数式；与其它写路径互斥守卫 |

---

## 9. 当前进度与未完成事项

### 已完成（到 2.0.28 / `f1ddeb7`，另有 2026-09-29 未打包改动）
- **阅读器 + 朗读**：22 本公版书离线可用、三级 TTS 降级（内置 sherpa 离线 → 系统 → 云端）、切片进度上报、"读到哪"高亮、段落/整篇朗读、复习词彩色高亮（6 色可选）、整书翻译断点队列（批合并 + 每批落盘 + 随时中止）、翻译缓存 v2 按段索引回填。
- **词汇深度**：SM-2 五档复习、词库浏览、搭配学习、词汇量测试（含近 10 次趋势条）。
- **快速闪卡**：点卡片翻面 + 例句、上一个单词（顶部常驻可点开词条详情）、各处单词收藏（与收藏页同源）、完成页词表、学习记录留档 + 当前累积 + 重练、按选择数量切分留档、相同词表去重、答错隔 4 张重刷（最多 2 次）、断点续学（切 tab / 杀 App 都恢复）、"全部"档位。
- **每日学习（六方式）2026-09-27 一轮**：断点续学补齐（**四个主模式现已全部可续学**：复习检测 / 每日学习 / 快速闪卡 / 语块复习）、闪卡背面『不再出现』（与复习检测对齐、可撤销）、词条详情弹窗读写『我的助记』（复用快速闪卡的 `WordInfoDialog`）、配对不再自动朗读（视觉任务）、自动发音四模式共键。
- **全站两轮质量优化**（`4f45167` / `e33a780`）：`useStableShuffle` 统一洗牌、快速闪卡状态机三连修、断点按词书分键、屏蔽词全路径过滤、写作 reset/换题打断在途批改流、拼写错词重练入口 + 听写语速滑杆、跟读 100% 完成成就横幅、复习检测键盘弹窗守卫、危险操作两段确认、四个只增不减的缓存 FIFO 封顶 + 键迁移（`capped-cache` / `colloc-ai-cache`）、模式首页角标订阅刷新、贪婪正则换 `extractJson`、emoji 图标换 lucide。
- **系统层**：Android 15+ edge-to-edge 适配（`viewport-fit=cover` + safe-area 工具类）、词库 5,909 处 U+FFFD 乱码清理、品牌视觉资产重建（`gen-app-brand.ps1`）、真机 CDP 通道 `device-eval.mjs`。
- **反馈链路对接补全（2026-09-28）**：入口挂上 `Header`，后端改为「先 KV 留档、再可选推飞书」，返回三档真实状态（`delivered`/`stored`/`failed`），失败可在历史里重试；新增 `src/lib/app-env.ts` 统一版本与平台上报，新增守卫 `npm run verify:feedback-loop`（53 断言，含正对照）。详见 §3.4。
- **首屏下载体检与瘦身（2026-09-29）**：从**产物**反查入口静态依赖图，抓到三处"运行时明明不执行、却压进入口"的重依赖 ——
  ① `vite.config` 给 recharts/d3 与 react-markdown 写了强制 `manualChunks`，效果**正好相反**：被强制归组的 chunk 变成入口静态依赖，
  全站只有 `/progress` 用得着的图表库（111KB gzip）与只有几页用得着的 Markdown 渲染器（45KB）每条路由都得下载；
  ② `src/index.tsx` 同步 `require("@lark-apaas/client-toolkit-lite")` —— 只在 miaoda 平台内才用，
  但把 zone.js（两个版本）、axios、crypto-js、@opentelemetry、lodash 全量一起拖进入口（入口 chunk 301KB gzip）。
  三处改完：**首屏必需 JS 539.7KB → 237.7KB gzip（-56%）**，冷加载 `/` 750KB → 336KB、`/vocabulary` 800KB → 392KB、
  `/articles` 1055KB → 642KB；图表与渲染器改为**用到时才拉**（已实测切到「学习统计」tab 才请求 ProgressCharts 110KB、
  点「更新日志」才请求渲染器 45KB）。新增守卫 `npm run verify:bundle-budget`（8 断言 + 两条"确实还在产物里"的正对照，
  把旧 manualChunks 规则加回去立刻报红）。
- **词汇深度首启不再预载九本（2026-09-29）**：`selectedLevel` 默认 'all' 时挂载即预载 9 本书连 detail ——
  全新 profile 进 `/vocabulary` 就是 18 个词库 chunk / 3.16MB / 15 个长任务合计 1.6s，而用户连一本都还没选。
  现在没 `setupDone` 一律不预载，模式子树也等 `dataReady` 才挂载（顺带修掉"数据晚到但 memo 不重算 → 本书进度整块消失"）。
- **词汇向导「少点一步」两修（2026-09-29）**：① 换书与首启拆成两条路 —— 已选过词书的人点任意一本书**一步生效**（保持当前学习方式、不清该书今日配额），三步进度条只在首启出现，「全部」不再拿四级图标冒充；② 走完向导（含点「开始学习」与「继续上次的选择」）**直接落进所选模式**，不再退回模式列表逼用户点第二下。`verify-vocab-cards.mjs` 补 21 条断言（含三条变异正对照），并用本机无头 Chrome + CDP 把 A/B/C/D 四段路径真实点了一遍（23 项行为断言全绿，截图见下条）。

### 未完成 / 已知短板
1. ~~**切换词书必须多走一步「学习方式」**~~（2026-09-29 用户报，**已修**）。
   根因留档：换书与首启共用同一个三步向导，而点书只 `setChosenLevel` + `setStep(1)`，真正写回页面状态的
   只有走完「选方式」后的 `handleWizardComplete → setSelectedLevel` —— 中途关向导等于没换。
   现在 `onSwitchBook`（一步换书、保持方式、不清该书今日配额）与首启三步是两条路，且向导完成即 `setImmersed(true)` 落进所选模式。
   验收方式值得复用：这类"入口在但状态不写回"的缺陷静态检查看不出来，本次用**本机无头 Chrome + CDP 真点**四段路径（首启 / 沉浸态换书 / 首页换书 / 全部词库），23 项行为断言全绿。
2. ~~**快速闪卡两个提示要求去掉**~~（2026-09-29 用户报，**已修** `fdc9075`）：点「不认识」与收藏 / 取消收藏不再弹 toast，
   视觉反馈由卡片本身承担（★ 填充、翻面显释义、红标），答错隔 4 张重刷的机制照常生效；
   `verify-vocab-cards.mjs` 已补静默契约断言（含"重排仍在、只是不播报"的正对照）。
3. **学习提醒**（Capacitor 本地通知）刻意推迟未做 —— `android/app/src/main/assets/capacitor.plugins.json` 里目前只有 `@capacitor-community/text-to-speech`（`SherpaTts` 是仓库内原生插件，在 `MainActivity` 里 `registerPlugin`，不进这张表）。
4. **词库真人发音包**：单词集合有限，可预录（ROADMAP 第 3 项）。
5. 句子语料/语法/导入书离线翻译仍有待回填项（见 ROADMAP）。
6. `.githooks/post-commit` 仍会在插入日期标题时带固定空行（`CHANGELOG.md` 头部已堆 4 行空行，无害）；日期标题 `###`/`##` 那条**已修**。
7. **反馈通道尚未开通**：代码链路已通，但线上 Pages 项目只有 `JWT_SECRET` 一个 secret —— 要让反馈真的送达开发者，需加 `FEISHU_WEBHOOK_URL`（飞书群机器人）和/或确认 KV 绑定生效；否则用户看到的一直是"暂未送出，可重试"。
8. **文档债（仍在）**：`src/components/HelpGuide.tsx` 是应用内帮助中心，内容比代码旧 —— FAQ 还写"必须自备 API Key、推荐 DeepSeek"（现在出厂免费档可直接用）、"聚合所有五个等级"（现在九档）、"数据不会上传到任何服务器"（现在可登录云同步）。`使用攻略.md` 已于 2026-09-28 重写。
9. 仓库根有 2 个真机截图残留未跟踪（`.screen1.png` / `.screen2.png`），别 commit，要清就删。
10. ~~**`/api/tts-voices` 是死调用**~~（2026-09-29 已修）：`TTSSettings.tsx` 原来无条件 fetch `/api/tts-voices`
    —— 网页版每条路由吃一次 404，APK 里 `index.html` 把 `/api/*` 重写到线上站点，等于手机每个页面多一次真实网络往返。
    现在用 `platformTag() === 'desktop'` 圈住：桌面照旧，web/APK 一个请求都不发。
    **更正此前的错误记录**：这条路由**不是**没有实现 —— `server/local-server.mjs:671` 就实现了它
    （枚举 Windows SAPI / OneCore 音色），由 `electron/main.mjs` 的 `startServer` 带起来。
    当时我只搜了 `src`/`functions`/`electron`/`scripts`，漏了 `server/` 目录，于是把"桌面专属"误判成"死代码"。
    教训：判定"全域没有实现"之前，先 `git ls-files | wc -l` 看清顶层目录清单，别按印象列范围。
    验收（本机无头 Chrome 逐 12 条路由）：web UA 4xx/5xx = **0**（原来每路由 1 条），APK UA = **0**，
    Electron UA 正对照 = 仍发 12 次（说明桌面那条路没被顺手砍掉）。守卫见 `verify-tts-hardening.mjs` C1-C4。
11. ~~**AI 设置浮层在窄视口顶部被裁**~~（2026-09-29 已修）：393×600 实测面板高 687px，
    **上下各被裁 43px**（先前记的 `top=-42` 是同一次测量，方向判断错了 —— 它不是 Radix 翻转到上方，
    而是 `ui/dialog.tsx` 的基座用 `translate-y-[-50%]` 居中，内容比视口高时**两头一起溢出**，
    而模态框锁住了背后页面的滚动，用户救不回来）。
    修法：`DialogContent` 基座加 `max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain` 兜底，
    AI 设置自身改竖排（标题 `shrink-0` + 正文 `flex-1 min-h-0 overflow-y-auto`）；
    顺带修同屏另一个问题 —— 393px 塞两列把「智谱免费·出厂」压成一字一行，改成 `grid-cols-1 sm:grid-cols-2`。
    复量：无头 Chrome 逐 6 个顶栏浮层在 393×600 / 393×500 / 1280×800 三档，被裁数 **0/6**（改前 1/6）。
    新增守卫 `npm run verify:overlay-fit`（16 断言，6 处变异全部验红）。
12. ~~**`verify-wordbank-split.mjs` 只能在"拆分前"采基线**~~（工具语义缺陷，2026-09-29 已修）：
    旧 `--baseline` 只记"主文件里 `collocations` 数组是否非空"，而 `--check` 比的是 `hasCollocations` 标记
    —— 词库处于拆分后状态（数组已清空、只留标记）时重采基线必然得到"全 false"的期望，`--check` 大面积报红。
    现在基线取"当前数据里最权威的那个来源"（有标记用标记，否则用数组），**任何时刻都能重建**；
    同时把「标记 ↔ detail 真值」的分歧清单钉进基线，`--check` 要求逐条相同（多一条、少一条、换了谁都红）。
    顺带查出并钉住 **3 条历史分歧**：postgraduate 的 "transistor"（重复词条，标记 true 而 detail 无搭配 ×2）
    与 advanced 的 "dexterity"（标记 false 而 detail 有搭配）—— 根因是 detail 映射按词键控、同词重复条目只能留一份。
    另修一处连带断裂：`wordbank.ts` 现在从 `./meta` 取常量，`--check` 的 ④ 把 wordbank 转译到临时目录时
    没带上 `meta.mjs`，直接 `ERR_MODULE_NOT_FOUND`（1625dba 起就坏了，因为没人跑过 `--check`）。
    三条变异全部验红（改标记 / 抹 detail 搭配 / 喂老基线），还原后 `--check` 全绿。
13. **2.0.28 真机侧尚未确认**（2026-09-29）：手机已装 73/2.0.28，但按用户要求当时停了验证 ——
    唯一一次尝试因我用 `pushState` 跳转没落到预期界面而读数全空，等于没验。
    待确认两件事：词书卡是否显示 六级 7,404 / 考研 5,047 且考研能开出卡；朗读设置能否手指滑到底
    点到语速与自检。现有一切结论都只有本机证据（`verify-wordbank-loading` 42 项 + 无头 Chrome 读 DOM）。
14. **新用户一进「词汇」就被两个引导抢位**（2026-09-29 无头 Chrome 复现，未修）：
    `src/components/HelpGuide.tsx:239` 在挂载 800ms 后对没看过指南的用户自动 `setOpen(true)`，
    而它是**模态** Radix Dialog（遮罩吃掉指针事件）—— 于是 `/vocabulary` 的首启三步向导还铺在下面，
    "使用指南"就先盖了上来，新人必须先关掉它才能选词书。
    本次验收是在代码里先关掉这个弹窗才继续的（等于绕过了新人路径的第一屏）。
    建议：自动弹出只在 `/`（首页）触发，或页面自身有更强的首启流程（如 `!setupDone` 的词汇向导）时抑制；
    顺带把第 8 条的文档债一起清（同一个组件）。


### 下一步建议顺序
1. 学习提醒（本地通知）—— 目前唯一还缺的系统级能力。
2. 词库真人发音包（预录 + 打包体积方案要先定，`public/` 不能塞大文件）。
3. ROADMAP 里的语料回填项（语法条数、导入书离线翻译、待回填空段）。
4. 顺手项：把 `使用攻略.md` 更到当前功能面；`post-commit` 的空行治理。

---

## 10. 交接检查清单

**开工前**
- [ ] `git log --oneline -5` + `git status` 看清工作树（稳态只有 2 条已暂存的 CHANGELOG；调试残留别 commit）
- [ ] `npm run typecheck && npm run lint:eslint` 确认基线是绿的
- [ ] 读本文件第 6、8 节（约定 + 坑表）再动代码

**改完代码**
- [ ] `npm run typecheck`、`npm run lint:eslint`、`npm run build:web`
- [ ] 跑与改动相关的 `scripts/verify-*.mjs`；语义变了要**重新推导**断言（8 个脚本 2026-09-29 全绿：42 / 202 / 246 / 21 / 6175 / 15 / 56 / 16）
- [ ] 改过词库文件 → `npm run wordbank:split` + `node scripts/verify-wordbank-loading.mjs`
- [ ] 真机装机验证（涉及 safe-area / 原生 TTS / 手势 / 持久化的改动**必须**真机验；动手前先报备，收尾 `force-stop`）

**交付前**
- [ ] `npm run version:apk-bump` 后再 `package:apk`（versionCode 必须递增）
- [ ] `aapt dump badging` 核验内嵌版本
- [ ] 确认没有大文件进 `public/`
- [ ] 确认站点 functions 没被改坏 —— APK 的 `/api/*` 打的就是线上站点
- [ ] 回复里给：结论 + 关键数字 + 文件路径 + 下一步需要用户做什么

**禁止事项**
- ❌ 往 `public/` 放大文件（APK/模型） ❌ 用 `--no-verify` 绕过钩子
- ❌ 用 `useMemo(() => shuffle(items), [items])` 现洗（依赖数组身份 → 当前题漂移），一律 `use-stable-shuffle`
- ❌ 把断点续学写成全局单键（切词书会互相覆盖），按 level 分键 + 落盘前校验队列归属
- ❌ 新增按词累积的 localStorage 缓存不走 `capped-cache.ts`（会把配额撑爆）
- ❌ 直接改 `src/data/wordbank/data/*.ts`（跑 `npm run wordbank:split` 恢复拆分）
- ❌ 直接改 `src/data/scp.ts` / `books.ts`（生成物；改生成器 + 跑守卫）
- ❌ 在页面里直接调 `speechSynthesis`（走 `use-tts.ts`）
- ❌ 用 `toISOString().slice(0,10)` 取日期
