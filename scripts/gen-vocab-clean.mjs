// Clean vocabulary generator - uses simple string concat to avoid escaping issues
import fs from 'fs';

// Hardcode the header - never read from potentially corrupted file
let header = '// EXPORTS: IVocabulary, IVocabularySemanticField, MOCK_VOCABULARY_FIELDS\n';
header += 'export interface IVocabulary {\n';
header += '  id: string; word: string; phonetic: string; partOfSpeech: string; meaning: string;\n';
header += '  collocations: string[]; register: "formal"|"neutral"|"informal";\n';
header += '  emotion: "positive"|"neutral"|"negative"; frequency: "high"|"medium"|"low";\n';
header += '  hasNoChineseEquivalent: boolean; example: string; exampleTranslation: string; deepExplanation: string;\n';
header += '}\n';
header += 'export interface IVocabularySemanticField { id: string; name: string; description: string; words: IVocabulary[]; }\n';
header += '\n';
header += 'function W(id:string,word:string,phon:string,pos:string,mean:string,coll:string[],reg:"formal"|"neutral"|"informal",emo:"positive"|"neutral"|"negative",freq:"high"|"medium"|"low",noCn:boolean,ex:string,exT:string,deep:string): IVocabulary {\n';
header += '  return {id,word,phonetic:phon,partOfSpeech:pos,meaning:mean,collocations:coll,register:reg,emotion:emo,frequency:freq,hasNoChineseEquivalent:noCn,example:ex,exampleTranslation:exT,deepExplanation:deep}\n';
header += '}\n';

