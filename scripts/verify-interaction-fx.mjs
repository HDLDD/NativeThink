#!/usr/bin/env node
/**
 * verify-interaction-fx.mjs —— 「按压词汇表 / 结果图形 / 奖励时刻」这套交互反馈层的契约。
 *
 * 三条判据（用户 2026-10-20 定的）：
 *   ① 响应快且不掉帧  ② 全站只有一套按压词汇  ③ 结果不靠文字
 * 本守卫钉的是 ②③ 与降级路径；①的毫秒数走行为通道（walk-interaction-fx.mjs），
 * 因为**判据落在毫秒上就会自己抖**（见 verification.md 第 44 测④）。
 *
 * 三条来自实测的硬约束，改之前先读：
 *   · 缩放必须走独立 `scale` 属性，不许写 transform —— 现有代码在按钮/卡面上已经写了
 *     `transform: translate(...)`，两者会互相覆盖。
 *   · 涟漪不许用 currentColor：浅底上它是深墨（看着像禁用），深底上它是白（几乎看不见）。
 *   · 降级要在委托层判（不建节点），不是靠 CSS 藏 —— 藏的那版 DOM 里仍留着节点。
 *
 * 用法: node scripts/verify-interaction-fx.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** 剥注释必须走编译器：JSX 里的 `accept="video/*"` 这类字符串会骗掉裸正则（verify-video-lab 同款坑） */
const stripTs = (src) => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, removeComments: true },
}).outputText;
const stripCss = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

const CSS = stripCss(read('src/index.css'));
const FX = stripTs(read('src/lib/press-fx.ts'));
const CEL = stripTs(read('src/lib/celebrate.ts'));
const LAYER = stripTs(read('src/components/CelebrateLayer.tsx'));
const RESULT = stripTs(read('src/components/fx/ResultFx.tsx'));
const ROOT_TSX = stripTs(read('src/index.tsx'));
const LAYOUT = stripTs(read('src/components/Layout.tsx'));
const BTN = stripTs(read('src/components/ui/button.tsx'));
const FC = stripTs(read('src/pages/DeepVocabularyPage/components/FlashcardMode.tsx'));
const QC = stripTs(read('src/pages/DeepVocabularyPage/components/QuickCardMode.tsx'));
const CH = stripTs(read('src/pages/ChunkTrainingPage/components/ChunkFlashcards.tsx'));
const VL = stripTs(read('src/pages/VideoLabPage/VideoLabPage.tsx'));
const C2E = stripTs(read('src/pages/DeepVocabularyPage/components/ChineseToEnglishMode.tsx'));
const CD = stripTs(read('src/pages/DeepVocabularyPage/components/CorrectionDrillMode.tsx'));
const DL = stripTs(read('src/pages/DeepVocabularyPage/components/DailyLearningMode.tsx'));
const PFM = stripTs(read('src/pages/DeepVocabularyPage/components/PhraseFlashcardMode.tsx'));
const VPG = stripTs(read('src/pages/DeepVocabularyPage/DeepVocabularyPage.tsx'));

/* ── ① 词汇只有一处定义，且用独立 scale ── */
const tokenDefs = ['--fx-press-strong', '--fx-press-soft', '--fx-in', '--fx-out', '--fx-ripple', '--fx-ease'];
for (const t of tokenDefs) {
  const defs = (CSS.match(new RegExp('\\' + t + '\\s*:', 'g')) || []).length;
  ok(defs === 1, `① token ${t} 在 index.css 里只定义一次（当前 ${defs} 处）`);
}
ok(/--fx-press-strong:\s*0\.970/.test(CSS) && /--fx-press-soft:\s*0\.985/.test(CSS),
  '① 档位数值钉死：strong 0.970 / soft 0.985（真机 393 CSS + textZoom 120% 下量出来的）');
ok(/--fx-in:\s*110ms/.test(CSS) && /--fx-out:\s*170ms/.test(CSS) && /--fx-ripple:\s*420ms/.test(CSS),
  '① 时长钉死：按下 110ms / 抬起 170ms / 涟漪 420ms（抬起不用 spring —— 尾巴要 400ms 才算完）');
ok(/scale:\s*var\(--fx-press-soft\)/.test(CSS) && /scale:\s*var\(--fx-press-strong\)/.test(CSS),
  '① 按压缩放走独立 `scale` 属性（写 transform 会覆盖既有的 translate，两者不能共存）');
