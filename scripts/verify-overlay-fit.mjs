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
import { readFileSync } from 'node:fs';
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

console.log('');
console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
if (fail) {
  failures.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
