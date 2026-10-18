/**
 * 给 NativeThink「视频精听」准备可直接导入的素材包。
 *
 * 转录伴侣(dshzmd) 的转录结果 → 每课一个目录：媒体 + .srt + .json（词级）+ 说明.txt。两条硬要求：
 *  1. 每份字幕都用 **NativeThink 自己的解析器真跑**验证（与 verify-* 守卫同一套转译做法），不是"应该能解析"；
 *  2. 说明.txt 带**质检数字**（重复句 / 夹非英文 / 碎句 / 最长句）—— 素材哪里不理想要写明白，
 *     不许交一份看着挺干净、实际开头一句误听的东西给用户当示范。
 *
 * 用法：
 *   node scripts/make-video-lab-packs.mjs                    # 内置两课
 *   node scripts/make-video-lab-packs.mjs --add BV1ppah      # 按名字模糊匹配转录伴侣里的任意媒体
 *   node scripts/make-video-lab-packs.mjs --add "data/uploads/x.mp4" --model small
 * 媒体**没有画面轨就拒绝出包**（用户的硬要求：素材必须有画面）；真要发音频课才加 --allow-audio。
 * 没转录过的会自动提交转录并等完（轮询任务快照；挂 SSE 的话客户端一断开服务就取消任务）。
 * 环境变量：NT_DSH_BASE / NT_DSH_ROOT / NT_OUT
 * 输出在仓库外（默认 B:/nt-materials/video-lab）—— 几十 MB 的媒体不许进 git。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const BASE = process.env.NT_DSH_BASE || 'http://127.0.0.1:8848';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DSH = process.env.NT_DSH_ROOT || 'B:/dshzmd';
const OUT = process.env.NT_OUT || 'B:/nt-materials/video-lab';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const add = arg('add', '');
const model = arg('model', 'base');
const allowAudio = argv.includes('--allow-audio');

/** 内置两课（转录伴侣里已存在）。note 里说清素材结构，别让人以为字幕坏了 */
const BUILTIN = [
  {
    dir: '01-B1听力-购物闲聊', stem: 'b1-shopping-chat', pick: 'BV1ppah66EaW',
    note: 'B1 英文听力训练：老朋友逛街、等结果、突然变天躲进店里继续花钱（购物英文 · 朋友闲聊口语）。\n'
      + '这类素材的结构就是**每句英文读两遍、中间夹一句中文翻译**，所以字幕里出现成对重复句是正常的，不是转录坏了 —— 重复正是盲听/跟读的抓手。\n'
      + '已知不足：开头旁白被 base 模型误听成一句不通的英文（就是字幕第 1 条），第一句可以跳过不看。',
  },
  {
    dir: '02-每日听力示范', stem: 'daily-listening-demo', pick: 'assets/listening_demo.mp4', exact: true,
    note: '32 秒示范片段：每日听力开场白（5 句、语速稳、无重复、无中文夹译），适合第一次体验逐句精听 + 逐词高亮。',
  },
];

/* ── 载入被测解析器：只留纯逻辑（去 idb import、去那个直连 IDB 的单例），转译真跑 ── */
const lines = fs.readFileSync(path.join(ROOT, 'src/lib/video-lab.ts'), 'utf8').split('\n');
const kept = [];
for (const l of lines) {
  if (l.includes("from './idb'")) continue;            // 留着会让 require 找不到模块
  if (l.trimStart().startsWith('import type')) continue;
  kept.push(l);
}
let lib = kept.join('\n');
const cutFrom = lib.indexOf('export const videoStore');
const cutTo = lib.indexOf('});', cutFrom);
if (cutFrom >= 0 && cutTo > cutFrom) lib = lib.slice(0, cutFrom) + lib.slice(cutTo + 3);
const js = ts.transpileModule(lib + '\nmodule.exports={parseSubtitle};',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
// 执行的是本仓库自己的源码（与 verify-* 守卫同一做法），不是外部输入
new Function('module', 'exports', js)(mod, mod.exports);
const parseSubtitle = mod.exports.parseSubtitle;
if (typeof parseSubtitle !== 'function') { console.error('解析器没载入，别继续'); process.exit(1); }

const stamp = (s) => {
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const t = Math.floor(s);
  const p = (n) => String(n).padStart(2, '0');
  return p(Math.floor(t / 3600)) + ':' + p(Math.floor(t / 60) % 60) + ':' + p(t % 60) + ',' + String(ms).padStart(3, '0');
};
const toSrt = (list) => list.map((s, i) => (i + 1) + '\n' + stamp(s.t0) + ' --> ' + stamp(s.t1) + '\n' + s.text + '\n').join('\n');
const CJK = new RegExp('[\\u3040-\\u30ff\\u4e00-\\u9fff]');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();


/** 用 ffprobe 看媒体到底有没有画面轨（用户硬要求：素材必须有画面；AV1 也一并点出来） */
const probeMedia = (file) => {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file],
      { encoding: 'utf8', timeout: 60000 });
    const j = JSON.parse(out);
    const v = (j.streams || []).find((x) => x.codec_type === 'video') || null;
    const a = (j.streams || []).find((x) => x.codec_type === 'audio') || null;
    return { 秒: Math.round(Number(j.format && j.format.duration) || 0), 画面轨: v ? v.codec_name + ' ' + v.width + 'x' + v.height : null, 音频轨: a ? a.codec_name : null };
  } catch (e) { return { 秒: 0, 画面轨: null, 音频轨: null, 错误: String(e.message).slice(0, 60) }; }
};

