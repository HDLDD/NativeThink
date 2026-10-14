/**
 * clean-wordbank-mojibake.mjs — 清理词库与词典数据里的「不可见坏字符」。
 *
 * 两类目标（同一套「不编造内容」的降级口径）：
 *  A. U+FFFD（替换符）—— 真机反馈「翻译里有 ???」的元凶。当时实测 10 个词库文件共 5909 处，
 *     成因是生成环节丢了单个汉字（如「情」「益」「国」被替换成 U+FFFD），信息已丢失、无法在文件内恢复
 *     （实测 132 个乱码 token 里只有 2 个能靠"同串内已有干净 token"复原）。
 *  B. U+E000–U+F8FF（私用区 PUA）—— 2026-10-14 真机反馈「单词的中文注释里出现 '?' 未知图标」的元凶：
 *     任何字体都没有私用区字形，只能渲染成 .notdef（"?"／方块）。实测 16 处：
 *       - 词库释义 3 处：考研 `common`（唯一的真身，书内去重后用户可见）、
 *         专业 `verbose` / `prolix` 的重复条目（第二条带 PUA，被干净的第一条挡住但仍是隐患）；
 *       - 词典 13 处：化学式下标被编成 PUA（`C₁₇H₁₈F₃NO`）、「(曾用×)」等。
 *
 * 降级口径：
 *   - `meaning`：丢掉含坏字符的那个 `；` 分隔 token（其余释义保留；token 若与已有干净 token 等价则直接去重）
 *   - `phonetic`：含坏字符则置空（UI 对空音标不渲染）
 *   - `examples[].zh`：含坏字符则置空（卡片只显示英文例句，比显示 `???` 诚实）
 *   - `deepExplanation`：就地去掉坏字符（`准入��接纳` → `准入接纳`，读得通）
 *   - 词典整份：就地去掉坏字符（化学式下标去掉后是合法的 `C17H18F3NO`，不编造）
 *
 * 幂等；并向调用方报告每类计数。改完请跑 `npm run verify:books-meta`、`verify-char-hygiene` 与构建。
 *
 * 用法：node scripts/clean-wordbank-mojibake.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'src/data/wordbank/data');
const DICT_DIR = path.join(ROOT, 'src/data/dictionary/data');
const DRY = process.argv.includes('--dry');
/** 坏字符类：替换符 + 私用区（两者任何字体都渲染不出 → 真机上都可能显示为 "?"） */
const BAD_CLASS = '\\uFFFD\\uE000-\\uF8FF';
const BAD_SPLIT = new RegExp(`[${BAD_CLASS}]`);
const BAD_RE = new RegExp(`[${BAD_CLASS}]`, 'g');
const hasBad = (s) => BAD_SPLIT.test(s);
const countBad = (s) => (s.match(BAD_RE) || []).length;

/** 去掉标点/空白后比较，用于判断两个 token 是否等价 */
const norm = (s) => s.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');

/** 处理一个双引号字符串字面量的值 */
function cleanValue(field, value) {
  if (!hasBad(value)) return { value, changed: false, dropped: 0 };
  if (field === 'meaning') {
    const tokens = value.split('；');
    const clean = tokens.filter((t) => !hasBad(t));
    // ⚠️ 关键分支：很多释义用「，」而不是「；」分隔，整条只有一个 token。
    // 若直接"丢掉含乱码的 token"，这条释义会被整条清空 —— 实测把 204 条释义变成了
    // `meaning:""`（比原来的 `??` 更糟）。所以**绝不整条清空**：没有干净 token 可留时
    // 就地去掉坏字符，保住其余文字。
    if (clean.length === 0) {
      return { value: value.replace(BAD_RE, ''), changed: true, dropped: 0 };
    }
    const seen = new Set(clean.map(norm));
    let dropped = 0;
    for (const t of tokens.filter((t) => hasBad(t))) {
      if (!seen.has(norm(t))) dropped++;   // 去掉坏字符后与已有干净 token 等价的，算去重不算丢失
    }
    const kept = clean.filter((t) => t.trim() !== '');
    return { value: kept.join('；'), changed: true, dropped };
  }
  // phonetic / zh：无法恢复，置空（UI 对空值不渲染）
  return { value: '', changed: true, dropped: 1 };
}

