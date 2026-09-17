// EXPORTS: ISentencePattern, PATTERN_CATEGORIES, SENTENCE_PATTERNS
//
// 句型库 —— 造句的骨架。
// 设计要点：每个句型都配「中文思维对照」，点出中文习惯怎么说、母语者为什么换一种结构。
// 只学会单词是造不出句子的；能复用的句型框架才是产出能力。

export interface IPatternExample {
  en: string;
  zh: string;
}

/** 造句槽位：用户填这一格，拼出完整句 */
export interface IPatternSlot {
  /** 槽位名（填在骨架里的占位符，如 {形容}） */
  key: string;
  /** 提示：这里该填什么词性/内容 */
  hint: string;
  /** 一个可用的示例填法 */
  sample: string;
}

export interface ISentencePattern {
  id: string;
  /** 句型名（中文，便于记忆） */
  name: string;
  /** 骨架：数组元素是固定文本或 {槽位名} */
  frame: string[];
  category: '句子骨架' | '从句连接' | '非谓语' | '强调与倒装' | '比较与递进';
  level: 'beginner' | 'intermediate' | 'advanced';
  /** 中文思维：中文里通常怎么说 */
  zhThinking: string;
  /** 思维差异：母语者为什么换成这个结构 */
  why: string;
  examples: IPatternExample[];
  /** 「照着造」的槽位 */
  slots: IPatternSlot[];
}

export const PATTERN_CATEGORIES = ['句子骨架', '从句连接', '非谓语', '强调与倒装', '比较与递进'] as const;

