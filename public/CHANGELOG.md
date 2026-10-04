# NativeThink 开发日志

## 2026-10-05
- fix(shadowing): 「语音标注」面板把 <u> 重读标记渲染出来（此前整段剥掉）+ 守卫补 4 条断言 (`777f4ff`)
- docs(help): HelpGuide 各模块介绍逐条核过 —— 修正 8 处过期描述（词汇六模式 / 语块五板块 / 思维四方式 / 跟读无级调速等） (`68730c3`)
- fix(tts): Kokoro speakerId 静态锁定 —— 直读模型内嵌元数据核对 11 音色 + 统一 54 口径 (`aef8f3f`)
- fix(storage): 写作历史与跟读完成标记条数+字节双封顶（trimOldest），写失败可见 (`56f971f`)
- chore(hooks): post-commit 改用一次全文件重写，不再堆空行；.wrangler/ 入 gitignore (`4556434`)
- refactor(feedback): 整体下架反馈功能（入口/服务/云函数/守卫/文档全清） (`ac6ebf2`)

## 2026-10-01
- docs(verification): 修正 INJECT_EVENTS 拒权的通道口径 + 补 USB 复测结果 (`302b183`)
- docs(verification): 真机走查补记 —— 字体缩放 ×1.1 / 无线通道两条限制 / 本轮实测结果 (`48b84f5`)
- fix(vocabulary): 卡片单词回退到按词长三档字号（撤 FitWord 自适应缩放） (`e0da84c`)
- fix(vocabulary): 练习界面不再一张接一张弹提示（用户口径：任何提示都不要） (`a613431`)

## 2026-09-30
- docs(verification): 补两条复习检测实测事实（背面才有评分 / 回看卡只有「按 →」） (`3a893c9`)
- docs(verification): 真机通道三条坑（Browser.close 会杀 WebView / 导航销毁上下文 / 走查按「接着上次」） (`8aa8ba0`)
- docs(verification): 真机补验 84/2.0.39 的结果，并把高亮结论改挂到可复现的 A/B (`d11117a`)
- docs(reading): 说清高亮与重生成的两套词表优先方向为何相反 (`696f9bd`)
- fix(reading): 阅读器复习词高亮按 highlightWords → rvWords 回退 (`50ea54e`)
- docs(vocabulary): 快速闪卡去档位的 CDP 记录补全（18 项，含 393px 顶栏不换行不溢出） (`75a562e`)
- fix(vocabulary): 快速闪卡训练页不再提供每轮词数，避免中途切换清空本轮进度 (`090ed6f`)
- fix(reader): 阅读器全屏层自带 safe-area，顶栏不再被状态栏压住 (`be64f2f`)
- fix(packaging): package:apk 前置 ensure-web-build，杜绝把上一次 web 产物打进新包 (`cdf2a6e`)
- docs(chunks): 接龙三档判定的 CDP 真点补齐（39 项），删掉未覆盖的自认缺口 (`f02db88`)
- fix(chunks): 语块接龙判定改三档，未判定不再当通过送分 (`7427dc6`)
- docs: 2026-09-30 全天四项改动的交接记录 + 守卫计数与体积复测 (`6ca2cba`)
- fix(cloud-sync): 下行后 7 个数据 hook 都重读，并掐掉回声写 (`cb6c180`)
- feat(reading): 复习词汇文章放开词数、加体裁主题、单篇原位重写，漏用的词退回词表 (`9b1e263`)
- fix(storage): 落盘失败不再静默；累积缓存分两类处置 (`d242cf4`)
- fix(stats): 学习时长按动作计 + 同一作答只记一次，堵住重复刷进度环 (`8f2a603`)
- feat(reading): 复习词汇文章改为选词+分篇，逐篇落盘可收藏删除，用词从词表出队 (`f621aa0`)
- docs(guide): 句子拼写的练法描述与实际两档玩法对齐 (`0deaaae`)
- fix(vocab): 换书向导一眼可见 + 闪卡换卡提速与答错重排延后 (`0121807`)
- fix(sentence-lab,spelling,chunks,think,shadowing): 断点分键、主干索引同源、Updater 纯化、自动朗读依赖修正 (`40b5b39`)
- fix(chunks,feedback,copy): 短语库按测量结果折叠；反馈历史区分已送达/已留档；体积与练法文案纠正 (`ca61085`)
- fix(ai-parse,chunks,conversation,quickcard): 补齐清单里剩下四项，并把 AI 解析约定做成全仓守卫 (`8e9cf74`)
- fix(cloud-sync): 抑制下行回声、失败不再全静默、周期任务不再无条件全量重推 (`519defd`)
- fix(backup): 导出学习数据真的带上整书对照翻译缓存 (`c5e60a7`)
- fix(shadowing): 删除 AI 追加句不再弄乱完成标记 —— 索引换算收进单点纯函数 (`933cadc`)

## 2026-09-29
- docs(changelog): 补记上一条提交的日志（post-commit 自动追加） (`277d2fb`)
- docs(modules): 逐条复核行号与计数，修正 4 处偏差 (`f016797`)
- docs: AGENTS.md 改造成项目索引 + 19 篇模块文档 + 交接手册/路线指针 (`0d8daca`)
- docs(modules): 第二批 8 篇模块文档 —— 写作/句子学习/拼写/语块/思维/对话/跟读 + 存储与验证 (`dab4802`)
- docs(modules): 新增模块功能文档首批 5 篇 —— 词汇/词库/阅读/TTS/AI 服务 (`5bb09c3`)
- build(apk): versionCode 76 / 2.0.31 —— 含书库拆分与写作页折叠，已打包待装机 (`59067fa`)
- perf(writing): 写作题库 100 题默认只渲染 12 张 —— 页高 18,058→2,634px，挂载长任务 1055→118ms (`c098bd3`)
- perf(ai-pages): 平台 AI 插件客户端改按需 —— 思维/语块/对话/写作各少下载 160KB (`da4b272`)
- build(apk): versionCode 75 / 2.0.30 —— 含本轮全部性能与交互改动，已打包待装机 (`809b1ae`)
- docs(help): 应用内帮助中心按实况重写 —— 九档词库 / 出厂免费额度 / 数据去向都说清了 (`f3f2e4b`)
- perf(wordbank): IDB 写成功就不再镜像 localStorage —— 省掉每次加载词书的几 MB 同步 stringify (`dbe729d`)
- perf(books): 书库拆三层 —— /articles 冷加载 642KB → 376KB（书单不再下载整座书库） (`4f6d0ed`)
- docs: 使用指南抢位那条已从 ROADMAP 下一步移除（已修），列表重编号 (`f2e5035`)
- fix(onboarding): 使用指南不再盖住词汇首启向导 —— 自动弹出只在首页触发 (`cfc61f0`)
- perf(bundle): 动画库同样去掉强制 manualChunks —— 首屏必需 JS 237.7 → 198.1KB gzip (`0799beb`)
- perf(bundle): 首屏必需 JS 539.7KB → 237.7KB gzip —— 三处"运行时不执行却压进入口"的重依赖 (`7ed480c`)
- perf(vocab): 首启向导阶段一本都不预载 —— 进 /vocabulary 从 3.16MB/1.6s 长任务降到 0.10MB/228ms (`c4e7c57`)
- docs: 同步本轮四条修复与验证口径，并登记「使用指南抢位首启向导」 (`782bea6`)
- fix(tools): verify-wordbank-split 的基线可在任意时刻重建，并修好 --check 的模块断裂 (`af11954`)
- fix(ui): AI 模型设置窄视口不再被裁，Dialog 基座补高度兜底 (`a8f71ee`)
- fix(tts): /api/tts-voices 只在桌面版调用，web/APK 不再吃 404 与白发的网络往返 (`ae8274a`)
- fix(vocab): 切换词书一步生效，且走完向导直接落进所选模式 (`de0077e`)
- fix(vocab): 快速闪卡点「不认识」与收藏不再弹提示 (`fdc9075`)
- docs: 把本轮发现的全部待修项登记进 §9 与 ROADMAP（1-13） (`8bb4805`)
- docs: 登记「切换词书要多点一步学习方式」到待修清单，并补 ROADMAP 编号与反馈通道条目 (`3e6bfa5`)
- build(apk): versionCode 73 / 2.0.28 —— 含词书词数同源修复，已装机 (`f1ddeb7`)
- fix(vocab): 词书词数与出卡池子同源 —— 修「词书写 7,404、快速闪卡只有 2,127」 (`1625dba`)

