# NativeThink - 母语思维英语训练 - 需求拆解文档

## 产品概述

- **产品类型**: 个人英语学习 Web 应用
- **场景类型**: <scene_type>prototype-app</scene_type>
- **目标用户**: 希望摆脱中式英语、培养母语思维的英语学习者
- **核心价值**: 通过思维训练、语块积累、对话实践等非传统方式，帮助用户建立像 native speaker 一样的英语思维和口语表达能力
- **界面语言**: 中文（学习内容为英文）
- **主题偏好**: user_specified（支持深色/浅色主题切换，蓝绿色系为主色调）
- **导航模式**: 路径导航
- **导航布局**: Sidebar（左侧导航栏 + 主内容区）

---

## 页面结构总览

| 页面名称 | 文件名 | 路由 | 页面类型 | 入口来源 |
|---------|-------|------|---------|---------|
| 首页仪表盘 | `DashboardPage.tsx` | `/` | 一级 | 导航 |
| 母语思维训练 | `ThinkInEnglishPage.tsx` | `/think` | 一级 | 导航 |
| 语块训练 | `ChunkTrainingPage.tsx` | `/chunks` | 一级 | 导航 |
| AI 对话练习 | `ConversationPage.tsx` | `/conversation` | 一级 | 导航 |
| 影子跟读 | `ShadowingPage.tsx` | `/shadowing` | 一级 | 导航 |
| 词汇深度 | `DeepVocabularyPage.tsx` | `/vocabulary` | 一级 | 导航 |
| 学习记录 | `ProgressPage.tsx` | `/progress` | 一级 | 导航 |

> **页面类型说明**：
> - **一级页面**：出现在导航中，用户可直接访问
> - **二级页面**：不在导航中，从一级页面跳转进入

---

## 页面布局建议

### 全局布局
- **布局模式**: 左侧 Sidebar 导航 + 右侧主内容区
- **视觉重心**: 主内容区（学习交互）
- **主题切换**: 顶部 Header 右侧放置主题切换按钮

### 各页面布局

**1. 首页仪表盘 (`/`)**
- **布局模式**: 卡片网格布局
- **视觉重心**: 学习数据概览 + 快速入口
- **结果承载区**: 环形进度图 + 每日一句卡片 + 连续打卡展示；初始态为 mock 示例数据

**2. 母语思维训练 (`/think`)**
- **布局模式**: Tab 切换 + 左右分栏（输入区 / 结果区）
- **视觉重心**: 分析结果与思维差异解释
- **结果承载区**: 右侧结果面板，展示地道表达、思维差异说明；初始态为引导提示 + 示例按钮

**3. 语块训练 (`/chunks`)**
- **布局模式**: Tab 切换（语块库 / 替换练习 / 接龙游戏）
- **视觉重心**: 语块内容展示与练习交互
- **结果承载区**: 练习结果反馈（正确/错误 + 解析）；初始态为语块库分类列表

**4. AI 对话练习 (`/conversation`)**
- **布局模式**: 左右分栏（场景选择 / 对话区）
- **视觉重心**: 对话交互区
- **结果承载区**: 对话结束后的地道度分析面板；初始态为场景选择卡片

**5. 影子跟读 (`/shadowing`)**
- **布局模式**: 上下分区（语料选择 / 播放跟读区）
- **视觉重心**: 播放与跟读交互
- **结果承载区**: 文本展示区（标注连读弱读）+ 播放控制；初始态为语料列表

**6. 词汇深度 (`/vocabulary`)**
- **布局模式**: 左右分栏（语义场列表 / 词汇详情）
- **视觉重心**: 词汇深度解析内容
- **结果承载区**: 右侧词汇详情卡片（搭配、语域、情感色彩等）；初始态为第一个语义场概览

**7. 学习记录 (`/progress`)**
- **布局模式**: Tab 切换（日历打卡 / 统计 / 收藏本）
- **视觉重心**: 学习数据统计与收藏内容
- **结果承载区**: 日历热力图 + 统计图表 + 收藏列表；初始态为日历视图

