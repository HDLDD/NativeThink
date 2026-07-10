import fs from 'fs';

function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var esc=function(s){return s.replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
  var cs=coll.map(function(x){return "'"+esc(x)+"'"}).join(",");
  return "    W('"+id+"','"+esc(w)+"','"+esc(p)+"','"+esc(pos)+"','"+esc(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+esc(ex)+"','"+esc(exT)+"','"+esc(deep)+"'),";
}

function field(id,name,desc,words){
  var out='  { id:"'+id+'",name:"'+name+'",description:"'+desc+'",words:[\n';
  words.forEach(function(w,i){out+=w+'\n'});
  out+='  ]},\n';
  return out;
}

// F11: 健康健身
var f11=[];
[["workout","/ˈwɜːkaʊt/","n.","锻炼",["intense workout"],"neutral","positive","high",false,"I try to get a quick workout before breakfast.","尽量早餐前快速锻炼。","具体的体育锻炼。"],
["cardio","/ˈkɑːdiəʊ/","n.","有氧运动",["do cardio"],"informal","positive","high",false,"I do 30 min of cardio on treadmill.","跑步机上做30分钟有氧。","心率提升持续运动。"],
["hydration","/haɪˈdreɪʃən/","n.","补水",["stay hydrated"],"formal","positive","high",false,"Proper hydration is essential for performance.","充足补水对表现至关重要。","身体保持适当水分。"],
["wellness","/ˈwelnəs/","n.","整体健康",["mental wellness"],"formal","positive","high",false,"The company has a wellness program.","公司有员工健康计划。","身心灵都良好。"],
["stamina","/ˈstæmɪnə/","n.","耐力",["build stamina"],"formal","positive","medium",false,"Long distance running requires stamina.","长跑需要耐力。","长时间持续活动能力。"],
["sore","/sɔː(r)/","adj.","酸痛的",["feel sore"],"neutral","negative","high",false,"My legs are sore after the hike.","爬山后腿酸痛。","运动后肌肉酸痛。"],
["remedy","/ˈremədi/","n.","疗法",["home remedy"],"neutral","positive","medium",false,"Honey and lemon is my cold remedy.","蜂蜜柠檬是感冒疗法。","缓解治愈的方法。"],
["sedentary","/ˈsedəntri/","adj.","久坐的",["sedentary lifestyle"],"formal","negative","medium",false,"A sedentary lifestyle causes problems.","久坐不动导致健康问题。","大部分时间坐着不动。"],
["allergy","/ˈælədʒi/","n.","过敏",["food allergy"],"neutral","negative","high",false,"She has a severe peanut allergy.","她对花生严重过敏。","身体对物质异常反应。"],
["immunity","/ɪˈmjuːnəti/","n.","免疫力",["boost immunity"],"formal","positive","medium",false,"Exercise and sleep boost immunity.","运动和睡眠提高免疫力。","身体抵抗感染能力。"],
["warm up","/wɔːm ʌp/","phr.v.","热身",["warm up before"],"neutral","positive","high",false,"Always warm up before lifting weights.","举重前一定要热身。","运动前轻度活动。"],
["cool down","/kuːl daʊn/","phr.v.","放松整理",["cool down after"],"neutral","positive","high",false,"Cool down with light stretching.","轻度拉伸放松。","运动后逐渐减速。"],
["diet","/ˈdaɪət/","n.","饮食",["balanced diet"],"neutral","neutral","high",false,"A balanced diet is key to good health.","均衡饮食是健康关键。","平常的饮食模式。"],
["fit","/fɪt/","adj.","健壮的",["stay fit"],"neutral","positive","high",false,"She is the fittest person I know.","她是我认识最健壮的人。","身体强壮健康的。"],
["in shape","/ɪn ʃeɪp/","phr.","身体好的",["stay in shape"],"informal","positive","high",false,"I run every day to stay in shape.","每天跑步保持好身材。","身体状态健康良好。"],
["out of shape","/aʊt əv ʃeɪp/","phr.","身体走样的",["get out of shape"],"informal","negative","high",false,"I got out of shape during holidays.","假期里身体走样了。","缺乏锻炼身体差。"],
["sweat","/swet/","v./n.","出汗",["break a sweat"],"neutral","neutral","high",false,"I worked up a good sweat at the gym.","健身房出了一身汗。","运动时身体排汗。"],
["meditate","/ˈmedɪteɪt/","v.","冥想",["meditate daily"],"neutral","positive","medium",false,"I meditate for ten minutes every morning.","每天早上冥想十分钟。","静坐专注呼吸放松。"],
["stretch","/stretʃ/","v./n.","拉伸",["stretch before exercise"],"neutral","positive","high",false,"Always stretch before and after exercise.","运动前后一定要拉伸。","伸展肌肉和关节。"],
["plank","/plæŋk/","n.","平板支撑",["hold a plank"],"neutral","positive","medium",false,"Hold a plank for sixty seconds.","平板支撑60秒。","俯卧撑姿势静止不动。"],
].forEach(function(w){f11.push(mw("11-"+(f11.length+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]))});

// F12: 教育学习
var f12=[];
[["curriculum","/kəˈrɪkjʊləm/","n.","课程",["school curriculum"],"formal","neutral","high",false,"The school updated its curriculum.","学校更新了课程。","学校整套学习内容。"],
["tuition","/tjuˈɪʃən/","n.","学费",["pay tuition"],"formal","neutral","high",false,"Tuition fees have risen dramatically.","学费急剧上涨。","为受教育支付的费用。"],
["scholarship","/ˈskɒləʃɪp/","n.","奖学金",["win a scholarship"],"formal","positive","high",false,"She won a full scholarship.","获得全额奖学金。","基于成绩的学费资助。"],
["dissertation","/ˌdɪsəˈteɪʃən/","n.","论文",["write a dissertation"],"formal","neutral","high",false,"He spent two years on his dissertation.","花两年写博士论文。","为获学位长篇研究论文。"],
["plagiarism","/ˈpleɪdʒərɪzəm/","n.","剽窃",["academic plagiarism"],"formal","negative","high",false,"Plagiarism is a serious offense.","剽窃是严重学术违规。","未注明使用他人作品。"],
["literacy","/ˈlɪtərəsi/","n.","读写能力",["digital literacy"],"formal","positive","high",false,"Digital literacy is essential today.","数字素养在今天至关重要。","特定领域读写理解能力。"],
["vocational","/vəʊˈkeɪʃənəl/","adj.","职业的",["vocational training"],"formal","neutral","medium",false,"Vocational training provides job skills.","职业培训提供工作技能。","与特定职业直接相关的。"],
["extracurricular","/ˌekstrəkəˈrɪkjʊlə/","adj.","课外的",["extracurricular activities"],"formal","positive","medium",false,"Universities value extracurricular activities.","大学看重课外活动。","正式课程之外的。"],
["semester","/sɪˈmestə(r)/","n.","学期",["fall semester"],"formal","neutral","high",false,"I spent a semester abroad.","花一学期出国留学。","学年分成的两个或三个学期。"],
["alumni","/əˈlʌmnaɪ/","n.","校友",["alumni network"],"formal","positive","high",false,"Strong alumni network worldwide.","全球强大校友网络。","毕业生集体称呼。"],
["mentor","/ˈmentɔː(r)/","n./v.","导师指导",["find a mentor"],"neutral","positive","high",false,"A good mentor accelerates career growth.","好导师加速职业成长。","提供建议指导的经验者。"],
["grade","/ɡreɪd/","n./v.","成绩评分",["get good grades"],"neutral","neutral","high",false,"She always gets top grades in math.","她数学总得最高分。","学业表现的字母或数字评价。"],
["deadline","/ˈdedlaɪn/","n.","截止日期",["meet the deadline"],"neutral","neutral","high",false,"The deadline is next Friday.","截止日期下周五。","必须在此之前完成的时间。"],
["exam","/ɪɡˈzæm/","n.","考试",["final exam"],"neutral","neutral","high",false,"Studying for the final exam all week.","整周都在复习期末考。","知识或技能正式测试。"],
["cram","/kræm/","v.","临时抱佛脚",["cram for an exam"],"informal","negative","high",false,"I crammed all night for the exam.","整夜临时抱佛脚复习。","短时间大量填鸭学习。"],
["drop out","/drɒp aʊt/","phr.v.","辍学",["drop out of school"],"neutral","negative","high",false,"He dropped out to start a business.","辍学去创业。","完成学业前离开。"],
["graduate","/ˈɡrædʒueɪt/","v./n.","毕业毕业生",["graduate from"],"formal","positive","high",false,"She graduated with honors from Yale.","从耶鲁以荣誉毕业。","完成学业获得学位。"],
["major","/ˈmeɪdʒə(r)/","n./v.","专业主修",["college major"],"neutral","neutral","high",false,"I majored in computer science.","主修计算机科学。","大学的主修学科。"],
["degree","/dɪˈɡriː/","n.","学位",["bachelor degree"],"formal","positive","high",false,"She holds a PhD in neuroscience.","拥有神经科学博士学位。","大学授的学术头衔。"],
["textbook","/ˈtekstbʊk/","n.","教科书",["buy a textbook"],"neutral","neutral","high",false,"The textbook costs over a hundred dollars.","教科书一百多美元。","指定阅读书籍。"],
].forEach(function(w){f12.push(mw("12-"+(f12.length+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]))});

// F13: 购物时尚
var f13=[];
[["bargain","/ˈbɑːɡɪn/","n./v.","便宜货讨价还价",["get a bargain"],"neutral","positive","high",false,"Got this jacket at a bargain price.","这件夹克以低价买到。","以低价买的好东西。"],
["refund","/ˈriːfʌnd/","n./v.","退款",["full refund"],"neutral","neutral","high",false,"They offered a full refund.","给了全额退款。","因退货返还的款项。"],
["receipt","/rɪˈsiːt/","n.","收据",["keep the receipt"],"neutral","neutral","high",false,"Keep your receipt for returns.","保留收据以备退货。","购买后收到的付款证明。"],
["rip off","/rɪp ɒf/","n.","宰人的东西",["total rip off"],"informal","negative","high",false,"What a rip off for a basic meal.","便饭这个价简直宰人。","价格远超合理价值的。"],
["discount","/ˈdɪskaʊnt/","n./v.","折扣",["student discount"],"neutral","positive","high",false,"Do you offer a student discount.","有学生折扣吗。","标价基础上的降价。"],
["outlet","/ˈaʊtlet/","n.","折扣店奥特莱斯",["outlet mall"],"neutral","positive","high",false,"Got shoes at the Nike outlet.","在耐克折扣店买的鞋。","品牌直销过季商品。"],
["splurge","/splɜːdʒ/","v.","挥霍",["splurge on"],"informal","positive","medium",false,"Splurged on a fancy dinner.","奢侈了一顿大餐。","在平时不买的东西上花大钱。"],
["duty free","/ˌdjuːti ˈfriː/","adj.","免税的",["duty free shop"],"neutral","positive","high",false,"Bought perfume at duty free.","在免税店买了香水。","免进口税消费税的。"],
["knockoff","/ˈnɒkɒf/","n.","山寨仿品",["cheap knockoff"],"informal","negative","medium",true,"This bag is a cheap knockoff.","这个包是劣质山寨货。","便宜劣质仿冒名牌产品。"],
["in stock","/ɪn stɒk/","phr.","有货",["currently in stock"],"neutral","positive","high",false,"Do you have this in stock.","这个有现货吗。","仓库或商店现有可售。"],
["out of stock","/aʊt əv stɒk/","phr.","缺货",["currently out of stock"],"neutral","negative","high",false,"Sorry that item is out of stock.","抱歉那个商品缺货了。","暂时没有货可卖。"],
["exchange","/ɪksˈtʃeɪndʒ/","v./n.","换货",["exchange for"],"neutral","neutral","high",false,"Can I exchange for a larger size.","能换大一号吗。","用一件商品换另一件。"],
["coupon","/ˈkuːpɒn/","n.","优惠券",["use a coupon"],"neutral","positive","high",false,"I have a 20 percent off coupon.","有张八折优惠券。","提供折扣的票券。"],
["warranty","/ˈwɒrənti/","n.","保修",["under warranty"],"formal","positive","high",false,"Still under warranty repairs free.","还在保修期维修免费。","商家对产品质量保证。"],
["fashionable","/ˈfæʃnəbl/","adj.","时尚的",["very fashionable"],"neutral","positive","high",false,"She always wears fashionable outfits.","她总穿时尚衣服。","跟上最新潮流。"],
["stylish","/ˈstaɪlɪʃ/","adj.","有型的",["stylish design"],"neutral","positive","high",false,"He is always stylishly dressed.","总是穿得很有型。","有品味优雅好看。"],
["trendy","/ˈtrendi/","adj.","时髦的",["trendy spot"],"informal","positive","high",false,"That cafe is the trendy spot now.","那个咖啡馆是时髦去处。","当下流行热门的。"],
["vintage","/ˈvɪntɪdʒ/","adj.","复古的",["vintage clothing"],"neutral","positive","high",false,"She loves vintage clothes shopping.","喜欢淘复古衣服。","来自过去经典风格。"],
["casual","/ˈkæʒuəl/","adj.","休闲的",["casual wear"],"neutral","neutral","high",false,"Office has a casual dress code.","办公室休闲着装。","舒适放松非正式。"],
["brand","/brænd/","n.","品牌",["favorite brand"],"neutral","neutral","high",false,"What is your favorite brand.","你最喜欢什么品牌。","标识某公司产品的名称。"],
].forEach(function(w){f13.push(mw("13-"+(f13.length+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]))});

// F14: 自然天气
var f14=[];
[["drizzle","/ˈdrɪzl/","n./v.","毛毛细雨",["light drizzle"],"neutral","neutral","high",false,"Just a drizzle no umbrella needed.","只是毛毛细雨不用伞。","非常细小的雨滴。"],
["pour","/pɔː(r)/","v.","倾盆大雨",["pouring rain"],"informal","neutral","high",false,"It is pouring outside wait a bit.","外面倾盆大雨等一下。","大雨猛烈地下。"],
["overcast","/ˈəʊvəkɑːst/","adj.","阴天的",["overcast sky"],"neutral","neutral","high",false,"Sky was overcast all day no rain.","天空阴沉一天没下雨。","完全被云覆盖。"],
["breeze","/briːz/","n.","微风",["cool breeze"],"neutral","positive","high",false,"A cool breeze from the ocean.","海面吹来凉风。","轻微到中等风。"],
["gust","/ɡʌst/","n.","阵风",["gust of wind"],"neutral","neutral","medium",false,"A sudden gust blew papers off.","突然一阵风吹飞纸。","突然强于背景的风。"],
["foggy","/ˈfɒɡi/","adj.","有雾的",["foggy morning"],"neutral","neutral","high",false,"So foggy I could barely see.","雾大到几乎看不见。","被浓雾笼罩的。"],
["chilly","/ˈtʃɪli/","adj.","微冷的",["a bit chilly"],"informal","neutral","high",false,"A bit chilly bring a jacket.","有点微冷带件外套。","不刺骨的冷。"],
["drought","/draʊt/","n.","干旱",["severe drought"],"formal","negative","high",false,"Drought for three years now.","干旱已经三年。","降雨极不足的干燥期。"],
["flood","/flʌd/","n./v.","洪水",["flash flood"],"neutral","negative","high",false,"Heavy rain caused severe flooding.","暴雨导致严重水浸。","水超正常淹没地面。"],
["earthquake","/ˈɜːθkweɪk/","n.","地震",["major earthquake"],"formal","negative","high",false,"The quake measured 7.2 on Richter scale.","地震里氏7.2级。","地壳突然运动致地面震动。"],
["pollution","/pəˈluːʃən/","n.","污染",["air pollution"],"formal","negative","high",false,"Air pollution is a major health risk.","空气污染是主要健康风险。","有害物质进入环境。"],
["recycle","/ˌriːˈsaɪkl/","v.","回收",["recycle plastic"],"neutral","positive","high",false,"We recycle all our plastic and glass.","所有塑料和玻璃都回收。","将废物加工成新产品。"],
["organic","/ɔːˈɡænɪk/","adj.","有机的",["organic food"],"formal","positive","high",false,"More people choose organic produce.","更多人选有机农产品。","不用人工化学品种植。"],
["climate change","/ˈklaɪmət tʃeɪndʒ/","n.","气候变化",["tackle climate change"],"formal","negative","high",false,"Climate change is our biggest challenge.","气候变化是最大挑战。","全球长期天气模式变化。"],
["global warming","/ˈɡləʊbl ˈwɔːmɪŋ/","n.","全球变暖",["cause of global warming"],"formal","negative","high",false,"Global warming melts ice caps.","全球变暖融化冰盖。","地球平均温度上升。"],
["endangered","/ɪnˈdeɪndʒəd/","adj.","濒危的",["endangered species"],"formal","negative","high",false,"Pandas were once critically endangered.","熊猫曾极度濒危。","面临灭绝威胁。"],
["renewable","/rɪˈnjuːəbl/","adj.","可再生的",["renewable energy"],"formal","positive","high",false,"Solar and wind are renewable sources.","太阳能风能是可再生能源。","不会耗尽可补充。"],
["conservation","/ˌkɒnsəˈveɪʃən/","n.","保护",["wildlife conservation"],"formal","positive","high",false,"Conservation of rainforests is critical.","保护雨林至关重要。","保护保存自然资源。"],
["bloom","/bluːm/","v./n.","开花花朵",["in full bloom"],"neutral","positive","high",false,"Cherry blossoms are in full bloom.","樱花正在盛放。","花朵打开最美状态。"],
["wilt","/wɪlt/","v.","枯萎",["begin to wilt"],"neutral","negative","medium",false,"Flowers wilted in scorching sun.","花在烈日下枯萎了。","缺水受热垂落。"],
].forEach(function(w){f14.push(mw("14-"+(f14.length+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]))});

// Assemble into file
var c=fs.readFileSync("src/data/vocabulary.ts","utf8");
var lastIdx=c.lastIndexOf('];');
var newFields='';
newFields+=field('f11','健康健身','关于健康运动和身体状态的词汇',f11);
newFields+=field('f12','教育学习','关于学校学习和学术的词汇',f12);
newFields+=field('f13','购物时尚','关于购物消费和时尚的词汇',f13);
newFields+=field('f14','自然天气','关于天气季节和自然环境的词汇',f14);

c=c.substring(0,lastIdx)+newFields+'\n];';
fs.writeFileSync("src/data/vocabulary.ts",c);
var wc=(c.match(/W\('/g)||[]).length;
console.log('Total vocabulary words: '+wc);
