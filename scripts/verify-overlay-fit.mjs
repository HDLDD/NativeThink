/**
 * verify-overlay-fit.mjs — 「窄视口下浮层必须看得见、点得到」的回归防线。
 *
 * 起因（两次真机/实测缺陷，同一类）：
 *  ① 朗读设置在 APK 里滑不到底 —— 语速、测试声音、朗读自检永远点不到（2026-09-28 已修）。
 *     根因：Popover 是 portal 浮层，页面滚动救不了它；旧写法只有 overflow-hidden 又没有高度
 *     上限，内容一超过视口就被裁掉。
 *  ② AI 模型设置在 393×600 下**上下各被裁 43px**（2026-09-29 实测）—— 标题与底部「选用/测试」
 *     一起跑到视口外。根因：Dialog 用 translate-y-[-50%] 居中，内容比视口高时两头一起溢出，
 *     而模态框锁住了背后页面的滚动。同一屏还把两列卡片压成「一字一行」。
 *
 * 统一修法（本脚本守的就是这套）：外层夹可用高度 + 竖排 → 标题 shrink-0 → 正文
 * flex-1 min-h-0 overflow-y-auto overscroll-contain；正文里不再嵌第二层小滚动（手机上手势会被它吃掉）。
 *
 * 局限：本脚本只做静态契约检查。**几何上的真凭据**是无头 Chrome + CDP 逐浮层量矩形
 * （393×600 / 393×500 / 1280×800 三档，被裁数 0/6），改完这套类名请照该方式复量一次。
 *
 * 用法：node scripts/verify-overlay-fit.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 抓某个组件里某段 JSX 开标签的 className（字面量或 cn() 的第一个参数）；抓不到就当场报红 */
function classNameOf(src, tagRe, label) {
  const scope = src.match(new RegExp(tagRe.source + '[\\s\\S]{0,700}'))?.[0] || '';
  const m = scope.match(/className="([^"]*)"/) || scope.match(/className=\{cn\(\s*"([^"]*)"/);
  check(!!m, `脚手架自检：抓到 ${label} 的 className`);
  return m ? m[1] : '';
}

/* ───────────── 1. Dialog 基座：所有模态框共用的兜底 ───────────── */
{
  const dlg = read('src/components/ui/dialog.tsx');
  const cls = classNameOf(dlg, /DialogPrimitive\.Content/, 'DialogContent 基座');
  check(/max-h-\[calc\(100dvh-2rem\)\]/.test(cls), 'DialogContent 基座夹住视口高度（不再靠 translate 居中两头溢出）', cls.slice(0, 60));
  check(/overflow-y-auto/.test(cls), 'DialogContent 基座自带滚动兜底（子级没做内部滚动时也能滚到）');
  check(/overscroll-contain/.test(cls), 'DialogContent 基座 overscroll-contain（滚到底不带动背后页面）');
}

