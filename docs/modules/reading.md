# 阅读（`/articles`）

> 状态栏里叫「阅读」，路由是 `/articles`，模块 key 是 `articles`。
> 这是全仓**代码量最大**的一块：列表页 1682 行 + 阅读器 1749 行 + 小说视图 645 行，外加 5 个数据层模块。

## 1. 功能

一套阅读器吃下五种来源，读者在同一条路径上完成「读 → 点词查词 → 段落中文对照 → 章内进度续读」。

| 来源 | `type` | 数据 | 体量 |
|------|--------|------|------|
| 公版书 | `book` | `src/data/books.ts`（22 本，随包全文在 `public/books/`） | 627KB 源码 + 23MB txt |
| 站内刊物 | `publication` | `publications.ts` / `publications-extra.ts` | — |
| 演讲 | `speech` | `src/data/speeches.ts`（30 篇） | — |
| 网文选段 | `webnovel` | `src/data/webnovels.ts` | — |
| SCP 基金会 | `wikipedia`/`publication` | `src/data/scp.ts`（CC BY-SA，必须带 `sourceUrl`） | 188KB |
| AI 生成 | `ai` | 自由生成/主题生成即时创作，**成功即存入 `__nativethink_ai_articles`**（见 §2.6） | — |
| 复习词汇文章 | `ai`（`source:'复习词汇生成'`） | 用**自选**到期复习词分篇生成，见 §2.6（`ArticlePage.tsx:721`） | — |
| 用户导入 | `book` | `src/data/imported-books.ts`，`IMPORTED_ID_PREFIX` | localStorage |

阅读器两种视图，同一份数据骨架：

- **小说模式**（默认）：章节制滚动，像起点读书，记「每章滚到哪儿」。
- **翻页模式**：保留的旧实现，左右翻页。

## 2. 实现方法

### 2.1 内容类型与切页

`src/data/reading.ts` 定义 `IReadingContent`（`pages: IPage[]`，`IPage = { paragraphs: [{en, zh}], pageNumber }`）与 `buildPages()`。**`##CHAPTER##` 前缀是全仓的章节定界约定**：段落 `en` 以它开头即为章标题行，渲染时剥掉前缀当标题（`ReaderParagraph.tsx:59-60`），翻译时只定界不翻译。

书籍数据分三层，改任何一层都要知道另外两层：

```
src/data/books.ts        # 1723 行，22 本书的压缩节选（每本约 4800 词）
src/data/book-clean.ts   # 古腾堡 txt → 段落数组 + 章节标记（182 行纯函数）
src/data/books-meta.ts   # 只含元数据，由 scripts/gen-books-meta.cjs 生成
```

列表页只读 `BOOK_META`，点开书才 `import('@/data/books')`（`ArticlePage.tsx:274` `openBookFromList`）—— 这是首屏从 1055KB 降到 376KB 的关键。**生成 `books-meta.ts` 时必须用真实 `buildPages`**，用 stub 会把 `pageCount` 算错。

### 2.2 运行时全文升级

`books.ts` 里是节选，打开书后 `fetchFullBook()`（`src/data/book-fulltext.ts:60`）把它换成古腾堡完整版：

1. 先查 IndexedDB `book-full-v2-<gutenbergId>`；
2. **首选随包文件** `public/books/<id>.txt`（`loadBundledText`，零网络）；
3. 包里没有才联网 `loadRemoteText`；
4. `cleanBookParagraphs` + `buildPages` → 结果落 IDB；
5. 成功后 `setDisplayContent` 覆盖 pages，并 toast「已加载完整版 · N 章 · Mk 词」（`PageReader.tsx:326-334`）。

`loadBundledText` 有三道真实性检查（长度 ≥5000、非空、**以 `<!doctype`/`<html` 开头就判为失败**）—— 因为静态托管在文件缺失时会用 SPA 兜底、以 200 返回 `index.html`，那会被当成一本书解析进去。

### 2.3 章节切分有两套实现，必须对齐

| | `buildNovelChapters`（界面章号） | `splitChapters`（译文章号） |
|---|---|---|
| 位置 | `components/reader-shared.ts:71` | `data/book-translation.ts:136` |
| 空章判定 | `bodyItemCount(ch) > 0`（`:66`） | `paragraphs.length > 0`（`:140`） |
| 编号 | `chapters.length` 连续 | 末尾 `.map((c,i) => ({...c, index:i}))` 重排 |

