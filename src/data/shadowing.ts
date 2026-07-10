// EXPORTS: IShadowingMaterial, IShadowingSentence, MOCK_SHADOWING_MATERIALS
export interface IShadowingSentence {
  id: string; text: string; annotatedText: string; translation: string; duration: number
}
export interface IShadowingMaterial {
  id: string; title: string; category: 'daily' | 'speech' | 'story'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  accent: 'US' | 'UK'; totalDuration: number; sentences: IShadowingSentence[]; description: string
}

// Helper: generate sentences quickly with format
function S(id: string, text: string, annotatedText: string, translation: string, duration: number): IShadowingSentence {
  return { id, text, annotatedText, translation, duration }
}

export const MOCK_SHADOWING_MATERIALS: IShadowingMaterial[] = [
  // ===== DAILY (8 materials, ~90 sentences) =====
  { id:'1', title:'咖啡店点单对话', category:'daily', difficulty:'beginner', accent:'US', totalDuration:45, description:'咖啡店日常对话',
    sentences:[ S('1-1','Hi there, how can I help you today?','Hi there, how can I help you to<u>day</u>?','你好，今天想喝点什么？',3),
      S('1-2',"I'd like a medium latte, please.","I'd like a me<u>dium</u> la<u>tte</u>, please.",'我想要一杯中杯拿铁。',3),
      S('1-3','Would you like that hot or iced?','Would you like tha<u>t ho</u>t or iced?','您要热的还是冰的？',3),
      S('1-4','Hot, please. And can I get an extra shot of espresso?','Hot, please. An<u>d</u> can I get an ex<u>tra</u> shot of espresso?','热的，可以加一份浓缩吗？',4),
      S('1-5','Sure thing. That will be four fifty.','Sure thing. Tha<u>t</u> will be four fifty.','好的，一共4.5美元。',3),
      S('1-6','Here you go — enjoy your drink!','Here you go — enjoy your drink!','给您——请享用！',2),
      S('1-7','Thanks, have a great day!','Thanks, have a great day!','谢谢，祝您有美好的一天！',2),
    ]},

  { id:'2', title:'餐厅预订对话', category:'daily', difficulty:'beginner', accent:'US', totalDuration:40, description:'电话预订餐厅',
    sentences:[ S('2-1',"Hi, I'd like to make a reservation for Friday evening.","Hi, I'd like to make a reserva<u>tion</u> for Friday evening.",'你好，我想预订周五晚上的位子。',3),
      S('2-2','Sure, for how many people and what time?','Sure, for how many people an<u>d</u> what time?','好的，几位？什么时间？',3),
      S('2-3','Table for four at seven thirty, please.','Table for four a<u>t</u> seven thirty, please.','四个人，七点半。',2),
      S('2-4',"Great, we'll have a table ready for you. Can I get a name?","Great, we'll have a table ready for you. Can I get a name?",'好的，请问贵姓？',4),
      S('2-5',"It's under Chen — C-H-E-N.","It's under Chen — C-H-E-N.",'姓陈，C-H-E-N。',3),
      S('2-6','Is there anything special you\'re celebrating tonight?','Is there anything special you\'re celebrating tonight?','今晚有什么特别的庆祝活动吗？',3),
      S('2-7',"It's my wife's birthday — could we get a nice table by the window?","It's my wife's birthday — could we get a nice table by the window?",'是我妻子的生日——能安排靠窗的好位置吗？',5),
      S('2-8','Absolutely, I\'ll make a note of that. See you Friday!','Absolutely, I\'ll make a note of that. See you Friday!','当然，我会备注。周五见！',3),
    ]},

  { id:'3', title:'商务邮件常用表达', category:'daily', difficulty:'intermediate', accent:'US', totalDuration:50, description:'商务邮件书面语',
    sentences:[ S('3-1',"I'm writing to follow up on our conversation from last week.","I'm writing to follow u<u>p</u> on our conversation from last week.",'我来跟进一下上周的谈话。',4),
      S('3-2','Please do not hesitate to reach out if you have any questions.','Please do no<u>t</u> hesitate to reach out if you have any questions.','如有任何问题，请随时联系我。',4),
      S('3-3',"I'd appreciate it if you could get back to me by Friday.","I'd appreciate i<u>t</u> if you could get back to me by Friday.",'如果您能在周五前回复，我将不胜感激。',4),
      S('3-4','Looking forward to hearing from you soon.','Looking forward to hearing from you soon.','期待您的回复。',3),
      S('3-5','Please find the attached document for your review.','Please find the attached document for your review.','请查收附件文件供您审阅。',3),
      S('3-6','Let me know if you need any clarification on the points discussed.','Let me know if you need any clarification on the points discussed.','如果对讨论的要点需要任何澄清，请告诉我。',4),
    ]},

  { id:'4', title:'购物退货对话', category:'daily', difficulty:'beginner', accent:'US', totalDuration:50, description:'商场退货场景',
    sentences:[ S('4-1','Hi, I\'d like to return this shirt — it\'s a bit too small.','Hi, I\'d like to return this shirt — it\'s a bit too small.','你好，我想退这件衬衫——有点太小了。',3),
      S('4-2','Do you have the receipt with you?','Do you have the receipt with you?','您带收据了吗？',2),
      S('4-3','Yes, here it is. I bought it just two days ago.','Yes, here it is. I bought it just two days ago.','带了，两天前刚买的。',3),
      S('4-4','No problem. Would you like a refund or an exchange?','No problem. Would you like a refund or an exchange?','没问题。您要退款还是换货？',3),
      S('4-5','I\'d like to exchange it for a larger size if possible.','I\'d like to exchange it for a larger size if possible.','如果可以的话我想换一件大一号的。',3),
      S('4-6','Let me check if we have that in stock. One moment please.','Let me check if we have that in stock. One moment please.','我查一下库存。请稍等。',3),
    ]},

  { id:'5', title:'看病预约对话', category:'daily', difficulty:'intermediate', accent:'UK', totalDuration:55, description:'医疗就诊场景',
    sentences:[ S('5-1','Good morning, I\'d like to book an appointment with Dr. Smith.','Good morning, I\'d like to book an appointment with Dr. Smith.','早上好，我想预约Smith医生。',3),
      S('5-2','Is it for a regular check-up or something specific?','Is it for a regular check-up or something specific?','是常规体检还是具体的问题？',3),
      S('5-3','I\'ve had this persistent cough for over a week now.','I\'ve had this persistent cough for over a week now.','我持续咳嗽已经超过一周了。',3),
      S('5-4','The earliest available slot is Thursday at 10am.','The earliest available slot is Thursday at 10am.','最早可约的时间是周四上午10点。',3),
      S('5-5','That works for me. Thank you so much.','That works for me. Thank you so much.','我可以。非常感谢。',2),
      S('5-6','Please bring your insurance card and arrive 15 minutes early.','Please bring your insurance card and arrive 15 minutes early.','请带好保险卡并提前15分钟到。',4),
    ]},

  { id:'6', title:'问路指路对话', category:'daily', difficulty:'beginner', accent:'UK', totalDuration:50, description:'城市问路场景',
    sentences:[ S('6-1','Excuse me, could you tell me how to get to the British Museum?','Excuse me, could you tell me how to get to the British Museum?','打扰了，请问大英博物馆怎么走？',3),
      S('6-2','Sure! Go straight down this road for about ten minutes.','Sure! Go straight down this road for about ten minutes.','当然！沿这条路直走大约十分钟。',2),
      S('6-3','You\'ll see a large intersection with a statue in the middle.','You\'ll see a large intersection with a statue in the middle.','你会看到一个大十字路口中间有一座雕像。',3),
      S('6-4','Take a left there and the museum will be on your right.','Take a left there and the museum will be on your right.','在那里左转，博物馆就在你的右手边。',3),
      S('6-5','Is it within walking distance or should I take the tube?','Is it within walking distance or should I take the tube?','走路能到吗还是应该坐地铁？',3),
      S('6-6','It\'s definitely walkable — maybe fifteen minutes at most.','It\'s definitely walkable — maybe fifteen minutes at most.','绝对能走到——最多十五分钟。',2),
      S('6-7','Brilliant, thanks a lot for your help!','Brilliant, thanks a lot for your help!','太好了，非常感谢你的帮助！',2),
    ]},

  { id:'7', title:'租房看房对话', category:'daily', difficulty:'intermediate', accent:'US', totalDuration:60, description:'租房场景',
    sentences:[ S('7-1','Hi, I\'m here to see the apartment — I called earlier.','Hi, I\'m here to see the apartment — I called earlier.','你好，我来看房——之前打过电话。',3),
      S('7-2','Great! Let me show you around. This is the living area.','Great! Let me show you around. This is the living area.','好的！我带您看看。这是客厅。',3),
      S('7-3','The apartment comes fully furnished with all the appliances.','The apartment comes fully furnished with all the appliances.','公寓家具家电齐全。',3),
      S('7-4','What about utilities — are they included in the rent?','What about utilities — are they included in the rent?','水电费呢——包含在房租里吗？',3),
      S('7-5','Water is included, but electricity and internet are separate.','Water is included, but electricity and internet are separate.','水费包含，电费和网费另算。',3),
      S('7-6','The lease is for twelve months with a security deposit of one month\'s rent.','The lease is for twelve months with a security deposit of one month\'s rent.','租期12个月，押金为一个月的房租。',4),
      S('7-7','I\'m very interested. When can I move in?','I\'m very interested. When can I move in?','我很感兴趣。什么时候可以搬进来？',2),
      S('7-8','As soon as the paperwork is done — probably by next week.','As soon as the paperwork is done — probably by next week.','手续办完就可以——大概下周。',3),
    ]},

  { id:'8', title:'银行开户对话', category:'daily', difficulty:'intermediate', accent:'US', totalDuration:55, description:'银行办理业务',
    sentences:[ S('8-1','I\'d like to open a checking account, please.','I\'d like to open a checking account, please.','我想开一个支票账户。',2),
      S('8-2','Do you have a form of identification with you?','Do you have a form of identification with you?','您带身份证明了吗？',2),
      S('8-3','Yes, here\'s my passport and proof of address.','Yes, here\'s my passport and proof of address.','带了，这是我的护照和住址证明。',3),
      S('8-4','Would you also like to set up online banking?','Would you also like to set up online banking?','您还需要开通网上银行吗？',2),
      S('8-5','Yes please. And can I get a debit card as well?','Yes please. And can I get a debit card as well?','好的。还能给我一张借记卡吗？',3),
      S('8-6','Absolutely. The card will be mailed to you within five business days.','Absolutely. The card will be mailed to you within five business days.','当然。银行卡会在五个工作日内寄给您。',4),
      S('8-7','Is there a minimum balance requirement?','Is there a minimum balance requirement?','有最低余额要求吗？',2),
      S('8-8','You need to maintain at least $500 to avoid the monthly fee.','You need to maintain at least $500 to avoid the monthly fee.','需要保持至少500美元以避免月费。',3),
    ]},
  // ===== SPEECH (8 materials, ~90 sentences) =====
  { id:'9', title:'励志演讲片段', category:'speech', difficulty:'intermediate', accent:'US', totalDuration:60, description:'经典励志演讲：追逐梦想',
    sentences:[ S('9-1','Every single one of you has something that you are good at.','Every single one of you has something tha<u>t</u> you are good at.','你们每个人都有自己擅长的事情。',4),
      S('9-2','You don\'t have to be perfect to be extraordinary.','You don\'t have to be per<u>fect</u> to be extra<u>ordinary</u>.','你不必完美才能变得非凡。',4),
      S('9-3','What matters is that you keep moving forward.','What matters is tha<u>t</u> you keep mo<u>ving</u> forward.','重要的是你一直在前进。',4),
      S('9-4','Failure is not the opposite of success; it is part of success.','Failure is no<u>t</u> the opposite of success — i<u>t</u> is part of success.','失败不是成功的对立面，而是成功的一部分。',5),
      S('9-5','So go out there and make your dreams come true.','So go out there an<u>d</u> make your dreams come true.','走出去，让你的梦想成真。',4),
    ]},

  { id:'10', title:'TED演讲：终身学习', category:'speech', difficulty:'advanced', accent:'US', totalDuration:75, description:'终身学习的价值观',
    sentences:[ S('10-1','The illiterate of the 21st century will not be those who cannot read and write.','The illiterate of the 21st century will no<u>t</u> be those who cannot read and write.','21世纪的文盲不是不会读写的人。',5),
      S('10-2','It will be those who cannot learn, unlearn, and relearn.','It will be those who cannot learn, unlearn, an<u>d</u> relearn.','而是那些不会学习、不会抛弃旧知、不会重新学习的人。',5),
      S('10-3','Learning is not a destination — it is a continuous process.','Learning is no<u>t</u> a destination — i<u>t</u> is a continuous process.','学习不是终点，而是一个持续的过程。',4),
      S('10-4','Every single day presents a new opportunity to grow and improve.','Every single day presents a new opportunity to grow and improve.','每一天都提供了成长和进步的新机会。',4),
      S('10-5','The moment you stop learning is the moment you stop living.','The moment you stop learning is the moment you stop living.','你停止学习的那一刻，就是你停止生活的那一刻。',4),
      S('10-6','Stay curious. Stay hungry. Stay foolish.','Stay curious. Stay hungry. Stay foolish.','保持好奇。保持饥渴。保持愚钝。',3),
    ]},

  { id:'11', title:'英音新闻播报片段', category:'speech', difficulty:'advanced', accent:'UK', totalDuration:65, description:'BBC风格新闻播报',
    sentences:[ S('11-1','Authorities have announced new measures to tackle climate change.','Authorities have announced new measures to tackle climate change.','当局宣布了应对气候变化的新措施。',4),
      S('11-2','The initiative aims to reduce carbon emissions by forty percent by 2035.','The initiative aims to reduce carbon emissions by forty percen<u>t</u> by 2035.','该倡议目标在2035年前将碳排放减少40%。',5),
      S('11-3','Experts say this is a crucial step toward a sustainable future.','Experts say this is a crucial step toward a sustainable future.','专家表示这是迈向可持续未来的关键一步。',4),
      S('11-4','The full report is expected to be published early next month.','The full report is expected to be published early next month.','完整报告预计于下月初公布。',4),
      S('11-5','Opposition leaders have called for more aggressive action.','Opposition leaders have called for more aggressive action.','反对派领导人呼吁采取更激进的行动。',3),
      S('11-6','A final decision will be reached after the parliamentary debate next week.','A final decision will be reached after the parliamentary debate next week.','最终决定将在下周议会辩论后做出。',5),
    ]},

  { id:'12', title:'毕业典礼致辞', category:'speech', difficulty:'intermediate', accent:'US', totalDuration:70, description:'大学毕业典礼上的毕业寄语',
    sentences:[ S('12-1','Congratulations to the class of 2024 — you made it!','Congratulations to the class of 2024 — you made it!','恭喜2024届毕业生——你们做到了！',3),
      S('12-2','Today marks the end of one chapter and the beginning of another.','Today marks the end of one chapter and the beginning of another.','今天标志着一个篇章的结束和另一个篇章的开始。',4),
      S('12-3','The road ahead won\'t always be easy, but it will be worth it.','The road ahead won\'t always be easy, but it will be worth it.','前方的路不会一直平坦，但一定是值得的。',4),
      S('12-4','Don\'t be afraid to fail — be afraid of not trying at all.','Don\'t be afraid to fail — be afraid of not trying at all.','不要害怕失败——要害怕根本不尝试。',4),
      S('12-5','Your education is not just a degree — it\'s a toolkit for life.','Your education is not just a degree — it\'s a toolkit for life.','你们的教育不仅是一张文凭——更是人生的工具箱。',4),
      S('12-6','Go out into the world and make your mark. We believe in you.','Go out into the world and make your mark. We believe in you.','走向世界，留下你们的印记。我们相信你们。',4),
    ]},

  { id:'13', title:'商业发布会演讲', category:'speech', difficulty:'advanced', accent:'US', totalDuration:80, description:'产品发布会CEO演讲',
    sentences:[ S('13-1','Welcome everyone. Today we\'re thrilled to unveil something truly revolutionary.','Welcome everyone. Today we\'re thrilled to unveil something truly revolutionary.','欢迎各位。今天我们非常激动地揭晓真正革命性的产品。',5),
      S('13-2','This is the result of five years of relentless innovation.','This is the result of five years of relentless innovation.','这是五年不懈创新的成果。',3),
      S('13-3','We\'ve completely reimagined what\'s possible in this space.','We\'ve completely reimagined what\'s possible in this space.','我们彻底重新构想了这个领域的可能性。',3),
      S('13-4','The numbers speak for themselves — three times faster, half the cost.','The numbers speak for themselves — three times faster, half the cost.','数据说明一切——快三倍，省一半成本。',4),
      S('13-5','Our commitment to quality and user experience has never been stronger.','Our commitment to quality and user experience has never been stronger.','我们对质量和用户体验的承诺从未如此坚定。',5),
      S('13-6','I want to thank our incredible team who made this possible.','I want to thank our incredible team who made this possible.','我要感谢我们了不起的团队，是他们让这一切成为可能。',4),
    ]},

  { id:'14', title:'环保主题演讲', category:'speech', difficulty:'intermediate', accent:'UK', totalDuration:70, description:'环保活动家的呼吁',
    sentences:[ S('14-1','We stand at a crossroads in human history.','We stand at a crossroads in human history.','我们正站在人类历史的十字路口。',3),
      S('14-2','The choices we make today will define the world our children inherit.','The choices we make today will define the world our children inherit.','我们今天的选择将定义孩子们继承的世界。',4),
      S('14-3','Every plastic bottle, every mile driven, every tree cut down adds up.','Every plastic bottle, every mile driven, every tree cut down adds up.','每一个塑料瓶、每一英里车程、每一棵被砍的树都在累积。',5),
      S('14-4','But I\'m not here to lecture — I\'m here to offer hope.','But I\'m not here to lecture — I\'m here to offer hope.','但我不是来训导的——我是来传递希望的。',3),
      S('14-5','Small actions multiplied by millions create seismic change.','Small actions multiplied by millions create seismic change.','小小的行动乘以数百万就是巨大的改变。',3),
      S('14-6','The time for action is now. Join us.','The time for action is now. Join us.','行动的时刻就是现在。加入我们。',2),
    ]},

  { id:'15', title:'乔布斯斯坦福演讲片段', category:'speech', difficulty:'advanced', accent:'US', totalDuration:65, description:'Stay Hungry, Stay Foolish',
    sentences:[ S('15-1','Your time is limited, so don\'t waste it living someone else\'s life.','Your time is limited, so don\'t waste it living someone else\'s life.','你的时间有限，所以不要浪费在过别人的生活上。',4),
      S('15-2','Don\'t let the noise of others\' opinions drown out your own inner voice.','Don\'t let the noise of others\' opinions drown out your own inner voice.','不要让别人的意见淹没了你内心的声音。',5),
      S('15-3','You have to trust that the dots will somehow connect in your future.','You have to trust that the dots will somehow connect in your future.','你必须相信这些点会在未来以某种方式连接起来。',5),
      S('15-4','The only way to do great work is to love what you do.','The only way to do great work is to love what you do.','做伟大工作的唯一方法是热爱你所做的事。',3),
      S('15-5','Stay hungry. Stay foolish.','Stay hungry. Stay foolish.','求知若饥，虚心若愚。',2),
      S('15-6','I have looked in the mirror every morning and asked myself: if today were the last day of my life, would I want to do what I\'m about to do today?','I have looked in the mirror every morning and asked myself.','我每天早上都对着镜子问自己：如果今天是我生命的最后一天，我还想去做今天要做的事吗？',8),
    ]},

  { id:'16', title:'MLK I Have a Dream 片段', category:'speech', difficulty:'advanced', accent:'US', totalDuration:65, description:'马丁·路德·金经典演讲',
    sentences:[ S('16-1','I have a dream that one day this nation will rise up.','I have a dream that one day this nation will rise up.','我有一个梦想，有一天这个国家会站起来。',4),
      S('16-2','I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character.','I have a dream that my four little children will one day live in a nation.','我有一个梦想，我的四个小孩有一天会生活在一个不以肤色取人而以品格评判的国家。',8),
      S('16-3','Let freedom ring from every hill and every mountainside.','Let freedom ring from every hill and every mountainside.','让自由之声从每一座山丘和山坡上响起。',4),
      S('16-4','Free at last, free at last — thank God almighty, we are free at last.','Free at last, free at last — thank God almighty, we are free at last.','终于自由了，终于自由了——感谢全能的主，我们终于自由了。',5),
    ]},
  // ===== STORY (8 materials, ~80 sentences) =====
  { id:'17', title:'小故事：雨中的下午', category:'story', difficulty:'intermediate', accent:'UK', totalDuration:55, description:'英式发音短篇',
    sentences:[ S('17-1','It was a quiet afternoon in the small town.','It was a quiet af<u>ternoon</u> in the small town.','那是小镇上一个宁静的下午。',3),
      S('17-2','Rain was tapping gently against the window panes.','Rain was tapping gen<u>tly</u> against the window panes.','雨水轻轻敲打着窗玻璃。',4),
      S('17-3','She sat by the fireplace with a cup of tea.','She sat by the fire<u>place</u> with a cup of tea.','她坐在壁炉旁，手里拿着一杯茶。',4),
      S('17-4','A good book lay open on her lap.','A good book lay o<u>pen</u> on her lap.','一本好书摊开在她的膝上。',3),
      S('17-5','In that moment, everything felt just right.','In that moment, everything felt just right.','在那一刻，一切都恰到好处。',4),
    ]},

  { id:'18', title:'小故事：晨跑奇遇', category:'story', difficulty:'beginner', accent:'US', totalDuration:50, description:'美式发音生活故事',
    sentences:[ S('18-1','Every morning Jake would go for a run in the park near his apartment.','Every morning Jake would go for a run in the park near his apar<u>tment</u>.','每天早上Jake都会去公寓附近的公园跑步。',4),
      S('18-2','One day he noticed a small shivering puppy under a bench.','One day he noticed a small shivering puppy under a bench.','一天他注意到长椅下有一只瑟瑟发抖的小狗。',5),
      S('18-3','Without hesitation he wrapped the puppy in his jacket.','Without hesitation he wrapped the puppy in his jacket.','他毫不犹豫地用外套裹住了小狗。',3),
      S('18-4','That moment changed both of their lives forever.','That moment changed both of their lives forever.','那一刻永远改变了他们两个的生活。',3),
    ]},

  { id:'19', title:'小故事：迷路的旅人', category:'story', difficulty:'intermediate', accent:'UK', totalDuration:60, description:'旅人找路的故事',
    sentences:[ S('19-1','The traveler had been walking for hours through the dense forest.','The traveler had been walking for hours through the dense forest.','旅人已经在茂密的森林中走了好几个小时。',4),
      S('19-2','The sun was beginning to set, casting long shadows across the path.','The sun was beginning to set, casting long shadows across the path.','太阳开始下山，在小路上投下长长的影子。',4),
      S('19-3','Just as he was about to give up hope, he spotted a small cottage in the distance.','Just as he was about to give up hope, he spotted a small cottage in the distance.','正当他快要放弃希望时，他看到了远处的一座小屋。',5),
      S('19-4','An old woman opened the door and welcomed him with a warm smile.','An old woman opened the door and welcomed him with a warm smile.','一位老妇人开了门，用温暖的微笑迎接了他。',4),
      S('19-5','Sometimes the most unexpected detours lead us exactly where we need to be.','Sometimes the most unexpected detours lead us exactly where we need to be.','有时最意外的弯路恰好带我们去最该去的地方。',5),
    ]},

  { id:'20', title:'小故事：最后的信', category:'story', difficulty:'advanced', accent:'UK', totalDuration:70, description:'感人的家书故事',
    sentences:[ S('20-1','When Emma finally opened the dusty attic trunk she found a stack of yellowed letters.','When Emma finally opened the dusty attic trunk she found a stack of yellowed letters.','当Emma终于打开积满灰尘的阁楼箱子时她发现了一叠发黄的信件。',6),
      S('20-2','The handwriting was her grandmother\'s — elegant cursive from a bygone era.','The handwriting was her grandmother\'s — elegant cursive from a bygone era.','笔迹是她祖母的——来自一个远去的时代优雅的草书。',5),
      S('20-3','Each letter told a story of love, loss, and the quiet courage of everyday life.','Each letter told a story of love, loss, and the quiet courage of everyday life.','每封信都讲述了爱、失去和日常生活中静默的勇气的故事。',5),
      S('20-4','By the time she finished reading, tears were streaming down her cheeks.','By the time she finished reading, tears were streaming down her cheeks.','当她读完时泪水已顺着脸颊流下。',4),
      S('20-5','She realized these letters were not just words — they were her family\'s legacy.','She realized these letters were not just words — they were her family\'s legacy.','她意识到这些信不仅是文字——而是她家族的传承。',5),
      S('20-6','From that day on she started writing letters of her own.','From that day on she started writing letters of her own.','从那天起她开始写属于自己的信。',4),
    ]},

  { id:'21', title:'小故事：咖啡馆的初遇', category:'story', difficulty:'beginner', accent:'US', totalDuration:55, description:'温馨的邂逅',
    sentences:[ S('21-1','It was a busy Monday morning at the corner coffee shop.','It was a busy Monday morning at the corner coffee shop.','那是街角咖啡店一个忙碌的周一早晨。',3),
      S('21-2','He spilled his latte all over her laptop bag as he rushed to his seat.','He spilled his latte all over her laptop bag as he rushed to his seat.','他匆忙赶座时把拿铁洒在了她的电脑包上。',4),
      S('21-3','Instead of getting angry she just laughed and said accidents happen.','Instead of getting angry she just laughed and said accidents happen.','她没有生气而是笑着说意外总会发生。',4),
      S('21-4','He insisted on buying her a new coffee and they ended up talking for three hours.','He insisted on buying her a new coffee and they ended up talking for three hours.','他坚持要请她喝一杯新咖啡，结果他们聊了三个小时。',5),
      S('21-5','Three years later they came back to the same coffee shop for their wedding photos.','Three years later they came back to the same coffee shop for their wedding photos.','三年后他们回到同一家咖啡店拍结婚照。',4),
    ]},

  { id:'22', title:'小故事：深夜的钢琴', category:'story', difficulty:'intermediate', accent:'US', totalDuration:60, description:'音乐和回忆',
    sentences:[ S('22-1','Every night at exactly midnight the old piano would play by itself.','Every night at exactly midnight the old piano would play by itself.','每晚正午夜那架旧钢琴会自己弹奏起来。',4),
      S('22-2','The new tenant was terrified at first — was the apartment haunted?','The new tenant was terrified at first — was the apartment haunted?','新房客起初吓坏了——这公寓闹鬼吗？',4),
      S('22-3','She later discovered it was her neighbor practicing scales for a concert.','She later discovered it was her neighbor practicing scales for a concert.','她后来发现是邻居在为演奏会练习音阶。',4),
      S('22-4','She knocked on his door and asked if he could play something happier.','She knocked on his door and asked if he could play something happier.','她去敲了他的门问他能不能弹点更欢快的。',4),
      S('22-5','He smiled and played the most beautiful waltz she had ever heard.','He smiled and played the most beautiful waltz she had ever heard.','他微笑着弹了一首她听过的最美的华尔兹。',4),
      S('22-6','From that night on, midnight became their concert hour.','From that night on, midnight became their concert hour.','从那一夜起午夜成了他们的演奏会时间。',3),
    ]},

  { id:'23', title:'小故事：花园的秘密', category:'story', difficulty:'intermediate', accent:'UK', totalDuration:65, description:'关于自然和治愈',
    sentences:[ S('23-1','After her mother passed away Clara stopped going outside.','After her mother passed away Clara stopped going outside.','母亲去世后Clara不再出门。',3),
      S('23-2','The garden her mother had lovingly tended for years began to wither.','The garden her mother had lovingly tended for years began to wither.','母亲多年精心打理的花园开始凋零。',4),
      S('23-3','One spring morning a tiny sunflower pushed through the weeds.','One spring morning a tiny sunflower pushed through the weeds.','一个春天的早晨一株小小的向日葵从杂草中冒了出来。',4),
      S('23-4','Clara saw it from her window and felt something stir inside her heart.','Clara saw it from her window and felt something stir inside her heart.','Clara从窗户看到了，心中有什么被触动了。',4),
      S('23-5','She went outside for the first time in months and pulled out the weeds around it.','She went outside for the first time in months and pulled out the weeds around it.','她几个月来第一次走出门，拔掉了它周围的杂草。',5),
      S('23-6','By summer the garden was blooming again and so was Clara.','By summer the garden was blooming again and so was Clara.','到夏天花园再次盛开，Clara也重新绽放了。',4),
    ]},

  { id:'24', title:'小故事：最后一班地铁', category:'story', difficulty:'beginner', accent:'US', totalDuration:55, description:'城市夜归人的故事',
    sentences:[ S('24-1','David checked his watch and realized he had five minutes to catch the last train.','David checked his watch and realized he had five minutes to catch the last train.','David看了看表，意识到还有五分钟赶末班车。',4),
      S('24-2','He sprinted through the empty station dodging the turnstile and leaping down the stairs.','He sprinted through the empty station dodging the turnstile and leaping down the stairs.','他飞奔穿过空荡荡的车站，绕过闸机，跳下楼梯。',5),
      S('24-3','The doors were closing just as he squeezed through with seconds to spare.','The doors were closing just as he squeezed through with seconds to spare.','门正要关上，他刚好在最后几秒挤了进去。',4),
      S('24-4','As the train pulled away he looked out the window and saw the city lights flickering in the darkness.','As the train pulled away he looked out the window and saw the city lights.','列车开动时他望向窗外看到城市灯火在黑暗中闪烁。',5),
      S('24-5','Sometimes missing your train is the worst — and catching it is the best feeling in the world.','Sometimes missing your train is the worst — and catching it is the best feeling.','有时候错过末班车是最糟的——而赶上它则是世上最美妙的感觉。',5),
    ]},
  // ═══════════ 25-100: EXTENDED MATERIALS ═══════════
  { id:'25',title:'超市购物对话',category:'daily',difficulty:'beginner',accent:'US',totalDuration:40,description:'日常购物场景',
    sentences:[ S('25-1','Excuse me, where can I find the pasta?','Excuse me, where can I find the pasta?','请问意大利面在哪里？',2),
      S('25-2','It\'s in aisle seven, next to the canned tomatoes.','It\'s in aisle seven, next to the canned tomatoes.','在第七排货架，番茄罐头旁边。',3),
      S('25-3','Do you have any organic options?','Do you have any organic options?','有有机的吗？',2),
      S('25-4','Yes, the organic section is at the back of the store.','Yes, the organic section is at the back of the store.','有的，有机食品区在商店后面。',3),
      S('25-5','Thanks, and where do I pay?','Thanks, and where do I pay?','谢谢，在哪里付款？',2),
      S('25-6','The checkouts are right up front. Have a nice day!','The checkouts are right up front. Have a nice day!','收银台就在前面。祝您愉快！',3),
    ]},

  { id:'26',title:'美发店剪发对话',category:'daily',difficulty:'beginner',accent:'US',totalDuration:45,description:'理发店剪发场景',
    sentences:[ S('26-1','Hi, I\'d like to get a haircut. Do I need an appointment?','Hi, I\'d like to get a haircut. Do I need an appointment?','你好我想理发，需要预约吗？',3),
      S('26-2','Walk-ins are welcome. How would you like it cut?','Walk-ins are welcome. How would you like it cut?','不用预约。您想怎么剪？',3),
      S('26-3','Just a trim — about an inch off the ends, please.','Just a trim — about an inch off the ends, please.','修一下就好——剪短大约一英寸。',3),
      S('26-4','Would you like me to thin it out a bit as well?','Would you like me to thin it out a bit as well?','需要稍微打薄一点吗？',3),
      S('26-5','Sure, that would be great. How much do I owe you?','Sure, that would be great. How much do I owe you?','好的，太好了。多少钱？',3),
      S('26-6','That will be twenty-five dollars. Cash or card?','That will be twenty-five dollars. Cash or card?','25美元。现金还是刷卡？',3),
    ]},

  { id:'27',title:'健身房咨询对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:50,description:'健身房咨询和报名',
    sentences:[ S('27-1','Hi, I\'m interested in a membership. Can you tell me about your options?','Hi, I\'m interested in a membership. Can you tell me about your options?','你好我想办会员，能介绍一下吗？',3),
      S('27-2','We have monthly and annual plans. The annual plan saves you twenty percent.','We have monthly and annual plans. The annual plan saves you twenty percent.','有月卡和年卡。年卡省20%。',4),
      S('27-3','What about personal training sessions?','What about personal training sessions?','私教课呢？',2),
      S('27-4','Personal training is available at an additional cost. Would you like a tour of the facility?','Personal training is available at an additional cost.','私教课需额外付费。想参观一下设施吗？',4),
      S('27-5','That\'d be great. I\'d love to see the weight room and the pool area.','That\'d be great. I\'d love to see the weight room.','太好了，我想看看力量区和游泳池。',4),
    ]},

  { id:'28',title:'宠物医院对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:50,description:'带宠物看兽医',
    sentences:[ S('28-1','Hi, my dog has been limping since yesterday — I\'m a bit worried.','Hi, my dog has been limping since yesterday.','你好，我的狗从昨天起就瘸了——有点担心。',3),
      S('28-2','Let\'s take a look. When did you first notice it?','Let\'s take a look. When did you first notice it?','来检查一下。什么时候开始注意到的？',3),
      S('28-3','Yesterday afternoon after our walk in the park. He won\'t put weight on his back leg.','Yesterday afternoon after our walk in the park.','昨天下午去公园散步后。后腿不敢着地。',4),
      S('28-4','It might be a sprain. We\'ll take an X-ray to rule out anything serious.','It might be a sprain. We\'ll take an X-ray.','可能是扭伤。拍个X光排除严重问题。',4),
      S('28-5','Is there anything I should do at home in the meantime?','Is there anything I should do at home in the meantime?','回家后有什么需要注意的吗？',3),
      S('28-6','Keep him rested and avoid stairs. We\'ll call you with the results.','Keep him rested and avoid stairs.','让他多休息不要爬楼梯。出结果了我们通知您。',4),
    ]},

  { id:'29',title:'机场值机对话',category:'daily',difficulty:'beginner',accent:'US',totalDuration:50,description:'机场办理登机手续',
    sentences:[ S('29-1','Good morning. May I see your passport and booking reference, please?','Good morning. May I see your passport and booking reference?','早上好。请出示您的护照和预订信息。',3),
      S('29-2','Here you go. I\'m flying to London this afternoon.','Here you go. I\'m flying to London this afternoon.','给您。我下午飞伦敦。',3),
      S('29-3','Would you like a window seat or an aisle seat?','Would you like a window seat or an aisle seat?','您要靠窗还是靠过道的座位？',3),
      S('29-4','Window seat, please. And do you have any luggage to check in?','Window seat please. Any luggage to check in?','靠窗的吧。托运行李？',2),
      S('29-5','Just this one suitcase. It\'s within the weight limit, right?','Just this one suitcase. It\'s within the weight limit right?','就这一个行李箱，没超重吧？',3),
      S('29-6','Yes, you\'re all good. Here\'s your boarding pass — gate B12, boarding at 2pm.','All good. Here\'s your boarding pass — gate B12 boards at 2pm.','没问题。这是您的登机牌——B12登机口，下午2点登机。',4),
    ]},

  { id:'30',title:'求职面试场景',category:'daily',difficulty:'advanced',accent:'US',totalDuration:60,description:'模拟一次完整的求职面试对话', sentences:[
    S('30-1','Thanks for coming in today. Tell me a bit about yourself.','Thanks for coming in today. Tell me about yourself.','感谢你来面试。简单介绍一下你自己吧。',3),
    S('30-2','I graduated with a degree in computer science and have been working in web development for the past three years.','I graduated in CS and worked in web dev for three years.','我计算机专业毕业，过去三年一直在做网页开发。',5),
    S('30-3','What made you interested in this position at our company?','What made you interested in this position?','为什么对我们公司这个职位感兴趣？',3),
    S('30-4','I\'ve been following your work in AI-driven analytics and would love to be part of that innovation.','I follow your AI work and want to be part of it.','我一直在关注你们在AI分析领域的创新，非常希望成为其中的一分子。',5),
    S('30-5','Where do you see yourself in five years?','Where do you see yourself in five years?','你五年内的事业目标是什么？',3),
    S('30-6','I hope to lead a product team and contribute to meaningful technological change.','Lead a product team and contribute to meaningful tech change.','我希望能带领一个产品团队，为有意义的技术变革做出贡献。',4),
    S('30-7','Do you have any questions for us?','Do you have any questions for us?','你有什么想问我们的吗？',2),
    S('30-8','What does success look like for someone in this role within the first six months?','What does success look like in this role in six months?','前六个月做到什么程度算是胜任这个岗位？',4),
  ]},

  { id:'31',title:'朋友聚会晚餐聊天',category:'daily',difficulty:'beginner',accent:'UK',totalDuration:50,description:'朋友之间聚餐闲聊', sentences:[
    S('31-1','This place is lovely — how did you find it?','This place is lovely — how did you find it?','这地方真不错——你怎么找到的？',2),
    S('31-2','A colleague recommended it. Their pasta is supposed to be amazing.','A colleague recommended it — their pasta is amazing.','同事推荐的。听说意面超赞。',3),
    S('31-3','I\'m definitely getting the carbonara. What about you?','I\'m getting the carbonara. What about you?','我肯定要培根蛋面。你呢？',2),
    S('31-4','I\'m torn between the seafood risotto and the steak. Any recommendations?','Torn between seafood risotto and steak.','我在海鲜烩饭和牛排之间犹豫——有推荐吗？',3),
    S('31-5','The risotto here is to die for — I\'d go with that.','The risotto is to die for — go with that.','这里的烩饭好吃极了——选它没错。',3),
    S('31-6','How\'s the new job treating you?','How\'s the new job treating you?','新工作怎么样？',2),
    S('31-7','Honestly, it\'s been a steep learning curve but I\'m really enjoying it.','Steep learning curve but really enjoying it.','说实话，上手有挑战但真的很喜欢。',3),
  ]},

  { id:'32',title:'二手车买卖对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:55,description:'买车场景', sentences:[
    S('32-1','Hi, I\'m interested in the blue sedan you have for sale. Is it still available?','Hi, interested in the blue sedan. Still available?','你好，我对那辆蓝色轿车感兴趣。还在卖吗？',3),
    S('32-2','Yes it is! Would you like to come take it for a test drive?','Yes! Want to come for a test drive?','是的还在！想来试驾一下吗？',3),
    S('32-3','How many miles does it have on it? And has it been in any accidents?','How many miles? Any accidents?','跑了多少英里？出过事故吗？',2),
    S('32-4','It\'s got 45,000 miles and a clean history. One owner, regularly maintained.','45k miles, clean history, one owner, regularly maintained.','4.5万英里，无事故，一任车主，定期保养。',4),
    S('32-5','Is the price negotiable at all? I was thinking more along the lines of twelve thousand.','Is the price negotiable? I was thinking twelve thousand.','价钱能商量吗？我在想一万二左右。',3),
    S('32-6','I can come down to twelve-five, but that\'s really my bottom line.','Twelve-five is my bottom line.','我能降到一万二千五，这真是底价了。',3),
  ]},

  { id:'33',title:'快递寄件对话',category:'daily',difficulty:'beginner',accent:'US',totalDuration:40,description:'寄快递场景', sentences:[
    S('33-1','Hi, I need to send this package to Shanghai. What are my options?','Hi, I need to send this to Shanghai. What are my options?','你好我要寄这个包裹到上海。有什么选择？',3),
    S('33-2','You can do standard shipping — 7 to 10 business days — or express which takes 3 to 5 days.','Standard 7-10 days or express 3-5 days.','标准快递7-10工作日，加急3-5天。',4),
    S('33-3','How much is the express option?','How much is express?','加急多少钱？',2),
    S('33-4','Let me weigh it... that\'ll be $35 for express delivery.','Weighing... $35 for express.','称一下...加急35美元。',3),
    S('33-5','I\'ll go with express. Can I get a tracking number?','I\'ll go express. Tracking number?','加急吧。有物流单号吗？',2),
    S('33-6','Absolutely — here\'s your receipt with the tracking number on top.','Here\'s your receipt with tracking on top.','当然——这是收据，物流单号在顶部。',3),
  ]},

  { id:'34',title:'图书馆借书对话',category:'daily',difficulty:'beginner',accent:'UK',totalDuration:45,description:'在图书馆借书', sentences:[
    S('34-1','Hi, I\'d like to borrow these three books, please.','Hi, I\'d like to borrow these three books.','你好我想借这三本书。',2),
    S('34-2','Do you have your library card with you?','Do you have your library card?','带借书卡了吗？',2),
    S('34-3','Yes, here it is. How long can I keep them for?','Here it is. How long can I keep them?','带了。能借多久？',2),
    S('34-4','Three weeks. You can renew them online if nobody else has reserved them.','Three weeks. Renew online if not reserved.','三周。如果没人预约可以网上续借。',3),
    S('34-5','Great — and are there any late fees if I forget to bring them back?','Are there late fees?','好的——过期了有罚款吗？',2),
    S('34-6','Twenty pence per book per day. But we\'ll send you a reminder email first.','20p per book per day. We\'ll email a reminder.','每本书每天20便士。不过我们会先发提醒邮件。',4),
  ]},

  { id:'35',title:'电话套餐咨询',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:50,description:'咨询手机套餐', sentences:[
    S('35-1','Hi, my contract is ending next month and I\'m looking for a better deal.','My contract ends next month — looking for a better deal.','你好我合约下月到期，想找更好的套餐。',3),
    S('35-2','How much data do you typically use per month?','How much data do you use per month?','你每月大概用多少流量？',2),
    S('35-3','Around 20 gigabytes — mostly streaming and social media.','About 20GB — mostly streaming and social media.','大约20G——主要是视频和社交媒体。',3),
    S('35-4','Our unlimited data plan might suit you — it\'s $45 per month with no hidden fees.','Unlimited plan — $45/month no hidden fees.','我们的无限流量套餐可能适合你——每月45美元无隐藏费用。',4),
    S('35-5','Does that include international calling? My family lives overseas.','Does that include international calling?','包含国际通话吗？我家人在国外。',3),
    S('35-6','International calls are an extra $5 per month. Shall I set you up?','Extra $5/month for international. Shall I set you up?','国际通话额外每月5美元。要帮你办吗？',3),
  ]},

  { id:'36',title:'酒店入住对话',category:'daily',difficulty:'beginner',accent:'UK',totalDuration:50,description:'酒店前台办理入住', sentences:[
    S('36-1','Good evening. I have a reservation under the name Chen.','Good evening. Reservation under Chen.','晚上好，我有预订，名字是陈。',2),
    S('36-2','Let me look that up... Yes, a double room for three nights, is that correct?','Let me look... double room three nights, correct?','我查一下...是的双人房三晚，对吗？',3),
    S('36-3','That\'s right. Is breakfast included in the rate?','That\'s right. Breakfast included?','对的。含早餐吗？',2),
    S('36-4','Yes, breakfast is served from 7 to 10am in the dining room on the ground floor.','Yes, breakfast 7-10am ground floor dining room.','含，早餐7到10点在一楼餐厅。',4),
    S('36-5','Wonderful. What time is checkout?','Wonderful. What time is checkout?','太好了。退房时间是？',2),
    S('36-6','Checkout is at 11am. Here are your key cards — room 508 on the fifth floor.','Checkout 11am. Key cards — room 508 fifth floor.','退房11点。这是您的房卡——五楼508房。',4),
  ]},

  { id:'37',title:'修理电脑对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:55,description:'电脑维修场景', sentences:[
    S('37-1','My laptop keeps freezing and the screen goes black randomly.','My laptop keeps freezing — screen goes black randomly.','我的笔记本老是死机，屏幕会突然黑掉。',3),
    S('37-2','How long has this been happening?','How long has this been happening?','出现这种情况多久了？',2),
    S('37-3','About a week. I\'ve tried restarting but it doesn\'t help.','About a week. Restarting doesn\'t help.','大概一周了。重启也没用。',2),
    S('37-4','Could be a failing hard drive. We\'ll run a diagnostic — might take an hour.','Could be a failing hard drive. We\'ll run diagnostics.','可能是硬盘故障。我们做个诊断检查——大概需要一小时。',4),
    S('37-5','Will I lose any data if the hard drive needs replacing?','Will I lose data if the hard drive needs replacing?','如果要换硬盘数据会丢吗？',3),
    S('37-6','We\'ll do our best to back up your files first. No guarantees but usually successful.','We\'ll try to back up first — usually successful.','我们会尽量先备份文件。不能100%保证但通常能成功。',4),
  ]},

  { id:'38',title:'打出租车对话',category:'daily',difficulty:'beginner',accent:'UK',totalDuration:35,description:'乘坐出租车场景', sentences:[
    S('38-1','Taxi! To the train station, please.','Taxi! To the train station please.','出租车！去火车站。',2),
    S('38-2','Sure thing. Which station — King\'s Cross or Paddington?','Which station — King\'s Cross or Paddington?','好的。哪个站——国王十字还是帕丁顿？',3),
    S('38-3','King\'s Cross. How long will it take at this time of day?','King\'s Cross. How long at this time?','国王十字。这个点大概多久？',3),
    S('38-4','About twenty minutes, traffic permitting.','About twenty minutes, traffic permitting.','大概二十分钟，看路况。',2),
    S('38-5','Can you drop me right at the main entrance?','Drop me at the main entrance?','能在正门口下吗？',2),
    S('38-6','Absolutely. That\'ll be fifteen pounds fifty. Keep the change.','That\'ll be 15.50. Keep the change.','没问题。15.5英镑。不用找了。',3),
  ]},

  { id:'39',title:'申请签证对话',category:'daily',difficulty:'advanced',accent:'UK',totalDuration:60,description:'签证面试', sentences:[
    S('39-1','Good morning. What is the purpose of your visit to the United Kingdom?','Good morning. Purpose of your visit to the UK?','早上好。您来英国的目的是什么？',3),
    S('39-2','I\'m attending a two-week training program at the London School of Economics.','Attending a two-week training at LSE.','我参加伦敦政经学院的一个两周培训项目。',4),
    S('39-3','Do you have a letter of invitation from the institution?','Do you have an invitation letter from the institution?','有机构的邀请函吗？',3),
    S('39-4','Yes, here it is along with my enrollment confirmation and accommodation details.','Here — with enrollment confirmation and accommodation.','有，这是邀请函还有注册确认和住宿信息。',4),
    S('39-5','How will you fund your stay during the two weeks?','How will you fund your stay?','你如何负担这两周的开销？',2),
    S('39-6','I have sufficient savings and my company is covering the training fees. Here are my bank statements.','My savings plus company covers fees. Here are bank statements.','我有足够存款，公司也负担培训费。这是我的银行流水。',5),
    S('39-7','Your application looks in order. You\'ll receive your visa within five working days.','Your application looks fine. Visa within five working days.','您的申请看起来没问题。五个工作日内会收到签证。',4),
  ]},

  { id:'40',title:'买药咨询对话',category:'daily',difficulty:'beginner',accent:'US',totalDuration:40,description:'药店买药', sentences:[
    S('40-1','Hi, I have a sore throat and a runny nose. What would you recommend?','Hi, sore throat and runny nose — what do you recommend?','你好我喉咙痛流鼻涕。有什么推荐吗？',3),
    S('40-2','You might try these lozenges for your throat and a decongestant for the congestion.','Try these lozenges and a decongestant.','可以试试这些润喉糖和去充血药。',3),
    S('40-3','How often should I take the decongestant?','How often should I take the decongestant?','去充血药多久吃一次？',2),
    S('40-4','Take one tablet every six hours. Don\'t exceed four tablets in 24 hours.','One tablet every six hours. Max four in 24 hours.','每六小时一片。24小时内不要超过四片。',3),
    S('40-5','Is it safe to take on an empty stomach?','Safe on an empty stomach?','空腹能吃吗？',2),
    S('40-6','I\'d recommend taking it with food to avoid stomach upset.','Take with food to avoid stomach upset.','建议随餐服用来避免胃不舒服。',3),
  ]},

  { id:'41',title:'租房报修对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:50,description:'向房东报修', sentences:[
    S('41-1','Hi, the heating in my apartment isn\'t working properly. It\'s freezing in here.','The heating isn\'t working — it\'s freezing.','你好我公寓的暖气坏了——冷死了。',3),
    S('41-2','I\'m sorry to hear that. When did it stop working?','Sorry to hear. When did it stop?','不好意思。什么时候坏的？',3),
    S('41-3','Just this morning. I tried adjusting the thermostat but nothing happens.','This morning. Tried the thermostat — nothing.','今早。调了恒温器但没反应。',3),
    S('41-4','I\'ll send a technician over this afternoon. Will you be home around 3pm?','I\'ll send a technician this afternoon. Home at 3pm?','我下午派个维修工过去。你3点左右在家吗？',4),
    S('41-5','Yes, I\'ll be here. Is there an emergency number if it happens again at night?','I\'ll be here. Emergency number for night?','在的。有没有晚上的紧急联系电话？',3),
    S('41-6','I\'ll text you the 24-hour maintenance hotline. They usually respond within an hour.','I\'ll text the 24-hour hotline — respond within an hour.','我把24小时维修热线短信发你——通常一小时内回复。',4),
  ]},

  { id:'42',title:'接送孩子上学对话',category:'daily',difficulty:'beginner',accent:'US',totalDuration:40,description:'接孩子放学日常', sentences:[
    S('42-1','Hi sweetie, how was school today?','Hi sweetie, how was school?','宝贝今天在学校怎么样？',2),
    S('42-2','It was great! We learned about dinosaurs and made a volcano in science class.','Great! Learned about dinosaurs and made a volcano.','太好了！我们学了恐龙还在科学课做了火山。',4),
    S('42-3','That sounds amazing! Do you have any homework?','Sounds amazing! Any homework?','听起来很棒！有作业吗？',2),
    S('42-4','Just a little — I need to read two chapters and write three sentences about each.','Just a little — two chapters and three sentences each.','一点点——读两章每章写三句话。',3),
    S('42-5','Let\'s get started on that after a snack, okay?','Let\'s start after a snack, okay?','吃点零食我们就开始，好吗？',3),
  ]},

  { id:'43',title:'讨论周末计划',category:'daily',difficulty:'beginner',accent:'US',totalDuration:40,description:'朋友讨论周末安排', sentences:[
    S('43-1','Any plans for the weekend?','Any plans for the weekend?','周末有什么计划吗？',2),
    S('43-2','Thinking about going hiking if the weather holds up. Want to join?','Thinking about hiking if weather holds. Want to join?','天气好的话想去爬山。一起吗？',3),
    S('43-3','That sounds fun! Where were you thinking of going?','Sounds fun! Where?','有趣！打算去哪？',2),
    S('43-4','There\'s a trail up north about an hour\'s drive — supposed to have amazing views.','Trail up north — hour drive — amazing views apparently.','北边有一条步道，开车大概一小时——据说景色超棒。',4),
    S('43-5','Count me in! What time should we head out?','Count me in! What time?','算我一个！几点出发？',2),
    S('43-6','Let\'s aim for 7am to beat the crowds. I\'ll drive.','Aim for 7am to beat crowds. I\'ll drive.','争取7点出发避开人群。我开车。',3),
  ]},

  { id:'44',title:'社区志愿者活动',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:50,description:'参加社区志愿服务', sentences:[
    S('44-1','Thanks for volunteering today. We\'re going to be cleaning up the riverbank.','Thanks for volunteering. We\'ll be cleaning up the riverbank.','感谢今天来做志愿者。我们要清理河岸。',4),
    S('44-2','What supplies do we need? Gloves and trash bags?','What supplies? Gloves and trash bags?','需要什么工具？手套和垃圾袋？',2),
    S('44-3','Everything is provided. Just grab a vest and a pair of gloves from the table over there.','Everything provided. Grab a vest and gloves from that table.','都准备了。去那边桌子拿一件背心和一副手套就行。',4),
    S('44-4','How long will we be working today?','How long will we be working?','今天要干多久？',2),
    S('44-5','About three hours, but there\'s no pressure — take breaks whenever you need.','About three hours — take breaks whenever needed.','大概三小时，但不用有压力——随时可以休息。',3),
    S('44-6','It feels good to give back to the community, doesn\'t it?','Feels good to give back, doesn\'t it?','回馈社区的感觉真好，是不是？',3),
  ]},

  { id:'45',title:'讨论搬家计划',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:50,description:'和朋友讨论搬家', sentences:[
    S('45-1','I found a new apartment! Moving in at the end of the month.','Found a new apartment! Moving end of month.','我找到新公寓了！月底搬。',3),
    S('45-2','That\'s exciting! Where is it?','Exciting! Where?','太好了！在哪？',2),
    S('45-3','Closer to downtown — only a ten-minute walk from the office.','Closer to downtown — ten-minute walk from office.','靠近市中心——步行到公司只要十分钟。',3),
    S('45-4','Do you need help with the move? I have a truck and I\'m free that weekend.','Need help moving? I have a truck and free that weekend.','需要帮忙搬家吗？我有辆皮卡周末有空。',4),
    S('45-5','That would be incredible! I\'ll order pizza and drinks for everyone who helps out.','Incredible! Pizza and drinks for helpers.','那太好了！我给帮忙的大家订披萨和饮料。',3),
    S('45-6','Sounds like a plan. Just send me the details closer to the date.','Sounds like a plan. Send details closer to the date.','就这么定了。快到日子了给我详情。',3),
  ]},

  { id:'46',title:'运动后拉伸放松',category:'daily',difficulty:'beginner',accent:'US',totalDuration:35,description:'运动后的放松拉伸对话', sentences:[
    S('46-1','Good workout today! Don\'t forget to stretch before you leave.','Good workout! Don\'t forget to stretch.','今天练得不错！走之前别忘了拉伸。',3),
    S('46-2','How long should I hold each stretch for?','How long hold each stretch?','每个拉伸动作要保持多久？',2),
    S('46-3','At least thirty seconds. Don\'t bounce — just hold steady and breathe.','At least thirty seconds. No bouncing — hold steady and breathe.','至少30秒。不要弹——稳住然后深呼吸。',4),
    S('46-4','My hamstrings are so tight. Any specific stretches you recommend?','Hamstrings so tight. Any specific stretches?','我的腿筋好紧。有什么特别的拉伸推荐吗？',3),
    S('46-5','Try touching your toes while keeping your legs straight. Go slowly though.','Try touching toes with straight legs. Go slowly.','试试保持腿伸直去碰脚尖。不过要慢慢来。',3),
  ]},

  { id:'47',title:'环保TED演讲片段',category:'speech',difficulty:'advanced',accent:'US',totalDuration:50,description:'海洋保护主题', sentences:[
    S('47-1','Every minute the equivalent of a garbage truck full of plastic is dumped into our oceans.','Every minute a garbage truck of plastic is dumped into the ocean.','每分钟就有一卡车的塑料垃圾被倒入我们的海洋。',5),
    S('47-2','By 2050 there will be more plastic in the ocean than fish by weight.','By 2050 more plastic than fish in the ocean by weight.','到2050年海洋中的塑料将比鱼类还要多。',4),
    S('47-3','But this is not a problem without a solution. We have the technology.','Not a problem without solution. We have the technology.','但这并非无解之题。我们已有相应技术。',3),
    S('47-4','What we lack is not innovation but political will and collective action.','What we lack is not innovation but will and collective action.','我们缺乏的不是创新而是政治意愿和集体行动。',4),
    S('47-5','The choice is ours — and the time to act is now.','The choice is ours — time to act is now.','选择权在我们手中——行动的时刻就是现在。',3),
  ]},

  { id:'48',title:'创新主题演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'硅谷创业者的创新演讲', sentences:[
    S('48-1','Innovation does not happen in a vacuum. It happens when diverse minds collide.','Innovation doesn\'t happen in a vacuum. It happens when diverse minds collide.','创新不是在真空中发生的。它发生在多元思想碰撞时。',4),
    S('48-2','The best ideas often come from the most unexpected places.','The best ideas come from the most unexpected places.','最好的想法往往来自最意想不到的地方。',3),
    S('48-3','Don\'t be afraid to fail. Be afraid of failing to learn from your failures.','Don\'t be afraid to fail — be afraid of not learning from it.','不要害怕失败。要害怕没从失败中学到东西。',4),
    S('48-4','The companies that will thrive are those that embrace change, not resist it.','Companies that thrive embrace change, not resist it.','未来繁荣的企业是那些拥抱变化而非抗拒变化的企业。',4),
    S('48-5','So ask yourself — what are you doing today that scares you a little?','What are you doing today that scares you a little?','问自己——今天你在做什么让你有点害怕的事？',3),
  ]},

  { id:'49',title:'诺贝尔获奖感言',category:'speech',difficulty:'advanced',accent:'UK',totalDuration:60,description:'科学家获奖感言', sentences:[
    S('49-1','I stand here today not on my own shoulders but on the shoulders of countless mentors and colleagues.','I stand on the shoulders of countless mentors and colleagues.','我今天站在这里不是靠自己的肩膀而是靠无数导师和同事的肩膀。',5),
    S('49-2','Science is a collaborative endeavor that transcends borders and generations.','Science is collaborative — transcends borders and generations.','科学是一项超越国界和代际的协作事业。',3),
    S('49-3','The discoveries we celebrate today were decades in the making.','The discoveries we celebrate were decades in the making.','我们今天庆祝的这些发现是几十年的结晶。',3),
    S('49-4','To young scientists watching — stay curious, stay persistent, and never underestimate your potential.','Young scientists — stay curious, persistent, never underestimate yourself.','给年轻的科学家们——保持好奇、坚持不懈、永远不要低估自己的潜力。',5),
    S('49-5','The greatest gift of science is not the answers it provides but the questions it inspires.','Greatest gift of science — not answers but the questions it inspires.','科学最伟大的礼物不是它提供的答案而是它激发的问题。',4),
  ]},

  { id:'50',title:'电影获奖感言',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'演员奥斯卡获奖感言', sentences:[
    S('50-1','Wow. I really wasn\'t expecting this. Thank you to the Academy.','Wow. Wasn\'t expecting this. Thank you Academy.','哇我真的没想到。感谢学院。',3),
    S('50-2','This role changed my life in ways I can\'t even put into words.','This role changed my life beyond words.','这个角色以我无法用言语表达的方式改变了我的人生。',3),
    S('50-3','To everyone who believed in this project when nobody else did — this is for you.','To everyone who believed when nobody else did — this is for you.','给所有在没人相信时支持这个项目的人——这个奖是你们的。',5),
    S('50-4','Mom, Dad — everything I am is because of you. Thank you for never giving up on me.','Mom, Dad — everything I am is because of you.','爸爸妈妈——我的一切都归功于你们。谢谢你们从未放弃我。',5),
    S('50-5','To anyone out there chasing a dream — keep going. If I can do it, so can you.','To anyone chasing a dream — keep going. If I can, you can.','给所有追梦的人——继续努力。如果我做得到，你们也可以。',4),
  ]},

  { id:'51',title:'女性领导力演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'女性赋权主题演讲', sentences:[
    S('51-1','Leadership is not about being in charge. It is about taking care of those in your charge.','Leadership is not about being in charge — it\'s about taking care of those in your charge.','领导力不是管别人。而是照顾你管的人。',5),
    S('51-2','We need more women at the table — not just for equality but because diverse leadership makes better decisions.','We need more women at the table — diverse leadership makes better decisions.','我们需要更多女性参与决策——不只是为了平等更因为多元领导力做出更好的决策。',6),
    S('51-3','Don\'t wait for permission to lead. The world needs your voice right now.','Don\'t wait for permission. The world needs your voice now.','不要等别人允许你领导。世界现在就迫切需要你的声音。',4),
    S('51-4','Every time you speak up, you make it easier for the next woman to do the same.','Every time you speak up, you make it easier for the next woman.','每一次你勇敢发声都在为下一位女性铺平道路。',4),
  ]},

  { id:'52',title:'幸福研究所Ted演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'哈佛幸福研究', sentences:[
    S('52-1','What if I told you that the key to a happy life has been hiding in plain sight for over eighty years?','What if the key to happiness has been hiding in plain sight for eighty years?','如果我告诉你幸福生活的关键已经隐藏了80多年呢？',5),
    S('52-2','The Harvard Study of Adult Development has tracked the lives of over seven hundred men for nearly a century.','Harvard study tracked 700+ men for nearly a century.','哈佛成人发展研究跟踪了700多人近一个世纪。',5),
    S('52-3','The clearest message is this: good relationships keep us happier and healthier. Period.','The message: good relationships keep us happier and healthier. Period.','最清晰的结论就是：良好的人际关系让我们更幸福更健康。句号。',5),
    S('52-4','It\'s not about the number of friends. It\'s about the quality of your close relationships.','Not the number of friends — quality of close relationships.','不在于朋友多少。而在于亲密关系的质量。',4),
    S('52-5','Loneliness kills. It is as powerful as smoking or alcoholism.','Loneliness kills — as powerful as smoking or alcoholism.','孤独会致命。它的危害不亚于吸烟或酗酒。',4),
  ]},

  { id:'53',title:'气候变化演讲',category:'speech',difficulty:'advanced',accent:'UK',totalDuration:60,description:'联合国气候峰会演讲', sentences:[
    S('53-1','We are the first generation to feel the impact of climate change and the last generation that can do something about it.','First generation to feel climate change — last that can do something.','我们是第一代感受到气候变化影响也是最后一代还能为此做些什么的人。',6),
    S('53-2','The science is clear. The economics are clear. What we lack is not solutions — it is urgency.','Science is clear. Economics are clear. We lack urgency not solutions.','科学是明确的。经济账也是明确的。我们缺的不是方案——而是紧迫感。',5),
    S('53-3','Every fraction of a degree matters. Every year matters. Every choice matters.','Every fraction of a degree matters. Every year matters. Every choice matters.','每一度的零头都很重要。每一年都很重要。每一个选择都很重要。',4),
    S('53-4','We owe it to our children and our grandchildren to act boldly and act now.','We owe it to our children to act boldly and now.','为了我们的子孙后代我们有责任大胆行动立刻行动。',4),
  ]},

  { id:'54',title:'关于勇气的演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:45,description:'勇气与脆弱主题', sentences:[
    S('54-1','Courage is not the absence of fear. Courage is feeling the fear and doing it anyway.','Courage is not absence of fear — it\'s doing it anyway.','勇气不是没有恐惧。勇气是感受到恐惧但依然去做。',4),
    S('54-2','The most courageous thing you can do is show up and be seen when you have no control over the outcome.','Most courageous — show up and be seen with no control over outcome.','最有勇气的事就是在无法掌控结果时依然站出来被看见。',5),
    S('54-3','Vulnerability is not weakness. It is our most accurate measure of courage.','Vulnerability is not weakness — it\'s our most accurate measure of courage.','脆弱不是软弱。它是衡量勇气最准确的标尺。',4),
    S('54-4','Dare greatly. You will fail sometimes — that is part of the deal. But you will also rise.','Dare greatly. You\'ll fail sometimes — but you\'ll also rise.','大胆去闯。你有时会失败——这是必然的。但你也一定会站起来。',5),
  ]},

  { id:'55',title:'教育改变命运演讲',category:'speech',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'教育公平主题', sentences:[
    S('55-1','Education is not a privilege. It is a fundamental human right.','Education is not a privilege — it\'s a fundamental human right.','教育不是特权。它是基本人权。',3),
    S('55-2','A single teacher can change a child\'s life forever. I know because one changed mine.','One teacher can change a child\'s life forever — one changed mine.','一位老师就能永远改变一个孩子的人生。我之所以知道因为有人改变了我。',5),
    S('55-3','When you educate a girl, you educate an entire community. This is not rhetoric — it is fact.','Educate a girl, educate a community. Not rhetoric — fact.','教育一个女孩就等于教育整个社区。这不是辞令——是事实。',5),
    S('55-4','Every child deserves the chance to reach their full potential regardless of where they were born.','Every child deserves to reach their potential regardless of birthplace.','每个孩子都应该有机会充分发挥潜力无论他们出生在哪里。',4),
  ]},

  { id:'56',title:'人工智能革命演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'AI对未来的影响', sentences:[
    S('56-1','Artificial intelligence is not coming — it is already here reshaping every industry.','AI is not coming — it\'s already here reshaping every industry.','人工智能不是在来的路上——它已经在这里重塑着每一个行业。',4),
    S('56-2','The question is not whether AI will change your job but how you will adapt to that change.','The question is how you will adapt — not whether AI will change your job.','问题不是AI是否会改变你的工作而是你将如何适应这种改变。',5),
    S('56-3','We must ensure that AI serves humanity, not the other way around.','We must ensure AI serves humanity — not the other way around.','我们必须确保AI为人类服务而不是反过来。',3),
    S('56-4','The greatest risk is not that machines will think like humans but that humans will think like machines.','Risk is not machines thinking like humans — but humans thinking like machines.','最大的风险不是机器像人一样思考而是人像机器一样思考。',5),
  ]},

  { id:'57',title:'小故事：老书店',category:'story',difficulty:'beginner',accent:'UK',totalDuration:50,description:'一家古老书店的故事', sentences:[
    S('57-1','At the end of a narrow cobblestone street stood a bookshop that had been there for over a century.','At the end of a cobblestone street stood a century-old bookshop.','在一条狭窄的鹅卵石街道尽头矗立着一家百年老书店。',5),
    S('57-2','The owner Mr. Aldridge knew every book on every shelf and every customer by name.','Mr. Aldridge knew every book and every customer by name.','店主Aldridge先生认识每一本书和每一位顾客的名字。',4),
    S('57-3','Children would come after school not to buy books but to listen to his stories.','Children came after school not to buy books but to listen to his stories.','孩子们放学后不是来买书而是来听他讲故事。',4),
    S('57-4','When he passed away the whole town mourned — he was more than a bookseller. He was a keeper of memories.','When he passed the whole town mourned — he was a keeper of memories.','他去世时整个镇子都在哀悼——他不只是卖书的更是记忆的守护者。',5),
  ]},

  { id:'58',title:'小故事：海边的灯塔',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:55,description:'灯塔守望者的故事', sentences:[
    S('58-1','For forty years Thomas had lived alone in the lighthouse keeping watch over the treacherous coastline.','Forty years Thomas lived alone in the lighthouse watching the treacherous coast.','四十年来Thomas独自住在灯塔里守护着这片危险的海岸线。',5),
    S('58-2','Every night he would climb the spiral staircase and light the lamp that guided ships safely home.','Every night he climbed the stairs and lit the lamp guiding ships home.','每晚他都会爬上旋转楼梯点亮引导船只安全归港的灯。',5),
    S('58-3','Technology eventually made his job obsolete but the lighthouse remained — a silent monument to a lifetime of service.','Technology made his job obsolete but the lighthouse remained.','技术最终让他的工作不再需要但灯塔依旧——一个沉默的纪念碑见证了一生的奉献。',6),
    S('58-4','Visitors now climb those same stairs and wonder about the man who called this tower home.','Visitors climb the stairs and wonder about the man who called this tower home.','游客们现在爬上同样的楼梯想象着那个把灯塔叫做家的守灯人。',4),
  ]},

  { id:'59',title:'小故事：丢失的戒指',category:'story',difficulty:'beginner',accent:'US',totalDuration:50,description:'温馨的寻物故事', sentences:[
    S('59-1','Martha had worn her wedding ring for fifty-two years. When she noticed it was gone she felt a piece of her heart missing.','Martha wore her wedding ring 52 years. When it was gone she felt her heart break.','Martha戴了结婚戒指52年。当她发现戒指不见时她感到心缺了一块。',6),
    S('59-2','Her grandchildren searched the entire house — under furniture, in drawers, between couch cushions.','Grandchildren searched the whole house — under furniture, in drawers.','孙辈们翻遍了整座房子——家具下、抽屉里、沙发缝间。',4),
    S('59-3','A week later her youngest grandson found it glinting in the garden where she had been planting tulips.','A week later her grandson found it in the garden where she planted tulips.','一周后最小的孙子在花园里找到了它，就在她种郁金香的地方闪闪发光。',5),
    S('59-4','She slipped it back on her finger and smiled — some things are meant to stay with you forever.','She put it back and smiled — some things stay with you forever.','她把它戴回手指上微笑着——有些东西注定要陪你一辈子。',4),
  ]},

  { id:'60',title:'小故事：画家的最后一幅画',category:'story',difficulty:'advanced',accent:'UK',totalDuration:60,description:'关于艺术与生命', sentences:[
    S('60-1','The old painter had not touched his brushes in months. His hands trembled too much and his eyes were failing.','The old painter hadn\'t touched brushes in months — hands trembled, eyes failing.','老画家已经几个月没碰画笔了。手抖得太厉害眼睛也不行了。',5),
    S('60-2','But one spring morning he set up his easel by the window and began to paint what he saw — or perhaps what he remembered.','One spring morning he set up his easel and painted what he saw — or remembered.','但一个春天的早晨他在窗边架起画架开始画他看到的——也许是记忆中的。',6),
    S('60-3','The canvas filled with colors so vivid they seemed to breathe — his entire life distilled into a single image.','The canvas filled with vivid colors — his life distilled into one image.','画布上充满了如此鲜艳的颜色仿佛在呼吸——他的一生浓缩成了一幅画面。',5),
    S('60-4','It was his masterpiece. And it was also his last. He passed peacefully that night with a paint-stained smile.','His masterpiece and his last. He passed that night with a paint-stained smile.','这是他毕生杰作也是最后的作品。那晚他带着沾满颜料的笑意安详地走了。',6),
  ]},

  { id:'61',title:'小故事：小提琴手',category:'story',difficulty:'intermediate',accent:'US',totalDuration:50,description:'地铁站里的小提琴手', sentences:[
    S('61-1','Every morning at exactly 8:15am a young woman played her violin in the subway station.','Every morning at 8:15 a young woman played violin in the subway.','每天早晨8:15准时一个年轻女子在地铁站拉小提琴。',4),
    S('61-2','Commuters rushed past barely noticing the music — except for one little girl who always stopped to listen.','Commuters rushed past. Only one little girl always stopped to listen.','通勤的人们匆匆而过几乎没注意到音乐——除了一个总停下来听的小女孩。',5),
    S('61-3','Years later that little girl became a professional violinist. When asked what inspired her she spoke of the subway musician.','Years later the girl became a violinist — inspired by the subway musician.','多年后那个小女孩成了职业小提琴家。当被问及灵感来源时她提到了那位地铁音乐家。',5),
    S('61-4','You never know whose life you are changing just by doing what you love.','You never know whose life you\'re changing by doing what you love.','你永远不会知道你热爱的事正在改变谁的人生。',4),
  ]},

  { id:'62',title:'小故事：面包师的心愿',category:'story',difficulty:'beginner',accent:'US',totalDuration:45,description:'一位面包师的暖心故事', sentences:[
    S('62-1','Every Sunday the baker set aside a dozen loaves for families who couldn\'t afford them.','Every Sunday the baker set aside bread for families who couldn\'t afford it.','每个周日面包师都会为买不起面包的家庭留出一打面包。',4),
    S('62-2','He never asked for anything in return. He simply said everyone deserves warm bread on Sunday morning.','He asked nothing in return — everyone deserves warm bread on Sunday.','他从不索取回报只是说每个人都值得在周日早晨吃到热乎乎的面包。',5),
    S('62-3','When the baker fell ill the entire neighborhood came together to run his shop until he recovered.','When he fell ill the neighborhood ran his shop until he recovered.','面包师生病后整个社区齐心协力帮他打理店铺直到他康复。',4),
    S('62-4','Kindness is like sourdough starter — you give some away and it grows back stronger.','Kindness is like sourdough — you give some away and it grows back stronger.','善良就像酵头——你分出去一些它会变得更壮。',4),
  ]},

  { id:'63',title:'小故事：石头上的信',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'海滩上发现的秘密', sentences:[
    S('63-1','While walking along the beach at low tide Emma discovered a glass bottle wedged between two rocks.','Walking at low tide Emma found a bottle wedged between rocks.','退潮时Emma在海滩上散步发现了一个卡在石头间的玻璃瓶。',4),
    S('63-2','Inside was a handwritten letter dated forty years earlier — a message in a bottle that had finally found its way.','Inside a letter dated forty years ago — a message that finally arrived.','里面是一封四十年前手写的信——一个漂流瓶终于到达了彼岸。',5),
    S('63-3','The letter was from a young sailor writing to his future self — dreaming of adventures and a family he hoped to build.','A young sailor wrote to his future self — dreaming of adventures and family.','信是一个年轻水手写给未来的自己的——梦想着冒险和期待组建的家庭。',5),
    S('63-4','Emma made it her mission to find the sailor or his family. What she found was a story more beautiful than she imagined.','Emma searched for the sailor — and found a story more beautiful than imagined.','Emma决定找到那位水手或他的家人。她发现的比想象中更美。',5),
  ]},

  { id:'64',title:'小故事：山顶的约定',category:'story',difficulty:'beginner',accent:'US',totalDuration:45,description:'两个朋友的约定', sentences:[
    S('64-1','Two childhood friends made a pact when they were ten — they would climb the tallest mountain together on their thirtieth birthday.','Two friends made a pact at ten — climb the tallest mountain on their 30th birthday.','两个童年好友十岁时就约定——三十岁生日那天一起爬上最高的山。',6),
    S('64-2','Life took them to different cities different countries. They lost touch for years.','Life took them to different places. They lost touch for years.','生活带他们去了不同的城市不同的国家。他们失联多年。',4),
    S('64-3','But on the morning of their thirtieth birthday they both showed up at the base of the mountain — without having spoken a word.','On their 30th birthday both showed up at the mountain — without a word.','但在三十岁生日当天他们都出现在了山脚下——没有提前说一句话。',5),
    S('64-4','Some promises are stronger than distance and time.','Some promises are stronger than distance and time.','有些约定比距离和时间更坚固。',3),
  ]},

  { id:'65',title:'小故事：迷路的猫',category:'story',difficulty:'beginner',accent:'US',totalDuration:40,description:'一只猫的回家之旅', sentences:[
    S('65-1','Luna the cat had been missing for six months when she appeared on the doorstep covered in dust and thin as a shadow.','Luna had been missing six months — appeared covered in dust and thin as a shadow.','猫咪Luna失踪了半年后出现在门阶上浑身灰尘瘦得像影子。',5),
    S('65-2','The family had given up hope of ever seeing her again. They had even packed away her food bowl.','The family had given up hope — even packed away her food bowl.','家人已经不抱希望了甚至收起了她的食盆。',4),
    S('65-3','She walked in as if she had never left — jumped on the sofa curled up and purred.','She walked in like she never left — jumped on the sofa and purred.','她走进来好像从未离开——跳上沙发蜷缩起来发出咕噜声。',4),
    S('65-4','Nobody knows where she went but everyone agreed — home is wherever you are loved.','Nobody knows where she went but home is where you are loved.','没人知道她去了哪里但大家都同意——家就是有人爱你的地方。',4),
  ]},

  { id:'66',title:'小故事：祖母的菜谱',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'一本菜谱的传承', sentences:[
    S('66-1','After her grandmother passed Alice inherited a worn notebook filled with handwritten recipes.','After grandmother passed Alice inherited a notebook of handwritten recipes.','祖母去世后Alice继承了一本满是手写菜谱的旧笔记本。',4),
    S('66-2','Each recipe was stained with decades of use — splashes of tomato sauce smudges of flour notes in the margins.','Each recipe stained by decades — tomato splashes, flour smudges, margin notes.','每一页菜谱都被几十年的使用浸染——番茄酱的渍迹、面粉的印记、页边的手记。',5),
    S('66-3','As Alice cooked her way through the book she felt her grandmother beside her — guiding her hands whispering forgotten secrets.','Cooking through the book Alice felt her grandmother beside her.','Alice照着菜谱一道一道地做感觉祖母就在身边——引导着她的手低语着被遗忘的秘密。',5),
    S('66-4','Food is more than sustenance. It is memory made edible — love served on a plate.','Food is more than food — it\'s edible memory, love on a plate.','食物不止是果腹之物。它是可以吃的记忆——装在盘子里的爱。',4),
  ]},

  { id:'67',title:'小故事：种树的人',category:'story',difficulty:'intermediate',accent:'US',totalDuration:50,description:'关于坚持与希望', sentences:[
    S('67-1','An old man spent his retirement planting trees in a barren valley that nobody cared about.','An old man planted trees in a barren valley nobody cared about.','一位老人退休后在没人关心的荒谷里种树。',3),
    S('67-2','People called him foolish — he would never live to see the forest grow. He just smiled and kept planting.','People called him foolish — he\'d never see the forest. He just smiled and kept planting.','人们说他傻——他活不到看见森林的那天。他只是笑笑继续种。',5),
    S('67-3','Twenty years later the valley was green and full of birds. The old man was gone but his forest remained.','Twenty years later the valley was green. The old man gone but his forest remained.','二十年后山谷变绿了鸟儿成群。老人已去但他的森林还在。',5),
    S('67-4','The best time to plant a tree was twenty years ago. The second best time is now.','Best time to plant a tree — twenty years ago. Second best — now.','种树最好的时间是二十年前。其次是现在。',3),
  ]},

  { id:'68',title:'小故事：站台上的陌生人',category:'story',difficulty:'beginner',accent:'US',totalDuration:45,description:'一次暖心的相遇', sentences:[
    S('68-1','She was crying on a train station bench when a stranger sat down and handed her a tissue without saying a word.','She was crying at the station — a stranger sat down and handed her a tissue without a word.','她在站台长椅上哭泣一个陌生人坐了下来递给她一张纸巾——没说一句话。',5),
    S('68-2','After a long silence he said — whatever it is it will pass. I promise you it will pass.','After a silence he said — whatever it is it will pass. I promise.','漫长的沉默后他说——不管是什么都会过去的。我向你保证会过去的。',5),
    S('68-3','She never learned his name. But years later whenever she saw someone in tears she sat down and passed them a tissue.','She never learned his name but always passed a tissue to someone in tears.','她始终不知道他的名字。但多年后每当她看到有人在哭她也会坐下来递上一张纸巾。',6),
    S('68-4','The smallest acts of kindness ripple outward in ways we may never know.','The smallest kindnesses ripple outward in ways we may never know.','最小的善举会以我们永远不知道的方式向外扩散。',4),
  ]},

  { id:'69',title:'小故事：深夜食堂',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:55,description:'一个深夜小吃摊的故事', sentences:[
    S('69-1','In a back alley of the city there was a tiny ramen shop that opened only from midnight until dawn.','In a back alley a tiny ramen shop opened only from midnight to dawn.','城市的一条小巷里有一家只在午夜到黎明营业的小拉面店。',4),
    S('69-2','The chef never spoke much but his bowls told stories — of lost love, second chances, and roads not taken.','The chef never spoke much but his bowls told stories.','厨师话不多但他的每一碗面都在诉说着故事——关于失去的爱、第二次机会和未曾走过的路。',5),
    S('69-3','People from all walks of life found solace in those steaming bowls — taxi drivers, nurses, heartbroken poets.','People of all kinds found solace — taxi drivers, nurses, heartbroken poets.','各种各样的人在那热气腾腾的一碗面中找到慰藉——出租车司机、护士、心碎的诗人。',5),
    S('69-4','The shop closed years ago but the people who ate there still talk about the ramen that tasted like home.','The shop closed but people still talk about the ramen that tasted like home.','那家店多年前就关了但吃过的人还在谈论那碗像家的味道的拉面。',5),
  ]},

  { id:'70',title:'小故事：窗户里的灯',category:'story',difficulty:'beginner',accent:'US',totalDuration:40,description:'关于等待与归家', sentences:[
    S('70-1','Every night a light burned in the window of the old house at the end of the lane.','Every night a light burned in the window of the old house.','每晚巷子尽头那栋老房子的窗户里总亮着一盏灯。',3),
    S('70-2','The neighbors wondered why — the house had been empty for years since the old woman passed away.','The neighbors wondered — the house had been empty for years.','邻居们很好奇——自老妇人去世后房子已经空了好几年了。',4),
    S('70-3','Decades ago her son had gone off to war and never returned. She kept the light on every night hoping he would find his way home.','Decades ago her son went to war and never returned. She kept the light on hoping.','几十年前她的儿子去了战场再没回来。她每晚亮着灯希望他能找到回家的路。',6),
    S('70-4','After she died the new owner kept the tradition — some lights are too important to turn off.','The new owner kept the tradition — some lights are too important to turn off.','她走后新房主延续了这个传统——有些灯太重要了不能熄灭。',4),
  ]},

  { id:'71',title:'足球教练的励志谈话',category:'speech',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'中场休息教练讲话', sentences:[
    S('71-1','You are not losing because they are better. You are losing because you stopped believing you can win.','Not losing because they\'re better — losing because you stopped believing.','你们不是输在他们更好。你们是输在不再相信自己能赢。',4),
    S('71-2','The score at halftime does not define the final result. What matters is what happens in the next forty-five minutes.','Halftime score doesn\'t define the result — next 45 minutes do.','半场比分不决定最终结果。重要的是接下来的45分钟。',4),
    S('71-3','Leave everything on that pitch. When you walk off at the end I want you to have no regrets.','Leave everything on the pitch — walk off with no regrets.','把一切都留在球场上。终场哨响时我要你们毫无遗憾。',4),
    S('71-4','Now get out there and show them who you really are!','Get out there and show them who you are!','现在出去让他们看看你们到底是谁！',2),
  ]},

  { id:'72',title:'和平主题演讲',category:'speech',difficulty:'advanced',accent:'UK',totalDuration:55,description:'诺贝尔和平奖演讲', sentences:[
    S('72-1','Peace is not merely the absence of war. It is the presence of justice, of equality, of human dignity.','Peace is not absence of war — it\'s presence of justice, equality, dignity.','和平不仅仅是没有战争。它是正义的存在、平等的存在、人的尊严的存在。',5),
    S('72-2','Every conflict begins with a failure of understanding. Every peace begins with a willingness to listen.','Every conflict starts with failed understanding. Every peace starts with listening.','每一次冲突都始于理解的失败。每一次和平都始于倾听的意愿。',4),
    S('72-3','We must teach our children not what to think but how to think — with empathy, with reason, with courage.','Teach our children how to think — with empathy, reason, courage.','我们必须教会孩子们不是思考什么而是如何思考——带着同理心、理性和勇气。',5),
    S('72-4','The road to peace is long and winding but it is the only road worth walking.','The road to peace is long — but it\'s the only road worth walking.','和平之路漫长而曲折但它是一条唯一值得走的路。',4),
  ]},

  { id:'73',title:'关于梦想的毕业演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'高中毕业典礼致辞', sentences:[
    S('73-1','Class of 2024 — look around you. These faces will be part of your story forever.','Class of 2024 — look around. These faces are part of your story forever.','2024届——看看你们周围。这些面孔将永远是你故事的一部分。',4),
    S('73-2','Some of you will become doctors, artists, engineers. Some of you will change the world in ways no one can predict.','Some will be doctors, artists, engineers. Some will change the world unpredictably.','你们中有人会成为医生、艺术家、工程师。有人会以无法预料的方式改变世界。',4),
    S('73-3','But before you change the world you need to figure out who you are and what you stand for.','Before changing the world figure out who you are and what you stand for.','但在改变世界之前你需要先搞清楚你是谁和你坚持什么。',5),
    S('73-4','The future is not something you wait for. It is something you build. Go build it.','The future is not what you wait for — it\'s what you build. Go build it.','未来不是等待来的。是你创造的。去创造吧。',3),
  ]},

  { id:'74',title:'科技伦理演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'科技伦理大会主题演讲', sentences:[
    S('74-1','Just because we can build something does not mean we should. Technology without ethics is a loaded weapon.','Just because we can build it doesn\'t mean we should. Tech without ethics is a loaded weapon.','我们能造出什么不代表我们应该造。没有伦理的技术是一把上膛的武器。',5),
    S('74-2','Every line of code we write has consequences that ripple far beyond our screens.','Every line of code has consequences beyond our screens.','我们写的每一行代码都有远超屏幕之外的影响。',3),
    S('74-3','As builders of the future we bear a responsibility that cannot be outsourced to algorithms.','Builders of the future bear a responsibility that can\'t be outsourced.','作为未来的建造者我们肩负着无法交给算法的责任。',4),
    S('74-4','Ask not just can we do this — but should we? For whom? And at what cost?','Ask not just can we — but should we? For whom? At what cost?','不仅问能做吗——还要问应该吗？为了谁？以什么为代价？',4),
  ]},

  { id:'75',title:'关于失败的Ted演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'重新定义失败', sentences:[
    S('75-1','I have failed more times than I can count. And I am grateful for every single one of those failures.','I\'ve failed more than I can count — and I\'m grateful for every one.','我失败的次数多到数不清。而我感激其中的每一次失败。',4),
    S('75-2','Failure is data. It tells you what doesn\'t work so you can find what does.','Failure is data — tells you what doesn\'t work so you find what does.','失败是数据。它告诉你不奏效的是什么这样你才能找到奏效的。',4),
    S('75-3','We need to stop stigmatizing failure and start celebrating the lessons it teaches us.','Stop stigmatizing failure — celebrate its lessons.','我们必须停止污名化失败而要开始庆祝它教给我们的课程。',3),
    S('75-4','The opposite of success is not failure — it is giving up. As long as you keep going you haven\'t failed.','Opposite of success isn\'t failure — it\'s giving up. Keep going, you haven\'t failed.','成功的反面不是失败——是放弃。只要还在继续你就没有失败。',5),
  ]},

  { id:'76',title:'小故事：母亲的花园',category:'story',difficulty:'beginner',accent:'US',totalDuration:45,description:'关于母爱与成长', sentences:[
    S('76-1','My mother\'s garden was her sanctuary. Every flower had a story and every plant had a name.','My mother\'s garden was her sanctuary — every flower had a story.','母亲的花园是她的圣地。每一朵花都有一个故事每一株植物都有一个名字。',4),
    S('76-2','When I moved away for college she sent me a small potted plant — a cutting from her favorite rose bush.','When I left for college she sent a potted plant — a cutting from her favorite rose.','我离家上大学时她寄给我一小盆植物——从她最爱的玫瑰丛上剪下来的插枝。',6),
    S('76-3','I killed it within a month. But she just laughed and sent another one. She never stopped believing I could grow things.','I killed it in a month. She laughed and sent another. She never stopped believing.','我一个月就养死了。但她只是笑着又寄了一盆。她从未停止相信我能种活。',5),
    S('76-4','Now I have a garden of my own and my daughter helps me water the roses. Some things are inherited not in genes but in love.','Now I have my own garden — my daughter helps water the roses. Some things are inherited in love.','现在我有了自己的花园女儿帮我浇玫瑰。有些东西不会通过基因遗传而是通过爱。',6),
  ]},

  { id:'77',title:'小故事：雨伞',category:'story',difficulty:'beginner',accent:'UK',totalDuration:40,description:'一把雨伞的传递', sentences:[
    S('77-1','It started raining suddenly and I had no umbrella. A stranger shared hers and walked me three blocks to my office.','Sudden rain — no umbrella. A stranger shared hers and walked me three blocks.','突然下起大雨我没带伞。一个陌生人分享了她的伞陪我走了三个街区到公司。',5),
    S('77-2','Before she left she handed me the umbrella. Just pass it on someday she said.','Before leaving she handed me the umbrella — just pass it on someday she said.','离别前她把伞递给我。有一天把它传递下去她说。',4),
    S('77-3','A year later I saw someone caught in the rain and I passed that same umbrella to them.','A year later I passed that umbrella to someone caught in the rain.','一年后我看到有人被困雨中我把那把伞递给了他。',4),
    S('77-4','That umbrella has probably changed hands dozens of times by now. Kindness travels farther than any of us can see.','That umbrella has changed hands many times. Kindness travels farther than we see.','那把伞现在可能已经换了几十个主人。善良的传递比我们能看到的更远。',4),
  ]},

  { id:'78',title:'小故事：旧书店的猫',category:'story',difficulty:'beginner',accent:'UK',totalDuration:40,description:'书店里的一只猫', sentences:[
    S('78-1','Mr. Higgins the bookstore cat had lived among the shelves for fifteen years — longer than most of the staff.','Mr. Higgins the bookstore cat lived among shelves fifteen years — longer than most staff.','Higgins先生——书店的猫——在书架间住了十五年比大部分店员都久。',5),
    S('78-2','He had a habit of curling up on the lap of anyone who looked sad. Customers swore he could sense emotions.','He curled up on laps of anyone sad. Customers swore he sensed emotions.','他习惯蜷在看起来伤心的人的膝头。顾客都发誓他能感知情绪。',4),
    S('78-3','When he passed away the bookstore received over a hundred condolence cards from customers young and old.','When he died the store got over a hundred condolence cards from young and old.','他去世后书店收到了顾客们寄来的一百多张慰问卡——有年轻人也有老人。',5),
    S('78-4','A good bookshop cat doesn\'t just live in the store. He lives in the hearts of everyone who read there.','A good bookshop cat lives in the hearts of everyone who read there.','一只好的书店猫不只是住在店里。他活在每一个在那里阅读过的人心里。',5),
  ]},

  { id:'79',title:'小故事：街角的花摊',category:'story',difficulty:'intermediate',accent:'US',totalDuration:50,description:'花摊老板的人生哲学', sentences:[
    S('79-1','The flower vendor at the corner of 5th and Main had a sign that read — one stem for a dollar, one smile for free.','The flower vendor\'s sign — one stem for a dollar, one smile for free.','第五大道和Main街角的花贩立着一块牌子——一枝一块钱一个微笑免费。',5),
    S('79-2','People bought flowers they didn\'t need just to see his smile. He made more friends than money.','People bought flowers they didn\'t need just for his smile. He made more friends than money.','人们买不需要的花只为看他的笑容。他交的朋友比赚的钱多。',5),
    S('79-3','When the city tried to shut down his unlicensed stall a petition with five thousand signatures saved it overnight.','When the city tried to shut him down a 5000-signature petition saved him.','当市里要关掉他无证的摊位时一份五千人签名的请愿书一夜之间保住了它。',5),
    S('79-4','A business built on kindness is worth more than one built on profit.','A business built on kindness is worth more than one built on profit.','建立在善良之上的生意比建立在利润之上的更有价值。',3),
  ]},

  { id:'80',title:'小故事：迟到的信',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:55,description:'一封迟到50年的信', sentences:[
    S('80-1','During renovations of an old post office workers discovered a letter that had slipped behind a sorting machine fifty years ago.','Renovations uncovered a letter that slipped behind a sorter fifty years ago.','在翻新一家老邮局时工人们发现了一封五十年前滑落到分拣机后面的信。',5),
    S('80-2','It was a love letter from a young soldier to his fiancée written the night before he shipped out.','A love letter from a young soldier to his fiancée written the night before deployment.','是一封年轻士兵写给未婚妻的情书写于他出发前夜。',4),
    S('80-3','The postal service tracked down the woman now in her seventies and hand-delivered the letter.','The postal service found the woman now seventy and delivered the letter.','邮政部门找到了如今已七十多岁的那位女士亲手把信交给了她。',5),
    S('80-4','She read it with trembling hands tears rolling down her cheeks — he had died in the war and this was his last message to her.','She read it with trembling hands — he died in the war, this was his last message.','她用颤抖的手读着泪水流下脸颊——他已在战争中牺牲这是给她的最后一条信息。',6),
  ]},

  { id:'81',title:'小故事：赛跑',category:'story',difficulty:'beginner',accent:'US',totalDuration:40,description:'关于坚持的故事', sentences:[
    S('81-1','In the school sports day little Jamie finished last in every race. But he never stopped smiling.','At school sports day Jamie finished last in every race but never stopped smiling.','学校运动会上小Jamie每场比赛都是最后一名。但他从未停止微笑。',4),
    S('81-2','His teacher asked — why are you so happy when you keep losing?','His teacher asked — why so happy when you keep losing?','老师问他——你一直输为什么还这么开心？',3),
    S('81-3','Jamie replied — I\'m not losing. I\'m just getting more practice than everyone else.','Jamie said — I\'m not losing, I\'m getting more practice than everyone else.','Jamie回答——我不是在输。我只是比别人多练习了几遍。',4),
    S('81-4','Twenty years later Jamie became an Olympic coach. He taught his athletes that the only real failure is not showing up.','Jamie became an Olympic coach — taught that the only failure is not showing up.','二十年后Jamie成了奥运教练。他教运动员们唯一的失败就是不敢上场。',4),
  ]},

  { id:'82',title:'能源危机演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'可再生能源主题演讲', sentences:[
    S('82-1','The stone age did not end because we ran out of stones. The oil age will not end because we run out of oil.','Stone age didn\'t end because we ran out of stones. Oil age won\'t end because we run out of oil.','石器时代不是因为没有石头而结束的。石油时代也不会因为石油耗尽而结束。',5),
    S('82-2','It ends when we find something better. And we have found something better — clean, renewable, infinite energy.','It ends when we find something better. And we have — clean, renewable energy.','它在找到更好的东西时结束。而我们已经找到了——清洁、可再生、无穷无尽的能源。',5),
    S('82-3','The transition to green energy is not a sacrifice. It is the greatest economic opportunity of our lifetime.','Green transition is not sacrifice — it\'s the greatest opportunity of our lifetime.','向绿色能源的转型不是一种牺牲。它是我们这一生中最大的经济机遇。',4),
  ]},

  { id:'83',title:'员工激励演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'CEO年终激励演讲', sentences:[
    S('83-1','When I started this company I had nothing but an idea and the stubborn belief that we could make a difference.','Started with nothing — an idea and stubborn belief we could make a difference.','我创立这家公司时除一个想法和一种固执的信念之外一无所有——相信我们能带来改变。',5),
    S('83-2','Twelve years later we have over a thousand employees and millions of customers. But we\'re just getting started.','Twelve years, 1000+ employees, millions of customers. But we\'re just getting started.','十二年后我们有一千多名员工和数百万客户。但我们才刚开始。',5),
    S('83-3','The secret to our success has never been our technology or our strategy. It has always been our people.','Secret to success — not tech or strategy. Always our people.','我们成功的秘诀从来不是技术或策略。始终是我们的员工。',4),
    S('83-4','Thank you for pouring your heart into this company. I promise I will do the same for each and every one of you.','Thank you for pouring your hearts into this company. I\'ll do the same for you.','感谢你们把心血倾注到这家公司。我保证我也会为你们每一个人这样做。',5),
  ]},

  { id:'84',title:'教育创新演讲',category:'speech',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'教育不应该是一刀切', sentences:[
    S('84-1','If you judge a fish by its ability to climb a tree it will live its whole life believing it is stupid.','Judge a fish by climbing — it lives believing it\'s stupid.','如果你以爬树的能力来评判一条鱼它会一辈子都相信自己是个笨蛋。',4),
    S('84-2','Our education system was designed in the industrial age to produce factory workers not creative thinkers.','Education designed in the industrial age — for factory workers, not creative thinkers.','我们的教育体系设计于工业时代目的是培养工厂工人而非创造性思考者。',4),
    S('84-3','Every child is a genius in something. Our job is to help them find what that something is.','Every child is a genius in something — our job is to help them find it.','每个孩子在某方面都是天才。我们的工作是帮他们找到那是什么。',4),
    S('84-4','Education is not the filling of a pail but the lighting of a fire.','Education is not filling a pail — it\'s lighting a fire.','教育不是填满一桶水而是点燃一把火。',3),
  ]},

  { id:'85',title:'关于感恩的演讲',category:'speech',difficulty:'beginner',accent:'US',totalDuration:40,description:'感恩带来幸福', sentences:[
    S('85-1','Gratitude turns what we have into enough. It is the simplest and most powerful happiness habit.','Gratitude turns what we have into enough — the simplest happiness habit.','感恩能让我们拥有的变成足够。它是最简单也最强大的幸福习惯。',4),
    S('85-2','Every morning I write down three things I\'m grateful for. It takes two minutes and changes everything.','Every morning I write three things I\'m grateful for — two minutes that changes everything.','每天早上我写下三件让我感恩的事。只需两分钟却能改变一切。',5),
    S('85-3','Try it for a week and watch your entire outlook on life transform.','Try it for a week — watch your outlook transform.','试一个星期你会看到你对生活的整个观点都会改变。',3),
  ]},

  { id:'86',title:'小故事：风筝',category:'story',difficulty:'beginner',accent:'US',totalDuration:40,description:'放风筝的故事', sentences:[
    S('86-1','A grandfather took his grandson to fly a kite on a windy spring afternoon.','Grandfather took grandson to fly a kite on a windy spring day.','一个春天的下午祖父带孙子去放风筝。',3),
    S('86-2','The string broke and the kite soared away into the clouds. The boy started to cry.','The string broke — the kite soared away. The boy cried.','线断了风筝飘向云端。男孩哭了起来。',3),
    S('86-3','Don\'t be sad said the grandfather. The kite is not lost — it\'s free. And somewhere someone will look up and find it beautiful.','Don\'t be sad — the kite isn\'t lost, it\'s free. Someone will find it beautiful.','别难过祖父说。风筝没有丢——它自由了。在某个地方有人会抬头看到它觉得真美。',5),
    S('86-4','The boy grew up and never forgot that lesson — sometimes letting go is the most beautiful thing you can do.','The boy never forgot — sometimes letting go is the most beautiful thing.','男孩长大后再没忘记那一课——有时候放手是你能做的最美的事。',4),
  ]},

  { id:'87',title:'小故事：打字机',category:'story',difficulty:'intermediate',accent:'US',totalDuration:50,description:'一封用打字机写的信', sentences:[
    S('87-1','In a world of instant messages a young woman bought a vintage typewriter from a thrift store.','In a world of instant messages she bought a vintage typewriter.','在一个即时通讯的时代一个年轻女子从二手店买了一台老式打字机。',4),
    S('87-2','She typed letters to everyone she loved — slow deliberate imperfect letters that took an hour to write.','She typed letters to loved ones — slow deliberate imperfect letters taking an hour each.','她给自己爱的每个人打信——缓慢、刻意、不完美的信每封要花一个小时。',5),
    S('87-3','Her friends were confused at first but then they started writing back — with pen, with care, with time.','Friends were confused then started writing back — with pen, care, time.','朋友们起初很困惑但后来也开始回信——用笔、用心、用时间。',4),
    S('87-4','Slowing down in a fast world is not a weakness. It is a quiet act of rebellion.','Slowing down in a fast world is not weakness — it\'s quiet rebellion.','在快节奏的世界里慢下来不是弱点。是一种安静的叛逆。',3),
  ]},

  { id:'88',title:'小故事：萤火虫',category:'story',difficulty:'beginner',accent:'US',totalDuration:35,description:'关于黑暗中的光', sentences:[
    S('88-1','A little girl was afraid of the dark. Every night she begged her father to leave the light on.','Little girl afraid of dark — begged father to leave light on.','小女孩怕黑。每晚她都求爸爸把灯开着。',3),
    S('88-2','One summer evening her father took her to a field and turned off his flashlight. The whole field sparkled with fireflies.','One evening her father took her to a field — the whole field sparkled with fireflies.','一个夏夜父亲带她到一片田野关掉了手电筒。整片田野闪烁着萤火虫的光芒。',5),
    S('88-3','See he said — some lights only shine in the dark. You just have to be brave enough to look for them.','Some lights only shine in the dark — you just have to be brave enough to look.','看他说——有些光只在黑暗中闪烁。你只需要有足够的勇气去寻找它们。',5),
    S('88-4','She never asked for the light to be left on again.','She never asked for the light again.','她此后再也没要求过开灯。',2),
  ]},

  { id:'89',title:'太空探索演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'关于人类探索精神', sentences:[
    S('89-1','We choose to go to the moon not because it is easy but because it is hard.','We choose to go to the moon not because it\'s easy but because it\'s hard.','我们选择登月不是因为它容易而是因为它困难。',3),
    S('89-2','Exploration is written in our DNA. It is what pushed our ancestors across oceans and what will push us to Mars and beyond.','Exploration is in our DNA — pushed our ancestors across oceans, will push us to Mars.','探索写在我们的基因里。它驱使我们祖先跨越海洋也会驱使我们前往火星和更远的地方。',6),
    S('89-3','The greatest discoveries lie not behind us but ahead of us. The universe is calling — we must answer.','Greatest discoveries lie ahead. The universe is calling — we must answer.','最伟大的发现在前方而非身后。宇宙在召唤——我们必须回应。',4),
  ]},

  { id:'90',title:'关于包容的演讲',category:'speech',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'多元化和包容性', sentences:[
    S('90-1','Diversity is being invited to the party. Inclusion is being asked to dance.','Diversity is being invited to the party. Inclusion is being asked to dance.','多元化是被邀请参加聚会。包容是被邀请跳舞。',3),
    S('90-2','We don\'t just need diverse faces at the table — we need diverse voices shaping the conversation.','Not just diverse faces at the table — diverse voices shaping the conversation.','我们不只是需要在桌边有不同面孔——更需要不同的声音塑造对话。',5),
    S('90-3','Our differences are not obstacles to overcome. They are strengths to celebrate.','Differences are not obstacles — they\'re strengths to celebrate.','我们的差异不是需要克服的障碍。而是值得庆祝的力量。',3),
    S('90-4','A world where everyone thinks the same is not a world I want to live in.','A world where everyone thinks the same is not where I want to live.','一个每个人都想得一样的世界不是我想要生活的世界。',4),
  ]},

  { id:'91',title:'小故事：公交车站',category:'story',difficulty:'beginner',accent:'UK',totalDuration:40,description:'公交车站的偶遇', sentences:[
    S('91-1','Every day at the same bus stop two strangers stood waiting — one reading a book one listening to music.','Every day two strangers at the bus stop — one reading, one listening to music.','每天在同一公交车站两个陌生人站着等车——一个看书一个听音乐。',4),
    S('91-2','They never spoke for three years. Then one day the bus was late and they started talking.','Three years no words. Then one day the bus was late — they started talking.','三年没说过话。然后有一天公交车晚点了他们开始聊天。',4),
    S('91-3','They have been married for ten years now. All because a bus was fifteen minutes late.','Married ten years now — because a bus was fifteen minutes late.','现在已经结婚十年了。就因为一辆公交车晚了十五分钟。',4),
    S('91-4','The most important moments in life rarely announce themselves. They just show up and change everything.','Important moments rarely announce themselves — just show up and change everything.','人生中最重要的时刻很少会提前宣告。它们就这样悄然而至然后改变一切。',4),
  ]},

  { id:'92',title:'小故事：窗台上的面包',category:'story',difficulty:'beginner',accent:'US',totalDuration:40,description:'邻里间的温暖', sentences:[
    S('92-1','During the hardest months of the pandemic someone started leaving fresh bread on windowsills around the neighborhood.','During the pandemic someone left fresh bread on windowsills.','在疫情最困难的日子有人开始在社区各家的窗台上放新鲜面包。',4),
    S('92-2','Nobody knew who was doing it. The bread just appeared — warm wrapped in brown paper with a simple note: you are not alone.','Nobody knew who — bread just appeared warm with a note: you are not alone.','没人知道是谁。面包就这样出现了——温热的裹在牛皮纸里附着一张简单的纸条：你不是一个人。',6),
    S('92-3','Months later people discovered it was an elderly woman who had been a baker before she retired. She used her meager savings just to make others smile.','Later they found an elderly retired baker using her savings to make others smile.','几个月后人们发现是一位退休前做面包师的老太太。她用微薄的积蓄只为让别人笑一笑。',5),
    S('92-4','Heroes don\'t always wear capes. Sometimes they wear flour-dusted aprons.','Heroes don\'t always wear capes — sometimes they wear flour-dusted aprons.','英雄不总穿着披风。有时他们穿着沾满面粉的围裙。',3),
  ]},

  { id:'93',title:'小故事：望远镜',category:'story',difficulty:'intermediate',accent:'US',totalDuration:50,description:'一位天文学家的故事', sentences:[
    S('93-1','Professor Chen had spent forty years searching for a comet that would bear his name but never found one.','Professor Chen spent forty years searching for a comet that would bear his name — never found one.','陈教授花了四十年寻找一颗以他名字命名的彗星但从没找到。',5),
    S('93-2','His colleagues called him a failure behind his back. But he kept looking up at the night sky every single clear night.','Colleagues called him a failure. But he kept looking up every clear night.','同事背后说他是失败者。但他每个晴朗的夜晚依然仰望星空。',4),
    S('93-3','On the night of his retirement party he didn\'t show up. Someone found him at the observatory — he had finally found his comet.','On his retirement night he wasn\'t at the party — he was at the observatory. He found his comet.','退休派对的晚上他没出现。有人在天文台找到了他——他终于找到了他的彗星。',5),
    S('93-4','The comet was officially named after him: Comet Chen 2058. The greatest comebacks take the longest to arrive.','Named Comet Chen 2058. The greatest comebacks take the longest to arrive.','那颗彗星被正式命名：Chen 2058彗星。最伟大的功业往往需要最长的等待。',4),
  ]},

  { id:'94',title:'小故事：口琴',category:'story',difficulty:'beginner',accent:'US',totalDuration:40,description:'一把口琴的传承', sentences:[
    S('94-1','The only thing my grandfather left me was a worn harmonica in a leather case.','Grandfather left me a worn harmonica in a leather case.','祖父留给我的唯一遗物是一把装在皮套里的旧口琴。',3),
    S('94-2','I couldn\'t play a single note but I carried it everywhere — it felt like a piece of him.','Couldn\'t play a note but carried it everywhere — it felt like him.','我一个音都吹不出但随身带着它——感觉就像带着他的一部分。',4),
    S('94-3','Years later during a tough time I finally learned to play. The first song I learned was his favorite — Moon River.','Years later I learned to play — first song was his favorite, Moon River.','多年后在艰难时刻我终于学会了吹奏。学会的第一首曲子是他最爱的——月亮河。',5),
    S('94-4','Every time I play it now I feel him sitting beside me nodding along with his eyes closed.','Every time I play I feel him beside me nodding with eyes closed.','现在每次吹起我都感觉他坐在我身边闭着眼睛跟着点头。',4),
  ]},

  { id:'95',title:'艺术的价值演讲',category:'speech',difficulty:'advanced',accent:'UK',totalDuration:50,description:'为什么艺术对社会至关重要', sentences:[
    S('95-1','Art is not a luxury. It is not an optional extra to be cut when budgets are tight. Art is the soul of a civilization.','Art is not a luxury — not optional when budgets are tight. Art is the soul of civilization.','艺术不是奢侈品。不是预算紧张时可以砍掉的额外项。艺术是文明的灵魂。',5),
    S('95-2','When we look at a painting from five hundred years ago we are looking into the eyes of someone who lived and felt and dreamed.','Looking at a 500-year-old painting we look into the eyes of someone who lived and dreamed.','当我们看一幅五百年前的画作时我们是在注视着一个活过感受过梦想过的人的眼睛。',5),
    S('95-3','In times of crisis it is to art that we turn — for comfort, for understanding, for hope.','In crisis we turn to art — for comfort, understanding, hope.','在危机时刻我们转向艺术——为了安慰、理解和希望。',3),
    S('95-4','A society that neglects the arts neglects its own humanity.','A society that neglects the arts neglects its own humanity.','一个忽视艺术的社会就是在忽视自己的人性。',2),
  ]},

  { id:'96',title:'小故事：最后一节课',category:'story',difficulty:'intermediate',accent:'US',totalDuration:55,description:'退休教师的最后一节课', sentences:[
    S('96-1','Mrs. Thompson taught fourth grade for forty-two years. On her last day she expected a quiet goodbye.','Mrs. Thompson taught 4th grade 42 years — expected a quiet goodbye on her last day.','Thompson老师教了42年四年级。在最后一天她以为会安静地告别。',5),
    S('96-2','Instead hundreds of former students — now doctors lawyers teachers parents — showed up to surprise her.','Instead hundreds of former students showed up — doctors lawyers teachers parents.','没想到成百上千的以前的学生出现了——如今他们是医生、律师、老师、父母——来给她惊喜。',5),
    S('96-3','They had organized a flash mob reciting the poem she taught them — the one about believing in yourself.','They organized a flash mob reciting the poem she taught them about believing in yourself.','他们组织了一次快闪集体朗诵她教过的那首诗——关于相信自己的那首。',5),
    S('96-4','A great teacher doesn\'t just teach. She echoes through generations.','A great teacher doesn\'t just teach — she echoes through generations.','一位好老师不只是教书。她的声音回响世世代代。',3),
  ]},

  { id:'97',title:'小故事：最后一班岗',category:'story',difficulty:'beginner',accent:'UK',totalDuration:45,description:'退休警察的最后一天', sentences:[
    S('97-1','Sergeant Miller walked his beat for the last time after thirty years on the force.','Sergeant Miller walked his beat for the last time after thirty years.','Miller警官在警队服务三十年后最后一次走他管辖的街区。',4),
    S('97-2','Shopkeepers came out to shake his hand. Kids he had once helped now grown up waved from their cars.','Shopkeepers shook his hand. Kids he helped now grown up waved from cars.','店主们出来跟他握手。他曾帮助过的小孩现在已长大成人在车上向他挥手。',5),
    S('97-3','He stopped at the place where he had delivered a baby in the back of his patrol car twenty years ago. The baby now a college student was there to hug him.','He stopped where he delivered a baby in his patrol car — now a college student there to hug him.','他在二十年前警车后座上接生婴儿的地方停下。那个婴儿现在已是大学生专门来拥抱他。',6),
    S('97-4','Not all heroes wear capes. Some wear badges and walk the same streets every day for thirty years.','Not all heroes wear capes — some wear badges and walk the same streets for thirty years.','不是所有英雄都穿披风。有些戴着警徽在同一条街上走了三十年。',5),
  ]},

  { id:'98',title:'自律的力量演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'自律即自由', sentences:[
    S('98-1','We all want freedom but freedom without discipline is just chaos wearing a mask.','We want freedom but freedom without discipline is chaos wearing a mask.','我们都想要自由但没有自律的自由只是戴着面具的混乱。',4),
    S('98-2','Discipline is not punishment. It is the bridge between your goals and your accomplishments.','Discipline is not punishment — it\'s the bridge between goals and accomplishments.','自律不是惩罚。它是连接你的目标和成就的桥梁。',3),
    S('98-3','Every time you choose the hard right over the easy wrong you are building a version of yourself that is unstoppable.','Every time you choose hard right over easy wrong you become more unstoppable.','每一次你选择困难但正确的事而非容易但错误的事你都在塑造一个势不可挡的自己。',5),
    S('98-4','Motivation gets you started. Discipline keeps you going.','Motivation gets you started — discipline keeps you going.','动力让你开始。自律让你坚持。',2),
  ]},

  { id:'99',title:'小故事：最后一杯茶',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:55,description:'一杯茶的温度', sentences:[
    S('99-1','Every afternoon at 4pm Mr. Patel made tea for two — one cup for himself and one for his wife who had passed away five years ago.','Every 4pm Mr. Patel made tea for two — one for himself, one for his late wife.','每天下午四点Patel先生会泡两杯茶——一杯给自己一杯给五年前去世的妻子。',6),
    S('99-2','His neighbors thought it was sad. He thought it was the most important ritual of his day.','Neighbors thought it sad. He thought it the most important ritual of his day.','邻居们觉得伤感。他却认为这是每天最重要的仪式。',4),
    S('99-3','One day a new neighbor — a young woman far from home — was invited to join him. She became his Tuesday tea companion.','One day a new neighbor was invited — she became his Tuesday tea companion.','一天一个新邻居——一个远离家乡的年轻女子——被邀请一起喝茶。她成了他星期二的茶伴。',6),
    S('99-4','Grief shared is grief halved. Tea shared is warmth doubled.','Grief shared is grief halved. Tea shared is warmth doubled.','被分担的悲伤减半。被分享的茶温暖加倍。',3),
  ]},

  { id:'100',title:'告别演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'关于新的开始', sentences:[
    S('100-1','Every goodbye is also a hello to something new. Every ending is a beginning in disguise.','Every goodbye is a hello — every ending is a beginning in disguise.','每一次告别都是对新事物的问候。每一个结束都是乔装的开始。',3),
    S('100-2','As I leave this chapter behind I carry with me not just memories but the people who made those memories matter.','I carry not just memories but the people who made them matter.','当我翻过这一章带走的不只是回忆还有那些让回忆变得珍贵的人。',5),
    S('100-3','Thank you for the lessons the laughter and the love. You have shaped me in ways you may never fully know.','Thank you for lessons laughter love — you shaped me in ways you may never know.','谢谢你们的教导、欢笑和爱。你们以你们可能永远不会完全了解的方式塑造了我。',5),
    S('100-4','This is not goodbye. This is see you later in a different chapter of our story.','Not goodbye — see you later in a different chapter.','这不是永别。只是在故事的另一章说再见。',3),
  ]},

  // ===== NEW DAILY (5 materials) =====
  { id:'101',title:'机场办理登机',category:'daily',difficulty:'beginner',accent:'US',totalDuration:50,description:'机场值机柜台对话',
    sentences:[ S('101-1','Good morning! Can I see your passport and booking reference please?','Good morning — passport and booking reference please?','早上好！请出示您的护照和预订编号。',3),
      S('101-2','Here you go. I checked in online but I need to drop off my luggage.','Here you go — checked in online but need to drop off luggage.','给您。我已经在网上值机了但需要托运行李。',3),
      S('101-3','No problem. Would you prefer a window seat or an aisle seat?','No problem — window seat or aisle seat?','没问题。您想要靠窗还是过道的座位？',3),
      S('101-4','Window seat please. And what time does boarding start?','Window seat please — what time does boarding start?','靠窗的。登机什么时候开始？',2),
      S('101-5','Boarding begins at 2:30 at Gate 24. Have a safe flight!','Boarding at 2:30, Gate 24. Safe flight!','下午两点半在24号登机口。祝您旅途愉快！',3),
      S('101-6','Thank you! I\'ll grab a coffee before heading to the gate.','Thanks — grab a coffee before the gate.','谢谢！我先去买杯咖啡再去登机口。',3),
    ]},
  { id:'102',title:'求职面试对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:60,description:'英文求职面试场景',
    sentences:[ S('102-1','Thank you for coming in today. Could you start by telling us a bit about yourself?','Thanks for coming in — tell us a bit about yourself.','感谢你今天来面试。能先简单介绍一下你自己吗？',3),
      S('102-2','Of course. I have five years of experience in digital marketing with a focus on content strategy.','Five years in digital marketing — focus on content strategy.','当然。我有五年数字营销经验专注内容策略。',3),
      S('102-3','What would you say is your greatest professional strength?','What is your greatest professional strength?','你觉得自己最大的职业优势是什么？',2),
      S('102-4','I\'d say adaptability. In my last role I led a team through a major system migration without missing a single deadline.','Adaptability — led a team through a major migration without missing deadlines.','我认为是适应能力。在上一个岗位我带团队完成了重大系统迁移没错过一个截止日期。',5),
      S('102-5','That\'s impressive. Where do you see yourself in five years?','Impressive — where do you see yourself in five years?','很厉害。你五年后想达到什么位置？',3),
      S('102-6','I hope to be leading larger strategic initiatives while mentoring junior team members.','Leading larger initiatives while mentoring juniors.','我希望能主导更大的战略项目同时指导初级团队成员。',4),
      S('102-7','Great. Do you have any questions for us about the role or the company?','Any questions about the role or company?','好的。你对我们公司或这个职位有什么问题吗？',2),
      S('102-8','Yes — what does success look like in this role during the first six months?','What does success look like in the first six months?','有的——在这个职位上头六个月怎样才算成功？',3),
    ]},
  { id:'103',title:'酒店入住对话',category:'daily',difficulty:'beginner',accent:'UK',totalDuration:50,description:'酒店前台办理入住',
    sentences:[ S('103-1','Good evening, welcome to The Grand Hotel. Do you have a reservation?','Good evening — welcome to The Grand Hotel. Reservation?','晚上好，欢迎来到大饭店。您有预订吗？',3),
      S('103-2','Yes, it should be under the name Wilson. I booked a double room for three nights.','Under Wilson — double room for three nights.','有的，应该是Wilson的名字。我订了一间双人房住三晚。',3),
      S('103-3','I\'ve found your reservation. May I see a credit card for the incidentals deposit?','Found it — credit card for incidentals deposit?','找到您的预订了。能出示信用卡付杂费押金吗？',3),
      S('103-4','Here you are. Also, what time is breakfast served?','Here — what time is breakfast?','给你。对了，早餐几点开始？',2),
      S('103-5','Breakfast is from 6:30 to 10:00 in the Garden Room on the ground floor.','6:30 to 10:00 — Garden Room, ground floor.','早餐从早上六点半到十点在一楼花园厅。',3),
      S('103-6','Lovely. Could you also give me a wake-up call at 7am tomorrow?','Lovely — wake-up call at 7am tomorrow?','太好了。能帮我设一个明早七点的叫醒电话吗？',3),
      S('103-7','Absolutely. Here\'s your key card — Room 512. The lift is to your right. Enjoy your stay!','Key card — Room 512, lift to the right. Enjoy your stay!','当然。这是您的房卡——512房间。电梯在右边。祝您入住愉快！',4),
    ]},
  { id:'104',title:'电话客服对话',category:'daily',difficulty:'intermediate',accent:'US',totalDuration:55,description:'电话报修和投诉处理',
    sentences:[ S('104-1','Thank you for calling TechSupport. This is Amy speaking. How may I help you?','Thank you for calling TechSupport — Amy speaking. How may I help?','感谢致电技术支持。我是Amy。有什么可以帮您？',3),
      S('104-2','Hi Amy, my internet has been dropping out every few hours. I\'ve already tried restarting the router.','Internet dropping every few hours — already tried restarting the router.','你好Amy我的网络每隔几小时就断一次。已经试过重启路由器了。',3),
      S('104-3','I understand how frustrating that must be. Let me run a remote diagnostic on your connection.','I understand — let me run a remote diagnostic on your connection.','我理解这有多烦心。让我对您的连接做一个远程诊断。',3),
      S('104-4','It looks like there\'s a signal interference issue in your area. I\'ll schedule a technician to visit tomorrow.','Signal interference in your area — I\'ll schedule a technician for tomorrow.','看来您所在的区域有信号干扰问题。我会安排技术人员明天上门。',4),
      S('104-5','Tomorrow works. Will there be any charge for the visit?','Tomorrow works — any charge for the visit?','明天可以。上门服务要收费吗？',2),
      S('104-6','No, it\'s covered under your service agreement. The technician will arrive between 9am and noon.','Covered under your agreement — technician arrives 9am to noon.','不用这在您的服务协议范围内。技术人员会在上午九点到中午之间到。',4),
      S('104-7','Perfect, thank you so much for your help Amy.','Perfect — thank you so much Amy.','太好了非常感谢你的帮助Amy。',2),
    ]},
  { id:'105',title:'健身房咨询',category:'daily',difficulty:'beginner',accent:'UK',totalDuration:45,description:'咨询健身房会员',
    sentences:[ S('105-1','Hi, I\'m interested in joining the gym. Could you tell me about your membership options?','Hi — interested in joining. Membership options?','你好我想加入健身房。能介绍一下会员选项吗？',3),
      S('105-2','Of course! We have monthly, quarterly, and annual plans. The annual plan works out to be the best value.','Monthly quarterly or annual — annual is best value.','当然！我们有月度、季度和年度计划。年度计划最划算。',3),
      S('105-3','What\'s included in the membership? Are there any classes?','What\'s included — any classes?','会员包含什么？有课程吗？',2),
      S('105-4','All members get unlimited access to the gym floor, pool, sauna, and over forty group classes per week.','Unlimited gym, pool, sauna, and 40+ weekly classes.','所有会员无限次使用健身区、游泳池、桑拿房以及每周四十多节团课。',4),
      S('105-5','That sounds brilliant. Can I have a tour before I decide?','Brilliant — can I have a tour first?','听起来太好了。我能不能先参观一下再做决定？',2),
      S('105-6','Absolutely — let me show you around. We\'re particularly proud of our newly renovated yoga studio.','Let me show you around — proud of our new yoga studio.','当然——我带你看看。我们新装修的瑜伽教室特别让我们自豪。',4),
    ]},

  // ===== NEW SPEECH (5 materials) =====
  { id:'106',title:'科技未来主题演讲',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'AI与人类未来',
    sentences:[ S('106-1','We are living in the most transformative era in human history — and most of us don\'t even realize it.','Most transformative era in history — most don\'t even realize it.','我们正生活在人类历史上最有变革性的时代——而大多数人甚至没意识到。',5),
      S('106-2','Artificial intelligence is not something in the distant future. It is reshaping how we work, learn, and connect right now.','AI is not distant future — reshaping work, learning, connection right now.','人工智能不是什么遥远的未来。它正在此刻重塑我们工作、学习和连接的方式。',5),
      S('106-3','The question is not whether AI will change everything. The question is whether we will guide that change or be swept away by it.','Not whether AI changes everything — whether we guide it or get swept away.','问题不是AI会不会改变一切。问题是我们是引导这种改变还是被它裹挟而去。',5),
      S('106-4','Technology is a tool but humanity is the purpose. Never forget that.','Technology is a tool — humanity is the purpose.','技术是工具但人才是目的。永远别忘了这一点。',3),
    ]},
  { id:'107',title:'女性领导力演讲',category:'speech',difficulty:'intermediate',accent:'UK',totalDuration:55,description:'鼓励女性勇敢领导',
    sentences:[ S('107-1','Leadership is not about being the loudest voice in the room. It\'s about making sure every voice is heard.','Leadership isn\'t the loudest voice — it\'s making every voice heard.','领导力不是要成为房间里最响亮的声音。而是要确保每个声音都被听到。',4),
      S('107-2','To every young woman watching: your perspective is not a soft skill. It is a strategic advantage.','Your perspective is not a soft skill — it is a strategic advantage.','致每一位在看的年轻女性：你的视角不是什么软技能。而是战略优势。',4),
      S('107-3','The glass ceiling won\'t shatter by itself. We shatter it every single day by showing up, speaking up, and lifting each other up.','The glass ceiling won\'t shatter itself — we shatter it by showing up and speaking up.','玻璃天花板不会自己碎裂。我们每天通过出现、发声和互相扶持来击碎它。',5),
      S('107-4','The future of leadership is not male or female. It is human. It is inclusive. It is now.','Future of leadership is human, inclusive, and now.','未来的领导力不是男性或女性。而是人性、包容和当下。',3),
    ]},
  { id:'108',title:'教育的力量演讲',category:'speech',difficulty:'intermediate',accent:'US',totalDuration:50,description:'教育改变命运',
    sentences:[ S('108-1','Education is the only thing that no one can ever take away from you.','Education is the one thing nobody can take from you.','教育是唯一没人能从你身上夺走的东西。',3),
      S('108-2','I grew up in a village with no library no internet and no electricity after sunset — but I had a teacher who believed in me.','Grew up in a village with nothing — but had a teacher who believed in me.','我在一个没有图书馆、没有网络、日落之后没有电的村庄长大——但我有一位相信我的老师。',6),
      S('108-3','One book one teacher one moment of inspiration can alter the entire trajectory of a life.','One book one teacher one moment can change a life.','一本书一位老师一瞬间的启发就能彻底改变人生的轨迹。',4),
      S('108-4','Invest in education and you invest in the only proven path from poverty to possibility.','Invest in education — the only proven path from poverty to possibility.','投资教育就是投资从贫困通往可能的唯一验证过的道路。',3),
    ]},
  { id:'109',title:'创业心得分享',category:'speech',difficulty:'advanced',accent:'US',totalDuration:55,description:'创业者的经验教训',
    sentences:[ S('109-1','When I started my first company I had no money no connections and absolutely no idea what I was doing.','Started my first company with no money, no connections, no idea what I was doing.','我创办第一家公司时没钱、没人脉、完全不知道自己到底在做什么。',5),
      S('109-2','The first two ventures failed spectacularly. The third one barely survived. The fourth one changed my life.','First two failed spectacularly. Third barely survived. Fourth changed my life.','前两次创业惨败。第三次勉强存活。第四次改变了我的人生。',5),
      S('109-3','Here is what nobody tells you about success: it is not a straight line. It is a zigzag of failures stitched together by perseverance.','Success is not a straight line — it is failures stitched together by perseverance.','关于成功没人告诉你的是：它不是一条直线。而是由坚持串连起来的失败之字形。',5),
      S('109-4','The only difference between a failed entrepreneur and a successful one is that the successful one refused to stop.','Difference between failed and successful entrepreneur — the successful one refused to stop.','失败的企业家和成功的企业家之间唯一的区别是——成功的那位拒绝停下来。',4),
    ]},
  { id:'110',title:'感恩主题演讲',category:'speech',difficulty:'intermediate',accent:'UK',totalDuration:50,description:'感恩的智慧',
    sentences:[ S('110-1','Gratitude is not just saying thank you. It is a way of seeing the world.','Gratitude is not just thank you — it is a way of seeing.','感恩不只是说谢谢。它是一种看待世界的方式。',3),
      S('110-2','When you wake up and think of three things you are grateful for you rewire your brain toward joy.','Wake up, think of three things you\'re grateful for — rewire your brain toward joy.','当你醒来并想三件你感恩的事你就把大脑重新连接向了快乐。',4),
      S('110-3','I spent years chasing more — more money more status more recognition. But happiness was hiding in what I already had.','Spent years chasing more — happiness was hiding in what I already had.','我花了多年追逐更多——更多钱、更多地位、更多认可。但幸福一直藏在我已经拥有的事物中。',5),
      S('110-4','The happiest people are not those who have the most but those who appreciate the most.','Happiest people don\'t have the most — they appreciate the most.','最幸福的人不是拥有最多的人而是最懂得感恩的人。',3),
    ]},

  // ===== NEW STORY (6 materials) =====
  { id:'111',title:'小故事：旧书店',category:'story',difficulty:'intermediate',accent:'UK',totalDuration:55,description:'一家旧书店的奇遇',
    sentences:[ S('111-1','Tucked between a laundromat and a kebab shop was a tiny secondhand bookshop that never seemed to have any customers.','Between a laundromat and a kebab shop — a tiny bookshop with no customers.','在洗衣店和烤肉店之间夹着一家小小的二手书店似乎从来没有什么顾客。',5),
      S('111-2','Emma stumbled in to escape the rain and found herself surrounded by the smell of aged paper and distant adventures.','Emma stumbled in escaping rain — surrounded by aged paper and adventures.','Emma为了躲雨闯了进来发现自己被旧纸张和遥远冒险的气味包围。',5),
      S('111-3','The old owner silently handed her a book with a faded cover. It was the exact novel her grandmother used to read to her as a child.','The owner handed her a book — the exact novel her grandmother read to her.','老店主默默递给她一本封面褪色的书。正是她祖母小时候读给她听的那本小说。',5),
      S('111-4','Inside the cover was a handwritten note: To whoever finds this book — may it bring you the same comfort it brought me. Signed, Margaret Chen — her grandmother.','A note inside: To whoever finds this book — may it comfort you as it did me. Signed, her grandmother.','翻开封面里面有一张手写的纸条：致找到这本书的人——愿它带给你曾带给我的安慰。签名：Margaret Chen——她的祖母。',6),
      S('111-5','Some places find you not the other way around.','Some places find you — not the other way around.','有些地方是它们找到你而非你找到它们。',3),
    ]},
  { id:'112',title:'小故事：漂流瓶',category:'story',difficulty:'beginner',accent:'US',totalDuration:45,description:'一个漂流瓶的旅程',
    sentences:[ S('112-1','Ten-year-old Maya threw a glass bottle into the ocean during a family trip to the beach in California.','Ten-year-old Maya threw a bottle into the ocean at a California beach.','十岁的Maya在加州海滩家庭旅行时把一个玻璃瓶扔进了大海。',4),
      S('112-2','Inside was a short letter: If you find this please write back — I want to know where the ocean takes my words.','A letter inside: If you find this write back — I want to know where the ocean takes my words.','里面有一封短信：如果你找到了请回信——我想知道大海会把我的话带到哪里。',5),
      S('112-3','Seven years later she received an email from a fisherman in Japan. The bottle had traveled over five thousand miles across the Pacific.','Seven years later an email from a fisherman in Japan — the bottle traveled 5000 miles.','七年后她收到日本一位渔民的邮件。瓶子横跨太平洋旅行了超过五千英里。',5),
      S('112-4','They became pen pals. Three years after that Maya flew to Japan and married him.','They became pen pals — three years later she married him.','他们成了笔友。三年后Maya飞到了日本嫁给了他。',3),
      S('112-5','Never underestimate where a small act of curiosity can lead you.','Never underestimate small curiosity.','永远不要低估一个好奇心的小举动能带你走向何方。',3),
    ]},
  { id:'113',title:'小故事：父亲的工具箱',category:'story',difficulty:'intermediate',accent:'US',totalDuration:55,description:'工具箱里的人生课',
    sentences:[ S('113-1','My father was not a man of many words. He said what he needed to say through his hands.','Father wasn\'t a man of words — he spoke through his hands.','我父亲不是一个话多的人。他通过双手表达想说的话。',3),
      S('113-2','His toolbox was his library. Each tool had a story — the hammer that built our porch, the wrench that fixed my first bike, the measuring tape that mapped out my mother\'s garden.','His toolbox was his library — each tool had a story.','他的工具箱就是他的图书馆。每样工具都有故事。',5),
      S('113-3','When he passed away I inherited that rusty red toolbox. For months I couldn\'t bring myself to open it.','When he passed I inherited the rusty red toolbox — couldn\'t open it for months.','他去世后我继承了那个生锈的红色工具箱。好几个月我都不敢打开它。',4),
      S('113-4','When I finally did I found a small notebook tucked beneath the screwdrivers. On every page he had written lessons he wanted me to remember.','Inside a notebook beneath the screwdrivers — lessons he wanted me to remember.','当我终于打开时在螺丝刀下面发现了一个小笔记本。每一页都写着他希望我记住的人生道理。',5),
      S('113-5','The last entry read: The best tool I ever had was being your father.','Last entry: The best tool I ever had was being your father.','最后一条写道：我拥有过最好的工具是当你爸爸。',4),
    ]},
  { id:'114',title:'小故事：灯塔守护者',category:'story',difficulty:'advanced',accent:'UK',totalDuration:55,description:'一位灯塔守护者的独白',
    sentences:[ S('114-1','For forty-seven years Thomas had lived alone on the island keeping the lighthouse burning through storms and silence.','Forty-seven years alone on the island — keeping the lighthouse burning.','四十七年Thomas独自住在岛上在暴风雨和寂静中保持灯塔常亮。',4),
      S('114-2','People called it the loneliest job in the world. Thomas called it the most important.','People called it the loneliest job — Thomas called it the most important.','人们说这是世界上最孤独的工作。Thomas说这是最重要的。',3),
      S('114-3','He kept a logbook every single day. Not of weather or ships but of the sunsets he watched and the birds that visited him.','A logbook every day — not of weather but of sunsets and visiting birds.','他每天写日志。不是记录天气或船只而是记录他看过的日落和拜访他的鸟。',5),
      S('114-4','On his last day before retirement the entire coastal town sailed out to thank him — a fleet of small boats each flashing their lights in tribute.','Last day — the whole town sailed out each boat flashing lights in tribute.','退休前的最后一天整个沿海小镇的人都开船出来感谢他——一支小船队每艘都闪着灯致敬。',5),
      S('114-5','The lighthouse keeper who spent his life guiding others home was finally guided home himself by the very people he protected.','The keeper who guided others home was guided home himself by those he protected.','这位毕生指引别人回家的灯塔守护者终于被他保护过的人们送回了家。',5),
    ]},
  { id:'115',title:'小故事：小提琴',category:'story',difficulty:'intermediate',accent:'US',totalDuration:55,description:'一把小提琴的旅程',
    sentences:[ S('115-1','In a dusty pawn shop in Vienna a young street musician found a battered violin with a faded label inside: Cremona 1715.','A dusty pawn shop in Vienna — a battered violin with a label: Cremona 1715.','在维也纳一家积满灰尘的当铺里一位年轻的街头艺人发现了一把破旧的小提琴里面的标签已褪色：Cremona 1715。',5),
      S('115-2','He paid two hundred euros — all the money he had saved from months of busking.','Paid two hundred euros — all he had from months of busking.','他付了两百欧元——那是他街头卖艺好几个月攒下的所有钱。',3),
      S('115-3','He took it to a restorer who after examining it for three hours called him with a trembling voice.','The restorer examined it for three hours then called with a trembling voice.','他拿去给修复师看了三个小时后修复师用颤抖的声音打来电话。',4),
      S('115-4','The violin was authentic — made by the same hands that crafted instruments for kings. It was worth over two million euros.','Authentic — made by the hands that crafted instruments for kings. Worth over two million.','小提琴是真品——出自曾为国王制作乐器的大师之手。价值超过两百万欧元。',4),
      S('115-5','But he did not sell it. He played it every day in the same square sharing the sound of centuries with anyone who would stop and listen.','He didn\'t sell it — played it every day sharing centuries of sound with anyone who listened.','但他没有卖掉它。他每天在同一个广场上演奏与任何驻足聆听的人分享几个世纪的声音。',5),
    ]},
  { id:'116',title:'小故事：樱花树',category:'story',difficulty:'beginner',accent:'UK',totalDuration:45,description:'樱花树下的约定',
    sentences:[ S('116-1','When Akiko was seven her grandmother planted a cherry blossom tree with her in the garden.','When Akiko was seven Grandmother planted a cherry tree with her.','Akiko七岁时祖母和她在花园里种了一棵樱花树。',3),
      S('116-2','Grandmother said: This tree will grow with you. Visit it every spring and it will remind you how beautiful change can be.','Grandmother said: This tree grows with you — visit every spring and see how beautiful change is.','祖母说：这棵树会和你一起长大。每年春天来看看它它会提醒你变化有多美。',4),
      S('116-3','Akiko went to university traveled the world and built a career. But every April she came home to sit under her tree.','Akiko traveled the world — but every April she came home to her tree.','Akiko上大学环游世界建立事业。但每年四月她都会回家坐在树下。',4),
      S('116-4','At ninety-two her grandmother passed away during cherry blossom season. The petals fell like pink snow as they said goodbye.','Grandmother passed at 92 during cherry blossom season — petals fell like pink snow.','九十二岁时祖母在樱花季离开了。告别时花瓣如粉色雪花般飘落。',4),
      S('116-5','Akiko now plants a cherry tree with every grandchild born in the family. There are fourteen trees now — a forest of love across three generations.','Akiko now plants a cherry tree for every grandchild — fourteen trees, a forest of love.','Akiko现在为家族每一个孙辈种一棵樱花树。如今已有十四棵——横跨三代的爱的森林。',5),
      S('116-6','Some roots run deeper than memory.','Some roots run deeper than memory.','有些根扎得比记忆还深。',2),
    ]},

  // ===== PAD PRACTICE (1 material) =====
  { id:'117',title:'跟读基础训练',category:'daily',difficulty:'beginner',accent:'US',totalDuration:50,description:'影子跟读基础训练句子合集',
    sentences:[
      S("pad-1","Practice makes perfect — keep shadowing this sentence.","Practice makes perfect — keep shadowing this sentence.","熟能生巧——继续跟读这个句子。",3),
      S("pad-2","Take your time and focus on the pronunciation.","Take your time and focus on the pronunciation.","慢慢来专注于发音。",3),
      S("pad-3","Listen carefully to the intonation and rhythm.","Listen carefully to the intonation and rhythm.","仔细听语调和节奏。",3),
      S("pad-4","Try to mimic the native speaker as closely as possible.","Try to mimic the native speaker as closely as possible.","尽可能模仿母语者的发音。",4),
      S("pad-5","Repeat this sentence until it feels natural.","Repeat this sentence until it feels natural.","重复这个句子直到感觉自然。",3),
      S("pad-6","Pay attention to how words connect together in speech.","Pay attention to how words connect together in speech.","注意词语在口语中如何连读。",4),
      S("pad-7","Reading aloud is one of the best ways to improve fluency.","Reading aloud is one of the best ways to improve fluency.","大声朗读是提高流利度最好的方法之一。",5),
      S("pad-8","Your accent will improve with consistent daily practice.","Your accent will improve with consistent daily practice.","坚持每天练习你的口音会改善的。",4),
      S("pad-9","Shadowing helps you internalize the rhythm of English.","Shadowing helps you internalize the rhythm of English.","影子跟读帮你内化英语的节奏。",4),
      S("pad-10","Do not worry about being perfect — just keep going.","Do not worry about being perfect — just keep going.","不要担心完美——继续前进就好。",4),
      S("pad-11","The more you shadow the more confident you will become.","The more you shadow the more confident you will become.","跟读越多你就会变得越自信。",4),
      S("pad-12","Focus on one sentence at a time and master it completely.","Focus on one sentence at a time and master it completely.","一次专注一个句子并完全掌握它。",4),
      S("pad-13","Record yourself and compare with the original audio.","Record yourself and compare with the original audio.","录下自己的声音与原音频对比。",4),
      S("pad-14","Speed comes naturally after accuracy is achieved.","Speed comes naturally after accuracy is achieved.","准确之后速度自然会来。",3),
      S("pad-15","Celebrate small victories — every sentence mastered counts.","Celebrate small victories — every sentence mastered counts.","庆祝小胜利——每掌握一个句子都算数。",4)
    ]},

];