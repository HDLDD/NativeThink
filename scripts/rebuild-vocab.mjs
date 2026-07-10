import fs from 'fs';

function W(id,word,phon,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  const e=s=>(s||'').replace(/'/g,"\\'").replace(/"/g,'\\"');
  return `W('${id}','${e(word)}','${e(phon)}','${e(pos)}','${e(mean)}',[${(coll||[]).map(c=>`'${e(c)}'`).join(',')}],'${reg}','${emo}','${freq}',${noCn||false},'${e(ex)}','${e(exT)}','${e(deep)}')`;
}

const f=[];
f.push({id:'f1',name:'情绪表达',desc:'描述各种情绪状态的母语级词汇',words:[
['1-1','serendipity','/ˌserənˈdɪpəti/','n.','意外发现美好事物的运气',['pure serendipity','by serendipity'],'neutral','positive','medium',true,'Finding that book was pure serendipity.','找到那本书纯属意外之喜。','强调意外与美好的结合。'],
['1-2','melancholy','/ˈmelənkɒli/','n./adj.','忧郁的淡淡的忧伤',['a melancholy mood','deep melancholy'],'formal','negative','medium',false,'There was a touch of melancholy in his voice.','他的声音里带着一丝忧郁。','比sad更文学化指深沉持久的忧伤。'],
['1-3','content','/kənˈtent/','adj.','满足的心安的',['content with life','perfectly content'],'neutral','positive','high',false,'She seems content with her simple life.','她似乎对简单的生活感到满足。','知足的状态平静的满足感。'],
['1-4','ecstatic','/ɪkˈstætɪk/','adj.','狂喜的',['absolutely ecstatic','ecstatic about'],'neutral','positive','medium',false,'The team was ecstatic after winning the championship.','赢得冠军后团队欣喜若狂。','比happy强度高得多。'],
['1-5','nostalgic','/nɒˈstældʒɪk/','adj.','怀旧的',['feel nostalgic','nostalgic memories'],'neutral','positive','medium',false,'Looking at old photos makes me nostalgic.','看老照片让我感到怀旧。','包含怀念过去的美好与伤感。'],
['1-6','petrified','/ˈpetrɪfaɪd/','adj.','吓呆的',['absolutely petrified','petrified of'],'neutral','negative','medium',false,"I'm petrified of public speaking.",'我超级害怕公开演讲。','比scared强烈得多表示吓到僵住。'],
['1-7','overwhelmed','/ˌəʊvəˈwelmd/','adj.','不知所措的',['feel overwhelmed','completely overwhelmed'],'neutral','negative','high',false,'She felt overwhelmed by all the assignments.','所有作业让她不堪重负。','被太多事物压垮的状态。'],
['1-8','grateful','/ˈɡreɪtfʊl/','adj.','感激的',['deeply grateful','eternally grateful'],'neutral','positive','high',false,"I'm so grateful for your support.",'我非常感激你的支持。','比thankful更强调深刻的感谢。'],
['1-9','resentful','/rɪˈzentfʊl/','adj.','怨恨的',['feel resentful','bitterly resentful'],'neutral','negative','medium',false,'He felt resentful about being passed over.','他因被跳过升职而耿耿于怀。','长期积压的不满。'],
['1-10','exhilarated','/ɪɡˈzɪləreɪtɪd/','adj.','极度兴奋的',['feel exhilarated','absolutely exhilarated'],'formal','positive','medium',false,'She felt exhilarated after the marathon.','完成马拉松后她感到无比兴奋。','带有刺激和活力的兴奋感。'],
['1-11','bewildered','/bɪˈwɪldəd/','adj.','困惑的迷茫的',['completely bewildered','look bewildered'],'neutral','negative','medium',false,'He looked bewildered by the complex instructions.','他看着复杂的说明一脸迷茫。','比confused更强烈不知所措。'],
['1-12','apprehensive','/ˌæprɪˈhensɪv/','adj.','担忧的不安的',['feel apprehensive','apprehensive about'],'formal','negative','medium',false,"She's apprehensive about starting a new job.",'她对开始新工作感到不安。','对即将发生事情的模糊忧虑。'],
['1-13','elated','/ɪˈleɪtɪd/','adj.','兴高采烈的',['feel elated','absolutely elated'],'neutral','positive','medium',false,'He was elated when he heard the good news.','听到好消息他兴高采烈。','情绪高涨的状态。'],
['1-14','flabbergasted','/ˈflæbəɡɑːstɪd/','adj.','大吃一惊的',['absolutely flabbergasted','completely flabbergasted'],'informal','neutral','low',false,'I was flabbergasted when I saw the price tag.','看到价格标签我大吃一惊。','非常口语化带幽默色彩。'],
['1-15','indifferent','/ɪnˈdɪfrənt/','adj.','漠不关心的',['completely indifferent','remain indifferent'],'neutral','negative','medium',false,"She's indifferent to what others think.",'她对别人的想法完全不在乎。','强调不在乎而非没注意到。'],
]]});

