#!/usr/bin/env node
/**
 * 走 GitHub API 推送 —— github.com 被墙、但 api.github.com 仍可达时的备用通道。
 *
 * 为什么需要它：国内网络经常只封 github.com 的网页/git 通道，api.github.com 却通。
 * 此时 `git push` 必然超时，但用 API 直接建 blob/tree/commit 并移动 ref 可以完成同样的推送。
 *
 * 关键约束：API 会规范化提交元数据（时间统一存成 UTC +0000、去掉信息末尾换行），
 * 所以不能直接拿本地 sha 当远端 sha。本脚本按 API 的存储规则重建对象，
 * 每一步都与本地对象比对 sha；只要有一处对不上就中止，不会推上去一个内容漂移的提交。
 *
 * 用法: node scripts/git-push-via-api.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';

const REPO = 'HDLDD/NativeThink';
const BRANCH = 'main';
const DRY = process.argv.includes('--dry-run');
const AUTHOR = { name: 'HDLDD', email: '3103721463@qq.com' };

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 }).toString('binary');
const gitText = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 }).toString('utf8').trim();
/** 取原始字节 —— 绝不能先转成字符串再转回 utf8，中文会被来回编码搞坏 */
const gitBuf = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const gh = (args, input) =>
  JSON.parse(execFileSync('gh', ['api', ...args], { maxBuffer: 64 * 1024 * 1024, input }).toString());

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

/** 按 GitHub 的存储规则把提交对象重建成字节一致的形式，返回 { sha, payload } */
function rebuildCommit(sha) {
  // 必须按 UTF-8 读提交对象：先 latin1 再转 utf8 会把中文信息写坏
  // （这是真实踩过的坑 —— 曾经把远端提交信息推成乱码）
  const raw = execFileSync('git', ['cat-file', 'commit', sha], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  const tree = gitText('show', '-s', '--format=%T', sha);
  const parent = gitText('rev-parse', `${sha}~1`);
  const ts = Number(gitText('show', '-s', '--format=%at', sha));
  // API 存储时去掉信息末尾换行，故本地也按无末尾换行构造才能得到同一个 sha
  const message = raw.slice(raw.indexOf('\n\n') + 2).replace(/\n+$/, '');
  const composed =
    `tree ${tree}\n` +
    `parent ${parent}\n` +
    `author ${AUTHOR.name} <${AUTHOR.email}> ${ts} +0000\n` +
    `committer ${AUTHOR.name} <${AUTHOR.email}> ${ts} +0000\n\n` +
    message;
  const localSha = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
    maxBuffer: 64 * 1024 * 1024,
    input: Buffer.from(composed, 'utf8'),
  })
    .toString()
    .trim();
  const iso = new Date(ts * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  return {
    tree,
    parent,
    localSha,
    subject: gitText('show', '-s', '--format=%s', sha),
    payload: {
      message,
      tree,
      parents: [parent],
      author: { ...AUTHOR, date: iso },
      committer: { ...AUTHOR, date: iso },
    },
  };
}

const head = gitText('rev-parse', 'HEAD');
const ref = gh([`repos/${REPO}/git/ref/heads/${BRANCH}`]);
const remoteSha = ref.object.sha;
console.log(`本地 HEAD   ${head}`);
console.log(`远端 ${BRANCH}   ${remoteSha}`);

// 自检：拿 HEAD 走一遍「重建 + 远端建对象」，确认两边算出的 sha 仍然一致。
// 只建游离对象、不动任何 ref，用来在真推之前发现 API 元数据规则变化。
if (process.argv.includes('--selftest')) {
  const probe = rebuildCommit(head);
  const created = gh([`repos/${REPO}/git/commits`, '--input', '-'],
    JSON.stringify({ ...probe.payload, tree: probe.tree }));
  console.log(`\n自检 ${head.slice(0, 12)} → 本地重建 ${probe.localSha.slice(0, 12)} / 远端 ${created.sha.slice(0, 12)}`);
  console.log(probe.localSha === created.sha
    ? '✓ 规则一致，可以安全推送'
    : '✗ 两边不一致 —— GitHub 的元数据规范化规则可能变了，请先核对');
  process.exit(probe.localSha === created.sha ? 0 : 1);
}

if (head === remoteSha) {
  console.log('\n✓ 已同步，无需推送');
  process.exit(0);
}

