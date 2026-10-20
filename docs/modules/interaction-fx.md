# 交互反馈层（按压词汇 / 结果图形 / 奖励时刻 / 入场转场）

> 全站"按下去有什么反应"的**唯一**答案。改任何按钮、开关、卡片的可点态之前先读这篇。
> 需求出处：用户 2026-10-20「添加按键交互功能，不是文字交互而是图像和动画交互，让软件更加高级」。
> 三条判据（用户选的）：**① 响应快且不掉帧 ② 全站只有一套按压词汇 ③ 结果不靠文字**。
> 视觉参考原型：`scripts/press-fx-demo.html`（数值与这一层一一对应，可 `cp` 进 `dist/client/__probe__/` 打开）。

## 1. 为什么必须自己搭一层

接这一层之前，全站的可点反馈是这样量出来的：**306 处裸 `<button>` + 395 处 `<Button>`**，
基座只有一层压暗（`hover-elevate active-elevate-2`，`tailwind-theme.css:296-330` 那套伪元素），
外加**散落各页自己挑的 22 处 `active:scale-[0.98]/[0.99]/[0.995]/scale-95`** —— 也就是"手感"每次写页面时随手定一次。
framer-motion 已经在**首屏壳里**（`verify-bundle-budget` 的 540KB 基线就是"壳+react/router/radix/motion/icons"），
但卡片有 spring 而**按钮一次 `whileTap` 都没用过**；`@formkit/auto-animate` 装了、全仓零引用。

## 2. 词汇表（数值只此一处：`src/index.css:300-395`）

| 状态 | 数值 | 为什么 |
|---|---|---|
| press（实心主键 `data-press="strong"`） | `scale: 0.970` | 真机 393 CSS 宽 + `textZoom 120%` 下"按得下去"的最小可感档 |
| press（次级/图标/标签 `soft`） | `scale: 0.985` | 小控件缩到 0.970 像塌陷 |
| press（**默认可点**：裸 `<button>` / `<a href>` / `[role=button]`） | 同 `soft`，不用写属性 | 307 处裸按钮手抄属性一定漏 —— 见 §3.6 |
| 按下时长 | `110ms` | 判据①「响应 ≤100ms 开始」允许的形变窗口 |
| 抬起回弹 | `170ms`，**定长 tween** | 不用 spring：`verify-vocab-cards.mjs:364` 早就钉过"spring 要衰减到亚像素才算完，尾巴≈400ms" |
| 涟漪 | 从**触点**起，直径 `max(w,h)×2.2`，`420ms` | 中心扩散一眼廉价；曲线沿用 `--fx-ease`（与 `page-enter` 同族） |
| 曲线 | `cubic-bezier(0.22, 1, 0.36, 1)`（`--fx-ease`，`:318`） | 全站**一条**，字面量只许出现在这一行（守卫 ⑫ 数次数） |
| 入场：路由级 `.page-enter` | `240ms` + `var(--fx-ease)`，fill `backwards` | 第三档，2026-10-20 收口进同一套曲线 —— 见 §3.7 |
| 入场：卡片逐张 `.stagger > *` | `320ms` + 同曲线，逐张延迟 35ms 递增、第 9 张封顶 | 同上 |

**三条故意不做**：① 卡面整张（滑动评分区）不给缩放 —— 它和手势拖拽共存，缩一下 + 手指一动就抖；
② 键盘触发（Enter/Space）不画涟漪、也不挂按压态 —— 没有触点坐标；
③ `prefers-reduced-motion` 下涟漪与缩放**全关**，只留基座那层压暗。

⚠️ **"按下去缩了"这条在 APK 上原来是不成立的** —— 见 §3.4，那是装机实测逼出来的机制改动，不是调参。

## 3. 四个单元（每个都能独立看懂、独立测）

