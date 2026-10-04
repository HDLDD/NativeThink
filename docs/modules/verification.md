# 验证体系

> 本项目**没有测试框架**。防线是：`npm run typecheck` + `npm run lint:eslint` + `npm run build:web` + 20 条可跑的 `scripts/verify-*.mjs` 契约守卫（另有需要基线参数的 verify-wordbank-split 与作为全量跑法的 verify-all，共 22 个文件） + 无头 Chrome/CDP 行为验收 + 真机 CDP 通道。
> 一句话原则：**证据来自产物和真运行，不来自读代码**。

## 1. 契约守卫（`scripts/verify-*.mjs`）

2026-09-29 实测全绿；2026-09-30 复测并校准 vocab-cards（284 → 290 → 298：⑤b「每轮数量只在起跑页改」7 条 + ⑧c「复习检测评分静默」+ ⑧d「练习界面零提示」共 13 条）、新增 study-credit（74，14 条变异全红）、把 vocab-caches 从 21 扩到 67（10 条变异全红，新增注入 localStorage 替身真跑）、rv-articles 从 55 扩到 104（累计 27 条变异全红 + 42 项 CDP 行为验收）、cloud-sync 从 18 扩到 43（10 条变异全红 + 12 项 CDP，含 `sync-down` 用假 target 真跑）。2026-10-05：反馈功能下架 —— `verify-feedback-loop`（58 断言）随功能删除，其中的**挂载类断言**（Layout 挂 Header、全站唯一 `<Toaster />`）迁移并强化进 overlay-fit ⑤，另新增 `verify-app-version`（11 断言）钉版本号 meta 链路。**收尾一律 `npm run verify:all`**（§5）。断言数如下：

