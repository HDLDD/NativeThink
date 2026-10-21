# NativeThink - 母语思维英语训练 - 需求拆解文档

> 本文件由原根目录 `AGENTS.md` 迁移而来，作为**产品需求规格**保留，勿覆盖。  
> Agent 工作指南见 [AGENTS.md](../AGENTS.md)；开发路线见 [ROADMAP.md](../ROADMAP.md)。

## 产品概述

- **产品类型**: 个人英语学习 Web 应用
- **场景类型**: <scene_type>prototype-app</scene_type>
- **目标用户**: 希望摆脱中式英语、培养母语思维的英语学习者
- **核心价值**: 通过思维训练、语块积累、对话实践等非传统方式，帮助用户建立像 native speaker 一样的英语思维和口语表达能力
- **界面语言**: 中文（学习内容为英文）
- **主题偏好**: user_specified（支持深色/浅色主题切换，蓝绿色系为主色调）
- **导航模式**: 路径导航
- **导航布局**: Sidebar（左侧导航栏 + 主内容区）

> **现状补充（以代码为准）**：产品已扩展出文章阅读 `/articles`、AI 写作 `/writing`、句子学习 `/sentences`、句子拼写 `/spelling`、收藏 `/favorites`、四六级入口 `/cet`（独立 CetThink App）。下文页面表为最初需求，实现以 `src/app.tsx` 与 AGENTS.md 路由地图为准。

---

## 页面结构总览（原始需求）

| 页面名称 | 文件名 | 路由 | 页面类型 | 入口来源 |
|---------|-------|------|---------|---------|
| 首页仪表盘 | `DashboardPage.tsx` | `/` | 一级 | 导航 |
| 母语思维训练 | `ThinkInEnglishPage.tsx` | `/think` | 一级 | 导航 |
| 语块训练 | `ChunkTrainingPage.tsx` | `/chunks` | 一级 | 导航 |
| AI 对话练习 | `ConversationPage.tsx` | `/conversation` | 一级 | 导航 |
| 影子跟读 | `ShadowingPage.tsx` | `/shadowing` | 一级 | 导航 |
| 词汇深度 | `DeepVocabularyPage.tsx` | `/vocabulary` | 一级 | 导航 |
| 学习记录 | `ProgressPage.tsx` | `/progress` | 一级 | 导航 |

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

## 导航配置（原始需求）

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
| 学习进度、连续打卡天数 | local-persist | localStorage key=`__nativethink_learning_stats` | 初始 mock 示例数据 |
| 收藏的地道表达 | local-persist | localStorage key=`__nativethink_favorites` | 空数组 |
| 学习日历打卡记录 | local-persist | localStorage key=`__nativethink_calendar` | 初始 7 天 mock 数据 |
| 语块库数据 | demo-mock | `src/data/chunks.ts` | 本身就是 mock |
| 词汇深度数据 | demo-mock | `src/data/vocabulary.ts` / wordbank | 本身就是 mock |
| 影子跟读语料 | demo-mock | `src/data/shadowing.ts` | 本身就是 mock |
| 思维转译练习题 | demo-mock | `src/data/thinkExercises.ts` | 本身就是 mock |
| 反翻译练习题 | demo-mock | `src/data/backTranslation.ts` | 本身就是 mock |
| AI 相关反馈 | real-plugin / real-api | ai-text-generate 或用户自配 Key | 失败 toast「AI 服务暂不可用」 |
| 主题偏好设置 | local-persist | localStorage key=`__nativethink_theme` | 默认浅色主题 |

---

## 功能列表（原始需求摘要）

- **仪表盘**：今日目标、连续天数、模块进度环、每日一句、快速入口
- **母语思维**：中式英语检测 / 思维转译 / 反翻译 + 练习历史
- **语块训练**：语块库 / 替换练习 / 接龙游戏
- **AI 对话**：场景选择、多轮对话、地道度分析、对话历史
- **影子跟读**：语料选择、逐句播放、播放控制、进度记录
- **词汇深度**：语义场列表、深度解析、中文无对应词专区、收藏
- **学习记录**：日历打卡、模块统计、收藏本

---

## 数据共享配置

