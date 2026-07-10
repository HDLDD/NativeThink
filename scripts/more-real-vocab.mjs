import fs from 'fs';
let c = fs.readFileSync("src/data/vocabulary.ts","utf8");
let lastIdx = c.lastIndexOf('];');

function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var e=function(s){return (s||'').replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
  var cs=coll.map(function(x){return "'"+e(x)+"'"}).join(",");
  return "    W('"+id+"','"+e(w)+"','"+e(p)+"','"+e(pos)+"','"+e(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+e(ex)+"','"+e(exT)+"','"+e(deep)+"'),";
}

function mk(id,name,desc,words){
  var out='  { id:"'+id+'",name:"'+name+'",description:"'+desc+'",words:[\n';
  words.forEach(function(w,i){out+=mw(id+'-'+(i+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11])+'\n'});
  out+='  ]},\n';return out;
}

var nf='';
nf+=mk('f21','文化艺术','关于文化文艺和创意表达的词汇',[
["masterpiece","/maestepis/","n.","杰作",["create a masterpiece"],"formal","positive","high",false,"The Mona Lisa is a masterpiece.","蒙娜丽莎是杰作。","最优秀的艺术作品。"],
["gallery","/gaeleri/","n.","画廊",["art gallery"],"neutral","neutral","high",false,"Visit the art gallery downtown.","参观市中心画廊。","展示艺术品的地方。"],
["exhibition","/eksibifn/","n.","展览",["art exhibition"],"formal","neutral","high",false,"The exhibition runs through December.","展览持续到十二月。"],
["sculpture","/skalptfe/","n.","雕塑",["modern sculpture"],"formal","neutral","high",false,"The park has modern sculptures.","公园有现代雕塑。"],
["portrait","/potreit/","n.","肖像画",["paint a portrait"],"formal","neutral","high",false,"She commissioned a family portrait.","定制了全家福肖像。"],
["abstract","/aebstraekt/","adj.","抽象的",["abstract art"],"neutral","neutral","high",false,"Abstract art can be challenging.","抽象艺术可能很难懂。"],
["canvas","/kaenves/","n.","画布",["blank canvas"],"neutral","neutral","high",false,"The artist stretched a new canvas.","画家绷了新画布。"],
["orchestra","/okistre/","n.","管弦乐团",["symphony orchestra"],"formal","neutral","high",false,"The orchestra performed Beethoven.","乐团演奏了贝多芬。"],
["symphony","/simfeni/","n.","交响乐",["Beethoven symphony"],"formal","positive","high",false,"His ninth symphony is his greatest.","第九交响曲最伟大。"],
["solo","/soulou/","n.","独奏独唱",["guitar solo"],"neutral","positive","high",false,"The guitar solo was incredible.","吉他独奏太棒了。"],
["duet","/djuet/","n.","二重唱",["sing a duet"],"neutral","positive","medium",false,"They sang a beautiful duet.","唱了优美的二重唱。"],
["choir","/kwaie/","n.","合唱团",["church choir"],"neutral","positive","high",false,"She sings in the church choir.","她在教堂合唱团唱歌。"],
["genre","/jonre/","n.","流派",["music genre"],"neutral","neutral","high",false,"His music crosses multiple genres.","音乐跨越多个流派。"],
["lyrics","/liriks/","n.","歌词",["write lyrics"],"neutral","neutral","high",false,"The lyrics are so poetic.","歌词非常诗意。"],
["melody","/meledi/","n.","旋律",["beautiful melody"],"neutral","positive","high",false,"The melody is stuck in my head.","旋律在脑子里挥之不去。"],
["harmony","/hameni/","n.","和声",["sing in harmony"],"neutral","positive","high",false,"They sang in perfect harmony.","以完美和声演唱。"],
["rhythm","/ridem/","n.","节奏",["keep the rhythm"],"neutral","neutral","high",false,"The rhythm makes you want to dance.","节奏让人想跳舞。"],
["rehearsal","/rihersl/","n.","排练",["dress rehearsal"],"neutral","neutral","high",false,"We have rehearsal every Tuesday.","每周二排练。"],
["backstage","/baeksteidj/","n.","后台",["go backstage"],"neutral","neutral","high",false,"Go backstage to meet performers.","去后台见表演者。"],
["costume","/kostjum/","n.","戏服",["period costume"],"neutral","neutral","high",false,"The costumes were hand sewn.","服装手工缝制。"],
["stage fright","/steidj frait/","n.","舞台恐惧",["overcome stage fright"],"neutral","negative","medium",false,"She overcame her stage fright.","克服了舞台恐惧。"],
["box office","/boks ofis/","n.","票房",["box office hit"],"neutral","neutral","high",false,"The film broke box office records.","打破票房纪录。"],
["blockbuster","/blokbaste/","n.","大片",["summer blockbuster"],"informal","positive","high",false,"The blockbuster earned billions.","大片赚了数十亿。"],
["soundtrack","/saundtraek/","n.","原声带",["movie soundtrack"],"neutral","positive","high",false,"The soundtrack is amazing.","原声带太棒了。"],
["sequel","/sikwel/","n.","续集",["movie sequel"],"neutral","neutral","high",false,"The sequel was better than the original.","续集比原作更好。"],
["prequel","/prikwel/","n.","前传",["origin prequel"],"neutral","neutral","medium",false,"The prequel explains the origin.","前传解释起源故事。"],
["cameo","/kaemiou/","n.","客串",["cameo appearance"],"neutral","positive","medium",false,"The director made a cameo.","导演客串了镜头。"],
["calligraphy","/keligrefi/","n.","书法",["Chinese calligraphy"],"formal","positive","medium",false,"She practices calligraphy.","每周末练书法。"],
["origami","/origeimi/","n.","折纸",["paper origami"],"neutral","positive","medium",true,"He folded an origami crane.","折了一只纸鹤。"],
["pottery","/poteri/","n.","陶艺",["handmade pottery"],"neutral","positive","medium",false,"She makes beautiful pottery.","制作精美手工陶器。"],
["composer","/kempoze/","n.","作曲家",["classical composer"],"formal","positive","high",false,"Mozart was a child prodigy composer.","莫扎特是神童作曲家。"],
["playwright","/pleirait/","n.","剧作家",["famous playwright"],"formal","neutral","medium",false,"Shakespeare is the greatest playwright.","莎士比亚是最伟大的剧作家。"],
["screenwriter","/skrinraite/","n.","编剧",["film screenwriter"],"neutral","neutral","medium",false,"The screenwriter adapted the novel.","编剧改编了小说。"],
["choreographer","/koriogrefe/","n.","编舞",["dance choreographer"],"formal","neutral","medium",false,"The choreographer designed the routine.","编舞设计了整套动作。"],
["conductor","/kendakte/","n.","指挥",["orchestra conductor"],"formal","neutral","high",false,"The conductor raised his baton.","指挥举起了指挥棒。"],
]);

nf+=mk('f22','建筑与设计','关于建筑设计和空间规划的词汇',[
["architecture","/akitektfe/","n.","建筑学",["modern architecture"],"formal","neutral","high",false,"She studied architecture at university.","在大学学的建筑学。"],
["blueprint","/blupint/","n.","蓝图",["architectural blueprint"],"neutral","neutral","high",false,"Follow the blueprint for construction.","按蓝图施工。"],
["floor plan","/flo plaen/","n.","平面图",["open floor plan"],"neutral","neutral","high",false,"Open floor plan feels spacious.","开放平面图感觉宽敞。"],
["facade","/fesad/","n.","立面",["building facade"],"formal","neutral","high",false,"Beautiful stone facade.","美丽的石质立面。"],
["skyscraper","/skaiskreipe/","n.","摩天大楼",["tall skyscraper"],"neutral","neutral","high",false,"Skyscrapers dominate the skyline.","摩天大楼主导天际线。"],
["landmark","/laendmak/","n.","地标",["famous landmark"],"neutral","positive","high",false,"Eiffel Tower is a famous landmark.","埃菲尔铁塔是著名地标。"],
["foundation","/faundeifn/","n.","地基",["strong foundation"],"neutral","neutral","high",false,"Foundation must be solid first.","地基必须先稳固。"],
["pillar","/pile/","n.","柱子",["stone pillar"],"neutral","neutral","high",false,"Marble pillars support the entrance.","大理石柱支撑入口。"],
["ceiling","/siling/","n.","天花板",["high ceiling"],"neutral","neutral","high",false,"Beautifully painted ceiling.","精美彩绘的天花板。"],
["renovation","/reneveifn/","n.","翻新",["home renovation"],"formal","positive","high",false,"The house needs major renovation.","房子需要大翻新。"],
["interior design","/intirie/","n.","室内设计",["modern interior"],"neutral","positive","high",false,"Hired an interior designer.","请了室内设计师。"],
["layout","/leiaut/","n.","布局",["room layout"],"neutral","neutral","high",false,"Open layout connects spaces.","开放布局连接空间。"],
["spacious","/speifes/","adj.","宽敞的",["spacious room"],"neutral","positive","high",false,"Bright and spacious living room.","明亮宽敞的客厅。"],
["minimalist","/minimelist/","adj.","极简的",["minimalist design"],"neutral","positive","high",false,"Minimalist style with clean lines.","线条简洁的极简风格。"],
["vintage","/vintidj/","adj.","复古的",["vintage furniture"],"neutral","positive","high",false,"Decorated with vintage furniture.","用复古家具装饰。"],
["balcony","/baelkeni/","n.","阳台",["private balcony"],"neutral","positive","high",false,"Balcony overlooking the park.","俯瞰公园的阳台。"],
["terrace","/teres/","n.","露台",["rooftop terrace"],"neutral","positive","high",false,"Dinner on the terrace in summer.","夏天露台上吃晚餐。"],
["attic","/aetik/","n.","阁楼",["convert the attic"],"neutral","neutral","high",false,"Converted attic into home office.","阁楼改家庭办公室。"],
["basement","/beisment/","n.","地下室",["finished basement"],"neutral","neutral","high",false,"Basement has laundry and storage.","地下室有洗衣储藏。"],
["garage","/gaeraj/","n.","车库",["two car garage"],"neutral","neutral","high",false,"House has a two car garage.","有两车位车库。"],
["fence","/fens/","n.","围栏",["wooden fence"],"neutral","neutral","high",false,"Built a wooden fence.","建了木围栏。"],
["lawn","/lon/","n.","草坪",["mow the lawn"],"neutral","neutral","high",false,"Mows the lawn every Saturday.","每周六修剪草坪。"],
["fountain","/fauntin/","n.","喷泉",["water fountain"],"neutral","positive","medium",false,"Marble fountain in the courtyard.","庭院里大理石喷泉。"],
["skylight","/skailait/","n.","天窗",["install skylight"],"neutral","positive","medium",false,"Skylight brings natural light.","天窗带来自然光。"],
["open plan","/oupen plaen/","adj.","开放式的",["open plan living"],"neutral","positive","high",false,"Open plan encourages collaboration.","开放式鼓励合作。"],
["studio","/stjudiou/","n.","单间公寓",["studio apartment"],"neutral","neutral","high",false,"Cozy studio in the city center.","市中心温馨单间。"],
["penthouse","/penthaus/","n.","顶层公寓",["luxury penthouse"],"formal","positive","medium",false,"Penthouse with rooftop pool.","顶层有屋顶泳池。"],
["cottage","/kotidj/","n.","小屋",["country cottage"],"neutral","positive","high",false,"Lakeside cottage for the weekend.","湖边小屋度周末。"],
["mansion","/maenfn/","n.","豪宅",["luxury mansion"],"neutral","positive","high",false,"Waterfront mansion in Malibu.","马里布海滨豪宅。"],
["symmetry","/simetri/","n.","对称",["perfect symmetry"],"formal","positive","medium",false,"Design emphasizes symmetry.","设计强调对称。"],
["acoustics","/ekustiks/","n.","音响效果",["good acoustics"],"formal","neutral","medium",false,"Concert hall has excellent acoustics.","音乐厅音响出色。"],
["lighting","/laiting/","n.","照明",["ambient lighting"],"neutral","neutral","high",false,"Good lighting transforms a room.","好照明改变房间。"],
["loft","/loft/","n.","大开间",["loft apartment"],"neutral","positive","high",false,"Converted warehouse loft.","仓库改建的大开间。"],
["townhouse","/taunhaus/","n.","联排别墅",["brick townhouse"],"neutral","neutral","high",false,"Three story townhouse downtown.","市中心三层联排。"],
["greenhouse","/grinhaus/","n.","温室",["glass greenhouse"],"neutral","positive","medium",false,"Grows orchids in greenhouse.","温室里种兰花。"],
]);

c=c.substring(0,lastIdx)+nf+'\n];';
fs.writeFileSync('src/data/vocabulary.ts',c);
var wc=(c.match(/W\('/g)||[]).length;
console.log('Total words: '+wc);