## 2026-09-28
- build(apk): versionCode 72 / 2.0.27 —— 从当前 HEAD 重打的干净包 (`3b6f8b0`)
- chore(ci): 删除两条冗余部署 workflow，文档改为真实部署链路 (`77ef498`)
- build(apk): versionCode 71 / 2.0.26 + 日志 (`47ddcdb`)
- fix(tts): 朗读设置面板在手机视口内可滚到底 —— 语速/测试声音/朗读自检不再被裁在屏外 (`bb7795e`)
- docs: 校准交接手册与路线、重写使用攻略、沉淀反馈链路的两个新坑 (`28a51f9`)
- feat(feedback): 补全反馈的前后端对接 —— 入口可达、结果如实、失败可救 (`b216919`)
- fix(ui): 挂载全站唯一 Toaster —— 修"提示全静默" (`4bb8222`)

## 2026-09-27
- docs(agents): 沉淀 2026-09 两轮优化的约定与新坑 —— 稳定洗牌/断点分键/缓存封顶/翻译缓存 v2/自动发音键/真机 CDP 工具等 14 条新坑与 3 个新 lib、2 个新回归脚本、device-eval 用法 (`3dcee7e`)
- build(apk): versionCode 70 / 2.0.25 + 日志 (`74434d4`)
- feat(quality): 二轮功能扩展 —— 每日学习断点续学(唯一不能续的主模式补齐，退出/刷新自动接续)、每日学习闪卡背面『不再出现』出口(与复习检测对齐,可撤销)、词条详情弹窗可读写『我的助记』(word-notes 复用,闪卡/每日共用)、拼写『错词重练』入口(wrongWords 数据终于有消费)、听写语速滑杆(慢速连读)、跟读语料 100% 完成成就横幅(可一键再来一遍)、词汇量测试近 10 次趋势条 (`e33a780`)
- fix(quality): 二轮细节优化 —— useStableShuffle 首帧同步初始化(修恢复 tab 挂载白屏)、快速闪卡状态机三连修(StrictMode 重排双插/最后一卡答错误判完成/继续本轮被重建覆盖)、断点按词书分键+恢复结果按原下标对齐、屏蔽词不再从复习检测漏出、写作 reset/换题打断在途批改流(不再误清新草稿)、拼写完成计数口径+词库句预热+模式偏好持久化、跟读删句平移完成标记、翻译全部函数式合并+单页/单章互斥闭环、卸载中止整书翻译、memo 补全两个回调、复习检测键盘弹窗守卫、每日重置两段确认、模式首页角标订阅刷新 (`4f45167`)

## 2026-09-26
- chore(dev): 真机 WebView 调试小工具 device-eval.mjs —— 走 adb forward 的 CDP 通道做截图/求值/点击(无线 adb 无 INJECT_EVENTS 时的替代通道)，坐标按物理像素自动折算 (`39557fb`)
- build(apk): versionCode 69 / 2.0.24 + 日志 (`d3a5ba1`)
- fix(vocab): 真机反馈两处 —— 配对模式去掉自动朗读(视觉任务不需要出声)；快速闪卡 FitWord reserve 52→100(朗读+收藏两个按钮的宽度，修长单词被按钮遮住) (`e578105`)
- docs(changelog): 补记 7d706a2 (`d2ded46`)
- build(apk): package:apk 补上 version:apk-bump（AGENTS 要求每次打包 versionCode 必递增，此前只在 package:web 里）+ versionCode 68 / versionName 2.0.23 + 日志 (`7d706a2`)
- docs(changelog): 2026-09-26 开发日志(词汇六方式优化/缓存封顶/全站细节优化/三项遗留优化) (`8df5352`)
- perf(reader): 修 ReaderParagraph memo 被内联闭包击穿 —— onSpeak 改为自带坐标的 onSpeakPara，父级传稳定 useCallback；此前 TTS 每个切片 setReadPos 都导致整章段落全量重渲染(长章朗读手机卡顿) (`9ffddd3`)
- feat(reader): 「翻译全部」改用整书断点队列 translateBook —— 批合并+限流退避+IndexedDB 每批落盘(此前逐段串行、全部结束才落盘，中途退出全白费)，随时中止，再次点击只补缺失；完成后按段落原文合并进翻页正文；按钮运行中变为可停止(显示 N/M 章) (`d68b975`)
- feat(chunks): 短语复习断点续学 —— 队列+位置落盘，中途退出/切 tab/杀 App 后重新进入自动接续(提示还剩几张)，走完本轮断点作废 (`69fd847`)
- fix(quality): 全站细节优化(跟读/拼写/写作/阅读/对话) —— 写作 AI 失败不再丢草稿写空历史、跟读完成进度按语料键控+持久化(修跨语料虚高)、单句循环真循环、逐词播放真实现、拼写词库例句收藏可点击、全部词库断点续学修复、麦克风权限/未语音分支提示+卸载 abort、翻译缓存 v2 按段索引回填(修失败段错位/全文升级后旧缓存贴错段)、翻译全部与单页互斥+进度+失败计数、对话切场景/返回打断在途流修串话卡死、开场白失败不再静默、分析弹窗不再空转圈、Esc 守卫、切章停朗读、SCP/导入书历史可重开、词数依赖修复、死代码清理 (`93695e1`)
- fix(quality): 全站细节优化(仪表盘/记录/收藏/思维/语块) —— 首日连胜不计入、重置收藏陈旧闭包只删一条(clearAll)、每日一句按天持久化(不再灌爆历史)、收藏双筛选合并+writing_prompt 全线补齐、饼图按 key 取色对齐首页、接龙评分改 PASS/FAIL 结构化结论(修模板关键词击穿)、洗牌改 useStableShuffle(修 AI 出题/删题时当前题漂移)、换一题误清别的 tab 状态、AI 出题/翻译静默失败补 toast、贪婪正则换 extractJson、语块复习接入自动发音开关+答错重排+预热、危险重置/删除两段确认、推荐区洗牌 memo 化、复制失败提示、删除收藏可撤销、键盘可达 focus-visible、死代码清理 (`c3e2e0d`)
- fix(storage): 四个只增不减的 localStorage 缓存统一 FIFO 封顶(搭配释义300/AI例句200/深度解析300/搭配翻译400)；搭配翻译键名 tranlations→translations 带数据迁移并单点归属(colloc-ai-cache)，组件与 ProgressPage 清理清单同步；persist 改走 effect 保持 setState 更新函数纯(StrictMode 双调用)；新增 verify:vocab-caches 回归 21 断言 (`4e7bcfe`)
- feat(vocab): 每日学习六方式细节优化与扩展 —— 修拼写/填空自动读出答案、lastSpokenKey 每轮清空(修首卡不出声)、答错重排同参接入、配对按错配计分+双向选择、干扰项同词性+释义去重、加练空转给出口、自动发音开关(三模式共键)、连击、答对自动跳页、键盘扩展、getNewWords 多轮采样填满配额、闪卡背面单词+例句一次读、顶部『上一个单词』详情弹窗(复用 WordInfoDialog)、测试干扰项去重+答错留足阅读时间 (`525e555`)
- docs+brand: 交接手册(PROJECT-HANDOVER)接入 AGENTS/README 索引；品牌视觉资产重建(图标/启动图/favicon/icon.ico via gen-app-brand.ps1) (`3444e6e`)

## 2026-09-23
- fix(apk,vocab): 顶部被状态栏遮住(缺 viewport-fit=cover → env(safe-area) 恒 0)、评分后自动跳下一张(修 viewingPast 定义把自动跳转挡掉)、词库 5909 处 U+FFFD 乱码清理；图标 emoji→lucide (`40aa80e`)

