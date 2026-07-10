// Remove fake f17 field and add real vocabulary fields
import fs from 'fs';

let c = fs.readFileSync("src/data/vocabulary.ts","utf8");

// Remove the f17 "扩展词汇" field
let f17Idx = c.indexOf('{ id:"f17",name:"扩展词汇"');
if (f17Idx > 0) {
  // Find the closing of this field: "  ]},\n];"
  let endIdx = c.indexOf('\n];', f17Idx);
  c = c.substring(0, f17Idx) + '\n];';
  console.log("Removed fake f17 field");
}

let wc = (c.match(/W\('/g)||[]).length;
console.log("After removing f17: " + wc + " words");

// Helper to build W() calls
function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var e=function(s){return (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");};
  var cs=coll.map(function(x){return "'"+e(x)+"'"}).join(",");
  return "    W('"+id+"','"+e(w)+"','"+e(p)+"','"+e(pos)+"','"+e(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+e(ex)+"','"+e(exT)+"','"+e(deep)+"'),";
}

function makeField(id,name,desc,wordData){
  var out='  { id:"'+id+'",name:"'+name+'",description:"'+desc+'",words:[\n';
  wordData.forEach(function(w,i){
    out+=mw(id+'-'+(i+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11])+'\n';
  });
  out+='  ]},\n';
  return out;
}

var newFields = '';

// F17: 法律与公正 (40 words)
newFields += makeField('f17','法律与公正','关于法律权利和司法体系的词汇',[
["lawyer","/ˈlɔɪə(r)/","n.","律师",["hire a lawyer","defense lawyer"],"formal","neutral","high",false,"You should consult a lawyer before signing.","签之前应该咨询律师。","提供法律建议和代理的人。"],
["attorney","/əˈtɜːni/","n.","律师代理人",["power of attorney","district attorney"],"formal","neutral","high",false,"The attorney presented evidence to the jury.","律师向陪审团出示了证据。","在法律事务中代表客户的人。"],
["defendant","/dɪˈfendənt/","n.","被告",["the defendant pleaded"],"formal","neutral","high",false,"The defendant pleaded not guilty.","被告辩称无罪。","在法庭上被指控的一方。"],
["plaintiff","/ˈpleɪntɪf/","n.","原告",["the plaintiff alleged"],"formal","neutral","high",false,"The plaintiff is seeking damages.","原告正在寻求赔偿。","提起法律诉讼的一方。"],
["testimony","/ˈtestɪməni/","n.","证词",["give testimony","expert testimony"],"formal","neutral","high",false,"Her testimony was crucial to the case.","她的证词对案件至关重要。","在法庭上宣誓后的正式陈述。"],
["verdict","/ˈvɜːdɪkt/","n.","裁决",["reach a verdict","guilty verdict"],"formal","neutral","high",false,"The jury reached a verdict after two days.","陪审团两天后达成裁决。","陪审团对案件做出的正式决定。"],
["appeal","/əˈpiːl/","v./n.","上诉",["file an appeal","appeal a decision"],"formal","neutral","high",false,"They plan to appeal the court decision.","他们计划对法院判决提出上诉。","请求上级法院复审案件。"],
["sentence","/ˈsentəns/","v./n.","判刑判决",["prison sentence","life sentence"],"formal","negative","high",false,"He received a ten year prison sentence.","他被判十年监禁。","法院对被告施加的惩罚。"],
["evidence","/ˈevɪdəns/","n.","证据",["collect evidence","circumstantial evidence"],"formal","neutral","high",false,"There was not enough evidence to convict him.","没有足够证据定罪。","用于证明或反驳事实的信息。"],
["witness","/ˈwɪtnəs/","n./v.","证人目击",["key witness","witness the event"],"formal","neutral","high",false,"A witness saw the suspect running away.","目击者看到嫌疑人逃跑。","亲眼看到事件发生的人。"],
["jury","/ˈdʒʊəri/","n.","陪审团",["jury duty","jury selection"],"formal","neutral","high",false,"The jury deliberated for three hours.","陪审团商议了三个小时。","决定案件事实的公民小组。"],
["lawsuit","/ˈlɔːsuːt/","n.","诉讼",["file a lawsuit","dismiss a lawsuit"],"formal","negative","high",false,"She filed a lawsuit against the company.","她对该提起了诉讼。","通过法院解决争议的法律程序。"],
["settlement","/ˈsetlmənt/","n.","和解方案",["reach a settlement","out of court settlement"],"formal","neutral","high",false,"They reached a settlement before trial.","审判前达成了和解。","双方同意的解决争议的方案。"],
["contract","/ˈkɒntrækt/","n.","合同",["sign a contract","breach of contract"],"formal","neutral","high",false,"Read the contract carefully before signing.","签合同前仔细阅读。","双方有法律约束力的协议。"],
["clause","/klɔːz/","n.","条款",["contract clause","escape clause"],"formal","neutral","high",false,"There is a penalty clause in the agreement.","协议中有一个罚则条款。","合同或法律文件中的具体条款。"],
["liability","/ˌlaɪəˈbɪləti/","n.","法律责任",["legal liability","limited liability"],"formal","neutral","high",false,"The company accepts no liability for damage.","公司对损坏不承担责任。","法律上的责任或义务。"],
["defamation","/ˌdefəˈmeɪʃən/","n.","诽谤",["sue for defamation","defamation case"],"formal","negative","medium",false,"She sued the newspaper for defamation.","她以诽谤罪起诉了那家报纸。","损害他人声誉的虚假陈述。"],
["fraud","/frɔːd/","n.","欺诈",["commit fraud","credit card fraud"],"formal","negative","high",false,"He was convicted of insurance fraud.","他因保险欺诈被定罪。","以欺骗手段获取非法利益的犯罪。"],
["bail","/beɪl/","n.","保释",["post bail","release on bail"],"formal","neutral","high",false,"The judge set bail at fifty thousand dollars.","法官将保释金定为五万美元。","被告在审判前获释的条件。"],
["probation","/prəˈbeɪʃən/","n.","缓刑",["on probation","probation period"],"formal","neutral","high",false,"He got two years of probation instead of jail.","他获两年缓刑而非入狱。","在监督下于社区服刑的安排。"],
["notary","/ˈnəʊtəri/","n.","公证人",["notary public","notarize a document"],"formal","neutral","medium",false,"You need a notary to witness the signature.","你需要公证人见证签名。","被授权见证签名和认证文件的人。"],
["affidavit","/ˌæfɪˈdeɪvɪt/","n.","宣誓书",["sign an affidavit","sworn affidavit"],"formal","neutral","medium",false,"She signed an affidavit confirming the facts.","她签署了确认事实的宣誓书。","在授权官员面前宣誓后签署的书面陈述。"],
["subpoena","/səˈpiːnə/","n.","传票",["issue a subpoena","respond to subpoena"],"formal","neutral","medium",false,"He was served a subpoena to appear in court.","他被送达传票要求出庭。","命令某人出庭或提供证据的法律文件。"],
["alibi","/ˈælɪbaɪ/","n.","不在场证明",["provide an alibi","solid alibi"],"formal","neutral","medium",false,"He has a solid alibi for the night of the crime.","案发当晚他有可靠的不在场证明。","证明被告在犯罪发生地别处的证据。"],
["plaintiff","/ˈpleɪntɪf/","n.","原告",["the plaintiff claims"],"formal","neutral","high",false,"The plaintiff seeks compensation for damages.","原告寻求损害赔偿。","提起民事诉讼的人。"],
["tort","/tɔːt/","n.","侵权行为",["tort law","tort claim"],"formal","neutral","medium",false,"Negligence is a common tort in personal injury cases.","过失是人身伤害案中常见的侵权行为。","导致他人受伤害可起诉的错误行为。"],
["injunction","/ɪnˈdʒʌŋkʃən/","n.","禁令",["court injunction","seek an injunction"],"formal","neutral","medium",false,"The court issued an injunction to stop construction.","法院发出禁令停止施工。","法院命令某人做或不做某事的命令。"],
["arbitration","/ˌɑːbɪˈtreɪʃən/","n.","仲裁",["binding arbitration","go to arbitration"],"formal","neutral","medium",false,"The dispute was resolved through arbitration.","争议通过仲裁解决。","由中立的第三方解决争议的方式。"],
["plead","/pliːd/","v.","辩护申辩",["plead guilty","plead not guilty"],"formal","neutral","high",false,"He decided to plead guilty to the lesser charge.","他决定对较轻的指控认罪。","在法庭上对指控做出正式回应。"],
["convict","/kənˈvɪkt/","v./n.","定罪罪犯",["convict someone","convicted criminal"],"formal","negative","high",false,"The evidence was enough to convict him.","证据足以给他定罪。","法庭正式宣布某人犯有所指控的罪行。"],
["acquit","/əˈkwɪt/","v.","宣判无罪",["acquit of all charges","be acquitted"],"formal","positive","medium",false,"The jury acquitted her of all charges.","陪审团宣判她所有指控不成立。","正式宣布被告无罪。"],
["testament","/ˈtestəmənt/","n.","遗嘱证明",["last will and testament","a testament to"],"formal","neutral","medium",false,"His success is a testament to hard work.","他的成功是对努力工作的证明。","正式的遗嘱或对某事的证明。"],
["will","/wɪl/","n.","遗嘱",["make a will","reading of the will"],"formal","neutral","high",false,"She updated her will after the baby was born.","宝宝出生后她更新了遗嘱。","说明财产如何分配的法律文件。"],
["heir","/eə(r)/","n.","继承人",["sole heir","rightful heir"],"formal","neutral","medium",false,"He is the sole heir to the family fortune.","他是家族财产的唯一继承人。","依法继承遗产的人。"],
["estate","/ɪˈsteɪt/","n.","遗产财产",["real estate","estate planning"],"formal","neutral","high",false,"The estate was divided among the children.","遗产分给了子女们。","一个人去世后留下的所有财产。"],
["prosecutor","/ˈprɒsɪkjuːtə(r)/","n.","检察官",["public prosecutor","lead prosecutor"],"formal","neutral","high",false,"The prosecutor presented the case against the defendant.","检察官提出了针对被告的指控。","代表政府进行刑事起诉的律师。"],
["litigation","/ˌlɪtɪˈɡeɪʃən/","n.","诉讼程序",["civil litigation","avoid litigation"],"formal","neutral","high",false,"The company wants to avoid costly litigation.","公司想避免昂贵的诉讼。","通过法院系统解决争议的过程。"],
["precedent","/ˈpresɪdənt/","n.","判例先例",["legal precedent","set a precedent"],"formal","neutral","high",false,"This ruling could set an important legal precedent.","此裁决可能设立重要的法律判例。","可作为日后类似案件参考的先前判决。"],
["statute","/ˈstætʃuːt/","n.","成文法",["statute law","under statute"],"formal","neutral","medium",false,"The statute was passed by parliament last year.","该法规去年由议会通过。","立法机关制定的书面法律。"],
["regulation","/ˌreɡjuˈleɪʃən/","n.","法规规章",["government regulation","safety regulation"],"formal","neutral","high",false,"New regulations aim to protect consumers.","新法规旨在保护消费者。","政府机构制定的具体规则。"],
]);

// F18: 媒体与新闻 (40 words)
newFields += makeField('f18','媒体与新闻','关于新闻报道和媒体传播的词汇',[
["headline","/ˈhedlaɪn/","n.","头条标题",["front page headline","catchy headline"],"neutral","neutral","high",false,"The scandal made headlines around the world.","丑闻成了全球头条。","报纸或新闻中的主要标题。"],
["breaking news","/ˈbreɪkɪŋ njuːz/","n.","突发新闻",["breaking news alert"],"neutral","neutral","high",false,"We interrupt this program for breaking news.","我们打断本节目插播突发新闻。","正在发生的紧急新闻报道。"],
["coverage","/ˈkʌvərɪdʒ/","n.","报道覆盖",["media coverage","live coverage"],"neutral","neutral","high",false,"The event received extensive media coverage.","事件获得了广泛媒体报道。","媒体对事件的报道范围。"],
["correspondent","/ˌkɒrɪˈspɒndənt/","n.","驻外记者",["foreign correspondent","war correspondent"],"formal","neutral","high",false,"She works as a foreign correspondent in Beijing.","她在北京担任驻外记者。","从特定地点进行报道的记者。"],
["anchor","/ˈæŋkə(r)/","n.","新闻主播",["news anchor","anchor the show"],"neutral","neutral","high",false,"He has been the evening news anchor for ten years.","他担任晚间新闻主播已十年。","主持新闻节目的主要播报者。"],
["bias","/ˈbaɪəs/","n.","偏见偏差",["media bias","political bias"],"formal","negative","high",false,"The article showed a clear bias toward one side.","文章明显偏向了一方。","不公平地倾向于某一观点。"],
["censorship","/ˈsensəʃɪp/","n.","审查制度",["government censorship","internet censorship"],"formal","negative","high",false,"The report criticized government censorship of media.","报告批评了政府对媒体的审查。","控制或限制信息传播的行为。"],
["propaganda","/ˌprɒpəˈɡændə/","n.","宣传洗脑",["political propaganda","spread propaganda"],"formal","negative","high",false,"The regime uses propaganda to control public opinion.","政权利用宣传控制舆论。","有偏见的信息用来影响人们的观点。"],
["misinformation","/ˌmɪsɪnfəˈmeɪʃən/","n.","错误信息",["spread misinformation","combat misinformation"],"formal","negative","high",false,"Social media can spread misinformation quickly.","社交媒体能快速传播错误信息。","无意中传播的不正确信息。"],
["disinformation","/ˌdɪsɪnfəˈmeɪʃən/","n.","虚假情报",["deliberate disinformation","disinformation campaign"],"formal","negative","medium",false,"The government spread disinformation about the war.","政府散播了关于战争的虚假情报。","故意制造的虚假信息。"],
["fact check","/fækt tʃek/","v./n.","事实核查",["fact check the claim","run a fact check"],"neutral","positive","high",false,"The journalists fact checked every statement.","记者对每句话都做了事实核查。","验证陈述是否准确的检查。"],
["source","/sɔːs/","n.","消息来源",["anonymous source","reliable source"],"neutral","neutral","high",false,"The reporter protected her confidential source.","记者保护了她的机密消息源。","提供信息的人或文件。"],
["press release","/pres rɪˈliːs/","n.","新闻稿",["issue a press release"],"formal","neutral","high",false,"The company issued a press release about the merger.","公司发布了关于合并的新闻稿。","发给媒体的正式声明。"],
["editorial","/ˌedɪˈtɔːriəl/","n.","社论",["write an editorial","editorial board"],"formal","neutral","high",false,"The editorial criticized the new tax policy.","社论批评了新的税收政策。","表达报社观点的文章。"],
["op ed","/ɒp ed/","n.","专栏文章",["write an op ed","op ed piece"],"neutral","neutral","high",false,"She wrote an op ed about climate change.","她写了一篇关于气候变化的专栏。","与报社立场相反的个人观点文章。"],
["columnist","/ˈkɒləmnɪst/","n.","专栏作家",["newspaper columnist","advice columnist"],"neutral","neutral","high",false,"He is a popular political columnist.","他是受欢迎的时政专栏作家。","定期为报纸写专栏的人。"],
["circulation","/ˌsɜːkjʊˈleɪʃən/","n.","发行量",["newspaper circulation","declining circulation"],"formal","neutral","high",false,"The paper has a daily circulation of two million.","该报日发行量两百万份。","报刊杂志的销售或分发数量。"],
["subscription","/səbˈskrɪpʃən/","n.","订阅",["monthly subscription","digital subscription"],"neutral","neutral","high",false,"I have a digital subscription to the Times.","我订阅了纽约时报的数字版。","定期付费获取出版物的安排。"],
["paywall","/ˈpeɪwɔːl/","n.","付费墙",["behind a paywall","paywall content"],"neutral","neutral","medium",true,"The article is behind a paywall.","这篇文章在付费墙后。","限制只有付费用户才能看内容的系统。"],
["clickbait","/ˈklɪkbeɪt/","n.","标题党",["clickbait headline","avoid clickbait"],"informal","negative","high",true,"That headline is pure clickbait.","那个标题纯粹是标题党。","为吸引点击而夸大煽情的标题。"],
["tabloid","/ˈtæblɔɪd/","n.","小报",["tabloid newspaper","tabloid gossip"],"informal","negative","high",false,"The tabloids are full of celebrity gossip.","小报上全是名人八卦。","以煽情八卦为卖点的小型报纸。"],
["broadsheet","/ˈbrɔːdʃiːt/","n.","大报",["broadsheet newspaper","quality broadsheet"],"formal","positive","medium",false,"The Guardian is a respected broadsheet.","卫报是一份受人尊敬的大报。","以严肃新闻为特点的大型报纸。"],
["broadcast","/ˈbrɔːdkɑːst/","v./n.","播送广播",["live broadcast","broadcast live"],"neutral","neutral","high",false,"The debate was broadcast live on national TV.","辩论在全国电视上直播。","通过电视或电台发送节目。"],
["ratings","/ˈreɪtɪŋz/","n.","收视率",["TV ratings","ratings war"],"neutral","neutral","high",false,"The show has the highest ratings this season.","这个节目本季收视率最高。","观看某节目的估计人数。"],
["prime time","/praɪm taɪm/","n.","黄金时段",["prime time TV","prime time slot"],"neutral","neutral","high",false,"The show airs during prime time at 8pm.","节目在晚上八点黄金时段播出。","电视观众最多的时间段。"],
["exclusive","/ɪkˈskluːsɪv/","n./adj.","独家新闻",["exclusive interview","world exclusive"],"neutral","positive","high",false,"The magazine got an exclusive interview with the star.","杂志获得了明星的独家专访。","仅在一家媒体上发布的新闻。"],
["scoop","/skuːp/","n./v.","独家抢先报道",["get a scoop","scoop the competition"],"informal","positive","medium",false,"She scooped all other networks with the story.","她抢先所有其他电视网报道了这个新闻。","在其他媒体之前报道重要新闻。"],
["byline","/ˈbaɪlaɪn/","n.","署名行",["under the byline of","get a byline"],"neutral","neutral","medium",false,"The article appeared under her byline.","文章署着她的名字。","文章顶部显示作者名字的那一行。"],
["embed","/ɪmˈbed/","v./n.","嵌入随军记者",["embedded journalist","embed with troops"],"neutral","neutral","medium",false,"She was embedded with the military unit for six months.","她随部队嵌入报道了六个月。","与军事单位同行的战地记者。"],
["citizen journalism","/ˈsɪtɪzn ˈdʒɜːnəlɪzəm/","n.","公民新闻",["rise of citizen journalism"],"neutral","positive","medium",false,"Citizen journalism played a key role in the protest.","公民新闻在抗议中发挥了关键作用。","普通人通过社交媒体等分享新闻。"],
["photojournalist","/ˌfəʊtəʊˈdʒɜːnəlɪst/","n.","摄影记者",["war photojournalist","award winning photojournalist"],"formal","neutral","medium",false,"The photojournalist captured the decisive moment.","摄影记者捕捉到了决定性瞬间。","通过照片报道新闻的记者。"],
["podcast","/ˈpɒdkɑːst/","n.","播客",["weekly podcast","podcast series"],"neutral","positive","high",false,"Her true crime podcast has millions of listeners.","她的真实犯罪播客有数百万听众。","可下载或串流的音频节目。"],
["newsletter","/ˈnjuːzletə(r)/","n.","时事通讯",["email newsletter","weekly newsletter"],"neutral","neutral","high",false,"Subscribe to our newsletter for weekly updates.","订阅我们的时事通讯获取周更新。","定期通过邮件发送的信息汇总。"],
["media outlet","/ˈmiːdiə ˈaʊtlet/","n.","媒体机构",["mainstream media outlet","independent media outlet"],"formal","neutral","high",false,"The story was picked up by major media outlets.","主要媒体机构都报道了这个故事。","生产新闻和内容的组织。"],
["press conference","/pres ˈkɒnfərəns/","n.","记者会",["hold a press conference","press conference room"],"formal","neutral","high",false,"The CEO called a press conference to address the scandal.","CEO召开记者会回应丑闻。","官员或名人回答记者提问的会议。"],
["hot take","/hɒt teɪk/","n.","即时评论",["post a hot take","controversial hot take"],"informal","neutral","medium",true,"His hot take on the election went viral.","他对大选的即时评论病毒式传播了。","对刚发生的新闻快速发表的观点。"],
["retraction","/rɪˈtrækʃən/","n.","撤回声明",["issue a retraction","demand a retraction"],"formal","negative","medium",false,"The paper issued a retraction of the false story.","报社对虚假报道发布了撤回声明。","承认之前发表的内容有误并撤回。"],
["media literacy","/ˈmiːdiə ˈlɪtərəsi/","n.","媒体素养",["teach media literacy","lack of media literacy"],"formal","positive","medium",false,"Media literacy helps people spot fake news.","媒体素养帮助人们辨别假新闻。","批判性分析和评估媒体内容的能力。"],
["spin","/spɪn/","n./v.","政治化表述旋转",["put a spin on","political spin"],"informal","negative","high",false,"The government put a positive spin on bad news.","政府对坏消息做了正面化表述。","用有利于自己的方式解释信息。"],
["newsworthy","/ˈnjuːzwɜːði/","adj.","有新闻价值的",["newsworthy event","deem newsworthy"],"neutral","positive","high",false,"The story was not deemed newsworthy by editors.","编辑认为这个故事没有新闻价值。","足够重要有趣值得被报道的。"],
]);

// F19: 科学与研究 (40 words)
newFields += makeField('f19','科学与研究','关于科学研究和实验的词汇',[
["hypothesis","/haɪˈpɒθəsɪs/","n.","假设假说",["test a hypothesis","form a hypothesis"],"formal","neutral","high",false,"The experiment tested the hypothesis that sleep improves memory.","实验检验了睡眠改善记忆的假设。","需要通过实验检验的初步理论。"],
["experiment","/ɪkˈsperɪmənt/","n./v.","实验",["conduct an experiment","lab experiment"],"formal","neutral","high",false,"The students conducted a chemistry experiment.","学生做了一个化学实验。","在受控条件下检验假设的测试。"],
["variable","/ˈveəriəbl/","n.","变量",["independent variable","control variable"],"formal","neutral","high",false,"Temperature is the key variable in this study.","温度是本研究中关键的变量。","实验中可以被改变或测量的因素。"],
["control group","/kənˈtrəʊl ɡruːp/","n.","对照组",["compared to control group"],"formal","neutral","high",false,"The control group received a placebo instead of the drug.","对照组接受的是安慰剂而非药物。","实验中不接受处理用于比较的一组。"],
["placebo","/pləˈsiːbəʊ/","n.","安慰剂",["placebo effect","given a placebo"],"formal","neutral","high",false,"Patients who took the placebo also reported improvement.","服了安慰剂的患者也报告了改善。","没有实际药效但产生心理作用的物质。"],
["double blind","/ˈdʌbl blaɪnd/","adj.","双盲的",["double blind study","double blind trial"],"formal","neutral","high",false,"The study was a double blind randomized trial.","这是一项双盲随机试验。","被试和研究者都不知道谁接受处理的实验。"],
["peer review","/pɪə rɪˈvjuː/","n.","同行评审",["peer reviewed journal","undergo peer review"],"formal","neutral","high",false,"The paper was published after rigorous peer review.","论文经严格同行评审后发表。","由同领域专家评估研究质量的过程。"],
["replicate","/ˈreplɪkeɪt/","v.","重复验证",["replicate the results","fail to replicate"],"formal","neutral","high",false,"Other labs failed to replicate the original findings.","其他实验室未能复现原始发现。","重复实验以验证之前的发现。"],
["sample size","/ˈsɑːmpl saɪz/","n.","样本量",["small sample size","adequate sample size"],"formal","neutral","high",false,"A larger sample size would make the study more reliable.","更大的样本量会使研究更可靠。","研究中包含的参与者数量。"],
["correlation","/ˌkɒrɪˈleɪʃən/","n.","相关性",["strong correlation","correlation does not imply causation"],"formal","neutral","high",false,"The study found a correlation between exercise and happiness.","研究发现运动与幸福之间存在相关性。","两个变量之间的统计关系。"],
["causation","/kɔːˈzeɪʃən/","n.","因果关系",["prove causation","causation vs correlation"],"formal","neutral","high",false,"Correlation does not necessarily mean causation.","相关性不一定意味着因果关系。","一件事导致另一件事发生的关系。"],
["data","/ˈdeɪtə/","n.","数据",["collect data","analyze data"],"formal","neutral","high",false,"The researchers collected data from 500 participants.","研究人员收集了500名参与者的数据。"],
["statistics","/stəˈtɪstɪks/","n.","统计学统计",["statistical analysis","official statistics"],"formal","neutral","high",false,"Statistics show a decline in smoking rates.","统计数据显示吸烟率下降。"],
["methodology","/ˌmeθəˈdɒlədʒi/","n.","方法论",["research methodology","scientific methodology"],"formal","neutral","high",false,"The methodology section explains how the study was done.","方法论部分解释了研究是如何进行的。"],
["findings","/ˈfaɪndɪŋz/","n.","研究发现",["research findings","key findings"],"formal","neutral","high",false,"The findings suggest a link between diet and heart health.","研究结果表明饮食与心脏健康有关联。"],
["breakthrough","/ˈbreɪkθruː/","n.","突破",["scientific breakthrough","major breakthrough"],"neutral","positive","high",false,"The discovery was a major breakthrough in cancer research.","这一发现是癌症研究的重大突破。"],
["lab","/læb/","n.","实验室",["research lab","lab results"],"neutral","neutral","high",false,"They are testing the new drug in the lab.","他们正在实验室测试新药。"],
["microscope","/ˈmaɪkrəskəʊp/","n.","显微镜",["under a microscope","electron microscope"],"neutral","neutral","high",false,"The cells were examined under a microscope.","细胞在显微镜下被检查。"],
["telescope","/ˈtelɪskəʊp/","n.","望远镜",["space telescope","look through telescope"],"neutral","neutral","high",false,"The Hubble telescope captured stunning images of space.","哈勃望远镜拍摄了令人惊叹的太空图像。"],
["clinical trial","/ˈklɪnɪkl ˈtraɪəl/","n.","临床试验",["phase three clinical trial","clinical trial results"],"formal","neutral","high",false,"The drug is currently in clinical trials.","该药目前正处于临床试验阶段。"],
["genome","/ˈdʒiːnəʊm/","n.","基因组",["human genome","genome sequencing"],"formal","neutral","high",false,"Scientists mapped the human genome in 2003.","科学家们于2003年绘制了人类基因组。"],
["mutation","/mjuːˈteɪʃən/","n.","突变",["genetic mutation","virus mutation"],"formal","neutral","high",false,"A mutation in the virus made it more contagious.","病毒的突变使其更具传染性。"],
["vaccine","/ˈvæksiːn/","n.","疫苗",["develop a vaccine","get vaccinated"],"formal","positive","high",false,"The vaccine was developed in record time.","疫苗以创纪录的速度被研发出来。"],
["immunity","/ɪˈmjuːnəti/","n.","免疫力",["herd immunity","natural immunity"],"formal","positive","high",false,"Vaccination helps build immunity against the disease.","接种疫苗有助建立对该病的免疫力。"],
["sustainable","/səˈsteɪnəbl/","adj.","可持续的",["sustainable energy","sustainable development"],"formal","positive","high",false,"We need sustainable solutions to climate change.","我们需要应对气候变化的可持续方案。"],
["biodiversity","/ˌbaɪəʊdaɪˈvɜːsəti/","n.","生物多样性",["loss of biodiversity","protect biodiversity"],"formal","positive","high",false,"Coral reefs are hotspots of marine biodiversity.","珊瑚礁是海洋生物多样性的热点。"],
["ecosystem","/ˈiːkəʊˌsɪstəm/","n.","生态系统",["fragile ecosystem","ecosystem services"],"formal","neutral","high",false,"The oil spill devastated the coastal ecosystem.","漏油事件摧毁了沿海生态系统。"],
["fossil fuel","/ˈfɒsl ˈfjuːəl/","n.","化石燃料",["burn fossil fuels","phase out fossil fuels"],"formal","negative","high",false,"Burning fossil fuels releases greenhouse gases.","燃烧化石燃料会释放温室气体。"],
["renewable","/rɪˈnjuːəbl/","adj.","可再生的",["renewable energy","renewable resources"],"formal","positive","high",false,"Solar and wind are the fastest growing renewable sources.","太阳能和风能是增长最快的可再生能源。"],
["carbon neutral","/ˈkɑːbən ˈnjuːtrəl/","adj.","碳中和的",["become carbon neutral","carbon neutral by 2050"],"formal","positive","high",false,"The company aims to be carbon neutral by 2030.","公司目标在2030年前实现碳中和。"],
["AI","/eɪ aɪ/","n.","人工智能",["AI research","AI ethics"],"neutral","neutral","high",false,"AI is transforming scientific research across all fields.","人工智能正在改变所有领域的科学研究。"],
["algorithm","/ˈælɡərɪðəm/","n.","算法",["complex algorithm","machine learning algorithm"],"formal","neutral","high",false,"The algorithm can predict protein structures accurately.","该算法能准确预测蛋白质结构。"],
["quantum","/ˈkwɒntəm/","adj.","量子的",["quantum physics","quantum computing"],"formal","neutral","high",false,"Quantum computers could solve problems impossible for classical ones.","量子计算机能解决传统计算机不可能解决的问题。"],
["neuroscience","/ˈnjʊərəʊsaɪəns/","n.","神经科学",["cognitive neuroscience","neuroscience research"],"formal","neutral","high",false,"Neuroscience helps us understand how the brain works.","神经科学帮助我们理解大脑如何运作。"],
["genetics","/dʒɪˈnetɪks/","n.","遗传学",["molecular genetics","genetics research"],"formal","neutral","high",false,"Genetics plays a major role in many diseases.","遗传学在许多疾病中发挥重要作用。"],
["evolution","/ˌiːvəˈluːʃən/","n.","进化",["theory of evolution","human evolution"],"formal","neutral","high",false,"Evolution explains the diversity of life on Earth.","进化论解释了地球上生命的多样性。"],
["physics","/ˈfɪzɪks/","n.","物理学",["theoretical physics","particle physics"],"formal","neutral","high",false,"Physics seeks to understand the fundamental laws of nature.","物理学寻求理解自然的基本规律。"],
["chemistry","/ˈkemɪstri/","n.","化学",["organic chemistry","chemistry lab"],"formal","neutral","high",false,"Chemistry is the study of matter and its interactions.","化学是研究物质及其相互作用的科学。"],
["biology","/baɪˈɒlədʒi/","n.","生物学",["molecular biology","marine biology"],"formal","neutral","high",false,"Biology is the study of living organisms.","生物学是研究生物的科学。"],
["astronomy","/əˈstrɒnəmi/","n.","天文学",["amateur astronomy","radio astronomy"],"formal","neutral","medium",false,"Astronomy helps us understand our place in the universe.","天文学帮助我们理解人类在宇宙中的位置。"],
]);

// F20: 体育与竞技 (40 words)
newFields += makeField('f20','体育与竞技','关于体育运动和比赛的词汇',[
["athlete","/ˈæθliːt/","n.","运动员",["professional athlete","elite athlete"],"neutral","positive","high",false,"She trained for years to become an Olympic athlete.","她训练多年成为奥运选手。","参加体育比赛的人。"],
["tournament","/ˈtʊənəmənt/","n.","锦标赛",["golf tournament","knockout tournament"],"neutral","neutral","high",false,"The tennis tournament attracts top players worldwide.","网球锦标赛吸引了全球顶尖选手。"],
["championship","/ˈtʃæmpiənʃɪp/","n.","冠军赛",["world championship","win the championship"],"neutral","positive","high",false,"They won the national championship for the third time.","他们第三次赢得全国冠军。"],
["playoffs","/ˈpleɪɒfs/","n.","季后赛",["make the playoffs","playoff game"],"neutral","positive","high",false,"The team secured a spot in the playoffs.","球队锁定了季后赛席位。"],
["semifinal","/ˌsemiˈfaɪnl/","n.","半决赛",["reach the semifinal","semifinal match"],"neutral","neutral","high",false,"They were eliminated in the semifinals.","他们在半决赛中被淘汰。"],
["final","/ˈfaɪnl/","n.","决赛",["reach the final","World Cup final"],"neutral","neutral","high",false,"The final will be held at Wembley Stadium.","决赛将在温布利体育场举行。"],
["overtime","/ˈəʊvətaɪm/","n.","加时赛",["go into overtime","overtime period"],"neutral","neutral","high",false,"The game went into overtime after a 2 to 2 tie.","2比2平后比赛进入加时。"],
["score","/skɔː(r)/","v./n.","得分比分",["final score","score a goal"],"neutral","neutral","high",false,"The final score was 3 to 1 in favor of the home team.","最终比分3比1主队获胜。"],
["referee","/ˌrefəˈriː/","n.","裁判",["the referee blew the whistle"],"neutral","neutral","high",false,"The referee showed a red card to the defender.","裁判向防守队员出示了红牌。"],
["coach","/kəʊtʃ/","n./v.","教练训练",["head coach","coach a team"],"neutral","positive","high",false,"The coach gave an inspiring speech at halftime.","教练在半场时做了鼓舞人心的讲话。"],
["train","/treɪn/","v.","训练",["train hard","train for a marathon"],"neutral","positive","high",false,"Professional athletes train for hours every day.","职业运动员每天训练数小时。"],
["warm up","/wɔːm ʌp/","n./v.","热身",["do a warm up","warm up exercises"],"neutral","positive","high",false,"The players are warming up before the game.","球员们在比赛前热身。"],
["workout","/ˈwɜːkaʊt/","n.","锻炼",["intense workout","daily workout"],"neutral","positive","high",false,"She does a one hour workout every morning.","她每天早上做一小时锻炼。"],
["endurance","/ɪnˈdjʊərəns/","n.","耐力持久力",["build endurance","endurance race"],"formal","positive","high",false,"Marathon running requires great endurance.","马拉松需要极大的耐力。"],
["strength","/streŋθ/","n.","力量",["build strength","physical strength"],"neutral","positive","high",false,"Weight training helps build muscle strength.","重量训练有助于增强肌肉力量。"],
["agility","/əˈdʒɪləti/","n.","敏捷性",["mental agility","agility training"],"formal","positive","medium",false,"The drill improves footwork and agility.","这个训练提高步法和敏捷性。"],
["stamina","/ˈstæmɪnə/","n.","持久力耐力",["build stamina","mental stamina"],"formal","positive","medium",false,"Long distance running builds stamina.","长跑锻炼持久力。"],
["tactics","/ˈtæktɪks/","n.","战术",["team tactics","defensive tactics"],"neutral","neutral","high",false,"The coach changed tactics at halftime.","教练在半场改变了战术。"],
["strategy","/ˈstrætədʒi/","n.","策略",["game strategy","long term strategy"],"neutral","neutral","high",false,"Their strategy was to attack from the wings.","他们的策略是从两翼进攻。"],
["defense","/dɪˈfens/","n.","防守",["play defense","strong defense"],"neutral","neutral","high",false,"The team has a solid defense this season.","球队本赛季防守很稳固。"],
["offense","/əˈfens/","n.","进攻",["go on offense","offense strategy"],"neutral","neutral","high",false,"Their offense scored five touchdowns.","他们的进攻得了五个达阵。"],
["foul","/faʊl/","n./v.","犯规",["commit a foul","foul line"],"neutral","negative","high",false,"The player was penalized for a foul.","该球员因犯规被罚。"],
["penalty","/ˈpenlti/","n.","罚球处罚",["penalty kick","penalty box"],"neutral","negative","high",false,"The referee awarded a penalty to the visiting team.","裁判判给客队一个点球。"],
["substitute","/ˈsʌbstɪtjuːt/","n./v.","替补换人",["bring on a substitute"],"neutral","neutral","high",false,"The manager made three substitutes in the second half.","教练在下半场换了三个人。"],
["goalkeeper","/ˈɡəʊlkiːpə(r)/","n.","守门员",["backup goalkeeper"],"neutral","neutral","high",false,"The goalkeeper made an incredible save.","守门员做出了不可思议的扑救。"],
["striker","/ˈstraɪkə(r)/","n.","前锋射手",["star striker","top striker"],"neutral","neutral","high",false,"The striker scored a hat trick in the final.","前锋在决赛中上演了帽子戏法。"],
["midfielder","/ˈmɪdfiːldə(r)/","n.","中场球员",["central midfielder","attacking midfielder"],"neutral","neutral","high",false,"The midfielder controlled the tempo of the game.","中场球员控制了比赛的节奏。"],
["defender","/dɪˈfendə(r)/","n.","防守球员",["center back defender"],"neutral","neutral","high",false,"The defender cleared the ball off the goal line.","防守球员在门线上解围。"],
["home run","/həʊm rʌn/","n.","本垒打",["hit a home run","grand slam home run"],"neutral","positive","medium",false,"He hit a home run in the ninth inning.","他在第九局打出了本垒打。"],
["touchdown","/ˈtʌtʃdaʊn/","n.","达阵",["score a touchdown","rushing touchdown"],"neutral","positive","medium",false,"The quarterback threw for three touchdowns.","四分卫传出了三次达阵。"],
["slam dunk","/slæm dʌŋk/","n.","灌篮",["powerful slam dunk"],"informal","positive","medium",false,"He finished the fast break with a slam dunk.","他用一记灌篮结束了快攻。"],
["knockout","/ˈnɒkaʊt/","n.","击倒获胜",["technical knockout","knockout punch"],"neutral","positive","medium",false,"The boxer won by knockout in the third round.","拳击手在第三回以击倒获胜。"],
["match point","/mætʃ pɔɪnt/","n.","赛点",["save match point","championship point"],"neutral","neutral","medium",false,"She saved three match points to win the title.","她挽救了三个赛点赢得冠军。"],
["tiebreaker","/ˈtaɪbreɪkə(r)/","n.","决胜局",["go to a tiebreaker","tiebreaker set"],"neutral","neutral","medium",false,"The set went to a tiebreaker at 6 games all.","六平后进入抢七决胜局。"],
["personal best","/ˈpɜːsənl best/","n.","个人最佳纪录",["set a personal best","new personal best"],"neutral","positive","medium",false,"She set a new personal best in the 100 meters.","她创下了百米个人最佳纪录。"],
["world record","/wɜːld ˈrekɔːd/","n.","世界纪录",["break world record","hold world record"],"neutral","positive","high",false,"He broke the world record by two seconds.","他以两秒之差打破了世界纪录。"],
["gold medal","/ɡəʊld ˈmedl/","n.","金牌",["win gold medal","Olympic gold medal"],"neutral","positive","high",false,"She won gold medals in two different events.","她在两个不同项目中都赢得了金牌。"],
["podium","/ˈpəʊdiəm/","n.","领奖台",["stand on podium","podium finish"],"neutral","positive","medium",false,"Three athletes stood on the podium for the ceremony.","三位运动员站在领奖台上接受颁奖。"],
["sportsmanship","/ˈspɔːtsmənʃɪp/","n.","体育精神",["good sportsmanship","display sportsmanship"],"formal","positive","medium",false,"He showed great sportsmanship by congratulating his opponent.","他祝贺对手展现了良好的体育精神。"],
["spectator","/spekˈteɪtə(r)/","n.","观众",["spectator sport","thousands of spectators"],"formal","neutral","high",false,"Over fifty thousand spectators filled the stadium.","五万多名观众挤满了体育场。"],
]);

// Insert new fields before the closing ];
let lastIdx = c.lastIndexOf('];');
c = c.substring(0, lastIdx) + newFields + '\n];';
fs.writeFileSync("src/data/vocabulary.ts", c);

wc = (c.match(/W\('/g)||[]).length;
console.log("Final vocabulary words: " + wc);
