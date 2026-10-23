# 应用外壳与导航

> `src/index.tsx` + `src/app.tsx` + `src/components/{Layout,AppSidebar,MobileBottomNav,Header}.tsx` + `src/lib/{app-env,use-page-memory}.ts`。
> 这一层决定"打开某个页面要下载什么"，所以它同时是性能问题的第一现场。

## 1. 启动顺序

`src/index.tsx`：

1. **模块顶层同步执行 `checkBundledEngineHealth()`**（`:15`），早于 `createRoot`（`:85`）—— 它读 `__nativethink_sherpa_try` 判断上次是否在加载离线引擎时崩溃（`sherpa-tts.ts:43-52`）。放这里是有意的：必须在任何 TTS 调用之前决定引擎可用性。
2. `createRoot(...).render(<StrictMode>…)`，`<BrowserRouter basename={process.env.CLIENT_BASE_PATH || "/"}>`（`:87`）。
3. Provider 次序：`Toaster → SafeShell → FocusMode → Auth → CloudSync → ErrorBoundary → App`。
4. **全站唯一的 `<Toaster />`** 挂在 `BrowserRouter` 内、`SafeShell` 外（`:93-98`）：`position="top-center"`、`visibleToasts={3}`、`offset.top='88px'`、`mobileOffset.top='calc(env(safe-area-inset-top) + 84px)'`。

`basename` 从哪来：`vite.config.ts:111` define 注入，`scripts/build.sh:16` **只在 miaoda 平台**（有 `MIAODA_APP_ID`）才设置 → Cloudflare Pages 与 APK 恒为 `/`。

`SafeShell`（`:44-83`）：用 `window.appId` 判定 miaoda（`isMiaodaPlatform` `:36-42`，还要求不是 `{{` 开头的未替换占位符），`@lark-apaas/client-toolkit-lite` 走**动态 import**（`:59-66`）。非平台 / 壳失败 / 壳未就绪三种情况都直接渲染 children（`:69-71`）。

## 2. 路由与错误边界

`src/app.tsx`：14 个页面 + `*` 兜底，全部 `lazy()`（`:6-20`），路由表 `:46-62`。

**每条 lazy 路由自己没有 Suspense**，只有一个 `ErrorBoundary`（`react-error-boundary` + `PageErrorFallback`，`:21-39`，带「刷新页面」按钮）。真正的懒加载兜底在 `Layout.tsx:121`：

```
<ErrorBoundary>                     ← Layout 自带的 class 版（:33-65）
  <Suspense fallback={<PageFallback />}>
    <div key={location.pathname} className="page-enter">   ← 换页即重挂载 + 入场动画
      <Outlet />
```

即 **ErrorBoundary 双层嵌套**，路由层那层先捕获。

⚠️ **路由级 boundary 的粒度是"整页"**（2026-10-17 真机教训）：页面里任何一处抛错 —— 包括共享组件的 **hook 前置条件没满足**（`useFramerMotion()` 曾要求祖先必须有 `<LazyFramerProvider>`，收藏页的「开始回顾」裸渲染 `FavoriteReviewMode` 就整页变「我的收藏页面出错」，而同一个组件在学习记录页一直正常）—— 用户看到的就是"这个页面坏了"。所以：① 共享组件的前置条件**不许做成致命错误**，缺了就降级 + 一次性 `console.warn`；② 守卫必须**逐个渲染宿主**检查（`verify-overlay-fit` ⑦；"任意一个宿主包了就算包住"是假绿形状）；③ 只包 JSX 才算数，光 import 不算。

## 3. 导航与预取

| 位置 | 内容 |
|------|------|
| `AppSidebar.tsx:33-47` | `ROUTE_PREFETCH`，13 条 |
| `AppSidebar.tsx:51-65` | `NAV_ITEMS`，14 条 |
| `AppSidebar.tsx:113-114` | 触发时机 = **`onMouseEnter` + `onTouchStart`**，不是 mount |
| `AppSidebar.tsx:113-114` | `/vocabulary` 额外 `preloadCoreOnly(['cet4'])` |
| `MobileBottomNav.tsx:14-22` | **自己复制的第二份 `ROUTE_PREFETCH`，只有 7 条**（AppSidebar 那份没 export） |
| `MobileBottomNav.tsx:25-30` | 移动端底栏只 6 项，`:49` 仅 `onTouchStart` |

