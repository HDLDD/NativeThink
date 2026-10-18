# 视频精听（`/video`）

> 模块 key `video`。页面 `src/pages/VideoLabPage/VideoLabPage.tsx`（665 行）+ 数据层 `src/lib/video-lab.ts`（344 行）。
> 媒体与字幕在 **IndexedDB 独立的 `media` 表**，进度与"上次开着哪一课"在 `safeStorage`。守卫 `scripts/verify-video-lab.mjs`（89 条）· 真界面走查 `scripts/walk-video.mjs`（35 条）· 真媒体探针 `scripts/probe-real-media.mjs`（26 条，两遍正/负对照）· 素材工具 `scripts/make-video-lab-packs.mjs`。

## 1. 功能

导入 **字幕（必需）+ 视频/音频（可选）**，然后像「每日英语听力」那样逐句学：

| 能力 | 入口 | 落在哪 |
|------|------|--------|
| 逐句跳转 / 单句循环 / A-B 复读 / 倍速 | 卡面按钮 + 快捷键（`:373-390`） | 时间轴由 `timeupdate` 驱动 |
| 字幕清单 | 默认只渲染活动句前后 40 条，「展开全部」给整本（`:43`、`:366-371`） | — |
| 点词查词 | 词面 span（`:525-535`） | 释义来自词库 `queryWords` |
| 加进生词本 | 查词卡按钮（`:604-608`） | `addCustomWord` → **进 SM-2 复习队列** |
| 收藏句 / 收藏词 | 心形按钮（`:539-541`、写点 `:279-291`、`:293-301`） | `useFavorites`，句用 `type:'video'` |
| 朗读本句 | `tts.speak`（`:506-510`） | 全站 TTS 降级链 |
| 跟读比对 | Mic 按钮（`:306-334`） | `SpeechRecognition` + `scoreSpeech` |
| 听写这句 | 键盘按钮（`:544-546`） | 句子拼写的 `video` 桶 |
| 双语字幕 | 「翻译字幕」（`:336-362`） | AI 批量翻译 → IDB `z:` 分键 |

## 2. 为什么是"导入"，不是内置转录（架构决定，别翻烧饼）

本地转录服务（dshzmd，`127.0.0.1:8848`）**不能**作为三形态的共同后端：

- 网页版跑在 `https://nativethink.pages.dev`，去抓 `http://127.0.0.1` 是**混合内容**，浏览器直接拦；
- APK / 桌面根本没有那个进程；
- 服务端也没开 CORS（2026-10-18 讨论过可以加，加完仍然解决不了前两条）。

所以定死的形态是：**用户在转录伴侣里导出 SRT / VTT / JSON，导入 NativeThink**。NativeThink 只在导入这一步之外用自己的能力（查词、收藏、朗读、生词本、拼写、AI 翻译）。界面文案与守卫都按这一条写，不要看到"没接上本机服务"就当缺陷去补网络调用。

## 3. 实现方法

### 3.1 字幕解析（`video-lab.ts:62-191`）

| 函数 | 行 | 干什么 |
|------|----|--------|
| `parseTimestamp` | `:63` | `00:01:02,500` / `01:02.500` / `750` → 秒；**认不出返回 NaN**，由 `normalize` 丢条，绝不猜成 0 |
| `stripCueTags` | `:74` | 剥 `<i>` `<c.yellow>` `{\an8}` `v 说话人:` 与 `&nbsp;`/`&amp;` 实体 |
| `parseSrt` / `parseVtt` / `parseDshJson` | `:100` / `:117` / `:129` | 三种格式；VTT 的 `NOTE` 块跳过；JSON 带词级时间戳 |
| `detectSubtitleFormat` / `parseSubtitle` | `:152` / `:160` | **按内容**判格式，判不出按 SRT 兜一次（很多导出文件没有头部） |
| `normalize` | `:85` | 丢无效时间与空文本 → 按 `t0` 排序 → **重新连续编号 `i`** → `t1 ≥ t0` |
| `lessonId` | `:171` | 文件名 + 时长 + 字节的哈希，重复导入同一份只有一条 |

### 3.2 存储：三键分片 + 索引封顶（`video-lab.ts:193-281`）