两者刻意做了同构（`reader-shared.ts:75-80` 注释：**基督山伯爵实测 244 章 vs 124 章**那次事故留下的），译文是按 `splitChapters` 的章号索引存的，界面章号一旦和它错开，表现就是**中文贴到别章、章节像缺了几章**。

### 2.4 批量翻译

`src/data/book-translation.ts`（841 行）把「逐段翻译太慢」改成按章组织：

- 每批 4 段（`DEFAULT_BATCH_SIZE`），system prompt 要求「编号严格一一对应」+ 只输出 `{"t":[{"i":1,"zh":"…"}]}`；
- 章内 2 并发、全书串行；失败退避 3s → 8s → 15s，全失败则跳过该段；
- 单段送 AI 前截断 1500 字符（`MAX_SEGMENT_CHARS`）；
- 产物落 IndexedDB `booktrans-<bookId>-ch<idx>`（数组下标 = `splitChapters` 顺序）+ `booktrans-<bookId>-index` 清单，支持中止与断点续传；
- `parseBatchTranslation` 容忍代码栅栏、前后夹说明文字、缺项错号，解析失败返回空 Map，调用方**退化为逐段翻译**；
- 引擎侧优先端侧 opus-mt（`local-mt.ts`），AI 兜底。

「翻译本章」（`PageReader.tsx:961`）与「翻译全部」（`:1081`）复用同一个 `translateBook` 队列。

### 2.5 进度、批注、偏好

| key | 写入 | 说明 |
|-----|------|------|
| `__reader_progress_<contentId>` | `PageReader.tsx:55` | `ReaderProgress`：`page/total/chapter/chapters/ratio/perChapter` |
| `__nativethink_reader_notes_<contentId>` | `reader-shared.ts:145` | 段落批注 |
| `__nativethink_reader_prefs` | `PageReader.tsx:263` | 字号 / 主题 / 视图模式 |
| `__reader_trans_<contentId>` | `PageReader.tsx:274` | 段级译文缓存 |
| `__reader_lookup_recent` | `PageReader.tsx:840` | 最近查词 |

`ReaderProgress` 里 `total` 和 `chapters` **两个字段是必须存的**（`reader-shared.ts:22-35` 注释）：外部列表若拿「当前节选页数」当分母去除「全文空间的页码」，会显示 516%；`/books/index.json` 的 `chapters` 是 `dump-book-texts.cjs` 另算的，和阅读器切章结果不一致（弗兰肯斯坦 index 写 29、阅读器切出 32；爱丽丝 index 13、出现第 55 章），所以分母只能用保存时自己存下的那个。

复习词高亮：`setHighlightWords()`（`src/lib/reader-highlight.ts`）模块级状态，`PageReader.tsx:213-220` 推入，颜色可选（柔和色系，6 种）。**词表两套字段互为兜底**：`reviewWords = highlightWords?.length ? highlightWords : rvWords ?? []` —— 新文章两个都有（点名的整批 vs 真出现在正文里的），**改造之前存下的老复习词文章只有 `rvWords`**；只认 `highlightWords` 的话，这类文章点进去零高亮、设置里也没有「待复习词的颜色」那一行 —— 本机 A/B 实测钉住（一次性 profile 里塞一篇只有 `rvWords` 的文章：有回退时颜色行写「（3 个）」并真框出 3 处，把源码改回旧写法同一份数据变成颜色行消失、0 处框词，12/12 全绿）。⚠️ 一度把"真机 83 上看不到颜色行"当成这条的证据，后来在本机复跑发现那次读数不可复现（那篇文章其实带 `highlightWords=50`），已按 A/B 结论改写措辞 —— 见 verification.md §4。注意 `rv-articles.ts:134` `rvRegenKeys` 的优先方向**相反**（重生成要用真出现过的词），这不是笔误。退出阅读器必须 `setHighlightWords(null)`，否则下一篇无辜文章被上一篇的词表染色。

### 2.6 复习词汇文章：选词 / 分篇 / 用词出队

2026-09-30 重做（旧版写死 `dueForReview.slice(0, 10)`、用完即弃、不落盘 —— 用户报「生成词数只有十个左右，对不上完整的需要复习的单词」）。现在的口径：