f.push({id:'f2',name:'职场沟通',desc:'工作场景中的高频精准词汇',words:[
['2-1','leverage','/ˈliːvərɪdʒ/','v./n.','利用资源杠杆',['leverage resources','leverage connections'],'formal','positive','high',true,'We need to leverage our existing partnerships.','我们需要利用现有的合作。','强调放大效果地利用。'],
['2-2','actionable','/ˈækʃənəbl/','adj.','可执行的',['actionable steps','actionable insights'],'formal','positive','high',false,'Please give me actionable suggestions.','请给我可执行的建议。','具体可操作的。'],
['2-3','bandwidth','/ˈbændwɪdθ/','n.','精力时间资源',['have bandwidth','limited bandwidth'],'informal','neutral','high',true,"I don't have the bandwidth for another project.",'我没精力再接新项目了。','源自IT术语引申为时间精力。'],
['2-4','streamline','/ˈstriːmlaɪn/','v.','精简优化流程',['streamline operations','streamline the process'],'formal','positive','high',false,"We're streamlining our onboarding process.",'我们在精简入职流程。','去除不必要步骤提高效率。'],
['2-5','align','/əˈlaɪn/','v.','对齐保持一致',['align goals','stay aligned'],'formal','neutral','high',false,"Let's make sure our priorities are aligned.",'先确保优先级一致。','方向性统一。'],
['2-6','iterate','/ˈɪtəreɪt/','v.','迭代反复改进',['iterate on','iterate quickly'],'neutral','positive','high',false,"We'll iterate on this design.",'我们会迭代改进这个设计。','反复修改不断接近最优。'],
['2-7','stakeholder','/ˈsteɪkhəʊldə(r)/','n.','利益相关方',['key stakeholders','engage stakeholders'],'formal','neutral','high',false,'We need buy-in from all stakeholders.','我们需要所有利益相关方认可。','与项目有利害关系的人。'],
['2-8','deliverable','/dɪˈlɪvərəbl/','n.','交付物',['key deliverables','meet deliverables'],'formal','neutral','high',false,'What are the key deliverables for this quarter?','这个季度关键交付物是什么？','项目管理核心词。'],
['2-9','onboarding','/ˈɒnbɔːdɪŋ/','n.','入职流程',['onboarding process','smooth onboarding'],'neutral','positive','high',true,"We've redesigned our onboarding.",'我们重新设计了入职流程。','新人适应融入的过程。'],
['2-10','pivot','/ˈpɪvət/','v./n.','转型转向',['pivot strategy','make a pivot'],'neutral','neutral','high',false,'The startup pivoted from B2C to B2B.','创业公司从toC转向了toB。','核心业务的重大转变。'],
['2-11','scalable','/ˈskeɪləbl/','adj.','可扩展的',['scalable solution','highly scalable'],'formal','positive','high',false,'We need a scalable solution as we grow.','我们需要可扩展的方案。','能适应增长的。'],
['2-12','synergy','/ˈsɪnədʒi/','n.','协同效应',['create synergy','team synergy'],'formal','positive','medium',false,'The merger should create significant synergies.','这次合并应产生显著的协同效应。','1+1大于2的整体效果。'],
['2-13','touchpoint','/ˈtʌtʃpɔɪnt/','n.','接触点',['customer touchpoint','brand touchpoint'],'neutral','neutral','medium',true,'Every customer touchpoint should reflect our brand.','每个客户接触点都应体现品牌。','客户与品牌互动的节点。'],
['2-14','granular','/ˈɡrænjʊlə/','adj.','细致入微的',['granular data','at a granular level'],'formal','neutral','medium',false,'We need a more granular analysis.','我们需要更细致的分析。','深入到最细节层面。'],
['2-15','onus','/ˈəʊnəs/','n.','责任义务',['onus of proof','onus is on'],'formal','neutral','medium',false,'The onus is on us to prove the product is safe.','证明产品安全的责任在我们身上。','比responsibility更正式具体。'],
]]});