## 2026-09-22
- fix(vocab)+style(vocab): 修 all 模式 history 不聚合/角标每次评分全量反序列化/助记框内滑动误评分/断点按钮不刷新/连击副作用在 setState 内；图标 emoji→lucide（继承主题色、跨平台一致） (`c5ba3bf`)
- feat(vocab): 助记笔记(按词读写/可编辑)、连对连击与每 5 连反馈、复习断点续学(顺序+位置)、本周学习量与正确率报告、侧边栏待复习角标 (`03d8ecf`)
- feat(vocab): 补两处缺口 + 回看上一个词 —— 生词本(阅读中词库未收录的词走词典兜底并入库、进复习队列、可管理移除)、概览每日目标 5 档、『上一个』按钮与左滑回看直接展开释义(修 advance 忽略方向符号) (`a0eff9e`)
- feat(vocab): 记忆管理与复习节奏 —— 答错立即隔 4 张重排(最多 2 次)、冻结本轮顺序(修 queue 随评分漂移)、『不再出现』屏蔽+撤销+恢复、背面显示下次复习时间、概览未来 7 天复习负担条 (`ad4affc`)
- feat(vocab): 复习卡片对齐主流背单词 App —— 左右滑手势(左不认识/右认识)、本轮进度条+正确率、背面信息层次(搭配/例句/近义反义/词族/深度解释/语域/词频)、修 autoSpeak 死代码与 detail 懒加载不重读 (`0a3b084`)
- chore(release): v2.0.6 (versionCode 51) —— 含 SCP 落地与复习词高亮 (`529205c`)
- feat(reading): SCP 基金会落地（20 篇/CC BY-SA 3.0，逐篇署名+原文链接+许可声明 tab）+ 复习词高亮（可选 6 色框，按形态归并匹配） (`6ce9bab`)
- fix(reading): 进度分母改存「保存时的章数/页数」（真机 1663%→2%、521%→9%）+ 网文推荐补入 3 个已核验可内置来源（SCP CC BY-SA / Standard Ebooks CC0 / Doctorow CC BY-NC-SA） (`09effe0`)
- fix(reading): 进度百分比改在保存时的量纲里算（修真机 516%/484%）+ 新增「网文推荐」tab（24 部，仅官方外链不内置正文） (`9c6e1de`)
- docs(reading): 英文网文候选清单与可行性结论 —— 核查 RR 站规禁止复制/爬取、qntm 明示 Ra 不得再分发、同人无授权资格；可内置仅少数 CC 作品（NC/ND 与 AI 翻译冲突） (`2cccbe5`)
- fix(books): 生成器 id↔书名漂移 3 条（244/3300/3600，重跑会毁元数据）+ 新增 verify:books-meta 守卫与英文小说候选清单 (`f627318`)
- fix(hooks): post-commit 当日标题判断用 ### 但写入 ## → grep 永不命中，每次提交都插新日期标题；同时收敛累积的 168 行空行与 9 个重复日期标题 (`890d972`)

## 2026-09-21
- chore(release): v2.0.4 (versionCode 49) —— 打包产物含阅读器堆叠/滚动/进度修复 (`1bdb62f`)
- feat(cet): 填入 APK_URL 指向 CetThink GitHub Release —— 恢复安卓包下载入口，并补上发布/替换 tag 的说明 (`85c56a5`)
- fix(reader): 段落动作区改横排 —— 竖排 4 按钮 124px 会在短段落上互相堆叠（真机 8 对重叠/最多 73px）；跟随滚动状态统一由 PageReader 持有 (`d40f4e7`)
- fix(reader): 朗读时不再抢滚动位置（followRead 让位 + 回到朗读处）+ 段落按钮不再被文字压住/过淡 (`4cd66db`)
- fix(tts): check-tts-voices 默认音色守卫改为校验「设置页可选集合」——原先硬绑 KOKORO_VOICES，默认改 piper 后误报并阻断打包 (`650abe2`)
- feat(reader): 朗读到哪可见 —— useTTS 新增切片进度上报(onChunk)，按词序前缀和反查段落做高亮+进度条+自动滚动 (`49a9d23`)
- feat(reader): 段落按钮触屏可见（原 hover-only）+ 朗读暂停/续读/停止悬浮控制条 (`611df90`)
- perf(tts): 默认音色改用 lessac —— 真机 RTF 0.076 vs Kokoro 1.008（13 倍），并让音色可选可切回 (`73fe38c`)
- fix(tts): 切片 400→180 字符 —— 修云端 502（上游 Google TTS 硬上限 200），首音也更早起播 (`cc58f78`)

## 2026-09-20
- chore(release): v2.0.1 (versionCode 46) —— TTS 线程耗尽闪退修复 (`1b4e1b1`)
- fix(tts): 原生合成改用有界线程池 —— 修掉「朗读一会直接闪退」(pthread_create OOM) (`f6ddfea`)

## 2026-09-19
- docs: 明确 APK 产物命名约定 —— 当前线占用规范名并覆盖，旧版本线冻结为 -<major>.x (`e4aaed1`)
- chore(release): APK 版本线切到 2.0.0（versionCode 45），versionName 改为 patch 自增 (`40b0bfe`)
- docs(changelog): 补记合并提交日志 (`f4b9fa7`)
- Merge branch 'main' of ssh://ssh.github.com:443/HDLDD/NativeThink (`71d2854`)
- docs(changelog): 补记上一条提交日志 (`d8af633`)
- fix(wordbank): detail 加载失败改为「刷新页面」而非原地重试（实测失败模块被缓存不重新求值） (`9a76e21`)
- docs: 补充词库回归验证命令 + 修正 /cet 模块 key 残留（进度环已移除） (`417bfb1`)
- feat(wordbank): 详情面板 detail 加载失败时可重试（原先静默为空） (`238adf5`)
- test(wordbank): 新增加载层集成验证 —— 覆盖 preloadLevels map 陷阱与共享引用链路 (`5c0152e`)
- perf(wordbank): 查词/预热路径改为仅核心加载 + 补充改词库后重跑拆分的约定 (`882716b`)
- perf(wordbank): 全局搜索改用仅核心预加载，展开词时按需加载 detail (`b6b5254`)
- fix(wordbank): index.ts 补出新增的 detail 加载 API（@/data/wordbank 走聚合导出） (`786cd02`)
- refactor(wordbank): detail 字段拆分为独立文件 + 按需加载层（preloadLevels 契约不变） (`9012784`)
- fix(wordbank): V4 基线改为按位置记录 —— 同等级重复词条会互相覆盖 (`ee0b347`)
- test(wordbank): 新增 detail 拆分的 V4 断言工具并采集改动前基线 (`173ff77`)
- docs(wordbank): detail 按需加载实施计划 + 设计文档补充两处隐蔽 bug 风险 (`4b7c6e1`)
- docs(wordbank): detail 字段按需加载设计文档 (`6ef4561`)
- docs(wordbank): detail 字段拆分的可行性与风险分析 —— 结论：无低风险有收益的子集 (`47dfccf`)
- fix(stats): 移除恒为 0 的 cet 进度环 —— 外链应用无法上报学习时长 (`e3b0c4d`)
- docs: AGENTS.md 拆分 + PRODUCT-SPEC 入库 + 设计文档 + CHANGELOG 补记 + gitignore 补漏 (`4e5381f`)
- refactor(tts): 删除 TTSSettings 中失效的动态导入 (`d9c4a46`)
- fix(dashboard): 进度环与图表适配 10 个模块（含 NaN 兜底） (`776ac68`)
- feat(stats): 句子学习/句子拼写接入学习时长上报 (`dc31b69`)
- refactor(stats): storage 为权威源 + 键补全与旧数据兜底 + 跨实例广播 + 跨天感知 (`e96d0e1`)
- fix(dates): 统一用本地日期，修东八区凌晨错天 (`d38c3f4`)
- fix(repo): 补入未入库的 CetExamPage 与四六级词库脚本 (`2e67741`)
- perf(tts): 首次摊包后打标记，不再每次启动重解压模型 (`104e1a1`)
- fix(tts): 换回 v1.0 模型 —— 用中文音色读英文；修掉同句被两个引擎各读一遍 (`35dc142`)

