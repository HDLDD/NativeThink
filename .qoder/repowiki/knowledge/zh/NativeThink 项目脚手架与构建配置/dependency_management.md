## 1. 使用的系统与工具
- **包管理器**: npm（通过 `package-lock.json` 锁定版本，非 pnpm/yarn）。
- **前端构建**: Vite 8（`vite.config.ts`），由根 `scripts/build.sh` 和 `scripts/dev.mjs` 编排。
- **多端打包**: Capacitor 8（`@capacitor/core`、`@capacitor/android`、`@capacitor/cli`）生成 Android APK；Electron 41 作为桌面端入口（`main` 指向 `electron/main.mjs`）。
- **私有/替代注册表**: `.npmrc` 将默认 registry 指向国内镜像 `https://registry.npmmirror.com/`。
- **无 vendoring**：第三方源码未被提交到仓库（`node_modules/` 在 gitignore 中），仅保留 `package-lock.json`。Android 侧的 Gradle wrapper (`android/gradle/wrapper`) 属于独立依赖系统，不在本卡范围。

## 2. 关键文件
- `package.json` — 声明运行时依赖（`dependencies`）、开发依赖（`devDependencies`）与脚本命令。
- `package-lock.json` — npm 生成的完整依赖树锁定文件。
- `.npmrc` — 指定 npm 镜像源。
- `scripts/build.sh` / `scripts/dev.mjs` / `scripts/pack-app.mjs` / `scripts/ensure-web-build.mjs` 等 — 封装构建、打包、校验流程。
- `android/build.gradle` / `android/app/build.gradle` / `android/settings.gradle` / `android/variables.gradle` — Android/Gradle 侧依赖声明（Capacitor、Cordova 插件等）。
- `wrangler.toml` — Cloudflare Pages 部署配置（服务端函数/边缘函数的依赖由各自目录管理，未在根 `package.json` 声明）。

## 3. 架构与约定
- **单仓多产物**: 同一 `package.json` 同时服务 Web、Android APK、Electron 桌面三个产物，通过不同 npm scripts 分支（`build:web`、`package:apk`、`package:desktop`、`package:all`）区分。
- **版本策略**: 运行时依赖普遍使用 `^` 语义化版本前缀（如 `"react": "^19.2.4"`、`"vite": "^8"`），允许 npm 解析次级兼容版本；开发依赖也采用类似策略（如 `"typescript": "~5.9"`、`"eslint": "^9"`）。
- **UI 组件来源**: 大量 Radix UI 原子组件直接以 `@radix-ui/react-*` 子包引入（accordion、dialog、dropdown-menu、tabs、tooltip 等），而非通过 shadcn/ui CLI 拷贝；同时搭配 Tailwind CSS v4、class-variance-authority、clsx、tailwind-merge 等组合。
- **AI/本地推理依赖**: 使用 `@huggingface/transformers`、`onnxruntime-node`、`jose`、`msedge-tts` 等实现本地 TTS、ONNX 推理、JWT 处理等能力。
- **脚本驱动的版本/发布流程**: `bump-android-version.cjs` 单独维护 Android 版本号，`verify-*-*.mjs` 系列脚本用于各功能域的回归验证，`verify-all.mjs` 聚合运行。

## 4. 约定与约束
- **注册表**: 所有 npm 安装均走 `https://registry.npmmirror.com/`（`.npmrc` 强制设置），未配置 `authToken`、`strict-ssl` 覆盖或私有 scope 注册表。
- **锁定**: 必须提交并同步 `package-lock.json`，以保证依赖树可重现；仓库内未发现 `package-lock.json` 之外的其他锁文件。
- **无 vendored 源码**: 第三方库以 npm 包形式拉取，`node_modules/` 不被纳入版本控制。
- **Android 依赖隔离**: Android 相关依赖（Capacitor、Cordova、Gradle）由 `android/` 下的 Gradle 文件管理，不混入根 `package.json` 的 `dependencies`。
- **预提交钩子**: `prepare` 脚本执行 `node scripts/setup-git-hooks.mjs` 安装 Git hooks；`precommit` 钩子触发 `npm run lint`（包含 `tsc -p tsconfig.app.json` 与 `eslint src`），因此新增依赖后需确保类型检查与 lint 通过。
- **无显式安全审计脚本**: 未发现 `npm audit`、`npm audit fix` 或 CI 中的安全扫描步骤被写入 `package.json` scripts。
- **Cloudflare Functions**: `functions/` 目录下的 Node.js 函数未在本仓库提供独立的 `package.json`，其依赖管理方式与本仓主应用分离，不应假定共享 `package-lock.json`。