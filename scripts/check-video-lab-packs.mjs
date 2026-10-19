#!/usr/bin/env node
/**
 * 核验 B:/nt-materials/video-lab 里每一课「素材包」是否真的可用 —— 逐课实测，不给形容词。
 *
 * 为什么要有这支脚本：出包工具（make-video-lab-packs.mjs）过去按转录伴侣记的**整条原片时长**裁媒体，
 * 而下载往往是截断的，于是"裁到 5:45"实际只留下 3:38，字幕却到 5:28 —— App 里播放器一路空转，
 * 界面上的"0:00 / 5:45"和 41 句全部进来这些证据都是真的，用户仍然觉得时间线乱跳。
 * 本脚本把「媒体末秒 vs 字幕末秒」「有没有画面」「是不是静音」三件事钉死，改动包工具后必跑。
 *
 * 用法：node scripts/check-video-lab-packs.mjs          # 全部课
 *      node scripts/check-video-lab-packs.mjs 04-       # 只验目录名含 04- 的
 * 退出码非 0 = 有课不合格（缺文件 / 无画面 / 静音 / 时长对不上）。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAT = process.env.NT_OUT || 'B:/nt-materials/video-lab';
const only = process.argv[2] || '';
/** 媒体末秒与字幕末秒允许差这么多秒：转录的最后一句常常在片尾前收尾，差一点不算坏 */
const SLACK = Number(process.env.NT_SLACK || 3);

const ffprobeJson = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error',
  '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file],
  { encoding: 'utf8', timeout: 60000 }));

/** ffmpeg 的 volumedetect 真读一遍采样，拿峰值 dB —— 静音轨（-91 dB）一眼就能筛掉。报告在 stderr，两个流都要收 */
const peakDb = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 180000 });
  return String(r.stdout || '') + String(r.stderr || '');
};

const rows = [];
let bad = 0;
for (const dir of fs.readdirSync(MAT).sort()) {
  if (only && !dir.includes(only)) continue;
  const full = path.join(MAT, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  const files = fs.readdirSync(full);
  const media = files.find((f) => /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(f));
  const subs = files.find((f) => /\.srt$/i.test(f));
  const json = files.find((f) => /\.json$/i.test(f));
  const note = files.find((f) => f === '说明.txt');
  const row = { 课: dir, 缺: [!media && '媒体', !subs && 'SRT', !json && 'JSON', !note && '说明.txt'].filter(Boolean).join('/') || '无' };
  if (row.缺 !== '无') { row.判定 = '✗ 缺文件'; bad++; rows.push(row); continue; }

  const j = JSON.parse(fs.readFileSync(path.join(full, json), 'utf8'));
  const list = (j.result || j).sentences || [];
  const subEnd = Math.round(list.reduce((m, x) => Math.max(m, x.t1 || 0), 0));
  const subStart = Math.round(list.reduce((m, x) => Math.min(m, x.t0 || 0), Number.MAX_SAFE_INTEGER) * 10) / 10;
  const metaDur = Math.round((j.result || j).duration || 0);

  const pj = ffprobeJson(path.join(full, media));
  const v = (pj.streams || []).find((x) => x.codec_type === 'video') || null;
  const a = (pj.streams || []).find((x) => x.codec_type === 'audio') || null;
  const realDur = Math.round(Number(pj.format && pj.format.duration) || 0);

  row.画面 = v ? `${v.codec_name} ${v.width}x${v.height}` : '✗ 无画面轨';
  row.音频 = a ? a.codec_name : '✗ 无';
  row.媒体秒 = realDur;
  row.字幕秒 = subEnd;
  row.句数 = list.length;
  row.字幕起点 = subStart;
  row.差秒 = realDur - subEnd;
  const vol = peakDb(path.join(full, media));
  const pk = (String(vol).match(/max_volume: (-?[\d.]+) dB/) || [])[1];
  row.峰值dB = pk ?? '读不出';

  /**
   * 顺手抽一帧预览：ffprobe 只能证明"有画面轨"，证明不了画面是不是被教学贴图占了
   * （翻录的电视画面、卡拉OK式大字幕、右侧一整块词汇表 —— 这三种都能过上面所有机器判据）。
   * 出包后必须人眼过一遍，所以把图落在课目录里，一次看全。--no-frames 跳过。
   */
  if (!process.argv.includes('--no-frames') && realDur > 0) {
    const jpg = path.join(full, '预览.jpg');
    try {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.round(realDur * 0.4)), '-i',
        path.join(full, media), '-frames:v', '1', '-vf', 'scale=480:-1', jpg],
        { encoding: 'utf8', timeout: 120000 });
      row.预览 = '预览.jpg';
    } catch { row.预览 = '抽帧失败'; }
  }

  const errs = [];
  if (!v) errs.push('没有画面轨（用户的硬要求：素材必须有画面）');
  if (!a) errs.push('没有音轨');
  if (pk && Number(pk) < -60) errs.push('音轨几乎是静音（峰值 ' + pk + ' dB）');
  if (subEnd / Math.max(1, realDur) > 1.25) errs.push('字幕比媒体长：播放器会一路空转');
  if (realDur - subEnd > SLACK) errs.push(`媒体比字幕长 ${realDur - subEnd}s：到片尾前的空白会被当成"时间线乱跳"`);
  /** JSON 里的 duration 是转录伴侣记的**整条原片**时长（本包只取其中一段），只报数不当错误 */
  row.原片秒 = metaDur;
  row.判定 = errs.length ? '✗ ' + errs.join('；') : '✓';
  if (errs.length) bad++;
  rows.push(row);
}
console.log(JSON.stringify(rows, null, 1));
console.log(`\n${rows.length - bad}/${rows.length} 课合格${bad ? '（' + bad + ' 课要重出）' : ' ✓'}  口径：媒体末秒与字幕末秒差 ≤ ${SLACK}s，且必须有画面、有声音`);
process.exit(bad ? 1 : 0);