## 2026-09-18
- feat(sentences): 拆句改为「句子精讲」—— 为什么这么译 / 怎么译 / 用了什么语法 (`064836a`)
- docs+tool(tts): APK 体积实测工具 + 路线图更新 (`13630c2`)
- feat(tts): 设置页可选 11 个本地音色并设备内试听 (`167b4bf`)
- feat(tts): JS SDK 支持 11 个本地音色 + 加载失败自动回退 (`d62096d`)
- fix(sentences): 补入遗漏的自动标注语料文件 + 扩量脚本 (`2d62078`)
- feat(tts): 拉取 Kokoro 多音色模型 + 原生插件支持 speakerId (`1ea670c`)
- fix(sentences): 拆句交互重做（按反馈）+ 语法补到 30 条 (`f0c272c`)
- docs(tts): 体积砍到 166MB —— 改用 int8 量化模型，砍 54% (`b310540`)
- docs(tts): 离线多音色 SDK 设计文档 —— Kokoro 11 音色 + 24000Hz (`11f09eb`)
- feat(grammar): 新增「语法地图」—— 按中文思维差异组织的语法体系（16 条） (`d039a06`)
- feat(sentences): 补齐四项 —— 点词查词 / 错句复习队列 / 跟读评价 / 语料扩到 36 句 (`74e76d2`)

## 2026-09-17
- feat(sentences): 句子学习上线 —— 拆句 / 句型 / 造句三个训练 (`5d9a648`)
- perf(pack): 拆分打包流程 —— 9 分钟降到 45 秒 (`bc5e4ee`)
- fix(tts): 内置引擎崩溃真凶 —— OfflineTts 的 assetManager 传了非 null，导致走 assets 分支解析文件路径 (`841eaf2`)
- fix(tts): 修掉闪退护栏自身的漏洞 + 新增开发路线文档 (`503b6fa`)
- fix(tts): 修掉内置引擎闪退 —— espeak 数据目录约定搞错 + 加闪退护栏 (`98649de`)
- fix(tts): 修掉内置引擎的 NullPointerException —— Kotlin 配置类不接受 null (`2ab4b80`)
- fix(tts): 内置引擎改用 assets 直读（去掉最可能失败的一步）+ 错误可诊断 + 语音名保证可区分 (`c35f058`)

## 2026-09-16
- feat(tts): 内置真离线朗读引擎（sherpa-onnx + Piper）—— 不再依赖设备语音包 (`d28e46a`)
- fix(reader): 书单显示真实词数 —— 之前是压缩节选的数字 (`65f2e9e`)
- feat(tts): 在线音色联网警示 + 上次朗读实测回显 (`6b7a436`)
- fix(reader+tts): 全文随包 + 章节切分对齐；朗读自动用本地音色 (`aa7921b`)
- chore(release): v1.19.0 (versionCode 19) —— 22 本全书译稿入包 (`b582525`)
- feat(translate): 全书预翻译完成 —— 22 本 / 68,731 段，缺口 0.06% (`f685cf5`)
- fix(scripts): 修复 API 推送把提交信息写坏 + 加自检 (`9306589`)
- chore(scripts): 新增走 GitHub API 的推送通道 (`ac1cb6e`)
- fix(dev): vite 监听器排除 android/release/dist —— 修复每次打包后 dev server 猝死 (`bced95e`)
- feat(translate): 译稿推进到 20 本 / 42,796 段 (`25ad6a5`)
- fix(translate): 修复标记格式不一致 —— 长段落书的译文大量解析失败的真凶 (`8d4c2d3`)
- feat(translate): 批量改走空闲免费模型 + 回填空段；新增两本全书译稿 (`6a71bc1`)

## 2026-09-15
- feat(ai): 免费模型按任务分工 + 回退链补 glm-4.7-flash (`de99479`)
- fix(dev): 用当前 node 直跑 vite bin，修复 Windows 下 spawn('npx') ENOENT (`6ee43a2`)
- feat(translate): 阶段 1 六本公版书全书离线译稿入库 (`de998c3`)
- chore: ignore pretranslate temp build artifacts (`8cd1c11`)
- feat(tts): 「只用系统引擎」开关 —— 锁定几十毫秒延迟 (`99318a6`)
- feat(content): 刊物 5→12 篇、演讲 24→30 篇 (`30d2b71`)
- feat(translate): 预翻译流水线 —— 整本书只翻一次，随包分发（零等待/零额度） (`4b3700a`)
- chore: remove temporary diagnostic script (`3b63593`)
- fix(reader): 章节识别大修 —— 10 本公版书此前完全没有章节 (`869d139`)
- feat(reader): 全书翻译可视/补齐缺失 + 导入外部英文书籍 (`e040fdb`)
- fix(tts): 手机"朗读没声"最后一环 —— 原生引擎的假成功 + 手机端空语音列表 (`5097861`)
- fix(tts): 手机完全不朗读的真正根因 —— Android WebView 的假 speechSynthesis (`66e7d54`)
- perf(tts): 几十毫秒级朗读 —— 全站提前预热 + 本地引擎引导 (`c008815`)
- fix(tts): reading aloud could stall forever on phones + slow preview (`5061fda`)
- fix(tts): all voices sounded identical — Edge channel is unreachable here (`90660ce`)
- fix(tts): no voice to choose — ship a built-in online neural voice catalog (`6e3f607`)
- fix(tts): phone had no voice to pick — enumerate the native engine's voices (`d6937a4`)
- feat(android): 系统级自动备份 + 版本号自增 —— 更新不再需要导出/卸载 (`159c6cf`)
- feat(data): 防止安装包更新丢失数据的四层防护 (`284d37b`)
- feat(dashboard,reset,mobile): refresh home, extend reset, fix clipped icons (`13a0e3e`)
- fix(flashcards): long words wrapped a stray letter to line 2 — fit-to-width instead (`819a007`)
- feat(spelling,vocab): typewriter caret + batched collocation translation (`cf4655b`)
- fix(dark): flashcard back had no dark variant — white text on pale lavender (`e63ab60`)
- feat(vocab): collocations on the daily-learning flashcard back (`7b4281b`)
- feat(vocab): quick flashcard mode — word only, know/don't-know (`ed8daf1`)
- fix(flashcards): remove illustrations + adaptive font size for long words (`29db814`)

## 2026-09-14
- chore: changelog sync (`ac46227`)
- fix(reader): paragraph action buttons overlay instead of reserving width; nav below reader (`78e9dc3`)
- feat(tts): native Android TTS engine as primary voice path (`92e05fa`)

## 2026-09-13
- feat(reader): novel-style reading UI + full-book batch translation engine (`b6d6a11`)
- feat(reader): visible in-page translation banner + parallel translation with progress (`ed530a1`)
- fix(reader): StrictMode-safe full-text upgrade + sentence favorites + error toasts (`ee806e1`)
- fix(theme): set body color to --foreground — dark mode inherited text was invisible (`9f77b87`)
- feat(reader): runtime full-text upgrade for books with real chapter navigation (`ae7010a`)

## 2026-09-12
- feat(ai): independent factory provider + bundled offline model in packages (`f309c9c`)
- fix(dashboard): remove daily-sentence illustration (`08b32fe`)
- perf: enable cross-origin isolation for multi-threaded WASM inference (`e351902`)
- fix(images): thumbnails and originals grouped separately — relevance sort was pushing big originals ahead of fast thumbnails (`a3cb492`)
- feat: built-in dictionary, e-reader paging, midnight reset, faster images (`cd3c806`)
- fix(ai): prefer hf-mirror host on Chinese/Android devices for offline model download (`bc64186`)
- feat(ai): hf-mirror.com fallback for offline model download (China network) (`c40352c`)
- feat(ai): on-device fallback mini model for phones (`70db2a8`)
- fix(mobile): CORS for APK, scroll jank, TTS caching, image relevance (`7eec358`)
- fix(images): fetch Bing + Baidu in parallel and merge — faster response, more candidates per word (`63fafb0`)
- fix(images): dev proxy missing endpoints + safe & snappy word images (`26a4a52`)
- fix(ai): auto-failover for GLM free-tier rate limits (`52420c6`)
- feat(ai): factory free model glm-4.7-flash + thinking disabled (`317e3e0`)
- fix(android): build with JDK 21 — Capacitor 8 requires source level 21 (`8ae7743`)
- feat(ai): factory-baked API key + glm-4.6-flash as out-of-box config (`31babc0`)
- feat(spelling): selectable round size; factory GLM model -> glm-4.6-flash (`8eacb97`)
- style(spelling): blank underlines now white (`48a8f46`)
- fix(spelling): stack sentence and blank line vertically (`8e19190`)
- feat(sfx): learning feedback sounds + spelling line bounce inline with sentence (`8770ba1`)
- feat: writing & conversation UX polish from mainstream chat/writing tools (`0ac7379`)
- fix(vocab): dedupe book-progress bars; record study minutes in daily learning (`a22da2c`)
- feat: think practice history, real progress KPIs, favorites page header (`9aaa343`)
- feat(reader): true fullscreen reading + skip front matter + TOC drawer (`cb02d1b`)
- feat(ux): immersive focus mode + vocab session polish (`1471c43`)

