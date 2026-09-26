# NativeThink 项目交接手册（Agent Handover）

> 面向**接手的 AI agent / 新同事**：只读这一份就能开工。
> 最后校准：2026-09-25（对应 APK 2.0.20 / versionCode 65，本地 main 40aa80e + 未提交工作树）。
> 相关文档：`AGENTS.md`（日常约定速查）、`ROADMAP.md`（路线）、`docs/PRODUCT-SPEC.md`（需求与 UI 规范）、`CHANGELOG.md`（提交级日志）。

---

## 0. 30 秒速览

| 问题 | 答案 |
|---|---|
| 这是什么 | 面向中文母语者的**英语思维训练 App**（摆脱中式英语）：思维训练、语块、句精讲、跟读、对话、文章精读、词汇深度、拼写 |
| 形态 | Web SPA + Electron 桌面 + Capacitor Android（**同一份前端**，无业务后端） |
| 技术栈 | React 19 + TS + Vite 8 + Tailwind v4 + shadcn/ui；状态存 localStorage / IndexedDB |
| 现在改哪 | 主要战场是 `src/pages/DeepVocabularyPage/`（背单词）与 `src/pages/ArticlePage/`（阅读器 + 朗读） |
| 怎么验 | **没有测试框架**。`npm run typecheck` + `npm run lint:eslint` + `npm run build:web` + 6 个 `scripts/verify-*.mjs` 断言脚本 |
| 怎么装机 | `npm run version:apk-bump` → `npm run package:apk` → `adb install -r release/NativeThink-mobile-debug.apk`（产物约 830MB，装一次 1~2 分钟） |
| 部署 | Cloudflare Pages 从 GitHub `main` 构建（`nativethink.pages.dev`），`pages_build_output_dir = "dist/client"` |
| 最容易踩的坑 | ①改动 TTS 切片上限会让云端链路静默失败 ②ref 不随组件重挂载归零 ③`public/` 不能放大文件 ④推送用 SSH over 443 |

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

- **词库**：75,113 词，9 个等级 —— 中考 3,223 / 高考 6,008 / 四级 4,542 / 六级 7,404 / 雅思 6,609 / 托福 10,367 / 考研 9,602 / 专业 8,887 / 高阶 18,471。
  数据在 `src/data/wordbank/data/<level>.ts`（仅核心字段）+ `<level>.detail.ts`（搭配/例句/深度解释，按需加载）。
- **书库**：22 本公版书（`src/data/books.ts`，635KB，含中文对照），中文对照离线随包。
- **SCP 文章**：20 篇 / 约 27.9k 词（`src/data/scp.ts`，由 `scripts/fetch-scp.cjs` 抓取，CC BY-SA 3.0，**勿手改**）。
- **句库/语块/跟读**：`sentence-lab*.ts` / `chunks.ts` / `shadowing.ts`。

---

## 2. 仓库现状（接手前必须知道）

| 项 | 现状 |
|---|---|
| 分支 | `main`，HEAD = `40aa80e`。**本地领先 origin/main 13 个提交** |
| 未提交改动 | 背单词模块最近一轮（APK 2.0.20 已验证并装机）：<br>`M src/pages/DeepVocabularyPage/{DeepVocabularyPage.tsx, components/FlashcardMode.tsx, components/QuickCardMode.tsx}`<br>`M src/pages/FavoritesPage/FavoritesPage.tsx`（补 'word' 过滤）<br>`M scripts/verify-vocab-cards.mjs`（135 → 223 断言）<br>`?? src/lib/quickcard-history.ts`（新文件）<br>`M AGENTS.md` / `M README.md` / `?? docs/PROJECT-HANDOVER.md`（本次交接文档）<br>`M android/version.properties`（versionCode 60→65） |
| 远端 | `ssh://git@ssh.github.com:443/HDLDD/NativeThink.git`（**HTTPS 通道在本机不可用**：SSL unable to get local issuer certificate）。`core.sshCommand` 已指向系统 ssh，普通 `git push` 可用 |
| 部署 | Cloudflare Pages 从 `main` 构建 —— **本地坏不影响线上，一旦 push 会让 CI 立刻失败**，push 前务必跑过 typecheck + guards |
| Git 钩子 | `core.hooksPath=.githooks`。`pre-commit` 跑 `npm run precommit`（typecheck + eslint，失败即阻断，**不要 `--no-verify`**）；`post-commit` 把提交标题追加进 `CHANGELOG.md` + `public/CHANGELOG.md` 并 `git add` |
| 已知钩子缺陷 | ①`TODAY_HEADER` 写成 `### 日期` 但写入的是 `## 日期` → grep 永不命中，**每次提交都插新日期标题**，CHANGELOG 有重复日期块 ②按日期插入时带固定空行，文件头已累积约 10 行空行 |
| 稳态现象 | 工作树长期保留 **1 条已暂存的 CHANGELOG 行**（提交 N 的日志落入提交 N+1），这是预期，不要"清理干净" |
| 版本线 | APK **2.x**（当前 2.0.20 / versionCode 65）。`android/version.properties` 的 `versionCode` 每次打包必须递增 |

