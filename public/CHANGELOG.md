# NativeThink 开发日志












## 2026-07-18
- fix: real-time STT - translate each sentence on the fly (`441dbf0`)

## 2026-07-18
- feat: voice recognition subtitle - Web Speech API STT (`33ec0c6`)

## 2026-07-18
- fix: episode nav with arrows + wheel, resilient subtitle API, dialog a11y (`cfd7e48`)

## 2026-07-18
- fix: episode switching - page nav + per-page subtitles (`bb229d9`)

## 2026-07-18
- fix: subtitle timing estimate + simplified B站 API (`a48380a`)

## 2026-07-18
- feat: auto subtitle - B站 API + AI fallback, cache, transcript paste (`a9c723b`)

## 2026-07-18
- feat: speaking collection feature - auto-fetch B站 info, level group, add TED 100 talks (`28b900f`)

## 2026-07-18
- feat: replace placeholder videos with real B站英语播客合集 (`885c75f`)

## 2026-07-17
- fix: speaking page - support full B站 URL when adding video (`d9b6978`)

## 2026-07-17
- feat: speaking page - support delete video (`7334816`)

## 2026-07-17
- speaking page (`4f2c1fb`)

## 2026-07-17
- feat: 提交句子拼写答案后自动重读句子
- feat: 新增英语口语视频学习页 (/speaking) — B站嵌入播放 + 同步字幕 + 重点词查词翻译
- feat: 视频库按难度筛选，支持自定义添加 B站视频
- fix: 再听一遍 stays on current sentence, improve pronunciation analysis prompt (`67e21d6`)

## 2026-07-17
- fix: shadowing togglePlay pause not working — ref-based isSpeaking avoids stale closure (`c5d48bb`)

## 2026-07-17
- fix: shadowing center play/pause button now correctly stops playback — ref-based isSpeaking avoids stale closure (`ac0397f`..HEAD)

## 2026-07-17
- feat: shadowing voice recording + AI comparison, fix favorites persistence (`ac0397f`)

## 2026-07-17
- fix: favorites dual-write to direct localStorage key (survives prefix changes) (`7ebcf68`)

## 2026-07-17
- feat: add voice input via Web Speech API (`3d64289`)

## 2026-07-17
- feat: accept synonyms for sourceWord in sentence spelling (`d199f13`)

## 2026-07-17
- fix: stable currentSentence via ref — immune to useMemo flicker (`4465a4c`)

## 2026-07-17
- refactor: word bank sentences in global cache (not React state) — root cause fix (`a1a504c`)

## 2026-07-17
- fix: sentence-change effect no longer touches submitted/results at all (`7198468`)

## 2026-07-17
- fix: handleRetryWrong keeps results visible, remove dead code (`8644d23`)

## 2026-07-17
- fix: use results guard instead of submitted guard in sentence-change effect (`03cdc70`)

## 2026-07-16
- fix: prevent sentence-change effect from clearing submitted results (`f99d0c5`)

## 2026-07-16
- fix: sentence display for fill mode, init effect handles all-completed, remove auto-reset (`c770c7b`)

## 2026-07-16
- fix: move auto-reset useEffect before early returns (hooks rule), remove duplicate (`3b8c943`)

## 2026-07-16
- fix: buildSessionQueue includes all non-mastered, add manage dialog, reset fixes (`eb2a67a`)

## 2026-07-16
- fix: remove local updated array (ID mismatch), add race-condition guard, prevent loading flash (`eed7ce9`)

## 2026-07-16
- perf: cache extracted sentences per level, Map O(1) upsert, remove empty-level screen (`52b7508`)

## 2026-07-16
- feat: remember last practice position (level + sentence index) (`3670753`)

## 2026-07-16
- fix: rebuildSession onClick wrappers (type compat with override params) (`b221704`)

## 2026-07-16
- fix: use importDirty to trigger rebuild after async level load (avoids stale closure) (`034aa04`)

## 2026-07-16
- refactor: on-demand level loading like DeepVocabularyPage, upsert instead of rebuild (`3db4299`)

## 2026-07-16
- fix: show '当前词库没有句子' instead of '全部完成' when level has no sentences (`0887b25`)

## 2026-07-16
- fix: level switching rebuild, clear old sentences on rebuild, completed sentences excluded, reset progress UI (`d145c1c`)

## 2026-07-16
- feat: import all 9 word banks on build, add level filter UI (`018fecf`)

## 2026-07-16
- fix: word bank selector buttons, persist completed sentences, fill mode init + wrong-words fix, index-based prev/next nav (`72ee5a9`)

