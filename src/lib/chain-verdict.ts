/**
 * chain-verdict — 语块接龙"AI 判定"的唯一解析点。
 *
 * 旧实现（2026-09-30 之前）：`const passed = verdict !== 'FAIL'` —— **非 FAIL 即通过**。
 * 于是模型没守格式（首行是说明文字、markdown 符号、甚至空回复）时照样 +10，
 * AI 服务挂了的 catch 分支也 +10。接龙分数本来是该反映"用对了几次语块"的，
 * 结果变成"点了多少次提交"。
 *
 * 现在分三档，关键是**未判定不等于通过**：
 *   - `pass` 首行给出 PASS（允许 ✅/星号等前缀符号）→ 计分并前进；
 *   - `fail` 首行给出 FAIL → 不计分，显示改进建议；
 *   - `unknown` 首行没有这两个词之一 → **不计分、不前进**，把模型原话摊开让用户重试。
 *
 * 为什么不改成"必须是 PASS 才算过，否则算错"：模块文档里那条顾虑是对的 ——
 * 模型经常不守首行格式，把格式问题判成"造句错了"会误伤真实学习成果。
 * 三档里的 `unknown` 既不给假分，也不给假错。
 */

export type ChainVerdict = 'pass' | 'fail' | 'unknown';

export interface IChainVerdict {
  verdict: ChainVerdict;
  /** 去掉首行判定后的正文（模型原话，用于展示） */
  detail: string;
}

/**
 * 只认**首行第一个字母串**是不是 PASS / FAIL 及其常见变形（PASSED / FAILING / ✅ PASS）。
 * 为什么不用 `\b`：`PASSED`、`FAILING` 也是模型给结论的正常写法，`\b` 会把它们判成"没给结论"；
 * 而按"前缀包含"匹配又会把 `PASTA`、`PASSENGER` 误读成判定 —— 所以走"整词 + 有限后缀"这条路。
 */
const VERDICT_WORD = /^(pass|fail)(ed|es|ing|s|d|ure)?$/i;

export function parseChainVerdict(feedback: string): IChainVerdict {
  const trimmed = (feedback || '').trim();
  if (!trimmed) return { verdict: 'unknown', detail: '' };
  const firstLine = trimmed.split('\n')[0].trim();
  const m = /^[^\w]*([A-Za-z]+)/.exec(firstLine);
  const word = m ? m[1] : '';
  const detail = trimmed.split('\n').slice(1).join('\n').trim();
  if (!VERDICT_WORD.test(word)) return { verdict: 'unknown', detail: trimmed };
  return { verdict: /^pass/i.test(word) ? 'pass' : 'fail', detail };
}

/** 三档各自的分数（接龙一次答对的净得分）—— 未知与失败都不得分 */
export function chainScoreFor(verdict: ChainVerdict): number {
  return verdict === 'pass' ? 10 : 0;
}
