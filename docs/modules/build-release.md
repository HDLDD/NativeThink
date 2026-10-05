# 构建与发布

> 三条产物线共用一份 `dist/client`。核心事实：**push 到 `main` 就是改线上**（Cloudflare Pages 自己的 Git 集成构建），仓库里没有部署 workflow（`.github` 目录不存在）。

## 1. 脚本地图（`package.json:9-36`）

| 命令 | 实际串了什么 |
|------|-------------|
| `dev` | `node scripts/dev.mjs`（端口 8001，`dev.mjs:18`；用 `lsof` 清孤儿进程 `:37-54`，**Windows 上是否生效未证实**） |
| `build` | `bash scripts/build.sh`（miaoda 分包；`CF_PAGES=1` 时 `:32-36` 提前退出） |
| `build:web` | `vite build --outDir dist/client --emptyOutDir` + **把 `index.html` 复制成 `404.html`**（Pages 的 SPA 兜底副本） |
| `package:web` | `version:apk-bump` → `fetch-android-tts.cjs` → `build:web` |
| `package:apk` | `version:apk-bump` → **`ensure-web-build.mjs`（缺则自动补跑 `build:web`）** → `check:tts-voices` → `capacitor copy android` → `android-copy-models.cjs` → `cd android && gradlew.bat assembleDebug` → 复制到 `release/NativeThink-mobile-debug.apk` |
| `android:apk` | `package:web` + `package:apk`（**于是 bump 两次**） |
| `package:desktop` | `pack-app.mjs --skip-web`（复用已有 `dist`，`pack-app.mjs:68-73`） |
| `package:all` | `package:web` 之后 **concurrently 并行** `package:apk` + `package:desktop`（两者都 bump 版本、都写 `release/`） |

APK 依赖 `dist/client`（`capacitor.config.json:4`），所以顺序不能省。

**`scripts/ensure-web-build.mjs`（2026-09-30 加）堵的就是这条顺序**：`package:apk` **自己不构建 web**，`capacitor copy` 拷的是 `dist/client` 里现成的东西。当天改完语块接龙判定直接 `package:apk`，打出来的 78/2.0.33 里装的还是 16:05 那次 `build:web` 的产物 —— 修复根本没进包，而 `BUILD SUCCESSFUL`、versionCode、体积构成全都正常，**从打包日志上完全看不出来**。现在它是 `package:apk` / `package:desktop` 的前置，两个触发条件任一成立就自动补跑 `build:web`：① 有被跟踪的源码（`src`/`functions`/`electron`/`server`）比 `dist/client/index.html` 新；② `dist/client/index.html` 里 `<meta name="app-version">` 盖的版本与 `version.properties` 的 `versionName` 不一致 —— ②顺带治了**重复 bump 的连带后果**（`package:all`/`package:apk` 都 bump，包里的 Android 版本可以是 2.0.39 而 HTML 里盖的还是上一次构建的）。②的载体（2026-10-05 迁移）：原先扫入口 chunk 里的 `x.y.z` 裸字面量 —— 那些字面量是反馈上报的 appVersion 字段顺带带进包的，反馈下架后改为**构建期把版本盖进 HTML meta**（`vite.config.ts` 的 fixHtmlPlaceholders 替换 `{{appVersion}}`）；判据从"猜包里有没有字面量"变成"读一处我们自己的标记"，meta 缺失或占位符没替换都算需要重建，重建后仍缺会拦下打包。链路由 `node scripts/verify-app-version.mjs`（11 断言）钉住。**①的新鲜度白名单已于 2026-10-05 扩到 `index.html` / `vite.config.ts` / `public`**（`scripts/ensure-web-build.mjs:25`）—— 此前只盯 `src`/`functions`/`electron`/`server` 四个目录，改了 HTML 模板或 vite 配置会被判"产物不旧"，照样打出上一次的包。同批把 `vite.config.ts` 的版本兜底改成**抛错**（`:101-105`）：读不到 `version.properties` 的 `versionName` 就直接拒绝构建，不再退回 `package.json` 的 `1.0.0` —— 那种包 `ensure-web-build` 与 aapt 都看不出异常（版本号看着"正常"）。**代价：纯 web 构建也依赖 `android/version.properties`**，删掉它会让 `build:web` 失败。

