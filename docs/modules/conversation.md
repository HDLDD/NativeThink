# 对话练习（`/conversation`）

> 模块 key `conversation`，`src/pages/ConversationPage/ConversationPage.tsx`（1079 行）。无 tab：场景选择页 ↔ 聊天页两段视图。

## 1. 功能

选场景 → AI 先开口 → 自由对话（逐句可翻译）→ 结束生成表现分析 → 历史可继续或删除。内置场景 + 用户自建场景合并展示。

| 视图 | 位置 |
|------|------|
| 场景选择页 | `!selectedScenario` 时渲染（`:566`），内置 + 自定义合并列表 `:634` |
| 聊天页 | 选中场景后 |
| 创建场景 | `:462` |

内置 `SCENARIOS` **只有 4 条，手写、不来自 `src/data/`**（`:86-123`）；自定义场景来自 `useCustomScenarios`（键 `__nativethink_custom_scenarios`）。

## 2. 实现方法

| 能力 | 位置 | 说明 |
|------|------|------|
| AI 先开口 `requestOpening` | `:190`，`aiStream` `:200` | 失败提示 `:221` |
| 发消息 | `:238`，`aiStream` `:269` | |
| 逐句翻译 | `:432`，`aiChat` `:443` | 纯文本，`:450` 判空 ✅ |
| 结束分析 | `:320`，`aiStream` `:339` | 空 → 关弹窗 + 提示 `:417` |
| 继续 / 删除历史 | `:539` / `:558` | |
| 无 Key 降级 | 平台插件 `:289/:400` | `getCapabilityClient()` 可能返回 `null` |

**全部 AI 输出都是 Markdown 纯文本，本页不解析 JSON** —— 所以它没有 `extractJson` 相关问题。

存储 `__nativethink_conversation_history`：`:76` 读、`:80` 装载、`:525/:561` 写，**每场景只留 1 条、最多 20 个场景、每条只留最后 100 消息**（`:519/:524`），800ms 防抖（`:507`）。页面记忆 `usePageMemory('conv-auto-read')`（`:148`）。

朗读：`autoRead` 开则开场白自动读（`:222`，默认语速），回复读**末 500 字符**、rate **0.95**（`:313-315`）；手动喇叭 `:990`。**未接** `__nativethink_vocab_autospeak`。

学习时长：只有 `:260` 一处 `creditOnce('conversation', creditKey('send', selectedScenario?.name, text))`，仍在 `await` 之前 —— 记的是"发了一句"这个动作，AI 回复失败不撤销它（与思维训练同口径）；闸门让**同一场景同一句话只记一次**，重发不再刷时长（`src/lib/study-credit.ts`，守卫 `npm run verify:study-credit`）。

## 3. 注意事项

1. ~~**`mountedRef` 在开发环境会把流式内容全部丢掉**~~（**已修 2026-09-30**：effect 体内显式 `mountedRef.current = true`）。原形态留档备查：

   ```
   :151  const mountedRef = useRef(true);
   :152  useEffect(() => { return () => { mountedRef.current = false; abortRef.current?.abort(); }; }, []);
   ```

   cleanup 置 false，**但没有任何地方在重新挂载时置回 true**（`useRef(true)` 只在首帧初始化）。`src/index.tsx:86` 开着 `<StrictMode>`，开发下 effect 是「mount → cleanup → mount」，于是第二次挂载之后 `mountedRef.current` 恒为 false，而 `:214/:281/:393` 都是 `if (!mountedRef.current) break;` → **对话页永远空白，且不报错**。生产构建不受影响（StrictMode 双调用是 dev-only）。
   修法是 effect 体内 `mountedRef.current = true`。这正是 AGENTS.md 坑表「ref 不随组件重挂载归零」的教科书案例 —— 也说明**用 dev 环境的现象去推断线上行为会得出错误结论**。
2. **`handleSend`（`:251`）与 `endConversation`（`:329`）共用同一个 `abortRef`**：并发时旧 controller 的句柄被覆盖，**上一路流再也取消不了**。`startScenario` 那条路已经正确打断（`:178-180`）✅，另两条没有。
3. **`startScenario`（`:186`）调用 `requestOpening`（`:190`）在其定义之前** —— 靠运行时顺序成立（函数声明提升 + 闭包）。把 `requestOpening` 改成 `const` 箭头函数就会立刻炸成 TDZ（AGENTS.md 第一条坑）。
4. **只有 `:260` 一处记时长**，其余动作（读历史、翻译、结束分析）不计 —— 用户聊很久但进度环只涨一点点是现状，不是 bug，但用户会报。
5. **每场景只保留 1 条历史**（`:519`）：同一场景开第二轮对话会**覆盖**上一轮。用户说"我之前的对话没了"就是这个。
6. **内置场景只有 4 条**：想扩场景请走 `useCustomScenarios`（页内创建），不要往 `:86-123` 的硬编码数组里塞 —— 那个数组在页面文件里，加内容等于给这个 1079 行文件继续加长。
7. **无守卫**：本页没有任何 `verify-*.mjs` 覆盖。