f.push({id:'f3',name:'社交互动',desc:'日常社交场景中的地道表达',words:[
['3-1','vibe','/vaɪb/','n.','氛围感觉气场',['good vibes','weird vibe'],'informal','neutral','high',true,"There's a really chill vibe here.",'这里氛围超放松的。','中文气场氛围只能部分对应。'],
['3-2','small talk','/smɔːl tɔːk/','n.','寒暄闲聊',['make small talk','awkward small talk'],'neutral','neutral','high',false,'We made some small talk before the meeting.','会议开始前闲聊了几句。','避免沉默的轻松闲聊。'],
['3-3','charisma','/kəˈrɪzmə/','n.','个人魅力',['natural charisma','lack charisma'],'formal','positive','medium',false,"He's a good speaker but lacks charisma.",'他演讲不错但缺乏个人魅力。','比charm更有领导力意味。'],
['3-4','hang out','/hæŋ aʊt/','v.','一起玩消磨时间',['hang out with friends','just hanging out'],'informal','positive','high',false,"We're just hanging out at my place.",'我们正在我家待着呢。','最常用的非正式相聚。'],
['3-5','catch up','/kætʃ ʌp/','v.','叙旧了解近况',['catch up with','grab coffee and catch up'],'informal','positive','high',false,"It's been ages! We should catch up.",'好久不见！应该叙叙旧。','朋友久别重逢最常用。'],
['3-6','awkward','/ˈɔːkwəd/','adj.','尴尬的',['awkward silence','feel awkward'],'neutral','negative','high',true,'There was an awkward silence.','出现了一阵尴尬的沉默。','比embarrassed使用场景更广。'],
['3-7','genuine','/ˈdʒenjuɪn/','adj.','真诚的',['genuine smile','genuine interest'],'neutral','positive','high',false,"She's one of the most genuine people I know.",'她是我认识最真诚的人之一。','不虚伪不做作的真实。'],
['3-8','bond','/bɒnd/','v./n.','建立亲密关系',['bond with','bond over'],'neutral','positive','high',false,'We bonded over our shared love of hiking.','我们因共同热爱徒步而建立了感情。','比connect更有感情深度。'],
['3-9','mingle','/ˈmɪŋɡl/','v.','交际',['mingle with','mix and mingle'],'neutral','neutral','medium',false,'The event is great for mingling with industry leaders.','这活动是与行业领袖交际的好机会。','在人群中走动和不同人简短交谈。'],
['3-10','rapport','/ræˈpɔː(r)/','n.','融洽关系',['build rapport','establish rapport'],'formal','positive','medium',false,'She quickly built good rapport with her students.','她很快和学生们建立了融洽关系。','相互理解和良好沟通的和谐关系。'],
['3-11','camaraderie','/ˌkæməˈrɑːdəri/','n.','同志情谊',['sense of camaraderie','team camaraderie'],'formal','positive','medium',true,'There is a real sense of camaraderie among the team.','团队中有一种真正的同志情谊。','比friendship更强调共同奋斗。'],
['3-12','banter','/ˈbæntə(r)/','n./v.','轻松的玩笑',['friendly banter','witty banter'],'informal','positive','medium',true,'The banter between the hosts made the show fun.','主持人间的调侃让节目很有趣。','中文调侃斗嘴都不完全对应。'],
['3-13','small world','/smɔːl wɜːld/','excl.','世界真小',["It's a small world",'what a small world'],'informal','positive','high',false,"You know Sarah too? It's a small world!",'你也认识Sarah？世界真小！','偶遇或发现共同熟人时感叹。'],
['3-14','RSVP','/ɑːr es viː ˈpiː/','v./n.','请回复是否出席',['please RSVP','RSVP by'],'formal','neutral','high',false,'Please RSVP by Friday if you can attend.','请在周五前回复能否出席。','源自法语正式邀请必备。'],
['3-15','icebreaker','/ˈaɪsˌbreɪkə(r)/','n.','破冰活动',['team icebreaker','icebreaker game'],'neutral','positive','medium',false,'We started the workshop with a quick icebreaker.','我们用一个小破冰活动开始了工作坊。','帮助陌生人互相熟悉的活动。'],
]]});

