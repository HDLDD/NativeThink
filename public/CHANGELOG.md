# NativeThink 开发日志






## 2026-07-13
- fix: 改进文章页面触摸滑动体验 (`1e0cb03`)

## 2026-07-13
- fix: 修复文章页面崩溃问题 (`e0b8302`)

## 2026-07-13
- perf: lazy-load DashboardPage + NotFoundPage, add Suspense for 404 route (`9972e11`)

## 2026-07-13
- feat: 文章换页功能手机浏览器适配 (`fa99611`)

## 2026-07-13
- perf: 多项性能优化，dist 体积减少 63% (`6fb933f`)

## 2026-07-11

### 文章阅读 Bug 修复 🐛 — 循环依赖 + TDZ 崩溃
- **TDZ ReferenceError 根因**：`aiArticles` 的 `useState` 声明在自动打开 `useEffect` 之后 → 依赖数组求值时变量尚未初始化 → `Cannot access '...' before initialization`
  - 修复方式：将 `aiArticles`/`saveAiArticle`/`deleteAiArticle` 声明移到所有 effect 之前
- **动态 import 打破循环依赖**：`PageReader` 改为 `useEffect` 内动态 `import()` 加载，避免模块初始化时的循环引用
- **连带修复**：`validPages` 统一替换 `activeContent.pages`，过滤无 `paragraphs` 的坏页
- **内容校验**：PageReader 入口 `pages?.filter(p => p && Array.isArray(p.paragraphs))` 防止空引用
- **内存清理**：PageReader 卸载时清空翻译缓存 + 重置 displayContent，帮助 GC 回收
- **TTS 安全包装**：`safeSpeak()` try/catch 包裹所有 `tts.speak()` 调用
- **ErrorBoundary 兜底**：PageReader 外层包裹错误边界，崩溃时显示"阅读器加载失败"而非白屏

### 文章阅读 📖 — 重大重构 + 功能恢复
- **PageReader 组件恢复**：基于旧版代码重写，剔除朗读后恢复完整功能
  - **点击查词**：文章内任意单词可点击 → 弹窗显示中文释义（离线词库）+ 英文释义（在线词典 API）+ 音标
  - **全文对照/译文切换**：原文 / 双语对照 / 纯译文 三种显示模式
  - **分页导航**：上/下页按钮 + 直接跳转页码 + 阅读进度自动保存
  - **AI 翻译**：逐页翻译 + 翻译全部（缓存到 localStorage 复用）
  - **等级转换**：初级/中级/高级三档 AI 改写
  - **字体调节**：小/中/大三档，适配不同屏幕
  - **收藏**：收藏单词 + 收藏整篇文章
- **朗读功能恢复**：单词发音（查词弹窗）+ 段落朗读（hover 显示按钮）+ 整页朗读（工具栏）
  - 使用单次 `tts.speak()` 调用，无复杂队列，避免旧版竞态条件导致崩溃
  - 组件卸载自动 `tts.cancel()` 清理

### 文章阅读 Bug 修复 🐛
- **崩溃修复 1**：`useEffect` 嵌套在 `deleteAiArticle` 函数内部 → 违反 React Hooks 规则 → 点击删除 AI 文章崩溃
- **崩溃修复 2**：`ChevronLeft` 图标未 import → 打开文章阅读器 `ReferenceError` 白屏
- **崩溃修复 3**：`ReaderErrorBoundary` 类组件导致 React undefined 错误 → 移除

### 登录 & 注册 🔐 — 完整修复
- **修复注册/登录 1101 错误**：后端 Functions 缺少 KV 绑定 → 增加防御性空检查 + 分步 try/catch，返回中文错误信息
- **修复 PBKDF2 迭代超限**：Cloudflare Workers 限制 PBKDF2 最多 100,000 次迭代，原代码 210,000 次导致 `hashPassword()` 抛异常 → 改为 100,000 次
- **修复 `crypto.randomUUID()` 兼容性**：添加 `typeof crypto.randomUUID === 'function'` 检查和 fallback
- **修复前端非 JSON 响应崩溃**：`api-client` 增加 15 秒超时 + non-JSON 响应安全解析（Cloudflare 错误页、HTML 404 页）
- **修复本地开发登录 404**：Vite 代理 `/api/auth`、`/api/data` 到生产环境

### 云同步 ☁️ — 完整修复
- **修复数据不可达**：`syncUp` 改用 `safeStorage.getPrefixedKey('')` 匹配 localStorage key（原 `startsWith('__nativethink_')` 永远找不到 safeStorage 前缀的数据）
- **修复写入不一致**：`syncDown` 改用 `safeStorage.setItem()` 写入（原 `localStorage.setItem` 绕过前缀）
- **修复双写失效**：原 PUT 到不存在的 `/api/data/<key>` 端点 → 改为防抖批量 POST `/api/data/sync`（3 秒合并写入）
- **接入认证生命周期**：新增 `CloudSyncProvider` 组件
  - 登录时自动 `syncDown`（拉取）→ `syncUp`（上传）
  - 每 5 分钟周期性同步
  - 切回标签页自动同步（节流 60 秒）
  - 登出时取消双写 + 清空待发送队列
- **同步数据范围**：学习进度、收藏、统计数据、每日打卡等所有 `__nativethink_*` 数据

### 词库引擎稳定性修复 🧠 — 防崩溃
- **并行加载 → 顺序加载**：`preloadAll()` 从 `Promise.all`（9 个等级同时导入，~75K 词条，内存峰值 ~200MB）→ `for...of` 逐个加载（每次仅一个等级驻留，释放后再加载下一个）
- **`getRandomWords` 蓄水池采样**：修复 `level='all'` 时复制整个 75K 数组来取 200 个随机词 → 改为索引随机选取（`seen Set`），避免 GC 压力和主线程阻塞
- **加载容错**：单个等级导入失败不再中断全部加载 → try/catch 跳过失败等级，其余继续加载
- **PBKDF2 迭代 210,000 → 100,000**：适配 Cloudflare Workers CPU 限制

### 性能优化 🚀
- **网页加载**: 全部页面 React.lazy 懒加载，主包 **2.3MB → 897KB (-61%)**
- **词库引擎**: 索引缓存 + 同步 localStorage 检查 + 后台预加载
- **搜索优化**: useDeferredValue 延迟搜索，输入不阻塞 UI

### 朗读引擎 🔊
- **多引擎架构**: SpeechSynthesis → CF Edge TTS → Google TTS
- 按句朗读 + 预加载下一句（无缝衔接）
- 超时兜底机制（onEnd 不可靠时自动推进）
- 手机端 TTS 修复

### 移动端适配 📱
- 底部 Tab 导航栏 + 响应式布局 + 移动端间距优化

### UI 改进 ✨
- 词库浏览/搭配学习/语块库统一双列布局
- 词库浏览筛选芯片 + 词数汇总
- Sticky 置顶 + 分页管理 + 自动朗读

---

## 2026-07-10

### 初始功能
- 手机版适配基础布局
- AI 双语输出 (英文 + 中文)
- Cloudflare Pages 部署支持
