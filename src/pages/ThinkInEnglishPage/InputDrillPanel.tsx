import { useMemo, useState } from 'react';
import {
  THINK_INPUT_DRILLS,
  THINK_INPUT_KINDS,
  type ThinkInputKind,
} from '../../data/think-input-drills';
import { thinkTabTint, thinkTabTone } from './thinkTabTones';

/**
 * 读英文（输入向）练习面板。
 *
 * 和「模式训练」的分工：那一页练的是把中文改写成英文（输出端），
 * 这一页练的是读的时候别逐词翻成中文——切意群、找主干、认指代、别逐字翻。
 *
 * 四条设计上的取舍：
 * ① 纯选择题，不调 AI。判分确定，离线能做，错了立刻看解释——读的训练靠遍数，不靠判定。
 * ② 不进 SM-2。读的熟练度不是一个「到期日」能表示的，硬排期只会让人为了清空数字而刷。
 * ③ 一次一轮 6 题，做完给「对几题」而不是百分比：分母只有 6，百分比只会显得像考试成绩。
 * ④ 答错不重考同一题，但把这道题的 cue 留在反馈里——下一轮换题时那句话还在。
 */

const TONE = thinkTabTone('input');
const TINT = thinkTabTint('input', '0F');
const BORDER = thinkTabTint('input', '26');

const KIND_NAMES: Record<ThinkInputKind, string> = Object.fromEntries(
  THINK_INPUT_KINDS.map((kind) => [kind.id, kind.name]),
) as Record<ThinkInputKind, string>;

export function InputDrillPanel() {
  const [kind, setKind] = useState<ThinkInputKind>('chunk');
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  const drills = useMemo(
    () => THINK_INPUT_DRILLS.filter((drill) => drill.kind === kind),
    [kind],
  );
  const drill = drills[index];

  const resetRound = (nextKind: ThinkInputKind) => {
    setKind(nextKind);
    setRound((n) => n + 1);
    setIndex(0);
    setPicked(null);
    setCorrect(0);
    setFinished(false);
  };

  const handlePick = (choice: number) => {
    if (picked !== null) return;
    setPicked(choice);
    if (choice === drill.answer) setCorrect((n) => n + 1);
  };

  const handleNext = () => {
    if (index + 1 >= drills.length) {
      setFinished(true);
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
  };

  const isRight = picked !== null && picked === drill?.answer;

  return (
    <div className="space-y-5">
      {/* 四类练法：只换题，不换页 */}
      <div className="flex flex-wrap items-center gap-2">
        {THINK_INPUT_KINDS.map((item) => {
          const active = item.id === kind;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => resetRound(item.id)}
              className="rounded-full border px-3 py-1.5 text-xs font-bold transition-colors"
              style={{
                borderColor: active ? TONE : BORDER,
                backgroundColor: active ? TINT : 'transparent',
                color: active ? TONE : undefined,
              }}
            >
              {item.name}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
          {THINK_INPUT_KINDS.find((item) => item.id === kind)?.oneLiner}
        </span>
      </div>

      <div
        className="rounded-2xl border bg-card p-5 sm:p-6"
        style={{ borderColor: BORDER }}
      >
        {finished ? (
          <div className="space-y-4">
            <div className="text-[11px] font-bold tracking-widest" style={{ color: TONE }}>
              本轮结束
            </div>
            <div className="text-xl font-black text-foreground">
              {KIND_NAMES[kind]} · 6 题对 {correct} 题
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              读的训练不看分，看的是「读到句尾要不要回头」。
              再走一轮换一组句子，同一句话方法会一直在。
            </p>
            <button
              type="button"
              onClick={() => resetRound(kind)}
              className="rounded-xl px-4 py-2 text-sm font-bold text-white"
              style={{ backgroundColor: TONE }}
            >
              再来一轮
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
              <span>
                {KIND_NAMES[kind]} · 第 {index + 1} / {drills.length} 题
              </span>
              <span>对 {correct} 题</span>
            </div>

            <p
              className="whitespace-pre-wrap break-words rounded-xl px-4 py-3.5 text-[15px] leading-[1.9] font-medium text-foreground"
              style={{ backgroundColor: TINT }}
            >
              {drill.english}
            </p>

            <div className="text-sm font-bold text-foreground">{drill.question}</div>

            <div className="space-y-2">
              {drill.options.map((option, i) => {
                const answered = picked !== null;
                const chosen = picked === i;
                const right = drill.answer === i;
                const highlight = answered && (right || chosen);
                return (
                  <button
                    key={drill.id + i}
                    type="button"
                    onClick={() => handlePick(i)}
                    disabled={answered}
                    className="block w-full rounded-xl border px-4 py-3 text-left text-sm leading-relaxed transition-colors disabled:cursor-default"
                    style={{
                      borderColor: highlight ? TONE : BORDER,
                      backgroundColor:
                        answered && right ? TINT : answered && chosen ? 'transparent' : 'transparent',
                      color: 'inherit',
                      opacity: answered && !highlight ? 0.55 : 1,
                    }}
                  >
                    <span className="mr-2 text-[11px] font-bold text-muted-foreground">
                      {['一', '二', '三'][i]}
                    </span>
                    {option}
                    {answered && right && (
                      <span className="ml-2 text-[11px] font-bold" style={{ color: TONE }}>
                        正确
                      </span>
                    )}
                    {answered && chosen && !right && (
                      <span className="ml-2 text-[11px] font-bold text-muted-foreground">
                        你选的
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {picked !== null && (
              <div className="space-y-3 border-t border-border/70 pt-4">
                <div className="text-sm font-black" style={{ color: isRight ? TONE : undefined }}>
                  {isRight ? '对' : '这一题看反了'}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {drill.explanation}
                </p>
                <p className="text-sm font-semibold leading-relaxed text-foreground">
                  带走一句：{drill.cue}
                </p>
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                  style={{ backgroundColor: TONE }}
                >
                  {index + 1 >= drills.length ? '看这一轮的结果' : '下一题'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        这一页不排期、不计分。{round > 1 ? `已经走完 ${round - 1} 轮。` : ''}
        读得慢不要紧，要紧的是别在句尾回头。
      </p>
    </div>
  );
}
