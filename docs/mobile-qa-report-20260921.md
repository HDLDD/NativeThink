# NativeThink 手机版真机测试报告

**测试日期**：2026-09-21
**测试方式**：真机连接（adb 无线调试）+ Chrome DevTools Protocol 驱动 WebView + 像素级验证 + 网络捕获
**被测版本**：v2.0.1（versionCode 46）— 与 `release/NativeThink-mobile-debug.apk` 二进制一致，APK 内 `assets/public/assets/index-BTnFFXUY.js`（992,745 B）与本地 `dist/client` 构建**逐字节同名同尺寸**

| 项目 | 值 |
|---|---|
| 设备 | Redmi 25053RT47C（product `onyx`） |
| 系统 | Android 16 / SDK 36 / HyperOS V816OS3.0 |
| 屏幕 | 1280×2772 @520dpi（CSS 视口 393×788 @dpr 3.256） |
| 内存 | 12 GB |
| WebView | Chrome 150.0.7871.181 |

> 注：该设备禁止 `adb shell input`（`INJECT_EVENTS` 权限），触摸测试改用 CDP `Input.dispatchTouchEvent`，走真实 touch 事件路径。

---

## 一、确凿问题（真机复现）

### P0-1　原生 TTS 插件 Promise 永久挂起（功能性缺陷）

**位置**：`src/lib/native-tts.ts:59`

```ts
pluginPromise = (async () => {
  try {
    const mod = await import('@capacitor-community/text-to-speech');
    return (mod as any).TextToSpeech ?? null;   // ← 问题所在
  } catch { return null; }
})();
```

async 函数 `return` 插件代理对象时，JS 会探测其 `.then` 属性，而 Capacitor 的插件 Proxy 把 `.then` 当成本插件方法调用，报 `TextToSpeech.then() is not implemented on android`，导致返回的 Promise **永不 settle**。

**真机实测（3 秒超时保护）**：

| 调用方式 | 结果 |
|---|---|
| `await (async () => { return TextToSpeech插件代理 })()`（= 现有写法） | **STILL PENDING after 3000ms → 永久挂起** |
| 直接 `plugin.getSupportedVoices()`（不经 async return） | **OK，63ms，返回 4 个语音** |

插件本身完全正常（`isPluginAvailable('TextToSpeech') === true`，`getSupportedVoices()` 63ms 返回 4 个），**只是返回方式把它变成了永久 pending**。`pluginPromise` 还被缓存，故永久失效。

**影响面**（`getNativeTts()` 的全部调用点）：

- `src/components/TTSSettings.tsx:117,120` — 设置面板「系统语音」列表永远加载不出
- `src/lib/use-tts.ts:960` — `probeTtsEngines()` 朗读自检**永久卡死**（讽刺的是该函数注释正写着要避免"卡死不出结果"）
- `src/lib/use-tts.ts:505-507` — `engine === 'native'` 分支的降级看门狗（539 行）注册在 `.then()` **内部**，Promise 不 settle ⇒ 看门狗永不注册 ⇒ 用户点朗读**静默无反应且不降级**
- `src/lib/use-tts.ts:318,866` — `getNativeTts().then(t => t?.stop())` 不执行，停止朗读时无法停止原生引擎
- `src/components/Layout.tsx:95` — 缺语音包引导逻辑不执行

**修复方向**：不要 `return` 插件代理。改为 `return { plugin: (mod as any).TextToSpeech }` 包一层，或在 `await import()` 之后用 `Promise.resolve().then(() => mod.TextToSpeech)` 之外的方式持有；最小改动是把返回值包进对象/数组，避开对插件对象本身的 thenable 探测。

---

### P1-1　云端 TTS 长文本 502（`prewarm` 未分片）

**位置**：`src/pages/ArticlePage/components/PageReader.tsx:446` → `src/lib/use-tts.ts:797`

```ts
// PageReader.tsx:446 — 传入的是「整个段落」
if (text) setTimeout(() => { try { ttsRef.current.prewarm(text, { rate: 0.85 }); } catch {} }, 120 * i);

// use-tts.ts:797 — prewarm 内部直接用完整文本构造 URL，不分片
const url = cfTtsUrl(cleaned, rate, settings.selectedVoiceURI, googleLangOf(...));
```

`speak()` 走的是分片路径（`use-tts.ts:820` `chunkText(cleaned)`，上限 180 字符，注释明确记着"200 通过、205 起上游返回 400 → 函数转成 502"），但 **`prewarm()` 漏了分片**。

**真机日志**（12 次 `Failed to load resource: 502`）：

```
https://nativethink.pages.dev/api/tts?text=It%20is%20a%20truth%20universally%20acknowledged...(350 字符)...&rate=0.90&lang=en
https://nativethink.pages.dev/api/tts?text=...(同段)...&rate=0.90&voice=en-US-AriaNeural
```

**独立复现**（从 PC 直连生产接口）：

