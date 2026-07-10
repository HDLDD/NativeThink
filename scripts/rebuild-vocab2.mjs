import fs from 'fs';

const fields=[];
function W(id,word,phon,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  const e=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return `W("${id}","${e(word)}","${e(phon)}","${e(pos)}","${e(mean)}",[${coll.map(x=>`"${e(x)}"`).join(',')}],"${reg}","${emo}","${freq}",${noCn},"${e(ex)}","${e(exT)}","${e(deep)}")`;
}

fields.push({id:"f1",name:"情绪表达",desc:"描述各种情绪状态的母语级词汇",words:[
["1-1","serendipity","/ˌserənˈdɪpəti/","n.","意外发现美好事物的运气",["pure serendipity","by serendipity"],"neutral","positive","medium",true,"Finding that book was pure serendipity.","找到那本书纯属意外之喜。","强调意外与美好的结合。"],
["1-2","melancholy","/ˈmelənkɒli/","n./adj.","忧郁的淡淡的忧伤",["a melancholy mood","deep melancholy"],"formal","negative","medium",false,"There was a touch of melancholy in his voice.","他的声音里带着一丝忧郁。","比sad更文学化指深沉持久的忧伤。"],
["1-3","content","/kənˈtent/","adj.","满足的心安的",["content with life","perfectly content"],"neutral","positive","high",false,"She seems content with her simple life.","她似乎对简单的生活感到满足。","强调知足的状态平静的满足感。"],
["1-4","ecstatic","/ɪkˈstætɪk/","adj.","狂喜的",["absolutely ecstatic","ecstatic about"],"neutral","positive","medium",false,"The team was ecstatic after winning the championship.","赢得冠军后团队欣喜若狂。","比happy强度高得多。"],
["1-5","nostalgic","/nɒˈstældʒɪk/","adj.","怀旧的",["feel nostalgic","nostalgic memories"],"neutral","positive","medium",false,"Looking at old photos makes me nostalgic.","看老照片让我感到怀旧。","包含怀念过去的美好与伤感。"],
["1-6","petrified","/ˈpetrɪfaɪd/","adj.","吓呆的",["absolutely petrified","petrified of"],"neutral","negative","medium",false,"I am petrified of public speaking.","我超级害怕公开演讲。","比scared强烈得多。"],
["1-7","overwhelmed","/ˌəʊvəˈwelmd/","adj.","不知所措的",["feel overwhelmed","completely overwhelmed"],"neutral","negative","high",false,"She felt overwhelmed by all the assignments.","所有作业让她不堪重负。","被太多事物压垮的状态。"],
["1-8","grateful","/ˈɡreɪtfʊl/","adj.","感激的",["deeply grateful","eternally grateful"],"neutral","positive","high",false,"I am so grateful for your support.","我非常感激你的支持。","比thankful更强调深刻的感谢。"],
["1-9","resentful","/rɪˈzentfʊl/","adj.","怨恨的",["feel resentful","bitterly resentful"],"neutral","negative","medium",false,"He felt resentful about being passed over.","他因被跳过升职而耿耿于怀。","长期积压的不满。"],
["1-10","exhilarated","/ɪɡˈzɪləreɪtɪd/","adj.","极度兴奋的",["feel exhilarated","absolutely exhilarated"],"formal","positive","medium",false,"She felt exhilarated after the marathon.","完成马拉松后她感到无比兴奋。","带有刺激和活力的兴奋感。"],
["1-11","bewildered","/bɪˈwɪldəd/","adj.","困惑的",["completely bewildered","look bewildered"],"neutral","negative","medium",false,"He looked bewildered by the instructions.","他看着说明一脸迷茫。","比confused更强烈。"],
["1-12","apprehensive","/ˌæprɪˈhensɪv/","adj.","担忧的",["feel apprehensive","apprehensive about"],"formal","negative","medium",false,"She is apprehensive about the new job.","她对开始新工作感到不安。","对即将发生事的模糊忧虑。"],
["1-13","elated","/ɪˈleɪtɪd/","adj.","兴高采烈的",["feel elated","absolutely elated"],"neutral","positive","medium",false,"He was elated when he heard the good news.","听到好消息他兴高采烈。","情绪高涨的状态。"],
["1-14","flabbergasted","/ˈflæbəɡɑːstɪd/","adj.","大吃一惊的",["absolutely flabbergasted"],"informal","neutral","low",false,"I was flabbergasted by the price tag.","看到价格标签大吃一惊。","非常口语化带幽默色彩。"],
["1-15","indifferent","/ɪnˈdɪfrənt/","adj.","漠不关心的",["completely indifferent","remain indifferent"],"neutral","negative","medium",false,"She is indifferent to opinions.","她对别人的想法不在乎。","强调不在乎而非没注意到。"],
]]});