桌面抽屉是 shadcn `Sidebar collapsible="icon"`（`AppSidebar:72`）；edge-to-edge 避让在最外层 `SidebarProvider className="safe-area-top safe-area-left safe-area-right"`（`Layout.tsx:113`，`targetSdk 36` 时 WebView 铺到系统栏下面，外壳必须自己补 safe-area；`env()` 在桌面浏览器恒为 0）。`focus` 模式隐藏侧栏 + 头 + 底栏（`:114/116/129`）。

**手机上的"侧栏"是整屏 modal 抽屉，导航后必须自己关**（`AppSidebar.tsx:67` 取 `setOpenMobile`、`:108` 挂在每个 `NavLink` 的 `onClick` 上）。2026-10-05 真机 CDP 实测：从抽屉点「句子拼写」，路由确实变成 `/spelling`，但 `[role="dialog"]` 仍是 `data-state=open`、宽 288/视口 393，屏幕中心 `elementFromPoint` 命中的是抽屉里的 `<a>`、右侧 368px 命中的是抽屉那层整屏 portal 容器 —— **新页面整个被吞掉点击**，用户必须再点一次遮罩。根因：`openMobile` 只在 `ui/sidebar.tsx:185` 的 `<Sheet onOpenChange>` 里被改过，导航本身没人关。桌面侧栏常驻所以完全无感 —— **静态检查看不见、只有真机看得见**的那类。为什么值得守：底栏只 6 项，13 个页面里另外 7 个只能从抽屉进，这条是手机主路径。守卫：`verify-overlay-fit` ⑥（逐个 `NavLink` 检查关闭接线，新增导航项漏挂即红）。

**但外壳那层内缩救不了 `fixed inset-0` 的全屏浮层** —— 它们脱离文档流、直接铺满视口，等于绕过了 `SidebarProvider` 的 padding。2026-09-30 真机反馈"AI 生成文章顶部被状态栏压住"就是这条：`PageReader.tsx:1210` 的阅读器根节点只有 `fixed inset-0 … flex flex-col`，在小米 onyx 上实测 `env(safe-area-inset-top)=47px`，顶栏（含「退出阅读」）整个藏进状态栏。修法是根节点自己补 `safe-area-top safe-area-bottom`（底部翻页条同理躲手势条）。**以后新增任何贴顶的全屏层都要自带内缩**，`verify-overlay-fit` ④ 会扫 `PageReader.tsx` 里所有 `fixed inset-0`（单/双引号都吃、先剥注释）并要求非居中的那些带 `safe-area-top`。验收用 CDP `Emulation.setSafeAreaInsetsOverride`（参数是 `insets: {top,bottom,left,right}` **对象**，写成数组会 Invalid parameters）把 inset 强制成 47/24，量顶栏 `top` 从 0 变 47。

## 4. 新增一个页面：实际是六处，不是四处

AGENTS.md 说的"四件套"确实都还在，但**还有两处隐性要求**，漏了不报错、只是显示退化：

| # | 位置 | 漏掉的后果 |
|---|------|-----------|
| 1 | `app.tsx:46-61` 路由 + `:6-20` lazy | 路由 404 |
| 2 | `AppSidebar.tsx:34` `ROUTE_PREFETCH` + `:51` `NAV_ITEMS` | 进不去 / 不预取 |
| 3 | `DashboardPage/constants.ts:112-123` `MODULES`（10 个 key，`as const`） | 首页进度环少一格 |
| 4 | `use-learning-stats.ts:16-29` 类型 + `:45-55` 默认值 | 写不进去 |
| 5 | **`use-learning-stats.ts:70-80` `MODULE_PROGRESS_KEYS` 白名单** | **`mergeStats`（`:84-90`）把它静默丢弃** —— 进度永远不显示 |
| 6 | **`ProgressPage/components/ProgressCharts.tsx:33-42` `MODULE_COLORS` + `:44-53` `MODULE_NAMES`** | 图例回落成 key 名、颜色回落灰 `#94A3B8` |

第 5 处用白名单投影而不是对象展开，是有意的：老用户 localStorage 里残留着已废弃的 `cet` 键，直接展开会让它继续出现在图表里，而 `MODULE_COLORS` 已按新长度收窄、取色会得到 `undefined`（`:66-69` 注释）。

## 5. 版本与平台判定