| 文本长度 | 结果 |
|---|---|
| 11 字符 | ✅ HTTP 200（10,368 B，1086ms） |
| 135 字符 | ✅ HTTP 200（82,368 B，1213ms） |
| **350 字符**（与手机失败请求完全一致） | ❌ **HTTP 502** |
| 1050 字符 | ❌ HTTP 400 |

服务端上限在 `functions/api/tts.js:30`（>200 字符返回 400，上游 Google TTS 硬上限）。

**影响**：预热请求全部失败，被 `.catch(() => {})` 静默吞掉。实际朗读仍走分片路径**不受影响**，但每次进阅读器都会发出大量注定失败的请求（浪费流量、污染日志、占用 CDN）。其他 `prewarm` 调用点（单词/短句）均正常。

**修复方向**：`prewarm` 内部分片（或对超长文本直接跳过云端预热），与 `speak()` 的 180 字符策略对齐。

---

### P1-2　`/api/tts-voices` 端点不存在（404）

**位置**：`src/components/TTSSettings.tsx:143`

```ts
fetch('/api/tts-voices').then((r) => r.ok ? r.json() : null)...
```

`functions/` 目录下**没有** `tts-voices.js`（只有 `functions/api/tts.js`）。APK 内该请求被 `index.html:26` 的补丁改写为 `https://nativethink.pages.dev/api/tts-voices` → **线上稳定 404**（返回 HTML）。

代码注释写的是「Desktop build only」，但该 `fetch` 在**所有平台**无条件执行。

**影响**：功能无害（`r.ok` 为 false 时返回 null），但每次启动/进设置都产生一次无效请求 + 控制台 404 错误。**修复方向**：加平台判断（`isElectron()`）或删掉该死代码路径。

---

### P1-3　遥测 SDK 启动即报错

**真机日志**（3 次）：