| 单元 | 职责 | 怎么用 |
|---|---|---|
| `src/lib/press-fx.ts` | 一处**指针事件委托**：`pointerdown` 找最近的参与者插涟漪（`:45` `ripple`、`:77` `initPressFx`、`:86` 参与者选择器） | `initPressFx()` 在 `src/index.tsx:19` 调一次；页面**什么都不用写** |
| `src/index.css:328-395` | 全部数值 + `.fx-ripple` / `.fx-arc` / `.fx-ring` / `.fx-shake` 关键帧 + 降级段（`:390`） | 属性就是接口：`data-press="strong\|soft\|off"`、`data-fx-ripple="0"`；**不写属性=默认参与（soft）** |
| `src/components/ui/button.tsx:59-70` | 基座挂 `data-press`，档位由 `variant` 推导（`default/destructive`→strong），`fx="none"` 关掉 | 395 处 `<Button>` 自动生效；`asChild` 时自动只缩放不画涟漪（不能往别人家塞节点） |
| `src/components/CelebrateLayer.tsx` + `src/lib/celebrate.ts` | 两个奖励时刻的程序化 canvas，唯一入口 `celebrate('perfect-round'\|'streak-7', anchorEl)` | 挂在 `src/index.tsx:105`（与 `<Toaster />` 同层，**全仓只许这一处**） |
| `src/components/fx/ResultFx.tsx` | 结果图形件：`ScoreArc:18` / `StreakRing:32` / `VerdictDot:43` | **纯 CSS，不碰 framer-motion** |

### 3.1 为什么委托而不是组件

307 处裸 `<button>`（另有 395 处 `<Button>`）不可能逐个包一层组件，而判据②要求所有可点东西走同一条路。
命令式模块还有个好处：**能脱离 React 用假 DOM 真跑**。
2026-10-20 批 2 把接口翻成了"**默认可点、`off` 才例外**"（§3.6）—— 手抄属性这条路的终点就是漏。

### 3.2 为什么缩放走独立 `scale` 属性而不是 `transform`

现有代码在按钮与卡面上已经写了 `transform: translate(...)`（滑动跟手、图标居中、`-translate-y-1/2` 的浮层）。
两者写在一起**互相覆盖**；独立属性按 translate→rotate→scale 各自合成，天生不打架（`index.css:328-344`）。
顺带一条实测：Tailwind v4 的 `translate-*` / `scale-*` 也已经各自走 `translate` / `scale` 独立属性（产物 CSS 复核），
所以默认可点那一层与宿主的 `hover:scale-105` 不冲突 —— 前提是**我们不去写基态 scale**（§3.6 第二条）。

### 3.3 涟漪的三个反直觉点（都是量出来的，别照 CSS 直觉改）

- **不能用 `currentColor`**：浅底上它是深墨 → 看着像"变灰/禁用"；深底上它是白 → 几乎看不见。
  改成按宿主底色亮度挑两档（`--fx-ink-ripple` / `--fx-light-ripple`），亮度用 Rec.601 权重算一次缓在 `WeakMap`（`press-fx.ts:21-38`）。
- **不能给按钮加 `overflow:hidden`**：那会掐掉焦点环与内部浮层。涟漪装在自有的 `.fx-ripple-host` 绝对定位层里（`:360`）。
- **`transition-property` 是整体覆盖**：只写 `scale` 会把元素原有的 `transition-colors` 顶掉（快速闪卡的词面 chip 就中招）。
  所以白名单里必须把颜色项一起列出（`:328-334`），守卫有一条专门钉它。
- **宿主必须能当包含块**（批 2 新增，`press-fx.ts:45-53`）：`.fx-ripple-host` 是 `absolute inset:0`，
  所以宿主得是**已定位**元素。显式接线那批都带 `relative`；默认可点覆盖 307 处裸按钮，不可能要求每处都写对，
  于是 `ripple()` 里补两下：`position: static` → 就地写 `relative`；`display: inline`/`contents` → **直接不画**
  （行内盒既不可 transform 也不能当包含块，硬画会甩到某个祖先的框里）。
  两条都在量尺寸**之前**，运行时凭据见 §6 的注入夹具那条。

### 3.4 缩放**不能只靠 `:active`**（2026-10-20 模拟器 APK 实测，这条改掉了原来的设计）

`node scripts/check-interaction-on-phone.mjs --port 9226` 用 CDP `Input.dispatchTouchEvent`
（设备级真触摸，不是 `dispatchEvent` 那种合成事件）按下时量到：

| 读数 | 结果 |
|---|---|
| `pointerdown` 是否到达目标 | **到了**，`pointerType:"touch"`，涟漪节点也建了 |
| 按下期间整页 `document.querySelectorAll(':active').length` | **恒为 0** |
| 按下期间 `getComputedStyle(el).scale` | **恒为 1**（`:active` 没进，缩放自然没发生） |

