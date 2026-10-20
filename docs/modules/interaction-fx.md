# 交互反馈层（按压词汇 / 结果图形 / 奖励时刻）

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

## 2. 词汇表（数值只此一处：`src/index.css:301-368`）

| 状态 | 数值 | 为什么 |
|---|---|---|
| press（实心主键 `data-press="strong"`） | `scale: 0.970` | 真机 393 CSS 宽 + `textZoom 120%` 下"按得下去"的最小可感档 |
| press（次级/图标/标签 `soft`） | `scale: 0.985` | 小控件缩到 0.970 像塌陷 |
| 按下时长 | `110ms` | 判据①「响应 ≤100ms 开始」允许的形变窗口 |
| 抬起回弹 | `170ms`，**定长 tween** | 不用 spring：`verify-vocab-cards.mjs:364` 早就钉过"spring 要衰减到亚像素才算完，尾巴≈400ms" |
| 涟漪 | 从**触点**起，直径 `max(w,h)×2.2`，`420ms` | 中心扩散一眼廉价；曲线沿用 `--fx-ease`（与 `page-enter` 同族） |
| 曲线 | `cubic-bezier(0.22, 1, 0.36, 1)` | 全站一条 |

**三条故意不做**：① 卡面整张（滑动评分区）不给缩放 —— 它和手势拖拽共存，缩一下 + 手指一动就抖；
② 键盘触发（Enter/Space）不画涟漪 —— 没有触点坐标，只走 `:active` 缩放；
③ `prefers-reduced-motion` 下涟漪与缩放**全关**，只留基座那层压暗。

## 3. 四个单元（每个都能独立看懂、独立测）

| 单元 | 职责 | 怎么用 |
|---|---|---|
| `src/lib/press-fx.ts` | 一处**指针事件委托**：`pointerdown` 找最近的 `[data-press]` 插涟漪（`:40` `ripple`、`:65` `initPressFx`） | `initPressFx()` 在 `src/index.tsx:19` 调一次；页面**什么都不用写** |
| `src/index.css:301-368` | 全部数值 + `.fx-ripple` / `.fx-arc` / `.fx-ring` / `.fx-shake` 关键帧 + 降级段（`:365`） | 属性就是接口：`data-press="strong\|soft\|off"`、`data-fx-ripple="0"` |
| `src/components/ui/button.tsx:59-70` | 基座挂 `data-press`，档位由 `variant` 推导（`default/destructive`→strong），`fx="none"` 关掉 | 395 处 `<Button>` 自动生效；`asChild` 时自动只缩放不画涟漪（不能往别人家塞节点） |
| `src/components/CelebrateLayer.tsx` + `src/lib/celebrate.ts` | 两个奖励时刻的程序化 canvas，唯一入口 `celebrate('perfect-round'\|'streak-7', anchorEl)` | 挂在 `src/index.tsx:105`（与 `<Toaster />` 同层，**全仓只许这一处**） |
| `src/components/fx/ResultFx.tsx` | 结果图形件：`ScoreArc:18` / `StreakRing:32` / `VerdictDot:43` | **纯 CSS，不碰 framer-motion** |

### 3.1 为什么委托而不是组件

306 处裸 `<button>` 不可能逐个包一层组件，而判据②要求所有可点东西走同一条路。
命令式模块还有个好处：**能脱离 React 用假 DOM 真跑**。

### 3.2 为什么缩放走独立 `scale` 属性而不是 `transform`

现有代码在按钮与卡面上已经写了 `transform: translate(...)`（滑动跟手、图标居中、`-translate-y-1/2` 的浮层）。
两者写在一起**互相覆盖**；独立属性按 translate→rotate→scale 各自合成，天生不打架（`index.css:320-332`）。

### 3.3 涟漪的两个反直觉点（都是量出来的，别照 CSS 直觉改）

- **不能用 `currentColor`**：浅底上它是深墨 → 看着像"变灰/禁用"；深底上它是白 → 几乎看不见。
  改成按宿主底色亮度挑两档（`--fx-ink-ripple` / `--fx-light-ripple`），亮度用 Rec.601 权重算一次缓在 `WeakMap`（`press-fx.ts:21-38`）。