一个 object store（`idb.ts:14` 的 `MEDIA_STORE='media'`），三条键：

```
video-index          → { items: IVideoMeta[] }          （列表唯一权威源）
m:<id>               → { blob }                          媒体本体（可无）
s:<id> / z:<id>      → { sentences } / { zh[] }          字幕与译文分开
```

六条不显然的规定：

1. **`media` 必须独立成表**（`idb.ts:12` 的 `DB_VERSION=2` 加表）。`idbClear()` 只清 `wordbank`，词库重建/换代绝不允许顺手把用户的视频删掉。
2. `save()` 任何一步写失败**返回 false 且不写索引**（`:215-229`）—— 不留半条课程。
3. 索引记录的键名字面量由 `INDEX_KEY`（`:58`）单点提供，守卫**用码点拼出期望值**钉住它：这个值一度是三个星号，功能完全正常（它只是个唯一键名），所以真跑断言与走查一路全绿 —— 直到探针把 `getAllKeys()` 原样打出来才看见。改键名会让已存在的索引记录变孤儿，本模块刚上线、无真实用户数据才敢直接改。
4. 索引 50 条封顶，淘汰旧条目时**连 `m:`/`s:`/`z:` 一起删**（`:221-227`）。只删索引会留下几百 MB 孤儿 blob。
5. 译文分键回写（`saveZh` `:253-260`）：AI 翻译不重存 blob，只写 `z:`；写失败如实返回 false，界面显示"这次只显示、下次要重翻"。
6. `load()`（`:232-251`）把 blob 换成 object URL 前判 `instanceof Blob` 并 try/catch —— 记录被写坏时退化成"无原声"，不许把页面掀翻。

`withStore` 的 resolve 挂在 `tx.oncomplete`（`idb.ts:48-70`）而不是 `request.onsuccess`：配额满的失败是**事务级**的，只看 request 会把没落盘的写当成成功。

### 3.3 播放、计时与断点

- 活动句：`activeIndexOf`（页面 `:53`）线性扫，`timeupdate` 驱动（`:215-241`）。单句循环与 A-B 都在这一个回调里，避免两套时间判定。
- **计时按课去重**：`addStudyMinutes(0.2,'video')` 只在"第一次推进到这句"时给（`:104`、`:226-228`）。往回拖再看一遍会反复进入同一句，不去重就成了刷时长。`verify-study-credit` 第 ④ 节钉这条。
- 进度：`mergeProgress`（`video-lab.ts:283-300`）封顶 80 课，经 `persistJson` 写 `__nativethink_video_progress`（页面 `:240-246`）→ 自动进云同步与备份。
- 断点：`__nativethink_video_last_open`（`:41`、`:140`、恢复 effect `:144-151`）。切 tab 会重挂载组件（`Layout.tsx` 的 `key={location.pathname}`），回来必须接着上次那一课；主动点返回箭头要清掉这个键（`:441`），否则下次进来又被拽回课程、看不到导入入口。

### 3.4 点词 / 收藏 / 跟读 / 听写 / 翻译