也就是说这台 Android WebView 在触摸下**根本不进 `:active`**。第一版把缩放只挂在 `:active` 上，
等于"网页版有手感、发出去的 APK 没有"，而且**自动化通道还测不到**（合成事件同样不激活）。
所以按压态改由委托层投递：`pointerdown` → `host.setAttribute('data-pressing','')`，
CSS 里 `:active` 与 `[data-pressing]` **并列**在同一条规则（鼠标那条留着，白捡零延迟）。

收回路径是四条，缺一条就会留下一个"永久按着"的按钮：`pointerup` / `pointercancel` / `window blur` /
`initPressFx` 的卸载函数。收回写的是"清全站 `[data-pressing]`"而不是"记住刚才挂了谁" ——
因为按住期间 React 可能把那个节点换掉（练习面换卡），记身份会漏。

**这条改动的附带收益**：机制变成 JS 挂属性之后，**电脑侧也能测了** ——
`walk-interaction-fx.mjs` 用合成 `pointerdown` 就能验缩放档位，不必等到装机才有凭据。

**同一次实测还推翻了一条判据**：`getBoundingClientRect()` **含 scale**。
strong 档 115px 宽的按钮缩到 0.97 时，视觉左边自己就动了 1.7px —— 拿"按下前后 rect 逐位相等"判"不占位"
**判的是错的东西**（网页版当时因为 `:active` 根本没生效，才侥幸是绿的）。
"不占位"真正要钉的是**布局盒**：`offsetLeft/offsetTop` 不受 transform/scale 影响，按下前后必须逐位相等；
视觉位移则反过来只许在"按档位缩放应得的那点量"以内（`宽 × (1-scale) / 2`），超了才是真重排。
两条都写进了 `check-interaction-on-phone.mjs` ⑨ 与 `walk-interaction-fx.mjs` ①。

### 3.5 降级与边界

- reduce 判断在**委托层**（`press-fx.ts:92-93`，排在画涟漪之前），不是靠 CSS 藏 —— 藏的那版 DOM 里仍留着节点。
- 拿不到有效 `rect`（`display:none`、零尺寸）就不画，**绝不猜坐标**；同一元素在飞的涟漪 `MAX_IN_FLIGHT = 3`（`:21`），超了丢最旧的；`animationend` 自摘。
- `celebrate()` 在 sink 没挂上或拿不到 2d context 时**静默 no-op** —— 绝不回退成 toast（那正好破掉判据③）。
- 奖励层：DPR 夹到 2、46 粒、700ms 自收、卸载时 `attachCelebrationSink(null)` **并**撤 rAF（只撤一样不够，sink 还指着已卸载的 canvas）。

### 3.6 默认可点层：接口翻成"默认参与、`off` 才例外"（2026-10-20 批 2）

判据②要的是**覆盖**。原先的口径是"谁想有手感谁写 `data-press`"，实际只有 9 个练习面 + `<Button>` 基座写满，
浏览/配置面（词库浏览、设置、抽屉、播放器…）的 307 处裸 `<button>` 静默没有反馈 —— 手抄一定漏，
而且静态守卫"量过的都合格"根本发现不了没量的那一片（覆盖假绿）。现在：

| 面 | 规则 | 位置 |
|---|---|---|
| CSS | `:where(button, a[href], [role="button"]):not([data-press])` 的 `:active` / `[data-pressing]` 两态 → `var(--fx-press-soft)` | `index.css:356-357`（降级那条在 `:392-394`） |
| 委托 | `closest('button, a[href], [role="button"], [data-press]')`，`data-press="off"` 整块退出 | `press-fx.ts:86-88` |
| 例外 | 全站目前**只有一处** `off`：侧边栏 16px 隐形拖拽把手（`ui/sidebar.tsx` `SidebarRail`） | 守卫 ⑪ 钉"off ≤ 5 处"，多了就是有人在绕开契约 |

三条不显然的约束（都是这次实测出来的，写进注释也写进守卫）：

1. **`index.css` 这些规则在 `@layer` 之外**，而 Tailwind v4 把 utilities 装进 `@layer utilities` ——
   层外规则**无视特异性**一律赢过层内（产物 CSS 复核）。所以默认层里写 `transition-property` 或基态 `scale: 1`
   会**静默顶掉**宿主的 `transition-all` 219 处 / `transition-colors` 142 处 / `transition-transform` 28 处 /
   `hover:scale-*` 21 处。默认层因此**只给按下态**；显式 `data-press` 的宿主才吃完整待遇（那批是逐个核过的）。
