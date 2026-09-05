---
name: nativethink-fix
description: |
  Automatically detect and fix recurring bugs in the NativeThink project (React 19 + Vite 8 + TypeScript SPA).
  Handles: TDZ (Temporal Dead Zone) errors, JSX sibling elements missing Fragment wrappers,
  nested <button> elements, useEffect missing finally blocks for setLoaded, useRef used when
  useState is needed for UI updates, double onClick handlers on parent+child elements,
  safeStorage migration from scopedStorage, and common build/parse errors.
  Use this skill whenever the user reports a crash, runtime error, "页面出错", build failure,
  or any bug in the NativeThink codebase.
---

# NativeThink 项目常见问题修复指南

## 项目背景

NativeThink 是 React 19 + TypeScript + Vite 8 + Tailwind CSS v4 的英语学习 SPA。
包含 AI 集成、词汇学习、语块训练、听力影子跟读等功能模块。
部署在 GitHub Pages，使用 localStorage (safeStorage) 持久化。

## 问题模式速查表

| # | 问题类型 | 关键词 | 症状 | 修复方式 |
|---|---------|--------|------|---------|
| 1 | TDZ 错误 | ReferenceError, "Cannot access before initialization" | 页面白屏/崩溃 | 移动 const/useState 到使用之前 |
| 2 | JSX 多兄弟 | "JSX expressions must have one parent" 或构建失败 | 编译错误 | 包裹 Fragment `<>...</>` |
| 3 | Button 嵌套 | validateDOMNesting 警告 | 控制台警告 | 内层改为 `<span role="button">` |
| 4 | setLoaded 缺失 | 页面无限 loading | 页面卡在加载中 | 添加 finally 块 |
| 5 | scopedStorage | AppContainer/platform SDK 错误 | 独立运行时崩溃 | 改用 safeStorage |
| 6 | 重复 onClick | 事件触发两次 | 功能异常 | 移除子元素 onClick |
| 7 | useRef 计数 | 数值不更新 | UI 不刷新 | 改用 useState |
| 8 | AI 格式不统一 | ai_generation_chunks/phrases 无中文 | 内容不完整 | 更新 prompt 模板 |

---

## 修复步骤

### 1. TDZ (Temporal Dead Zone) 错误 — 最常见

**识别特征:**
```
ReferenceError: Cannot access 'autoPlaying' before initialization
ReferenceError: Cannot access 'filteredWords' before initialization
```

**根本原因:** `const [someState, setSomeState] = useState(...)` 声明在 `useEffect(() => { ...使用 someState... })` 之后。

**修复方法:**
```tsx
// ❌ 错误 — useEffect 在 useState 之前
useEffect(() => {
  if (autoPlaying) { ... }  // autoPlaying 还未声明!
}, []);
const [autoPlaying, setAutoPlaying] = useState(false);

// ✅ 正确 — useState 在前
const [autoPlaying, setAutoPlaying] = useState(false);
const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

useEffect(() => {
  if (autoPlaying) { ... }  // 安全
}, [autoPlaying]);
```

**经验规则:** 所有 `useState`、`useRef`、`useMemo`、`useCallback` 应该放在组件的 useEffect/事件处理函数之前。

**已知易出 TDZ 的变量名:** `filteredWords`, `tts`, `autoPlaying`, `autoPlayIdx`, `autoPlayTimerRef`, `currentIdx`, `queue`, `sessionReviewCount`

---

### 2. JSX 多兄弟元素缺少 Fragment

**识别特征:** 构建时报错，或 TypeScript 报 "JSX expressions must have one parent element"

**根本原因:** `condition && (...)` 中 return 了多个同级 JSX 元素。

**修复方法:**
```tsx
// ❌ 错误 — 两个 <div> 是兄弟元素
{tab === 'browse' && (
  <div>内容 A</div>
  <div>内容 B</div>
)}

// ✅ 正确 — 包裹在 Fragment 中
{tab === 'browse' && (
  <>
    <div>内容 A</div>
    <div>内容 B</div>
  </>
)}
```

---

### 3. Button 嵌套 (button > button)

**识别特征:** 浏览器控制台 warning: `validateDOMNesting(...): <button> cannot appear as a descendant of <button>`

**修复方法:**
```tsx
// ❌ 错误
<button className="outer">
  外层按钮
  <button className="inner">内层按钮</button>
</button>

// ✅ 正确
<button className="outer">
  外层按钮
  <span role="button" className="inner" onClick={...}>内层按钮</span>
</button>
```