- **词面必须两种形态都能点**：JSON 字幕带词级时间戳，普通 SRT 没有 —— 没有时按空白把整句切成词 span（`:525-533`）。早期版本把整句当一个 span，结果"点词查词"在最常见的那种字幕上退化成"点整句"（2026-10-18 走查抓到，守卫第 ⑤ 节钉住）。逐词高亮只在真有词级时间戳时点亮，否则整条一起下划线没有意义。
- 查词：先 `queryWords({search, limit:1})`，**查不到先 `preloadCoreOnly` 预热再查一次**（`:267-277`），否则核心层没预热时会假报"词库里没有这个词"。
- 收藏句：`type:'video'`，`example` 存 `起始–结束` 时间区间（`:293-301`）。判重必须 `isFavorited(content,'video')` **看两 type**（与全站口径一致，见 dashboard-progress-favorites.md）。收藏页三处已认得这一型：标签 `FavoritesPage.tsx:38`、配色 `:51`、筛选 `:56`。
- 跟读评分：`scoreSpeech`（`video-lab.ts:322-344`）用 **LCS 按词序**算命中比例并列出漏读词。不许用集合交集 —— `"the book is on the table"` 里 `the` 出现两次，只读对一次不该算两次。**通道判定不能只看对象存在**：模拟器 APK 实测 `window.webkitSpeechRecognition` **存在**（`sr:true`），但 `start()` 之后 onresult/onerror/onend 一个都不回 —— 所以除了 `!API` 那条"这台设备没有语音识别通道"的实话文案，还要 **try/catch 兜 `start()` 当场抛**、再加 **9 秒看门狗**（`rec.start()` 后无回应就收摊并说明"识别服务没有回应"，同时撤按钮的"正在听…"态）。三者缺一个就是 AGENTS 那条"点了没反应／转圈不结束"（2026-10-18 装机走查抓到：改之前正是卡在"正在听…"）。卸载时 `recRef.current?.abort()` + 撤看门狗（`:119-122`）。绝不允许显示一个假分数。
- 听写这句：`videoToSpellingItem`（`use-spelling-sentences.ts:74-76`）是单一口径，与纠偏桶共用 `sentenceItem`（`:58-71`，判难 ≤7 / ≤13 / 更多）。拼写页里 `video` 是**句子库的桶**、不是词库：`handleLevelChange` 与纠偏桶共用同一条早退分支（`SpellingPage.tsx:883`），否则会 `preloadLevels('video')` 并弹「该词库没有例句」。桶名在词库下拉 `:1299-1306`，标签映射 `:1262`。按钮"这句已经在听写本里"用 `normSentenceKey` 判（页面 `:109`、`:536`），是界面状态不是 toast。
- **素材必须有画面**（用户硬要求）：`make-video-lab-packs.mjs` 会 `ffprobe` 一遍，**没有画面轨直接拒绝出包**（加 `--allow-audio` 才放行）。B 站"听力号"类上传常见两种坑：① 只给音频流（`bestaudio`）→ 播放器整块黑；② 480p 给的是 **AV1** → WebView 不保证解得动。素材侧统一转 **H.264 + yuv420p + faststart**，并**裁到字幕覆盖的区间**（那条 100 分钟的合集裁成 344 秒，才对得上 69 句字幕）。App 侧也补了实话：`el.videoWidth === 0 && el.videoHeight === 0` 时在播放器下写"只有音频轨、没有画面，黑屏属正常"。
- **真机看画面要用 `adb exec-out screencap -p`，不要用 `device-eval shot`**：后者走 CDP `Page.captureScreenshot`，**抓不到视频硬表面**，播得好好的也会截成一块黑（本轮差点据此误报"没有画面"）。量化对照：源文件抽帧平均亮度 51.9，设备截屏播放器区域 53.3 / 256 级灰阶，而 CDP 截图那块是全黑。
- **假时长要说破**：流媒体站给的 m4a 常见"容器头写 100 分钟、实际只有 5 分钟"（截断下载；实测 B 站那条头 6024s / 真语音 343s）。`onLoadedMetadata={checkDuration}`（`:515`）用**双向比值**判（`got/expect > 1.6 || < 0.6`，不只判 NaN），命中就在播放器下方一行写清"播放器报多少、字幕只到多少，跳转/复读按字幕时间走"（渲染 `:523`；换课时 `setNote('')` 清掉，见 `:131`）。素材侧另用 `ffmpeg -t <字幕末尾秒+1> -c:a aac` 重编，`ffprobe` 复核 duration 才算修好。
- 双语字幕：一次最多 `TRANSLATE_LIMIT=30` 句、每批 10 句（`:46-47`），长视频要再点一次 —— 不许一口气打爆额度。编号 JSON 的解析**复用整书翻译的 `parseBatchTranslation`**（`data/book-translation.ts:196`），不另写一份正则。三档降级各有实话：未配 Key / 返回空 / 编号对不上（`:336-362`）。

### 3.5 六件套接线（漏了会静默不显示）

| 处 | 位置 |
|----|------|
| 路由 + lazy + ErrorBoundary | `src/app.tsx:18`、`:59` |
| 侧边栏预取表 + NAV_ITEMS | `src/components/AppSidebar.tsx:45`、`:62` |
| 首页进度环 MODULES + 快捷入口 | `DashboardPage/constants.ts:108`、`:67` |
| `moduleProgress` 类型与默认值 | `use-learning-stats.ts:28`、`:56` |
| `MODULE_PROGRESS_KEYS` 白名单 | `use-learning-stats.ts:82`（漏了被 `mergeStats` 丢弃） |
| ProgressCharts 颜色与名称 | `ProgressCharts.tsx:42`、`:49` |
| 首页「续学」标签表 | `DashboardPage.tsx:294` |

