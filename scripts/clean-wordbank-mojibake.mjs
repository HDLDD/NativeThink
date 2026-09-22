/**
 * clean-wordbank-mojibake.mjs — 清理词库数据里的 U+FFFD（替换符）乱码。
 *
 * 背景：真机上背单词卡片显示成「小规??的」「事??」「在国外…；??外」，用户报为"翻译里有 ???"。
 * 实测：10 个数据文件共 **5909 处 U+FFFD**，分布在
 *   - 核心 `<level>.ts` 的 `meaning`（698 处 / 75113 个，0.9%）
 *   - 核心 `<level>.ts` 的 `phonetic`（102 处）
 *   - `<level>.detail.ts` 的 `examples[].zh`（1519 / 90065 条，1.7%）
 * 成因是生成环节丢了单个汉字（如「情」「益」「国」被替换成 U+FFFD），**信息已丢失、无法在文件内恢复**
 * （实测 132 个乱码 token 里只有 2 个能靠"同串内已有干净 token"复原）。
 *
 * 因此本脚本只做**不编造内容**的降级：
 *   - `meaning`：丢掉含乱码的那个 `；` 分隔 token（其余释义保留；token 若与已有干净 token 等价则直接去重）
 *   - `phonetic`：含乱码则置空（UI 对空音标不渲染）
 *   - `examples[].zh`：含乱码则置空（卡片只显示英文例句，比显示 `???` 诚实）
 *
 * 幂等；并向调用方报告每类计数。改完请跑 `npm run verify:books-meta` 与构建。
 *
 * 用法：node scripts/clean-wordbank-mojibake.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'src/data/wordbank/data');
const DRY = process.argv.includes('--dry');
const FFFD = '\uFFFD';

/** 去掉标点/空白后比较，用于判断两个 token 是否等价 */
const norm = (s) => s.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');

