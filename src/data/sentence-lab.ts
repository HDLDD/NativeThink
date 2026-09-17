import { SENTENCE_LAB_EXTRA } from './sentence-lab-extra';

// EXPORTS: ISentenceSegment, ISentenceLabItem, SENTENCE_LAB, READ_STEPS
//
// 拆句语料 —— 全部取自站内已有的公版书全文（public/books/*.txt），逐句核验过原文，
// 出处真实可查。标注（意群切分 / 主干 / 修饰挂载）是这套方法的灵魂：
// 母语者读长句不是逐词翻译，而是「先抓主干，再把修饰挂回去」。

/** 一个意群 */
export interface ISentenceSegment {
  /** 原文片段（按顺序拼接必须等于整句，用整句做下标回填） */
  t: string;
  /**
   * core = 主干（谁 + 做了什么，缺了句子就不成立）
   * mod  = 修饰（定语/状语/同位语，去掉句子仍成立）
   * conn = 连接（从句引导词、插入语标记）
   */
  r: 'core' | 'mod' | 'conn';
  /** 这块是什么、修饰谁 —— 揭晓时才显示 */
  note?: string;
}

export interface ISentenceLabItem {
  id: string;
  /** 英文原句 */
  en: string;
  /** 中文 */
  zh: string;
  /** 出处（书名 + 章节线索） */
  source: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  /** 一句话点破这句该怎么读 */
  tip: string;
  /** 只读主干会得到什么（把长句压成一句简单句） */
  backboneGloss: string;
  segments: ISentenceSegment[];
}

/** 三步读句法 —— 页面上作为方法说明展示，也是交互顺序 */
export const READ_STEPS = [
  { n: 1, name: '找动词', desc: '先找出句子里所有的谓语动词，有几个动词就可能有几个"小句子"' },
  { n: 2, name: '定主干', desc: '问"谁 + 做了什么"——主干是句子的骨架，其余都是挂在它上面的' },
  { n: 3, name: '切意群', desc: '按语块边界（介词短语 / 从句 / 非谓语）切开，一块一块理解' },
] as const;

