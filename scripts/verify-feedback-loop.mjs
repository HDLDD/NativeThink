/**
 * verify-feedback-loop.mjs — 反馈链路（前端 → Cloudflare Function → 飞书/KV）的回归防线。
 *
 * 为什么要有这个脚本：反馈的前端弹窗和后端函数各自都写好了，却**没有任何页面挂载弹窗**，
 * 而且提交失败时 UI 一律显示"感谢你的反馈"—— 用户以为发出去了，实际服务端 503 直接丢弃。
 * 这类"两端都在、中间断线"的缺陷静态检查看不出来，所以把后端 handler 真的跑一遍：
 * KV / 飞书用**忠实替身**（形状对齐真实接口：KV.put(key, value)、飞书 200 + body.code）。
 *
 * 用法：node scripts/verify-feedback-loop.mjs
 * 覆盖范围还包括**全站提示出口**：`toast()` 被到处调用，但 `src/index.tsx` 若不挂载
 * `<Toaster />`，所有提示（含反馈的"暂未送出/已留档/已送达"）都是静默的 —— 2026-09-28 真机实测过这个坑。
 * 退出码：0 = 全绿；1 = 有失败
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(`${label}${detail ? ` — ${detail}` : ''}`); }
};

// ────────────────────────────────────────────────────────────────────────────
// ① 前端接线（静态断言）
// ────────────────────────────────────────────────────────────────────────────
{
  const header = read('src/components/Header.tsx');
  const layout = read('src/components/Layout.tsx');
  const dialog = read('src/components/FeedbackDialog.tsx');
  const lib = read('src/lib/use-feedback.ts');
  const appEnv = read('src/lib/app-env.ts');
  const vite = read('vite.config.ts');

  // 挂载点：必须 import 且真的渲染出组件（历史上就是"组件存在但无人渲染"）
  check(/import FeedbackDialog from '@\/components\/FeedbackDialog'/.test(header),
    'Header 导入 FeedbackDialog');
  check(/<FeedbackDialog\s*\/>/.test(header),
    'Header 渲染 <FeedbackDialog />（反馈入口对用户可达）');
  check(!/^\s*{\/\*.*\*\/}\s*<FeedbackDialog/m.test(header),
    '反馈入口没有被注释掉');
  // Header 只在非沉浸模式渲染 —— 沉浸模式（学习中）藏顶栏是设计，不能误报成入口缺失
  check(/!focused && <Header\s*\/>/.test(layout), 'Layout 在非沉浸模式下渲染 Header');

  // 三档状态必须在 UI 上有三种不同结局（旧代码失败也走 toast.success）
  check(/status === 'delivered'/.test(dialog) && /status === 'stored'/.test(dialog) && /status === 'failed'/.test(dialog),
    'FeedbackDialog 分别处理 delivered / stored / failed');
  check(/toast\.error\('反馈暂未送出'/.test(dialog), '未送达时给出 error 级提示（不再谎报成功）');
  check(!/sentToFeishu/.test(dialog), '清掉 boolean 时代的 sentToFeishu 判定');
  check(/markSynced\(item\.id, res\.status !== 'failed', res\.status === 'delivered'\)/.test(dialog),
    '提交结果回写 synced（失败保持 false 才能重试）+ pushed（有没有真的推进飞书）');
  /**
   * 历史列表的文案必须把 delivered 与 stored 分开。
   * 原先 `synced = res.status !== 'failed'` 把两档都写成 true，标签只有 `fb.synced === true → 已送达`，
   * 于是提交时 toast 老实说「即时通知通道暂未开通」，回头翻历史却显示「已送达」—— 自相矛盾。
   */
  check(/fb\.pushed === true \? '已送达'/.test(dialog) && /已留档/.test(dialog),
    '历史标签区分「已送达」与「已留档（未即时推送）」');
  check(!/fb\.synced === true[\s\S]{0,140}>已送达[\s\S]{0,40}<\/span>/.test(dialog),
    '正对照：不再是"synced 一律显示已送达"那种一刀切标签');
  check(/handleRetry/.test(dialog) && /submitFeedbackToServer\(fb\)/.test(dialog),
    '历史条目可重试（未送达不只能看不能救）');
  check(/fb\.synced === false/.test(dialog) && /fb\.synced === true/.test(dialog),
    '历史区分三态：undefined（旧数据）不显示标签，false/true 显示状态');

  // lib 契约
  check(/export type FeedbackSubmitResult/.test(lib), '导出 FeedbackSubmitResult 三档类型');
  check(/AbortSignal\.timeout\(15_000\)/.test(lib), '提交带超时（弱网/原生桥卡住不会永远转圈）');
  check(!/sendToFeishu|getBuildWebhookUrl|VITE_FEISHU_WEBHOOK_URL/.test(lib),
    '飞书 webhook 不进前端包（直连兜底函数已移除，避免密钥/通道外露）');
  check(/platform: platformTag\(\)/.test(lib) && /appVersion:/.test(lib),
    '上报带运行平台与版本（区分"只有手机上出问题"）');

  // 落盘纯度：storage 写入必须在 effect 里，不能在 setState updater 里（StrictMode 双调用）
  check(/useEffect\(\(\) => \{[\s\S]{0,200}safeStorage\.setItem\(FEEDBACK_KEY/.test(lib),
    '反馈历史落盘走 effect');
  check(!/setFeedbacks\(\(prev\) => \{[\s\S]{0,120}safeStorage/.test(lib),
    'setState updater 保持纯（不在里面写 storage）');
  check(/if \(!loaded\) return;/.test(lib),
    'loaded 之前不落盘（否则首帧空数组会抹掉历史反馈）');

  // 版本单一来源 + define 注入
  check(/__APP_VERSION__/.test(vite) && /version\.properties/.test(vite),
    'vite 注入 __APP_VERSION__（取自 android/version.properties）');
  check(/typeof __APP_VERSION__ !== 'undefined'/.test(appEnv),
    'app-env 先 typeof 再取值（未注入时不炸）');

  // dev 环境：/api/feedback 必须代理到线上，否则本地反馈全 404
  check(/'\/api\/feedback'/.test(vite), 'dev proxy 覆盖 /api/feedback');

  // 全站提示出口：toast() 到处调用，但没有 <Toaster /> 就全是静默的（2026-09-28 实测踩过）
  const root = read('src/index.tsx');
  check(/import \{ Toaster \} from ["']@\/components\/ui\/sonner["']/.test(root), '根节点导入 Toaster');
  check(/<Toaster[\s\S]{0,220}position="top-center"/.test(root), '根节点挂载 <Toaster />（反馈提示可见的前提）');
  check(/mobileOffset/.test(root), '手机版 toast 位置避让状态栏（edge-to-edge）');
}

// ────────────────────────────────────────────────────────────────────────────
// ② 后端 handler 真实执行（忠实替身：KV / 飞书 webhook）
// ────────────────────────────────────────────────────────────────────────────
const kvStore = new Map();
const fakeKV = {
  async put(key, value) {
    if (typeof key !== 'string' || typeof value !== 'string') throw new Error('KV.put 需要字符串键值');
    kvStore.set(key, value);
  },
  async get(key) { return kvStore.get(key) ?? null; },
  async list() { return { keys: [...kvStore.keys()].map((name) => ({ name })) }; },
};

let webhookCalls = [];
function stubFetch(impl) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = orig; };
}

const post = (body, headers = {}) =>
  new Request('https://nativethink.pages.dev/api/feedback/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

{
  const mod = await import(pathToFileURL(join(ROOT, 'functions/api/feedback/submit.js')).href);
  const kvLib = await import(pathToFileURL(join(ROOT, 'functions/_lib/kv.js')).href);

  let archivedOk = 0;   // 脚手架自检用：本轮"服务端确认留档"的次数
  const call = async (body, env) => {
    const resp = await mod.onRequest({ request: post(body), env });
    let json = null;
    try { json = await resp.clone().json(); } catch { /* 非 JSON 保留 null */ }
    if (json?.archived) archivedOk++;
    return { status: resp.status, json, headers: Object.fromEntries(resp.headers.entries()) };
  };

  // ── 正常路径：KV 有 + 飞书 200/code=0 → delivered ──
  const restore1 = stubFetch(async (url, init) => {
    webhookCalls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ code: 0, msg: 'success' }), { status: 200 });
  });
  {
    webhookCalls = [];
    const r = await call(
      { type: 'bug', title: '朗读会跳句', description: '长段落读到一半跳到下一句', rating: 2, platform: 'android', appVersion: '2.0.25' },
      { KV: fakeKV, FEISHU_WEBHOOK_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/test' },
    );
    check(r.status === 200 && r.json?.ok === true, '双通道可用时返回 200', `status=${r.status}`);
    check(r.json?.delivered === true && r.json?.archived === true, 'delivered + archived 都为真');
    check(webhookCalls.length === 1, '飞书被调用一次');
    const cardTitle = webhookCalls[0]?.body?.card?.header?.title?.content || '';
    check(/🐛 Bug 报告/.test(cardTitle), '卡片标题按类型加前缀', cardTitle);
    check(/2\.0\.25/.test(JSON.stringify(webhookCalls[0]?.body || {})) && /android/.test(JSON.stringify(webhookCalls[0]?.body || {})),
      '卡片带上来源（平台+版本），能区分手机/网页问题');
    const keys = [...kvStore.keys()];
    check(keys.length === 1 && keys[0].startsWith('feedback:'), 'KV 留档键前缀正确', keys[0]);
    check(/^feedback:\d{13}:fb_/.test(keys[0]), '键名 13 位定宽时间戳打头 → KV.list 字典序即时间序', keys[0]);
    const rec = JSON.parse(kvStore.get(keys[0]));
    check(rec.type === 'bug' && rec.rating === 2 && rec.platform === 'android', '留档记录字段完整');
  }

  // ── 飞书通道未配置：仍 200，但 delivered=false（前端据此说"已留档"而不是"已送达"）──
  {
    const r = await call({ type: 'general', description: '界面很好看' }, { KV: fakeKV });
    check(r.status === 200 && r.json?.delivered === false && r.json?.archived === true,
      '未配飞书时不再 503 丢反馈：落 KV + 如实报 delivered=false', JSON.stringify(r.json));
  }

  // ── 先落盘再推送（顺序断言：飞书抛错也不能让反馈消失）──
  {
    const restore = stubFetch(async () => { throw new Error('feishu timeout'); });
    const before = kvStore.size;
    const r = await call({ type: 'feature', description: '希望有学习提醒' }, { KV: fakeKV, FEISHU_WEBHOOK_URL: 'https://x/hook' });
    restore();
    check(r.status === 200 && r.json?.archived === true && r.json?.delivered === false,
      '飞书超时：反馈仍留档，delivered=false');
    check(kvStore.size === before + 1, '飞书失败不影响 KV 落库');
    check(typeof r.json?.detail === 'string' && /feishu_fetch/.test(r.json.detail),
      '失败原因回传（detail=feishu_fetch:*），前端/日志可定位');
  }

  // ── 飞书 200 但业务码非 0：不能算送达（机器人参数错也回 200）──
  {
    const restore = stubFetch(async () => new Response(JSON.stringify({ code: 190001, msg: 'invalid param' }), { status: 200 }));
    const r = await call({ type: 'general', description: '测试业务码' }, { KV: fakeKV, FEISHU_WEBHOOK_URL: 'https://x/hook' });
    restore();
    check(r.json?.delivered === false && r.json?.archived === true,
      '飞书 code!=0 判为未送达（不被 200 骗过去）');
    check(/feishu_code_190001/.test(String(r.json?.detail)), '业务码写进 detail');
  }

  // ── 两条通道都不通 → 503（前端据此提示"暂未送出"）──
  {
    const r = await call({ type: 'general', description: '没有任何存储可用' }, {});
    check(r.status === 503 && r.json?.error, '无 KV 且无 webhook 时返回 503（正对照：绿不是必然）');
  }

  // ── 输入收敛：超长截断、类型白名单、评分钳制、必填校验 ──
  {
    webhookCalls = [];
    const long = '啊'.repeat(1500);
    const r = await call(
      { type: 'sql-injection-ish', title: '标'.repeat(150), description: long, rating: 99 },
      { KV: fakeKV, FEISHU_WEBHOOK_URL: 'https://x/hook' },
    );
    check(r.status === 200, '超长输入不报错，走截断');
    const rec = JSON.parse(kvStore.get([...kvStore.keys()].pop()));
    check(rec.description.length === 1000, 'description 截到 1000', `len=${rec.description.length}`);
    check(rec.title.length === 100, 'title 截到 100', `len=${rec.title.length}`);
    check(rec.type === 'general', '未知 type 归一到 general', rec.type);
    check(rec.rating === 5, 'rating 钳到 0..5', String(rec.rating));

    const empty = await call({ type: 'bug', description: '   ' }, { KV: fakeKV });
    check(empty.status === 400, '空描述 400');
    const badJson = await mod.onRequest({ request: post('{"description"', ), env: { KV: fakeKV } });
    check(badJson.status === 400, '坏 JSON 400 而不是 500');
    const get = await mod.onRequest({ request: new Request('https://x/api/feedback/submit', { method: 'GET' }), env: { KV: fakeKV } });
    check(get.status === 405, '非 POST 405');
  }

  // ── 蜜罐：机器人填了 hp → 假装成功且不入库、不推送 ──
  {
    const before = kvStore.size;
    webhookCalls = [];
    const restore = stubFetch(async (url, init) => { webhookCalls.push(url); return new Response('{}', { status: 200 }); });
    const r = await call({ description: 'bot spam', hp: 'http://spam.example' }, { KV: fakeKV, FEISHU_WEBHOOK_URL: 'https://x/hook' });
    restore();
    check(r.status === 200 && r.json?.ok === true && r.json?.filtered === true, '蜜罐命中：静默丢弃 + 礼貌回执');
    check(kvStore.size === before && webhookCalls.length === 0, '蜜罐命中不写 KV 也不推飞书');
  }

  // ── HTML / 控制符清洗（避免把标签灌进飞书卡片）──
  {
    const r = await call({ description: '读<b onclick="x()">朗读</b>有\x00问题' }, { KV: fakeKV });
    const rec = JSON.parse(kvStore.get([...kvStore.keys()].pop()));
    check(!/<|<\/|\x00/.test(rec.description), '描述里的 HTML 标签与控制符被清掉', rec.description);
    check(/朗读/.test(rec.description) && /问题/.test(rec.description), '清洗不误伤正文');
  }

  // ── CORS：APK 内源是 https://localhost，缺头就整条链路失败 ──
  {
    const r = await call({ description: '手机上的跨域' }, { KV: fakeKV });
    check(r.headers['access-control-allow-origin'] === '*', '响应带 ACAO（APK 跨域必需）');
    const pre = await mod.onRequest({ request: new Request('https://x/api/feedback/submit', { method: 'OPTIONS' }), env: {} });
    check(pre.status === 204 && pre.headers.get('access-control-allow-methods'), 'OPTIONS 预检 204 + 允许方法');
  }

  // ── KV 键工具：与用户数据命名空间隔离（不能被 data/sync 的前缀扫描捞走）──
  {
    const k = kvLib.feedbackKey('fb_1', 123);
    check(k === 'feedback:0000000000123:fb_1', 'feedbackKey 定宽补零', k);
    check(!kvLib.userDataKey('u1', '').startsWith('feedback:'), 'feedback 前缀与用户数据键空间互不重叠');
  }

  // ── 脚手架自检：替身 KV 的落库条数必须与"服务端确认留档"的次数严格相等 ──
  //    （防止替身静默 no-op、或 handler 一次请求写两遍 —— 那样上面全绿也没意义）
  const listed = await fakeKV.list();
  check(listed.keys.length === archivedOk && kvStore.size === archivedOk,
    `留档条数自洽：KV 实际 ${kvStore.size} 条 / 服务端确认 ${archivedOk} 次`);
  check(listed.keys.every((k) => /^feedback:\d{13}:fb_/.test(k.name)),
    '所有留档键名格式一致（可被按时间序列出）');
}

// ── 汇总 ──
console.log('');
if (failures.length) {
  for (const f of failures) console.log('FAIL  ' + f);
  console.log('');
}
console.log(`断言 ${pass}/${pass + fail} 通过 ${fail === 0 ? '✓' : '✗'}`);
process.exit(fail === 0 ? 0 : 1);
