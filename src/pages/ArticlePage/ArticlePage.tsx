import { useState, useRef, useCallback } from 'react';
import { FileText, Sparkles, Languages, BookOpen, Volume2, RefreshCw, Loader2, ChevronDown, CheckCircle2, XCircle, ArrowRight, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { cn, cleanText } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

type Level = 'beginner' | 'intermediate' | 'advanced';
type Topic = 'tech' | 'science' | 'culture' | 'lifestyle' | 'business' | 'nature';

const LEVELS: { key: Level; label: string; color: string; desc: string }[] = [
  { key: 'beginner', label: '初级', color: '#00B894', desc: '500-800 词 · 简单句式' },
  { key: 'intermediate', label: '中级', color: '#F59E0B', desc: '800-1200 词 · 复合句' },
  { key: 'advanced', label: '高级', color: '#6C5CE7', desc: '1200+ 词 · 学术/专业' },
];

const TOPICS: { key: Topic; label: string; icon: string; gradient: string }[] = [
  { key: 'tech', label: '科技', icon: '💻', gradient: 'from-blue-50 to-sky-50 dark:from-blue-500/10 dark:to-sky-500/10' },
  { key: 'science', label: '科学', icon: '🔬', gradient: 'from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10' },
  { key: 'culture', label: '文化', icon: '🎨', gradient: 'from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10' },
  { key: 'lifestyle', label: '生活', icon: '🌿', gradient: 'from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10' },
  { key: 'business', label: '商业', icon: '💼', gradient: 'from-slate-50 to-gray-50 dark:from-slate-500/10 dark:to-gray-500/10' },
  { key: 'nature', label: '自然', icon: '🌍', gradient: 'from-green-50 to-lime-50 dark:from-green-500/10 dark:to-lime-500/10' },
];

interface IArticle { title: string; content: string; translation: string; vocabulary: { word: string; meaning: string }[]; questions: { q: string; options: string[]; answer: number }[]; }

export default function ArticlePage() {
  const { isConfigured, chat: aiChat } = useAI();
  const tts = useTTS();

  const [level, setLevel] = useState<Level>('intermediate');
  const [topic, setTopic] = useState<Topic>('tech');
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<IArticle | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizChecked, setQuizChecked] = useState(false);
  const [selectedWord, setSelectedWord] = useState<{ word: string; meaning: string } | null>(null);
  const [wordLookupLoading, setWordLookupLoading] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);

  const generateArticle = useCallback(async () => {
    if (!isConfigured) { toast.error('请先配置 AI API Key'); return; }
    setLoading(true);
    setArticle(null);
    setShowTranslation(false);
    setQuizMode(false);
    setQuizAnswers({});
    setQuizChecked(false);
    try {
      const levelDesc = LEVELS.find((l) => l.key === level)!;
      const topicLabel = TOPICS.find((t) => t.key === topic)!;
      const result = await aiChat(
        [
          { role: 'system', content: `You are an English teacher. Write an engaging English article for ${levelDesc.label} learners (${levelDesc.desc}) about ${topicLabel.label}. Return ONLY valid JSON (no markdown):
{
  "title": "article title",
  "content": "full article in English (3-5 paragraphs, natural flow, appropriate vocabulary for the level)",
  "translation": "full Chinese translation of the article",
  "vocabulary": [{"word": "key word", "meaning": "Chinese meaning"}, ...] (5-8 key vocabulary words from the article),
  "questions": [{"q": "comprehension question in English", "options": ["A. option1", "B. option2", "C. option3", "D. option4"], "answer": 0}] (3-4 multiple choice questions, answer is index 0-3)
}` },
          { role: 'user', content: `Generate an English article about ${topicLabel.label}. Level: ${levelDesc.label}. Make it interesting and educational.` },
        ],
        { temperature: 0.8, maxTokens: 4096 },
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { toast.error('AI 返回格式异常，请重试'); return; }
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.title || !parsed.content) { toast.error('AI 生成内容不完整，请重试'); return; }
      setArticle(parsed);
      toast.success('文章已生成！');
    } catch (e) { console.error('Article generation failed:', e); toast.error('生成失败，请重试'); }
    finally { setLoading(false); }
  }, [isConfigured, level, topic, aiChat]);

  const handleWordLookup = async (word: string) => {
    setSelectedWord({ word, meaning: '查询中…' });
    setWordLookupLoading(true);
    try {
      const result = await aiChat(
        [
          { role: 'system', content: 'You are a dictionary. Return ONLY valid JSON: {"word":"...","meaning":"concise Chinese meaning (max 20 chars)"}' },
          { role: 'user', content: `Define: "${word}"` },
        ],
        { temperature: 0.2, maxTokens: 128 },
      );
      const m = result.match(/\{[\s\S]*\}/);
      if (m) {
        const d = JSON.parse(m[0]);
        setSelectedWord({ word: d.word || word, meaning: d.meaning || '未找到释义' });
      }
    } catch { setSelectedWord({ word, meaning: '查询失败' }); }
    finally { setWordLookupLoading(false); }
  };

  const handleQuizSubmit = () => {
    if (!article) return;
    setQuizChecked(true);
    const correct = article.questions.filter((q, i) => quizAnswers[i] === q.answer).length;
    toast.success(`答对 ${correct}/${article.questions.length} 题！`);
  };

  const levelColor = LEVELS.find((l) => l.key === level)!.color;
  const topicItem = TOPICS.find((t) => t.key === topic)!;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black italic text-foreground tracking-tight">文章阅读</h1>
          <p className="text-muted-foreground text-xs font-medium">AI 生成英文文章 · 词汇学习 + 阅读理解</p>
        </div>
      </div>

      {/* Config panel */}
      <Card className="rounded-[28px] border-border shadow-sm">
        <CardContent className="p-4 space-y-4">
          {/* Level selector */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">难度等级</p>
            <div className="flex gap-2 flex-wrap">
              {LEVELS.map(({ key, label, color, desc }) => (
                <button key={key} onClick={() => setLevel(key)}
                  className={cn('flex-1 min-w-[100px] px-3 py-2.5 rounded-2xl text-center transition-all border-2',
                    level === key ? 'text-white shadow-lg' : 'bg-muted text-muted-foreground border-transparent hover:border-muted-foreground/20')}
                  style={level === key ? { backgroundColor: color, borderColor: color } : undefined}>
                  <p className="text-sm font-black">{label}</p>
                  <p className="text-[9px] font-bold opacity-70">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Topic selector */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">文章主题</p>
            <div className="flex gap-2 flex-wrap">
              {TOPICS.map(({ key, label, icon, gradient }) => (
                <button key={key} onClick={() => setTopic(key)}
                  className={cn('flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold transition-all border-2 bg-gradient-to-br',
                    topic === key ? 'border-[#00B894] shadow-sm' : 'border-transparent bg-muted hover:border-muted-foreground/20', gradient)}>
                  <span className="text-base">{icon}</span>{label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <Button onClick={generateArticle} disabled={loading || !isConfigured}
            className="w-full rounded-2xl bg-gradient-to-r from-[#00B894] to-emerald-500 hover:from-[#00A080] hover:to-emerald-600 text-white font-black text-sm py-6 shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30">
            {loading ? <Loader2 className="size-5 mr-2 animate-spin" /> : <FileText className="size-5 mr-2" />}
            {loading ? 'AI 正在撰写文章…' : '生成文章'}
          </Button>
        </CardContent>
      </Card>

      {/* Article display */}
      {article && (
        <div className="space-y-4">
          {/* Article card */}
          <Card className="rounded-[32px] border-border shadow-lg overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border-b border-border pb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-lg font-black text-foreground">{article.title}</CardTitle>
                  <CardDescription className="text-xs font-bold mt-1">
                    {topicItem.icon} {topicItem.label} · {LEVELS.find((l) => l.key === level)?.label}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => tts.speak(cleanText(article.content), { rate: 0.85 })}
                    className="rounded-2xl text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground hover:text-[#00B894] gap-1">
                    <Volume2 className="size-3.5" />朗读全文
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowTranslation(!showTranslation)}
                    className={cn('rounded-2xl text-[10px] font-black uppercase tracking-wider gap-1',
                      showTranslation ? 'bg-[#6C5CE7]/10 text-[#6C5CE7]' : 'bg-muted text-muted-foreground hover:text-[#6C5CE7]')}>
                    <Languages className="size-3.5" />{showTranslation ? '隐藏翻译' : '显示翻译'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setQuizMode(false); setQuizAnswers({}); setQuizChecked(false); generateArticle(); }}
                    className="rounded-2xl text-[10px] font-black uppercase tracking-wider bg-muted text-muted-foreground hover:text-[#F59E0B] gap-1">
                    <RefreshCw className="size-3.5" />换一篇
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 lg:p-8">
              {/* Article content */}
              <div ref={contentRef} className="prose prose-sm lg:prose-base dark:prose-invert max-w-none">
                <div className="text-foreground/85 leading-relaxed text-[15px] whitespace-pre-line">
                  {article.content}
                </div>
              </div>

              {/* Translation toggle */}
              {showTranslation && (
                <div className="mt-6 p-5 rounded-2xl bg-violet-50/50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20">
                  <p className="text-[11px] font-black uppercase tracking-wider text-[#6C5CE7] mb-2 flex items-center gap-1.5">
                    <Languages className="size-3.5" />中文翻译
                  </p>
                  <p className="text-sm text-foreground/75 leading-relaxed">{article.translation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vocabulary section */}
          {article.vocabulary && article.vocabulary.length > 0 && (
            <Card className="rounded-[28px] border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <BookOpen className="size-4 text-amber-500" />核心词汇
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-2">
                  {article.vocabulary.map((v, i) => (
                    <button key={i} onClick={() => { setSelectedWord(v); tts.speak(v.word, { rate: 0.85 }); }}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors text-left group">
                      <p className="text-xs font-black text-foreground group-hover:text-amber-600">{v.word}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{v.meaning}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quiz section */}
          <Card className="rounded-[28px] border-border shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black text-foreground flex items-center gap-2">
                  <MessageSquare className="size-4 text-[#6C5CE7]" />阅读理解
                </CardTitle>
                {!quizMode ? (
                  <Button onClick={() => setQuizMode(true)} size="sm"
                    className="rounded-2xl text-[10px] font-black bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white shadow-lg shadow-violet-200/50">
                    开始答题 <ArrowRight className="size-3.5 ml-1" />
                  </Button>
                ) : (
                  <Button onClick={() => { setQuizMode(false); setQuizAnswers({}); setQuizChecked(false); }} size="sm" variant="ghost"
                    className="rounded-2xl text-[10px] font-black text-muted-foreground">
                    收起
                  </Button>
                )}
              </div>
            </CardHeader>
            {quizMode && article.questions && (
              <CardContent className="p-4 space-y-4">
                {article.questions.map((q, qi) => (
                  <div key={qi} className={cn('p-4 rounded-2xl transition-all',
                    quizChecked
                      ? quizAnswers[qi] === q.answer ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200' : 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200'
                      : 'bg-muted/50')}>
                    <p className="text-sm font-black text-foreground mb-3">{qi + 1}. {q.q}</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => {
                        const isSelected = quizAnswers[qi] === oi;
                        const isCorrect = oi === q.answer;
                        return (
                          <button key={oi} onClick={() => { if (!quizChecked) setQuizAnswers((p) => ({ ...p, [qi]: oi })); }}
                            disabled={quizChecked}
                            className={cn('w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-all border-2',
                              quizChecked
                                ? isCorrect ? 'border-[#00B894] bg-[#00B894]/5' : isSelected ? 'border-rose-400 bg-rose-50' : 'border-transparent'
                                : isSelected ? 'border-[#6C5CE7] bg-[#6C5CE7]/5' : 'border-transparent hover:border-muted-foreground/20',
                            )}>
                            <span className="flex items-center gap-2">
                              {quizChecked && isCorrect && <CheckCircle2 className="size-3.5 text-[#00B894]" />}
                              {quizChecked && isSelected && !isCorrect && <XCircle className="size-3.5 text-rose-500" />}
                              {opt}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!quizChecked && Object.keys(quizAnswers).length === article.questions.length && (
                  <Button onClick={handleQuizSubmit}
                    className="w-full rounded-2xl bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white font-black text-sm py-4 shadow-lg">
                    提交答案
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* Word lookup popup */}
      {selectedWord && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <Card className="rounded-2xl border-2 border-[#00B894]/30 shadow-xl bg-card/95 backdrop-blur-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div>
                <p className="text-sm font-black text-foreground">{selectedWord.word}</p>
                <p className="text-xs text-muted-foreground">{wordLookupLoading ? '查询中…' : selectedWord.meaning}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => tts.speak(selectedWord.word, { rate: 0.85 })}
                  className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"><Volume2 className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setSelectedWord(null)}
                  className="rounded-xl size-8 text-muted-foreground hover:text-rose-500"><XCircle className="size-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {!article && !loading && (
        <div className="text-center py-16 space-y-4">
          <div className="size-20 rounded-full bg-[#00B894]/10 flex items-center justify-center mx-auto">
            <FileText className="size-10 text-[#00B894]" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            选择难度和主题，AI 将为你生成一篇英文文章
          </p>
          <p className="text-muted-foreground text-xs">
            支持全文朗读、词汇学习、阅读理解测试
          </p>
        </div>
      )}
    </div>
  );
}