fields.push({id:"f2",name:"职场沟通",desc:"工作场景中的高频精准词汇",words:[
["2-1","leverage","/ˈliːvərɪdʒ/","v./n.","利用资源杠杆",["leverage resources","leverage connections"],"formal","positive","high",true,"We need to leverage our partnerships.","我们需要利用现有合作。","强调放大效果地利用。"],
["2-2","actionable","/ˈækʃənəbl/","adj.","可执行的",["actionable steps","actionable insights"],"formal","positive","high",false,"Give me actionable suggestions.","给我可执行的建议。","具体可操作的。"],
["2-3","bandwidth","/ˈbændwɪdθ/","n.","精力时间资源",["have bandwidth","limited bandwidth"],"informal","neutral","high",true,"I lack bandwidth for more projects.","我没精力再接项目。","源自IT术语引申。"],
["2-4","streamline","/ˈstriːmlaɪn/","v.","精简优化流程",["streamline operations","streamline process"],"formal","positive","high",false,"We are streamlining onboarding.","在精简入职流程。","去除不必要步骤。"],
["2-5","align","/əˈlaɪn/","v.","对齐保持一致",["align goals","stay aligned"],"formal","neutral","high",false,"Align our priorities first.","先确保优先级一致。","方向性统一。"],
["2-6","iterate","/ˈɪtəreɪt/","v.","迭代改进",["iterate on","iterate quickly"],"neutral","positive","high",false,"We will iterate on feedback.","会基于反馈迭代改进。","反复修改接近最优。"],
["2-7","stakeholder","/ˈsteɪkhəʊldə(r)/","n.","利益相关方",["key stakeholders","engage stakeholders"],"formal","neutral","high",false,"Get buy-in from all stakeholders.","获得所有利益相关方认可。","与项目有利害关系。"],
["2-8","deliverable","/dɪˈlɪvərəbl/","n.","交付物",["key deliverables","meet deliverables"],"formal","neutral","high",false,"What are the key deliverables.","关键交付物是什么。","项目管理核心词。"],
["2-9","onboarding","/ˈɒnbɔːdɪŋ/","n.","入职流程",["onboarding process","smooth onboarding"],"neutral","positive","high",true,"Redesigned employee onboarding.","重新设计入职流程。","新人适应融入过程。"],
["2-10","pivot","/ˈpɪvət/","v./n.","转型转向",["pivot strategy","make a pivot"],"neutral","neutral","high",false,"The startup pivoted to B2B.","创业公司转向toB。","核心业务重大转变。"],
["2-11","scalable","/ˈskeɪləbl/","adj.","可扩展的",["scalable solution","highly scalable"],"formal","positive","high",false,"Need a scalable solution.","需要可扩展方案。","能适应增长的。"],
["2-12","synergy","/ˈsɪnədʒi/","n.","协同效应",["create synergy","team synergy"],"formal","positive","medium",false,"The merger creates synergies.","合并产生协同效应。","一加一大于二。"],
["2-13","touchpoint","/ˈtʌtʃpɔɪnt/","n.","接触点",["customer touchpoint","key touchpoints"],"neutral","neutral","medium",true,"Every touchpoint reflects brand.","每个接触点体现品牌。","客户品牌互动节点。"],
["2-14","granular","/ˈɡrænjʊlə/","adj.","细致入微的",["granular data","granular level"],"formal","neutral","medium",false,"Need a granular analysis.","需要更细致分析。","深入最细节层面。"],
["2-15","onus","/ˈəʊnəs/","n.","责任义务",["onus of proof","onus is on"],"formal","neutral","medium",false,"The onus is on us.","责任在我们身上。","比responsibility正式。"],
]]});

