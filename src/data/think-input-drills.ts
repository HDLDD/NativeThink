/**
 * 读英文（输入向）题库。
 *
 * 为什么单独一册：现有的 15 个模式全在练「中文 → 英文」的改写，属于输出端。
 * 输入端是另一件事——读的时候脑子里还在逐词翻中文，句尾一到就得回头重读。
 * 所以这里练的不是写，是「一眼看懂」的四个动作：
 *
 *   chunk  按意群切：一口气读一块，而不是一个词一个词啃
 *   main   先找主干：谁-做-什么，其余先挂起
 *   ref    认指代：it / this / they 往回到哪个词
 *   idiom  别逐字翻：有些句子照字面翻一定错
 *
 * 全部是选择题，不调 AI：判分确定，可以离线做，错了立刻能看解释。
 * 输出向的 15 个模式不动，这一册也不进 SM-2（读的训练靠遍数，不靠间隔）。
 *
 * 答案下标按 0/1/2 轮转排布（每类两条落在同一个下标），避免「点第一个就全对」。
 */

export type ThinkInputKind = 'chunk' | 'main' | 'ref' | 'idiom';

export interface IThinkInputKindMeta {
  id: ThinkInputKind;
  name: string;
  oneLiner: string;
}

export interface IThinkInputDrill {
  id: string;
  kind: ThinkInputKind;
  /** 英文原句或小段 */
  english: string;
  /** 题干（问什么） */
  question: string;
  options: [string, string, string];
  answer: 0 | 1 | 2;
  explanation: string;
  /** 这一题要带走的那一句话方法 */
  cue: string;
}

export const THINK_INPUT_KINDS: IThinkInputKindMeta[] = [
  { id: 'chunk', name: '按意群切', oneLiner: '一口气读一块，别一个词一个词啃。' },
  { id: 'main', name: '先找主干', oneLiner: '谁-做-什么；其余先挂起，读完再挂回来。' },
  { id: 'ref', name: '认指代', oneLiner: 'it / this / they 到底回指哪一个。' },
  { id: 'idiom', name: '别逐字翻', oneLiner: '有些句子照字面翻，意思正好反了。' },
];

