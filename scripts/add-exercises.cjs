// Generate 150 additional native translate exercises and append to data file
const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'src', 'data', 'nativetranslate.ts');

// Read existing file
let content = fs.readFileSync(TARGET, 'utf8');

// Generate 150 new exercises (n51 - n200)
const newExercises = [];

// ===== TEMPLATE DATA =====
// Each entry: [chineseText, nativeEnglish, thinkingPattern, difficulty, category]

const daily = '日常表达';
const workplace = '职场沟通';
const social = '社交互动';
const beg = 'beginner';
const int = 'intermediate';
const adv = 'advanced';

const templates = [
  // --- BEGINNER: Daily expressions (n51-n70) ---
  [beg, daily, '我觉得今天的天气特别舒服，不冷不热的。', "The weather's just perfect today — not too hot, not too cold.", '英语母语者用"just perfect"这种强调型的简单判断句来表达感受。"not too X, not too Y"的平行结构是英语中描述适中状态的标准模式——两个否定比一个肯定更有说服力。'],
  [beg, daily, '你饿了吗？我肚子开始咕咕叫了。', "You hungry? My stomach's starting to growl.", '英语口语中大量省略助动词（Are you hungry? → You hungry?）。"growl"（咆哮）把肚子叫声拟兽化——英语中把身体拟人化/拟物化来表达生理状态的思维非常普遍。'],
  [beg, daily, '我昨晚睡得特别香，一觉到天亮。', "I slept like a baby last night — out like a light till morning.", '"slept like a baby"和"out like a light"是英语中描述深度睡眠的两个最高频比喻。英语母语者习惯用明确、形象的比喻而不是抽象的"睡得很好"。'],
  [beg, daily, '这个新手机我还在摸索中，好多功能不知道怎么用。', "I'm still figuring out this new phone — there's so many features I haven't gotten the hang of yet.", '"figure out"和"get the hang of"是英语中描述学习过程的核心短语。"figure out"暗示在脑海中形成图像（figure），"get the hang of"则把掌握技能比作抓住某个东西的"手感"。'],
  [beg, daily, '不好意思，我完全忘了这件事！最近记性太差了。', "Oh man, that totally slipped my mind — my memory's been garbage lately.", '"slip my mind"把记忆比作从一个光滑表面滑落的东西。"garbage"（垃圾）在口语中作为形容词（=terrible）的频率极高，反映了英语中对日常词汇的灵活转类使用。'],
  [beg, daily, '你觉得这个颜色怎么样？我在这两个之间纠结。', "What do you think of this color? I'm torn between these two.", '"torn between"（被撕成两半）是英语中选择困难最形象的表达。一个简单动词"torn"传达的纠结感胜过中文一大段描述。'],
  [beg, daily, '今天的会取消了，我们可以早点下班。', "Today's meeting got canceled — we can cut out early.", '"cut out"（切掉）在口语中表示"离开"。"get canceled"用被动语态——英语中大量用被动式表达客观发生的事情，不强调是谁做的。'],
  [beg, daily, '说实话这个电影有点无聊，我看到一半差点睡着了。', "To be honest, that movie was kind of boring — I almost nodded off halfway through.", '"nodded off"（点头然后睡着）是英语中最生动的"打瞌睡"表达。"kind of"（有点）作为软化语气的万能填充词，在英语对话中的使用频率远超中文的"有点"。'],
  [beg, daily, '你要不要来点咖啡？我刚泡了一壶。', "You want some coffee? I just made a fresh pot.", '英语口语中"coffee"不需要加量词——"a fresh pot"比"一壶新鲜的咖啡"简洁得多。疑问句省去"Do"是口语常态，反映了英语中效率优先的沟通习惯。'],
  [beg, daily, '这个课我报了一年但一直没去上，钱白花了。', "I signed up for this class a year ago and haven't gone once — total waste of money.", '"total waste"（完全的浪费）比"a waste"语气更重。英语母语者表达后悔时习惯先说事实再下结论，形成"陈述+判断"的两段式结构。'],
  [beg, daily, '我今天就想宅在家什么都不干。', "I just want to stay in and do absolutely nothing today.", '"stay in"（待在里面）是最简洁的"宅在家"表达。"absolutely nothing"用强调副词修饰否定词——英语中这种做法比中文更常见，反映了英语对情感强度的外化习惯。'],
  [beg, daily, '你能不能帮我个忙？我一分钟就好。', "Can you do me a quick favor? It'll only take a second.", '"do me a favor"是英语请人帮忙的万能句式。"a second"虽然字面是一秒，但在英语口语中广泛用于表达"很快"——夸张式缩小时间估算是一种常见的口语策略。'],
  [beg, daily, '我忘了带钥匙，结果在门外等了两个小时。', "I forgot my keys and ended up waiting outside for two hours.", '"ended up"是英语叙事中最常用的"结果……"表达。"end up"暗示了一种不在计划中的、意外的走向——这个短语在英语日常叙事中的频率比任何单个中文对应词都高。'],
  [beg, daily, '这家店的服务真是没话说，下次一定还来。', "The service here is second to none — I'm definitely coming back.", '"second to none"（不比任何差=第一名）是英语中最高频的赞美习语之一。英语母语者比较习惯用这种"比所有人都好"的极端表达来赞美，而不是简单说"很好"。'],
  [beg, daily, '你能不能小点声？我在打电话。', "Would you mind keeping it down? I'm on the phone.", '"keep it down"（把音量保持在下面）把声音大小映射为空间高低。"Would you mind..."是英语中比"Can you..."更礼貌的请求句式，多了一个思维步骤来软化语气。'],
  [beg, daily, '我今天早上起晚了，所以没来得及吃早饭。', "I overslept this morning, so I didn't have time for breakfast.", '"overslept"一个词就精准表达了"起晚了"——英语中"over-"前缀的高效性让单个动词就能涵盖中文需要一个短句的内容。'],
  [beg, daily, '这个菜你尝尝，我觉得味道挺特别的。', "Try this — it's got an interesting flavor. Tell me what you think.", '"Try this"用祈使句直接邀请，不加客套话。"interesting flavor"用"有趣的"替代"奇怪的"——英语文化中"interesting"经常被用作一个安全的外交辞令。'],
  [beg, daily, '都十点了，我开始有点困了。', "It's already ten — I'm starting to crash.", '"crash"（撞击/崩溃）在口语中表示"突然感到疲惫"。英语母语者习惯用富有戏剧性的动态词汇（crash, hit, smash）来描述日常感受。'],
  [beg, daily, '最近什么都涨价了，日子不好过啊。', "Everything's gotten so expensive lately — it's tough out there.", '"tough out there"（外面很艰难）把经济压力空间化。"out there"暗示社会是一个外在环境——英语思维中倾向于把个人和外部环境分为两个空间。'],
  [beg, daily, '你爱信不信，反正我说的是实话。', "Believe it or not, I'm telling you the truth.", '"Believe it or not"是英语故事讲述者最常用的开头之一。先声明"不管信不信"，把听众的质疑预判并挡回——这反映了英语沟通中对"提前设防"的重视。'],

  // --- INTERMEDIATE: Daily expressions (n71-n85) ---
  [int, daily, '我觉得这个建议理论上不错，但实际操作起来可能没那么简单。', "I think it's a solid idea in theory, but pulling it off might be a different story.", '"pulling it off"（把它拉下来）是英语中表示"成功做成"的核心短语。"a different story"把理论和实践的差距比作两个不同的故事——英语中叙事隐喻在日常讨论中无处不在。'],
  [int, daily, '说实话我一开始对这个项目没抱太大希望，但最后结果出乎意料的好。', "Honestly, I didn't have high hopes for this project going in, but it turned out surprisingly well.", '"going in"（进去的时候）把开始一个项目比作进入一个空间。"turned out"（结果是）暗示了一个揭示/展开的过程——两个空间隐喻连续使用。'],
  [int, daily, '不是我替他们说话，但这次他们确实尽力了——只是运气不好。', "I'm not making excuses for them, but they really did give it their best shot — the cards just didn't fall their way.", '"give it their best shot"用射击比喻尽力。"the cards didn\'t fall their way"用纸牌比喻运气——一句话中连续使用体育和赌博两个领域的隐喻，是英语思维高度隐喻化的体现。'],
  [int, daily, '我花了两个月才把这个问题彻底搞明白。', "It took me two months to wrap my head around this problem.", '"wrap my head around"（把头包住来理解）是英语中表达"理解复杂事物"最形象的短语之一。空间隐喻延伸到认知领域——理解一个概念=把自己环绕在它周围。'],
  [int, daily, '你不需要现在就做决定，好好考虑几天再说。', "You don't have to decide right now — sit on it for a few days and see how you feel.", '"sit on it"（坐在上面）是英语中表示"暂缓做决定"的常用表达。把想法想象成一个可以坐在上面的实物——这种将抽象动作转化为身体姿势的隐喻思维在英语中非常普遍。'],
  [int, daily, '我本来打算昨天做完的，结果被各种琐事缠住了。', "I was planning to get it done yesterday, but I got sidetracked by a bunch of little things.", '"sidetracked"（被引到侧轨上）把注意力分散比作火车的脱轨/转轨。"bunch of"（一串）作为非正式量词在口语中的使用频率极高。'],
  [int, daily, '这个习惯我已经坚持半年了，现在根本不用刻意去想，自然而然就做了。', "I've been sticking with this habit for six months now — at this point it's just second nature.", '"stick with"（粘住不放）把坚持比作物理附着。"second nature"（第二天性）是一个经典英语成语，反映了英语文化对"后天培养的本能"这一概念的高度重视。'],
  [int, daily, '我其实能感觉到他话里有话，但当时没好意思追问。', "I could tell there was more to what he was saying, but I didn't want to push it at the time.", '"more to what he was saying"（他说的话背后还有更多）把话语看作一个容器，里面有隐藏的内容。"push it"（推它）把继续追问比作施加物理压力。'],
  [int, daily, '不是我说大话，但在处理这类问题上我确实是老手了。', "Not to toot my own horn, but I've been around the block a few times when it comes to this kind of thing.", '"toot my own horn"和"been around the block"两个习语连续使用——前者用乐器自吹表示自夸，后者用在街区绕圈表示经验丰富。英语中对成语的高密度使用是区分母语者和学习者的关键标志。'],
  [int, daily, '我觉得你现在需要的是好好休息，而不是继续钻牛角尖。', "I think what you need right now is a good rest, not to keep going down that rabbit hole.", '"rabbit hole"（兔子洞）源于《爱丽丝梦游仙境》，表示深陷一个问题无法自拔。英语中文学典故在日常对话中的渗透程度远超中文——普通人也经常引用莎士比亚、爱丽丝、圣经等。'],
  [int, daily, '一开始我完全听不懂他在说什么，后来慢慢就适应了他的口音。', "At first I couldn't make out a word he was saying, but I gradually tuned my ear to his accent.", '"make out"（辨认出）把听觉理解比作视觉辨认。"tune my ear"（调耳朵的频道）用收音机调谐比喻适应口音——科技隐喻在英语中高频率日常化使用。'],
  [int, daily, '你说得对，我完全没有从这个角度考虑过。', "You've got a point — that angle never even crossed my mind.", '"cross my mind"（穿过我的脑海）把想法比作路过一个空间的访客。"angle"（角度）把思维方式比作物理视角——几何隐喻在英语思维中的深度嵌入。'],
  [int, daily, '我不想让你觉得我在敷衍你——我是真心想帮忙，只是现在确实分身乏术。', "I don't want you to think I'm brushing you off — I genuinely want to help, I'm just spread a bit thin right now.", '"brush off"（刷掉灰尘一样把人打发走）表示了敷衍。"spread thin"（摊得太薄）把精力比作涂抹在面包上的黄油——两个物理隐喻精准传达了复杂的人际沟通。'],
  [int, daily, '我本来都要放弃了，但最后关头突然想到了一个新思路。', "I was this close to throwing in the towel, but then a new idea hit me at the last minute.", '"throwing in the towel"（扔毛巾）源于拳击比赛中教练扔毛巾认输。"hit me"（击中我）把灵感比作物理撞击——体育隐喻的日常化是英语的典型特征。'],
  [int, daily, '你太高估我了——这件事我顶多算是个半吊子。', "You're giving me way too much credit — I'm barely a novice at this stuff.", '"give someone credit"（给某人信用/认可）是英语中表达赞许的核心短语。"barely a novice"（勉强算新手）用过度谦虚来表达——英语文化中的自谦常常通过缩小自己的水平而不是拒绝赞美来实现。'],

  // --- ADVANCED: Daily expressions (n86-n95) ---
  [adv, daily, '这种现象背后其实有深刻的逻辑——表面上看似矛盾，实际上是一种精妙的平衡。', "There's actually a deep logic behind this phenomenon — what looks like a contradiction on the surface is actually a delicate balancing act.", '"balancing act"（平衡表演）把同时处理多个因素比作杂技。英语中这种将复杂系统简化为一组具体动作的思维模式，使得抽象概念变得直观可感。'],
  [adv, daily, '你越是试图控制一切，反而越容易失去掌控——这是一个悖论。', "The harder you try to control everything, the more likely you are to lose control — it's a catch-22.", '"catch-22"源于约瑟夫·海勒的同名小说，已经完全融入日常英语，表示"无法摆脱的悖论处境"。英语中小说人物/情节变成日常词汇的例子非常多（像"Orwellian"、"Kafkaesque"）。'],
  [adv, daily, '与其试图改变无法改变的事情，不如改变你面对它的心态。', "Instead of trying to change the unchangeable, shift your mindset about it — that's where the real power lies.", '"shift your mindset"用空间动词"shift"来描述心态转变。"where the real power lies"（真正的力量所在之处）把抽象的力量概念空间化——英语中对空间隐喻的深度依赖。'],
  [adv, daily, '我人生中最正确的决定往往是在信息最不充分的时候做出的——靠的就是直觉。', "The best decisions I've ever made were often the ones where I had the least information — I just went with my gut.", '"went with my gut"（跟着我的肠子走）用消化器官代表直觉。英语中将"直觉"绑定到具体身体器官（gut feeling, gut instinct）反映了英语思维中身心合一的认知模式。'],
  [adv, daily, '成年人的世界没有对错之分，只有代价和取舍。', "In the adult world, it's not really about right or wrong — it's about trade-offs and what you're willing to live with.", '"trade-offs"（交换出去的东西）一个词就概括了"代价和取舍"。英语中大量概念通过简单的动词+副词组合（trade off, weigh in, factor in）来表达中文需要多个词才能传达的复杂含义。'],
  [adv, daily, '时间不是用来"省"的，是用来"投资"的——花在什么地方，就收获什么。', "Time isn't something you save — it's something you invest. Where you put it is what you get back.", '"invest time"（投资时间）和"put time"（放置时间）连续使用金钱和空间的隐喻。英语母语者在谈论时间时习惯用经济学术语——ROI、invest、spend、budget、worth——反映了英语文化中时间的高度商品化思维。'],
  [adv, daily, '这个问题本身可能就是错的——也许我们不该问"为什么"，而应该问"为什么不"。', "Maybe the question itself is flawed — perhaps instead of asking 'why', we should be asking 'why not'.", '"why" vs "why not"的对偶式表达在英语中非常经典。英语母语者习惯将问题的框架（framing）本身作为反思的对象——这种元认知层面的讨论在中文日常对话中相对少见。'],
  [adv, daily, '知识和智慧的区别在于：知识是知道西红柿是水果，智慧是知道不要把它放进水果沙拉。', "The difference between knowledge and wisdom? Knowledge is knowing a tomato is a fruit — wisdom is knowing not to put it in a fruit salad.", '这种"A是……B是……"的哲理对偶句式在英语演讲和日常对话中都极为常见。英语母语者习惯用具体、幽默的生活例子来阐释抽象哲理——反映了从具体到抽象的归纳式思维传统。'],
  [adv, daily, '别人怎么对你，很大程度上是被你教会他们的。', "People treat you the way you teach them to — more often than not, you set the standard for how others deal with you.", '"teach them to"（教他们）把人际关系比作教育过程。"set the standard"（设定标准）又引入了商业管理的隐喻。两套不相关的隐喻体系在一句话中无缝切换——高水平的英语思维特征。'],
  [adv, daily, '人生没有彩排，每一天都是正式演出——所以想做的事情现在就开始做吧。', "Life doesn't come with a dress rehearsal — every single day is opening night. So whatever you've been meaning to do, start now.", '"dress rehearsal"（带妆彩排）和"opening night"（首演之夜）连续使用戏剧隐喻来讨论人生。英语中戏剧/表演隐喻的日常化程度远超中文——all the world\'s a stage 的传统可以追溯到莎士比亚。'],

  // --- BEGINNER: Workplace (n96-n110) ---
  [beg, workplace, '你能把这个文件发给我看看吗？我想确认一下细节。', "Can you shoot me that file? I just want to double-check a few details.", '"shoot me"（朝我发射）在口语中表示"快速发给我"。"double-check"（检查两次）是职场高频词——英语母语者习惯用具体数字（double/triple）来修饰抽象动作。'],
  [beg, workplace, '我大概还需要两三天才能完成这个任务。', "I'll need a couple more days to wrap this up — should have it to you by Wednesday.", '"wrap this up"（把这个包好）是职场中最高频的"完成"表达。"a couple more days"比"two or three days"更口语化——"couple"在日常对话中通常不是严格的两个。'],
  [beg, workplace, '你能帮我看一下这封邮件吗？我怕有什么不妥的地方。', "Can you take a quick look at this email? I just want to make sure nothing sounds off.", '"take a quick look"比"check"更口语化。"sound off"（听起来不对）用听觉判断文字——英语中跨感官的判断方式非常普遍（sounds good, looks right, feels wrong）。'],
  [beg, workplace, '我不确定他今天来不来——我给他发消息了但还没回。', "I'm not sure if he's coming in today — I texted him but haven't heard back.", '"coming in"（进来）把上班比作进入办公室这个空间。"hear back"（听到回复）把收到消息比作听到回声——英语中的空间和听觉隐喻无处不在。'],
  [beg, workplace, '不好意思打断一下——我能补充一点吗？', "Sorry to jump in — can I just add one thing?", '"jump in"（跳进来）把插话比作跳入一个正在进行的活动。"just"作为软化语气词在职场对话中的频率极高——英语文化中"不过度占用别人时间"是核心礼貌原则。'],
  [beg, workplace, '这个表格我填完了，你看一下有没有问题。', "I've filled out the form — let me know if anything looks off.", '"filled out"（填满）比"filled in"更常用于表单。"looks off"（看起来不对劲）——英语中的"看起来"经常替代"有"、"存在"、"是"等中文常用的判断词。'],
  [beg, workplace, '我们需要在周五之前把这个搞完——时间有点紧。', "We need to get this done by Friday — it's a bit of a tight squeeze.", '"get this done"（使这件事被做完）——英语中大量使用"get + 宾语 + 过去分词"的使役结构。"tight squeeze"（很紧的挤压）把时间压力空间化。'],
  [beg, workplace, '你觉得我们应该怎么做？我想听听你的看法。', "How do you think we should handle this? I'd love to get your take on it.", '"handle this"（处理这个）把问题比作一个可以拿起来的物体。"your take"（你的理解/看法）——"take"作为名词表示"对事物的理解和反应"。'],
  [beg, workplace, '这个项目的预算已经批了，可以启动了。', "The budget for this project got the green light — we're good to go.", '"got the green light"（拿到绿灯）用交通信号比喻审批。"good to go"（可以走了）是职场最高频的确认表达——简洁、果断，不拖泥带水。'],
  [beg, workplace, '我今天的工作基本上做完了，还有什么需要帮忙的吗？', "I'm pretty much done for the day — anything else I can help with?", '"pretty much done"（基本做完了）——"pretty much"作为程度修饰语在职场口语中的频率远超其他表达。主动问"anything else I can help with"体现了英语职场中的团队协作文化。'],
  [beg, workplace, '不好意思我迟到了——地铁出了点问题。', "Sorry I'm late — there was some issue with the subway.", '"some issue"比"a problem"更委婉——在职场中用模糊语言淡化负面事件是英语沟通的基本策略。不需要详细解释原因，简短说明即可。'],
  [beg, workplace, '这个会议改到下午三点可以吗？', "Can we push this meeting to 3pm?", '"push"（推）作为一个万能动词在职场对话中的灵活性——push a meeting（改时间）、push a deadline（延期）、push an idea（推动想法）。一个简单物理动词涵盖了中文需要不同词表达的多种含义。'],
  [beg, workplace, '我刚入职不久，还在适应中。', "I'm still pretty new here — just trying to find my feet.", '"find my feet"（找到我的脚）是最经典的"适应新环境"英语习语。把适应一个新工作比作站立时寻找平衡的物理感受。'],
  [beg, workplace, '有什么进展记得通知我一声。', "Keep me posted on how it goes.", '"Keep me posted"（像寄信一样持续给我更新）是职场通信中的标准表达。"on how it goes"——"it goes"（事情进展）把工作进度比作向前走的动作。'],
  [beg, workplace, '我可以远程办公吗？今天家里有点事。', "Can I work remotely today? Just got some stuff going on at home.", '"work remotely"是标准表达。"got some stuff going on"用最模糊的语言描述私事——英语职场文化中，处理私人事务时倾向于用语焉不详的方式提及，给对方留出不追问的空间。'],

  // --- INTERMEDIATE: Workplace (n111-n130) ---
  [int, workplace, '我们需要在这些选项中做出权衡——没有一个方案是完美的。', "We need to weigh the trade-offs here — none of these options is going to be perfect.", '"weigh the trade-offs"（权衡取舍）把决策比作称重——职场英语中大量使用商业/经济/物理隐喻。"going to be"用进行时表示将来——英语中将来时的多种形态能表达不同的确定程度。'],
  [int, workplace, '我们的时间线可能需要调整——工程师那边出了问题。', "We might need to adjust our timeline — the engineers hit a snag.", '"hit a snag"（撞到了一个钩破的线头）把技术问题比作挂住衣服的尖锐物体。英语职场中这种视觉化的障碍隐喻（snag, hurdle, bottleneck, roadblock）使用频率极高。'],
  [int, workplace, '我建议我们先做一个小规模的试点，如果效果好再全面铺开。', "I'd suggest we run a small pilot first — if the results hold up, we can roll it out across the board.", '"pilot"（飞行员→试点）把测试阶段比作驾驶测试。"roll out"（滚出来）把全面推广比作铺开卷起来的地毯——两个不同领域的隐喻在一个建议中无缝切换。'],
  [int, workplace, '我们需要重新审视这个策略——市场环境已经变了。', "We need to take a fresh look at this strategy — the market landscape has shifted.", '"take a fresh look"（用新鲜的眼光看）是职场中表达"重新审视"最自然的方式。"landscape shifted"（地貌变了）把市场变化比作地理变化——视觉/空间隐喻贯穿英语职场沟通。'],
  [int, workplace, '我知道这个决定可能会引起争议，但有时候领导者需要做出不受欢迎的选择。', "I know this decision might ruffle some feathers, but sometimes leadership means making the unpopular calls.", '"ruffle some feathers"（弄乱一些羽毛）是英语中最常用的"引起争议/不满"的习语——来自鸟类受到惊扰时羽毛竖起的形象。把人际摩擦比作生物学反应，让尖锐的话题变得不那么刺耳。'],
  [int, workplace, '恕我直言，我们好像一直在同一个地方打转，没有任何实质进展。', "With all due respect, it feels like we've been going around in circles without making any real headway.", '"going around in circles"（绕圈）和"headway"（船向前行驶的进度）——两个空间/交通隐喻并用。英语中大量用运动方向（forward, back, sideways, circular）来描述项目状态。'],
  [int, workplace, '这个问题比较复杂，不是一两句话能说清楚的。', "This is a bit of a can of worms — not something I can unpack in a couple of sentences.", '"can of worms"（一罐虫子）表示一旦打开就无法控制的复杂问题。"unpack"（拆包）把解释复杂概念比作从行李箱里逐一拿出物品。'],
  [int, workplace, '我百分百支持这个方向——如果需要我做什么尽管说。', "I'm a hundred percent behind this — whatever you need from me, just say the word.", '"behind this"（在背后=支持）用空间位置表达态度。"just say the word"（说出那个词就行）用最简单的邀请表达最彻底的支持——轻描淡写中传递力度。'],
  [int, workplace, '我们已经落后于竞争对手了——必须迎头赶上。', "We're falling behind the competition — we need to step up our game.", '"fall behind"（落在后面）和"step up"（向前迈步）——两个方向性动词形象地描述了竞争态势。"game"把商业比作体育比赛——英语职场中体育隐喻的密度是中文的十倍以上。'],
  [int, workplace, '你不用什么都懂——重要的是知道去哪里找答案。', "You don't need to know everything — what matters is knowing where to find the answers.", '"what matters is..."（重要的是……）是英语中表达核心观点的标准句式。这个倒装结构把最重要的内容放在句子后半部分作为焦点——反映了英语中"结尾重音"的信息组织原则。'],
  [int, workplace, '我理解你的顾虑，但如果我们永远不冒风险，就永远不会有突破。', "I get where you're coming from, but if we never stick our neck out, we'll never break new ground.", '"get where you\'re coming from"（懂你从哪里来的）表示理解对方立场。"stick our neck out"（伸出脖子）和"break new ground"（开辟新土地）——两个身体/农业隐喻连续使用，典型的英语思维。'],
  [int, workplace, '这不仅仅是钱的问题——还有品牌的长期声誉。', "It's not just about the money——there's also the long-term reputation of the brand at stake.", '"at stake"（在赌注上）用赌博隐喻表达"利害关系"——在英语职场高频出现。英语文化中将商业视为博弈/游戏的思维模式使赌博隐喻成为职场沟通的基本语汇。'],
  [int, workplace, '我建议我们先把锅里的东西稳住，再考虑新项目。', "I suggest we keep our eye on the ball with what's already on our plate before we take on anything new.", '"keep our eye on the ball"（盯住球）和"on our plate"（在我们的盘子里）——体育隐喻和饮食隐喻在同一个建议中并用。不同领域的隐喻自由组合是英语思维流畅性的标志。'],
  [int, workplace, '如果你不介意的话，我想给你一些坦诚的反馈。', "If you're open to it, I'd love to share some honest feedback with you.", '"If you\'re open to it"（如果你对此持开放态度）是英语中开启反馈对话最委婉礼貌的方式。英语职场文化中对"征求同意再给反馈"的重视远超中文——反映了对个人边界的尊重。'],
  [int, workplace, '我们现在的瓶颈是人力不足——不是资金问题。', "Our bottleneck right now is bandwidth, not funding.", '"bottleneck"（瓶子的脖子）和"bandwidth"（带宽）——同时使用容器隐喻和科技隐喻来描述商业问题。英语职场术语中，将抽象商业概念映射到日常实物/科技词汇的能力是专业度的体现。'],
  [int, workplace, '我只是想确保我们对优先级的理解是一致的。', "I just want to make sure we're on the same page about priorities.", '"on the same page"（在同一页上）是职场中最核心的协调表达——把团队协作比作一起阅读同一本书。"just"作为软化语气的副词，在职场英语中几乎每句话都要用。'],
  [int, workplace, '这个方案我建议先冷一冷——等我们有更多数据再重新讨论。', "I'd suggest we park this idea for now — circle back to it once we have more data.", '"park"（停车）和"circle back"（绕回来）——汽车/交通隐喻。英语中"park it"已经成为"暂时搁置"的标准表达，而"circle back"则是"之后再讨论"的通用说法。'],
  [int, workplace, '好的想法如果执行不到位也会以失败告终——细节决定成败。', "A good idea with poor execution is just a bad idea waiting to happen — the devil's in the details.", '"waiting to happen"（等待发生）把潜在失败比作一个在排队的事件。"the devil\'s in the details"（魔鬼在细节里）——用宗教意象来表达职场真理，反映了英语文化中宗教习语的世俗化。'],
  [int, workplace, '你不需要现在就有完美的方案——先拿出一个粗糙的版本，我们再迭代。', "You don't need the perfect solution right now — just come up with a rough draft and we'll iterate from there.", '"rough draft"（粗糙草稿）和"iterate"（迭代）——写作和编程隐喻融合。英语职场中"iterate"的使用标志着一种特定的思维模式：接受不完美、通过修改逐步完善——这是硅谷思维对英语的影响。'],
  [int, workplace, '跨部门沟通一直是个难题——大家都站在自己的立场上看问题。', "Cross-functional communication is always tricky — everyone's looking at things through their own lens.", '"through their own lens"（通过自己的镜头/滤镜）把个人视角比作相机的镜头。英语中大量摄影/视觉隐喻（lens, perspective, angle, view, focus）被用于描述抽象的人际认知。'],

  // --- ADVANCED: Workplace (n131-n145) ---
  [adv, workplace, '永远不要为了短期的利益牺牲长期的信任——信任一旦失去，几乎不可能挽回。', "Never trade long-term trust for short-term gain — once trust is broken, it's next to impossible to win back.", '"trade X for Y"（用X交换Y）用商业术语表达道德判断。"next to impossible"（挨着不可能=几乎不可能）——用空间隐喻来表达概率。'],
  [adv, workplace, '我不同意你的观点，但我希望你赢——这两者并不矛盾。', "I don't agree with your approach, but I'm rooting for you to succeed — the two aren't mutually exclusive.", '"rooting for you"（为你呐喊）用体育观众的比喻表达支持。"mutually exclusive"（互相排斥）用逻辑学术语——英语中逻辑学词汇在日常对话中的渗透程度远高于中文。'],
  [adv, workplace, '在任何谈判中，最有权力的人是那个可以说"不"然后转身走掉的人。', "In any negotiation, the person with the most power is the one who can say 'no' and walk away.", '"walk away"（走开）是谈判心理学中最有力量的动作。英语中这个简单短语浓缩了"放弃交易的能力=谈判优势"的完整哲理——一种以行动为核心的权力观。'],
  [adv, workplace, '领导者最好的投资不是给团队买工具，而是给他们信任和犯错的空间。', "The best investment a leader can make isn't in tools — it's in giving their team trust and the room to make mistakes.", '"room to make mistakes"（犯错误的空间）把抽象的自由比作物理空间。"investment"把领导力比作经济决策——英语文化中对"软性投入"的重视使得"信任"被视为一种可量化的资产。'],
  [adv, workplace, '不要试图让所有人都满意——连水都不能让所有人满意，因为它既能让船浮起来也能让船沉下去。', "Don't try to please everyone — even water can't do that. It floats ships, but it also sinks them.", '"floats ships...sinks them"用水的两面性作哲理对比。英语文化中这种用自然界现象来阐释人际道理的思维方式源远流长——从伊索寓言到现代TED演讲。'],
  [adv, workplace, '一个真正好的领导不需要事事亲力亲为——你只需要创造一个能让别人发挥最好的环境。', "A truly great leader doesn't need to have their hands in everything — you just need to create an environment where others can do their best work.", '"have their hands in everything"（手伸进每个地方）用身体隐喻表达"亲力亲为"。"environment"（环境）暗示一种生态系统的思维方式——领导力不是控制而是培育。'],
  [adv, workplace, '我总是告诉新人：在前三个月，多听少说——你的耳朵比你的嘴更值钱。', "I always tell new hires: for the first three months, listen more than you talk — your ears are worth more than your mouth.", '"worth more"（更值钱）把倾听和说话的价值直接量化。英语文化中这种将沟通技能价值"市场化"的表达方式反映了高度商业化的思维模式。'],
  [adv, workplace, '创新不是关于想出惊天动地的想法——而是关于解决一个真实的问题，用一种之前没有人试过的方式。', "Innovation isn't about coming up with earth-shattering ideas — it's about solving a real problem in a way nobody has tried before.", '"earth-shattering"（震碎地球的）用极端物理隐喻表示"惊天动地"。英语中大量使用夸张的物理破坏隐喻（mind-blowing, groundbreaking, earth-shattering）来形容创新程度。'],
  [adv, workplace, '如果你想让团队有主人翁意识，就不能告诉他们每个步骤怎么做——给他们目标，让他们自己找路。', "If you want your team to take ownership, stop telling them how to do every step — give them the destination and let them figure out the route.", '"take ownership"（获取所有权）把责任意识比作物权。"destination vs route"（目的地vs路线）用旅行隐喻来阐释管理哲学——目标是目的地，方法是路线，两个是不同的事情。'],
  [adv, workplace, '在重要决策面前，情绪是你的敌人——深呼吸，让理性回到驾驶座上。', "When facing a big decision, your emotions are not your friend — take a breath and let rationality get back behind the wheel.", '"behind the wheel"（在方向盘后面）用驾驶隐喻表达理性控制。英语中"在驾驶座上"被广泛使用来表示"处于掌控地位"——汽车文化对英语隐喻系统的深远影响。'],
  [adv, workplace, '你不能用制造问题时的同一个思维水平来解决问题——你需要升级你的思维。', "You can't solve a problem with the same level of thinking that created it — you need to level up your mindset.", '"level up"（升级）源于电子游戏术语，已经全面进入职场英语——"level up your skills/mindset/career"是当代英语最活跃的表达之一。游戏文化对英语的影响在年轻一代中尤为显著。'],
  [adv, workplace, '高效的团队不是没有冲突的团队，而是懂得如何从冲突中提炼出更好的方案的团队。', "A high-performing team isn't one without conflict — it's one that knows how to turn conflict into better solutions.", '"turn X into Y"（把X变成Y）——这个转化学的隐喻是英语中表达变化最核心的句式。"high-performing"用绩效/运动术语评价团队——英语思维中对"可量化表现"的执着。'],
  [adv, workplace, '你的价值不取决于你每天工作多少小时，而是你能解决什么样的问题。', "Your value isn't measured in how many hours you put in — it's measured in what kind of problems you can solve.", '"put in hours"（投入时间）和"measured in"（用什么来衡量）——同时使用投资隐喻和度量隐喻。英语思维中"价值"被高度量化和商品化——你能被"衡量"为多少价值。'],
  [adv, workplace, '企业文化不是墙上挂的那些口号——是当没人监督时大家真正在做什么。', "Company culture isn't the slogans on the wall — it's what people actually do when nobody's watching.", '"nobody\'s watching"（没人在看着）把企业文化比作一个道德测试——当"监督的眼睛"消失时，真实的行为才暴露出来。英语思维中对"unseen behavior"的重视反映了清教徒式的自律传统。'],
  [adv, workplace, '做减法比做加法更需要判断力——告诉你不能做什么，比告诉你能做什么更重要。', "Knowing what to cut is harder than knowing what to add — the most valuable thing a leader can say is 'no, we're not doing that'.", '"cut vs add"（减vs加）用数学计算隐喻表达战略决策。"no, we\'re not doing that"（不，我们不做那个）——将"说不"视为领导力的核心技能，反映了英语文化中对"选择性放弃"的战略价值的认可。'],

  // --- BEGINNER: Social (n146-n160) ---
  [beg, social, '你看起来气色不错！最近在做什么？', "You look great! What have you been up to?", '"What have you been up to?"（你一直忙什么）是英语中最自然的寒暄开场。用现在完成进行时表达对对方近期生活的关心——比"What are you doing"礼貌得多。'],
  [beg, social, '好久不见！你一点都没变！', "Long time no see! You haven't changed a bit!", '"Long time no see"本身就是一个有趣的例子——这其实是洋泾浜英语（模仿中文"好久不见"的字面翻译），现在已经成为标准英语表达。这是语言交流中双向影响的证明。'],
  [beg, social, '你周末过得怎么样？', "How was your weekend?", '英语文化中询问周末是周一的标准社交仪式。这个问题通常不需要详细回答——"Pretty good"或"Nice and relaxing"就足够了。反映了英语社交中"轻触式"寒暄的习惯。'],
  [beg, social, '好啊，改天咱们一起吃饭吧！', "That sounds great — let's grab lunch sometime!", '"grab lunch"（抓一个午餐）——"grab"在社交口语中用于一切快速轻松的活动（grab coffee/drink/bite）。"sometime"故意模糊时间——英语社交中的模糊邀约是一种礼貌策略。'],
  [beg, social, '你们俩是怎么认识的？', "So how did you two meet?", '这个问题是英语社交中最自然的好奇表达。"So"作为对话转换词，在英语口语中的功能远比中文的"那"丰富——可以表示好奇、总结、转话题、追问等多种功能。'],
  [beg, social, '你喝点什么？我请客。', "What are you having? It's on me.", '"What are you having?"（你在喝/吃什么）——用进行时把点单描述为一个进行中的过程。"on me"（在我身上/我买单）用最简短的空间隐喻完成了一个完整的请客行为。'],
  [beg, social, '不用客气，就当在自己家一样。', "Make yourself at home — seriously, don't be shy.", '"Make yourself at home"（把你自己当作在家一样自便）是最经典的英语待客语。"seriously"在口语中作为强调填充词——英语母语者习惯在祈使句后加一个强化词来消除对方的犹豫。'],
  [beg, social, '我先走了，你们玩得开心！', "I'm gonna head out — you guys have fun!", '"head out"（把头朝向外面）是最高频的"离开"表达。"you guys"作为第二人称复数在美式英语中几乎取代了所有其他形式——无论性别、年龄、场合，都在用。'],
  [beg, social, '生日快乐！许个愿吧！', "Happy birthday! Make a wish!", '"Make a wish"用最简洁的祈使句表达生日祝福。英语文化中的仪式性短语通常简洁直接——没有人会在生日时说"请你在心里许下一个美好的愿望"。'],
  [beg, social, '你刚才说什么？我没听清楚。', "Sorry, what was that? I didn't quite catch it.", '"catch it"（抓住）——听觉理解被比作用手抓住物体。这种将感官接收比作物理抓取的语言习惯在英语中极为普遍（catch what someone said, grasp a concept）。'],
  [beg, social, '咱们能坐窗边那个位置吗？', "Can we grab that spot by the window?", '"grab a spot"（抓一个位置）——"grab"再次出现。在英语社交口语中，"grab"几乎可以用来搭配任何名词（grab a seat/table/taxi/deal），一个动词覆盖了中文中"拿、占、要、订、抢"等不同动词的功能。'],
  [beg, social, '你决定好了吗？还是需要再看看？', "Have you made up your mind? Or do you need another minute?", '"made up your mind"（把你的头脑组装好）表示做决定。蕴含的思维模式是：做决定=把分散的想法组装成形。"another minute"（再多一分钟）——"minute"在口语中经常不严格表示分钟。'],
  [beg, social, '跟你聊天特别开心，下次咱们再聚！', "It was so great catching up — let's do this again soon!", '"catching up"（追上彼此的近况）是社交中最核心的表达之一。将朋友叙旧比作"追上对方的进度"——英语思维中人际关系被隐喻化为一种"进度条"。'],
  [beg, social, '不好意思，我不是故意的。', "Sorry, I didn't mean to.", '"didn\'t mean to"（不是故意的/不想那样做）是英语道歉的最短版本。省略了动词（mean to do what?）——英语中省略已知信息的习惯让道歉非常简洁有力。'],
  [beg, social, '我可以坐这里吗？', "Is this seat taken?", '"Is this seat taken?"（这个座位被占了吗）——用被动语态礼貌地询问。不说"Can I sit here"而问座位的状态，把"人想坐"变成"座位是否已被占用"的客观询问——这是英语礼貌策略的典型思维。'],

  // --- INTERMEDIATE: Social (n161-n180) ---
  [int, social, '我听到一个传言，不知道是真是假——你们听说了吗？', "I heard through the grapevine — not sure if it's true though. Have you guys heard anything?", '"through the grapevine"（通过葡萄藤）——这个经典习语源于电报线路像葡萄藤一样缠绕的视觉形象。英语社交中传播小道消息有一套完整的隐喻体系。'],
  [int, social, '有些话我觉得还是当面说比较好——不想让你误会。', "I feel like this is better said in person — I don't want you to take it the wrong way.", '"take it the wrong way"（从错误的路理解）——把理解比作选择一条路径。英语中大量使用方向/路径隐喻来描述沟通过程。'],
  [int, social, '他不回我消息已经三天了——我在想是不是我哪里得罪他了。', "He's been ghosting me for three days now — I keep wondering if I did something to rub him the wrong way.", '"ghosting"（像鬼魂一样消失）是当代英语中最活跃的社交新词之一。"rub him the wrong way"（逆着毛的方向蹭）用抚摸猫狗的比喻描述得罪人——身体隐喻在英语社交表达中的创造力无穷无尽。'],
  [int, social, '你最近是不是瘦了？你看起来状态特别好！', "Have you lost weight? You look amazing — whatever you're doing, it's working.", '"whatever you\'re doing, it\'s working"（不管你在做什么，它有效果）——英语社交中赞美他人外表变化时，用"your method is working"这种间接方式来表达，比直接分析对方的外表更礼貌。'],
  [int, social, '他这个人很直——想到什么说什么，有时候可能会让人不舒服。', "He's very direct — he calls it like he sees it, which can rub people the wrong way sometimes.", '"calls it like he sees it"（他看到什么就说什么）——用体育裁判的比喻来描述性格直率。英语中对他人性格的评价往往通过一个具体的习惯动作来表达，而不是抽象形容。'],
  [int, social, '你说的我都有认真听——但我的出发点和你的可能不太一样。', "I hear you, I really do — but I think I'm coming at this from a different angle.", '"hear you"在英语中不只是听觉上的听到，而是"我理解你的观点"——听觉动词在英语中承担了大量认知功能。"come at from a different angle"用几何学描述观点差异。'],
  [int, social, '我不太擅长说这种话，但我真的很感激你一直以来对我的支持。', "I'm not great at saying this kind of thing, but I really appreciate you sticking by me through all of this.", '"sticking by me"（粘在我旁边）表达"一直给予支持"——物理附着的隐喻。"not great at saying this kind of thing"先用自嘲降低期待——英语文化中表达深情前习惯先做免责声明。'],
  [int, social, '不是你不够好，而是时机不对——你们俩现在的节奏不在一个频道上。', "It's not that you're not good enough — it's just the timing is off. You two are just on different wavelengths right now.", '"timing is off"（时机不对）把人际关系比作钟表。"on different wavelengths"（在不同波长上）用无线电比喻两个人的默契——科技隐喻在情感话题中的应用。'],
  [int, social, '我知道你现在很难受，但相信我，这些经历以后回头看都是你最宝贵的财富。', "I know it sucks right now, but trust me — one day you'll look back on this as the thing that made you who you are.", '"the thing that made you who you are"（那个让你成为现在的你的事情）——英语中把痛苦经历重新定义为塑造身份的关键因素。这种"现在痛苦=未来成长"的叙事框架在英语文化中非常普遍。'],
  [int, social, '有些人走进你的生活是为了教会你一些东西，而不是为了留下来。', "Some people come into your life to teach you something, not to stay — and that's okay.", '"come into your life"（走进你的生活）——英语中人际关系被大量空间化：进入/走出/经过/停留在某人的生活中。最后加"and that\'s okay"是一种英语特有的安抚句式——用一个简单的认可来给复杂的情感做结。'],
  [int, social, '我能感觉到气氛有点不对劲——大家是不是有什么事没说出来？', "I'm picking up on something here — feels like there's something nobody's saying out loud.", '"pick up on"（探测到/接收到）把社交直觉比作雷达探测信号。"something nobody\'s saying out loud"（没人说出声的东西）——英语中区分"说出声"和"没说出声"的沟通层次。'],
  [int, social, '我真的很想去，但最近忙得四脚朝天，等我缓过这阵子再说？', "I'd really love to, but I've been swamped lately — can I take a rain check and circle back when things settle down?", '"swamped"（被沼泽淹没）、"rain check"（改期的票根）、"circle back"（绕回来）——一句话中连续使用自然/体育/交通三个不同领域的隐喻。'],
  [int, social, '我们认识这么多年了，不用说太多，一个眼神就知道对方在想什么。', "We've known each other for so long now, we don't need to say much — just a look and we know exactly what the other's thinking.", '"just a look and we know"（一个眼神就知道）用最精简的结构表达最深的默契。英语中表达深厚感情时反而倾向于用短句和简单的并列结构，显得更真实。'],
  [int, social, '我不确定我们是不是还有共同语言了——感觉你变了，或者是我变了。', "I'm not sure we're speaking the same language anymore — feels like you've changed, or maybe I have.", '"speaking the same language"（说同一种语言）用语言沟通的隐喻表达价值观契合。"or maybe I have"——英语思维中的自我反思习惯：在指出别人的变化时，加上对自己也可能变化的承认。'],
  [int, social, '这件事我站在你这边——不管发生什么，你有我在。', "I've got your back on this — no matter what happens, I'm in your corner.", '"got your back"（护着你的后背）和"in your corner"（在你的拳击角落）——两个连续的对抗/战斗隐喻表达支持。英语中的忠诚和支持大量通过身体保护/战斗协作的隐喻来表达。'],
  [int, social, '你不需要为了让别人舒服而委屈自己——说"不"是完全OK的。', "You don't need to bend over backwards to make everyone comfortable — it's totally OK to say no.", '"bend over backwards"（向后弯腰到极致）——身体柔韧性隐喻表达过度迁就。"totally OK"——用"absolutely completely fine"的强化版本来帮助对方摆脱心理压力。'],
  [int, social, '很多人觉得强势就是大声说话，其实真正的强势是安静地知道自己要什么。', "A lot of people think being assertive means being loud — but real strength is quietly knowing what you want and not apologizing for it.", '"assertive"这个词本身就是英语文化的产物——它表达了一种"既不具有攻击性也不被动"的中间状态，中文里没有完全对应的词。"not apologizing for it"（不为之道歉）——英语文化中对"不需要为自己合理需求道歉"的强调。'],
  [int, social, '你把别人的看法看得太重了——大多数人对你其实没那么在意。', "You care way too much about what other people think — the truth is, most people are way too busy thinking about themselves to think about you.", '"way too much"（远远太多）中的"way"作为程度副词在口语中的频率远超"very"或"really"。英语中安慰人的方式经常是用一个"解放性的真相"来缓解对方的焦虑。'],
  [int, social, '朋友不是用来比较的——每个人出现在你的生命里都有不同的意义。', "Friends aren't there to be compared — each person comes into your life for a different reason.", '"aren\'t there to be compared"（不是用来被比较的）——英语中"be there to..."这个结构表达存在目的/意义，简洁有力。"come into your life"再次使用空间隐喻。'],
  [int, social, '我最好的朋友说过一句话我一直记得：在你成功时为你鼓掌的人很多，在你低谷时陪你的人很少——珍惜后者。', "My best friend once told me something I've never forgotten: the room is always full when you're winning, but it gets real quiet when you're not — treasure the ones who stay.", '"the room is full"和"gets real quiet"——用空间的拥挤/空旷来比喻社交圈的冷热。英语中这种将一个物理场景映射到人际关系的手法非常普遍，比抽象描述更有画面冲击力。'],

  // --- ADVANCED: Social (n181-n200) ---
  [adv, social, '真正的倾听不是等着轮到你说话——是暂时放下自己的故事，走进对方的世界。', "Real listening isn't waiting for your turn to talk — it's setting aside your own story for a moment and stepping into someone else's world.", '"waiting for your turn"（等着轮到你）把对话比作排队。"stepping into someone else\'s world"（走进别人的世界）——将理解和共情比作物理上的空间移动，是英语中最核心的共情隐喻。'],
  [adv, social, '有时候最深的连接不是通过语言，而是通过沉默——两个人什么都不说，却什么都懂了。', "Sometimes the deepest connection isn't through words — it's through silence. Two people saying nothing, but understanding everything.", '"saying nothing, but understanding everything"——英语中这种对偶式表达（nothing vs everything）是表达深刻情感的经典句式。将相反的极端并列在一起，产生一种诗意的张力。'],
  [adv, social, '原谅别人不代表你软弱——恰好相反，那是你从过去的枷锁中释放自己的最强有力的方式。', "Forgiving someone doesn't mean you're weak — quite the opposite. It's the most powerful way to free yourself from the chains of the past.", '"free yourself from the chains of the past"（从过去的枷锁中释放自己）——英语中将心理状态比作物理束缚（chains/prison/cage/weight）的隐喻系统极为发达。"quite the opposite"（恰恰相反）是高级口语中常用的强力转折。'],
  [adv, social, '我慢慢学会了辨别两种批评：一种是为了让你变好，另一种是为了让你变小——第一种值得听，第二种不值得。', "I've slowly learned to tell apart two kinds of criticism: the kind that's meant to make you better, and the kind that's meant to make you smaller. One is worth listening to — the other isn't.", '"make you better" vs "make you smaller"（让你更好 vs 让你更小）——用方向性形容词（更好/更小）来区分批评的性质。"tell apart"（分辨开）用空间"开"来比喻认知分辨。'],
  [adv, social, '最好的关系不是互相需要，而是互相选择——需要是依赖，选择是自由。', "The best relationships aren't built on need — they're built on choice. Need is dependency; choice is freedom.", '"built on"（建立在……之上）——英语中人际关系大量使用建筑隐喻（build, foundation, structure, support）。"need vs choice"的对偶表达了从依赖到自由的哲学转变——两句短话说完一个复杂的道理。'],
  [adv, social, '我们都戴着不同的面具见不同的人——真正的亲密是你可以摘下面具而不用担心被评判。', "We all wear different masks for different people — true intimacy is when you can take yours off without being afraid of being judged.", '"wear masks"（戴面具）——表演隐喻在英语社交分析中占核心地位。戈夫曼的戏剧理论（the world as a stage）深深影响了英语母语者对社交行为的理解。'],
  [adv, social, '别害怕冲突——回避重要对话的代价远大于进行一次不舒服的交流。', "Don't be afraid of conflict — the cost of avoiding an important conversation is far greater than the cost of having an uncomfortable one.", '"the cost of X is greater than the cost of Y"（X的代价大于Y的代价）——用经济学的成本-收益框架分析人际关系。英语思维中"cost"被广泛延伸到非经济领域——情感成本、社交成本、心理成本。'],
  [adv, social, '你永远不可能让所有人都喜欢你——事实上，如果你让所有人都喜欢你，你大概没有真正做自己。', "You'll never get everyone to like you — in fact, if everyone likes you, you're probably not being fully yourself.", '"not being fully yourself"（没有完全做自己）——英语文化中对"authenticity"（真实性）的高度重视。"being yourself"几乎是英语社交哲学的终极目标之一。'],
  [adv, social, '成熟的一个标志是：你可以不同意一个人的所有观点，但仍然尊重他作为一个人的价值。', "One sign of maturity is being able to disagree with everything someone stands for and still respect their worth as a human being.", '"everything someone stands for"（一个人所代表的一切）——用站立的隐喻表达价值观。"worth as a human being"（作为人的价值）——英语中对"human dignity"概念的强调反映了启蒙运动以来的人权传统。'],
  [adv, social, '有些人的出现就像你生命中的过客——他们来了，留下一课，然后离开。感恩，然后放手。', "Some people are just passing through your life — they show up, leave a lesson, and move on. Be grateful, and let them go.", '"passing through"（经过）、"show up"（出现）、"move on"（继续前进）、"let go"（放手）——四个连续的空间/运动隐喻完整讲述了一段人际关系从开始到结束的过程。英语中对人生阶段的叙事几乎完全依赖空间隐喻。'],
];

// Format each exercise
for (let i = 0; i < templates.length; i++) {
  const [difficulty, category, chineseText, nativeEnglish, thinkingPattern] = templates[i];
  const id = `n${51 + i}`;
  const escape = (s) => s.replace(/'/g, "\\'").replace(/\n/g, ' ');
  newExercises.push(`  { id:'${id}', chineseText:'${escape(chineseText)}', nativeEnglish:'${escape(nativeEnglish)}', thinkingPattern:'${escape(thinkingPattern)}', difficulty:'${difficulty}', category:'${category}' },`);
}

// Replace closing ]; with new exercises + closing
const closingIdx = content.lastIndexOf('];');
const beforeClose = content.slice(0, closingIdx);
const afterClose = content.slice(closingIdx + 2);

const newContent = beforeClose + '\n' + newExercises.join('\n') + '\n];' + afterClose;

fs.writeFileSync(TARGET, newContent, 'utf8');
console.log(`Added ${templates.length} exercises. Total should be ${50 + templates.length}.`);
