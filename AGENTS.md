# NativeThink Agent Guide

**本文件是索引，不是百科。** 它只放跨模块的约定、命令、路由表和通用坑；模块级的实现细节与注意事项在 [`docs/modules/`](./docs/modules/) 下，按模块一篇。

| 我要… | 去读 |
|-------|------|
| 刚接手这个项目，先建立全局认识 | [docs/PROJECT-HANDOVER.md](./docs/PROJECT-HANDOVER.md)（交接手册） |
| 产品需求 / UI 规范 | [docs/PRODUCT-SPEC.md](./docs/PRODUCT-SPEC.md) |
| 现状与下一步 | [ROADMAP.md](./ROADMAP.md) |
| 面向用户的使用说明 | [使用攻略.md](./使用攻略.md) |
| 开发日志 | [CHANGELOG.md](./CHANGELOG.md) |
| 常见 bug 的完整修复模式 | `.claude/skills/nativethink-fix.md`、架构速查 `.claude/skills/nativethink.md` |

---

## 项目是什么

NativeThink 是面向中文母语者的英语思维训练应用：摆脱中式英语，通过思维训练、语块、句子精讲、跟读、对话等方式建立母语者表达路径。

**形态**：Web SPA + Electron 桌面 + Capacitor Android，三个形态共用一份 `dist/client` 与一套 `functions/` 云函数。
**部署**：Cloudflare Pages（`nativethink.pages.dev`），由 **Pages 自己的 Git 集成**从 `main` 构建 —— 仓库内**没有部署 workflow**（2026-09-28 删掉两条长期失败的冗余 Actions；`.github` 目录不存在）。**push 即改线上，先跑验证。**
**界面语言**：中文（学习内容为英文）。

---

## 模块索引

**改任何模块前先读对应那篇** —— 里面的坑都是逐条读代码核实过的，包含本文件已经写错或被模块文档推翻的地方。

| 模块 / 路由 | 文档 | 一句话 |
|-----------|------|--------|
| 背单词 `/vocabulary` | [modules/vocabulary.md](./docs/modules/vocabulary.md) | 9 种模式（含「短语闪卡」—— 九个考试短语库共用短语侧 SM-2；「中译英」—— 看中文拼/选英文；「纠偏重考」—— 把纠偏本里的表达四选一重认，不碰 SM-2）、三个正交开关（`setupDone`/`showWizard`/`immersed`）、SM-2、三套并行重排实现 |
| 词库数据 | [modules/wordbank-data.md](./docs/modules/wordbank-data.md) | 11 本、两层去重、核心/detail 拆分、IDB 主 + localStorage 兜底、改完必跑的两个脚本；四六级两本派生词书（真题考频口径）单点生成 |
| 阅读 `/articles` | [modules/reading.md](./docs/modules/reading.md) | 五种来源一套阅读器、运行时全文升级、**两套切章必须对齐**、复习词文章词表是派生的（删文章即回词表） |
| 朗读 TTS | [modules/tts.md](./docs/modules/tts.md) | 引擎降级链、切片 180 由上游 200 硬上限钉死、**取消按代际 chainGenRef（布尔会被旧链复活）**、闪退自愈、音色四处同步、云端缓存 FIFO 400 条 + Blob URL 用完即 revoke、**系统语音的插件边界（async 别 return 插件对象，否则永久挂死）** |
| AI 服务与端侧模型 | [modules/ai-services.md](./docs/modules/ai-services.md) | Key 优先级、服务端免费档回退、端侧回落条件、`extractJson` 规定由 `verify:ai-parse` 全仓扫、**中继防滥用守卫（Origin/限流/形状校验/出厂 Key 用量，无守卫覆盖）** |
| 母语思维 `/think` | [modules/think-in-english.md](./docs/modules/think-in-english.md) | 4 tab；换题不 abort 导致流式内容串题 |
| 语块 `/chunks` | [modules/chunks.md](./docs/modules/chunks.md) | 最大单文件；963 条（**手改写进 `chunks-extra.ts`**）、练习池走 `useStableShuffle`、**同短语多登记 → 读取层去重（筛选后、洗牌前）**、短语库按字母段折叠（4,805→1,148 元素）、接龙判定三档（未判定不送分）；**短语 SM-2 进度 store 三处共享**（本页「短语复习」「闪卡」+ 词汇页「短语闪卡」） |
| 对话 `/conversation` | [modules/conversation.md](./docs/modules/conversation.md) | 场景选择↔聊天；`mountedRef` 每轮挂载需复位（dev 下曾恒 false 让对话永远空白） |
| 影子跟读 `/shadowing` | [modules/shadowing.md](./docs/modules/shadowing.md) | 连播/循环/录音评分；完成标记按**合并索引**存，索引换算单点在 `shadowing-progress.ts` |
| 写作 `/writing` | [modules/writing.md](./docs/modules/writing.md) | 100 题 + AI 批改（Markdown 不是 JSON）；默认折叠 12 张 |
| 句子学习 `/sentences` | [modules/sentence-lab.md](./docs/modules/sentence-lab.md) | 158 句语料、意群运行时定位；主干候选与评分**同一来源**（`verify:sentence-lab` 守） |
| 句子拼写 `/spelling` | [modules/spelling.md](./docs/modules/spelling.md) | 2×2 玩法、**五条题目来源**（含纠偏本 / 精听页两个句子库桶）、断点按 level 分键（`spelling-resume.ts`） |
| 视频精听 `/video` | [modules/video-lab.md](./docs/modules/video-lab.md) | 导入字幕（+可选媒体）逐句学：SRT/VTT/转录 JSON 三解析、IDB `media` 独立表三键分片、索引封顶连媒体一起删、点词查词、跟读用 LCS 且**无识别通道时不许假分数**、AI 双语三档降级、**三形态统一走导入（不接本机转录服务）** |
| 首页 / 记录 / 收藏 / 备份 | [modules/dashboard-progress-favorites.md](./docs/modules/dashboard-progress-favorites.md) | 每日一句、分项重置、收藏判重口径、三张首页横幅（待复习 / 纠偏待重考 + `?tab=` 深链）；整书译文随备份导出由 `verify:backup-idb` 守 |
| 外壳与导航 | [modules/shell-and-navigation.md](./docs/modules/shell-and-navigation.md) | 启动顺序、双层 ErrorBoundary、预取时机、**新增页面实际是六处** |
| 交互反馈层（跨模块） | [modules/interaction-fx.md](./docs/modules/interaction-fx.md) | 全站"按下去有什么反应"的唯一答案：按压词汇（**裸 `<button>`/`<a href>`/`[role=button]` 默认可点，`off` 才例外**；`scale` 独立属性 / 两档涟漪按底色挑色）、结果图形件（纯 CSS，不碰 motion；四个练习面的弧/色点/连击环）、奖励时刻（唯一 canvas 出口）、入场档（`.page-enter`/`.stagger` 与 `--fx-ease` 同源）、reduce 在委托层判 |
| 存储与学习统计 | [modules/storage-and-stats.md](./docs/modules/storage-and-stats.md) | 四套存储、safeStorage 前缀自愈、`addStudyMinutes` 真实语义、同步边界 |
| 云同步与账号 | [modules/cloud-sync.md](./docs/modules/cloud-sync.md) | 两条上行口径不同；回声抑制/失败提示/按需补推由 `verify:cloud-sync` 守；下行重读订阅收进 `sync-down.ts`（13 个 hook 已接；三个模块缓存库的重读必须先作废缓存） |
| 构建与发布 | [modules/build-release.md](./docs/modules/build-release.md) | 脚本地图与重复 bump、**缺资产静默出残包**、APK 版本线与产物命名、产物版本核对走构建期 meta |
| 验证体系 | [modules/verification.md](./docs/modules/verification.md) | 30 条可跑的契约守卫（含元守卫 `verify-guard-shape`：扫守卫自身的恒真断言）+ verify:all 全量跑法 + 无头 Chrome/CDP + 真机通道 + **电脑侧 AVD 模拟器通道**（`scripts/phone-emu.mjs`）+ 写守卫四条硬规矩 |

