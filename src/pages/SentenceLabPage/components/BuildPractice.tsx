import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, RefreshCw, Send, Sparkles, Volume2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { useLearningStats } from '@/lib/use-learning-stats';
import { cn } from '@/lib/utils';
import { MOCK_BACK_TRANSLATIONS } from '@/data/backtranslation';

const SYSTEM = `你是一位英语写作教练，帮助中文母语者学会"用母语者的结构造句"。

用户会拿到一个英语关键词/短语、它的中文含义和场景，然后用它写一个英文句子。
请用中文给出**结构化、可操作**的反馈，严格按以下四段输出（每段标题加粗，不要客套话）：

**① 骨架体检**：先写出用户句子的主干（谁+做了什么），再指出结构问题（缺主语/时态/搭配/从句误用等）。没问题就一句话说明主干清晰。

**② 地道度**：给 1-5 分并说明扣分点。重点看：是否中式直译、搭配是否自然、语域是否合适。

**③ 更地道的说法**：给出 1-2 个改写版本，说明改了什么、为什么更自然。

**④ 与参考句的差异**：如果参考句与用户的表达差异明显，点出思维差异（中文习惯怎么说 vs 母语者怎么说）；差异不大就说明一致之处。

规则：只针对用法与结构，不要编造语法规则；用户句子若正确，明确肯定，不要为改而改。`;

/**
 * 造句练习 —— 产出能力训练。
 * 给关键词 + 场景 → 用户造句 → AI 按「骨架 / 地道度 / 改写 / 思维差异」四段反馈。
 * 与「句型库」互补：句型库给骨架，这里检验能否独立产出。
 */
export function BuildPractice() {
  const { isConfigured, chat } = useAI();
  const { speak } = useTTS();
  const { addFavorite } = useFavorites();
  const { addStudyMinutes } = useLearningStats();

  const pool = useMemo(
    () => MOCK_BACK_TRANSLATIONS.filter((b) => b.referenceSentence && b.keyword).slice(0, 400),
    [],
  );
  const [order, setOrder] = useState(() => shuffled(pool.length));
  const [pos, setPos] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const item = pool[order[pos] % pool.length];

  const next = () => {
    abortRef.current?.abort();
    // 不要在 setState 的更新函数里再调 setState（渲染期副作用）
    if (pos + 1 >= order.length) {
      setOrder(shuffled(pool.length));
      setPos(0);
    } else {
      setPos(pos + 1);
    }
    setInput('');
    setFeedback('');
    setShowRef(false);
  };

  const submit = async () => {
    const text = input.trim();
    if (!text) { toast.info('先用这个短语写一个英文句子'); return; }
    if (!isConfigured) { toast.error('请先在 AI 设置里配置一个免费模型的 Key'); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setFeedback('');
    try {
      const prompt = [
        `关键词/短语：${item.keyword}`,
        `中文含义：${item.meaning}`,
        `使用场景：${item.scenarioHint}`,
        `参考句（不要直接给用户看，用于第 ④ 段对照）：${item.referenceSentence}`,
        '',
        `用户写的句子：${text}`,
      ].join('\n');
      const out = await chat(
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, maxTokens: 1200, signal: ctrl.signal, task: 'chat' },
      );
      setFeedback(out || '（没有返回内容，请重试）');
      addStudyMinutes(0.5, 'sentences');
    } catch (e) {
      if (!ctrl.signal.aborted) toast.error('反馈生成失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge className="rounded-full text-[10px] font-black" variant="secondary">
              {item.difficulty === 'beginner' ? '入门' : item.difficulty === 'intermediate' ? '进阶' : '高阶'}
            </Badge>
            <span className="text-[10px] font-bold text-muted-foreground">
              用关键词独立造句 · {pos + 1}/{pool.length}
            </span>
          </div>
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2 text-[10px] font-black" onClick={next}>
            <RefreshCw className="size-3.5" /> 换一题
          </Button>
        </div>

        {/* 题面 */}
        <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-black text-ink-teal">{item.keyword}</span>
            <Button size="sm" variant="ghost" className="rounded-xl h-7 px-1.5" onClick={() => speak(item.keyword)} aria-label="朗读关键词">
              <Volume2 className="size-3.5" />
            </Button>
          </div>
          <p className="text-xs font-bold text-foreground/80">{item.meaning}</p>
          <p className="text-[11px] font-bold text-muted-foreground">场景：{item.scenarioHint}</p>
        </div>

        {/* 作答 */}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="用这个短语写一个完整的英文句子…"
          className="rounded-2xl min-h-[88px] text-sm font-medium"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button
            size="sm" variant="ghost" className="rounded-xl text-[10px] font-black"
            onClick={() => setShowRef((v) => !v)}
          >
            {showRef ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showRef ? '收起参考句' : '直接看参考句'}
          </Button>
          <Button size="sm" className="rounded-xl text-[10px] font-black bg-[#00B894] hover:bg-[#00A383]"
            disabled={loading} onClick={submit}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {loading ? 'AI 正在批改…' : '提交，让 AI 批改'}
          </Button>
        </div>

        {showRef && (
          <div className="rounded-2xl border border-border/60 p-3 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">参考句</p>
            <div className="flex items-start gap-2">
              <Button size="sm" variant="ghost" className="rounded-xl h-7 px-1.5 shrink-0" onClick={() => speak(item.referenceSentence)} aria-label="朗读参考句">
                <Volume2 className="size-3.5" />
              </Button>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-foreground leading-snug">{item.referenceSentence}</p>
                <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{item.referenceTranslation}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI 反馈 */}
        {feedback && (
          <div className="rounded-2xl border border-[#00B894]/30 bg-[#00B894]/5 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal flex items-center gap-1.5">
                <Bot className="size-3.5" /> AI 批改
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="rounded-xl h-7 px-2 text-[10px] font-black"
                  onClick={() => speak(feedback.replace(/[*#]/g, ''))}>
                  <Volume2 className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="rounded-xl h-7 px-2 text-[10px] font-black"
                  onClick={() => {
                    addFavorite({
                      type: 'expression',
                      content: input.trim(),
                      meaning: feedback.slice(0, 160),
                      category: '造句练习',
                      example: `${item.keyword}｜${item.meaning}`,
                    });
                    toast.success('已收藏这次造句');
                  }}>
                  <Sparkles className="size-3.5" /> 收藏
                </Button>
              </div>
            </div>
            <div className={cn('text-[12px] font-medium text-foreground leading-relaxed whitespace-pre-wrap')}>
              {feedback}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
