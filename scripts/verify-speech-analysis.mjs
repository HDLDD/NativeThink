#!/usr/bin/env node
/**
 * verify-speech-analysis.mjs — 路线 1（离线跟读分析）契约守卫。
 *
 * 用合成波形真跑：
 *   - 标点意群边界（逗号/分号/破折号；无标点时只找第一个连词）
 *   - 音量/爆音阈值
 *   - 20ms RMS 能量包络的停顿检测
 *   - 自相关基频检测（中位/范围/趋势/句尾）
 *   - 语速与 ASR 无关的本地兜底
 * 再静态守 SpeakBack / ShadowingPage 都走同一个 analyzeBlob。
 *
 * 用法：node scripts/verify-speech-analysis.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });

const strip = (s) => ts.transpileModule(s, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.Preserve,
    removeComments: true,
  },
}).outputText;

// 把依赖链拼成一份可执行源码：speech-score → asr → wav → speech-analysis
const asrSrc = strip(read('src/lib/asr.ts'))
  .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/speech-score['"];?/g, '');
const analysisSrc = strip(read('src/lib/speech-analysis.ts'))
  .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/(?:wav|asr)['"];?/g, '');
const lib = [
  strip(read('src/lib/speech-score.ts')),
  asrSrc,
  strip(read('src/lib/wav.ts')),
  analysisSrc,
].join('\n');

const js = ts.transpileModule(
  lib + '\nmodule.exports={expectedBreakRatios,summarizeVolume,detectPauses,summarizePitch,analyzePcm,resampleMono16k,encodeWavMono16k,speechPace,tokenizeSpeech};',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const M = mod.exports;

function sine(freq, amp, seconds, rate = 16000) {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function withGap(freq, amp, seconds, from, to, rate = 16000) {
  const out = sine(freq, amp, seconds, rate);
  for (let i = Math.round(rate * from); i < Math.round(rate * to); i++) out[i] = 0;
  return out;
}

/* ───────── 意群边界 ───────── */
{
  const comma = M.expectedBreakRatios('Hot, please. And can I get an extra shot of espresso?');
  ok(comma.length === 1 && Math.abs(comma[0] - 0.1) < 1e-9,
    '标点：第一个逗号后的意群边界 = 1/10', JSON.stringify(comma));
  ok(M.expectedBreakRatios('I thought the weather would be better today.').length === 0,
    '没有标点/连词时不给假边界');
  const conj = M.expectedBreakRatios('I like tea and I like coffee.');
  ok(conj.length === 1 && Math.abs(conj[0] - 0.5) < 1e-9,
    '无标点时只取第一个句中连词（and → 0.5）', JSON.stringify(conj));
  const quoted = M.expectedBreakRatios('She said "well," and left.');
  ok(quoted.length === 1 && Math.abs(quoted[0] - 0.75) < 1e-9,
    '引号包住的逗号也能认（"well," → 0.75）', JSON.stringify(quoted));
  ok(M.expectedBreakRatios('').length === 0 && M.expectedBreakRatios('Hi').length === 0,
    '空句/单词句不造边界');
}

/* ───────── 音量与爆音 ───────── */
{
  const normal = M.summarizeVolume(sine(220, 0.5, 1));
  ok(!normal.tooQuiet && !normal.clipped, '正常音量不误报');
  ok(normal.rmsDbfs > -12 && normal.peakDbfs > -8, '正常音量的 dBFS 量级正确', JSON.stringify(normal));
  const quiet = M.summarizeVolume(sine(220, 0.002, 1));
  ok(quiet.tooQuiet, '很小声 → tooQuiet');
  const clipped = M.summarizeVolume(sine(220, 1.5, 1));
  ok(clipped.clipped && !clipped.tooQuiet, '过载 → clipped');
  const silent = M.summarizeVolume(new Float32Array(16000));
  ok(silent.tooQuiet && silent.peakDbfs === -100, '全静音 → tooQuiet 且 -100 dBFS');
}

/* ───────── 停顿 ───────── */
{
  const samples = withGap(220, 0.5, 2, 0.8, 1.2);
  const pauses = M.detectPauses(samples, 16000);
  ok(pauses.length === 1, '2s 中 0.4s 静音 → 检出一处停顿', JSON.stringify(pauses));
  ok(pauses[0] && Math.abs(pauses[0].at - 0.5) < 0.03,
    '停顿落点约在 50%', pauses[0] && String(pauses[0].at));
  ok(pauses[0] && pauses[0].ms >= 300 && pauses[0].ms <= 500,
    '停顿时长约 400ms', pauses[0] && String(pauses[0].ms));
  ok(M.detectPauses(new Float32Array(16000), 16000).length === 0,
    '全静音不报"停顿"（是没有语音）');
}

