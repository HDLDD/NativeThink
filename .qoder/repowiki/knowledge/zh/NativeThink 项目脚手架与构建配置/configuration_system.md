## 1. 采用的方式

项目没有引入外部配置库，而是通过 **Vite `define`/`base`** 在构建期把环境变量与文件内容编译进客户端代码；运行时再结合 Capacitor/Electron UA 进行平台探测。密钥类配置（API Key）采用“构建时注入 + 用户覆盖”的两层机制，持久化偏好走 `localStorage`。

## 2. 关键文件

- `vite.config.ts` — 构建期配置入口：读取 `scripts/.apikey`、`android/version.properties`，通过 `define` 注入 `__FACTORY_API_KEY__`、`process.env.CLIENT_BASE_PATH`，并替换 `index.html` 中的 `{{appName}}`/`{{appVersion}}` 等占位符。
- `src/lib/app-env.ts` — 单一运行环境标识来源，导出 `platformTag()`，返回 `'android' | 'ios' | 'desktop' | 'web'`。
- `src/services/ai-config.ts` — AI Provider 配置表与 API Key 存取逻辑（`getAPIKey` / `setAPIKey` / `getActiveProvider`），区分“出厂内置 Key”和“用户自配 Key”。
- `wrangler.toml` — Cloudflare Pages 部署配置（KV namespace binding）。
- `capacitor.config.json` — Capacitor 打包配置（appId、webDir、Android scheme）。
- `android/version.properties` — Android 版本号唯一源（`versionCode`/`versionName`），由 `scripts/bump-android-version.cjs` 每次构建自增 patch。
- `android/app/build.gradle` — 从 `version.properties` 读版本，并加载仓库外的 `android/keystore.properties` 作为发布签名凭据。

## 3. 架构与约定

### 3.1 构建期注入（compile-time）

- **出厂 API Key**：`vite.config.ts` 尝试 `fs.readFileSync('scripts/.apikey')`，不存在则用空串；随后通过 `define: { __FACTORY_API_KEY__: ... }` 注入到客户端。`src/services/ai-config.ts` 通过 `declare const __FACTORY_API_KEY__` 消费，默认 provider 为 `glm`，且新增独立选项 `factory` 表示“出厂免费 Key”，与用户配置的 GLM 不冲突。
- **应用版本**：优先解析 `android/version.properties` 的 `versionName`；若失败直接 `throw Error('[version] 读不到 android/version.properties 的 versionName —— 版本链断裂，拒绝构建')`，保证 Web 产物与 APK 同口径。版本号被写入 `index.html` 的 `<meta name="app-version">`。
- **基础路径**：`base: process.env.CLIENT_BASE_PATH || '/'`，同时通过 `define` 暴露给浏览器侧 `process.env.CLIENT_BASE_PATH`。
- **HTML 模板替换**：`fixHtmlPlaceholders` 插件在 post 阶段替换 `{{appName}}`/`{{appDescription}}`/`{{appAvatar}}`/`{{appVersion}}`，并剥离平台专属埋点脚本。

### 3.2 运行时环境（runtime）

- **平台探测**：`platformTag()` 先查 `Capacitor.isNativePlatform()` → `Capacitor.getPlatform()`，再回退到 UA 匹配 `Electron|NativeThink/`，异常一律按 `web` 处理。
- **AI 配置持久化**：每个 provider 的 Key 存于 `localStorage` 键 `ai_key_<provider>`，当前活跃 provider 存于 `ai_active_provider`；修改后通过 `window.dispatchEvent(new Event('nativethink-ai-config-changed'))` 通知 UI 刷新。
- **默认值**：未设置时 active provider 默认回落到 `'factory'`（而非旧的 `'glm'`），对老用户做了迁移：`stored === 'glm' && !localStorage.getItem('ai_key_glm')` 时归入出厂选项。

### 3.3 平台专用配置

- **Cloudflare Pages**：`wrangler.toml` 声明 KV namespace binding（auth/sync/passage 存储）。
- **Android/Capacitor**：`capacitor.config.json` 指定 `appId=com.nativethink.app`、`webDir=dist/client`、`android.server.androidScheme=https`；`build.gradle` 根据 `NT_EMU` 环境变量切换 ABI filters（arm64/armeabi-v7a vs x86_64）。
- **Electron**：UA 中携带 `NativeThink/` 前缀用于识别桌面端。

### 3.4 版本管理流程

`scripts/bump-android-version.cjs` 在每次打 APK 前将 `versionCode`+1、`versionName.patch`+1，主/次版本号需手动编辑 `android/version.properties`；`vite.config.ts` 与 `android/app/build.gradle` 均从此文件读取，保证三方产物一致。

## 4. 约定与约束

- **出厂 API Key 必须放在 `scripts/.apikey`**：`vite.config.ts` 注释明确说明该文件位于 `.gitignore`，不在仓库中；缺失时构建允许继续但出厂免费选项不可用。（来源：`vite.config.ts` 第 30–35 行）
- **版本链断裂即阻断构建**：当 `android/version.properties` 不存在或无法解析 `versionName` 时，Vite 构建直接抛错退出。（来源：`vite.config.ts` 第 101–105 行）
- **Android 版本号递增是硬性要求**：`bump-android-version.cjs` 注释写明“Android 只接受 versionCode 递增的升级安装，否则要求先卸载→丢数据”，脚本每次自动 +1。（来源：`scripts/bump-android-version.cjs` 第 1–3 行）
- **Keystore 凭据不进仓库**：`android/app/build.gradle` 从仓库外的 `android/keystore.properties` 读取 `storeFile/storePassword/keyAlias/keyPassword`，仅当文件存在时才启用 signing config。（来源：`android/app/build.gradle` 第 39–56 行）
- **AI Key 命名空间**：`ai_key_<provider>` 格式为硬编码约定，新增 provider 时需遵循此命名模式。（来源：`src/services/ai-config.ts` 第 115、136 行）
- **active provider 校验**：`getActiveProvider` 仅在 stored 值属于 `ALL_PROVIDERS` 列表时才使用，防止脏数据导致未知 provider。（来源：`src/services/ai-config.ts` 第 160–168 行）
- **生产构建剥离第三方埋点**：`fixHtmlPlaceholders` 显式移除 Slardar、Tea、飞书 CDN 等平台专属 analytics 脚本，避免拖慢移动端加载。（来源：`vite.config.ts` 第 55–76 行）
