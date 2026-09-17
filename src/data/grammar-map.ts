import { GRAMMAR_EXTRA } from './grammar-map-extra';

// EXPORTS: IGrammarTopic, GRAMMAR_GROUPS, GRAMMAR_TOPICS
//
// 语法地图 —— 不按语法书的顺序讲，按「中文思维与英语结构的差异」组织。
//
// 为什么这样组织：中国学生语法书读过很多遍，错还是那几个 —— 因为错的地方不是
// 记不住的规则，而是中文里根本不存在的机制（时态变形、冠词、从句后置）。
// 所以每个条目先讲「本质一句话」，再讲「中文为什么在这里容易错」，最后才是规则细节。

/** 一个要点（规则里的一条，配例句） */
export interface IGrammarPoint {
  title: string;
  body: string;
  example?: { en: string; zh: string };
}

export interface IGrammarTopic {
  id: string;
  name: string;
  group: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  /** 本质一句话 —— 这条语法到底在解决什么问题 */
  essence: string;
  /** 中文思维的差异：为什么中国人在这里容易错 */
  zhGap: string;
  points: IGrammarPoint[];
  /** 高频中式错误（错 → 对 → 为什么） */
  pitfalls: { wrong: string; right: string; why: string }[];
  /** 关联的句型 id（跳去句型库练） */
  relatedPatterns?: string[];
}

export const GRAMMAR_GROUPS = [
  '句子骨架',
  '动词的形式',
  '从句体系',
  '非谓语与特殊结构',
  '中文没有的词类',
] as const;

