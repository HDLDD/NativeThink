// Expand vocabulary to 1000+ words and shadowing to 20-39 sentences each
import fs from 'fs';

// ====== VOCABULARY: Add new fields to reach 1000+ ======
function mw(id,w,p,pos,mean,coll,reg,emo,freq,noCn,ex,exT,deep){
  var esc=function(s){return s.replace(/\\/g,"\\\\").replace(/'/g,"\\'");};
  var cs=coll.map(function(x){return "'"+esc(x)+"'"}).join(",");
  return "    W('"+id+"','"+esc(w)+"','"+esc(p)+"','"+esc(pos)+"','"+esc(mean)+"',["+cs+"],'"+reg+"','"+emo+"','"+freq+"',"+noCn+",'"+esc(ex)+"','"+esc(exT)+"','"+esc(deep)+"'),";
}

function makeField(id,name,desc,words){
  var out = '  { id:"'+id+'",name:"'+name+'",description:"'+desc+'",words:[\n';
  out += words.join('\n') + '\n';
  out += '  ]},\n';
  return out;
}

// Generate 100+ words per new field
function bulkField(fid, name, desc, baseId, wordData){
  var words=[];
  for(var i=0;i<wordData.length;i++){
    var w=wordData[i];
    words.push(mw(fid+"-"+(i+1),w[0],w[1],w[2],w[3],w[4],w[5],w[6],w[7],w[8],w[9],w[10],w[11]));
  }
  return makeField(fid,name,desc,words);
}

// F8: 日常生活 (100 words)
var f8data=[
["wake up","/weɪk ʌp/","phr.v.","醒来起床",["wake up early","wake up late"],"neutral","neutral","high",false,"I wake up at 6:30 every morning.","我每天早上6:30醒来。","从睡眠回到意识清醒。"],
["fall asleep","/fɔːl əˈsliːp/","phr.v.","入睡",["cannot fall asleep","fall asleep quickly"],"neutral","neutral","high",false,"I could not fall asleep last night.","昨晚怎么也睡不着。","从清醒进入睡眠。"],
["get dressed","/ɡet drest/","phr.v.","穿好衣服",["get dressed quickly","get dressed up"],"neutral","neutral","high",false,"Give me five minutes to get dressed.","给我五分钟穿衣服。","从睡衣换出门衣服。"],
["brush teeth","/brʌʃ tiːθ/","phr.v.","刷牙",["brush your teeth","forget to brush"],"neutral","neutral","high",false,"Do not forget to brush your teeth before bed.","睡前别忘了刷牙。","用牙刷清洁牙齿。"],
["take a shower","/teɪk ə ˈʃaʊə(r)/","phr.v.","洗澡",["take a quick shower","take a cold shower"],"neutral","neutral","high",false,"I usually take a shower after my morning run.","通常晨跑后洗澡。","用水和肥皂清洁身体。"],
["do the dishes","/duː ðə dɪʃɪz/","phr.v.","洗碗",["help do the dishes","hate doing dishes"],"informal","neutral","high",false,"I will cook if you do the dishes.","我来做饭你洗碗。","擦洗锅碗瓢盆。"],
["do laundry","/duː ˈlɔːndri/","phr.v.","洗衣服",["do the laundry","need to do laundry"],"informal","neutral","high",false,"I need to do laundry no clean socks left.","需要洗衣服了没干净袜子了。","将脏衣服放进洗衣机。"],
["take out trash","/teɪk aʊt træʃ/","phr.v.","倒垃圾",["forget to take out trash"],"informal","neutral","high",false,"Can you take out the trash it is overflowing.","能倒垃圾吗桶快溢出来了。","将家中垃圾拿出去丢掉。"],
["make the bed","/meɪk ðə bed/","phr.v.","铺床",["make your bed every morning"],"neutral","neutral","high",false,"She makes her bed every morning without fail.","每天早上必定铺床。","整理床单被褥。"],
["set the table","/set ðə ˈteɪbl/","phr.v.","摆放餐具",["set the table for dinner"],"neutral","neutral","high",false,"Could you set the table while I finish cooking.","做饭时能帮忙摆桌吗。","碗筷刀叉放在餐桌上。"],
["run late","/rʌn leɪt/","phr.v.","迟到了",["I am running late","run a bit late"],"informal","negative","high",false,"Sorry I am running a few minutes late.","抱歉晚了几分钟。","超出预计时间延迟。"],
["in a hurry","/ɪn ə ˈhʌri/","phr.","匆忙地",["be in a hurry","leave in a hurry"],"neutral","neutral","high",false,"I am in a hurry can we talk later.","我很赶能之后再说吗。","时间紧急需快速行动。"],
["take your time","/teɪk jɔː taɪm/","phr.","慢慢来不着急",["please take your time"],"neutral","positive","high",false,"Take your time there is no rush to decide.","慢慢来不急着决定。","鼓励对方不用急。"],
["on time","/ɒn taɪm/","phr.","准时",["arrive on time","right on time"],"neutral","positive","high",false,"The train arrived right on time for once.","火车难得准时到达。","刚好在规定时间赶到。"],
["ahead of time","/əˈhed əv taɪm/","phr.","提前",["prepare ahead of time","arrive ahead of time"],"neutral","positive","high",false,"I like to arrive ahead of time rather than rush.","喜欢提前到而不是赶。","预定时间前完成。"],
["schedule","/ˈʃedjuːl/","n./v.","日程安排",["busy schedule","work schedule"],"neutral","neutral","high",false,"My schedule is packed this week no free time.","这周日程排满了。","计划好的时间表。"],
["appointment","/əˈpɔɪntmənt/","n.","预约",["make an appointment","doctor appointment"],"formal","neutral","high",false,"I have a dentist appointment at 3pm.","下午三点约了看牙医。","与专业人士约定的时间。"],
["routine","/ruːˈtiːn/","n.","日常惯例",["daily routine","morning routine"],"neutral","positive","high",false,"My morning routine includes yoga and coffee.","晨间惯例包括瑜伽和咖啡。","每天固定顺序的习惯。"],
["habit","/ˈhæbɪt/","n.","习惯",["bad habit","good habit"],"neutral","neutral","high",false,"Brushing teeth twice a day is a good habit.","每天刷两次牙是好习惯。","自动化行为模式。"],
["chore","/tʃɔː(r)/","n.","家务杂事",["household chore","daily chore"],"neutral","negative","high",false,"Doing laundry is my least favorite chore.","洗衣服是我最不喜欢的家务。","必须做但枯燥的家庭任务。"],
["errand","/ˈerənd/","n.","跑腿办事",["run errands","quick errand"],"neutral","neutral","high",false,"I have a few errands to run today.","今天有些事要跑腿。","出门办的件件小事。"],
["groceries","/ˈɡrəʊsəriz/","n.","食品杂货",["buy groceries","weekly groceries"],"neutral","neutral","high",false,"Need to pick up groceries on way home.","回家路上买食品杂货。","超市购买的日常食物。"],
["ingredient","/ɪnˈɡriːdiənt/","n.","食材原料",["key ingredient","fresh ingredients"],"neutral","neutral","high",false,"Have all ingredients before you start cooking.","做菜前确认有所有食材。","做菜需要的各种材料。"],
["recipe","/ˈresəpi/","n.","菜谱",["follow a recipe","family recipe"],"neutral","positive","high",false,"This is my grandmothers secret recipe.","这是我奶奶的秘密配方。","告诉你怎么做菜的指导。"],
["leftovers","/ˈleftəʊvəz/","n.","剩菜剩饭",["eat leftovers","store leftovers"],"neutral","neutral","high",false,"Turned last nights leftovers into a stir fry.","把昨晚剩菜变成炒菜。","吃剩下留到下一顿。"],
["nap","/næp/","n./v.","小睡",["take a nap","power nap"],"informal","positive","high",false,"A 20 minute power nap boosts productivity.","20分钟小睡提升效率。","白天短时间睡眠。"],
["insomnia","/ɪnˈsɒmniə/","n.","失眠",["suffer from insomnia","chronic insomnia"],"formal","negative","medium",false,"Stress and anxiety cause insomnia.","压力和焦虑导致失眠。","难以入睡或保持睡眠。"],
["jet lag","/dʒet læɡ/","n.","时差反应",["suffer from jet lag","bad jet lag"],"neutral","negative","high",false,"Took three days to get over jet lag.","花三天才从时差恢复。","跨时区旅行昼夜失调。"],
["commute","/kəˈmjuːt/","n./v.","通勤",["daily commute","long commute"],"neutral","neutral","high",false,"My daily commute takes about an hour.","每天通勤约一小时。","家和工作地点往返。"],
["turn on","/tɜːn ɒn/","phr.v.","打开",["turn on the lights","turn on the TV"],"neutral","neutral","high",false,"Can you turn on the lights it is getting dark.","能开灯吗天暗下来了。","启动电器开关。"],
["turn off","/tɜːn ɒf/","phr.v.","关掉",["turn off the lights","forget to turn off"],"neutral","neutral","high",false,"Please turn off your phone during the movie.","电影期间请关手机。","关闭电器开关。"],
["lock the door","/lɒk ðə dɔː(r)/","phr.v.","锁门",["forget to lock the door"],"neutral","neutral","high",false,"Did you remember to lock the front door.","记得锁前门了吗。","用钥匙锁门确保安全。"],
["feed the pet","/fiːd ðə pet/","phr.v.","喂宠物",["forget to feed the pet"],"neutral","neutral","high",false,"I need to feed the cat before I leave.","走之前得喂猫。","给宠物食物。"],
["water the plants","/ˈwɔːtə ðə plɑːnts/","phr.v.","浇花",["forget to water plants"],"neutral","neutral","medium",false,"Remember to water the plants twice a week.","记得每周浇两次花。","给植物浇水。"],
["iron clothes","/ˈaɪən kləʊðz/","phr.v.","熨衣服",["hate ironing clothes"],"neutral","neutral","medium",false,"I have a pile of shirts to iron.","有一堆衬衫要熨。","用熨斗烫平衣服。"],
["vacuum","/ˈvækjuːm/","v./n.","吸尘",["vacuum the floor","do the vacuuming"],"neutral","neutral","high",false,"I vacuum the whole house every Saturday.","每周六吸尘整个房子。","用吸尘器清洁。"],
["dust","/dʌst/","v./n.","擦灰",["dust the shelves","dust furniture"],"neutral","neutral","medium",false,"The shelves need dusting before guests arrive.","客人来前架子需要擦灰。","擦去表面的灰尘。"],
["mop","/mɒp/","v./n.","拖地",["mop the floor","mop up"],"neutral","neutral","high",false,"I just mopped the floor so do not walk with shoes.","刚拖了地别穿鞋走。","用拖把清洁地面。"],
["take a nap","/teɪk ə næp/","phr.v.","午睡",["take a quick nap","afternoon nap"],"informal","positive","high",false,"I need to take a quick nap before dinner.","晚饭前需小睡一下。","白天短时间睡眠。"],
["get ready","/ɡet ˈredi/","phr.v.","准备好",["get ready for work","get ready to go"],"neutral","neutral","high",false,"I need half an hour to get ready.","需要半小时准备。","做出门前的准备。"],
["pack lunch","/pæk lʌntʃ/","phr.v.","打包午餐",["pack your lunch","forget to pack lunch"],"neutral","neutral","medium",false,"I pack my lunch every day to save money.","每天打包午餐省钱。","准备外带午餐。"],
["check email","/tʃek ˈiːmeɪl/","phr.v.","查看邮件",["check your email","check email regularly"],"neutral","neutral","high",false,"First thing I do is check my email.","我第一件事是查看邮件。","打开收件箱看新消息。"],
["scroll social media","/skrəʊl ˈsəʊʃəl ˈmiːdiə/","phr.v.","刷社交媒体",["scroll through social media"],"informal","neutral","high",false,"I spent an hour scrolling social media.","花了一小时刷社交媒体。","在手机上浏览社交平台。"],
["binge watch","/bɪndʒ wɒtʃ/","v.","刷剧",["binge watch a series"],"informal","neutral","high",true,"We binge watched the entire season.","我们刷完了整季。","一次看很多集电视剧。"],
["charge phone","/tʃɑːdʒ fəʊn/","phr.v.","充电",["forget to charge phone"],"neutral","neutral","high",false,"I need to charge my phone battery is low.","需要充电手机快没电了。","给手机接通电源。"],
["set alarm","/set əˈlɑːm/","phr.v.","设闹钟",["set the alarm for","forget to set alarm"],"neutral","neutral","high",false,"I set my alarm for 6am every night.","每晚设好早上六点闹钟。","设定早上唤醒时间。"],
["hit snooze","/hɪt snuːz/","phr.v.","按贪睡",["hit the snooze button"],"informal","neutral","high",false,"I hit snooze three times this morning.","今早按了三次贪睡。","闹钟响后延迟再响。"],
["skip breakfast","/skɪp ˈbrekfəst/","phr.v.","不吃早餐",["tend to skip breakfast"],"neutral","negative","high",false,"I tend to skip breakfast when I am in a hurry.","赶时间往往不吃早餐。","不吃早上第一顿饭。"],
["grab coffee","/ɡræb ˈkɒfi/","phr.v.","买杯咖啡",["grab a quick coffee"],"informal","neutral","high",false,"Let me grab a coffee before the meeting.","开会前买杯咖啡。","快速地买一杯咖啡。"],
["take medicine","/teɪk ˈmedsɪn/","phr.v.","吃药",["forget to take medicine"],"neutral","neutral","high",false,"Remember to take your medicine after meals.","记得饭后吃药。","按规定服用药片或药水。"],
["walk the dog","/wɔːk ðə dɒɡ/","phr.v.","遛狗",["take the dog for a walk"],"neutral","neutral","high",false,"I walk the dog twice a day morning and evening.","早晚各遛一次狗。","带狗出门散步排便。"],
["change sheets","/tʃeɪndʒ ʃiːts/","phr.v.","换床单",["change the bed sheets"],"neutral","neutral","medium",false,"I change the sheets every Sunday.","每周日换床单。","换上干净床单被套。"],
["meal prep","/miːl prep/","n./v.","备餐",["do meal prep","Sunday meal prep"],"informal","positive","medium",true,"I do meal prep on Sundays for the whole week.","周日做一周的备餐。","提前备好一周食材。"],
["declutter","/diːˈklʌtə(r)/","v.","整理清除杂物",["declutter the house","time to declutter"],"informal","positive","medium",false,"I spent the weekend decluttering my closet.","周末清理了衣柜杂物。","去除不必要物品。"],
["tidy up","/ˈtaɪdi ʌp/","phr.v.","收拾整理",["tidy up the room","quick tidy up"],"informal","positive","high",false,"Tidy up your desk before you leave.","走前收拾好桌子。","把东西放回原位。"],
["organize","/ˈɔːɡənaɪz/","v.","组织整理",["organize your files","get organized"],"neutral","positive","high",false,"I need to organize all these documents.","需要整理这些文件。","按系统排列分类。"],
["sort out","/sɔːt aʊt/","phr.v.","分类解决",["sort out the problem","sort through"],"neutral","neutral","high",false,"Let me sort out these papers into piles.","把这些文件分成几堆。","按类别整理解决。"],
["throw away","/θrəʊ əˈweɪ/","phr.v.","扔掉",["throw away trash","dont throw away"],"neutral","neutral","high",false,"Do not throw away those leftovers.","别扔掉那些剩菜。","将无用之物丢弃。"],
["recycle","/ˌriːˈsaɪkl/","v./n.","回收",["recycle paper","recycling bin"],"neutral","positive","high",false,"We recycle all our plastic and glass bottles.","回收所有塑料瓶玻璃瓶。","将废品加工再利用。"],
["repair","/rɪˈpeə(r)/","v./n.","修理",["repair the damage","need repair"],"neutral","neutral","high",false,"I need to get my laptop repaired.","需要修笔记本电脑。","恢复损坏物的功能。"],
["fix","/fɪks/","v.","修理搞定",["fix the problem","fix it up"],"informal","positive","high",false,"Can you fix this broken chair.","能修这把坏椅子吗。","解决问题或修复物品。"],
["replace","/rɪˈpleɪs/","v.","替换",["replace the battery","need to replace"],"neutral","neutral","high",false,"I need to replace the light bulb in the kitchen.","需要换厨房灯泡。","用新物取代旧物。"],
["install","/ɪnˈstɔːl/","v.","安装",["install software","install new app"],"neutral","neutral","high",false,"I installed a new app on my phone.","手机上装了新应用。","设置使可使用。"],
["unplug","/ʌnˈplʌɡ/","v.","拔掉插头",["unplug the device","unplug and relax"],"neutral","positive","high",false,"Unplug the toaster when not in use.","不用时拔掉烤面包机。","断开电源或远离屏幕。"],
["plug in","/plʌɡ ɪn/","phr.v.","插上电源",["plug in the charger"],"neutral","neutral","high",false,"Can you plug in my phone over there.","能帮我把手机插那边吗。","接入电源插座。"],
["log in","/lɒɡ ɪn/","phr.v.","登录",["log in to your account","forgot to log in"],"neutral","neutral","high",false,"I cannot log in I forgot my password.","登录不了忘了密码。","用账号密码进入系统。"],
["log out","/lɒɡ aʊt/","phr.v.","登出",["remember to log out"],"neutral","neutral","high",false,"Always log out of public computers.","公用电脑一定登出。","安全退出账号。"],
["sign up","/saɪn ʌp/","phr.v.","注册",["sign up for","sign up online"],"neutral","neutral","high",false,"I signed up for a yoga class.","注册了瑜伽课。","填写信息加入服务。"],
["back up","/bæk ʌp/","phr.v.","备份",["back up your files","back up data"],"neutral","positive","high",false,"Always back up important documents.","重要文件一定备份。","复制数据以防丢失。"],
["update","/ʌpˈdeɪt/","v./n.","更新",["update the software","latest update"],"neutral","positive","high",false,"I need to update my phone to the latest version.","需更新手机到最新版。","升级到新的版本。"],
["upgrade","/ʌpˈɡreɪd/","v./n.","升级",["upgrade your plan","free upgrade"],"neutral","positive","high",false,"I upgraded my phone plan to unlimited data.","升级了手机套餐到无限流量。","提升到更高档次。"],
["download","/ˌdaʊnˈləʊd/","v./n.","下载",["download the app","download a file"],"neutral","neutral","high",false,"Download the app from the official store.","从官方商店下载应用。","从网络获取文件。"],
["upload","/ˌʌpˈləʊd/","v./n.","上传",["upload photos","upload a file"],"neutral","neutral","high",false,"I uploaded all my vacation photos to the cloud.","把所有度假照上传云。","发送文件到网络。"],
["delete","/dɪˈliːt/","v.","删除",["delete a file","accidentally delete"],"neutral","neutral","high",false,"I accidentally deleted that important email.","不小心删了那封重要邮件。","彻底移除数据。"],
["share","/ʃeə(r)/","v.","分享",["share a link","share with friends"],"neutral","positive","high",false,"Can you share the document with the team.","能把文件分享给团队吗。","发送给他人查看。"],
["post","/pəʊst/","v./n.","发布",["post a photo","post on social media"],"neutral","neutral","high",false,"She posts a new video every week.","她每周发一个新视频。","在网上公开发布内容。"],
["comment","/ˈkɒment/","v./n.","评论",["leave a comment","comment on"],"neutral","neutral","high",false,"Please comment below if you have questions.","有疑问请在下方评论。","对内容发表看法。"],
["like","/laɪk/","v./n.","点赞",["like a post","get many likes"],"informal","positive","high",false,"Her photo got over a thousand likes.","她照片收到了一千多赞。","在社交媒体点击喜欢。"],
["subscribe","/səbˈskraɪb/","v.","订阅",["subscribe to channel","subscribe now"],"neutral","positive","high",false,"Subscribe to my channel for more videos.","订阅我的频道看更多视频。","持续接收某创作者内容。"],
["unsubscribe","/ˌʌnsəbˈskraɪb/","v.","取消订阅",["unsubscribe from newsletter"],"neutral","neutral","high",false,"I unsubscribed from their marketing emails.","退订了他们的营销邮件。","不再接收某来源信息。"],
["follow","/ˈfɒləʊ/","v.","关注",["follow someone","follow back"],"informal","neutral","high",false,"I follow several travel bloggers on Instagram.","在Ins关注了几个旅行博主。","在社交平台追踪某人。"],
["unfollow","/ʌnˈfɒləʊ/","v.","取关",["decide to unfollow"],"informal","neutral","high",false,"I had to unfollow that account too many ads.","取关了那个号广告太多。","不再关注某账号。"],
["block","/blɒk/","v.","屏蔽",["block someone","block a number"],"informal","negative","high",false,"I had to block that spam number.","屏蔽了那个骚扰号码。","阻止某人联系或看到你。"],
["mute","/mjuːt/","v./n.","静音",["mute notifications","put on mute"],"neutral","neutral","high",false,"I muted the group chat it was too noisy.","静音了群聊太吵了。","关闭声音或通知。"],
["notify","/ˈnəʊtɪfaɪ/","v.","通知",["notify me","get notified"],"formal","neutral","high",false,"The app will notify you when it is ready.","准备好了应用会通知你。","发出提醒或告知。"],
["remind","/rɪˈmaɪnd/","v.","提醒",["remind me","remind someone"],"neutral","positive","high",false,"Remind me to call mom tomorrow.","提醒我明天打给妈妈。","帮助某人记住某事。"],
["set a reminder","/set ə rɪˈmaɪndə(r)/","phr.v.","设提醒",["set a reminder for"],"neutral","neutral","high",false,"I set a reminder for the meeting at 2pm.","设好了下午2点会议提醒。","在日历或手机设定提醒。"],
["RSVP","/ɑːr es viː ˈpiː/","v.","回覆邀请",["please RSVP","RSVP by Friday"],"formal","neutral","high",false,"Please RSVP by Friday if you can come.","周五前回复能否出席。","正式回复是否参加。"],
["dress up","/dres ʌp/","phr.v.","盛装打扮",["dress up for","get dressed up"],"neutral","positive","high",false,"We dressed up for the wedding.","盛装出席婚礼。","穿比平时更正式漂亮。"],
["dress down","/dres daʊn/","phr.v.","穿便装",["dress down Friday"],"informal","neutral","medium",false,"Fridays we can dress down at the office.","周五可以在办公室穿便装。","穿得比平时随意。"],
["try on","/traɪ ɒn/","phr.v.","试穿",["try on clothes","try it on"],"neutral","neutral","high",false,"I want to try on this dress in a smaller size.","想试这条裙子小一号。","穿上看是否合适。"],
["fit into","/fɪt ˈɪntə/","phr.v.","穿得进",["cannot fit into","barely fit into"],"neutral","neutral","high",false,"I hope I can still fit into my old jeans.","希望还能穿进旧牛仔裤。","身体能穿上某尺码衣服。"],
["go with","/ɡəʊ wɪð/","phr.v.","搭配",["go well with","does not go with"],"neutral","neutral","high",false,"This shirt goes well with those pants.","这件衬衫配那条裤子很好。","颜色或风格协调。"],
["match","/mætʃ/","v.","匹配搭配",["match your outfit","perfectly match"],"neutral","positive","high",false,"Your shoes match your bag perfectly.","你的鞋和包完美搭配。","相互协调一致。"],
];

// F9: 饮食烹饪 (50 words)
var f9data=[
["savory","/ˈseɪvəri/","adj.","咸味的",["savory dish","sweet and savory"],"neutral","positive","high",false,"I prefer savory breakfasts over sweet ones.","比起甜的我更喜欢咸味早餐。","与sweet相对的咸鲜味。"],
["scrumptious","/ˈskrʌmpʃəs/","adj.","极其美味的",["absolutely scrumptious"],"informal","positive","medium",false,"The chocolate cake was scrumptious.","巧克力蛋糕极其美味。","比delicious更生动。"],
["mouth watering","/ˈmaʊθ ˌwɔːtərɪŋ/","adj.","令人垂涎的",["mouth watering aroma"],"informal","positive","medium",false,"The mouth watering smell of fresh bread.","新鲜面包令人垂涎的香气。","看起来闻起来太诱人。"],
["bland","/blænd/","adj.","淡而无味的",["taste bland","a bit bland"],"neutral","negative","high",false,"The soup was a bit bland needed more salt.","汤有点寡淡需要多盐。","缺乏味道不够刺激。"],
["tangy","/ˈtæŋi/","adj.","味道浓烈的",["tangy flavor","tangy sauce"],"informal","positive","medium",false,"The dressing has a nice tangy kick from lemon.","酱汁因柠檬有爽口的酸味。","酸爽刺激好吃。"],
["crispy","/ˈkrɪspi/","adj.","酥脆的",["crispy skin","crispy fries"],"neutral","positive","high",false,"The chicken was crispy outside juicy inside.","鸡肉外酥里嫩。","嘎吱脆的口感。"],
["tender","/ˈtendə(r)/","adj.","嫩的柔软的",["tender meat","perfectly tender"],"neutral","positive","high",false,"The steak was so tender it melted in my mouth.","牛排嫩得入口即化。","容易咬的不硬的。"],
["simmer","/ˈsɪmə(r)/","v.","小火慢炖",["simmer for","bring to a simmer"],"neutral","neutral","high",false,"Let the sauce simmer for twenty minutes.","酱汁小火炖二十分钟。","刚沸腾冒小泡。"],
["knead","/niːd/","v.","揉面团",["knead the dough","knead until smooth"],"neutral","neutral","medium",false,"Knead the dough for ten minutes until elastic.","揉面团十分钟至有弹性。","反复按压折叠。"],
["marinate","/ˈmærɪneɪt/","v.","腌制",["marinate overnight","marinate in"],"neutral","neutral","medium",false,"Marinate the chicken in soy sauce and garlic.","鸡肉用酱油和蒜腌制。","烹饪前调味浸泡。"],
["garnish","/ˈɡɑːnɪʃ/","v./n.","装饰菜点缀",["garnish with","fresh garnish"],"formal","positive","medium",false,"Garnish the soup with fresh parsley.","用新鲜欧芹装饰汤。","装饰性食材。"],
["foodie","/ˈfuːdi/","n.","美食爱好者",["total foodie","foodie culture"],"informal","positive","medium",true,"She is a total foodie always trying new restaurants.","十足美食爱好者总尝试新餐厅。","极度热爱探索美食。"],
["mouthfeel","/ˈmaʊθfiːl/","n.","口感",["creamy mouthfeel","smooth mouthfeel"],"neutral","neutral","medium",true,"This chocolate has an incredibly smooth mouthfeel.","这巧克力有极顺滑口感。","食物在口中质地。"],
["go to","/ˈɡəʊ ˌtuː/","adj.","首选的",["go to recipe","go to restaurant"],"informal","positive","high",false,"This is my go to recipe for quick meals.","这是快手的首选菜谱。","最常用最信赖。"],
["hearty","/ˈhɑːti/","adj.","丰盛暖心的",["hearty meal","hearty breakfast"],"neutral","positive","medium",false,"Nothing beats a hearty soup on a cold day.","冷天什么也比不上暖心的汤。","量大令人满足。"],
["delectable","/dɪˈlektəbl/","adj.","美味可口的",["delectable treat","absolutely delectable"],"formal","positive","medium",false,"The patisserie sells the most delectable pastries.","法式甜点店卖的点心美味可口。","非常好吃优雅。"],
["devour","/dɪˈvaʊə(r)/","v.","狼吞虎咽",["devour a book","devour a meal"],"neutral","neutral","medium",false,"The kids devoured the pizza in five minutes.","孩子们五分钟狼吞虎咽吃完披萨。","快速热情吃完。"],
["nibble","/ˈnɪbl/","v.","小口吃",["nibble on","nibble at"],"informal","neutral","medium",false,"She nibbled on a cookie while reading.","边看书边小口吃饼干。","一点一点小口吃。"],
["gobble up","/ˈɡɒbl ʌp/","v.","大口吞食",["gobble up quickly"],"informal","neutral","medium",false,"He gobbled up dinner like he had not eaten in days.","大口吞食晚餐像几天没吃饭。","非常快急切吃完。"],
["wolf down","/wʊlf daʊn/","v.","大口吞下",["wolf down food","wolf down breakfast"],"informal","neutral","medium",false,"I had to wolf down breakfast to catch the bus.","大口吞下早餐才能赶上公交。","极快速不加咀嚼。"],
["sip","/sɪp/","v./n.","小口喝",["take a sip","sip slowly"],"neutral","neutral","high",false,"She sipped her tea and gazed out the window.","小口抿茶凝视窗外。","与gulp相反。"],
["gulp","/ɡʌlp/","v.","大口喝",["gulp down","take a gulp"],"informal","neutral","medium",false,"He gulped down a glass of cold water after his run.","跑步后大口喝完冰水。","一口气喝很多。"],
["pairing","/ˈpeərɪŋ/","n.","搭配",["wine pairing","food pairing"],"neutral","positive","medium",false,"The sommelier recommended a perfect wine pairing.","侍酒师推荐了完美的佐餐酒搭配。","有意组合食品饮料。"],
["comfort food","/ˈkʌmfət fuːd/","n.","治愈系食物",["eat comfort food","need comfort food"],"informal","positive","medium",true,"Mac and cheese is my ultimate comfort food.","芝士通心粉是终极治愈食物。","给人情感慰藉的食物。"],
["al dente","/æl ˈdenteɪ/","adj.","有嚼劲的",["cook al dente","perfectly al dente"],"neutral","positive","medium",true,"The pasta was cooked perfectly al dente.","意面煮得完美有嚼劲。","意大利语咬起来有阻力。"],
["sizzle","/ˈsɪzl/","v./n.","滋滋作响",["hear it sizzle","sizzling hot"],"informal","positive","medium",false,"The steak sizzled as it hit the hot pan.","牛排一入热锅就滋滋作响。","高温煎炸的声音。"],
["caramelize","/ˈkærəməlaɪz/","v.","焦糖化",["caramelize the onions","caramelized sugar"],"formal","positive","medium",false,"Caramelize the onions until golden brown.","洋葱焦糖化至金黄。","加热糖变成焦糖。"],
["saute","/ˈsəʊteɪ/","v.","煸炒",["saute the onions","saute until"],"formal","neutral","medium",false,"Saute the garlic in olive oil until fragrant.","橄榄油煸炒蒜至出香。","法语：少量油快速翻炒。"],
["roast","/rəʊst/","v./n.","烤",["roast chicken","roast vegetables"],"neutral","positive","high",false,"We are roasting a chicken for Sunday dinner.","周日烤一只鸡做晚餐。","用烤箱高温烹饪。"],
["grill","/ɡrɪl/","v./n.","烧烤",["grill outdoors","grill some burgers"],"neutral","positive","high",false,"Let us grill some burgers this weekend.","周末来烤些汉堡吧。","在烤架上直接加热。"],
["steam","/stiːm/","v.","蒸",["steam vegetables","steamed rice"],"neutral","positive","high",false,"Steaming vegetables preserves more nutrients.","蒸蔬菜保留更多营养。","用水蒸气烹饪。"],
["stir fry","/stɜː fraɪ/","v./n.","炒",["stir fry vegetables","quick stir fry"],"neutral","positive","high",false,"A quick stir fry is perfect for busy weeknights.","忙碌的工作日晚快炒最合适。","高温锅快速翻炒。"],
["poach","/pəʊtʃ/","v.","水煮",["poach an egg","poached salmon"],"formal","neutral","medium",false,"I love poached eggs on toast for breakfast.","早餐喜欢水波蛋配吐司。","低温液体中缓慢烹饪。"],
["braise","/breɪz/","v.","炖焖",["braise the meat","braised beef"],"formal","positive","medium",false,"Braise the beef in red wine for three hours.","红酒炖牛肉三小时。","先煎后慢炖。"],
["whisk","/wɪsk/","v.","搅拌打",["whisk together","whisk until fluffy"],"neutral","neutral","high",false,"Whisk the eggs and sugar until light and fluffy.","鸡蛋和糖打发到轻盈蓬松。","快速搅打使其充气。"],
["dice","/daɪs/","v.","切丁",["dice the onions","finely diced"],"neutral","neutral","medium",false,"Dice the tomatoes into small cubes.","把番茄切成小丁。","切成均匀小方块。"],
["chop","/tʃɒp/","v.","切碎",["chop finely","roughly chop"],"neutral","neutral","high",false,"Chop the herbs just before adding them.","香草在下锅前切碎。","快速粗略切碎。"],
["slice","/slaɪs/","v./n.","切片",["slice thinly","slice into"],"neutral","neutral","high",false,"Slice the bread into even pieces.","面包切成均匀片。","切成扁平的片状。"],
["grate","/ɡreɪt/","v.","刨丝磨碎",["grate cheese","freshly grated"],"neutral","neutral","medium",false,"Grate some Parmesan over the pasta.","在面上刨些帕玛森奶酪。","用擦丝器擦成细末。"],
["peel","/piːl/","v./n.","削皮",["peel the potatoes","peel off"],"neutral","neutral","high",false,"Peel the potatoes before boiling them.","土豆煮前先削皮。","去除水果蔬菜外皮。"],
["mash","/mæʃ/","v.","捣碎",["mash potatoes","mash together"],"neutral","neutral","medium",false,"Mash the potatoes with butter and milk.","加黄油牛奶捣碎土豆。","压成柔软糊状。"],
["blend","/blend/","v./n.","搅拌混合",["blend together","blend until smooth"],"neutral","neutral","high",false,"Blend all ingredients until smooth.","所有食材搅拌至顺滑。","用搅拌机打匀。"],
["season","/ˈsiːzn/","v.","调味",["season with salt","well seasoned"],"neutral","neutral","high",false,"Season the meat generously with salt and pepper.","肉要多加盐和黑胡椒调味。","加入调味料。"],
["taste","/teɪst/","v./n.","尝味道",["taste and adjust","have a taste"],"neutral","neutral","high",false,"Always taste your food before adding more salt.","加更多盐前先尝一尝。","试吃看味道是否对。"],
["sprinkle","/ˈsprɪŋkl/","v.","撒",["sprinkle with","sprinkle on top"],"neutral","neutral","high",false,"Sprinkle some fresh herbs on top before serving.","上桌前撒些新鲜香草。","少量均匀撒在表面。"],
["drizzle","/ˈdrɪzl/","v.","淋",["drizzle with olive oil","drizzle over"],"neutral","positive","medium",false,"Drizzle some olive oil over the salad.","在沙拉上淋些橄榄油。","细流状浇在食物上。"],
["soak","/səʊk/","v.","浸泡",["soak overnight","soak in water"],"neutral","neutral","high",false,"Soak the beans overnight before cooking.","豆子烹饪前浸泡一晚。","长时间浸在液体中。"],
["rinse","/rɪns/","v.","冲洗",["rinse thoroughly","rinse off"],"neutral","neutral","high",false,"Rinse the vegetables under cold running water.","用流动冷水冲洗蔬菜。","用水快速清洗。"],
["drain","/dreɪn/","v.","沥干",["drain the pasta","drain well"],"neutral","neutral","high",false,"Drain the pasta and reserve some cooking water.","意面沥干留些煮面水。","去掉多余水分。"],
];

// F10: 旅行交通 (50 words)
var f10data=[
["itinerary","/aɪˈtɪnərəri/","n.","行程安排",["travel itinerary","detailed itinerary"],"formal","neutral","high",false,"Our itinerary includes three days in Paris.","行程包括巴黎三天。","每天去哪做什么的详细计划。"],
["jet lag","/ˈdʒet læɡ/","n.","时差反应",["suffer from jet lag","bad jet lag"],"neutral","negative","high",true,"I had terrible jet lag after the long flight.","长途飞行后严重时差。","跨时区旅行身体不适。"],
["layover","/ˈleɪəʊvə(r)/","n.","中转停留",["long layover","three hour layover"],"neutral","neutral","high",false,"We had a six hour layover in Dubai.","在迪拜有六小时中转停留。","转机间机场等待。"],
["off the beaten path","/ɒf ðə ˈbiːtən pɑːθ/","adj.","不寻常的路线",["go off the beaten path"],"informal","positive","medium",false,"Found this village off the beaten path.","发现这个不在热门路线上的村庄。","远离常规旅游景点。"],
["wanderlust","/ˈwɒndəlʌst/","n.","旅行的强烈渴望",["strong wanderlust","feel wanderlust"],"neutral","positive","medium",true,"Reading travel blogs gives me wanderlust.","看旅行博客产生旅行冲动。","强烈渴望旅行探索。"],
["check in","/tʃek ɪn/","n./v.","办理入住登机",["check in counter","online check in"],"neutral","neutral","high",false,"Online check in saves time at the airport.","网上值机省机场排队时间。","正式登记到达。"],
["excursion","/ɪkˈskɜːʃən/","n.","短途游览",["day excursion","guided excursion"],"formal","positive","medium",false,"The resort organizes daily excursions.","度假村组织每日短途游览。","短途团体旅行。"],
["cabin crew","/ˈkæbɪn kruː/","n.","机组人员",["friendly cabin crew","ask the cabin crew"],"formal","neutral","high",false,"The cabin crew were incredibly helpful.","机组人员非常乐于助人。","飞机上的空乘人员。"],
["boarding pass","/ˈbɔːdɪŋ pɑːs/","n.","登机牌",["print boarding pass","digital boarding pass"],"neutral","neutral","high",false,"I have my boarding pass saved on my phone.","登机牌存在手机上。","登机必须出示。"],
["red eye flight","/red aɪ flaɪt/","n.","夜航红眼航班",["take the red eye","catch a red eye"],"informal","neutral","medium",true,"I took the red eye from LA and landed at 6am.","从洛杉矶坐红眼航班早上6点到。","深夜起清晨到的航班。"],
["backpacker","/ˈbækˌpækə(r)/","n.","背包客",["budget backpacker","backpacker hostel"],"neutral","neutral","medium",false,"As a backpacker you travel light and flexible.","作为背包客轻装灵活出行。","预算有限长途旅行者。"],
["all inclusive","/ˌɔːl ɪnˈkluːsɪv/","adj.","全包的",["all inclusive resort","all inclusive package"],"neutral","positive","high",false,"Booked an all inclusive resort everything prepaid.","订了全包度假村一切预付。","食物饮料活动全含。"],
["bucket list","/ˈbʌkɪt lɪst/","n.","人生必做清单",["on my bucket list","bucket list destination"],"informal","positive","high",true,"Northern Lights is top of my bucket list.","看极光是我人生必做清单头条。","一生最想完成的事。"],
["globetrotter","/ˈɡləʊbˌtrɒtə(r)/","n.","环球旅行者",["seasoned globetrotter","aspiring globetrotter"],"informal","positive","medium",false,"Visited 50 countries quite the globetrotter.","去过50国算是环球旅行者了。","经常世界各地旅行。"],
["road trip","/rəʊd trɪp/","n.","自驾游",["go on a road trip","cross country road trip"],"informal","positive","high",false,"Planning a road trip along the coast.","计划沿海岸线自驾游。","以车为交通工具长途旅行。"],
["staycation","/steɪˈkeɪʃən/","n.","在家度假",["take a staycation","relaxing staycation"],"informal","positive","medium",true,"Doing a staycation this summer instead of traveling.","今夏在家度假不外出。","待家里当作度假。"],
["voyage","/ˈvɔɪɪdʒ/","n.","航程",["maiden voyage","long voyage"],"formal","positive","medium",false,"The Titanic sank on its maiden voyage.","泰坦尼克首航沉没。","长途海上或太空旅行。"],
["trek","/trek/","n./v.","长途跋涉",["long trek","mountain trek"],"neutral","neutral","medium",false,"The trek to Everest base camp takes two weeks.","徒步珠峰大本营需两周。","长距离辛苦步行。"],
["carpool","/ˈkɑːpuːl/","n./v.","拼车",["organize a carpool","carpool lane"],"neutral","positive","medium",false,"We carpool to work to save on gas.","拼车上班省油。","多人共乘一辆车。"],
["hitchhike","/ˈhɪtʃhaɪk/","v.","搭便车",["go hitchhiking","pick up a hitchhiker"],"neutral","neutral","medium",false,"He hitchhiked across Europe one summer.","夏天搭便车横穿了欧洲。","拦陌生人车免费搭乘。"],
["transit","/ˈtrænzɪt/","n.","公共交通",["public transit","mass transit"],"formal","neutral","high",false,"The city has excellent public transit.","城市有出色的公共交通。","公交地铁电车等。"],
["gridlock","/ˈɡrɪdlɒk/","n.","交通瘫痪",["total gridlock","stuck in gridlock"],"formal","negative","medium",false,"Accident caused complete gridlock for hours.","事故导致交通完全瘫痪几小时。","车辆完全堵死。"],
["rush hour","/rʌʃ ˈaʊə(r)/","n.","交通高峰期",["during rush hour","morning rush hour"],"neutral","neutral","high",false,"Leave before rush hour to avoid traffic.","高峰期前出发避堵。","上下班最拥堵时段。"],
["round trip","/raʊnd trɪp/","n.","往返",["round trip ticket","round trip flight"],"neutral","neutral","high",false,"A round trip ticket is cheaper than two one ways.","往返票比两张单程便宜。","去和回都包括的旅程。"],
["one way","/wʌn weɪ/","adj.","单程",["one way ticket","one way street"],"neutral","neutral","high",false,"I bought a one way ticket to Bangkok.","买了去曼谷的单程票。","只去不回。"],
["window seat","/ˈwɪndəʊ siːt/","n.","靠窗座位",["prefer window seat","request window seat"],"neutral","positive","high",false,"I always request a window seat on flights.","飞机上总要求靠窗座位。","飞机靠窗的位置。"],
["aisle seat","/aɪl siːt/","n.","过道座位",["prefer aisle seat"],"neutral","neutral","high",false,"I prefer an aisle seat for easier access to bathroom.","偏爱过道座方便去洗手间。","飞机靠过道位置。"],
["carry on luggage","/ˈkæri ɒn ˈlʌɡɪdʒ/","n.","手提行李",["carry on bag","carry on only"],"neutral","neutral","high",false,"I only travel with carry on luggage no checked bags.","只带手提行李出行不托运行李。","带上飞机的行李。"],
["checked baggage","/tʃekt ˈbæɡɪdʒ/","n.","托运行李",["checked bag fee","no checked baggage"],"neutral","neutral","high",false,"Checked baggage is not included in basic fare.","基础票价不含托运行李。","交给航空公司的行李。"],
["terminal","/ˈtɜːmɪnl/","n.","航站楼",["airport terminal","terminal building"],"formal","neutral","high",false,"Our flight departs from Terminal 3.","航班从3号航站楼出发。","机场的乘客大楼。"],
["gate","/ɡeɪt/","n.","登机口",["boarding gate","gate number"],"neutral","neutral","high",false,"Please proceed to gate B12 for boarding.","请前往B12登机口登机。","登机前的最终等候区。"],
["customs","/ˈkʌstəmz/","n.","海关",["go through customs","customs officer"],"formal","neutral","high",false,"We had to declare items at customs.","需在海关申报物品。","出入境时的边检关卡。"],
["visa","/ˈviːzə/","n.","签证",["apply for a visa","visa on arrival"],"formal","neutral","high",false,"You need a visa to enter that country.","进入那个国家需要签证。","入境许可文件。"],
["passport","/ˈpɑːspɔːt/","n.","护照",["renew passport","check passport"],"formal","neutral","high",false,"Make sure your passport is valid for six months.","确保护照有六个月有效期。","国际旅行身份文件。"],
["foreign exchange","/ˈfɒrɪn ɪksˈtʃeɪndʒ/","n.","外币兑换",["foreign exchange rate","foreign exchange office"],"formal","neutral","high",false,"Where is the nearest foreign exchange desk.","最近的外币兑换处在哪。","换外国货币。"],
["currency","/ˈkʌrənsi/","n.","货币",["local currency","foreign currency"],"formal","neutral","high",false,"What is the local currency in Japan.","日本的本地货币是什么。","一个国家使用的钱。"],
["exchange rate","/ɪksˈtʃeɪndʒ reɪt/","n.","汇率",["favorable exchange rate","check exchange rate"],"formal","neutral","high",false,"The exchange rate is better at the bank.","银行的汇率更好。","一种货币换另一种的比率。"],
["landmark","/ˈlændmɑːk/","n.","地标",["famous landmark","historic landmark"],"neutral","positive","high",false,"The Eiffel Tower is the most famous landmark in Paris.","埃菲尔铁塔是巴黎最著名地标。","城市标志性建筑。"],
["touristy","/ˈtʊərɪsti/","adj.","游客众多的",["too touristy","touristy area"],"informal","negative","medium",false,"That area is too touristy and overpriced.","那个区太游客化太贵了。","被太多游客占据的。"],
["authentic","/ɔːˈθentɪk/","adj.","地道的真实的",["authentic experience","authentic food"],"neutral","positive","high",false,"We found an authentic local restaurant.","找到了一家地道的本地餐厅。","不商业化的真体验。"],
["scenic","/ˈsiːnɪk/","adj.","风景优美的",["scenic route","scenic view"],"neutral","positive","high",false,"Take the scenic route along the coast.","走沿海岸线的景观路吧。","有美丽景色的。"],
["picturesque","/ˌpɪktʃəˈresk/","adj.","如画的",["picturesque village","picturesque setting"],"formal","positive","medium",false,"A picturesque little village by the lake.","湖边一个如画的小村庄。","美得像画一样。"],
["bustling","/ˈbʌslɪŋ/","adj.","熙熙攘攘的",["bustling city","bustling market"],"neutral","positive","high",false,"The market was bustling with activity.","市场熙熙攘攘热闹非凡。","充满活力和人群。"],
["secluded","/sɪˈkluːdɪd/","adj.","与世隔绝幽静的",["secluded beach","secluded spot"],"neutral","positive","medium",false,"We found a secluded beach away from crowds.","发现了一个远离人群的幽静海滩。","安静隐蔽的。"],
["remote","/rɪˈməʊt/","adj.","偏远的",["remote village","remote area"],"neutral","neutral","high",false,"They live in a remote mountain village.","他们住在偏远山村。","远离城镇交通不便。"],
["accessible","/əkˈsesəbl/","adj.","可到达的无障碍的",["easily accessible","wheelchair accessible"],"neutral","positive","high",false,"The beach is easily accessible by public transport.","公共交通可轻松到达海滩。","容易到达方便进出。"],
["accommodation","/əˌkɒməˈdeɪʃən/","n.","住宿",["find accommodation","book accommodation"],"formal","neutral","high",false,"We need to find affordable accommodation.","需要找负担得起的住宿。","旅行中的住处。"],
["hostel","/ˈhɒstl/","n.","青年旅社",["stay in a hostel","youth hostel"],"neutral","neutral","high",false,"Backpackers often stay in hostels to save money.","背包客常住青年旅社省钱。","便宜的共用住宿。"],
["Airbnb","/ˈeə biː en biː/","n.","民宿短租",["book an Airbnb","stay at an Airbnb"],"neutral","positive","high",false,"We booked an Airbnb for our weekend trip.","民宿短租订了周末住宿。","共享住宿平台。"],
["suite","/swiːt/","n.","套房",["hotel suite","presidential suite"],"formal","positive","medium",false,"We upgraded to a suite for our anniversary.","纪念日升级了套房。","酒店中的豪华大房间。"],
];

// ====== ASSEMBLE ======
var c = fs.readFileSync("src/data/vocabulary.ts","utf8");

// Get current word count
var wc = (c.match(/W\('/g)||[]).length;
console.log("Current vocabulary words: " + wc);

// Add new fields before closing ];
var newFields = "";
newFields += bulkField("f8","日常生活","涵盖日常起居家务和数字生活的实用词汇","8",f8data);
newFields += bulkField("f9","饮食烹饪","关于食物烹饪和餐饮的表达","9",f9data);
newFields += bulkField("f10","旅行交通","关于旅行出行和交通的词汇","10",f10data);

var lastIdx = c.lastIndexOf('];');
c = c.substring(0, lastIdx) + newFields + '\n];';
fs.writeFileSync("src/data/vocabulary.ts", c);

var wc2 = (c.match(/W\('/g)||[]).length;
console.log("Vocabulary words after: " + wc2);