## 2026-09-11
- feat(android): Capacitor APK packaging — cloud API redirect, icon pipeline, GLM model bump (`d09ff90`)

## 2026-09-06
- feat(vocab): daily-learning overview redesigned — gradient hero with badges, CTA, book progress; KPI row compacted; redundant heading removed (`04f6bbd`)
- feat(vocab): vertical home layout — hero card for daily learning with live stats, due-count badge on review row (`6ea1e75`)
- feat(vocab): immersive mode entry — mode cards home, hide all other entries inside a mode, back button (`a9f7926`)
- feat(vocab): focused study mode — overview hidden while studying, back button to return (`169c2cc`)
- feat: learning loop trio + guaranteed TTS fallback (`a9ebb2a`)
- feat(ux): five user-perspective improvements (`458d3ee`)

## 2026-09-05
- fix(tts): prewarm rate mismatch made warmup useless; collapse learning setup panel (`8ddbd21`)
- feat(images): extend illustrations to daily sentence card and daily learning mode (`2ea823f`)
- feat(words): real photo illustrations for vocabulary detail + flashcards (`3cf1780`)
- feat(vocabulary): derived word-family chips, AI deep analysis, vocab-size test (`1dd32f1`)
- feat(spelling): wordbook picker entry, top-right switcher, random non-repeating queue (`00bed4b`)
- style: premium UI polish — ambient gradients, layered card shadows, gradient primary, tactile buttons (CSS-only, zero logic changes) (`fd4183a`)
- feat: desktop app release — local API server, pro reader redesign, UX overhaul (`8c9d11d`)

## 2026-09-06 (2) — 学习闭环 + 朗读可靠性

### 学习闭环三件套
- feat: **阅读器查词"一键加入学习"** — 查词弹窗新增按钮：写入该词源词书的 SM-2 学习记录（立即到期），复习闪卡队列马上出现这个词——阅读→背词闭环打通
- feat: **错词专项重练** — 复习检测页新增"错词重练 (N)"入口：答错(评分≤2)的词自动累计，一键进入乱序重练队列，答对自动移出错词本；头部显示专攻模式
- feat: **收藏单词导入拼写** — 拼写页词书下拉新增"导入收藏单词"：❤ 收藏过的词一键转为拼写条目（配合"单词拼写"模式），去重导入、自动切到全部词书

### 朗读可靠性（"朗读不出来"兜底）
- fix: 服务端 SAPI 合成失败自动重试一次（负载下偶发 PowerShell 启动失败不再丢音）
- feat: 客户端三级兜底 — 本地 SAPI → Edge 神经 → Google 代理全部失败时，**最终回退系统 SpeechSynthesis 直读**；连这也失败才提示"朗读暂时不可用"（5 秒去重防刷屏）——任何情况下不再无声无息

## 2026-09-06 — 使用者视角体验优化

> 换位思考：以每日真实使用者的身份过一遍软件，列出最不满的五点并全部修复。

### 1. 闪卡没有键盘操作（高频效率痛点）
- feat: 复习闪卡全键盘支持 — **空格** 翻面（已翻面时 = 默认"比较熟悉"）、**1-5** 对应五档评分、**→** 下一个；评分按钮上带键位角标，底部有键位提示

### 2. 复习堆积带来心理压力
- feat: 到期复习超过 30 个时本轮只安排前 30 个，并温和提示"别有压力"——SM-2 队列不会堆积成大山

### 3. 阅读器查过就忘
- feat: 查词弹窗新增**最近查询**芯片（跨会话保存 18 条），阅读中查过的词随时一键回查

### 4. 词书维度进度不可见
- feat: 学习模式 KPI 下新增**本书进度条** — "已学 320/4542 · 7%"，换词书自动跟随，学了多少一目了然

### 5. 每日目标达成毫无仪式感
- feat: 当日学习时长跨过目标线的瞬间，弹出"🎉 今日学习目标达成！"庆祝提示

## 2026-08-28 (17) — 学习设置折叠 + 闪卡朗读提速

### 交互
- feat: **学习设置默认折叠** — 学习方式/每日学习量面板不再常显：收起为一行摘要（"闪卡 · 每日 100 词"），点击展开修改，界面更聚焦

### 朗读延迟（根因修复）
- fix: **prewarm 语速不匹配导致预热完全无效** — 预热用 settings.rate（0.9）写缓存，实际朗读用 0.85，缓存 key 对不上，每次切词都要现场合成（~1s 等待）。现在 prewarm 支持传入与朗读一致的语速
- feat: **会话预热** — 进入学习/复习队列时自动预合成前 3 个词；闪卡切词时继续预合成下一个词 → 首词与切词朗读均接近零等待
- 覆盖：每日学习闪卡、复习闪卡、词库浏览

## 2026-08-28 (16) — 插图扩展：每日一句 + 学习模式

### 新增插图位置
- feat: **每日一句卡片配图** — 仪表盘每日一句顶部展示与表达匹配的真实照片（成语/短语直查效果良好，如 "in the nick of time" 返回 8 张）
- feat: **学习模式每日新词配图** — 每日学习闪卡正面新增单词插图，看图联想 → 翻面验证，双通道记忆
- 词汇详情 + 闪卡复习 + 每日学习 + 每日一句四大位置全部覆盖；同一组件复用（30天缓存/点击换图/失败降级）

## 2026-08-28 (15) — 单词插图

### 新功能
- feat: **单词真实插图** — 词汇详情面板与闪卡正面展示与单词匹配的真实照片，帮助形象记忆
- 双源图片代理 `/api/word-image`：百度图片为主、Bing 图片备选（自动降级），国内直连、无需任何 API Key；实测 apple/dog/rain/book/sunshine/happy/ocean 全部稳定返回 8 张
- WordImage 组件：结果本地缓存 30 天（同词秒出）、点击轮换多图、单图加载失败自动切下一张、全部失败时显示首字母占位卡（无挫败感）

## 2026-08-28 (14) — 词汇模块扩展

### 词库浏览 · 详情面板增强
- feat: **同根词推导** — 按前后缀形态学规则在当前词库内动态匹配同根词（un-/re-/dis- 前缀，-tion/-ness/-ful 等后缀，含去 e / 变 y 变形），点击芯片直接跳转到该词详情并朗读；解决词库静态 wordFamily 字段为空的问题
- feat: **同义词/反义词芯片** — 数据存在时分组展示（绿/红双栏），点击在词库内跳转，未收录则提示
- feat: **AI 深度解析** — 详情页新增"深度解析"卡：一键生成词根词缀拆解 + 联想记忆钩子 + 易混淆词辨析（约130字），按词缓存到本地（无 AI 配置时显示引导）

### 新功能：词汇量测试
- feat: 词汇页新增「测词汇量」tab — 从当前词书按 4 个词频区间分层抽样 12 题（看单词选释义，干扰项同区间采样），自动朗读单词
- 结果估算词汇量区间（600–14600）+ 阶段评语（入门/进阶/流利/大神），历史最佳成绩持久化
- 向导模式新增「词汇量测试」入口；全程基于已加载词书采样，不触发额外大词库加载

## 2026-08-28 (13) — 句子拼写：词书直入 + 随机不重复出题