fields.push({id:"f3",name:"社交互动",desc:"日常社交场景中的地道表达",words:[
["3-1","vibe","/vaɪb/","n.","氛围感觉气场",["good vibes","weird vibe"],"informal","neutral","high",true,"Really chill vibe here.","这里氛围超放松。","中文只能部分对应。"],
["3-2","small talk","/smɔːl tɔːk/","n.","寒暄闲聊",["make small talk","awkward small talk"],"neutral","neutral","high",false,"Made small talk before meeting.","会前闲聊了几句。","避免沉默的轻松闲聊。"],
["3-3","charisma","/kəˈrɪzmə/","n.","个人魅力",["natural charisma","lack charisma"],"formal","positive","medium",false,"Good speaker lacks charisma.","演讲不错缺魅力。","比charm有领导力意味。"],
["3-4","hang out","/hæŋ aʊt/","v.","一起玩",["hang out with friends","just hanging out"],"informal","positive","high",false,"Hanging out at my place.","正在家待着呢。","最常用非正式相聚。"],
["3-5","catch up","/kætʃ ʌp/","v.","叙旧了解近况",["catch up with","grab coffee and catch up"],"informal","positive","high",false,"We should catch up.","该叙叙旧了。","久别重逢最常用。"],
["3-6","awkward","/ˈɔːkwəd/","adj.","尴尬的",["awkward silence","feel awkward"],"neutral","negative","high",true,"An awkward silence.","一阵尴尬沉默。","比embarrassed更广。"],
["3-7","genuine","/ˈdʒenjuɪn/","adj.","真诚的",["genuine smile","genuine interest"],"neutral","positive","high",false,"She is the most genuine person.","她是最真诚的人。","不虚伪的真实。"],
["3-8","bond","/bɒnd/","v./n.","建立亲密关系",["bond with","bond over"],"neutral","positive","high",false,"Bonded over shared love of hiking.","因共同热爱建立感情。","比connect有感情深度。"],
["3-9","mingle","/ˈmɪŋɡl/","v.","交际",["mingle with","mix and mingle"],"neutral","neutral","medium",false,"Great for mingling with leaders.","与领袖交际的好机会。","走动和不同人交谈。"],
["3-10","rapport","/ræˈpɔː(r)/","n.","融洽关系",["build rapport","establish rapport"],"formal","positive","medium",false,"Built good rapport with students.","和学生们建立了融洽关系。","相互理解和良好沟通。"],
["3-11","camaraderie","/ˌkæməˈrɑːdəri/","n.","同志情谊",["sense of camaraderie","team camaraderie"],"formal","positive","medium",true,"Real camaraderie among team.","团队中真正同志情谊。","共同奋斗的情谊。"],
["3-12","banter","/ˈbæntə(r)/","n./v.","轻松玩笑",["friendly banter","witty banter"],"informal","positive","medium",true,"Banter between hosts was fun.","主持人调侃很有趣。","中文不完全对应。"],
["3-13","small world","/smɔːl wɜːld/","excl.","世界真小",["It is a small world"],"informal","positive","high",false,"You know her too Small world.","你也认识她世界真小。","偶遇时经典感叹。"],
["3-14","RSVP","/ɑːr es viː ˈpiː/","v./n.","请回复出席",["please RSVP","RSVP by Friday"],"formal","neutral","high",false,"Please RSVP by Friday.","周五前回复能否出席。","源自法语正式邀请。"],
["3-15","icebreaker","/ˈaɪsˌbreɪkə(r)/","n.","破冰活动",["team icebreaker","icebreaker game"],"neutral","positive","medium",false,"Started with a quick icebreaker.","以破冰活动开始。","帮陌生人熟悉。"],
]]});

