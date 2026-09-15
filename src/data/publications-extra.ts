/**
 * 扩展刊物库 —— 与 ArticlePage 内置的 5 篇合并展示。
 *
 * 每篇含英文正文 + 中文对照（阅读器可直接双语显示、逐段朗读、查词、收藏）。
 * 主题覆盖：教育 / 健康 / 心理 / 职场 / 科技 / 环境 / 文化，难度标注 beginner~advanced。
 */

import type { IReadingContent, IParagraph } from './reading';
import { buildPages } from './reading';

interface IPubSeed {
  id: string;
  title: string;
  zhTitle: string;
  source: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  paras: [string, string][];
}

const SEEDS: IPubSeed[] = [
  {
    id: 'pub-edu-sleep',
    title: 'Why Sleep Is the Most Underrated Study Tool',
    zhTitle: '为什么睡眠是最被低估的学习工具',
    source: 'Scientific American',
    topic: 'science',
    difficulty: 'beginner',
    paras: [
      ['Students often treat sleep as the enemy of productivity. Staying up late to revise feels heroic, while going to bed early feels like giving up. Neuroscience says the opposite.', '学生常把睡眠当作效率的敌人。熬夜复习感觉像英雄行为，而早睡却像放弃。神经科学却说恰恰相反。'],
      ['During deep sleep, the brain replays the day\'s experiences and moves fragile new memories from the hippocampus into the cortex for long-term storage. Skip that process, and much of what you studied simply never gets filed away.', '在深度睡眠中，大脑会重放白天的经历，把脆弱的新记忆从海马体转移到皮层进行长期存储。跳过这个过程，你学的大部分内容根本没被归档。'],
      ['Sleep also clears metabolic waste from brain tissue through the glymphatic system. A single night of poor sleep measurably reduces attention, working memory, and emotional regulation the next day.', '睡眠还通过类淋巴系统清除脑组织中的代谢废物。一晚睡眠不佳，第二天的注意力、工作记忆和情绪调节能力都会明显下降。'],
      ['The practical lesson is not complicated. Study in focused blocks during the day, review briefly before bed so the material is fresh, and protect a consistent sleep window. Six hours of tired study is usually worth less than five hours of alert study plus seven hours of sleep.', '实际的建议并不复杂：白天用专注的时段学习，睡前简短复习让材料保持新鲜，并守住固定的睡眠时间。疲倦状态下学六小时，通常不如清醒时学五小时再加七小时睡眠。'],
      ['If you must choose between one more hour of cramming and one more hour of sleep before an exam, sleep is almost always the better investment. The exam tests what your brain can retrieve, not how long you sat at a desk.', '如果考试前必须在"多刷一小时题"和"多睡一小时"之间选，睡眠几乎总是更划算的投资。考试考的是大脑能提取出什么，而不是你坐了多久。'],
    ],
  },
  {
    id: 'pub-health-walking',
    title: 'The Quiet Power of a Daily Walk',
    zhTitle: '每日散步的温和力量',
    source: 'The Guardian',
    topic: 'health',
    difficulty: 'beginner',
    paras: [
      ['Walking is the most ordinary form of exercise and, for many people, the most sustainable. It requires no equipment, no membership, and no recovery day.', '走路是最普通的运动形式，对许多人来说也是最可持续的。它不需要器材、不需要会员，也不需要恢复日。'],
      ['Research links regular walking to lower risks of heart disease, type 2 diabetes, and depression. The effect is not limited to intense hiking; even brisk walking for thirty minutes most days shows measurable benefits.', '研究把规律步行与更低的心脏病、2型糖尿病和抑郁风险联系起来。这种效果不限于高强度徒步；即使大多数日子快走三十分钟，也能看到可测量的好处。'],
      ['Walking also functions as a cognitive reset. Movement increases blood flow to the brain and gives attention a chance to drift, which often produces the sudden solutions that elude us at a desk.', '走路也是一种认知重启。运动会增加脑部血流，也让注意力有机会漂移，这常常带来坐在桌前怎么想都想不出的解决方案。'],
      ['The hardest part is rarely the walking itself but the decision to go. Attaching the walk to an existing habit — after lunch, before dinner, on the phone with a friend — removes the need for daily willpower.', '最难的部分通常不是走路本身，而是决定出门。把散步挂在一个已有的习惯上——午饭后、晚饭前、与朋友通电话时——就不再需要每天靠意志力推动。'],
      ['In a culture that rewards intensity, walking is easy to dismiss. Yet the best exercise program is the one you actually keep doing for years, and few things are easier to keep than a walk.', '在一个崇尚强度的文化里，走路很容易被轻视。然而最好的运动计划是你真能坚持多年的那个，而少有事情比散步更容易坚持。'],
    ],
  },
  {
    id: 'pub-psych-focus',
    title: 'Attention Is the Scarcest Resource You Own',
    zhTitle: '注意力是你最稀缺的资源',
    source: 'Harvard Business Review',
    topic: 'business',
    difficulty: 'intermediate',
    paras: [
      ['Time management is a comforting idea, but it solves the wrong problem. Everyone gets twenty-four hours; what differs is how much uninterrupted attention we can direct at anything that matters.', '时间管理是个令人安心的概念，却解决错了问题。每个人每天都只有二十四小时；差别在于我们能把多少不被打断的注意力投向真正重要的事情。'],
      ['Modern work environments fragment attention by design. Notifications, open-plan offices, and always-on chat reward instant response, so the most important work gets pushed into the margins of the day — or never happens.', '现代工作环境在设计上就切碎了注意力。通知、开放式办公和永不离线的群聊奖励即时回应，于是最重要的工作被挤到一天的边缘——或者从未发生。'],
      ['The economics are stark. A single interruption can cost far more than the interruption itself, because reloading a complex mental model takes many minutes. Ten small interruptions can consume the productive core of a morning.', '这笔账很残酷。一次打断的代价远不止打断本身，因为重新装载复杂的思维模型需要好几分钟。十次小打断就能吃掉一个上午最有产出的时段。'],
      ['Teams that protect focus tend to outperform busier-looking ones. Common practices include two-hour meeting-free blocks, asynchronous written updates instead of status meetings, and explicit response-time expectations.', '保护专注的团队往往胜过看起来更忙的团队。常见做法包括两小时的无会时段、用异步书面更新取代状态会议，以及对回复时间给出明确预期。'],
      ['Attention is not merely a productivity metric. What we repeatedly attend to shapes what we notice, remember, and eventually become. Treating it as precious is both a career strategy and a way of choosing a life.', '注意力不只是效率指标。我们反复关注的东西，塑造了我们注意到什么、记住什么，最终成为什么样的人。把它当作珍贵资源，既是职业策略，也是一种选择人生的方式。'],
    ],
  },
  {
    id: 'pub-tech-language-ai',
    title: 'Can AI Replace a Language Teacher?',
    zhTitle: 'AI 能取代语言老师吗？',
    source: 'Wired',
    topic: 'tech',
    difficulty: 'intermediate',
    paras: [
      ['AI tutors are patient, available at midnight, and cost almost nothing. They will explain the same grammar point ten times without sighing. For millions of learners, that alone changes what is possible.', 'AI 老师有耐心、半夜也在线、几乎不花钱。同一个语法点讲十遍也不会叹气。对数百万学习者来说，仅这一点就改变了"能做什么"。'],
      ['They are also remarkably good at the mechanical side of language: generating examples, correcting spelling, translating instantly, and simulating conversation at any level of difficulty.', '它们在语言的机械层面也相当强：生成例句、纠正拼写、即时翻译，以及模拟任何难度的对话。'],
      ['What AI struggles with is judgment. It cannot tell whether your hesitation comes from a missing word or from fear of speaking in front of a colleague. It cannot design a curriculum around the specific exam you will take in June.', 'AI 的弱项是判断。它无法分辨你的迟疑是源于缺词，还是害怕在同事面前开口。它也无法围绕你六月要参加的那场考试来设计课程。'],
      ['There is also a subtler risk: synthetic conversation is endlessly forgiving, while real conversation is not. Learners who only practice with AI can be fluent in a world where nobody interrupts, misunderstands, or changes the topic abruptly.', '还有一个更隐蔽的风险：与 AI 的对话永远宽容，而真实对话并非如此。只在 AI 环境里练习的学习者，可能会在"没人打断、没人误解、没人突然换话题"的世界里很流利。'],
      ['The most effective setup today looks hybrid. Use AI for volume — hundreds of repetitions, instant feedback, fearless practice. Use humans for judgment, real stakes, and the awkward moments that force you to grow.', '目前最有效的组合是混合式：用 AI 做量——成百次重复、即时反馈、无所畏惧的练习；用真人做判断、真实压力和那些逼你成长的尴尬时刻。'],
    ],
  },
  {
    id: 'pub-env-plastic',
    title: 'The Problem With Recycling Is Us',
    zhTitle: '回收的问题出在我们身上',
    source: 'National Geographic',
    topic: 'environment',
    difficulty: 'intermediate',
    paras: [
      ['Recycling promised a clean solution to a messy problem: consume freely, sort your waste, and let the system handle the rest. Decades later, the numbers tell a less comfortable story.', '回收曾承诺给一个混乱的问题提供干净的解决方案：放心消费、分好垃圾，剩下的交给系统。几十年后，数据讲了一个不那么令人安心的故事。'],
      ['Globally, only about nine percent of plastic ever produced has been recycled. Much of the rest sits in landfills, is burned, or leaks into oceans. The bottle you carefully rinsed had roughly a one-in-ten chance of becoming anything again.', '全球来看，人类生产过的塑料只有约 9% 被回收。其余大部分被填埋、焚烧或流入海洋。你仔细冲洗过的那个瓶子，大约只有十分之一的概率变成新东西。'],
      ['The deeper issue is design. Most plastic is made from virgin fossil fuel because it is cheaper than recycled material, and much packaging is technically difficult or uneconomical to reprocess. Recycling treats symptoms while production grows.', '更深的问题在设计。多数塑料由原生化石燃料制成，因为比再生材料便宜；而且很多包装在技术上难以再加工或根本不划算。回收在治症状，产量却在持续增长。'],
      ['Individual habits still matter, but their leverage is limited. The higher-impact moves are systemic: deposit-return schemes that actually recover containers, requirements that packaging be recyclable, and investing in reprocessing capacity.', '个人习惯仍重要，但杠杆有限。更高影响的做法是系统性的：真正能回收容器的押金返还制度、要求包装可回收的法规，以及对再加工产能的投资。'],
      ['None of this is an argument for giving up. It is an argument for honesty about where the leverage lies — and for refusing to let a green label substitute for a smaller pile.', '这些都不是放弃的理由，而是要求对"杠杆在哪里"保持诚实——并且拒绝让一个绿色标签替代真正减少的垃圾堆。'],
    ],
  },
  {
    id: 'pub-culture-punctuality',
    title: 'Time Is Not the Same Everywhere',
    zhTitle: '时间在不同文化里并不相同',
    source: 'BBC Culture',
    topic: 'culture',
    difficulty: 'intermediate',
    paras: [
      ['In some countries a meeting starting ten minutes late is unremarkable. In others, the same ten minutes reads as disrespect. Neither reaction is simply "right" — both encode a culture\'s assumptions about time.', '在一些国家，会议晚十分钟开始并不稀奇；在另一些国家，同样十分钟被理解为不尊重。两种反应都谈不上"正确"——它们各自编码了一种文化对时间的假设。'],
      ['Anthropologists describe the difference as clock time versus event time. Clock cultures organize the day by the schedule; event cultures organize it by what is actually happening, so gatherings begin when enough people have arrived.', '人类学者把这种差异描述为"钟表时间"与"事件时间"。钟表文化按日程安排一天；事件文化按实际发生的事情安排，于是聚会要等足够多的人到场才开始。'],
      ['Neither system is a matter of laziness or rigidity. Clock time enables coordination at scale — trains, hospitals, global supply chains. Event time protects relationships and refuses to let a schedule override a person who needs you now.', '两种体系都不是懒惰或死板的问题。钟表时间让大规模协作成为可能——铁路、医院、全球供应链。事件时间保护关系，拒绝让日程凌驾于当下需要你的人之上。'],
      ['Misreading this difference causes more friction than disagreement about the substance of a deal. A learner of English benefits twice: understanding the language also means noticing how its speakers treat time.', '误读这种差异造成的摩擦，比在交易实质上产生分歧更多。英语学习者能获得双份收益：理解一门语言，也意味着察觉它的使用者如何对待时间。'],
      ['The useful habit is to ask rather than assume. When you work across cultures, make your own expectations explicit and invite others to state theirs. Most conflicts about time are conflicts about unstated assumptions.', '有用的习惯是询问而非假设。跨国协作时，把自己的预期说清楚，也邀请对方说出他们的。多数关于时间的冲突，其实是关于未说出的假设的冲突。'],
    ],
  },
  {
    id: 'pub-career-questions',
    title: 'The Questions That Reveal a Good Workplace',
    zhTitle: '能看出一家公司好坏的问题',
    source: 'The Atlantic',
    topic: 'business',
    difficulty: 'advanced',
    paras: [
      ['Interviews are designed to evaluate you, but they are also your only structured chance to evaluate the employer. The questions you ask signal what you value — and the answers often reveal more than the job description.', '面试是用来评估你的，但它也是你评估雇主唯一的制度化机会。你提的问题显示你看重什么——而回答往往比招聘说明透露更多。'],
      ['Start with documentation. Ask how decisions are recorded and how someone new finds out why a project changed direction. Teams with weak documentation tend to run on memory and personality, which makes every new person\'s life harder.', '从文档入手。问决策如何记录，新人怎样了解项目为何改向。文档薄弱的团队靠记忆和人情运转，这让每个新人的日子都更难过。'],
      ['Then ask about bad news. How does the team learn that a project is failing? Organizations that cannot answer this honestly usually discover failures late and expensive.', '接着问坏消息。团队如何得知一个项目正在失败？无法诚实回答这个问题的组织，通常会很晚、很昂贵地发现失败。'],
      ['Ask what happens to the last person who left, and what the team stopped doing in the past year. Both answers show whether the workload is sustainable or steadily expanding to fill whatever capacity exists.', '问上一个离职的人经历了什么，以及过去一年团队停掉了哪些事。这两个回答能看出工作量是可持续的，还是在不断膨胀、填满任何可用产能。'],
      ['Finally, ask how success is measured in the first six months — and who decides. Vague answers here are a warning: if nobody can describe what good looks like, nobody can tell you whether you are doing well.', '最后问：入职头六个月的成功如何衡量，由谁判定。这里的模糊回答就是警告：如果没人能描述"做得好"是什么样，也没人能告诉你自己做得如何。'],
    ],
  },
];

export const EXTRA_PUBLICATIONS: IReadingContent[] = SEEDS.map((s) => {
  const paragraphs: IParagraph[] = s.paras.map(([en, zh]) => ({ en, zh }));
  return {
    id: s.id,
    type: 'publication' as const,
    title: s.title,
    zhTitle: s.zhTitle,
    author: s.source,
    source: s.source,
    topic: s.topic,
    difficulty: s.difficulty,
    pages: buildPages(paragraphs),
    totalWords: paragraphs.reduce((n, p) => n + p.en.split(/\s+/).filter(Boolean).length, 0),
  };
});