---

## 技术栈

| 层 | 选型 |
|---|---|
| UI | React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| 构建 | Vite 8（`scripts/dev.mjs` / `scripts/build.sh`） |
| 路由 | react-router-dom v7，页面 `React.lazy` 懒加载 |
| 状态/数据 | localStorage（`safeStorage`）+ IndexedDB；无后端业务库 |
| AI | `src/hooks/use-ai.ts` + `src/services/ai-service.ts`（用户自配 Key，内置出厂 Key） |
| TTS | 多引擎降级：sherpa-onnx 离线（默认 piper lessac，可选 Kokoro int8）→ 系统 SpeechSynthesis → 云端 |
| 桌面 | Electron（`electron/main.mjs` + `server/local-server.mjs` 复刻 `/api/*`） |
| 移动 | Capacitor Android |

**typecheck 是弱守卫**：`tsconfig.app.json` 从 `@lark-apaas/coding-presets-react` 继承了 `strict: false` / `noImplicitAny: false` / `noUnusedLocals: false`。"过了类型"不等于"检查过了"。

---

## 常用命令

在 Windows 上优先用项目本地 node / tsc：

```powershell
# 开发
npm run dev

# 类型检查（提交前必跑）
npm run typecheck
# 或
& $env:MIMO_NODE "B:\NativeThink\node_modules\typescript\bin\tsc" -p "B:\NativeThink\tsconfig.app.json"

# ESLint / 生产构建
npm run lint:eslint
npm run build:web          # 产纯 web 包用这个；不要用 package:web（见 build-release.md §5.1）

# 桌面 / APK 打包
npm run package:web
npm run package:apk
npm run package:apk:emu    # 电脑侧 x86_64 模拟器专用包（不烧 versionCode，产物 release/NativeThink-emu-x86_64.apk，绝不当发布物）
npm run package:desktop
npm run package:all

# TTS 音色与模型资产校验（改音色后必跑；已嵌进 package:apk 前置，失败阻断打包）
npm run check:tts-voices
```

**回归守卫**（本项目没有测试框架，这些就是防线；当前实测全绿，断言数见 [verification.md](./docs/modules/verification.md)）：