### 交互重构
- feat: **词书选择直入** — 首次进入直接显示词书卡片（四级/高考/中考/六级/雅思/托福/考研/专业/高阶/全部），点选即加载即练习，废除"建立句子库"步骤
- feat: **词书切换移至右上角** — 练习页右上角下拉切换当前词书（刻意远离操作流避免误触），当前词书高亮显示，切换时按钮内嵌加载动画
- feat: **刷新自动恢复** — 记住上次使用的词书，重新打开应用自动加载并恢复到上次练习位置，无需重选；加载失败自动回退到词书选择页

### 算法
- feat: **随机且不重复出题** — Fisher-Yates 均匀洗牌（替换有偏的 sort(random)）；持久化"最近出题记录"，从未练过的句子优先、最近出过的排最后（最久未出先出），跨轮次/跨会话不重复；已完成与已掌握的句子照旧排除
- 算法性质已单元验证：无重复 ✓ 未出过优先 ✓ 最久未出排序 ✓ 随机性 ✓

## 2026-08-28 (12) — 朗读提速 + 阅读器专业版重做

### 朗读（修复慢/不朗读）
- fix: **不朗读根因** — 桌面版此前把 UA 里的 Electron 标识全局剥掉，导致前端误判为浏览器、先走静默失败的 SpeechSynthesis（300ms 起步且可能永久卡住）。现改为**仅对 B站域名按请求伪装 Chrome UA**，应用自身保留真实 UA → 桌面版直连本地语音引擎，立即出声
- perf: 本地语音合成**并行化**（去掉串行队列 + 去重合并）— 多段朗读时后台同时合成，实测 3 段 1.75s 同时完成（原需累计 5.4s），配合预取实现段间零等待

### 阅读器专业版重做（对标微信读书/Apple Books）
- feat: **沉浸式阅读** — 点击正文任意处隐藏/呼出顶栏和底栏，纯正文沉浸体验
- feat: **极简顶栏** — 返回 | 书名居中 | 目录 | 阅读设置（Aa），告别塞满按钮的工具栏
- feat: **阅读设置面板** — 显示模式（原文/对照/译文）、四档字号、朗读/连读、AI 翻译与等级转换、收藏，全部收纳进 Aa 面板
- feat: **三档阅读主题** — 浅色 / **纸张**（暖米色护眼，长文阅读舒适）/ 夜间，偏好持久化
- feat: **底部进度滑杆** — 拖动直达任意页（微信读书式），替代数字输入框
- feat: **章节标题美化** — 居中 + 两侧装饰线 + 更大字号
- feat: 四档字号（新增特大号），字号与主题偏好记忆
- mobile: 同一沉浸式结构天然适配手机 — 触摸滑动翻页保留，点击切换 chrome，设置面板即底部弹层

## 2026-08-28 (11) — 各模块人性化扩展

### 新功能
- feat: **继续上次学习** — 仪表盘顶部显示"继续上次：xx模块"快捷入口（记住最近访问的模块，14天内有效），一键回到上次的学习位置
- feat: **写作草稿自动保存** — 输入 800ms 后自动保存选题与正文；意外关闭/刷新后自动恢复并提示；提交后自动清除草稿，作文不再白写
- feat: **阅读器连读模式** — 工具栏新增"连读"开关：从当前页开始连续朗读，读完自动翻页继续，整篇读完自动停止（桌面+移动端均有入口）
- feat: **阅读器顶部进度条** — 细进度条实时显示当前页/总页阅读进度
- feat: **移动端阅读器朗读入口** — 手机端工具栏展开后新增"朗读本页"+"连读"按钮
- feat: **一键复制** — AI 对话回复（悬浮复制按钮）、收藏条目（内容+例句）、每日一句（含释义/例句/翻译）均支持一键复制
- feat: **学习数据导出** — 学习记录页新增"导出学习数据"：全部本地学习数据（进度/收藏/日历/草稿等）打包为 JSON 备份文件

### 说明
- 所有新功能不依赖网络；数据导出仅生成本地文件，不上传任何服务器

## 2026-08-28 (10) — 涟漪空状态 + 翻页动画 + 流式翻译

### 界面
- feat: **涟漪风空状态组件 EmptyState** — 品牌核心图标 + 三层扩散涟漪圆环（"思维涟漪"视觉隐喻落地），应用于：收藏本空页、收藏分类过滤空态、学习记录收藏 tab、文章页搜索无结果、语块页 AI/搜索空态、句子拼写欢迎屏
- feat: **阅读器翻页方向动画** — 上一页/下一页/键盘方向键/目录跳转/页码跳转均按方向滑动淡入（220ms），与触摸滑动手势方向一致
- feat: **每日一句翻译流式渐显** — 翻译结果以打字机方式逐字浮现（带光标闪烁），AI 生成感；系统开启减弱动效时直接显示

### 细节
- 所有新动画均响应 prefers-reduced-motion
- EmptyState 支持 sm/md 两档尺寸与自定义操作按钮

## 2026-08-28 (9) — 移除口语视频模块 + 全局体验优化

### 移除
- chore: **删除「口语视频」模块** — 页面、路由、导航、仪表盘入口、学习统计键、后端 B站 API 路由全部移除；打包不再携带 Whisper 模型与 onnx/ffmpeg 原生库（**919MB → 394MB**）

### 性能
- perf: 本地服务器静态资源 **gzip 压缩**（主包 941KB → 284KB，3.3 倍），首次启动渲染明显加快
- perf: 带内容哈希的静态资源缓存策略升级为**一年 immutable**（二次启动近零加载）
- perf: 侧边栏**悬停/触摸预取**目标页面代码块（原有机制保留并覆盖全部页面）

### 界面与动效
- feat: 全局**页面切换过渡**（240ms 淡入上浮，路由切换自动触发）
- feat: 卡片网格 **stagger 交错入场动画**（仪表盘快速入口/模块进度、文章页书籍/刊物网格、对话页场景卡片）
- feat: 统一 **:focus-visible 键盘焦点环**（青绿 2px 外描边，全站生效）
- feat: 内容区**纤细滚动条**样式（浅青色，hover 加深）
- feat: 完整 **prefers-reduced-motion** 支持 — 系统开启"减弱动态效果"时停用所有装饰动画

### 交互习惯
- fix: 路由切换**自动滚动复位**（主内容区 + 窗口），不再保留上一页滚动位置
- fix: 404 路由的懒加载 fallback 从纯文本升级为品牌骨架屏

### 验证
- 11 个路由全部 200；导航 11 项（口语视频已移除）；仪表盘/文章/对话等 stagger 动画生效；typecheck 通过

## 2026-08-28 (8) — 本地转写支持完整长视频

### 修复
- fix: **本地转写只能转半分钟** — Whisper 单次推理上限 30s；现按 28s+2s 重叠分块处理任意时长音频，再拼接
- fix: 跨块时间戳合并 bug — 相邻句不再被误合并成超大段；重叠块正确去重
- 实测：18 分钟视频转出 **312 条秒级时间戳字幕**（0-5s/5-7s/7-9s…），覆盖完整 1120s，打包版 110s 完成

## 2026-08-28 (7) — 内置本地 Whisper 转写（无需 API Key）

### 新功能：本地 AI 转写
- feat: **内置 whisper-tiny 模型**（42MB，q8 量化）随桌面版打包，**无需任何 API Key / 联网**即可把 B站视频原声转成英文字幕
- 链路：B站音频（WBI签名+SSESSDATA）→ ffmpeg → 16kHz WAV → transformers.js + onnxruntime 本地推理 → 带时间戳字幕段
- 实测：打包环境 4.4s 转写一句英文视频开头，识别准确（"You're no strangers to love"）
- UI：无英文字幕时显示 **「本地转写英文字幕」** 按钮（桌面版），一键转写并缓存
- 打包新增：`@huggingface/transformers` + `onnxruntime-node` + `@ffmpeg-installer/ffmpeg` + sharp 平台二进制 + `.local-models` 模型目录

### 性能
- 模型加载 ~0.8s（缓存），后续转写秒级；首次使用模型已在包内无需下载

## 2026-08-28 (6) — 口语视频字幕彻底修复（最终版）

