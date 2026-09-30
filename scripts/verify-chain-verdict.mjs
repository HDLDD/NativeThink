/**
 * verify-chain-verdict.mjs — 语块接龙判定的契约（2026-09-30 从"非 FAIL 即通过"改出来的）。
 *
 * 旧写法 `const passed = verdict !== 'FAIL'` 让三种情况都算答对并 +10：
 * 模型没守首行格式、模型返回空串、AI 服务挂了（catch 分支也 +10）。
 * 结果"接龙分数"实际在数"提交次数"。改成三档：**未判定 ≠ 通过**，也不判成错误。
 *
 * 这里真跑 `parseChainVerdict` / `chainScoreFor`（含"不许把正文里的 PASS 当判定"这类边界），
 * 再断言页面接线：分数只能来自 `chainScoreFor`、未判定不前进、catch 不再送分、
 * 并留一条正对照 —— 旧的 `!== 'FAIL'` 写法一回来就红。
 *
 * 用法：node scripts/verify-chain-verdict.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
const check = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ` — ${detail}` : '')); }
};

// 真跑：转译 chain-verdict.ts（它没有外部依赖）
{
  const src = readFileSync(join(ROOT, 'src/lib/chain-verdict.ts'), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export (?=(const|function|let|class|type))/gm, '');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'nt-chain-')), 'chain-verdict.mjs');
  writeFileSync(file, out + '\nexport { parseChainVerdict, chainScoreFor };', 'utf8');
  const { parseChainVerdict, chainScoreFor } = await import(pathToFileURL(file).href);

  // ── 三档判定 ──
  check(parseChainVerdict('PASS\nGood use of the chunk.').verdict === 'pass', '① 首行 PASS → pass');
  check(parseChainVerdict('FAIL\n这里用得不对').verdict === 'fail', '① 首行 FAIL → fail');
  check(parseChainVerdict('✅ PASS — 很地道\n细节').verdict === 'pass', '① 允许符号/破折号前缀（模型常见写法）');
  check(parseChainVerdict('  pass\n小写也认').verdict === 'pass', '① 大小写不敏感');
  check(parseChainVerdict('## 评价\n这个句子其实 PASS 得很好').verdict === 'unknown',
    '① **正文里出现 PASS 不算判定** —— 只认首行（这是旧启发式误判的来源）');
  check(parseChainVerdict('我不确定这个句子对不对').verdict === 'unknown', '① 首行没有结论 → 未判定');
  check(parseChainVerdict('').verdict === 'unknown', '① 空回复 → 未判定（旧写法在这里会判成"通过"）');
  check(parseChainVerdict('   \n  ').verdict === 'unknown', '① 只有空白 → 未判定');
  check(parseChainVerdict('PASSED\n很地道').verdict === 'pass', '① PASS 后紧跟词尾也算（\b 边界，不苛求模型）');
  check(parseChainVerdict('PASTA\n意大利面').verdict === 'unknown',
    '① 正对照：PASTA 不该被读成 PASS（按整词 + 有限后缀，不是前缀包含）');
  check(parseChainVerdict('PASSAGE OF TIME\nx').verdict === 'unknown',
    '① 正对照：PASSAGE 也不算 PASS（前缀宽松匹配就是这么错的，守卫自己也得被这条钉住）');
  check(parseChainVerdict('FAILSAFE mode\nx').verdict === 'unknown',
    '① 正对照：FAILSAFE 不算 FAIL');
  check(parseChainVerdict('FAILING THIS\nx').verdict === 'fail', '① FAIL 带后缀仍按 FAIL（不误判成未判定）');

  // detail：pass/fail 去掉首行；unknown 保留原话给用户看
  const p = parseChainVerdict('PASS\n第一段\n第二段');
  check(p.detail === '第一段\n第二段', '① pass 的 detail 去掉判定行', JSON.stringify(p.detail));
  const u = parseChainVerdict('让我看看这句话');
  check(u.detail === '让我看看这句话', '① 未判定时把模型原话留着（用户能看到为什么）');
  const e = parseChainVerdict('');
  check(e.detail === '', '① 空回复的 detail 是空串（不是 undefined）');

  // ── 分数只有 pass 档有 ──
  check(chainScoreFor('pass') === 10, '① pass +10');
  check(chainScoreFor('fail') === 0, '① fail 不得分');
  check(chainScoreFor('unknown') === 0, '① **未判定不得分**（这次修的核心）');
}

// ── ② 页面接线 ──
{
  const page = readFileSync(join(ROOT, 'src/pages/ChunkTrainingPage/ChunkTrainingPage.tsx'), 'utf8');
  const iFn = page.indexOf('const handleChainSubmit = async');
  const iEnd = page.indexOf('\n  };\n', iFn);
  const body = iFn >= 0 && iEnd > iFn ? page.slice(iFn, iEnd) : '';
  // 注释里会**引用**旧写法（"旧写法是 verdict !== 'FAIL'"），文本扫描必须先把注释剥掉 ——
  // 否则"不许回来"的断言会被我们自己写的解释性注释判红（verify-ai-parse 早就踩过这条）。
  const pageCode = page.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const bodyCode = body.replace(/^[ \t]*\/\/[^\n]*/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(body.length > 0, '② handleChainSubmit 函数体可定位（正对照的前提）');
  check(/from '@\/lib\/chain-verdict'/.test(page), '② 判定解析走共享模块（不在页面里手写）');
  check(/const parsed = parseChainVerdict\(feedback\);/.test(bodyCode), '② 用 parseChainVerdict 解析 AI 回复');
  check(/const gained = chainScoreFor\(parsed\.verdict\);\s*\n\s*if \(gained\) setChainScore/.test(bodyCode),
    '② 分数只能来自 chainScoreFor，且为 0 时不调 setChainScore');
  check(!/verdict !== 'FAIL'/.test(pageCode),
    '② 正对照：旧的"非 FAIL 即通过"写法不许回来（剥掉注释后扫全文）');
  check(!/setChainScore\(\(prev\) => prev \+ 10\)/.test(bodyCode),
    '② 页面里不许再出现硬编码 +10（计分单点在 chainScoreFor）');

  // 未判定与失败都不前进、不清空输入
  // 未判定分支：不前进、不清空输入（可以原句重来）—— 按代码位置精确切出这一段
  const iFailBranch = bodyCode.indexOf("parsed.verdict === 'fail'");
  const iUnknownBranch = iFailBranch > 0 ? bodyCode.indexOf('} else {', iFailBranch) : -1;
  const iCatch = bodyCode.indexOf('} catch (err) {');
  check(iUnknownBranch > 0 && iCatch > iUnknownBranch, '② 未判定分支可定位（正对照的前提）');
  const unknownBlock = iUnknownBranch > 0 && iCatch > iUnknownBranch ? bodyCode.slice(iUnknownBranch, iCatch) : '';
  check(unknownBlock.length > 0, '② 未判定分支非空');
  check(!/setCurrentChainIdx/.test(unknownBlock), '② 未判定不切下一题');
  check(!/setChainInput\(''\)/.test(unknownBlock), '② 未判定不清空用户输入（可以原句重来）');
  check(!/setChainScore/.test(unknownBlock), '② 未判定不动分数');
  check(/这次不计分/.test(unknownBlock), '② 未判定的提示直说不计分');

  // catch 不再送分（用同一份剥了注释的 bodyCode 与上面算好的下标）
  const catchBlock = iCatch > 0 ? bodyCode.slice(iCatch, bodyCode.indexOf('} finally {', iCatch)) : '';
  check(catchBlock.length > 0, '② catch 分支可定位');
  check(!/setChainScore/.test(catchBlock), '② AI 服务不可用时不再白送 10 分');
  check(!/setCurrentChainIdx/.test(catchBlock), '② AI 不可用时不自动前进（保留重试机会）');
  check(/不计分/.test(catchBlock) && /暂不可用/.test(catchBlock),
    '② 降级提示把"包含校验只证明用了这个词、证明不了用得对"说清楚');

  // fail 分支仍在（没被顺手改成"未判定兜底"）
  const iFail = body.indexOf("parsed.verdict === 'fail'");
  check(iFail > 0 && /句子还有可以改进的地方/.test(body.slice(iFail, iFail + 300)),
    '③ 正对照配对：真 FAIL 仍然按"待改进"处理并展示建议');
}

console.log('');
console.log(`verify-chain-verdict: ${pass} 通过, ${fail} 失败`);
if (fail) {
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
