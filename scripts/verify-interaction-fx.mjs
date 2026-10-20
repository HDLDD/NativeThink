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
ok(/\[data-press\]:active\s*\{[^}]*scale:\s*var\(--fx-press-soft\)/.test(CSS),
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
const mounts = [];
for (const rel of allTs) {
  const code = stripTs(read(path.join('src', rel)));
  if (/<CelebrateLayer\b/.test(code)) mounts.push(rel.replace(/\\/g, '/'));
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

/* ── ⑨ 降级 CSS ── */
const rmBlock = (CSS.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) || []).join('\n');
ok(/\[data-press\][\s\S]{0,80}scale:\s*1 !important/.test(rmBlock),
  '⑨ reduce 偏好下缩放强制回 1（CSS 兜第二层，第一层在委托里）');
ok(/\.fx-ripple[\s\S]{0,120}animation:\s*none !important/.test(rmBlock),
  '⑨ reduce 偏好下涟漪/环/抖全部停');

/* ── 收尾 ── */
const pass = results.filter((r) => r.pass).length;
for (const r of results) if (!r.pass) console.log(`✗ ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n交互反馈层守卫 ${pass}/${results.length} 通过${pass === results.length ? ' ✓' : ''}`);
process.exit(pass === results.length ? 0 : 1);
