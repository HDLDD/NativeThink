# NativeThink 开发路线

> 校准：2026-09-29（已装 APK **2.0.28 / versionCode 73**；本轮词汇向导改动待打包成 74 / 2.0.29）。
> 现状细节与坑表见 [`docs/PROJECT-HANDOVER.md`](./docs/PROJECT-HANDOVER.md)，日常约定见 [`AGENTS.md`](./AGENTS.md)，产品/UI 规范见 [`docs/PRODUCT-SPEC.md`](./docs/PRODUCT-SPEC.md)。
> **重点研发的两条线是 APK 与网站**（Electron 桌面只是顺带产物）；站点 `functions/api/*` 同时是 APK 的线上后端 —— APK 内 `/api/*` 被重写到 `https://nativethink.pages.dev`。

---

## 现状（已上线、已验证）

- **形态**：一份前端 → Web SPA（Cloudflare Pages）+ Capacitor Android + Electron 桌面；**首屏必需 JS 198.1KB gzip**（11 个 chunk，`verify:bundle-budget` 守，预算线 600KB）；状态只进 localStorage / IndexedDB，无业务后端库（云端只有 Pages Functions + KV）。
- **背单词**：四个入口 —— 每日学习（六方式：闪卡/选择/拼写/听写/配对/填空）、复习检测（SM-2 五档）、快速闪卡、词库浏览 + 搭配 + 词汇量测试。**四个模式的断点续学已全部覆盖**（切 tab / 杀 App / 刷新都能接续），断点键按词书（level）分开。
- **词库**：75,113 个词条 / 全局去重 **21,736** 个可学单词 / 9 等级。**卡上显示的就是出卡池子**（书内去重，与加载了哪几本无关）：中考 1,987 · 高考 3,743 · 四级 4,542 · 六级 7,404 · 雅思 6,609 · 托福 10,367 · 考研 5,047 · 专业 4,464 · 高阶 18,470。主文件只留核心字段，detail 按需加载。
- **阅读**：22 本公版书（中文对照随包；书单只下元数据 5KB，正文点开才下 231KB，清洗函数独立成 `book-clean.ts`）+ 20 篇 SCP + 维基百科 + 演讲 + AI 生成；整书翻译走断点队列（批合并 + 每批落盘 + 可中止），翻译缓存 v2 按段索引回填；复习词 6 色高亮。
- **朗读**：三级降级（内置 sherpa 离线 → 系统引擎 → 云端）。默认 piper lessac（真机 RTF **0.076**），Kokoro int8 11 个英语音色作音质选项（RTF **1.008**，长文物理上无法连续播放）；云端走 `functions/api/tts.js`，上游硬上限 200 字符 → 客户端切片上限 180。
- **句子学习**：158 句语料（手写 24 + 补充 12 + 脚本自动标注 122），拆句 / 句型 / 造句 / 语法，含错句复习队列与跟读评价。
- **端侧 AI 兜底**：随包 Qwen2.5-0.5B-Instruct（q4）+ Xenova/opus-mt-en-zh（q8）；打包版同源 `/models/` 零下载，网页版回落 hf-mirror。云端 AI 失败时 `streamChat/chat` 自动切端侧小模型。
- **验证体系**：没有测试框架，靠 `typecheck` + `lint:eslint` + `build:web` + 9 个 `scripts/verify-*.mjs`（loading 45 · books-meta 213 · vocab-cards 254 · vocab-caches 21 · tts-progress 6175 · tts-hardening 15 · feedback-loop 56 · overlay-fit 16 · bundle-budget 10，2026-09-29 实测全绿），再加**本机无头 Chrome + CDP 真点一遍**的行为验收（静态检查看不见"入口在但状态不写回"那类缺陷）。其中 `verify:feedback-loop` 会用忠实的 KV / webhook 替身**真实执行**反馈后端。

## 下一步

1. **学习提醒**（Capacitor 本地通知）—— 系统级能力里唯一的缺口。npm 侧目前只注册了 `@capacitor-community/text-to-speech`（仓库内的 `SherpaTts` 是原生插件，不走 npm），没有任何通知插件。
2. **词库真人发音包**：单词集合有限，可预录；先定体积方案（大文件绝不能进 `public/`，会同时拖累 web/APK/桌面三份产物）。
3. **11 个 Kokoro 音色逐个真机试听**，核对 `src/lib/tts-voice-catalog.ts` 的 `speakerId`（名不符实只改前端表，不必动原生）。
4. **语料回填**：语法条目继续扩、导入书离线翻译、书籍译文仍有待回填空段（口径沿用上一版 ROADMAP）。
5. **开通反馈通道**：链路已接好（入口在顶栏，后端先写 KV 留档、再推飞书），但线上 Pages 项目目前只有 `JWT_SECRET` 一个 secret，实测 POST 仍回 503 `Webhook not configured`。加 `FEISHU_WEBHOOK_URL`（飞书群机器人）和/或确认 KV 绑定生效，用户看到的才从「暂未送出」变成「已送达」。
6. **文档债（帮助中心）**：`HelpGuide.tsx` 的过期口径已于 2026-09-29 修正并钉进 `verify:books-meta` 第 ⑥ 节；仍待做的是把里面偏长的"各模块介绍"逐条对着现在的功能面再过一遍。
7. 顺手项：`.githooks/post-commit` 插入日期标题时带固定空行（`CHANGELOG.md` 头部已堆 4 行，无害）。
8. **真机补验 2.0.28**：词书词数（六级 7,404 / 考研能开卡）与朗读设置手指滑到底，目前只有本机证据。


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