- **词表是派生的，不存"已用清单"**：`rvRecord = 到期词 − 所有现存 AI 文章的 rvWords 并集`（`src/lib/rv-articles.ts:22` `usedReviewWordKeys` / `:33` `reviewWordRecord`；页面接线 `ArticlePage.tsx:720-722`）。因此**删掉一篇生成的文章，它用掉的词立刻回到词表** —— 两份真相永不相漂。
- **选词**：面板列出「待复习 N 词」的 chip（默认画前 `RV_MAX_CHIPS=30` 个，其余折叠为「展开全部」），点选/取消；「选前 N 词」按当前每篇词数取（面板 `ArticlePage.tsx:1250-1330`）。
- **每篇词数**：档位 `RV_PER_OPTIONS = [8,10,15,20,30,50]`（`:49`，2026-09-30 放开到 50），选中词按它切批（`planRvBatches`，`rv-articles.ts:41`，`per ≤ 0` 夹到 1）。段落数 `rvParaCount`（`:97`）= 每 3 词 1 段、下限 3 上限 12（上限是防 4096 token 回复被截成坏 JSON）。
- **一次最多 `RV_BATCH_LIMIT = 6` 篇**（`:45`）：超出的批次**不消费**，对应词留在词表，UI 报「另有 X 篇的量留在词表」。
- **体裁 + 主题**：`RV_GENRES`（`:51`，说明文/记叙文/议论文/对话体/书信）与复用 AI 生成 tab 的 `TOPICS`（主题，含「不限」）经 `buildRvPrompt`（`rv-articles.ts:117`）进提示词 —— 唯一构造点，所以"选了没用"会被守卫 ⑥ 抓到；两者都随文章落盘（`rvGenre` 字段 + `topic`，`ArticlePage.tsx:751-767`）。
- **逐篇串行生成**（`generateFromReviewWords`，`:773`）：每篇成功即 `saveAiArticle` + 历史 `{ aiId: 文章id }`（因此可重新打开），同时带 `highlightWords`（整批点名词，给阅读器高亮）与 **`rvWords` = `coveredReviewWords(keys, 正文英文)`**（`:91`）—— **只有真的出现在正文里的词才算"用掉"**，漏用的自动回到词表，toast 明说「N 个词没进正文，已退回词表」。形态归并口径直接复用阅读器 `reader-highlight.ts:107` `matchesHighlight`（不重写第二套 s/ed/ing 规则；`curiosity` 不算 `curious`，宁少不错）。空串（服务不可用）或解析不出的篇**不写任何记录**。
- **保存 / 收藏 / 删除 / 重写**：文章进「已保存的 AI 文章」（键 `__nativethink_ai_articles`，上限 50）；卡片有心形收藏（`type:'article'`、`content:文章id` → 「我的收藏」跳回并自动打开）、X 删除、以及**「重写这篇」**（`regenerateRvArticle`，`:836`）：取词走 `rvRegenKeys`（`:134`，优先 `rvWords`，老数据回落 `highlightWords`），沿用**文章自己的**体裁主题，成功后 `replaceAiArticle`（`:194`）**原位替换且 id 不变**（换新 id 会让收藏 `content` 与历史 `meta.aiId` 一起断链；"先删再存"会让词表瞬间回涨），失败/坏数据一律**保留原文**并说明。同时只允许一篇在途（`rvRegenId`）。
- **不改 SM-2**：生成文章不算一次复习，词的到期状态原样保留；"用掉"只是"已排进文章"的展示口径。

## 3. 注意事项