**打完包要自己复核**（本轮实际用的三条）：`aapt dump badging release/NativeThink-mobile-debug.apk | head -1` 看内嵌版本；拿 `dist/client/index.html` 引用的入口 chunk 名去 `unzip -p` 包里比对 —— **chunk 名是内容哈希，对得上才证明包里就是这份产物**；再在页面 chunk 里 grep 本次改动的标志性字符串（新串要在、旧串该是 0）。

桌面版生产依赖只有 `jose` / `undici` / `msedge-tts`（`pack-app.mjs:100`），其余靠硬链接拷 Electron 运行时 + `dist/server/functions/electron`。

## 2. 版本号与产物命名

`android/version.properties` 当前 `versionCode=89` / `versionName=2.0.44`（2026-10-05 文件实况；每次打包自动递增）。`scripts/bump-android-version.cjs:19,24,26`：**两个字段都改** —— code +1，name 只递增 patch（沿用文件里写的 `major.minor`；文件缺省时 code 1→2、name 2.0.0→2.0.1）。

`versionCode` 必须每次递增：Android 拒绝非递增的升级安装，会要求先卸载 → **丢本地数据**。

产物命名（`release/` 已被 gitignore）：

- `release/NativeThink-mobile-debug.apk` = **当前版本线**，`package:apk` 每次覆盖它（这正是期望行为）。
- `release/NativeThink-mobile-debug-<major>.x.apk` = **已冻结的旧版本线**，永不覆盖（现有 `-1.x.apk`）。
- 切新大版本时：把当时的规范名改名冻结，新线继续占用规范名。
- 改完必须用 `aapt dump badging` 核验内嵌 `versionCode/versionName`。**注意：仓库里没有任何脚本执行 aapt**，只有文档要求 —— 这一步完全靠人。

`release/` 现状里还有 `CetThink-mobile.apk`、`NativeThink-mobile-debug - 副本.apk`、`cet-legacy/`，都不在命名规范内。

## 3. Chunk 与首屏

`vite.config.ts:199-236` 现存 `manualChunks` 规则：react / router / radix / icons / date-fns / zod；`:238-246` 九个 `wordbank-*` 数据 chunk。**recharts、react-markdown、framer-motion 的强制规则被有意删除**（`:214-227` 附实测数字）—— 给只有懒加载页面用的库写强制分块，会让它变成**入口 chunk 的静态依赖**，方向正好相反。

`verify-bundle-budget.mjs`：从 `dist/client/index.html` 的 modulepreload + 入口 chunk 的**静态** import 递归 BFS 出「首屏必需集合」（`:52-63`），断言集合里没有 recharts/markdown/词库数据 chunk，且 gzip 总量 ≤ `BUDGET = 600`（`:79`）。当前实测 **195.9KB / 10 项全绿**（2026-10-05，反馈功能下架后）。没有 `dist` 直接 `exit 1`（`:31-34`）；含正对照（`:83-87`）和「禁止静态 import 平台 SDK」的 `git grep`（`:96-107`）。

## 4. Cloudflare Pages 侧

| 文件 | 作用 |
|------|------|
| `functions/api/**` | 文件式路由：`ai/{chat,passage,transcribe}`、`auth/{login,me,register}`、`data/sync`、`tts`、`word-image`、`gutenberg`、`wikipedia`、`bilibili-*`（`api/debug/` 是空目录） |
| `functions/_lib/{auth,cors,crypto,jwt,kv,types}` | 共享代码 |
| `public/_redirects` | `/api/* /api/* 200` → `/models/* /models/* 404` → `/* /index.html 200`（顺序有意义） |
| `public/_headers` | COOP `same-origin` + COEP `credentialless`（多线程 WASM 必需） |
| `public/fonts/*.woff2` | 品牌字体自托管（Plus Jakarta Sans latin 子集 400/600/700 + OFL LICENSE.txt；**零外链**，`verify-brand-fonts` 守） |
| `public/favicon.svg` | Web 图标（`gen-app-brand.ps1` 生成；本地引用、**零外链** —— 2026-10-05 清掉模板遗留的字节 CDN shortcut icon，同守卫） |
| `dist/client/404.html` | `build:web` 复制出来的 SPA 兜底副本 |
| `wrangler.toml` | `pages_build_output_dir = "dist/client"`、KV binding `KV` + 真实 namespace id |

**没有 `web.config`**，`_redirects` 是唯一 rewrite 来源。

## 5. 注意事项

