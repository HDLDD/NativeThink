/**
 * verify-all.mjs — 一次跑完全部契约守卫 + typecheck，打印每条的结果与总计。
 *
 * 为什么要它（2026-09-30 真实教训）：改完一个模块只跑"自己那条"守卫，会让**引用同一份源码**的
 * 其他守卫悄悄失效（复习词汇文章改造当天 verify-rv-articles 全绿，verify-books-meta 里盯同一处
 * 写法的断言却早已不成立）。收尾跑全量是唯一能发现这种漂移的方式。
 *
 * 用法：
 *   node scripts/verify-all.mjs              # 跑全部（bundle-budget 需要先 build:web，缺失会跳过并说明）
 *   node scripts/verify-all.mjs --skip-build # 明确跳过依赖产物的那条
 */
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

/** 需要 dist/client 产物的守卫（先 `npm run build:web`） */
const NEEDS_BUILD = ['verify-bundle-budget.mjs'];
/** 需要浏览器/网络的守卫在这里排除，保持这条命令能在纯 Node 里跑完 */
/** 需要外部参数的守卫（自己单独跑）：verify-wordbank-split 要 --baseline/--check 的基线文件 */
const NEEDS_ARGS = ['verify-wordbank-split.mjs'];
const results = [];
let red = 0;

function run(label, argv, envExtra) {
  const t0 = Date.now();
  try {
    const out = execFileSync(argv[0], argv.slice(1), {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(envExtra || {}) },
    });
    const line = String(out).split('\n').map((l) => l.trim()).filter((l) => /通过|passed|全部/.test(l)).pop() || 'ok';
    results.push({ label, ok: true, line, ms: Date.now() - t0 });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const firstFail = (out.match(/✗ [^\n]+/) || [''])[0];
    const line = (out.split('\n').map((l) => l.trim()).filter((l) => /通过|失败|✗/.test(l)).pop()) || `退出码 ${e.status}`;
    results.push({ label, ok: false, line, firstFail, ms: Date.now() - t0 });
    red++;
  }
}

run('typecheck', ['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.app.json']);

const scripts = readdirSync(join(ROOT, 'scripts'))
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mjs') && f !== 'verify-all.mjs')
  .sort();

for (const f of scripts) {
  if (NEEDS_ARGS.includes(f)) {
    results.push({ label: f, ok: true, skipped: true, line: '跳过（需要 --baseline/--check 基线文件，改词库拆分时单独跑）', ms: 0 });
    continue;
  }
  if (NEEDS_BUILD.includes(f) && !existsSync(join(ROOT, 'dist/client/index.html'))) {
    results.push({ label: f, ok: true, skipped: true, line: '跳过（没有 dist/client 产物；先 npm run build:web 再跑）', ms: 0 });
    continue;
  }
  if (args.includes('--skip-build') && NEEDS_BUILD.includes(f)) continue;
  run(f, ['node', join('scripts', f)]);
}

const width = Math.max(...results.map((r) => r.label.length));
console.log('');
for (const r of results) {
  const mark = r.skipped ? '–' : r.ok ? '✓' : '✗';
  console.log(`${mark} ${r.label.padEnd(width)}  ${r.line}`);
  if (r.firstFail) console.log(`  ${' '.repeat(width + 3)}${r.firstFail}`);
}
const ran = results.filter((r) => !r.skipped).length;
console.log('');
console.log(red === 0
  ? `全量守卫：${ran} 项全部通过 ✓（跳过 ${results.length - ran} 项）`
  : `全量守卫：${red} 项失败 ✗（共跑 ${ran} 项）`);
process.exit(red === 0 ? 0 : 1);
