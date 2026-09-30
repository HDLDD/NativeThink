#!/usr/bin/env node
/**
 * verify-spelling-resume.mjs — 句子拼写断点续学「按词书分键」的回归守卫。
 *
 * 历史缺陷（docs/modules/spelling.md §3.3）：断点是单个全局键
 * `__nativethink_spelling_resume`，值 `{ activeLevel, currentIndex }` —— 只能记住一本：
 * A 书练到第 20 句、切去 B 书练 3 句，回到 A 书位置已经没了。AGENTS.md 的约定是按
 * （模式, level）分键，背单词侧 `__nativethink_vocab_session_<level>` 早就是这么做的。
 *
 * A 段真跑 `src/lib/spelling-resume.ts`（注入忠实替身存储：Map + 同 API + 可枚举），
 * 覆盖跨书互不覆盖、旧全局键迁移、不覆盖已有新数据、坏 JSON、重置按前缀枚举。
 * B 段守接线：页面只用这一个模块读写断点，重置流程真的调用 clearAllResume，
 * 且 fill（单词拼写）模式不会自动朗读整句（那是把答案念出来）。
 *
 * 用法：node scripts/verify-spelling-resume.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'spelling-resume-check');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

/* ───────────── 忠实替身存储 ───────────── */
const makeStore = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    keys: () => [...map.keys()],
  };
};

const SRC = path.join(ROOT, 'src/lib/spelling-resume.ts');
let src = fs.readFileSync(SRC, 'utf8');
src = src.replace(/^import \{ safeStorage \} from '\.\/safe-storage';$/m, '');
src = src.replace(/: IResumeStorage = safeStorage/g, ': IResumeStorage');
src = src.replace(/^export function resumeStorageWithKeys[\s\S]*$/m, '');
if (/^\s*import\s/m.test(src)) { console.error('脚手架错误：仍有未剥离的 import'); process.exit(2); }
if (/resumeStorageWithKeys/.test(src)) { console.error('脚手架错误：适配器没剥干净'); process.exit(2); }

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const outFile = path.join(TMP, 'spelling-resume-under-test.mjs');
fs.writeFileSync(outFile, js);
const m = await import(pathToFileURL(outFile).href);
for (const fn of ['resumeKeyFor', 'readResumeIndex', 'readLastResumeLevel', 'persistResume', 'migrateLegacyResume', 'clearAllResume']) {
  if (typeof m[fn] !== 'function') { console.error(`脚手架错误：没导出 ${fn}`); process.exit(2); }
}

/* ───────────── A. 行为 ───────────── */
// A1 脚手架自检：读写往返
const st = makeStore();
m.persistResume('cet4', 7, st);
ok(m.readResumeIndex('cet4', st) === 7, '脚手架自检：persistResume → readResumeIndex 往返正确');
ok(m.readLastResumeLevel(st) === 'cet4', 'persistResume 记下"上次在哪一本"');
ok(m.readResumeIndex('gaokao', st) === null,
  '没练过的词书返回 null（不能返回 0 冒充"有断点"，否则位置会被无谓地重置）');

// A2 跨书互不覆盖（这就是原来的缺陷）
m.persistResume('cet4', 20, st);
m.persistResume('gaokao', 3, st);
m.persistResume('cet4', 20, st);
const backToCet4 = m.readResumeIndex('cet4', st);
const gaokaoIdx = m.readResumeIndex('gaokao', st);
ok(backToCet4 === 20 && gaokaoIdx === 3,
  '切去另一本再回来，两本的断点都还在（旧的全局单键会被后一本抹掉前一本）',
  `cet4=${backToCet4} gaokao=${gaokaoIdx}`);
// 正对照：模拟旧写法（一个全局槽存 {activeLevel,currentIndex}）
const legacy = new Map();
const legacyWrite = (level, idx) => legacy.set('__nativethink_spelling_resume', JSON.stringify({ activeLevel: level, currentIndex: idx }));
legacyWrite('cet4', 20); legacyWrite('gaokao', 3);
const legacyBackToCet4 = JSON.parse(legacy.get('__nativethink_spelling_resume'));
ok(legacyBackToCet4.activeLevel === 'gaokao',
  '正对照：旧全局单键在同样操作后只剩最后一本 —— 证明这条守卫真在区分两种实现',
  JSON.stringify(legacyBackToCet4));

// A3 旧键迁移
const st2 = makeStore();
st2.setItem(m.RESUME_LEGACY_KEY, JSON.stringify({ activeLevel: 'ielts', currentIndex: 12 }));
const mig = m.migrateLegacyResume(st2);
ok(mig.migrated === true && mig.level === 'ielts', '迁移报告搬到 ielts');
ok(m.readResumeIndex('ielts', st2) === 12, '旧断点位置搬到分 level 的键上');
ok(m.readLastResumeLevel(st2) === 'ielts', '旧 activeLevel 变成"上一本"指针');
ok(st2.getItem(m.RESUME_LEGACY_KEY) === null, '迁移后删除旧全局键（不留两份真相）');

