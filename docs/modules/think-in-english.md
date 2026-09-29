# 母语思维训练（`/think`）

> 模块 key `think`，`src/pages/ThinkInEnglishPage/ThinkInEnglishPage.tsx`（1361 行）。四个 tab，每个都是「读题 → 写英文 → AI 对比反馈 → 下一题」。

## 1. 功能与数据

| tab | TabsTrigger / Content | 干什么 |
|-----|----------------------|--------|
| 中式英语检测 | `:706` / `:737` | 给中文，判断/改写成地道表达 |
| 思维转译 | `:714` / `:846` | 按英语思维重新组织句子 |
| 反翻译训练 | `:722` / `:1012` | 从中文还原英文（`type === 'backTranslation'`） |
| 还原 | `:728` / `:1189` | 结构化还原练习 |

`activeTab` 由 `usePageMemory('think-tab', 'detector')` 持有（`:51`）。

| 数据 | 实测条数 | 来源与可改性 |
|------|---------|-------------|
| `MOCK_THINK_EXERCISES`（`thinkexercises.ts`） | **200**（`^  { id:` 计数），其中 `type: 'backTranslation'` **100** | **无生成脚本** → 手写可改。页面只用 `type === 'translation'` 那 100 条（`:124`） |
| `MOCK_BACK_TRANSLATIONS`（`backtranslation.ts`） | **200** | 手写；也被句子学习的造句复用（见 `sentence-lab.md`） |
| `MOCK_NATIVE_TRANSLATES`（`nativetranslate.ts`） | **200** | 由 `scripts/add-exercises.cjs:5,198` 与 `add-more.cjs:5,96` **整体重写** → 重跑覆盖手改 |

## 2. 实现方法

- **AI**：4 处 `aiStream`（`:158/:237/:317/:444`）产出**中英双语分节的 Markdown 纯文本**，不解析 JSON；3 处 `aiChat` 出题（`:536/:581/:626`）要求单个 JSON 对象。
- **这里的空串守卫顺序是对的**（可作为其它页面的范本）：先 `if (!result.trim()) return;`（`:556/:601/:645`），再 `extractJson`（`:558/:603/:647`）。
- **洗牌用 `useStableShuffle`**（`:123-131`）✅ 符合仓库规定。
- **存储**：

| key | 说明 |
|-----|------|
| `__nativethink_practice_history` | `:62/:71/:74`，**FIFO 50**，内存去重后取 8 条展示 |
| `__nativethink_custom_translations` / `_backs` / `_natives` | `:106/:109/:112` 读，`:116-118` 写，**无上限** |
| `think-tab` | `usePageMemory` |

- **朗读**：只有手动喇叭（`:779/:980/:1093/:1156/:1321`），默认语速，**不接** `__nativethink_vocab_autospeak`。

## 3. 注意事项

1. **`addStudyMinutes(1, 'think')` 的四调用点（`:149/:228/:308/:435`）全在 `await` 之前** —— AI 失败也照记时长。用户什么都没学到，进度环却涨了。
2. **换题不 abort 正在跑的流**：`nextExercise`（`:375`）、`nextBackExercise`（`:400`）、`nextNativeExercise`（`:505`）只清 `input`/`result`，**不碰 `translationAbortRef`**；abort 只在卸载时执行（`:133-140`）。后果：**上一题的流式内容会写进下一题的结果框**。这是 AGENTS.md 坑表「换题目但旧异步回调还在跑」在本页的具体形态 —— 加任何"离开当前题"的路径都要显式 abort（对照写作页 `WritingPage.tsx:478-481` 的做法）。
3. **`recordDetectorHistory` 在 `setDetectorHistory` 的 updater 内部写 safeStorage**（`:68-77`）。`src/index.tsx:86` 开着 StrictMode，updater 被双调用 → **同一条历史写两遍**。仓库规则：副作用提到事件层，updater 保持纯（`capped-cache.ts:32-35` 注释就是这个）。
4. **三个 custom 键没有上限**（第 2 节表格），与「按条累积的缓存一律走 `capped-cache.ts`」的约定不符。
5. **`nativetranslate.ts` 手改前先看有没有跑过生成脚本**：`add-exercises.cjs` / `add-more.cjs` 是整文件 `writeFileSync`，重跑即覆盖。
6. **无守卫**：本页没有任何 `verify-*.mjs` 覆盖。
