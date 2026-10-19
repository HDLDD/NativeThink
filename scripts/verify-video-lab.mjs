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
const js = ts.transpileModule(lib + '\nmodule.exports={INDEX_KEY,parseTimestamp,stripCueTags,parseSrt,parseVtt,parseDshJson,detectSubtitleFormat,parseSubtitle,lessonId,guessLang,createVideoStore,mergeProgress,tokenizeSpeech,scoreSpeech,runBatchTranslation,splitImportFiles};',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const M = mod.exports;
const IDX = M.INDEX_KEY; // 守卫不许硬编码键名：写死一次，改了常量的断言就会悄悄真空通过
const WANT_INDEX = String.fromCharCode(118,105,100,101,111,45,105,110,100,101,120);
ok(IDX === WANT_INDEX, '索引键名是那个可读的字面量（曾经一路是星号串，真跑断言也照样绿）', `实际 ${JSON.stringify(IDX)}`);
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
      /**
       * 截断下载的 m4a 会把容器时长写成 100 分钟（实测 B 站流：头 6024s / 真语音 343s），
       * 原生控件照显示假时长 —— 必须说破，并且要说破在**课程视图**里（note 过去只在导入屏渲染）。
       */
      ok(/onLoadedMetadata=\{checkDuration\}/.test(page) && /时长元数据不可靠/.test(page),
        '媒体自带时长与字幕对不上时有实话文案（不许让用户对着 100:24 的进度条猜为什么）');
      ok(/got \/ expect > 1\.6 \|\| got \/ expect < 0\.6/.test(page),
        '假时长的判定是双向比值（超量与不足都要抓，不只是 NaN）');
      ok(/el\.videoWidth === 0 && el\.videoHeight === 0/.test(page) && /只有音频轨、没有画面/.test(page),
        '纯音频媒体要说破"播放器是黑的属正常"（不让人把黑屏当成坏了 —— 2026-10-18 真机差点误报）');
      ok(/note && <p className="px-3 pt-2/.test(page) && /setNote\(''\);\s*setZhBusy\(''\);\s*setZhNote\(''\);\s*setLesson\(l\)/.test(page),
        '这条提示渲染在课程视图，且换课时连同翻译的进行中态/结果文案一起清掉（都不许跟着带到下一课）');
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
      ok(/rec\.start\(\);\s*\}\s*catch \(/.test(page),
        '跟读：start() 抛错有兜底（WebView 往往是"对象能构造、start() 当场抛 NotSupportedError"，不兜就卡在"正在听…"= 点了没反应）');
      /** 第四种形状：start() 成功、既不给 result 也不给 error，直接 end —— 界面当时一个字都没变（2026-10-19 假通道复现） */
      ok(/rec\.onend = \(\) => \{[\s\S]{0,400}if \(!got && !errored\)/.test(page),
        '跟读：直接 end（无结果无报错）也要写一行原因；且判据带 errored —— 不许覆盖 onerror 已经报过的更准原因');
      /** 第五种形状（2026-10-19 真机 Redmi）：没人说话时通道凭空回一句中文 → 被当成"你读得差"的 0 分 */
      ok(/const recLang = lesson\?\.meta\.lang[\s\S]{0,140}rec\.lang = recLang;/.test(page) &&
         /if \(recLang === ['"]en-US['"] && !\/\[A-Za-z\]\/\.test\(t\)\) \{[\s\S]{0,120}setSpoken\(''\);[\s\S]{0,60}setScore\(null\);/.test(page),
        '跟读：英文课里"回报没有一个英文字母"的识别结果不计分（设备幻觉/空回报不许打成学习者的 0%），且语言判定与 rec.lang 同源');
      ok(/, 9000\)/.test(page) && /clearTimeout\(watch\)/.test(page),
        '跟读：有 9 秒看门狗且拿到结果就撤（onerror/onend 一个都不回的那种设备不许永久挂死）');
      ok(/rec\.start\(\)/.test(page) && /recRef\.current\?\.abort\(\)/.test(page),
        '识别有起点也有终点（卸载时 abort，否则切走页面还在听）');
      ok(/aiChat\(\[/.test(page) && /parse: \(raw, count\) => parseBatchTranslation\(raw, count\)/.test(page),
        '译文复用整书翻译那个编号 JSON 解析器（不另写一份正则）');
      ok(/runBatchTranslation\(\{[\s\S]{0,400}batchSize: TRANSLATE_BATCH,\s*concurrency: 1,/.test(page),
        '页面把批次交给调度层，并且钉住串行 1 路（上游免费档并发只有 1，实测抢 3 路会把每批从 4 秒拖成 8–30 秒）');
      ok(/const TRANSLATE_TIMEOUT_MS = 25000;\s*let translateRunning = false;/.test(page),
        '在途锁是模块级的一份（组件重挂载会重置 ref，但同一页面里两课同时翻会把额度打重）');
      ok(/if \(!lesson \|\| translateRunning\)\s*return;/.test(page),
        '翻译入口先看在途锁：重复点击不许再起一轮');
      ok(/finally \{\s*translateRunning = false;\s*setZhBusy\(''\);/.test(page),
        '锁与按钮态一起在 finally 里释放（出错/提前返回都不许把按钮永久留在"翻译中"）');
      ok(/onBatch: \(filled\)[\s\S]{0,600}videoStore\.saveZh\(lessonId, zhArr\.slice\(\)\)/.test(page),
        '每批完成就落盘（不许等整轮翻完才写第一次 —— 中途换课/关掉页面也不该丢已经翻好的）');
      ok(/setZhBusy\(`开始翻译 \$\{part\.length\} 句…`\);[\s\S]{0,120}await runBatchTranslation/.test(page),
        '点下去先给进行中态：按钮立刻禁用（重复点击不许再多打一轮），第一句译文回来就换成真实计数');
      ok(/stopped: \(\) => !activeRef\.current \|\| shownIdRef\.current !== lessonId/.test(page),
        '换课或离开页面就停止取新活（旧轮次的进度/提示不许跟到新课上，也不许继续烧额度）');
      ok(/TRANSLATE_TIMEOUT_MS = 25000/.test(page) && /setTimeout\(\(\) => res\(''\), TRANSLATE_TIMEOUT_MS\)/.test(page),
        '每批自带 30 秒看门狗：实测遇到过请求永不回包，没有它按钮就永久停在"翻译中"（跟读那条坑的 AI 版本）');
      ok(/TRANSLATE_LIMIT/.test(page) && /todo\.slice\(0, TRANSLATE_LIMIT\)/.test(page),
        '一次只翻固定句数（长视频不许一口气打爆额度），剩下的提示再点一次');
      ok(/还没配 AI Key/.test(page) && /AI 服务不可用、被限流，或这一批超时没回话/.test(page) && /另有 \$\{missed\} 句这次没返回/.test(page),
        'AI 未配置 / 一句都没回来 / 部分没回来 三档降级各有实话（不把失败说成成功，也不谎报"已翻译"）');
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

    /* ⑧ 字幕翻译调度真跑：小批 + 并发 + 每批增量回调 + 坏了收摊（页面只喂通道，所以这段才是真凭据） */
    {
      const R = M.runBatchTranslation;
      ok(typeof R === 'function', '真跑脚手架：runBatchTranslation 已导出');
      const items = Array.from({ length: 19 }, (_, i) => ({ k: i * 2, text: `S${i}` }));
      /** 假通道：按批返回编号 JSON，同时记录在飞峰值、每批正文与 ask 收到的句数 */
      const mk = (opts = {}) => {
        const st = { inflight: 0, peak: 0, bodies: [], counts: [] };
        st.ask = (body, count) => {
          st.inflight++; st.peak = Math.max(st.peak, st.inflight); st.bodies.push(body); st.counts.push(count);
          const n = body.split('\n').length;
          const fail = (opts.failFrom && st.bodies.length >= opts.failFrom) || (opts.failAt && opts.failAt.includes(st.bodies.length));
          const cut = opts.cutTo ? Math.max(1, Math.min(n, opts.cutTo)) : n;
          return new Promise((res) => setTimeout(() => {
            st.inflight--;
            res(fail ? '' : JSON.stringify({ t: Array.from({ length: cut }, (_, i) => ({ i: i + 1, zh: `译${i + 1}` })) }));
          }, 8));
        };
        st.parse = (raw) => {
          const m = new Map();
          try { JSON.parse(raw).t.forEach((x) => m.set(x.i - 1, x.zh)); } catch { /* 空/坏 JSON 一律当没拿到 */ }
          return m;
        };
        return st;
      };

      /* a. 批次切分 + 下标映射 + 每批增量回调（串行也要增量，这才是"边翻边上屏"的真凭据） */
      {
        const st = mk();
        const seen = [];
        const r = await R({ items, batchSize: 8, concurrency: 3, ask: st.ask, parse: st.parse, onBatch: (f) => seen.push(f.size) });
        ok(r.batches === 3 && st.bodies.length === 3, '真跑：19 句按 8 句一批切成 3 批（批数与请求数都对得上）', `${r.batches} / ${st.bodies.length}`);
        ok(st.bodies[0] === Array.from({ length: 8 }, (_, i) => `[${i + 1}] S${i}`).join('\n'),
          '真跑：发给 AI 的正文是 [1]..[8] 编号行（编号从 1、顺序与输入一致）', st.bodies[0].replace(/\n/g, '\\n').slice(0, 60));
        ok(st.counts.join(',') === '8,8,3',
          '真跑：ask 的 count 是这一批自己的句数（页面用它算 maxTokens，写成整课句数就会把上限放大到 3800）', st.counts.join(','));
        ok(r.filled.size === 19 && r.missed === 0 && r.haltedEarly === false, '真跑：19 句全部收下，missed 归零');
        ok(r.filled.get(0) === '译1' && r.filled.get(36) === '译3',
          '真跑：译文按 items 的原下标落回（第三批的 [1][2][3] 要落到 k=32/34/36，批内编号不许当成全局位置）', `${r.filled.get(0)} / ${r.filled.get(36)}`);
        ok(seen.length === 3 && seen[0] === 8 && seen[2] === 19,
          '真跑：并发下每批完成就回调一次，第一笔只有 8 句', seen.join(','));
        ok(st.peak > 1, '真跑：并发档位能起来（峰值在飞 >1）', `peak=${st.peak}`);
        const one = mk();
        const seenOne = [];
        await R({ items, batchSize: 8, concurrency: 1, ask: one.ask, parse: one.parse, onBatch: (f) => seenOne.push(f.size) });
        ok(one.peak === 1, '正对照：并发档位真的受控 —— concurrency=1 时峰值回到 1', `peak=${one.peak}`);
        ok(seenOne.join(',') === '8,16,19',
          '真跑：串行同样要一批一回调（页面默认就是串行 1 路；攒到最后才给的话这里会是 8,16,19 变成只有一个 19）', seenOne.join(','));
      }

      /* b. 通道持续坏了：连着两批拿不到内容就整轮收摊 */
      {
        const st = mk({ failFrom: 3 });
        const seen = [];
        const r = await R({ items: Array.from({ length: 40 }, (_, i) => ({ k: i, text: `S${i}` })), batchSize: 8, concurrency: 1, ask: st.ask, parse: st.parse, onBatch: (f) => seen.push(f.size) });
        ok(r.attempted === 4 && st.bodies.length === 4,
          '真跑：连着两批拿不到就收摊（第 3 批坏→退回队尾，第 4 批又坏→停），剩下的第 5 批不该再发出去', `attempted=${r.attempted}`);
        ok(r.retried === 1, '真跑：坏掉的那一批被退回队尾重试过一次', `retried=${r.retried}`);
        ok(r.filled.size === 16 && r.missed === 24 && r.haltedEarly === true,
          '真跑：收摊时已翻好的 16 句保留、24 句记为没返回（提示据此写"再点一次重试剩下的"）', `${r.filled.size}/${r.missed}/${r.haltedEarly}`);
        ok(seen.length === 2, '真跑：空批不回调（没有新译文就别惊动上屏与落盘）', `onBatch ${seen.length} 次`);
      }

      /* g. 同一批最多重试一次：反复坏的那批不该把整轮拖成无休止重排 */
      {
        const st = mk({ failAt: [2, 4] });
        const r = await R({ items: Array.from({ length: 24 }, (_, i) => ({ k: i, text: `S${i}` })), batchSize: 8, concurrency: 1, ask: st.ask, parse: st.parse, onBatch: () => {} });
        ok(r.attempted === 4 && r.retried === 1 && r.haltedEarly === false,
          '真跑：坏批只排回队尾一次；第二次再坏就当它没翻出来（不该无限重排，也不该因此把整轮判成通道坏了）',
          `attempted=${r.attempted} retried=${r.retried} halted=${r.haltedEarly}`);
        ok(r.filled.size === 16 && r.missed === 8, '真跑：那 8 句记进 missed，其余 16 句留住（再点一次只补这 8 句）', `${r.filled.size}/${r.missed}`);
      }

      /* f. 只是一次抖动：坏批排队尾，其余照翻，最后补翻它 */
      {
        const st = mk({ failAt: [1] });
        const r = await R({ items: Array.from({ length: 24 }, (_, i) => ({ k: i, text: `S${i}` })), batchSize: 8, concurrency: 1, ask: st.ask, parse: st.parse, onBatch: () => {} });
        ok(r.attempted === 4 && r.retried === 1 && r.filled.size === 24 && r.missed === 0 && r.haltedEarly === false,
          '真跑：单批抖动（超时/一次 429）不该把整轮几十句一起废掉——退回队尾、后面的照常翻、末尾补翻它',
          `attempted=${r.attempted} filled=${r.filled.size} missed=${r.missed}`);
        const no = mk({ failAt: [1] });
        const r2 = await R({ items: Array.from({ length: 24 }, (_, i) => ({ k: i, text: `S${i}` })), batchSize: 8, concurrency: 1, ask: no.ask, parse: no.parse, onBatch: () => {}, retryFailed: false });
        ok(r2.attempted === 3 && r2.retried === 0 && r2.filled.size === 16 && r2.missed === 8,
          '正对照：关掉 retryFailed 就只发 3 批，坏那批的 8 句记进 missed（重试这道开关是真的在管事）',
          `attempted=${r2.attempted} filled=${r2.filled.size}`);
      }

      /* c. 只回一部分：编号对不上的那些算没翻，不许静默当成功 */
      {
        const st = mk({ cutTo: 5 });
        const r = await R({ items, batchSize: 8, concurrency: 1, ask: st.ask, parse: st.parse, onBatch: () => {} });
        ok(r.filled.size === 13 && r.missed === 6 && r.haltedEarly === false,
          '真跑：一批只回 5 条就只算 5 条（8+8+3 三批 → 5+5+3），剩下的计入 missed，不是按整批成功', `${r.filled.size}/${r.missed}`);
      }

      /* d. 换课/卸载：停止取新活，但已经在途的那批回来照样收下 */
      {
        const st = mk();
        let flips = 0;
        const seen = [];
        const r = await R({
          items: Array.from({ length: 40 }, (_, i) => ({ k: i, text: `S${i}` })),
          batchSize: 8, concurrency: 1, ask: st.ask, parse: st.parse,
          stopped: () => flips >= 2,
          onBatch: (f) => { flips++; seen.push(f.size); },
        });
        ok(r.attempted === 2 && st.bodies.length === 2,
          '真跑：stopped() 转真后立刻停止取新活（换课之后不该继续为旧课发请求）', `attempted=${r.attempted}`);
        ok(r.filled.size === 16 && r.missed === 24,
          '真跑：提前停下的那轮，已拿到的 16 句仍然收下（落盘由调用方在回调里做，一句都不白翻）', `${r.filled.size}`);
      }

      /* e. 边界：空输入不起 worker，batchSize 非法不炸 */
      {
        const st = mk();
        let called = 0;
        const empty = await R({ items: [], batchSize: 8, concurrency: 3, ask: st.ask, parse: st.parse, onBatch: () => { called++; } });
        ok(empty.batches === 0 && st.bodies.length === 0 && called === 0 && empty.missed === 0,
          '真跑：没有待翻句子时一个请求都不发（"全部已翻译"再点一次不许烧额度）');
        const zero = await R({ items, batchSize: 0, concurrency: 0, ask: mk().ask, parse: mk().parse, onBatch: () => {} });
        ok(zero.batches === 19 && zero.filled.size === 19,
          '正对照：batchSize/concurrency 传 0 会被夹成 1（不能除零或起 0 个 worker 而一句不翻）', `${zero.batches}/${zero.filled.size}`);
      }
    }

    /* ⑨ 导入分类真跑：拖拽与"选文件"共用这一份口径（两份实现必然漂移） */
    {
      const S = M.splitImportFiles;
      ok(typeof S === 'function', '真跑脚手架：splitImportFiles 已导出');
      const f = (name, type) => ({ name, type });
      const both = S([f('lecture.mp4', 'video/mp4'), f('lecture.srt', '')]);
      ok(both.media?.name === 'lecture.mp4' && both.subs?.name === 'lecture.srt' && both.extra === 0,
        '真跑：一次拖进"视频 + 字幕"两个文件 → 各自归位，没有剩余', JSON.stringify([both.media?.name, both.subs?.name, both.extra]));
      const subOnly = S([f('daily.srt', 'application/x-subrip')]);
      ok(subOnly.media === null && subOnly.subs?.name === 'daily.srt',
        '真跑：只拖字幕是合法形态（媒体可选，界面据此走"仅字幕课程"）');
      const noMime = S([f('clip.M4A', '')]);
      ok(noMime.media?.name === 'clip.M4A' && noMime.subs === null,
        '真跑：安卓 WebView 常给空 MIME —— 大小写混排的扩展名必须兜住（否则音频被当成"没认出的文件"）',
        JSON.stringify([noMime.media?.name, noMime.subs]));
      const transcript = S([f('b1-shopping-chat.json', 'application/json')]);
      ok(transcript.media === null && transcript.subs?.name === 'b1-shopping-chat.json',
        '真跑：转录伴侣的 JSON 归字幕，不归媒体（它里面虽然有 video 字段，但那是文件名）');
      const twoSubs = S([f('a.mp4', 'video/mp4'), f('first.srt', ''), f('second.vtt', '')]);
      ok(twoSubs.subs?.name === 'first.srt' && twoSubs.extra === 1,
        '真跑：多份字幕取第一份，剩下的计进 extra（界面要如实说"另外 N 个没导"，不许静默丢）',
        JSON.stringify([twoSubs.subs?.name, twoSubs.extra]));
      const trick = S([f('concert.srt.mp4', 'video/mp4')]);
      ok(trick.media?.name === 'concert.srt.mp4' && trick.subs === null,
        '正对照：文件名里带 .srt 的真视频不许被认成字幕', JSON.stringify([trick.media?.name, trick.subs]));
      const second = S([f('a.mp4', 'video/mp4'), f('b.txt', 'video/mp4')]);
      ok(second.media?.name === 'a.mp4' && second.subs === null,
        '真跑：第二个媒体文件（名字像 .txt 也不算字幕）—— 媒体先挑走，剩下的才轮到字幕，两份媒体不许被当成"视频 + 字幕"',
        JSON.stringify([second.media?.name, second.subs?.name]));
      const junk = S([f('截图.png', 'image/png')]);
      ok(junk.media === null && junk.subs === null && junk.extra === 1,
        '真跑：完全不认的文件 → subs 为 null（页面据此提示"没认出手上的文件"，而不是导出一份空课）');
      const txt = S([f('transcript.txt', 'text/plain')]);
      ok(txt.subs?.name === 'transcript.txt', '真跑：纯文本转录（.txt）也在支持的格式里');
    }

    /* ⑩ 用户视角的六处行为契约（删课确认 / 进度清干净 / 选视频反馈 / 拖拽 / 课表展开 / 点了要有反应） */
    {
      const page = strip(read('src/pages/VideoLabPage/VideoLabPage.tsx'));
      ok(/onDrop=\{\(e\) => \{\s*e\.preventDefault\(\);\s*setDragOver\(false\);[\s\S]{0,140}importFiles\(fs\)/.test(page),
        '导入框真的接住拖拽（空态文案承诺了"拖进来"，没有 drop 处理就是撒谎）');
      ok(/pendingMedia\.current = f \|\| null;\s*setPendingName\(f \? f\.name : ''\)/.test(page),
        '系统选择器里点"取消"要清掉上一次的媒体 —— 不清就会把上一段视频悄悄绑进下一课');
      ok(/已选视频：\{pendingName\}[\s\S]{0,220}pendingMedia\.current = null; setPendingName\(''\)/.test(page),
        '选了视频要在界面上写明是哪一份，并给反悔入口（原来只又弹一个选择器，用户不知道发生了什么）');
      ok(/if \(confirmDel !== m\.id\) \{\s*setConfirmDel\(m\.id\);[\s\S]{0,160}6000\);[\s\S]{0,80}return;/.test(page),
        '删课两段式确认（一次点击就带走整课媒体+字幕+译文太危险），并且 6 秒自己收回确认态');
      ok(/再点一次删除/.test(page), '确认态是界面文案（练习界面零提示口径：不弹 toast）');
      ok(/delete all\[id\];\s*persistJson\(PROGRESS_KEY, all\)/.test(page),
        '删课把这一课的进度记录一起清掉：否则重导入同一份字幕跳回老位置，看着像"没删干净"');
      ok(/\(showAllList \? list : list\.slice\(0, 12\)\)/.test(page) && /展开全部 \$\{list\.length\} 课/.test(page),
        '课表折叠必须配「展开全部 N 课」入口（>12 课以前点不到，属削弱用户入口）');
      ok(/onClick=\{replayCur\}/.test(page) && /const replayCur = useCallback\(\(\) => \{[\s\S]{0,320}if \(el\.paused\)[\s\S]{0,24}el\.play\(\)/.test(page),
        '「重播本句」在暂停态点了要真的播起来（只设 currentTime 就是"点了没反应"）');
      ok(/lookupRef\.current\?\.scrollIntoView\(\{ block: 'nearest' \}\)/.test(page),
        '点词后把释义卡带进视野（手机上播放器占大半屏，卡片落在视口外就等于"查词没反应"）');
      ok(/已听 \{Math\.min\(listened, sentences\.length\)\}\/\{sentences\.length\} 句/.test(page) && /这一课都听到了/.test(page),
        '给出"已听 x/y 句"与听完的反馈（只有计数时听到最后一句没有任何信号）');
      ok(/空格 播放\/暂停 · ↑ ↓ 上\/下一句/.test(page),
        '快捷键在界面上写一行（只放 title 等于手机上根本没有）');
      ok(/onDrop=|importFiles/.test(page) && /void onSubtitle\(f, media\)/.test(page),
        '选文件与拖拽汇到同一条导入路（两份分类实现必然漂移）');
      /* 时长口径：转录伴侣的 JSON 里 duration 记的是**整条原片**（素材包 01 那课是 6024 秒），
         课程时长必须取自字幕末秒，否则界面上"0:00 / 100:24"这种谎报就回来了 */
      ok(/duration: durationOf\(parsed\)/.test(page),
        '课程时长取自字幕末秒（durationOf(parsed)），不取 JSON/容器记的整片时长');
      ok(/lessonId\(media\?\.name \|\| file\.name, durationOf\(parsed\), media\?\.size \|\| 0\)/.test(page),
        '课程 id 用同一个 durationOf 口径：重导同一份字幕要命中同一课，否则进度与"删课清进度"都对不上');
      /* 单句循环 ↔ A-B 互斥：两个都开着时循环判定里 A-B 优先，界面却还亮着"单句" */
      ok(/const toggleLoop = useCallback\(\(\) => \{\s*if \(!loopOne\)\s*setAb\(null\);[\s\S]{0,80}setLoopOne\(\(v\) => !v\)/.test(page),
        '开「单句循环」要撤掉 A-B 区间（互斥只写一半，另一边状态照样骗人）');
      ok(/const toggleAb = useCallback[\s\S]{0,200}setLoopOne\(false\);\s*setAb\(\{ a: cur\.t0, b: cur\.t1 \}\)/.test(page),
        '开 A-B 复读要关掉单句循环（反向互斥）');
      /* 学习时长：按课分键去重 —— 按全局句序号去重的话，换一课的同序号句子永远不再计时长 */
      ok(/reachedRef\.current\.get\(lesson\.meta\.id\)[\s\S]{0,240}if \(!seen\.has\(i\)\) \{\s*seen\.add\(i\);\s*addStudyMinutes\(0\.2, ["']video["']\)/.test(page),
        '学习时长按「课」分键去重（换课同序号要能再计，重看同句不许刷时长）');
      /* 悬浮播放器（2026-10-19 用户要求"往下滑视频一直悬浮在上方，滑回顶部恢复"）。
         这一组只认"结构对不对"，几何由 probe-real-media 在真浏览器里量（sticky 会不会被祖先的
         overflow 静默吃掉，静态看根本看不出来 —— 外壳 SidebarInset 的 overflow-x-hidden 实测会
         把 overflow-y 算成 auto，文档才是真在滚的那层）。 */
      ok(/const paneRef = useRef\(null\)/.test(page)
        && /window\.innerHeight - top - pb/.test(page)
        && /style=\{paneH \? \{ height: paneH \} : undefined\}/.test(page),
        '这一课的面板高度是量出来的（窗口高 − 本层绝对 top − main 下边距），不是猜 calc —— 猜高了会把滚动框裁到屏外');
      ok(/className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain \[overflow-anchor:none\]"/.test(page),
        '这一课自带滚动框，且关掉自动滚动锚定（吸住那瞬视频缩档 → 浏览器改 scrollTop → 解除吸住 → 长回去，短课会来回抖）');
      ok(/const box = boxRef\.current;[\s\S]{0,320}new IntersectionObserver\([\s\S]{0,160}\{ root: box, threshold: 0 \}/.test(page),
        '吸住判定的 IntersectionObserver 根必须是这个滚动框（拿 main 当根判不到：外壳那两层自己从不滚，真正在滚的是文档）');
      ok(/lesson\.url && canPin && 'sticky top-0'/.test(page) && /const canPin = paneH >= 480/.test(page),
        '窗口矮到吸住后放不下字幕时不吸（canPin 门）；只在有媒体的课上 sticky —— 仅字幕课没有画面可悬浮');
      ok(/stuck \? 'mx-auto w-\[58%\] max-h-\[30vh\]' : 'w-full max-h-\[46vh\]'/.test(page),
        '吸住时画面收档（手机上视频是被宽度限住高度的，只改 max-h 等于不缩）');
      ok(/scrollPaddingTop: `\$\{cover\}px`/.test(page)
        && /el\.getBoundingClientRect\(\)\.bottom - box\.getBoundingClientRect\(\)\.top/.test(page)
        && !/calc\(30vh \+/.test(page),
        '吸住后给释义卡的避让值取自实测播放器高度（写死 calc 的猜法在矮窗口里 scrollIntoView 只能"尽力而为"，卡片仍旧压在播放器底下）');
    }

    let pass = 0, fail = 0, names = [];
    for (const r of results) { if (r.pass) pass++; else { fail++; names.push(r.name); } }
    console.log('');
    console.log(`断言 ${pass}/${pass + fail} 通过${fail ? '' : ' ✓'}`);
    names.forEach((n) => console.log('  ✗ ' + n));
    process.exit(fail ? 1 : 0);
  })();
}