---

### 4. useEffect 缺少 finally (setLoaded 未执行)

**识别特征:** 页面永远显示 loading/skeleton 状态。

**根本原因:** `setLoaded(true)` 在 try 块中，如果出错则永远不会设置为 true。

**修复方法:**
```tsx
// ❌ 错误 — catch 中没有 setLoaded
useEffect(() => {
  try {
    const data = safeStorage.getItem('key');
    setData(JSON.parse(data));
    setLoaded(true);  // 如果上面出错，这行不执行
  } catch {
    // 静默失败，但 setLoaded 没被调用!
  }
}, []);

// ✅ 正确 — 使用 finally
useEffect(() => {
  try {
    const data = safeStorage.getItem('key');
    if (data) setData(JSON.parse(data));
  } catch {
    // 使用默认值
  } finally {
    setLoaded(true);  // 始终执行
  }
}, []);
```

---

### 5. scopedStorage → safeStorage 迁移

**识别特征:** 独立运行时（Vite dev / GitHub Pages）localStorage 操作失败或数据不隔离。

**修复方法:**
```tsx
// ❌ 旧代码
import { scopedStorage } from '@lark-apaas/client-toolkit-lite';
const value = scopedStorage.getItem('my-key');

// ✅ 新代码
import { safeStorage } from '@/lib/safe-storage';
const value = safeStorage.getItem('my-key');
```

safeStorage 自动处理:
- 平台内: 使用 per-user 前缀隔离
- 平台外: 使用匿名 ID 前缀
- 自动迁移旧格式数据

---

### 6. 父子元素重复 onClick

**识别特征:** 点击一次触发两次事件。

**修复方法:**
```tsx
// ❌ 错误 — motion.div 和 Card 都有 onClick
<motion.div onClick={() => flip()}>
  <Card onClick={() => flip()}>...</Card>
</motion.div>

// ✅ 正确 — 只保留外层 onClick
<motion.div onClick={() => flip()}>
  <Card>...</Card>
</motion.div>
```

---

### 7. useRef 计数需要 UI 更新

**识别特征:** 数值变化了但页面不刷新。

**修复方法:**
```tsx
// ❌ 错误 — useRef 不触发重渲染
const sessionReviewCount = useRef(0);
// sessionReviewCount.current++ — 不会更新 UI!

// ✅ 正确 — 用 useState
const [sessionReviewCount, setSessionReviewCount] = useState(0);
// setSessionReviewCount(c => c + 1) — 会触发重渲染
```

---

### 8. AI 生成内容格式标准化

**修复方法:** 所有 AI 生成 prompt 必须包含:
- `meaning`: 中文释义
- `introduction`: 英文介绍
- `example`: 英文例句
- `exampleZh`: 例句中文翻译

```tsx
// 标准 prompt 模板
const prompt = `生成...要求JSON格式：
{
  "meaning": "中文释义",
  "introduction": "英文使用场景介绍",
  "example": "英文例句",
  "exampleZh": "例句中文翻译"
}`;
```

---

## 快速修复流程

当用户报告错误时:

1. **读取错误信息** — 确认错误类型和文件位置
2. **打开对应文件** — 使用 Read 工具查看上下文
3. **对照上表诊断** — 匹配问题模式
4. **应用对应修复** — 使用 Edit 工具做精确修改
5. **验证修复** — 运行 `npm run build` 确认编译通过

## 常用项目文件路径

- 入口: [src/index.tsx](src/index.tsx)
- Storage: [src/lib/safe-storage.ts](src/lib/safe-storage.ts)
- 词汇学习: [src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx](src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx)
- 搭配学习: [src/pages/DeepVocabularyPage/components/CollocationsTab.tsx](src/pages/DeepVocabularyPage/components/CollocationsTab.tsx)
- 闪卡模式: [src/pages/DeepVocabularyPage/components/FlashcardMode.tsx](src/pages/DeepVocabularyPage/components/FlashcardMode.tsx)
- 每日学习: [src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx](src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx)
- 语块训练: [src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx](src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx)
- 设置/进度: [src/pages/ProgressPage/ProgressPage.tsx](src/pages/ProgressPage/ProgressPage.tsx)
- 影子跟读: [src/pages/ShadowingPage/ShadowingPage.tsx](src/pages/ShadowingPage/ShadowingPage.tsx)
- 帮助引导: [src/components/HelpGuide.tsx](src/components/HelpGuide.tsx)
