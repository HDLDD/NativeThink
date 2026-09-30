# 验证体系

> 本项目**没有测试框架**。防线是：`npm run typecheck` + `npm run lint:eslint` + `npm run build:web` + 19 个 `scripts/verify-*.mjs` + 无头 Chrome/CDP 行为验收 + 真机 CDP 通道。
> 一句话原则：**证据来自产物和真运行，不来自读代码**。

## 1. 契约守卫（`scripts/verify-*.mjs`）

2026-09-29 实测全绿；2026-09-30 复测并校准 vocab-cards（284）、新增 rv-articles（55，13 条变异测试全红）、新增 study-credit（74，14 条变异测试全红 + 31 项 CDP 行为验收）。断言数如下：

| 脚本 | 断言 | 守什么 | 什么时候必须跑 |
|------|------|--------|----------------|
| `verify-shadowing-completion.mjs` | 23 | 跟读完成标记的**索引契约**：`shadowing-progress.ts` 纯函数真跑（删除位移/跨语料隔离/原句不可删）+ 页面接线（删句传合并索引、键构造单一来源、AI 分析判空）；带"退回旧调用方式"的正对照 | 改 `ShadowingPage` 完成标记 / `shadowing-progress.ts` |
| `verify-backup-idb.mjs` | 16 | 「导出学习数据」真的含整书译文：IDB 替身真跑 `dumpBookTranslationCache`（有/无缓存、超上限、跨书隔离）+ 旧枚举方式的正对照 + backup.ts 接线 | 改 `backup.ts` / `book-translation.ts` 缓存层 |
| `verify-sentence-lab.mjs` | 16 | 拆句训练主干判定**索引同源**：真转译 `sentence-parse.ts` 跑出 `stdParts` 与 `segments` 的分歧（缩约形式跨意群那个真实例子）、坏数据不再产生假成功；守 ChunkDrill 候选来自 resolved、reveal 在 grade 之前拦 | 改 `sentence-parse.ts` / `ChunkDrill.tsx` |
| `verify-spelling-resume.mjs` | 24 | 拼写断点**按词书分键**：注入替身真跑 persist/读/迁移/清理，含「旧全局单键只剩最后一本」的正对照；守页面与重置流程都走同一模块 | 改 `spelling-resume.ts` / `SpellingPage` 断点 / 拼写重置 |
| `verify-ai-parse.mjs` | 10 | AI 解析约定全仓扫：每个 `extractJson` 调用点前必须有 `.trim()` 判空、不许残留贪婪 `match(/…[\s\S]*…/)`；**注释行不参与判定**，并用三段固件自证检查器本身有效 | 新增/改动任何 AI 调用点 |
| `verify-cloud-sync-hygiene.mjs` | 18 | 云同步三条不变量：转译**真实** `use-cloud-sync` + `safe-storage` 在 Node 里驱动 —— 下行后 0 次 POST（回声）、同键本地再写必须 1 次 POST（正对照）、空 catch 数为 0、周期补推按需且 `needsResync` 引用稳定 | 改 `use-cloud-sync.ts` / `CloudSyncProvider.tsx` / `safe-storage.ts` 的双写钩子 |
| `verify-wordbank-loading.mjs` | 45 | 加载层集成：显示数 = 出卡池子、九本不互抢、IDB 失败才兜底 localStorage | 改词库或加载层 |
| `verify-wordbank-split.mjs` | 数据全量比对 | 拆分校验：`--baseline` 采基线（**拆分前后都能采**）、`--check` 逐项断言 | 改词库拆分 |
| `verify-books-meta.mjs` | 222 | ①–④ 生成器与数据不漂移；⑤ books/book-clean/books-meta 拆分（**实际加载两个模块交叉核对**）；⑥ HelpGuide 文案 vs `meta.ts`/`ai-config.ts` | 改书单、scp、reader-highlight |
| `verify-vocab-cards.mjs` | 284 | 背单词卡片交互契约 + 手势决策表 + 换卡节奏（数值锁）+ 答错重排延后 + 静默契约 + 换书路径 + 预载门 + HelpGuide 内容 | 改 FlashcardMode/QuickCardMode/vocab-* |
| `verify-vocab-caches.mjs` | 21 | `cappedPut`/`colloc-ai-cache` 纯函数 + 各调用方接线（键名、封顶、落盘走 effect） | 改缓存基建接线 |
| `verify-tts-progress.mjs` | 6175 | 「读到哪」反查表恒等式：各段词数之和 === 各切片词数之和（书目 22 / 页 419 / 切片 3785 + 5 项脚手架自检） | 改 TTS 切片上限或阅读器朗读逻辑 |
| `verify-tts-hardening.mjs` | 15 | A 原生静态（无 `new Thread().start()`、有界线程池 + 队列上限）4 项；B 真实模块在途去重 6 项；C 桌面限定 5 项 | 改降级链路或预合成 |
| `verify-feedback-loop.mjs` | 58 | 反馈前后端对接：**用忠实 KV + webhook 替身真实执行后端 handler**，含正对照；并断言 Header 挂载 `<FeedbackDialog />`、全站 `<Toaster />` 挂载、以及历史标签按 `pushed` 区分「已送达 / 已留档」 | 改 FeedbackDialog / use-feedback / `functions/api/feedback/submit.js` |
| `verify-overlay-fit.mjs` | 16 | 窄视口浮层契约：Dialog/Popover 基座 + 朗读设置/AI 设置面板结构 | 改 `ui/dialog` 基座或那两个面板 |
| `verify-bundle-budget.mjs` | 10 | 从**产物**反查入口静态依赖图：首屏必需集合里不许出现 recharts/markdown/词库数据 chunk；gzip 总量 ≤ 预算 | 改 `vite.config` 的 manualChunks、壳里新增静态 import/require |
| `verify-list-scaling.mjs` | 18 | 一屏渲染不完的列表必须折叠/分页：写作题库默认 12 张、词库浏览分页、**语块短语库每字母段默认 6 条且 A-Z 跳转仍可达每一段**（各配「不许退回全量 `.map`」的正对照） | 新增长列表页 |
| `verify-rv-articles.mjs` | 55 | 复习词汇文章：3 个纯函数全边界单测（并集/**删文章即回词表**/切批与上限、余量不消费）+ 页面接线（`rvWords` 落盘、逐篇串行、先落盘再计成功、失败/超量不消费、历史 `aiId` 可重开、收藏口径）+ 旧缺陷正对照（`slice(0,10)` 不许回来） | 改 `rv-articles.ts` / `ArticlePage` 复习词汇面板 / 已保存文章列表 |
| `verify-study-credit.mjs` | 74 | 学习时长记账：`creditKey`/`makeCreditGate` **真跑**（同键只放行一次、FIFO 淘汰后可重计、上限 400）+ 七个提交点接线（键同时含动作类型/题面/原文，且**计时仍在请求之前**）+ 口径双向锁（不许改成"AI 回了才计"，也不许把**本地动作**套上闸门）+ 句子学习造句那处的**刻意不同**（判空之后才计） | 改 `study-credit.ts` / 任何 `addStudyMinutes`/`creditOnce` 调用点 |