| 脚本 | 断言 | 守什么 | 什么时候必须跑 |
|------|------|--------|----------------|
| `verify-shadowing-completion.mjs` | 27 | 跟读完成标记的**索引契约**：`shadowing-progress.ts` 纯函数真跑（删除位移/跨语料隔离/原句不可删）+ 页面接线（删句传合并索引、键构造单一来源、AI 分析判空）；带"退回旧调用方式"的正对照。2026-10-05 起还守语音标注 `<u>` 渲染（renderAnnotated 接线 / 旧剥标签写法正对照 / 剥注释后无危险注入） | 改 `ShadowingPage` 完成标记 / 语音标注渲染 / `shadowing-progress.ts` |
| `verify-backup-idb.mjs` | 16 | 「导出学习数据」真的含整书译文：IDB 替身真跑 `dumpBookTranslationCache`（有/无缓存、超上限、跨书隔离）+ 旧枚举方式的正对照 + backup.ts 接线 | 改 `backup.ts` / `book-translation.ts` 缓存层 |
| `verify-sentence-lab.mjs` | 16 | 拆句训练主干判定**索引同源**：真转译 `sentence-parse.ts` 跑出 `stdParts` 与 `segments` 的分歧（缩约形式跨意群那个真实例子）、坏数据不再产生假成功；守 ChunkDrill 候选来自 resolved、reveal 在 grade 之前拦 | 改 `sentence-parse.ts` / `ChunkDrill.tsx` |
| `verify-spelling-resume.mjs` | 24 | 拼写断点**按词书分键**：注入替身真跑 persist/读/迁移/清理，含「旧全局单键只剩最后一本」的正对照；守页面与重置流程都走同一模块 | 改 `spelling-resume.ts` / `SpellingPage` 断点 / 拼写重置 |
| `verify-ai-parse.mjs` | 10 | AI 解析约定全仓扫：每个 `extractJson` 调用点前必须有 `.trim()` 判空、不许残留贪婪 `match(/…[\s\S]*…/)`；**注释行不参与判定**，并用三段固件自证检查器本身有效 | 新增/改动任何 AI 调用点 |
| `verify-cloud-sync-hygiene.mjs` | 70 | 云同步契约：转译**真实** `use-cloud-sync` + `safe-storage` 在 Node 里驱动 —— 下行后 0 次 POST（回声）、同键本地再写必须 1 次 POST（正对照）、空 catch 数为 0、周期补推按需且 `needsResync` 引用稳定；④ 用假 target 真跑 `sync-down`（通知/退订/异常隔离/事件名一致）+ **13 个订阅者逐个点名** + "没有任何 hook 再自己拼事件名" + SM-2/语块/拼写三道回声判据；④b 三处模块级缓存"重读前必须先 invalidate"的静态形态；⑤ **编译三个缓存库真跑**"不作废拿旧值（正对照）→ 作废拿新值"，防"订阅了但被缓存挡住"的假绿 | 改 `use-cloud-sync.ts` / `sync-down.ts` / `CloudSyncProvider.tsx` / `safe-storage.ts` 双写钩子 / 任何 `useSyncDown` 调用点 |
| `verify-wordbank-loading.mjs` | 45 | 加载层集成：显示数 = 出卡池子、九本不互抢、IDB 失败才兜底 localStorage | 改词库或加载层 |
| `verify-wordbank-split.mjs` | 数据全量比对 | 拆分校验：`--baseline` 采基线（**拆分前后都能采**）、`--check` 逐项断言 | 改词库拆分 |
| `verify-books-meta.mjs` | 227 | ①–④ 生成器与数据不漂移；⑤ books/book-clean/books-meta 拆分（**实际加载两个模块交叉核对**）；⑥ HelpGuide 文案 vs `meta.ts`/`ai-config.ts` | 改书单、scp、reader-highlight |
| `verify-vocab-cards.mjs` | 310 | 背单词卡片交互契约 + 手势决策表 + 换卡节奏（数值锁）+ 答错重排延后 + 静默契约 + 换书路径 + 预载门 + HelpGuide 内容 + 单词字号三档（FitWord 不许复活） | 改 FlashcardMode/QuickCardMode/vocab-* |
| `verify-vocab-caches.mjs` | 85 | 缓存与存储写入基建：`cappedPut`/`mergeCollocAiCache`/`appendCapped`/`trimOldest` 纯函数**真跑** + **注入 localStorage 替身真跑 safe-storage/capped-cache**（配额满时 `setItem`/`persistJson` 返回 false、`warnStorageFull` 60s 只提示一次）+ 九个不可重算清单的接线与派生缓存的上限数值；⑥ `trimOldest` 滚动窗口双封顶（写作历史 50 条/256KB、跟读完成标记 2000 条/64KB）契约 + 两个调用点接线 | 改缓存基建接线 / 改任何 `persistJson`·`cappedPut`·`trimOldest` 调用点 |
| `verify-tts-progress.mjs` | 6175 | 「读到哪」反查表恒等式：各段词数之和 === 各切片词数之和（书目 22 / 页 419 / 切片 3785 + 5 项脚手架自检） | 改 TTS 切片上限或阅读器朗读逻辑 |
| `verify-tts-hardening.mjs` | 15 | A 原生静态（无 `new Thread().start()`、有界线程池 + 队列上限）4 项；B 真实模块在途去重 6 项；C 桌面限定 5 项 | 改降级链路或预合成 |
| `verify-app-version.mjs` | 11 | 版本号**单一载体**链路：version.properties（源）→ vite 构建期替换 `{{appVersion}}`（注入）→ index.html 占位符 meta（载体）→ ensure-web-build 按 meta 核对且不再引用 `__APP_VERSION__`（消费）→ 产物存在时 index/404 两页 meta 与源一致且非占位符（端到端）；全仓剥注释扫旧 define 不许复活。缺 dist 时产物段声明跳过 | 改版本号管线（`version.properties` / `vite.config` 的 fixHtmlPlaceholders / `ensure-web-build.mjs` / index.html 的 meta） |
| `verify-brand-fonts.mjs` | 26 | 品牌资产自托管（大陆可达，替代 fonts.googleapis.com）：源侧零外链域名 + @font-face 恰三条（400/600/700）指向 `/fonts/*.woff2` + woff2 真文件（`wOF2` magic + header 声明长度与文件长度自洽，防占位/截断）+ OFL 许可证随附；**icon 链接零 http 外链 + 本地 `/favicon.svg` 链接在位且文件存在（正对照；2026-10-05 清掉模板遗留的字节 CDN shortcut icon）**；两处 `--font-sans` 都不含 `'Noto Sans SC'` 且以 `'Plus Jakarta Sans'` 开头（正对照：不是删外链了事）；产物段核对 dist 的 index/404（字体域名与 icon 同扫）、fonts/ 与构建出的 CSS（缺 dist 声明跳过）。**剥注释后扫描** —— 溯源自述里写着旧域名与 Noto 字样 | 改 index.html 字体引用 / icon / `public/fonts/` / `tailwind-theme.css` 字体栈 |
| `verify-overlay-fit.mjs` | 28 | 窄视口浮层契约：Dialog/Popover 基座 + 朗读设置/AI 设置面板结构 + ④ 贴顶全屏层自带 safe-area + ⑤ 全站唯一 `<Toaster />` 出口（剥注释全仓扫描，Layout 必须渲染 Header；迁移并强化自已删的 verify-feedback-loop） | 改 `ui/dialog` 基座、那两个面板或 `src/index.tsx`/`Layout.tsx` 挂载点 |
| `verify-bundle-budget.mjs` | 10 | 从**产物**反查入口静态依赖图：首屏必需集合里不许出现 recharts/markdown/词库数据 chunk；gzip 总量 ≤ 预算 | 改 `vite.config` 的 manualChunks、壳里新增静态 import/require |
| `verify-list-scaling.mjs` | 18 | 一屏渲染不完的列表必须折叠/分页：写作题库默认 12 张、词库浏览分页、**语块短语库每字母段默认 6 条且 A-Z 跳转仍可达每一段**（各配「不许退回全量 `.map`」的正对照） | 新增长列表页 |
| `verify-rv-articles.mjs` | 104 | 复习词汇文章：纯函数**真跑**（并集/**删文章即回词表**/切批与上限、`rvParaCount` 上下限、`buildRvPrompt` 带体裁与主题且「不限」不硬塞、`coveredReviewWords` 用阅读器那套形态归并且**不过度归并**、`rvRegenKeys` 取词优先级）+ 页面接线（`rvWords` 只记真出现的词、覆盖只看英文正文、逐篇串行、先落盘再计成功、历史 `aiId` 可重开、收藏口径、**重写保持原 id 且不靠先删再存**）+ 旧缺陷正对照（`slice(0,10)` 不许回来） | 改 `rv-articles.ts` / `ArticlePage` 复习词汇面板 / 已保存文章列表 |
| `verify-study-credit.mjs` | 74 | 学习时长记账：`creditKey`/`makeCreditGate` **真跑**（同键只放行一次、FIFO 淘汰后可重计、上限 400）+ 七个提交点接线（键同时含动作类型/题面/原文，且**计时仍在请求之前**）+ 口径双向锁（不许改成"AI 回了才计"，也不许把**本地动作**套上闸门）+ 句子学习造句那处的**刻意不同**（判空之后才计） | 改 `study-credit.ts` / 任何 `addStudyMinutes`/`creditOnce` 调用点 |