2. `:not([data-press])` 是"退出默认层"的钥匙，不只是 `off`：显式声明档位的元素同时退出默认层，
   否则同特异性的两条规则会按源码顺序互相顶（`<Button data-press="strong">` 会被后面的默认 soft 顶掉）。
3. **行内 `<a>` 天然不参与**：非替换行内盒不可 transform —— 实测 computed `scale` 写着 `0.985` 而
   `getBoundingClientRect().width` 一动不动。所以正文链接不用逐条写 `off`，但涟漪必须显式不画（§3.3 第四条）。
   这条同时说明：**判"有没有缩"只认 rect 读数，不认 computed**。

### 3.7 第三档「入场 / 转场」是收口，不是新造（2026-10-20 批 3）

`.page-enter`（路由级淡入+上浮）与 `.stagger > *`（卡片逐张入场）本来就挂在 12 处界面上
（文章列表 7 处、对话场景、词汇模式列表、首页两组、阅读器两处），缺的是同源：
同一条 `cubic-bezier(0.22, 1, 0.36, 1)` 在四个地方各写一遍字面量。本轮做的是把它们指回 `--fx-ease`
（数值逐字符相同 → **零视觉变化**），并补三条守卫：字面量全站只许一次、组件里不许自带曲线、
`fill-mode` 必须是 `backwards`（`both/forwards` 会把结束帧的 transform 永久留在祖先上，
使祖先变成 fixed 后代的包含块 —— 阅读器那层 `fixed inset-0` 会被关进内容列，这条注释在 `index.css:33-39` 本来就写着，
现在它有人盯着了）。运行时凭据：`walk-interaction-fx.mjs` ⑪ 量 computed `animation-timing-function`
（token 名写错时静态守卫看不见，只有这里会退回 `ease`）。

## 4. 奖励时刻的口径

只认**既有事实**，不另算一套状态：闪卡读 `markWithQuality` 里已有的 `combo`（`FlashcardMode.tsx:417`），
整轮全对读 `ratedRef/goodRef`（`:496`）。两条硬约束：

- 只在**达成那一格**放（`next === 7`，不是 `>= 7` —— 否则每帧重放，动画变噪声）；
- "全对"必须同时要求**评过 ≥1 张**（`ratedRef.current > 0 && …`）—— 一张没评不许放庆祝。
- 两个 ref 必须在 `startSession` 里显式归零（`:528`）：ref 不随重挂载归零是本仓的老坑。

## 5. 结果层为什么不用 framer-motion

`useFramerMotion()` 带 provider 前置条件，真机在收藏页整页崩过一次（缺 `<LazyFramerProvider>` 时它曾直接 throw），
`verify-overlay-fit` ⑦ 现在**逐个宿主**点名。结果层若用 motion 组件，每个渲染点都得包一层 provider ——
风险面从 1 处涨到 N 处。纯 CSS 一处宿主都不需要。

**消费者（2026-10-20 批 1 起）**：练习界面的判定与计数**不写一个字**（§判据③），四个面各自换成图形件 ——

| 面 | 用了什么 | 口径 |
|---|---|---|
| 复习检测 `FlashcardMode` | `ScoreArc`（头部正确率，替掉原来的纯文字 `记得 x%`）+ `StreakRing` | `sessionRated > 0` 才画弧 |
| 每日学习 `DailyLearningMode` | `StreakRing`（连对环，替掉 `animate-pulse`）+ 配对失败 `fx-shake` | 一个元素上不许叠两种动效 |
| 中译英 `ChineseToEnglishMode` | `ScoreArc` + 每个选项一颗 `VerdictDot` | `answered > 0` 才画弧；**揭晓后**才出点 |
| 纠偏重考 `CorrectionDrillMode` | 同上 | 同上；未判定那颗是中性灰，绝不冒绿 |

## 6. 验证