/* ───────── 音高 ───────── */
{
  const steady = M.summarizePitch(sine(220, 0.5, 1), 16000);
  ok(steady && Math.abs(steady.medianHz - 220) <= 11,
    '220Hz 稳态 → 中位基频 ±5%', steady && String(steady.medianHz));
  ok(steady && steady.p10Hz > 150 && steady.p90Hz < 300,
    '正常音高的 p10–p90 范围合理', steady && `${steady.p10Hz}-${steady.p90Hz}`);
  ok(M.summarizePitch(new Float32Array(16000), 16000) === null,
    '全静音 → 检测不到音高');
  const rising = M.summarizePitch(new Float32Array([
    ...sine(150, 0.5, 1),
    ...sine(260, 0.5, 1),
  ]), 16000);
  ok(rising && rising.trend === 'rising',
    '前段 150Hz / 后段 260Hz → trend=rising', rising && rising.trend);
  ok(rising && rising.endsRising, '尾段更高 → endsRising=true');
}

/* ───────── 综合分析与语速 ───────── */
{
  const samples = withGap(220, 0.5, 2, 0.8, 1.2);
  const a = M.analyzePcm([samples], 16000, {
    targetText: 'one two three four',
    expectedBoundaries: [0.5],
  });
  ok(a && Math.round(a.durationMs) === 2000, '综合分析：时长 2.0s', a && String(a.durationMs));
  ok(a && a.pace && a.pace.expectedMs === 1040 && a.pace.label === 'slow',
    '语速：4 词 × 260ms，2s 录音判偏慢', a && a.pace && JSON.stringify(a.pace));
  ok(a && a.total === 1 && a.hit === 1, '停顿落在 0.5 边界 → hit 1/1', a && `${a.hit}/${a.total}`);
  ok(a && a.volume && !a.volume.tooQuiet, '综合分析带音量结论');
  ok(a && a.pitch && Math.abs(a.pitch.medianHz - 220) <= 11, '综合分析带音高结论');
  ok(M.analyzePcm([], 16000) === null && M.analyzePcm([new Float32Array(0)], 16000) === null,
    '空音频 → null，不除零');
  const quiet = M.analyzePcm([sine(220, 0.002, 1)], 16000, { targetText: 'one two' });
  ok(quiet && quiet.volume.tooQuiet && quiet.pauses.length === 0,
    '几乎无声：报音量低但不报"超长停顿"');
  const auto = M.analyzePcm([withGap(220, 0.5, 2, 0.8, 1.2)], 16000, { targetText: 'Hot, please, and a latte.' });
  ok(auto && auto.total >= 1, '未显式传 boundaries 时从标点自动推导', auto && `${auto.hit}/${auto.total}`);
}

/* ───────── 重采样 ───────── */
{
  const r = M.resampleMono16k([sine(220, 0.5, 1, 48000)], 48000);
  ok(r && r.length === 16000, '48kHz 1s → 16kHz 16000 采样', r && String(r.length));
  const stereo = M.resampleMono16k([new Float32Array([1, 1]), new Float32Array([-1, -1])], 16000);
  ok(stereo && stereo[0] === 0 && stereo[1] === 0, '立体声混单声道');
  ok(M.resampleMono16k([], 16000) === null, '空声道 → null');
  ok(M.encodeWavMono16k([new Float32Array(16000)], 16000) instanceof ArrayBuffer,
    'WAV 编码仍可用（resample 重构后）');
}

/* ───────── 页面接线 ───────── */
{
  const speakBack = strip(read('src/pages/SentenceLabPage/components/SpeakBack.tsx'));
  ok(/analyzeBlob\(/.test(speakBack), 'SpeakBack 调用共享 analyzeBlob');
  ok(/analysis\.volume/.test(speakBack) && /analysis\.pitch/.test(speakBack),
    'SpeakBack 展示音量与音高');
  ok(!/async function analyze\(/.test(speakBack), 'SpeakBack 不再保留第二份本地 analyze 实现');
  ok(/item\.en\.trim\(\)\.endsWith\('\?'\)/.test(speakBack), 'SpeakBack 对疑问句给句尾上扬提示');

  const page = strip(read('src/pages/ShadowingPage/ShadowingPage.tsx'));
  ok(/analyzeBlob\(uploadBlob/.test(page), '影子跟读在录音后并行跑离线分析');
  ok(/本地节奏分析/.test(page) && /localAnalysis\.volume/.test(page) && /localAnalysis\.pitch/.test(page),
    '影子跟读展示音量/停顿/音高（ASR 失败也有）');
  ok(/localAnalysis\?\.pace/.test(page), '语速优先用共享分析结果');
  ok(/不评音素/.test(page), '界面明确不评音素发音');
}

/* ───────── 汇总 ───────── */
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  if (!r.pass) console.log(`  ✗ ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`);
}
console.log(`\n断言 ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.log('✗ 有失败'); process.exit(1); }
console.log('✓ 离线跟读分析（音量/停顿/音高/语速）契约成立');
