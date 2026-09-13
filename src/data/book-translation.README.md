# book-translation — 书籍批量对照翻译引擎

纯数据层模块（无 UI）。解决"逐段 AI 翻译太慢、无法翻整本书"的痛点：
**按章组织任务，把同一章 3-5 个连续段落合并进一次 AI 请求**（编号 + 严格 JSON 回填），
整章 40 段只需约 8-13 次请求（原来要 40 次）；章节译文落 IndexedDB 断点续传，
支持随时中止、进度回调、限流退避与失败跳过。

## 导出 API

```ts
// 章节切分
export function splitChapters(book: Pick<IReadingContent, 'pages'>): IBookChapter[]

// 整书翻译队列
export async function translateBook(
  book: IReadingContent,
  opts?: {
    batchSize?: number;        // 每批合并的连续段落数，建议 3-5，默认 4
    concurrency?: number;      // 章内并发请求数，默认 2（章与章之间始终串行）
    signal?: AbortSignal;      // 随时中止；已落盘进度保留
    onProgress?: (p: ITranslateProgress) => void;
    retryDelaysMs?: number[];  // 失败退避间隔，默认 [3000, 8000, 15000]
  },
): Promise<ITranslateBookResult>
// ITranslateProgress: { chapterIdx, chapterTitle, segDone, segTotal, chaptersDone, chaptersTotal }
//   （segDone/segTotal 为当前章口径；chaptersDone/chaptersTotal 为全书口径）
// ITranslateBookResult: { completed, translated, failed, chaptersDone, chaptersTotal }
//   completed=false 表示被中止（不抛错）；同书重复启动会抛错（单飞守卫）

// 查询接口
export async function getCachedBookTranslation(bookId: string): Promise<Record<number, string[]>>
export async function getChapterTranslation(bookId: string, chapterIdx: number): Promise<string[] | null>
export async function clearBookTranslation(bookId: string): Promise<void>
export async function getBookTranslationStats(bookId: string, book?: IReadingContent): Promise<{
  translatedChapters: number;
  totalChapters: number | null;   // 优先按传入 book 实时切分；否则用上次翻译记录；均无为 null
  translatedSegments: number;     // 只统计可翻译（非空）段
  totalSegments: number | null;
}>

// 测试/调试辅助
export function parseBatchTranslation(raw: string, expectedCount: number): Map<number, string>

// 类型
export type { IBookChapter, ITranslateProgress, ITranslateBookOptions, ITranslateBookResult, IBookTranslationStats }
```

## IndexedDB 存储结构

复用 `src/lib/idb.ts` 的 KV store（`nativethink-wordbank` 库，`wordbank` store）：

| key | value | 说明 |
|---|---|---|
| `booktrans-<bookId>-ch<chapterIdx>` | `string[]` | 该章**非标题段**的中文译文数组，**下标 = `splitChapters` 输出的该章段落顺序**；`''` 表示该段待补翻（失败或空段占位） |
| `booktrans-<bookId>-index` | `{ chapters: number[], chapterCount: number, updatedAt: number }` | 章节清单（IDB 无法枚举 key，用清单登记已写章节）；每次章节落盘时同步更新 |

断点续传粒度为"批"：每完成一个合并批次即写盘。再次运行 `translateBook` 自动跳过
已完成章节/段落，只补缺失段；书内容升级导致章节变长时按新长度对齐（多截少补）。

## 翻译流程

```
translateBook(book)
 └─ splitChapters(book)                        # 按 ##CHAPTER## 切章，标题段不算翻译对象
     └─ 逐章串行：
         1. 读缓存 → 对齐段数 → 算出缺失段下标
         2. 缺失段按"连续段"分组切成 ≤batchSize 的批次
         3. concurrency(2) 个 worker 消费批次队列：
              合并请求（编号 prompt → 严格 JSON 回填，带退避重试）
                ├─ 全部命中 → 回填、写盘、上报进度
                ├─ JSON 可解析但缺个别段 → 只对缺失段逐段补翻
                ├─ 请求失败/JSON 不可解析 → 整批退化为逐段翻译
                └─ 逐段仍失败（退避 3s/8s/15s 后）→ 留空跳过并计入 failed
         4. 章完成 → chaptersDone++ → 下一章
```

