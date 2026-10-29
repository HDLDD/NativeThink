/**
 * 跨模块证据 → 模式候选（纯函数）。
 *
 * 写作/对话/检测三处的 AI 反馈会以「原句 → 地道说法 + 原因」进纠偏本；
 * 这里按原因里的线索词把条目归到最可能的思维模式，作为「待诊断」候选。
 * 只是**候选**：不写 SM-2、不改纠偏本，用户仍需点进详情自己判断。
 */
import type { ICorrectionNote } from './correction-notes';

export interface ThinkEvidenceSuggestion {
  patternId: string;
  /** 命中的纠偏条目数（不是关键词次数） */
  hits: number;
  examples: string[];
}

const RULES: Array<{ patternId: string; terms: string[] }> = [
  { patternId: 'subject-first', terms: ['主语', '话题', '句首', '主谓', 'topic', 'subject'] },
  { patternId: 'verb-driven', terms: ['动词', '名词化', '动作', 'nominaliz', 'verb'] },
  { patternId: 'end-focus', terms: ['句尾', '结尾', '焦点', '重点', 'end focus', 'focus'] },
  { patternId: 'be-concrete', terms: ['具体', '大词', '空泛', '含糊', 'vague', 'concrete'] },
  { patternId: 'make-logic-explicit', terms: ['逻辑', '因果', '连接词', 'because', 'however', 'logic'] },
  { patternId: 'polite-request', terms: ['请求', '礼貌', '台阶', 'please', 'request'] },
  { patternId: 'fill-references', terms: ['指代', '代词', 'reference', '指得'] },
  { patternId: 'hedge-stance', terms: ['断言', '语气太满', '绝对', 'hedge', 'probably'] },
  { patternId: 'register-shift', terms: ['语域', '正式', '口语', '商务', 'formal', 'informal'] },
  { patternId: 'soften-disagreement', terms: ['不同意', '反驳', '冲突', 'disagree'] },
  { patternId: 'compliment-response', terms: ['夸奖', '赞美', 'compliment', 'praise'] },
  { patternId: 'result-state', terms: ['结果', '状态', '被动', 'result', 'state', 'passive'] },
];

export function suggestPatternsFromEvidence(
  notes: Array<Pick<ICorrectionNote, 'wrong' | 'right' | 'note' | 'chineseHint'>>,
  limit = 3,
): ThinkEvidenceSuggestion[] {
  const rows = new Map<string, { hits: number; examples: string[] }>();
  for (const note of notes) {
    const haystack = `${note.wrong} ${note.right} ${note.note} ${note.chineseHint}`.toLowerCase();
    for (const rule of RULES) {
      if (!rule.terms.some((term) => haystack.includes(term.toLowerCase()))) continue;
      const row = rows.get(rule.patternId) ?? { hits: 0, examples: [] };
      row.hits += 1;
      if (row.examples.length < 2) row.examples.push(`${note.wrong} → ${note.right}`);
      rows.set(rule.patternId, row);
    }
  }
  return [...rows.entries()]
    .map(([patternId, row]) => ({ patternId, ...row }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);
}

export function summarizeEvidenceSources(
  notes: Array<Pick<ICorrectionNote, 'source'>>,
): { total: number; think: number; writing: number; conversation: number } {
  const out = { total: notes.length, think: 0, writing: 0, conversation: 0 };
  for (const note of notes) out[note.source] += 1;
  return out;
}
