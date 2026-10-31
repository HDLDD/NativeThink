# 对话练习（`/conversation`）

> 模块 key `conversation`，`src/pages/ConversationPage/ConversationPage.tsx`（~1200 行）。无 tab：场景选择页 ↔ 聊天页两段视图。

## 1. 功能

选场景 → AI 先开口 → 自由对话（逐句可翻译 + AI 建议回复 chips）→ 结束生成表现分析 → 历史可继续或删除。内置场景 13 条 + 用户自建场景合并展示；场景带难度标签（日常/进阶）和场景关键词（keyPhrases），聊天空态时展示为可点击的学习提示。

| 视图 | 位置 |
|------|------|
| 场景选择页 | `!selectedScenario` 时渲染，内置 + 自定义合并列表 |
| 聊天页 | 选中场景后 |
| 创建场景 | 页内 Dialog |

内置 `SCENARIOS` 13 条手写（咖啡店/面试/聊天/辩论/购物/酒店/餐厅/打车/派对/看病/机场/电话/客服），每个带 `difficulty`（日常/进阶）和 `keyPhrases`（3 条场景关键词）。自定义场景来自 `useCustomScenarios`（难度可选，没有就不显示标签）。

## 2. 实现方法

| 能力 | 位置 | 说明 |
|------|------|------|
| AI 先开口 `requestOpening` | `aiStream` | system prompt 由 `buildSystemPrompt()` 构造（含建议回复规则 + keyPhrases） |
| 发消息 | `aiStream` | 流式回复完成后 `parseSuggestions()` 从末尾分离建议 |
| **AI 建议回复** | `parseSuggestions()` + state `suggestions` | AI 在回复末尾按 `---SUGGEST---` 分隔符附 2-3 条英文建议；解析后渲染成可点击 chip，填入输入框 |
| **场景关键词** | `keyPhrases` | 聊天空态时显示 3 条场景关键词按钮，一键填入 |
| 逐句翻译 | `aiChat` | 纯文本，判空 ✅ |
| 结束分析 | `aiStream` | 空 → 关弹窗 + 提示 |
| 继续 / 删除历史 | | |
| 无 Key 降级 | 平台插件 | `getCapabilityClient()` 可能返回 `null` |

**全部 AI 输出都是 Markdown 纯文本，本页不解析 JSON** —— 所以它没有 `extractJson` 相关问题。`parseSuggestions` 用简单的分隔符解析（`---SUGGEST---`），AI 不跟格式时回退到完整正文 + 无建议（`suggestions=[]`），UI 自动切回「卡住了？」提示。

**system prompt 构造**：`buildSystemPrompt(scenario)` 返回角色设定 + 5 条通用规则（英语、简短、入戏、纠错格式 `💡`、建议回复格式）+ 可选第 6 条（场景关键词）。老 prompt 内联在 `requestOpening`/`handleSend` 里的写法已收拢到这个函数。

存储 `__nativethink_conversation_history`：读、装载、写（`persistText`），**每场景只留 1 条、最多 20 个场景、每条只留最后 100 消息**，800ms 防抖。页面记忆 `usePageMemory('conv-auto-read')`，场景筛选 `usePageMemory('conv-scenario-filter')`。

场景选择页有搜索（名称/描述）与类型筛选（全部场景 / 日常 / 进阶 / 自定义），显示 `x/总数`；筛选跨刷新保留，空结果可清除。已有历史的场景卡标「有记录」。

学习时长：`creditOnce('conversation', creditKey('send', selectedScenario?.name, text))`，仍在 `await` 之前。

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
6. **内置场景扩到 13 条；新增场景必须三处同步**：`SCENARIOS` 里加对象、`useCustomScenarios.ts` 的 `IconName` + `ICON_OPTIONS` 加图标名、`ConversationPage` 的 `ICON_MAP` 加组件映射。只加 `SCENARIOS` 时选择页能显示，但历史保存会按 `ICON_MAP` 反查图标名，新增图标不在表里 → 恢复时静默掉回 `MessageCircle`。2026-10-30 的购物/酒店/餐厅/打车/派对/看病/机场/电话/客服九条已补齐三处。想扩更多场景仍优先走 `useCustomScenarios`（页内创建），避免继续加长页面文件。
7. **无守卫**：本页没有任何 `verify-*.mjs` 覆盖。
