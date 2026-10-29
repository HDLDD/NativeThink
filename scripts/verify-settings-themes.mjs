#!/usr/bin/env node
/**
 * verify-settings-themes.mjs —— 设置页 + 可切换外观主题的契约。
 *
 * 两条用户要求（2026-10-20）：
 *   ① 保留原主题；新外观做成可来回切换的配置（明暗之外的第二维）。
 *   ② 顶栏那些功能（使用指南 / 朗读配置 / AI / 每日目标 / 更新日志 / 开发者主页）合并进"设置"。
 *
 * 这个守卫盯的是"接得对不对"与暗色表面/文字对比度；观感最终仍以真机/浏览器读数为准。
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
ok(ids.length === 6 && ids.includes('classic') && new Set(ids).size === 6,
  '① 主题注册表恰好六套且含 classic（默认）', JSON.stringify(ids));
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
  '② 反向：classic 不许有覆盖块（它直接使用 :root 的墨壳/纸面基线）');

/* ── ③ 品牌色单点 ── */
ok(/--brand:\s*#00B894/.test(CSS) && /--brand-strong:\s*#00A080/.test(CSS) && /--brand-rgb:\s*0 184 148/.test(CSS),
  '③ :root 定义 --brand / --brand-strong / --brand-rgb（品牌色单一来源）');
for (const id of ids.filter((i) => i !== 'classic')) {
  ok(new RegExp(`html\\[data-ui-theme="${id}"\\][^{]*\\{[^}]*--brand:`).test(CSS),
    `③ ${id} 覆盖 --brand（按钮/图标/阴影会一起换）`);
}
const tsxFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })
  .map(String).filter((f) => /\.tsx$/.test(f)).map((f) => path.join('src', f));
const leftovers = tsxFiles.filter((f) => {
  const s = read(f);
  return s.includes('#00B894') || s.includes('#00a882');
}).map((f) => f.replace(/\\/g, '/'));
ok(leftovers.length === 0,
  '③ 全站 tsx 不再硬编码 #00B894 / 旧 hover #00a882（品牌色一律 var(--brand)，否则换主题时会留下一块绿）',
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
ok(/aria-label="返回"/.test(PAGE) && /location\.key === 'default'[\s\S]{0,80}navigate\('\/'\)[\s\S]{0,60}navigate\(-1\)/.test(PAGE),
  '⑤ 左上角有返回：没有来源页（location.key === default）回首页，从其它页进来则原路返回');

/* ── ⑥ 路由与导航 ── */
ok(/const SettingsPage = lazy\(\(\) => import\("@\/pages\/SettingsPage\/SettingsPage"\)\)/.test(APP)
  && /path="settings"/.test(APP),
  '⑥ /settings 路由已注册（lazy + ErrorBoundary）');
ok(/\{ path: '\/settings', label: '设置'/.test(SIDEBAR) && /'\/settings': \(\) => import\('@\/pages\/SettingsPage\/SettingsPage'\)/.test(SIDEBAR),
  '⑥ 侧边栏有条目且带预取');

/* ── ⑦ 明暗 token 对比度与暗色表面完整（2026-10-29） ──
 * 曾经：暗色只换强调色，主题亮色块凭选择器特异性压过 .dark 的 --background/--card，
 * 结果电蓝/石墨/青柠切暗色后还是亮纸面，而文字已切亮色 → 实测对比度 1.0–2.0。
 * 这条按 token 真算对比，而不是只看“有没有暗色块”。 */
const BASE_CSS = stripCss(read('src/tailwind-theme.css'));
const parseVars = (block) => {
  const out = {};
  for (const m of (block || '').matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};
const allVars = (selector, src) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  const out = {};
  let m;
  while ((m = re.exec(src))) Object.assign(out, parseVars(m[1]));
  return out;
};
const varsFor = (id, dark) => {
  if (id === 'classic') {
    return { ...allVars(':root', BASE_CSS + '\n' + CSS), ...allVars(dark ? '.dark' : ':root', BASE_CSS) };
  }
  return allVars(dark ? `html.dark[data-ui-theme="${id}"]` : `html[data-ui-theme="${id}"]`, CSS);
};
const parseColor = (raw) => {
  if (!raw) return null;
  const h = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) {
    let x = h[1];
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16) };
  }
  const m = raw.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
};
const luminance = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const WHITE = { r: 255, g: 255, b: 255 };
const darkSurfaces = ['--background', '--card', '--card-foreground', '--popover', '--popover-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground', '--border', '--input',
  '--sidebar', '--sidebar-foreground', '--sidebar-accent', '--sidebar-border'];
for (const id of ids) {
  const problems = [];
  for (const [mode, v] of [['亮色', varsFor(id, false)], ['暗色', varsFor(id, true)]]) {
    const bg = parseColor(v['--background']);
    for (const [token, min] of [['--ink-teal', 4.5], ['--muted-foreground', 4.5], ['--foreground', 7]]) {
      const c = parseColor(v[token]);
      const r = bg && c ? contrast(c, bg) : 0;
      if (r < min) problems.push(`${mode} ${token} ${r.toFixed(2)}<${min}`);
    }
    const brand = parseColor(v['--brand']), onBrand = parseColor(v['--on-brand']);
    const r = brand && onBrand ? contrast(brand, onBrand) : 0;
    if (r < 4.5) problems.push(`${mode} on-brand ${r.toFixed(2)}<4.5`);
  }
  const missing = darkSurfaces.filter((k) => !varsFor(id, true)[k]);
  if (missing.length) problems.push(`暗色表面缺 ${missing.join(',')}`);
  ok(problems.length === 0, `⑦ ${id}：明暗文字对比度达标，暗色块自带完整表面 token`, problems.slice(0, 4).join('；'));
}
const darkBrandWhiteBad = ids.filter((id) => id !== 'classic').filter((id) => {
  const brand = parseColor(varsFor(id, true)['--brand']);
  return !brand || contrast(brand, WHITE) < 4.5;
});
ok(darkBrandWhiteBad.length === 0,
  '⑦ 非 classic 主题的暗色 --brand 与白字对比度 ≥4.5（组件仍大量把 text-white 放在 brand 填充上）',
  JSON.stringify(darkBrandWhiteBad));
const USE_THEME = code('src/lib/use-theme.ts');
ok(/export function initThemeMode/.test(USE_THEME) && /classList\.toggle\('dark'/.test(USE_THEME),
  '⑦ 明暗有 initThemeMode（挂载前应用，深色刷新不闪白）');
ok(/initThemeMode\(\)/.test(ROOT_TSX) && ROOT_TSX.indexOf('initThemeMode()') < ROOT_TSX.indexOf('createRoot('),
  '⑦ initThemeMode() 在 createRoot 之前调用');
ok(/useState(?:<Theme>)?\(\(\) => readThemeMode\(\)\)/.test(USE_THEME),
  '⑦ useTheme 的初始状态直接读盘（否则 effect 会先把 dark 摘掉再装回）');

const pass = results.filter((r) => r.pass).length;
for (const r of results) if (!r.pass) console.log(`✗ ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n设置与主题守卫 ${pass}/${results.length} 通过${pass === results.length ? ' ✓' : ''}`);
process.exit(pass === results.length ? 0 : 1);