// 沿 HEAD 回溯，找出「父提交正好是远端 main」的那个提交 —— 它是最早待推送的提交
const unpushed = [];
for (let cur = head; ; ) {
  const info = rebuildCommit(cur);
  unpushed.unshift(info);
  if (info.parent === remoteSha) break;
  if (unpushed.length > 50) die('回溯 50 个提交仍未接上远端 main，中止（可能有分叉，请先人工确认）');
  cur = info.parent;
}
console.log(`\n待推送 ${unpushed.length} 个提交（最早 → 最新）：`);
unpushed.forEach((c) => console.log(`  ${c.localSha.slice(0, 12)}  ${c.subject}`));

if (DRY) {
  console.log('\n--dry-run，未做任何写入');
  process.exit(0);
}

let parentTree = gitText('show', '-s', '--format=%T', unpushed[0].parent);

for (const c of unpushed) {
  console.log(`\n── 推送 ${c.localSha.slice(0, 12)} ${c.subject}`);

  const status = gitText('diff', '--name-status', c.parent, c.localSha)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code, ...rest] = line.split('\t');
      return { code: code[0], path: rest.join('\t') };
    });

  const entries = [];
  for (const { code, path } of status) {
    if (code === 'D') {
      entries.push({ path, mode: '100644', type: 'blob', sha: null });
      console.log(`   删除 ${path}`);
      continue;
    }
    if (code === 'R' || code === 'C') die(`暂不支持重命名/复制：${path}，请手工处理`);
    const content = gitBuf('cat-file', '-p', `${c.localSha}:${path}`);
    const mode = gitText('ls-tree', c.localSha, path).split(/\s+/)[0];
    const localBlob = gitText('rev-parse', `${c.localSha}:${path}`);
    const blob = gh([`repos/${REPO}/git/blobs`, '--input', '-'],
      JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }));
    if (blob.sha !== localBlob) die(`blob 与本地不一致：${path}`);
    console.log(`   ${code === 'A' ? '新增' : '修改'} ${path}  blob ${blob.sha.slice(0, 12)} ✓`);
    entries.push({ path, mode, type: 'blob', sha: blob.sha });
  }

  const tree = gh([`repos/${REPO}/git/trees`, '--input', '-'],
    JSON.stringify({ base_tree: parentTree, tree: entries }));
  // 本地同一份内容算出的 tree 必须与远端一致，否则说明有文件被漏掉
  const expectedTree = gitText('show', '-s', '--format=%T', c.localSha);
  if (tree.sha !== expectedTree) die(`tree 不一致：远端 ${tree.sha}，本地 ${expectedTree}`);
  console.log(`   tree ${tree.sha.slice(0, 12)} ✓`);

  const remote = gh([`repos/${REPO}/git/commits`, '--input', '-'], JSON.stringify({ ...c.payload, tree: tree.sha }));
  if (remote.sha !== c.localSha) {
    die(`commit 不一致：远端 ${remote.sha}，本地 ${c.localSha}\n` +
        `  （API 对提交元数据的规范化规则可能变了，请核对后重试）`);
  }
  console.log(`   commit ${remote.sha.slice(0, 12)} ✓ 字节一致`);

  const cur = gh([`repos/${REPO}/git/ref/heads/${BRANCH}`]);
  if (cur.object.sha !== c.parent) die(`远端 ${BRANCH} 已变（${cur.object.sha}），中止以免覆盖别人的提交`);
  gh([`repos/${REPO}/git/refs/heads/${BRANCH}`, '--method', 'PATCH', '--input', '-'],
    JSON.stringify({ sha: remote.sha, force: false }));
  console.log(`   远端 ${BRANCH} → ${remote.sha.slice(0, 12)}`);

  parentTree = expectedTree;
}

// 本地指针保持一致（本地对象已经写好，直接用同一个 sha）
execFileSync('git', ['update-ref', `refs/heads/${BRANCH}`, unpushed[unpushed.length - 1].localSha]);
const finalRemote = gh([`repos/${REPO}/git/ref/heads/${BRANCH}`]).object.sha;
const finalLocal = gitText('rev-parse', `refs/heads/${BRANCH}`);
console.log(`\n本地 refs/heads/${BRANCH} → ${finalLocal}`);
console.log(finalLocal === finalRemote
  ? '\n✓ 推送完成，本地与远端是同一个 sha'
  : `\n✗ 本地 ${finalLocal} 与远端 ${finalRemote} 不一致，请检查`);
