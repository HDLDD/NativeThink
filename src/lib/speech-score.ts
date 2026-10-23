/**
 * 跟读词级评分（LCS）—— 视频精听与影子跟读共用。
 *
 * 独立成模块的原因：视频精听数据层（video-lab.ts）顶层依赖 IndexedDB；
 * 影子跟读只需要这一个纯函数，不应该为了它把整个媒体存储层拖进页面 chunk。
 */

/** 归一分词：小写、剥标点（撇号也剥，识别引擎加不加缩写字母各家不一样），空 token 丢掉 */
export function tokenizeSpeech(s: string): string[] {
  return String(s ?? '').toLowerCase().split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
}

export interface ISpeechScore {
  /** 0–1：按目标句的词序命中比例（最长公共子序列 / 目标词数） */
  accuracy: number;
  targetWords: string[];
  /** 目标句里没被认出来的词（去重、保序） */
  missed: string[];
  spokenWords: string[];
}

/**
 * 跟读评分：把识别到的串和目标句按词序对齐。
 * 用 LCS 而不是集合交集 —— "the book is on the table" 里 the 出现两次，
 * 只答对一次不该算两次；也不用编辑距离，多说的插入词不该压低命中数。
 */
export function scoreSpeech(target: string, spoken: string): ISpeechScore {
  const a = tokenizeSpeech(target);
  const b = tokenizeSpeech(spoken);
  if (a.length === 0) return { accuracy: 0, targetWords: [], missed: [], spokenWords: b };
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 沿 DP 表走一遍，标出被认出的目标词；没标上的就是漏读/读错的
  const matched = new Array(a.length).fill(false);
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { matched[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const seen = new Set<string>();
  const missed: string[] = [];
  a.forEach((w, k) => { if (!matched[k] && !seen.has(w)) { seen.add(w); missed.push(w); } });
  return { accuracy: (dp[0][0] || 0) / a.length, targetWords: a, missed, spokenWords: b };
}
