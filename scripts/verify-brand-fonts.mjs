#!/usr/bin/env node
/**
 * verify-brand-fonts.mjs — 品牌字体自托管的回归守卫（ROADMAP #7，2026-10-05）。
 *
 * 背景：index.html 原从 fonts.googleapis.com 拉 Plus Jakarta Sans + Noto Sans SC。
 * 大陆直连该域名不可达 —— 每条路由控制台报一次资源错误，字体从未生效
 * （旧链接是 media="print" 非阻塞加载，所以只是"长得不是设计稿那套字"）。
 * 改为自托管：@fontsource 官方重打包的 latin 子集（与 Google 同一份 woff2），
 * 中文不再加载网页字、走系统字回退栈。
 *
 * 本脚本钉住三段契约：
 *   A. 源侧：index.html 零外链字体域名；@font-face 恰三条（400/600/700）指向本地
 *      /fonts/*.woff2；woff2 是真文件（magic + header 声明长度与文件长度自洽，
 *      防占位/截断）；OFL 许可证随附（重分发合规）；**icon 链接零 http 外链**
 *      （2026-10-05 清理：原挂着模板遗留的 lf3-static.bytednsdoc.com shortcut icon。
 *      本机 Chromium 判别实验（A/B/C/D 四组并列 icon）：带 type 的 SVG 无论前后都被选中、
 *      同型取先声明者 —— 原形态下该外链 URL 从未被请求，属惰性残留；但取舍是浏览器
 *      实现细节（不支持 SVG favicon 的老浏览器可能选中它），属真实外部依赖，删之）
 *   B. 字体栈：tailwind-theme.css 两处 --font-sans 都不含 'Noto Sans SC'，
 *      且都以 'Plus Jakarta Sans' 开头（正对照：不是删外链了事，品牌字仍是首选）
 *   C. 产物侧（先 npm run build:web）：dist/client 的 index/404 无外链字体域名、
 *      无外链 icon、@font-face 在位、fonts/ 资产结构自洽、构建出的 CSS 里生效栈已换
 *
 * 注意本文件所有"不许出现 X"的扫描都先剥注释 —— index.html 与 tailwind-theme.css
 * 的溯源注释里写着旧域名和 'Noto Sans SC' 字样，不剥会把自己判红（chain-verdict 教训）。
 *
 * 用法：node scripts/verify-brand-fonts.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let pass = 0, fail = 0, skipped = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};
const skip = (label) => { skipped++; console.log('  ․ ' + label); };

const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const EXTERNAL_FONT = /fonts\.(googleapis|gstatic)\.com/;

/* ── A. 源侧：index.html ── */
const htmlCode = stripHtmlComments(read('index.html'));

if (EXTERNAL_FONT.test(htmlCode)) {
  check(false, 'index.html 无 Google Fonts 外链（剥注释后）', (htmlCode.match(EXTERNAL_FONT) || [])[0]);
} else {
  check(true, 'index.html 无 Google Fonts 外链（剥注释后）');
}

const faces = [...htmlCode.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
check(faces.length === 3, 'index.html 恰有 3 条 @font-face', `faces=${faces.length}`);
check(faces.every((f) => /'Plus Jakarta Sans'/.test(f)),
  '三条 @font-face 均为 Plus Jakarta Sans（品牌字体本体）');

const weights = faces.map((f) => (f.match(/font-weight:\s*(\d+)/) || [])[1]).sort().join(',');
check(weights === '400,600,700', '三条 @font-face 权重为 400/600/700（与旧外链等价）', weights);

const faceSrcs = faces.map((f) => (f.match(/url\(([^)]+)\)/) || [])[1] || '');
check(faceSrcs.length === 3 && faceSrcs.every((u) => /^\/fonts\/[\w.-]+\.woff2$/.test(u)),
  '所有 @font-face src 走本地 /fonts/*.woff2 绝对路径（无 http 外链）', faceSrcs.join(' '));

