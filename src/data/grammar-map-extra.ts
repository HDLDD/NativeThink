// EXPORTS: GRAMMAR_EXTRA
//
// 语法地图补篇 —— 与 grammar-map.ts 的 16 条合并为完整体系（共 30 条）。
// 补的这批集中在「动词的时间细节」「限定词与名词」「位置与语序」「引语与连接」四类，
// 都是前 16 条没有覆盖到、但中国学习者高频踩坑的地方。

import type { IGrammarTopic } from './grammar-map';

export const GRAMMAR_EXTRA: IGrammarTopic[] = [
  // ═══════════════ 动词的形式（续） ═══════════════
  {
    id: 'g17',
    name: '进行时：不是「正在」，而是「临时、未完成」',
    group: '动词的形式',
    level: 'beginner',
    essence: 'be + doing 表示动作在某个时间点上处于「进行中」，强调的是过程的暂时性与未完成。',
    zhGap: '中文的「在」「着」可以加在任何动词上，也可以不加（「我吃饭」既可以是习惯也可以是正在进行）。英语必须选：一般时表示习惯/事实，进行时表示此刻正在进行 —— 选错了意思就变了。',
    points: [
      { title: '与一般时的分工', body: '一般时＝常态；进行时＝此刻/暂时。', example: { en: 'I work in Shanghai.（长期） vs I am working in Shanghai this month.（临时）', zh: '两句的时间感完全不同。' } },
      { title: '有些动词几乎不用进行时', body: '表示状态而非动作的动词：know / like / belong / consist / seem。', example: { en: 'I know the answer.', zh: '我知道答案（不能说 I am knowing）。' } },
      { title: '进行时也能表达将来', body: '已安排好的近期计划常用进行时。', example: { en: 'I am meeting her tomorrow.', zh: '我明天要见她（已约好）。' } },
    ],
    pitfalls: [
      { wrong: 'I am knowing him for three years.', right: 'I have known him for three years.', why: 'know 是状态动词，且「持续三年到现在」要用完成时。' },
      { wrong: 'Look! He crosses the street.', right: 'Look! He is crossing the street.', why: '此刻正在发生，必须用进行时 —— 中文「他过马路」不带时态标记。' },
    ],
  },
  {
    id: 'g18',
    name: '将来时的四种说法',
    group: '动词的形式',
    level: 'intermediate',
    essence: '英语没有单一的「将来时」，will / 进行时 / be going to / 一般现在各有分工。',
    zhGap: '中文一个「会」「要」「将」就够了，英语要按「是临时决定、已有计划、还是时刻表」来选形式。中国人最常用 will 包打天下，听上去生硬。',
    points: [
      { title: 'will：临时决定与承诺', body: '说话当下才决定的，或表示意愿/承诺。', example: { en: 'The phone is ringing. — I will get it.', zh: '我去接（现决定的）。' } },
      { title: 'be going to：已有打算或明显迹象', body: '提前计划好的，或有证据表明要发生。', example: { en: 'Look at those clouds — it is going to rain.', zh: '看那云，要下雨了。' } },
      { title: '进行时 / 一般现在：安排与日程', body: '约定好的用进行时；时刻表用一般现在。', example: { en: 'The train leaves at 7.', zh: '火车七点开（时刻表）。' } },
    ],
    pitfalls: [
      { wrong: 'I will meet my dentist tomorrow at 3. We decided last week.', right: 'I am meeting my dentist tomorrow at 3.', why: '早就约好的安排用进行时，will 读起来像"临时才决定"。' },
      { wrong: 'If it will be fine tomorrow, we will go.', right: 'If it is fine tomorrow, we will go.', why: '条件从句里不用将来时。' },
    ],
  },
  {
    id: 'g19',
    name: '过去完成：过去的过去',
    group: '动词的形式',
    level: 'advanced',
    essence: 'had done 用来把两件过去的事排先后 —— 更早的那件用过去完成。',
    zhGap: '中文用「已经」「之前」「早就」这类词表示先后，动词不变形。英语要靠时态把顺序锁死，否则听的人不知道哪件先发生。',
    points: [
      { title: '两件过去的事，先发生的用 had done', body: '后发生的用一般过去时。', example: { en: 'When I arrived, the film had started.', zh: '我到的时候电影已经开演了。' } },
      { title: 'before / after 已表明顺序时可不必用', body: '从句本身交代了先后，简单过去时也成立。', example: { en: 'After he left, I went to bed.', zh: '他走后我就睡了。' } },
      { title: '常见搭配', body: 'by the time / already / never … before 常配过去完成。', example: { en: 'By the time we got there, they had left.', zh: '我们到那儿时他们已经走了。' } },
    ],
    pitfalls: [
      { wrong: 'When I arrived, the film started.', right: 'When I arrived, the film had started.', why: '「已经开演」说明开演在前，必须用过去完成，否则读成同时发生。' },
      { wrong: 'I had seen him yesterday.', right: 'I saw him yesterday.', why: '只有一件事、且时间明确，不需要过去完成。' },
    ],
  },
  {
    id: 'g20',
    name: '情态动词：推测与义务',
    group: '动词的形式',
    level: 'intermediate',
    essence: '情态动词不表时间，表「说话人对这件事的态度」：可能性多大、是否有义务。',
    zhGap: '中文用「可能、应该、必须、大概」这些副词表达，英语用 must / might / can\'t 这类词，而且**不同确定度用不同词**，用错就成了另一种意思。',
    points: [
      { title: '推测的确定度阶梯', body: 'must（几乎肯定）> should（理应）> may/might/could（也许）> can\'t（肯定不）。', example: { en: 'He must be tired. / He might be tired. / He can\'t be tired.', zh: '三种确定度。' } },
      { title: '对过去的推测', body: '情态动词 + have done。', example: { en: 'She must have missed the train.', zh: '她一定是没赶上火车。' } },
      { title: '义务与建议', body: 'must（主观必须）/ have to（客观不得不）/ should（应该）/ had better（最好）。', example: { en: 'I have to wear a uniform at work.', zh: '上班必须穿制服（规定如此）。' } },
    ],
    pitfalls: [
      { wrong: 'He can be at home now, the light is on.', right: 'He must be at home now, the light is on.', why: '有证据的推断用 must，can 不表这种肯定推测。' },
      { wrong: 'You mustn\'t have seen him.', right: 'You can\'t have seen him.', why: '否定推测用 can\'t have done，mustn\'t 表示禁止。' },
    ],
  },

  // ═══════════════ 句子骨架（续） ═══════════════
  {
    id: 'g21',
    name: 'it 的三个用途',
    group: '句子骨架',
    level: 'beginner',
    essence: 'it 不只是「它」：它还能占主语位、占宾语位，承载真正的内容在句尾。',
    zhGap: '中文没有「形式主语」这个概念（「很难说清」直接开头），所以中国人写英语时常把长主语硬放在句首，句子头重脚轻。',
    points: [
      { title: '指代具体事物', body: '最基础的用法，注意单复数（复数用 they）。', example: { en: 'I found your key — it was under the sofa.', zh: '钥匙我找到了，在沙发底下。' } },
      { title: '形式主语', body: '真正的主语（to do / that 从句）后置。', example: { en: 'It is hard to say no.', zh: '拒绝很难。' } },
      { title: '形式宾语', body: '动词后的 it 占位，真正的宾语在后面。', example: { en: 'I find it hard to say no.', zh: '我发现拒绝很难。' } },
      { title: '非人称用法（天气/时间/距离）', body: '中文常省略主语，英语必须补 it。', example: { en: 'It is raining. / It is 8 o\'clock. / It is a long way.', zh: '下雨了 / 八点了 / 路很远。' } },
    ],
    pitfalls: [
      { wrong: 'Is very important to practice every day.', right: 'It is very important to practice every day.', why: '中文可以没有主语（「很重要」），英语必须补形式主语 it。' },
      { wrong: 'I found difficult to understand him.', right: 'I found it difficult to understand him.', why: '复合宾语需要 it 占位（find it + 形容词 + to do）。' },
    ],
    relatedPatterns: ['p01'],
  },
  {
    id: 'g22',
    name: 'There be 的细节',
    group: '句子骨架',
    level: 'beginner',
    essence: 'There be 说的是「某处存在什么」，不是「谁拥有什么」。',
    zhGap: '中文一个「有」字既表拥有又表存在，所以「桌上有本书」容易写成 The table has a book。英语把这两件事分得干干净净。',
    points: [
      { title: '存在 vs 拥有', body: '存在用 there be；拥有用 have。', example: { en: 'There is a book on the table. / The table has four legs.', zh: '前句是存在，后句是桌子的一部分。' } },
      { title: '时态跟着 be 变', body: 'there was / there have been / there will be。', example: { en: 'There have been several complaints.', zh: '已经有好几起投诉了。' } },
      { title: 'there be 后面常接定语从句', body: '从句的关系代词在从句里作主语时，常可省略。', example: { en: 'There is a man (who) wants to see you.', zh: '有人想见你。' } },
    ],
    pitfalls: [
      { wrong: 'There have a lot of people.', right: 'There are a lot of people.', why: 'there be 的谓语只能是 be，不能换成 have。' },
      { wrong: 'There is many reasons.', right: 'There are many reasons.', why: '就近一致：be 跟后面第一个名词的数一致。' },
    ],
    relatedPatterns: ['p02'],
  },

  // ═══════════════ 中文没有的词类（续） ═══════════════
  {
    id: 'g23',
    name: '名词的数与量词',
    group: '中文没有的词类',
    level: 'beginner',
    essence: '英语名词分可数与不可数：可数有单复数，不可数永远单数且不能直接加数字。',
    zhGap: '中文名词基本不变形（「一本书」和「三本书」的「书」一样），量词丰富且通用（个、只、张、条）。英语必须记住哪些词不可数，并用 a piece of 这类结构去量化 —— 而中文的量词不能直接翻译成 piece。',
    points: [
      { title: '常见不可数名词', body: 'information / advice / furniture / equipment / luggage / news / research。它们没有复数，也不能加 a。', example: { en: 'She gave me some useful advice.', zh: '她给了我一些有用的建议。' } },
      { title: '量化要用容器/单位词', body: 'a piece of / a bit of / an item of / a slice of。', example: { en: 'two pieces of luggage / three items of equipment', zh: '两件行李 / 三件设备。' } },
      { title: '注意特殊复数', body: 'people（不是 peoples）、children、data 常作单数集合用。', example: { en: 'The data suggests a clear trend.', zh: '数据表明趋势明显。' } },
    ],
    pitfalls: [
      { wrong: 'I need some informations.', right: 'I need some information.', why: 'information 不可数，没有复数形式。' },
      { wrong: 'an advice', right: 'a piece of advice', why: 'advice 不可数，要用单位词量化。' },
    ],
  },
  {
    id: 'g24',
    name: '限定词：some / any，few / little',
    group: '中文没有的词类',
    level: 'intermediate',
    essence: '限定词在名词前标明「多少、哪个、是否确定」，选择取决于句型与名词的可数性。',
    zhGap: '中文的「一些」「几个」「一点」不区分可数与不可数，也不区分肯定与否定句。英语里 some/any、few/little 各有条件，用错会显得别扭。',
    points: [
      { title: 'some 用于肯定，any 用于否定与疑问', body: '但期待肯定回答的疑问句也用 some。', example: { en: 'Would you like some coffee?', zh: '要来点咖啡吗（预期你说好）。' } },
      { title: 'few 与 little 的分工', body: 'few 修饰可数，little 修饰不可数；加 a 意思反转：a few = 有几个（够），few = 很少（不够）。', example: { en: 'I have a few friends here.（有几个） vs I have few friends here.（几乎没朋友）', zh: '一字之差，含义相反。' } },
      { title: 'each / every / all', body: 'each 强调个体（可单独用），every 强调整体（后接单数名词）。', example: { en: 'Each student has a locker. / Every student has a locker.', zh: '用法相似，语气不同。' } },
    ],
    pitfalls: [
      { wrong: 'I have little books to read.', right: 'I have few books to read.', why: 'books 可数，用 few。' },
      { wrong: 'Every students must attend.', right: 'Every student must attend.', why: 'every 后面跟单数名词。' },
    ],
  },
  {
    id: 'g25',
    name: '形容词与副词的位置',
    group: '中文没有的词类',
    level: 'intermediate',
    essence: '形容词放名词前（或系动词后），副词位置随种类而定 —— 位置错了句子就不自然。',
    zhGap: '中文的「很漂亮的一个女孩」和英语 a very pretty girl 顺序相反（英语把限定词、评价、大小、形状、新旧、颜色依次排列）；副词更麻烦：中文副词常在动词前，英语的频率副词却插在助动词与实义动词之间。',
    points: [
      { title: '多个形容词的顺序', body: '限定词 → 评价 → 大小 → 形状 → 年龄 → 颜色 → 国籍 → 材料。', example: { en: 'a lovely little old round brown French wooden table', zh: '顺序固定，不能随意调换。' } },
      { title: '频率副词的位置', body: '放在助动词/be 之后、实义动词之前。', example: { en: 'I have never been there. / She always arrives early.', zh: '两个位置常被搞混。' } },
      { title: 'enough 的位置特殊', body: '修饰形容词时后置，修饰名词时前置。', example: { en: 'good enough / enough time', zh: '一个在后一个在前。' } },
    ],
    pitfalls: [
      { wrong: 'He speaks very well English.', right: 'He speaks English very well.', why: 'well 修饰动词，放句尾；English 是宾语须紧跟动词。' },
      { wrong: 'I like very much this book.', right: 'I like this book very much.', why: 'very much 通常在宾语之后。' },
    ],
  },
  {
    id: 'g26',
    name: '使役与感官动词',
    group: '动词的形式',
    level: 'intermediate',
    essence: '「让某人做某事」和「看到某人做某事」这两类动词后面接的是**动词原形或 -ing**，不加 to。',
    zhGap: '中文「让他走」「看他走过去」动词直接连用，没有 to 的问题。英语这类动词（make/let/have、see/hear/watch/feel）后面接**不带 to 的不定式**，这是规则例外，只能记。',
    points: [
      { title: '使役：make / let / have + 人 + 动词原形', body: 'get 是例外，要加 to。', example: { en: 'The teacher made him rewrite it. / I got him to rewrite it.', zh: 'make 不加 to，get 要加。' } },
      { title: '感官：see / hear / watch + 人 + do 或 doing', body: 'do 表完整动作，doing 表动作正在进行。', example: { en: 'I saw him cross the street.（整个过程） vs I saw him crossing the street.（正在过）', zh: '意思有差别。' } },
      { title: '变被动后 to 要补回来', body: '使役/感官动词变被动时，后面的 to 必须出现。', example: { en: 'He was made to rewrite it.', zh: '被动里 to 回来了。' } },
    ],
    pitfalls: [
      { wrong: 'My parents let me to go out.', right: 'My parents let me go out.', why: 'let 后面接不带 to 的不定式。' },
      { wrong: 'I heard her to sing.', right: 'I heard her sing.', why: '感官动词后同样不带 to。' },
    ],
  },

  // ═══════════════ 从句体系（续） ═══════════════
  {
    id: 'g27',
    name: '直接引语变间接引语',
    group: '从句体系',
    level: 'advanced',
    essence: '转述别人的话时，时态要「后退一步」，人称与时间地点词也要跟着调整。',
    zhGap: '中文转述几乎不变（他说他明天来 —— 时间词照旧）。英语必须把时态后退（will → would、is → was），还要改时间状语（tomorrow → the next day），否则听起来像是在重复原话。',
    points: [
      { title: '时态后退', body: '主句是过去时，从句时态整体后移一格。', example: { en: 'He said he would come.', zh: '他说他会来（原话 I will come）。' } },
      { title: '人称与指示词调整', body: 'this → that，here → there，today → that day。', example: { en: 'She said she had seen him the day before.', zh: '她说她前一天见过他。' } },
      { title: '客观真理不后退', body: '表达事实/真理的从句仍用一般现在时。', example: { en: 'He said the earth goes around the sun.', zh: '这个不变。' } },
    ],
    pitfalls: [
      { wrong: 'He said he will come tomorrow.', right: 'He said he would come the next day.', why: '时态与时间状语都要后退。' },
      { wrong: 'She asked what was I doing.', right: 'She asked what I was doing.', why: '间接疑问句用陈述语序。' },
    ],
  },
  {
    id: 'g28',
    name: '连接副词不是连词',
    group: '从句体系',
    level: 'advanced',
    essence: 'however / therefore / moreover 是副词，**不能**像 and / but 那样连接两个句子。',
    zhGap: '中文的「然而」「因此」直接放在句首就能连接两句，所以中国人写 however, ... 时以为已经连上了，结果造出逗号拼接句（comma splice），这是中式英语最典型的书面错误之一。',
    points: [
      { title: '连接副词需要分号或句号', body: '用分号连接，或另起一句。', example: { en: 'It rained; however, we went out. / It rained. However, we went out.', zh: '两种都对；用逗号错。' } },
      { title: '真正的连词只有那几个', body: 'and / but / or / so / yet / for 可以只用逗号连接句子。', example: { en: 'It rained, but we went out.', zh: 'but 是连词，逗号即可。' } },
      { title: '常见连接副词', body: 'however / therefore / moreover / nevertheless / otherwise / besides。', example: { en: 'He was late; therefore, he missed the start.', zh: '注意分号。' } },
    ],
    pitfalls: [
      { wrong: 'It rained, however we went out.', right: 'It rained; however, we went out.', why: 'however 不是连词，不能只靠逗号连接两个句子。' },
      { wrong: 'Because it rained, so we stayed.', right: 'Because it rained, we stayed.', why: 'because 与 so 不同现。' },
    ],
  },

  // ═══════════════ 句子骨架（续·问句与词性） ═══════════════
  {
    id: 'g29',
    name: '反意疑问句',
    group: '句子骨架',
    level: 'intermediate',
    essence: '陈述句后面加一个简短问句求确认：前面肯定用否定，前面否定用肯定。',
    zhGap: '中文用「是吧？」「对吧？」「好不好？」放在句尾，与前面的肯定否定无关。英语必须**前后相反**，而且助动词要与前面一致 —— 这一步中国人经常忘。',
    points: [
      { title: '前肯后否，前否后肯', body: '并重复前面的助动词。', example: { en: 'You are coming, aren\'t you? / You aren\'t coming, are you?', zh: '前后必然相反。' } },
      { title: '没有助动词时借用 do', body: '一般现在/过去时用 do/does/did。', example: { en: 'She likes coffee, doesn\'t she?', zh: '借 doesn\'t。' } },
      { title: '回答用事实，不用中文习惯', body: 'Yes 后面一定跟肯定，No 后面一定跟否定。', example: { en: 'You aren\'t coming, are you? — No, I\'m not. / Yes, I am.', zh: '中文的「对，我不去」在英语里是 No。' } },
    ],
    pitfalls: [
      { wrong: 'You are a student, isn\'t it?', right: 'You are a student, aren\'t you?', why: '助动词与主语必须与前面一致。' },
      { wrong: 'You don\'t like it, don\'t you?', right: 'You don\'t like it, do you?', why: '前面已是否定，后面必须用肯定。' },
    ],
  },
  {
    id: 'g30',
    name: '句子成分与词性：拆句的地基',
    group: '句子骨架',
    level: 'beginner',
    essence: '认出每个词在句中充当什么成分（主谓宾定状补），是读懂长句和写对句子的共同前提。',
    zhGap: '中文的词性与成分关系松散（同一个词既能当动词也能当名词，且没有形态变化）。英语靠**词形**标记词性（-tion 是名词、-ly 是副词），认不出词性就认不出成分，长句立刻失控。',
    points: [
      { title: '先看词尾判断词性', body: '-tion/-ment/-ness 多为名词；-ly 多为副词；-ful/-ive/-ous 多为形容词。', example: { en: 'decision (n.) / decide (v.) / decisive (adj.) / decisively (adv.)', zh: '同一个词根四种词性。' } },
      { title: '再问它在句中做什么', body: '名词常作主语/宾语，形容词修饰名词，副词修饰动词或整句。', example: { en: 'The rapid growth surprised everyone.', zh: 'rapid 修饰 growth（定语），surprised 是谓语。' } },
      { title: '一个句子只有一个谓语', body: '多出来的动词要降级为非谓语（to do / doing / done）。', example: { en: 'He sat by the window, reading a letter.', zh: 'reading 不是第二个谓语。' } },
    ],
    pitfalls: [
      { wrong: 'I very like this movie.', right: 'I really like this movie.', why: 'very 是形容词性副词，不能修饰动词；修饰动词用 really/very much。' },
      { wrong: 'His decide surprised us.', right: 'His decision surprised us.', why: '主语位置需要名词形式，不能直接放动词。' },
    ],
    relatedPatterns: ['p13'],
  },
];
