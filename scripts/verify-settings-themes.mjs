#!/usr/bin/env node
/**
 * verify-settings-themes.mjs —— 设置页 + 可切换外观主题的契约。
 *
 * 两条用户要求（2026-10-20）：
 *   ① 保留原主题；新外观做成可来回切换的配置（明暗之外的第二维）。
 *   ② 顶栏那些功能（使用指南 / 朗读配置 / AI / 每日目标 / 更新日志 / 开发者主页）合并进"设置"。
 *
 * 这个守卫盯的是"接得对不对"，不是"好不好看"：外观最终以真机/浏览器读数为准。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripTs = (src) => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, removeComments: true },
}).outputText;
const stripCss = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');
const code = (rel) => stripTs(read(rel));

const THEME = read('src/lib/ui-theme.ts');
const CSS = stripCss(read('src/index.css'));
const ROOT_TSX = code('src/index.tsx');
const HEADER = code('src/components/Header.tsx');
const PAGE = code('src/pages/SettingsPage/SettingsPage.tsx');
const APP = code('src/app.tsx');
const SIDEBAR = code('src/components/AppSidebar.tsx');

/* ── ① 注册表 ── */
const ids = [...THEME.matchAll(/id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
ok(ids.length === 4 && ids.includes('classic') && new Set(ids).size === 4,
  '① 主题注册表恰好四套且含 classic（默认）', JSON.stringify(ids));
ok(/const UI_THEME_KEY = '__nativethink_ui_theme'/.test(THEME),
  '① 主题落盘的键是单点常量（不许各处手写字符串）');
ok(/UI_THEMES\.some\(\(t\) => t\.id === v\)/.test(THEME),
  '① 读盘值必须过注册表白名单（旧值/脏值回落 classic）');
ok(/removeAttribute\('data-ui-theme'\)/.test(THEME) && /setAttribute\('data-ui-theme', id\)/.test(THEME),
  '① classic = 摘掉 data-ui-theme（等价于"零覆盖"），其余写属性');
ok(/initUiTheme\(\)/.test(ROOT_TSX) && ROOT_TSX.indexOf('initUiTheme()') < ROOT_TSX.indexOf('createRoot('),
  '① initUiTheme() 在 createRoot 之前调用（否则首帧会闪回默认主题）');
ok(/dispatchEvent\(new CustomEvent<UiThemeId>\(UI_THEME_EVENT/.test(THEME) && /addEventListener\(UI_THEME_EVENT/.test(THEME),
  '① 切换会广播给其它实例（设置页与顶栏不会各显示一套）');

/* ── ② CSS：每个非 classic 主题都有覆盖块，classic 必须没有 ── */
for (const id of ids.filter((i) => i !== 'classic')) {
  const m = new RegExp(`html\\[data-ui-theme="${id}"\\]\\s*\\{([^}]*)\\}`);
  const hit = CSS.match(m);
  ok(!!hit && /--background:/.test(hit[1] || '') && /--primary:/.test(hit[1] || ''),
    `② ${id}：有 token 覆盖块，且至少改了 --background 与 --primary`);
  ok(new RegExp(`html\\.dark\\[data-ui-theme="${id}"\\]`).test(CSS),
    `② ${id}：暗色单独一块（深色背景沿用现有体系，只换强调色）`);
}
ok(!/html\[data-ui-theme="classic"\]/.test(CSS),
  '② 反向：classic 不许有覆盖块（它必须就是现在的界面，一个像素都不变）');

/* ── ③ 品牌色单点 ── */
ok(/--brand:\s*#00B894/.test(CSS) && /--brand-strong:\s*#00A080/.test(CSS) && /--brand-rgb:\s*0 184 148/.test(CSS),
  '③ :root 定义 --brand / --brand-strong / --brand-rgb（品牌色单一来源）');
for (const id of ids.filter((i) => i !== 'classic')) {
  ok(new RegExp(`html\\[data-ui-theme="${id}"\\][^{]*\\{[^}]*--brand:`).test(CSS),
    `③ ${id} 覆盖 --brand（按钮/图标/阴影会一起换）`);
}
const tsxFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })
  .map(String).filter((f) => /\.tsx$/.test(f)).map((f) => path.join('src', f));
const leftovers = tsxFiles.filter((f) => read(f).includes('#00B894')).map((f) => f.replace(/\\/g, '/'));
ok(leftovers.length === 0,
  '③ 全站 tsx 不再硬编码 #00B894（品牌色一律 var(--brand)，否则换主题时会留下一块绿）',
  JSON.stringify(leftovers.slice(0, 6)));

/* ── ④ 顶栏合并 ── */
const OLD = ['HelpGuide', 'AISettings', 'TTSSettings', 'ChangelogDialog'];
ok(OLD.every((n) => !new RegExp(`\\b${n}\\b`).test(HEADER)),
  '④ 顶栏不再直接挂 使用指南/朗读/AI/更新日志 四个面板', JSON.stringify(OLD.filter((n) => new RegExp(`\\b${n}\\b`).test(HEADER))));
ok(!/toggleTheme/.test(HEADER) && !/b23\.tv/.test(HEADER),
  '④ 顶栏不再有明暗切换与开发者主页入口（都进了设置）');
ok(/navigate\('\/settings'\)/.test(HEADER) && /aria-label="设置"/.test(HEADER),
  '④ 顶栏保留唯一入口：设置（aria-label 可被辅助技术读到）');
ok(/<GlobalWordSearch\s*\/>/.test(HEADER),
  '④ 全局搜索仍留在顶栏（高频动作，不埋进设置）');

/* ── ⑤ 设置页 ── */
ok(/TTSSettings trigger=\{<Row/.test(PAGE) && /AISettings trigger=\{<Row/.test(PAGE)
  && /HelpGuide trigger=\{<Row/.test(PAGE) && /ChangelogDialog trigger=\{<Row/.test(PAGE),
  '⑤ 四个面板都以「整行按钮」为 trigger 挂在设置页');
ok(/<button[^>]*\{\.\.\.rest\}/.test(PAGE) && /ButtonHTMLAttributes<HTMLButtonElement>/.test(read('src/pages/SettingsPage/SettingsPage.tsx')),
  '⑤ 自定义 Row 必须把 asChild 注入的 props 展开到真正的 <button> 上 —— 只接 icon/label/desc 时按钮点得动但面板不打开（第一版就是这么翻的）；' +
  '断言要钉"展开发生在按钮上"，光看签名里有 ...rest 会漏');
ok(/UI_THEMES\.map/.test(PAGE) && /setUiTheme\(t\.id\)/.test(PAGE),
  '⑤ 外观区由注册表渲染色卡（新增主题只改注册表，不改页面）');
ok(/GOAL_OPTIONS\.map/.test(PAGE) && /setDailyGoal\(min\)/.test(PAGE),
  '⑤ 每日目标在设置页直接生效（不再套一层弹窗）');

/* ── ⑥ 路由与导航 ── */
ok(/const SettingsPage = lazy\(\(\) => import\("@\/pages\/SettingsPage\/SettingsPage"\)\)/.test(APP)
  && /path="settings"/.test(APP),
  '⑥ /settings 路由已注册（lazy + ErrorBoundary）');
ok(/\{ path: '\/settings', label: '设置'/.test(SIDEBAR) && /'\/settings': \(\) => import\('@\/pages\/SettingsPage\/SettingsPage'\)/.test(SIDEBAR),
  '⑥ 侧边栏有条目且带预取');

const pass = results.filter((r) => r.pass).length;
for (const r of results) if (!r.pass) console.log(`✗ ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n设置与主题守卫 ${pass}/${results.length} 通过${pass === results.length ? ' ✓' : ''}`);
process.exit(pass === results.length ? 0 : 1);