const woffFiles = faceSrcs.map((u) => join(ROOT, 'public', u.replace(/^\//, '')));
check(woffFiles.every((p) => existsSync(p)),
  'public/fonts 下被引用的 woff2 全部真实存在',
  woffFiles.filter((p) => !existsSync(p)).map((p) => basename(p)).join(', '));

for (const p of woffFiles) {
  if (!existsSync(p)) { check(false, `woff2 结构自洽：${basename(p)}`, '文件缺失'); continue; }
  const buf = readFileSync(p);
  const magic = buf.subarray(0, 4).toString('latin1');
  const declared = buf.length >= 12 ? buf.readUInt32BE(8) : -1;
  check(magic === 'wOF2' && declared === buf.length,
    `woff2 结构自洽：${basename(p)}`, `magic=${magic} 文件长=${buf.length} header 声明=${declared}`);
}

const license = existsSync(join(ROOT, 'public/fonts/LICENSE.txt')) ? read('public/fonts/LICENSE.txt') : '';
check(/SIL Open Font License/i.test(license),
  'public/fonts/LICENSE.txt 随附 OFL 许可证（字体重分发合规）');

/* icon 链接（favicon / apple-touch-icon / mask-icon）：与字体同口径，零 http 外链。
   取所有 <link> 标签后按 rel 含 "icon" 过滤（兼容引号风格与属性顺序），
   正对照防止"把图标删干净"这种假达标。 */
const tagList = (s) => [...s.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
  .filter((tag) => /rel\s*=\s*["']?[^"'>]*icon/i.test(tag));
const iconTags = tagList(htmlCode);
const extIcons = iconTags.filter((tag) => /href\s*=\s*["']?https?:\/\//i.test(tag));
check(extIcons.length === 0, 'index.html 的 icon 链接零 http 外链（favicon 自托管）', extIcons.join(' '));
check(iconTags.some((tag) => /href\s*=\s*["']?\/favicon\.svg["']?/i.test(tag))
  && existsSync(join(ROOT, 'public', 'favicon.svg')),
  '正对照：本地 /favicon.svg 链接在位且文件存在（不是把图标删了了事）');

/* ── B. 字体栈：tailwind-theme.css ── */
const css = stripCssComments(read('src/tailwind-theme.css'));
check(!/Noto Sans SC/.test(css),
  "tailwind-theme.css 不再引用 'Noto Sans SC'（中文走系统字栈）",
  (css.match(/[^\n]*Noto Sans SC[^\n]*/) || [])[0] || '');

const stacks = [...css.matchAll(/--font-sans:\s*([^;]+);/g)]
  .map((m) => m[1].replace(/\s+/g, ' ').trim());
check(stacks.length === 2, '抓到两处 --font-sans 声明（Lark 栈 + @theme 栈）', `stacks=${stacks.length}`);
check(stacks.every((s) => s.startsWith("'Plus Jakarta Sans'")),
  '两处 --font-sans 都以 Plus Jakarta Sans 开头（正对照：品牌字仍是首选）',
  JSON.stringify(stacks.map((s) => s.slice(0, 40))));

/* ── C. 产物侧：dist/client（先 npm run build:web） ── */
const DIST = join(ROOT, 'dist', 'client');
if (!existsSync(join(DIST, 'index.html'))) {
  skip('C 没有 dist/client 产物，产物段跳过（先 npm run build:web 再跑本脚本）');
} else {
  for (const f of ['index.html', '404.html']) {
    const abs = join(DIST, f);
    if (!existsSync(abs)) { skip(`C 产物缺 ${f}，跳过`); continue; }
    const d = stripHtmlComments(readFileSync(abs, 'utf8'));
    check(!EXTERNAL_FONT.test(d), `C 产物 ${f} 无外链字体域名`);
    const dExtIcons = tagList(d).filter((tag) => /href\s*=\s*["']?https?:\/\//i.test(tag));
    check(dExtIcons.length === 0, `C 产物 ${f} 的 icon 链接零 http 外链`, dExtIcons.join(' '));
    const dfs = [...d.matchAll(/@font-face\s*\{[^}]*\}/g)].length;
    check(dfs === 3, `C 产物 ${f} 有 3 条 @font-face`, `faces=${dfs}`);
  }

  const distFonts = [...readdirSync(join(DIST, 'fonts')).filter((f) => f.endsWith('.woff2'))];
  check(distFonts.length === 3, 'C 产物 dist/client/fonts 有 3 个 woff2', distFonts.join(', '));
  check(woffFiles
    .map((p) => basename(p))
    .every((n) => distFonts.includes(n)),
    'C 产物 fonts/ 覆盖 index.html 引用的全部文件名');

  const cssFiles = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.css'));
  check(cssFiles.length > 0, 'C 产物找到构建出的 CSS', `files=${cssFiles.length}`);
  const badCss = cssFiles.filter((f) => /Noto Sans SC/.test(readFileSync(join(DIST, 'assets', f), 'utf8')));
  check(badCss.length === 0, "C 构建产物 CSS 不含 'Noto Sans SC'", badCss.join(', '));
  const goodCss = cssFiles.filter((f) => {
    const c = readFileSync(join(DIST, 'assets', f), 'utf8');
    return /--font-sans:[^;]*Plus Jakarta Sans/.test(c);
  });
  check(goodCss.length > 0, 'C 构建产物 CSS 的 --font-sans 生效栈含 Plus Jakarta Sans（正对照）');
}

/* ── 汇总 ── */
console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${skipped ? `（另有 ${skipped} 条跳过）` : ''}${fail ? '' : ' ✓'}`);
if (fail) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