命令（`AGENTS.md` 的「常用命令」有全集）：

```bash
node scripts/verify-wordbank-loading.mjs
npm run verify:rv-articles            # 有 npm script
node scripts/verify-tts-hardening.mjs # 注意：这个没有 npm script，只能裸跑
node scripts/verify-bundle-budget.mjs # 必须先 npm run build:web
node scripts/verify-app-version.mjs   # 产物段同样依赖 build:web（缺 dist 会声明跳过）
```

`npm run check:tts-voices` 是资产校验（不是断言计数，输出 errors 列表），已嵌进 `package:apk` 前置，失败 `exit 1` 阻断打包。

| `verify-chain-verdict.mjs` | 36 | 语块接龙判定的三档语义：真跑 `parseChainVerdict`（首行才算、整词+有限后缀、`PASTA`/`PASSAGE`/`FAILSAFE` 不算、正文里的 PASS 不算、空回复算未判定）+ `chainScoreFor` 只给 pass 分 + 页面接线（分数单点来自 `chainScoreFor`、未判定不前进不清空、catch 不送分、旧写法 `!== 'FAIL'` 不许回来 —— **剥掉注释再扫**，否则我们自己写的解释性注释会把它判红） | 改 `chain-verdict.ts` / `handleChainSubmit` |

## 2. 行为验收：本机无头 Chrome + CDP