### 根因确认
- B站 AI 字幕对英语视频**基本只生成中文轨道（ai-zh）**，几乎没有英文轨道 → 之前"匹配 en 轨道"拿到的其实是中文内容塞进 en 字段
- 选视频后自动启动的 Web SpeechRecognition（依赖 Google 服务）在嵌入环境/Electron 静默挂起 → 抢占字幕显示"识别翻译中…"永远转圈

### 修复
- fix: **移除选视频自动 STT** — 字幕优先走 B站（SESSDATA），无字幕则明确提示
- fix: **B站字幕轨道筛选修正** — 只接受真正英文轨道（lan 含 en）；中文轨道不再冒充英文；只有 ai-zh 时返回空并触发 Whisper 路径
- fix: 手动"语音识别"按钮在 Electron/嵌入环境明确提示改用 AI 转写，不再挂起
- feat: 无英文字幕时给出**智能引导**：已配 Whisper key → 一键"AI 转写英文字幕"；未配 key → 引导去 AI 设置配置（硅基流动/智谱免费）
- 实测验证：选视频 → 英文字幕（B站轨道）显示 / 无英文 → "这个视频暂无英文字幕"+ 转写引导，不再卡死

## 2026-08-28 (5) — 口语视频字幕修复（桌面版）

### 修复：桌面版看不到字幕（根因）
- fix: **桌面版进入视频后字幕卡在"识别翻译中…"** — Electron 里 `webkitSpeechRecognition` 存在但依赖 Google 服务不可用，选视频时自动启动 STT 后 `sttActiveRef` 置位，导致字幕拉取被跳过、永远转圈。现在桌面版检测到 Electron 直接跳过 STT，B站字幕正常加载
- fix: 手动点"语音识别生成字幕"在桌面版也会卡死 → 明确提示改用 Whisper
- fix: 清除残留的 `source='stt'` 字幕缓存，避免污染后续加载
- fix: 字幕 API 增加**轮询重试（B站 AI 字幕异步生成）** — 首次请求常返回空/部分，现在最多重试5次等待完整字幕（实测 131/177/0 不稳定 → 稳定返回 120-173 条）
- fix: 前端字幕加载 10s 超时 + 失败 toast + "重新加载"按钮，不再无限转圈
- fix: Electron 请求拦截器加防御（内部异常不会导致全部请求卡死）

## 2026-08-28 (4) — 朗读延迟优化

### 性能
- perf: **朗读等待时间大幅缩短** — Edge-TTS 连接复用（同一声音复用持久 WebSocket，免去每次 ~1s 握手）+ 服务器启动时预热常用语音连接 + 前端预取流水线（播放当前段时后台合成后续段）
- 实测：首次合成 1.4s → **0.5s**；后续每段 1.9s → **0.4s**；配合预取，多段朗读段间等待接近零；缓存命中毫秒级

## 2026-08-28 (3) — 语音库扩充 + B站字幕加速 + 桌面兼容性

### 新功能
- feat: **TTS 语音库大扩充** — 集成 msedge-tts：17 个 Edge 高质量神经语音（Ava/Andrew/Emma/Brian/Aria/Jenny/Sonia 等英美澳印口音 + 中文晓晓/云希），国内直连可用无需代理；保留 Windows 本地语音（Zira 等）离线兜底
- feat: TTS 设置面板分组显示"在线神经语音 / 系统语音"，选中在线语音可试听
- feat: **B站 Cookie（SESSDATA）设置** — 口语视频页新增入口：配置后大部分英语视频可秒加载 B站 AI 字幕（无需等 AI 转写），内嵌播放器获得登录态高清播放；Cookie 仅存本机
- feat: 桌面版可重复打包脚本 scripts/pack-app.mjs（自动复制 Electron 运行时 + 精确的生产依赖树 41 包）

### 修复（桌面版与网页版差异）
- fix: B站图床防盗链 — 封面缩略图从 127.0.0.1 发起请求无 bilibili Referer 会 403 裂图，Electron 主进程现在对 hdslb.com 请求注入正确 Referer
- fix: Electron UA 风控 — 网络请求 UA 移除 Electron 标识，避免 B站资源加载被拒
- fix: 字幕语言选择 — B站 AI 字幕 lan 匹配从 === 'en' 放宽为包含 'en'（ai-en 也能命中）

## 2026-08-28 (2) — 桌面版三项问题修复

### 修复
- fix: **TTS 完全无声** — 桌面版在线语音引擎（Google/Edge-TTS）在国内网络全部不可达；本地服务器新增 Windows SAPI 离线语音合成（Microsoft Zira en-US，毫秒级缓存响应），失败时自动回退在线代理
- fix: **无法选择朗读声音** — Electron 里 voices 异步加载且 voiceschanged 不触发，改为轮询加载；无英文语音时显示全部语音；设置选中声音映射到 Edge-TTS 神经语音
- fix: **句子拼写建库后停在欢迎页但已在朗读** — 欢迎页判断只看 React state 未看全局词库缓存，建库成功后界面不跳转
- fix: **口语视频无法切换选集** — 根因：后端把 BVID 强制 toUpperCase，而 B站 API 的 bvid 参数大小写敏感，导致 cid/分集列表全部查询失败；移除所有大小写转换（info/subtitle/transcribe + 前端录入）
- fix: 桌面版无实时语音转文字 — Electron 不支持 Web Speech Recognition，静默失败改为明确提示配置 Whisper；转写 provider 改为自动降级链（groq→硅基流动→智谱，逐个尝试）

## 2026-08-28 — 桌面版发布 + 功能修复

### 新功能
- feat: 维基百科阅读（后端代理 /api/wikipedia + 文章页新 tab：搜索/阅读/收藏/7天缓存）
- feat: 阅读器目录跳转（书籍章节列表，点击直达页码）
- feat: AI 对话历史持久化（按场景自动保存，支持继续上次对话）
- feat: 桌面版（Electron）：本地 API 服务器 + 系统代理自动探测 + 自定义应用图标

### 修复
- fix: 写作练习历史不保存（现持久化到本地，保留最近50篇）
- fix: 云同步失败静默丢数据（失败时合并回待发队列重试）
- fix: 删除操作不同步到云端导致进度被"复活"（removeItem 触发删除同步）
- fix: 收藏绕过用户隔离与云同步（移除裸 localStorage 双写，旧数据一次性迁移）
- fix: AI 配置 Key 后按钮仍禁用（useAI 监听配置变更事件实时刷新）
- fix: TTS 暂停超 25 秒被安全定时器误杀；cf/google 引擎语速无效（playbackRate 补偿）
- fix: Whisper 转写失败无任何提示（现在有明确 toast）
- fix: 刊物/AI 文章历史条目点击无响应（接通 pubId/aiId 恢复逻辑）
- fix: 每日学习配额按 UTC 日期重置（改本地时区）
- fix: 仪表盘"口语视频"进度显示 NaN%（补齐 speaking 进度键 + 学习时长记录）
- fix: 学习记录页 tab 不记忆（走 usePageMemory）
- chore: 删除死代码 ExamplePage

### 迁移与打包
- chore: 项目迁移至 B:\NativeThink
- feat: functions/api 后端移植到本地 Node 服务器（server/local-server.mjs），KV 用 JSON 文件模拟

## 2026-07-29
- feat: AI translate Whisper segments to Chinese (`1be5014`)
- chore: update changelog (`6b17b3a`)

## 2026-07-19
- feat: auto Whisper transcription when B站 has no subtitles (`99a27d8`)
- feat: add GLM ASR support (`80030c0`)
- fix: correct MD5 for WBI signing in transcribe API (`948d394`)
- feat: Whisper transcription via provider API (`2f1a136`)
- fix: prevent STT segments from being cleared by subtitle API race (`e1b9ede`)
- fix: stale closure in STT onend (`e33887b`)