---

## 插件规划

| 插件实例名称 | 基于官方插件 | 业务用途 | 输出模式 | 所属页面 |
|------------|-----------|---------|---------|---------|
| 中式英语检测 | `ai-text-generate` | 分析用户输入的英文句子，识别中式英语表达并给出地道说法与思维差异解释 | stream | 母语思维训练页 |
| 思维转译反馈 | `ai-text-generate` | 对比用户的英语描述与母语者表达，给出思维转译指导 | stream | 母语思维训练页 |
| 反翻译反馈 | `ai-text-generate` | 根据用户扩展的句子给出评价和地道表达建议 | stream | 母语思维训练页 |
| AI 对话伙伴 | `ai-text-generate` | 扮演不同场景的对话角色，与用户进行多轮英文对话 | stream | AI 对话练习页 |
| 地道度分析 | `ai-text-generate` | 对话结束后分析用户表达的地道程度，指出可改进之处 | stream | AI 对话练习页 |

---

## 导航配置

- **导航布局**: Sidebar（左侧固定导航栏）
- **导航项**（仅一级页面）:

| 导航文字 | 路由 | 图标(可选) |
|---------|------|-----------|
| 首页仪表盘 | `/` | Dashboard |
| 母语思维训练 | `/think` | Brain |
| 语块训练 | `/chunks` | Puzzle |
| AI 对话练习 | `/conversation` | MessageSquare |
| 影子跟读 | `/shadowing` | Mic |
| 词汇深度 | `/vocabulary` | BookOpen |
| 学习记录 | `/progress` | BarChart3 |

---

## 数据来源声明

| 数据/操作 | 来源类型 | 实现要求 | mock 兜底 |
|---|---|---|---|
| 学习进度、连续打卡天数 | local-persist | localStorage key=`__nativethink_learning_stats`，存储学习时长、模块进度、连续天数 | 初始 mock 示例数据（source='mock'） |
| 收藏的地道表达 | local-persist | localStorage key=`__nativethink_favorites`，存储用户收藏的语块、表达、词汇 | 空数组 |
| 学习日历打卡记录 | local-persist | localStorage key=`__nativethink_calendar`，按日期存储打卡状态和学习内容 | 初始 7 天 mock 数据 |
| 语块库数据 | demo-mock | `src/data/chunks.ts` 中定义按场景分类的高频母语语块 | ✅ 本身就是 mock |
| 词汇深度数据 | demo-mock | `src/data/vocabulary.ts` 中定义语义场词汇及深度解析 | ✅ 本身就是 mock |
| 影子跟读语料 | demo-mock | `src/data/shadowing.ts` 中定义精选语料文本及语音标注 | ✅ 本身就是 mock |
| 思维转译练习题 | demo-mock | `src/data/thinkExercises.ts` 中定义中文场景及母语者表达对照 | ✅ 本身就是 mock |
| 反翻译练习题 | demo-mock | `src/data/backTranslation.ts` 中定义英文关键词及参考句子 | ✅ 本身就是 mock |
| 中式英语检测 | real-plugin | 调用 ai-text-generate 实例，传入用户输入的英文句子，流式输出分析结果（中式表达识别 + 地道说法 + 思维差异解释） | 失败提示（toast "AI 服务暂不可用，请稍后重试"） |
| 思维转译反馈 | real-plugin | 调用 ai-text-generate 实例，传入用户的英语描述及题目场景，流式输出转译评价与建议 | 失败提示（toast "AI 服务暂不可用，请稍后重试"） |
| 反翻译反馈 | real-plugin | 调用 ai-text-generate 实例，传入用户扩展的句子及关键词，流式输出评价与地道表达建议 | 失败提示（toast "AI 服务暂不可用，请稍后重试"） |
| AI 对话回复 | real-plugin | 调用 ai-text-generate 实例，传入对话历史及场景设定，流式输出 AI 角色的回复 | 失败提示（toast "AI 服务暂不可用，请稍后重试"） |
| 地道度分析 | real-plugin | 调用 ai-text-generate 实例，传入完整对话记录，流式输出地道度分析报告 | 失败提示（toast "AI 服务暂不可用，请稍后重试"） |
| 主题偏好设置 | local-persist | localStorage key=`__nativethink_theme`，存储 light/dark 偏好 | 默认浅色主题 |

