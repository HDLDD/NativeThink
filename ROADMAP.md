# NativeThink 开发路线

> 校准：2026-09-30（设备已装 **2.0.31 / versionCode 76**；**2026-09-30 全天的 7 项改动都还没进新 APK** —— 打包与真机走查按用户要求留到"末尾再议"，本机验收一律用无头 Chrome + CDP）。
> **收尾必跑 `npm run verify:all`**（typecheck + 全部 `verify-*.mjs`；只跑"自己那条"会漏掉引用同一份源码的其他守卫 —— 2026-09-30 真翻过一次）。
> 现状细节与坑表见 [`docs/PROJECT-HANDOVER.md`](./docs/PROJECT-HANDOVER.md)，跨模块约定与文档导航见 [`AGENTS.md`](./AGENTS.md)，**每模块的功能/实现/注意事项见 [`docs/modules/`](./docs/modules/)**，产品与 UI 规范见 [`docs/PRODUCT-SPEC.md`](./docs/PRODUCT-SPEC.md)。
> **重点研发的两条线是 APK 与网站**（Electron 桌面只是顺带产物）；站点 `functions/api/*` 同时是 APK 的线上后端 —— APK 内 `/api/*` 被重写到 `https://nativethink.pages.dev`。

---

## 现状（已上线、已验证）

- **形态**：一份前端 → Web SPA（Cloudflare Pages）+ Capacitor Android + Electron 桌面；**首屏必需 JS 199.5KB gzip**（11 个 chunk，`verify:bundle-budget` 守，预算线 600KB）；状态只进 localStorage / IndexedDB，无业务后端库（云端只有 Pages Functions + KV）。
- **背单词**：四个入口 —— 每日学习（六方式：闪卡/选择/拼写/听写/配对/填空）、复习检测（SM-2 五档）、快速闪卡、词库浏览 + 搭配 + 词汇量测试。**四个模式的断点续学已全部覆盖**（切 tab / 杀 App / 刷新都能接续），断点键按词书（level）分开。
- **词库**：75,113 个词条 / 全局去重 **21,736** 个可学单词 / 9 等级。**卡上显示的就是出卡池子**（书内去重，与加载了哪几本无关）：中考 1,987 · 高考 3,743 · 四级 4,542 · 六级 7,404 · 雅思 6,609 · 托福 10,367 · 考研 5,047 · 专业 4,464 · 高阶 18,470。主文件只留核心字段，detail 按需加载。
- **阅读**：22 本公版书（中文对照随包；书单只下元数据 5KB，正文点开才下 231KB，清洗函数独立成 `book-clean.ts`）+ 20 篇 SCP + 维基百科 + 演讲 + AI 生成；整书翻译走断点队列（批合并 + 每批落盘 + 可中止），翻译缓存 v2 按段索引回填；复习词 6 色高亮。
- **朗读**：三级降级（内置 sherpa 离线 → 系统引擎 → 云端）。默认 piper lessac（真机 RTF **0.076**），Kokoro int8 11 个英语音色作音质选项（RTF **1.008**，长文物理上无法连续播放）；云端走 `functions/api/tts.js`，上游硬上限 200 字符 → 客户端切片上限 180。
- **句子学习**：158 句语料（手写 24 + 补充 12 + 脚本自动标注 122），拆句 / 句型 / 造句 / 语法，含错句复习队列与跟读评价。
- **端侧 AI 兜底**：随包 Qwen2.5-0.5B-Instruct（q4）+ Xenova/opus-mt-en-zh（q8）；打包版同源 `/models/` 零下载，网页版回落 hf-mirror。云端 AI 失败时 `streamChat/chat` 自动切端侧小模型。
- **验证体系**：没有测试框架，靠 `typecheck` + `lint:eslint` + `build:web` + 18 条可跑的 `scripts/verify-*.mjs`（收尾用 `npm run verify:all` 一次跑完）（完整断言数表见 [docs/modules/verification.md](./docs/modules/verification.md)；2026-09-30 复测 vocab-cards 284、新增 rv-articles 55 与 study-credit 74、其余最近一次全绿 2026-09-29：loading 45 · books-meta 222 · vocab-caches 21 · tts-progress 6175 · tts-hardening 15 · feedback-loop 58 · overlay-fit 16 · bundle-budget 10 · list-scaling 18），再加**本机无头 Chrome + CDP 真点一遍**的行为验收（静态检查看不见"入口在但状态不写回"那类缺陷）。其中 `verify:feedback-loop` 会用忠实的 KV / webhook 替身**真实执行**反馈后端。