## 合并批量的 Prompt 设计

- **system**（中文指令）：文学翻译角色 + 四条硬性要求——
  1. 译文编号与输入 `[1] [2] …` 严格一一对应，不增不减不换序；
  2. 自然流畅、避免翻译腔，人名可保留英文；
  3. 去掉原文斜体标记（成对下划线 `_..._`）；
  4. **只输出严格 JSON** `{"t":[{"i":1,"zh":"…"},{"i":2,"zh":"…"}]}`，无解释/注释/代码栅栏。
- **user**：同一章连续段落按 `[n] 段落原文` 编号拼接（每段截断 1500 字符，与 PageReader 口径一致）。
- 解析容错（`parseBatchTranslation`）：剥 markdown 栅栏 → 截取 `{…}`/`[…]` 主体 →
  兼容 `{"t":[{i,zh}]}` / `[{i,zh}]` / `["译文",…]` / `{"1":"译文"}` 四种返回形态 →
  剥模型回显的 `[n]` 前缀 → 越界/空译文丢弃；完全解析失败返回空 Map 触发逐段兜底。
- 参数：`temperature 0.3`；批量 `maxTokens 4096`，逐段兜底 `maxTokens 1024`。
- AI 调用走 `@/services/ai-service` 的 `chat`（动态 import，出厂免费 Key 自动生效）。

## 错误处理策略

| 场景 | 行为 |
|---|---|
| 请求失败（网络/429 等） | 按 `retryDelaysMs`（默认 3s→8s→15s）退避重试，全部失败进入降级 |
| JSON 不可解析 | **不等待**，整批立即退化为逐段翻译 |
| 批量结果缺个别段 | 只对缺失段逐段补翻 |
| 逐段仍失败 | 译文留空（`''`）、计入 `failed`，继续后续段落；再次运行自动补翻 |
| 用户中止（signal） | 请求与退避等待立即中断，已完成批次已落盘；`translateBook` 静默返回 `completed=false` |
| 同一本书重复启动 | 抛错（模块级单飞守卫），防止重复消耗额度 |

## 与 PageReader 对接（回填对照译文）

`splitChapters` 定义了全书"非标题段顺序"（含空段占位以保证下标严格对齐）：

```ts
import { splitChapters, getCachedBookTranslation } from '@/data/book-translation';

const chapters = splitChapters(book);                       // 章节顺序 = 段落流顺序
const cached = await getCachedBookTranslation(book.id);     // { [chapterIdx]: string[] }
// 遍历 pages 段落流：遇 ##CHAPTER## 段 chIdx++ 且 segIdx 归零；
// 其余段按 segIdx++ 从 cached[chIdx][segIdx] 取译文回填 p.zh
```

## 最小自测说明（勿大规模调用，消耗额度）

浏览器控制台（dev server 下）：

```js
// 1) 纯本地逻辑，零额度：章节切分
const bt = await import('/src/data/book-translation.ts');
const { ALL_BOOKS } = await import('/src/data/books.ts');
bt.splitChapters(ALL_BOOKS[0]).map((c) => `${c.index}: ${c.title} (${c.paragraphs.length}段)`);

// 2) 链路验证：只翻一本内置压缩版书（约十几章、几十次请求，额度消耗很小）
const book = ALL_BOOKS[0];
const res = await bt.translateBook(book, { onProgress: console.log });
await bt.getBookTranslationStats(book.id, book);

// 3) 中止/续传：跑到一半 abort，再跑一次应只补剩余部分
const ac = new AbortController(); setTimeout(() => ac.abort(), 8000);
await bt.translateBook(book, { signal: ac.signal, onProgress: console.log });
await bt.translateBook(book, { onProgress: console.log });

// 4) 清理
await bt.clearBookTranslation(book.id);
```

开发期已用 Node + stub（假 chat / 内存 IDB）完成 47 项行为断言：
章节切分、JSON 四形态解析容错、合并请求次数（13 段仅 5 请求）、断点续传只补缺失段、
解析失败逐段兜底、请求失败退避重试后跳过、中止与续传、单飞守卫、统计与清理，全部通过。