export const SENTENCE_PATTERNS: ISentencePattern[] = [
  {
    id: 'p01',
    name: 'It 形式主语',
    frame: ['It is ', '{评价}', ' ', '{to do / that 从句}'],
    category: '句子骨架',
    level: 'beginner',
    zhThinking: '中文：说清楚一件事很困难 →「说清楚这件事很难」',
    why: '英语不喜欢「长主语」开头。遇到"做某事是……的"这种判断，母语者会先用 it 占住主语位置，把真正的主语（to do / that 从句）挪到后面 —— 句子头轻脚重，听的人先知道"这是个评价"，再听到评价什么。',
    examples: [
      { en: 'It is hard to explain how I felt at that moment.', zh: '很难说清我当时是什么感受。' },
      { en: 'It is important that everyone knows the deadline.', zh: '所有人都知道截止时间，这很重要。' },
    ],
    slots: [
      { key: '评价', hint: '形容词：difficult / important / surprising…', sample: 'really difficult' },
      { key: 'to do / that 从句', hint: '真正的主语：to + 动词原形，或 that + 完整句子', sample: 'to say no to him' },
    ],
  },
  {
    id: 'p02',
    name: 'There be 存在句',
    frame: ['There is / are ', '{数量}', ' ', '{名词}', ' ', '{地点/范围}'],
    category: '句子骨架',
    level: 'beginner',
    zhThinking: '中文：「桌子上有一本书」—— 用"有"字开头',
    why: '英语的「有」分两种：表示"拥有"用 have，表示"某处存在"用 There be。中文一个"有"字通吃，所以最容易错说成 "The table has a book"。记住：先存在、后拥有。',
    examples: [
      { en: 'There are three reasons why I disagree.', zh: '我不同意，有三个原因。' },
      { en: 'There is a fine line between confidence and arrogance.', zh: '自信和傲慢之间只有一线之隔。' },
    ],
    slots: [
      { key: '数量', hint: '数量或限定词：a / three / some / no', sample: 'no' },
      { key: '名词', hint: '存在的那个东西（单数配 is，复数配 are）', sample: 'shortcut' },
      { key: '地点/范围', hint: '介词短语或定语从句，说明范围', sample: 'to learning a language' },
    ],
  },
  {
    id: 'p03',
    name: '强调句 It is … that …',
    frame: ['It is ', '{被强调部分}', ' that ', '{句子其余部分}'],
    category: '强调与倒装',
    level: 'intermediate',
    zhThinking: '中文：靠语序或"正是""就是"来强调',
    why: '英语有一个专门的强调框架：把要强调的东西夹在 It is 和 that 之间，其余部分照原样跟在 that 后面。中文可以靠"正是……"或重音，英语在书面上必须靠这个结构，否则听不出重点。',
    examples: [
      { en: 'It was the silence that frightened me, not the noise.', zh: '让我害怕的是沉默，不是噪音。' },
      { en: 'It is consistency, not talent, that separates them.', zh: '区别在于坚持，而不是天赋。' },
    ],
    slots: [
      { key: '被强调部分', hint: '要凸显的人/事/时间/地点', sample: 'the second attempt' },
      { key: '句子其余部分', hint: '剩下的句子（去掉被强调部分后仍完整）', sample: 'taught me the most' },
    ],
  },
  {
    id: 'p04',
    name: '比较级 the more … the more …',
    frame: ['The more ', '{条件}', ', the more ', '{结果}'],
    category: '比较与递进',
    level: 'intermediate',
    zhThinking: '中文：「越……就越……」',
    why: '中文用"越……越……"，英语同样有对称结构，但两边都要用比较级、且都提前到句首（The more X, the more Y）。很多人只写一半，说成 "The more you practice, you will improve" —— 后半也要带比较级。',
    examples: [
      { en: 'The more I learn, the less I feel I know.', zh: '我学得越多，越觉得自己知道得少。' },
      { en: 'The earlier you start, the easier it gets.', zh: '开始得越早，后面越轻松。' },
    ],
    slots: [
      { key: '条件', hint: 'the more + 主语 + 谓语（前半句）', sample: 'you expose yourself to it' },
      { key: '结果', hint: 'the more/less + 主语 + 谓语（后半句也要比较级）', sample: 'natural it becomes' },
    ],
  },
  {
    id: 'p05',
    name: '让步从句（虽然…但是）',
    frame: ['Although / Even though ', '{事实}', ', ', '{主句（不再加 but）}'],
    category: '从句连接',
    level: 'beginner',
    zhThinking: '中文：「虽然……但是……」成对出现',
    why: '中文的"虽然…但是"要配对使用，英语只能用其中一个：Although 已经表示转折，后面再加 but 就重复了。这是中国人最高频的语法错之一。',
    examples: [
      { en: 'Although the plan looks solid, I still have doubts.', zh: '虽然这个计划看起来挺扎实，我还是有疑虑。' },
      { en: 'Even though it was late, nobody wanted to leave.', zh: '尽管很晚了，谁都不想走。' },
    ],
    slots: [
      { key: '事实', hint: '承认的那部分（完整小句）', sample: 'I had rehearsed it ten times' },
      { key: '主句（不再加 but）', hint: '真正想说的重点，不要再写 but', sample: 'my voice still shook' },
    ],
  },
  {
    id: 'p06',
    name: '结果 so … that …',
    frame: ['{主语} + be/动词 + so ', '{形容词/副词}', ' that ', '{结果}'],
    category: '从句连接',
    level: 'intermediate',
    zhThinking: '中文：「太……以至于……」',
    why: '中文常把"太"和"以至于"分开说，英语必须用 so … that … 框住 —— so 后面跟形容词/副词，that 后面跟完整句子。注意别和 such … that …（such 后面跟名词）混。',
    examples: [
      { en: 'The lecture was so dense that I lost track after ten minutes.', zh: '那场讲座信息太密，我十分钟后就跟丢了。' },
      { en: 'She spoke so quickly that nobody could take notes.', zh: '她说得太快，没人能记下笔记。' },
    ],
    slots: [
      { key: '形容词/副词', hint: 'so 后面只能跟形容词或副词', sample: 'convincing' },
      { key: '结果', hint: 'that + 完整句子', sample: 'everyone changed their mind' },
    ],
  },
  {
    id: 'p07',
    name: '定语从句（补充说明）',
    frame: ['{名词}', ' ', '{that / which / who}', ' ', '{谓语+其余}'],
    category: '从句连接',
    level: 'intermediate',
    zhThinking: '中文：把修饰放在名词前面 ——「我昨天遇到的那个人」',
    why: '中文的定语在名词前面（前置），英语的长度受限：短语可以前置（a tall man），但一旦是"句子"，就必须后置、跟在名词后面，并用 that/which/who 引导。这也是理解长句的关键：看到这些词就知道"后面是在解释前面的名词"。',
    examples: [
      { en: 'The advice that stuck with me came from a stranger.', zh: '一直记在我心里的那句建议来自一个陌生人。' },
      { en: 'She has a way of explaining things that makes you feel smart.', zh: '她讲东西有种让你觉得自己很聪明的本事。' },
    ],
    slots: [
      { key: '名词', hint: '被修饰的那个名词', sample: 'the book' },
      { key: 'that / which / who', hint: '人用 who/that，物用 that/which', sample: 'that' },
      { key: '谓语+其余', hint: '从句自己的主语谓语（缺宾语就用 which/that）', sample: 'changed my career' },
    ],
  },
  {
    id: 'p08',
    name: '现在分词作状语',
    frame: ['{Doing…}', ', ', '{主语 + 谓语}'],
    category: '非谓语',
    level: 'advanced',
    zhThinking: '中文：「他一边走一边想」或「因为下雨，我们取消了」',
    why: '中文习惯用"因为/一边……一边"这类连词把两个动作并列。英语可以把次要动作压成一个 -ing 短语放在句首，主语与主句共用 —— 句子更紧凑、书面感更强。这是从"能说对"到"写得像样"的关键一步。',
    examples: [
      { en: 'Looking back, I realize how lucky I was.', zh: '回头看，我才意识到自己有多幸运。' },
      { en: 'Having read the whole thing twice, she still found new details.', zh: '整篇读了两遍，她仍能发现新的细节。' },
    ],
    slots: [
      { key: 'Doing…', hint: '分词短语（完成用 Having done），逻辑主语要与主句一致', sample: 'Comparing the two versions' },
      { key: '主语 + 谓语', hint: '主句（主语必须与分词的动作发出者相同）', sample: 'I prefer the shorter one' },
    ],
  },
  {
    id: 'p09',
    name: '否定词提前倒装',
    frame: ['Never / Not only / Rarely ', '{助动词 + 主语 + 谓语}', ' …'],
    category: '强调与倒装',
    level: 'advanced',
    zhThinking: '中文：「我从来没想过……」',
    why: '英语里一旦把否定词（Never / Rarely / Not only / Little）提到句首，后面就必须倒装成疑问句语序 —— Never have I …。这不是文学修辞，正式的书面与演讲里很常见，用来加重语气。',
    examples: [
      { en: 'Never have I seen a crowd so quiet.', zh: '我从没见过这么安静的人群。' },
      { en: 'Not only did she finish early, she also helped others.', zh: '她不仅提前完成，还帮了别人。' },
    ],
    slots: [
      { key: '助动词 + 主语 + 谓语', hint: '倒装语序：助动词在前，主语在后', sample: 'have I doubted' },
    ],
  },
  {
    id: 'p10',
    name: '虚拟语气（与事实相反）',
    frame: ['If ', '{主语 + had done}', ', ', '{主语 + would have done}'],
    category: '从句连接',
    level: 'advanced',
    zhThinking: '中文：「要是当时……就好了」—— 靠"当时""本来"表时间',
    why: '中文用词汇（本来、当时、早该）表达"没发生"，动词形式不变。英语必须**换形式**：if 从句用 had done（过去完成），主句用 would have done。形式变了，意思才是"与过去事实相反的假设"。',
    examples: [
      { en: 'If I had known, I would have said something.', zh: '我要是早知道，就会说点什么了。' },
      { en: 'Had it not been for her help, I would have given up.', zh: '要不是她帮忙，我早就放弃了。' },
    ],
    slots: [
      { key: '主语 + had done', hint: 'if 从句用过去完成（与过去相反）', sample: 'we had left earlier' },
      { key: '主语 + would have done', hint: '主句用 would have + 过去分词', sample: 'we would have avoided the traffic' },
    ],
  },
  {
    id: 'p11',
    name: '被动语态（不知道/不必说施动者）',
    frame: ['{受事}', ' ', '{be + 过去分词}', ' ', '{by 施动者（可省）}'],
    category: '句子骨架',
    level: 'beginner',
    zhThinking: '中文：「有人说」「据报告」—— 用"有人/据"含糊带过',
    why: '中文用"有人""大家""据说"来隐藏主语；英语把这层意思做成被动语态：It is said that … / The report was published。被动不是"正式"的代名词，它的真正用途是**当施动者不重要或不知道时，把它请出句子**。',
    examples: [
      { en: 'The decision was made before anyone asked us.', zh: '这个决定在问我们之前就定了。' },
      { en: 'Mistakes were made, and we are fixing them.', zh: '确实犯了错，我们正在修正。' },
    ],
    slots: [
      { key: '受事', hint: '动作的承受者，作主语', sample: 'The deadline' },
      { key: 'be + 过去分词', hint: '注意时态与主谓一致', sample: 'was extended' },
      { key: 'by 施动者（可省）', hint: '施动者不重要就整块省略', sample: 'by the committee' },
    ],
  },
  {
    id: 'p12',
    name: '同位语补充',
    frame: ['{名词}', ', ', '{同位语（解释它是什么）}', ', ', '{谓语…}'],
    category: '句子骨架',
    level: 'intermediate',
    zhThinking: '中文：另起一句解释 ——「他是我们老师。他教数学。」',
    why: '英语可以把解释直接"贴"在名词后面，用逗号隔开，不另起句子。这在书面语里密度很高 —— 读长句遇到逗号夹着的名词短语时，先判断它是不是在解释前面的名词，而不是新主语。',
    examples: [
      { en: 'My mentor, a retired engineer, still answers my questions.', zh: '我的恩师是位退休工程师，至今还在解答我的问题。' },
      { en: 'The idea, a simple one, turned out to be the best.', zh: '那个想法很简单，结果却最好。' },
    ],
    slots: [
      { key: '名词', hint: '被解释的名词', sample: 'Her first novel' },
      { key: '同位语（解释它是什么）', hint: '名词短语，与前面指同一个东西', sample: 'a story about her hometown' },
      { key: '谓语…', hint: '主句继续（主语仍是前面那个名词）', sample: 'sold out in a week' },
    ],
  },
  {
    id: 'p13',
    name: '名词化（把动作变成名词）',
    frame: ['The ', '{名词化动作}', ' of ', '{内容}', ' ', '{谓语}'],
    category: '句子骨架',
    level: 'advanced',
    zhThinking: '中文：「我们决定推迟发布」—— 动词连着说',
    why: '中文倾向连用动词（决定、推迟、发布），英语书面语则常把动作变成名词：the decision to postpone the launch。好处是动作能当主语、能带修饰、信息密度高。这也是学术/新闻英语读起来"重"的原因 —— 认出这层转换，长句立刻变简单。',
    examples: [
      { en: 'The rapid growth of online learning changed everything.', zh: '在线学习的迅速增长改变了一切。' },
      { en: 'His refusal to explain made things worse.', zh: '他拒绝解释，让事情更糟了。' },
    ],
    slots: [
      { key: '名词化动作', hint: '把动词换成名词形式：decide → decision', sample: 'sudden rise' },
      { key: '内容', hint: 'of + 名词（原动作的对象）', sample: 'energy prices' },
      { key: '谓语', hint: '这个"动作名词"做了什么', sample: 'caught everyone off guard' },
    ],
  },
  {
    id: 'p14',
    name: '委婉表达不同意见',
    frame: ['I am not sure ', '{观点}', ' would ', '{动词原形}', ' …'],
    category: '从句连接',
    level: 'intermediate',
    zhThinking: '中文：「我不同意」或「这个不行」',
    why: '中文直说"不行"在很多场合并不算失礼，英语里直接否定容易被读成对抗。母语者把否定包一层：I\'m not sure … would work / I wonder if … 真正的反对意见藏在"不确定"里，但对方听得出来。',
    examples: [
      { en: 'I am not sure this timeline would work for us.', zh: '这个时间表对我们来说恐怕不太行。' },
      { en: 'I wonder if that approach would scale.', zh: '我有点怀疑那个做法能不能放大规模。' },
    ],
    slots: [
      { key: '观点', hint: '要反对的那个方案/说法', sample: 'a full rewrite' },
      { key: '动词原形', hint: 'would 后面跟动词原形', sample: 'solve' },
    ],
  },
  {
    id: 'p15',
    name: '目的状语（为了…）',
    frame: ['{主语 + 谓语}', ' in order to / so as to ', '{动词原形}', ' …'],
    category: '非谓语',
    level: 'beginner',
    zhThinking: '中文：「为了……我……」—— "为了"放句首也行',
    why: '中文的"为了"位置灵活，英语的 in order to / so as to 通常跟在主句后面；放句首要用 In order to …（so as to 不能放句首）。另外 to 后面永远是动词原形 —— 这是中国人高频错点。',
    examples: [
      { en: 'She re-read the contract twice in order to catch any trap.', zh: '她把合同读了两遍，就为了揪出陷阱。' },
      { en: 'In order to save time, we merged the two meetings.', zh: '为了省时间，我们把两个会合并了。' },
    ],
    slots: [
      { key: '动词原形', hint: 'to 后面必须是动词原形', sample: 'avoid' },
    ],
  },
];
