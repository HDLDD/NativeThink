# NativeThink Project Skill

> 项目：NativeThink 母语思维英语训练
> 部署：Cloudflare Pages (`nativethink.pages.dev`)
> 框架：React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + Vite

---

## 常用命令

```bash
# 开发
npm run dev              # 启动 Vite dev server

# 构建 & 部署
npx vite build           # 生产构建 → dist/client/
git push                 # 推送 → Cloudflare Pages 自动部署

# 类型检查
npx tsc --noEmit         # TypeScript 类型检查（可能因 tsconfig 报错）

# 清理
git checkout -- <file>   # 撤销单个文件的修改
```

---

## 项目架构

```
src/
├── app.tsx              # 路由定义（React.lazy 懒加载所有页面）
├── index.tsx            # 入口：SafeShell → App → ErrorBoundary
├── pages/
│   ├── ArticlePage/     # 文章阅读（书籍/刊物/AI/演讲/Wikipedia）
│   │   └── components/PageReader.tsx  # 全屏阅读器
│   ├── ChunkTrainingPage/  # 语块训练
│   ├── DeepVocabularyPage/ # 词汇深度（学习/复习/浏览/搭配）
│   │   └── components/
│   │       ├── DailyLearningMode.tsx  # 6种学习模式
│   │       ├── FlashcardMode.tsx      # SM-2复习
│   │       └── CollocationsTab.tsx    # 搭配学习
│   ├── ConversationPage/  # AI对话
│   ├── ShadowingPage/     # 影子跟读
│   ├── ThinkInEnglishPage/# 母语思维
│   ├── WritingPage/       # AI写作
│   ├── ProgressPage/      # 学习记录
│   └── DashboardPage/     # 首页仪表盘
├── components/
│   ├── Header.tsx        # 顶部导航栏
│   ├── AppSidebar.tsx    # 侧边栏
│   ├── MobileBottomNav.tsx # 移动端底部导航
│   └── ui/               # shadcn/ui 组件
├── lib/
│   ├── use-tts.ts        # TTS 多引擎朗读
│   ├── use-word-learning.ts # SM-2 词汇学习
│   ├── safe-storage.ts   # 带前缀的 localStorage
│   ├── utils.ts          # cn, cleanText, extractJson
│   └── use-favorites.ts  # 收藏
├── data/
│   ├── wordbank/         # 词库（按等级动态导入）
│   ├── reading.ts        # 阅读内容类型 + buildPages
│   ├── chunks.ts         # 语块数据
│   ├── books.ts          # 书籍数据
│   └── speeches.ts       # 演讲数据
└── hooks/
    └── use-ai.ts         # AI API 调用
```

---

## 高频开发模式

### 1. 双列布局（左列表 + 右详情）

```tsx
<div className="grid grid-cols-12 gap-6">
  {/* 左列：列表 */}
  <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-40 self-start">
    <Card className="rounded-[32px]">
      <CardHeader>...</CardHeader>
      <CardContent>
        {/* 列表项 + 分页 */}
      </CardContent>
    </Card>
  </div>
  {/* 右列：详情 */}
  <div className="col-span-12 lg:col-span-7">
    <Card className="rounded-[32px] lg:sticky lg:top-40">
      {/* 详情内容 */}
    </Card>
  </div>
</div>
```

**使用场景**：词库浏览、搭配学习、语块库

### 2. 列表位置记忆（刷新恢复）

```tsx
const listRef = useRef<HTMLDivElement>(null);
const MEMORY_KEY = '__nativethink_xxx_memory';

// 恢复滚动位置
useEffect(() => {
  const saved = localStorage.getItem(MEMORY_KEY);
  if (saved && listRef.current) {
    requestAnimationFrame(() => { listRef.current!.scrollTop = parseInt(saved, 10); });
  }
}, [dataLoaded]);

// 保存滚动位置
const handleScroll = () => {
  if (listRef.current) {
    localStorage.setItem(MEMORY_KEY, String(listRef.current.scrollTop));
  }
};

// JSX
<div ref={listRef} onScroll={handleScroll} className="overflow-y-auto">...</div>
```

### 3. 记忆功能（已记/未记筛选）

