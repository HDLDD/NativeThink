#!/usr/bin/env node
/**
 * verify-imports-tracked.mjs —— 「源码里 import 了的东西，必须真的在 git 树里」。
 *
 * 为什么会写它：2026-10-20 提交 `7295b55` 用路径限定 `git commit -- <paths>` 收了整层按压词汇，
 * 却漏掉了新建的 `src/components/fx/ResultFx.tsx`。`FlashcardMode.tsx` 的
 * `import { StreakRing } from '@/components/fx/ResultFx'` 照样提交 —— 于是**仓库里有一条指向不存在文件的 import**。
 * 本机 typecheck、build、全部守卫**全都是绿的**（因为文件就在我磁盘上躺着），
 * 只有从干净 checkout 构建才会炸。这类缺陷的共同点：验证通道看的不是仓库，是我的工作目录。
 *
 * 所以这条守卫只做一件事：把 src/ 下每一条 import 解析成文件路径，然后问两句话
 *   ① 这个文件存在吗？   ② 这个文件被 git 跟踪吗？
 * 第二问才是本守卫的价值 —— 第一问在有完整工作目录的机器上永远为真。
 *
 * 用法: node scripts/verify-imports-tracked.mjs
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
/** Windows 上 path.join 会吐反斜杠，git 只认正斜杠 —— 比较前一律归一 */
const fwd = (s) => s.replace(/\\/g, '/');

/** 剥注释必须走编译器（本仓的老坑：JSX 里的 `accept="video/*"` 这类字符串会骗掉裸正则） */
const transpile = (src) => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, removeComments: true },
}).outputText;

/** 只收源码，不收构建产物 */
const listSource = () => fs.readdirSync(path.join(ROOT, 'src'), { withFileTypes: true, recursive: true })
  .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
  .map((d) => fwd(path.join(d.parentPath ?? d.path, d.name).slice(ROOT.length + 1)));

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g;
const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.css'];
const candidates = (p) => EXT.map((e) => p + e).concat(EXT.slice(1).map((e) => `${p}/index${e}`));

/** 把说明符解析成候选文件路径（Vite 的 @/ 别名与相对路径）；裸包名返回 null */
const resolveSpec = (spec, fromFile) => {
  if (spec.startsWith('@/')) return candidates('src/' + spec.slice(2));
  if (spec.startsWith('.')) return candidates(fwd(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec))));
  return null;
};

const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean),
);
const isTracked = (rel) => tracked.has(fwd(rel));

const files = listSource();
const missing = [];
const untracked = [];
let checked = 0;
for (const rel of files) {
  const src = transpile(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  for (const m of src.matchAll(SPEC)) {
    const spec = m[2];
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(spec)) continue;      // data:/http: 之类
    const cands = resolveSpec(spec, rel);
    if (!cands) continue;
    checked++;
    const onDisk = cands.find((c) => fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile());
    if (!onDisk) { missing.push(`${rel}  →  ${spec}`); continue; }
    if (!isTracked(onDisk)) untracked.push(`${rel}  →  ${spec}（解析为 ${onDisk}：磁盘上有、git 里没有）`);
  }
}

ok(files.length > 100, `⓪ 扫到了 src/ 下的源码文件（当前 ${files.length} 个 .ts/.tsx）`);
ok(checked > 200, `⓪ 解析出足够多的 import 说明符（当前 ${checked} 条）—— 太少说明扫描器自己坏了`);
ok(missing.length === 0, `① 每条相对/@ 的 import 都能在磁盘上解析到一个真实文件（找不到 ${missing.length} 条）`, missing.slice(0, 6).join(' | '));
ok(untracked.length === 0,
  '② **每条解析得到的 import 目标都被 git 跟踪**（漏提交的新文件就是这条；本机的 typecheck/build/其他守卫全都看不见）',
  untracked.slice(0, 6).join(' | '));

/* ③ 自证：解析与跟踪判定都要能报红，否则前两条是恒真断言 */
ok(candidates('src/__no_such_module_xyz__').some((c) => fs.existsSync(path.join(ROOT, c))) === false,
  '③ 正对照：故意解析一个不存在的模块，必须解析不出来（否则①是恒真）');
ok(isTracked('src/app.tsx') === true && isTracked('src/__definitely_not_committed__.tsx') === false,
  '③ 正对照：跟踪判定对"在树里的"与"不在树里的"给出不同答案（否则②是恒真）');
ok([...transpile('const a = 1; // from "./commented-out"\n/* import "./in-block" */').matchAll(SPEC)].length === 0,
  '④ 行注释与块注释里的 import 一律不计数（剥注释走转译器，不用裸正则）');
/* ⑤ 别名与扩展名两套解析都要真跑过，不能只靠一种命中撑着计数 */
const aliasHits = files.filter((f) => /from ['"]@\//.test(transpile(fs.readFileSync(path.join(ROOT, f), 'utf8')))).length;
ok(aliasHits > 20, `⑤ 有 ${aliasHits} 个文件在用 @/ 别名 import（别名解析这条路真的在跑）`);

const pass = results.filter((r) => r.pass).length;
for (const r of results) if (!r.pass) console.log(`✗ ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\nimport 目标必须被 git 跟踪 ${pass}/${results.length} 通过${pass === results.length ? ' ✓' : ''}`);
process.exit(pass === results.length ? 0 : 1);