const api = async (p, init) => {
  const r = await fetch(BASE + p, init);
  if (!r.ok) throw new Error(p + ' → HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.json();
};

/** 转录没做过就先跑，并等到它完成 */
const ensureTranscript = async (itemPath) => {
  const got = await api('/api/transcript?path=' + encodeURIComponent(itemPath)).catch(() => null);
  const cached = got && (got.result || got);
  if (cached && Array.isArray(cached.sentences) && cached.sentences.length) return cached;
  console.log('  还没有转录，提交 faster-whisper ' + model + ' …');
  const post = await api('/api/transcribe', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: itemPath, model, language: 'en' }),
  });
  if (!post.job_id) {
    const again = await api('/api/transcript?path=' + encodeURIComponent(itemPath));
    return again.result || again;
  }
  let last = 0;
  for (let i = 0; i < 240; i++) {
    await new Promise((res) => setTimeout(res, 5000));
    const j = await api('/api/jobs/' + post.job_id + '?since=' + last);
    last += (j.sentences || []).length;
    if (j.status === 'done') return j.result;
    if (j.status === 'error') throw new Error('转录失败：' + (j.error || j.message));
    if (i % 6 === 5) console.log('  …' + ((i + 1) * 5) + 's ' + (j.percent ?? '?') + '% 句=' + j.count);
  }
  throw new Error('转录超时（20 分钟）');
};

const files = (await api('/api/files')).items;
const slug = add.replace(/[^\w]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '').slice(0, 28) || 'lesson';
const targets = add
  ? [{ dir: 'custom-' + slug, stem: slug, pick: add, note: '按 --add 现做的一课（转录伴侣里的媒体）。结构问题看下面的质检数字。' }]
  : BUILTIN;