- `node scripts/verify-interaction-fx.mjs` —— **104 条**：token 单点定义与数值、`scale` 而非 `transform`（含反向断言）、
  颜色过渡白名单、9 个练习面 `active:scale` 计数为 0 且 `data-press` 覆盖数只许涨不许跌、基座档位推导、
  委托层四条边界（键盘/reduce/无尺寸/上限）、涟漪两档且不许回到 `currentColor`、奖励层唯一出口（剥注释全仓扫描）、
  结果层不引 motion 不弹 toast、闪卡接线四条（含两条正对照）、**⑩ 按压态投递机制十条**（两条 CSS 选择器并列、
  挂属性、门槛→挂→降级→涟漪的**顺序**、收回按"清全站"、pointerup/pointercancel 既挂又撤、失焦也撤、
  反向"除委托层全站不许自己写 data-pressing"、降级块覆盖新机制）、
  **⑪ 默认可点层十三条**（默认层恰好两个规则块、`:not([data-press])` 退出钥匙、反向钉"默认层不许写
  `transition-property`/基态 scale"、委托 `closest` 与 CSS 同源、off 门的位置、涟漪宿主的 inline/static 两条兜底
  排在量尺寸之前、侧边栏把手那处 off、off 总数 ≤5、两条走查脚本的参与者选择器同源）、
  **⑫ 入场档六条**（曲线字面量全站只许一次、组件里不许自带曲线、`.page-enter`/`.stagger > *` 用 `var(--fx-ease)`
  且 fill 是 `backwards`、reduce 停入场、全站 ≥10 个挂载点、路由级入场挂在 Layout 的 keyed 包装上）。
  ⚠️ 全仓扫描那五条判据**共用一次转译**（`codeOf()` 记忆化）：各扫各的会把这条守卫拖到 3 分钟以上
  （`src/data` 下有单个几 MB 的词典文件），而且一律用剥过注释的版本 —— 注释里提一句 `data-press="off"` 也算数过一次。
  **变异逐条点名**：M1 缩放写回 transform / M3 删 reduce 早退 / M4 `>=7` / M5 去掉"评过≥1" / M6 不清 ref /
  M7 第二处挂载 / M8 回到 currentColor / M9 加回 ad-hoc scale / M10 DPR 不夹 / M11 cleanup 不撤 rAF /
  M11 摘掉 soft 档并列选择器 / M12 摘掉 strong 档 / M13 不挂属性 / M14 挪到 reduce 之后 / M15 收回改清错集合 /
  M16 缺 pointercancel / M17 卸载不撤 pointerup / M18 不管失焦 / M19 页面自己写属性 / M20 降级块漏新机制 /
  M21 挂属性挪到 disabled 门槛之前；**批 1** P1-P6（弧/点/环六处接线各自改坏）；
  **批 2** M-A…M-K（删按下态 / 加 transition-property / 补基态 scale / 写死 .985 / 降级块漏一条 /
  closest 退回 `[data-press]` / 不补 relative / 行内不跳过 / 删 off 门 / 撤掉把手的 off / 走查退回旧选择器）；
  **批 3** N-A…N-F（曲线写回字面量 / fill 改 both / 降级不停入场 / 组件自带曲线 / 摘掉路由入场 / stagger 改 linear）。
  **17 条全部一次命中红**（脚本 `tmp/mut-press-default.mjs`，跑完按 sha256 还原；它自己也要防"变异没命中"——
  第一版用 `s !== R(file)` 判命中，等于拿原文和重读比，11 条全部"无效"，改成比较 replace 前后才真的有对照）。
  ⚠️ 三条**第一次是绿的**、都是断言在假绿：M3、M11(rAF)，以及本轮的 **M11(soft 档)** ——
  `/\[data-press\]:active,\s*\[data-press\]\[data-pressing\]/` 被**降级块里同形的那条选择器**替它答了，
  正则必须钉到 `var(--fx-press-soft)` 那一身才红。M17/M21 则是变异锚点用错了（源码带 `as EventListener`、
  以及"插入"而不是"搬移"）—— 实验本身无效，重做后才红。
- `node scripts/walk-interaction-fx.mjs` —— **23 条**运行时（无头 Chrome + CDP）：`pointerdown→下一帧 ≤100ms`、
  **合成 pointerdown 现在也能量到缩放在发生**（换成 JS 挂属性之前这条测不到）、`data-pressing` 挂上且 pointerup 收回、
  **布局盒** `offsetLeft/offsetTop` 按下前后不动、涟漪自清、reduce 下既不建节点也 scale 1、键盘 0 个、
  连点 6 次在飞 ≤3 且宿主只 1 个、canvas 唯一且 `pointer-events:none`、三屏参与者计数（≥15/80/12，实测 31/112/18）、
  **裸按钮吃同一套词汇**（挂态 + 涟漪 + 缩到 soft + 布局不动）、**注入夹具三条**（off 整块退出 /
  静态宿主补成 relative 且涟漪层与按钮盒逐位重合 / 行内 `<a>` 一个宿主都不建且 rect 不动）、
  **入场两条**（computed `animation-timing-function` 真的解析成 `--fx-ease` 那条曲线，路由级 + 首页 `.stagger` 第一张）。
  ⚠️ 三条测法坑：① 页面表达式**自己 return JSON 字符串**时要解两次（`JO()`），否则断言拿字符串比属性 →
  明明量到绿数据却报红，本轮三条红全是这个原因、产品没错；② 判"看得见"不能用 `offsetParent` ——
  **SVG 元素的 `offsetParent` 恒为 null**，`ScoreArc` 在那儿被冤枉过一次，一律看 `getBoundingClientRect()`；
  ③ 单帧读数会抖（紧接导航后转场可能还没拿到第一个 tick，实测抖出过一次 `scale=1`）→ 逐帧取最小值。
