# NativeThink 开发路线

**现状**：22 本公版书中文对照随包离线可用；阅读器章节与译文严格对齐；朗读三级降级（内置离线引擎 → 系统引擎 → 云端），内置引擎支持 11 个英语音色（Kokoro int8，24000Hz，含 2 个英音）；句子学习已上线（拆句 / 句型 / 造句 / 语法；含错句复习队列、跟读评价、158 句语料）。

**下一步**
1. 真机验证 11 个音色与 speakerId 的对应关系（逐个试听；名不符实则改 `src/lib/tts-voice-catalog.ts` 的 `speakerId`，不必改原生代码）
2. 确认 int8 量化音质可接受（与 lessac 对比同一句；不可接受则退回 fp32 的 kokoro-multi-lang-v1_0，代价 +194.6MB）
3. 词库真人发音包：单词集合有限，可预录
4. 句子语料扩到 158 句（人工 36 + 自动标注 122，脚本可续扩）；语法 30 条；导入书离线翻译；补 38 个待回填空段

**打包**：用 `npm run package:all` —— web 只构建一次，APK 与桌面版并行；878MB 模型与 Electron 运行时走硬链接（毫秒级）。全程约 45 秒（原先串行全量拷贝约 9 分钟）。`package:apk` 会先跑 `check:tts-voices` 校验音色与模型资产。

**约定**
- 提交前 `npm run typecheck`；手机端数据只进 localStorage / IndexedDB
- 音色改动后跑 `npm run check:tts-voices`（拦 speakerId 越界与模型缺文件）
- 原生模型注册表（`SherpaTtsPlugin.java` 的 `MODEL_*`）与 `scripts/check-tts-voices.cjs` 的 `MODELS` 必须同步改
- 新书流程：抓全文 → 预翻译 → 校验章节与译稿逐章段数一致 → 打包
- 改章节逻辑时，`buildNovelChapters` 必须与 `splitChapters` 同规则
