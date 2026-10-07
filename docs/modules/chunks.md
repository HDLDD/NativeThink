# 语块训练（`/chunks`）

> 模块 key `chunks`，`src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx` —— **全仓最大的单文件（2713 行）**。五个 tab。

## 1. 功能

| tab | TabsTrigger / Content | 玩法 |
|-----|----------------------|------|
| 语块库 library | `:1017` / `:1055` | 浏览 + 分页（`LIBRARY_PAGE_SIZE = 20`，`:95`） |
| 替换训练 replace | `/` :1836 | 四选一：把中式表达换成语块（`checkAnswer` `:631`） |
| 接龙 chain | `/` :2031 | 用指定语块造句，AI 判 PASS/FAIL（`:652`） |
| 短语 phrases | `/` :2165 | 按 A-Z 浏览 + 生成例句 |
| 复习 review | `/` :2408 | 翻转卡 + 4 档评分（`handleReviewMark` `:447`） |

`activeTab` 初始来自 `__nativethink_chunk_position.tab` 或 `usePageMemory('chunk-page')`（`:134/:137-140/:156`）。

## 2. 数据

**基库 `MOCK_CHUNKS_BASE` 748 条**（`chunks.ts` 的 `^  { id:\`c` 计数）+ **扩容库 `CHUNKS_EXTRA` 215 条**（`chunks-extra.ts`，id 前缀 `cx`）= **导出 `MOCK_CHUNKS` 963 条**（`chunks.ts:768` 合并）。

⚠️ **手改要写进 `chunks-extra.ts`**：`chunks.ts` 的主库由 `scripts/gen-chunks.mjs:124` 与 `scripts/gen-data.mjs:807` **整体 `writeFileSync` 重写** → 重跑生成脚本会覆盖手改。扩容库是独立文件、生成脚本不碰，所以**新增语块一律加到 `chunks-extra.ts`**（旧的 `chunks.ts.bak` 已删，2026-10-06）。

扩容起因（2026-10-06）：11 个分类里 **travel / study / tech / food / health / shopping / sports 七个分类一条都没有** —— 筛选器摆着却筛出空列表。此次按分类补齐真实条目（非占位假数据），并程序化与主库去重。当前分布：
`daily 471 · workplace 173 · social 79 · emotion 64 · travel 37 · tech 26 · food 25 · health 25 · study 24 · shopping 20 · sports 19`。

写 `chunks-extra.ts` 的硬约束：**字符串一律用反引号** —— 条目文本含撇号（`let's` / `I'm`），单引号会直接破坏语法（本轮踩过两次，`tsc` 报一堆 TS1005）。

合并池 `allChunks`（`:257`）= 内置 + `__nativethink_custom_chunks`。SRS 走 `src/lib/use-phrase-learning.ts`（键 `__nativethink_phrase_learning`、`__nativethink_phrase_daily_quota`，`:6-7`）。

### 2.1 闪卡 tab（2026-10-06 新增）

`components/ChunkFlashcards.tsx`，与词汇模块 `QuickCardMode` 同构：正面只显示语块/短语 → 点卡片翻面看释义+例句 → `认识 / 模糊 / 不认识` 三档（SM-2 quality 5/3/1，写进 `use-phrase-learning`，与「短语复习」tab 共享进度）。含：分类筛选、每轮数量、答错隔 4 张重排（上限 2 次，同 `vocab-session` 参数）、自动发音（共用键 `__nativethink_vocab_autospeak`）、断点续学（`__nativethink_chunk_card_session`）、键盘（空格/1/2/→/Backspace/Esc）。

⚠️ **挂载点必须包 `<LazyFramerProvider>`**（`:2510`）——组件调 `useFramerMotion()`，缺 Provider 会直接 `throw`，ErrorBoundary 把**整个语块页**换成「页面出错」，而 library tab 正常 → 表现成"切到某 tab 就白屏"。typecheck / lint 都看不见，守卫在 `verify-overlay-fit.mjs` ⑦（3 条断言，含正对照）。

