import fs from 'fs';

function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var e=function(s){return s.replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
  var cs=coll.map(function(x){return "'"+e(x)+"'"}).join(",");
  return "    W('"+id+"','"+e(w)+"','"+e(p)+"','"+e(pos)+"','"+e(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+e(ex)+"','"+e(exT)+"','"+e(deep)+"'),";
}

function field(id,name,desc,words){
  var out='  { id:"'+id+'",name:"'+name+'",description:"'+desc+'",words:[\n';
  words.forEach(function(w,i){out+=w+'\n'});
  out+='  ]},\n';
  return out;
}

var c=fs.readFileSync("src/data/vocabulary.ts","utf8");
var lastIdx=c.lastIndexOf('];');
var newFields='';

// F15: 科技数字 (50 words)
var f15=[];
[
["algorithm","/al","n.","算法",["complex algorithm"],"formal","neutral","high",false,"The algorithm recommends videos.","算法根据历史推荐视频。","解决问题的规则步骤。"],
["bug","/bag/","n.","程序错误",["fix a bug"],"informal","negative","high",false,"The devs are fixing a critical bug.","开发人员修复关键bug。","软件中的错误缺陷。"],
["crash","/krae/","v./n.","崩溃",["app crashed"],"informal","negative","high",false,"My laptop crashed before I could save.","笔记本还没保存就崩溃了。","程序突然停止工作。"],
["tech savvy","/tek saevi/","adj.","懂技术的",["tech savvy users"],"informal","positive","medium",false,"You do not need to be tech savvy.","不需要很懂技术。","熟练使用科技产品。"],
["glitch","/glitf/","n.","小故障",["minor glitch"],"informal","negative","medium",false,"A small glitch but fixed now.","出了小故障但已解决。","临时的轻微错误。"],
["encryption","/enkrip/","n.","加密",["end to end encryption"],"formal","neutral","high",false,"Encryption protects your privacy.","加密保护隐私。","将数据转换为代码防访问。"],
["cloud storage","/klaud/","n.","云存储",["use cloud storage"],"neutral","positive","high",false,"Back up files to cloud storage.","备份文件到云存储。","数据保存在远程服务器。"],
["gig economy","/gig/","n.","零工经济",["gig economy worker"],"informal","neutral","high",false,"The gig economy offers flexibility.","零工经济提供灵活性。","短期合同自由职业市场。"],
["phishing","/fifin/","n.","网络钓鱼",["phishing email"],"formal","negative","high",false,"Beware of phishing emails.","小心网络钓鱼邮件。","伪装合法机构窃取信息。"],
["malware","/maelwer/","n.","恶意软件",["malware attack"],"formal","negative","high",false,"Install antivirus to prevent malware.","装杀毒软件防恶意软件。","损害入侵设备的软件。"],
["streaming","/striming/","n.","流媒体播放",["streaming service"],"neutral","neutral","high",false,"Streaming changed entertainment forever.","流媒体永远改变了娱乐。","实时网络传输音视频。"],
["dark mode","/dark moud/","n.","深色模式",["enable dark mode"],"neutral","positive","high",false,"I use dark mode at night.","晚上用深色模式。","浅色文字在深色背景上。"],
["firewall","/fairwol/","n.","防火墙",["set up firewall"],"formal","neutral","high",false,"A firewall protects your network.","防火墙保护你的网络。","监控网络流量的安全系统。"],
["reboot","/ribut/","v./n.","重启",["reboot the system"],"formal","neutral","high",false,"Try rebooting your computer first.","先试试重启电脑。","关闭再重新打开设备。"],
["wireless","/wairles/","adj.","无线的",["wireless connection"],"neutral","positive","high",false,"Love my wireless earbuds.","爱我的无线耳机。","不需要物理电线的。"],
["sync","/sink/","v./n.","同步",["sync up"],"informal","neutral","high",false,"The app syncs across all devices.","应用在所有设备间同步。","使信息在不同设备一致。"],
["beta","/bite/","n./adj.","测试版",["beta version"],"neutral","neutral","high",false,"The app is still in beta testing.","应用还在测试阶段。","正式发布前的试用版本。"],
["obsolete","/obsilit/","adj.","过时的",["become obsolete"],"formal","negative","medium",false,"Smartphones made GPS devices obsolete.","智能手机淘汰了独立GPS。","因技术发展不再被需要。"],
["AI","/ei ai/","n.","人工智能",["AI technology"],"formal","neutral","high",false,"AI is reshaping every industry.","AI正在重塑每个行业。","Artificial Intelligence缩写。"],
["virtual reality","/virtjuel/","n.","虚拟现实",["VR headset"],"neutral","positive","medium",false,"VR transforms gaming and education.","VR改变游戏和教育。","计算机生成的沉浸式3D环境。"],
["smart home","/smart houm/","n.","智能家居",["smart home devices"],"neutral","positive","high",false,"Smart home devices control lights.","智能家居设备控制灯光。","科技自动化的家庭系统。"],
["wearable","/werabl/","n.","可穿戴设备",["wearable tech"],"neutral","positive","high",false,"Smartwatches are popular wearables.","智能手表是流行可穿戴设备。","戴在身上的科技产品。"],
["emoji","/imoudji/","n.","表情符号",["use emoji"],"informal","neutral","high",true,"I use emojis to express emotions.","用表情符号表达情绪。","消息中的小图标。"],
["hashtag","/haeftaeg/","n.","话题标签",["use hashtags"],"informal","neutral","high",false,"Use relevant hashtags for visibility.","用相关标签增加曝光。","社交媒体带井号的关键词。"],
["meme","/mim/","n.","网络迷因",["internet meme"],"informal","positive","medium",true,"That meme went viral overnight.","那个迷因一夜病毒传播。","社交媒体搞笑传播内容。"],
["influencer","/influenser/","n.","网红影响者",["social media influencer"],"informal","neutral","high",true,"Brands partner with influencers.","品牌与网红合作做广告。","有很多粉丝的人。"],
["podcast","/podkast/","n.","播客",["listen to podcast"],"informal","positive","high",false,"I listen to podcasts on my commute.","通勤路上听播客。","可下载的音频节目。"],
["selfie","/selfi/","n.","自拍",["take a selfie"],"informal","neutral","high",true,"She took a selfie at the concert.","演唱会上拍了张自拍。","自己拍自己的照片。"],
["spam","/spaem/","n.","垃圾信息",["spam email"],"informal","negative","high",false,"My inbox is full of spam.","收件箱全是垃圾邮件。","不请自来的无用信息。"],
["viral","/vairl/","adj.","病毒式传播",["go viral"],"informal","positive","high",false,"The video went viral in hours.","视频几小时病毒传播。","快速在网络上广泛传播。"],
["dashboard","/daefbord/","n.","仪表盘",["control dashboard"],"neutral","neutral","high",false,"The dashboard shows all your stats.","仪表盘显示所有统计数据。","关键信息控制面板。"],
["profile","/proufail/","n.","个人资料",["user profile"],"neutral","neutral","high",false,"Update your profile before applying.","申请前更新个人资料。","在线平台个人信息页。"],
["settings","/setingz/","n.","设置",["privacy settings"],"neutral","neutral","high",false,"Check your privacy settings.","检查隐私设置。","调整应用行为的选项。"],
["tutorial","/tjutorial/","n.","教程",["video tutorial"],"neutral","positive","high",false,"Watch the tutorial before starting.","开始前先看教程。","教人使用的指南。"],
["FAQ","/ef ei kju/","n.","常见问题",["FAQ page"],"neutral","neutral","high",false,"Check the FAQ before contacting support.","联系客服前先看FAQ。","Frequently Asked Questions。"],
["notification","/noutifikeifn/","n.","通知",["push notification"],"neutral","neutral","high",false,"Turn off unnecessary notifications.","关掉不必要通知。","应用发来的提醒消息。"],
["username","/juzerneim/","n.","用户名",["choose username"],"neutral","neutral","high",false,"Choose a unique username.","选一个独特的用户名。","在线账户唯一标识。"],
["password","/paswerd/","n.","密码",["strong password"],"neutral","neutral","high",false,"Use a strong password with symbols.","用带符号的强密码。","保护账户安全的密钥。"],
["blog","/blog/","n.","博客",["write a blog"],"neutral","neutral","high",false,"She writes a popular food blog.","她写热门美食博客。","定期更新的个人或专业网站。"],
["clickbait","/klikbeit/","n.","标题党",["clickbait headline"],"informal","negative","medium",true,"That headline is pure clickbait.","那个标题纯粹是标题党。","用夸张标题吸引点击。"],
["machine learning","/mefin lerning/","n.","机器学习",["ML algorithms"],"formal","neutral","high",false,"ML powers recommendation systems.","机器学习驱动推荐系统。","AI分支让机器从数据学习。"],
["blockchain","/bloktfein/","n.","区块链",["blockchain technology"],"formal","neutral","high",false,"Blockchain enables cryptocurrencies.","区块链使加密货币成为可能。","去中心化分布式账本技术。"],
["augmented reality","/ogmentid/","n.","增强现实",["AR experience"],"formal","positive","medium",false,"AR overlays info on real world.","AR在现实世界叠加信息。","在现实上叠加数字信息。"],
["unfriend","/anfrend/","v.","删除好友",["unfriend someone"],"informal","negative","medium",false,"I had to unfriend him after that.","那条之后只能删了他。","社交媒体上移除某人。"],
["bug report","/bag riport/","n.","错误报告",["submit a bug report"],"neutral","neutral","high",false,"Submit a detailed bug report.","提交详细错误报告。","向开发者描述问题的信息。"],
["screen time","/skrin taim/","n.","屏幕时间",["reduce screen time"],"informal","negative","high",false,"Too much screen time hurts your eyes.","太多屏幕时间伤眼睛。","盯着屏幕的时间量。"],
["unplug","/anplag/","v.","拔掉插头远离屏幕",["unplug and relax"],"informal","positive","medium",false,"Unplug from devices on weekends.","周末远离电子设备。","断开电源网络休息。"],
["digital detox","/didjitl ditoks/","n.","数字排毒",["do a digital detox"],"informal","positive","medium",true,"Take a digital detox for a week.","做一周的数字排毒。","一段时间不用电子设备。"],
["binge watch","/bindj wotf/","v.","刷剧",["binge watch a series"],"informal","neutral","high",true,"Binge watched the entire season.","刷完了整季。","连续看很多集电视剧。"],
["scroll","/skroul/","v.","滚动浏览",["scroll through"],"informal","neutral","high",false,"Scrolling through social media for hours.","刷了几个小时社交媒体。","在屏幕上上下滑动浏览。"],
].forEach(function(w){f15.push(mw("15-"+(f15.length+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]))});

// F16: 金融理财 (50 words)
var f16=[];
[
["budget","/badjit/","n./v.","预算",["monthly budget"],"neutral","neutral","high",false,"Set a monthly budget and stick to it.","设定月度预算坚持执行。","收入和支出的计划。"],
["invest","/invest/","v.","投资",["invest in stocks"],"formal","positive","high",false,"Invest for long term growth.","投资长期增长。","购买资产期望获利。"],
["savings","/seivingz/","n.","储蓄",["emergency savings"],"neutral","positive","high",false,"Build an emergency savings fund.","建立应急储蓄基金。","存下来未花的钱。"],
["debt","/det/","n.","债务",["pay off debt"],"neutral","negative","high",false,"Pay off high interest debt first.","先还清高息债务。","借来的需要还的钱。"],
["interest rate","/intrest reit/","n.","利率",["high interest rate"],"formal","neutral","high",false,"Interest rates affect mortgage payments.","利率影响按揭还款。","借贷成本或存款回报。"],
["mortgage","/mogidj/","n.","房贷",["take out a mortgage"],"formal","neutral","high",false,"Take out a 30 year mortgage.","办理30年房贷。","买房向银行借的长期贷款。"],
["loan","/loun/","n.","贷款",["student loan"],"neutral","neutral","high",false,"Apply for a student loan.","申请学生贷款。","需连本带利偿还的借款。"],
["credit score","/kredit skor/","n.","信用评分",["good credit score"],"formal","positive","high",false,"A good credit score gets better rates.","好信用评分获得更好利率。","衡量还款能力的数字。"],
["stock market","/stok market/","n.","股市",["play the stock market"],"neutral","neutral","high",false,"The stock market is volatile lately.","股市最近很波动。","买卖公司股票的市场。"],
["diversify","/daiversifai/","v.","分散投资",["diversify portfolio"],"formal","positive","high",false,"Diversify across sectors.","跨行业分散投资。","投资不同资产降低风险。"],
["pension","/penshn/","n.","养老金",["retirement pension"],"formal","neutral","high",false,"Start contributing to your pension early.","尽早缴养老金。","退休后定期领取的收入。"],
["tax","/taeks/","n.","税",["file taxes"],"formal","neutral","high",false,"File your taxes before the deadline.","截止日期前报税。","政府征收的强制性费用。"],
["invoice","/invois/","n.","发票",["send invoice"],"formal","neutral","high",false,"Send the invoice to the client.","把发票发给客户。","列出产品或服务费用的文件。"],
["down payment","/daun peiment/","n.","首付",["save for down payment"],"formal","neutral","high",false,"Save for a down payment on a house.","存够买房首付。","大额购买的第一笔付款。"],
["salary","/saeleri/","n.","工资",["negotiate salary"],"formal","neutral","high",false,"Negotiate your starting salary.","谈入职薪资。","雇员定期获得的固定报酬。"],
["bonus","/bounes/","n.","奖金",["year end bonus"],"neutral","positive","high",false,"She got a performance bonus.","拿到绩效奖金。","基本工资之外的额外报酬。"],
["inflation","/infleifn/","n.","通货膨胀",["high inflation"],"formal","negative","high",false,"Inflation erodes purchasing power.","通货膨胀侵蚀购买力。","物价普遍上涨货币贬值。"],
["recession","/risefn/","n.","经济衰退",["economic recession"],"formal","negative","high",false,"The recession caused many layoffs.","经济衰退导致大量裁员。","经济活动显著下降的时期。"],
["bankrupt","/baenkrapt/","adj.","破产",["go bankrupt"],"formal","negative","high",false,"The company went bankrupt last year.","公司去年破产了。","无法偿还债务的状态。"],
["cryptocurrency","/kriptoukarensi/","n.","加密货币",["trade cryptocurrency"],"formal","neutral","high",false,"Bitcoin is a cryptocurrency.","比特币是加密货币。","基于区块链的数字货币。"],
["insurance","/infurens/","n.","保险",["health insurance"],"formal","positive","high",false,"Get health insurance for peace of mind.","买健康保险安心。","为风险提供经济补偿的合约。"],
["net worth","/net werth/","n.","净资产",["high net worth"],"formal","positive","medium",false,"Her net worth exceeded a million.","净资产超过百万。","总资产减去总负债。"],
["passive income","/paesiv inkam/","n.","被动收入",["generate passive income"],"formal","positive","medium",false,"Rentals generate passive income.","出租产生被动收入。","不需持续劳动的稳定收入。"],
["side hustle","/said hasl/","n.","副业",["start a side hustle"],"informal","positive","medium",false,"Freelancing is a popular side hustle.","自由职业是流行副业。","主业之外的赚钱活动。"],
["compound interest","/kompaund intrest/","n.","复利",["power of compound interest"],"formal","positive","medium",false,"Compound interest grows wealth over time.","复利随时间增长财富。","利上滚利的利息计法。"],
["stock","/stok/","n.","股票",["buy stocks"],"neutral","neutral","high",false,"Buy shares of stock in tech companies.","买入科技公司股票。","公司所有权的股份。"],
["bond","/bond/","n.","债券",["government bond"],"formal","neutral","high",false,"Government bonds are considered safe.","政府债券被认为是安全的。","政府公司发行的债务证券。"],
["mutual fund","/mjutjuel fand/","n.","共同基金",["invest in mutual fund"],"formal","neutral","high",false,"Invest through a low cost mutual fund.","通过低成本共同基金投资。","汇集多个投资者资金的投资池。"],
["ETF","/i ti ef/","n.","交易所交易基金",["buy ETFs"],"formal","neutral","high",false,"ETFs offer low fee diversification.","ETF提供低费用分散投资。","可在股市交易的投资基金。"],
["bull market","/bul market/","n.","牛市",["long bull market"],"formal","positive","high",false,"The bull market has lasted years.","牛市已持续多年。","股价持续上涨的市场。"],
["bear market","/ber market/","n.","熊市",["enter bear market"],"formal","negative","high",false,"Investors fear a bear market.","投资者担心熊市要来。","股价持续下跌的市场。"],
["IPO","/ai pi ou/","n.","首次公开募股",["company IPO"],"formal","positive","medium",false,"The startup announced its IPO.","创业公司宣布IPO。","公司首次向公众出售股票。"],
["startup","/startap/","n.","创业公司",["tech startup"],"neutral","positive","high",false,"She joined a promising startup.","加入前景好的创业公司。","处于发展初期的新公司。"],
["unicorn","/junikorn/","n.","独角兽企业",["become a unicorn"],"informal","positive","medium",true,"That startup became a unicorn.","那家创业公司成了独角兽。","估值超十亿的创业公司。"],
["equity","/ekwiti/","n.","股权",["company equity"],"formal","positive","high",false,"Early employees receive equity.","早期员工获得公司股权。","公司所有权的份额。"],
["crowdfunding","/kraudfanding/","n.","众筹",["crowdfunding campaign"],"neutral","positive","medium",false,"Raised capital through crowdfunding.","通过众筹募集了资金。","向大量人募集小额资金。"],
["GDP","/dji di pi/","n.","国内生产总值",["GDP growth"],"formal","neutral","high",false,"GDP growth slowed this quarter.","本季度GDP增长放缓。","一国经济总产出。"],
["exchange rate","/ikstfeindj reit/","n.","汇率",["favorable exchange rate"],"formal","neutral","high",false,"The exchange rate favors travelers.","现在汇率对旅行者有利。","兑换外币的比率。"],
["fintech","/fintek/","n.","金融科技",["fintech startup"],"neutral","positive","medium",false,"Fintech disrupts traditional banking.","金融科技颠覆传统银行业。","用科技改进金融服务。"],
["raise","/reiz/","n.","加薪",["ask for a raise"],"neutral","positive","high",false,"Ask for a raise after good results.","结果好后要求加薪。","工资的增加调整。"],
["minimum wage","/minimem weidj/","n.","最低工资",["raise minimum wage"],"formal","neutral","high",false,"Minimum wage varies by state.","最低工资因州而异。","法定每小时最低薪酬。"],
["premium","/primiem/","n.","保费",["monthly premium"],"formal","neutral","high",false,"Monthly premiums depend on coverage.","月保费取决于保障范围。","定期支付给保险公司的费用。"],
["deductible","/didaktibl/","n.","免赔额",["high deductible"],"formal","neutral","medium",false,"Higher deductible lowers premium.","更高免赔额降低保费。","保险赔付前自付的金额。"],
["trade deficit","/treid defisit/","n.","贸易逆差",["growing trade deficit"],"formal","negative","medium",false,"The trade deficit widened last year.","贸易逆差去年扩大了。","进口超过出口的差额。"],
["freelance","/frilans/","adj./v.","自由职业",["go freelance"],"neutral","positive","high",false,"She quit to go freelance as a designer.","辞职做了自由设计师。","为多个客户工作非单一雇主。"],
["scholarship","/skolerjip/","n.","奖学金",["win a scholarship"],"formal","positive","high",false,"Won a full scholarship to university.","获得大学全额奖学金。","成就或需要的学费资助。"],
["tuition","/tjuifn/","n.","学费",["college tuition"],"formal","neutral","high",false,"Tuition costs have risen dramatically.","学费急剧上涨。","教育机构收取的教学费用。"],
["student loan","/stjudnt loun/","n.","学生贷款",["repay student loan"],"formal","neutral","high",false,"Pay off student loans after graduation.","毕业后还清学生贷款。","支付教育费用的贷款。"],
["bank account","/baenk akaunt/","n.","银行账户",["open a bank account"],"neutral","neutral","high",false,"Open a bank account when you arrive.","到了之后开个银行账户。","银行中存钱的账户。"],
["credit card","/kredit kard/","n.","信用卡",["pay by credit card"],"neutral","neutral","high",false,"Pay with credit card for purchase protection.","信用卡支付有购买保护。","可先消费后付款的卡。"],
].forEach(function(w){f16.push(mw("16-"+(f16.length+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]))});

newFields+=field('f15','科技数字','关于科技互联网和数字生活的词汇',f15);
newFields+=field('f16','金融理财','关于金钱理财和经济的词汇',f16);

c=c.substring(0,lastIdx)+newFields+'\n];';
fs.writeFileSync("src/data/vocabulary.ts",c);
var wc=(c.match(/W\('/g)||[]).length;
console.log('Total vocabulary words: '+wc);