// Generate new word entries using simple concat
function W(id,w,phon,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var e=function(s){return (s||'').replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
  var cstr='['+coll.map(function(x){return "'"+e(x)+"'";}).join(',')+']';
  return "    W('"+id+"','"+e(w)+"','"+e(phon)+"','"+e(pos)+"','"+e(mean)+"',"+cstr+",'"+reg+"','"+emo+"','"+freq+"',"+(noCn||false)+",'"+e(ex)+"','"+e(exT)+"','"+e(deep)+"'),";
}

var fields=[];

// F1: 情绪表达
var f1w=[];
f1w.push(W("1-1","serendipity","/ˌserənˈdɪpəti/","n.","意外发现美好事物的运气",["pure serendipity","by serendipity"],"neutral","positive","medium",true,"Finding that book was pure serendipity.","找到那本书纯属意外之喜。","强调意外与美好的结合。"));
f1w.push(W("1-2","melancholy","/ˈmelənkɒli/","n./adj.","忧郁的淡淡的忧伤",["a melancholy mood","deep melancholy"],"formal","negative","medium",false,"There was a touch of melancholy in his voice.","他的声音里带着一丝忧郁。","比sad更文学化指深沉持久的忧伤。"));
f1w.push(W("1-3","content","/kənˈtent/","adj.","满足的心安的",["content with life","perfectly content"],"neutral","positive","high",false,"She seems content with her simple life.","她似乎对简单的生活感到满足。","强调知足的状态平静的满足感。"));
f1w.push(W("1-4","ecstatic","/ɪkˈstætɪk/","adj.","狂喜的极度兴奋的",["absolutely ecstatic","ecstatic about"],"neutral","positive","medium",false,"The team was ecstatic after winning the championship.","赢得冠军后整个团队欣喜若狂。","比happy和excited强度高得多。"));
f1w.push(W("1-5","nostalgic","/nɒˈstældʒɪk/","adj.","怀旧的怀念过去的",["feel nostalgic","nostalgic memories"],"neutral","positive","medium",false,"Looking at old photos always makes me feel nostalgic.","看老照片总是让我感到怀旧。","包含了怀念过去的美好与一丝伤感。"));
f1w.push(W("1-6","petrified","/ˈpetrɪfaɪd/","adj.","吓呆的极度恐惧的",["absolutely petrified","petrified of"],"neutral","negative","medium",false,"I am petrified of public speaking.","我超级害怕公开演讲。","比scared强烈得多。"));
f1w.push(W("1-7","overwhelmed","/ˌəʊvəˈwelmd/","adj.","不知所措的",["feel overwhelmed","completely overwhelmed"],"neutral","negative","high",false,"She felt overwhelmed by all the assignments.","所有作业让她不堪重负。","被太多事物压垮的状态。"));
f1w.push(W("1-8","grateful","/ˈɡreɪtfʊl/","adj.","感激的",["deeply grateful","eternally grateful"],"neutral","positive","high",false,"I am so grateful for all your support.","我非常感激你的支持。","比thankful更强调深刻的感谢。"));
f1w.push(W("1-9","resentful","/rɪˈzentfʊl/","adj.","怨恨的愤愤不平的",["feel resentful","bitterly resentful"],"neutral","negative","medium",false,"He felt resentful about being passed over.","他因被跳过升职而耿耿于怀。","长期积压的不满。"));
f1w.push(W("1-10","exhilarated","/ɪɡˈzɪləreɪtɪd/","adj.","极度兴奋的",["feel exhilarated","absolutely exhilarated"],"formal","positive","medium",false,"She felt exhilarated after completing the marathon.","完成马拉松后她感到无比兴奋。","带有刺激和活力的兴奋感。"));
f1w.push(W("1-11","bewildered","/bɪˈwɪldəd/","adj.","困惑的迷茫的",["completely bewildered","look bewildered"],"neutral","negative","medium",false,"He looked bewildered by the complex instructions.","他看着复杂的说明一脸迷茫。","比confused更强烈。"));
f1w.push(W("1-12","apprehensive","/ˌæprɪˈhensɪv/","adj.","担忧的不安的",["feel apprehensive","apprehensive about"],"formal","negative","medium",false,"She is apprehensive about starting a new job.","她对开始新工作感到不安。","对即将发生事情的模糊忧虑。"));
f1w.push(W("1-13","elated","/ɪˈleɪtɪd/","adj.","兴高采烈的",["feel elated","absolutely elated"],"neutral","positive","medium",false,"He was elated when he heard the good news.","听到好消息他兴高采烈。","情绪高涨的状态。"));
f1w.push(W("1-14","flabbergasted","/ˈflæbəɡɑːstɪd/","adj.","大吃一惊的",["absolutely flabbergasted"],"informal","neutral","low",false,"I was flabbergasted when I saw the price tag.","看到价格标签我大吃一惊。","非常口语化带幽默色彩。"));
f1w.push(W("1-15","indifferent","/ɪnˈdɪfrənt/","adj.","漠不关心的",["completely indifferent","remain indifferent"],"neutral","negative","medium",false,"She is completely indifferent to what others think.","她对别人的想法完全不在乎。","强调不在乎而非没注意到。"));
f1w.push(W("1-16","jubilant","/ˈdʒuːbɪlənt/","adj.","欢欣鼓舞的",["jubilant crowd","jubilant atmosphere"],"formal","positive","medium",false,"The fans were jubilant after the last minute goal.","绝杀进球后球迷们欢欣鼓舞。","描述人群集体喜悦。"));
f1w.push(W("1-17","mortified","/ˈmɔːtɪfaɪd/","adj.","极度尴尬的",["absolutely mortified","feel mortified"],"neutral","negative","low",false,"I was mortified when I realized my mistake.","发现错误时我尴尬极了。","比embarrassed深得多。"));
f1w.push(W("1-18","nonchalant","/ˈnɒnʃələnt/","adj.","若无其事的",["appear nonchalant","nonchalant attitude"],"neutral","neutral","medium",false,"He tried to act nonchalant but I could tell he was nervous.","他装作若无其事但我看得出他紧张。","刻意表现得不在乎。"));
f1w.push(W("1-19","pensive","/ˈpensɪv/","adj.","沉思的",["pensive mood","look pensive"],"formal","neutral","low",false,"She sat in a pensive silence staring out the window.","她坐着沉思不语凝视窗外。","带有深层思考的沉思。"));
f1w.push(W("1-20","rattled","/ˈrætld/","adj.","慌张的不安的",["feel rattled","visibly rattled"],"informal","negative","medium",false,"The aggressive questions clearly rattled him.","尖锐的问题明显让他慌了神。","被突发情况打乱心态。"));
fields.push({id:"f1",name:"情绪表达",desc:"描述各种情绪状态的母语级词汇",words:f1w});

// F2: 职场沟通
var f2w=[];
f2w.push(W("2-1","leverage","/ˈliːvərɪdʒ/","v./n.","利用资源杠杆",["leverage resources","leverage connections"],"formal","positive","high",true,"We need to leverage our existing partnerships.","我们需要利用现有的合作。","强调放大效果地利用。"));
f2w.push(W("2-2","actionable","/ˈækʃənəbl/","adj.","可执行的可落地的",["actionable steps","actionable insights"],"formal","positive","high",false,"Please give me actionable suggestions.","请给我可执行的建议。","具体可操作的。"));
f2w.push(W("2-3","bandwidth","/ˈbændwɪdθ/","n.","精力时间资源",["have bandwidth","limited bandwidth"],"informal","neutral","high",true,"I do not have the bandwidth for another project.","我没精力再接项目了。","源自IT术语引申为时间精力。"));
f2w.push(W("2-4","streamline","/ˈstriːmlaɪn/","v.","精简优化流程",["streamline operations","streamline the process"],"formal","positive","high",false,"We are streamlining our onboarding process.","我们在精简入职流程。","去除不必要步骤提效。"));
f2w.push(W("2-5","align","/əˈlaɪn/","v.","对齐保持一致",["align goals","stay aligned"],"formal","neutral","high",false,"Let us make sure our priorities are aligned.","先确保优先级一致。","方向性统一。"));
f2w.push(W("2-6","iterate","/ˈɪtəreɪt/","v.","迭代反复改进",["iterate on","iterate quickly"],"neutral","positive","high",false,"We will iterate on this design based on feedback.","会根据反馈迭代改进。","反复修改接近最优。"));
f2w.push(W("2-7","stakeholder","/ˈsteɪkhəʊldə(r)/","n.","利益相关方",["key stakeholders","engage stakeholders"],"formal","neutral","high",false,"We need buy in from all stakeholders.","需要所有利益相关方认可。","与项目有利害关系的人。"));
f2w.push(W("2-8","deliverable","/dɪˈlɪvərəbl/","n.","交付物产出",["key deliverables","meet deliverables"],"formal","neutral","high",false,"What are the key deliverables this quarter.","这个季度关键交付物是什么。","项目管理核心词。"));
f2w.push(W("2-9","onboarding","/ˈɒnbɔːdɪŋ/","n.","入职流程",["onboarding process","smooth onboarding"],"neutral","positive","high",true,"We have redesigned our employee onboarding.","重新设计了入职流程。","新人适应融入的过程。"));
f2w.push(W("2-10","pivot","/ˈpɪvət/","v./n.","转型转向",["pivot strategy","make a pivot"],"neutral","neutral","high",false,"The startup pivoted from B2C to B2B.","创业公司从toC转向toB。","核心业务重大转变。"));
f2w.push(W("2-11","scalable","/ˈskeɪləbl/","adj.","可扩展的",["scalable solution","highly scalable"],"formal","positive","high",false,"We need a scalable solution as we grow.","需要可扩展的方案。","能适应增长的。"));
f2w.push(W("2-12","synergy","/ˈsɪnədʒi/","n.","协同效应",["create synergy","team synergy"],"formal","positive","medium",false,"The merger should create significant synergies.","合并应产生显著协同效应。","一加一大于二。"));
f2w.push(W("2-13","touchpoint","/ˈtʌtʃpɔɪnt/","n.","接触点",["customer touchpoint","key touchpoints"],"neutral","neutral","medium",true,"Every customer touchpoint should reflect our brand.","每个客户接触点应体现品牌。","客户品牌互动节点。"));
f2w.push(W("2-14","granular","/ˈɡrænjʊlə/","adj.","细致入微的",["granular data","at a granular level"],"formal","neutral","medium",false,"We need a more granular analysis.","需要更细致分析。","深入最细节层面。"));
f2w.push(W("2-15","onus","/ˈəʊnəs/","n.","责任义务",["onus of proof","onus is on"],"formal","neutral","medium",false,"The onus is on us to prove the product is safe.","责任在我们身上。","比responsibility更正式。"));
f2w.push(W("2-16","paradigm shift","/ˈpærədaɪm ʃɪft/","n.","范式转变",["major paradigm shift","represent a paradigm shift"],"formal","positive","medium",false,"AI represents a paradigm shift in how we work.","AI代表工作方式范式转变。","根本性思维模式转变。"));
f2w.push(W("2-17","due diligence","/djuː ˈdɪlɪdʒəns/","n.","尽职调查",["do due diligence","thorough due diligence"],"formal","neutral","high",false,"We carried out thorough due diligence before the acquisition.","收购前做了彻底尽职调查。","法律和商业交易标准流程。"));
f2w.push(W("2-18","ROI","/ɑːr əʊ aɪ/","n.","投资回报率",["positive ROI","measure ROI"],"formal","neutral","high",false,"We need to demonstrate a clear ROI.","需要证明明确回报率。","商业决策核心理念。"));
f2w.push(W("2-19","KPI","/keɪ piː aɪ/","n.","关键绩效指标",["set KPIs","meet KPIs"],"formal","neutral","high",false,"Define clear KPIs for each team.","为每个团队定义清晰KPI。","衡量成功的量化标准。"));
f2w.push(W("2-20","action plan","/ˈækʃən plæn/","n.","行动计划",["develop an action plan","detailed action plan"],"formal","positive","high",false,"Create a concrete action plan with deadlines.","制定有明确截止日期的计划。","比plan更强调可执行性。"));
f1w.push(W("1-21","smug","/smʌɡ/","adj.","自鸣得意的",["smug smile","look smug"],"informal","negative","medium",false,"He had a smug look after winning.","赢后他一脸得意。","带轻蔑感的自满。"));
f1w.push(W("1-22","thrilled","/θrɪld/","adj.","非常兴奋的",["absolutely thrilled","thrilled to bits"],"neutral","positive","high",false,"I am thrilled to announce our new partnership.","我激动宣布新合作。","比excited更正式。"));
f1w.push(W("1-23","vexed","/vekst/","adj.","恼火的",["slightly vexed","vexed by"],"formal","negative","low",false,"She was vexed by the interruptions.","她因不断打断恼火。","比annoyed更正式。"));
f1w.push(W("1-24","wistful","/ˈwɪstfʊl/","adj.","渴望的伤感的",["wistful smile","wistful look"],"neutral","negative","low",false,"A wistful smile at old photos.","看老照片伤感一笑。","混合怀念与遗憾。"));
f1w.push(W("1-25","zealous","/ˈzeləs/","adj.","狂热的",["zealous supporter","overly zealous"],"formal","positive","medium",false,"A zealous advocate for the environment.","环保狂热倡导者。","比enthusiastic更强。"));
f1w.push(W("1-26","dejected","/dɪˈdʒektɪd/","adj.","沮丧的垂头丧气的",["look dejected","feel dejected"],"neutral","negative","medium",false,"He looked dejected after the bad news.","坏消息后垂头丧气。","从表情姿态可见的沮丧。"));
f1w.push(W("1-27","complacent","/kəmˈpleɪsənt/","adj.","自满的",["grow complacent","become complacent"],"neutral","negative","medium",false,"We cannot afford to get complacent.","不能自满。","停滞不前不求进步。"));
f1w.push(W("1-28","aghast","/əˈɡɑːst/","adj.","惊骇的",["stand aghast","look aghast"],"formal","negative","low",false,"She was aghast at the cost.","维修费让她惊骇。","难以置信的震惊。"));
f1w.push(W("1-29","buoyant","/ˈbɔɪənt/","adj.","轻松愉快的",["buoyant mood","remain buoyant"],"neutral","positive","medium",true,"She remained buoyant despite challenges.","尽管挑战她轻松愉快。","同时含实物浮力和精神振奋。"));
f1w.push(W("1-30","crestfallen","/ˈkrestfɔːlən/","adj.","垂头丧气的",["look crestfallen","visibly crestfallen"],"neutral","negative","low",false,"The team looked crestfallen after the loss.","输后队伍垂头丧气。","从充满希望到失望。"));
f1w.push(W("1-31","blissful","/ˈblɪsfʊl/","adj.","极乐的",["blissful ignorance","blissful moment"],"neutral","positive","medium",false,"A blissful afternoon in the garden.","花园里极乐的下午。","完全幸福无忧。"));
f1w.push(W("1-32","forlorn","/fəˈlɔːn/","adj.","孤苦伶仃的",["forlorn hope","look forlorn"],"formal","negative","medium",false,"A forlorn figure standing alone.","孤苦伶仃独自站着。","被遗弃的凄凉感。"));
f1w.push(W("1-33","wary","/ˈweəri/","adj.","警惕的",["be wary of","remain wary"],"neutral","negative","medium",false,"Be wary of deals that seem too good.","警惕太好的交易。","小心谨慎不轻信。"));
f1w.push(W("1-34","disgruntled","/dɪsˈɡrʌntld/","adj.","不满的",["disgruntled employee","feel disgruntled"],"formal","negative","medium",false,"Disgruntled staff complained about pay.","不满员工抱怨工资。","因待遇不公不满。"));
f1w.push(W("1-35","remorseful","/rɪˈmɔːsfʊl/","adj.","懊悔的",["feel remorseful","deeply remorseful"],"formal","negative","medium",false,"He was remorseful about his actions.","他对行为懊悔不已。","深切后悔自责。"));
f1w.push(W("1-36","sanguine","/ˈsæŋɡwɪn/","adj.","乐观的",["sanguine about","remain sanguine"],"formal","positive","low",false,"She remained sanguine about the future.","她对未来保持乐观。","正式场合乐观。"));
f1w.push(W("1-37","disillusioned","/ˌdɪsɪˈluːʒənd/","adj.","幻灭的失望的",["feel disillusioned","become disillusioned"],"formal","negative","medium",false,"He became disillusioned with politics.","对政治幻灭了。","理想破灭后的失望。"));
f1w.push(W("1-38","jaded","/ˈdʒeɪdɪd/","adj.","厌倦的麻木的",["a bit jaded","jaded palate"],"informal","negative","medium",false,"A jaded critic who has seen it all.","厌倦的评论家见多了。","过度经历后疲惫麻木。"));
f1w.push(W("1-39","mirth","/mɜːθ/","n.","欢笑欢乐",["full of mirth","suppressed mirth"],"formal","positive","medium",false,"The room was full of mirth and laughter.","房间充满欢笑。","比joy更加轻松外放。"));
f1w.push(W("1-40","angst","/æŋst/","n.","焦虑不安",["teenage angst","existential angst"],"neutral","negative","medium",true,"His songs capture teenage angst perfectly.","他的歌完美捕捉青少年焦虑。","德语借词深层存在焦虑。"));
fields.push({id:"f2",name:"职场沟通",desc:"工作场景中的高频精准词汇",words:f2w});

// F3: 社交互动
var f3w=[];
f3w.push(W("3-1","vibe","/vaɪb/","n.","氛围感觉气场",["good vibes","weird vibe"],"informal","neutral","high",true,"There is a really chill vibe here.","这里氛围超放松。","中文不完全对应。"));
f3w.push(W("3-2","small talk","/smɔːl tɔːk/","n.","寒暄闲聊",["make small talk","awkward small talk"],"neutral","neutral","high",false,"We made some small talk before the meeting.","会前闲聊了几句。","避免沉默的轻松闲聊。"));
f3w.push(W("3-3","charisma","/kəˈrɪzmə/","n.","个人魅力感召力",["natural charisma","lack charisma"],"formal","positive","medium",false,"He is a good speaker but lacks charisma.","他演讲不错但缺魅力。","比charm更有领导力意味。"));
f3w.push(W("3-4","hang out","/hæŋ aʊt/","v.","一起玩消磨时间",["hang out with friends","just hanging out"],"informal","positive","high",false,"We are just hanging out at my place.","正在家待着呢。","最常用非正式相聚。"));
f3w.push(W("3-5","catch up","/kætʃ ʌp/","v.","叙旧了解近况",["catch up with","grab coffee and catch up"],"informal","positive","high",false,"It has been ages We should catch up.","好久不见该叙叙旧。","久别重逢最常用。"));
f3w.push(W("3-6","awkward","/ˈɔːkwəd/","adj.","尴尬的",["awkward silence","feel awkward"],"neutral","negative","high",true,"There was an awkward silence.","一阵尴尬沉默。","比embarrassed场景更广。"));
f3w.push(W("3-7","genuine","/ˈdʒenjuɪn/","adj.","真诚的",["genuine smile","genuine interest"],"neutral","positive","high",false,"She is one of the most genuine people I know.","她是我认识最真诚的人。","不虚伪不做作。"));
f3w.push(W("3-8","bond","/bɒnd/","v./n.","建立亲密关系",["bond with","bond over"],"neutral","positive","high",false,"We bonded over our shared love of hiking.","因共同热爱建立感情。","比connect有深度。"));
f3w.push(W("3-9","mingle","/ˈmɪŋɡl/","v.","交际",["mingle with","mix and mingle"],"neutral","neutral","medium",false,"Great for mingling with industry leaders.","与行业领袖交际好机会。","走动和不同人交谈。"));
f3w.push(W("3-10","rapport","/ræˈpɔː(r)/","n.","融洽关系",["build rapport","establish rapport"],"formal","positive","medium",false,"She quickly built good rapport with students.","很快和学生建立融洽关系。","相互理解和良好沟通。"));
f3w.push(W("3-11","camaraderie","/ˌkæməˈrɑːdəri/","n.","同志情谊",["sense of camaraderie","team camaraderie"],"formal","positive","medium",true,"Real camaraderie among the team.","团队真正同志情谊。","共同奋斗的情谊。"));
f3w.push(W("3-12","banter","/ˈbæntə(r)/","n./v.","轻松玩笑",["friendly banter","witty banter"],"informal","positive","medium",true,"The banter between hosts was fun.","主持人调侃很有趣。","中文不完全对应。"));
f3w.push(W("3-13","small world","/smɔːl wɜːld/","excl.","世界真小",["It is a small world"],"informal","positive","high",false,"You know her too Small world.","你也认识她世界真小。","偶遇时经典感叹。"));
f3w.push(W("3-14","RSVP","/ɑːr es viː ˈpiː/","v./n.","请回复出席",["please RSVP","RSVP by Friday"],"formal","neutral","high",false,"Please RSVP by Friday.","周五前回复能否出席。","源自法语正式邀请。"));
f3w.push(W("3-15","icebreaker","/ˈaɪsˌbreɪkə(r)/","n.","破冰活动",["team icebreaker","icebreaker game"],"neutral","positive","medium",false,"Started with a quick icebreaker.","以破冰活动开始。","帮陌生人熟悉。"));
f3w.push(W("3-16","ghost","/ɡəʊst/","v.","突然失联",["ghost someone","get ghosted"],"informal","negative","medium",true,"He just ghosted me after three dates.","三次约会后失联了。","毫无解释切断联系。"));
f3w.push(W("3-17","catfish","/ˈkætfɪʃ/","v./n.","假装身份",["catfish someone","get catfished"],"informal","negative","low",true,"The guy she talked to was a catfish.","跟她聊的人用假身份。","网络冒充身份。"));
f3w.push(W("3-18","networking","/ˈnetwɜːkɪŋ/","n.","建立人脉",["networking event","professional networking"],"neutral","positive","high",false,"Met great contacts at a networking event.","人脉活动认识好人脉。","职业社交建立有益关系。"));
f3w.push(W("3-19","acquaintance","/əˈkweɪntəns/","n.","认识的人",["old acquaintance","casual acquaintance"],"neutral","neutral","high",false,"More of an acquaintance than a friend.","更多是认识的人不是朋友。","比friend关系浅。"));
f3w.push(W("3-20","frenemy","/ˈfrenəmi/","n.","亦敌亦友",["workplace frenemy","deal with a frenemy"],"informal","negative","medium",true,"Watch out she is a bit of a frenemy.","小心她有点亦敌亦友。","表面友好实际竞争。"));
fields.push({id:"f3",name:"社交互动",desc:"日常社交场景中的地道表达",words:f3w});

// F4: 思维方式
var f4w=[];
f4w.push(W("4-1","intuitive","/ɪnˈtjuːɪtɪv/","adj.","直观的凭直觉的",["intuitive design","intuitive interface"],"neutral","positive","high",false,"The app has a very intuitive interface.","应用界面非常直观。","自然易懂无需学习。"));
f4w.push(W("4-2","perspective","/pəˈspektɪv/","n.","视角观点",["gain perspective","fresh perspective"],"neutral","neutral","high",false,"Travel gave her a new perspective on life.","旅行给了她全新视角。","看问题的框架和角度。"));
f4w.push(W("4-3","nuanced","/ˈnjuːɑːnst/","adj.","细致入微的",["nuanced understanding","highly nuanced"],"formal","positive","medium",true,"The issue is more nuanced than people realize.","问题比意识到的更复杂微妙。","非黑即白有微妙层次。"));
f4w.push(W("4-4","insightful","/ˈɪnsaɪtfʊl/","adj.","有洞察力的",["insightful comment","truly insightful"],"neutral","positive","medium",false,"That was a really insightful point.","这观点真有洞察力。","看透本质提出深刻见解。"));
f4w.push(W("4-5","mindset","/ˈmaɪndset/","n.","心态思维模式",["growth mindset","positive mindset"],"neutral","neutral","high",false,"Growth mindset is key to improvement.","成长型心态是关键。","面对问题的底层框架。"));
f4w.push(W("4-6","compelling","/kəmˈpelɪŋ/","adj.","令人信服的",["compelling argument","compelling evidence"],"neutral","positive","high",false,"She made a compelling case for change.","她提出令人信服的理由。","让人无法忽视。"));
f4w.push(W("4-7","epiphany","/ɪˈpɪfəni/","n.","顿悟",["have an epiphany","moment of epiphany"],"formal","positive","medium",false,"I had an epiphany in the shower.","洗澡时突然顿悟。","突然有深刻认知。"));
f4w.push(W("4-8","cognitive","/ˈkɒɡnətɪv/","adj.","认知的",["cognitive ability","cognitive bias"],"formal","neutral","high",false,"Cognitive biases affect decisions.","认知偏差影响决策。","大脑处理信息相关。"));
f4w.push(W("4-9","coherent","/kəʊˈhɪərənt/","adj.","连贯有条理的",["coherent argument","barely coherent"],"formal","positive","medium",false,"Clear and coherent presentation.","清晰有条理的演示。","逻辑连贯可理解。"));
f4w.push(W("4-10","deduce","/dɪˈdjuːs/","v.","推理推断",["deduce from","logically deduce"],"formal","neutral","medium",false,"We can deduce what happened from evidence.","从证据推断发生了什么。","基于事实的逻辑推理。"));
f4w.push(W("4-11","articulate","/ɑːˈtɪkjʊleɪt/","adj./v.","善表达的",["highly articulate","articulate speaker"],"neutral","positive","high",false,"She is very articulate about her ideas.","她善于表达想法。","清晰准确表达复杂想法。"));
f4w.push(W("4-12","contemplate","/ˈkɒntəmpleɪt/","v.","沉思",["contemplate possibility","sit and contemplate"],"formal","neutral","medium",false,"He sat contemplating meaning of life.","坐着沉思人生意义。","比think更深思熟虑。"));
f4w.push(W("4-13","dichotomy","/daɪˈkɒtəmi/","n.","二分法",["false dichotomy","dichotomy between"],"formal","neutral","medium",false,"A false dichotomy between work and life.","工作与生活虚假二分。","将事物分成对立面。"));
f4w.push(W("4-14","fallacy","/ˈfæləsi/","n.","谬误",["logical fallacy","common fallacy"],"formal","negative","medium",false,"That is a common logical fallacy.","常见逻辑谬误。","看似正确有逻辑缺陷。"));
f4w.push(W("4-15","conceive","/kənˈsiːv/","v.","构想设想",["conceive of","hard to conceive"],"formal","neutral","medium",false,"Hard to conceive of a world without internet.","难想象没有互联网的世界。","脑中形成想法计划。"));
f4w.push(W("4-16","pragmatic","/præɡˈmætɪk/","adj.","务实的",["pragmatic approach","pragmatic solution"],"formal","positive","high",false,"Need a pragmatic solution that works.","需要务实方案。","注重实际效果。"));
f4w.push(W("4-17","rationale","/ˌræʃəˈnɑːl/","n.","根本原因逻辑依据",["explain the rationale","rationale behind"],"formal","neutral","high",false,"What is the rationale behind this.","这个决定背后的逻辑依据。","支撑决策的逻辑推理。"));
f4w.push(W("4-18","reckon","/ˈrekən/","v.","认为估计",["I reckon","reckon so"],"informal","neutral","high",false,"I reckon it will take about two hours.","我估计大约两小时。","口语高频表达。"));
f4w.push(W("4-19","overthink","/ˌəʊvəˈθɪŋk/","v.","过度思考",["do not overthink it","tend to overthink"],"informal","negative","high",false,"Do not overthink it go with your gut.","别想太多跟着直觉。","想太多导致焦虑。"));
f4w.push(W("4-20","second guess","/ˈsekənd ɡes/","v.","事后质疑",["do not second guess yourself"],"informal","negative","medium",false,"Stop second guessing yourself.","别再质疑自己。","反复怀疑自己决定。"));
fields.push({id:"f4",name:"思维方式",desc:"描述思考过程和认知状态的词汇",words:f4w});

// F5: 行为动作
var f5w=[];
f5w.push(W("5-1","procrastinate","/prəˈkræstɪneɪt/","v.","拖延",["stop procrastinating","tend to procrastinate"],"neutral","negative","high",false,"I have been procrastinating on this report all week.","报告拖了一星期了。","明知该做故意推迟。"));
f5w.push(W("5-2","fidget","/ˈfɪdʒɪt/","v./n.","坐立不安",["stop fidgeting","fidget with"],"informal","neutral","medium",true,"He kept fidgeting with his pen.","不停摆弄笔。","紧张无意识小动作。"));
f5w.push(W("5-3","savor","/ˈseɪvə(r)/","v.","细细品味",["savor the moment","savor every bite"],"neutral","positive","medium",false,"Savor the meal slowly.","慢慢品味这顿饭。","慢下来有意识品味。"));
f5w.push(W("5-4","juggle","/ˈdʒʌɡl/","v.","同时应付",["juggle tasks","juggle work and family"],"informal","neutral","high",false,"Juggling full time job and two kids.","一边全职带两孩子。","杂耍比喻同时应付。"));
f5w.push(W("5-5","dread","/dred/","v./n.","非常害怕",["dread the thought","dread doing"],"neutral","negative","high",false,"Dreading the Monday meeting.","特别害怕周一早会。","对即将发生事的恐惧。"));
f5w.push(W("5-6","binge","/bɪndʒ/","v./n.","狂看狂吃",["binge watch","binge eating"],"informal","neutral","high",true,"Binge watched entire season.","刷完了整季。","短时间过量消费。"));
f5w.push(W("5-7","snooze","/snuːz/","v./n.","打盹",["hit snooze","snooze button"],"informal","neutral","high",false,"Hit snooze three times.","按三次贪睡按钮。","闹钟响后再睡。"));
f5w.push(W("5-8","multitask","/ˌmʌltiˈtɑːsk/","v.","多任务",["try to multitask","good at multitasking"],"neutral","neutral","high",false,"Cannot multitask effectively.","无法有效多任务。","同时处理多项任务。"));
f5w.push(W("5-9","scramble","/ˈskræmbl/","v.","匆忙行动",["scramble to","scramble around"],"informal","neutral","medium",false,"Scrambled to finish before deadline.","手忙脚乱赶工。","紧急匆忙完成。"));
f5w.push(W("5-10","linger","/ˈlɪŋɡə(r)/","v.","逗留流连",["linger over","linger on"],"neutral","neutral","medium",false,"Coffee smell lingered in kitchen.","咖啡香味萦绕不散。","停留比预期长。"));
f5w.push(W("5-11","sprint","/sprɪnt/","v./n.","冲刺",["final sprint","sprint to finish"],"neutral","positive","high",false,"Final sprint of the project.","项目最后冲刺。","短时间高强度。"));
f5w.push(W("5-12","whisk","/wɪsk/","v.","迅速带走",["whisk away","whisk through"],"neutral","neutral","medium",false,"Whisked the plate away.","迅速收走盘子。","快速轻巧移动。"));
f5w.push(W("5-13","amble","/ˈæmbl/","v.","漫步",["amble along","amble through"],"neutral","positive","medium",false,"Ambled through the park.","公园里漫步。","悠闲慢走。"));
f5w.push(W("5-14","stroll","/strəʊl/","v./n.","散步",["take a stroll","go for a stroll"],"neutral","positive","high",false,"Take a stroll on the beach.","沿海滩散步。","轻松愉快慢走。"));
f5w.push(W("5-15","stride","/straɪd/","v./n.","大步走",["walk with a stride","confident stride"],"neutral","positive","medium",false,"Strode into the room confidently.","自信大步走进。","又大坚定的步伐。"));
f5w.push(W("5-16","tiptoe","/ˈtɪptəʊ/","v.","踮脚走",["tiptoe around","on tiptoe"],"neutral","neutral","medium",false,"Tiptoed out so I would not wake the baby.","踮脚出去不吵醒婴儿。","小心不出声地走。"));
f5w.push(W("5-17","slouch","/slaʊtʃ/","v./n.","没精打采坐",["do not slouch","slouch in chair"],"informal","negative","medium",false,"Do not slouch sit up straight.","别驼背坐直。","姿势不端正。"));
f5w.push(W("5-18","doze off","/dəʊz ɒf/","v.","打瞌睡",["doze off during","almost doze off"],"informal","neutral","high",false,"Kept dozing off during lecture.","讲座中不停打瞌睡。","不自觉浅睡。"));
f5w.push(W("5-19","sulk","/sʌlk/","v.","生闷气",["sulk in silence","sulk around"],"informal","negative","medium",false,"Sulking in his room all afternoon.","整个下午在房间生闷气。","闷不吭声不满。"));
f5w.push(W("5-20","reminisce","/ˌremɪˈnɪs/","v.","回忆往事",["reminisce about","sit and reminisce"],"neutral","positive","medium",false,"Reminiscing about college days.","回忆大学时光。","愉快回忆美好。"));
fields.push({id:"f5",name:"行为动作",desc:"描述人的行为和行动方式的精准动词",words:f5w});

// F6: 抽象概念
var f6w=[];
f6w.push(W("6-1","resilience","/rɪˈzɪliəns/","n.","韧性恢复力",["build resilience","mental resilience"],"neutral","positive","high",false,"Her resilience in adversity is inspiring.","逆境中的韧性鼓舞人心。","被打倒能弹回来。"));
f6w.push(W("6-2","clarity","/ˈklærəti/","n.","清晰明确",["gain clarity","absolute clarity"],"neutral","positive","high",false,"Need more clarity on requirements.","需要更明确了解需求。","理解上的清晰。"));
f6w.push(W("6-3","momentum","/məˈmentəm/","n.","势头动力",["gain momentum","lose momentum"],"neutral","positive","high",false,"Keep the momentum going.","继续保持势头。","物理学引申做事气势。"));
f6w.push(W("6-4","trade off","/treɪd ɒf/","n.","权衡取舍",["make a trade off","necessary trade off"],"neutral","neutral","high",false,"Always a trade off speed vs quality.","速度质量总有取舍。","获得一样放弃另一样。"));
f6w.push(W("6-5","authenticity","/ˌɔːθenˈtɪsəti/","n.","真实性真诚",["sense of authenticity","value authenticity"],"formal","positive","medium",false,"I appreciate his authenticity.","我欣赏他的真诚。","不伪装保持真我。"));
f6w.push(W("6-6","ambiguity","/ˌæmbɪˈɡjuːəti/","n.","模糊性",["deal with ambiguity","ambiguity tolerance"],"formal","neutral","high",false,"Good leaders handle ambiguity.","好领导从容应对模糊。","信息本身不清晰。"));
f6w.push(W("6-7","integrity","/ɪnˈteɡrəti/","n.","正直完整性",["personal integrity","act with integrity"],"formal","positive","high",false,"He is a man of great integrity.","他是个正直的人。","行为符合道德原则。"));
f6w.push(W("6-8","accountability","/əˌkaʊntəˈbɪləti/","n.","责任感",["take accountability","hold accountable"],"formal","positive","high",false,"Need more accountability in team.","团队需要更多责任感。","对自己行为负责。"));
f6w.push(W("6-9","sustainability","/səˌsteɪnəˈbɪləti/","n.","可持续性",["environmental sustainability","long term sustainability"],"formal","positive","high",false,"Sustainability is at our core.","可持续性是核心。","长期不耗尽资源。"));
f6w.push(W("6-10","brevity","/ˈbrevəti/","n.","简洁",["brevity is key","for sake of brevity"],"formal","positive","medium",false,"Appreciate brevity of report.","欣赏报告简洁。","简短传达完整信息。"));
f6w.push(W("6-11","cohesion","/kəʊˈhiːʒən/","n.","凝聚力",["team cohesion","social cohesion"],"formal","positive","medium",false,"Team cohesion essential for performance.","团队凝聚力对绩效重要。","让群体团结一致。"));
f6w.push(W("6-12","diligence","/ˈdɪlɪdʒəns/","n.","勤奋",["due diligence","with diligence"],"formal","positive","medium",false,"Success from talent plus diligence.","成功来自天赋加勤奋。","持续认真努力。"));
f6w.push(W("6-13","eloquence","/ˈeləkwəns/","n.","雄辩表达力",["speak with eloquence","remarkable eloquence"],"formal","positive","medium",false,"Spoke with such eloquence.","表达如此雄辩。","优雅美感表达力。"));
f6w.push(W("6-14","gratitude","/ˈɡrætɪtjuːd/","n.","感恩",["express gratitude","deep gratitude"],"formal","positive","high",false,"Express my deepest gratitude.","表达最深感激。","比thanks更正式。"));
f6w.push(W("6-15","hindsight","/ˈhaɪndsaɪt/","n.","后见之明",["in hindsight","hindsight is 20 20"],"neutral","neutral","high",false,"In hindsight should have invested more.","事后应多投入。","事后才有的洞见。"));
f6w.push(W("6-16","milestone","/ˈmaɪlstəʊn/","n.","里程碑",["reach a milestone","important milestone"],"neutral","positive","high",false,"Reaching 1 million users was a milestone.","达百万用户是里程碑。","进程标志性节点。"));
f6w.push(W("6-17","red tape","/red teɪp/","n.","官僚手续",["cut through red tape","bureaucratic red tape"],"informal","negative","high",true,"Project delayed by endless red tape.","项目因无尽官僚手续延误。","过度繁琐行政程序。"));
f6w.push(W("6-18","zeitgeist","/ˈzaɪtɡaɪst/","n.","时代精神",["capture the zeitgeist","reflect the zeitgeist"],"formal","neutral","medium",true,"The film captures the zeitgeist.","电影抓住时代精神。","德语借词。"));
f6w.push(W("6-19","solace","/ˈsɒləs/","n.","安慰",["find solace in","take solace"],"formal","positive","medium",false,"Found solace in her art.","在艺术中找慰藉。","悲伤中深层安慰。"));
f6w.push(W("6-20","tenacity","/təˈnæsəti/","n.","坚韧",["sheer tenacity","show tenacity"],"formal","positive","medium",false,"His tenacity is admirable.","他的坚韧令人钦佩。","永不放弃品质。"));
fields.push({id:"f6",name:"抽象概念",desc:"描述抽象概念和品质的高阶词汇",words:f6w});

// F7: 描述与评价
var f7w=[];
f7w.push(W("7-1","sterling","/ˈstɜːlɪŋ/","adj.","极好的",["sterling reputation","sterling service"],"formal","positive","medium",false,"She has a sterling reputation.","她有声誉极好。","最高级的好。"));
f7w.push(W("7-2","mediocre","/ˌmiːdiˈəʊkə(r)/","adj.","平庸的",["mediocre performance","at best mediocre"],"neutral","negative","medium",false,"The food was mediocre.","食物也就是一般。","不差也不值得夸赞。"));
f7w.push(W("7-3","subpar","/ˌsʌbˈpɑː(r)/","adj.","低于标准的",["subpar performance","subpar quality"],"neutral","negative","medium",false,"The product was subpar.","产品差远了。","未达通常预期。"));
f7w.push(W("7-4","pristine","/ˈprɪstiːn/","adj.","崭新完好的",["pristine condition","in pristine condition"],"formal","positive","medium",false,"The car is in pristine condition.","车状况崭新完好。","完美无瑕状态。"));
f7w.push(W("7-5","immaculate","/ɪˈmækjʊlət/","adj.","一尘不染的",["immaculate condition","immaculately dressed"],"formal","positive","medium",false,"Her house is always immaculate.","她家总一尘不染。","全无污渍瑕疵。"));
f7w.push(W("7-6","run of the mill","/ˌrʌn əv ðə ˈmɪl/","adj.","普通的",["pretty run of the mill","nothing special"],"informal","neutral","medium",false,"Just a bit run of the mill.","就是有点普通。","毫无突出之处。"));
f7w.push(W("7-7","stellar","/ˈstelə(r)/","adj.","出色的",["stellar performance","stellar career"],"neutral","positive","high",false,"A stellar job organizing the conference.","组织会议非常出色。","比good更高级。"));
f7w.push(W("7-8","shoddy","/ˈʃɒdi/","adj.","劣质的",["shoddy work","shoddy craftsmanship"],"informal","negative","medium",false,"The craftsmanship was shoddy.","做工粗糙劣质。","偷工减料质量低下。"));
f7w.push(W("7-9","flawless","/ˈflɔːləs/","adj.","完美无瑕的",["flawless performance","absolutely flawless"],"neutral","positive","medium",false,"Her English is flawless.","她英语完美无瑕。","一点错误都没有。"));
f7w.push(W("7-10","tacky","/ˈtæki/","adj.","俗气的",["look tacky","a bit tacky"],"informal","negative","medium",false,"Decorations a bit tacky.","装饰有点俗气。","缺乏品味。"));
f7w.push(W("7-11","gaudy","/ˈɡɔːdi/","adj.","俗艳的",["gaudy jewelry","gaudy colors"],"informal","negative","medium",false,"A gaudy gold necklace.","俗艳的金项链。","过于鲜艳张扬。"));
f7w.push(W("7-12","sleek","/sliːk/","adj.","时尚光滑的",["sleek design","sleek and modern"],"neutral","positive","high",false,"Sleek and modern design.","时尚现代造型。","光滑优雅现代。"));
f7w.push(W("7-13","bulky","/ˈbʌlki/","adj.","笨重的",["bulky item","too bulky"],"neutral","negative","medium",false,"Too bulky to travel with.","带旅行太笨重。","又大又重不便携。"));
f7w.push(W("7-14","clunky","/ˈklʌŋki/","adj.","笨拙粗糙的",["clunky interface","feel clunky"],"informal","negative","medium",false,"Interface is a bit clunky.","界面有点笨拙。","缺乏精细感。"));
f7w.push(W("7-15","seamless","/ˈsiːmləs/","adj.","无缝的",["seamless experience","seamless integration"],"neutral","positive","high",false,"Seamless integration between apps.","应用间无缝集成。","完全感觉不到中断。"));
f7w.push(W("7-16","versatile","/ˈvɜːsətaɪl/","adj.","多功能的",["highly versatile","versatile performer"],"neutral","positive","high",false,"One of the most versatile items.","最百搭的单品。","多种场景可用。"));
f7w.push(W("7-17","user friendly","/ˌjuːzə ˈfrendli/","adj.","方便使用的",["user friendly interface","very user friendly"],"neutral","positive","high",false,"Very user friendly website.","网站非常好用。","易于理解操作。"));
f7w.push(W("7-18","cutting edge","/ˌkʌtɪŋ ˈedʒ/","adj.","尖端的",["cutting edge technology","cutting edge research"],"neutral","positive","high",false,"Cutting edge research in quantum computing.","量子计算前沿研究。","技术最前沿。"));
f7w.push(W("7-19","state of the art","/ˌsteɪt əv ðə ˈɑːt/","adj.","最先进的",["state of the art facility","state of the art equipment"],"formal","positive","high",false,"State of the art medical equipment.","最先进的医疗设备。","同类中最好最新。"));
f7w.push(W("7-20","top notch","/ˌtɒp ˈnɒtʃ/","adj.","一流的",["top notch quality","top notch service"],"informal","positive","high",false,"Top notch service at this restaurant.","这家餐厅服务一流。","最高级别品质。"));
fields.push({id:"f7",name:"描述与评价",desc:"描述物品质量和做出评价的词汇",words:f7w});

// Build output
var out = header + '\nexport const MOCK_VOCABULARY_FIELDS: IVocabularySemanticField[] = [\n';
for(var i=0; i<fields.length; i++){
  var f=fields[i];
  out += '  { id:"'+f.id+'",name:"'+f.name+'",description:"'+f.desc+'",words:[\n';
  out += f.words.join('\n') + '\n';
  out += '  ]},\n';
}
out += '];\n';

fs.writeFileSync('src/data/vocabulary.ts', out);
var wc = out.match(/W\('/g)||[];
console.log('Written vocabulary: '+fields.length+' fields, '+wc.length+' words');