f.push({id:'f4',name:'思维方式',desc:'描述思考过程和认知状态的词汇',words:[
['4-1','intuitive','/ɪnˈtjuːɪtɪv/','adj.','直观的',['intuitive design','intuitively obvious'],'neutral','positive','high',false,'The app has a very intuitive interface.','应用界面非常直观。','强调自然易懂无需学习。'],
['4-2','perspective','/pəˈspektɪv/','n.','视角',['gain perspective','put things in perspective'],'neutral','neutral','high',false,'Traveling gave her a new perspective on life.','旅行给了她对生活全新的视角。','看问题的框架和角度。'],
['4-3','nuanced','/ˈnjuːɑːnst/','adj.','细致入微的',['nuanced understanding','highly nuanced'],'formal','positive','medium',true,'The issue is more nuanced than people realize.','问题比人们意识到的更复杂微妙。','非黑即白存在微妙的层次差别。'],
['4-4','insightful','/ˈɪnsaɪtfʊl/','adj.','有洞察力的',['insightful comment','truly insightful'],'neutral','positive','medium',false,'That was a really insightful point.','这个观点非常有洞察力。','看透本质提出深刻见解。'],
['4-5','mindset','/ˈmaɪndset/','n.','心态思维模式',['growth mindset','positive mindset'],'neutral','neutral','high',false,'Adopting a growth mindset is key.','培养成长型心态是关键。','面对问题的底层思维框架。'],
['4-6','compelling','/kəmˈpelɪŋ/','adj.','令人信服的',['compelling argument','compelling evidence'],'neutral','positive','high',false,'She made a compelling case for change.','她提出了令人信服的理由。','让人无法忽视的推动力。'],
['4-7','epiphany','/ɪˈpɪfəni/','n.','顿悟',['have an epiphany','moment of epiphany'],'formal','positive','medium',false,'I had an epiphany in the shower.','洗澡时突然顿悟了。','突然对某事有了深刻认知。'],
['4-8','cognitive','/ˈkɒɡnətɪv/','adj.','认知的',['cognitive ability','cognitive bias'],'formal','neutral','high',false,'Cognitive biases affect our decisions.','认知偏差影响我们的决策。','与大脑处理信息学习理解相关。'],
['4-9','coherent','/kəʊˈhɪərənt/','adj.','连贯有条理的',['coherent argument','barely coherent'],'formal','positive','medium',false,'She gave a clear coherent presentation.','她做了清晰有条理的演示。','逻辑上的连贯性和可理解性。'],
['4-10','deduce','/dɪˈdjuːs/','v.','推理推断',['deduce from','logically deduce'],'formal','neutral','medium',false,'We can deduce what happened from evidence.','从证据中可推断发生了什么。','基于事实的逻辑推理。'],
['4-11','articulate','/ɑːˈtɪkjʊleɪt/','adj./v.','表达能力强的',['highly articulate','articulate speaker'],'neutral','positive','high',false,"She's very articulate about her ideas.",'她善于表达自己的想法。','能清晰准确地表达复杂想法。'],
['4-12','contemplate','/ˈkɒntəmpleɪt/','v.','沉思仔细考虑',['contemplate the possibility','sit and contemplate'],'formal','neutral','medium',false,'He sat contemplating the meaning of life.','他坐着沉思人生的意义。','比think更深思熟虑。'],
['4-13','dichotomy','/daɪˈkɒtəmi/','n.','二分法',['false dichotomy','dichotomy between'],'formal','neutral','medium',false,'There is a false dichotomy between work and life.','工作和生活间有虚假的二分法。','将事物分成两个对立面。'],
['4-14','fallacy','/ˈfæləsi/','n.','谬误',['logical fallacy','common fallacy'],'formal','negative','medium',false,"That's a common logical fallacy.",'那是一个常见的逻辑谬误。','看似正确实则有逻辑缺陷。'],
['4-15','conceive','/kənˈsiːv/','v.','构想设想',['conceive of','originally conceived'],'formal','neutral','medium',false,'It is hard to conceive of a world without internet.','很难想象没有互联网的世界。','在脑中形成想法或计划。'],
]]});