> 类型选择 + 兜底约束见上方"数据来源声明方法论"段。含「插件规划」时对应行 type=`real-plugin` + mock 兜底=失败提示。

---

## 功能列表

### 页面: 首页仪表盘 (`/`)
- **页面目标**: 展示学习概览，快速进入各模块
- **功能点**:
  - **今日学习目标展示**: 显示今日学习时长目标及完成进度条
  - **连续学习天数**: 展示连续打卡天数及当前 streak 状态
  - **各模块学习进度环形图**: 以环形进度图展示 6 个学习模块的完成度
  - **每日一句地道表达**: 展示一句地道英文表达及释义，支持收藏
  - **快速开始入口**: 展示 4 个常用模块的快速进入卡片

### 页面: 母语思维训练 (`/think`)
- **页面目标**: 通过三种训练方式培养英语思维，摆脱中式英语
- **功能点**:
  - **中式英语检测器**: 用户输入英文句子 → 提交后调用 AI 分析 → 展示中式表达标记、地道说法、思维差异解释
  - **思维转译练习**: Tab 切换，展示中文场景描述 → 用户输入英语描述 → 提交后对比母语者表达并给出思维指导
  - **反翻译训练**: Tab 切换，展示英文关键词 → 用户扩展成完整句子 → 提交后 AI 给出评价和地道建议
  - **练习历史记录**: 本地保存最近练习记录，支持查看和复习

### 页面: 语块训练 (`/chunks`)
- **页面目标**: 积累高频母语语块，提升表达地道性
- **功能点**:
  - **高频母语语块库**: 按场景分类（日常、职场、社交、情绪等）展示语块，每个语块含释义、使用场景、例句，支持收藏
  - **语块替换练习**: Tab 切换，展示含生硬表达的句子 → 用户选择/输入地道语块替换 → 即时反馈正确与否及解析
  - **语块接龙游戏**: Tab 切换，给出首语块 → 用户输入包含下一个语块的句子 → 游戏化计分，增加趣味性

### 页面: AI 对话练习 (`/conversation`)
- **页面目标**: 通过角色扮演对话练习口语表达
- **功能点**:
  - **场景选择**: 左侧展示多种场景卡片（咖啡店点单、工作面试、日常聊天、辩论等），点击进入对话
  - **多轮自由对话**: 右侧聊天界面，AI 扮演指定角色，用户输入英文进行多轮对话
  - **地道度分析报告**: 对话结束后（点击"结束对话"按钮）生成分析报告，指出可更自然的表达及改进建议
  - **对话历史**: 本地保存历史对话记录，支持查看和继续

### 页面: 影子跟读 (`/shadowing`)
- **页面目标**: 通过跟读训练语音语调和连读弱读
- **功能点**:
  - **语料选择**: 展示精选母语语料列表（日常对话、演讲片段），按难度/类型分类
  - **逐句播放与跟读**: 选中语料后逐句播放音频，显示对应文本，标注连读弱读等语音现象
  - **播放控制**: 播放/暂停、上一句/下一句、调速、循环单句等控制
  - **跟读进度记录**: 记录已跟读的语料和句子，统计跟读时长

### 页面: 词汇深度 (`/vocabulary`)
- **页面目标**: 深度学习词汇的语义场和用法，而非孤立背单词
- **功能点**:
  - **语义场词汇列表**: 左侧按主题聚类展示词汇组（如"情绪表达""职场沟通"等）
  - **词汇深度解析**: 右侧展示选中词汇的常用搭配、语域（正式/非正式）、情感色彩、母语者使用频率
  - **中文无对应概念词汇专区**: 特别展示中文没有直接对应概念的英文词，附详细讲解和例句
  - **词汇收藏**: 支持收藏重点词汇到本地