```
Failed to init time offset: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

产物内定位（`dist/client/assets/index-BTnFFXUY.js`）：

```js
fetch(this.config.collectorUrl.time), ... BigInt(i.data.timestampNs) ...
catch(e){ console.error(`Failed to init time offset:`, e) }
```

这是 **OpenTelemetry 风格遥测 SDK**，来自依赖 `@lark-apaas/client-toolkit-lite`（`package.json:37`；项目包名为 `miaoda-vite-react-app`，即秒搭/飞书 aPaaS 模板）。它向远端 collector 取时间戳用于时钟校准，在 APK 内失败。

**影响**：启动期无效网络请求 + 控制台错误；此外该 SDK 会向第三方上报运行数据，**移动端离线场景与隐私合规都值得复核**。配套痕迹还有 `index.html:16` 的 favicon 指向字节跳动 CDN（`lf3-static.bytednsdoc.com/.../feisuda.svg`，即飞书文档图标），与产品品牌无关。

---

### P2-1　触摸目标普遍小于 44×44 px

真机逐路由统计（`button/a/[role=button]` 中宽或高 < 44px 的数量）：

| 路由 | 小触摸目标总数 | 其中视口内 |
|---|---|---|
| `/shadowing` | 146 | 23 |
| `/writing` | 128 | 27 |
| `/chunks` | 97 | 43 |
| `/spelling` | 43 | 32 |
| `/sentences` | 44 | 20 |
| `/` | 33 | 21 |
| 其余 | 22–32 | 20–29 |

实测样例（`/think` 页面）：TTS 设置按钮 **36×36**，正文喇叭按钮 **28×28**。点击 28×28 喇叭按钮可正常触发离线 TTS（触摸路径本身没问题），但命中面积偏小。

---

### P2-2　Header 最右侧「用户菜单」按钮超出屏幕 21px

真机精确几何（视口宽 393px）：

```
9 个图标按钮: left 24 → right 368  (28~36px 宽，全部在屏内)
第 10 个按钮: left 372 → right 414  ← 超出视口 21px，屏幕上只露出一半
其图标: lucide-user，无 aria-label
父容器: flex items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none]
```

容器 `overflow-x-auto` 但**滚动条被 CSS 隐藏**，用户无从得知可以横滑；且这是「用户菜单」入口。截图核验也确认最右图标被裁切。

---

### P2-3　输入框字号 15.4px（< 16px 阈值）

实测「全局单词搜索」输入框 `fontSize: 15.4px`。低于 16px 时 Android WebView 会在聚焦时自动放大页面，造成视口跳动。项目 `ui/input.tsx` 用的是 `text-base md:text-sm`（正确），但手写原生 input 的地方漏了。

---

### P3-1　外部网络依赖

单次冷启动抓到 **27 个外部请求**：Google Fonts（`fonts.googleapis.com` + 26 个 `fonts.gstatic.com` woff2 分片）+ 字节跳动 CDN favicon。国内网络下会明显拖慢首屏字体渲染，且与产品「离线优先」的定位不符。

---

### P3-2　内存占用增长明显

| 阶段 | TOTAL PSS | Native Heap |
|---|---|---|
| 首屏稳定后 | 195 MB | 31 MB |
| TTS 模型加载 + 多次合成后 | **1.17 GB** | **960 MB** |

离线 Kokoro 模型（`modelBytes: 114,203,756`）+ sherpa-onnx native 层合计约 1 GB 常驻。12 GB 设备尚可承受，但**低端机（4/6 GB）有被系统回收的风险**，值得列入观察。

---

### P3-3　其他

- **移动端底部导航只覆盖 6/13 路由**（首页/思维/语块/对话/文章/词汇），`/shadowing`、`/favorites`、`/writing`、`/sentences`、`/spelling`、`/progress` 上底栏无激活态。
- `/writing` 页面内容高 **19,004px（约 24 屏）**，DOM 节点 2017；从该页切走时主线程阻塞明显（首次走查在此超时）。

---

## 二、被真机数据否定的假设（重要：不要按这些改）

静态代码审计曾推断出以下问题，**真机实测均不成立**：

| 假设 | 真机实测 | 证据 |
|---|---|---|
| targetSdk 36 强制 edge-to-edge，状态栏压住 Header、手势条压住底部导航 | ❌ **不成立** | 像素级探针：`top:0` 红色标记出现在 y=152（正好是状态栏高度），`bottom:0` 蓝色标记出现在 y=2642..2719（可用区底边 2720）。`dumpsys` 显示 `overrideNonDecorInsets=[0,152][0,52]`，系统给了非零 insets，WebView 被正确约束。`env(safe-area-inset-*)` 实测确实全为 `0px`，但**内容并未被遮挡** |
| 大量 `opacity-0 group-hover:opacity-100` 按钮在触摸设备上完全不可见 | ❌ **基本不成立** | 逐路由审计：全站仅首页 1 例（那是收藏夹为空、卡片未渲染所致）。`/chunks`、`/writing`、`/progress` 等均检出 0 例 |
| `fixed bottom-0` 底栏遮挡滚动到底部的内容 | ❌ 不成立 | 滚到底部实测 `contentHiddenUnderNav: []`，无内容落入底栏区域 |
| 视口异常（`innerHeight` 788→464）是 bug | ❌ 正常行为 | `dumpsys input_method` 显示 `mInputShown=true`，是软键盘 `adjustResize` 的正常压缩；`blur()` 输入框后视口立即恢复 788 |

---

## 三、表现良好的方面（保持）

- **冷启动**：`am start -W` → `LaunchState: COLD, TotalTime: 766ms`
- **首屏渲染**：DOMContentLoaded 509ms / First Contentful Paint **600ms** / JS 堆仅 10MB
- **12 个路由全部正常渲染**，无白屏、无崩溃、无 React 错误边界触发；首次渲染 306–624ms，稳定 864–1764ms
- **无横向溢出**：`document.scrollWidth === innerWidth`（393）
- **离线 TTS 引擎工作正常**：`SherpaTts.init` → `{"status":"ready","sampleRate":24000,"cached":72,"loadedModels":[{"modelId":"kokoro","numSpeakers":54}],"modelBytes":114203756}`；真机触摸 28×28 喇叭按钮成功触发合成
- **全局单词搜索性能优秀**：可搜 **75,113 词 / 9 个等级**，JS 堆始终 10MB（未全量载入内存），秒级出结果
- 全程 logcat **无 FATAL / ANR / native crash**

---

## 四、改善方向（按优先级）

1. **修 `native-tts.ts:59`**：避免 async 函数 return Capacitor 插件代理（P0，一处改动可恢复 5 处功能）
2. **`prewarm` 补分片**：与 `speak()` 的 180 字符策略对齐，或对超长文本跳过云端预热（P1）
3. **清理 `/api/tts-voices`**：加 Electron 平台判断或移除，消除每次启动的 404（P1）
4. **评估遥测 SDK**：确认 `@lark-apaas/client-toolkit-lite` 在移动端是否必要，其上报是否符合隐私预期；顺带把 favicon 换成本地图标（P1）
5. **触摸目标提升到 ≥44px**：优先 `/shadowing`、`/writing`、`/chunks` 三个重灾区（P2）
6. **Header 工具栏**：最右侧用户菜单按钮移入屏内（或改为「更多」溢出菜单），并让横滑有可见提示（P2）
7. **输入框统一 16px 下限**：排查手写原生 input（P2）
8. **本地化字体**：Google Fonts 改为自托管子集，favicon 本地化（P3）
9. **低端机内存验证**：在 4–6 GB 设备上复测 TTS 常驻内存（P3）
10. **`/writing` 长列表虚拟化**：24 屏 DOM 一次性渲染（P3）

---

## 附：测试产物

原始数据保存在 `%TEMP%\nativethink-mobile-test\`：`walk-report.json`（12 路由指标）、`net-report.json`（网络捕获）、`events.jsonl`（51 条 console/异常事件）、`route-*.png`（各路由截图）、`logcat.txt`。