ok(!/\[data-press\][^{]*\{[^}]*transform:\s*scale/.test(CSS),
  '① 反向：不许有人把缩放改回 transform: scale(...)');
ok(/transition-property:\s*scale/.test(CSS),
  '① 过渡只声明白名单属性（不是 transition:all —— 那会把 layout 属性一起拖进动画）');
ok(/transition-property:\s*scale,\s*background-color/.test(CSS),
  '① 白名单里必须带上颜色项：CSS 的 transition-property 是整体覆盖，只写 scale 会把元素原有的 transition-colors 顶掉（hover 变色变瞬变）');

/* ──  练习面不许再各写一套按压缩放（词汇只有一条路） ── */
const FACES = {
  FlashcardMode: FC, QuickCardMode: QC, ChunkFlashcards: CH, VideoLabPage: VL,
  ChineseToEnglishMode: C2E, CorrectionDrillMode: CD, DailyLearningMode: DL,
  PhraseFlashcardMode: PFM, DeepVocabularyPage: VPG,
};
for (const [name, src] of Object.entries(FACES)) {
  const n = (src.match(/active:scale/g) || []).length;
  ok(n === 0, `② ${name} 里没有 ad-hoc 的 active:scale（当前 ${n} 处）`);
}
const floors = { FlashcardMode: [FC, 2], QuickCardMode: [QC, 4], ChunkFlashcards: [CH, 4], VideoLabPage: [VL, 17],
  ChineseToEnglishMode: [C2E, 14], CorrectionDrillMode: [CD, 10], DailyLearningMode: [DL, 13],
  PhraseFlashcardMode: [PFM, 8], DeepVocabularyPage: [VPG, 30] };
for (const [name, [src, floor]] of Object.entries(floors)) {
  const n = (src.match(/data-press=/g) || []).length;
  ok(n >= floor, `② ${name} 至少 ${floor} 个按钮走词汇（当前 ${n}）`, '只许涨不许跌：跌了就是有人把接线删了');
}
ok(/data-press.*strong/.test(FC) && /data-press="strong"/.test(VL),
  '② 实心主键用 strong 档（不是所有按钮一律 soft）');

/* ── ③ Button 基座：一处改动覆盖全站 <Button> ── */
ok(/fx === ["']none["'] \? \{\}/.test(BTN), '③ 基座有 fx 逃生阀（none 完全不参与）—— 断言写运行时形状，type 注解会被转译器剥掉');
ok(/variant === "default" \|\| variant === "destructive"/.test(BTN) && /"strong"/.test(BTN),
  '③ 档位由 variant 推导（实心=strong，其余=soft），不在调用点各写一遍');
ok(/asChild \? \{ "data-fx-ripple": "0" \}/.test(BTN),
  '③ asChild 时只缩放不画涟漪（不能往别人家的节点里塞涟漪宿主）');

/* ── ④ 委托层：涟漪的边界条件 ── */
ok(/initPressFx/.test(ROOT_TSX) && /import \{ initPressFx \}/.test(ROOT_TSX),
  '④ 委托在 src/index.tsx 挂一次（全站唯一）');
ok(/pointerType === 'keyboard'/.test(FX), '④ 键盘触发不画涟漪（没有触点坐标，只走 :active 缩放）');
ok(/if \(reduce\)\s*return;/.test(FX) && /const reduce[\s\S]{0,260}if \(reduce\)\s*return;[\s\S]{0,500}ripple\(host,/.test(FX),
  '④ 降级在委托层判、**且排在画涟漪之前**：reduce 时不建节点，不是靠 CSS 藏（藏的那版 DOM 里仍留着节点）');
ok(/box\.width < 2 \|\| box\.height < 2/.test(FX),
  '④ 拿不到有效尺寸就不画，绝不猜坐标');
ok(/MAX_IN_FLIGHT = 3/.test(FX) && /firstElementChild\?\.remove\(\)/.test(FX),
  '④ 同一元素在飞的涟漪有上限（丢最旧的），不无界增长');
ok(/animationend.*node\.remove\(\)/.test(FX.replace(/\s+/g, ' ')) || /addEventListener\('animationend'/.test(FX),
  '④ 涟漪播完自己摘掉（不留在 DOM 里）');
ok(/:scope > \.fx-ripple-host/.test(FX), '④ 涟漪宿主复用 :scope > 查，不会把嵌套按钮的宿主抢过来');
ok(/getAttribute\('data-press'\) === 'off'|data-press="off"/.test(FX) || /'off'/.test(FX),
  '④ data-press="off" 能整块关掉某个元素的词汇');

/* ── ⑤ 涟漪两档颜色 ── */
ok(/--fx-ink-ripple/.test(CSS) && /--fx-light-ripple/.test(CSS) && /\[data-on-dark\]/.test(CSS),
  '⑤ 涟漪有墨/白两档 token（currentColor 那条已被实测推翻）');
ok(!/\.fx-ripple\s*\{[^}]*background:\s*radial-gradient\(circle,\s*currentColor/.test(CSS),
  '⑤ 反向：涟漪底色不许再写回 currentColor');
ok(/data-on-dark/.test(FX) && /0\.299/.test(FX), '⑤ 委托层按亮度挑档（Rec.601 权重）并缓存结果');

/* ── ⑥ 奖励时刻：唯一出口 + 不许假成功 ── */
const allTs = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })
  .map((f) => String(f)).filter((f) => /\.tsx?$/.test(f));
/**
 * 全仓扫描有五条判据要用同一批文件（⑥⑩⑫），每条都重新转译一遍会把这条守卫拖到分钟级
 * （src/data 下有几个几 MB 的词典文件）。**同一个文件只转译一次**，并且一律用剥过注释的版本 ——
 * 注释里写着 `data-press="off"` 也算数过一次，是假计数。
 */
const 码 = new Map();
const codeOf = (rel) => {
  const k = rel.replace(/\\/g, '/');
  if (!码.has(k)) 码.set(k, stripTs(read(path.join('src', rel))));
  return 码.get(k);
};
const mounts = [];
for (const rel of allTs) {
  if (/<CelebrateLayer\b/.test(codeOf(rel))) mounts.push(rel.replace(/\\/g, '/'));
}
ok(mounts.length === 1 && /index\.tsx$/.test(mounts[0]),
  '⑥ 全仓只许 src/index.tsx 一处挂载 <CelebrateLayer />（重复挂载=双份动画）', JSON.stringify(mounts));
ok(/if \(!sink\)\s*return;/.test(CEL) && !/toast/.test(CEL),
  '⑥ 层没挂上时 celebrate() 静默 no-op，**绝不回退成 toast**（那正好破掉"结果不靠文字"）');
ok(/getContext\(['"]2d['"]\)/.test(LAYER) && /if \(!ctx\)\s*return;/.test(LAYER),
  '⑥ 拿不到 2d context 就 no-op');
ok(/Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DPR\)/.test(LAYER) && /MAX_DPR = 2/.test(LAYER),
  '⑥ DPR 夹到 2（手机上 3× 全屏 canvas 白烧显存）');
ok(/PARTICLES = 46/.test(LAYER) && /LIFE_S = 0\.7/.test(LAYER),
  '⑥ 粒子数与存活时长有上限（700ms 自己收干净）');
ok(/cancelAnimationFrame\(rafRef\.current\);\s*let t0/.test(LAYER),
  '⑥ 连点两次奖励时先撤上一轮 rAF（不撤会有两个循环同时清同一块 canvas）');
ok(/return \(\) => \{[\s\S]{0,160}attachCelebrationSink\(null\);[\s\S]{0,160}cancelAnimationFrame\(rafRef\.current\);/.test(LAYER),
  '⑥ 卸载时注销 sink **并**撤 rAF（只撤一样不够：sink 还指着已卸载的 canvas）');
ok(/hypot\(box\?\.width/.test(LAYER) && /240/.test(LAYER),
  '⑥ 粒子从**触发元素**中心起、半径封顶（第一版从视口中心炸开，铺满整屏压住正文）');

/* ── ⑦ 结果层不用 motion、不写字 ── */
ok(!/framer-motion|useFramerMotion/.test(RESULT),
  '⑦ 结果层是纯 CSS，不引 motion 组件（useFramerMotion 带 provider 前置条件，缺了就整页崩）');
ok(!/toast/.test(RESULT), '⑦ 结果层不弹提示');
ok(/@keyframes fx-arc-in/.test(CSS) && /@keyframes fx-ring/.test(CSS) && /@keyframes fx-shake/.test(CSS),
  '⑦ 正对照：三个图形件的关键帧都在（ScoreArc / StreakRing / MissShake）');
ok(/stroke-dashoffset/.test(CSS), '⑦ 收口弧走 stroke-dashoffset（paint），不走 layout 属性');

/* ── ⑧ 闪卡接线：奖励时刻与"全对"判定 ── */
ok(/celebrate\('streak-7', comboChipRef\.current\)/.test(FC), '⑧ 连击 7 锚到连对那个计数上（不是视口中心）');
ok(/next === 7/.test(FC), '⑧ 只在达成那一格响（>= 7 会每帧重放，动画变噪声）');
ok(/ratedRef\.current > 0 && goodRef\.current === ratedRef\.current/.test(FC),
  '⑧ "全对"必须同时要求评过 ≥1 张 —— 一张没评不许放庆祝（否则空轮也算满分）');
ok(/ratedRef\.current = 0;\s*goodRef\.current = 0;/.test(FC),
  '⑧ 开新一轮时两个 ref 显式归零（ref 不随重挂载归零是本仓的老坑）');
ok(/<StreakRing n=\{combo\}/.test(FC), '⑧ 连对计数外面套了环（反馈交给界面，不弹提示）');
ok(!/animate-pulse/.test(FC), '⑧ 反向：同一个元素不许叠两种动效（原来的 animate-pulse 已撤）');
ok(!/animate-pulse/.test(DL), '⑧ 反向：每日学习不许再有 animate-pulse（连对 chip 换 StreakRing，配对选错换一次性 fx-shake）');
ok(/<StreakRing n=\{combo\}/.test(DL), '⑧b 每日学习的连对环也挂 n={combo}（换 n 才重播，与复习检测同一条形状）');
ok(/fx-shake/.test(DL), '⑧b 每日学习配对选错用一次性轻抖（无限脉冲会和这颗按钮的按压缩放抢同一个元素）');

/* ── ⑧b 结果图形件的第二批消费者（spec 第二档："ScoreArc / VerdictDot 接进会话计数"）──
   这条存在的意义：组件、关键帧、守卫都在，但**没有消费者**=用户看不见。判据必须逐个渲染点点名。 */
ok(/<ScoreArc value=\{accuracy \/ 100\}/.test(FC), '⑧b 复习检测的正确率交给 ScoreArc（不再是"记得 70%"那种句子）');
for (const [name, src] of [['中译英', C2E], ['纠偏重考', CD]]) {
  ok(new RegExp(`answered > 0 &&[\\s\\S]{0,220}<ScoreArc value=\\{goodCount / answered\\}`).test(src),
    `⑧b ${name} 的收口弧挂在**已答题数**上，并且一题没答就不画弧（0% 的弧是一个假判定）`);
  ok(/revealed && <VerdictDot state=\{isCorrect \? 'ok' : isChosen \? 'miss' : 'pending'\}/.test(src),
    `⑧b ${name} 的判定色点只在揭晓后出现，且三档齐全（干扰项是中性点，不许蹭答对的绿）`);
}
const 硬编码判定 = [];
for (const [name, src] of [['中译英', C2E], ['纠偏重考', CD], ['复习检测', FC]]) {
  if (/<VerdictDot state=\{?['"]ok['"]/.test(src) || !/revealed && <VerdictDot/.test(src) && /<VerdictDot/.test(src)) 硬编码判定.push(name);
}
ok(硬编码判定.length === 0,
  '⑧b 反向：判定色点不许写死成常量，也不许在揭晓前就渲染（未判定冒绿点=把没判的说成判对）', 硬编码判定.join('、'));

/* ── ⑨ 降级 CSS ── */
const rmBlock = (CSS.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) || []).join('\n');
ok(/\[data-press\][\s\S]{0,80}scale:\s*1 !important/.test(rmBlock),
  '⑨ reduce 偏好下缩放强制回 1（CSS 兜第二层，第一层在委托里）');
ok(/\.fx-ripple[\s\S]{0,120}animation:\s*none !important/.test(rmBlock),
  '⑨ reduce 偏好下涟漪/环/抖全部停');

/* ── ⑩ 按压态的投递机制：这条是 2026-10-20 模拟器 APK 实测逼出来的 ──
   CDP 设备级真触摸（Input.dispatchTouchEvent，不是合成事件）按下时：pointerdown 带着
   pointerType:"touch" 到了元素、涟漪也建了节点，但按下期间整页
   document.querySelectorAll(':active').length 恒为 0 —— 这台 WebView 触摸下根本不进 :active。
   所以缩放必须由委托层挂 data-pressing，:active 只作为真鼠标的并列来源。
   2026-10-20 真机 2.0.93 又补一刀：**触摸抬手后 :active 会被平台多按住 ~400ms**（up100ms 仍 active、
   up300ms 才掉），按钮表现为"回弹晚"。所以 `:active` 收进 `@media (hover: hover) and (pointer: fine)` ——
   这台真机报 `hover:none / pointer:coarse`；桌面报 `hover:hover / pointer:fine`。 */
ok(/\[data-press\]\[data-pressing\]\s*\{[^}]*scale:\s*var\(--fx-press-soft\)/.test(CSS),
  '⑩ `[data-press][data-pressing]` 这一档指回 `var(--fx-press-soft)` 那一身（正则钉 token，否则降级块里同形的选择器会替它蒙过去）');
ok(/\[data-press="strong"\]\[data-pressing\]\s*\{[^}]*scale:\s*var\(--fx-press-strong\)/.test(CSS),
  '⑩ strong 档同样指到同一个 token（不许各写一个数）');
const HOVER_GATE = '@media (hover: hover) and (pointer: fine)';
const 显式active位 = [...CSS.matchAll(/\[data-press\]:active/g)].map((m) => m.index);
const 鼠标门位 = CSS.indexOf(HOVER_GATE);
ok(/\[data-press\]:active\s*\{[^}]*scale:\s*var\(--fx-press-soft\)/.test(CSS) && 鼠标门位 >= 0,
  '⑩ 鼠标那条 `:active` 仍然在（零延迟路径不丢），但它必须在 hover/pointer 媒体查询里');
ok(显式active位.length > 0 && 显式active位.every((i) => i > 鼠标门位),
  '⑩ 反向：媒体查询之外不许出现 `[data-press]:active` —— 真机实测触摸抬手后 :active 被平台多按住 ~400ms，' +
  '留在外面就是"回弹晚"（这条断言的来历见 index.css 同处注释）',
  JSON.stringify({ 鼠标门位, 显式active位 }));
ok(/host\.setAttribute\('data-pressing', ''\)/.test(FX),
  '⑩ 委托层在 pointerdown 上挂 data-pressing');
ok(/aria-disabled[\s\S]{0,120}host\.setAttribute\('data-pressing'[\s\S]{0,240}const reduce[\s\S]{0,160}if \(reduce\)\s*return;[\s\S]{0,240}ripple\(host,/.test(FX),
  '⑩ 顺序钉死：门槛（off/disabled）→ 挂按压态 → 判降级 → 画涟漪。挂按压态必须在 reduce 之前 —— 降级只该停涟漪，不该顺手把手感也没收；在 disabled 之后 —— 禁用的按钮不许装成按得下去');
ok(/document\.querySelectorAll\('\[data-pressing\]'\)\.forEach\(\(el\) => el\.removeAttribute\('data-pressing'\)\)/.test(FX),
  '⑩ 收回是"清全站"而不是"记谁被挂过"：元素在按住期间被 React 换掉也不会留下孤儿属性');
for (const t of ['pointerup', 'pointercancel']) {
  ok(new RegExp(`addEventListener\\('${t}', release`).test(FX) && new RegExp(`removeEventListener\\('${t}', release`).test(FX),
    `⑩ ${t} 既挂也撤（缺 ${t} 会留下一个"永久按着"的元素，缺撤会在热更新/重挂后叠两份监听）`);
}
ok(/window\.addEventListener\('blur', release\)/.test(FX),
  '⑩ 窗口失焦也收 —— 按住时切走（通知栏/切 App）不会再留一个按住的按钮');
const stray = [];
for (const rel of allTs) {
  if (/press-fx\.ts$/.test(rel)) continue;
  if (/data-pressing/.test(codeOf(rel))) stray.push(rel.replace(/\\/g, '/'));
}
ok(stray.length === 0, '⑩ 反向：除委托层之外，全站不许有任何地方自己写 data-pressing（属性就是接口，两处写就会漂移）', JSON.stringify(stray));
ok(/\[data-press\]\[data-pressing\][\s\S]{0,400}scale:\s*1 !important/.test(rmBlock),
  '⑩ 降级块也把新机制那档强制回 1（漏了这条 = 减少动效偏好下仍然缩放）');

/* ── ⑪ 默认可点层（批 2）：裸 `<button>` / `<a href>` / `[role=button]` 不写属性就参与 ──
   翻默认的原因：全站 307 处裸 `<button>` + 395 处 `<Button>`，手抄 data-press 一定会漏，
   而这条判据要的是覆盖，不是"量过的都合格"。
   ⚠️ 本层只给按下态：index.css 这些规则在 @layer 之外，而 Tailwind v4 把 utilities 装在
   `@layer utilities` 里（产物 CSS 复核过），**层外规则无视特异性一律赢过层内**。
   所以在这里写 base `scale: 1` 或 `transition-property` 会静默顶掉宿主自己的
   transition-all 219 处 / transition-colors 142 处 / transition-transform 28 处 /
   hover:scale-* 21 处（数字是 2026-10-20 grep 出来的，改之前重新推导，不要放宽）。 */
const DEF_SEL = ':where(button, a[href], [role="button"]):not([data-press])';
const defBlocks = [...CSS.matchAll(/([^{}]*:where\(button[^{}]*?)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim(), body: m[2].trim() }));
ok(defBlocks.length === 3,
  `⑪ 默认层恰好三条规则块：`+"`[data-pressing]`"+` 按下态一条 + 鼠标 :active 一条（在 hover 门里）+ 降级一条（当前 ${defBlocks.length}）` +
  defBlocks.map((b) => `〔${b.sel.replace(/\s+/g, ' ').slice(0, 46)}→${b.body}〕`).join(''));
ok(CSS.includes(DEF_SEL + ':active') && CSS.includes(DEF_SEL + '[data-pressing]'),
  '⑪ 默认层的选择器就是这一条，按下态与鼠标态都在；`:not([data-press])` 是退出钥匙' +
  '（显式声明档位的宿主由上面那套完整待遇接管，两条规则同特异性会互相顶）');
const 默认active位 = [...CSS.matchAll(new RegExp(DEF_SEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':active', 'g'))].map((m) => m.index);
ok(默认active位.length >= 2 && 默认active位.every((i) => i > 鼠标门位),
  '⑪ 默认层每一处 `:active` 都在 hover/pointer 媒体查询之后（一处是鼠标态、一处是降级态；' +
  '触摸设备只走 [data-pressing]，真机实测不被门住的 :active 会在抬手后多按住 ~400ms）',
  JSON.stringify({ 鼠标门位, 默认active位 }));
const defPressed = defBlocks.filter((b) => !/!important/.test(b.body));
ok(defPressed.length === 2 && defPressed.every((b) => /scale:\s*var\(--fx-press-soft\)/.test(b.body)),
  `⑪ 默认层的两条按下态（[data-pressing] 与鼠标 :active）都指回同一个 soft token（当前 ${defPressed.length} 块）—— 写死数字就是第二套词汇`);
ok(defBlocks.every((b) => !/transition-property/.test(b.body)),
  '⑪ 反向：默认层不许写 transition-property —— 层外规则会顶掉全站 219 处 transition-all / 142 处 transition-colors');
ok(defBlocks.every((b) => /:active|\[data-pressing\]/.test(b.sel)),
  '⑪ 反向：默认层只许存在于按下态/降级态，不许有基态规则（base scale:1 会顶掉宿主的 hover:scale-*）');
ok(/closest\?\.\(\s*['"]button, a\[href\], \[role="button"\], \[data-press\]['"]/.test(FX),
  '⑪ 委托层的 closest 与 CSS 默认层同源（少了默认三种 = 裸按钮挂不上按压态，界面静默没手感）');
ok(/closest\?\.\([\s\S]{0,140}if \(!host\)[\s\S]{0,24}return;[\s\S]{0,90}getAttribute\(['"]data-press['"]\) === ['"]off['"]/.test(FX),
  '⑪ off 这道门排在取到宿主之后、且在挂按压态之前（翻默认之后 off 就是唯一的例外口子，位置错了它就不生效）');
ok(/display === 'inline'[\s\S]{0,40}return;[\s\S]{0,200}position === 'static'[\s\S]{0,120}host\.style\.position = 'relative'[\s\S]{0,200}getBoundingClientRect\(\)/.test(FX),
  '⑪ 涟漪宿主的两个兜底都排在量尺寸之前：行内盒直接不画（inset:0 会甩到别人的框里），' +
  '静态定位补 relative —— 默认可点覆盖 307 处裸按钮，不可能要求每处都带 relative');
ok(/:where\(button[\s\S]{0,120}scale:\s*1 !important/.test(rmBlock),
  '⑪ 降级块里也有默认层那一条（只写 [data-press] 的话，裸按钮在减少动效偏好下照样缩）');
const RAIL_SRC = codeOf('components/ui/sidebar.tsx');
ok(/data-sidebar="rail"[\s\S]{0,200}data-press="off"/.test(RAIL_SRC),
  '⑪ 侧边栏那条 16px 隐形拖拽把手显式退出词汇（它是全站少数"不该有按钮手感"的裸 button）');
const offs = [];
for (const rel of allTs) {
  const n = (codeOf(rel).match(/data-press="off"/g) || []).length;   // 只看代码：注释里提一句不算挂了一个例外
  if (n) offs.push(`${rel.replace(/\\/g, '/')}=${n}`);
}
ok(offs.reduce((s, x) => s + Number(x.split('=').pop()), 0) <= 5,
  '⑪ 反向：off 是稀缺例外，不是逃生口（超过 5 处就是有人在绕过"一套词汇"这条契约，要在文档里逐条登记）', offs.join(' '));
for (const [f, why] of [['scripts/walk-interaction-fx.mjs', '本机走查'], ['scripts/check-interaction-on-phone.mjs', '设备凭据']]) {
  const s = read(f);
  ok(/button, a\[href\], \[role="button"\]/.test(s),
    `⑪ ${why}的参与者选择器与默认层同源（还按 [data-press] 数的话，这一层新覆盖的裸按钮全都量不到 = 覆盖假绿）`);
}

/* ── ⑫ 第三档「入场 / 转场」：这一档不是新造的，是把已有的收进同一套词汇 ──
   `.page-enter`（路由级淡入+上浮）与 `.stagger > *`（卡片逐张入场）早就挂在 12 处界面上，
   缺的是同源：曲线字面量在四个地方各写一遍，改一次要撞四处。 */
const easeLiterals = (CSS.match(/cubic-bezier\(/g) || []).length;
ok(easeLiterals === 1,
  `⑫ 全站缓动字面量 cubic-bezier(...) 只许出现一次（就是 --fx-ease 那行定义；当前 ${easeLiterals} 次）`);
const 外部曲线 = [];
for (const rel of allTs) {
  if (/cubic-bezier\(/.test(codeOf(rel))) 外部曲线.push(rel.replace(/\\/g, '/'));
}
ok(外部曲线.length === 0, '⑫ 反向：组件里不许再自带曲线（要缓动就指 var(--fx-ease)）', JSON.stringify(外部曲线));
for (const [name, re] of [
  ['.page-enter', /\.page-enter\s*\{\s*animation:\s*page-enter\s+\d+ms\s+var\(--fx-ease\)\s+backwards/],
  ['.stagger > *', /\.stagger\s*>\s*\*\s*\{\s*animation:\s*card-enter\s+\d+ms\s+var\(--fx-ease\)\s+backwards/],
]) {
  ok(re.test(CSS), `⑫ ${name} 用 var(--fx-ease) 且 fill-mode 是 backwards` +
    '（both/forwards 会把结束帧的 transform 留在祖先上 → 祖先变成 fixed 的包含块 → 阅读器整层被关进内容列）');
}
ok(/\.page-enter,[\s\S]{0,60}\.stagger > \*[\s\S]{0,60}animation:\s*none !important/.test(rmBlock),
  '⑫ reduce 偏好下入场动画整条停掉（这档也要过降级这道门，不只是按压层）');
const 挂点数 = allTs.reduce((s, rel) => s + ((codeOf(rel).match(/page-enter|stagger/g) || []).length), 0);
ok(挂点数 >= 10, `⑫ 这一档真的接在界面上：全站 ≥10 个挂载点（当前 ${挂点数}）—— 只在 CSS 里定义、没人挂 = 空气`);
ok(/key=\{location\.pathname\} className="page-enter"/.test(LAYOUT),
  '⑫ 路由级入场挂在 Layout 的 keyed 包装上（换页重挂载才会重播；写在页面内部就会随每个组件重挂载反复播）');

/* ── 收尾 ── */
const pass = results.filter((r) => r.pass).length;
for (const r of results) if (!r.pass) console.log(`✗ ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n交互反馈层守卫 ${pass}/${results.length} 通过${pass === results.length ? ' ✓' : ''}`);
process.exit(pass === results.length ? 0 : 1);