### 2.2 同一短语登记了两次 → 读取层去重（2026-10-07）

主库里藏着 **12 组 content 完全相同、只有 category / 例句 / 措辞不同的条目**（例：`call the shots` 同时是 `c17`(daily) 与 `c243`(workplace)）。**不是这次扩容带来的** —— 扩容的 215 条与主库跨库零重复。三条后果都读过代码：

| 症状 | 位置 | 原因 |
|---|---|---|
| 「已记」两条视图互相矛盾 | `ChunkTrainingPage.tsx:656` 起，状态按 **id** 存 | 标了 c17，c243 看着仍未记；已记/未记筛选与计数把它当两条 |
| 一轮出两张同短语卡 | `ChunkFlashcards.tsx` 的 `buildQueue` = `shuffle(pool).slice(0,n)` | pool 不按 content 去重 |
| 断点续学恢复成另一条 | `ChunkFlashcards.tsx` 恢复用 `pool.find(c => c.content === content)` | 重复 content 永远命中第一条，而两条例句/分类不同 |

**口径：读取层去重，不删源数据**（照词库那套两层去重的惯例，见 wordbank-data.md）。删条目会让用户已记的 id 凭空失效、丢掉另一条不同的例句、并抹掉"这条也属于职场"这个事实。实现在 `src/lib/chunk-dedupe.ts`（`chunkKey` / `dedupeChunks` / `chunkSiblings` / `expandMemorized` / `toggleMemorizedGroup`），接线四处：

1. **顺序是"筛选之后、分页/洗牌之前"**（`ChunkTrainingPage.tsx:642`）—— 于是分类视图各自仍看得到自己那条，只有「全部」并成一条。这个顺序**不是随手写的**：先全局去重会让短语从第二个分类里彻底消失，守卫 `C4b` 用 10 组可判别的重复证明两种顺序不等价（963 → 951 条）。
2. 洗牌池 `uniqueChunks = useMemo(() => dedupeChunks(allChunks), [allChunks])`（`:326`），`exercisePool` 与 `chainShuffled` 都改吃它。**必须 memo**：`useStableShuffle` 依赖数组身份，内联调用等于每帧喂一个新数组，正是本页第 1 条记过的漂移坑。
3. 闪卡 `pool` 走去重（`ChunkFlashcards.tsx:90`），断点恢复因此不再歧义。
4. 已记：读入时 `expandMemorized` 把历史数据补齐成兄弟 id（`:671`），切换时 `toggleMemorizedGroup` 一次写全组（`:695`）—— 存量数据不会因这次改动而"掉标记"。

顺带修掉一处**错译**：`c659` 的 `on cloud nine` 原释义是字面直译「在九重天上」，已改为「欣喜若狂」（与 `c371` 一致）。12 组里其余 6 组释义不同但都成立（「付出额外努力」vs「做得更多」这类），属同义不同措辞，交给去重收敛显示。

守卫：`node scripts/verify-chunks-data.mjs`（34 条）—— A 段真数条目数/唯一性/字段/例句/分类能否被 UI 筛到/行闭合；B 段把 **12 组重复冻结成基线**（新增重复即红，修掉一组要显式更新基线，这是有意的摩擦）；C 段把 `chunk-dedupe` 的真函数跑在真 963 条上（含 C4b 顺序不等价、C6-C8 已记组行为、C9 恢复唯一）；D 段接线锁（含"洗牌不许再直接吃 allChunks"的反向断言，扫描前剥注释）。变异三组各红：列表退回不去重 → D1；基线少登记一组 → B1/B2/C1；`expandMemorized` 不补齐 → C6。

### 2.3 短语库详情：定高盒子盖住列表 + 不能切上下（2026-10-07 真机反馈）

