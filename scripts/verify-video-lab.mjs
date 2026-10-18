#!/usr/bin/env node
/**
 * verify-video-lab.mjs — 「视频精听」数据层与页面的契约守卫
 *
 * 覆盖：
 *  ① 字幕解析真跑（SRT / VTT / dshzmd JSON）：BOM、CRLF、多行 cue、缺序号、乱序时间轴、
 *     内联标记（`<i>` / `<c.x>` / `{\an8}` / `v 说话人:`）、无效时间戳丢条；
 *  ② 存储层真跑（注入假 IDB）：索引封顶会**连媒体一起删**、写失败不谎报也不留半课、
 *     逐句中文分键存（回写不许重存 blob）、load 合并中文、remove 清三键；
 *  ③ 进度合并与封顶（safeStorage 那份小记录）；
 *  ④ 页面接线：六件套一处不许漏、点句跳转与单句循环真的走时间轴、
 *     blob URL 必须 revoke（泄漏比缓存贵）、练习界面零提示口径。
 *
 * ⚠️ 转译一律带 `target: ES2022`：降到 ES5 会把 `[...x]` 换成只读 `.length` 的
 *    __spreadArray，迭代器展开**静默变空数组**（本仓真翻过一次，见 verification.md 第 39 测）。
 * 用法：node scripts/verify-video-lab.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
const ok = (cond, name, detail) => results.push({ pass: !!cond, name, detail });
/**
 * 剥注释必须走编译器，不能用正则猜：页面的 input accept 属性里那个斜杠加星号
 * 会让裸正则从属性中间一路吃到后面真正的注释结尾，一次吞掉 9KB 源码 ——
 * 于是"接线断言"变成"这段代码不存在"的假红（本轮真实踩到）。
 * removeComments 的转译只剥注释、不动代码。
 */
const strip = (s) => ts.transpileModule(s, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, removeComments: true },
}).outputText;

const libRaw = read('src/lib/video-lab.ts');
// 去掉 idb 依赖与那个直连 IDB 的单例（守卫用假 API 跑 createVideoStore）
const lib = strip(libRaw)
  .replace(/import \{[^}]*\} from '\.\/idb';?/g, '')
  .replace(/export const videoStore[\s\S]*?\}\);\s*/g, '');