- **不能给按钮加 `overflow:hidden`**：那会掐掉焦点环与内部浮层。涟漪装在自有的 `.fx-ripple-host` 绝对定位层里（`:335`）。
- **`transition-property` 是整体覆盖**：只写 `scale` 会把元素原有的 `transition-colors` 顶掉（快速闪卡的词面 chip 就中招）。
  所以白名单里必须把颜色项一起列出（`:325-331`），守卫有一条专门钉它。

### 3.4 降级与边界

- reduce 判断在**委托层**（`press-fx.ts:70-72`，排在画涟漪之前），不是靠 CSS 藏 —— 藏的那版 DOM 里仍留着节点。
- 拿不到有效 `rect`（`display:none`、零尺寸）就不画，**绝不猜坐标**；同一元素在飞的涟漪 `MAX_IN_FLIGHT = 3`，超了丢最旧的；`animationend` 自摘。
- `celebrate()` 在 sink 没挂上或拿不到 2d context 时**静默 no-op** —— 绝不回退成 toast（那正好破掉判据③）。
- 奖励层：DPR 夹到 2、46 粒、700ms 自收、卸载时 `attachCelebrationSink(null)` **并**撤 rAF（只撤一样不够，sink 还指着已卸载的 canvas）。

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

## 6. 验证

- `node scripts/verify-interaction-fx.mjs` —— **65 条**：token 单点定义与数值、`scale` 而非 `transform`（含反向断言）、
  颜色过渡白名单、9 个练习面 `active:scale` 计数为 0 且 `data-press` 覆盖数只许涨不许跌、基座档位推导、
  委托层四条边界（键盘/reduce/无尺寸/上限）、涟漪两档且不许回到 `currentColor`、奖励层唯一出口（剥注释全仓扫描）、
  结果层不引 motion 不弹 toast、闪卡接线四条（含两条正对照）。
  **变异 10 条逐条点名**：M1 缩放写回 transform / M3 删 reduce 早退 / M4 `>=7` / M5 去掉"评过≥1" / M6 不清 ref /
  M7 第二处挂载 / M8 回到 currentColor / M9 加回 ad-hoc scale / M10 DPR 不夹 / M11 cleanup 不撤 rAF。
  ⚠️ 其中 M3、M11 **第一次是绿的** —— 断言在假绿（`/prefers-reduced-motion/.test(FX)` 只要那行 matchMedia 还在就过；
  `cancelAnimationFrame` 匹配到的是循环内那处而不是 cleanup），改成钉"早退排在画涟漪之前"和"sink 与 rAF 一起撤"才真红。
- `node scripts/walk-interaction-fx.mjs` —— **12 条**运行时（无头 Chrome + CDP）：`pointerdown→下一帧 3.7ms`、
  按下前后 `rect` 逐位相等、涟漪自清、键盘 0 个、reduce 0 节点、连点 6 次在飞 ≤3 且宿主只 1 个、
  canvas 唯一且 `pointer-events:none`、三面运行时覆盖数（`/vocabulary` 24、`/chunks` 11、`/video` 11）。
- `node scripts/check-interaction-on-phone.mjs [--port 9223] [--index N]` —— 真机 8 条，**用 CDP `Input.dispatchTouchEvent` 真触摸**。
  为什么非要有它：`dispatchEvent(new PointerEvent(...))` 是合成事件，不产生浏览器激活，**`:active` 根本不会生效** ——
  电脑侧只能量到涟漪与不占位，量不到"按下去真的缩了"。
- 收尾一律 `npm run verify:all`（改的是 `<Button>` 基座 = 全站共享组件；当前 29 项全绿）。

## 7. 已知边界（别当成已完成）

- 只有 9 个练习面接了 `data-press`；浏览/配置类页面靠 `<Button>` 基座吃到词汇，**裸 `<button>` 还没铺**。
- 结果层目前只接了闪卡的连击环；`ScoreArc` / `VerdictDot` 还没有消费者（组件在、关键帧在、守卫在，接线待下一批）。
- 半透明合成层**不能用 CDP 截图判可见性**（`opacity<1` 的独立层整层丢，`captureBeyondViewport` 也一样）——
  要看像素就走 OS 桌面合成器截图或真机 `adb exec-out screencap -p`。这条与"CDP 截不到视频硬表面"同族。