f.push({id:'f5',name:'行为动作',desc:'描述人的行为和行动方式的精准动词',words:[
['5-1','procrastinate','/prəˈkræstɪneɪt/','v.','拖延',['stop procrastinating','tend to procrastinate'],'neutral','negative','high',false,"I've been procrastinating on this report.",'这份报告拖了一星期了。','明知该做却故意推迟。'],
['5-2','fidget','/ˈfɪdʒɪt/','v./n.','坐立不安地动',['stop fidgeting','fidget with'],'informal','neutral','medium',true,'He kept fidgeting with his pen.','他不停地摆弄他的笔。','紧张无聊时无意识的小动作。'],
['5-3','savor','/ˈseɪvə(r)/','v.','细细品味',['savor the moment','savor every bite'],'neutral','positive','medium',false,'Savor the meal — the chef spent hours on it.','慢慢品味——厨师花了好几个小时。','慢下来有意识地品味。'],
['5-4','juggle','/ˈdʒʌɡl/','v.','同时应付兼顾',['juggle tasks','juggle work and family'],'informal','neutral','high',false,"She's juggling a full-time job and two kids.",'她一边全职工作一边带两个孩子。','用杂耍比喻同时应付多件事。'],
['5-5','dread','/dred/','v./n.','非常害怕',['dread the thought','dread doing'],'neutral','negative','high',false,"I'm dreading the Monday morning meeting.",'我特别害怕周一早上的会议。','对即将发生事情的恐惧。'],
['5-6','binge','/bɪndʒ/','v./n.','狂看狂吃',['binge watch','binge eating'],'informal','neutral','high',true,'We binge-watched the entire season.','一个周末刷完了整季。','短时间内过量消费内容。'],
['5-7','snooze','/snuːz/','v./n.','打盹按掉闹钟',['hit snooze','snooze button'],'informal','neutral','high',false,'I hit the snooze button three times.','我按了三次贪睡按钮。','闹钟响了之后再睡一小会。'],
['5-8','multitask','/ˌmʌltiˈtɑːsk/','v.','同时做多件事',['try to multitask','good at multitasking'],'neutral','neutral','high',false,"I can't multitask effectively.",'我无法有效地多任务处理。','同时处理多项任务的能力。'],
['5-9','scramble','/ˈskræmbl/','v.','手忙脚乱匆忙',['scramble to','scramble around'],'informal','neutral','medium',false,'Everyone scrambled to finish.','所有人都在手忙脚乱赶工。','紧急匆忙地试图完成某事。'],
['5-10','linger','/ˈlɪŋɡə(r)/','v.','逗留流连',['linger over','linger on'],'neutral','neutral','medium',false,'The coffee smell lingered in the kitchen.','咖啡的香味在厨房里萦绕不散。','停留的时间比预期长。'],
['5-11','sprint','/sprɪnt/','v./n.','冲刺短跑',['final sprint','sprint to finish'],'neutral','positive','high',false,"We're in the final sprint of the project.",'我们正处于项目的最后冲刺阶段。','短时间高强度的行动。'],
['5-12','whisk','/wɪsk/','v.','迅速带走搅拌',['whisk away','whisk together'],'neutral','neutral','medium',false,'She whisked the plate away.','她迅速把盘子收走了。','快速而轻巧地移动某物。'],
['5-13','dilly-dally','/ˈdɪli dæli/','v.','磨蹭犹豫',["stop dilly-dallying","don't dilly-dally"],'informal','negative','low',false,"Stop dilly-dallying and make a decision!",'别再磨蹭了赶紧做决定！','因犹豫而慢吞吞浪费时间。'],
['5-14','loiter','/ˈlɔɪtə(r)/','v.','游荡闲逛',['loiter around','no loitering'],'formal','negative','medium',false,'A group of teenagers were loitering outside.','一群青少年在外面游荡。','在一个地方无目的地逗留。'],
['5-15','amble','/ˈæmbl/','v.','漫步',['amble along','amble through'],'neutral','positive','medium',false,'We ambled through the park enjoying sunshine.','我们在公园里漫步享受阳光。','悠闲地慢走没有紧迫感。'],
]]});