1. **`public/books/` 是 23MB，且已进 git**（`.git` 因此 48MB）。它同时被 Cloudflare Pages 托管和 `capacitor copy` 打进 APK。这是有意的取舍：随包全文消除了「联网失败 → 静默退回压缩节选 → 章节缺失 / 译文错章」。要动这个目录，先想清楚退回节选的后果，别只按「public 不放大数据」的直觉删。
2. **两套切章逻辑改一处必须改另一处**。判定口径还有一处残余差异：`buildNovelChapters` 会跳过 `en` 为空的段落，`splitChapters` 刻意保留空段以维持下标对齐 —— 因此「一章里只有空段」时两边章数仍会差 1。改切分逻辑后跑 `node scripts/verify-tts-progress.mjs`（它按真实书目逐页断言段落词数之和）。
3. **`index.json` 的 `chapters` 不可作分母**（见 2.5）。任何「读到第几章/共几章」的展示都要用 `ReaderProgress.chapters`。
4. **升级失败不再 toast 是刻意的**：`fetchFullBook` 返回 `null` 时页面只把 `fullTextLoading` 关掉（`PageReader.tsx:326`）。用户看到的仍是节选版。排查时看 `(window as any).__ft`（`start`/`cache-hit`/`cache-miss`/`idb-err`/`fetching`/`bundled`/`proxy`）和 `__ftThen` —— 这两个调试全局量**目前还留在生产代码里**（`book-fulltext.ts:68-82`、`PageReader.tsx:325`），删之前确认没人在用它复现问题。
5. **`fetchFullBook` 的 effect 不能用 ref 做一次性守卫**：`PageReader.tsx:318-319` 注释写明 StrictMode 双执行会取消第一次、又把第二次拦死，靠的是函数内的 `inFlight` Map 去重 + IDB 缓存。
6. **以 `<html` 开头的 200 响应是假的正文**（SPA 兜底）。任何新增的「随包静态文件」读取都要带同样的 doctype 检查。
7. **`__reader_*` 与 `__nativethink_*` 在同步上其实没有区别**。`use-cloud-sync.ts:8,55` 的 `DATA_PREFIX` 过滤**只作用于 `syncUp` 的全量扫描**；登录后 `registerCloudWrite()` 注册的双写处理器（`:91-105` ← `safe-storage.ts:170-177`）**不挑前缀**，任何 `safeStorage.setItem` 都会被推上云。所以阅读进度、段级译文缓存、最近查词都会同步，只是不参与登录时的全量补推。真正不上云的只有裸 `localStorage` 与 IndexedDB。详见 `docs/modules/storage-and-stats.md` §3.4。
8. **AI 文章的历史可点性 = `meta.aiId` 对应的文章还在**：`ArticlePage.tsx:824` 的 `clickable` 现在还会查 `aiArticles`（新条目都带 `aiId`，含复习词汇文章与自由生成文章）；文章删掉后提示「文章已被删除」，**老条目**（2026-09-30 之前写入、没有 `meta.aiId` 的）仍显示「此条记录生成于旧版本，无法恢复」。改历史面板时别把这条分支删回去。
9. **`scp.ts` 是抓取产物，勿手改**（`node scripts/fetch-scp.cjs`，约 1 req/s）；它带 `SCP_LICENSE`，条目必须保留 `sourceUrl`（CC BY-SA 要求署名到具体来源）。
10. **模块 `src/data/` 下有 .bak 与进度文件**：`chunks.ts.bak`、`shadowing.ts.bak`、`shadowing.ts.expand-progress.json`（483KB）。它们不进包，但会迷惑人和增大仓库；确认生成器不再依赖后可清理。
11. **阅读器是 `fixed inset-0` 全屏层，必须自带 safe-area**：外壳那层内缩救不到它。2026-09-30 真机反馈「AI 生成文章顶部被手机顶部栏遮住」—— 实测小米 onyx 上 `env(safe-area-inset-top)=47px`，而阅读器顶栏 `top:0`，整条（含「退出阅读」）藏进状态栏。修法：根节点补 `safe-area-top safe-area-bottom`（`PageReader.tsx:1210`），底部翻页条同时躲开手势条。新增任何贴顶的全屏层同理，`verify-overlay-fit` ④ 会扫本文件里所有 `fixed inset-0`（单/双引号都吃、先剥注释）并要求非居中的那些带内缩；本机验收用 CDP `Emulation.setSafeAreaInsetsOverride`（参数是 `insets: {top,bottom,left,right}` 对象）强制 47/24，量顶栏 `top` 从 0 变 47。
12. **守卫覆盖**：数据层有 `verify-tts-progress`（朗读反查表）与 `verify-books-meta` ⑤⑥（书目拆分/元数据）；复习词汇文章的**选词/分篇/用词出队/体裁主题进提示词/覆盖判定/原位重写**由 `verify-rv-articles`（104 断言，含 27 条变异测试：13 条针对首版、14 条针对本次扩展）钉住。**切章对齐、翻译回填、进度百分比三件事仍没有脚本兜**，改这些要手动开真书验证：翻到中段 → 刷新看百分比 ≤100%，「翻译本章」后中文没有落到别章。
