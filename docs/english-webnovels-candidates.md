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

## 五、结论

1. **英文网文不能内置**：Royal Road 站规禁止复制/爬取，多数作者保留全部权利，同人连授权资格都没有。
2. **能做的是**：推荐清单 + 官方外链（方案 A）；用户自行导入走已有「导入书籍」（方案 B，已实现）。
3. **能内置的只有少数 CC 作品**（如 `Blindsight`），且必须守 NC（保持非商业）与 ND（与 AI 翻译冲突）的约束，并逐个打开作者页确认许可变体。
4. **动手加书之前先查 `ArticlePage.tsx:415/722` 的进度量纲问题**（页码来自保存时的分页、分母来自当前分页），否则长书进度会显示成几百个百分点。