/* ── 载入被测模块（整段转译真跑，不抄第二份实现） ── */
const js = ts.transpileModule(lib + '\nmodule.exports={INDEX_KEY,parseTimestamp,stripCueTags,parseSrt,parseVtt,parseDshJson,detectSubtitleFormat,parseSubtitle,lessonId,guessLang,createVideoStore,mergeProgress,tokenizeSpeech,scoreSpeech};',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const M = mod.exports;
const IDX = M.INDEX_KEY; // 守卫不许硬编码键名：写死一次，改了常量的断言就会悄悄真空通过
ok(typeof M.parseSrt === 'function' && typeof M.createVideoStore === 'function', '真跑脚手架：video-lab 整段转译可加载');

/* ── ① 解析 ── */
{
  const T = M.parseTimestamp;
  ok(T('00:01:02,500') === 62.5, '真跑：SRT 毫秒逗号写法 → 秒', String(T('00:01:02,500')));
  ok(T('00:01:02.500') === 62.5 && T('01:02.500') === 62.5, '真跑：VTT 点号与 mm:ss 两种都认');
  ok(T('1:00:00') === 3600, '真跑：一小时整');
  ok(Number.isNaN(T('abc')) && Number.isNaN(T('')), '真跑：认不出返回 NaN（丢条，不猜成 0）');

  ok(M.stripCueTags('<i>hello</i> <c.yellow>world</c>') === 'hello world', '真跑：剥 HTML/颜色标记');
  ok(M.stripCueTags('{\\an8}sub text') === 'sub text', '真跑：剥 ASS 风格覆盖标签');
  ok(M.stripCueTags('v Speaker 1: hi there') === 'hi there', '真跑：剥说话人前缀');
  ok(M.stripCueTags('a&nbsp;b &amp; c') === 'a b & c', '真跑：实体转义收掉（&amp; 先于 &l?t?;）');

  // 文件顺序故意排成 4s → 0.5s → 9s：不然"按起点排序"这条断言测的是空气（样本本身就有序）
  const srt = [
    '\uFEFF2',
    '00:00:04,000 --> 00:00:05,000',
    '<b>bolded</b> cue',
    '',
    '1',
    '00:00:00,500 --> 00:00:02,000',
    'first line',
    'second line of same cue',
    '',
    '3',
    '00:00:09,000 --> 00:00:08,000',
    'end before start (坏数据)',
    '',
    '4',
    '00:00:03,000 --> 00:00:03,500',
    '   ',
    '',
    '5',
    'bad time line',
    'no arrow so dropped',
  ].join('\r\n');
  const { list: srtList, format } = M.parseSubtitle(srt);
  ok(format === 'srt', '真跑：BOM + CRLF 的 SRT 认成 srt', format);
  ok(srtList.length === 3, '真跑：多行 cue 合并、空文本丢、无 --> 的块丢、乱序保留（共 3 条）', `${srtList.length}`);
  ok(srtList[0].text === 'first line second line of same cue', '真跑：同一条 cue 的两行并成一句', srtList[0].text);
  ok(srtList[0].i === 0 && srtList[1].i === 1 && srtList[2].i === 2, '真跑：编号按排序后重排（不信任文件里的序号）');
  ok(srtList.map((s) => s.t0).join(',') === '0.5,4,9', '真跑：时间轴按起点排序（文件里是 4s→0.5s→9s，不排序就会跳着播）', srtList.map((s) => s.t0).join(','));
  ok(srtList.find((s) => s.text.includes('end before start')).t1 >= srtList.find((s) => s.text.includes('end before start')).t0,
    '真跑：t1 < t0 的坏条目被夹住而不是留着让循环逻辑死循环');

  const vtt = ['WEBVTT', 'Kind: captions', 'Language: en', '', 'NOTE 这是注释块，不该变成字幕', 'ignored text', '', '00:00:01.000 --> 00:00:02.000', 'hello there'].join('\n');
  const { list: vttList, format: vf } = M.parseSubtitle(vtt);
  ok(vf === 'vtt' && vttList.length === 1 && vttList[0].text === 'hello there',
    '真跑：VTT 头部与 NOTE 块都不进字幕', `${vf}/${vttList.length}`);

  const dsh = JSON.stringify({
    cached: true,
    result: {
      video_name: 'nobel.mp4', duration: 293.9, language: 'en',
      sentences: [
        { i: 0, t0: 3.6, t1: 8.4, text: 'Every year the world looks to Stockholm', words: [{ w: 'Every', t0: 3.6, t1: 4.1, sb: true }, { w: 'year', t0: 4.1, t1: 4.3 }] },
        { i: 1, t0: 9, t1: 12, text: 'Second sentence here' },
      ],
    },
  });
  const dj = M.parseDshJson(dsh);
  ok(dj.meta.title === 'nobel.mp4' && dj.meta.lang === 'en' && Math.abs(dj.meta.duration - 293.9) < 1e-6,
    '真跑：dshzmd 的 result 包装层与元数据都吃到', JSON.stringify(dj.meta));
  ok(dj.list[0].words.length === 2 && dj.list[0].words[1].w === 'year', '真跑：词级时间戳保留（卡拉OK 逐词高亮靠它）');
  const bare = M.parseDshJson(JSON.stringify({ sentences: [{ start: 1, end: 2, content: 'alias fields' }] }));
  ok(bare.list[0].t0 === 1 && bare.list[0].t1 === 2 && bare.list[0].text === 'alias fields',
    '真跑：start/end/content 别名字段也吃（服务改字段名时不至于全空）');
  ok(M.detectSubtitleFormat('WEBVTT\n\n1') === 'vtt' && M.detectSubtitleFormat('{"a":1}') === 'json'
    && M.detectSubtitleFormat('00:00:01,000 --> 00:00:02,000') === 'srt' && M.detectSubtitleFormat('plain') === 'unknown',
    '真跑：四种格式判定各就各位');
  ok(M.lessonId('A B.mp4', 10, 100) === M.lessonId(' a  b.MP4 ', 10, 100) && M.lessonId('A', 10, 100) !== M.lessonId('A', 11, 100),
    '真跑：id 对标题大小写/空格不敏感，但换时长或字节就是另一课');
  ok(M.guessLang('hello world') === 'en' && M.guessLang('你好世界') === 'zh' && M.guessLang('こんにちは') === 'ja' && M.guessLang('123') === '',
    '真跑：语种猜测（判不出留空给"自动"，不硬猜）');
}

/* ── ② 存储层真跑（假 IDB） ── */
{
  const mk = () => {
    const db = new Map();
    const box = { db, fails: new Set(), writes: 0 };
    const api = {
      put: async (id, rec) => {
        if (box.fails.has(id)) return false;
        box.writes++;
        // 存**结构**而不是整份 JSON 化：Blob 走 JSON 会变成 {}，那样测不出 load 的 blob 分支
        db.set(id, { ...rec, blob: rec.blob });
        return true;
      },
      get: async (id) => (db.has(id) ? db.get(id) : null),
      del: async (id) => { db.delete(id); return true; },
    };
    return { store: M.createVideoStore(api), box };
  };
  const meta = (id, created) => ({ id, title: `${id}.mp4`, duration: 100, lang: 'en', bytes: 10, mime: 'video/mp4', sentenceCount: 2, hasWords: true, createdAt: created });
  const subs = [{ t0: 1, t1: 2, text: 'one', words: [{ w: 'one', t0: 1, t1: 2 }] }, { t0: 3, t1: 4, text: 'two' }];

  (async () => {
    const { store, box } = mk();
    ok((await store.save(meta('v1', 1), subs, new Blob(['x'], { type: 'video/mp4' }))) === true, '真跑：保存一课成功');
    ok(await store.save(meta('v0', 0), [], null) === false, '真跑：空字幕不保存（不留打不开的空课）');
    const list = await store.list();
    ok(list.length === 1 && list[0].id === 'v1', '真跑：列表只有一条', JSON.stringify(list.map((x) => x.id)));

    const lesson = await store.load('v1');
    ok(lesson && lesson.sentences.length === 2 && typeof lesson.url === 'string' && lesson.url.startsWith('blob:'),
      '真跑：load 拿到字幕与媒体 object URL', JSON.stringify(lesson && { n: lesson.sentences.length, url: String(lesson.url).slice(0, 18) }));
    if (lesson?.url) URL.revokeObjectURL(lesson.url);
    // 负对照：媒体记录被写坏（blob 不是 Blob，例如半途中断/别的实现导出）时不许抛，退化成"无原声"
    b2box: {
      const { store: sb, box: bb } = mk();
      await sb.save(meta('bad', 1), subs, new Blob(['x']));
      bb.db.set('m:bad', { id: 'm:bad', blob: '不是 Blob' });
      const badLesson = await sb.load('bad');
      ok(badLesson && badLesson.url === null && badLesson.sentences.length === 2,
        '真跑：坏 blob 退化成无原声而不是抛异常（字幕-only 与损坏记录都不该掀翻页面）', JSON.stringify(badLesson && { url: badLesson.url }));
    }
    ok(lesson.sentences[0].words.length === 1, '真跑：词级时间戳随字幕回来');
    ok(await store.load('nope') === null, '真跑：不存在的课返回 null（页面据此显示空态而不是崩）');

    /* 逐句中文分键存：不许把 blob 再写一遍 */
    const wBefore = box.writes;
    await store.saveZh('v1', ['第一句', '第二句']);
    const recMedia = box.db.get('m:v1');
    // 中文记录 + 索引共两条小写入，**不含**媒体记录：把整条带 blob 的记录重写一遍才是真坑
    ok(recMedia && recMedia.blob instanceof Blob && box.writes === wBefore + 2,
      '真跑：写中文只多两条小写入（z: 记录 + 索引）且不重存媒体（回写重存几十 MB 是看不出来的性能坑）', `writes+${box.writes - wBefore}`);
    ok(box.writes > wBefore && (await store.load('v1')).sentences[0].zh === '第一句',
      '真跑：中文写进去后 load 合并回来');
    const idx = box.db.get(IDX);
    ok(idx.items[0].hasZh === true, '真跑：索引标上 hasZh（列表页据此决定要不要提示翻译）');

    /* 写失败：既不谎报成功，也不留半课 */
    const { store: s2, box: b2 } = mk();
    b2.fails.add('s:vfail');
    const saved = await s2.save(meta('vfail', 5), subs, new Blob(['x']));
    ok(saved === false, '真跑：字幕写入失败 → save 返回 false（不谎报）', String(saved));
    ok((await s2.list()).length === 0, '真跑：失败时索引不更新（不会留下一条点开就空白的课）');
    ok(!b2.db.has(IDX), '真跑：连索引记录都不该存在');

    /* 封顶 50：淘汰最旧的一条，并把它连媒体一起删掉 */
    const { store: s3, box: b3 } = mk();
    for (let i = 0; i < 52; i++) await s3.save(meta(`k${i}`, i), subs, new Blob([`B${i}`]));
    const l3 = await s3.list();
    ok(l3.length === 50, '真跑：课程索引封顶 50', `${l3.length}`);
    ok(l3[0].id === 'k51' && l3[49].id === 'k2', '真跑：留下的是最新的 50 条（按 createdAt 倒序）', `${l3[0].id}..${l3[49].id}`);
    ok(!b3.db.has('m:k0') && !b3.db.has('s:k0'), '真跑：被淘汰那条的媒体与字幕一起删（只删索引会白占几百 MB）');
    ok(b3.db.get(`m:k51`).blob instanceof Blob, '真跑：留下的记录 blob 本体完好（索引对了但内容丢了更糟）');
    ok(b3.db.has('m:k2'), '真跑：边界内的最后一条没被误删');

    /* remove 清三键 */
    await s3.saveZh('k51', ['a', 'b']);
    await s3.remove('k51');
    ok(!b3.db.has('m:k51') && !b3.db.has('s:k51') && !b3.db.has('z:k51'), '真跑：删除一课清齐三键（残留中文记录会永远占盘）');
    ok((await s3.list()).find((x) => x.id === 'k51') === undefined, '真跑：删除后列表里没有它');

    /* ③ 进度合并 */
    let all = {};
    all = M.mergeProgress(all, 'v1', { lastI: 3 }, 1000);
    all = M.mergeProgress(all, 'v1', { listened: 12 }, 2000);
    ok(all.v1.lastI === 3 && all.v1.listened === 12 && all.v1.updatedAt === 2000,
      '真跑：进度按字段合并（后写不清掉先写的）', JSON.stringify(all.v1));
    for (let i = 0; i < 90; i++) all = M.mergeProgress(all, `p${i}`, { lastI: i }, 3000 + i);
    ok(Object.keys(all).length === 80, '真跑：进度记录封顶 80 条', `${Object.keys(all).length}`);
    ok(!all.p0 && !!all.p89, '真跑：淘汰的是最久没动的，不是随机一条');

    /* ④ 页面接线（有页面之后才会亮） */
    const pageExists = fs.existsSync(path.join(ROOT, 'src/pages/VideoLabPage/VideoLabPage.tsx'));
    ok(pageExists, 'P0-b 页面已落地（src/pages/VideoLabPage/VideoLabPage.tsx）');
    if (pageExists) {
      const rawPage = read('src/pages/VideoLabPage/VideoLabPage.tsx');
      const page = strip(rawPage);
      // 脚手架自证：剥注释的 helper 自己也得上测试台。页面的 input accept 属性里那个
      // "斜杠星"会让裸正则从属性中间一路吃到后面的真注释结尾，一次吞掉 9KB 源码，
      // 于是下面的接线断言全变成"这段代码不存在"的假红（本轮真实踩到）。
      const fixture = 'const a = <input accept="video/*,audio/*" />;\nconst markerAfterAttr = 1;\n/* 真注释要消失 */\nconst b = 2;';
      const strippedFixture = strip(fixture);
      ok(/const markerAfterAttr = 1;/.test(strippedFixture) && !/真注释/.test(strippedFixture),
        '脚手架自证：strip 只剥注释，不被 accept 属性里的斜杠星骗到', `剥后 ${strippedFixture.length} 字符`);
      const app = strip(read('src/app.tsx'));
      const side = strip(read('src/components/AppSidebar.tsx'));
      const consts = strip(read('src/pages/DashboardPage/constants.ts'));
      const stats = strip(read('src/lib/use-learning-stats.ts'));
      const charts = strip(read('src/pages/ProgressPage/components/ProgressCharts.tsx'));
      ok(/path="video"/.test(app) && /lazy\(\(\) => import\("@\/pages\/VideoLabPage\/VideoLabPage"\)/.test(app)
        && /PageErrorFallback page="视频精听"/.test(app), '六件套①：路由 + lazy import + 独立 ErrorBoundary 都在 app.tsx');
      ok(/'\/video': \(\) => import\('@\/pages\/VideoLabPage\/VideoLabPage'\)/.test(side)
        && /path: '\/video', label: '视频精听'/.test(side), '六件套②：侧边栏预取表 + NAV_ITEMS 各一处');
      ok(/key: 'video'/.test(consts), '六件套③：首页进度环 MODULES');
      ok(/video/.test(stats) && /'video'/.test(stats), '六件套④⑤：moduleProgress 类型 + MODULE_PROGRESS_KEYS 白名单（漏白名单会被 mergeStats 丢弃）');
      ok(/video:/.test(charts), '六件套⑥：ProgressCharts 颜色与名称');
      ok(/currentTime\s*=/.test(page) && /t0/.test(page), '点句跳转真的写 video.currentTime');
      ok(/loop|单句循环/.test(page), '单句循环有实现入口');
      ok(/revokeObjectURL/.test(page), 'blob URL 用完 revoke（泄漏比缓存贵）');
      ok(!/toast/.test(page) || /toast\.(error|message)/.test(page), '精听界面零提示口径（只允许失败/空态）');

      /* ⑤ P0-c：查词 / 收藏 / 朗读 / 听写 */
      ok(/queryWords\(\{ search: word, limit: 1 \}\)/.test(page) && /preloadCoreOnly\(/.test(page),
        '查词先问核心层、查不到再预热重查（不许预热前就说"没找到"）');
      ok(/cur\.words\?\.length \? cur\.words : cur\.text\.split\(\/\\s\+\/\)/.test(page),
        '没有词级时间戳的普通 SRT 也按空白切成词面（否则"点词查词"在最常见的那种字幕上退化成点整句 —— 2026-10-18 走查抓到）');
      ok(/addCustomWord\(\{/.test(page) && /isCustomWord\(/.test(page),
        '生词本按钮真的写 addCustomWord（进 SM-2），并用界面文案显示"已在生词本"');
      ok(/addFavorite\(\{ type: 'video'/.test(page) && /isFavorited\(cleanText\((cur|s)\.text\), 'video'\)/.test(page),
        '收藏句走 type=video 且判重看同一个 type（跨 type 判重会同词存两条）');
      ok(/tts\.speak\(cur\.text\)/.test(page), '朗读本句接 useTTS');
      ok(/addSpelling\(videoToSpellingItem\(/.test(page), '「听写这句」走单一口径 videoToSpellingItem（不许在页面自己拼 level/difficulty）');
      ok(/disabled=\{inSpellingBook\}/.test(page) && /normSentenceKey\(s\.en\) === normSentenceKey\(cur\.text\)/.test(page),
        '已在听写本时按钮变状态（界面反馈，不弹 toast）');
      const spelling = strip(read('src/pages/SpellingPage/SpellingPage.tsx'));
      ok(/VIDEO_LEVEL/.test(spelling) && /CORRECTION_LEVEL \|\| lvl === VIDEO_LEVEL/.test(spelling),
        '拼写页认得 video 桶，并和纠偏桶共用同一条早退分支（不许各写一份）');
      ok(/video:\s*["']视频精听["']/.test(spelling), '拼写页词库触发器显示「视频精听」（容忍转译器的引号与空格规范化）');

      /* ⑥ P1 跟读 + P2 双语：两条都必须在"通道不存在"时说实话 */
      ok(/onClick=\{shadowThis\}/.test(page) && /scoreSpeech\(cur\.text, t\)/.test(page),
        '跟读按钮接到识别，评分用 scoreSpeech 这一个口径');
      ok(/没有语音识别通道/.test(page), '无 SpeechRecognition 时明说用不了 + 给替代路（安卓 WebView 常见，不许假装能打的分）');
      ok(/let watch[\s\S]{0,1400}rec\.start\(\);\s*\}\s*catch/.test(page),
        '跟读：start() 抛错有兜底（WebView 往往是"对象能构造、start() 当场抛 NotSupportedError"，不兜就卡在"正在听…"= 点了没反应）');
      ok(/, 9000\)/.test(page) && /clearTimeout\(watch\)/.test(page),
        '跟读：有 9 秒看门狗且拿到结果就撤（onerror/onend 一个都不回的那种设备不许永久挂死）');
      ok(/rec\.start\(\)/.test(page) && /recRef\.current\?\.abort\(\)/.test(page),
        '识别有起点也有终点（卸载时 abort，否则切走页面还在听）');
      ok(/aiChat\(\[/.test(page) && /parseBatchTranslation\(raw, batch\.length\)/.test(page),
        '译文复用整书翻译那个编号 JSON 解析器（不另写一份正则）');
      ok(/videoStore\.saveZh\(lesson\.meta\.id, zhArr\)/.test(page), '译文分键存回 IDB（回写不许重存 blob）');
      ok(/TRANSLATE_LIMIT/.test(page) && /todo\.slice\(0, TRANSLATE_LIMIT\)/.test(page),
        '一次只翻固定句数（长视频不许一口气打爆额度），剩下的提示再点一次');
      ok(/还没配 AI Key/.test(page) && /AI 这次没返回内容/.test(page),
        'AI 未配置 / 返回空 / 编号对不上三档降级各有实话（不把失败说成成功）');
      ok(/zhNote && <p/.test(page) && /micNote && <p/.test(page), '降级说明显示在卡内文案（练习界面零提示口径）');
    }

    /* ⑦ 跟读评分真跑（LCS，不是集合交集） */
    {
      const S = M.scoreSpeech;
      ok(typeof S === 'function', '真跑脚手架：scoreSpeech 已导出');
      const perfect = S('the book is on the table', 'the book is on the table');
      ok(perfect.accuracy === 1 && perfect.missed.length === 0, '真跑：全对上 = 100%，无漏读');
      const dup = S('the book is on the table', 'the book is on table');
      ok(dup.accuracy === 5 / 6 && dup.missed.join() === 'the',
        '真跑：漏掉第二个 the 只扣那一次（重复词按词序算，不是集合交集）', `acc=${dup.accuracy} missed=${dup.missed}`);
      const extra = S('the book is on the table', 'the book really is on the table right now');
      ok(extra.accuracy === 1, '真跑：多说的插入词不压低命中', String(extra.accuracy));
      const wrong = S('a b c d', 'x y z w');
      ok(wrong.accuracy === 0 && wrong.missed.join() === 'a,b,c,d', '真跑：全错 = 0% 且四个词都列进没读准');
      const empty = S('a b c', '');
      ok(empty.accuracy === 0 && empty.missed.length === 3, '真跑：没说话不 NaN，按整句漏读');
      ok(S('', 'anything').accuracy === 0, '真跑：空目标句不除零');
      ok(S("Don't go!", 'dont go').accuracy === 1, '正对照：大小写、标点、缩写撇号都在比对前归一（识别引擎加不加撇号不该影响得分）');
      ok(M.tokenizeSpeech("Hello, world! it's").join('|') === 'hello|world|its',
        '真跑：分词剥标点与撇号（it\'s → its）', M.tokenizeSpeech("Hello, world! it's").join('|'));
    }

    let pass = 0, fail = 0, names = [];
    for (const r of results) { if (r.pass) pass++; else { fail++; names.push(r.name); } }
    console.log('');
    console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
    names.forEach((n) => console.log('  ✗ ' + n));
    process.exit(fail ? 1 : 0);
  })();
}
