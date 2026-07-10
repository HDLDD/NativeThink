import { useState, useRef, useEffect } from 'react';
import {
  PenLine,
  Send,
  Sparkles,
  Loader2,
  Clock,
  BarChart3,
  FileText,
  Lightbulb,
  CheckCircle2,
  ChevronDown,
  Timer,
  Hash,
  RefreshCw,
  Bot,
  Wand2,
  Volume2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { capabilityClient } from '@lark-apaas/client-toolkit-lite';
import { toast } from 'sonner';
import { PLUGIN_IDS } from '@/lib/plugin-ids';
import { useLearningStats } from '@/lib/use-learning-stats';
import { Heart } from 'lucide-react';
import { useFavorites } from '@/lib/use-favorites';
import { useAI } from '@/hooks/use-ai';
import { useTTS } from '@/lib/use-tts';
import { usePageMemory } from '@/lib/use-page-memory';
import { safeStorage } from '@/lib/safe-storage';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface IWritingPrompt {
  id: string;
  title: string;
  description: string;
  category: string;
  wordLimit: { min: number; max: number };
  difficulty: string;
  tips: string[];
}

const WRITING_PROMPTS: IWritingPrompt[] = [
  {
    id: '1',
    title: '描述一次难忘的旅行',
    description: '写一段关于你最难忘的一次旅行经历。描述你去了哪里、和谁一起、发生了什么让你印象深刻的事。',
    category: '日常叙事',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'beginner',
    tips: ['使用过去时态', '尝试用感官描述（看到的、听到的、闻到的）', '加入至少 2 个情感词汇'],
  },
  {
    id: '2',
    title: '你理想的职业是什么？',
    description: '描述你理想中的职业，包括为什么选择它、它吸引你的地方、以及你为此做了什么准备。',
    category: '观点表达',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'intermediate',
    tips: ['开头先给出中心观点', '使用因果连接词 (because, therefore, as a result)', '用具体例子支撑你的观点'],
  },
  {
    id: '3',
    title: '给新同事写一封欢迎邮件',
    description: '你所在的团队来了一位新同事。请写一封欢迎邮件，介绍团队、日常工作安排，并表达你的欢迎。',
    category: '职场写作',
    wordLimit: { min: 20, max: 9999 },
    difficulty: 'beginner',
    tips: ['使用半正式的语气', '分段组织：欢迎→团队介绍→工作安排→再次欢迎', '结尾加上 offer to help'],
  },
  {
    id: '4',
    title: '社交媒体对年轻人的影响',
    description: '写一段关于社交媒体对年轻人生活影响的分析，可以从社交、学习、心理健康等角度展开。',
    category: '议论文',
    wordLimit: { min: 15, max: 9999 },
    difficulty: 'advanced',
    tips: ['从正反两方面分析', '使用复杂句式提升表达质量', '引用具体研究或数据支撑论点'],
  },
  {
    id: '5',
    title: '推荐一本你喜欢的书',
    description: '向你的一位朋友推荐一本你最喜欢的书。说明你为什么喜欢这本书以及为什么他认为也值得一读。',
    category: '日常叙事',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'beginner',
    tips: ['开头吸引注意力', '简述书的主题但不要剧透', '用 personal experience 来增强说服力'],
  },
  {
    id: '6',
    title: '远程办公 vs 办公室办公',
    description: '比较远程办公和在办公室办公各自的优缺点，并给出你的倾向和理由。',
    category: '观点表达',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'intermediate',
    tips: ['使用比较结构 (on the one hand...on the other hand)', '每个观点要有支撑细节', '结论部分清晰表达自己立场'],
  },
  {
    id: '7',
    title: '写一封投诉邮件',
    description: '你购买的产品出现了质量问题，请写一封正式的投诉邮件给客服部门。',
    category: '职场写作',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'intermediate',
    tips: ['保持礼貌但坚定的语气', '清楚描述问题和你的期望', '提供订单号和购买日期等关键信息'],
  },
  {
    id: '8',
    title: '人工智能会取代人类工作吗？',
    description: '阐述你对 AI 对就业市场影响的看法，哪些工作最可能被替代，人类应该如何应对。',
    category: '议论文',
    wordLimit: { min: 50, max: 9999 },
    difficulty: 'advanced',
    tips: ['使用条件句和假设语气', '提供具体行业案例', '给出有建设性的结论和建议'],
  },
  {
    id: '9',
    title: '描述你理想中的一天',
    description: '从早到晚，描述你理想中的完美一天。不用考虑现实限制，纯粹写你想要的。',
    category: '日常叙事',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'beginner',
    tips: ['按时间顺序叙述', '使用感官细节让描述更生动', '用现在时让你的描述更有代入感'],
  },
  {
    id: '10',
    title: '写一封感谢信',
    description: '给你生活中重要的一个人写一封感谢信，表达你对他/她的感激。',
    category: '职场写作',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'beginner',
    tips: ['用具体的事例和细节表达感谢', '使用真诚而非夸张的语言', '可以回忆一个对你影响深远的具体时刻'],
  },
  {
    id: '11',
    title: '电子书会取代纸质书吗？',
    description: '分析电子书和纸质书各自的优缺点，并说明你是否认为电子书会完全取代纸质书。',
    category: '议论文',
    wordLimit: { min: 15, max: 9999 },
    difficulty: 'intermediate',
    tips: ['从阅读体验、成本、环保等多个角度分析', '加入个人阅读习惯作为例证', '结论要有深度而非简单的二选一'],
  },
  {
    id: '12',
    title: '描述你的家乡',
    description: '向一位从未去过你家乡的外国朋友介绍你的家乡。包括地理、文化、美食和你最喜欢的地方。',
    category: '日常叙事',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'intermediate',
    tips: ['使用生动的形容词描述景色和氛围', '加入至少一个有趣的文化细节或习俗', '表达你对家乡的感情让文章更有温度'],
  },
  {
    id: '13',
    title: '如何保持工作与生活的平衡？',
    description: '讨论现代社会中工作与生活平衡的重要性，分享一些实用建议。',
    category: '观点表达',
    wordLimit: { min: 15, max: 9999 },
    difficulty: 'intermediate',
    tips: ['先分析问题产生的原因', '提供具体的实践建议而非空谈', '可以加入个人经历增强说服力'],
  },
  {
    id: '14',
    title: '写一份个人年度总结',
    description: '回顾过去一年你的成长、收获和不足，并写下对新一年的目标和期望。',
    category: '职场写作',
    wordLimit: { min: 15, max: 9999 },
    difficulty: 'intermediate',
    tips: ['使用过去时总结已完成的事', '用将来时写计划和目标', '设置可量化的具体目标而非模糊的愿望'],
  },
  {
    id: '15',
    title: '城市生活还是乡村生活？',
    description: '比较城市和乡村生活的优缺点，并说明你更倾向于哪一个以及为什么。',
    category: '观点表达',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'beginner',
    tips: ['从多个维度比较：交通、环境、社交、工作机会', '使用比较级和对比结构', '给出明确的个人偏好和理由'],
  },
  {
    id: '16',
    title: '第一次学会某件事的经历',
    description: '描述你第一次学会一项技能的经历（比如骑车、游泳、编程、做菜等）。',
    category: '日常叙事',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'beginner',
    tips: ['描述开始时的困难和挫折感', '写出突破关键点的那个瞬间', '以收获和感悟结尾'],
  },
  {
    id: '17',
    title: '为新产品写一段英文宣传文案',
    description: '你正在为一个新产品做市场推广。请写一段引人注目的英文宣传文案。',
    category: '职场写作',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'intermediate',
    tips: ['用有力的开头抓住读者注意', '突出产品的核心卖点而非罗列功能', '使用有说服力的形容词和行动号召 (CTA)'],
  },
  {
    id: '18',
    title: '社交媒体的利弊分析',
    description: '分析社交媒体对个人生活和社会的影响，包括正面和负面影响。',
    category: '议论文',
    wordLimit: { min: 50, max: 9999 },
    difficulty: 'advanced',
    tips: ['从个人和社会两个层面分析', '使用过渡词连接正反观点', '结尾提出建设性建议而非简单批判'],
  },
  {
    id: '19',
    title: '给你欣赏的一位公众人物写一封信',
    description: '选择一位你欣赏的公众人物（作家、演员、企业家等），写一封信表达你的敬意。',
    category: '日常叙事',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'intermediate',
    tips: ['简要介绍自己以及为什么写信', '具体说明他/她的什么作品或行为影响了你', '保持礼貌和真诚的语气'],
  },
  {
    id: '20',
    title: '你的时间管理方法',
    description: '分享你日常如何管理时间和提高效率的方法和经验。',
    category: '观点表达',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'intermediate',
    tips: ['分享至少2-3个具体的方法', '解释每个方法为什么有效', '可以提一两个失败的尝试及其反思'],
  },
  {
    id: '21',
    title: '描述一个改变你人生的瞬间',
    description: '描述你人生中一个重要的转折点——可能是遇到了某个人、做了某个决定或是经历了某件事。',
    category: '日常叙事',
    wordLimit: { min: 15, max: 9999 },
    difficulty: 'intermediate',
    tips: ['先铺垫当时的背景和状态', '详细描写那个转折时刻的细节', '对比改变前后你的变化'],
  },
  {
    id: '22',
    title: '给新员工写一份入职指南',
    description: '你负责写一份给新入职同事的欢迎指南，帮助他们快速融入团队。',
    category: '职场写作',
    wordLimit: { min: 25, max: 9999 },
    difficulty: 'beginner',
    tips: ['使用友好和鼓励的语气', '分段介绍公司文化、团队习惯和实用信息', '以欢迎语结尾并留下联系方式'],
  },
  {
    id: '23',
    title: '旅行更重要还是读书更重要？',
    description: '比较旅行和读书两种增长见识的方式，讨论各自的独特价值。',
    category: '议论文',
    wordLimit: { min: 15, max: 9999 },
    difficulty: 'advanced',
    tips: ['辩证地看待：各有不可替代的价值', '用具体例子说明每种方式的独特之处', '提出两者如何结合的建议'],
  },
  {
    id: '24',
    title: '你如何看待 gap year？',
    description: '阐述你对间隔年的看法——是浪费时间还是宝贵的成长经历？',
    category: '观点表达',
    wordLimit: { min: 30, max: 9999 },
    difficulty: 'intermediate',
    tips: ['先定义你理解的 gap year', '从学习、工作和个人成长三个角度分析', '支持或反对都要给出充分理由'],
  },
  { id:'25', title:'描述你最害怕的一次经历', description:'讲述一次让你非常害怕的经历以及你是怎么克服恐惧的。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述当时的生理感受','写出你是如何应对的','以反思和感悟结尾'] },
  { id:'26', title:'如果时间可以倒流', description:'如果你可以回到过去改变一件事，你会改变什么？为什么？', category:'日常叙事', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['使用虚拟语气','描述改变前后的对比','思考改变带来的连锁反应'] },
  { id:'27', title:'描述你最好的朋友', description:'用英语描述你最好的一位朋友——你们是怎么认识的，为什么他/她对你很重要。', category:'日常叙事', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['描述外貌和性格特征','写一个你们之间的难忘故事','解释为什么这段友谊特殊'] },
  { id:'28', title:'童年最喜欢的一个玩具', description:'回忆童年时期你最喜欢的玩具或物品，描述它对你的意义。', category:'日常叙事', wordLimit:{min:60,max:180}, difficulty:'beginner', tips:['用过去时态描述','具体描述玩具的外观和玩法','写出它对你的情感意义'] },
  { id:'29', title:'你最想去的国家', description:'描述一个你最想去但还没去过的国家，解释为什么你对它如此着迷。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述你对这个国家的想象','可以从文化、美食、风景等角度展开','表达你的期待和计划'] },
  { id:'30', title:'写一封信给十年后的自己', description:'给十年后的自己写一封信，说说现在的你以及你对未来的期望。', category:'日常叙事', wordLimit:{min:100,max:280}, difficulty:'intermediate', tips:['用现在时描述当前生活','对未来做出具体的猜想','可以问未来自己一些问题'] },
  { id:'31', title:'如果我会隐身术', description:'如果你有一天获得了隐身的能力，你会做什么？', category:'日常叙事', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['发挥创意想象力','描述具体的使用场景','考虑能力的利弊'] },
  { id:'32', title:'我做过最疯狂的事', description:'描述你曾经做过的一件最疯狂或最大胆的事情。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'intermediate', tips:['先用一句话概括事件','详细描述经过和当时的感受','说明事后你有什么感悟'] },
  { id:'33', title:'描述一种你最喜欢的食物', description:'向外国朋友介绍一种你最喜欢的食物——它是什么味道、怎么做的、什么时候吃。', category:'日常叙事', wordLimit:{min:60,max:180}, difficulty:'beginner', tips:['使用感官词汇描述味道和香气','可以简单介绍制作过程','表达你对这种食物的感情'] },
  { id:'34', title:'手机对日常生活的影响', description:'讨论智能手机如何改变了人们的日常生活——从工作和社交到健康和睡眠。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['从正面和负面影响两方面分析','用具体例子支撑你的观点','结尾提出合理使用手机的建议'] },
  { id:'35', title:'你支持还是反对网络实名制？', description:'讨论网络实名制的利弊，说明你的立场和理由。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'advanced', tips:['清晰地陈述正反方观点','考虑隐私和安全的平衡','用逻辑而非情感来论证'] },
  { id:'36', title:'快餐文化是好是坏？', description:'分析快餐文化对现代社会的影响——从饮食健康到生活方式。', category:'议论文', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['考虑健康、经济和便利性三个维度','避免极端化的判断','提出更健康的替代方案'] },
  { id:'37', title:'你觉得幸福是什么？', description:'用你自己的经历和理解来定义什么是幸福——幸福可以很宏大也可以很简单。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['不要只给定义，要用事例说明','可以从日常生活的小确幸入手','比较不同文化对幸福的理解'] },
  { id:'38', title:'描述一种你想学习的技能', description:'描述一种你想学习但还没开始学的技能，解释为什么想学和你的学习计划。', category:'观点表达', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['解释为什么这项技能吸引你','说明学会后你的生活会有什么改变','给出大致的学习计划'] },
  { id:'39', title:'养宠物对孩子成长有帮助吗？', description:'讨论养宠物对儿童成长的正面和负面影响。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['从责任感、同理心、健康等角度分析','考虑不同年龄段孩子的差异','分享你自己的经历或见闻'] },
  { id:'40', title:'出国留学的利与弊', description:'分析出国留学的优势和挑战，以及什么样的人更适合出国留学。', category:'观点表达', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['从教育质量、文化体验、经济成本等多角度分析','避免一边倒的判断','给读者提供实际的决策参考'] },
  { id:'41', title:'写一篇自我介绍', description:'用英文写一篇正式的自我介绍，可以用于社交场合或求职面试。', category:'职场写作', wordLimit:{min:60,max:180}, difficulty:'beginner', tips:['简要介绍背景和经历','突出自己的优势和特点','以积极的态度收尾'] },
  { id:'42', title:'写一封求职信', description:'为你心仪的一个职位写一封英文求职信，展示你的能力和热情。', category:'职场写作', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['第一段说明应聘职位和来源','用具体例子展示能力','表达对公司的了解和加入的理由'] },
  { id:'43', title:'给同事写一封感谢邮件', description:'你的同事在某件事上帮了你大忙，写一封感谢邮件表达你的感激。', category:'职场写作', wordLimit:{min:60,max:150}, difficulty:'beginner', tips:['具体说明对方帮了你什么','表达真诚的感谢','表达未来愿意回报的意愿'] },
  { id:'44', title:'写一份会议纪要', description:'模拟你参加了一次重要的项目会议，写一份简洁明了的英文会议纪要。', category:'职场写作', wordLimit:{min:80,max:200}, difficulty:'intermediate', tips:['列出参会人员和会议时间','用bullet points总结关键讨论点','明确行动项、负责人和截止日期'] },
  { id:'45', title:'写一份英文简历中的个人简介', description:'用简洁有力的语言写一段英文简历中的个人简介部分。', category:'职场写作', wordLimit:{min:40,max:120}, difficulty:'intermediate', tips:['第一句概括你的职业身份','用3-4句突出核心技能和成就','保持专业和简洁'] },
  { id:'46', title:'描述你最喜欢的一个节日', description:'介绍你最喜欢的一个节日——节日的起源、习俗以及你对它的特别感情。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['介绍节日的历史背景','描述节日的传统活动','分享你个人的节日记忆'] },
  { id:'47', title:'健康的生活方式重要吗？', description:'讨论健康生活方式的重要性以及普通人在日常生活中可以做出的改变。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'beginner', tips:['从饮食、运动、睡眠、心理健康四方面展开','给出现实可行的建议','避免说教式的语气'] },
  { id:'48', title:'描述你遇到过的一个困难时刻', description:'描述你人生中遇到的某一个困难时刻，你是如何面对并克服它的。', category:'日常叙事', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['先说明背景和困难是什么','重点描写应对的过程和心路历程','以积极的反思和成长结尾'] },
  { id:'49', title:'写一篇关于勇气的小文章', description:'你如何定义勇气？分享一个关于勇气的小故事——可以是你的也可以是别人的。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['先给勇气下你的定义','用故事来诠释定义','区分勇气和鲁莽'] },
  { id:'50', title:'描述你每天的通勤经历', description:'描述你每天上下班/上下学的通勤经历——你看到了什么、想到了什么。', category:'日常叙事', wordLimit:{min:60,max:180}, difficulty:'beginner', tips:['用感官描写让画面生动','可以写通勤途中有趣的观察','表达你对通勤的感受'] },
  { id:'51', title:'成功是努力还是运气？', description:'在你看来一个人的成功更多是来自努力还是运气？用论据和例子支撑你的观点。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'advanced', tips:['先定义成功','分析努力和运气各自的角色','用知名人物或自己的例子论证'] },
  { id:'52', title:'描述你理想中的家', description:'用英文描述你理想中的家的样子——房子、装饰、氛围和住在里面的人。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['从外到内地描述空间','加入细节让画面感更强','表达家给你的感觉和意义'] },
  { id:'53', title:'外表重要吗？', description:'讨论外表在当今社会中的重要性——是太过被看重了还是合理的社交资本？', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['从社交、职场、心理学等角度分析','讨论"以貌取人"的社会代价','提出平衡内外在的观点'] },
  { id:'54', title:'写一篇环保倡议书', description:'选择你关心的一个环境问题（塑料污染、气候变化等），写一篇环保倡议。', category:'职场写作', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['用具体数据说明问题的严重性','提出可行的个人行动建议','用有感染力的语言号召行动'] },
  { id:'55', title:'你如何看待竞争？', description:'讨论竞争在学习和工作中的正面和负面影响——竞争是动力还是压力？', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['分析健康竞争和不健康竞争的区别','从个人经历出发','考虑合作与竞争的平衡'] },
  { id:'56', title:'描述你最尴尬的一个瞬间', description:'用幽默的方式分享你人生中最尴尬的一个时刻。', category:'日常叙事', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['用轻松的语调来写','详细描述当时的场景','以自嘲和反思收尾'] },
  { id:'57', title:'线上学习能替代课堂学习吗？', description:'分析在线教育和传统课堂教育各自的优势和局限。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['从互动性、灵活性、效果等维度比较','考虑不同年龄段和学科的需求','给出未来的发展趋势判断'] },
  { id:'58', title:'你认为什么是真正的朋友？', description:'定义什么是真正的友谊——真正的朋友应该具备哪些品质？', category:'观点表达', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['从信任、支持、真诚等角度描绘','用具体的故事说明抽象概念','比较真朋友和普通朋友的区别'] },
  { id:'59', title:'写一篇电影观后感', description:'选一部你最近看的电影，用英文写一篇观后感——剧情、演员和你的感受。', category:'日常叙事', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['简要介绍电影但不剧透太多','分析最打动你的场景','给出你推荐或不推荐的理由'] },
  { id:'60', title:'向外国朋友介绍一种中国习俗', description:'选择一个你认为最有意思的中国传统习俗，向外国朋友介绍它。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'intermediate', tips:['介绍习俗的起源和历史','描述具体的做法和流程','解释习俗的文化意义'] },
  { id:'61', title:'自由职业 vs 稳定工作', description:'比较自由职业和传统稳定工作各自的优缺点，以及哪种更适合你。', category:'观点表达', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['从收入稳定性和自由度两方面比较','考虑不同性格的适配性','给出你的个人偏好和理由'] },
  { id:'62', title:'如何应对压力？', description:'分享你应对压力和焦虑的方法——哪些方法对你有效，哪些无效。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['描述压力的来源和表现','分享至少3个具体应对方法','鼓励读者找到适合自己的方式'] },
  { id:'63', title:'写一封道歉信', description:'你因为某件事需要向一位朋友道歉，写一封真诚的道歉信。', category:'职场写作', wordLimit:{min:60,max:160}, difficulty:'beginner', tips:['承认错误并真诚道歉','不要推卸责任或找太多借口','表达你未来会如何改进'] },
  { id:'64', title:'描述一次难忘的生日', description:'描述你最难忘的一个生日——你那年多大了？发生了什么特别的事？', category:'日常叙事', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['描述当时的场景和氛围','写出让你难忘的具体原因','表达你对那个生日的感受'] },
  { id:'65', title:'无现金社会的利弊', description:'分析无现金支付对社会生活的影响——便利性与隐私安全的权衡。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'advanced', tips:['从效率、安全和包容性三个角度分析','考虑老年人和贫困人群的实际困难','给出平衡的建议'] },
  { id:'66', title:'写一段关于团队合作的感想', description:'结合你的个人经历，写一段关于团队合作重要性的感想。', category:'观点表达', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['分享一个具体的团队合作经历','分析这次经历中成功或失败的原因','总结你对团队合作的看法'] },
  { id:'67', title:'你认为运气在人生中有多重要？', description:'讨论运气和努力在人生成就中的相对重要性——你是相信命运还是相信奋斗？', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['给出你对运气的定义','区分准备和机遇的关系','用例子说明运气可以被创造'] },
  { id:'68', title:'写一份活动策划方案', description:'为你想要组织的一个活动（派对、团建、义卖等）写一份英文策划方案。', category:'职场写作', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['明确活动目标和受众','列出时间安排和预算','包含风险预案和备选方案'] },
  { id:'69', title:'描述你梦想中的旅行', description:'如果预算和时间都不是问题，你梦想中的旅行是什么样的？', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述具体的目的地和行程','写出你想体验的活动','表达为什么这是你的梦想之旅'] },
  { id:'70', title:'社交媒体让人更孤独吗？', description:'分析社交媒体对人际关系和心理健康的影响——拉近还是疏远了人？', category:'议论文', wordLimit:{min:120,max:300}, difficulty:'advanced', tips:['从线上互动和线下关系的区别入手','引用心理学研究中的数据或趋势','提出健康使用社交媒体的建议'] },
  { id:'71', title:'描述一位对你影响很大的老师', description:'写一位在你人生中对你影响深远的老师——他/她教会了你什么。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述这位老师的教学风格或人格魅力','写出他/她对你产生的具体影响','表达你的感激之情'] },
  { id:'72', title:'自律比天赋更重要吗？', description:'讨论自律和天赋在成功道路上的相对重要性。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['先定义自律和天赋','用具体例子来说明你的论点','考虑两者如何互相补充'] },
  { id:'73', title:'写一篇关于诚实的短文', description:'诚实真的永远是最好的选择吗？讨论诚实的重要性和它的灰色地带。', category:'议论文', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['区分诚实与伤害他人','考虑不同文化对诚实的理解','用现实生活中的两难情境来探讨'] },
  { id:'74', title:'给未来的老板写一封自荐信', description:'假设你要申请一个理想职位，写一封英文自荐信说明为什么你是最佳人选。', category:'职场写作', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['突出你的独特优势','用数据和成果说话而非空洞的形容词','展现你对行业的理解'] },
  { id:'75', title:'描述你最放松的时刻', description:'描述你最感到放松和平静的时刻——在什么地方，做着什么事。', category:'日常叙事', wordLimit:{min:60,max:180}, difficulty:'beginner', tips:['营造放松的氛围和画面感','使用感官描写','解释为什么这个时刻让你感到放松'] },
  { id:'76', title:'奢侈品消费是理性的吗？', description:'讨论奢侈品消费背后的心理和逻辑——是虚荣、投资还是对品质的追求？', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'advanced', tips:['从社会地位信号和个人满足感两个维度分析','分析奢侈品和普通商品的价值差异','考虑不同收入水平人群的消费逻辑'] },
  { id:'77', title:'向外国朋友推荐一部中国电影', description:'选择一部你最喜欢的中国电影，用英文向不了解中国文化的外国朋友推荐。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'intermediate', tips:['简要介绍电影背景','解释影片中可能的文化元素','说明为什么外国观众也会喜欢'] },
  { id:'78', title:'你是如何保持动力的？', description:'分享当感到缺乏动力时，你是如何让自己重新振作和前进的。', category:'观点表达', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述失去动力时的感受','分享2-3个具体有效的方法','鼓励读者也在低谷中坚持'] },
  { id:'79', title:'写一篇产品使用体验', description:'描述你最近购买或使用的一款产品，分享你的使用体验和评价。', category:'职场写作', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['描述产品的外观和功能','分析优点和缺点','给出综合评分和建议'] },
  { id:'80', title:'城市应该禁止私家车吗？', description:'讨论是否应该在城市中心区域限制或禁止私家车通行。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'advanced', tips:['从环保、交通效率和公民权益三方面分析','考虑公共交通替代方案的可行性','提出折中的方案'] },
  { id:'81', title:'如果可以任意选择一种超能力', description:'如果你可以拥有一种超能力，你会选择什么？如何用它来帮助自己和他人？', category:'日常叙事', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['选一种具体的超能力','描述你会如何每天使用它','思考拥有了超能力后你的责任'] },
  { id:'82', title:'失败教会我的事', description:'分享一次你失败的经历以及你从中学到的宝贵教训。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['坦诚地描述失败的过程','重点在于你学到的东西','用积极的态度看待失败'] },
  { id:'83', title:'写一篇关于友谊的个人随笔', description:'用英文写一篇关于友谊的随笔——你可以聊你对友谊的理解以及你的朋友们。', category:'日常叙事', wordLimit:{min:100,max:280}, difficulty:'intermediate', tips:['用感性的语言表达你对友谊的理解','分享具体的友谊故事','思考友谊随着时间的变化'] },
  { id:'84', title:'外貌焦虑在年轻一代中为何如此普遍？', description:'分析当代年轻人外貌焦虑加剧的原因以及如何克服这种焦虑。', category:'议论文', wordLimit:{min:120,max:300}, difficulty:'advanced', tips:['分析社交媒体和广告的影响','讨论男性和女性面临的不同压力','给出实际可行的改善建议'] },
  { id:'85', title:'你对待金钱的态度是什么？', description:'描述你对金钱的看法——是工具、目标还是其他？以及你的理财习惯。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['从储蓄、消费和投资三方面展开','分享你的理财小技巧','反思金钱与幸福的关系'] },
  { id:'86', title:'写一篇温暖的小故事', description:'自己创作一篇简短的温暖人心的小故事——可以虚构也可以基于真实经历。', category:'日常叙事', wordLimit:{min:100,max:300}, difficulty:'intermediate', tips:['设定清晰的人物和场景','构建一个简单但有情感的情节','以温暖和积极的主题收尾'] },
  { id:'87', title:'怎样才算一个好的领导者？', description:'定义和讨论一个好领导者应该具备的品质——你的领导力榜样是谁？', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['从沟通、决策、同理心等维度分析','用一位真实的领导者作为例子','区分领导力和管理能力'] },
  { id:'88', title:'为你最喜欢的品牌写一篇品牌介绍', description:'选择你最喜欢的品牌，用英文写一篇品牌介绍——品牌故事、核心价值和你喜欢它的原因。', category:'职场写作', wordLimit:{min:80,max:220}, difficulty:'intermediate', tips:['介绍品牌的历史和创立故事','分析品牌的核心竞争力','表达你个人与品牌的共鸣'] },
  { id:'89', title:'假期应该做作业吗？', description:'讨论学生假期是否应该被布置大量作业——休息和学习的平衡在哪？', category:'议论文', wordLimit:{min:100,max:250}, difficulty:'beginner', tips:['从学生身心健康和学习效率的角度分析','提出理想的假期安排建议','考虑不同年级学生的差异'] },
  { id:'90', title:'描述你第一次独自出远门的经历', description:'描述你第一次独自出远门（旅行、上学、出差）的经历和感受。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述出行前的紧张和期待','写出途中遇到的挑战','以成长和收获结尾'] },
  { id:'91', title:'纸质货币会消失吗？', description:'预测未来纸质货币是否会完全消失以及这对社会意味着什么。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['分析数字货币的趋势','考虑技术障碍和隐私问题','探讨对老年人和低收入群体的影响'] },
  { id:'92', title:'你怎样理解终身学习？', description:'讨论终身学习的重要性以及你个人如何践行终身学习的理念。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['解释为什么知识需要不断更新','分享你的学习方法','鼓励读者加入终身学习的行列'] },
  { id:'93', title:'写一篇关于宠物的故事', description:'如果你养过宠物，分享你和它之间的故事；如果没有，写你理想中的宠物。', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['描述宠物的性格和习惯','写出和宠物的互动细节','表达宠物给你带来的快乐'] },
  { id:'94', title:'给未来的室友写一份合住守则', description:'你要和一个新室友开始合住，写一份合住守则让双方相处愉快。', category:'职场写作', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['用友好而非命令的口吻','涵盖公共区域、家务和访客等话题','留出协商和讨论的空间'] },
  { id:'95', title:'活在当下的意义是什么？', description:'讨论"活在当下"这个理念在你的理解中意味着什么以及如何实践。', category:'观点表达', wordLimit:{min:100,max:250}, difficulty:'intermediate', tips:['区分活在当下和只顾眼前的区别','分享让你意识到活在当下的某个瞬间','给出具体的日常练习建议'] },
  { id:'96', title:'描述一个人潮汹涌的场所', description:'描述你在一个人潮拥挤的地方（火车站、演唱会、集市）的体验和感受。', category:'日常叙事', wordLimit:{min:80,max:200}, difficulty:'beginner', tips:['用感官描写刻画人潮的密集','写出你在人群中的心理感受','捕捉一些有趣的细节或瞬间'] },
  { id:'97', title:'广告对我们的影响有多大？', description:'分析广告如何影响消费者的行为和思维方式。', category:'议论文', wordLimit:{min:120,max:280}, difficulty:'intermediate', tips:['从心理诉求和情感营销角度分析','给出被广告影响的个人案例','探讨如何理性消费'] },
  { id:'98', title:'科技让生活更简单还是更复杂？', description:'辩证地分析科技产品对我们生活质量的双重影响。', category:'议论文', wordLimit:{min:120,max:300}, difficulty:'advanced', tips:['从便利性和成瘾性两方面论证','区分不同类型的科技影响','给出个人使用科技的平衡建议'] },
  { id:'99', title:'写一篇关于音乐的文章', description:'描述音乐在你生活中的角色——你喜欢哪种音乐？它对你有什么影响？', category:'日常叙事', wordLimit:{min:80,max:220}, difficulty:'beginner', tips:['介绍你喜欢的音乐风格和歌手','描述听音乐时你的感受','分享一个音乐相关的美好回忆'] },
  { id:'100', title:'十年后的世界会是什么样子？', description:'预测十年后世界在科技、环境、社会等方面可能发生的变化。', category:'议论文', wordLimit:{min:120,max:300}, difficulty:'advanced', tips:['从科技、环境、工作方式等多角度预测','基于当前趋势做合理推断','既要大胆想象也要逻辑自洽'] },
];

export default function WritingPage() {
  const { addStudyMinutes } = useLearningStats();
  const { isConfigured, streamChat: aiStream, chat: aiChat } = useAI();
  const tts = useTTS();
  const [promptTab, setPromptTab] = usePageMemory('writing-prompt-tab', 'all');

  const [selectedPrompt, setSelectedPrompt] = useState<IWritingPrompt | null>(null);
  const [essay, setEssay] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [history, setHistory] = useState<{ prompt: string; essay: string; feedback: string; date: number }[]>([]);
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI generation state
  const [customPrompts, setCustomPrompts] = useState<IWritingPrompt[]>(() => {
    try {
      const saved = safeStorage.getItem('__nativethink_custom_prompts');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist custom prompts to localStorage
  useEffect(() => {
    safeStorage.setItem('__nativethink_custom_prompts', JSON.stringify(customPrompts));
  }, [customPrompts]);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genCategory, setGenCategory] = useState('日常叙事');
  const [genDifficulty, setGenDifficulty] = useState('intermediate');
  const [genTopic, setGenTopic] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  const wordCount = essay.trim() ? essay.trim().split(/\s+/).length : 0;
  const charCount = essay.length;
  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const startWriting = (prompt: IWritingPrompt) => {
    setSelectedPrompt(prompt);
    setEssay('');
    setFeedback('');
    setTimer(0);
    setTimerRunning(true);
    addStudyMinutes(0.5, 'vocabulary');
  };

  const handleSubmit = async () => {
    const text = essay.trim();
    if (!text || !selectedPrompt || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback('');
    setTimerRunning(false);
    addStudyMinutes(3, 'think');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let full = '';

      if (isConfigured) {
        const stream = aiStream(
          [
            {
              role: 'system',
              content: `You are an expert English writing coach. Analyze the user's essay and provide detailed, constructive feedback. Format your response in Markdown:

## 📊 Overall Score
**X/10** — One-sentence summary

## ✅ Strengths
- What worked well
- Good vocabulary/grammar choices

## 🔧 Grammar & Language Corrections
| Original | Correction | Explanation |
|----------|-----------|-------------|

## 🗣️ Naturalness Feedback
- Is the writing natural or does it feel translated?
- Chinglish expressions to fix
- Better alternatives for awkward phrases

## 📝 Structure & Cohesion
- Paragraph organization
- Transition words
- Flow and logic

## 💡 Specific Improvement Suggestions
1. Actionable suggestion 1
2. Actionable suggestion 2
3. Actionable suggestion 3

## 📚 Vocabulary Boost
Suggest 2-3 more advanced or natural alternatives to words used in the essay.`,
            },
            {
              role: 'user',
              content: `Writing task: "${selectedPrompt.title}"\nCategory: ${selectedPrompt.category}\nTarget word count: ${selectedPrompt.wordLimit.min}-${selectedPrompt.wordLimit.max}\n\nMy essay:\n${text}`,
            },
          ],
          { temperature: 0.4, signal: controller.signal },
        );

        for await (const chunk of stream) {
          if (chunk.content) {
            full += chunk.content;
            setFeedback(full);
          }
        }
      } else {
        const stream = capabilityClient
          .load(PLUGIN_IDS.CHINGLISH_DETECTION)
          .callStream('textGenerate', {
            english_sentence: `Writing task: "${selectedPrompt.title}". The user wrote the following essay. Please analyze it for grammar errors, naturalness, and provide improvement suggestions:\n\n${text}\n\nPlease provide feedback in this format:\n1. Overall Score (1-10)\n2. Grammar Corrections\n3. Naturalness Feedback\n4. Specific Improvement Suggestions`,
          });

        for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
          if (chunk.content) {
            full += chunk.content;
            setFeedback(full);
          }
        }
      }

      // Save to history
      setHistory((prev) => [
        ...prev,
        { prompt: selectedPrompt.title, essay: text, feedback: full, date: Date.now() },
      ]);
    } catch (err) {
      toast.error('AI 服务暂不可用，请稍后重试');
      setFeedback('> ⚠️ AI 写作反馈服务暂不可用。以下是一些自检建议：\n\n1. 检查你的文章是否有明显的拼写或语法错误\n2. 确认你是否使用了提示中建议的要点\n3. 尝试大声朗读你的文章来检测不自然的表达');
    } finally {
      setIsSubmitting(false);
      abortRef.current = null;
    }
  };

  const reset = () => {
    setSelectedPrompt(null);
    setEssay('');
    setFeedback('');
    setTimer(0);
    setTimerRunning(false);
  };

  const handleGeneratePrompt = async () => {
    if (!isConfigured) {
      toast.error('请先配置 AI API Key');
      return;
    }
    setGenerating(true);
    try {
      const existingTitles = WRITING_PROMPTS.map((p) => p.title).join('、');
      const result = await aiChat(
        [
          {
            role: 'system',
            content: `You are an English writing teacher creating writing prompts for Chinese English learners. Generate ONE unique writing prompt as a JSON object. Do NOT repeat any of the existing titles below.

Existing titles (DO NOT USE): ${existingTitles}

Return ONLY valid JSON, no markdown, no code fences:
{
  "title": "Prompt title in Chinese",
  "description": "Detailed description in Chinese (1-2 sentences of what to write about)",
  "category": "${genCategory}",
  "wordLimit": { "min": number, "max": 9999 },
  "difficulty": "${genDifficulty}",
  "tips": ["tip 1 in Chinese", "tip 2 in Chinese", "tip 3 in Chinese"]
}

The prompt should be practical and relevant to daily life, work, or study. Make tips actionable and specific. Keep the minimum word count low: beginner 20-30 words, intermediate 40-60 words, advanced 60-80 words. Set max to 9999 (no upper limit).`,
          },
          {
            role: 'user',
            content: `Generate a "${genCategory}" writing prompt at "${genDifficulty}" level${genTopic ? `. Topic hint: ${genTopic}` : ''}.`,
          },
        ],
        { temperature: 0.9, maxTokens: 1024 },
      );

      // Extract JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const newPrompt: IWritingPrompt = {
          id: `ai_${Date.now()}`,
          title: parsed.title,
          description: parsed.description,
          category: parsed.category || genCategory,
          wordLimit: parsed.wordLimit || { min: 25, max: 9999 },
          difficulty: parsed.difficulty || genDifficulty,
          tips: Array.isArray(parsed.tips) ? parsed.tips : [],
        };
        setCustomPrompts((prev) => [newPrompt, ...prev]);
        setShowGenDialog(false);
        setGenTopic('');
        toast.success('AI 题目已生成！');
        // Auto-start the new prompt
        startWriting(newPrompt);
      } else {
        toast.error('AI 返回格式异常，请重试');
      }
    } catch {
      toast.error('AI 生成失败，请检查网络后重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeletePrompt = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCustomPrompts((prev) => prev.filter((p) => p.id !== id));
  };

  const allPrompts = [...customPrompts, ...WRITING_PROMPTS];

  if (!selectedPrompt) {
    return (
      <div className="space-y-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Writing Practice
          </p>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-black italic text-foreground tracking-tight">
              AI 写作练习
            </h1>
          </div>
          <p className="text-muted-foreground mt-2 text-sm font-medium">
            选择一个写作题目，提交你的英文作文，AI 会给出语法和地道度反馈
          </p>
        </div>

        {/* AI 生成题目按钮 */}
        <div className="flex items-center gap-3">
          <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
            <DialogTrigger asChild>
              <Button
                className="rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white shadow-lg shadow-purple-200/50 dark:shadow-purple-900/30 text-xs font-black uppercase tracking-wider"
              >
                <Wand2 className="size-4 mr-1.5" />
                AI 生成题目
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden">
              <div className="p-6 border-b border-border">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black italic text-foreground flex items-center gap-2">
                    <Bot className="size-5 text-violet-500" />
                    AI 生成写作题目
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">话题方向</label>
                  <div className="flex flex-wrap gap-2">
                    {['日常叙事', '观点表达', '职场写作', '议论文', '创意写作', '科技前沿', '社会热点', '个人成长', '文化对比', '环保绿色'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setGenCategory(cat)}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                          genCategory === cat
                            ? 'border-violet-400 bg-violet-50 dark:bg-violet-500/15 text-violet-600'
                            : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">难度</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'beginner', label: '初级' },
                      { value: 'intermediate', label: '中级' },
                      { value: 'advanced', label: '高级' },
                    ].map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => setGenDifficulty(d.value)}
                        className={cn(
                          'px-4 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                          genDifficulty === d.value
                            ? 'border-violet-400 bg-violet-50 dark:bg-violet-500/15 text-violet-600'
                            : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">话题关键词（可选）</label>
                  <Input
                    value={genTopic}
                    onChange={(e) => setGenTopic(e.target.value)}
                    placeholder="例如：环保、科技、旅行..."
                    className="rounded-2xl"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-border flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowGenDialog(false)} className="rounded-2xl">
                  取消
                </Button>
                <Button
                  onClick={handleGeneratePrompt}
                  disabled={generating}
                  className="rounded-2xl bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-200/50 dark:shadow-violet-900/30"
                >
                  {generating ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Wand2 className="size-4 mr-1.5" />}
                  {generating ? '生成中...' : '生成题目'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {customPrompts.length > 0 && (
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-bold bg-violet-50 dark:bg-violet-500/15 text-violet-600 border-violet-200">
              AI 生成 {customPrompts.length} 题
            </Badge>
          )}
        </div>

        <Tabs value={promptTab} onValueChange={setPromptTab} className="w-full">
          <TabsList className="bg-muted p-1.5 rounded-3xl h-auto mb-6">
            <TabsTrigger
              value="all"
              className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
            >
              全部题目
            </TabsTrigger>
            <TabsTrigger
              value="narrative"
              className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
            >
              日常叙事
            </TabsTrigger>
            <TabsTrigger
              value="opinion"
              className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
            >
              观点表达
            </TabsTrigger>
            <TabsTrigger
              value="workplace"
              className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
            >
              职场写作
            </TabsTrigger>
            <TabsTrigger
              value="essay"
              className="rounded-2xl text-xs font-black uppercase tracking-wider data-[state=active]:bg-white dark:data-[state=active]:bg-card data-[state=active]:text-[#00B894] data-[state=active]:shadow-sm"
            >
              议论文
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allPrompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} onSelect={startWriting} isAi={prompt.id.startsWith('ai_')} onDelete={handleDeletePrompt} />
              ))}
            </div>
          </TabsContent>
          {['narrative', 'opinion', 'workplace', 'essay'].map((cat) => {
            const catMap: Record<string, string> = {
              narrative: '日常叙事',
              opinion: '观点表达',
              workplace: '职场写作',
              essay: '议论文',
            };
            return (
              <TabsContent key={cat} value={cat} className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allPrompts.filter((p) => p.category === catMap[cat]).map((prompt) => (
                    <PromptCard key={prompt.id} prompt={prompt} onSelect={startWriting} isAi={prompt.id.startsWith('ai_')} onDelete={handleDeletePrompt} />
                  ))}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>

        {/* 写作历史 */}
        {history.length > 0 && (
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                  <FileText className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-[900] italic text-foreground">
                    写作历史
                  </CardTitle>
                  <CardDescription className="text-xs font-medium">
                    共 {history.length} 篇作文
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.slice(-5).reverse().map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedHistoryIdx(history.length - 1 - idx)}
                    className="w-full text-left p-4 rounded-2xl bg-muted/30 border border-transparent hover:bg-muted hover:border-border transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">{item.prompt}</span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {new Date(item.date).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="rounded-2xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-[#00B894]"
          >
            <RefreshCw className="size-4 mr-1.5" />
            换题目
          </Button>
          <div>
            <h1 className="text-xl font-black italic text-foreground">{selectedPrompt.title}</h1>
            <p className="text-xs text-muted-foreground font-medium">{selectedPrompt.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-muted">
            {selectedPrompt.difficulty === 'beginner' ? '初级' : selectedPrompt.difficulty === 'intermediate' ? '中级' : '高级'}
          </Badge>
          <div className="flex items-center gap-2 bg-muted rounded-2xl px-4 py-2">
            <Timer className="size-4 text-[#00B894]" />
            <span className="text-sm font-black italic text-foreground tabular-nums">{formatTime(timer)}</span>
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-2xl px-4 py-2">
            <Hash className="size-4 text-muted-foreground" />
            <span className="text-sm font-black text-foreground tabular-nums">{wordCount}</span>
            <span className="text-[10px] text-muted-foreground">词</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左侧：写作区 */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          {/* 写作提示 */}
          <Card className="rounded-[32px] border-border shadow-sm bg-gradient-to-br from-[#00B894]/5 to-emerald-50 dark:from-[#00B894]/10 dark:to-emerald-500/10 border-[#00B894]/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="size-4 text-[#00B894]" />
                <span className="text-xs font-black uppercase tracking-wider text-[#00B894]">
                  写作提示
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedPrompt.tips.map((tip, idx) => (
                  <Badge
                    key={idx}
                    className="rounded-full px-3 py-1 text-xs font-medium bg-white/70 text-foreground dark:bg-foreground/10 border border-[#00B894]/10"
                  >
                    {tip}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 写作区 */}
          <Card className="rounded-[32px] border-border shadow-sm">
            <CardContent className="p-6">
              <Textarea
                value={essay}
                onChange={(e) => setEssay(e.target.value)}
                placeholder="开始写作...&#10;&#10;提示：先在脑海中构建文章框架，然后逐步展开叙述。"
                className="min-h-[300px] resize-y rounded-3xl border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-emerald-200 text-base leading-relaxed"
              />
              <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!essay.trim()}
                    onClick={() => tts.speak(essay)}
                    className="rounded-xl text-xs font-bold text-muted-foreground hover:text-[#00B894] gap-1"
                  >
                    <Volume2 className="size-3.5" />
                    朗读我的作文
                  </Button>
                  <span>字数：{wordCount} 词{selectedPrompt.wordLimit.max >= 9999 ? ` (至少 ${selectedPrompt.wordLimit.min} 词)` : ` / ${selectedPrompt.wordLimit.min}-${selectedPrompt.wordLimit.max}`}</span>
                  <span>字符：{charCount}</span>
                  {wordCount >= selectedPrompt.wordLimit.min && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      达到最小字数
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || wordCount < selectedPrompt.wordLimit.min}
                  className="bg-[#00B894] hover:bg-[#00A080] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      AI 批改中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4 mr-2" />
                      提交并获取反馈
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：反馈区 */}
        <div className="col-span-12 lg:col-span-5">
          <Card className="rounded-[32px] border-border shadow-sm h-full sticky top-24">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-[900] italic text-foreground">
                    AI 写作反馈
                  </CardTitle>
                  <CardDescription className="text-xs font-medium">
                    {feedback ? '已分析完成' : isSubmitting ? '正在分析中...' : '提交作文后查看反馈'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-2">
                {feedback ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{feedback}</ReactMarkdown>
                  </div>
                ) : isSubmitting ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin mr-2" />
                    正在分析你的作文...
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <PenLine className="size-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground font-medium">
                      完成右侧的写作后点击"提交并获取反馈"<br />
                      AI 会从语法、地道度和结构方面给出建议
                    </p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PromptCard({
  prompt,
  onSelect,
  isAi,
  onDelete,
}: {
  prompt: IWritingPrompt;
  onSelect: (p: IWritingPrompt) => void;
  isAi?: boolean;
  onDelete?: (e: React.MouseEvent, id: string) => void;
}) {
  const { addFavorite, removeFavorite, isFavorited, favorites } = useFavorites();
  const favorited = isFavorited(prompt.title, 'writing_prompt');
  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorited) {
      const fav = favorites.find((f) => f.content === prompt.title && f.type === 'writing_prompt');
      if (fav) removeFavorite(fav.id);
    } else {
      addFavorite({ type: 'writing_prompt', content: prompt.title, meaning: prompt.description, example: prompt.tips?.join('；'), category: prompt.category });
    }
  };
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all duration-300 hover:-translate-y-1 group rounded-[32px] border-border"
      onClick={() => onSelect(prompt)}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {isAi && (
              <Badge className="shrink-0 text-[8px] font-black uppercase rounded-full px-1.5 py-0 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                AI
              </Badge>
            )}
            <h3 className="text-lg font-black text-foreground group-hover:text-[#00B894] transition-colors truncate">
              {prompt.title}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={toggleFav} className={cn('p-1 rounded-lg transition-colors', favorited ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500')}>
              <Heart className={cn('size-3.5', favorited && 'fill-current')} />
            </button>
            {isAi && onDelete && (
              <button
                onClick={(e) => onDelete(e, prompt.id)}
                className="p-1 rounded-lg text-muted-foreground/50 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除"
              >
                <X className="size-3.5" />
              </button>
            )}
            <Badge
              variant="secondary"
              className="shrink-0 text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 bg-muted"
            >
              {prompt.difficulty === 'beginner' ? '初级' : prompt.difficulty === 'intermediate' ? '中级' : '高级'}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground font-medium mb-4 line-clamp-2">
          {prompt.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            {prompt.wordLimit.max >= 9999 ? `≥${prompt.wordLimit.min} 词` : `${prompt.wordLimit.min}-${prompt.wordLimit.max} 词`} · {prompt.category}
          </span>
          <div className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[#00B894]">
            开始写作
            <PenLine className="size-3.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