## 下一步

1. **学习提醒**（Capacitor 本地通知）—— 系统级能力里唯一的缺口。npm 侧目前只注册了 `@capacitor-community/text-to-speech`（仓库内的 `SherpaTts` 是原生插件，不走 npm），没有任何通知插件。
2. **词库真人发音包**：单词集合有限，可预录；先定体积方案（大文件绝不能进 `public/`，会同时拖累 web/APK/桌面三份产物）。
3. **11 个 Kokoro 音色逐个真机试听**，核对 `src/lib/tts-voice-catalog.ts` 的 `speakerId`（名不符实只改前端表，不必动原生）。
4. **语料回填**：语法条目继续扩、导入书离线翻译、书籍译文仍有待回填空段（口径沿用上一版 ROADMAP）。
5. **开通反馈通道**：链路已接好（入口在顶栏，后端先写 KV 留档、再推飞书），但线上 Pages 项目目前只有 `JWT_SECRET` 一个 secret，实测 POST 仍回 503 `Webhook not configured`。加 `FEISHU_WEBHOOK_URL`（飞书群机器人）和/或确认 KV 绑定生效，用户看到的才从「暂未送出」变成「已送达」。
6. **文档债（帮助中心）**：`HelpGuide.tsx` 的过期口径已于 2026-09-29 修正并钉进 `verify:books-meta` 第 ⑥ 节；仍待做的是把里面偏长的"各模块介绍"逐条对着现在的功能面再过一遍。
7. **品牌字体要不要自托管**：`fonts.googleapis.com` 对大陆用户不可达 —— 线上每条路由一次资源错误、Plus Jakarta Sans / Noto Sans SC 从未生效（非阻塞 + 系统字兜底，所以只是不好看）。选项见交接手册 §9 第 16 条。
8. 顺手项：`.githooks/post-commit` 插入日期标题时带固定空行（`CHANGELOG.md` 头部已堆 4 行，无害）。
9. ~~**真机补验 2.0.28**~~ → **真机走查已做完（APK 2.0.31 / versionCode 76）**：装机其实早已完成（`lastUpdateTime` 09-29 21:12，此前记的"未装机"是错的）。本轮经 WebView CDP 在真机核对：九本词书词数与文档口径逐一对上（六级 7,404 / 考研 5,047 / 全部 21,736）、考研能开卡（`1/10 新学 craft`）、换书一步生效、朗读设置浮层 764px 落在 851 视口内且「测试声音 / 朗读自检」全可达、AI 设置不再上下各裁 43px、`/api/tts-voices` 请求数 0。收尾 `force-stop` 已归位。
10. **文档写作期间新核实、尚未修的缺陷**（按"用户能感觉到"排序，每条都在 `docs/modules/` 里有 `文件:行号` 与复现路径）：
    - ~~**跟读删 AI 追加句会弄乱完成标记**，100% 横幅与重置按钮随之消失~~（**已修**：索引换算收进 `src/lib/shadowing-progress.ts` 纯函数，删除路径只收合并索引；新增 `npm run verify:shadowing-completion` 23 断言，含"退回旧调用方式"的正对照 + 变异实测会红）。
    - ~~**跟读的两处分析不判空 → 面板一片空白且无提示**~~（**已修**，同一轮：`!result.trim()` 前置 + 诚实 toast，`verify:shadowing-completion` 静态守住两处都在）。
    - ~~**备份从来不含整书译文缓存**~~（**已修**：`book-translation.ts` 新增 `dumpBookTranslationCache(id, maxBytes)`，键格式知识留在拥有它的模块里；`backup.ts` 按 `BOOK_META` + 导入书目逐本导出，封顶后如实标 `idbSkipped`。新增 `npm run verify:backup-idb` 16 断言，含"旧枚举方式拿到 0 个键"的正对照与变异实测红 5 条）。
    - ~~**云同步下行会把刚下载的数据再推回去**（回声）~~（**已修**：`syncDown` 用 `applyingRemoteRef` + `try/finally` 包住落地循环，双写处理器开头跳过回声；5 分钟轮询不再无条件全量 `syncUp`，改由 `needsResync()` 决定 —— 且 `needsResync` 必须 `useCallback` 稳定，否则定时器每次 render 都被重建。新增 `npm run verify:cloud-sync` 18 断言：转译真实 `use-cloud-sync` + `safe-storage` 在 Node 里驱动，下载后 0 次 POST、同键本地再写必须 1 次 POST 作正对照，变异实测删掉守卫行立刻红）。
    - ~~**同步失败完全静默**~~（**已修**：上行/下行/单项配额失败各给诚实提示，60 秒去抖；守卫断言 `use-cloud-sync.ts` 空 catch 数为 0）。
    - **下行后多数 hook 仍持陈旧内存态**（**未修**，只有 3 个订阅者）：A 设备改了，B 设备要重开页面才看到；陈旧实例一有写入还会把刚拉下来的新值覆盖回去。
    - ~~**四处把「AI 服务不可用」报成「格式异常」**，另有一处走禁用的贪婪正则~~（**已修**：实际清点是 **7 处缺判空**而不是 4 处 —— 阅读页 3、背单词页 3、拼写批量加句 1，加上原记的 4 处贪婪正则/缺判空站点，24 个解析点全部补齐判空并统一 `extractJson`。新增 `npm run verify:ai-parse` 10 断言：全仓扫、注释行不参与判定、三段固件自证检查器本身有效；顺带把首页每日一句的 `category`/`difficulty` 夹进 `IChunk` 取值域）。
    - ~~**语块替换训练在 `useMemo` 里洗牌**~~（**已修**：`exercisePool = useStableShuffle(allChunks)` + `generateReplacementExercises` 改成给定同一入参输出逐字相同的纯函数；「随便看看」也改用稳定池，学一个词不再跳序）。**phrases tab 一次铺全部 748 条**。跟读两栏量过之后**判定不动**（2,219 元素 / 页高 2,256px，与写作页折叠后同量级），理由与数字见 shadowing.md §3.2 第 4 条。
    - ~~**对话页 `mountedRef` 在 StrictMode 双挂载后恒 false**~~（**已修**：effect 体内复位为 true。原先 dev 下 `:214/:281/:393` 的 `if (!mountedRef.current) break` 会静默丢弃全部流式内容 → 对话永远空白；生产不受影响，但极易把人带偏去查 AI 层）。
    - ~~**快速闪卡不读 `__nativethink_vocab_autospeak`**~~（**已修**：读键门控朗读 effect + 进度行加开关，默认开与其余三处同口径 —— 真机上别处的提示语本来就写着「与快速闪卡共用此设置」。`verify:vocab-cards` 补 10 条断言，含「门控必须位于 `tts.speak` 之前」的正对照）。
    - ~~反馈历史把 `stored` 显示成「已送达」~~（**已修**：新增 `pushed` 字段，历史标签分「已送达 / 已留档（未即时推送）/ 服务端已收到」三档；`verify:feedback-loop` 那条 `markSynced` 断言按新语义**重新推导**而不是放宽，另加一刀切标签的正对照）。
    - ~~文案口径~~（**已修**：设置页改成「约 780MB；另需 22.5MB 运行时」并带上实测字节数；`使用攻略.md` 拼写一段改成真实的 2 种练法 × 2 种播放）。
    - ~~句子学习主干判定三处索引不同源~~、~~拼写断点键不按 level 分~~、~~`ShadowingPage` autoplay effect 依赖数组不全~~（**均已修**：主干候选改由 `resolved` 映射，与评分同源；断点抽成 `src/lib/spelling-resume.ts` 按 level 分键 + 一次性迁移 + 重置按前缀枚举；autoplay 依赖换成句子身份（语速/口音刻意不进依赖，否则拖滑杆会把当前句从头重读）。新增 `verify:sentence-lab` 16 断言与 `verify:spelling-resume` 24 断言，都含正对照与变异实测）。
    - ~~**多处 `addStudyMinutes` 写在 `await` 之前，重复提交重复记账**~~（**已修 2026-09-30**，但**先纠正这条记录本身**：计时写在请求之前是**刻意的「按动作计」口径**（写了但 AI 挂了那次是真实投入，不该归零），模块文档里本来就写着；真正的缺陷是**同一个作答重复提交会重复记账**，而 `addStudyMinutes` 一次动今日分钟数 / 进度环 / 日历 / 连胜四处。修法是新闸门 `src/lib/study-credit.ts`：`creditOnce(module, creditKey(动作, 题面, 用户原文), minutes)`，同一键只放行一次（FIFO 400）。接了思维 4 处、对话、语块接龙、写作交卷、句子学习造句（后者**保持**"拿到反馈才计"，只补去重）。新增 `npm run verify:study-credit`（74 断言 + 14 条变异全红），并用无头 Chrome + CDP 真点验收 31 项：AI 回 500 时第一次提交仍 +1、连点三次只 +1 且**三次请求真的发出去了**（正对照）、换句/换 tab 能再涨、连胜与总天数不被重复推高。**本地动作**（闪卡翻面、拼写判分、语块复习打分与选择题）刻意不套闸门，守卫 ④ 钉住这条。
    - ~~**写作/拼写/语块的自定义条目缓存没走 `capped-cache` 上限**~~（**已修 2026-09-30，但修法不是"全部加封顶"**）：先分清两类数据 —— **AI 派生可重算**的（语块 AI 例句、例句翻译、短语例句）用 `cappedPut` FIFO 封顶并钉死数值（200 键/每键 30 条、400 键、300 键）；**用户创作不可重算**的（自建题目/语块/跟读材料、拼写句子库、「已记住」清单）**绝不裁剪已有条目**，改成"到上限只拒绝新增 + 如实报 `added/skipped`"（`appendCapped`，拼写句子库 `SPELLING_SENTENCE_LIMIT = 1200`）。真正的根因是 `safeStorage.setItem` 用 `catch {}` 吞掉配额错误 —— 现在返回布尔，九个不可重算清单的 effect 一律 `if (!persistJson(k, x)) warnStorageFull()`（全站 60s 去抖一条提示并指路清理入口）。`verify-vocab-caches` 从 21 条扩到 **67 条**：新增一段**注入 localStorage 替身真跑** safe-storage/capped-cache（配额满 → 返回 false、去抖只提示一次、`appendCapped` 不动已有），10 条变异全部验红；无头 Chrome CDP 真点 20 项（含"正常写入确实落盘了"和"空间恢复后一次写回全部"两条正对照）。
    - ~~**云同步下行只有 3 个 hook 订阅，其余持陈旧内存态**~~（**已修 2026-09-30**）：订阅收成单一出口 `src/lib/sync-down.ts`（事件名只定义一次、`onSyncDown` 可用假 target 真跑、`useSyncDown` 是 hook 壳），`syncDown` 落地改调 `emitSyncDown()`。订阅者 3 → **7**：收藏、学习统计、拼写句子库，加 **SM-2 词学习**、语块学习、生词本、我的助记。附带解决回声写：SM-2/语块的"state 变了就回写"effect 在下行重读后会把刚读进来的原样写回去（登录后就是一次上行 POST）—— 判据①引用一致跳过（主力，因为 `loadState` 补齐字段后重串的字节与存储不同）＋②序列化同值不写。`verify-cloud-sync` 18 → 43 断言（10 条变异全红），无头 Chrome 12 项真点（改 storage + 派发事件 → 「N 个到期」不刷新就变，且该键零次回写，配"记账替身确实记得"正对照）。**仍未订阅**的候选清单与理由写在 `docs/modules/cloud-sync.md` §3.2。
    - ~~**语块接龙判定把「非 FAIL 即通过」当默认**~~（**已修 2026-09-30**，用第三档绕开"改严会误伤"的两难）：判定解析收进 `src/lib/chain-verdict.ts`，首行必须是 PASS/FAIL 或常见变形（`PASTA`/`PASSAGE` 不算，正文里的 PASS 也不算）；**pass 计分、fail 不计分并给建议、未判定不计分也不判错**（不前进不清空，同一句可立刻重来）；AI 挂了的 catch 不再白送 10 分。新增 `verify-chain-verdict`（36 断言 + 6 条变异全红）+ 无头 Chrome CDP 真点 39 项（假 AI 流逐档打 PASS/FAIL/没守格式/500/空回复，逐次核对页面「当前得分」与「第 N 个」，含"每档都真的发了请求"的正对照）。
    - **仍未修**：`__nativethink_writing_history`（只有 `slice(-50)`）与 `__nativethink_shadowing_completed`（整份 JSON 每次变更重写）仍无键级上限；云同步下行订阅者目前 7 个，剩余候选（`use-sentence-review`、`quickcard-history`、`use-achievements`、`use-custom-scenarios` 等）见 `docs/modules/cloud-sync.md` §3.2。


