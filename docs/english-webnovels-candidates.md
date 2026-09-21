# 英文网文（web novel）候选清单与可行性结论

> 目标：给「文章 → 书籍」加入英文圈流行的**网文/网络连载**。
> 结论先行：**内置打包基本不可行**（法律层面），可行路径是把它们做成「推荐 + 官方链接」或走已有的「导入书籍」。
> 下面所有法律结论都附了核查来源；网文热度榜基于公开口碑，**未逐条核验当前可获取性**（见 §4 说明）。

---

## 一、法律核查（决定方案，先看这节）

### 1. Royal Road（英文网文最大站）—— 明确禁止复制与爬取

[Royal Road ToS](https://www.royalroad.com/tos)（Last Changed 2019-07-17）三条直接相关：

- **Section 2**：「You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the
  Service … without express written permission by us.」
- **Section 10（Prohibited Uses）(i)**：禁止「spider, crawl, or scrape」。
- **Section 19**：「Anything you write is automatically copyrighted by you」—— 作品版权归作者，不在平台。

→ **结论：Royal Road 上的作品既不能打包进 App，也不能爬取。** 这一条就否掉了绝大多数英文网文。

### 2. 单作者作品也要逐个看：Ra（qntm）明确禁止再分发

`Ra` 常被误认为 CC 作品（作者 Sam Hughes 的其他内容常被自由引用）。但作者在
[qntm.org/ra](https://qntm.org/ra) 的评论里对「抓站做 epub」的官方答复是：

> 「Scraping the website to assemble an ebook for personal use is mainly okay, but
> **please do not redistribute Ra yourself.** If you produce an ebook, send it to me and I will upload it here.」

→ **个人自用可以，再分发不行。** 所以 `Ra` 不能内置。（附：作者自报全书 137,774 词。）

### 3. 同人（fanfic）连作者本人都无权授权

`Harry Potter and the Methods of Rationality`（HPMOR）是最有名的英文网文之一，
[hpmor.com](https://hpmor.com/) 自称 is「an authorized, ad-free mirror」。但它是
**Harry Potter 同人**：底层 IP 属 J.K. Rowling / Warner，作者无权把派生权授给第三方。
无论它标注什么许可，**内置打包都不安全**（上游 IP 方可随时主张权利）。

### 4. 可以内置的少数：作者主动 CC 授权的作品

已核验其一：

- **`Blindsight`（Peter Watts）** —— 作者官网 [rifters.com/real/Blindsight.htm](https://www.rifters.com/real/Blindsight.htm)
  提供 PDF / HTML / mobi / epub **免费下载**，且正文目录里带一节
  「**Creative Commons Licensing Information**」。属于作者主动 CC 授权的已出版长篇（硬科幻）。

其它同类（**需逐个打开作者页确认具体许可变体**，不要凭印象）：

| 作品 | 作者 | 备注 |
|---|---|---|
| Little Brother | Cory Doctorow | Doctorow 一贯用 CC BY-NC-SA 发布 |
| Down and Out in the Magic Kingdom | Cory Doctorow | 同上（早期作品，变体可能是 ND） |
| Accelerando | Charles Stross | Stross 曾以 CC 发布 |
| Fine Structure / Ed 等 | Sam Hughes (qntm) | **注意：Ra 已确认不可再分发**，其余须逐个确认 |

**CC 变体对 App 的硬约束**（比"能不能用"更容易踩）：

| 变体 | 对 NativeThink 的影响 |
|---|---|
| **BY** | 可用，署名即可 |
| **BY-SA** | 可用；但"相同方式共享"可能被解释为波及 App 自身内容，需谨慎 |
| **BY-NC** | 可用**仅当 App 保持非商业**。一旦有付费/广告/导流变现即违约 |
| **BY-ND** | **基本不可用** —— App 的 **AI 翻译**与**分页重排**都可能构成"演绎作品" |

→ 也就是说，真正能内置的是「CC BY」或「CC BY-SA（且 App 非商业）」，以及公有领域作品。
BY-NC-ND 这类看着自由，实际上和 App 的翻译/朗读功能直接冲突。

---

## 二、可行路径（按推荐度）

| 方案 | 法律风险 | 工作量 | 说明 |
|---|---|---|---|
| **A. 推荐清单 + 外链官方阅读页** | 无 | 小 | 列表只放书名/作者/简介/官方 URL，点击跳到作者站或平台。**推荐作为第一步** |
| **B. 走已有「导入书籍」** | 无（用户自己提供） | 0（已实现） | `src/data/imported-books.ts` 已有 `parseBookText` / `importBookFromText`，UI 在 `ArticlePage.tsx`（粘贴正文即按 Chapter 标题切章）。用户把自己合法获得的文本导进来即可 |
| **C. 内置 CC 授权作品** | 低（须守 NC/ND 约束） | 中 | 只做 §1.4 里逐个确认过的作品；需在 App 内标注作者与许可 |
| **D. 运行时抓取平台内容** | **高** | 大 | 违反 RR ToS §2/§10(i)，且站方改版即失效。**不要做** |

建议：先做 **A**（立刻有价值、零风险），把 **B** 在 UI 上说明清楚（用户会自己找文本），
**C** 只作为小规模补充。

---

## 三、候选清单（英文圈热度）

> 仅列**热度与口碑**，不代表可打包。除标注外均**不可内置**（版权归作者）。
> 「已 KU」= 已进 Amazon Kindle Unlimited 独占，免费网络版通常已下架 —— 这类连外链都可能失效。

### 3.1 独立作者站（英文网文"名著"级）

| 作品 | 作者 | 官方阅读入口 | 状态 |
|---|---|---|---|
| Worm / Ward / Pact / Pale / Twig | Wildbow | parahumans.wordpress.com 等作者站 | 免费连载，版权归作者 |
| Ra | Sam Hughes (qntm) | qntm.org/ra | **作者明示不得再分发**（§1.2） |
| Fine Structure、Ed | Sam Hughes (qntm) | qntm.org | 须逐个确认许可 |
| Unsong | Scott Alexander | unsongbook.com | 免费，版权归作者 |
| The Wandering Inn | pirateaba | wanderinginn.com | 免费连载（超长，千万词级） |
| A Practical Guide to Evil | ErraticErrata | 作者站（已完结） | 已有官方 ebook |
| Mother of Learning | nobody103 | fictionpress / 作者站 | 已有正式出版版 |
| Worth the Candle、The Metropolitan Man | Alexander Wales | 作者站 | 免费 |
| Harry Potter and the Methods of Rationality | Eliezer Yudkowsky | hpmor.com | **同人，不可内置**（§1.3） |

### 3.2 Royal Road 系（热度高，但平台禁止抓取）

| 作品 | 作者 | 状态 |
|---|---|---|
| Super Supportive | Sleyca | RR 连载中 |
| Delve | SenescentSoul | RR |
| Beneath the Dragoneye Moons | Selkie Myth | RR（部分卷已 KU） |
| The Perfect Run | Maxime Durand | RR（已出版） |
| He Who Fights With Monsters | Shirtaloon | **已 KU 独占** |
| Beware of Chicken | Casualfarmer | **已 KU 独占（已从 RR 下架）** |
| The Primal Hunter / Defiance of the Fall / Azarinth Healer / Mark of the Fool | 多位 | **已 KU 独占** |

### 3.3 翻译网文（中/日/韩 → 英）

| 作品 | 来源 | 说明 |
|---|---|---|
| Coiling Dragon（盘龙） | 中文 → 英译 | 英文版曾在 Wuxiaworld 免费；授权链复杂，不要内置 |
| Omniscient Reader's Viewpoint | 韩 → 英 | 官方英文在 Webtoon/Naver |
| Solo Leveling / Overgeared / The Beginning After the End | 韩 → 英 | 官方 Tapas / Yen Press |
| Re:Zero / Mushoku Tensei | 日轻 → 英 | 官方 Yen Press；fan translation 侵权 |

⚠️ 翻译网文的**行文是译者英文**，作为英语学习语料质量参差（常有直译腔），且法律状态最复杂 ——
**不建议**作为 NativeThink 的阅读语料。

---

## 四、加入网文之前必须先查的技术阻塞：长书进度会显示成几百个百分点

网文动辄 10 万~1000 万词，是现有经典书目（《傲慢与偏见》12.7 万词）的 1~80 倍，
会把这个**已经存在**的问题放大。真机 `25053RT47C` 实测（书籍列表卡片）：

```
弗兰肯斯坦   继续阅读 (第98页)   516%
德古拉       继续阅读 (第92页)   484%
```

两个数的比值一致（516/98 ≈ 484/92 ≈ 5.26），说明百分比是用**另一个量纲的总数**去除页码，
即 `总页数 ≈ 19`。相关的两处代码：

- `ArticlePage.tsx:415` `getBookProgress()` —— 只从 `__reader_progress_<id>` 取 `p.page`，
  **丢弃了存储里的 `total`**（返回 `{ page, total: 0 }`）。
- `ArticlePage.tsx:722-723` —— 分母改用**当前书对象的** `book.pages.length`：

  ```ts
  const totalPages = book.pages.length;
  const pct = progress && totalPages > 0 ? Math.round((progress.page / totalPages) * 100) : 0;
  ```

也就是说：**页码来自保存时的分页，分母来自当前的分页/书对象**，两者不保证同一量纲
（阅读器运行时会「升级为完整版」，分页会变；小说模式存的还是「章节起始页」，见 `PageReader.tsx:45` 注释）。

> ⚠️ 我**尚未确定**这两张卡片的 `book.pages.length` 为什么是 ~19（按 `buildPages(…, 300)` 推算
> 《弗兰肯斯坦》7.5 万词应约 250 页），所以上面只是"量纲不一致"这一结论，具体成因待查。
> **动手加网文前建议先复现并修掉它**，否则超长书的进度会彻底失去意义。


---

## 五、能真正落地的网文（许可已查原文，可再分发）

前面的结论是"热门网文基本不能内置"，但**下面这些是可以的** —— 全部打开许可原文核验过，不是凭印象：

| 来源 | 许可 | 能做什么 | 出处 |
|---|---|---|---|
| **SCP 基金会** | **CC BY-SA 3.0** | ✅ **可内置，甚至可商用**。原文：放宽到「people will be able to copy your work wholesale, **and even sell it**, provided that they properly attribute you and release their work under the same license」 | [licensing-guide](https://scp-wiki.wikidot.com/licensing-guide) |
| **Standard Ebooks** | **CC0 1.0**（完全释入公有领域） | ✅ 可内置，**无附加条件**。原文：releasing the entirety of each ebook file into the public domain；且提供 bulk downloads | [about](https://standardebooks.org/about) · [bulk-downloads](https://standardebooks.org/bulk-downloads) |
| **Cory Doctorow 小说** | **CC BY-NC-SA 3.0** | ⚠️ 可内置但**必须非商业**；**封面图不在授权内**（版权归出版社） | [下载页原文](https://craphound.com/littlebrother/download/) |
| **Peter Watts《Blindsight》** | CC（变体未确认） | ⚠️ 正文确有「Creative Commons Licensing Information」一节（已亲眼看到该节标题），但**具体是 BY 还是 BY-NC-SA 还没读到**，内置前必须拉到那一节确认 | [rifters.com](https://www.rifters.com/real/Blindsight.htm) |

**SCP 是这批里最合适的落点**，理由不是"它最有名"，而是三条刚好对上 App 的形态：

1. **篇幅天然合页**：单篇几百到几千词的档案体短文，正好匹配阅读器按 ~300 词分页、按 Chapter 切章的节奏；不像《Worm》那种百万词长篇会把分页与进度压垮。
2. **体量与热度**：英文互联网最有名的协作虚构体系，数千篇，社区极其活跃 —— 满足"英文圈火"这个诉求。
3. **许可最宽松**：BY-SA 连商用都允许，是这一批里唯一不需要"保持非商业"前提的。

**内置时必须做到的两件事**（BY-SA 的硬要求）：

- **逐篇署名 + 原文链接**（例：`SCP-682 由 Dr Gears 创作，源自 SCP Wiki`）；
- **衍生内容按同一协议共享** —— 注意 App 的 **AI 翻译**属于衍生作品，其译文也要按 CC BY-SA 提供，不能声明独占。

**一个必须避开的坑**：图片另有 [Image Use Policy](https://scp-wiki.wikidot.com/image-use-policy)，且站方特别声明
**SCP-173 的原图（Izumi Kato《Untitled 2004》）不在 CC 授权内**，商用会招致法律行动 —— 所以只取文本，不要抓图。

**Standard Ebooks 的额外价值**：现有 `books.ts` 的正文来自 Gutenberg 原始文本（含版权页、校对署名等噪声，
生成器还要专门过滤）；Standard Ebooks 是精校版且 CC0，可作为**正文来源的升级** —— 与"加网文"是两条独立的收益线。

---

## 六、结论（更新）

1. **热门英文网文不能内置**：Royal Road 站规禁止复制/爬取，多数作者保留全部权利，同人连授权资格都没有 → 走"推荐 + 官方外链"。
2. **能做的是**：推荐清单 + 官方外链（方案 A）；用户自行导入走已有「导入书籍」（方案 B，已实现）。
3. **能内置的是**：SCP 基金会（BY-SA，最推荐）、Standard Ebooks（CC0）、Doctorow 小说（BY-NC-SA，须非商业）、Watts（变体待确认）。
4. 落地时守住四条：**署名 + 同协议共享**（BY-SA）、**保持非商业**（BY-NC）、**不抓图**（图片政策）、**不打包封面**（出版社权利）。
5. **进度量纲问题已于本轮修复并真机验证**：`ReaderProgress` 增加 `total`/`chapters`（保存时一并写），
   小说模式按章算、翻页模式按保存时的总页数算，都夹到 0-100。真机结果 1663%→**2%**、521%→**9%**、484%→**20%**、153%→**1%**，
   标签也从「第98页」变成「第 33 章」。守卫见 `npm run verify:books-meta`（180 断言）。
   ⚠️ 仍然存在的口径差异：`/books/index.json` 的 `chapters` 与**阅读器自己切出的章数不一致**
   （弗兰肯斯坦 index=29 而阅读器 chapter 已到 32；爱丽丝 index=13 而 perChapter 出现 key "55"）——
   老记录没有 `chapters` 时会回落到 index 的数字，因此弗兰肯斯坦这条老数据仍显示 100%（重新打开一次书就会写入正确章数并自愈）。
   **要彻底解决应查明 dump-book-texts.cjs 的切章逻辑与阅读器为何不同。**

---

## 八、SCP 落地状态（已完成）

- 抓取脚本：`scripts/fetch-scp.cjs` → 生成 `src/data/scp.ts`（**勿手改**）。对站点约 1 req/s，只取文本不取图。
- 已收录 **20 篇 / 约 27.6k 词**，App 内新增「SCP 基金会」tab：顶部展示 CC BY-SA 3.0 许可声明与来源链接，
  每张卡片展示「作者：… · N 词」与「原文」外链，点卡片用现有阅读器阅读（分页 / 朗读 / 翻译 / 查词全部复用）。
- **署名实测**：14/20 篇能从页面抽到作者（如 thattallfellow、StaticFactory、Mortos），
  其余 6 篇页面 HTML 里本就没有作者信息 → 退回「SCP Wiki 社区」+ 精确原文链接，**不编造**。
  曾误抓 `scp-2317 → SCP-166`（那是另一个条目的交叉引用），已加「候选以 SCP-编号开头则丢弃」的校验。
- 图片授权信息块（`Filename: xxx.jpg Author: … License: …`）会漏进正文，已过滤；
  产物内 `<img>` / 图片 URL / 站内噪声均为 0。
- 合规守卫：`npm run verify:books-meta` 的 ⑥ 段断言「每篇都有署名 + 标注 CC BY-SA 3.0 + 带精确原文链接 +
  产物不含图片 + 无站内噪声」。