### 页面: 学习记录 (`/progress`)
- **页面目标**: 追踪学习进度，管理收藏内容
- **功能点**:
  - **学习日历打卡**: 日历热力图展示每日学习状态（打卡/未打卡/学习时长）
  - **各模块学习统计**: 柱状图/折线图展示各模块学习时长、完成数量等统计数据
  - **收藏的地道表达本**: Tab 切换，展示用户收藏的语块、表达、词汇，支持分类筛选和移除收藏

---

## 数据共享配置

| 存储键名 | 数据说明 | 使用页面 |
|---------|---------|---------|
| `__nativethink_learning_stats` | 学习统计数据，类型为 `ILearningStats` | 首页仪表盘、学习记录 |
| `__nativethink_favorites` | 收藏的地道表达列表，类型为 `IFavoriteItem[]` | 母语思维训练、语块训练、词汇深度、学习记录 |
| `__nativethink_calendar` | 日历打卡记录，类型为 `ICalendarRecord[]` | 首页仪表盘、学习记录 |
| `__nativethink_theme` | 主题偏好，类型为 `'light' \| 'dark'` | 全局 |
| `__nativethink_conversation_history` | 对话历史记录，类型为 `IConversation[]` | AI 对话练习、学习记录 |
| `__nativethink_practice_history` | 思维训练练习记录，类型为 `IPracticeRecord[]` | 母语思维训练、学习记录 |