/** 处理一个双引号字符串字面量的值 */
function cleanValue(field, value) {
  if (!value.includes(FFFD)) return { value, changed: false, dropped: 0 };
  if (field === 'meaning') {
    const tokens = value.split('；');
    const clean = tokens.filter((t) => !t.includes(FFFD));
    // ⚠️ 关键分支：很多释义用「，」而不是「；」分隔，整条只有一个 token。
    // 若直接"丢掉含乱码的 token"，这条释义会被整条清空 —— 实测把 204 条释义变成了
    // `meaning:""`（比原来的 `??` 更糟）。所以**绝不整条清空**：没有干净 token 可留时
    // 就地去掉乱码符，保住其余文字。
    if (clean.length === 0) {
      return { value: value.split(FFFD).join(''), changed: true, dropped: 0 };
    }
    const seen = new Set(clean.map(norm));
    let dropped = 0;
    for (const t of tokens.filter((t) => t.includes(FFFD))) {
      if (!seen.has(norm(t))) dropped++;   // 去掉乱码后与已有干净 token 等价的，算去重不算丢失
    }
    const kept = clean.filter((t) => t.trim() !== '');
    return { value: kept.join('；'), changed: true, dropped };
  }
  // phonetic / zh：无法恢复，置空（UI 对空值不渲染）
  return { value: '', changed: true, dropped: 1 };
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const stats = { files: 0, meaning: 0, phonetic: 0, zh: 0, deep: 0, en: 0, droppedTokens: 0, before: 0, after: 0 };

for (const name of files) {
  const full = path.join(DIR, name);
  const src = fs.readFileSync(full, 'utf8');
  const before = (src.match(new RegExp(FFFD, 'g')) || []).length;
  if (!before) continue;

  // 只改字段值，其余原样保留。数据文件里**单/双引号混用**（detail 文件大量用单引号），
  // 两种都要覆盖，否则会漏掉一大半（首次只写双引号时 advanced/ielts 仍残留 22/121 处）。
  const bump = (field, dropped) => {
    if (field === 'meaning') stats.meaning++;
    else if (field === 'phonetic') stats.phonetic++;
    else stats.zh++;
    stats.droppedTokens += dropped;
  };
  // deepExplanation 是整句补充解释：丢的是句中标点/单字，**不能丢整句**（那会直接少掉解释），
  // 就地去掉乱码符即可（`准入��接纳` → `准入接纳`，读得通）。
  // 英文例句（en）里丢的是撇号/破折号：夹在两个字母之间的乱码按撇号还原
  // （it??s → it's、I??ve → I've），其余位置直接去除。仅约 40 处，风险可控。
  const fixEn = (v) =>
    v.replace(new RegExp(`([A-Za-z])${FFFD}+([A-Za-z])`, 'g'), "$1'$2").split(FFFD).join('');
  const out = src
    .replace(/en:"((?:[^"\\]|\\.)*)"/g, (m, v) => {
      if (!v.includes(FFFD)) return m;
      stats.en += (v.match(new RegExp(FFFD, 'g')) || []).length;
      return `en:"${fixEn(v)}"`;
    })
    .replace(/en:'((?:[^'\\]|\\.)*)'/g, (m, v) => {
      if (!v.includes(FFFD)) return m;
      stats.en += (v.match(new RegExp(FFFD, 'g')) || []).length;
      return `en:'${fixEn(v)}'`;
    })
    // zh 里可能含转义引号（\"），必须用 (?:[^"\\]|\\.)* 才能整段匹配到，
    // 否则 `…\"??由企业\"…` 这类会漏掉（首次实测就是漏在这里）
    .replace(/zh:"((?:[^"\\]|\\.)*)"/g, (m, v) => {
      if (!v.includes(FFFD)) return m;
      bump('zh', 1);
      return 'zh:""';
    })
    .replace(/deepExplanation:"([^"]*)"/g, (m, v) => {
      if (!v.includes(FFFD)) return m;
      const n = (v.match(new RegExp(FFFD, 'g')) || []).length;
      stats.deep += n;
      return `deepExplanation:"${v.split(FFFD).join('')}"`;
    })
    .replace(/deepExplanation:'((?:[^'\\]|\\.)*)'/g, (m, v) => {
      if (!v.includes(FFFD)) return m;
      const n = (v.match(new RegExp(FFFD, 'g')) || []).length;
      stats.deep += n;
      return `deepExplanation:'${v.split(FFFD).join('')}'`;
    })
    .replace(/(meaning|phonetic|zh):"((?:[^"\\]|\\.)*)"/g, (m, field, value) => {
      const r = cleanValue(field, value);
      if (!r.changed) return m;
      bump(field, r.dropped);
      return `${field}:"${r.value}"`;
    })
    // 单引号版本：值内可能含转义引号，用 (?:[^'\\]|\\.)* 精确匹配
    .replace(/(meaning|phonetic|zh):'((?:[^'\\]|\\.)*)'/g, (m, field, value) => {
      const r = cleanValue(field, value);
      if (!r.changed) return m;
      bump(field, r.dropped);
      return `${field}:'${r.value}'`;
    });

  const after = (out.match(new RegExp(FFFD, 'g')) || []).length;
  stats.before += before;
  stats.after += after;
  stats.files++;
  console.log(`  ${name.padEnd(24)} U+FFFD ${String(before).padStart(5)} → ${after}`);
  if (!DRY && out !== src) fs.writeFileSync(full, out, 'utf-8');
}

console.log('');
console.log(`文件 ${stats.files} 个；U+FFFD ${stats.before} → ${stats.after}`);
console.log(`清理字段：meaning ${stats.meaning} / phonetic ${stats.phonetic} / examples.zh ${stats.zh} / deepExplanation 就地去符 ${stats.deep}`);
console.log(`丢弃的乱码 token 数：${stats.droppedTokens}${DRY ? '（--dry 未写盘）' : ''}`);
if (stats.after !== 0) {
  console.error('\n✗ 仍有残留 U+FFFD，检查是否出现在只匹配双引号的字段之外');
  process.exit(1);
}