export const THINK_INPUT_DRILLS: IThinkInputDrill[] = [
  /* ── 按意群切 ───────────────────────────────────────────── */
  {
    id: 'input-chunk-1',
    kind: 'chunk',
    english: 'Despite the heavy rain that had been falling since morning, the team decided to go ahead with the plan.',
    question: '哪一组切分能让你一口气读下去？',
    options: [
      'Despite the heavy rain ｜ that had been falling since morning ｜ the team decided ｜ to go ahead with the plan.',
      'Despite ｜ the heavy rain that had been ｜ falling since morning the team ｜ decided to go ahead with the plan.',
      'Despite the heavy rain that had ｜ been falling ｜ since morning the team decided to go ｜ ahead with the plan.',
    ],
    answer: 0,
    explanation: '每个竖线都落在完整成分之间：让步状语、定语从句、主句主干、不定式目的。另外两组把介词和它的宾语、把助动词和动词拆开了——读到那儿必须回头，一回头就只能逐词翻。',
    cue: '切点只放两种地方：介词短语前面、从句前后。',
  },
  {
    id: 'input-chunk-2',
    kind: 'chunk',
    english: 'The report, which the committee spent three months preparing, was finally submitted last Friday.',
    question: '哪一组切分能让你一口气读下去？',
    options: [
      'The report which the committee ｜ spent three months ｜ preparing was finally ｜ submitted last Friday.',
      'The report ｜ which the committee spent three months preparing ｜ was finally submitted last Friday.',
      'The report which ｜ the committee spent ｜ three months preparing was finally submitted ｜ last Friday.',
    ],
    answer: 1,
    explanation: '主语和它的定语从句、谓语之间各断一刀。逗号夹住的那一段整块吞下去，主干 the report was submitted 立刻浮出来。',
    cue: '逗号夹住的那一段，整块先跳过。',
  },
  {
    id: 'input-chunk-3',
    kind: 'chunk',
    english: 'If you look at the numbers from last quarter, you will notice that sales in the south have almost doubled.',
    question: '哪一组切分能让你一口气读下去？',
    options: [
      'If you look at the numbers ｜ from last quarter you will ｜ notice that sales in the south ｜ have almost doubled.',
      'If you look ｜ at the numbers from last quarter you ｜ will notice that sales in the south have ｜ almost doubled.',
      'If you look at the numbers from last quarter ｜ you will notice ｜ that sales in the south have almost doubled.',
    ],
    answer: 2,
    explanation: '条件从句、主句、宾语从句三段，每段内部不再切。切在从句中间，等于逼自己读到一半先翻译一次。',
    cue: '从句整块进，别在从句中间断。',
  },
  {
    id: 'input-chunk-4',
    kind: 'chunk',
    english: 'What surprised the researchers most was how quickly the participants adapted to the new routine.',
    question: '哪一组切分能让你一口气读下去？',
    options: [
      'What surprised the researchers most ｜ was ｜ how quickly the participants adapted to the new routine.',
      'What surprised ｜ the researchers most was ｜ how quickly the participants ｜ adapted to the new routine.',
      'What surprised the researchers ｜ most was how quickly ｜ the participants adapted ｜ to the new routine.',
    ],
    answer: 0,
    explanation: '主语从句、系动词、表语从句三段。was 前后各切一刀，对方说的到底是「什么」就出来了。',
    cue: '从句做主语时，整块当名词读，不要拆进去。',
  },
  {
    id: 'input-chunk-5',
    kind: 'chunk',
    english: 'Nobody who has worked with her for any length of time doubts that she will finish on schedule.',
    question: '哪一组切分能让你一口气读下去？',
    options: [
      'Nobody who has worked ｜ with her for any length of time ｜ doubts that she will ｜ finish on schedule.',
      'Nobody who has worked with her for any length of time ｜ doubts ｜ that she will finish on schedule.',
      'Nobody ｜ who has worked with her ｜ for any length of time doubts ｜ that she will finish on schedule.',
    ],
    answer: 1,
    explanation: '主语带着一个长定语、谓语 doubts、宾语从句。切在 doubts 前面，主语再长也不用来回看。',
    cue: '见到谓语动词，先给它左右各留一刀。',
  },
  {
    id: 'input-chunk-6',
    kind: 'chunk',
    english: 'The company announced on Monday that it would close two of its overseas offices by the end of the year.',
    question: '哪一组切分能让你一口气读下去？',
    options: [
      'The company announced ｜ on Monday that it would close ｜ two of its overseas offices by the end of the year.',
      'The company ｜ announced on Monday that it ｜ would close two of its overseas offices ｜ by the end of the year.',
      'The company announced on Monday ｜ that it would close two of its overseas offices ｜ by the end of the year.',
    ],
    answer: 2,
    explanation: '主句、宾语从句、时间状语。中间那段 that 从句是一整块，切进去就要在两种语言之间来回三次。',
    cue: 'that 一出现，后面整句先当一块。',
  },

  /* ── 先找主干 ───────────────────────────────────────────── */
  {
    id: 'input-main-1',
    kind: 'main',
    english: 'The proposal put forward by the committee last week was rejected by the board this morning.',
    question: '这句的主干（谁-做-什么）是什么？',
    options: ['the proposal was rejected', 'the committee put forward', 'the board rejected the proposal'],
    answer: 0,
    explanation: '真正的谓语是 was rejected。put forward by the committee 是修饰 proposal 的过去分词短语，不是主句谓语。抓住 was rejected，剩下的都是附加信息。',
    cue: '找第一个「有时态变化」的动词——被 -ed 修饰的那一坨不算。',
  },
  {
    id: 'input-main-2',
    kind: 'main',
    english: 'What the review found was that most of the errors had been introduced during the migration.',
    question: '这句真正在说的是哪件事？',
    options: ['评审发现了什么问题', '大部分错误是迁移过程中带进来的', '这次迁移需要重做'],
    answer: 1,
    explanation: 'What the review found 只是一层壳，意思等于「评审发现的东西是」；was 后面才是要说的内容。英文习惯把结论放后面、壳放前面。',
    cue: 'What … was that … 这种句子，重点永远在 was 后面。',
  },
  {
    id: 'input-main-3',
    kind: 'main',
    english: 'The people who came to the meeting expecting a decision left without hearing anything definite.',
    question: '主干是谁做了什么？',
    options: ['the people came to the meeting', 'they heard a decision', 'the people left'],
    answer: 2,
    explanation: 'who came to the meeting 是修饰 people 的定语从句，left 才是主句谓语。读到 left，句子的动作才真正发生。',
    cue: '一个句子里连着两个动词，第二个常常才是主句谓语。',
  },
  {
    id: 'input-main-4',
    kind: 'main',
    english: 'Because the server had been restarted twice that morning, the logs were incomplete.',
    question: '这句想让你接受的是哪一件事？',
    options: ['the logs were incomplete', 'the server had been restarted', 'the logs had been restarted'],
    answer: 0,
    explanation: 'because 那半句是原因、是背景，整句在说的是结果：日志不全。',
    cue: 'because / since / although 打头的从句，是背景，不是主干。',
  },
  {
    id: 'input-main-5',
    kind: 'main',
    english: 'It was the second attempt, made three years after the first, that finally worked.',
    question: '把强调结构剥掉以后，原句是什么？',
    options: ['the first attempt finally worked', 'the second attempt finally worked', 'it worked three years later'],
    answer: 1,
    explanation: 'It was … that … 是强调句型：把 It was 和 that 去掉，剩下的 the second attempt finally worked 才是原句。中间那个逗号短语是插进去的补充。',
    cue: 'It was … that … 把两头去掉，剩下的就是原句。',
  },
  {
    id: 'input-main-6',
    kind: 'main',
    english: 'Given how little time was left, the only thing we could do was ask for an extension.',
    question: '这句的结论是什么？',
    options: ['剩下的时间很少', '我们能做的事情很多', '我们只能申请延期'],
    answer: 2,
    explanation: 'Given 那半句是前提，the only thing we could do was … 才是结论。前提读得再仔细，也不能当成这句在说的事。',
    cue: 'Given / Considering 打头，后面才是这句想让你接受的事。',
  },

  /* ── 认指代 ─────────────────────────────────────────────── */
  {
    id: 'input-ref-1',
    kind: 'ref',
    english: 'Maria sent the draft to her editor before she left for the airport. She had been working on it for a month.',
    question: '第二句里的 it 指什么？',
    options: ['the draft', 'the airport', 'her editor'],
    answer: 0,
    explanation: '前一句里只有 draft 是「能被做一个月的」东西；airport 和 editor 都说不通。指代靠语义核对，不靠「离得最近」。',
    cue: '回找指代时用「哪个说得通」筛，不用「最近的那个」。',
  },
  {
    id: 'input-ref-2',
    kind: 'ref',
    english: 'The old bridge was closed for repairs, which annoyed the commuters who used it every day.',
    question: '这句里的 it 指什么？',
    options: ['the repairs', 'the old bridge', 'the commuters'],
    answer: 1,
    explanation: 'used 的宾语是桥——每天用它的人才叫通勤者。which 那半句里的 it 已经换了主人，别把它当成 which 的先行词。',
    cue: '一句话里出现两个代词，各自在它所在的那个从句里就近找。',
  },
  {
    id: 'input-ref-3',
    kind: 'ref',
    english: 'Some of the files were corrupted during the backup. Those were restored from the previous copy.',
    question: 'Those 指的是哪些文件？',
    options: ['all of the files', 'the previous copies', 'the files that were corrupted'],
    answer: 2,
    explanation: 'Those 承接上一句的 some of the files——出事的那一部分，不是全部。英文用 Those 就是说「刚才说的那一批」，范围不扩大。',
    cue: 'this / that / these / those 指「刚说完的那一块」，不额外扩范围。',
  },
  {
    id: 'input-ref-4',
    kind: 'ref',
    english: 'Our manager disagreed with the consultants, partly because they had never worked on a project this size.',
    question: 'they 指谁？',
    options: ['the consultants', 'our manager', 'the projects'],
    answer: 0,
    explanation: 'disagreed with 的宾语是 consultants，原因落在他们身上才说得通：经理不认同，因为他们没做过这么大的项目。',
    cue: 'A disagreed with B because they … —— they 通常是被反对的那一方。',
  },
  {
    id: 'input-ref-5',
    kind: 'ref',
    english: 'If the client asks for the discount again, just tell him the price already includes it.',
    question: 'includes 后面的 it 指什么？',
    options: ['the price', 'the discount', 'the client'],
    answer: 1,
    explanation: '折扣已经含在价格里。includes 的主语是 price，宾语得是能被包含进去的东西，只能是 discount。',
    cue: '代词作宾语时，先看动词要什么，别先看前面出现过什么。',
  },
  {
    id: 'input-ref-6',
    kind: 'ref',
    english: 'The proposal was rejected, and that surprised nobody who had read the feedback.',
    question: 'that 指什么？',
    options: ['the feedback', 'nobody', '提案被否这件事'],
    answer: 2,
    explanation: 'that 指前面整件事——提案被否决。英文里 and that … 的 that 常常指一整句，而不是某一个名词。',
    cue: 'and that … 的 that，多半指前面一整句。',
  },

  /* ── 别逐字翻 ───────────────────────────────────────────── */
  {
    id: 'input-idiom-1',
    kind: 'idiom',
    english: "I don't think this approach will work.",
    question: '这句实际的意思是？',
    options: ['我觉得这办法行不通', '我不确定这办法行不行', '这办法一定不会失败'],
    answer: 0,
    explanation: '英文把否定提到了 think 上，真正被否定的是后面那个从句：这办法行不通。中文要是照字面说「我不觉得……会成功」，也别扭；最自然的是「我觉得不太行」。',
    cue: "I don't think / I don't believe 打头，否定落在后面那半句。",
  },
  {
    id: 'input-idiom-2',
    kind: 'idiom',
    english: 'He is anything but careless.',
    question: '这句实际的意思是？',
    options: ['他也就是马虎而已', '他一点都不马虎', '他比马虎还过分'],
    answer: 1,
    explanation: 'anything but 等于「绝不是」。照字面翻成「除了马虎什么都行」，意思正好反了。',
    cue: 'anything but X = 绝不是 X；all but X = 差一点就是 X。',
  },
  {
    id: 'input-idiom-3',
    kind: 'idiom',
    english: "You can't be too careful with this data.",
    question: '这句实际的意思是？',
    options: ['你别对这些数据太小心', '小心过头反而会出错', '这些数据再怎么小心都不为过'],
    answer: 2,
    explanation: "can't … too … 的意思是「越……越好、不可能过头」。照字面读成「不能太小心」，意思正好翻过来。",
    cue: "can't be too + 形容词 = 再……也不为过。",
  },
  {
    id: 'input-idiom-4',
    kind: 'idiom',
    english: "It's not that he can't do it; he simply won't.",
    question: '这句实际的意思是？',
    options: ['不是他不会，是他不肯', '他不会做，也不愿意做', '他做不了，因为他不想'],
    answer: 0,
    explanation: 'not that … 是否掉前面那个说法，分号后面才是真话。重点是「不肯」和「不会」的对比，逐字翻容易把两者糊成一句。',
    cue: 'not that A; B —— 重点在 B，A 只是被否掉的说法。',
  },
  {
    id: 'input-idiom-5',
    kind: 'idiom',
    english: 'I could use a hand with these boxes.',
    question: '这句实际的意思是？',
    options: ['这些箱子我能一只手搬', '这些箱子我需要帮忙', '我想借一副手套来搬箱子'],
    answer: 1,
    explanation: 'could use a hand 是「需要有人搭把手」。hand 在这儿不是手，是「帮忙」。',
    cue: 'could use + 名词 = 需要它，不是「能用它」。',
  },
  {
    id: 'input-idiom-6',
    kind: 'idiom',
    english: 'The two versions are a far cry from each other.',
    question: '这句实际的意思是？',
    options: ['两个版本离得很近', '两个版本听起来差不多', '两个版本差得很远'],
    answer: 2,
    explanation: 'a far cry from 是「与……相去甚远」。字面的「远远一声喊」不承担任何意思，只能整块记。',
    cue: 'far cry from X = 和 X 差得远。',
  },
];

/** 按类取题，保持题库里的原始顺序。 */
export function drillsOfKind(kind: ThinkInputKind): IThinkInputDrill[] {
  return THINK_INPUT_DRILLS.filter((drill) => drill.kind === kind);
}