const SENTENCE_LAB_BOOKS: ISentenceLabItem[] = [
  // ═══════════════ 入门：主干清晰，只有一层修饰 ═══════════════
  {
    id: 's01',
    en: 'You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.',
    zh: '你听到这个消息一定会高兴：你曾如此不祥地预言过的这项事业，开始时并没有遭遇任何灾难。',
    source: '《弗兰肯斯坦》书信一',
    level: 'beginner',
    tip: '两个动词（rejoice / has accompanied）＝ 两层；把 to hear 和 which 从句先盖住，剩下的就是主干。',
    backboneGloss: 'You will rejoice — 你会高兴（其余全是"为什么高兴"）',
    segments: [
      { t: 'You will rejoice', r: 'core', note: '主干：主语 + 谓语' },
      { t: 'to hear', r: 'mod', note: '不定式作原因状语，修饰 rejoice（为什么高兴）' },
      { t: 'that no disaster has accompanied the commencement of an enterprise', r: 'mod', note: 'that 引导宾语从句，作 hear 的宾语（高兴的内容）' },
      { t: 'which you have regarded with such evil forebodings.', r: 'mod', note: '定语从句，修饰 enterprise（哪项事业）' },
    ],
  },
  {
    id: 's02',
    en: 'The panting of the horses communicated a tremulous motion to the coach, as if it were in a state of agitation.',
    zh: '马的喘息让马车也跟着微微颤动，仿佛它正处在焦躁不安之中。',
    source: '《双城记》第一卷',
    level: 'beginner',
    tip: '主干只有三个成分，后面 as if 整块都是"比喻性补充"，可以先跳过。',
    backboneGloss: 'The panting communicated a motion — 喘息传递了颤动',
    segments: [
      { t: 'The panting of the horses', r: 'core', note: '主语（of the horses 是它的定语）' },
      { t: 'communicated', r: 'core', note: '谓语' },
      { t: 'a tremulous motion', r: 'core', note: '宾语' },
      { t: 'to the coach,', r: 'mod', note: '介词短语，指明传递给谁' },
      { t: 'as if it were in a state of agitation.', r: 'mod', note: 'as if 引导方式状语从句（虚拟语气 were）' },
    ],
  },
  {
    id: 's03',
    en: 'I try in vain to be persuaded that the pole is the seat of frost and desolation; it ever presents itself to my imagination as the region of beauty and delight.',
    zh: '我无论如何也无法相信极地只是冰霜与荒芜之地；在我的想象里，它始终是美与欢乐的所在。',
    source: '《弗兰肯斯坦》书信一',
    level: 'beginner',
    tip: '分号把长句切成两个独立小句 —— 看到分号先松一口气，左右各读一次。',
    backboneGloss: 'I try in vain — 我白费力气；it presents itself as ... — 它呈现为……',
    segments: [
      { t: 'I try in vain', r: 'core', note: '主干（in vain 是固定搭配"徒劳"）' },
      { t: 'to be persuaded', r: 'mod', note: '不定式，说明 try 的具体内容' },
      { t: 'that the pole is the seat of frost and desolation;', r: 'mod', note: 'that 宾语从句（被说服的内容）' },
      { t: 'it ever presents itself to my imagination', r: 'core', note: '第二个分句的主干' },
      { t: 'as the region of beauty and delight.', r: 'mod', note: 'as 短语，说明"呈现为什么样"' },
    ],
  },
  {
    id: 's04',
    en: 'How funny it’ll seem to come out among the people that walk with their heads downward!',
    zh: '等走到那些倒着走路的人群中间，那该多滑稽啊！',
    source: '《爱丽丝梦游仙境》第一章',
    level: 'beginner',
    tip: 'It 是形式主语，真正的主语在最后（to come out...）—— 英语习惯先占位、后说正事。',
    backboneGloss: 'It will seem funny — 那会显得滑稽',
    segments: [
      { t: 'How funny', r: 'core', note: '表语（感叹语气提前）' },
      { t: 'it’ll seem', r: 'core', note: '主干：形式主语 it + 系动词' },
      { t: 'to come out among the people', r: 'mod', note: '真正的主语（不定式短语后置）' },
      { t: 'that walk with their heads downward!', r: 'mod', note: '定语从句，修饰 people（哪些人）' },
    ],
  },
  {
    id: 's05',
    en: 'Its extreme downtown is the battery, where that noble mole is washed by waves, and cooled by breezes, which a few hours previous were out of sight of land.',
    zh: '它最南端的市区就是炮台公园 —— 那座高贵的防波堤被海浪冲刷、被微风拂凉，而那些风几小时前还在望不见陆地的地方。',
    source: '《白鲸》第一章',
    level: 'beginner',
    tip: '两个 which/where 一层套一层，但主干只有 "Its downtown is the battery" 五个词。',
    backboneGloss: 'Its downtown is the battery — 它的市区就是炮台公园',
    segments: [
      { t: 'Its extreme downtown', r: 'core', note: '主语' },
      { t: 'is', r: 'core', note: '系动词' },
      { t: 'the battery,', r: 'core', note: '表语（主干到此结束）' },
      { t: 'where that noble mole is washed by waves, and cooled by breezes,', r: 'mod', note: 'where 定语从句，修饰 battery（在那里……）' },
      { t: 'which a few hours previous were out of sight of land.', r: 'mod', note: '定语从句，修饰 breezes（那些风几小时前……）' },
    ],
  },
  {
    id: 's06',
    en: 'In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.',
    zh: '在两个国家里，对那些掌管国家俸禄的权贵来说，一切早已尘埃落定 —— 这一点比水晶还要明白。',
    source: '《双城记》第一卷',
    level: 'beginner',
    tip: 'It 再次是形式主语；中间那串 of 短语是把"对谁来说"一路挂长，可以先整块跳过。',
    backboneGloss: 'It was clearer than crystal that things were settled — 事情已定，这再清楚不过',
    segments: [
      { t: 'In both countries', r: 'mod', note: '地点状语' },
      { t: 'it was clearer than crystal', r: 'core', note: '主干：形式主语 + 比较级' },
      { t: 'to the lords of the State preserves of loaves and fishes,', r: 'mod', note: '介词短语，指明"对谁来说"（三个 of 层层修饰）' },
      { t: 'that things in general were settled for ever.', r: 'mod', note: '真正的主语（that 从句后置）' },
    ],
  },
  {
    id: 's07',
    en: 'I am already far north of London, and as I walk in the streets of Petersburgh, I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
    zh: '我已远在伦敦以北；当我走在彼得堡的街头，我感到一阵凛冽的北风吹拂面颊，它令我精神一振、满心欢喜。',
    source: '《弗兰肯斯坦》书信一',
    level: 'beginner',
    tip: 'and 并列两个小句；第二句里 as 从句在前，主干在后 —— 逗号后面的才是重点。',
    backboneGloss: 'I feel a breeze — 我感到一阵风（其余说明何时、何地、怎样的风）',
    segments: [
      { t: 'I am already far north of London,', r: 'core', note: '第一个分句主干' },
      { t: 'and', r: 'conn', note: '并列连词' },
      { t: 'as I walk in the streets of Petersburgh,', r: 'mod', note: 'as 时间状语从句（当我走在……）' },
      { t: 'I feel a cold northern breeze play upon my cheeks,', r: 'core', note: '第二个分句主干（feel + 宾语 + 动词原形）' },
      { t: 'which braces my nerves and fills me with delight.', r: 'mod', note: '定语从句，修饰 breeze（这阵风对我做了什么）' },
    ],
  },
  {
    id: 's08',
    en: 'There now is your insular city of the Manhattoes, belted round by wharves as Indian isles by coral reefs—commerce surrounds it with her surf.',
    zh: '眼前就是你们那座岛屿之城曼哈托 —— 码头环绕着它，正如珊瑚礁环绕着印度群岛，而商业用它翻涌的浪花将城市围拢。',
    source: '《白鲸》第一章',
    level: 'beginner',
    tip: '破折号后面是独立的新句子，别把它当成前半句的一部分。',
    backboneGloss: 'There is your city — 那就是你们的城市',
    segments: [
      { t: 'There now is your insular city of the Manhattoes,', r: 'core', note: '主干（There be 句型）' },
      { t: 'belted round by wharves', r: 'mod', note: '过去分词短语作定语，修饰 city（被码头环绕）' },
      { t: 'as Indian isles by coral reefs', r: 'mod', note: 'as 引导比较（正如珊瑚礁环绕岛屿）' },
      { t: '—commerce surrounds it with her surf.', r: 'core', note: '破折号后是独立分句，主干 commerce surrounds it' },
    ],
  },

  // ═══════════════ 进阶：从句 / 非谓语 / 插入语 ═══════════════
  {
    id: 's09',
    en: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.',
    zh: '凡是有钱的单身汉，总想娶位太太，这已经成了一条举世公认的真理。',
    source: '《傲慢与偏见》第一章',
    level: 'intermediate',
    tip: '把 It is a truth 和插入的 universally acknowledged 拨开，剩下的 that 从句才是真主语。',
    backboneGloss: 'It is a truth ... that a single man must be in want of a wife — 真理是：单身汉想娶妻',
    segments: [
      { t: 'It is a truth', r: 'core', note: '主干：形式主语 it + 系表' },
      { t: 'universally acknowledged,', r: 'mod', note: '过去分词短语作定语，修饰 truth（举世公认的）' },
      { t: 'that a single man', r: 'core', note: '真正主语的开端（that 从句）' },
      { t: 'in possession of a good fortune', r: 'mod', note: '介词短语作定语，修饰 man（有钱的）' },
      { t: 'must be in want of a wife.', r: 'core', note: '谓语部分（be in want of = 需要）' },
    ],
  },
  {
    id: 's10',
    en: 'This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes.',
    zh: '这阵风从我所要前往的那些地区吹来，让我预先尝到了那片冰封之地的滋味。',
    source: '《弗兰肯斯坦》书信一',
    level: 'intermediate',
    tip: '主语和谓语被一个 which 从句隔开了整整一行 —— 先跳过它，看 "This breeze ... gives"。',
    backboneGloss: 'This breeze gives me a foretaste — 这阵风让我预尝',
    segments: [
      { t: 'This breeze,', r: 'core', note: '主语' },
      { t: 'which has travelled from the regions', r: 'mod', note: '定语从句，修饰 breeze（这阵风来自……）' },
      { t: 'towards which I am advancing,', r: 'mod', note: '嵌套的定语从句，修饰 regions（我正前往的地区）' },
      { t: 'gives me a foretaste of those icy climes.', r: 'core', note: '谓语 + 宾语（主干在此收尾）' },
    ],
  },
  {
    id: 's11',
    en: 'In another moment down went Alice after it, never once considering how in the world she was to get out again.',
    zh: '转眼间爱丽丝也跟着跳了下去，压根没想过自己究竟该怎么再出来。',
    source: '《爱丽丝梦游仙境》第一章',
    level: 'intermediate',
    tip: 'Down went Alice 是倒装（正常语序 Alice went down），后面的 -ing 短语说明"同时还在想什么"。',
    backboneGloss: 'Alice went down — 爱丽丝跳了下去',
    segments: [
      { t: 'In another moment', r: 'mod', note: '时间状语' },
      { t: 'down went Alice after it,', r: 'core', note: '主干（倒装：状语提前 + 主谓倒装）' },
      { t: 'never once considering', r: 'mod', note: '现在分词短语作伴随状语（同时完全没想过）' },
      { t: 'how in the world she was to get out again.', r: 'mod', note: 'how 宾语从句，作 considering 的宾语' },
    ],
  },
  {
    id: 's12',
    en: 'Worn with pain, and weak from the prolonged hardships which I had undergone, I was removed, with a great train of wounded sufferers, to the base hospital at Peshawar.',
    zh: '由于伤痛缠身、又因长期艰辛而虚弱不堪，我和一大队伤兵一起被送往白沙瓦的后方医院。',
    source: '《血字的研究》第一章',
    level: 'intermediate',
    tip: '句首那串 -ed 短语是"描述我的状态"，主语 I 迟迟才出现 —— 前面的全都可以先当括号略过。',
    backboneGloss: 'I was removed to the hospital — 我被送往医院',
    segments: [
      { t: 'Worn with pain, and weak from the prolonged hardships', r: 'mod', note: '过去分词/形容词短语作状语，描述主语状态' },
      { t: 'which I had undergone,', r: 'mod', note: '定语从句，修饰 hardships（我经历过的艰辛）' },
      { t: 'I was removed,', r: 'core', note: '主干：主语 + 被动谓语' },
      { t: 'with a great train of wounded sufferers,', r: 'mod', note: '介词短语作伴随状语（和一大队伤兵一起）' },
      { t: 'to the base hospital at Peshawar.', r: 'mod', note: '介词短语，指明被送往何处' },
    ],
  },
  {
    id: 's13',
    en: 'I followed, however, with many other officers who were in the same situation as myself, and succeeded in reaching Candahar in safety, where I found my regiment, and at once entered upon my new duties.',
    zh: '不过我跟着许多和我处境相同的军官一起走，安全抵达了坎大哈；在那里我找到了自己的团，随即开始了新的职责。',
    source: '《血字的研究》第一章',
    level: 'intermediate',
    tip: 'however 是插入语，不是转折从句；一个主语 I 后面挂了两个谓语（followed / succeeded）。',
    backboneGloss: 'I followed and succeeded in reaching Candahar — 我跟着走，并成功抵达坎大哈',
    segments: [
      { t: 'I followed,', r: 'core', note: '主干谓语之一' },
      { t: 'however,', r: 'conn', note: '插入语（然而），不影响句子结构' },
      { t: 'with many other officers', r: 'mod', note: '介词短语作伴随状语（和许多军官一起）' },
      { t: 'who were in the same situation as myself,', r: 'mod', note: '定语从句，修饰 officers（处境和我相同的）' },
      { t: 'and succeeded in reaching Candahar in safety,', r: 'core', note: '第二个谓语（与 followed 并列，共用主语 I）' },
      { t: 'where I found my regiment, and at once entered upon my new duties.', r: 'mod', note: 'where 定语从句，修饰 Candahar（在那里我……）' },
    ],
  },
  {
    id: 's14',
    en: 'It was so near the time of starting that I had no time to ask any one else, for it was all very mysterious and not by any means comforting.',
    zh: '出发的时间太近了，我根本没工夫再问别人；何况整件事又那么神秘，一点也不让人安心。',
    source: '《德古拉》第一章',
    level: 'intermediate',
    tip: 'so ... that ... 是一个固定框架；for 在这里是"因为"，引导原因分句而非介词。',
    backboneGloss: 'It was so near the time that I had no time — 时间太近，我没时间',
    segments: [
      { t: 'It was so near the time of starting', r: 'core', note: '主干前半：so ... that 结构' },
      { t: 'that I had no time to ask any one else,', r: 'core', note: 'that 结果状语从句（太……以至于）' },
      { t: 'for it was all very mysterious', r: 'mod', note: 'for 引导原因分句（因为……）' },
      { t: 'and not by any means comforting.', r: 'mod', note: '与前面并列的表语（by no means = 绝不）' },
    ],
  },
  {
    id: 's15',
    en: 'Some leaning against the spiles; some seated upon the pier-heads; some looking over the bulwarks of ships from China; some high aloft in the rigging, as if striving to get a still better seaward peep.',
    zh: '有人靠在桩柱上，有人坐在码头尽头，有人凭栏眺望来自中国的船只，还有人高高地攀在缆绳间，仿佛想再多看一眼大海。',
    source: '《白鲸》第一章',
    level: 'intermediate',
    tip: '四个 some 是并列的名词短语，全都没有谓语 —— 这是省略句型，只在描写场面时出现。',
    backboneGloss: 'Some leaning; some seated; some looking; some aloft — 有人靠、有人坐、有人望、有人攀',
    segments: [
      { t: 'Some leaning against the spiles;', r: 'core', note: '独立主格（some + 现在分词），描写所处姿态' },
      { t: 'some seated upon the pier-heads;', r: 'core', note: '第二个并列（seated 是过去分词，表被动/状态）' },
      { t: 'some looking over the bulwarks of ships from China;', r: 'core', note: '第三个并列' },
      { t: 'some high aloft in the rigging,', r: 'core', note: '第四个并列（用形容词短语，省略动词）' },
      { t: 'as if striving to get a still better seaward peep.', r: 'mod', note: 'as if 引导方式状语（仿佛在……）' },
    ],
  },
  {
    id: 's16',
    en: 'One end, indeed, reflected splendidly both light and heat from ranks of immense pewter dishes, interspersed with silver jugs and tankards, towering row after row, on a vast oak dresser, to the very roof.',
    zh: '客厅的一端确实把光与热映照得辉煌：一排排巨大的锡盘，间杂着银壶与大杯，层层叠叠地摆在一张巨大的橡木餐柜上，一直堆到房顶。',
    source: '《呼啸山庄》第一章',
    level: 'intermediate',
    tip: '主干短得惊人（One end reflected light and heat），后面全是"这些东西怎么摆"的细节。',
    backboneGloss: 'One end reflected light and heat — 一端映射着光与热',
    segments: [
      { t: 'One end,', r: 'core', note: '主语' },
      { t: 'indeed,', r: 'conn', note: '插入语（确实），可先略过' },
      { t: 'reflected splendidly both light and heat', r: 'core', note: '谓语 + 宾语（both A and B）' },
      { t: 'from ranks of immense pewter dishes,', r: 'mod', note: '介词短语，说明光热来自什么' },
      { t: 'interspersed with silver jugs and tankards,', r: 'mod', note: '过去分词短语作定语，修饰 dishes（间杂着……）' },
      { t: 'towering row after row, on a vast oak dresser, to the very roof.', r: 'mod', note: '现在分词短语，继续描绘摆放在哪、堆多高' },
    ],
  },
  {
    id: 's17',
    en: 'To me this humour seems to possess a greater affinity, on the whole, to that of Addison than to any other of the numerous species of this great British genus.',
    zh: '在我看来，这种幽默总体上更接近艾迪生的那一路，而非这个庞大的英国文类中其他众多品种中的任何一种。',
    source: '《傲慢与偏见》导言',
    level: 'intermediate',
    tip: 'seems to possess 后面挂着两个 to：一个是"接近谁"（to that of Addison），一个是比较的另一端（than to...）。',
    backboneGloss: 'This humour seems to possess an affinity to Addison — 这种幽默更接近艾迪生',
    segments: [
      { t: 'To me', r: 'mod', note: '介词短语，表示"在我看来"' },
      { t: 'this humour seems to possess', r: 'core', note: '主干：主语 + 谓语（seem to do）' },
      { t: 'a greater affinity,', r: 'core', note: '宾语（更大的相似性）' },
      { t: 'on the whole,', r: 'conn', note: '插入语（总体上）' },
      { t: 'to that of Addison', r: 'mod', note: '介词短语，指明接近的对象（that 代指 humour）' },
      { t: 'than to any other of the numerous species of this great British genus.', r: 'mod', note: '比较结构后半 + 三个 of 层层修饰' },
    ],
  },
  {
    id: 's18',
    en: 'Either the well was very deep, or she fell very slowly, for she had plenty of time as she went down to look about her and to wonder what was going to happen next.',
    zh: '要么是井太深，要么是她掉得非常慢 —— 因为在下落的过程中她有充足的时间四下张望，还想知道接下来会发生什么。',
    source: '《爱丽丝梦游仙境》第一章',
    level: 'intermediate',
    tip: 'Either ... or ... 是"二选一"框架；for 再次作连词表原因，引导第三个分句。',
    backboneGloss: 'Either the well was deep, or she fell slowly — 要么井深，要么她掉得慢',
    segments: [
      { t: 'Either the well was very deep,', r: 'core', note: '并列分句一（Either ... or 结构）' },
      { t: 'or she fell very slowly,', r: 'core', note: '并列分句二' },
      { t: 'for she had plenty of time', r: 'mod', note: 'for 引导原因分句（因为……）' },
      { t: 'as she went down', r: 'mod', note: 'as 时间状语从句（在下落时）' },
      { t: 'to look about her and to wonder what was going to happen next.', r: 'mod', note: '两个并列不定式，说明用这些时间做什么' },
    ],
  },

  // ═══════════════ 高阶：多重嵌套、倒装、长介词链 ═══════════════
  {
    id: 's19',
    en: 'His feelings are for ever on the stretch; and when he begins to sink into repose, he finds himself obliged to quit that on which he rests in pleasure for something new, which again engages his attention, and which also he forsakes for other novelties.',
    zh: '他的情感永远紧绷着；当他刚要沉入安宁，就发现自己不得不为新的东西放弃那些曾令他愉悦的依托 —— 而新的东西又会吸引他注意，然后他同样会为更新的东西抛弃它。',
    source: '《弗兰肯斯坦》书信四',
    level: 'advanced',
    tip: '分号切开两半；后半句的骨架是 he finds himself obliged to quit that ... for something new，中间被打断两次。',
    backboneGloss: 'He finds himself obliged to quit that for something new — 他发现自己不得不为新的放弃旧的',
    segments: [
      { t: 'His feelings are for ever on the stretch;', r: 'core', note: '第一个分句主干' },
      { t: 'and when he begins to sink into repose,', r: 'mod', note: 'when 时间状语从句（刚要安宁时）' },
      { t: 'he finds himself obliged to quit', r: 'core', note: '第二个分句主干（find oneself + 过去分词）' },
      { t: 'that on which he rests in pleasure', r: 'mod', note: 'that 作先行词 + on which 定语从句（他愉悦所依之物）' },
      { t: 'for something new,', r: 'mod', note: '介词短语，说明"放弃它去换什么"（quit A for B）' },
      { t: 'which again engages his attention,', r: 'mod', note: '定语从句，修饰 something new' },
      { t: 'and which also he forsakes for other novelties.', r: 'mod', note: '并列定语从句（同样被抛弃 —— 注意 forsake 的宾语提前了）' },
    ],
  },
  {
    id: 's20',
    en: 'It is this decapitated end of the head, also, which is at last elevated out of the water, and retained in that position by the enormous cutting tackles, whose hempen combinations, on one side, make quite a wilderness of ropes in that quarter.',
    zh: '最后被吊出水面、并靠巨大的切割索具固定在那里的，正是头部这个被斩断的末端；那些麻绳的组合在一侧织成一片乱麻般的绳丛。',
    source: '《白鲸》第 74 章',
    level: 'advanced',
    tip: 'It is ... which ... 是强调句 —— 把被强调的部分摘出来，剩下的仍是完整句子。',
    backboneGloss: 'This end is elevated and retained by the tackles — 这个末端被索具吊起并固定',
    segments: [
      { t: 'It is this decapitated end of the head,', r: 'core', note: '强调句框架：被强调的部分（正是这个断头端）' },
      { t: 'also,', r: 'conn', note: '插入语' },
      { t: 'which is at last elevated out of the water,', r: 'core', note: '谓语一（被吊出水面）' },
      { t: 'and retained in that position', r: 'core', note: '谓语二（与前面并列，共用 is）' },
      { t: 'by the enormous cutting tackles,', r: 'mod', note: '介词短语，说明动作发出者（被谁）' },
      { t: 'whose hempen combinations, on one side, make quite a wilderness of ropes in that quarter.', r: 'mod', note: 'whose 定语从句，修饰 tackles（那些索具的绳……）' },
    ],
  },
  {
    id: 's21',
    en: 'And where but from Nantucket, too, did that first adventurous little sloop put forth, partly laden with imported cobblestones—so goes the story—to throw at the whales, in order to discover when they were nigh enough to risk a harpoon from the bowsprit?',
    zh: '而那只最初探险的小单桅船，除了从楠塔基特出发，还能从哪里启航呢？据说它只装了半船进口的鹅卵石 —— 用来掷向鲸鱼，好判断它们何时近到可以从船首斜桅投出鱼叉。',
    source: '《白鲸》第一章',
    level: 'advanced',
    tip: '疑问句把状语提前了（where but from Nantucket），正常语序是 That sloop put forth from Nantucket。',
    backboneGloss: 'That sloop put forth from Nantucket — 那只单桅船从楠塔基特启航',
    segments: [
      { t: 'And where but from Nantucket, too,', r: 'mod', note: '地点状语提前（but = 除了），构成疑问倒装' },
      { t: 'did that first adventurous little sloop put forth,', r: 'core', note: '主干（助动词 did 提前 → 疑问语序）' },
      { t: 'partly laden with imported cobblestones—so goes the story—', r: 'mod', note: '过去分词短语 + 插入句（据说），补充船的状态' },
      { t: 'to throw at the whales,', r: 'mod', note: '不定式作目的状语（为了掷向鲸鱼）' },
      { t: 'in order to discover', r: 'mod', note: '目的状语（为了判断）' },
      { t: 'when they were nigh enough to risk a harpoon from the bowsprit?', r: 'mod', note: 'when 宾语从句，作 discover 的宾语' },
    ],
  },
  {
    id: 's22',
    en: 'There is but one part of my conduct, in the whole affair, on which I do not reflect with satisfaction; it is that I condescended to adopt the measures of art so far as to conceal from him your sister being in town.',
    zh: '在这整件事里，我的所作所为只有一处让我回想起来不痛快：我竟屈尊用了些手段，向他隐瞒了你姐姐在城里这件事。',
    source: '《傲慢与偏见》第 58 章',
    level: 'advanced',
    tip: 'but = only（只有）；on which 定语从句修饰 part，冒号/分号后是解释"那一处"是什么。',
    backboneGloss: 'Only one part do I not reflect with satisfaction — 只有一处我回想起来不满意',
    segments: [
      { t: 'There is but one part of my conduct,', r: 'core', note: '主干（but = only，只有一个部分）' },
      { t: 'in the whole affair,', r: 'conn', note: '插入语（在这整件事中）' },
      { t: 'on which I do not reflect with satisfaction;', r: 'mod', note: 'on which 定语从句，修饰 part（我回想起来不满意的）' },
      { t: 'it is', r: 'core', note: '第二个分句主干（正是这一点）' },
      { t: 'that I condescended to adopt the measures of art', r: 'mod', note: 'that 表语从句，说明"那一点"是什么' },
      { t: 'so far as to conceal from him your sister being in town.', r: 'mod', note: 'so ... as to 结果状语（甚至到了隐瞒的地步）' },
    ],
  },
  {
    id: 's23',
    en: 'He had eyes that assorted very well with that decoration, being of a surface black, with no depth in the colour or form, and much too near together—as if they were afraid of being found out in something, singly, if they kept too far apart.',
    zh: '他有一双与那副打扮极为相称的眼睛：表面发黑，颜色与形状都没有深度，而且靠得极近 —— 仿佛它们害怕一旦分开、就会被各自发现什么似的。',
    source: '《双城记》第二卷',
    level: 'advanced',
    tip: '破折号后是比喻补充；as if 从句里又嵌了 if 从句 —— 一层层往下挂，但主句只有 He had eyes。',
    backboneGloss: 'He had eyes — 他有一双眼睛（其余全是描述这双眼睛）',
    segments: [
      { t: 'He had eyes', r: 'core', note: '主干：主 + 谓 + 宾' },
      { t: 'that assorted very well with that decoration,', r: 'mod', note: '定语从句，修饰 eyes（与打扮相称）' },
      { t: 'being of a surface black, with no depth in the colour or form,', r: 'mod', note: '现在分词短语，继续描述眼睛的特征' },
      { t: 'and much too near together', r: 'mod', note: '形容词短语并列（靠得太近）' },
      { t: '—as if they were afraid of being found out in something,', r: 'mod', note: 'as if 方式状语从句（仿佛……）' },
      { t: 'singly, if they kept too far apart.', r: 'mod', note: 'if 条件从句嵌在 as if 从句内部' },
    ],
  },
  {
    id: 's24',
    en: 'Ahab’s hat was never restored; the wild hawk flew on and on with it; far in advance of the prow: and at last disappeared; while from the point of that disappearance, a minute black spot was dimly discerned, falling from that vast height into the sea.',
    zh: '亚哈的帽子再没找回来。那只野鹰带着它一路飞远，远远飞在船首之前，最后消失了；就在它消失的那一点上，一个极小的黑点隐隐可见，从极高的地方坠入海中。',
    source: '《白鲸》第 130 章',
    level: 'advanced',
    tip: '三个分号切开四个短句；while 在这里是"与此同时"，是并列关系而非从句。',
    backboneGloss: 'The hawk flew and disappeared; a spot was discerned — 鹰飞走消失了；一个黑点隐约可见',
    segments: [
      { t: 'Ahab’s hat was never restored;', r: 'core', note: '分句一（被动语态）' },
      { t: 'the wild hawk flew on and on with it;', r: 'core', note: '分句二（带着帽子飞）' },
      { t: 'far in advance of the prow: and at last disappeared;', r: 'core', note: '与前面并列的谓语（飞在船首之前，终于消失）' },
      { t: 'while from the point of that disappearance,', r: 'conn', note: 'while 表"与此同时"，作并列连接' },
      { t: 'a minute black spot was dimly discerned,', r: 'core', note: '分句四主干（被动：一个黑点被隐约看见）' },
      { t: 'falling from that vast height into the sea.', r: 'mod', note: '现在分词短语作定语/补语（正从高处坠入海中）' },
    ],
  },
];

/** 书籍语料 + 演讲语料（按来源分文件，便于继续扩） */
export const SENTENCE_LAB: ISentenceLabItem[] = [...SENTENCE_LAB_BOOKS, ...SENTENCE_LAB_EXTRA];