const report = [];
for (const w of targets) {
  const wantPath = w.pick.replace(/\\/g, '/');
  const item = files.find((f) => (w.exact
    ? f.path.replace(/\\/g, '/') === wantPath
    : f.path.replace(/\\/g, '/').includes(wantPath) || f.name.includes(wantPath)));
  if (!item) { report.push({ 课: w.dir, 状态: '转录伴侣里没有这个媒体 —— 先在那边下载/上传，再跑本脚本' }); continue; }

  const r = await ensureTranscript(item.path);
  const sentences = (r && r.sentences) || [];
  if (!sentences.length) { report.push({ 课: w.dir, 状态: '转录是空的' }); continue; }

  const dir = path.join(OUT, w.dir);
  fs.mkdirSync(dir, { recursive: true });
  const mediaName = w.stem + path.extname(item.path);
  fs.copyFileSync(path.join(DSH, item.path), path.join(dir, mediaName));
  const srtName = w.stem + '.srt';
  const jsonName = w.stem + '.json';
  fs.writeFileSync(path.join(dir, srtName), toSrt(sentences), 'utf8');
  fs.writeFileSync(path.join(dir, jsonName), JSON.stringify({
    result: { video: mediaName, video_name: mediaName, language: r.language, duration: r.duration, model: r.model, sentences },
  }), 'utf8');

  /* ── 硬要求：必须有画面轨（AV1 解不动就是黑屏只有声音，一并点出来） ── */
  const pr = probeMedia(path.join(dir, mediaName));
  const subsEnd = Math.round(sentences.reduce((m, x) => Math.max(m, x.t1 || 0), 0));
  if (!allowAudio && !pr.画面轨) {
    fs.rmSync(dir, { recursive: true, force: true });
    report.push({ 课: w.dir, 状态: '媒体没有画面轨 ' + JSON.stringify(pr) + ' —— 已拒绝出包；确实要发音频课才加 --allow-audio' });
    continue;
  }
  const 时长告警 = pr.秒 && subsEnd && (pr.秒 / subsEnd > 1.6 || pr.秒 / subsEnd < 0.6)
    ? '⚠️ 媒体 ' + pr.秒 + 's 与字幕覆盖 ' + subsEnd + 's 差太多（截断下载或没裁到同区间），要么裁媒体要么补转录' : '';

  /* ── 质检数字（不是形容词） ── */
  const seen = new Set();
  let dup = 0;
  sentences.forEach((s) => { const k = norm(s.text); if (!k) return; if (seen.has(k)) dup++; else seen.add(k); });
  const mixed = sentences.filter((s) => CJK.test(s.text)).length;
  const frags = sentences.filter((s) => norm(s.text).split(' ').filter(Boolean).length <= 2).length;
  const longest = sentences.reduce((a, s) => (s.text.length > (a ? a.text.length : 0) ? s : a), sentences[0]);
  const words = sentences.reduce((a, x) => a + ((x.words || []).length), 0);
  const NL = String.fromCharCode(10);   // 说明.txt 的行分隔（别在字符串里裸写反斜杠 n）
  const qc = '媒体：' + mediaName + ' · ' + (pr.画面轨 || '无画面轨') + ' + ' + (pr.音频轨 || '?') + ' · ' + pr.秒 + ' 秒' + NL
    + '字幕：' + sentences.length + ' 句 · 覆盖 0:00–' + Math.floor(subsEnd / 60) + ':' + String(subsEnd % 60).padStart(2, '0') + ' · 词级时间戳 ' + words + ' 个' + NL
    + (时长告警 ? '  ' + 时长告警 + NL : '')
    + '重复句 ' + dup + '（占 ' + Math.round((dup / sentences.length) * 100) + '%）· 夹非英文 ' + mixed + ' 句 · 碎句(≤2 词) ' + frags + ' 句' + NL
    + '最长句 ' + longest.text.length + ' 字符：' + longest.text.slice(0, 60) + NL
    + '转录：faster-whisper ' + (r.model || model) + '，语种 ' + (r.language || 'en')
    + '；转录伴侣记的整条原片时长 ' + Math.round(r.duration || 0) + ' 秒' + NL;

  fs.writeFileSync(path.join(dir, '说明.txt'),
    w.note + '\n\n' + qc + '\n导入「视频精听」（先选媒体再选字幕，顺序反了也行）：\n'
    + '  手机：把 ' + mediaName + ' 与字幕拷进手机 → 侧边栏「视频精听」→「选视频（含音频）」选 ' + mediaName + ' → 再选 ' + srtName + '\n'
    + '  电脑：网页版 nativethink.pages.dev 或本机 dist 都一样，两步选文件\n'
    + '  想逐词高亮选 ' + jsonName + '（带词级时间戳）；选 ' + srtName + ' 则按空白切词面，一样能点词查词\n'
    + '  只有字幕也能学（「只导字幕」），原声缺席时用卡面「朗读」代替\n'
    + '进去可以：点句跳转 · 单句循环(F) · A-B 复读 · 倍速 · 点词查词加生词本 · 收藏句 · 送进句子拼写当听写 · 「翻译字幕」出中文\n', 'utf8');

  /* ── 真跑验证：两份字幕都要被 App 的解析器吃进去 ── */
  const out = { 课: w.dir, 媒体: mediaName, 画面: pr.画面轨 || '无', 媒体秒: pr.秒, 字幕秒: subsEnd, 时长告警: 时长告警 || '一致', MB: +(fs.statSync(path.join(dir, mediaName)).size / 1e6).toFixed(1), 重复句: dup, 夹非英文: mixed, 碎句: frags };
  for (const f of [srtName, jsonName]) {
    const res = parseSubtitle(fs.readFileSync(path.join(dir, f), 'utf8'));
    out[f] = {
      格式: res.format, 句: res.list.length,
      词级句: res.list.filter((x) => (x.words || []).length > 0).length,
      末尾秒: Math.round(res.list[res.list.length - 1]?.t1 || 0),
      首句: (res.list[0]?.text || '').slice(0, 46),
    };
    if (res.list.length !== sentences.length) out[f]['注意'] = '解析条数与转录不一致（转录 ' + sentences.length + '）';
  }
  report.push(out);
}
console.log(JSON.stringify(report, null, 1));
console.log('\n输出目录：' + OUT);
