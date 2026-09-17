import { MessagesSquare, Target, Blocks, PenLine } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChunkDrill } from './components/ChunkDrill';
import { PatternLibrary } from './components/PatternLibrary';
import { BuildPractice } from './components/BuildPractice';
import { SENTENCE_LAB } from '@/data/sentence-lab';
import { SENTENCE_PATTERNS } from '@/data/sentence-patterns';

/**
 * 句子学习 —— 逐句精听 · 跟读 · 拆解。
 *
 * 两个方向、三种训练：
 *   看懂句子（输入）：拆句 —— 三步读句法，先预测再揭晓
 *   学会造句（输出）：句型库给骨架、造句练习验产出
 */
export default function SentenceLabPage() {
  return (
    <div className="space-y-6 page-enter">
      {/* 页头 */}
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
          <MessagesSquare className="size-6 text-ink-teal" />
          句子学习
        </h1>
        <p className="text-sm text-muted-foreground">
          读懂长句不靠翻译，靠抓主干；写出好句不靠词汇量，靠句型骨架。
        </p>
      </div>

      {/* 概览 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="size-4 text-ink-teal" />
            <span className="text-sm font-black text-foreground">看懂句子</span>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            {SENTENCE_LAB.length} 句真实语料（取自站内公版书，逐句核验原文），练「找动词 → 定主干 → 切意群」。
          </p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Blocks className="size-4 text-ink-teal" />
            <span className="text-sm font-black text-foreground">学会造句</span>
          </div>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            {SENTENCE_PATTERNS.length} 个高频句型骨架 + AI 逐句批改，从「看得懂」走到「写得出」。
          </p>
        </div>
      </div>

      <Tabs defaultValue="drill" className="w-full">
        <TabsList className="bg-muted p-1.5 rounded-3xl h-auto flex-wrap">
          <TabsTrigger value="drill" className="rounded-2xl text-xs font-black gap-1.5 data-[state=active]:bg-card">
            <Target className="size-3.5" /> 拆句
          </TabsTrigger>
          <TabsTrigger value="patterns" className="rounded-2xl text-xs font-black gap-1.5 data-[state=active]:bg-card">
            <Blocks className="size-3.5" /> 句型
          </TabsTrigger>
          <TabsTrigger value="build" className="rounded-2xl text-xs font-black gap-1.5 data-[state=active]:bg-card">
            <PenLine className="size-3.5" /> 造句
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drill" className="mt-6">
          <ChunkDrill />
        </TabsContent>
        <TabsContent value="patterns" className="mt-6">
          <PatternLibrary />
        </TabsContent>
        <TabsContent value="build" className="mt-6">
          <BuildPractice />
        </TabsContent>
      </Tabs>
    </div>
  );
}
