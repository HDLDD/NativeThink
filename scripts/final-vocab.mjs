import fs from 'fs';
let c=fs.readFileSync("src/data/vocabulary.ts","utf8");
let lastIdx=c.lastIndexOf('];');
function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
 var e=function(s){return(s||'').replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
 var cs=coll.map(function(x){return"'"+e(x)+"'"}).join(',');
 return"    W('"+id+"','"+e(w)+"','"+e(p)+"','"+e(pos)+"','"+e(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+e(ex)+"','"+e(exT)+"','"+e(deep)+"'),";
}
function mk(id,name,desc,words){var out='  { id:"'+id+'",name:"'+name+'",description:"'+desc+'",words:[\n';words.forEach(function(w,i){out+=mw(id+'-'+(i+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11])+'\n'});out+='  ]},\n';return out}

var nf='';
nf+=mk('f23','性格品质','描述性格特征和个人品质的词汇',[
["optimistic","/op/","adj.","乐观的",["cautiously optimistic"],"neutral","positive","high",false,"She remains optimistic about the future.","对未来保持乐观。","总是看到积极的一面。"],
["pessimistic","/pes/","adj.","悲观的",["overly pessimistic"],"neutral","negative","medium",false,"Do not be so pessimistic.","别那么悲观。","总是看到消极的一面。"],
["ambitious","/aem/","adj.","有抱负的",["highly ambitious"],"neutral","positive","high",false,"She is ambitious and hardworking.","有抱负且勤奋。","渴望成功和成就。"],
["diligent","/dil/","adj.","勤奋的",["diligent worker"],"formal","positive","medium",false,"A diligent student who never misses class.","从不缺课的勤奋学生。","认真持续努力。"],
["reliable","/ril/","adj.","可靠的",["reliable source"],"neutral","positive","high",false,"One of the most reliable people I know.","我认识最可靠的人之一。","总可以被信赖依靠。"],
["stubborn","/stab/","adj.","固执的",["incredibly stubborn"],"neutral","negative","high",false,"Too stubborn to admit he is wrong.","太固执不肯认错。","不轻易改变想法。"],
["humble","/ham/","adj.","谦虚的",["stay humble"],"neutral","positive","high",false,"Despite success he remains humble.","尽管成功仍保持谦虚。","不自大不炫耀。"],
["arrogant","/aer/","adj.","傲慢的",["incredibly arrogant"],"neutral","negative","high",false,"His arrogant attitude turns people away.","傲慢态度让人远离。","自以为高人一等。"],
["charismatic","/kae/","adj.","有魅力的",["charismatic leader"],"formal","positive","medium",false,"A charismatic speaker captivates audiences.","有魅力的演讲者吸引观众。","有吸引人的个人魅力。"],
["empathetic","/em/","adj.","有同理心的",["empathetic listener"],"formal","positive","medium",false,"An empathetic doctor who really listens.","有同理心的医生。","能理解和感受他人情绪。"],
["compassionate","/kem/","adj.","有同情心的",["compassionate care"],"formal","positive","medium",false,"She is a compassionate nurse.","有同情心的护士。","关心并愿意帮助受苦的人。"],
["generous","/djen/","adj.","慷慨的",["generous donation"],"neutral","positive","high",false,"Generous with both time and money.","时间和金钱都慷慨。"],
["courageous","/ker/","adj.","勇敢的",["courageous decision"],"formal","positive","high",false,"A courageous firefighter saved the child.","勇敢的消防员救了孩子。"],
["outgoing","/aut/","adj.","外向的",["outgoing personality"],"neutral","positive","high",false,"Very outgoing makes friends easily.","非常外向容易交朋友。"],
["introverted","/int/","adj.","内向的",["introverted personality"],"neutral","positive","high",false,"Introverts need alone time to recharge.","内向者需独处充电。"],
["cautious","/kof/","adj.","谨慎的",["overly cautious"],"neutral","neutral","high",false,"Be cautious when investing money.","投资时要谨慎。"],
["curious","/kju/","adj.","好奇的",["naturally curious"],"neutral","positive","high",false,"Curious children ask many questions.","好奇孩子问很多问题。"],
["sincere","/sin/","adj.","真诚的",["sincere apology"],"neutral","positive","high",false,"His apology seemed sincere.","道歉显得真诚。"],
["witty","/wit/","adj.","机智风趣的",["witty remark"],"neutral","positive","medium",false,"Known for her witty comebacks.","以机智反驳闻名。"],
["resilient","/riz/","adj.","有韧性的",["resilient spirit"],"formal","positive","medium",false,"Resilient children bounce back.","有韧性的孩子能恢复。"],
["tenacious","/ten/","adj.","坚韧的",["tenacious grip"],"formal","positive","medium",false,"A tenacious reporter never gives up.","永不放弃的坚韧记者。"],
["versatile","/ver/","adj.","多才多艺的",["versatile performer"],"neutral","positive","high",false,"A versatile actor who can play any role.","能演任何角色的演员。"],
["adaptable","/ed/","adj.","适应力强的",["highly adaptable"],"neutral","positive","high",false,"Adaptable employees thrive in change.","适应力强的员工在变化中成长。"],
["meticulous","/met/","adj.","一丝不苟的",["meticulous attention"],"formal","positive","medium",false,"Meticulous attention to detail.","对细节一丝不苟。"],
["impulsive","/imp/","adj.","冲动的",["impulsive decision"],"neutral","negative","medium",false,"Impulsive purchases led to debt.","冲动消费导致负债。"],
["vain","/vein/","adj.","虚荣的",["incredibly vain"],"neutral","negative","medium",false,"So vain checks mirror constantly.","太虚荣不停照镜子。"],
["patient","/pei/","adj.","有耐心的",["be patient"],"neutral","positive","high",false,"A patient teacher explains clearly.","有耐心的老师解释清楚。"],
["conscientious","/kon/","adj.","认真负责的",["conscientious worker"],"formal","positive","medium",false,"Very conscientious about her work.","对工作非常认真负责。"],
["eccentric","/ik/","adj.","古怪的",["eccentric behavior"],"neutral","positive","medium",false,"An eccentric inventor with unusual ideas.","有不同寻常想法的古怪发明家。"],
["gregarious","/gri/","adj.","合群的",["gregarious nature"],"formal","positive","medium",false,"Gregarious people thrive socially.","合群的人在社交中如鱼得水。"],
["aloof","/el/","adj.","冷漠疏远的",["remain aloof"],"formal","negative","medium",false,"Remained aloof from office politics.","对办公室政治保持疏远。"],
["indifferent","/ind/","adj.","漠不关心的",["completely indifferent"],"neutral","negative","medium",false,"Indifferent to others opinions.","对别人意见不在乎。"],
["reckless","/rek/","adj.","鲁莽的",["reckless driving"],"neutral","negative","medium",false,"Reckless driving endangers everyone.","鲁莽驾驶危及所有人。"],
["modest","/mod/","adj.","谦虚朴素的",["modest about"],"neutral","positive","medium",false,"Modest about her achievements.","对成就很谦虚。"],
["petty","/pet/","adj.","小心眼的",["petty argument"],"neutral","negative","medium",false,"Do not be petty about small mistakes.","别为小错误小心眼。"],
["trustworthy","/tras/","adj.","值得信赖的",["trustworthy person"],"neutral","positive","high",false,"Find a trustworthy mechanic.","找值得信赖的修理工。"],
]);

nf+=mk('f24','历史政治','关于历史事件和政治体系的词汇',[
["democracy","/dim/","n.","民主",["representative democracy"],"formal","positive","high",false,"Democracy gives citizens a voice.","民主赋予公民发声权。"],
["election","/il/","n.","选举",["presidential election"],"formal","neutral","high",false,"The election will be held in November.","选举将于十一月举行。"],
["parliament","/pal/","n.","议会",["member of parliament"],"formal","neutral","high",false,"The bill was passed by parliament.","议案被议会通过。"],
["congress","/kon/","n.","国会",["US Congress"],"formal","neutral","high",false,"Congress approved the new budget.","国会批准了新预算。"],
["senate","/sen/","n.","参议院",["Senate vote"],"formal","neutral","high",false,"The Senate confirmed the nomination.","参议院确认了提名。"],
["president","/prez/","n.","总统",["elect a president"],"formal","neutral","high",false,"The president addressed the nation.","总统向全国发表讲话。"],
["constitution","/kon/","n.","宪法",["written constitution"],"formal","neutral","high",false,"The constitution protects basic rights.","宪法保护基本权利。"],
["amendment","/em/","n.","修正案",["constitutional amendment"],"formal","neutral","high",false,"First Amendment protects free speech.","第一修正案保护言论自由。"],
["veto","/vit/","n.","否决",["presidential veto"],"formal","neutral","high",false,"The president vetoed the bill.","总统否决了议案。"],
["diplomacy","/dip/","n.","外交",["international diplomacy"],"formal","positive","high",false,"Diplomacy prevented conflict escalation.","外交防止了冲突升级。"],
["treaty","/tri/","n.","条约",["peace treaty"],"formal","neutral","high",false,"The nations signed a peace treaty.","两国签署了和平条约。"],
["sanction","/saen/","n.","制裁",["economic sanctions"],"formal","negative","high",false,"UN imposed sanctions on the regime.","联合国对该政权实施制裁。"],
["revolution","/rev/","n.","革命",["industrial revolution"],"formal","neutral","high",false,"The revolution overthrew the monarchy.","革命推翻了君主制。"],
["independence","/ind/","n.","独立",["declare independence"],"formal","positive","high",false,"Gained independence in 1960.","于1960年获得独立。"],
["sovereignty","/sov/","n.","主权",["national sovereignty"],"formal","neutral","high",false,"Nations defend their sovereignty.","国家捍卫其主权。"],
["civil war","/siv/","n.","内战",["outbreak of civil war"],"formal","negative","high",false,"The civil war lasted five years.","内战持续了五年。"],
["monarchy","/mon/","n.","君主制",["constitutional monarchy"],"formal","neutral","high",false,"UK is a constitutional monarchy.","英国是君主立宪制。"],
["reform","/rif/","n.","改革",["economic reform"],"formal","positive","high",false,"Government promised sweeping reforms.","政府承诺全面改革。"],
["activist","/aek/","n.","活动家",["environmental activist"],"neutral","positive","high",false,"A well known environmental activist.","知名环保活动家。"],
["protest","/prou/","n.","抗议",["peaceful protest"],"neutral","neutral","high",false,"Thousands joined the climate protest.","数千人参加气候抗议。"],
["petition","/pet/","n.","请愿书",["sign a petition"],"formal","neutral","high",false,"Petition gathered a million signatures.","请愿书收集了百万签名。"],
["human rights","/hju/","n.","人权",["basic human rights"],"formal","positive","high",false,"Human rights must be protected everywhere.","人权必须在各地得到保护。"],
["refugee","/ref/","n.","难民",["refugee camp"],"formal","neutral","high",false,"Millions of refugees fled the war.","数百万难民逃离战区。"],
["immigration","/im/","n.","移民入境",["immigration policy"],"formal","neutral","high",false,"Immigration is a hot political topic.","移民是热门政治话题。"],
["heritage","/her/","n.","遗产传统",["cultural heritage"],"formal","positive","high",false,"UNESCO World Heritage site.","联合国教科文组织世界遗产。"],
["legacy","/leg/","n.","遗产遗留",["historical legacy"],"formal","neutral","high",false,"Left a complex legacy.","留下了复杂的遗产。"],
["dynasty","/dai/","n.","朝代王朝",["Ming Dynasty"],"formal","neutral","high",false,"Ming Dynasty ruled nearly 300 years.","明朝统治近三百年。"],
["artifact","/at/","n.","文物",["ancient artifact"],"formal","neutral","high",false,"Museum displays ancient artifacts.","博物馆展示古代文物。"],
["archaeology","/ak/","n.","考古学",["archaeology dig"],"formal","neutral","medium",false,"Archaeology reveals secrets of past.","考古学揭示过去秘密。"],
["census","/sen/","n.","人口普查",["national census"],"formal","neutral","high",false,"Census conducted every ten years.","人口普查每十年一次。"],
["cabinet","/kae/","n.","内阁",["cabinet minister"],"formal","neutral","high",false,"The cabinet approved the new policy.","内阁批准了新政策。"],
["majority","/med/","n.","多数",["vast majority"],"formal","neutral","high",false,"The party won a majority.","该党赢得多数席位。"],
["empire","/em/","n.","帝国",["Roman Empire"],"formal","neutral","high",false,"Roman Empire spanned three continents.","罗马帝国横跨三大洲。"],
["colony","/kol/","n.","殖民地",["former colony"],"formal","neutral","high",false,"Once a British colony.","曾是英国殖民地。"],
["rally","/rae/","n.","集会",["political rally"],"neutral","neutral","high",false,"A large rally in the capital.","首都大型集会。"],
["asylum","/es/","n.","庇护",["political asylum"],"formal","neutral","high",false,"Sought asylum after fleeing.","逃离后寻求庇护。"],
]);

c=c.substring(0,lastIdx)+nf+'\n];';
fs.writeFileSync('src/data/vocabulary.ts',c);
var wc=(c.match(/W\('/g)||[]).length;
console.log('Total words: '+wc);