```tsx
const MEM_KEY = '__nativethink_xxx_memorized';
const [memorized, setMemorized] = useState<Set<string>>(() => {
  try { const r = localStorage.getItem(MEM_KEY); return r ? new Set(JSON.parse(r)) : new Set(); }
  catch { return new Set(); }
});

const toggleMemorized = (key: string) => {
  setMemorized(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    localStorage.setItem(MEM_KEY, JSON.stringify([...next]));
    return next;
  });
};
```

### 4. 自动朗读列表

```tsx
const [autoPlaying, setAutoPlaying] = useState(false);
const [autoIdx, setAutoIdx] = useState(0);
const timerRef = useRef<ReturnType<typeof setTimeout>>();

const stop = () => { setAutoPlaying(false); clearTimeout(timerRef.current); };
const start = () => { setAutoPlaying(true); setAutoIdx(0); };

useEffect(() => {
  if (!autoPlaying || autoIdx >= items.length) { stop(); return; }
  tts.speak(items[autoIdx].text, { rate: 0.85 });
  timerRef.current = setTimeout(() => setAutoIdx(p => p + 1), 2500);
  return () => clearTimeout(timerRef.current);
}, [autoPlaying, autoIdx]);
```

### 5. AI 对话调用

```tsx
const { isConfigured, chat: aiChat } = useAI();

const result = await aiChat([
  { role: 'system', content: 'You are an English teacher...' },
  { role: 'user', content: 'User message...' },
], { temperature: 0.7, maxTokens: 2048 });

// JSON 提取
const m = result.match(/\{[\s\S]*\}/);
if (m) {
  const parsed = JSON.parse(m[0]);
}
```

---

## 常见 Bug 及修复

### TDZ（Temporal Dead Zone）错误

**症状**：`ReferenceError: Cannot access 'X' before initialization`

**原因**：`const` 变量在声明前被 `useCallback`/`useEffect` 的依赖数组或闭包引用。

**修复**：将引用该变量的 hooks/代码移至变量声明**之后**。

### safeStorage 前缀问题

**症状**：记忆数据刷新后丢失

**原因**：`safeStorage` 使用动态前缀 `__miaoda_${appId}_${userId}__:`，登录/登出后前缀变化。

**修复**：用户数据（记忆/进度）改用原生 `localStorage`，避免前缀变化。

### TTS 朗读断断续续

**症状**：段落朗读跳过/卡顿

**原因**：
- `onEnd` 在部分浏览器不触发 → 只用超时兜底
- `onEnd` 和超时**同时触发** → `playNextParagraph` 被调用两次

**修复**：使用 `advancedRef` 防双重触发，仅超时驱动播放。拆分长段落为句子。

### 维基百科/CORS 加载失败

**症状**：Wikipedia API 请求被拦截

**原因**：国内网络限制

**修复**：添加 `origin=*` 参数，使用 `signal: AbortSignal.timeout(10000)` 超时处理。

### React hooks 条件渲染问题

**症状**：`Rendered fewer hooks than expected`

**原因**：条件渲染块内 hooks 数量不一致

**修复**：用 `{condition && (<Component />)}` 包裹整个子组件树，所有 hooks 在条件块内一起渲染或不渲染。

---

## 样式速查

| 用途 | 类名 |
|------|------|
| 圆角卡片 | `rounded-[28px]` `rounded-[32px]` `rounded-[40px]` |
| 主色调 | `#00B894` (绿色) `#6C5CE7` (紫色) `#F59E0B` (琥珀色) |
| 按钮 | `rounded-2xl` `bg-muted` `hover:bg-muted/80` |
| 渐变标题 | `bg-gradient-to-r from-emerald-50 to-teal-50` |
| 字体 | `font-black` (标题) `font-bold` (按钮) `font-medium` (正文) |
| 文字大小 | `text-[10px]` `text-xs` `text-sm` |
| Sticky | `lg:sticky lg:top-40` |
| 双列 | `grid grid-cols-12 gap-6` |

---

## 故障排查流程

1. `npx vite build` → 确认无编译错误
2. 检查 git status → 是否有未提交的 linter 变更
3. 检查变量声明顺序 → `const` 是否在被引用之前声明
4. 检查 localStorage 键名 → 是否用 `safeStorage`（会加前缀）
5. 检查 TTS 引擎 → `use-tts.ts` 多引擎降级
6. 检查 API 调用 → 是否有 CORS/网络限制
