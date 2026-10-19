#!/usr/bin/env node
/**
 * fetch-video-source.mjs —— 拉源视频，并**核对"平台声称的时长"与"实际拿到的时长"**。
 *
 * 为什么单独要一个工具：B 站对某些视频/账号只给前 10 分钟，而 yt-dlp 的元数据仍写整片时长。
 * 实测（2026-10-19，BV1xk1VBcE2v p3）：元数据 duration=1183.04，480p 与 720p 两份下载
 * 的容器与两条轨**都是 600.099 秒** —— 文件自洽，所以出包工具与逐课质检都看不出被截断，
 * 结果就是把 10 分钟的一段当成"完整一期"发出去。只有在这一刻能发现。
 *
 * 用法：node scripts/fetch-video-source.mjs <URL> <落地名> [--dest 目录] [--max-h 480]
 *   落地到 B:/dshzmd/data/uploads/<名>.mp4（转录伴侣的媒体库），打印元数据时长 / 实测时长 / 判定。
 * 退出码：0 = 完整；3 = 被截断（仍已落地，但**必须**在课包说明里写破，或换源/换账号重拉）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const URL_ = argv[0];
const NAME = argv[1];
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DEST = flag('dest', 'B:/dshzmd/data/uploads');
const MAX_H = Number(flag('max-h', 480));
const COOKIES = flag('cookies', 'B:/tmp/nt-cookies.txt');
if (!URL_ || !NAME) { console.log('用法：node scripts/fetch-video-source.mjs <URL> <落地名> [--dest 目录] [--max-h 480]'); process.exit(2); }

/** 优先 avc1 的 DASH 分离流（WebView 一定解得动），退一步才允许任何 ≤max-h 的组合流 */
const FMT = `bv*[height<=${MAX_H}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${MAX_H}][vcodec^=avc1]/b[height<=${MAX_H}]/bv*[height<=${MAX_H}]+ba/b[height<=${MAX_H}]`;
const out = path.join(DEST, NAME + '.mp4');
fs.mkdirSync(DEST, { recursive: true });

const meta = JSON.parse(execFileSync('yt-dlp', ['--cookies', COOKIES, '--no-playlist', '-J', URL_],
  { encoding: 'utf8', maxBuffer: 64e6, timeout: 180000 }).trim());
const 声称秒 = Math.round(Number(meta.duration) || 0);
console.log(`· 平台元数据：${(meta.fulltitle || '').slice(0, 60)} · 声称 ${声称秒}s（${(声称秒 / 60).toFixed(1)} 分钟）`);

execFileSync('yt-dlp', ['--cookies', COOKIES, '--no-playlist', '-f', FMT, '--merge-output-format', 'mp4',
  '-o', path.join(DEST, NAME + '.%(ext)s'), URL_], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], timeout: 1800000 });

const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
  'format=duration:stream=codec_type,duration', '-of', 'json', f], { encoding: 'utf8', timeout: 120000 }).trim());
const pj = probe(out);
const 实得秒 = Math.round(Number(pj.format && pj.format.duration) || 0);
const 轨 = (pj.streams || []).map((s) => `${s.codec_type} ${Math.round(Number(s.duration) || 0)}s`).join(' + ');
const 大小MB = (fs.statSync(out).size / 1048576).toFixed(1);
const 有画面 = (pj.streams || []).some((s) => s.codec_type === 'video');

console.log(`· 实际落地：${out} · ${大小MB}MB · 容器 ${实得秒}s · ${轨} · 画面轨 ${有画面 ? '有' : '✗ 没有'}`);
const 比值 = 声称秒 ? 实得秒 / 声称秒 : 1;
if (!有画面) { console.log('✗ 没有画面轨 —— 用户的硬要求是素材必须有画面，这份别入库'); process.exit(4); }
if (声称秒 && 比值 < 0.95) {
  console.log(`✗ 被截断：只拿到 ${Math.round(比值 * 100)}%（${实得秒}s / 声称 ${声称秒}s）。`);
  console.log('   要么换源（别的 UP 主/别的分 P）、要么在课包说明里写破"只覆盖前 N 分钟"，不许当完整一期发。');
  process.exit(3);
}
console.log('✓ 时长对得上，可以进转录/出包');
