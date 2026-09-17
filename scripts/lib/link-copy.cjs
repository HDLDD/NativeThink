/**
 * 硬链接式目录复制 —— 打包时用。
 *
 * 为什么需要：离线模型（880MB）、Electron 运行时（~200MB）每次打包都要拷一遍，
 * 光这两项就占掉大部分打包时间。同一磁盘卷上建硬链接是 O(1) 的，不复制数据、
 * 不占额外空间，效果与真拷贝完全一致（内容不可变，不存在两边不一致的问题）。
 *
 * 跨卷（EXDEV）、权限不足（EPERM/EACCES）或文件系统不支持时自动退回真拷贝。
 */
const fs = require('fs');
const path = require('path');

let linked = 0;
let copied = 0;
let bytesLinked = 0;
let bytesCopied = 0;

/** 清空目标目录（只删链接，源文件不受影响） */
function resetDir(dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
}

function linkOrCopy(src, dest) {
  try {
    const st = fs.statSync(src);
    // 目标已存在且大小一致 → 认为已就位（重复调用时省事）
    try {
      const d = fs.lstatSync(dest);
      if (d.size === st.size) return;
      fs.unlinkSync(dest);
    } catch { /* 目标不存在，继续 */ }
    try {
      fs.linkSync(src, dest);
      linked++;
      bytesLinked += st.size;
    } catch {
      fs.copyFileSync(src, dest);
      copied++;
      bytesCopied += st.size;
    }
  } catch (e) {
    throw new Error(`复制失败 ${src}: ${e.message}`);
  }
}

function walk(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      walk(s, d);
    } else if (e.isFile()) {
      linkOrCopy(s, d);
    }
  }
}

/**
 * 把 src 复制到 dest（硬链接优先）
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 * @param {{ fresh?: boolean, label?: string }} [opts] fresh=true 时先清空目标
 */
function copyTree(src, dest, opts = {}) {
  if (!fs.existsSync(src)) return { linked: 0, copied: 0 };
  linked = 0; copied = 0; bytesLinked = 0; bytesCopied = 0;
  if (opts.fresh) resetDir(dest);
  const t0 = Date.now();
  walk(src, dest);
  const ms = Date.now() - t0;
  const label = opts.label || path.basename(src);
  console.log(
    `  ${label}: 硬链接 ${linked}（${(bytesLinked / 1024 / 1024).toFixed(0)}MB）` +
    `${copied ? ` + 复制 ${copied}（${(bytesCopied / 1024 / 1024).toFixed(0)}MB）` : ''}` +
    ` · ${ms}ms`,
  );
  return { linked, copied, ms };
}

module.exports = { copyTree, resetDir };
