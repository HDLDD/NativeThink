# NativeThink 开发日志










































## 2026-09-12
- feat: think practice history, real progress KPIs, favorites page header (`9aaa343`)

## 2026-09-12
- feat(reader): true fullscreen reading + skip front matter + TOC drawer (`cb02d1b`)

## 2026-09-12
- feat(ux): immersive focus mode + vocab session polish (`1471c43`)

## 2026-09-11
- feat(android): Capacitor APK packaging — cloud API redirect, icon pipeline, GLM model bump (`d09ff90`)

## 2026-09-06
- feat(vocab): daily-learning overview redesigned — gradient hero with badges, CTA, book progress; KPI row compacted; redundant heading removed (`04f6bbd`)

## 2026-09-06
- feat(vocab): vertical home layout — hero card for daily learning with live stats, due-count badge on review row (`6ea1e75`)

## 2026-09-06
- feat(vocab): immersive mode entry — mode cards home, hide all other entries inside a mode, back button (`a9f7926`)

## 2026-09-06
- feat(vocab): focused study mode — overview hidden while studying, back button to return (`169c2cc`)

## 2026-09-06
- feat: learning loop trio + guaranteed TTS fallback (`a9ebb2a`)

## 2026-09-06
- feat(ux): five user-perspective improvements (`458d3ee`)

## 2026-09-05
- fix(tts): prewarm rate mismatch made warmup useless; collapse learning setup panel (`8ddbd21`)

## 2026-09-05
- feat(images): extend illustrations to daily sentence card and daily learning mode (`2ea823f`)

## 2026-09-05
- feat(words): real photo illustrations for vocabulary detail + flashcards (`3cf1780`)

## 2026-09-05
- feat(vocabulary): derived word-family chips, AI deep analysis, vocab-size test (`1dd32f1`)

## 2026-09-05
- feat(spelling): wordbook picker entry, top-right switcher, random non-repeating queue (`00bed4b`)

## 2026-09-05
- style: premium UI polish — ambient gradients, layered card shadows, gradient primary, tactile buttons (CSS-only, zero logic changes) (`fd4183a`)

## 2026-09-05
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

## 2026-07-29
- chore: update changelog (`6b17b3a`)

## 2026-07-19
- feat: auto Whisper transcription when B站 has no subtitles (`99a27d8`)

## 2026-07-19
- feat: add GLM ASR support (`80030c0`)

## 2026-07-19

## 2026-07-19
- fix: correct MD5 for WBI signing in transcribe API (`948d394`)

## 2026-07-19
- feat: Whisper transcription via provider API (`2f1a136`)

## 2026-07-19
- fix: prevent STT segments from being cleared by subtitle API race (`e1b9ede`)

## 2026-07-19
- fix: stale closure in STT onend (`e33887b`)

## 2026-07-18
- fix: STT starts on video select click (`0546dc8`)

## 2026-07-18
- fix: auto-STT on video select - no manual click needed (`ef1ac2c`)

## 2026-07-18
- fix: seek via iframe reload + STT restart after stop (`4a010ab`)

## 2026-07-18
- fix: auto STT - recognize sentence immediately, auto-restart (`87fc203`)

## 2026-07-18
- fix: real-time STT - translate each sentence on the fly (`441dbf0`)

## 2026-07-18
- feat: voice recognition subtitle - Web Speech API STT (`33ec0c6`)

## 2026-07-18
- fix: episode nav with arrows + wheel, resilient subtitle API, dialog a11y (`cfd7e48`)

## 2026-07-18
- fix: episode switching - page nav + per-page subtitles (`bb229d9`)

## 2026-07-18
- fix: subtitle timing estimate + simplified B站 API (`a48380a`)

## 2026-07-18
- feat: auto subtitle - B站 API + AI fallback, cache, transcript paste (`a9c723b`)

## 2026-07-18
- feat: speaking collection feature - auto-fetch B站 info, level group, add TED 100 talks (`28b900f`)

## 2026-07-18
- feat: replace placeholder videos with real B站英语播客合集 (`885c75f`)

## 2026-07-17
- fix: speaking page - support full B站 URL when adding video (`d9b6978`)

## 2026-07-17
- feat: speaking page - support delete video (`7334816`)

## 2026-07-17
- speaking page (`4f2c1fb`)

## 2026-07-17
- feat: 提交句子拼写答案后自动重读句子
- feat: 新增英语口语视频学习页 (/speaking) — B站嵌入播放 + 同步字幕 + 重点词查词翻译
- feat: 视频库按难度筛选，支持自定义添加 B站视频
- fix: 再听一遍 stays on current sentence, improve pronunciation analysis prompt (`67e21d6`)

## 2026-07-17
- fix: shadowing togglePlay pause not working — ref-based isSpeaking avoids stale closure (`c5d48bb`)