容器原先写死 `style={{ height: '520px' }}`，而左右两栏在手机上**都是 `col-span-12`** —— 两行内容挤进一个定高盒子，详情那栏就溢出画在列表上面，表现成"一次只能看一个短语、列表点不动"。修法：

- 定高只给桌面：`lg:h-[520px]`（手机按内容自然高）；
- 手机侧列表自己带滚动上界：`max-h-[52vh] lg:max-h-none`（否则整页无限长，详情永远在屏幕外）；
- 窄屏选中后把详情滚进视野（`window.matchMedia('(min-width: 1024px)')` 直接 return —— 桌面两栏并排，滚它反而把列表推出屏幕）。

**上下切换**：详情头部加 `上一个 / 下一个` + `第 N/共 M` 标签（`gotoPhrase(±1)`）。导航表 `phraseNavList` 必须和列表用**同一个首字母分段判据**（A-Z 展平），否则按上下键看到的邻居和列表里的邻居不是同一个；目标落在折叠的字母段时先展开那段再 `scrollIntoView`（条目按钮带 `id="phrase-item-<id>"`）。第一条/最后一条对应按钮 `disabled`，不绕回不空跳。

顺带查出一个**永远看不到的条目**：`cx184` 的 content 是 `" RSVP"`（前导空格）。列表按 A-Z 分段，首字符不是字母就一条都渲染不出来，导航表也只有 962 条。已 trim 掉空格（现在 963 条全可达），守卫加 A13 锁"content 无前后空白且首字符是字母"。

**行为凭据**（无头 Chrome + CDP，**真实鼠标事件** —— Radix Tabs 的触发器认 pointerdown/mousedown，`element.click()` 不生效，第一版探测就栽在这）：393×851 下 14 项全过 —— 列表 136 条同屏、列表框 443px（有界）、内容 10,382px（内部可滚）、详情与列表 left/宽完全一致（41/311）且纵向重叠 0px、点「下一个」`a balanced lifestyle → a blessing in disguise` 再点「上一个」回原条、位置 `1/963`、第一条时「上一个」禁用；1280×800 下两栏并排、网格仍 520px（没退化）。守卫 `verify-chunks-data` 34 → **40**（A13 + D9-D13）。

> 未做：语块库（library）tab 的详情同样没有上下切换 —— 但它没有定高盒子，不存在"盖住列表"的问题，本次没动。

## 3. AI 调用点：9 处（8 `aiChat` + 1 `aiStream`），判空前置已全部补齐

2026-09-30 之前有 4 处缺 `!result.trim()`、其中 1 处还用贪婪正则；现在 9 处都合规，
由 `npm run verify:ai-parse` 全仓扫（含注释过滤与元判据固件）。

| 位置 | 用途 | 返回 | 判空 |
|------|------|------|------|
| `:680` | 接龙判定 | 纯文本，**要求首行 PASS/FAIL**（`:725-726` 取首行，非 FAIL 即通过） | — |
| `:229` | 例句翻译 | 纯文本 | ✅ `:236-238` |
| `:298` | 短语例句 | JSON | ✅ `:305` 判空 → `:306` `extractJson` |
| `:793` | **批量生成语块** | JSON 数组 | ✅ `:822` 判空 → `:823` `extractJson` |
| `:855` | 选项讲解 | 纯文本 | ✅ `:874` |
| `:887` | 生成例句 | JSON | ✅ `:900` 前已补判空（原先空串直接喂 `extractJson` 会抛「无法从 AI 返回中提取有效 JSON」→ 误报「AI 生成失败」） |
| `:320` | 生成语块 | JSON | ✅ 已补判空（顺带删掉了原先重复的两次 `Array.isArray` 守卫） |
| `:947` | AI 出题 | JSON 数组 | ✅ 已换 `extractJson`（原先是贪婪 `match(/[[sS]*]/)` + `JSON.parse`，空返回误报「AI 返回格式异常」） |
| `:983` | 接龙挑战 | JSON 对象 | ✅ 已补判空 |

## 4. 存储