// A4 迁移不得覆盖已有新数据
const st3 = makeStore();
m.persistResume('toefl', 40, st3);
st3.setItem(m.RESUME_LEGACY_KEY, JSON.stringify({ activeLevel: 'toefl', currentIndex: 2 }));
m.migrateLegacyResume(st3);
ok(m.readResumeIndex('toefl', st3) === 40, '目标键已有数据时不被旧全局值覆盖（新数据优先）');
ok(st3.getItem(m.RESUME_LEGACY_KEY) === null, '不覆盖也照样删掉旧键');

// A5 坏数据与空数据都不能抛错
const st4 = makeStore();
st4.setItem(m.RESUME_LEGACY_KEY, '{坏掉的 JSON');
ok(m.migrateLegacyResume(st4).migrated === false && st4.getItem(m.RESUME_LEGACY_KEY) === null,
  '坏 JSON 的旧键：判为没迁移并丢弃，不抛错、不留下每次都重试的毒数据');
const st5 = makeStore();
ok(m.migrateLegacyResume(st5).migrated === false, '没有旧键时什么都不做（首次使用应落在词书选择页）');
st5.setItem(m.resumeKeyFor('cet4'), JSON.stringify({ currentIndex: 'abc' }));
ok(m.readResumeIndex('cet4', st5) === null, '位置不是数字时按"无断点"处理，而不是 NaN 传进队列');
st5.setItem(m.resumeKeyFor('cet6'), JSON.stringify({ currentIndex: -3 }));
ok(m.readResumeIndex('cet6', st5) === null, '负数下标按无断点处理（越界索引会直接抛在队列上）');

// A6 重置必须按前缀枚举清干净
const st6 = makeStore();
m.persistResume('cet4', 5, st6);
m.persistResume('gaokao', 9, st6);
m.persistResume('all', 2, st6);
// 3 本词书各一把位置键 + 一把 `_last` 指针 = 4 把；断言按实际应有数量推导，不是"越大越好"
const cleared = m.clearAllResume(st6);
ok(cleared === 4 && st6.keys().filter((k) => k.startsWith(m.RESUME_PREFIX)).length === 0,
  'clearAllResume 按前缀把断点键清干净（3 本位置键 + 1 把上一本指针，共 4 把）',
  `cleared=${cleared} 残留=${st6.keys().join(',')}`);
ok(m.readResumeIndex('cet4', st6) === null && m.readLastResumeLevel(st6) === null,
  '重置后不再有"上一本"指针 —— 否则刷新又自动跳回上次那本书');

/* ───────────── B. 接线 ───────────── */
const page = fs.readFileSync(path.join(ROOT, 'src/pages/SpellingPage/SpellingPage.tsx'), 'utf8');
const progress = fs.readFileSync(path.join(ROOT, 'src/pages/ProgressPage/ProgressPage.tsx'), 'utf8');

ok(/from '@\/lib\/spelling-resume'/.test(page), '页面从 spelling-resume 取断点读写（单点归属）');
ok(!/safeStorage\.setItem\('__nativethink_spelling_resume'/.test(page) &&
   !/JSON\.stringify\(\{ activeLevel: level, currentIndex: idx \}\)/.test(page),
  '正对照：页面里不再有"写单个全局断点键"的旧代码');
ok((page.match(/persistResume\(|readResumeIndex\(|readLastResumeLevel\(|migrateLegacyResume\(/g) || []).length >= 4,
  'persist / 读位置 / 读上一本 / 迁移 四个调用都在');
ok(/setTimeout\(\(\) => persistResume\(level, idx\), 200\)/.test(page),
  '落盘仍是 200ms 防抖（连续翻句不要每跳一次就写一次 storage）');
ok(/clearAllResume\(resumeStorageWithKeys\(\)\)/.test(progress),
  '「重置句子拼写」调用 clearAllResume（按前缀枚举，而不是写死清单）');

// 自动朗读只在 dictation：fill 模式整句朗读 = 把被挖空的词念出来
ok(/if \(mode === 'dictation' && autoRead\)/.test(page),
  '自动朗读只在句子拼写（dictation）生效');
ok(!/if \(mode === 'fill' && autoRead\)/.test(page),
  '正对照：fill（单词拼写）模式没有自动朗读');

/* ───────────────────────── 汇总 ───────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 拼写断点按词书分键、迁移与重置都清得干净');