## 2026-07-18
- fix: STT starts on video select click (`0546dc8`)
- fix: auto-STT on video select - no manual click needed (`ef1ac2c`)
- fix: seek via iframe reload + STT restart after stop (`4a010ab`)
- fix: auto STT - recognize sentence immediately, auto-restart (`87fc203`)
- fix: real-time STT - translate each sentence on the fly (`441dbf0`)
- feat: voice recognition subtitle - Web Speech API STT (`33ec0c6`)
- fix: episode nav with arrows + wheel, resilient subtitle API, dialog a11y (`cfd7e48`)
- fix: episode switching - page nav + per-page subtitles (`bb229d9`)
- fix: subtitle timing estimate + simplified B站 API (`a48380a`)
- feat: auto subtitle - B站 API + AI fallback, cache, transcript paste (`a9c723b`)
- feat: speaking collection feature - auto-fetch B站 info, level group, add TED 100 talks (`28b900f`)
- feat: replace placeholder videos with real B站英语播客合集 (`885c75f`)

## 2026-07-17
- fix: speaking page - support full B站 URL when adding video (`d9b6978`)
- feat: speaking page - support delete video (`7334816`)
- speaking page (`4f2c1fb`)
- feat: 提交句子拼写答案后自动重读句子
- feat: 新增英语口语视频学习页 (/speaking) — B站嵌入播放 + 同步字幕 + 重点词查词翻译
- feat: 视频库按难度筛选，支持自定义添加 B站视频
- fix: 再听一遍 stays on current sentence, improve pronunciation analysis prompt (`67e21d6`)
- fix: shadowing togglePlay pause not working — ref-based isSpeaking avoids stale closure (`c5d48bb`)
- fix: shadowing center play/pause button now correctly stops playback — ref-based isSpeaking avoids stale closure (`ac0397f`..HEAD)
- feat: shadowing voice recording + AI comparison, fix favorites persistence (`ac0397f`)
- fix: favorites dual-write to direct localStorage key (survives prefix changes) (`7ebcf68`)
- feat: add voice input via Web Speech API (`3d64289`)
- feat: accept synonyms for sourceWord in sentence spelling (`d199f13`)
- fix: stable currentSentence via ref — immune to useMemo flicker (`4465a4c`)
- refactor: word bank sentences in global cache (not React state) — root cause fix (`a1a504c`)
- fix: sentence-change effect no longer touches submitted/results at all (`7198468`)
- fix: handleRetryWrong keeps results visible, remove dead code (`8644d23`)
- fix: use results guard instead of submitted guard in sentence-change effect (`03cdc70`)

## 2026-07-16
- fix: prevent sentence-change effect from clearing submitted results (`f99d0c5`)
- fix: sentence display for fill mode, init effect handles all-completed, remove auto-reset (`c770c7b`)
- fix: move auto-reset useEffect before early returns (hooks rule), remove duplicate (`3b8c943`)
- fix: buildSessionQueue includes all non-mastered, add manage dialog, reset fixes (`eb2a67a`)
- fix: remove local updated array (ID mismatch), add race-condition guard, prevent loading flash (`eed7ce9`)
- perf: cache extracted sentences per level, Map O(1) upsert, remove empty-level screen (`52b7508`)
- feat: remember last practice position (level + sentence index) (`3670753`)
- fix: rebuildSession onClick wrappers (type compat with override params) (`b221704`)
- fix: use importDirty to trigger rebuild after async level load (avoids stale closure) (`034aa04`)
- refactor: on-demand level loading like DeepVocabularyPage, upsert instead of rebuild (`3db4299`)
- fix: show '当前词库没有句子' instead of '全部完成' when level has no sentences (`0887b25`)
- fix: level switching rebuild, clear old sentences on rebuild, completed sentences excluded, reset progress UI (`d145c1c`)
- feat: import all 9 word banks on build, add level filter UI (`018fecf`)
- fix: word bank selector buttons, persist completed sentences, fill mode init + wrong-words fix, index-based prev/next nav (`72ee5a9`)
- refactor: simplified SpellingPage — select level builds database, linear practice flow, removed ImportDialog (`b687900`)
- fix: buildSessionQueue now includes ALL sentences without maxNew limit, fix variable name (`74c71d0`)
- fix: increase session queue to 200 sentences, fix empty symbol display (&nbsp; → actual U+00A0) (`6be0277`)
- feat: add vertical bar and brand-color underline on focus to show active word (`c917832`)
- fix: submitted results no longer cleared by effect, remove completed sentences from queue, Tab nav + auto-focus, cancel stale TTS (`397cb11`)
- fix: exclude /api/* from _redirects rewrite (`4bdfd00`)
- feat: remove ___ placeholders, one-click full word bank import, fix sentence count not updating (`de4f924`)
- fix: adjust word gap to 0.5em (one 'a' width) (`8ece919`)
- feat: underline is invisible input carrier — click to type, text appears above line (`82aaecd`)
- feat: underline-only input style, auto-read toggle (`00ffb4b`)
- fix: handleImportAll batches all segments in single addSentences call to avoid stale closure overwrite (`e2f7e34`)
- fix: segmented batch import, per-word input with ___ placeholder, centered Chinese, conditional auto-read (`2172279`)
- feat: segmented batch import from word bank — scan all words, split into segments of 200+, import by segment (`7281c72`)
- refactor: dictation mode - single continuous input instead of per-word fields (`12945d5`)
- fix: add _redirects for SPA client-side routing, fix Dialog aria-describedby warning (`bd46d45`)
- feat: add sentence spelling feature with dictation & fill modes, AI batch add, SM-2 memory, favorites (`08c8750`)

---

*(以下为之前版本的日志摘要)*

## 2026-07-14
- fix: learning time tracking bugs — midnight reset, stale closure, UTC dates (`87070f2`)
- fix: 修复成就徽章系统多个问题 (`70aeaf1`)

## 2026-07-13
- fix: 修复词汇复习模式在无学习单词时随机切换问题 (`67cc0ae`)
- perf: vocabulary page renders UI immediately, skeleton fallback for page transitions (`7fde02f`)
- fix: re-read localStorage after cloud sync completes (`dc3dc98`)
- docs: 整理 CHANGELOG — 合并重复日期，分类记录更新和修复 (`4d7a6dc`)
- feat: add password hint text on register form (`272e88d`)

### LCP 性能优化 🚀
- Google Fonts 非阻塞加载、DashboardPage 懒加载、路由悬停预加载、共享 chunk 提取
- 主包体积: 1.07MB → 897KB（↓16%）、wordbank 分包补全

### 依赖清理 🧹
- 移除 gsap + @gsap/react（6.4MB）、next-themes

### 修复 🐛
- NotFoundPage Suspense 边界、PBKDF2 100k 迭代、KV namespace binding、@tailwindcss/vite 插件
- Lark 平台移除、wrangler.toml 修复、404.html 复制、本地 vite、标准 vite 配置

### Cloudflare Pages 部署修复 🔧
- 修复部署问题，需要配置 GitHub Secrets

---

## 2026-07-11

### 文章阅读 Bug 修复 🐛
- TDZ ReferenceError 根因修复、动态 import 打破循环依赖、PageReader 健壮性提升
- 登录 & 注册 1101 错误修复、PBKDF2 迭代限制、crypto.randomUUID 兼容性
- 云同步完整修复：syncUp/syncDown 数据一致性、防抖批量写入、接入认证生命周期
- 词库引擎稳定性：顺序加载取代并行加载、蓄水池采样、加载容错

### 性能优化 🚀
- 全部页面 React.lazy 懒加载，主包 2.3MB → 897KB (-61%)
- 词库引擎索引缓存、useDeferredValue 搜索优化

### 朗读引擎 🔊
- 多引擎架构 (SpeechSynthesis → CF Edge TTS → Google TTS)
- 超时兜底、手机端 TTS 修复

### 移动端适配 📱
- 底部 Tab 导航栏 + 响应式布局

---

## 2026-07-10

### 初始功能
- 手机版适配基础布局、AI 双语输出、Cloudflare Pages 部署支持

## 2026-09-06 (2) — 词汇页沉浸式：进入模式后隐藏其它入口

- feat: **词汇深度页沉浸式重构** — 打开页面先看到 5 张模式卡片（每日学习/复习/词库浏览/搭配学习/测词汇量）；点击进入后**其它模式入口全部隐藏**，顶栏变为「<- 返回 + 当前模式名 + 词书切换」，一心一意只做当前模式
- `<-` 返回即回到模式选择主页，换模式随手可及但绝不干扰当前学习
- 词书加载提示只在模式内显示，主页保持干净