内置浏览器的视口实测是 0×0，截不了图 —— 所以视觉/行为验收走**本机 Chrome headless + CDP**。用于：

- 路由烟测（12/12 条路由能进、DOM 里关键文本在）
- 首屏长任务与下载量测量（`PerformanceObserver` 注册**一次**，写在路由循环里会把重复值算进去）
- 词汇向导 A/B/C/D 四段路径真点一遍（23 项行为断言）

坑：Windows Git Bash 下 MSYS 会把 `/,/vocabulary,/articles` 这类参数改写成 `C:/Program Files/Git/…`，导致「Cannot navigate to invalid URL」。加 `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`。同类：`/tmp` 在 Node 里会解析成 `B:\tmp`（用 `%TEMP%`），模板字符串会把 `\s` 吃掉（用 `String.raw`）。

## 3. 真机通道

该 ROM 对 adb shell 一刀切拒 `INJECT_EVENTS`（`input tap` 报 SecurityException）—— **USB 与无线两条通道都一样**（2026-10-01 两轮走查各验一次），标准通道是 `scripts/device-eval.mjs`：

```bash
adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
# socket 名：adb shell cat /proc/net/unix | grep webview_devtools_remote
node scripts/device-eval.mjs eval "document.title"
node scripts/device-eval.mjs tap 400 1630    # 物理像素，自动折算 CSS
node scripts/device-eval.mjs shot .screen.png
```

五条真机通道自己的坑（2026-09-30 / 10-01 两次走查踩到，都是"脚本没错、通道错了"那类）：

1. **收尾脚本里不要发 `Browser.close`** —— 在本机无头 Chrome 上它只是关浏览器，但在真机 WebView 上它把**整个 WebView 一起关掉**，于是转发指向的 socket 立刻消失，下一个脚本报 `ECONNREFUSED ::1:9223`，看起来像"设备掉线"。收尾用 `ws.close()`；要真的归位就发 `adb shell am force-stop`。
2. **整页导航会销毁执行上下文**：`location.href=…` / `location.reload()` 之后注入过的 `window.__X` 全没了。任何 `waitFor` 在导航后引用它都是假失败 —— 判据要么只用原生 DOM 表达式，要么导航后**重新注入**helpers。
3. **走查不许拿用户进度当测量代价**：复习检测概览页有两个入口 —— 「开始复习（N 张）」**重建本轮队列并覆盖断点**，「接着上次（还剩 M 张）」保留原队列。帧测这类只读走查一律点「接着上次」；会写 SM-2 与学习时长的评分，走查完要**如实报数**。
4. **`settings put global` 两条通道都拒不（WRITE_SECURE_SETTINGS）**，`svc power stayon usb` 是空操作 —— 屏幕超时改不了，只能让脚本适应：**息屏会停摆 rAF、但不停 setTimeout**，所有轮询/等待一律 setTimeout（字号采样就是息屏状态下跑完的）；input 系全被拒（USB 也一样），重开应用用 `monkey -p com.nativethink.app -c android.intent.category.LAUNCHER 1`。
5. **CDP `Page.captureScreenshot` 在这台 WebView 上经常 20s 超时** → 截图退化到 `adb exec-out screencap -p`（Node 里用 `execFileSync(ADB, [argv 数组])`，别拼 shell 字符串）；设备半路掉线时 **WebSocket 静默死亡会让顶层 await 悬空、Node 无提示退出** —— harness 定型：`setInterval(()=>{},1000)` 保命 + 每次 send 带超时 + `ws.onclose` 打日志，让掉线变成超时报错而不是静默死。

2026-10-01 实测：字号档位本机 51/51（逐张绝对值 36/30/48）、真机 53/53（15 张样本，缩放系数 z ∈ [1.100, 1.100]，48→52.8 · 36→39.6 · 30→33，同档一致 + 跨档严格有序）；零提示验收真机 29/29（复习检测/每日学习/快速闪卡三模式的评分（含答错重排路径）/ 翻面 / ★收藏 / 自动发音开关 / 续学入口，**每条交互都带"点击真的落到地"的正对照**，收藏与开关净零还原并复验）。两条真机通道（无线、USB）各独立跑完一轮，结果一致（53/53 + 29/29 ×2）。

