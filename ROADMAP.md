# NativeThink 开发路线

> 校准：2026-09-28（main `3dcee7e`，APK **2.0.25 / versionCode 70**）。
> 现状细节与坑表见 [`docs/PROJECT-HANDOVER.md`](./docs/PROJECT-HANDOVER.md)，日常约定见 [`AGENTS.md`](./AGENTS.md)，产品/UI 规范见 [`docs/PRODUCT-SPEC.md`](./docs/PRODUCT-SPEC.md)。
> **重点研发的两条线是 APK 与网站**（Electron 桌面只是顺带产物）；站点 `functions/api/*` 同时是 APK 的线上后端 —— APK 内 `/api/*` 被重写到 `https://nativethink.pages.dev`。

---

## 现状（已上线、已验证）

- **形态**：一份前端 → Web SPA（Cloudflare Pages）+ Capacitor Android + Electron 桌面；状态只进 localStorage / IndexedDB，无业务后端库（云端只有 Pages Functions + KV）。
- **背单词**：四个入口 —— 每日学习（六方式：闪卡/选择/拼写/听写/配对/填空）、复习检测（SM-2 五档）、快速闪卡、词库浏览 + 搭配 + 词汇量测试。**四个模式的断点续学已全部覆盖**（切 tab / 杀 App / 刷新都能接续），断点键按词书（level）分开。
- **词库**：75,113 词 / 9 等级（中考 3,223 · 高考 6,008 · 四级 4,542 · 六级 7,404 · 雅思 6,609 · 托福 10,367 · 考研 9,602 · 专业 8,887 · 高阶 18,471），主文件只留核心字段，detail 按需加载。
- **阅读**：22 本公版书（中文对照随包）+ 20 篇 SCP + 维基百科 + 演讲 + AI 生成；整书翻译走断点队列（批合并 + 每批落盘 + 可中止），翻译缓存 v2 按段索引回填；复习词 6 色高亮。
- **朗读**：三级降级（内置 sherpa 离线 → 系统引擎 → 云端）。默认 piper lessac（真机 RTF **0.076**），Kokoro int8 11 个英语音色作音质选项（RTF **1.008**，长文物理上无法连续播放）；云端走 `functions/api/tts.js`，上游硬上限 200 字符 → 客户端切片上限 180。
- **句子学习**：158 句语料（手写 24 + 补充 12 + 脚本自动标注 122），拆句 / 句型 / 造句 / 语法，含错句复习队列与跟读评价。
- **端侧 AI 兜底**：随包 Qwen2.5-0.5B-Instruct（q4）+ Xenova/opus-mt-en-zh（q8）；打包版同源 `/models/` 零下载，网页版回落 hf-mirror。云端 AI 失败时 `streamChat/chat` 自动切端侧小模型。
- **验证体系**：没有测试框架，靠 `typecheck` + `lint:eslint` + `build:web` + 7 个 `scripts/verify-*.mjs`（14 / 202 / 225 / 21 / 6175 / 10 / 56 断言，2026-09-28 实测全绿）。其中 `verify:feedback-loop` 会用忠实的 KV / webhook 替身**真实执行**反馈后端。

## 下一步

1. **修「切换词书要多点一步」**（2026-09-29 用户报）：换书这条高频路径被绑在首启三步向导上 —— 点书只 `setChosenLevel` + 跳下一步，真正写回页面状态的只有走完「选学习方式」之后的 `onComplete`，中途关掉等于没换。机制与修法见交接手册 §9 第 1 条。
2. **学习提醒**（Capacitor 本地通知）—— 系统级能力里唯一的缺口。npm 侧目前只注册了 `@capacitor-community/text-to-speech`（仓库内的 `SherpaTts` 是原生插件，不走 npm），没有任何通知插件。
3. **词库真人发音包**：单词集合有限，可预录；先定体积方案（大文件绝不能进 `public/`，会同时拖累 web/APK/桌面三份产物）。
4. **11 个 Kokoro 音色逐个真机试听**，核对 `src/lib/tts-voice-catalog.ts` 的 `speakerId`（名不符实只改前端表，不必动原生）。
5. **语料回填**：语法条目继续扩、导入书离线翻译、书籍译文仍有待回填空段（口径沿用上一版 ROADMAP）。
6. **开通反馈通道**：链路已接好（入口在顶栏，后端先写 KV 留档、再推飞书），但线上 Pages 项目目前只有 `JWT_SECRET` 一个 secret，实测 POST 仍回 503 `Webhook not configured`。加 `FEISHU_WEBHOOK_URL`（飞书群机器人）和/或确认 KV 绑定生效，用户看到的才从「暂未送出」变成「已送达」。
7. **文档债**：应用内帮助中心 `src/components/HelpGuide.tsx` 比代码旧（FAQ 仍写"必须自备 API Key"、"五个等级"、"数据不会上传任何服务器"）。`使用攻略.md` 已于 2026-09-28 重写。
8. 顺手项：`.githooks/post-commit` 插入日期标题时带固定空行（`CHANGELOG.md` 头部已堆 4 行，无害）。

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