function cleanWordbankFile(name, src) {
  const stats = { meaning: 0, phonetic: 0, zh: 0, deep: 0, en: 0, droppedTokens: 0 };
  const bump = (field, dropped) => {
    if (field === 'meaning') stats.meaning++;
    else if (field === 'phonetic') stats.phonetic++;
    else stats.zh++;
    stats.droppedTokens += dropped;
  };
  // 英文例句（en）里丢的是撇号/坏字符：夹在两个字母之间的坏字符按撇号还原
  // （it??s → it's、I??ve → I've），其余位置直接去除。
  const fixEn = (v) =>
    v.replace(new RegExp(`([A-Za-z])[${BAD_CLASS}]+([A-Za-z])`, 'g'), "$1'$2").replace(BAD_RE, '');
  return {
    stats,
    out: src
      .replace(/en:"((?:[^"\\]|\\.)*)"/g, (m, v) => {
        if (!hasBad(v)) return m;
        stats.en += countBad(v);
        return `en:"${fixEn(v)}"`;
      })
      .replace(/en:'((?:[^'\\]|\\.)*)'/g, (m, v) => {
        if (!hasBad(v)) return m;
        stats.en += countBad(v);
        return `en:'${fixEn(v)}'`;
      })
      // zh 里可能含转义引号（\"），必须用 (?:[^"\\]|\\.)* 才能整段匹配到，
      // 否则 `…\"??由企业\"…` 这类会漏掉（首次实测就是漏在这里）
      .replace(/zh:"((?:[^"\\]|\\.)*)"/g, (m, v) => {
        if (!hasBad(v)) return m;
        bump('zh', 1);
        return 'zh:""';
      })
      .replace(/deepExplanation:"([^"]*)"/g, (m, v) => {
        if (!hasBad(v)) return m;
        stats.deep += countBad(v);
        return `deepExplanation:"${v.replace(BAD_RE, '')}"`;
      })
      .replace(/deepExplanation:'((?:[^'\\]|\\.)*)'/g, (m, v) => {
        if (!hasBad(v)) return m;
        stats.deep += countBad(v);
        return `deepExplanation:'${v.replace(BAD_RE, '')}'`;
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
      }),
  };
}

// ── A. 词库 11 本 ──
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const stats = { files: 0, meaning: 0, phonetic: 0, zh: 0, deep: 0, en: 0, droppedTokens: 0, before: 0, after: 0 };

for (const name of files) {
  const full = path.join(DIR, name);
  const src = fs.readFileSync(full, 'utf8');
  const before = countBad(src);
  if (!before) continue;

  const { stats: s, out } = cleanWordbankFile(name, src);

  const after = countBad(out);
  stats.files++;
  stats.meaning += s.meaning; stats.phonetic += s.phonetic; stats.zh += s.zh;
  stats.deep += s.deep; stats.en += s.en; stats.droppedTokens += s.droppedTokens;
  stats.before += before; stats.after += after;
  console.log(`  ${name.padEnd(24)} 坏字符 ${String(before).padStart(5)} → ${after}`);
  if (!DRY && out !== src) fs.writeFileSync(full, out, 'utf-8');
}

console.log('');
console.log(`词库：文件 ${stats.files} 个；坏字符 ${stats.before} → ${stats.after}`);
console.log(`清理字段：meaning ${stats.meaning} / phonetic ${stats.phonetic} / examples.zh ${stats.zh} / deepExplanation 就地去符 ${stats.deep} / en ${stats.en}`);
console.log(`丢弃的乱码 token 数：${stats.droppedTokens}${DRY ? '（--dry 未写盘）' : ''}`);

// ── B. 词典（整份就地去除，不编造） ──
const dictFiles = fs.readdirSync(DICT_DIR).filter((f) => f.endsWith('.ts'));
let dictBefore = 0, dictAfter = 0, dictFilesTouched = 0;
for (const name of dictFiles) {
  const full = path.join(DICT_DIR, name);
  const src = fs.readFileSync(full, 'utf8');
  const before = countBad(src);
  if (!before) continue;
  const out = src.replace(BAD_RE, '');
  const after = countBad(out);
  dictFilesTouched++;
  dictBefore += before; dictAfter += after;
  console.log(`  dict/${name.padEnd(20)} 坏字符 ${String(before).padStart(3)} → ${after}`);
  if (!DRY && out !== src) fs.writeFileSync(full, out, 'utf-8');
}
console.log(`词典：文件 ${dictFilesTouched} 个；坏字符 ${dictBefore} → ${dictAfter}${DRY ? '（--dry 未写盘）' : ''}`);

if (stats.after !== 0 || dictAfter !== 0) {
  console.error('\n✗ 仍有残留坏字符，检查它们是否出现在受支持的字段之外');
  process.exit(1);
}
