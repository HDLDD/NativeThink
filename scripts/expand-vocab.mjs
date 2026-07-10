// Expand vocabulary: add 10 more words per field
import fs from 'fs';

function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var esc=function(s){return s.replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
  var cs=coll.map(function(x){return "'"+esc(x)+"'"}).join(",");
  return "    W('"+id+"','"+esc(w)+"','"+esc(p)+"','"+esc(pos)+"','"+esc(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+esc(ex)+"','"+esc(exT)+"','"+esc(deep)+"'),";
}

var fields=["f1","f2","f3","f4","f5","f6","f7"];
var extras={f1:[],f2:[],f3:[],f4:[],f5:[],f6:[],f7:[]};

// F1 extras (10 words)
extras.f1.push(mw("1-21","smug","/smʌɡ/","adj.","自鸣得意的",["smug smile","look smug"],"informal","negative","medium",false,"He had a smug look after winning.","赢后他一脸得意。","带轻蔑感的自满。"));
extras.f1.push(mw("1-22","thrilled","/θrɪld/","adj.","非常兴奋的",["absolutely thrilled","thrilled to bits"],"neutral","positive","high",false,"Thrilled to announce new partnership.","激动宣布新合作。","比excited正式。"));
extras.f1.push(mw("1-23","vexed","/vekst/","adj.","恼火的",["slightly vexed","vexed by"],"formal","negative","low",false,"Vexed by constant interruptions.","被不断打断而恼火。","比annoyed正式。"));
extras.f1.push(mw("1-24","wistful","/ˈwɪstfʊl/","adj.","渴望的伤感的",["wistful smile","wistful look"],"neutral","negative","low",false,"A wistful smile at old photos.","看老照片伤感一笑。","怀念与遗憾混合。"));
extras.f1.push(mw("1-25","zealous","/ˈzeləs/","adj.","狂热的",["zealous supporter","overly zealous"],"formal","positive","medium",false,"Zealous advocate for environment.","环保狂热倡导者。","比enthusiastic更强。"));
extras.f1.push(mw("1-26","dejected","/dɪˈdʒektɪd/","adj.","沮丧的",["look dejected","feel dejected"],"neutral","negative","medium",false,"Looked dejected after bad news.","坏消息后垂头丧气。","表情可见的沮丧。"));
extras.f1.push(mw("1-27","complacent","/kəmˈpleɪsənt/","adj.","自满的",["grow complacent","become complacent"],"neutral","negative","medium",false,"Cannot afford to get complacent.","不能对自己自满。","停滞不前的满足。"));
extras.f1.push(mw("1-28","aghast","/əˈɡɑːst/","adj.","惊骇的",["stand aghast","look aghast"],"formal","negative","low",false,"Aghast at the cost of repairs.","维修费令她惊骇。","难以置信的震惊。"));
extras.f1.push(mw("1-29","buoyant","/ˈbɔɪənt/","adj.","轻松愉快的",["buoyant mood","remain buoyant"],"neutral","positive","medium",true,"Remained buoyant despite challenges.","尽管挑战轻松愉快。","精神振奋有浮力。"));
extras.f1.push(mw("1-30","crestfallen","/ˈkrestfɔːlən/","adj.","垂头丧气的",["look crestfallen","visibly crestfallen"],"neutral","negative","low",false,"Team looked crestfallen after loss.","输后队伍垂头丧气。","希望破灭的失望。"));

// F2 extras (10 words)
extras.f2.push(mw("2-21","ramp up","/ræmp ʌp/","v.","加大力度",["ramp up production","ramp up efforts"],"neutral","positive","high",false,"Need to ramp up marketing.","需要加大营销力度。","速度和强度同时提升。"));
extras.f2.push(mw("2-22","buy in","/ˈbaɪɪn/","n.","认可接受",["get buy in","stakeholder buy in"],"neutral","positive","high",true,"Need buy in from leadership.","需要领导层认可。","真心支持和投入。"));
extras.f2.push(mw("2-23","pain point","/peɪn pɔɪnt/","n.","痛点",["customer pain points","identify pain points"],"neutral","neutral","high",true,"What are user pain points.","用户最大痛点是什么。","产品服务中的困难。"));
extras.f2.push(mw("2-24","fast track","/fɑːst træk/","n.","快速通道",["fast track promotion","on the fast track"],"neutral","positive","high",false,"On the fast track to management.","快速晋升管理岗。","加速进程。"));
extras.f2.push(mw("2-25","traction","/ˈtrækʃən/","n.","吸引力势头",["gain traction","get traction"],"neutral","positive","high",false,"Product is gaining traction.","产品正获得吸引力。","被越来越多人接受。"));
extras.f2.push(mw("2-26","move the needle","/muːv ðə niːdl/","v.","产生显著影响",["really move the needle"],"informal","positive","medium",false,"Campaign that moves the needle.","产生显著影响的营销。","带来实质性效果。"));
extras.f2.push(mw("2-27","circle back","/ˈsɜːkl bæk/","v.","回头再谈",["circle back to","circle back later"],"informal","neutral","high",false,"Circle back to this later.","回头再谈这个。","稍后讨论。"));
extras.f2.push(mw("2-28","push the envelope","/pʊʃ ðə envələʊp/","v.","突破界限",["push the envelope of"],"informal","positive","medium",false,"Always pushes the envelope.","总是在突破界限。","挑战现有极限。"));
extras.f2.push(mw("2-29","boil the ocean","/bɔɪl ðə əʊʃən/","v.","做不切实际的大工程",["dont boil the ocean"],"informal","negative","medium",false,"Do not try to boil the ocean.","别想做不切实际的事。","试图完成不可能。"));
extras.f2.push(mw("2-30","drill down","/drɪl daʊn/","v.","深入分析",["drill down into","drill down further"],"informal","neutral","high",false,"Need to drill down into data.","需要深入分析数据。","仔细研究细节。"));

// F3 extras (10 words)
extras.f3.push(mw("3-21","social butterfly","/ˈsəʊʃəl ˈbʌtəflaɪ/","n.","社交达人",["a real social butterfly"],"informal","positive","medium",false,"She is a social butterfly.","她是个社交达人。","非常善于社交。"));
extras.f3.push(mw("3-22","party pooper","/ˈpɑːti ˌpuːpə(r)/","n.","扫兴的人",["dont be a party pooper"],"informal","negative","medium",false,"Dont be a party pooper.","别扫兴了。","破坏气氛的人。"));
extras.f3.push(mw("3-23","people pleaser","/ˈpiːpl ˌpliːzər/","n.","讨好别人的人",["such a people pleaser"],"informal","negative","medium",false,"Stop being a people pleaser.","别再讨好别人了。","总想让所有人满意。"));
extras.f3.push(mw("3-24","wingman","/ˈwɪŋmæn/","n.","僚机社交帮手",["be someones wingman"],"informal","positive","medium",true,"I will be your wingman tonight.","今晚我给你当僚机。","社交中帮朋友搭讪。"));
extras.f3.push(mw("3-25","go dutch","/ɡəʊ dʌtʃ/","v.","AA制",["go dutch on dinner"],"informal","neutral","medium",false,"Lets go dutch tonight.","今晚各付各的。","各自付账。"));
extras.f3.push(mw("3-26","clique","/kliːk/","n.","小圈子",["form a clique","exclusive clique"],"neutral","negative","medium",true,"Hard to break into their clique.","难融入他们小圈子。","对外封闭排外。"));
extras.f3.push(mw("3-27","wallflower","/ˈwɔːlˌflaʊə(r)/","n.","壁花害羞的人",["be a wallflower","wallflower at parties"],"informal","neutral","medium",true,"I am a bit of a wallflower.","我有点像壁花。","因害羞不参与社交。"));
extras.f3.push(mw("3-28","introvert","/ˈɪntrəvɜːt/","n.","内向的人",["natural introvert","introvert personality"],"neutral","neutral","high",false,"I am an introvert by nature.","我天生内向。","从独处中获取能量。"));
extras.f3.push(mw("3-29","extrovert","/ˈekstrəvɜːt/","n.","外向的人",["outgoing extrovert","extrovert personality"],"neutral","neutral","high",false,"My brother is a total extrovert.","我哥是完全外向的人。","从社交中获取能量。"));
extras.f3.push(mw("3-30","ally","/ˈælaɪ/","n.","盟友支持者",["close ally","find an ally"],"neutral","positive","high",false,"She is my strongest ally at work.","她是我公司最坚定盟友。","积极为你发声的人。"));

// F4 extras (10 words)
extras.f4.push(mw("4-21","brainchild","/ˈbreɪntʃaɪld/","n.","创意产物",["someones brainchild","the brainchild of"],"informal","positive","medium",false,"This app is her brainchild.","这个应用是她的创意产物。","某人的原创想法。"));
extras.f4.push(mw("4-22","food for thought","/fuːd fɔː θɔːt/","n.","引人深思的东西",["give food for thought"],"neutral","positive","high",false,"That article gave me food for thought.","那篇文章引人深思。","值得深入思考的事。"));
extras.f4.push(mw("4-23","brain fog","/breɪn fɒɡ/","n.","脑雾思维不清晰",["suffer from brain fog"],"informal","negative","medium",true,"I have brain fog all morning.","整个上午脑子懵懵的。","思维迟钝不清晰。"));
extras.f4.push(mw("4-24","tunnel vision","/ˈtʌnəl ˌvɪʒən/","n.","视野狭隘",["get tunnel vision","have tunnel vision"],"informal","negative","medium",false,"He has tunnel vision about this.","他对这事视野狭隘。","过度专注忽略其他。"));
extras.f4.push(mw("4-25","speculate","/ˈspekjʊleɪt/","v.","猜测",["can only speculate","widely speculated"],"neutral","neutral","medium",false,"We can only speculate what happened.","只能猜测发生了什么。","信息不全时推测。"));
extras.f4.push(mw("4-26","trivialize","/ˈtrɪviəlaɪz/","v.","轻描淡写",["dont trivialize","trivialize the issue"],"formal","negative","low",false,"Dont trivialize her concerns.","别轻描淡写她的担忧。","使看起来不重要。"));
extras.f4.push(mw("4-27","deductive","/dɪˈdʌktɪv/","adj.","演绎的",["deductive reasoning","deductive logic"],"formal","neutral","medium",false,"Used deductive reasoning to solve.","用演绎推理解谜。","一般原理到具体结论。"));
extras.f4.push(mw("4-28","inductive","/ɪnˈdʌktɪv/","adj.","归纳的",["inductive reasoning","inductive approach"],"formal","neutral","medium",false,"Inductive reasoning from observation.","从观察归纳推理。","具体现象到一般规律。"));
extras.f4.push(mw("4-29","rethink","/ˈriːθɪŋk/","v.","重新思考",["need a rethink","complete rethink"],"neutral","neutral","high",false,"Need to rethink our approach entirely.","需要完全重新思考方法。","全新评估。"));
extras.f4.push(mw("4-30","a ha moment","/ɑː hɑː ˈməʊmənt/","n.","顿悟时刻",["have an a ha moment"],"informal","positive","medium",true,"Had an a ha moment in the shower.","洗澡时有了一刻顿悟。","突然理解的关键瞬间。"));

// F5 extras (10 words)
extras.f5.push(mw("5-21","tiptoe","/ˈtɪptəʊ/","v.","踮着脚走",["tiptoe around","on tiptoe"],"neutral","neutral","medium",false,"Tiptoed so I would not wake the baby.","踮脚走不吵醒婴儿。","小心不出声地走。"));
extras.f5.push(mw("5-22","slouch","/slaʊtʃ/","v./n.","没精打采坐",["dont slouch","slouch in chair"],"informal","negative","medium",false,"Dont slouch sit up straight.","别驼背坐直了。","姿势不端正。"));
extras.f5.push(mw("5-23","doze off","/dəʊz ɒf/","v.","打瞌睡",["doze off during","keep dozing off"],"informal","neutral","high",false,"Kept dozing off during lecture.","讲座中不停打瞌睡。","不自觉地浅睡。"));
extras.f5.push(mw("5-24","sulk","/sʌlk/","v.","生闷气",["sulk in silence","sulk around"],"informal","negative","medium",false,"Sulking in his room all afternoon.","整个下午生闷气。","不满闷不吭声。"));
extras.f5.push(mw("5-25","reminisce","/ˌremɪˈnɪs/","v.","回忆往事",["reminisce about","sit and reminisce"],"neutral","positive","medium",false,"Reminiscing about college days.","回忆大学美好时光。","愉快回忆过去。"));
extras.f5.push(mw("5-26","rant","/rænt/","v./n.","喋喋不休抱怨",["go on a rant","rant about"],"informal","negative","medium",false,"He went on a rant about service.","他对客服喋喋不休抱怨。","带情绪长篇大论。"));
extras.f5.push(mw("5-27","scribble","/ˈskrɪbl/","v.","潦草地写",["scribble down","scribble a note"],"informal","neutral","medium",false,"Scribbled down her number.","草草写下她的电话。","快速不工整书写。"));
extras.f5.push(mw("5-28","skim","/skɪm/","v.","浏览略读",["skim through","skim over"],"neutral","neutral","high",false,"Skimmed through the report.","浏览了报告。","快速抓住要点。"));
extras.f5.push(mw("5-29","ponder","/ˈpɒndə(r)/","v.","思索深思",["ponder the question","sit and ponder"],"formal","neutral","medium",false,"Sat pondering the offer for days.","坐了好几天思量offer。","安静深思熟虑。"));
extras.f5.push(mw("5-30","browse","/braʊz/","v.","浏览",["browse the internet","browse through"],"neutral","neutral","high",false,"Browsing through bookstores all afternoon.","整个下午逛书店。","轻松随意看。"));

// F6 extras (10 words)
extras.f6.push(mw("6-21","milestone","/ˈmaɪlstəʊn/","n.","里程碑",["reach a milestone","important milestone"],"neutral","positive","high",false,"Reaching 1M users was a huge milestone.","达百万用户是重要里程碑。","进程中标志性节点。"));
extras.f6.push(mw("6-22","red tape","/red teɪp/","n.","官僚手续",["cut through red tape","bureaucratic red tape"],"informal","negative","high",true,"Project delayed by endless red tape.","项目因官僚手续延误。","过度繁琐行政程序。"));
extras.f6.push(mw("6-23","zeitgeist","/ˈzaɪtɡaɪst/","n.","时代精神",["capture the zeitgeist","reflect the zeitgeist"],"formal","neutral","medium",true,"The film captures the zeitgeist.","电影抓住了时代精神。","德语借词时代思潮。"));
extras.f6.push(mw("6-24","solace","/ˈsɒləs/","n.","安慰",["find solace in","take solace"],"formal","positive","medium",false,"Found solace in her art.","从艺术中找到慰藉。","悲伤中深层安慰。"));
extras.f6.push(mw("6-25","tenacity","/təˈnæsəti/","n.","坚韧不屈不挠",["sheer tenacity","show tenacity"],"formal","positive","medium",false,"His tenacity is truly admirable.","他的坚韧令人钦佩。","永不放弃品质。"));
extras.f6.push(mw("6-26","whim","/wɪm/","n.","心血来潮",["on a whim","at the whim of"],"neutral","neutral","medium",false,"Booked the trip on a whim.","心血来潮订了旅行。","一时冲动决定。"));
extras.f6.push(mw("6-27","validity","/vəˈlɪdəti/","n.","有效性",["question the validity","check validity"],"formal","neutral","high",false,"Question the validity of that study.","质疑那项研究有效性。","是否合理正确。"));
extras.f6.push(mw("6-28","versatility","/ˌvɜːsəˈtɪləti/","n.","多功能性",["show versatility","great versatility"],"formal","positive","medium",false,"The versatility of this tool is amazing.","工具多功能性惊人。","适应多种需求。"));
extras.f6.push(mw("6-29","precedent","/ˈpresɪdənt/","n.","先例",["set a precedent","without precedent"],"formal","neutral","high",false,"This case could set a precedent.","此案可能设重要先例。","日后类似情况的参考。"));
extras.f6.push(mw("6-30","hierarchy","/ˈhaɪərɑːki/","n.","等级制度",["social hierarchy","flat hierarchy"],"formal","neutral","high",false,"The company has a flat hierarchy.","公司等级制度扁平。","按权力地位排列的体系。"));

// F7 extras (10 words)
extras.f7.push(mw("7-21","mind blowing","/ˈmaɪnd ˌbləʊɪŋ/","adj.","令人震惊的好",["mind blowing experience","absolutely mind blowing"],"informal","positive","medium",false,"The special effects were mind blowing.","特效令人震惊。","太好以至于难以理解。"));
extras.f7.push(mw("7-22","breathtaking","/ˈbreθˌteɪkɪŋ/","adj.","令人叹为观止的",["breathtaking view","absolutely breathtaking"],"neutral","positive","medium",false,"The view from the top is breathtaking.","山顶景色令人叹为观止。","美到让人停止呼吸。"));
extras.f7.push(mw("7-23","lackluster","/ˈlækˌlʌstə(r)/","adj.","毫无生气的",["lackluster performance"],"formal","negative","medium",false,"Movie received lackluster response.","电影反响平平。","缺乏活力光彩。"));
extras.f7.push(mw("7-24","hit or miss","/ˌhɪt ɔː ˈmɪs/","adj.","时好时坏的",["a bit hit or miss","can be hit or miss"],"informal","neutral","medium",false,"Food quality is a bit hit or miss.","食物质量有点时好时坏。","不稳定。"));
extras.f7.push(mw("7-25","average Joe","/ˌævərɪdʒ ˈdʒəʊ/","n.","普通人",["just an average Joe"],"informal","neutral","medium",false,"Designed for the average Joe.","为普通人设计。","毫无特殊之处的普通人。"));
extras.f7.push(mw("7-26","cookie cutter","/ˈkʊki ˌkʌtər/","adj.","千篇一律的",["cookie cutter houses"],"informal","negative","medium",false,"All houses look cookie cutter here.","房子都千篇一律。","毫无个性创意。"));
extras.f7.push(mw("7-27","dime a dozen","/ˌdaɪm ə ˈdʌzn/","adj.","随处可见不值钱的",["a dime a dozen"],"informal","negative","medium",false,"Ideas are a dime a dozen.","想法遍地都是。","极其常见不特别。"));
extras.f7.push(mw("7-28","an arm and a leg","/æn ɑːm ənd ə leɡ/","exp.","贵得离谱",["cost an arm and a leg"],"informal","negative","high",false,"Repairs cost an arm and a leg.","维修贵得离谱。","贵到让人心疼。"));
extras.f7.push(mw("7-29","bang for buck","/bæŋ fɔː bʌk/","exp.","性价比",["great bang for buck","more bang for buck"],"informal","positive","high",true,"Most bang for your buck.","性价比最高。","物超所值。"));
extras.f7.push(mw("7-30","steep","/stiːp/","adj.","价格高昂的",["steep price","a bit steep"],"informal","negative","high",false,"$200 for a shirt is a bit steep.","两百一件衫有点贵。","形容陡也指价格高。"));

// Now insert the extra words into the vocabulary file
var c = fs.readFileSync("src/data/vocabulary.ts","utf8");

for(var i=0; i<fields.length; i++){
  var f = fields[i];
  var nextF = i < 6 ? fields[i+1] : null;
  var insertText = extras[f].join("\n") + "\n";

  if(nextF){
    // Find the closing ]}, of current field and opening of next
    var marker = '  ]},\n  { id:"' + nextF + '"';
    c = c.replace(marker, insertText + marker);
  } else {
    // Last field - find ]},\n];
    c = c.replace('  ]},\n];', insertText + '  ]},\n];');
  }
}

fs.writeFileSync("src/data/vocabulary.ts", c);
var wc = (c.match(/W\('/g)||[]).length;
console.log("Words after expansion: " + wc);