```ts
interface ILearningStats {
  /** 连续学习天数 */
  streakDays: number;
  /** 今日学习目标（分钟） */
  dailyGoalMinutes: number;
  /** 今日已学习分钟数 */
  todayMinutes: number;
  /** 各模块进度（0-100） */
  moduleProgress: {
    think: number;
    chunks: number;
    conversation: number;
    shadowing: number;
    vocabulary: number;
  };
  /** 总学习天数 */
  totalDays: number;
}

interface IFavoriteItem {
  id: string;
  /** 收藏类型 */
  type: 'chunk' | 'expression' | 'vocabulary';
  /** 英文内容 */
  content: string;
  /** 释义/解释 */
  meaning: string;
  /** 例句（可选） */
  example?: string;
  /** 分类标签 */
  category: string;
  /** 收藏时间 */
  createdAt: number;
}

interface ICalendarRecord {
  /** 日期字符串 YYYY-MM-DD */
  date: string;
  /** 是否打卡 */
  checkedIn: boolean;
  /** 学习分钟数 */
  minutes: number;
  /** 学习的模块 */
  modules: string[];
}

interface IConversation {
  id: string;
  /** 场景名称 */
  scenario: string;
  /** 对话消息列表 */
  messages: IMessage[];
  /** 地道度分析（对话结束后生成） */
  analysis?: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}

interface IMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

interface IPracticeRecord {
  id: string;
  /** 练习类型 */
  type: 'detector' | 'translation' | 'backTranslation';
  /** 用户输入 */
  userInput: string;
  /** AI 反馈/结果 */
  feedback: string;
  /** 练习时间 */
  createdAt: number;
}

-------

<scene_type>prototype-app</scene_type>

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Free —— 无参考材料，从产品语义与学习场景出发自主设计
- **核心情绪 / 应用类型**: 清爽、专注、有成长感的英语思维训练工具（学习类 Dashboard + 练习模块）
- **独特记忆点**: 用"思维涟漪"视觉隐喻——蓝绿色渐变光晕 + 柔和扩散圆环，贯穿检测器结果、进度环、语块卡片选中态，呼应"母语思维从内向外扩散"的产品语义。

## 2. Art Direction

- **方向名**: 清澈学习感
- **Design Style**: Swiss Minimalist + Soft Glass —— 瑞士极简保证信息秩序与长时间阅读舒适度，柔玻璃点缀让学习界面有呼吸感而非冰冷工具感
- **DNA 参数**: 圆角 soft（`rounded-lg`/`rounded-xl`）/ 阴影 subtle（`shadow-sm`，hover 时 `shadow-md`）/ 间距 standard（`gap-4`/`p-6`）/ 字体方向 几何无衬线 + 中文清晰易读 / 装饰手法 涟漪光晕、细描边卡片、极轻渐变底
- **应用类型**: Tool + Dashboard —— 左侧固定导航 + 右侧主内容区，模块内卡片网格布局

## 3. Color System

**色彩关系**: 青蓝主色 + 同色系浅青辅助底 + 冷白学习背景；深色模式下为深青灰底 + 青蓝高亮
**配色设计理由**: 蓝绿色系传达清晰、冷静、专注的学习状态，避免高饱和红色带来的焦虑感；primary 只用于 CTA、当前导航、关键进度高亮；accent 承担 hover、选中浅底、骨架屏等低权重反馈
**主色推导**: 从"母语思维如水般自然流动"的语义出发，选青蓝色（teal-cyan）作为主色，比纯蓝更有活力、比纯绿更专业，适合长时间学习不疲劳
**使用比例**: 60% 中性（bg/card/text/border）/ 30% 辅助（accent + 语义浅底）/ 10% primary；主按钮、当前导航、进度环用 primary，tab 激活、icon、边框、链接用 accent 或中性色

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|---|---|---|---|---|
| bg | `--background` | `bg-background` | hsl(180 25% 97%) | 极浅青灰底，比纯白更护眼 |
| card | `--card` | `bg-card` | hsl(0 0% 100%) | 纯白卡片，与底形成柔和层次 |
| text | `--foreground` | `text-foreground` | hsl(210 25% 15%) | 深灰蓝正文，高对比不刺眼 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | hsl(210 12% 45%) | 辅助文字，可读但不抢主信息 |
| primary | `--primary` | `bg-primary` / `text-primary` | hsl(182 70% 40%) | 青蓝主色，CTA、激活态、品牌识别 |
| primaryForeground | `--primary-foreground` | `text-primary-foreground` | hsl(0 0% 100%) | 主色上的纯白文字 |
| accent | `--accent` | `bg-accent` | hsl(180 40% 94%) | 浅青底，hover/选中/骨架屏用 |
| accentForeground | `--accent-foreground` | `text-accent-foreground` | hsl(182 60% 30%) | accent 上的深青文字与图标 |
| border | `--border` | `border-border` | hsl(180 15% 88%) | 淡青灰边框，比纯灰更有调性 |

**语义色提示**:
- 成功（地道/正确）：`hsl(150 55% 42%)`，三态 bg `hsl(150 60% 95%)` / border `hsl(150 45% 80%)` / text `hsl(150 55% 32%)`；饱和度与 primary 对齐，偏绿表示自然地道
- 警告（需改进/中式表达）：`hsl(35 85% 55%)`，三态 bg `hsl(40 80% 95%)` / border `hsl(35 70% 80%)` / text `hsl(30 80% 40%)`；暖橙提示注意，不用红色避免挫败感
- 错误（严重问题）：`hsl(355 70% 55%)`，三态 bg `hsl(355 70% 96%)` / border `hsl(355 60% 85%)` / text `hsl(355 65% 45%)`；低饱和红，克制使用
- 深色模式：所有语义色保持色相，降低明度 15-20%、提高饱和度 10%，与深色底协调

## 4. 字体与节奏

- **font-display**: Inter + Noto Sans SC —— 几何无衬线，现代清晰，标题与品牌名用 600-700 字重传达专业感
- **font-body**: Inter + Noto Sans SC —— 长时间学习阅读友好，中英文混排协调，300-500 字重层次丰富
- **字号**: H1 text-3xl ~ text-4xl；H2 text-xl ~ text-2xl；body text-base；muted text-sm；英文例句可用 `text-[15px]` 略大增强可读性
- **圆角**: 中到大 —— 卡片 `rounded-xl`、按钮 `rounded-lg`、输入框 `rounded-md`、徽章 `rounded-full`，学习产品偏柔和不尖锐

## 5. 全局布局契约

- **Reference Layout Use**: 按需求结构推导——左侧导航栏 + 主内容区的经典学习工具布局
- **Page / Section Order**: Dashboard → Think in English → Chunk Training → Conversation → Shadowing → Deep Vocabulary → Progress，与需求模块 1:1 对齐
- **Standard Content Zone**: 后台型 `max-w-[1280px]` + `mx-auto`，适配桌面端为主的学习场景
- **Shell / Frame Alignment**: 左侧导航固定宽 240px（折叠态 64px），主内容区独立滚动，内容容器与导航右边缘保持 24px 间距
- **Padding & Rhythm**: `px-6 md:px-8 py-8`，卡片内 `p-6`，模块间 `gap-6`，保持 8px 倍数节奏
- **Full-bleed Zones**: Dashboard 顶部问候条 + 每日一句可全宽；其余模块卡片均受内容区约束
- **Local Narrowing**: 思维检测器输入区、对话练习区、跟读练习区可收窄至 `max-w-3xl` 居中，聚焦练习
- **Overflow Strategy**: 语块库表格、学习日历、词汇语义场列表使用 `overflow-x-auto`；对话消息区 `overflow-y-auto`
- **Flexibility Boundary**: 允许移动端导航折叠为底部 tab bar、卡片内边距减为 `p-4`；不允许改变主色、圆角系统、阴影语言和导航逻辑

## 6. 视觉与动效

- **装饰**: 涟漪光晕（选中/正确答案时主色向外扩散 2-3 层半透明圆环）、细描边卡片 + 极轻渐变底
- **阴影/边界**: 轻 —— 默认 `shadow-sm`，hover 时 `shadow-md` + 上移 1px；卡片以边框为主、阴影为辅
- **动效**: 精致克制 —— hover/active 过渡 150ms ease；练习提交、答案揭晓用 300ms 淡入 + 轻微缩放；进度环动画 800ms ease-out；页面切换 200ms 淡入，不做大幅度位移

## 7. 组件原则

- 按钮、输入框、卡片、菜单项必须有 Default / Hover / Active / Focus-visible / Disabled 五态
- Primary 按钮只用于"开始练习""提交答案""下一题"等关键行动；次级操作用 Outline 或 Ghost
- 检测器结果卡片用左侧色条区分"中式表达（橙）"与"地道表达（绿）"，不依赖纯颜色
- 练习类组件统一顶部进度条 + 中间题面 + 底部操作的三段结构
- 空状态、加载状态使用涟漪骨架屏 + 同色系占位，不回退到默认 shadcn 样式

## 8. Image Direction

- **Image Role**: 无强制图片需求，优先通过排版、色彩、涟漪图形和图标建立视觉记忆点
- **Image Art Direction**: 若后续增加模块封面或空状态插画，采用极简扁平风 + 蓝绿色系 + 柔和几何形，人物形象抽象化不写实
- **Image Prompt Keywords**: 无
- **Image Avoidance**: 避免真人外教头像、握手商务图、无意义渐变背景、卡通吉祥物等廉价学习产品套路

## 9. Anti-patterns

- **Split personality**: 七个模块各用各的卡片圆角、阴影和主色深浅；全站共享同一套视觉 token
- **Exam anxiety**: 用大红大绿的强对比反馈制造考试紧张感；学习产品用柔和的青/绿/橙反馈，鼓励大于评判
- **Default SaaS drift**: 回到默认 Inter + 纯蓝按钮 + 灰色卡片的通用 SaaS 脸；用青蓝主色 + 涟漪隐喻 + 极浅青底建立产品识别
- **Invisible interaction**: 只做 hover 不做 focus-visible；所有可交互元素必须有清晰的键盘聚焦环（2px primary 外描边）
- **Mono-hue tyranny**: 主按钮、tab 激活、icon、边框、链接、图表全用 primary；按 60-30-10 比例把 primary 收回到 CTA 与品牌锚点
- **Status color drift**: 成功/警告色饱和度过高、亮度过高，在整体柔和界面中刺眼；语义色饱和度与 primary 对齐 ±15%