/* ───────────── 2. AI 模型设置（2026-09-29 被裁 43px 的那个） ───────────── */
{
  const src = read('src/components/AISettings.tsx');
  const cls = classNameOf(src, /<DialogContent/, 'AISettings DialogContent');
  check(/flex flex-col/.test(cls) && /max-h-\[calc\(100dvh-2rem\)\]/.test(cls),
    'AI 设置：外层竖排 + 夹高度（标题固定、正文自己滚）', cls.slice(0, 70));
  check(!/max-h-\[60vh\]/.test(src), 'AI 设置：不留 60vh 这类"按视口比例"的假上限（矮屏上仍然超）');

  const header = (src.match(/<div className="p-6 border-b[^"]*"/) || [])[0] || '';
  check(header.includes('shrink-0'), 'AI 设置：标题栏 shrink-0（被正文挤没就等于没了）', header.slice(0, 50));

  const body = (src.match(/<div className="p-6 flex-1[^"]*"/) || [])[0] || '';
  check(body.includes('flex-1') && body.includes('min-h-0') && body.includes('overflow-y-auto') && body.includes('overscroll-contain'),
    'AI 设置：正文 flex-1 min-h-0 overflow-y-auto overscroll-contain', body.slice(0, 60));

  // 窄屏单列：393px 塞两列会把「智谱免费·出厂」压成竖排一字一行（截图确证）
  const grid = (src.match(/<div className="grid grid-cols-[^"]*"/) || [])[0] || '';
  check(/grid-cols-1 sm:grid-cols-2/.test(grid), 'AI 设置：手机单列、≥sm 才两列', grid.slice(0, 60));
}

/* ───────────── 3. 朗读设置（APK 滑不到底的那个，2026-09-28 修） ───────────── */
{
  const src = read('src/components/TTSSettings.tsx');
  const cls = classNameOf(src, /<PopoverContent/, 'TTSSettings PopoverContent');
  check(/max-h-\[calc\(var\(--radix-popover-content-available-height\)-1\.5rem\)\]/.test(cls),
    '朗读设置：按 Radix 给的可用高度夹顶（浮层不吃页面滚动，只能自己夹）', cls.slice(0, 70));
  check(/flex flex-col/.test(cls), '朗读设置：竖排');
  const header = (src.match(/<div className="p-5 border-b[^"]*"/) || [])[0] || '';
  check(header.includes('shrink-0'), '朗读设置：标题栏 shrink-0');
  const body = (src.match(/<div className="p-5 space-y-5[^"]*"/) || [])[0] || '';
  check(body.includes('flex-1') && body.includes('min-h-0') && body.includes('overflow-y-auto'),
    '朗读设置：正文 flex-1 min-h-0 overflow-y-auto', body.slice(0, 60));
  // 正文里再套一层 max-h + overflow 的小滚动，会把手机滑动手势吃掉 → 底部控件又点不到
  check(!/max-h-4[48][^"]*overflow-y-auto/.test(src), '朗读设置：音色网格等不再嵌第二层小滚动');
}

// ── ④ 全屏浮层必须自己补 safe-area（2026-09-30 真机反馈：AI 生成文章顶部被状态栏压住）──
{
  const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8');
  check(/\.safe-area-top \{ padding-top: env\(safe-area-inset-top, 0px\); \}/.test(css),
    '④ safe-area-top 工具类有定义（历史上 safe-area-bottom 曾"用了但没定义"）');
  check(/\.safe-area-bottom \{ padding-bottom: env\(safe-area-inset-bottom, 0px\); \}/.test(css),
    '④ safe-area-bottom 工具类有定义');

  const reader = readFileSync(join(ROOT, 'src/pages/ArticlePage/components/PageReader.tsx'), 'utf8');
  // 阅读器是 `fixed inset-0` 的全屏浮层 —— 它跳出了 Layout 外壳那层内缩，所以必须自己补
  const rootLine = (reader.match(/'fixed inset-0[^']*'/) || [''])[0];
  check(rootLine.length > 0, '④ 阅读器根节点可定位（正对照的前提）');
  check(rootLine.includes('safe-area-top'),
    '④ 阅读器根节点带 safe-area-top（否则 Android 15+ edge-to-edge 下顶栏被 47px 状态栏整个压住）', rootLine);
  check(rootLine.includes('safe-area-bottom'), '④ 阅读器根节点带 safe-area-bottom（底部翻页条不被手势条压住）');
  // 正对照：不许有第二个"贴顶内容层"漏掉内缩。
  // 正则要同时吃单/双引号 —— 第一版只匹配单引号，把双引号写的 className 全漏了；
  // 而扫描前必须先剥注释，否则我们自己写在注释里的 `fixed inset-0` 会被当成一个浮层（第二版就是这么红的）。
  const readerCode = reader.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const overlays = [...readerCode.matchAll(/["'`]fixed inset-0[^"'`]*["'`]/g)].map((m) => m[0]);
  check(overlays.length >= 2, '④ 阅读器文件里的全屏层都能被扫到（正则覆盖单/双引号）', `扫到 ${overlays.length} 个`);
  const bad = overlays.filter((o) => !o.includes('safe-area-top') && !/items-center|bg-black\/|pointer-events-none/.test(o));
  check(bad.length === 0, '④ 阅读器里没有"贴顶内容层漏 safe-area"的第二处', JSON.stringify(bad));
}

/* ───────────── 5. 全站唯一 toast 出口（由已删的 verify-feedback-loop 迁移并强化） ─────────────
 * 史实（2026-09-28 实测）：只 import 了 sonner 的 toast() 却从未挂载 <Toaster />，
 * 所有 toast 提示全部静默 —— 反馈的"暂未送出"就这样无声无息过。
 * 迁移理由：反馈功能整体下架（2026-10-05），但"提示出口必须挂载且唯一"与反馈无关，是站级契约。
 */
{
  const root = read('src/index.tsx');
  check(/import \{ Toaster \} from ["']@\/components\/ui\/sonner["']/.test(root), '⑤ 根节点导入 Toaster');
  check(/<Toaster[\s\S]{0,220}position="top-center"/.test(root), '⑤ 根节点挂载 <Toaster />（所有 toast 可见的前提）');
  check(/mobileOffset/.test(root), '⑤ 手机版 toast 位置避让状态栏（edge-to-edge）');

  // 强化正对照：全仓只允许 src/index.tsx 一处挂载 —— 挂第二次会出双份 toast。
  // 扫描前必须剥注释：use-cloud-sync.ts 的说明文字里就写着 `<Toaster />`，
  // 不剥会把注释当成第二个挂载点（同类误报在 ④ 已踩过一次）。
  const stripComments = (s) => s.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const mounts = [];
  for (const rel of readdirSync(join(ROOT, 'src'), { recursive: true })) {
    if (!/\.(tsx|ts)$/.test(rel)) continue;
    const code = stripComments(readFileSync(join(ROOT, 'src', rel), 'utf8'));
    if (/<Toaster\b/.test(code)) mounts.push(rel.replace(/\\/g, '/'));
  }
  check(mounts.length === 1 && mounts[0] === 'index.tsx',
    '⑤ 全仓只有 src/index.tsx 一处挂载 <Toaster />（重复挂载出双份 toast）', JSON.stringify(mounts));

  // Header 是非沉浸模式的常驻挂载点（帮助/搜索/主题等入口的家），反馈没了它也得在
  const layout = read('src/components/Layout.tsx');
  check(/!focused && <Header\s*\/>/.test(layout), '⑤ Layout 在非沉浸模式下渲染 Header');
}

/* ───────────── 6. 移动端抽屉：导航之后必须自己让开（2026-10-05 真机 CDP 实测） ─────────────
 * 史实：在手机上从抽屉点「句子拼写」，路由确实变成 /spelling，但 `[role="dialog"]` 仍是
 * data-state=open、宽 288/视口 393，屏幕中心 elementFromPoint 命中的是抽屉里的 <a>，
 * 右侧 368px 命中的是抽屉那层整屏 portal 容器 —— **新页面整个被吞掉点击**，用户必须再点一次
 * 遮罩才能操作。6 个条目逐个测，每次都残留。
 * 根因：openMobile 只在 ui/sidebar.tsx 的 Sheet onOpenChange 里被改过，AppSidebar 的 NavLink
 * 没有任何"导航后关闭"的接线。桌面侧栏常驻所以完全无感 —— 静态检查看不见，只有真机看得见。
 * 为什么值得守：底部导航只放 6 项，13 个页面里另外 7 个**只能**从抽屉进，这条是手机主路径。
 */
{
  const sidebar = read('src/components/AppSidebar.tsx');
  const base = read('src/components/ui/sidebar.tsx');

  check(/const \{ setOpenMobile \} = useSidebar\(\)/.test(sidebar),
    '⑥ AppSidebar 取到 setOpenMobile（不接这根线，抽屉就永远不关）');
  check(/import \{[^}]*useSidebar[^}]*\} from '@\/components\/ui\/sidebar'/.test(sidebar),
    '⑥ useSidebar 从 ui/sidebar 导入');

  // 每个 NavLink 都必须挂关闭 —— 新增导航项时漏挂是静默失效（正是本次缺陷的形状）
  const chunks = sidebar.split('<NavLink').slice(1);
  check(chunks.length >= 1, '⑥ 抽屉导航项可定位（正对照的前提）', `扫到 ${chunks.length} 个 NavLink`);
  const noClose = chunks.filter((c) => !/onClick=\{\(\) => setOpenMobile\(false\)\}/.test(c.slice(0, 600)));
  check(noClose.length === 0,
    '⑥ 每个 NavLink 都挂了「导航后关抽屉」（漏一个就是那个页面点进去被抽屉盖住）',
    `漏挂 ${noClose.length} 处`);

  // 正对照：移动端确实是 Sheet 浮层（所以它会盖住页面），桌面是常驻侧栏（所以看不见这个缺陷）
  check(/if \(isMobile\) \{[\s\S]{0,260}<Sheet open=\{openMobile\} onOpenChange=\{setOpenMobile\}/.test(base),
    '⑥ 正对照：移动端走 Sheet(openMobile)，桌面走常驻侧栏 —— 同一段 JSX 两种形态');
  check(/export \{[\s\S]*useSidebar,?\s*\}/.test(base), '⑥ 正对照：ui/sidebar 确实导出 useSidebar');
  const navItems = (sidebar.match(/\{ path: '\/[a-z0-9-]*', label:/g) || []).length;
  check(navItems >= 13,
    '⑥ 抽屉仍承载全部 13 个页面入口（底部导航只有 6 项，其余只能靠它）', `NAV_ITEMS=${navItems}`);
}

// ── ⑦ useFramerMotion 必须有 LazyFramerProvider 祖先（缺了会抛错让整页崩） ──
{
  /**
   * 2026-10 真实事故：新增的 ChunkFlashcards 调 useFramerMotion()，
   * 但挂载它的 ChunkTrainingPage 没有 Provider —— hook 直接 throw，
   * ErrorBoundary 把整个语块页换成「页面出错」，而 library tab 却正常，
   * 表现成"切到某个 tab 就白屏"。typecheck 与 lint 都看不见这种缺线。
   */
  const walk = (dir, out = []) => {
    for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) walk(rel, out);
      else if (/\.tsx$/.test(ent.name)) out.push(rel);
    }
    return out;
  };
  const allTsx = walk('src');
  const users = allTsx.filter((f) => /useFramerMotion\(\)/.test(readFileSync(join(ROOT, f), 'utf8')));
  check(users.length >= 3, '⑦ 扫到使用 useFramerMotion 的组件（正对照的前提）', `扫到 ${users.length} 个`);

  const orphans = [];
  for (const f of users) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    // 自身渲染了 Provider → 放行（只认 JSX 用法，光 import 不算）
    if (/<LazyFramerProvider/.test(src)) continue;
    const name = f.split('/').pop().replace(/\.tsx$/, '');
    let wrapped = false;
    for (const host of allTsx) {
      if (host === f) continue;
      const hostSrc = readFileSync(join(ROOT, host), 'utf8');
      // 宿主必须渲染这个组件
      if (!new RegExp(`<${name}[\\s/>]`).test(hostSrc)) continue;
      // 宿主必须**真的用 JSX 渲染** Provider —— 只 import 不算（那是假绿：
      // 2026-10 复核时正是 import 语句让这条断言空转）
      if (/<LazyFramerProvider/.test(hostSrc)) { wrapped = true; break; }
    }
    if (!wrapped) orphans.push(f);
  }
  check(orphans.length === 0,
    '⑦ 每个 useFramerMotion 组件都被 <LazyFramerProvider> 包住（漏了 → 那个页面/tab 直接崩）',
    orphans.join(', '));

  // 正对照：hook 确实在缺 Provider 时抛错（证明这条断言不是空转）
  const framer = readFileSync(join(ROOT, 'src/lib/lazy-framer-motion.tsx'), 'utf8');
  check(/if \(!ctx\) throw new Error\('useFramerMotion must be used within <LazyFramerProvider>'\)/.test(framer),
    '⑦ 正对照：useFramerMotion 缺 Provider 时确实抛错（不是警告，是崩）');
}

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
