// Add 60 more exercises to reach 200 total
const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'src', 'data', 'nativetranslate.ts');

let content = fs.readFileSync(TARGET, 'utf8');

const extras = [
// BEGINNER - Daily (6)
['beginner','日常表达','我最近在学做饭——目前只会做番茄炒蛋。',"I've been learning to cook lately — so far I can only make scrambled eggs with tomatoes.",'"I\'ve been learning to cook"用现在完成进行时表达一个持续到现在的学习过程。英语中这种时态让你能精确传达"从过去开始、现在还在继续"——一种中文必须用额外词语才能表达的时态信息。"so far"（到目前为止）自然地设定了时间范围。'],
['beginner','日常表达','我今天一天都觉得浑身无力，可能是空调吹多了。',"I've been feeling wiped out all day — probably from sitting in the AC too long.",'"wiped out"（被擦干净/被抹掉）是最高频的"累瘫了"口语表达。英语母语者习惯用这种被动词化的隐喻来描述身体感受——好像被一个外力抹去了能量。'],
['beginner','日常表达','这本书你看到哪里了？我昨天一口气看了三分之一。',"How far into the book are you? I blew through a third of it yesterday.",'"blew through"（像风吹过一样快速穿过）描述快速阅读——风的隐喻带来了一种轻松的、毫不费力的感觉，比"read quickly"生动得多。'],
['beginner','日常表达','天气预报说明天要下大雨，别忘带伞。',"The forecast says it's gonna pour tomorrow — don't forget your umbrella.",'"pour"（倾倒）一个词就精准描述了倾盆大雨——英语中大量用简单动作动词（pour, lash, hammer）来描述天气现象。'],
['beginner','日常表达','我特别喜欢那种刚晒完太阳被子的味道。',"I love that smell of sheets that have been drying in the sun — it's the best thing ever.",'"the best thing ever"（有史以来最好的事情）——英语口语中极度夸张的表达方式。母语者频繁使用最高级来表达正面情感——这不是说谎，而是一种情感加强的社交习惯。'],
['beginner','日常表达','你什么时候有空？我请你喝咖啡，顺便聊聊。',"When are you free? Let me buy you a coffee and we can catch up.",'"buy you a coffee"（给你买杯咖啡）——英语中请客直接用"I\'ll buy you"而不是"我请你"。西方文化中"咖啡社交"的地位使这个邀约成为最自然的建立联系的方式。'],

// INTERMEDIATE - Daily (6)
['intermediate','日常表达','我本来要按原计划走的，但临时起意换了一个方向。',"I was gonna stick to the original plan, but at the last minute I decided to wing it and go a different direction.",'"wing it"（用翅膀即兴飞）是英语中最地道的"即兴发挥/临时应付"的表达。源自戏剧演员上台前最后一刻还在看台词本——像鸟儿一样没有准备就起飞。'],
['intermediate','日常表达','你最近是不是恋爱了？整个人都在发光。',"Are you seeing someone? You've been glowing lately — it's written all over your face.",'"seeing someone"（在见某人）是"dating"的委婉说法。"glowing"（发光）是最经典的描述恋爱中人的词。"written all over your face"（写在你整张脸上）——文字隐喻表达"掩饰不住"。'],
['intermediate','日常表达','这件事不急于一时——你现在做的每一个决定都会影响未来，但不会决定未来。',"There's no need to rush this — every decision you make now shapes your future, but no single one defines it.",'"shapes your future"（塑造你的未来）——把未来比作可被塑形的黏土/材料。"defines it"（定义它）——"define"在英语日常对话中的使用频率远超中文的"定义"，反映了分析性思维在日常中的内化。'],
['intermediate','日常表达','我之所以一直没回复你，不是不重视，是我在认真想该怎么回答。',"The reason I haven't gotten back to you isn't because I don't care — it's because I've been genuinely thinking about how to respond.",'"gotten back to you"（回到你身边）是回复消息/邮件的最高频职场表达。"genuinely"（真诚地）在口语中的力度远超"really"——暗示了一个更深入的、真实的过程。'],
['intermediate','日常表达','你有没有那种感觉：明明什么都没做，但一天就过去了。',"You ever get that feeling where the whole day just slips through your fingers and you have no idea where it went?",'"slips through your fingers"（从指缝中滑走）——时间被比作握不住的水/沙子。英语中"时间如水"的隐喻源远流长，衍生出一整套关于时间流逝的表达体系。'],
['intermediate','日常表达','我发现越是想抓住的东西反而越容易失去——越是放松反而越顺利。',"I've noticed that the things you try to hold onto the tightest are often the ones that slip away — and the moment you loosen your grip, things just seem to fall into place.",'"hold onto tightest → slip away"和"loosen your grip → fall into place"——两组方向相反的物理隐喻形成对比。英语思维中用双手的紧握/放松来比喻人生的控制/放手是极其常见的哲理表达模式。'],

// ADVANCED - Daily (4)
['advanced','日常表达','选择之所以困难，不是因为我们不知道要什么，而是因为我们什么都想要。',"Decisions are hard not because we don't know what we want, but because we want everything — and choosing one thing means saying no to everything else.",'"choosing one thing means saying no to everything else"（选择一件事意味着对其他所有事说不）——将"放弃"重新定义为"选择"的一部分。英语思维中对"机会成本"概念的普及程度远超中文日常讨论。'],
['advanced','日常表达','所谓自律，不是控制自己不做什么，而是坚持做你承诺过的事情，尤其是在你不想做的时候。',"Discipline isn't about stopping yourself from doing things — it's about doing the things you committed to, especially when you don't feel like it.",'"when you don\'t feel like it"（当你不想要做的时候）——英语中"feel like doing"这个结构精妙地表达了"想做"这个微妙的情感状态。自律=在"不想做"的时候依然"做"——简单的语言道出最硬核的道理。'],
['advanced','日常表达','我发现幸福不是你达到了某个目标，而是你在朝着目标前进的路上感受到的那种充实感。',"I've come to realize that happiness isn't reaching some destination — it's the sense of fulfillment you feel while you're on the way there.",'"destination"（终点）和"on the way"（在路上）——用旅行隐喻来区分两种幸福观。英语中人生哲学的表达几乎都建构在空间运动隐喻之上——我们会说"moving forward"、"finding your path"、"going places"。'],
['advanced','日常表达','你最大的敌人不是别人，而是你自己的怀疑——当你不相信自己的时候，全世界都不会相信你。',"Your biggest enemy isn't anyone else — it's your own self-doubt. When you don't believe in yourself, the world picks up on that.",'"pick up on that"（接收到那个信号）——用雷达/传感器隐喻描述社会认知。"self-doubt"这个复合词在英语中是一个高频心理词汇——英语将"自我"和"怀疑"焊接成一个词，体现了心理概念的词汇化程度。'],

// BEGINNER - Workplace (4)
['beginner','职场沟通','这个PPT你大概什么时候能做完？',"When do you think you'll have the deck ready?",'"deck"（一叠卡片/一叠纸）在职场中专门指PPT演示文稿。这是硅谷/咨询行业扩散到全行业的术语——反映了英语职场中不断创造简洁代号的倾向。'],
['beginner','职场沟通','邮件我收到了，我会尽快处理。',"Got your email — I'll get on it as soon as I can.",'"Got your email"省略了主语"I"——职场口语中主语省略很常见。"get on it"（上去处理）——将任务比作一个可以踩上去的物体。'],
['beginner','职场沟通','有什么不明白的随时问我——别不好意思。',"If anything's unclear, just give me a shout — don't hesitate to reach out.",'"give me a shout"（朝我喊一声）和"reach out"（伸手过来）——两个身体动作表达"联系我"。英语中的联系表达比中文的"找我"更具体、更有画面感。'],
['beginner','职场沟通','我觉得这个想法挺好的，可以往这方面想一想。',"I think there's something there — worth exploring further.",'"there\'s something there"（那里有东西）——用空间存在来表达"想法有价值"。不说"好"而说"有东西"——英语母语者评价创意时倾向于用客观描述的迂回表达。'],

// INTERMEDIATE - Workplace (8)
['intermediate','职场沟通','我们犯了一个经典的错误：把方案定好之后才开始收集数据来证明它是对的。',"We made the classic mistake of falling in love with our solution and then going out to find data that supports it.",'"falling in love with"（爱上了）——用恋爱关系比喻对方案的执着。"going out to find data"（出去找数据）——空间隐喻暗示"数据应该在外面客观存在"，而不是"被挑选来迎合结论"。'],
['intermediate','职场沟通','我不同意，但我想先听听你的完整思路再给反馈——说不定是我没看到某个关键的细节。',"I'm not on board yet, but I want to hear your full thinking before I weigh in — I might be missing something.",'"on board"（在船上）——把同意比作在船上/参与。"weigh in"（放上秤/称重）——把发言比作把自己观点的重量加到天平上。海洋和天平的隐喻在同一句话中融合。'],
['intermediate','职场沟通','不要试图一次性解决所有问题——分阶段来，每个阶段只聚焦一个目标。',"Don't try to boil the ocean — break it down into phases and focus on one thing at a time.",'"boil the ocean"（把大海煮沸）是最生动的"试图做不可能的事"表达。英语职场中这种视觉冲击力极强的隐喻随处可见，反映了一种用极端图像来警示低效的沟通风格。'],
['intermediate','职场沟通','一个好的汇报不是告诉听众你做了什么——而是告诉他们你学到了什么。',"A good presentation isn't about telling people what you did — it's about telling them what you learned.",'"what you did" vs "what you learned"——英语汇报文化中"故事线"（narrative）的重要性。从"做了什么"到"学到了什么"的转变反映了英语思维中对"反思"和"成长叙事"的重视。'],
['intermediate','职场沟通','你要学会向上管理——不要只告诉老板问题，同时告诉他你建议的解决方案。',"You need to learn to manage up — don't just bring your boss problems, bring them solutions too.",'"manage up"（向上管理）——英语中这个词组精准捕获了一个中文需要整句解释的概念。"bring solutions, not just problems"（带方案来，不只是带问题）是英语职场文化的核心原则之一。'],
['intermediate','职场沟通','你不需要成为房间里最聪明的人——你需要成为最能连接不同聪明想法的人。',"You don't need to be the smartest person in the room — you need to be the one who connects the dots between smart ideas.",'"connects the dots"（把点连起来）——源自连点成画游戏，已经成为"发现联系/整合信息"的标准表达。英语职场中对"连接思维"（connective thinking）的高度重视在这里体现。'],
['intermediate','职场沟通','现在不是找谁错了的时候——重要的是找到解决方案并防止同样的事情再发生。',"Now is not the time to point fingers — what matters is finding a fix and making sure it doesn't happen again.",'"point fingers"（用手指指向）——将追责比作一个简单的手势。"making sure it doesn\'t happen again"（确保不再发生）——英语中解决问题的最终标准是"防止复发"，而不仅仅是"修好"。'],
['intermediate','职场沟通','我不同意把速度放在质量前面——短期快了，长期回到原点重来。',"I don't agree with prioritizing speed over quality — you go fast in the short term, but you end up right back where you started in the long run.",'"prioritize X over Y"（把X放在Y之上）——用空间垂直隐喻表达优先级。"right back where you started"（回到你开始的地方）——用空间回归表达徒劳无功。英语思维中对"进展"的想象几乎完全空间化。'],

// ADVANCED - Workplace (6)
['advanced','职场沟通','如果一年后回头看今天的选择，你觉得什么是最主要的遗憾？用那个答案来指导现在的行动。',"If you look back at today's decision a year from now, what's your biggest regret likely to be? Use that answer to guide what you do now.",'"look back at today from a year from now"——英语中这种将时间视角空间化和具体化的思维方式非常独特。把未来的自己想象成站在远处回望现在的一个人——这是英语中"时间旅行思维实验"的典型用法。'],
['advanced','职场沟通','勇气不是没有恐惧——是怕得腿软，但还是迈出了那一步。',"Courage isn't the absence of fear — it's being scared to death and taking that step anyway.",'"absence of fear"（恐惧的缺失）用"absence"这个抽象名词表达"没有"——英语中大量使用名词化结构来表达抽象概念。"take that step"（迈出那一步）再次用空间移动代表心理突破。'],
['advanced','职场沟通','在给出答案之前，先确认你是否真的理解了问题——很多时候问题本身就是最大的误解。',"Before jumping to an answer, make sure you've actually understood the question — more often than not, the problem is a misunderstanding of what the problem really is.",'"jumping to an answer"（跳到答案上）——把匆忙下结论比作跳过思考过程直接落在答案上。"more often than not"（比一半多，即"通常"）——英语中这种含数学暗示的惯用表达在日常对话中的频率极高。'],
['advanced','职场沟通','反馈就像一份礼物——礼物不收不会伤害送的人，但伤害的是你自己。',"Feedback is like a gift — if you don't accept it, it doesn't hurt the giver. It only hurts you.",'"Feedback is like a gift"——用赠礼隐喻来解释"接受反馈"的重要性。英语文化中对"feedback as gift"的比喻已经上升到管理哲学的高度。"giver"（赠予者）和"accept"（接受）完整地套用了礼物交换的文化脚本。'],
['advanced','职场沟通','世界上有两种公司：一种是被竞争逼着改变的公司，一种是主动改变从而没有竞争对手的公司。',"There are two kinds of companies: those that change because they're forced to by the competition, and those that change before they have to — which is why they have no competition.",'"forced to by the competition"——被动语态把"被竞争逼迫"的因果关系简洁地表达出来。"before they have to"（在他们不得不做之前）——省略了后面的动词（change），英语口语中这种省略让句子更有节奏感。'],
['advanced','职场沟通','最危险的不是做错决定——而是不做决定。犹豫会杀死一切可能性。',"The most dangerous thing isn't making the wrong call — it's making no call at all. Indecision kills every possibility.",'"making the wrong call"（做出错误的判罚）——再次使用体育裁判的比喻。"indecision kills"（犹豫不决杀死）——把抽象概念拟人化为一个杀人者。英语思维中常用这种"概念X kills/steals/destroys 概念Y"的拟人化表达来增强说服力。'],

// BEGINNER - Social (4)
['beginner','社交互动','你觉得这个怎么样？我信你的眼光。',"What do you think of this? I trust your taste.",'"I trust your taste"（我信你的品味）——英语中最自然的"信你的眼光"表达。用"taste"（品味）来指代对方的判断力——给认可加了一层美学的含义，比直接说"信任你的判断"更优雅。'],
['beginner','社交互动','下次我请！说好了。',"Next one's on me — it's a deal.",'"Next one\'s on me"（下一个在我身上）——最高频的回请表达。"it\'s a deal"（成交/说好了）——用商务谈判的结尾词来轻松地敲定一个社交约定。'],
['beginner','社交互动','你今天穿得真好看！',"You look sharp today!",'"sharp"（锋利/锐利）在口语中表示"穿得好看/打扮得精神"。英语中把穿着映射为锋利度的隐喻——暗示穿着干净利落、线条分明。一个简单的形容词包含了视觉、触觉和态度的多层含义。'],
['beginner','社交互动','路上小心，到家给我发个消息。',"Get home safe — shoot me a text when you're back.",'"Get home safe"（安全到家）——用祈使句加形容词表达关心，比"Be careful"更温暖。"shoot me a text"——"shoot"再次出现。英语口语中"shoot"几乎取代了"send"在非正式场合的所有用法。'],

// INTERMEDIATE - Social (8)
['intermediate','社交互动','你看事情总是能看到别人看不到的那一面——我很佩服你这一点。',"You have a way of seeing things from angles most people miss — I really admire that about you.",'"have a way of"（有一种……的方式）是英语中表达"独有的能力/习惯"最自然的句式。"angles most people miss"（大多数人错过的角度）——几何隐喻再次用于认知。'],
['intermediate','社交互动','我说这话你不要生气——但我觉得你在逃避真正的问题。',"Please don't take this the wrong way — but I feel like you're dodging the real issue.",'"don\'t take this the wrong way"（别从错误的方向理解）——给予敏感反馈之前的标准前置语。"dodging"（闪避）——用拳击/体育动作比喻回避问题。'],
['intermediate','社交互动','我一直在想要不要跟你说这个，但我觉得作为朋友我应该诚实。',"I've been going back and forth on whether to tell you this, but as your friend I feel like I owe you honesty.",'"going back and forth"（来回走）——生动描述内心犹豫的物理运动。"owe you honesty"（欠你诚实）——用债务隐喻表达友谊中的责任，暗示"诚实是我作为朋友应该偿还的东西"。'],
['intermediate','社交互动','你很善良，但不是所有人都配得上你的善良——学会识别那些值得的人。',"You're a kind person, but not everyone deserves your kindness — learn to tell the difference between those who do and those who don't.",'"tell the difference between those who do and those who don\'t"——用"do"和"don\'t"代替重复"deserve your kindness"。英语中助动词代表前面整句内容的省略方式是高级口语的标志。'],
['intermediate','社交互动','有时候你觉得很复杂的人际冲突，其实只是双方都没有先低头而已。',"Sometimes what feels like a complicated conflict is really just both sides waiting for the other to blink first.",'"blink first"（先眨眼）——用"对视比赛谁先眨眼"的童年游戏来比喻人际僵局。一个简单的动作就传达了一个复杂的博弈心理学——这是英语习语强大之处的典范。'],
['intermediate','社交互动','上次我们一起旅游是五年前了——时间过得也太快了。',"The last time we traveled together was five years ago — time flies, doesn't it?",'"time flies"（时间飞走了）——英语中对"时间过得快"最常用的表达。"doesn\'t it?"附加问句邀请对方共鸣——英语中附加问句不仅用于确认事实，更多用于寻求情感共鸣。'],
['intermediate','社交互动','你不一定要给建议——有时候最好的帮助只是安静地听。',"You don't have to have all the answers — sometimes the most helpful thing you can do is just listen without jumping in.",'"have all the answers"（拥有所有答案）——把"知道该说什么"比作拥有物品。"jumping in"（跳进去）——把急于给建议比作打断倾听的身体跳跃动作。'],
['intermediate','社交互动','我发现最难说出口的三个字不是"我爱你"——是"我需要帮助"。',"I've found that the hardest three words to say aren't 'I love you' — they're 'I need help'.",'"aren\'t...they\'re"——用否定+肯定的对偶结构制造反转效果。英语中这种"A is not X, it\'s Y"的表达模式广泛用于表达"表面看是这样，实际上是那样"的反直觉洞察。'],

// ADVANCED - Social (8)
['advanced','社交互动','你不需要向任何人证明自己——你唯一需要超越的是昨天那个版本的你。',"You don't need to prove yourself to anyone — the only person you need to be better than is who you were yesterday.",'"prove yourself to anyone"（向任何人证明自己）——"prove"在英语中不仅用于逻辑证明，也大量用于社会心理学语境。"who you were yesterday"（昨天那个你）——用时间参照点来定义自我比较的标准。'],
['advanced','社交互动','有些路注定要一个人走——这不是孤独，而是成长的必经阶段。',"There are certain stretches of the journey you have to walk alone — it's not loneliness, it's just part of the growing process.",'"stretches of the journey"（旅途中的某些路段）——用长途旅行的隐喻来描述人生。将"孤独"重新定义为"旅途的一部分"而非"一种缺陷"——英语叙事中对负面感受的重新框架化（reframing）策略。'],
['advanced','社交互动','我一直以为强大就是不依赖任何人——后来才明白，真正的强大是敢依赖对的人。',"I used to think being strong meant not needing anyone — then I realized real strength is having the courage to lean on the right people.",'"lean on"（靠在……上面）——把依赖关系比作身体的物理依靠。英语中"lean on someone"暗示的不是软弱，而是一种经过选择的信任——靠在对的人身上需要判断力和勇气。'],
['advanced','社交互动','善良不等于没有底线——真正的善良是温柔但有边界。',"Being kind doesn't mean having no boundaries — real kindness is gentle but firm.",'"gentle but firm"（温柔但坚定）——两个形容词的并列形成了一种平衡的心理学公式。英语思维中对"平衡"的追求常常通过这种"X but Y"或"X yet Y"的对偶结构来表达。'],
['advanced','社交互动','随着年龄的增长我越来越发现：少说话，多观察，是极少数绝对正确的社交策略。',"The older I get, the more I realize: listen more than you talk, and watch more than you show — it's one of the few social strategies that never backfires.",'"never backfires"（永远不会适得其反/回火）——用枪械/引擎的"回火"故障来隐喻社交失败。英语中大量技术/机械词汇被用于描述人际互动。'],
['advanced','社交互动','你说得越多，暴露得越多——不是因为你说了什么，而是因为你说的方式让别人看穿了你。',"The more you talk, the more you give away — not necessarily what you say, but the way you say it tells people exactly who you are.",'"give away"（泄露/暴露）——用赠送/放弃的动词表达"暴露信息"。"tells people exactly who you are"——英语中将沟通方式视为身份的"告密者"。'],
['advanced','社交互动','不要去试图理解那些永远不试图理解你的人——把时间花在双向的关系上。',"Stop trying to figure out people who never try to figure you out — invest your time in relationships that go both ways.",'"figure out"（琢磨明白）和"go both ways"（双向流动）——认知动词和交通动词的并行使用。"invest your time"再次使用投资隐喻——时间是货币，可以投到不同的"关系账户"里。'],
['advanced','社交互动','我花了很长时间才明白：不是所有的门都值得推开，不是所有的邀请都值得接受。',"It took me a long time to learn that not every door is worth opening, and not every invitation is worth accepting.",'"not every door is worth opening"——用"门"的隐喻贯穿整句。英语中"机会=门"的隐喻如此根深蒂固，以至于"开门/关门/敲门"已经形成了一个完整的认知框架——每个动作都对应一种人生选择。'],
];

// Generate entries
let entries = '';
for (let i = 0; i < extras.length; i++) {
  const [difficulty, category, chineseText, nativeEnglish, thinkingPattern] = extras[i];
  const id = `n${191 + i}`;
  const esc = (s) => s.replace(/'/g, "\\'").replace(/\n/g, ' ');
  entries += `  { id:'${id}', chineseText:'${esc(chineseText)}', nativeEnglish:'${esc(nativeEnglish)}', thinkingPattern:'${esc(thinkingPattern)}', difficulty:'${difficulty}', category:'${category}' },\n`;
}

// Insert before closing ];
const closingIdx = content.lastIndexOf('];');
const newContent = content.slice(0, closingIdx) + entries + '];\n';

fs.writeFileSync(TARGET, newContent, 'utf8');
console.log(`Added ${extras.length} more exercises (n191-n${190 + extras.length}).`);