f.push({id:'f6',name:'抽象概念',desc:'描述抽象概念和品质的高阶词汇',words:[
['6-1','resilience','/rɪˈzɪliəns/','n.','韧性恢复力',['build resilience','show resilience'],'neutral','positive','high',false,'Her resilience in adversity is inspiring.','她在逆境中的韧性很鼓舞人心。','被打倒后能弹回来的能力。'],
['6-2','clarity','/ˈklærəti/','n.','清晰明确',['gain clarity','absolute clarity'],'neutral','positive','high',false,'We need more clarity on the requirements.','我们需要对需求更明确的了解。','理解上的清晰而非视觉清晰。'],
['6-3','momentum','/məˈmentəm/','n.','势头动力',['gain momentum','lose momentum'],'neutral','positive','high',false,"Let's keep the momentum going.",'继续保持这个势头。','物理学引申为做事气势和推动力。'],
['6-4','trade-off','/ˈtreɪdɒf/','n.','权衡取舍',['make a trade-off','necessary trade-off'],'neutral','neutral','high',false,"There's always a trade-off.",'总是存在权衡取舍。','为获得一样必须放弃另一样。'],
['6-5','authenticity','/ˌɔːθenˈtɪsəti/','n.','真实性真诚',['sense of authenticity','value authenticity'],'formal','positive','medium',false,'What I appreciate most is his authenticity.','我最欣赏的是他的真诚。','不伪装不做作保持真实自我。'],
['6-6','ambiguity','/ˌæmbɪˈɡjuːəti/','n.','模糊性',['deal with ambiguity','ambiguity tolerance'],'formal','neutral','high',false,'Good leaders are comfortable with ambiguity.','好的领导者能从容应对模糊。','信息本身的不清晰状态。'],
['6-7','integrity','/ɪnˈteɡrəti/','n.','正直完整性',['personal integrity','act with integrity'],'formal','positive','high',false,'He is a man of great integrity.','他是一个非常正直的人。','行为符合道德原则的一致性。'],
['6-8','accountability','/əˌkaʊntəˈbɪləti/','n.','责任感',['take accountability','hold someone accountable'],'formal','positive','high',false,'We need more accountability in our team.','我们团队需要更多的责任感。','对自己的行为和结果负责。'],
['6-9','sustainability','/səˌsteɪnəˈbɪləti/','n.','可持续性',['environmental sustainability','long-term sustainability'],'formal','positive','high',false,'Sustainability is at our core.','可持续性是我们模式的核心。','长期维持而不耗尽资源。'],
['6-10','brevity','/ˈbrevəti/','n.','简洁',['brevity is key','for sake of brevity'],'formal','positive','medium',false,'I appreciate the brevity of your report.','我欣赏你报告的简洁。','用简短语言传达完整信息。'],
['6-11','cohesion','/kəʊˈhiːʒən/','n.','凝聚力',['team cohesion','social cohesion'],'formal','positive','medium',false,'Team cohesion is essential for high performance.','团队凝聚力对高绩效至关重要。','让群体团结一致的向心力。'],
['6-12','diligence','/ˈdɪlɪdʒəns/','n.','勤奋',['due diligence','with diligence'],'formal','positive','medium',false,'Success comes from talent plus diligence.','成功来自天赋加上勤奋。','持续认真努力工作的品质。'],
['6-13','eloquence','/ˈeləkwəns/','n.','雄辩表达力',['speak with eloquence','remarkable eloquence'],'formal','positive','medium',false,'She spoke with such eloquence that everyone was moved.','她的表达如此雄辩动人。','带有优雅和美感的表达能力。'],
['6-14','gratitude','/ˈɡrætɪtjuːd/','n.','感恩',['express gratitude','deep gratitude'],'formal','positive','high',false,'I want to express my deepest gratitude.','我想表达最深的感激。','比thanks更正式深层感谢。'],
['6-15','hindsight','/ˈhaɪndsaɪt/','n.','后见之明',['in hindsight','hindsight is 20/20'],'neutral','neutral','high',false,'In hindsight we should have invested more.','事后看来我们应该多投入。','事后才意识到的理解和洞见。'],
]]});