- `node scripts/check-interaction-on-phone.mjs --port 9226 --tier strong`（模拟器）/ `--port 9223`（真机）——
  **13 条**，用 CDP `Input.dispatchTouchEvent` 发**设备级真触摸**（不是合成事件）。
  这一条通道就是 §3.4 那个发现的来源，也是它把判据改成了：② 挂上 `data-pressing`、③ scale 到档位值、
  ④ 响应时延（实测 32ms）、⑦ 手指**移到别处再抬手**属性仍收回、⑨ 布局盒不动 + 视觉位移不超缩放应得量、
  ⑩⑪ 连点上限与自清。挑目标必须过**三重门**（尺寸、`elementFromPoint` 命中它或其后代、自身与祖先链
  `pointer-events` 都不为 none、且不在打开的 dialog-overlay 之下），否则新装状态的选词书向导会让按下落到遮罩上 ——
  这是本脚本第一版两条假红的根因。读数按**坐标**回查宿主（`elementFromPoint().closest(参与者选择器)`）而不是按索引，
  因为点一下评分按钮就把卡片换掉、参与者列表跟着重排。批 2 之后选择器与 CSS/委托**同源**（守卫 ⑪ 钉），
  并且 `⓪` 会报出挑到的是"默认可点"还是"显式接线"。
- `node scripts/walk-phone.mjs --port 9226`（模拟器）—— 装机走查 **36 条**，其中两条属于这一层：
  **⑤ 结果图形件真的画在界面上**（答前弧与点都是 0 → 答后弧有尺寸有描边色且已收口、四颗点里恰好一颗成功绿 + 三颗未判定灰）；
  **⑥ 默认可点层在装机界面上的覆盖**（收藏页 53 个参与者里 28 个是裸元素，按下有态有涟漪）。
  这条脚本现在也能跑本机通道（`--base http://127.0.0.1:8001` + 无头 Chrome），
  但那条通道**不钉 393 视口**（headless 窗口有 500+ 下限），要真机几何仍得走模拟器/真机。
- 收尾一律 `npm run verify:all`（改的是 `<Button>` 基座 = 全站共享组件）。

## 7. 已知边界（别当成已完成）

- **设备侧凭据还欠一轮**：批 2 的默认可点层与批 1 的结果图形件目前只有①本机无头 Chrome 23 条 +
  ②本机构建产物上的装机走查 36 条。`--tier soft` 在模拟器/真机上挑到的就是裸按钮，那一轮跑完才算装机成立（排在打包之前）。
- 弧与色点的运行时凭据取自**纠偏重考**那一处；`FlashcardMode` 的头部弧与 `DailyLearningMode` 的连击环
  仍只有静态守卫（连击环要连对 3 张才出现，走查没走到那一步）。同源同组件，但**别把它写成"四处都实测过"**。
- `.stream-in`、`toast-in` 这些旧动画仍带着自己的曲线与 fill-mode —— 本轮只把 `page-enter` / `stagger > *` /
  `page-turn-*` 三条收进 `--fx-ease`。守卫 ⑫ 数的是 `cubic-bezier(` 字面量，`ease-out` 这类关键字它看不见。
- `off` 目前全站一处（侧边栏拖拽把手）。卡面（滑动评分区）本来就是 `<div>` 不是 `<button>`，
  所以"卡面整张不缩放"这条**没有被默认层破掉** —— 但如果以后有人把卡面改成 `<button>`，它会立刻开始缩，
  那时要显式 `off` 而不是改默认层。
- 半透明合成层**不能用 CDP 截图判可见性**（`opacity<1` 的独立层整层丢，`captureBeyondViewport` 也一样）——
  要看像素就走 OS 桌面合成器截图或真机 `adb exec-out screencap -p`。这条与"CDP 截不到视频硬表面"同族。
