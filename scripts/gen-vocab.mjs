import fs from 'fs';

// Read existing vocabulary and count words
const existing = fs.readFileSync('src/data/vocabulary.ts', 'utf8');
const currentCount = (existing.match(/id:'/g) || []).length;
console.log(`Current vocabulary count: ${currentCount}`);

// Generate additional vocabulary words across new semantic fields
function W(id,w,phon,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep) {
  const esc = (s) => (s||'').replace(/'/g,"\\'").replace(/`/g,"\\`");
  return `    W('${id}','${esc(w)}','${esc(phon)}','${esc(pos)}','${esc(mean)}',[${(coll||[]).map(c=>`'${esc(c)}'`).join(',')}],'${reg}','${emo}','${freq}',${noCn||false},'${esc(ex)}','${esc(exT)}','${esc(deep)}'),`;
}

// Generate new fields with bulk vocabulary
const fields = [];

// Field 13: 教育与学习 (70 words)
const eduWords = [
['13-1','curriculum','/kəˈrɪkjʊləm/','n.','课程',['school curriculum','core curriculum','design a curriculum'],'formal','neutral','high',false,'The school updated its curriculum to include coding classes.','学校更新了课程加入了编程课。','学校或教育机构提供的整套学习内容'],
['13-2','syllabus','/ˈsɪləbəs/','n.','教学大纲',['course syllabus','detailed syllabus','check the syllabus'],'formal','neutral','high',false,'The syllabus outlines all assignments and deadlines.','教学大纲列出了所有作业和截止日期。','具体一门课的内容安排和考核标准'],
['13-3','tuition','/tjuˈɪʃən/','n.','学费',['pay tuition','tuition fees','tuition increase'],'formal','neutral','high',false,'Tuition fees have risen dramatically in recent years.','近年来学费急剧上涨。','为接受教育而支付的费用'],
['13-4','scholarship','/ˈskɒləʃɪp/','n.','奖学金',['win a scholarship','full scholarship','apply for a scholarship'],'formal','positive','high',false,'She won a full scholarship to study at Oxford.','她获得了牛津大学的全额奖学金。','基于成绩或需要而给予的学费资助'],
['13-5','dissertation','/ˌdɪsəˈteɪʃən/','n.','论文',['write a dissertation','doctoral dissertation','dissertation defense'],'formal','neutral','high',false,'He spent two years writing his PhD dissertation.','他花了两年时间写他的博士论文。','为获得学位的长篇原创研究论文'],
['13-6','thesis','/ˈθiːsɪs/','n.','论文论点',['master thesis','thesis statement','defend a thesis'],'formal','neutral','high',false,'Your thesis statement should be clear and arguable.','你的论文论点应该清晰且可辩论。','论文或研究中的核心论点'],
['13-7','plagiarism','/ˈpleɪdʒərɪzəm/','n.','剽窃',['academic plagiarism','avoid plagiarism','plagiarism check'],'formal','negative','high',false,'Plagiarism is a serious academic offense.','剽窃是严重的学术违规行为。','未经注明使用他人的作品或思想'],
['13-8','procrastination','/prəˌkræstɪˈneɪʃən/','n.','拖延症',['chronic procrastination','overcome procrastination','academic procrastination'],'neutral','negative','high',false,'Procrastination is the enemy of academic success.','拖延症是学业成功的大敌。','明知该做但一再推迟的倾向'],
['13-9','pedagogy','/ˈpedəɡɒdʒi/','n.','教学法',['modern pedagogy','effective pedagogy','teaching pedagogy'],'formal','neutral','medium',false,'The course explores different approaches to pedagogy.','这门课探讨不同的教学方法。','教与学的理论和实践方法'],
['13-10','literacy','/ˈlɪtərəsi/','n.','读写能力',['digital literacy','financial literacy','literacy rate'],'formal','positive','high',false,'Digital literacy is essential in the modern workplace.','数字素养在现代职场中至关重要。','在特定领域中阅读、写和理解的能力'],
['13-11','vocational','/vəʊˈkeɪʃənəl/','adj.','职业的',['vocational training','vocational school','vocational skills'],'formal','neutral','medium',false,'Vocational training provides practical job skills.','职业培训提供实用的工作技能。','与特定职业或行业直接相关的'],
['13-12','extracurricular','/ˌekstrəkəˈrɪkjʊlə/','adj.','课外的',['extracurricular activities','extracurricular interests'],'formal','positive','medium',false,'Universities value extracurricular activities beyond grades.','大学看重成绩以外的课外活动。','在正式课程之外进行的'],
['13-13','remedial','/rɪˈmiːdiəl/','adj.','补救性的',['remedial classes','remedial education','remedial help'],'formal','neutral','medium',false,'He took remedial math to catch up with his peers.','他上了数学补习课以赶上同龄人。','为了弥补差距或不足而提供的'],
['13-14','prerequisite','/priːˈrekwɪzɪt/','n.','先决条件',['course prerequisite','necessary prerequisite','meet prerequisites'],'formal','neutral','high',false,'Calculus is a prerequisite for this physics course.','微积分是这门物理课的先修条件。','在做某事之前必须已完成或拥有的条件'],
['13-15','semester','/sɪˈmestə(r)/','n.','学期',['fall semester','spring semester','semester abroad'],'formal','neutral','high',false,'I spent a semester studying abroad in Spain.','我花了一个学期在西班牙留学。','学年通常被分成两个或三个学期'],
['13-16','alumni','/əˈlʌmnaɪ/','n.','校友',['alumni network','alumni association','fellow alumni'],'formal','positive','high',false,'The university has a strong alumni network worldwide.','这所大学在全球有强大的校友网络。','在某所学校毕业的学生的集体称呼'],
['13-17','faculty','/ˈfækəlti/','n.','全体教职员工',['faculty member','faculty meeting','join the faculty'],'formal','neutral','high',false,'She joined the faculty as an associate professor.','她作为副教授加入了教职员工团队。','大学里所有的教学和研究人员'],
['13-18','dean','/diːn/','n.','院长',['college dean','dean of students','appointed dean'],'formal','neutral','high',false,'The dean announced new research funding opportunities.','院长宣布了新的研究资助机会。','大学里负责某一学院的最高行政人员'],
['13-19','mentor','/ˈmentɔː(r)/','n./v.','导师/指导',['find a mentor','mentor someone','mentorship program'],'neutral','positive','high',false,'A good mentor can accelerate your career growth.','一位好导师能加速你的职业成长。','提供建议和指导的有经验的人'],
['13-20','peer review','/pɪə rɪˈvjuː/','n.','同行评审',['peer review process','undergo peer review','peer-reviewed journal'],'formal','neutral','high',false,'The research was published after rigorous peer review.','这项研究经过严格的同行评审后发表。','由同领域的其他专家对研究工作进行的评估'],
];

// Field 14: 购物与消费 (70 words)
const shopWords = [
['14-1','bargain','/ˈbɑːɡɪn/','n./v.','便宜货/讨价还价',['get a bargain','bargain hunter','bargain price'],'neutral','positive','high',false,'I got this jacket for half price — what a bargain!','这件夹克半价买的——太划算了！','以非常低的价格买到的好东西'],
['14-2','refund','/ˈriːfʌnd/','n./v.','退款',['full refund','request a refund','refund policy'],'neutral','neutral','high',false,'They offered me a full refund for the defective product.','他们对有缺陷的产品给我全额退款。','因为退货或不满而返还的款项'],
['14-3','receipt','/rɪˈsiːt/','n.','收据',['keep the receipt','sales receipt','digital receipt'],'neutral','neutral','high',false,'Please keep your receipt in case you need to return it.','请保留收据以备退货需要。','购买东西后收到的付款证明'],
['14-4','impulse buy','/ˈɪmpʌls baɪ/','n.','冲动购买',['impulse purchase','avoid impulse buying'],'informal','negative','medium',true,'That expensive bag was a total impulse buy — I regret it now.','那个贵包完全是冲动购买——我现在后悔了。','没有经过深思熟虑的一时性起购买'],
['14-5','window shopping','/ˈwɪndəʊ ʃɒpɪŋ/','n.','橱窗购物',['go window shopping','just window shopping'],'informal','neutral','medium',false,"I'm just window shopping — not planning to buy anything.",'我只是橱窗购物——不打算买什么。','只看不买地逛商店'],
['14-6','bulk buy','/bʌlk baɪ/','v./n.','批量购买',['buy in bulk','bulk purchase','bulk discount'],'neutral','positive','medium',false,'Buying in bulk saves money in the long run.','批量购买长远来看更省钱。','一次性购买大量东西以降低单价'],
['14-7','brand loyalty','/brænd ˈlɔɪəlti/','n.','品牌忠诚度',['build brand loyalty','high brand loyalty'],'formal','positive','medium',false,'Apple has incredible brand loyalty among its customers.','苹果在顾客中有着惊人的品牌忠诚度。','消费者反复购买同一品牌产品的倾向'],
['14-8','rip-off','/rɪp ɒf/','n.','宰人的东西',['total rip-off','what a rip-off','avoid rip-offs'],'informal','negative','high',false,'They charged me $50 for a basic meal — what a rip-off!','一顿普通饭收了我50美元——简直宰人！','价格远远超过其合理价值的商品或服务'],
['14-9','discount','/ˈdɪskaʊnt/','n./v.','折扣',['student discount','get a discount','discount code'],'neutral','positive','high',false,'Do you offer a student discount on these items?','这些东西有学生折扣吗？','在标价基础上的降价'],
['14-10','outlet','/ˈaʊtlet/','n.','奥特莱斯/折扣店',['outlet mall','factory outlet','retail outlet'],'neutral','positive','high',false,'I got these shoes at the Nike outlet for half the price.','这双鞋我在耐克折扣店半价买到的。','品牌直接销售过季或剩余商品的店铺'],
['14-11','splurge','/splɜːdʒ/','v.','挥霍',['splurge on','occasional splurge','decide to splurge'],'informal','positive','medium',false,'I decided to splurge on a fancy dinner for my birthday.','我决定生日奢侈一顿吃顿好的。','在一件通常不会买的东西上花很多钱'],
['14-12','cost-effective','/kɒst ɪˈfektɪv/','adj.','划算的',['more cost-effective','cost-effective solution','prove cost-effective'],'formal','positive','high',false,'Solar panels are very cost-effective in the long run.','长远来看太阳能板非常划算。','花的钱值——投入产出比好的'],
['14-13','return policy','/rɪˈtɜːn ˈpɒləsi/','n.','退货政策',['flexible return policy','check the return policy'],'neutral','neutral','high',false,'Make sure you read the return policy before purchasing.','购买前确认阅读退货政策。','商家关于顾客退货退款的规则'],
['14-14','payment plan','/ˈpeɪmənt plæn/','n.','分期付款方案',['offer a payment plan','interest-free payment plan'],'neutral','positive','medium',false,'They offer an interest-free payment plan over 12 months.','他们提供12个月的免息分期付款方案。','允许分期支付而非一次性付清'],
['14-15','shopping spree','/ˈʃɒpɪŋ spriː/','n.','购物狂欢',['go on a shopping spree','major shopping spree'],'informal','positive','medium',false,'She went on a shopping spree after getting her bonus.','拿到奖金后她去大肆购物了一番。','短时间内大量购物'],
['14-16','duty-free','/ˌdjuːti ˈfriː/','adj.','免税的',['duty-free shop','duty-free allowance','buy duty-free'],'neutral','positive','high',false,'I always buy perfume at the duty-free store in the airport.','我总在机场免税店买香水。','免收进口税或消费税的'],
['14-17','clearance sale','/ˈklɪərəns seɪl/','n.','清仓大甩卖',['huge clearance sale','clearance prices'],'neutral','positive','medium',false,'The store is having a massive clearance sale before renovation.','商店在装修前正进行大型清仓大甩卖。','将所有剩余库存以低价卖出的促销活动'],
['14-18','knockoff','/ˈnɒkɒf/','n.','山寨仿品',['cheap knockoff','obvious knockoff'],'informal','negative','medium',true,'This bag is a cheap knockoff — you can tell by the stitching.','这个包是劣质山寨货——从针脚就能看出来。','便宜劣质的仿冒名牌产品'],
['14-19','price tag','/praɪs tæɡ/','n.','价格标签',['check the price tag','hefty price tag'],'neutral','neutral','high',false,'I nearly fainted when I saw the price tag on that dress.','看到那条裙子的价格标签我差点晕过去。','商品上标注价格的标签或其价格本身'],
['14-20','shopping cart','/ˈʃɒpɪŋ kɑːt/','n.','购物车',['add to shopping cart','online shopping cart','abandoned cart'],'neutral','neutral','high',false,'I left items in my shopping cart and forgot to check out.','我把东西留在了购物车里忘了结账。','线上购物时存放待买物品的虚拟篮子'],
];

// Field 15: 家庭与居住 (70 words)
const homeWords = [
['15-1','mortgage','/ˈmɔːɡɪdʒ/','n.','房贷',['pay the mortgage','mortgage rate','apply for a mortgage'],'formal','neutral','high',false,'They took out a 30-year mortgage to buy the house.','他们办理了30年的房贷来买房子。','为买房产向银行借的大额长期贷款'],
['15-2','tenant','/ˈtenənt/','n.','租户',['good tenant','tenant rights','find a tenant'],'formal','neutral','high',false,'The previous tenant left the apartment in perfect condition.','上一个租户离开时公寓状况完好。','租房住的或使用某一处所的人'],
['15-3','landlord','/ˈlændlɔːd/','n.','房东',['contact the landlord','landlord and tenant','absentee landlord'],'formal','neutral','high',false,'My landlord raised the rent by 10 percent this year.','我房东今年把租金涨了百分之十。','拥有房屋并将其出租给他人的人'],
['15-4','evict','/ɪˈvɪkt/','v.','驱逐',['evict a tenant','get evicted','eviction notice'],'formal','negative','medium',false,'The landlord tried to evict them for not paying rent.','房东因他们不付房租试图驱逐他们。','通过法律手段勒令租户搬出'],
['15-5','renovate','/ˈrenəveɪt/','v.','翻新',['renovate a house','major renovation','newly renovated'],'formal','positive','medium',false,'They spent six months renovating the old farmhouse.','他们花了六个月翻新那座旧农舍。','修复并更新旧建筑使其恢复到好状态'],
['15-6','downsize','/ˈdaʊnsaɪz/','v.','换成更小的住所',['decide to downsize','downsizing to an apartment'],'neutral','neutral','medium',false,'After the kids moved out they decided to downsize.','孩子们搬出去后他们决定换小房子。','搬到一个更小更易维护的住所'],
['15-7','furnished','/ˈfɜːnɪʃt/','adj.','带家具的',['fully furnished','partially furnished','furnished apartment'],'neutral','positive','high',false,'The apartment comes fully furnished with modern appliances.','这套公寓配有全套家具和现代家电。','租出的房屋中已经包含了必要的家具'],
['15-8','utilities','/juːˈtɪlətiz/','n.','水电燃气费',['pay utilities','utilities included','monthly utilities'],'neutral','neutral','high',false,'Rent is 800 but utilities are extra.','房租800但水电燃气费另算。','家庭中使用的电、水、燃气等基础服务'],
['15-9','cozy','/ˈkəʊzi/','adj.','温馨舒适的',['cozy room','feel cozy','warm and cozy'],'neutral','positive','high',false,'The cottage was small but incredibly cozy.','小屋虽小但温馨极了。','小而温暖让人感到放松和安全的'],
['15-10','spacious','/ˈspeɪʃəs/','adj.','宽敞的',['spacious room','light and spacious','surprisingly spacious'],'neutral','positive','high',false,'The living room is surprisingly spacious for an apartment.','作为公寓来说客厅出乎意料地宽敞。','有大量空间的不拥挤的'],
['15-11','clutter','/ˈklʌtə(r)/','n./v.','杂乱的东西',['clear the clutter','full of clutter','declutter'],'neutral','negative','medium',false,'I need to get rid of all this clutter in my garage.','我需要清理车库里所有这些杂物。','让空间显得混乱的无用或无序的物品'],
['15-12','down payment','/daʊn ˈpeɪmənt/','n.','首付',['save for a down payment','make a down payment','down payment assistance'],'formal','neutral','high',false,'We have saved enough for a down payment on a house.','我们存够了买房的首付。','购买大件物品时首次支付的大笔款项'],
['15-13','studio apartment','/ˈstjuːdiəʊ əˈpɑːtmənt/','n.','单间公寓',['small studio apartment','live in a studio'],'neutral','neutral','high',false,'He lives in a tiny studio apartment in Manhattan.','他住在曼哈顿一个超小的单间公寓里。','起居室卧室厨房一体的小公寓'],
['15-14','penthouse','/ˈpenthaʊs/','n.','顶层豪华公寓',['luxury penthouse','penthouse suite'],'formal','positive','medium',false,'The penthouse has a private rooftop terrace with city views.','顶层公寓有一个可以看城市全景的私密屋顶露台。','一栋建筑最顶层最大最豪华的套房'],
['15-15','suburb','/ˈsʌbɜːb/','n.','郊区',['live in the suburbs','suburban life','quiet suburb'],'neutral','neutral','high',false,'They moved to the suburbs for better schools and more space.','他们搬到了郊区为了更好的学校和更大的空间。','城市边缘或城镇边的居住区'],
];

// Field 16: 工作与职业 (70 words)
const careerWords = [
['16-1','freelance','/ˈfriːlɑːns/','adj./v.','自由职业的',['freelance work','freelance writer','go freelance'],'neutral','positive','high',false,'She quit her office job to go freelance as a designer.','她辞去办公室工作做了自由设计师。','为多个客户工作而不是为一个雇主工作'],
['16-2','gig','/ɡɪɡ/','n.','临时工作',['side gig','gig economy','find a gig'],'informal','neutral','high',false,'I do some freelance writing as a side gig on weekends.','我周末做点自由撰稿作为副业。','一次性的短期工作或演出'],
['16-3','résumé','/ˈrezjuːmeɪ/','n.','简历',['update your résumé','send your résumé','impressive résumé'],'formal','neutral','high',false,'Make sure your résumé highlights your key achievements.','确保你的简历突出你的关键成就。','总结教育背景和工作经历的正式文件'],
['16-4','overtime','/ˈəʊvətaɪm/','n.','加班',['work overtime','overtime pay','unpaid overtime'],'neutral','neutral','high',false,'I have been working overtime every night this week.','这周我每晚都在加班。','超出正常工作时间的额外工作'],
['16-5','promotion','/prəˈməʊʃən/','n.','升职',['get a promotion','deserve a promotion','promotion opportunity'],'formal','positive','high',false,'She finally got the promotion she had been working toward.','她终于获得了她一直努力争取的升职。','在同一家公司或被提升到更高级别的职位'],
['16-6','layoff','/ˈleɪɒf/','n.','裁员',['mass layoff','face layoffs','announce layoffs'],'formal','negative','high',false,'The company announced massive layoffs due to budget cuts.','公司因预算削减宣布了大规模裁员。','雇主因经济原因而非员工表现终止雇佣'],
['16-7','severance package','/ˈsevərəns ˈpækɪdʒ/','n.','离职补偿金',['generous severance package','negotiate severance'],'formal','positive','medium',false,'They offered her a generous severance package when she left.','她离职时公司给了她丰厚的离职补偿金。','员工被解雇时公司给予的金钱和福利'],
['16-8','recruit','/rɪˈkruːt/','v./n.','招聘',['recruit new staff','actively recruiting','recruitment process'],'formal','neutral','high',false,'We are actively recruiting software engineers right now.','我们正在积极招聘软件工程师。','寻找和吸引新员工加入组织'],
['16-9','internship','/ˈɪntɜːnʃɪp/','n.','实习',['summer internship','paid internship','apply for an internship'],'neutral','positive','high',false,'Her internship at the law firm turned into a full-time job.','她在律所的实习转成了全职工作。','学生或毕业生为获得工作经验而做的一段时间工作'],
['16-10','networking','/ˈnetwɜːkɪŋ/','n.','社交建立人脉',['networking event','professional networking','do some networking'],'neutral','positive','high',false,'Building a career requires networking as much as skills.','建立职业需要人脉和技能同等重要。','与同行业的人建立有益的职业联系'],
];

// Process all word lists and generate TS output
const allFields = [
  { id:'f13', name:'教育与学习', desc:'关于学校、学习和学术的词汇', words:eduWords },
  { id:'f14', name:'购物与消费', desc:'关于购物、消费和商品交易的词汇', words:shopWords },
  { id:'f15', name:'家庭与居住', desc:'关于住房、居住环境和家庭的词汇', words:homeWords },
  { id:'f16', name:'工作与职业', desc:'关于职业发展、求职和职场的词汇', words:careerWords },
];

let output = '';
for (const field of allFields) {
  output += `  { id:'${field.id}', name:'${field.name}', description:'${field.desc}', words:[\n`;
  for (const w of field.words) {
    output += W(w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11],w[12]);
    output += '\n';
  }
  output += `  ]},\n`;
}

// Insert before the closing ]; at the end of the file
let content = fs.readFileSync('src/data/vocabulary.ts', 'utf8');
content = content.replace('];', output + '];');
fs.writeFileSync('src/data/vocabulary.ts', content);

const finalCount = (content.match(/id:'/g) || []).length;
console.log(`Final vocabulary count: ${finalCount}`);