顺带几条实测事实（都直接影响自动化判据）：复习检测**正面只有词，五档评分在背面**（点卡片才翻面），"评分按钮在不在"的判据必须先翻面再查；而且 `data-fit-box` **只在正面渲染** —— 背面时读词面会拿到 null，所以"换卡前的那个词"必须趁正面先抓下来。第三坑：**本轮已评过、被重排再次抽到的那张是回看卡，没有评分按钮**（出口只有「按 → 继续」），自动点评分的脚本遇到它必须走 `ArrowRight` 跳过 —— 否则报的是"按钮找不到"，看起来像产品坏了。第四坑：**真机 WebView 把系统字体缩放应用到页面全部文字**（Android 14+/targetSdk 36 实测恰好 ×1.100：36→39.6、30→33、48→52.8）—— 真机字号判据只能是"成比例 + 同档一致 + 跨档严格有序"，绝对值断言留给本机无头 Chrome。第五坑：每日学习有断点时**自动续学直达卡面**（没有起跑卡可点，入口得写状态机），且**会话中隐藏练法/设置** —— 按"练法切换（闪卡/复习）按钮在练习界面能点到"写脚本会 MISS 到底还静默通过（假绿），练法选项实际在起跑卡上、叫「闪卡/选择题/拼写/听写/配对/填空」。

纪律（用户要求，见记忆）：**操作用户手机前先报备**；设备段默认跳过（要 `E2E_DEVICE=1`）；走查收尾必须 `force-stop` 归位。另外 `execFileSync(adb, ['shell','cat','/proc/net/unix'])` 会挂住（0 字节输出），别这么读。

## 4. 写守卫的四条硬规矩

这几条都是从真实翻车上来的，不是风格偏好：

1. **替身必须忠实于真实接口**。`verify-vocab-caches` 的 localStorage 替身必须真抛 `QuotaExceededError`（只存值不抛错，配额失败路径就测不出来）；`verify-cloud-sync` 的假 target 要对齐 `sync-down` 真跑用的事件名与退订形状。替身比真实行为宽松 = 假绿。
2. **元判据要带正对照（counterfactual）**。每条"不许出现 X"的断言，都要配一条"该出现的地方确实在出现"。例：`verify-tts-hardening` C1 断言只有桌面发请求，正对照是 Electron UA 下仍发 12 次；`verify-list-scaling` 断言折叠存在，正对照是不许有 `allPrompts.map(` 全量渲染。
3. **文案变了要重新推导对齐断言，而不是放宽它**。断言数**只增不减**，除非删功能。
4. **没定性就停住，别改绿**。自己抓到的反例：HelpGuide 的词数断言在变异掉两处出现之一后仍然通过 → 重写成「计数 + 禁止出现词条数那个数字」，再跑变异才变红。
5. **改完一个模块要跑"引用了同一处源码"的所有守卫，不是只跑自己那条**。2026-09-30 真实翻车：复习词汇文章改造把 `highlightWords: words.map(...)` 换成了统一构造的 `highlightWords: args.keys`，`verify-rv-articles` 当天全绿，而 `verify-books-meta` 里那条同样盯这个写法的断言**已经悄悄失效**（它读的还是同一个 `ArticlePage.tsx`）—— 直到后来跑全量才发现。教训落成了习惯：见 §5 的全量跑法，收尾必跑。
6. **一次性的"看到了"不算证据，能复现的 A/B 才算**。同日真实教训：真机 83 上查「待复习词的颜色」那一行没出现，我就把它写成"实测到的断层"并照着去修。回头在 84 上同一步骤重量，那一行又出现了 —— 把那篇文章的存储读出来才对上：它其实带 `highlightWords=50`，旧写法照样会出那一行，所以 83 那次读数根本不支持我的结论（阅读器在章节未点进时的渲染时序 / 我量的是刚打开的那一瞬，都可能是原因）。修法是把判据换成**可复现的 A/B**：本机一次性 profile 里塞一篇只有 `rvWords` 的老形状文章 → 有回退时颜色行「（3 个）」+ 真框出 3 处；把源码临时改回旧写法（按 sha256 还原）→ 颜色行消失 + 0 处。**结论：修是修对了（第二类文章确实没高亮），但记录里的证据必须换成这次 A/B，不能留着那条我复现不了的"真机实测"。**

