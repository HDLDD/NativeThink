## 1. 体系概览

NativeThink 前端采用 **Vite + React** 技术栈，样式系统基于 **Tailwind CSS v4**（`@tailwindcss/vite` 插件）+ **shadcn/ui**（`new-york` 风格），并通过 CSS 变量实现双维度主题：
- **明暗模式**（`light` / `dark`）——通过 `<html>` 的 `.dark` 类切换
- **UI 外观主题**（classic / porcelain / graphite / lime / sand / berry）——通过 `<html data-ui-theme>` 属性切换

项目使用 Tailwind 的 `@theme inline` 机制把 CSS 变量映射为 Tailwind 语义化颜色（如 `--color-primary: var(--primary)`），组件全部以 Tailwind utility 类名组合，无传统 BEM/SCSS 业务样式。

## 2. 关键文件

- `src/index.css` — 入口样式，导入 Tailwind、`tw-animate-css`、主题与排版，并集中定义全局动画（page-enter、card-enter、stream-in、caret-blink、ripple-pulse、page-turn-next/prev）、阅读器主题（`.reader-paper` / `.reader-night`）、滚动条、焦点环等
- `src/tailwind-theme.css` — 设计 token 中心，`:root` 与 `.dark` 下声明完整的设计变量（background/foreground/card/accent/sidebar/chart/shadow/font-* 等），并通过 `@theme inline` 暴露给 Tailwind
- `src/typography.css` — 自定义 `prose` utility，复用 shadcn 的 `@tailwindcss/typography` 插件，将 prose 配色绑定到 CSS 变量
- `components.json` — shadcn/ui 配置：style=`new-york`、tsx=true、cssVariables=true、aliases 指向 `@/components/ui`、图标库 lucide
- `src/lib/ui-theme.ts` — UI 外观主题状态机（`UiThemeId` 枚举、`UI_THEMES` 色板数组、`applyUiTheme`/`useUiTheme`）
- `src/lib/use-theme.ts` — 明暗模式 Hook（`Theme = 'light' | 'dark'`），写入 `<html class="dark">`
- `src/components/ui/*` — 由 shadcn 生成的原子组件（button、card、dialog、sidebar、table、tabs 等约 60 个），全部依赖 Tailwind 类名与 CSS 变量
- `vite.config.ts` — 注册 `@tailwindcss/vite` 插件

## 3. 架构与约定

### 3.1 设计 Token 分层
所有视觉值集中在 `src/tailwind-theme.css` 的 `:root` / `.dark` 中，包括：
- 基础语义色：`--background` / `--foreground` / `--card` / `--primary` / `--accent` / `--destructive` / `--success` / `--warning` / `--info`
- 品牌专用色：`--ink-violet` / `--ink-teal` / `--ink` / `--ink-2` / `--lime` / `--warm` / `--on-brand` / `--on-lime`
- 阴影族：`--shadow-xs` … `--shadow-2xl`
- 字体族：`--font-sans`（Noto Sans SC 优先，含 LarkEmojiFont/LarkChineseQuote）
- 圆角与间距：`--radius`、`--spacing`

这些变量通过 `@theme inline` 映射到 `--color-*`，供 Tailwind 直接使用。

### 3.2 明暗模式
由 `useTheme()` 管理：保存于 `safeStorage`（兼容 Capacitor scoped storage），切换时在 `<html>` 上添加/移除 `.dark` 类。`.dark` 块内重新声明所有 CSS 变量，形成完整的暗色变体。

### 3.3 UI 外观主题
由 `ui-theme.ts` 管理，与明暗模式正交。`data-ui-theme` 属性选择器在 `tailwind-theme.css` 中覆盖对应变量。默认 `classic`（墨绿外壳·青绿行动），其余五套只改 token 不改布局。

### 3.4 动画系统
`index.css` 集中维护三类动画：
- 页面/卡片入场：`.page-enter`、`.stagger > *`（延迟递增 35ms）
- 交互反馈：`.spelling-caret`、`.ripple-ring`
- 阅读器翻页：`.page-turn-next` / `.page-turn-prev`
- AI 流式文本：`.stream-in` + `.stream-caret`
缓动统一引用 `var(--fx-ease)`，时长字面量仅出现在 `:root` 那一行（见注释约束）。

### 3.5 可访问性
- 全站点 `::selection` 使用品牌色 `#00B894`
- `:focus-visible` 统一 2px `#00B894` 描边
- `prefers-reduced-motion: reduce` 媒体查询禁用所有动画与过渡
- 滚动行为 smooth 但可在无障碍模式下回退

### 3.6 阅读器主题
`reader-paper` / `reader-night` 两套独立 CSS 变量，模拟微信读书的纸张/夜间模式，配套 `.reader-slider` 进度条样式。

## 4. 约定与约束

- **样式方法论**：全站使用 Tailwind utility 类名；无业务级 BEM 类名，无 SCSS 嵌套。
- **Token 来源单一**：所有颜色、阴影、字体、圆角必须从 `src/tailwind-theme.css` 的 CSS 变量读取，禁止在组件中硬编码十六进制色值（除特殊强调场景如 `::selection`）。
- **shadcn/ui 组件不可直接改写**：新增或修改应通过 `npx shadcn add/update`，保持 `src/components/ui/` 下的生成代码与 `components.json` 同步。
- **动画缓动统一**：所有动画的缓动曲线引用 `var(--fx-ease)`，时长字面量仅在 `:root` 处声明（见 `index.css` 注释中的守卫约定）。
- **无障碍强制**：所有动画需同时提供 `prefers-reduced-motion: reduce` 分支，禁用动画或降至 0.01ms（已在 `index.css` 中统一处理）。
- **明暗模式切换入口**：通过 `useTheme()` 的 `toggleTheme` 操作 `<html>.dark` 类，禁止直接在 DOM 上写 class。
- **UI 主题切换入口**：通过 `useUiTheme()` 设置 `data-ui-theme` 属性，`classic` 等价于删除该属性。
- **Typography 内容**：Markdown 渲染区域使用 `prose` utility，其配色已绑定到 CSS 变量，无需额外定制。
- **图标库**：统一使用 Lucide（由 `components.json` 的 `iconLibrary` 指定）。