命令（`AGENTS.md` 的「常用命令」有全集）：

```bash
node scripts/verify-wordbank-loading.mjs
npm run verify:feedback-loop          # 只有这一个有 npm script
npm run verify:rv-articles            # 同上，也有 npm script（本轮新增）
node scripts/verify-tts-hardening.mjs # 注意：这个没有 npm script，只能裸跑
node scripts/verify-bundle-budget.mjs # 必须先 npm run build:web
```

`npm run check:tts-voices` 是资产校验（不是断言计数，输出 errors 列表），已嵌进 `package:apk` 前置，失败 `exit 1` 阻断打包。

## 2. 行为验收：本机无头 Chrome + CDP

内置浏览器的视口实测是 0×0，截不了图 —— 所以视觉/行为验收走**本机 Chrome headless + CDP**。用于：

- 路由烟测（12/12 条路由能进、DOM 里关键文本在）
- 首屏长任务与下载量测量（`PerformanceObserver` 注册**一次**，写在路由循环里会把重复值算进去）
- 词汇向导 A/B/C/D 四段路径真点一遍（23 项行为断言）

坑：Windows Git Bash 下 MSYS 会把 `/,/vocabulary,/articles` 这类参数改写成 `C:/Program Files/Git/…`，导致「Cannot navigate to invalid URL」。加 `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`。同类：`/tmp` 在 Node 里会解析成 `B:\tmp`（用 `%TEMP%`），模板字符串会把 `\s` 吃掉（用 `String.raw`）。

