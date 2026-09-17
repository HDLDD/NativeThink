import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, BookMarked, ChevronLeft, ChevronRight, Eye, EyeOff, Heart, Info,
  Languages, ListTree, Shuffle, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTTS } from '@/lib/use-tts';
import { useFavorites } from '@/lib/use-favorites';
import { cn } from '@/lib/utils';
import { SENTENCE_LAB, type ISentenceLabItem } from '@/data/sentence-lab';
import { SENTENCE_EXPLAIN } from '@/data/sentence-explain';
import { GRAMMAR_TOPICS } from '@/data/grammar-map';
import { resolveSegments } from '@/lib/sentence-parse';

/**
 * 句子精讲 —— 回答三个问题：**为什么这么翻译 / 怎么翻译 / 用了什么语法**。
 *
 * 结构（自上而下）：
 *   原句 + 中文对照   → 先看整句
 *   翻译思路           → 语序 / 词义 / 句式三层，讲清为什么这样译
 *   用到的语法         → 每条可点，跳到语法地图对应条目
 *   结构分解           → 主干 + 各修饰块的语法说明（保留原有标注，作为语法层的展开）
 *
 * 数据说明：翻译思路由脚本生成（见 sentence-explain.ts），语法点会与本句的结构标注交叉显示；
 * 自动标注的句子顶部有提示，说明文字可能不如人工精细。
 */

type SourceFilter = '全部' | '书籍' | '演讲' | '刊物';
type LevelFilter = '全部' | '入门' | '进阶' | '高阶';
const srcOf = (it: ISentenceLabItem) => (it.source.includes('演讲') ? '演讲' : it.source === '站内刊物' ? '刊物' : '书籍');
const lvLabel = (l: string) => (l === 'beginner' ? '入门' : l === 'intermediate' ? '进阶' : '高阶');

/** 语法点名称 → 语法地图条目（用于「点了直接看该语法」） */
function findGrammarTopic(name: string) {
  const key = name.replace(/\s/g, '');
  const hit = GRAMMAR_TOPICS.find((t) => {
    const n = t.name.replace(/\s/g, '');
    return n.includes(key) || key.includes(n.slice(0, 4));
  });
  if (hit) return hit;
  // 关键词兜底
  const map: [RegExp, string][] = [
    [/定语从句|关系从句/, 'g08'], [/名词性|主语从句|宾语从句|同位语从句|表语从句/, 'g09'],
    [/状语从句/, 'g10'], [/被动/, 'g05'], [/虚拟/, 'g06'], [/倒装|强调句/, 'g12'],
    [/非谓语|分词|不定式|动名词/, 'g11'], [/完成/, 'g04'], [/进行/, 'g17'], [/将来/, 'g18'],
    [/情态/, 'g20'], [/时态/, 'g03'], [/冠词/, 'g13'], [/介词/, 'g14'], [/代词/, 'g15'],
    [/比较/, 'g16'], [/it\s*句型|形式主语/, 'g21'], [/there\s*be/, 'g22'], [/并列|基本句型/, 'g01'],
    [/间接引语/, 'g27'], [/反意疑问/, 'g28'], [/名词的数|量词/, 'g23'], [/限定词/, 'g24'],
  ];
  for (const [re, id] of map) if (re.test(name)) return GRAMMAR_TOPICS.find((t) => t.id === id) || null;
  return null;
}