fields.push({id:"f4",name:"思维方式",desc:"描述思考过程和认知状态的词汇",words:[
["4-1","intuitive","/ɪnˈtjuːɪtɪv/","adj.","直观的",["intuitive design","intuitive interface"],"neutral","positive","high",false,"Very intuitive interface.","界面非常直观。","自然易懂无需学习。"],
["4-2","perspective","/pəˈspektɪv/","n.","视角",["gain perspective","fresh perspective"],"neutral","neutral","high",false,"New perspective on life.","对生活全新视角。","看问题的框架角度。"],
["4-3","nuanced","/ˈnjuːɑːnst/","adj.","细致入微的",["nuanced understanding","highly nuanced"],"formal","positive","medium",true,"Issue is more nuanced.","问题更复杂微妙。","有微妙的层次差别。"],
["4-4","insightful","/ˈɪnsaɪtfʊl/","adj.","有洞察力的",["insightful comment","truly insightful"],"neutral","positive","medium",false,"Really insightful point.","真有洞察力的观点。","看透本质的深刻见解。"],
["4-5","mindset","/ˈmaɪndset/","n.","心态思维模式",["growth mindset","positive mindset"],"neutral","neutral","high",false,"Growth mindset is key.","成长型心态是关键。","面对问题的底层框架。"],
["4-6","compelling","/kəmˈpelɪŋ/","adj.","令人信服的",["compelling argument","compelling evidence"],"neutral","positive","high",false,"Made a compelling case.","提出了令人信服的理由。","让人无法忽视。"],
["4-7","epiphany","/ɪˈpɪfəni/","n.","顿悟",["have an epiphany","moment of epiphany"],"formal","positive","medium",false,"Had an epiphany in the shower.","洗澡时突然顿悟。","突然有深刻认知。"],
["4-8","cognitive","/ˈkɒɡnətɪv/","adj.","认知的",["cognitive ability","cognitive bias"],"formal","neutral","high",false,"Cognitive biases affect decisions.","认知偏差影响决策。","大脑处理信息相关。"],
["4-9","coherent","/kəʊˈhɪərənt/","adj.","连贯的",["coherent argument","barely coherent"],"formal","positive","medium",false,"Clear and coherent presentation.","清晰有条理的演示。","逻辑上的连贯性。"],
["4-10","deduce","/dɪˈdjuːs/","v.","推理推断",["deduce from","logically deduce"],"formal","neutral","medium",false,"Deduce what happened from evidence.","从证据推断发生什么。","基于事实的逻辑推理。"],
["4-11","articulate","/ɑːˈtɪkjʊleɪt/","adj./v.","善表达的",["highly articulate","articulate speaker"],"neutral","positive","high",false,"Very articulate about her ideas.","善于表达想法。","清晰表达复杂想法。"],
["4-12","contemplate","/ˈkɒntəmpleɪt/","v.","沉思",["contemplate possibility","sit and contemplate"],"formal","neutral","medium",false,"Contemplating meaning of life.","沉思人生意义。","比think更深思熟虑。"],
["4-13","dichotomy","/daɪˈkɒtəmi/","n.","二分法",["false dichotomy","dichotomy between"],"formal","neutral","medium",false,"False dichotomy work vs life.","工作和生活虚假二分法。","将事物分成两个对立面。"],
["4-14","fallacy","/ˈfæləsi/","n.","谬误",["logical fallacy","common fallacy"],"formal","negative","medium",false,"Common logical fallacy.","常见逻辑谬误。","看似正确有逻辑缺陷。"],
["4-15","conceive","/kənˈsiːv/","v.","构想设想",["conceive of","hard to conceive"],"formal","neutral","medium",false,"Hard to conceive world without internet.","难想象没有互联网的世界。","脑中形成想法计划。"],
]]});