`src/lib/app-env.ts` 是唯一来源：`APP_VERSION` 来自 `__APP_VERSION__`（`:16-17`），由 `vite.config.ts:96-105` 读 `android/version.properties` 的 `versionName`（缺省退回 `package.json`）注入；`platformTag()`（`:25-36`）**先问 Capacitor 原生桥**，再匹配 UA `/Electron|NativeThink\//i` 才算桌面。

## 6. 页面状态记忆

`usePageMemory(key, defaults)` / `usePageMemoryDebounced`（`use-page-memory.ts:28,43`）：tab、筛选、搜索词、滚动位置统一走它，底层 `safeStorage`。`restoreValue`（`:5-26`）做了两类守卫：对象默认值要求存回来的也是对象、原始值要求 `typeof` 相同，否则回落默认 —— 这是为"旧版本写坏的数据"兜底。

## 7. 注意事项

1. **`<Toaster />` 全站只挂一次**，就在 `index.tsx:93-98`。以前只 import 了 `toast()` 却从没挂载，于是**所有提示都是静默的**（无报错、无界面变化）。新页面不要再挂第二个。`verify:feedback-loop` 会断言挂载存在。
2. **`MobileBottomNav` 那份预取表是复制品**（`:14-22`，7 条 vs AppSidebar 的 13 条）。手机用户点底栏进 `/sentences`、`/writing`、`/spelling`、`/progress`、`/favorites`、`/cet` 时**不会预取**。加页面时要么两处都加，要么把 AppSidebar 那份 export 出来共用 —— 只改一处会让人以为已经改了。
3. **预取发生在 hover/touch，不是 mount**，也不是 `<link rel=prefetch>`。所以"进页面慢"的第一嫌疑是被 `index.html` 的 modulepreload 与入口静态依赖图决定的，而不是这张表 —— 查首屏必须用 `npm run verify:bundle-budget`（从产物 BFS）。
4. **别在壳里同步 `require` 任何平台 SDK**。`SafeShell` 以前就是同步 `require("@lark-apaas/client-toolkit-lite")`，让它成为入口 chunk 的静态依赖；改成动态 import 后四个 AI 路由各少下载 160KB。同一条规律也适用于 `manualChunks`（见 `docs/modules/build-release.md`）。
5. **改 `SafeShell` 时把 hooks 全放在任何 early return 之前** —— 上次这被 pre-commit 的 `react-hooks/rules-of-hooks` 拦下（`useState`/`useEffect` 在 `if (!isMiaodaPlatform()) return` 之后就是违规）。不要用 `--no-verify` 绕过。
6. **`<div key={location.pathname}>` 会让页面在导航时重挂载**（`Layout.tsx:122`）：组件内 state 全丢。任何"切 tab 回来还在"的需求都必须显式持久化（`usePageMemory` 或模块级状态），别指望组件内存 —— 这也是 AGENTS.md 坑表里「退出/切 tab/杀 App 后状态丢」的机制。
7. **APK 的 `/api/*` 重写只在 `index.html:25-35`**：存在 `window.Capacitor` 时设 `window.__API_BASE__ = 'https://nativethink.pages.dev'` 并包裹 `window.fetch`。**只覆盖 `fetch`** —— 音频/图片类 URL 要自己读 `__API_BASE__` 拼接（`use-tts.ts:232-238`）。
8. **`public/_redirects` 的顺序与语义不能想当然**：`/api/* /api/* 200` 必须先于 `/* /index.html 200`，否则函数请求会被 SPA 兜底吃掉（返回 HTML 200 而不是 JSON）。`/models/* /models/* 404` 也是刻意的：web 版没内置模型，404 让 transformers 回落远程源。`public/_headers` 的 COOP/COEP（`credentialless`）是多线程 WASM（离线模型）必需，去掉会让 wasm 线程失效。
9. **`wrangler.toml` 里有真实 KV namespace id**（`id = "68391cb5…"`）。它是 binding 标识、不是密钥，但要清楚：**这个文件改错会让线上函数读不到 KV**，而本项目没有部署 workflow（`.github` 目录不存在），push 到 `main` 就由 Pages Git 集成构建上线。

## 8. 顶栏与外观主题（2026-10-20；视觉外壳 2026-10-21 改版）

**视觉外壳（墨面 + 纸面）**：