| key | API | 上限 |
|-----|-----|------|
| `__nativethink_chunk_position` | **裸 `localStorage`**（`:139/:149`，滚动 250ms 防抖） | — |
| `__nativethink_custom_chunks` | `:253` 写，走 `persistJson` | 自建语块**不可重算 → 不裁剪**；写失败 `warnStorageFull()` |
| `__nativethink_chunk_ai_sentences` | `:267` 写；`cappedPut` 于 `:976` | **200 键 / 每键留最近 30 条**（`CHUNK_AI_SENTENCE_KEYS`/`_PER_KEY`，`:120-121`） |
| `__nativethink_example_trans` | `:275` 写；`cappedPut` 于 `:288` | **400 键**（`CHUNK_EXAMPLE_TRANS_KEYS`） |
| `__nativethink_ai_replacements` | `:308` 写 | 每次生成整体替换（`:1046`），天然有界；写失败仍提示 |
| `__nativethink_phrase_examples` | `:333` 写；`cappedPut` 于 `:371` | 每词 10 条 + **300 键**（`CHUNK_PHRASE_EXAMPLE_KEYS`） |

派生缓存用 FIFO 封顶（可重算，淘汰安全）；自建语块相反 —— **只拒绝、不裁剪**，落盘失败一律 `warnStorageFull()`。守卫 `verify-vocab-caches` ④/⑤ 钉住上限数值与接线。
| `__nativethink_chunk_review_session` | 断点（`:475/:479/:486/:495`） | — |
| `__nativethink_chunk_memorized` | `:549/:561` | — |
| `__nativethink_vocab_autospeak` | **与词汇模块共用**（`:100`，读写 `:374/:379`，`safeStorage`） | — |

`__nativethink_chunk_position` 是**裸 localStorage** → 不参与云同步（见 `storage-and-stats.md` §3.4）。

## 5. 朗读

复习正/反面自动朗读 **rate 0.85**（`:388-404`），翻开例句用 `cleanText`；library/phrases 打开详情自动读（`:279-282/:289-292`）；例句 rate 0.9（`:1548/:1793/:2603`）；前 3 张 `prewarm`（`:416-420/:440-444`）。自动发音开关与词汇共用同一个键（`:373-379`）。

学习时长：`:506` 每张卡 0.2、`:699` 替换答题 1 —— 这两处是**本地动作**，每次都涨，刻意不走闸门；`:730` 接龙 1 走 `creditOnce('chunks', creditKey('chain', chunkContent, input))`，与思维/对话同口径（按"造了一句"的动作计，同一语块同一句只记一次）。守卫 `verify:study-credit` ④ 专门钉住"本地动作不许被闸门吞掉"（M5 变异就是把它改成 creditOnce）。

## 6. 注意事项

1. **两处违反「洗牌必须用 `use-stable-shuffle`」的硬规矩**：
   - ~~`useMemo(() => generateReplacementExercises(allChunks), [allChunks])` + 内部三处 `Math.random()`~~ → **已修 2026-09-30**：新增 `exercisePool = useStableShuffle(allChunks)`，`generateReplacementExercises(shuffledChunks)` 改成**给定同一入参输出逐字相同**的纯函数（选题与顺序取自稳定序列，干扰项按固定步长取，选项位置用内容哈希旋转）。集合变化只做增量同步，正在作答的题不再被悄悄换掉。
   - ~~`suggestPhrases` 在 `useMemo` 里手写 Fisher-Yates，deps 含 `phraseState.progress` → 学一个词推荐区就跳序~~ → **已修**：改为从 `exercisePool` 过滤未学过的取前 5 条（稳定顺序，只增删不重排）。