fields.push({id:"f5",name:"行为动作",desc:"描述人的行为和行动方式的精准动词",words:[
["5-1","procrastinate","/prəˈkræstɪneɪt/","v.","拖延",["stop procrastinating","tend to procrastinate"],"neutral","negative","high",false,"Procrastinated on this report all week.","报告拖了一星期。","明知该做却故意推迟。"],
["5-2","fidget","/ˈfɪdʒɪt/","v./n.","坐立不安",["stop fidgeting","fidget with"],"informal","neutral","medium",true,"Kept fidgeting with his pen.","不停摆弄笔。","紧张时无意识动作。"],
["5-3","savor","/ˈseɪvə(r)/","v.","细细品味",["savor the moment","savor every bite"],"neutral","positive","medium",false,"Savor the meal slowly.","慢慢品味这顿饭。","慢下来有意识品味。"],
["5-4","juggle","/ˈdʒʌɡl/","v.","同时应付",["juggle tasks","juggle work and family"],"informal","neutral","high",false,"Juggling full-time job and kids.","一边全职带两孩子。","杂耍比喻同时应付。"],
["5-5","dread","/dred/","v./n.","非常害怕",["dread the thought","dread doing"],"neutral","negative","high",false,"Dreading Monday meeting.","特别害怕周一早会。","对即将发生事的恐惧。"],
["5-6","binge","/bɪndʒ/","v./n.","狂看狂吃",["binge watch","binge eating"],"informal","neutral","high",true,"Binge-watched entire season.","刷完了整季。","短时间过量消费。"],
["5-7","snooze","/snuːz/","v./n.","打盹",["hit snooze","snooze button"],"informal","neutral","high",false,"Hit snooze three times.","按三次贪睡按钮。","闹钟响后再睡。"],
["5-8","multitask","/ˌmʌltiˈtɑːsk/","v.","多任务",["try to multitask","good at multitasking"],"neutral","neutral","high",false,"Cannot multitask effectively.","无法有效多任务。","同时处理多项任务。"],
["5-9","scramble","/ˈskræmbl/","v.","匆忙行动",["scramble to","scramble around"],"informal","neutral","medium",false,"Scrambled to finish before deadline.","手忙脚乱赶工。","紧急匆忙完成。"],
["5-10","linger","/ˈlɪŋɡə(r)/","v.","逗留流连",["linger over","linger on"],"neutral","neutral","medium",false,"Coffee smell lingered in kitchen.","咖啡香味萦绕不散。","停留比预期长。"],
["5-11","sprint","/sprɪnt/","v./n.","冲刺",["final sprint","sprint to finish"],"neutral","positive","high",false,"Final sprint of the project.","项目最后冲刺。","短时间高强度行动。"],
["5-12","whisk","/wɪsk/","v.","迅速带走",["whisk away","whisk through"],"neutral","neutral","medium",false,"Whisked the plate away.","迅速收走盘子。","快速轻巧移动。"],
["5-13","amble","/ˈæmbl/","v.","漫步",["amble along","amble through"],"neutral","positive","medium",false,"Ambled through the park.","公园里漫步。","悠闲慢走。"],
["5-14","stroll","/strəʊl/","v./n.","散步",["take a stroll","go for a stroll"],"neutral","positive","high",false,"Take a stroll on the beach.","沿海滩散个步。","轻松愉快慢走。"],
["5-15","stride","/straɪd/","v./n.","大步走",["walk with a stride","confident stride"],"neutral","positive","medium",false,"Strode into the room confidently.","自信大步走进房间。","又大又坚定的步伐。"],
]]});

