# 反馈链路

> 三个文件构成一条闭环：`src/components/FeedbackDialog.tsx`（入口）→ `src/lib/use-feedback.ts`（本机存储 + 提交）→ `functions/api/feedback/submit.js`（服务端）。
> 这条链以前**两端都写了却点不到**（组件和云函数都存在，没有任何页面挂载组件），所以它的回归脚本专门断言挂载点。

## 1. 功能

用户从 Header 提交 Bug / 功能建议 / 一般反馈 + 星级，内容**先落本机**再尽力送服务端；服务端双出路：Cloudflare KV 留档 + 飞书群机器人即时推送。历史列表能看到每条是否送出，未送达的能重试。

## 2. 实现方法

### 2.1 本机侧

| key | 内容 |
|-----|------|
| `__nativethink_feedback_list` | `IFeedbackItem[]`，新的在前 |
| `__nativethink_feedback_ratelimit` | `{entries:[{timestamp}]}`，只保留最近 1 小时 |

- 限流：`MAX_SUBMISSIONS_PER_HOUR = 3`、`MIN_INTERVAL_MS = 60_000`（`use-feedback.ts:11-12`），`checkRateLimit()` 返回 `null` 或中文提示串（`:31-57`）。
- 落盘走 **effect 而不是 updater**（`:118-128`）：StrictMode 会双调用 updater，在里面写 storage 等于写两遍；`loaded` 之前不写 —— 否则首帧空数组会把磁盘上的历史抹掉。
- 合并用函数式 `setFeedbacks((prev) => [newItem, ...prev])`（`:150`）：提交是异步的，用点击时的旧数组回写会盖掉期间新增的反馈。
- 版本由 hook 统一盖章 `appVersion: APP_VERSION`（`:146`，来源 `src/lib/app-env.ts`，取自 `android/version.properties`）。
- 输入清洗 `sanitizeInput`：剥 HTML 标签 + 控制符，`title` 截 100、`description` 截 1000、rating 夹到 0–5（`:70-82,131-136`）。

### 2.2 服务端侧

`functions/api/feedback/submit.js`：

1. **蜜罐** `hp` 字段：真人看不见，机器人会填；填了就返回 `{ok:true, delivered:false, archived:false, filtered:true}` 假装成功丢弃（`:47-50`）—— 不给爬虫可辨识的信号。
2. 先写 KV `feedback:<毫秒时间戳>:<id>`（`feedbackKey` 来自 `functions/_lib/kv.js`）；
3. 再尝试推飞书（`FEISHU_WEBHOOK_URL`），没配就跳过、不算失败；
4. **只有两条出路都没走通才 503**（`:146-149`）；
5. 返回体是诚实的：`delivered` = 有没有真的推进飞书，`archived` = 有没有落 KV。
6. 飞书即使参数不对也常回 200，所以要看 body 里的 `code`（`:128-133`：`delivered = j.code === undefined || j.code === 0`）；200 但不是 JSON 时按送达处理，避免误报失败。
7. 服务端二次清洗 `clean(s, max)`，附带字段也有上限（`MAX_TEXT = 2000`、`MAX_UA = 200`）防灌包。
8. CORS 由 `withCors` + `isPreflight/preflight` 统一挂（`:153-156`），因为 APK 内源是 `https://localhost`。

### 2.3 前端按三档如实提示

`FeedbackSubmitResult = {delivered} | {stored} | {failed; reason}`（`use-feedback.ts:186-188`），`submitFeedbackToServer` 用 `AbortSignal.timeout(15_000)`（`:207`）：

| 情况 | 结果 | 提示 |
|------|------|------|
| `data.delivered` | delivered | 「已送达开发者」 |
| `data.archived` | stored | 「已存到服务端留档（即时通知通道暂未开通），我们仍会看到它」 |
| 2xx 但响应不是 JSON | stored | 同上 —— 请求确实被接住了，不谎报也不吓唬用户重试（`:211-213`） |
| 非 2xx / 网络失败 / `server_rejected` | failed | 「反馈暂未送出，已保存在本机历史反馈，可点重试」 |

`IFeedbackItem.synced` 是**三态**：`undefined` = 旧数据（不显示标签，避免误标成未送达）、`false` = 已存本机但服务端没收到（给重试入口）、`true` = 服务端已接住（`:93-99`）。

## 3. 注意事项

1. ~~历史列表把 `stored` 也显示成「已送达」~~（**已修 2026-09-30**）：`IFeedbackItem` 新增 `pushed?: boolean`（有没有真的推进飞书），`markSynced(id, synced, pushed)` 三参数回写；历史标签按 `pushed` 分「已送达 / 已留档（未即时推送）/ 服务端已收到」三档，`undefined` 留给改造前的老数据、不硬猜。守卫 `verify:feedback-loop` 把原先那条 `markSynced(item.id, res.status !== 'failed')` 断言**重新推导**成三参数版本（不是放宽它），并新增「不再一刀切显示已送达」的正对照；变异实测：把标签改回 `synced → 已送达` 会红。
2. **限流在提交前就记账**：`recordSubmission()` 在 `addFeedback` 里同步调用（`use-feedback.ts:151`），**不管后面服务端成功还是失败**。离线时连点三次就把这一小时的额度用光了，而三条其实都没出去。
3. **`_lib/kv.js` 的 binding 没配时 `archived` 为 false**，此时只剩飞书一条路；两条都没配 → 503 → 前端 `failed`。这是"通道未配"这一档的来源，以前被误报成成功。
4. **入口可达性必须断言**：`scripts/verify-feedback-loop.mjs:41-44` 检查 `Header.tsx` 里既有 `import FeedbackDialog` 又有 `<FeedbackDialog />`。静态检查看不出"组件写了但没人挂载"，这条断言是唯一防线 —— 别把它删了或者改成宽松版。
5. **反馈链路有真实执行的正对照**：`npm run verify:feedback-loop` 用忠实 KV + webhook 替身**真实执行**后端 handler，而不是只 grep 源码。改后端 handler 时若把替身改得比真实行为更宽松，守卫就会变成假绿。
6. **旧数据没有 `synced` 字段**，任何新增状态展示都要显式区分 `undefined` 与 `false`（现有代码用 `fb.synced === true` / `=== false` 严格比较，`=== undefined` 不显示标签）—— 用真值判断会把老数据全标成「未送达」。
7. **KV 里的反馈只能自己去控制台看**（本项目不挂任何要绑卡的存储服务，R2 已因此否决）。没有面向用户的反馈列表页，别在文档里承诺"用户能查看回复"。