## 打包

用 `npm run package:all` —— web 只构建一次，APK 与桌面版并行；878MB 离线模型与 Electron 运行时走硬链接（毫秒级）。全程约 45 秒（原先串行全量拷贝约 9 分钟）。

- `package:apk` 前置 `check:tts-voices`（拦 speakerId 越界与模型缺文件），随后 `capacitor copy android` → `android-copy-models.cjs`（拷模型，必须在 cap copy 之后）→ `gradlew assembleDebug` → 落 `release/NativeThink-mobile-debug.apk`。
- `versionCode` **每次打包必须递增**（`npm run version:apk-bump`，只 +patch），否则 Android 拒绝升级安装 → 用户被迫卸载丢数据。
- 产物命名：规范名 = 当前版本线（每次覆盖）；已冻结的旧线用 `-<major>.x.apk`，永不覆盖。改完名字用 `aapt dump badging` 核验内嵌版本。
- 体积核查用 `node scripts/report-apk-size.cjs`（2.0.25 实测 803.9MB：模型 541.3 + Kokoro 113.0 + Piper 65.1 + web 产物 40.3 + 原生库 29.3 + dex/res 14.7）。

## 约定

- 提交前 `npm run typecheck`；手机端数据只进 localStorage / IndexedDB。
- 音色改动后跑 `npm run check:tts-voices`；原生模型注册表（`SherpaTtsPlugin.java` 的 `MODEL_*`）与 `scripts/check-tts-voices.cjs` 的 `MODELS` 必须同步改。
- 改词库后必跑 `npm run wordbank:split`（幂等），再跑 `node scripts/verify-wordbank-loading.mjs`。
- 新书流程：抓全文 → 预翻译 → 校验章节与译稿逐章段数一致 → 打包；改章节逻辑时 `buildNovelChapters` 必须与 `splitChapters` 同规则。
- 洗牌 + 下标定位当前题一律 `use-stable-shuffle`；新增按词累积的缓存一律走 `capped-cache.ts`；断点键按（模式, level）分；日期用 `formatDate()`；解析 AI JSON 用 `extractJson()`。
- 朗读统一走 `src/lib/use-tts.ts`，不要在页面里直接调 `speechSynthesis`。
- 真机改动（safe-area / 原生 TTS / 手势 / 持久化）**必须真机验**，通道用 `scripts/device-eval.mjs`；动用户手机前先报备，收尾 `force-stop` 归位。
