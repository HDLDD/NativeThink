#!/usr/bin/env node
/**
 * 追加式推送 —— 当远端 main 已被别的提交推进、本地与它分叉时使用。
 *
 * 场景（真实发生过）：同一仓库里还有另一条工作流在提交并推送，两条线在某个提交
 * 处分叉。此时常规推送会被拒绝（也不该强推覆盖别人的提交）。
 * 本脚本的做法：**以远端 tip 为父提交**，只把指定提交里改动的文件叠加到远端的树上，
 * 不动别人改过的文件 —— 是纯追加，不会丢任何人的提交。
 *
 * 安全措施：
 *  - 逐个文件比较「远端版本」与「我的父版本」；不一致说明双方都改过 → 跳过并报告，
 *    绝不覆盖（宁可少推一个文件，也不覆盖别人的改动）。
 *  - 推送后逐个校验远端树里的 blob 是否与本地一致。
 *
 * 用法: node scripts/git-push-onto-remote.cjs [commit] [--dry-run]
 *       （commit 省略时用 HEAD）
 */
const { execFileSync } = require('child_process');

const REPO = 'HDLDD/NativeThink';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const COMMIT = args.find((a) => !a.startsWith('--')) || 'HEAD';
const AUTHOR = { name: 'HDLDD', email: '3103721463@qq.com' };

const git = (...a) => execFileSync('git', a, { maxBuffer: 64 * 1024 * 1024 });
const gitU8 = (...a) => git(...a).toString('utf8').trim();
const gh = (apiArgs, input) =>
  JSON.parse(execFileSync('gh', ['api', ...apiArgs], { maxBuffer: 128 * 1024 * 1024, input }).toString());

const sha = gitU8('rev-parse', COMMIT);
const parent = gitU8('rev-parse', sha + '^');
const files = gitU8('diff', '--name-only', parent, sha).split('\n').filter(Boolean);
console.log(`提交 ${sha.slice(0, 12)}（父 ${parent.slice(0, 12)}）改动 ${files.length} 个文件`);

const tip = gh([`repos/${REPO}/git/ref/heads/main`]).object.sha;
const tipCommit = gh([`repos/${REPO}/git/commits/${tip}`]);
const tipTree = gh([`repos/${REPO}/git/trees/${tipCommit.tree.sha}?recursive=1`]);
const remote = new Map((tipTree.tree || []).map((x) => [x.path, x.sha]));
console.log(`远端 main ${tip.slice(0, 12)}：${tipCommit.message.split('\n')[0].slice(0, 60)}`);

const entries = [];
const skipped = [];
let already = 0;
for (const f of files) {
  const localBlob = gitU8('rev-parse', `${sha}:${f}`);
  let parentBlob = null;
  try { parentBlob = gitU8('rev-parse', `${parent}:${f}`); } catch { /* 新文件 */ }
  const remoteBlob = remote.get(f) ?? null;
  // 远端已经是我的这一版 → 上次已经推过，无需重复
  if (remoteBlob && remoteBlob === localBlob) { already++; continue; }
  // 远端既不是我的版本、也不是我父版本 → 别人也改过这个文件，跳过以免覆盖
  if (remoteBlob && remoteBlob !== parentBlob) {
    skipped.push(`${f}（远端已有他人改动，跳过以免覆盖）`);
    continue;
  }
  if (DRY) { entries.push({ path: f, sha: localBlob }); continue; }
  const content = git('cat-file', '-p', `${sha}:${f}`);
  const blob = gh([`repos/${REPO}/git/blobs`, '--input', '-'],
    JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }));
  entries.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
}
console.log(`将叠加 ${entries.length} 个文件` +
  (already ? `，${already} 个已是最新（跳过）` : '') +
  (skipped.length ? `，${skipped.length} 个与远端冲突：\n  ${skipped.join('\n  ')}` : ''));
if (entries.length === 0) {
  console.log('没有需要推送的内容' + (already ? '（远端已包含本提交的全部改动）' : ''));
  process.exit(0);
}
if (DRY) { entries.forEach((e) => console.log('  ' + e.path)); process.exit(0); }

const tree = gh([`repos/${REPO}/git/trees`, '--input', '-'],
  JSON.stringify({ base_tree: tipCommit.tree.sha, tree: entries }));
const iso = gitU8('log', '-1', '--format=%aI', sha);
const message = gitU8('log', '-1', '--format=%B', sha).replace(/\n+$/, '');
const commit = gh([`repos/${REPO}/git/commits`, '--input', '-'], JSON.stringify({
  message, tree: tree.sha, parents: [tip],
  author: { ...AUTHOR, date: iso },
  committer: { ...AUTHOR, date: iso },
}));
gh([`repos/${REPO}/git/refs/heads/main`, '--method', 'PATCH', '--input', '-'],
  JSON.stringify({ sha: commit.sha, force: false }));
console.log(`\n✓ 远端 main → ${gh([`repos/${REPO}/git/ref/heads/main`]).object.sha}`);

const verify = new Map((gh([`repos/${REPO}/git/trees/${tree.sha}?recursive=1`]).tree || []).map((x) => [x.path, x.sha]));
let ok = 0;
const bad = [];
for (const f of files) {
  if (skipped.some((s) => s.startsWith(f))) continue;
  if (verify.get(f) === gitU8('rev-parse', `${sha}:${f}`)) ok++;
  else bad.push(f);
}
console.log(`校验：${ok} 个文件与本地逐字节一致` + (bad.length ? `，${bad.length} 个不一致：${bad.join(', ')}` : ''));
console.log('注意：本地与远端的提交对象不同（父提交不同），内容一致；后续提交请继续用本脚本或先同步远端。');