## 3. 真机通道

无线 adb 在该 ROM 上不给 `INJECT_EVENTS`（`input tap` 报 SecurityException），标准通道是 `scripts/device-eval.mjs`：

```bash
adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
# socket 名：adb shell cat /proc/net/unix | grep webview_devtools_remote
node scripts/device-eval.mjs eval "document.title"
node scripts/device-eval.mjs tap 400 1630    # 物理像素，自动折算 CSS
node scripts/device-eval.mjs shot .screen.png
```

纪律（用户要求，见记忆）：**操作用户手机前先报备**；设备段默认跳过（要 `E2E_DEVICE=1`）；走查收尾必须 `force-stop` 归位。另外 `execFileSync(adb, ['shell','cat','/proc/net/unix'])` 会挂住（0 字节输出），别这么读。

## 4. 写守卫的四条硬规矩

这几条都是从真实翻车上来的，不是风格偏好：

1. **替身必须忠实于真实接口**。`verify-feedback-loop` 的 KV 替身形状对齐 `KV.put(key, value)`、飞书替身对齐「200 + body.code」。替身比真实行为宽松 = 假绿。
2. **元判据要带正对照（counterfactual）**。每条"不许出现 X"的断言，都要配一条"该出现的地方确实在出现"。例：`verify-tts-hardening` C1 断言只有桌面发请求，正对照是 Electron UA 下仍发 12 次；`verify-list-scaling` 断言折叠存在，正对照是不许有 `allPrompts.map(` 全量渲染。
3. **文案变了要重新推导对齐断言，而不是放宽它**。断言数**只增不减**，除非删功能。
4. **没定性就停住，别改绿**。自己抓到的反例：HelpGuide 的词数断言在变异掉两处出现之一后仍然通过 → 重写成「计数 + 禁止出现词条数那个数字」，再跑变异才变红。

## 5. 静态检查的已知弱度

- **`npm run typecheck` 是弱守卫**：`tsconfig.app.json` 从 `node_modules/@lark-apaas/coding-presets-react/lib/tsconfig/tsconfig.app.json` 继承了 `strict: false`、`noImplicitAny: false`、`noUnusedLocals: false`、`noUnusedParameters: false`。所以"类型过了"不等于"类型检查过了"。
- **「两端都写了却点不到」静态检查看不出来**：组件与云函数都存在、没有任何页面挂载 → 只有把挂载点写成断言才守得住（`verify:feedback-loop` 检查 Header 渲染 `<FeedbackDialog />`）。
- **「源码里是 lazy、产物里不是」也看不出来**：强制 `manualChunks` 或壳里同步 `require` 都会把库变成入口 chunk 的静态依赖 → 只有 `verify-bundle-budget` 从产物反查才看得见。
- **`verify-bundle-budget` 的预算是 600KB**（`:79`），当前实测首屏必需 JS **198.1KB gzip**。预算头寸很大是有意的（壳 + react/router/radix/motion/icons + 词库加载器 + utils 的天然体量），但别把它当"体积没问题"的证明 —— 具体数字每次都打印，看那一行。
- **TTS 引擎候选顺序没有任何断言**（`verify-tts-hardening` 只读 `sherpa-tts.ts`/Java/`TTSSettings.tsx`）。
- **句子学习与句子拼写两个页面没有任何守卫**（见各自模块文档）。
- **`.wrangler/` 是本地构建残留，不要 commit**。