## 4. 注意事项

1. **object URL 必须 revoke**：换课与卸载两处（`:133`、`:119-122`）。几十 MB 的 blob 泄漏比缓存贵。
2. **字幕列表必须开窗**，但「展开全部」不许削弱（守卫 `verify-list-scaling` 同款口径；`verify-video-lab` 第 ④ 节钉窗口常量）。
3. **无媒体是合法形态**：只导字幕时播放器位置显示"仅字幕课程 · 用朗读本句"（`:476-481`），不是坏掉的 `<video>`。
4. 卡面大量动作是**图标 + title**（收藏这句、送进句子拼写）。自动化按 title 精确匹配，按 innerText 找不到（walk-video 的 `clickTitle`，与真机走查同一条教训）。
5. 快捷键监听用**捕获阶段**（`:388`），否则 Radix 冒泡阶段同步关弹窗会把 Esc 连带退出流程。
6. 本页**零 toast**：所有反馈走界面文案（查词卡、跟读块、译文进度行）。新增提示必须先改守卫的零提示断言。
7. `accept="video/*,audio/*"` 这个属性里的"斜杠星"会**骗过任何用正则剥注释的静态检查** —— 从那里一路吃到后面真正的注释结尾，一次吞掉 9KB 源码，接线断言全变成"这段代码不存在"的假红。`verify-video-lab.mjs:26-32` 因此把剥注释交给 TS 转译器（`removeComments`），并自带一条脚手架自证。

## 5. 验证

- `node scripts/verify-video-lab.mjs` —— 84 条：三种字幕真跑解析、假 IDB 真跑整段存储层（索引封顶连媒体一起删、写失败不谎报、译文分键、`load` 合并中文）、`scoreSpeech` 真跑（含"重复词只扣一次"的正对照）、六件套与页面接线。
- `node scripts/probe-real-media.mjs` —— 26 条**带真实原声**那条路径：`File → IDB blob → createObjectURL → <video> 解码（readyState=4）→ timeupdate 逐词高亮 → 切走再回来从 IDB 读回 → 删除把 m:/s:/z: 一起收掉`。两遍正/负对照：正常媒体不许报"时长元数据不可靠"、截断媒体必须报。前置：把两份媒体 + 一份 JSON 放进 `dist/client/__probe__/`（构建产物目录，不进 git），Chrome 要带 `--autoplay-policy=no-user-gesture-required`。
- `node scripts/make-video-lab-packs.mjs [--add 关键字] [--model small]` —— 把转录伴侣的产物做成可直接导入的课包（媒体 + .srt + 词级 .json + 说明.txt），输出 `B:/nt-materials/video-lab/`。每份字幕都用同一个 `parseSubtitle` 真跑一遍，说明里带**质检数字**（重复句 / 夹非英文 / 碎句）—— 那条 B1 听力本来就是"英文读两遍 + 中文夹译"的练习结构，重复句 30/69 写进说明，不装作没看见。
- `node scripts/walk-video.mjs` —— 35 条真界面走查（无头 Chrome，`--port 9222 --base http://127.0.0.1:8001`）：灌 45 句 SRT → 落 IDB → 点句跳转 → 点词查词 → 加生词本 → 收藏句 → 收藏页看到「视频精听」→ 拼写页视频桶起会话 → AI 翻译真跑到「已翻译 30/45 句」→ 跟读不崩 → 删除后 `media` 表只剩索引一条。APK 侧复用同一脚本：`--port 9226 --base https://localhost`。
- 变异记录（改坏必须红）：`scoreSpeech` 换成集合交集 → ⑦「重复词只扣一次」红；撤 `disabled={inSpellingBook}`、把 `onClick={shadowThis}` 接空、把 `saveZh` 换成 `const saved = true` → 各自那条红；把 `strip` 退回裸正则 → 脚手架自证红。