fields.push({id:"f6",name:"抽象概念",desc:"描述抽象概念和品质的高阶词汇",words:[
["6-1","resilience","/rɪˈzɪliəns/","n.","韧性恢复力",["build resilience","mental resilience"],"neutral","positive","high",false,"Her resilience is inspiring.","她的韧性鼓舞人心。","被打倒弹回来的能力。"],
["6-2","clarity","/ˈklærəti/","n.","清晰明确",["gain clarity","absolute clarity"],"neutral","positive","high",false,"Need more clarity on requirements.","需要更明确了解需求。","理解上的清晰。"],
["6-3","momentum","/məˈmentəm/","n.","势头动力",["gain momentum","lose momentum"],"neutral","positive","high",false,"Keep the momentum going.","继续保持势头。","物理学引申做事气势。"],
["6-4","trade-off","/ˈtreɪdɒf/","n.","权衡取舍",["make a trade-off","necessary trade-off"],"neutral","neutral","high",false,"Always a trade-off speed vs quality.","速度和质量的权衡。","获得一样放弃另一样。"],
["6-5","authenticity","/ˌɔːθenˈtɪsəti/","n.","真实性真诚",["sense of authenticity","value authenticity"],"formal","positive","medium",false,"Appreciate his authenticity.","欣赏他的真诚。","不伪装的真实自我。"],
["6-6","ambiguity","/ˌæmbɪˈɡjuːəti/","n.","模糊性",["deal with ambiguity","ambiguity tolerance"],"formal","neutral","high",false,"Good leaders handle ambiguity.","好领导从容应对模糊。","信息本身不清晰。"],
["6-7","integrity","/ɪnˈteɡrəti/","n.","正直完整性",["personal integrity","act with integrity"],"formal","positive","high",false,"He is a man of integrity.","他是个正直的人。","行为符合道德原则。"],
["6-8","accountability","/əˌkaʊntəˈbɪləti/","n.","责任感",["take accountability","hold accountable"],"formal","positive","high",false,"Need more accountability.","需要更多责任感。","对自己行为负责。"],
["6-9","sustainability","/səˌsteɪnəˈbɪləti/","n.","可持续性",["environmental sustainability","long-term sustainability"],"formal","positive","high",false,"Sustainability is at our core.","可持续性是核心。","长期不耗尽资源。"],
["6-10","brevity","/ˈbrevəti/","n.","简洁",["brevity is key","for sake of brevity"],"formal","positive","medium",false,"Appreciate brevity of report.","欣赏报告的简洁。","简短传达完整信息。"],
["6-11","cohesion","/kəʊˈhiːʒən/","n.","凝聚力",["team cohesion","social cohesion"],"formal","positive","medium",false,"Team cohesion essential for performance.","团队凝聚力对绩效重要。","让群体团结一致。"],
["6-12","diligence","/ˈdɪlɪdʒəns/","n.","勤奋",["due diligence","with diligence"],"formal","positive","medium",false,"Success from talent plus diligence.","成功来自天赋加勤奋。","持续认真努力工作。"],
["6-13","eloquence","/ˈeləkwəns/","n.","雄辩表达力",["speak with eloquence","remarkable eloquence"],"formal","positive","medium",false,"Spoke with such eloquence.","表达如此雄辩。","优雅美感的表达力。"],
["6-14","gratitude","/ˈɡrætɪtjuːd/","n.","感恩",["express gratitude","deep gratitude"],"formal","positive","high",false,"Express my deepest gratitude.","表达最深感激。","比thanks更正式。"],
["6-15","hindsight","/ˈhaɪndsaɪt/","n.","后见之明",["in hindsight","hindsight is 20/20"],"neutral","neutral","high",false,"In hindsight should have invested more.","事后应多投入。","事后才有的洞见。"],
]]});

// Generate TS
let t = [
'// EXPORTS: IVocabulary, IVocabularySemanticField, MOCK_VOCABULARY_FIELDS',
'export interface IVocabulary {',
'  id: string; word: string; phonetic: string; partOfSpeech: string; meaning: string;',
'  collocations: string[]; register: "formal"|"neutral"|"informal";',
'  emotion: "positive"|"neutral"|"negative"; frequency: "high"|"medium"|"low";',
'  hasNoChineseEquivalent: boolean; example: string; exampleTranslation: string; deepExplanation: string;',
'}',
'export interface IVocabularySemanticField { id: string; name: string; description: string; words: IVocabulary[]; }',
'',
'function W(id:string,word:string,phon:string,pos:string,mean:string,coll:string[],reg:"formal"|"neutral"|"informal",emo:"positive"|"neutral"|"negative",freq:"high"|"medium"|"low",noCn:boolean,ex:string,exT:string,deep:string): IVocabulary {',
'  return {id,word,phonetic:phon,partOfSpeech:pos,meaning:mean,collocations:coll,register:reg,emotion:emo,frequency:freq,hasNoChineseEquivalent:noCn,example:ex,exampleTranslation:exT,deepExplanation:deep}',
'}',
'',
'export const MOCK_VOCABULARY_FIELDS: IVocabularySemanticField[] = [',
];

for(const f of fields){
  t.push(`  { id:"${f.id}",name:"${f.name}",description:"${f.desc}",words:[`);
  for(const w of f.words){
    t.push('    '+W(w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11],w[12])+',');
  }
  t.push('  ]},');
}
t.push('];');
t.push('');

fs.writeFileSync('src/data/vocabulary.ts',t.join('\n'));
const wCount = t.filter(l=>l.trim().startsWith('    W(')).length;
console.log('Vocabulary: '+fields.length+' fields, '+wCount+' words');