2. **`toggleMemorized` 不许在 updater 内写 safeStorage**（现在在 `ChunkTrainingPage.tsx:686-695`，落盘走独立的 persist effect）→ StrictMode 双调用会写两遍。规则见 `capped-cache.ts:32-35`。2026-10-07 起它一次改**同短语全部 id**（见 §2.2），但仍然是"在 updater 外算好新集合再 set"。
3. ~~phrases tab 一次性铺全部 748+~~（**已修 2026-09-30，量过再改**）：headless Chrome 393×851 / DPR 3 直接落在短语库 tab 实测 **4,805 个 DOM 元素 / 797 个按钮**（默认「语块库」tab 只有 788 个元素）。现在每个字母段默认铺 6 条（`PHRASE_LETTER_PREVIEW`），重测 **1,148 元素 / 205 按钮（-76%）**，展开一段回到 1,244 —— A-Z 跳转的 25 个字母段一个不少，折叠不是删内容。守卫：`npm run verify:list-scaling` 补 8 条断言（10→18），含「字母段内不再有直接 `.map` 全量渲染」的正对照；变异实测：退回全量渲染会红 2 条。library 的分页（`:580-586`）保持不变。
4. ~~**4 处 AI 调用把「服务不可用」误报成「格式异常」**~~（**已修 2026-09-30**，见第 3 节）。守卫：`npm run verify:ai-parse` 全仓扫解析点。
5. `:947` 的 AI 出题**没走 `extractJson`**，是仓库明令禁止的贪婪正则路线（`utils.ts:34` 注释解释为什么）。
6. **接龙判定改成了三档**（2026-09-30，原第 6 条的顾虑已经有了更好的解法）：旧写法 `const passed = verdict !== 'FAIL'` 是**非 FAIL 即通过** —— 模型不守格式、返回空串、甚至 AI 服务挂了（catch 分支也 +10）都算答对，"接龙分数"实际在数提交次数。现在判定解析收在 `src/lib/chain-verdict.ts`：首行第一个字母串必须是 `PASS/FAIL` 或其常见变形（`PASSED`/`FAILING`/`✅ PASS`）才算给出结论，按整词 + 有限后缀匹配而不是前缀包含（`PASTA`/`PASSAGE`/`FAILSAFE` 都不算），**正文里出现的 PASS 一律不算判定**；`chainScoreFor` 只给 pass 档 10 分。三档行为：pass 计分并 2 秒后切下一题；fail 不计分、显示改进建议、留在原题；**unknown 不计分也不判错**，把模型原话摊开、不前进不清空输入，让用户拿同一句重来。"未判定"不等于"答错"，正是原第 6 条担心的误伤 —— 既不给假分，也不假判错。AI 挂了的 catch 分支不再送分，文案改成"句子里确实有这个语块，但 AI 没判，这次不计分"。守卫 `scripts/verify-chain-verdict.mjs`（36 断言：真跑 `parseChainVerdict`/`chainScoreFor` 的 11 个边界 + 页面接线含"旧的 `!== 'FAIL'` 不许回来"的正对照，剥注释后扫描），6 条变异全红。**行为证据**：无头 Chrome + CDP 真点 39 项（`/chunks → 接龙游戏`，Fetch 拦截假 AI 流），逐档核对页面上的「当前得分」与「第 N 个」—— PASS 才 +10 且 2 秒后切题（反馈文案要在它被清空前读）、FAIL 计分不变并展示模型建议、未判定不计分不切题**且输入框原句还在**、AI 挂了（500）由 `use-ai` 提示不可用 + 面板按"没返回内容"处理不送分，另有"每次都真的发出了请求"的正对照计数。
7. **守卫覆盖到哪一步**（2026-10-07 更新，此前这条写的是"无守卫"）：数据层 `verify-chunks-data`(34)、接龙判定 `verify-chain-verdict`(36)、列表规模 `verify-list-scaling`(18)、闪卡挂载点 `verify-overlay-fit` ⑦(3)。**仍未覆盖**：五个 tab 的交互流程（翻面/滑动/键盘/断点续学的真实点击链）与自动发音以外的朗读路径 —— 那些要靠真机或无头 Chrome 真点。