### 2.1 APK / 桌面产物约定

- `release/NativeThink-mobile-debug.apk` = **当前版本线**，`npm run package:apk` 每次覆盖（期望行为，别手动备份）。
- `release/NativeThink-mobile-debug-1.x.apk` = 冻结的旧线（v43/1.43.0），**永不覆盖**。切大版本时把当时的规范名改名为 `-<旧major>.x.apk`。
- 核验内嵌身份**不能看文件名**，用 aapt：
  `"$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\aapt.exe" dump badging <apk> | Select-String "^package:"`
- `release/CetThink-mobile.apk`（227.8MB）是**正式发布产物**（另仓 CetThink 的安装包，含离线朗读模型），合法，别删；但它**绝不能进 `public/`**。
- **禁止往 `public/` 放 APK 或大二进制**：Vite 会把 `public/` 原样拷进 `dist/client`，导致 web / 主 APK / 桌面三份产物各白背体积（历史事故：227.5MB 的 CetThink apk 回流进 public，主 APK 里又套一个 APK）。

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
- `components/DailyLearningMode.tsx` —— 每日学习（SM-2 主推路径）。
- `components/FlashcardMode.tsx`（约 1100 行）—— **复习检测**：五档评分、冻结本轮顺序、答错即时重排、屏蔽/恢复、未来 7 天预测、本周报告、连击、助记、生词本、断点续学、自动朗读（默认开）、卡片背面"单词+例句"连读。
- `components/QuickCardMode.tsx`（约 1400 行）—— **快速闪卡**：点卡片翻面、上一个单词（常驻顶部可点开详情）、收藏（各处 ★）、完成页词表、学习记录留档 + 当前累积 + 重练、重刷算法、断点续学、"全部"档位。
- `components/CollocationsTab.tsx` / `VocabTestTab.tsx`。

---

## 4. 常用命令