| 层 | 实现 | 约定 |
|---|---|---|
| 桌面侧栏 | `AppSidebar.tsx:76-175` + `index.css:253-281` | 底色走 `var(--ink)`，**六套主题各自换壳色**；logo 方块用 `--nav-bg/--nav-fg`；激活项用独立的导航色 `--nav-bg/--nav-fg`（石墨主题的 brand 是黑色，直接用 brand 会和侧栏糊在一起）。`[data-slot="sidebar-menu-button"][data-active="true"]` 仍需 `!important`，否则被组件自带的 `data-[active=true]:bg-sidebar-accent` 属性选择器盖住 |
| 侧栏主题快捷切换 | `AppSidebar.tsx:145-171` | 侧栏底部 6 个双色圆点，点一下直接 `setUiTheme`；和 `/settings` 的主题卡共用注册表与 localStorage |
| 手机抽屉 | `index.css:255-268` 的 `[data-slot="sidebar"][data-mobile="true"]` | 与桌面共用同一组墨面 token；抽屉项与桌面同一套激活样式 |
| 顶栏 | `Header.tsx:33-34` | 高度 64px，只留时间（含日期/星期，窄屏只留时间）、全局搜索、设置、用户菜单；原来的日期胶囊已删 |
| 手机底部 dock | `MobileBottomNav.tsx:38-43` | 悬浮墨色圆角条，6 个入口；`bottom` 直接算 `env(safe-area-inset-bottom, 0px) + 10px`（不再用 `safe-area-bottom` 类，守卫已改为接受 `env()` 写法） |
| 内容纸面 | `tailwind-theme.css` 的 `--background/--card/--border` + `index.css:235-251` | 暖白 `#F3F4EF`；卡片统一 24px 圆角、细边、短影，悬浮只加深边缘；彩色光晕（`shadow-emerald/violet/sky…`）统一清零 |
| 标题 | `index.css:301` | `h1-h4` 强制正体 —— 原先满屏的斜体黑体是模板感最重的来源 |

模块色不再铺在页面背景上（`index.css:541` 将 `main[data-module]` 的径向渐变置空）；模块辨识改由侧栏激活项、内容里的编号/强调色承担。

**顶栏只留三件**：时间、全局搜索（`GlobalWordSearch`）、设置入口（齿轮 → `/settings`）+ 用户菜单。
原先并排的 9 个图标（每日目标 / 更新日志 / 开发者主页 / 使用指南 / AI 设置 / 朗读设置 / 明暗切换）全部收进设置页，
窄屏不再需要横向滚动。组件边界没变：`HelpGuide` / `AISettings` / `ChangelogDialog` / `TTSSettings` 都新增了
`trigger?: ReactNode`，页面把整行按钮传进去当 `asChild` 的触发件 —— **自定义 trigger 必须把 Radix 注入的 props
继续传给真正的按钮**（否则点得动但面板不打开，第一版就栽在这儿）。

**外观主题是"明暗之外的第二维"**：

| 层 | 位置 | 约定 |
|---|---|---|
| 主题注册表 | `src/lib/ui-theme.ts` | `classic`（默认，**不挂 `data-ui-theme`，直接用 `:root` 的墨壳/纸面基线**）/ `porcelain` 电蓝 / `graphite` 石墨 / `lime` 青柠 / `sand` 暖沙 / `berry` 莓果；id 与 CSS 选择器一一对应 |
| token 覆盖 | `src/index.css` 末尾 `html[data-ui-theme="…"]` | 只改设计变量：`--background/--card/--border/--primary/--ink-teal`，以及外壳的 `--ink/--ink-2/--lime/--warm/--on-brand/--on-lime/--nav-bg/--nav-fg/--brand*`；暗色单独一套 |
| 品牌单点 | `--brand` / `--brand-strong` / `--brand-rgb` | 全站原 `#00B894` 已换成 `var(--brand)`（497 处 / 48 个 tsx），换主题时按钮、图标、阴影一起变；`--brand-rgb` 供透明度用法 |
| 启动 | `src/index.tsx` 的 `initUiTheme()` | 在 `createRoot` 之前把 `data-ui-theme` 写到 `<html>`，刷新不闪回默认 |
| 选择入口 | `/settings` → 外观 + 侧栏底部 | 亮/暗 + 六套主题色卡（当前主题用品牌色小点标出）；侧栏底部 6 个双色圆点可直接切换；选择写 `localStorage.__nativethink_ui_theme` 并广播给其它实例 |

**已知边界**：canvas（`celebrate.ts`）与 Recharts 的 `fill` 仍拿字面色，不跟随主题；
`emerald-*` / `teal-*` 这类语义色（成功/正确）与品牌色是两回事，主题不会把它们染成主色 —— 这是刻意的。