## 5. 全量跑法（收尾必跑）

```bash
npm run verify:all        # scripts/verify-all.mjs：typecheck + 全部 verify-*.mjs，一条红就退出码 1
```

它自动发现 `scripts/verify-*.mjs`，所以新增守卫不用登记。两处刻意跳过：`verify-wordbank-split`（要 `--baseline/--check` 的基线文件）、`verify-bundle-budget`（没有 `dist/client` 产物时跳过 —— **先 `npm run build:web` 再跑才算真验过体积**）。

2026-10-01 实测：typecheck + 19 条守卫全绿，**断言合计 7,294 条**（tts-progress 一条就占 6,175；其余 18 条相加：45+227+310+67+15+16+10+18+23+23+16+43+16+24+10+104+74+36+58 = 1,119。vocab-cards 310 = 原 303 + 单词字号回退那 7 条（FitWord 不许复活 + 三模式档位与 `break-words` 各一条，变异 4/4 变红）；books-meta 227 = 原 222 + 复习词高亮回退那 6 条（其中一条是"旧写法必须消失"的反向正对照））。

2026-10-05 反馈下架后复测：typecheck + 19 条守卫全绿，**断言合计 7,252 条**（= 7,294 − 58 + 5 + 11：删除 verify-feedback-loop 58；overlay-fit 23 → 28，新增的 5 条是迁入的挂载类断言；新增 verify-app-version 11。tts-progress 6,175；其余 18 条相加：45+227+310+67+15+16+10+18+28+23+16+43+16+24+10+104+74+36+11 = 1,077）。

2026-10-05 同日再测（技术债 #10 双封顶落地）：verify-vocab-caches 67 → 85（⑥ `trimOldest` 双封顶契约与两处接线 18 条，4 条变异全红），typecheck + 19 条守卫全绿，**断言合计 7,270 条**（= 7,252 + 18。tts-progress 6,175；其余 18 条相加：45+227+310+85+15+16+10+18+28+23+16+43+16+24+10+104+74+36+11 = 1,095）。

2026-10-05 第 3 测（HelpGuide 审计 + 跟读语音标注修复批次）：typecheck + 19 条守卫全绿（verify-wordbank-split 跳过），**断言合计 7,274 条**（= 7,270 + 4。tts-progress 6,175；其余 18 条：45+227+310+85+15+16+11+28+10+18+27+43+16+24+10+104+74+36 = 1,099 —— shadowing-completion 23 → 27，新增语音标注 `<u>` 渲染 4 条，变异退回旧写法红 2 条）。

2026-10-05 第 4 测（品牌字体自托管落地，ROADMAP #7）：新增 verify-brand-fonts 22（三段契约：源侧零外链 / woff2 真文件与 OFL 随附 / 生效栈正对照；4 组变异全红 —— 复加外链、删字体文件、塞回 'Noto Sans SC'、截断 woff2；修掉守卫自身 `.map(basename)` 收不到下标的崩溃后，删文件红点从异常改为两条明确断言）。行为验收：无头 Chrome + CDP 对 `dist/client` 实跑 **9/9**（零 fonts.googleapis/gstatic 请求、三 woff2 全 200 且 MIME font/woff2、`document.fonts.check` 400/600/700 全 true、FontFace 全 loaded、body 计算栈含 Plus Jakarta Sans、控制台零错误）。typecheck + 20 条守卫全绿（verify-wordbank-split 跳过），**断言合计 7,296 条**（= 7,274 + 22。tts-progress 6,175；其余 19 条：45+227+310+85+15+16+11+28+10+18+27+43+16+24+10+104+74+36+22 = 1,121）。