| 存储键名 | 数据说明 |
|---------|---------|
| `__nativethink_learning_stats` | 学习统计 `ILearningStats` |
| `__nativethink_favorites` | 收藏列表 `IFavoriteItem[]` |
| `__nativethink_calendar` | 日历打卡 `ICalendarRecord[]` |
| `__nativethink_theme` | 主题 `'light' \| 'dark'` |
| `__nativethink_conversation_history` | 对话历史 `IConversation[]` |
| `__nativethink_practice_history` | 思维练习记录 `IPracticeRecord[]` |

`ILearningStats.moduleProgress` **以代码为准**（见 `src/lib/use-learning-stats.ts`），当前包含：  
`think, chunks, conversation, shadowing, vocabulary, writing, articles, spelling, sentences, cet`。

---

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Free —— 无参考材料，从产品语义与学习场景出发自主设计
- **核心情绪 / 应用类型**: 清爽、专注、有成长感的英语思维训练工具
- **独特记忆点**: 「墨面学习台」—— 深墨绿外壳 + 暖白纸面 + 编号式功能入口；一屏只有一处饱和（主行动块或当前导航）

## 2. Art Direction

- **方向名**: 编辑式学习台（Ink Studio）
- **Design Style**: Editorial Minimal + Ink Frame
- **DNA**: 暖白纸面 / 细发丝边 / 非斜体无衬线标题 / 表格化数字（tabular-nums） / 没有彩色光晕与粉彩图标块
- **应用类型**: Tool + Dashboard

## 3. Color System

| 角色 | CSS 变量 | 值 | 说明 |
|---|---|---|---|
| bg | `--background` | `#F3F4EF` | 暖白纸面（暗色 `#0B110D`） |
| card | `--card` | `#FFFFFF` | 纸卡（暗色 `#131B16`） |
| text | `--foreground` | `#14201A` | 墨绿正文 |
| textMuted | `--muted-foreground` | `#68736B` | 辅助文字 |
| primary | `--primary` | `#00B894` | 品牌青绿（唯一主色，走 `--brand`） |
| ink | `--ink` | `#0D1A14` | 墨面：侧栏 / 主行动块 / 手机 dock |
| lime | `--lime` | `#C8F26B` | 只在墨面上出现的信号色（CTA / 关键数字） |
| warm | `--warm` | `#C98A2E` | 暖色强调（每日一句、纠偏待办） |
| border | `--border` | `#E2E5DD` | 发丝边 |

- 成功：`hsl(150 55% 42%)`；警告：`hsl(35 85% 55%)`；错误：低饱和红
- 比例：60% 中性 / 30% 辅助 / 10% primary；**一屏只留一处高饱和**
- 禁止：彩色光晕（`shadow-emerald/violet/sky…`）、大面积粉彩图标底、渐变大按钮

## 4. 字体与节奏

- `--font-sans` 唯一首选自托管 Noto Sans SC 400/500/600/700（OFL，简体子集自带拉丁，中英文一个家族）；标题 600-800，正文 400-500
- 不能依赖家族间逐字回退：部分 ROM（Onyx 实测）第一个家族缺字就直接掉进系统书法体；Plus Jakarta Sans face 保留但不进字体栈
- 标题一律正体（`h1-h4` 由 `index.css` 强制 `font-style: normal`）；数字用 `tabular-nums`
- 卡片统一 `24px` 圆角（`[data-slot="card"]` 单点），按钮 `rounded-full` / `rounded-2xl`，导航圆角 11-15px

## 5. 全局布局契约

- 左侧墨色导航 + 暖白纸面主内容区；顶栏 64px，只留时间 / 搜索 / 设置 / 用户菜单
- 节奏：`px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8`，卡片 `p-5/6`，模块 `gap-6/8`
- 手机：底部悬浮墨色 dock（6 个入口），内容用 `pb-20` 为它让位；dock 自己的 `bottom` 走 `env(safe-area-inset-bottom)`

## 6–9. 动效 / 组件原则 / 图片 / 反模式

- 动效克制：hover 150ms；答案揭晓 300ms；进度环 800ms ease-out
- 组件需 Default/Hover/Active/Focus-visible/Disabled
- 反模式：Split personality、Exam anxiety、Default SaaS drift、Invisible interaction、Mono-hue tyranny、Status color drift
