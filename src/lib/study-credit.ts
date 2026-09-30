/**
 * 学习时长记账的去重闸门。
 *
 * 为什么需要它：`addStudyMinutes` 一次改三处（今日分钟数、模块进度环、日历/连胜，
 * 见 `use-learning-stats.ts:241-296`），而思维训练 / 对话 / 语块接龙的计时口径是
 * **「按提交动作计」**（AI 只负责给反馈，反馈失败不撤销这次真实作答 —— 口径与理由见
 * `docs/modules/think-in-english.md` §3.1 与 `docs/modules/conversation.md` §3）。
 * 那个口径唯一的破口是**重复刷**：服务挂了就着同一句话连点五次提交，进度环涨五格。
 *
 * 所以这里不判"AI 有没有回"，只判"这是不是同一次作答"：
 * 键由（动作类型, 题目身份, 用户原文）拼成，同一键只放行一次。
 *
 * 闸门按挂载建（`useStudyCredit` 内 `useRef`）：离开页面再回来算新的一段学习，
 * 页面内连点不算。上限 `CREDIT_SEEN_LIMIT` 条，按 FIFO 淘汰 —— 一小时内提交过几百次
 * 的人不该被更早的记录锁住。
 */

import { useCallback, useRef } from 'react';
import { useLearningStats } from './use-learning-stats';

export const CREDIT_SEEN_LIMIT = 400;

/** 键里保留的原文长度上限：整段作文不该把键撑爆 */
const KEY_TEXT_LIMIT = 200;

/**
 * 把作答身份压成一个稳定的键。
 * **逐段 trim + 空白归一**，保证"同一句话多打一个空格"仍然算同一次作答
 * （只在末尾 trim 不够：'|' 紧跟原文时，原文自带的前导空格会让键与无空格版本不等）。
 */
export function creditKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => (p == null ? '' : String(p).replace(/\s+/g, ' ').trim()))
    .join('|')
    .slice(0, 8 + parts.length + KEY_TEXT_LIMIT);
}

export interface ICreditGate {
  /** 首次见到该键返回 true 并记账；重复返回 false */
  credit(key: string): boolean;
  /** 当前留存的键数量 */
  size(): number;
}

/** 纯闸门：真跑测试对着它，不依赖 React。 */
export function makeCreditGate(limit: number = CREDIT_SEEN_LIMIT): ICreditGate {
  const order: string[] = [];
  const seen = new Set<string>();
  return {
    credit(key: string) {
      if (seen.has(key)) return false;
      seen.add(key);
      order.push(key);
      while (order.length > limit) seen.delete(order.shift() as string);
      return true;
    },
    size() {
      return seen.size;
    },
  };
}

/**
 * 页面侧接线：`const { creditOnce } = useStudyCredit();`
 * 然后在提交动作里 `creditOnce('think', creditKey('detector', input))`。
 */
export function useStudyCredit() {
  const { addStudyMinutes } = useLearningStats();
  const gateRef = useRef<ICreditGate | null>(null);
  if (!gateRef.current) gateRef.current = makeCreditGate();
  const creditOnce = useCallback(
    (moduleKey: string, actionKey: string, minutes: number = 1) => {
      if (!gateRef.current!.credit(`${moduleKey}|${actionKey}`)) return false;
      addStudyMinutes(minutes, moduleKey);
      return true;
    },
    [addStudyMinutes],
  );
  return { creditOnce };
}