## 2026-07-16
- refactor: simplified SpellingPage — select level builds database, linear practice flow, removed ImportDialog (`b687900`)

## 2026-07-16
- fix: buildSessionQueue now includes ALL sentences without maxNew limit, fix variable name (`74c71d0`)

## 2026-07-16
- fix: increase session queue to 200 sentences, fix empty symbol display (&nbsp; → actual U+00A0) (`6be0277`)

## 2026-07-16
- feat: add vertical bar and brand-color underline on focus to show active word (`c917832`)

## 2026-07-16
- fix: submitted results no longer cleared by effect, remove completed sentences from queue, Tab nav + auto-focus, cancel stale TTS (`397cb11`)

## 2026-07-16
- fix: exclude /api/* from _redirects rewrite (`4bdfd00`)

## 2026-07-16
- feat: remove ___ placeholders, one-click full word bank import, fix sentence count not updating (`de4f924`)

## 2026-07-16
- fix: adjust word gap to 0.5em (one 'a' width) (`8ece919`)

## 2026-07-16
- feat: underline is invisible input carrier — click to type, text appears above line (`82aaecd`)

## 2026-07-16
- feat: underline-only input style, auto-read toggle (`00ffb4b`)

## 2026-07-16
- fix: handleImportAll batches all segments in single addSentences call to avoid stale closure overwrite (`e2f7e34`)

## 2026-07-16
- fix: segmented batch import, per-word input with ___ placeholder, centered Chinese, conditional auto-read (`2172279`)

## 2026-07-16
- feat: segmented batch import from word bank — scan all words, split into segments of 200+, import by segment (`7281c72`)

## 2026-07-16
- refactor: dictation mode - single continuous input instead of per-word fields (`12945d5`)

## 2026-07-16
- fix: add _redirects for SPA client-side routing, fix Dialog aria-describedby warning (`bd46d45`)

## 2026-07-16
- feat: add sentence spelling feature with dictation & fill modes, AI batch add, SM-2 memory, favorites (`08c8750`)

---

*(以下为之前版本的日志摘要)*

## 2026-07-14
- fix: learning time tracking bugs — midnight reset, stale closure, UTC dates (`87070f2`)
- fix: 修复成就徽章系统多个问题 (`70aeaf1`)

## 2026-07-13
- fix: 修复词汇复习模式在无学习单词时随机切换问题 (`67cc0ae`)
- perf: vocabulary page renders UI immediately, skeleton fallback for page transitions (`7fde02f`)
- fix: re-read localStorage after cloud sync completes (`dc3dc98`)
- docs: 整理 CHANGELOG — 合并重复日期，分类记录更新和修复 (`4d7a6dc`)
- feat: add password hint text on register form (`272e88d`)

### LCP 性能优化 🚀
- Google Fonts 非阻塞加载、DashboardPage 懒加载、路由悬停预加载、共享 chunk 提取
- 主包体积: 1.07MB → 897KB（↓16%）、wordbank 分包补全

### 依赖清理 🧹
- 移除 gsap + @gsap/react（6.4MB）、next-themes

### 修复 🐛
- NotFoundPage Suspense 边界、PBKDF2 100k 迭代、KV namespace binding、@tailwindcss/vite 插件
- Lark 平台移除、wrangler.toml 修复、404.html 复制、本地 vite、标准 vite 配置

### Cloudflare Pages 部署修复 🔧
- 修复部署问题，需要配置 GitHub Secrets

---

## 2026-07-11

### 文章阅读 Bug 修复 🐛
- TDZ ReferenceError 根因修复、动态 import 打破循环依赖、PageReader 健壮性提升
- 登录 & 注册 1101 错误修复、PBKDF2 迭代限制、crypto.randomUUID 兼容性
- 云同步完整修复：syncUp/syncDown 数据一致性、防抖批量写入、接入认证生命周期
- 词库引擎稳定性：顺序加载取代并行加载、蓄水池采样、加载容错

### 性能优化 🚀
- 全部页面 React.lazy 懒加载，主包 2.3MB → 897KB (-61%)
- 词库引擎索引缓存、useDeferredValue 搜索优化

### 朗读引擎 🔊
- 多引擎架构 (SpeechSynthesis → CF Edge TTS → Google TTS)
- 超时兜底、手机端 TTS 修复

### 移动端适配 📱
- 底部 Tab 导航栏 + 响应式布局

---

## 2026-07-10

### 初始功能
- 手机版适配基础布局、AI 双语输出、Cloudflare Pages 部署支持