```powershell
# 开发 / 构建
npm run dev                 # Web 开发服务器
npm run typecheck           # tsc -p tsconfig.app.json（提交前必跑）
npm run lint:eslint         # eslint src
npm run build:web           # 生产构建 → dist/client（同时生成 404.html）
npm run preview             # 本地预览构建产物（:4173）

# 验证（本项目没有测试框架，这些就是回归防线）
node scripts/verify-wordbank-loading.mjs     # 词库加载层集成验证（14 项）
node scripts/verify-wordbank-split.mjs --baseline <out.json>   # 数据层拆分校验（先采基线）
node scripts/verify-wordbank-split.mjs --check <in.json>
npm run verify:books-meta        # 书目/SCP 元数据 + 复习词高亮 + 乱码（202 断言）
npm run verify:vocab-cards       # 背单词卡片交互契约（223 断言）
npm run verify:tts-progress      # 朗读切片/进度（6175 断言）
node scripts/verify-tts-hardening.mjs        # TTS 降级/预合成守卫（10 项）
npm run check:tts-voices         # 音色与模型资产一致性（package:apk 前置）

# 语料
node scripts/fetch-scp.cjs               # 重抓 SCP 文章（约 1 req/s，产物勿手改）
node scripts/clean-wordbank-mojibake.mjs # 清 U+FFFD 乱码（幂等）

# 品牌视觉资产（APK 图标 + 启动图 + favicon + icon.ico）
pwsh -File scripts/gen-app-brand.ps1 -Preview docs/brand-assets-preview.png

# 打包（版本号必须先递增！）
npm run version:apk-bump    # 只 +patch，如 2.0.20 → 2.0.21
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
| 契约 | 6 个 `scripts/verify-*.mjs` | 词库加载/拆分、书目元数据、背单词卡片、TTS 切片与进度、TTS 降级 |
| 真机 | adb + CDP（见第 7 节） | 只能在设备上发现的：safe-area、原生 TTS、手势、持久化 |

**写守卫脚本的经验（血泪）**：
1. **断言要重新推导，不能照抄**。改语义时必须连断言一起改 —— 历史上 `viewingPast = rated && isFlipped` 这个**错误定义被断言一起锁死**，导致"评分后自动跳转"永远不触发却一直是绿的。
2. 断言里加**脚手架自检**（例如"解析到的条目数必须等于源文件条目数"），否则正则会静默漏项（曾漏掉含撇号的书名）。
3. 数据文件混用单/双引号，正则要写 `(?:[^"\\]|\\.)*`；解析 TS 数据优先用 `ts.transpileModule` 而不是正则。
4. 断言数会随功能增长（`verify-vocab-cards` 从 135 → 223），**只增不减**，除非删功能。

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
  `_learning_stats` / `_calendar` / `_word_learning` / `_vocab_session_<level>` / `_daily_quota` /
  `_quickcard_runs` / `_quickcard_pending` / `_quickcard_session` / `_custom_words` / `_word_notes` /
  `_favorites` / `_tts_settings` / `_sherpa_off` / `_spelling_progress` / `_achievements` / `_theme`。

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
- 未明确要求**不要 push**（本地长期领先 origin 是常态）。

---

## 7. 真机调试通道（已验证可复用）

设备：Redmi 25053RT47C / HyperOS / Android 16（SDK 36），CSS 视口 393×851，dpr 3.256，safe-area 顶 **47px** / 底 **16px**。

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l                     # 若同一台机器出现两条（IP:port + mDNS），先 disconnect 掉重复那条
& $adb shell pidof com.nativethink.app
& $adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
Invoke-RestMethod http://127.0.0.1:9222/json      # 拿 webSocketDebuggerUrl
```

**关键限制与对策**
1. **HyperOS 禁止 `adb shell input`**（`SecurityException: INJECT_EVENTS`）—— tap/keyevent 全不可用。改用 **CDP** 驱动 WebView：
   - `Runtime.evaluate` 执行 `el.click()` 驱动 React（合成 click 可用；**合成 TouchEvent 不可靠**，滑动验证请用真手指）。
   - 键盘交互可用 `window.dispatchEvent(new KeyboardEvent('keydown', {...}))`，但注意**在 window 上派发的事件不会传播到 document**（Radix 的 Esc 处理挂在 document 上，所以这样测"Esc 关弹窗"会假失败）。
2. 坐标：CDP 是 CSS px，`adb exec-out screencap` 是物理 px（物理 = CSS × dpr）。
3. `Page.reload` / force-stop 后 pid 会变，需重建 forward。
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

---

## 9. 当前进度与未完成事项

### 已完成（近三周）
- **阅读器 + 朗读**：22 本书离线可用、三级 TTS 降级、切片进度上报、"读到哪"高亮、段落/整篇朗读、复习词彩色高亮（6 色可选）。
- **词汇深度**：SM-2 五档复习、快速闪卡（本轮大改）、每日学习、词库浏览、搭配学习、词汇量测试。
- **快速闪卡（最新一轮，APK 2.0.20）**：点卡片翻面 + 例句、上一个单词（顶部常驻可点开词条详情）、各处单词收藏（与收藏页同源）、完成页词表、学习记录留档 + 当前累积 + 重练、按选择数量切分留档、相同词表去重、答错隔 4 张重刷（最多 2 次）、断点续学（切 tab / 杀 App 都恢复）、"全部"档位。
- **系统层**：Android 15+ edge-to-edge 适配（`viewport-fit=cover` + safe-area 工具类）、词库 5,909 处 U+FFFD 乱码清理、emoji → lucide 图标。

### 未完成 / 已知短板
1. **每日学习（DailyLearningMode）没有断点续学** —— 切 tab 会丢当前位置（复习检测与快速闪卡都有）。
2. **学习提醒**（Capacitor 本地通知）刻意推迟未做。
3. **词库真人发音包**：单词集合有限，可预录（ROADMAP 第 3 项）。
4. 句子语料/语法/导入书离线翻译仍有待回填项（见 ROADMAP）。
5. 本地 main 领先 origin 13 个提交且工作树有一批未提交改动 —— **接手第一件事：确认这些改动是否已随 APK 验证并需要提交**。
6. `.githooks/post-commit` 的两个缺陷未修（日期标题 `###`/`##` 不一致、空行累积）。

### 下一步建议顺序
1. 提交并推送现有改动（先跑全量验证，push 会触发 Cloudflare CI）。
2. 给每日学习补断点续学（照抄 `quickcard-history.ts` 的三段式 + `FlashcardMode` 的 `saveSession`）。
3. 全局"学习提醒"。
4. 词库真人发音包。

---

## 10. 交接检查清单

**开工前**
- [ ] `git log --oneline -5` + `git status` 看清未提交改动（它们可能已装在设备上）
- [ ] `npm run typecheck && npm run lint:eslint` 确认基线是绿的
- [ ] 读本文件第 6、8 节（约定 + 坑表）再动代码

**改完代码**
- [ ] `npm run typecheck`、`npm run lint:eslint`、`npm run build:web`
- [ ] 跑与改动相关的 `scripts/verify-*.mjs`；语义变了要**重新推导**断言
- [ ] 真机装机验证（涉及 safe-area / 原生 TTS / 手势 / 持久化的改动**必须**真机验）

**交付前**
- [ ] `npm run version:apk-bump` 后再 `package:apk`（versionCode 必须递增）
- [ ] `aapt dump badging` 核验内嵌版本
- [ ] 确认没有大文件进 `public/`
- [ ] 回复里给：结论 + 关键数字 + 文件路径 + 下一步需要用户做什么

**禁止事项**
- ❌ 往 `public/` 放大文件（APK/模型） ❌ 用 `--no-verify` 绕过钩子
- ❌ 直接改 `src/data/wordbank/data/*.ts`（跑 `npm run wordbank:split` 恢复拆分）
- ❌ 直接改 `src/data/scp.ts` / `books.ts`（生成物；改生成器 + 跑守卫）
- ❌ 在页面里直接调 `speechSynthesis`（走 `use-tts.ts`）
- ❌ 用 `toISOString().slice(0,10)` 取日期