// Generate TS
let ts='// EXPORTS: IVocabulary, IVocabularySemanticField, MOCK_VOCABULARY_FIELDS\n';
ts+='export interface IVocabulary {\n';
ts+='  id: string; word: string; phonetic: string; partOfSpeech: string; meaning: string;\n';
ts+='  collocations: string[]; register: "formal"|"neutral"|"informal";\n';
ts+='  emotion: "positive"|"neutral"|"negative"; frequency: "high"|"medium"|"low";\n';
ts+='  hasNoChineseEquivalent: boolean; example: string; exampleTranslation: string; deepExplanation: string;\n';
ts+='}\n';
ts+='export interface IVocabularySemanticField { id: string; name: string; description: string; words: IVocabulary[]; }\n\n';
ts+='function W(id:string,word:string,phon:string,pos:string,mean:string,coll:string[],reg:"formal"|"neutral"|"informal",emo:"positive"|"neutral"|"negative",freq:"high"|"medium"|"low",noCn:boolean,ex:string,exT:string,deep:string): IVocabulary {\n';
ts+='  return {id,word,phonetic:phon,partOfSpeech:pos,meaning:mean,collocations:coll,register:reg,emotion:emo,frequency:freq,hasNoChineseEquivalent:noCn,example:ex,exampleTranslation:exT,deepExplanation:deep}\n';
ts+='}\n\n';
ts+='export const MOCK_VOCABULARY_FIELDS: IVocabularySemanticField[] = [\n';

for(const field of f){
  ts+=`  { id:'${field.id}',name:'${field.name}',description:'${field.desc}',words:[\n`;
  for(const w of field.words){
    ts+='    '+W(w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11],w[12])+',\n';
  }
  ts+='  ]},\n';
}
ts+='];\n';

fs.writeFileSync('src/data/vocabulary.ts',ts);
const total=fs.readFileSync('src/data/vocabulary.ts','utf8');
const wCount=(total.match(/W\('/g)||[]).length;
console.log(`Written vocabulary.ts with ${f.length} fields and ${wCount} words`);