1. **`package:web` 会递增安卓 `versionCode` 并下载安卓 TTS 大二进制**。产 web 产物却动了安卓版本号 —— 每次跑 `package:web` 都白白 +1，把 versionCode 空间消耗掉；而 `android:apk` / `package:all` 会 **bump 两次**。要产纯 web 包，直接跑 `npm run build:web`，别用 `package:web`。
2. **缺资产大多是静默出残包，不是报错**：
   - `models-bundled/` 不存在 → `android-copy-models.cjs:14-17` 打印「跳过（APK 将不含离线模型）」并 **`exit 0`**；`pack-app.mjs:94-97` 同样跳过。
   - `scripts/.apikey` 不存在 → `vite.config.ts:33-35` `catch` 后**空串**，出厂 AI Key 消失。
   - TTS 资产单文件下载失败 → 只 `console.error`（`fetch-android-tts.cjs:247`），末尾校验只打印 ✓/✗（`:261-264`）**不 `exit 1`** → `package:web` 不会拦。
   - `public/fonts/` 的 woff2 缺失 → 页面**静默回落系统字**（构建不报错）；`verify-brand-fonts` 会在任何一次全量跑里拦下。
   - **只有 `package:apk` 里的 `check:tts-voices` 会真的阻断**（`check-tts-voices.cjs:248-252`）。
   打完包要自己核验产物：APK 里 `/models/` 与 `assets/tts/` 是否真在、网页版出厂 Key 是否生效。
3. **`fetch-android-tts.cjs` 幂等靠 size 比对**（`:164/:198/:234`），`--force` 才重取。**Kokoro 必须在 Piper 完整早退之前拉取**（`:212-213` 注释），否则 Piper 齐了就直接 return，Kokoro 永远不下。
4. **必须存在但被 gitignore 的目录**：`release/`、`models-bundled/`（tracked 文件数 **0**）、`scripts/.apikey`、`android/app/libs/*.aar`、`assets/piper|tts/`、`android/keystore.properties`、`dist/`、`.local-data/`。**新机器 clone 下来是打不出完整包的** —— 先跑 `fetch-android-tts`、准备 `models-bundled/`、放好 `.apikey`。
   `public/books/`（23 个 txt）**是 tracked** 的，不要按"public 不放大数据"的直觉删掉它（理由见 `docs/modules/reading.md` 第 1 条）。
5. **push 即上线**：Cloudflare Pages 的 Git 集成从 `main` 构建。所以提交前清单不是形式 —— 至少 `npm run typecheck` + 相关 `verify-*.mjs`。**不要新增部署 workflow**（2026-09-28 已删掉两条长期失败的冗余 Actions，它们和 Pages 自己的集成重复）。
6. **`android-copy-models` 依赖 `cap copy` 先跑**（`:18-21` 检查 assets 目录，不存在就跳过并 `exit 0`）—— 顺序错了会得到"打成功但没有模型"的 APK。
7. **`dev.mjs` 只在 8001 端口清孤儿进程这件事在 Windows 上未证实**；本机开发另有双栈绑定的坑（dev server 必须绑 `::`，且 `curl` 不读 Clash 代理），见记忆「本机网络排查」。
8. **桌面版靠 `electron/main.mjs:107-113` 在 `app.whenReady()` 起本地 Node 服务**再 `loadURL`（`:85`），`server/local-server.mjs:99-111` 把 `/api/*` 映射到 `functions/*.js` 在 Node 里执行 —— 所以**函数代码是三形态共用的**，改 `functions/` 要同时想网页、APK、桌面三条路。
9. **桌面本地 server 的三条收紧（2026-10-05 体检）**：① `ROUTES` 补上 `gutenberg` 与 `bilibili-info/subtitle/transcribe` 四条（`server/local-server.mjs:110-113`）—— 此前桌面端"导入书取全文"和 B 站三个端点在本地压根没有路由，**404 被静默吞掉**，表现为"导入的书只有摘要、点全文没反应"；② 撤掉全量 `Access-Control-Allow-Origin: *`（本地 UI 与 API 同源，本来不需要；见 TTS wav 响应 `:547`、B 站配置 `:579`）；③ B 站配置 GET **不再明文回吐 `sessdata`**，只回 `hasSessdata` 布尔（`:576-580`）—— 改之前任何能连上该端口的页面/进程都能读到你的 SESSDATA。同批把脚本里的硬编码出厂 Key 改读 gitignored `scripts/.apikey`（`scripts/test-one-material.cjs:8-9`）；**旧 Key 自 `750a7c3` 初始提交起就在 git 历史里可读**，仓库侧无法抹掉 —— 要去模型平台作废并轮换，这一步只能人工做。