2026-10-05 第 5 测（云同步下行订阅收尾，ROADMAP #10 末项）：verify-cloud-sync-hygiene 43 → **70**（订阅者 7 → 13 逐个点名；④b 三个模块级缓存库"先作废再重读"静态 + SM-2/语块/拼写回声判据；⑤ 把 `custom-words` / `word-notes` / `quickcard-history` 转译编译后在 Node 真跑：本地写 → 走 `safeStorage`（下行落地同一条通道）模拟云端改存储 → **正对照**不作废缓存时读到旧内存 → 作废后读到新值）。4 组变异、10 条红点全部命中：回退裸 `read()` 红 1、三处 invalidate 置空红 6（3 静态 + 3 行为）、删掉一个订阅红 1、拆拼写两处回声守卫红 2（首轮因变异脚本给 CRLF 文件用 `\n` 搜索未生效，复做并先自证替换落地后才认数）。typecheck + 21 条守卫全绿（verify-wordbank-split 跳过），**断言合计 7,323 条**（= 7,296 + 27。tts-progress 6,175；其余 19 条：45+227+310+85+15+16+11+28+10+18+27+70+16+24+10+104+74+36+22 = 1,148）。

2026-10-05 第 6 测（favicon 外链清理）：`index.html` 原挂着模板遗留的 `lf3-static.bytednsdoc.com` shortcut icon（`rel="shortcut icon"`，声明在本地 `/favicon.svg` 之后）。**先判别实验再下结论**（本机 Chromium，A/B/C/D 四组并列 icon 测试页，逐组独立 URL + `no-store` 防 favicon 缓存）：A 组（= 原 index.html 形态：typed 本地在前、untyped 外链在后）抓的是本地——外链 URL 从未被请求；B 组换序后仍抓带 `type` 的那个；C/D 组同为无 type / 同为 typed 时取**先**声明者。即：带 `type` 的 SVG 优先、同型取先声明者，原形态下该外链是**惰性残留**（此前"取后声明者、图标被遮"的写法未经验证，已按实测更正）；但取舍规则是实现细节（老浏览器可能选中它），属真实外部依赖。删除外链；verify-brand-fonts 22 → **26**（A 段 +2：icon 链接零 http 外链 + 本地 `/favicon.svg` 链接在位且文件存在；C 段 +2：产物 index/404 同扫）。4 组变异 5 条红点全部命中：复加外链红 1、删本地链接红 1、挪走 `favicon.svg` 红 1、往 dist 注入外链红 2；还原后终验绿。typecheck + 21 条守卫全绿（verify-wordbank-split 跳过），**断言合计 7,327 条**（= 7,323 + 4。tts-progress 6,175；其余 19 条：45+227+310+85+15+16+11+28+10+18+27+70+16+24+10+104+74+36+26 = 1,152）。

## 6. 静态检查的已知弱度

- **`npm run typecheck` 是弱守卫**：`tsconfig.app.json` 从 `node_modules/@lark-apaas/coding-presets-react/lib/tsconfig/tsconfig.app.json` 继承了 `strict: false`、`noImplicitAny: false`、`noUnusedLocals: false`、`noUnusedParameters: false`。所以"类型过了"不等于"类型检查过了"。
- **「两端都写了却点不到」静态检查看不出来**：组件与云函数都存在、没有任何页面挂载 → 只有把挂载点写成断言才守得住（`verify-overlay-fit` ⑤ 剥注释全仓扫描，`<Toaster />` 只许挂在 `src/index.tsx` 一处，Layout 必须渲染 Header）。
- **「源码里是 lazy、产物里不是」也看不出来**：强制 `manualChunks` 或壳里同步 `require` 都会把库变成入口 chunk 的静态依赖 → 只有 `verify-bundle-budget` 从产物反查才看得见。
- **`verify-bundle-budget` 的预算是 600KB**（`:79`），当前实测首屏必需 JS **195.9KB gzip / 11 个 chunk**（2026-10-05，反馈下架后；反馈组件与它的挂载代码让入口 chunk 减了近 4KB）。预算头寸很大是有意的（壳 + react/router/radix/motion/icons + 词库加载器 + utils 的天然体量），但别把它当"体积没问题"的证明 —— 具体数字每次都打印，看那一行。
- **TTS 引擎候选顺序没有任何断言**（`verify-tts-hardening` 只读 `sherpa-tts.ts`/Java/`TTSSettings.tsx`）。
- **句子学习与句子拼写各有自己的守卫**（`verify-sentence-lab` 16 条、`verify-spelling-resume` 24 条），但只覆盖"主干索引同源/断点分键"这类关键契约，其余交互仍要靠无头 Chrome 真点。
- **`.wrangler/` 是本地构建残留，不要 commit**（2026-10-05 已进 `.gitignore`）。