const GRAMMAR_BASE: IGrammarTopic[] = [
  // ═══════════════ 句子骨架 ═══════════════
  {
    id: 'g01',
    name: '英语句子只有五种骨架',
    group: '句子骨架',
    level: 'beginner',
    essence: '不管句子多长，骨架一定是这五种之一；认出骨架，长句立刻变短。',
    zhGap: '中文句子可以没有主语（「下雨了」「很难说」），也可以把动词连起来用（「我去买菜」「他让我走」）。英语的谓语必须由主语领着，且一个句子只能有一个谓语。',
    points: [
      { title: '主 + 谓', body: '谓语是不及物动词，说完就完整。', example: { en: 'The baby slept.', zh: '婴儿睡了。' } },
      { title: '主 + 谓 + 宾', body: '谓语是及物动词，后面必须有承受者。', example: { en: 'She read the letter.', zh: '她读了那封信。' } },
      { title: '主 + 系 + 表', body: '系动词（be / become / seem / feel）后面是"是什么样"，不是"做什么"。', example: { en: 'The soup tastes salty.', zh: '这汤尝起来咸。' } },
      { title: '主 + 谓 + 双宾 / 主 + 谓 + 宾 + 补', body: '双宾给两个人东西（give sb sth）；宾补是"让宾语变成/处于某状态"。', example: { en: 'They elected her chair.', zh: '他们选她当主席。' } },
    ],
    pitfalls: [
      { wrong: 'I very like it.', right: 'I like it very much.', why: 'very 不能修饰动词，只能修饰形容词/副词 —— 中文「很」什么都能修饰。' },
      { wrong: 'There have many people.', right: 'There are many people.', why: '「有」表存在时用 there be，不用 have。' },
    ],
    relatedPatterns: ['p02'],
  },
  {
    id: 'g02',
    name: '主谓一致',
    group: '句子骨架',
    level: 'beginner',
    essence: '主语是单数还是复数，谓语必须跟着变 —— 这是英语的强制标记，中文没有。',
    zhGap: '中文的动词从不随主语变化（「我是、你是、他是」），所以中国人最容易漏掉第三人称单数的 -s 和 be 动词的正确形式。',
    points: [
      { title: '第三人称单数', body: '一般现在时里，主语是 he/she/it 或单数名词时，动词加 -s。', example: { en: 'He works from home.', zh: '他在家工作。' } },
      { title: '主语被修饰语拉长时要看中心词', body: '主语后面跟了 of 短语、定语从句时，谓语跟中心词一致，不跟最近的那个词。', example: { en: 'The list of names is long.', zh: '名单很长。（跟 list，不跟 names）' } },
      { title: 'there be 就近原则', body: 'there be 之后的第一个名词决定 be 的单复数。', example: { en: 'There is a pen and two books.', zh: '有一支笔和两本书。' } },
    ],
    pitfalls: [
      { wrong: 'He go to school every day.', right: 'He goes to school every day.', why: '第三人称单数忘加 -s —— 中文动词不变，所以最容易漏。' },
      { wrong: 'The number of students are growing.', right: 'The number of students is growing.', why: '中心词是 number（单数），不是 students。' },
    ],
  },

  // ═══════════════ 动词的形式 ═══════════════
  {
    id: 'g03',
    name: '时态的本质',
    group: '动词的形式',
    level: 'beginner',
    essence: '英语用「动词变形」表达时间，中文用「了 / 过 / 着 / 将 / 正在」这类小词。',
    zhGap: '中文的时间信息挂在助词上，动词本身永远不变；英语的时间信息刻在动词上，不写就错。而且英语时态是「时间 + 状态」两个维度交叉，不是一条直线。',
    points: [
      { title: '时间 × 状态 = 时态', body: '三个时间（过去/现在/将来）× 四个状态（一般/进行/完成/完成进行）。先想「什么时候」，再想「处于什么状态」。', example: { en: 'I was reading when he called.', zh: '他打电话时我正在看书。' } },
      { title: '一般现在时 ≠「现在」', body: '它表达的是习惯、事实、规律，而不是此刻正在发生。', example: { en: 'Water boils at 100°C.', zh: '水在 100 度沸腾。' } },
      { title: '时间状语从句里，将来要用现在时', body: 'if / when / as soon as / until 引导的从句中，不用 will。', example: { en: 'I will call you when I arrive.', zh: '我到了给你打电话。（不是 when I will arrive）' } },
    ],
    pitfalls: [
      { wrong: 'If it will rain tomorrow, we will cancel it.', right: 'If it rains tomorrow, we will cancel it.', why: '条件/时间状语从句里不能用 will —— 中文里「如果明天下雨」没有时态负担。' },
      { wrong: 'I have seen him yesterday.', right: 'I saw him yesterday.', why: '完成时不能和明确的过去时间点连用 —「他昨天」是过去某一刻，与"对现在的影响"无关。' },
    ],
  },
  {
    id: 'g04',
    name: '完成体：have done 到底在说什么',
    group: '动词的形式',
    level: 'intermediate',
    essence: 'have done 不表"做完了"，而表「到目前（或到那时）为止的累积，且对当下有影响」。',
    zhGap: '中文的「了」既表完成又表过去，所以中国人常把 have done 当成「过去的动作」。其实它的重心在**现在**。',
    points: [
      { title: '重心在现在', body: '说 have done 时，说话人关心的是「所以现在怎么样」。', example: { en: 'I have lost my keys.', zh: '我把钥匙丢了。（言下之意：现在进不去门）' } },
      { title: '与一般过去时的分工', body: '一般过去时只陈述过去发生的事，与现在切断；完成时把过去和现在连起来。', example: { en: 'I lost my keys yesterday.（只是陈述） vs I have lost my keys.（现在门开不了）', zh: '两句话做的事不一样。' } },
      { title: 'for / since 搭配完成时', body: '表示持续到现在的一段时间，用完成时而不是一般现在时。', example: { en: 'I have lived here for ten years.', zh: '我在这儿住了十年（现在还住着）。' } },
    ],
    pitfalls: [
      { wrong: 'I live here for ten years.', right: 'I have lived here for ten years.', why: '中文「住了十年」不区分是否持续到现在，英语必须靠时态说清。' },
      { wrong: 'I have finished it last week.', right: 'I finished it last week.', why: '有明确过去时间点，用一般过去时。' },
    ],
  },
  {
    id: 'g05',
    name: '被动语态：把施动者请出句子',
    group: '动词的形式',
    level: 'beginner',
    essence: '被动不是「正式」，而是当施动者不重要、不知道或不想说时，让它从句子里消失。',
    zhGap: '中文用「有人 / 大家 / 据说 / 被」含糊带过；英语把这件事做成结构：把受事提到主语位，动词变 be + 过去分词。',
    points: [
      { title: '结构与时态', body: 'be 负责时态，过去分词负责被动，两者组合出各种时态的被动。', example: { en: 'The bridge was built in 1990.', zh: '这座桥建于 1990 年。' } },
      { title: 'by 短语能省就省', body: '施动者若不是关键信息，by 短语直接不写。', example: { en: 'Mistakes were made.', zh: '确实犯了错（谁犯的不提）。' } },
      { title: '不能有被动的情况', body: '不及物动词（happen / appear / rise）没有被动；系动词也没有。', example: { en: 'The accident happened last night.', zh: '事故发生在昨晚。（不是 was happened）' } },
    ],
    pitfalls: [
      { wrong: 'The accident was happened yesterday.', right: 'The accident happened yesterday.', why: 'happen 是不及物动词，没有被动语态。' },
      { wrong: 'I was very interesting in the book.', right: 'I was very interested in the book.', why: '-ing 形容"令人……的"（物），-ed 形容"感到……的"（人）。' },
    ],
    relatedPatterns: ['p11'],
  },
  {
    id: 'g06',
    name: '虚拟语气：与事实相反必须换形式',
    group: '动词的形式',
    level: 'advanced',
    essence: '表达「与事实相反」时，英语用动词的特殊形式做标记 —— 形式变了，意思才是假设。',
    zhGap: '中文用词汇表达假设（本来、当初、要是、早就），动词不变。所以中国人说英语时往往形态照旧，听上去像在陈述事实。',
    points: [
      { title: '与现在相反', body: 'if 从句用过去式（be 用 were），主句用 would + 动词原形。', example: { en: 'If I were you, I would say no.', zh: '我要是你就拒绝了。' } },
      { title: '与过去相反', body: 'if 从句用 had done，主句用 would have done。', example: { en: 'If I had known, I would have called.', zh: '我要是早知道就打电话了。' } },
      { title: '省略 if 时倒装', body: 'Had it not been for… / Were I you… 更书面。', example: { en: 'Had I known, I would have called.', zh: '同上，更书面。' } },
    ],
    pitfalls: [
      { wrong: 'If I have time, I would help you.', right: 'If I had time, I would help you.', why: '中文「如果我有时间」不区分真实与假设，英语必须换形式。' },
      { wrong: 'If I would have known…', right: 'If I had known…', why: 'if 从句里不用 would，用过去完成。' },
    ],
    relatedPatterns: ['p10'],
  },

  // ═══════════════ 从句体系 ═══════════════
  {
    id: 'g07',
    name: '最大的语序差异：从句在英语里往后放',
    group: '从句体系',
    level: 'intermediate',
    essence: '中文把修饰放在名词**前面**，英语一旦修饰超过几个词，就必须挪到名词**后面**。',
    zhGap: '这是中国人读长句"读不懂"的首要原因：中文「我昨天在书店遇到的那个戴眼镜的人」把一大堆信息压在名词前；英语说 the man who was wearing glasses whom I met at the bookstore yesterday —— 一串挂在后面。',
    points: [
      { title: '短语可以前置，句子必须后置', body: 'a tall man（短语前置可以）vs the man who is tall（句子必须后置）。', example: { en: 'The book on the table is mine.', zh: '桌上的那本书是我的。' } },
      { title: '读到引导词就知道"后面在解释前面"', body: 'who / which / that / whose / where / when 一出现，立刻判断它修饰的是哪个名词。', example: { en: 'The idea that he proposed worked.', zh: '他提出的那个想法奏效了。' } },
      { title: '英语可以"挂很多层"，中文要拆句', body: '读的时候一层层剥，写的时候别一味堆叠 —— 母语者也常改用分词或另起一句。', example: { en: 'He lives in the house that his grandfather built where the river bends.', zh: '他住在河边那栋他祖父盖的房子里。' } },
    ],
    pitfalls: [
      { wrong: 'I met the man who he is my teacher.', right: 'I met the man who is my teacher.', why: '关系代词本身作从句主语，不能再加 he。' },
      { wrong: 'The book I bought it yesterday is good.', right: 'The book I bought yesterday is good.', why: '从句的宾语已经被关系代词代替，不能再加 it。' },
    ],
    relatedPatterns: ['p07', 'p12'],
  },
  {
    id: 'g08',
    name: '定语从句：关系词怎么选、什么时候能省',
    group: '从句体系',
    level: 'intermediate',
    essence: '关系词在从句里**充当成分**：充当主语就不能省，充当宾语可以省。',
    zhGap: '中文没有关系词，直接连着说；英语必须用关系词把两句"焊"在一起，而且选哪个由「先行词是人还是物」「在从句里做什么」两个问题决定。',
    points: [
      { title: '先判断先行词是人还是物', body: '人用 who / whom / whose，物用 which / that。', example: { en: 'The girl who called you is my sister.', zh: '给你打电话的那个女孩是我妹妹。' } },
      { title: '再看关系词在从句里做什么', body: '作主语不能省；作宾语在口语里常省；作定语用 whose。', example: { en: 'The man (whom) we met is a doctor.', zh: '我们见到的那个人是医生。' } },
      { title: '非限制性从句用逗号隔开、不用 that', body: '非限制性从句只是补充信息，去掉句子仍成立。', example: { en: 'My brother, who lives in Tokyo, is visiting.', zh: '我哥哥（他住在东京）来看我了。' } },
    ],
    pitfalls: [
      { wrong: 'The house which I live in it is big.', right: 'The house which I live in is big.', why: '关系代词已代指 the house，不能再加 it。' },
      { wrong: 'My father, that is a teacher, likes reading.', right: 'My father, who is a teacher, likes reading.', why: '非限制性定语从句不能用 that。' },
    ],
    relatedPatterns: ['p07'],
  },
  {
    id: 'g09',
    name: '名词性从句：整个句子当名词用',
    group: '从句体系',
    level: 'advanced',
    essence: '一句话可以整体当作主语、宾语、表语或同位语 —— 这是英语把复杂信息装进句子的主要手段。',
    zhGap: '中文的「他说的话」「他说的那件事」用名词化处理；英语直接放个从句进去，读者要能立刻判断这个从句在句中"扮演什么角色"。',
    points: [
      { title: '主语从句', body: '句子当主语，常用 it 占位、把从句后置。', example: { en: 'It matters that you showed up.', zh: '重要的是你来了。' } },
      { title: '宾语从句', body: '最常见，注意从句用陈述语序，不用疑问语序。', example: { en: 'I wonder where he went.', zh: '我想知道他去了哪。（不是 where did he go）' } },
      { title: '同位语从句', body: '解释前面抽象名词（fact / idea / news / belief）的内容，that 不能省。', example: { en: 'The fact that she lied hurt him.', zh: '她撒谎这件事伤到了他。' } },
    ],
    pitfalls: [
      { wrong: 'I wonder where did he go.', right: 'I wonder where he went.', why: '从句一律用陈述语序 —— 中文「他去了哪」本来就不倒装。' },
      { wrong: 'The fact she lied hurt him.', right: 'The fact that she lied hurt him.', why: '同位语从句的 that 不能省（与定语从句不同）。' },
    ],
    relatedPatterns: ['p01'],
  },
  {
    id: 'g10',
    name: '状语从句：中文成对，英语只留一个',
    group: '从句体系',
    level: 'beginner',
    essence: '时间、原因、条件、让步、结果 —— 每种关系一个引导词，且**只能用一个**。',
    zhGap: '中文的关联词是成对的（虽然…但是、因为…所以、除非…否则），英语绝不成对：用了 although 就不能再用 but，用了 because 就不能再用 so。这是最高频的中式错误。',
    points: [
      { title: '让步', body: 'although / though / even though / while 引出让步，主句不再加 but。', example: { en: 'Although it rained, we went out.', zh: '虽然下雨，我们还是出去了。' } },
      { title: '原因与结果', body: 'because 引原因，so 引结果 —— 二者分开用，不同现。', example: { en: 'It rained, so we stayed in.', zh: '下雨了，所以我们待在家。' } },
      { title: '时间与条件', body: 'when / while / as soon as / until / if / unless；注意这些从句里不用 will。', example: { en: 'Call me as soon as you get there.', zh: '你一到就给我打电话。' } },
    ],
    pitfalls: [
      { wrong: 'Although he is rich, but he is unhappy.', right: 'Although he is rich, he is unhappy.', why: 'although 与 but 不同现 —— 中文「虽然…但是」必须成对。' },
      { wrong: 'Because it was late, so we left.', right: 'Because it was late, we left.', why: 'because 与 so 不同现。' },
    ],
    relatedPatterns: ['p05', 'p06'],
  },

  // ═══════════════ 非谓语与特殊结构 ═══════════════
  {
    id: 'g11',
    name: '非谓语三兄弟：to do / doing / done',
    group: '非谓语与特殊结构',
    level: 'advanced',
    essence: '一个句子只能有一个谓语 —— 多出来的动作必须"降级"成非谓语。',
    zhGap: '中文可以把动词连着排（「他去买菜」「我喜欢游泳」「被打败的军队」），英语必须选一个当谓语，其余降级；选 to do 还是 doing 还是 done，取决于它跟主语的关系和表达的意思。',
    points: [
      { title: 'to do：未做、目的、一次性', body: '常表目的或将要发生，也可作某些动词的宾语（want / decide / hope）。', example: { en: 'I stopped to smoke.', zh: '我停下来，去抽烟（停下来是为了抽）。' } },
      { title: 'doing：正在、主动、习惯', body: '主动且进行中，或表示一贯的行为（enjoy / avoid / mind）。', example: { en: 'I stopped smoking.', zh: '我戒烟了（停止抽烟这件事）。' } },
      { title: 'done：被动、完成', body: '与逻辑主语是被动关系，或已完成的动作。', example: { en: 'Seen from above, the city looks like a grid.', zh: '从高处看，这座城市像网格。' } },
    ],
    pitfalls: [
      { wrong: 'I look forward to meet you.', right: 'I look forward to meeting you.', why: '这里 to 是介词，后面接动名词 —— 中文「期待见到你」看不出区别。' },
      { wrong: 'The movie is very excited.', right: 'The movie is very exciting.', why: '物用 -ing（令人…的），人用 -ed（感到…的）。' },
    ],
    relatedPatterns: ['p08', 'p15'],
  },
  {
    id: 'g12',
    name: '强调句与倒装：把重点顶到句首',
    group: '非谓语与特殊结构',
    level: 'advanced',
    essence: '英语靠**结构**制造重点：强调用 It is … that…，否定提前则主谓倒装。',
    zhGap: '中文用「正是」「就是」加重音就能强调，不需要改结构。英语在书面上必须改结构，否则读者感受不到重点。',
    points: [
      { title: '强调句 It is … that …', body: '把要强调的成分夹在中间，其余照原样跟在 that 后。', example: { en: 'It was the silence that scared me.', zh: '让我害怕的是那份沉默。' } },
      { title: '否定词提前 → 部分倒装', body: 'Never / Rarely / Not only / Little 放句首，后面变成疑问语序。', example: { en: 'Never have I seen such a mess.', zh: '我从没见过这么乱的样子。' } },
      { title: '地点状语提前 → 完全倒装', body: 'In the room sat an old man.（文学/描写里常见）', example: { en: 'Down went Alice after it.', zh: '爱丽丝跟着跳了下去。' } },
    ],
    pitfalls: [
      { wrong: 'Never I have seen such a thing.', right: 'Never have I seen such a thing.', why: '否定词提前必须倒装，不能直接照中文语序。' },
      { wrong: 'It is I that am wrong.', right: 'It is I who am wrong.', why: '被强调的是"人"时，规范用法用 who（口语里 that 也能接受）。' },
    ],
    relatedPatterns: ['p03', 'p09'],
  },

  // ═══════════════ 中文没有的词类 ═══════════════
  {
    id: 'g13',
    name: '冠词 a / the / 零冠词',
    group: '中文没有的词类',
    level: 'beginner',
    essence: '冠词是英语的「已知 / 未知」标记：听的人能不能确定是哪一个。',
    zhGap: '中文没有冠词这个概念，名词直接说（「我买了书」「书在桌上」）。所以中国学生要么全漏，要么乱加，而母语者一耳朵就能听出问题。',
    points: [
      { title: 'a/an = 听的人不知道是哪一个', body: '第一次提到、任意一个。', example: { en: 'I bought a book.', zh: '我买了本书（哪本不重要）。' } },
      { title: 'the = 听的人能确定', body: '第二次提到、唯一、或双方都清楚的那个。', example: { en: 'The book is on the table.', zh: '那本书在桌上。' } },
      { title: '零冠词：泛指复数与不可数', body: '泛指的一类事物不加冠词。', example: { en: 'Books are expensive.', zh: '书很贵（泛指）。' } },
    ],
    pitfalls: [
      { wrong: 'I like the music.', right: 'I like music.', why: '泛指「音乐」这一类时，不加 the。' },
      { wrong: 'He is teacher.', right: 'He is a teacher.', why: '单数可数名词不能"裸奔"，必须带冠词或限定词。' },
    ],
  },
  {
    id: 'g14',
    name: '介词：中文用动词，英语用介词',
    group: '中文没有的词类',
    level: 'intermediate',
    essence: '英语用介词表达中文用动词表达的关系（等 / 靠 / 找 / 借 / 属于…）。',
    zhGap: '中文「我等你」「我靠这个活着」，动词直接连；英语必须挂介词且**动词与介词是固定搭配**，一个动词换介词意思就变。所以介词只能连搭配一起记，不能按中文硬译。',
    points: [
      { title: '动介搭配要整块记', body: 'depend on / rely on / arrive at / consist of / refer to —— 换介词就换意思。', example: { en: 'It depends on the weather.', zh: '取决于天气。' } },
      { title: '表达"关于、对于"用 to / for', body: 'the answer to / the key to / a solution to（不是 of）。', example: { en: 'This is the key to success.', zh: '这是成功的关键。' } },
      { title: '时间介词 at / on / in 由大到小', body: 'at 具体时刻，on 具体某天，in 月/年/季节/较长时段。', example: { en: 'at 7 p.m. / on Monday / in July', zh: '三个尺度三个介词。' } },
    ],
    pitfalls: [
      { wrong: 'I will wait you here.', right: 'I will wait for you here.', why: 'wait 后面必须接 for —— 中文「等你」不需要介词。' },
      { wrong: 'It depends of the weather.', right: 'It depends on the weather.', why: 'depend 后面固定接 on。' },
    ],
  },
  {
    id: 'g15',
    name: '代词指代必须明确',
    group: '中文没有的词类',
    level: 'intermediate',
    essence: 'it / they / one / this 指谁必须一读就明白，且数要一致。',
    zhGap: '中文可以省略主语和宾语（「找到了」「给他了」），指代靠语境；英语句子成分不省略，代词必须出现且指代清楚 —— 中文习惯省略，英语却因此出现一堆含糊的 it。',
    points: [
      { title: '数必须一致', body: '单数用 it，复数用 they/them，不能混。', example: { en: 'The keys? I left them on the desk.', zh: '钥匙？我放桌上了。' } },
      { title: 'one 替代同类名词', body: '避免重复：a red one / the ones I bought。', example: { en: 'I need a pen — a blue one.', zh: '我要支笔——蓝色的。' } },
      { title: '不要造"悬空 it"', body: 'it 必须有明确所指，否则改用具体名词。', example: { en: 'The plan failed. This surprised everyone.', zh: '计划失败了，这让所有人意外。' } },
    ],
    pitfalls: [
      { wrong: 'The keys? I left it on the desk.', right: 'The keys? I left them on the desk.', why: '复数名词必须用 them —— 中文「它」不分单复数，所以最容易漏。' },
      { wrong: 'I like the red one and the blue.', right: 'I like the red one and the blue one.', why: '替代名词的 one 不能随意省略。' },
    ],
  },
  {
    id: 'g16',
    name: '比较结构：不对等就说不出口',
    group: '中文没有的词类',
    level: 'intermediate',
    essence: 'than 两边的成分必须"同类对等"，否则句子在逻辑上就错了。',
    zhGap: '中文「我的英语比你好」说不清是"英语"在比还是"你"在比，也不觉得有问题。英语必须补齐，让两边比较的是同一样东西。',
    points: [
      { title: '比较对象要对等', body: '相比的必须是同一类成分，常需用 that of / those of 补回被比较的名词。', example: { en: 'My English is better than that of my brother.', zh: '我的英语比我哥（的英语）好。' } },
      { title: '最高级要有比较范围', body: 'the best 后面常接 in / of 短语说明范围。', example: { en: 'She is the fastest in the team.', zh: '她是队里最快的。' } },
      { title: '倍数与程度的位置', body: 'twice as … as / three times more … than，语序固定。', example: { en: 'This room is twice as big as that one.', zh: '这个房间是那个的两倍大。' } },
    ],
    pitfalls: [
      { wrong: 'My English is better than you.', right: 'My English is better than yours.', why: '比的是"英语"，不是"你" —— 中文省略后看不出来。' },
      { wrong: 'He is more taller than me.', right: 'He is taller than me.', why: 'more 与 -er 不能同时用。' },
    ],
    relatedPatterns: ['p04'],
  },
];

/** 基础 16 条 + 补篇 14 条（按中文思维差异组织，非语法书顺序） */
export const GRAMMAR_TOPICS: IGrammarTopic[] = [...GRAMMAR_BASE, ...GRAMMAR_EXTRA];