export function SentenceExplain({ onJumpToGrammar }: { onJumpToGrammar?: (topicId: string) => void }) {
  const [idx, setIdx] = useState(0);
  const [showZh, setShowZh] = useState(true);
  const [srcFilter, setSrcFilter] = useState<SourceFilter>('全部');
  const [lvFilter, setLvFilter] = useState<LevelFilter>('全部');
  const { speak } = useTTS();
  const { favorites, addFavorite, removeFavorite, isFavorited } = useFavorites();

  const deck = useMemo(
    () => SENTENCE_LAB.filter(
      (s) => (srcFilter === '全部' || srcOf(s) === srcFilter) && (lvFilter === '全部' || lvLabel(s.level) === lvFilter),
    ),
    [srcFilter, lvFilter],
  );
  const item: ISentenceLabItem = deck[Math.min(idx, Math.max(0, deck.length - 1))] ?? SENTENCE_LAB[0];
  const explain = SENTENCE_EXPLAIN[item.id];
  const resolved = useMemo(() => resolveSegments(item), [item]);
  const coreCount = item.segments.filter((s) => s.r === 'core').length;
  const faved = isFavorited(item.en, 'expression');
  const goto = (n: number) => setIdx(((n % deck.length) + deck.length) % deck.length);

  const toggleFav = () => {
    if (faved) {
      const f = favorites.find((x) => x.content === item.en && x.type === 'expression');
      if (f) removeFavorite(f.id);
      toast.info('已取消收藏');
      return;
    }
    addFavorite({ type: 'expression', content: item.en, meaning: item.zh, category: '句子学习', example: item.source });
    toast.success('已收藏到表达本');
  };

  return (
    <div className="space-y-4">
      {/* 筛选 + 导航 */}
      <div className="flex flex-wrap items-center gap-2">
        {(['全部', '书籍', '演讲', '刊物'] as SourceFilter[]).map((s) => (
          <button key={s} type="button" onClick={() => { setSrcFilter(s); setIdx(0); }}
            className={cn('px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
              srcFilter === s ? 'border-[#00B894] bg-[#00B894]/5 text-ink-teal' : 'border-border text-muted-foreground hover:border-muted-foreground/40')}>
            {s}
          </button>
        ))}
        <span className="w-px h-4 bg-border" />
        {(['全部', '入门', '进阶', '高阶'] as LevelFilter[]).map((s) => (
          <button key={s} type="button" onClick={() => { setLvFilter(s); setIdx(0); }}
            className={cn('px-2.5 py-1 rounded-full text-[10px] font-black border transition-all',
              lvFilter === s ? 'border-[#00B894] bg-[#00B894]/5 text-ink-teal' : 'border-border text-muted-foreground hover:border-muted-foreground/40')}>
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
        {/* 头部：进度 + 换句 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-black text-foreground tabular-nums shrink-0">
              第 {Math.min(idx + 1, deck.length)} / {deck.length} 句
            </span>
            <span className="text-[10px] font-bold text-muted-foreground truncate">
              {item.source} · {lvLabel(item.level)}
            </span>
            {item.auto && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0"
                title="本句讲解由脚本生成（结构经校验），措辞可能不如人工精细">
                自动生成
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="rounded-xl h-8 px-2 text-[10px] font-black" onClick={() => goto(idx - 1)} disabled={deck.length < 2}>
              <ChevronLeft className="size-3.5" /> 上一句
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl h-8 px-2 text-[10px] font-black" onClick={() => goto(idx + 1)} disabled={deck.length < 2}>
              下一句 <ChevronRight className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2 text-[10px] font-black" onClick={() => goto(Math.floor(Math.random() * deck.length))} disabled={deck.length < 2}>
              <Shuffle className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* 原句 + 译文 */}
        <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <Button size="sm" variant="ghost" className="rounded-xl h-7 px-1.5 shrink-0" onClick={() => speak(item.en)} aria-label="朗读原句">
              <Volume2 className="size-3.5" />
            </Button>
            <p className="text-[15px] font-bold text-foreground leading-relaxed">{item.en}</p>
          </div>
          {showZh && (
            <p className="pl-9 text-[13px] font-bold text-ink-teal leading-relaxed">{item.zh}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={() => speak(item.en)}>
            <Volume2 className="size-3.5" /> 朗读
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={() => setShowZh((v) => !v)}>
            {showZh ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {showZh ? '隐藏译文' : '看译文'}
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl h-8 px-2.5 text-[10px] font-black" onClick={toggleFav}>
            <Heart className={cn('size-3.5', faved && 'fill-rose-500 text-rose-500')} /> {faved ? '已收藏' : '收藏'}
          </Button>
        </div>

        {/* 为什么这么译 / 怎么译 */}
        <div className="rounded-2xl border border-[#00B894]/25 bg-[#00B894]/5 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-ink-teal flex items-center gap-1.5">
            <Languages className="size-3.5" /> 为什么这么译 · 怎么译
          </p>
          {explain?.translation?.length ? (
            <ol className="space-y-1.5">
              {explain.translation.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="size-4 shrink-0 rounded-full bg-[#00B894]/15 text-ink-teal grid place-items-center text-[9px] font-black mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-[12px] font-bold text-foreground/85 leading-relaxed">{t}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12px] font-bold text-muted-foreground leading-relaxed">
              {item.tip}
            </p>
          )}
        </div>

        {/* 用了什么语法 */}
        <div className="rounded-2xl border border-border/60 p-4 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ListTree className="size-3.5" /> 用了什么语法
          </p>
          {explain?.grammar?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {explain.grammar.map((g, i) => {
                const topic = findGrammarTopic(g);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!topic || !onJumpToGrammar}
                    onClick={() => topic && onJumpToGrammar?.(topic.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-black border transition-all flex items-center gap-1',
                      topic && onJumpToGrammar
                        ? 'border-[#00B894]/40 bg-[#00B894]/5 text-ink-teal hover:bg-[#00B894]/10'
                        : 'border-border bg-muted text-muted-foreground',
                    )}
                    title={topic ? `看语法：${topic.name}` : '语法地图里暂无对应条目'}
                  >
                    {g}
                    {topic && onJumpToGrammar && <BookMarked className="size-3" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] font-bold text-muted-foreground">讲解生成中…</p>
          )}

          {/* 结构分解（原有标注，作为语法层的展开） */}
          {resolved && (
            <div className="space-y-1.5 pt-1">
              <div className="rounded-xl bg-[#00B894]/5 border border-[#00B894]/20 p-2.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-ink-teal mb-0.5">主干</p>
                <p className="text-[12px] font-black text-foreground">{item.backboneGloss}</p>
              </div>
              {resolved.map((rs, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-border/60 p-2.5">
                  <span className={cn(
                    'shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black border',
                    rs.seg.r === 'core' ? 'bg-[#00B894]/10 text-ink-teal border-[#00B894]/30'
                      : rs.seg.r === 'conn' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                        : 'bg-muted text-muted-foreground border-border',
                  )}>
                    {rs.seg.r === 'core' ? '主干' : rs.seg.r === 'conn' ? '连接' : '修饰'}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[12px] font-bold text-foreground leading-snug">{rs.seg.t}</p>
                    {rs.seg.note && <p className="text-[10px] font-bold text-muted-foreground leading-snug">{rs.seg.note}</p>}
                  </div>
                </div>
              ))}
              <p className="text-[10px] font-bold text-muted-foreground">
                主干 {coreCount} 块 · 修饰 {item.segments.length - coreCount} 块
              </p>
            </div>
          )}
        </div>

        {/* 读法提示 */}
        <div className="flex items-start gap-2 rounded-2xl bg-muted/40 p-3">
          <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" />
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">{item.tip}</p>
        </div>
      </div>
    </div>
  );
}