```powershell
node scripts/verify-wordbank-loading.mjs          # 53  加载层集成（无需浏览器；11 本词书）
node scripts/verify-char-hygiene.mjs              # 9   数据不可见坏字符（U+FFFD + PUA）零残留：扫描器正/负对照 + src/data + public/books + 脚本覆盖自证
node scripts/verify-wordbank-split.mjs --check <baseline.json>   # 数据层拆分（基线任意时刻可重采）
node scripts/verify-tts-progress.mjs              # 6175 朗读切片与进度反查表
node scripts/verify-tts-hardening.mjs             # 31   TTS 降级/在途去重/桌面限定/内置引擎入队顺序 + **E 节：朗读取消必须按代际 chainGenRef**（speak/cancel 各开一代、五处续链都传 gen、playUrl 五条退出与链入口都比代际、stopAudio 先摘四个回调再掐）（注意：没有 npm script）
node scripts/verify-chunks-data.mjs               # 55   语块库 963 条数据卫生 + 读取层去重（12 组重复冻结成基线、去重顺序判别、已记组行为）+ 短语库/语块库显示语言同源 + 列表内移动的单一滚动权威
node scripts/verify-native-tts.mjs                # 45   原生插件边界：替身真跑「async return 插件对象＝永久挂死」+ 取语音列表 4s 超时 + 六处调用点 + 先问能力再猜沉默（看门狗吃句长、每词 ≥380ms、起播证据两档）
node scripts/verify-books-meta.mjs                # 227  书目元数据 + 复习词高亮
node scripts/verify-vocab-cards.mjs               # 489  背单词卡片契约 + 手势决策表（含复习检测禁滑动评分 allowRate:false + 短语闪卡正对照） + 换卡节奏 + 答错重排延后 + 单词档位字号（DL/QC 手机档=FM 档 + PFM 正对照） + 词面按钮组整组换行（⑭b，四个模式） + 快速闪卡卡内边距（⑭c） + 每日学习卡片几何与答对零等待（⑯） + 生词本入队（顺序/判据/补量/屏蔽）+ ⑮ 短语闪卡（接线/懒加载去重/会话同构/档位即补新张数/共享 store 扩展）+ ⑰ 复习结束态/跨词书空态与换等级竞态 + ⑱ 回看态出口（重排再现可重评 + 可点「继续」按钮；⑫ 重推）+ ⑲ 同日已评不回队 + ⑳ 每日目标=总量上限 + ㉑ 断点 v2/主按钮换位/收藏 ★/判重看两 type/词族全链路（含 use-favorites 去重回写真跑）+ ㉒ 快速闪卡预合成下一张/记录按日期分组 + ㉓ 收藏轮转/已学清单/中译英第8模式/进度统一 markLearned（变异 M1-M9）+ 收藏写失败可见（变异 3 条）+ ㉔ 收藏读盘形状清洗真跑（缺 id/缺 content/非数组整份/数字收成/example 不造键）
node scripts/verify-vocab-caches.mjs              # 85   缓存封顶 + 存储写失败可见（替身真跑）+ trimOldest 滚动窗口双封顶
node scripts/verify-overlay-fit.mjs               # 41   窄视口浮层契约 + 全屏层自带 safe-area + 全站唯一 Toaster 出口 + ⑥ 手机抽屉导航后必须关 + ⑦ 每个 useFramerMotion 组件的每个宿主都包 LazyFramerProvider
node scripts/verify-bundle-budget.mjs             # 10   首屏下载预算（先 build:web）
node scripts/verify-list-scaling.mjs              # 18   长列表必须折叠/分页（写作题库 + 词库浏览 + 短语库字母段）
node scripts/verify-shadowing-completion.mjs      # 27   跟读完成标记的索引契约（纯函数真跑 + 接线）+ 语音标注 <u> 渲染接线
node scripts/verify-backup-idb.mjs                # 16   导出学习数据真的含整书译文
node scripts/verify-cloud-sync-hygiene.mjs        # 70   云同步：下行回声/失败可见/按需补推 + 13 订阅者逐个点名 + 缓存作废静态与真跑（正对照）
node scripts/verify-sentence-lab.mjs              # 16   拆句训练主干判定索引同源（真转译跑出分歧）
node scripts/verify-spelling-resume.mjs           # 24   拼写断点按词书分键 + 迁移 + 重置枚举
node scripts/verify-video-lab.mjs                 # 154  视频精听：字幕三解析真跑 + 假 IDB 真跑存储层（封顶连媒体删/写失败不谎报/译文分键）+ LCS 跟读比对真跑 + **批次翻译调度真跑（批次切分/串行增量/坏批退队尾重试一次/连坏两批收摊/stopped 停取新活）** + **拖拽文件分类 splitImportFiles 真跑** + 六件套与页面接线 + **第 ⑩ 节把"用户视角"那批逐条钉住（两段式删课/删课清进度/选视频反馈与反悔/拖拽/课表展开/重播真播/释义卡进视野/单句与 A-B 双向互斥/已听与学完态/快捷键/课时取自 durationOf 而非整片时长/学习时长按课分键）**（⚠️ 剥注释走转译器，正则会被 accept="video/*" 骗到）
node scripts/verify-chain-verdict.mjs             # 36   语块接龙判定三档（未判定不计分也不判错）
node scripts/verify-ai-parse.mjs                  # 10   AI 解析约定：25 个解析点判空 + 无贪婪正则（元判据固件自证）
node scripts/verify-dashboard-glance.mjs            # 25   首页内容扩展：续学标签表穷举（/sentences 漏过）+ 三张横幅 0 义务整卡不渲染（待复习 / 纠偏待重考，行门控含第三张）+ 本周柱状日期与高度 + ?tab= 深链三道门（只认 MODES key / 不强进向导 / 走 enterMode 并抹参数）
node scripts/verify-correction-notes.mjs            # 90   表达纠偏本：Markdown 表格抽取真跑（三源列序/表头噪声/错=对跳过）+ store 整段真跑（去重/review 记账/删除/只拒不裁/写失败可见）+ orderForDrill 排序真跑 + 三处收集接线 + 收藏页折叠列表 + 第 9 模式接线总闸（MODES 每个 key 必须有 TabsContent）与重考卡面契约（不写 SM-2、零 toast、干扰项取自整本）+ ⑦ 送进句子拼写（correctionToSpellingItem 真跑、两处入口接线、纠偏桶不许走词库加载路、空收藏也要有纠偏本入口）+ ⑨ 错点归纳（十类规则各自命中、规则顺序与证据优先级两条口径、计数之和=条目数、两处按类筛选接线）
node scripts/verify-guard-shape.mjs                 # 7    元守卫：AST 扫全部 verify-*.mjs，抓"恒真断言"（`ok(/re/, src, name)` 这种第一实参是字面量本体的写法）与漏名字的断言；自带双向自证 + inspectedTotal 防空转
node scripts/verify-interaction-fx.mjs              # 107  交互反馈层：token 单点定义与数值、缩放必须走独立 `scale`（含反向断言）、transition 白名单要带颜色项（否则顶掉 hover 变色）、9 个练习面不许有 ad-hoc active:scale 且 data-press 覆盖数只许涨、基座档位由 variant 推导、委托层四条边界（键盘不画/reduce 不建节点/无尺寸不画/在飞上限 3）、涟漪两档不许回到 currentColor、奖励层全仓唯一出口、结果层不引 motion 不弹 toast、闪卡接线 4 条（含两条正对照）、**⑩ 按压态投递机制 12 条**（`[data-pressing]` 无条件生效且钉到 token、`:active` 必须收在 `@media (hover: hover) and (pointer: fine)` 里、反向"媒体门之外不许出现 `[data-press]:active`"——真机实测触摸抬手后 :active 被平台多按住 ~400ms，按钮回弹晚、门槛→挂属性→判降级→画涟漪的顺序、收回按"清全站"、pointerup/pointercancel 既挂又撤、失焦也撤、反向"除委托层全站不许自己写 data-pressing"、降级块覆盖新机制）、**⑪ 默认可点层 15 条**（裸 `<button>`/`<a href>`/`[role=button]` 默认参与且**只给按下态**——层外规则无视特异性赢过 `@layer utilities`，写 `transition-property` 或基态 `scale:1` 会静默顶掉全站 219/142/28/21 处过渡与 hover 缩放；默认层的 `:active` 同样收在 hover 门里；委托 `closest` 与 CSS 同源、off 门的位置、涟漪宿主的 inline/static 两条兜底排在量尺寸之前、全站 `off` ≤5 处、两条走查脚本的选择器同源）、**⑫ 入场档 6 条**（`cubic-bezier(` 字面量全站只许一次、组件里不许自带曲线、`.page-enter`/`.stagger > *` 用 `var(--fx-ease)` 且 fill 是 `backwards`、reduce 停入场、≥10 个挂载点、路由级入场挂在 Layout 的 keyed 包装上）。⚠️ 全仓扫描的五条判据**共用一次转译**（`codeOf()` 记忆化），各扫各的会拖到 3m40s；一律用剥注释版本（注释里提 `data-press="off"` 也算数过一次）。⚠️ 变异 M3/M11(rAF)/M11(soft 档) 第一次都是绿的：前两条改成钉"顺序"与"cleanup 两件事"才红；第三条是正则被**降级块里同形的那条选择器**替它答了，必须把选择器一路钉到 `var(--fx-press-soft)` 那一身
node scripts/verify-settings-themes.mjs             # 35   设置页与外观主题：六套主题注册表 + 左上角返回（无来源页回首页） + classic 必须零覆盖 + initUiTheme 在 createRoot 之前 + 每个非 classic 主题都有 token/暗色/--brand 覆盖 + 全站 tsx 不再硬编码 #00B894 + 顶栏只剩搜索/设置/用户菜单 + 四个设置面板挂在 /settings + Row 把 asChild 注入的 props 展开到真按钮 + 路由与侧边栏登记；变异 M1-M5 逐条验红
node scripts/verify-imports-tracked.mjs             # 8    仓库完整性：src/ 下每条 @/ 与相对 import 都必须解析到真实文件**并且被 git 跟踪**（7295b55 漏提交 ResultFx —— 仓库里留了一条指向不存在文件的 import，而本机 typecheck/build/其他守卫在有完整工作目录的机器上全是绿的）；三条自证：不存在的模块必须解析失败、跟踪判定必须给出两种答案、注释里的 import 不算数
node scripts/verify-app-version.mjs                 # 11   版本号单一载体：meta 注入链路 + 产物一致性（产物段先 build:web）
node scripts/verify-brand-fonts.mjs                 # 35   品牌字体与中文自托管：7 条 @font-face（品牌 3 + Noto 4）+ CJK unicode-range + 外链/favicon 零残留 + woff2 结构自洽 + 生效栈正对照（产物段先 build:web）
npm run verify:rv-articles                        # 104  复习词汇文章：选词/分篇/覆盖出队/体裁主题/原位重写（含旧 slice(0,10) 正对照）
npm run verify:study-credit                       # 80   学习时长记账：闸门真跑 + 提交点接线（含精听按课去重）+ 口径双向锁（本地动作不许套闸门，含短语闪卡翻面直计时）
npm run verify:all                                # —    收尾必跑：typecheck + 全部 verify-*（自动发现，新增守卫不用登记）
```

**数据生成 / 资产**：

```powershell
npm run wordbank:split        # 改词库后必跑（见工作约定第 6 条）
node scripts/generate-cet46-books.mjs      # 重生成四六级高频/高分两本（改词单快照 scripts/data/cet46*.json 之后）
npm run books:gen-meta        # 改书目后重生成 books-meta.ts
node scripts/fetch-scp.cjs    # 重新抓取 SCP（约 1 req/s，产物 src/data/scp.ts 勿手改）
node scripts/clean-wordbank-mojibake.mjs   # 清词库 U+FFFD 乱码（幂等）
node scripts/fetch-android-tts.cjs         # 拉 TTS 资产（幂等，--force 重取）

# 品牌视觉资产（APK 图标/启动图/favicon），改字标或配色后重跑
pwsh -File scripts/gen-app-brand.ps1 -Preview docs/brand-assets-preview.png

# 真机 WebView 调试（该 ROM 对 adb shell 拒 INJECT_EVENTS，USB/无线都一样，CDP 是唯一通道）
# 先建转发：adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
# （socket 名：adb shell cat /proc/net/unix | grep webview_devtools_remote）
node scripts/device-eval.mjs eval "document.title"
node scripts/device-eval.mjs tap 400 1630    # 物理像素，自动折算 CSS
node scripts/device-eval.mjs shot .screen.png

# 电脑侧手机仿真（AVD，安卓 x86_64）—— 不依赖手机、且能验"只在 APK 成立"的那类缺陷
node scripts/phone-emu.mjs check             # 体检：加速 / 镜像 / AVD / 模拟器包 / adb
node scripts/phone-emu.mjs avd               # 本机没有 avdmanager → 手写 config.ini（1080x2340@440dpi = CSS 392.7）
node scripts/phone-emu.mjs start && node scripts/phone-emu.mjs wait
node scripts/phone-emu.mjs install           # 装 NativeThink-emu-x86_64.apk（-g 一次给齐录音权限）
node scripts/phone-emu.mjs launch && node scripts/phone-emu.mjs smoke
node scripts/walk-phone.mjs                # 装机六条走查 36 项（4 收藏 + 5 纠偏夹具，含"四级 6827 句 vs 纠偏 1 句"正对照；2026-10-20 起含 ⑤ 结果图形件真的画在界面上——答前弧与点都是 0、答后弧有描边且已收口、四颗点一颗成功绿三颗未判定灰；⑥ 默认可点层覆盖——收藏页 53 个参与者里 28 个是裸元素）。也能跑本机通道：`--port 9222 --base http://127.0.0.1:8001`（无头 Chrome + dist 构建，但那条量不到 393 视口）
node scripts/walk-video.mjs --port 9226 --base https://localhost   # 视频精听 56 条走查在 APK 上重跑（本机版：--port 9222 --base http://127.0.0.1:8001）
node scripts/walk-interaction-fx.mjs              # 交互层 23 条（设备通道）/ 24 条（本机通道多一条 hover 门）运行时走查（无头 Chrome）：pointerdown→下一帧毫秒、data-pressing 挂上且 pointerup 收回、合成事件也能量到缩放在发生、按下前后**布局盒** offsetLeft/Top 不动（不许用 getBoundingClientRect 判不占位——它含 scale）、涟漪自清、键盘不画也不挂、reduce 既不建节点也 scale 1、连点上限、奖励 canvas 唯一、三屏参与者计数（31/112/18）、**裸按钮吃同一套词汇**、**注入夹具三条**（off 整块退出 / 静态宿主补 relative 且涟漪层与按钮盒逐位重合 / 行内 `<a>` 不建宿主且 rect 不动——computed scale 写 0.985 也不算缩，只认 rect）、**入场两条**（computed animation-timing-function 真的解析成 --fx-ease，token 名写错只有这里红）、**hover 门一条**（本机通道必须命中 `(hover: hover) and (pointer: fine)`，否则鼠标那条 `:active` 规则等于没生效）。⚠️ 三条测法坑：页面表达式自己 return JSON 字符串要解两次（`JO()`）、判"看得见"不许用 `offsetParent`（**SVG 恒 null**）、单帧读数会抖（改成逐帧取最小值）
node scripts/check-interaction-on-phone.mjs --port 9226 --tier strong   # 按压词汇设备凭据 13 条（模拟器 9226 / 真机 9223；--tier default 只挑没写 data-press 的裸元素）：用 CDP Input.dispatchTouchEvent 发**设备级真触摸**，量 data-pressing 挂上→computed scale 到档位值（实测 scale 0.97、响应 0–32ms）→移开抬手仍收回→布局盒不动。⚠️ 就是这条通道量出来「这台 WebView 触摸下根本不进 :active」（按下期间整页 :active 计数恒 0），所以缩放由委托层挂属性；真机 2.0.93 又量到抬手后 :active 被平台多按住 ~400ms，因此 :active 只留在 @media (hover: hover) and (pointer: fine) 里
node scripts/walk-quickcard-tts.mjs --port 9226 --level cet4 --fixture scripts/data/tts-shape-fixture.json   # 快速闪卡朗读取证（模拟器/真机都行）：把 Audio.play/fetch/系统语音/Capacitor 桥全录下来，逐张点喇叭与例句，分得清"没发起""发起了被 AbortError 掐掉""慢了但响了"。夹具把 185 字两片的长句、含斜杠、多句、24 字上下这些可疑形状钉进同一轮，别靠随机撞。⚠️ 测法三条坑：页面上有两个 lucide-volume2（自动发音开关也是它）、设备可能带着上一轮关掉的 vocab_autospeak、读数要按 performance.now 时间窗归属而不是先清缓冲
node scripts/probe-real-media.mjs [--media 路径 --subs 路径 --short-subs 路径]   # 视频精听 52 条（两遍×26）：真媒体（blob→IDB→<video> 解码→逐词高亮→**停在中段时当前句正是那一句**→A-B 越过出点真回跳→单句与 A-B 双向互斥→学习时长按课分键 0.2→0.3→0.3→换页读回→两段式删除清干净 + **吸顶悬浮的几何判据**（这一屏收在一屏内由自己的框滚、两个不同 scrollTop 下 sticky 元素 top 一致、画面缩档、滑回顶部复原、吸住时点词释义卡整张落在播放器下方））+ 负对照（同一段媒体配一份短得多的字幕 → 必须说破假时长）；素材自动拷进 dist/client/__probe__/，期望时长与句数现算
node scripts/check-video-lab-packs.mjs [目录名关键字]   # 逐课**实测**素材包能不能用：ffprobe 读画面轨/音轨/媒体末秒 + 那份 JSON 的字幕末秒与句数 + ffmpeg volumedetect 峰值。判红四条：没画面轨（用户硬要求）、没音轨或峰值< -60dB、字幕比媒体长（播放器空转）、媒体比字幕长 >3s（片尾空白会被当成"时间线乱跳"）。当前二十二课全绿（07-22 为真实新闻/演讲/对话/纪录片/长访谈/发布会问答），差值 0–2 秒；18 课是源被平台截断的前 10 分钟，说明里已写破
node scripts/make-video-lab-packs.mjs [--add 名字关键字 [--dir 目录 --title 标题 --note 说明]] [--model small]   # 把转录伴侣的产物做成可导入的素材包（**无画面轨直接拒绝出包**；有画面的统一压到 ≤480p H.264 + faststart 并裁到字幕区间；已裁好的成品媒体会被沿用；+ 质检数字），输出 B:/nt-materials/video-lab
node scripts/fetch-video-source.mjs <URL> <落地名>   # 拉源并核对"平台声称时长 vs 实际时长"（B 站对某些视频只给前 10 分钟，文件自洽、下游全都看不出截断）：比值 <95% exit 3、没画面轨 exit 4 —— 拉源一律走它，别裸跑 yt-dlp
node scripts/import-video-lesson.mjs --port 9223 --media x.mp4 --subs x.json --no-saf   # 真机导入：SAF 打不动、setFileInputFiles 被 WebView 拒，只能分块注入字节走 App 自己的 onChange（--no-saf 把「选完媒体顺手弹系统选择器」接掉，连灌几课才不用在手机上点取消；pendingMedia→onChange→存库全都照原样真跑）
node scripts/check-video-on-phone.mjs <课名关键字>   # 真机侧 11 条行为核验（在**自己导入的那一课**上跑，不碰用户原有课）：blob 读回 <video> 真解码 + videoWidth>0 有画面 + 已听 x/y + **暂停态点重播：钩 play() 数调用次数**（别靠固定延时读 paused，真机会假红）+ 点词后释义卡整卡在屏内 + 单句/A-B 互斥按钮态 + IDB 里 m:/s: 条数按索引记录推（别写死数字）+ 吸顶两条（**拍"原位"前必须先把框归零**；不许断言 `docScroll<=2` —— 真机 safe-area 天生带 47px 余量，改钉四个取样点 `document.scrollTop` 恒为 0）+ 跟读一条（判据用结构：原因段非空**或**出现"识别到"，非英文幻觉回报必须不计分）
# node scripts/check-tts-latency.mjs [--port 9226 模拟器 | 9223 真机] [--quick]   # 离线朗读实测台账：每个音色的 RTF、入队顺序 A/B（首包等几次合成）、缓存冷热；直连 SherpaTts 插件并给每段文本带运行级 nonce（不然第二次全命中原生文件缓存，测的不是合成）。**两形态都量过、数进 tts.md 开头那张表**：Kokoro RTF 模拟器 1.38–1.75 / 真机 1.18–1.25 —— 都 >1，所以"长文会停顿"那句不许因为真机快一些就撤；首包"砍半而两轮总时长相等"两边同形，但毫秒数不可跨形态迁移）
#   吸顶为什么不吸（布局类问题先隔离再改）：把 scripts/probe-sticky.html 拷进 dist/client/__probe__/ 打开，
#   ?ov=0/1/2/3 切外壳那三层 overflow，__scroll(300) 后跑 __r() 看 winTop —— 恒 0 才叫吸住（详见 video-lab.md §3.5）
#   smoke 之后走查照旧：CDP_PORT=9226 node scripts/device-eval.mjs eval "<表达式>"
# ⚠️ 起不来先看 check 的"加速"那行：x86_64 必须有 AEHD/WHPX，没驱动时 emulator 直接拒启
#    （管理员跑一次 SDK 里现成的 extras/google/Android_Emulator_Hypervisor_Driver/silent_install.bat）
```

**提交约定**：`npm run typecheck` 通过后再提交。有 pre-commit hook（`npm run lint` = typecheck + eslint 并行），**hook 失败就修根因，不要 `--no-verify`**。手机端数据只进 localStorage / IndexedDB，不写系统目录。

---

## 路由地图（当前真实页面）

| 路由 | 页面文件 | 模块 key | 模块文档 |
|------|---------|----------|---------|
| `/` | `DashboardPage` | — | dashboard-progress-favorites |
| `/think` | `ThinkInEnglishPage` | `think` | think-in-english |
| `/chunks` | `ChunkTrainingPage` | `chunks` | chunks |
| `/conversation` | `ConversationPage` | `conversation` | conversation |
| `/shadowing` | `ShadowingPage` | `shadowing` | shadowing |
| `/articles` | `ArticlePage` | `articles` | reading |
| `/vocabulary` | `DeepVocabularyPage` | `vocabulary` | vocabulary |
| `/favorites` | `FavoritesPage` | — | dashboard-progress-favorites |
| `/writing` | `WritingPage` | `writing` | writing |
| `/sentences` | `SentenceLabPage` | `sentences` | sentence-lab |
| `/spelling` | `SpellingPage` | `spelling` | spelling |
| `/video` | `VideoLabPage` | `video` | video-lab |
| `/cet` | `CetExamPage`（外链 CetThink，不在包内） | — | — |
| `/progress` | `ProgressPage` | — | dashboard-progress-favorites |
| `/settings` | `SettingsPage` | — | shell-and-navigation §8（设置页与外观主题） |

**新增页面必须同步六处**（前两处漏了会坏，后四处漏了**静默不显示**，详见 [shell-and-navigation.md](./docs/modules/shell-and-navigation.md) §4）：

1. `src/app.tsx` 路由 + lazy
2. `src/components/AppSidebar.tsx` `NAV_ITEMS` + `ROUTE_PREFETCH`（**注意 `MobileBottomNav.tsx:14-22` 还有一份复制的 7 条预取表**）
3. `src/pages/DashboardPage/constants.ts` 的 `MODULES`（进度环）
4. `src/lib/use-learning-stats.ts` 的 `ILearningStats.moduleProgress` 类型 + 默认值
5. 同文件 `:70-80` 的 **`MODULE_PROGRESS_KEYS` 白名单** —— 漏了会被 `mergeStats` 丢弃
6. `ProgressPage/components/ProgressCharts.tsx` 的 `MODULE_COLORS` + `MODULE_NAMES`

---

## 目录速查

```
src/
├── app.tsx                 # 路由（13 页全 lazy，每条一个 ErrorBoundary）
├── index.tsx               # 启动顺序、唯一的 <Toaster />、SafeShell
├── components/
│   ├── AppSidebar.tsx      # 侧边栏 + 路由预取
│   ├── Layout.tsx          # Suspense /  safe-area / focus 模式
│   ├── Header.tsx          # 帮助 / 全站搜索 / 主题入口挂载点
│   └── ui/                 # shadcn 组件（dialog 基座含窄视口兜底）
├── lib/
│   ├── use-learning-stats.ts   # 学习统计（storage 权威 + 跨实例广播）
│   ├── use-word-learning.ts    # SM-2 复习算法 + 词汇进度权威源
│   ├── use-tts.ts              # TTS 多引擎（切片上限 180）
│   ├── sherpa-tts.ts           # 离线 sherpa 封装（合成/缓存/在途去重/闪退自愈）
│   ├── tts-voice-catalog.ts    # 音色 speakerId 表（在前端，不在原生）
│   ├── use-favorites.ts        # 收藏（type=word 与背单词共用）
│   ├── quickcard-history.ts    # 快速闪卡：留档 / 当前累积 / 断点续学
│   ├── vocab-session.ts        # 复习顺序 + 答错重排（隔 4 张，最多 2 次）
│   ├── vocab-swipe.ts          # 滑动手势决策表
│   ├── custom-words.ts         # 生词本（level='custom'）
│   ├── correction-notes.ts     # 表达纠偏本（AI 反馈里的错句→地道说法，自动收集 + 重考记账/排序）
│   ├── video-lab.ts            # 视频精听：字幕三格式解析 + IDB `media` 三键分片（索引封顶连媒体删）+ LCS 跟读比对
│   ├── word-notes.ts           # 每词助记
│   ├── reader-highlight.ts     # 阅读器复习词高亮
│   ├── use-stable-shuffle.ts   # 稳定洗牌（洗牌列表 + 下标定位当前题必须用它）
│   ├── capped-cache.ts         # localStorage JSON 缓存统一读写 + FIFO 封顶 + 键迁移
│   ├── colloc-ai-cache.ts      # 搭配 AI 翻译缓存单点归属
│   ├── app-env.ts              # 版本与运行平台单一来源
│   ├── safe-storage.ts         # 带用户前缀的 localStorage 封装（云同步双写挂在这）
│   ├── use-cloud-sync.ts       # 上行/下行/防抖双写
│   └── idb.ts                  # IndexedDB KV（无枚举键的 API）
├── pages/                  # 一页一目录
├── data/                   # 语料、词库、语块等数据
└── hooks/use-ai.ts
functions/                  # Cloudflare Pages Functions（APK/桌面也用它）
scripts/                    # 打包、TTS、语料、verify-* 守卫
electron/ + server/         # 桌面主进程 + 本地 API 服务
android/                    # Capacitor 工程（SherpaTtsPlugin.java 是原生 TTS）
docs/                       # PRODUCT-SPEC / PROJECT-HANDOVER / modules/
```

---

## 学习统计（关键约定）

细节见 [storage-and-stats.md](./docs/modules/storage-and-stats.md)。

- Hook：`src/lib/use-learning-stats.ts`；键 `__nativethink_learning_stats` / `__nativethink_calendar`。
- **以 localStorage 为权威源**，多实例通过 `STATS_CHANGED_EVENT` / `CALENDAR_CHANGED_EVENT` 广播后重读。
- 日期一律 `formatDate()`（本地日期），**禁止 `toISOString().slice(0,10)`**（东八区凌晨会错天）。
- `moduleProgress` 键必须与 `MODULES[].key` 一一对应；写不存在的键**静默无效**（`if (modKey in …)`）。
- `addStudyMinutes(minutes, key)` 实际是 `moduleProgress[key] += minutes * 0.5`，**上限 100**。
- 各实例须订阅 `STATE_EVENT` 重读（hook 内已接，带防回环），否则模式首页角标学完一轮不刷新。
- 断点续学按（模式, level）分键：`__nativethink_vocab_session_<level>` / `_daily_session_` / `_quickcard_session_` / `__nativethink_chunk_review_session` / `__nativethink_spelling_resume_<level>`（拼写那份可注入替身真跑，见 `verify:spelling-resume`）。

---

## 设计系统（不可漂移）

- 主色青蓝/青绿：主按钮、激活导航、进度环；品牌锚点 `#00B894`（CSS 里只走 `--brand` / `--brand-strong` / `--brand-rgb`）
- 外壳是墨面、内容是纸面：侧栏/手机抽屉固定 `#0C1712`（不随主题），桌面主区暖白 `#F3F4EF`；墨面信号色 `--lime`、暖色强调 `--warm`
- 一屏只留一处饱和：主行动块或当前导航，二者不要同时抢
- 圆角：卡片统一 `24px`（`index.css` 的 `[data-slot="card"]` 单点），按钮 `rounded-full`/`rounded-2xl`，dock 20px；标题一律正体（`h1-h4` 在 `index.css` 强制 `font-style: normal`）
- 材质：细边 + 短影；**禁止彩色光晕**（`shadow-emerald/violet/sky…` 已被全局清零）、禁止大面积粉彩图标块、禁止渐变大按钮
- 反馈色（柔和，勿用考试红）：成功/地道 `hsl(150 55% 42%)`，警告/中式 `hsl(35 85% 55%)`，错误用低饱和红、克制使用
- 深浅主题：`src/tailwind-theme.css` CSS 变量；UI 语言中文
- 完整视觉 token 与反模式见 `docs/PRODUCT-SPEC.md`「UI 设计指南」，外壳实现见 `docs/modules/shell-and-navigation.md` §8

---

## 通用坑（跨模块）

只留"在任何文件都可能撞上"的；模块专属坑已搬进 `docs/modules/`。

| 现象 | 原因 | 修法 |
|------|------|------|
| 刷新后"记忆丢失" | `safeStorage` 前缀随登录状态变化（`getUserId()` 在平台 user 出现后会变），且 `_prefix` 缓存整会话不变 | 迁移只覆盖旧格式 `__miaoda_<appId>__:`，anonId 自愈只匹配 `__global__` —— **平台登录态的前缀不在恢复范围**。新键先决定走 `safeStorage` 还是裸 `localStorage`（后者不随前缀变，但完全不同步），见 [storage-and-stats.md](./docs/modules/storage-and-stats.md) §3.2 |
| 进度环 NaN / 0% | `moduleProgress` 缺 key，或写进了不存在的 key（`if (modKey in …)` 静默无效） | 键对齐六处清单；`RingProgress` 对非法值回退 0 |
| 白屏 `Cannot access X before initialization` | TDZ：hook/const 声明顺序 | `useState`/`useRef`/`useMemo` 放到使用之前 |
| 页面永远 loading | `setLoaded(true)` 在 try 内，出错不执行 | `finally { setLoaded(true) }` |
| ref 记录"第一次对、之后静默失效" | **ref 不随组件重挂载归零** | 每轮开始显式清空。真实案例：`ConversationPage.tsx:151-152` 的 `mountedRef` 在 StrictMode 双挂载后恒 false → dev 下对话永远空白 |
| 切 tab/退出/杀 App 后状态丢 | 切 Tab 卸载组件，state 随之消失 | 显式持久化 + 挂载后恢复（`Layout.tsx:122` 的 `key={location.pathname}` 会让每次导航都重挂载） |
| 洗牌列表 + 下标定位当前题悄悄漂移 | `useMemo(() => shuffle(items), [items])` 依赖数组身份 | 用 `use-stable-shuffle.ts`；接入点索引加守卫 |
| StrictMode 双调用使副作用翻倍 | setState updater 里再调 setState / 写 storage | 副作用提到事件层，updater 保持纯（`capped-cache.ts:32-35`） |
| 首屏白背一坨永不执行的代码 | 给只用懒加载页面的库写强制 `manualChunks`，或壳里同步 `require` SDK —— 都会变成**入口 chunk 的静态依赖** | 删掉强制分块规则 / 改 `import()`；用 `npm run verify:bundle-budget` 从**产物**反查 |
| 窄视口浮层点不到底部控件 | Popover 是 portal，页面滚动救不了；Dialog 基座 `translate-y-[-50%]` 超高时**上下两头一起溢出** | 外层 `max-h-[calc(var(--radix-popover-content-available-height)-1.5rem)] flex flex-col`，标题 `shrink-0`，正文 `flex-1 min-h-0 overflow-y-auto overscroll-contain`；正文里的嵌套小滚动在移动端去掉 `max-h + overflow-y-auto` |
| 一屏渲染不完的列表拖垮首屏 | 一次性铺全部条目 | 默认折叠/分页 + 展开入口（**不许削弱用户入口**）；补 `verify-list-scaling` 式断言 |
| 弹窗打开时按 Esc 连带退出当前流程 | Radix 在 document 冒泡阶段**同步 flush** 关弹窗 | 键盘监听用捕获阶段 `addEventListener('keydown', fn, true)` |
| 按词累积的缓存撑爆 localStorage | 只增不减，写失败后整份静默丢失（症状是"刷新后数据没了"） | **分两类**：AI 派生可重算 → `cappedPut` FIFO 封顶；用户创作不可重算 → `appendCapped` **只拒绝新增、绝不裁剪** |
| 落盘失败完全无声 | `safeStorage.setItem` 过去 `catch {}` 吞掉配额错误 | 现在返回布尔（`safe-storage.ts:175`）；写用户清单的 effect 一律 `if (!persistJson(k, x)) warnStorageFull()`（全站 60s 去抖一条 toast，`capped-cache.ts:48`） |
| AI 生成内容"格式异常"误报 | `use-ai` 失败返回 `''`，页面把空串当解析失败 | **先判 `result.trim()` 为空 → 服务不可用**；解析一律 `extractJson`，勿用贪婪正则。全仓 25 个解析点由 `npm run verify:ai-parse` 扫 |
| 功能"两端都写了却点不到" | 组件与云函数都存在，但没有页面挂载；静态检查看不出断线 | 挂载点写进回归断言（`verify-overlay-fit` ⑤ 剥注释全仓扫描：`<Toaster />` 只许挂 `src/index.tsx` 一处、Layout 必须渲染 Header）；新功能入口必须真机/真页面验证可达 |
| 提交类操作谎报成功 | 后端只有一个 boolean，503（通道未配）与网络失败都归成"没成功"，UI 一律 toast 成功 | 结果分档返回，UI 按档给不同提示；失败保留条目并提供重试入口 |
| 全站 toast 提示不出现 | `ui/sonner.tsx` 有 `Toaster` 但没人挂载 | 唯一出口在 `src/index.tsx`；新页面不要再挂第二个，`verify-overlay-fit` ⑤ 剥注释全仓扫描会断言 |
| 全屏浮层顶部被手机状态栏压住 | `fixed inset-0` 的浮层脱离文档流，**绕过了外壳 `SidebarProvider` 那层 safe-area 内缩**（Android 15+ edge-to-edge 下 inset 实测 47px） | 浮层根节点自己补 `safe-area-top safe-area-bottom`（阅读器 `PageReader.tsx:1210`，2026-09-30 真机反馈已修）；新增贴顶全屏层同理，`verify-overlay-fit` ④ 会扫；本机验收用 CDP `Emulation.setSafeAreaInsetsOverride`（insets 传对象）强制 47/24 量顶栏 top |
| 页面里 `position: sticky` 静默不吸（写了 `sticky top-0` 但元素跟着内容一起滚走） | **外壳把 sticky 的约束根抢走了**：`SidebarInset` 的 `overflow-x-hidden`（`Layout.tsx:115`）按规范会把**计算出的 `overflow-y` 变成 auto**，`main` 又明写 `overflow-y-auto`（`:117`）—— 两层都是"滚动容器"，可它们的高度随内容长（外层只有 `min-h-screen`，没谁把高度钉在视口上），于是**真正在滚的一直是文档**（实测 `main.scrollHeight − main.clientHeight = 0`）。sticky 相对"最近的滚动容器"算偏移，而那个容器从不滚 → 永远不吸 | 别改外壳（会牵动路由复位的 `window.scrollTo`、语块库的单一滚动权威、各页 `pb-20` 让位）。要让某页吸顶，就给那一屏**自己做滚动容器**：把高度钉成 `innerHeight − 本层绝对 top − main 下边距`（实测出来，不是猜 calc），内容进那个框，`sticky` 与 `IntersectionObserver` 的 root 都指它 —— 完整实测表与五条口径见 [video-lab.md §3.5](./docs/modules/video-lab.md)；判据用几何（两个 `scrollTop` 下 `rect.top` 一致），class 里有 `sticky` 不算数 |
| 按下去没有形变（网页版有、APK 没有），或"用 CDP 怎么按都不生效" | **`：active` 在 Android WebView 的触摸下根本不生效**：`Input.dispatchTouchEvent` 是设备级真触摸，`pointerdown` 带着 `pointerType:"touch"` 到了元素、涟漪节点也建了，但按下期间整页 `document.querySelectorAll(':active').length` 恒为 **0**。合成事件（`dispatchEvent(new PointerEvent())`）同样不产生激活 —— 两条通道都量不到 `:active` | 凡是要在设备上成立的按压反馈，**状态由 JS 投递**：委托层 `pointerdown` 挂 `data-pressing`，`pointerup`/`pointercancel`/`blur`/卸载四条路径收回；CSS 把 `:active` 与 `[data-pressing]` **并列**在同一条规则里（鼠标那条白捡零延迟）。附带一条判据坑：`getBoundingClientRect()` **含 scale**，"缩放不占位"必须看 `offsetLeft/offsetTop`（布局盒），用 rect 判会假红（115px 缩到 0.97 视觉左边自己就动 1.7px）。完整口径见 [interaction-fx.md](./docs/modules/interaction-fx.md) §3.4-3.5 |
| 某个可点东西按下去没反应，或涟漪画在别处 | 批 2 起**裸 `<button>` / `<a href>` / `[role=button]` 默认可点**（`index.css:356-357` + 委托的 `closest`），不参与只有两种合法原因：① 显式 `data-press="off"`（全站目前仅侧边栏拖拽把手一处）；② 它是**非替换行内盒**（`display:inline` 不可 transform —— 实测 computed `scale` 写着 0.985 而 rect 一动不动，所以正文 `<a>` 天然不参与，但涟漪必须显式不画）。涟漪画在别处 = 宿主是 `position: static`（`.fx-ripple-host` 是 `absolute inset:0`，会去贴某个祖先） | `ripple()` 里两条兜底：static → 就地补 `relative`、inline/contents → 直接不画（都排在量尺寸之前）。契约见 [interaction-fx.md](./docs/modules/interaction-fx.md) §3.6，`verify-interaction-fx` ⑪ 钉"三处选择器同源 + 两条兜底 + off 总数 ≤5" —— **不许拿 `off` 当逃生口绕开"一套词汇"** |
| 练习界面一张接一张弹提示 | 评分/翻面/收藏/开关各处都挂 toast，答 30 张就是几十条（用户两次要求静默，最后一条是「不要在练习界面有任何提示」） | 三个练习模式只剩**白名单**：失败/空队列 + 唯一撤销入口；其余反馈交给界面计数（已评 / Flame 连对 / 今天新学 x/y / ★ 实心 / 进度条）。新增提示必须先改守卫 ⑧d 白名单，见 [vocabulary.md](./docs/modules/vocabulary.md) 注意事项 13 |
| 手机上"点了没反应／转圈不结束"，网页版一切正常 | **只在 APK 成立的原生桥逻辑**：`async` 函数 `return` 一个 Capacitor 插件对象 → 它是 Proxy、`typeof x.then === 'function'` → Promise 同化把 `then` 当原生方法发出去 → resolve/reject 永不调用 → **永久 pending**（不是抛错，`try/catch` 兜不住）。同类的还有"整屏抽屉导航后不关，新页面被吞点击"（`AppSidebar.tsx:108`），以及**"接口存在≠通道可用"**（精听跟读：模拟器 WebView 里 `webkitSpeechRecognition` 存在、`start()` 也不抛，但 onresult/onerror/onend 一个都不回 → 按钮永久停在"正在听…"，2026-10-18 装机走查才抓到） | 插件对象一律装在持有者里返回（`native-tts.ts:51,67-77`），原生桥的每个 await 自带超时；这类调用**还要看门狗 + try/catch 兜"从不回调"**（`VideoLabPage.tsx:413-460`，9 秒收摊并给界面文案）；前两条由 `verify-native-tts`(45) 与 `verify-overlay-fit` ⑥⑦ 守，第三条由 `verify-video-lab` 两条断言守，**但真凭据只有真机/模拟器 CDP**（typecheck 与静态守卫都看不见）。**同族还有一条反的**：2026-10-19 同一台真机上通道会**没人说话也回一句中文**（`你的蛋蛋`），旧写法照样丢给评分函数 → 界面显示"识别到 0% · 没读准"，把设备幻觉打成学习者的分数；现在**回报内容与目标语言对不上（英文课里一个字母都没有）就不计分、只说实话** |
| 某个页面一点就「页面出错」，同一个组件在别的页面正常 | **共享组件带了 hook 前置条件**：`useFramerMotion()` 在没有 `<LazyFramerProvider>` 祖先时曾直接 throw（真机 2026-10-17：收藏页「开始回顾」裸渲染 `FavoriteReviewMode`，学习记录页包了 provider 所以那边一直正常）。守卫旧写法"任意一个宿主包了就放行"看不见这种缺线 | 渲染点自己包 provider（`verify-overlay-fit` ⑦ 现在**逐个宿主**点名 + 两处入口分别钉）；hook 侧改成缺 provider 时退化成无动画 + 一次性 `console.warn`（动画前置条件不许能掀翻用户的页面）。同族的另一条：收藏清单读盘不校验形状，`content` 是对象就整页崩 → `use-favorites.sanitizeFavorites` 在读盘边界收掉（守卫 ㉔ 真跑） |
| 守卫打印「N/N 通过 ✓」但那条断言其实没管事 | ① 条件位写成了**字面量本体** —— `ok(/re/, src, '名字')`（正则对象永远真，跨行写更容易看漏，2026-10-17 真翻过一次，是变异实验抓到的）；② `ts.transpileModule` 不带 `target` 降到 ES5 —— `[...map.entries()]` 被换成只读 `.length` 的 `__spreadArray`，**真跑静默返回空数组** | ①`node scripts/verify-guard-shape.mjs`（AST 全仓扫恒真断言，自带正/反对照与 `inspectedTotal` 防空转）；② 所有转译真跑显式写 `target: ts.ScriptTarget.ES2022`（替身必须忠实于浏览器运行时）；新增/改动断言**必须逐条跑变异**，"改坏了还全绿"就是断言没在管事 |
| 模拟器"起不来"其实是僵尸设备 | `adb shell` 打到 `offline` 设备会**无限期挂住**（脚本看起来卡死）；而 Windows 上 `emulator.exe` 只是启动器，VM 是 `qemu-system-x86_64-headless.exe` —— 只杀启动器会留孤儿 VM 占着 5554/5555，`adb devices` 从此永挂一条假 `offline` | `phone-emu.mjs` 里所有设备调用带超时、`stop` 两个镜像名都收、必要时 `adb kill-server`；判活/诊断一律 `node scripts/phone-emu.mjs status`（它分进程、adb 设备、boot_completed 三层报） |
| 顶部内容被一条空条遮住 | 无内容但带 `bg-*` 的 sticky 元素仍占位 | 只在有内容时渲染 |
| 图表数值压住标题 | 容器高度装不下「值+柱+轴」三层 | 容器高度 ≥ 三层实测高度 |
| 打出的 APK 里是上一次的 web 产物 | `package:apk` **不重建 web**，只拷 `dist/client` 现成的东西；打包日志与 versionCode 全都正常，看不出来 | `scripts/ensure-web-build.mjs` 已是 `package:apk`/`package:desktop` 前置（源码比产物新、或产物内版本 ≠ version.properties 就自动补跑 `build:web`）；复核靠入口 chunk 的内容哈希比对，见 [build-release.md](./docs/modules/build-release.md) §1 |
| 把发布 APK 装进 x86_64 模拟器（或反之） | 发布线 `abiFilters` 只有 `arm64-v8a / armeabi-v7a`（`android/app/build.gradle`，为了不带那 42MB 冗余原生库），模拟器要的是 `x86_64` —— 架构不匹配时**装上就静默没有离线朗读**（sherpa 插件的 `.so` 根本不在包里），界面一切正常，很容易误报成"TTS 又挂了" | 模拟器走 `npm run package:apk:emu`（`NT_EMU=1` 翻成只打 x86_64），产物名 `NativeThink-emu-x86_64.apk` 与发布线分开；脚本收尾读 **APK 自己的 zip 中央目录**自证（x86_64 .so 在 / www 与 books、piper、tts 资产在 / arm 为 0 条），不看 gradle 中间产物 |
| 装 APK 后部分本地数据"消失" | 某些 ROM 上 WebView localStorage 随更新被清 | 重装前用「学习记录 → 导出」备份；重要数据登录走云同步 |
| 真机上字更大、长词折行，本机仿真不复现 | 真机布局视口是 **393 CSS**（1283 物理px ÷ 3 ≈ 428 是估算、错），且 `MainActivity.java:22` 的 `settings.setTextZoom(120)` 让全站字号再 ×1.2（真机 telecom 实渲 36px、compatible 57.6px —— 长词折行即这两个叠加） | 几何/字号核验用 393×852 + `webkitTextSizeAdjust:'120%'` 仿真（**每次页面导航后必须重施**），别再用 428 估算；仿真值与真机逐项核对，见 [verification.md](./docs/modules/verification.md) §5 第 21 测 |

---

## 工作约定

1. **先读再改**：动任何模块前先读 `docs/modules/<模块>.md`；动进度/存储前先读 `use-learning-stats.ts`、`safe-storage.ts` 与目标页现有 hook 用法。
2. **新增页面六件套**：见上面路由地图那节。
3. **typecheck 必过**：`npm run typecheck`；pre-commit 会跑 `lint`（typecheck + eslint），不要绕过 hook。
4. **不引入考试焦虑视觉**；不改主色/圆角/阴影语言。
5. **打包体积敏感**：不要往 `public/` 塞大文件 —— 但 `public/books/`（23MB 随包全文）**是例外且有原因的**，删之前先读 [reading.md](./docs/modules/reading.md) §3.1。大模型走 `models-bundled/` 硬链接与 `scripts/` 流程。
6. **改词库后必须重跑 `npm run wordbank:split`**：`src/data/wordbank/data/<level>.ts` 只保留核心字段，detail 在 `<level>.detail.ts`。任何词库生成器都会重新写出全字段主文件，重跑拆分脚本即可恢复；脚本幂等。`preloadLevels` 默认仍加载 detail，只有 `preloadCoreOnly` 跳过。
7. **产品需求勿覆盖**：`docs/PRODUCT-SPEC.md` 是需求规格；本文件是 agent 工作指南。
8. **Git**：未明确要求不要 commit/push；仓库已用 worktree 时避免在主工作树做跨分支 git 操作。
9. **APK 版本号与产物命名**：`android/version.properties` 的 `versionCode` **每次打包必须递增**（Android 拒绝非递增升级 → 要求卸载 → 丢数据）；`versionName` 走 `major.minor.patch`，`npm run version:apk-bump` 只递增 patch。产物命名规则与"缺资产会静默出残包"的完整清单见 [build-release.md](./docs/modules/build-release.md) §2、§5.2。
10. **验证要真**：改完要跑对应守卫；语义变了就**重新推导断言**而不是放宽它，元判据要带正对照。断言"过了"之前先问这条断言在实现被故意改坏时会不会红（见 [verification.md](./docs/modules/verification.md) §4）。
11. **文档也要核实**：本轮模块文档写作中，本文件的三处旧说法被推翻并已修正 —— 云同步前缀过滤的真实作用、学习数据实际走 `safeStorage`、自动朗读键的实际生效范围（快速闪卡**不读**它）。

---

## 提交前清单

- [ ] `npm run typecheck`
- [ ] 跑与改动相关的 `scripts/verify-*.mjs`；**收尾一律 `npm run verify:all`**（只跑"自己那条"会让引用同一份源码的其他守卫悄悄失效，2026-09-30 真翻过一次）（当前基线，按脚本名查表更准：loading 53 · books-meta 227 · vocab-cards 489 · vocab-caches 85 · tts-progress 6175 · tts-hardening **31** · **native-tts 45** · chunks-data **55** · overlay-fit **41** · bundle-budget 10 · list-scaling 18 · shadowing 27 · backup-idb 16 · cloud-sync 70 · sentence-lab 16 · spelling-resume 24 · **video-lab 154** · ai-parse 10 · app-version 11 · brand-fonts 35 · char-hygiene 9 · rv-articles 104 · study-credit **80** · chain-verdict 36 · dashboard-glance 25 · correction-notes **90** · guard-shape **7** · **interaction-fx 107** · **imports-tracked 8** · **settings-themes 35**；合计 **8,093**，2026-10-21 第 52 测）
- [ ] 改过词库 → `npm run wordbank:split` + `node scripts/verify-wordbank-loading.mjs` + `node scripts/verify-char-hygiene.mjs`（清了坏字符还要递增 `CACHE_VERSION`，否则老缓存挡住修复）
- [ ] 改过语块库数据（`chunks.ts` / `chunks-extra.ts`）或去重接线 → `node scripts/verify-chunks-data.mjs`（**手改要写进 `chunks-extra.ts`**，`chunks.ts` 会被生成脚本整体重写；新增重复要在守卫的基线里显式登记）
- [ ] 改过 `android/app/build.gradle` 的 `abiFilters` 或任何打包脚本 → 至少跑一次 `npm run package:apk:emu`（它收尾会读 APK 自己的 zip 中央目录自证：x86_64 的 sherpa `.so` 在、www/books/piper/tts 资产在、arm 0 条）；模拟器装机走 `node scripts/phone-emu.mjs check`
- [ ] 改过音色/模型 → `npm run check:tts-voices`；改过切片/进度 → `verify-tts-progress`；改过降级**或内置引擎的入队顺序** → `verify-tts-hardening`（裸跑，它没有 npm script）；**改过任何取用 Capacitor 插件的地方（`native-tts.ts` / `use-tts.ts`）→ `verify-native-tts`**
- [ ] 改过 `vite.config` 的 chunk 或壳里的静态 import → `npm run build:web` + `npm run verify:bundle-budget`
- [ ] 改过 `ui/dialog` 基座或设置面板 → `verify-overlay-fit`
- [ ] 改过 `src/index.css` 的 `--fx-*` 段 / `ui/button` 基座 / `lib/press-fx.ts` / `CelebrateLayer` / 任何练习页的按钮 class → `node scripts/verify-interaction-fx.mjs` + `node scripts/walk-interaction-fx.mjs`（改基座=全站共享，务必再跑 `verify:all`）；设备侧凭据走 `node scripts/check-interaction-on-phone.mjs --port 9226 --tier strong`（模拟器）/ `--port 9223`（真机）——**`:active` 在 Android WebView 的触摸下不但按下期间不生效**（设备级真触摸实测：pointerdown 到了、涟漪建了、整页 :active 恒 0），**抬手后还会被平台多按住 ~400ms**（真机 2.0.93 实测，按钮回弹晚），所以 `:active` 只在 `@media (hover: hover) and (pointer: fine)` 里留、由委托层挂 `data-pressing` 投递触摸手感，这条通道量的就是它；`--tier default` 挑的正是**默认可点层**那一片（只挑没写 `data-press` 的裸元素），批 2 之后三档都要跑
- [ ] 改过 `use-tts` 的**取消/降级链**（speak/cancel/stopAudio/playUrl/playChunkWithFallback）→ `node scripts/verify-tts-hardening.mjs`（E 节 10 条）+ 设备取证 `node scripts/walk-quickcard-tts.mjs --port 9226 --level cet4 --fixture <词表.json>`（静态守卫看不见"被自己掐掉"这类竞态，只有真装机能看见）
- [ ] 改过 `functions/` → 想清楚网页/APK/桌面三条路；改过 index.html 版本 meta 或 `version.properties` → `node scripts/verify-app-version.mjs`（产物段先 build:web）
- [ ] 改过 index.html 的字体/图标引用或 `public/fonts/` → `node scripts/verify-brand-fonts.mjs`（产物段先 build:web；**不许再引入外链字体域名与 icon**）
- [ ] 新增/修改模块行为 → 同步更新 `docs/modules/` 对应那篇（**带 `文件:行号`**）