## 2026-07-17
- fix: shadowing center play/pause button now correctly stops playback — ref-based isSpeaking avoids stale closure (`ac0397f`..HEAD)

## 2026-07-17
- feat: shadowing voice recording + AI comparison, fix favorites persistence (`ac0397f`)

## 2026-07-17
- fix: favorites dual-write to direct localStorage key (survives prefix changes) (`7ebcf68`)

## 2026-07-17
- feat: add voice input via Web Speech API (`3d64289`)

## 2026-07-17
- feat: accept synonyms for sourceWord in sentence spelling (`d199f13`)

## 2026-07-17
- fix: stable currentSentence via ref — immune to useMemo flicker (`4465a4c`)

## 2026-07-17
- refactor: word bank sentences in global cache (not React state) — root cause fix (`a1a504c`)

## 2026-07-17
- fix: sentence-change effect no longer touches submitted/results at all (`7198468`)

## 2026-07-17
- fix: handleRetryWrong keeps results visible, remove dead code (`8644d23`)

## 2026-07-17
- fix: use results guard instead of submitted guard in sentence-change effect (`03cdc70`)

## 2026-07-16
- fix: prevent sentence-change effect from clearing submitted results (`f99d0c5`)

## 2026-07-16
- fix: sentence display for fill mode, init effect handles all-completed, remove auto-reset (`c770c7b`)

## 2026-07-16
- fix: move auto-reset useEffect before early returns (hooks rule), remove duplicate (`3b8c943`)

## 2026-07-16
- fix: buildSessionQueue includes all non-mastered, add manage dialog, reset fixes (`eb2a67a`)

## 2026-07-16
- fix: remove local updated array (ID mismatch), add race-condition guard, prevent loading flash (`eed7ce9`)

## 2026-07-16
- perf: cache extracted sentences per level, Map O(1) upsert, remove empty-level screen (`52b7508`)

## 2026-07-16
- feat: remember last practice position (level + sentence index) (`3670753`)

## 2026-07-16
- fix: rebuildSession onClick wrappers (type compat with override params) (`b221704`)

## 2026-07-16
- fix: use importDirty to trigger rebuild after async level load (avoids stale closure) (`034aa04`)

## 2026-07-16
- refactor: on-demand level loading like DeepVocabularyPage, upsert instead of rebuild (`3db4299`)

## 2026-07-16
- fix: show '当前词库没有句子' instead of '全部完成' when level has no sentences (`0887b25`)

## 2026-07-16
- fix: level switching rebuild, clear old sentences on rebuild, completed sentences excluded, reset progress UI (`d145c1c`)

## 2026-07-16
- feat: import all 9 word banks on build, add level filter UI (`018fecf`)

## 2026-07-16
- fix: word bank selector buttons, persist completed sentences, fill mode init + wrong-words fix, index-based prev/next nav (`72ee5a9`)

## 2026-07-16
- refactor: simplified SpellingPage — select level builds database, linear practice flow, removed ImportDialog (`b687900`)

## 2026-07-16
- fix: buildSessionQueue now includes ALL sentences without maxNew limit, fix variable name (`74c71d0`)

## 2026-07-16
- fix: increase session queue to 200 sentences, fix empty symbol display (&nbsp; → actual U+00A0) (`6be0277`)

## 2026-07-16
- feat: add vertical bar and brand-color underline on focus to show active word (`c917832`)

## 2026-07-16
- fix: submitted results no longer cleared by effect, remove completed sentences from queue, Tab nav + auto-focus, cancel stale TTS (`397cb11`)

## 2026-07-16
- fix: exclude /api/* from _redirects rewrite (`4bdfd00`)

## 2026-07-16
- feat: remove ___ placeholders, one-click full word bank import, fix sentence count not updating (`de4f924`)

## 2026-07-16
- fix: adjust word gap to 0.5em (one 'a' width) (`8ece919`)

## 2026-07-16
- feat: underline is invisible input carrier — click to type, text appears above line (`82aaecd`)

## 2026-07-16
- feat: underline-only input style, auto-read toggle (`00ffb4b`)

## 2026-07-16
- fix: handleImportAll batches all segments in single addSentences call to avoid stale closure overwrite (`e2f7e34`)

## 2026-07-16
- fix: segmented batch import, per-word input with ___ placeholder, centered Chinese, conditional auto-read (`2172279`)

## 2026-07-16
- feat: segmented batch import from word bank — scan all words, split into segments of 200+, import by segment (`7281c72`)

## 2026-07-16
- refactor: dictation mode - single continuous input instead of per-word fields (`12945d5`)

## 2026-07-16
- fix: add _redirects for SPA client-side routing, fix Dialog aria-describedby warning (`bd46d45`)

## 2026-07-16
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

