# NativeThink 构建与发布系统

## 1. 总体架构

项目采用 **Vite** 作为 Web 构建工具，通过 **Capacitor** 桥接 Android APK，通过 **Electron** 打包桌面端，最终由 **Cloudflare Pages** 托管静态站点。所有产物统一输出到 `dist/client/`，再由外部脚本分发到不同渠道。

- Web / Cloudflare Pages：`vite build --outDir dist/client`
- Android APK：`capacitor copy android` → Gradle `assembleDebug`
- Electron 桌面：`scripts/pack-app.mjs` 组装 `release/NativeThink-win32-x64/`
- Miaoda 平台模式：`scripts/build.sh` 拆分 HTML、资源、静态文件到 `dist/output*`

## 2. 关键配置文件

| 文件 | 作用 |
|---|---|
| `package.json` | npm scripts 入口，定义 dev/build/package:* 等全部命令 |
| `vite.config.ts` | Vite 配置：Tailwind、别名、代理、版本注入、HTML 占位符替换、WASM COOP/COEP 头 |
| `wrangler.toml` | Cloudflare Pages 配置（KV namespace、`pages_build_output_dir = dist/client`） |
| `capacitor.config.json` | Capacitor 配置（appId=com.nativethink.app，webDir=dist/client） |
| `android/app/build.gradle` | Android Gradle 工程，ABI 过滤、签名、依赖 |
| `android/version.properties` | 唯一版本源（versionCode / versionName），被 Vite 和 Gradle 共同读取 |
| `scripts/build.sh` | 主构建脚本：Vite 构建 + Miaoda 产物拆分 |
| `scripts/pack-app.mjs` | Electron 桌面包组装脚本 |

## 3. 版本管理策略

版本信息集中在 `android/version.properties`（当前 `versionCode=147, versionName=2.0.102`）。

- `npm run version:apk-bump`（`scripts/bump-android-version.cjs`）递增 versionCode 并写入该文件。
- `vite.config.ts` 在构建时读取 `android/version.properties`，若读不到直接抛错拒绝构建（"版本链断裂"保护）；同时把 `appVersion` 注入 `index.html` 的 `<meta name="app-version">`。
- `ensure-web-build.mjs` 用这个 meta 校验 web 产物与 aapt 解析出的版本号是否一致，防止下架后产物错位。

## 4. 构建流程

### 4.1 Web 构建 (`scripts/build.sh`)

```bash
# 设置环境变量（Miaoda AppID → CLIENT_BASE_PATH=/app/<appId>）
npx vite build --outDir dist/client --emptyOutDir
# SPA 路由：复制 index.html 为 404.html
if CF_PAGES=1; then exit 0; fi  # Cloudflare Pages 模式直接结束
# Miaoda 模式：拆分为 dist/output / output_resource / output_static / output_capabilities
```

`CF_PAGES=1` 是切换 Cloudflare Pages 与 Miaoda 两种部署模式的开关。

### 4.2 Android APK (`npm run package:apk`)

```bash
npm run version:apk-bump                          # 自增版本
node scripts/fetch-android-tts.cjs               # 拉入 sherpa-onnx AAR 到 libs/
npm run build:web                                # 先产出 dist/client
node node_modules/@capacitor/cli/bin/capacitor copy android
node scripts/android-copy-models.cjs             # 拷 models-bundled 进 Android assets
cd android && gradlew assembleDebug              # 编译 APK
cp release/NativeThink-mobile-debug.apk          # 复制到根目录
```

Gradle 根据 `NT_EMU=1` 环境变量切换 ABI 过滤：模拟器只打 `x86_64`，真机只打 `arm64-v8a, armeabi-v7a`（避免 x86/x86_64 多出约 42MB 原生库）。

### 4.3 Electron 桌面 (`npm run app:build`)

`scripts/pack-app.mjs` 执行 6 步：跳过可选的 web 构建 → 准备输出目录 → 拷贝 Electron 运行时（~200MB）→ 拷贝 app bundle（electron/server/functions/dist/client）→ 可选链接 models-bundled（~750MB）→ 仅拷贝生产依赖子树（jose、undici、msedge-tts 及其传递依赖）。使用 `scripts/lib/link-copy.cjs` 实现硬链接式复制以减少磁盘占用和耗时。

## 5. 环境与平台适配

- **工厂内置 API Key**：从 `scripts/.apikey`（gitignore 排除）读取，通过 Vite `define` 注入 `__FACTORY_API_KEY__`，供客户端初始化。
- **Virtual module mock**：`virtual:capabilities` 在 Cloudflare 环境下被替换为空对象，以兼容 Lark 平台的 virtual module。
- **HTML 占位符**：`fixHtmlPlaceholders` 插件将 `{{appName}}`、`{{appDescription}}`、`{{appAvatar}}`、`{{appVersion}}` 替换为实际值，并剥离只在 miaoda 平台使用的监控脚本（Slardar、Tea 等）。
- **开发代理**：`vite.config.ts` 将所有 `/api/*` 请求代理到 `https://nativethink.pages.dev`。
- **WASM 优化**：dev server 开启 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless`，允许多线程 WASM 运行。

## 6. 代码质量与验证

- `npm run typecheck`：`tsc -p tsconfig.app.json`
- `npm run lint`：并发执行 typecheck + eslint
- `precommit`：自动触发 `npm run lint`
- `npm run verify:all`：聚合数十个 `verify-*` 脚本，覆盖 tts、vocab、shadowing、cloud-sync、spelling 等功能正确性
- `npm run verify:bundle-budget`：检查构建产物大小预算

## 7. 约束与约定

- 版本必须来自 `android/version.properties`，否则构建失败（`vite.config.ts` 显式 throw）。
- Android keystore 凭据放在仓库外的 `android/keystore.properties`（已 gitignore），debug 与 release 共用同一签名以便原地覆盖安装不丢数据。
- Cloudflare Pages 部署要求 `CF_PAGES=1`，此时跳过 Miaoda 产物拆分逻辑。
- WebView 中禁止混合内容：`capacitor.config.json` 设置 `android.allowMixedContent = false`，且 `server.androidScheme = https`。
- Android NDK ABI 默认仅 arm64-v8a + armeabi-v7a；x86_64 仅在 `NT_EMU=1` 下启用。
- Vite dev watch 忽略 `android/**`、`release/**`、`dist/**`、`models-bundled/**`、`logs/**`、`*.apk`，防止 880MB 模型文件触发 EBUSY 导致 dev server 崩溃。
