# 英文小说候选清单（Gutenberg）

> 用途：为「文章 → 书籍」扩充书库。所有 id 都用**拉取真实正文识别**的方式核验过
> （请求 `https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt` 并读其中的 `Title:` 行），
> 不是凭记忆填的 —— 下面「猜错过」一节记录了我猜错却被正文否证的几个。

---

## 一、先说一个已修的隐患

`scripts/generate-books.ts` 的 `BOOKS` 数组声明 id→书名/作者，实际正文由 Gutenberg 按 id 拉。
**两者曾漂移 3 条**，也就是说：改之前重跑一次生成器，会静默写出错的书名/作者/中文名/topic。

| id | 生成器原声明 | 按 id 拉到的真实正文 | 真实 Gutenberg |
|---|---|---|---|
| 244 | The Time Machine / H.G. Wells / 时间机器 | **A Study in Scarlet** | 244 = 血字的研究（The Time Machine = **35**） |
| 3300 | The Republic / Plato / 理想国 | **The Wealth of Nations** | 3300 = 国富论（The Republic = **1497**） |
| 3600 | The Wealth of Nations / Adam Smith | **Essays of Michel de Montaigne** | 3600 = 蒙田随笔 |

连带问题：`difficulty` 由 `topic` 派生（`philosophy|science → advanced`），而 topic 也照抄了错的
——`BOOK_3300` 被标成 `philosophy`（应为 business）、`BOOK_3600` 被标成 `business`（应为 philosophy）。
两侧已一并修正，并由 `npm run verify:books-meta` 钉住（167 断言，含覆盖度自检与历史锚点）。

**结论**：以后改动书单，跑 `npm run verify:books-meta`；它会拦住"生成器与数据漂移"。

---

## 二、推荐优先加入（短 / 易 / 高兴趣，适合学习者）

| id | 书名 | 作者 | 备注 |
|---|---|---|---|
| 55 | The Wonderful Wizard of Oz | L. Frank Baum | 约 4.2 万词，句式最简单，最适合入门长篇 |
| 46 | A Christmas Carol | Charles Dickens | 约 2.8 万词，狄更斯里最好读的 |
| 35 | The Time Machine | H.G. Wells | 约 3.2 万词（被误标成 244 的那本，真身在这里） |
| 215 | The Call of the Wild | Jack London | 约 3.2 万词，叙事直白 |
| 1952 | The Yellow Wallpaper | Charlotte Perkins Gilman | 约 6 千词短篇，一次读完，适合精读 |
| 16 | Peter Pan | J.M. Barrie | 约 4.7 万词，儿童文学，词汇友好 |
| 17396 | The Secret Garden | Frances Hodgson Burnett | 约 8 万词，儿童文学（注意 113 是同一本的另一个版本） |
| 74 | The Adventures of Tom Sawyer | Mark Twain | 约 7.5 万词，口语化（方言拼写偏多） |
| 120 | Treasure Island | R.L. Stevenson | 约 6.8 万词，冒险叙事 |
| 2852 | The Hound of the Baskervilles | Arthur Conan Doyle | 约 6 万词，推理，篇幅适中 |
| 863 | The Mysterious Affair at Styles | Agatha Christie | 约 6 万词，波洛首案，已进公版 |
| 236 | The Jungle Book | Rudyard Kipling | 约 5.5 万词，短篇集 |
| 33 | The Scarlet Letter | Nathaniel Hawthorne | 约 6.3 万词，文学课常见 |
| 209 | The Turn of the Screw | Henry James | 约 4.2 万词中篇，心理惊悚 |
| 175 | The Phantom of the Opera | Gaston Leroux | 约 8 万词 |
| 64317 | The Great Gatsby | F. Scott Fitzgerald | 约 4.7 万词，2021 起在美国进入公有领域 |
| 1497 | The Republic | Plato | 被误标成 3300 的那本，真身在这里 |
| 45 | Anne of Green Gables | L.M. Montgomery | 约 10 万词 |
| 1155 | The Secret Adversary | Agatha Christie | 约 7 万词 |
| 2591 | Grimms' Fairy Tales | Brothers Grimm | 短篇集，可做分级读物 |

## 三、进阶/类型补充（较长或较难）

| id | 书名 | 作者 | 备注 |
|---|---|---|---|
| 161 | Sense and Sensibility | Jane Austen | 约 12 万词 |
| 158 | Emma | Jane Austen | 约 16 万词 |
| 910 | White Fang | Jack London | 约 8 万词 |
| 205 | Walden | Henry David Thoreau | 随笔，词汇偏难 |
| 1080 | A Modest Proposal | Jonathan Swift | 短篇讽刺 |
| 1998 | Thus Spake Zarathustra | Friedrich Nietzsche | 哲学，难度高 |
| 2542 | A Doll's House | Henrik Ibsen | 剧本 |
| 1513 / 1533 | Romeo and Juliet / Macbeth | William Shakespeare | 剧本，古英语用法多 |
| 1727 / 6130 | The Odyssey / The Iliad | Homer | 史诗（英译） |

## 四、我猜错过、被正文否证的（别再用这些 id 配这些书名）

| id | 我的猜测 | 实际 |
|---|---|---|
| 61262 | The Mysterious Affair at Styles | **Poirot Investigates**（Styles 是 863） |
| 2680 | The Phantom of the Opera | **Meditations**（《沉思录》的另一个译本；Phantom 是 175） |
| 4217 | The Trial（Kafka） | **A Portrait of the Artist as a Young Man** |
| 2925 | — | 一篇生物学讲演，不适合书库 |
| 784 | — | Boyhood in Norway，不适合 |

---

## 五、加入方式与代价

1. 在 `scripts/generate-books.ts` 的 `BOOKS` 数组加条目（`id / title / zhTitle / author / zhAuthor / topic`）。
2. 跑生成器（需要能访问 gutenberg.org）：
   ```powershell
   NODE_OPTIONS="--use-system-ca" npx -y tsx scripts/generate-books.ts
   ```
3. **必须**跑守卫确认没漂：`npm run verify:books-meta`
4. `npm run build:web` —— `src/data/books.ts` 现在是 635KB / 22 本；每加一本正文都会直接进这个
   chunk（构建产物里 books 约 623KB）。**加书前先算体积**：若一次加 20 本，该 chunk 会翻倍。
   书目是懒加载 chunk，不影响首屏，但手机端下载/解析会变慢。
5. 中文翻译是客户端首次阅读时 AI 生成并缓存，生成器只写空 `zh`，所以加书不需要预先翻译。

## 六、注意事项

- 生成器里的 `// 22 Gutenberg Books` 注释与「same as GUTENBERG_BOOKS in ArticlePage」也已过时：
  `ArticlePage` 里已无 `GUTENBERG_BOOKS`，书单唯一来源是 `books.ts` 的 `ALL_BOOKS`。
- 本机到 `gutendex.com` 经常超时，但 `www.gutenberg.org` 的 `cache/epub/<id>/pg<id>.txt` 稳定可拉 ——
  核验 id 用后者。
- 公有领域状态按美国法域判断（Gatsby 2021、Christie 部分作品近年才进入）。若面向其他法域需另行确认。
