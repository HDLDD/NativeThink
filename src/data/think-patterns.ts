export interface IThinkPatternChoice {
  id: string;
  prompt: string;
  options: [string, string, string];
  answer: 0 | 1 | 2;
  explanation: string;
}

export interface IThinkPatternTransfer {
  id: string;
  situation: string;
  /** 给 AI 的判定重点（用户不可见） */
  rubricFocus: string;
  /** 迁移前给用户看的“先想三步” */
  thinkingSteps: [string, string, string];
  /** 反馈卡里解释参考表达为什么自然 */
  why: string;
  modelAnswer: string;
}

export interface IThinkPattern {
  id: string;
  name: string;
  oneLiner: string;
  contrast: {
    chineseThinking: string;
    native: string;
    note: string;
  };
  cues: string[];
  recognition: IThinkPatternChoice[];
  transfer: IThinkPatternTransfer[];
}

export const THINK_PATTERNS: IThinkPattern[] = [
  {
    id: 'subject-first',
    name: '让主语站出来',
    oneLiner: '中文先给话题，英文先给主语和动作。',
    contrast: {
      chineseThinking: '这个电影我看过。',
      native: "I've seen this movie.",
      note: '中文把“这个电影”当话题放句首；英文先立主语 I，再给动作。',
    },
    cues: ['先找“谁做了动作”', '句首尽量给出主语+谓语', '中文的“这个/那个+名词”常是话题，不是主语'],
    recognition: [
      {
        id: 'subject-first-r1',
        prompt: '你想说“这个问题我们明天再讨论”。',
        options: [
          "We'll discuss this problem tomorrow.",
          "This problem we'll discuss tomorrow.",
          'Tomorrow this problem will be discussed.',
        ],
        answer: 0,
        explanation: '正确项先把主语 we 和动作 discuss 放在句首；`This problem we\'ll discuss tomorrow.` 是中文话题句的直译，`Tomorrow this problem will be discussed.` 虽然语法成立，但用了被动、仍把话题提前。',
      },
      {
        id: 'subject-first-r2',
        prompt: '你想说“那家餐厅我去年去过一次”。',
        options: [
          'That restaurant I went to once last year.',
          'Last year that restaurant I visited once.',
          'I went to that restaurant once last year.',
        ],
        answer: 2,
        explanation: '正确项先立主语 I，再把地点和时间放后面，句子才不头重脚轻；另外两句都把 restaurant 当话题提前。',
      },
      {
        id: 'subject-first-r3',
        prompt: '你想说“这种书孩子们很喜欢”。',
        options: [
          'This kind of book children like very much.',
          'Children really like this kind of book.',
          'This kind of book is liked very much by children.',
        ],
        answer: 1,
        explanation: '正确项把动作的发出者 children 放在句首；`This kind of book children like very much.` 把宾语当话题提前，`This kind of book is liked very much by children.` 是语法成立的被动句，都不如主动句直接。',
      },
    ],
    transfer: [
      {
        id: 'subject-first-t1',
        situation: '你想告诉同事“这份报告我周五之前能交”。',
        rubricFocus: '是否由 I 作主语、动作在前，而不是把“这份报告”放在句首；对象可用 report/record 等同义表达，不要求逐字一致',
                thinkingSteps: ["谁交？→ I","动作是什么？→ can hand in / can submit","对象和时间？→ the report / by Friday"],
        why: "中文把「这份报告」当话题放在句首；英文先立主语 I，再让动作 hand in/submit 接上对象，句子才不绕着话题走。",
modelAnswer: 'I can hand in the report by Friday.',
      },
      {
        id: 'subject-first-t2',
        situation: '你想说“那部剧我看了三遍还是觉得好看”。',
        rubricFocus: '是否先给主语 I / 动作，而不是“That show I...”',
                thinkingSteps: ["谁看？→ I","动作和次数？→ have watched ... three times","感受？→ still love it"],
        why: "中文「那部剧」是话题；英文用 I 作主语，把「看了三遍」和「还是喜欢」按动作顺序接起来。",
modelAnswer: "I've watched that show three times and still love it.",
      },
    ],
  },
  {
    id: 'verb-driven',
    name: '把动作还给动词',
    oneLiner: '少用“进行/处理/做…的…”这类名词化，直接用动词。',
    contrast: {
      chineseThinking: '对这个问题进行处理。',
      native: 'Handle the issue.',
      note: '中文常用“对…进行处理”把动作名词化；英文更常让动词直接承担动作。',
    },
    cues: ['看到“进行/作出/加以”先找真正的动词', '少用“名词化 + make/conduct”', '一个动词能说清的，不用三个词'],
    recognition: [
      {
        id: 'verb-driven-r1',
        prompt: '你想说“我们需要对数据进行一次分析”。',
        options: [
          'We need to conduct an analysis of the data.',
          'We need to make an analysis on the data.',
          'We need to analyze the data.',
        ],
        answer: 2,
        explanation: '正确项直接用动词 analyze 承担动作；`conduct an analysis of...` 语法和搭配都自然，但更正式、更绕；`make an analysis on...` 的搭配不自然。',
      },
      {
        id: 'verb-driven-r2',
        prompt: '你想说“他对这个计划提出了反对”。',
        options: [
          'He raised an objection to the plan.',
          'He objected to the plan.',
          'He made an objection against the plan.',
        ],
        answer: 1,
        explanation: '正确项用 object 直接作动词，比 `raise an objection` / `make an objection` 更干净。',
      },
      {
        id: 'verb-driven-r3',
        prompt: '你想说“我们正在对系统进行优化”。',
        options: [
          'We are optimizing the system.',
          'We are carrying out an optimization of the system.',
          'We are doing an optimization of the system.',
        ],
        answer: 0,
        explanation: '正确项用 optimize 直接作动词；`carry out an optimization of...` 和 `do an optimization of...` 都是典型的名词化，动作被塞回名词里。',
      },
    ],
    transfer: [
      {
        id: 'verb-driven-t1',
        situation: '你负责的项目需要“对用户反馈进行整理”。',
        rubricFocus: '是否用 sort through / organize 这类动词，而不是“do an organization of...”',
                thinkingSteps: ["谁整理？→ I","整理的动作是什么？→ sort through / organize","对象？→ the user feedback"],
        why: "中文「对……进行整理」把动作名词化；英文直接用 sort through/organize 承担动作，少一层 do an organization of。",
modelAnswer: 'I need to sort through the user feedback.',
      },
      {
        id: 'verb-driven-t2',
        situation: '你想说“我们明天对方案做一次讨论”。',
        rubricFocus: '是否用 talk through / discuss 这类动词，而不是“make a discussion”',
                thinkingSteps: ["谁讨论？→ We","讨论的动词？→ talk through / discuss","时间和对象？→ tomorrow / the plan"],
        why: "「做一次讨论」是名词化；英文用 talk through/discuss 直接说动作，时间和对象放后面。",
modelAnswer: "We'll talk through the plan tomorrow.",
      },
    ],
  },
  {
    id: 'end-focus',
    name: '把重点放到句尾',
    oneLiner: '英文倾向把新信息、长成分放在句尾，避免头重脚轻。',
    contrast: {
      chineseThinking: '一个在银行工作、会说法语、还写过小说的朋友告诉我这个消息。',
      native: 'I heard the news from a friend who works at a bank, speaks French, and has written a novel.',
      note: '中文把长修饰全堆在“朋友”前面；英文常把长描述放到句尾。',
    },
    cues: ['主语太长就换成 I heard... from...', '新信息/长从句放句尾', '避免“一个…的…的…朋友”式头重脚轻'],
    recognition: [
      {
        id: 'end-focus-r1',
        prompt: '你想说“一个在银行工作、会说法语、还写过小说的朋友告诉我这个消息”。',
        options: [
          'A friend who works at a bank, speaks French, and has written a novel told me the news.',
          'I heard the news from a friend who works at a bank, speaks French, and has written a novel.',
          'The news was told to me by a friend who works at a bank, speaks French, and has written a novel.',
        ],
        answer: 1,
        explanation: '正确项用 `I heard the news from...` 避免超长主语，把长描述放到句尾；`A friend who... told me the news.` 头重脚轻，被动那句虽然也把长描述放在后面，但整句绕、重点落在“谁告诉”上。',
      },
      {
        id: 'end-focus-r2',
        prompt: '你想说“最让我担心的是售后”。',
        options: [
          'What worries me most is the after-sales service.',
          'The after-sales service is what worries me most.',
          'The after-sales service worries me most.',
        ],
        answer: 0,
        explanation: '正确项用 `What worries me most is...` 把新信息 after-sales service 留在句尾；另外两句都把 after-sales service 放在句首，重点落在 worries me most 上。',
      },
      {
        id: 'end-focus-r3',
        prompt: '你想说“他昨天在会上提了一个我们都没想过的方案”。',
        options: [
          'He proposed a plan at the meeting yesterday, and none of us had thought of it.',
          'A plan that none of us had thought of was proposed by him at the meeting yesterday.',
          'At the meeting yesterday, he proposed a plan that none of us had thought of.',
        ],
        answer: 2,
        explanation: '正确项把时间和地点前置，让长的新信息 `a plan that none of us had thought of` 留在句尾；另两句要么把长修饰拆成并列句，要么用被动把长成分放到句首，都没有这种句尾焦点。',
      },
    ],
    transfer: [
      {
        id: 'end-focus-t1',
        situation: '你想说“一个从硅谷回来、在我们公司工作了十年的工程师提出了这个想法”。',
        rubricFocus: '是否避免超长主语，把长描述放到句尾',
                thinkingSteps: ["句子的重点是什么？→ 这个想法来自谁","主语能短吗？→ 用 The idea came from...","长描述放哪？→ engineer ... 放句尾"],
        why: "中文把「一个从硅谷回来、工作十年」全堆在主语前；英文把短主语/动作放前面，长描述放句尾，避免头重脚轻。",
modelAnswer: 'The idea came from an engineer who spent ten years at our company after coming back from Silicon Valley.',
      },
      {
        id: 'end-focus-t2',
        situation: '你想说“最让我生气的是他连一句解释都没给”。',
        rubricFocus: '是否用 what 从句或 it 结构把焦点留在句尾',
                thinkingSteps: ["重点是什么？→ 他没解释","用什么结构？→ What made me angry was...","新信息放哪？→ that 从句放句尾"],
        why: "中文「最让我生气的是……」可以直接对应 What...was...；英文用从句把新信息留到句尾，焦点更清楚。",
modelAnswer: "What made me angry was that he didn't even offer an explanation.",
      },
    ],
  },
  {
    id: 'soften-disagreement',
    name: '先铺缓冲再否定',
    oneLiner: '先承认/缓冲，再给不同意见。',
    contrast: {
      chineseThinking: '我不太喜欢这个主意。',
      native: "To be honest, I'm not a huge fan of this idea.",
      note: '英文常先用 to be honest / I see your point 缓冲，再用 not a huge fan 软否定。',
    },
    cues: ['先给缓冲语', '否定用 not a huge fan / not sure', '给出原因或替代方案'],
    recognition: [
      {
        id: 'soften-r1',
        prompt: '同事提出一个你觉得不太可行的方案。',
        options: [
          "That won't work.",
          'Your plan is wrong.',
          "I'm not sure that would work — can we talk through the risks?",
        ],
        answer: 2,
        explanation: "正确项先用 not sure 软化，再给讨论出口；`That won't work.` 和 `Your plan is wrong.` 都太直接。",
      },
      {
        id: 'soften-r2',
        prompt: '朋友问你喜不喜欢他新买的衣服，你不想直接说难看。',
        options: [
          "It's not really my style, but it looks good on you.",
          "I don't like it.",
          "That's ugly.",
        ],
        answer: 0,
        explanation: "正确项用 not really my style 软否定，同时保留对朋友的正面反馈；`I don't like it.` 和 `That's ugly.` 都是直给否定。",
      },
      {
        id: 'soften-r3',
        prompt: '你想拒绝一个不合理的请求。',
        options: [
          'No.',
          "I'd love to help, but I'm swamped right now — can we find another time?",
          "You're asking too much.",
        ],
        answer: 1,
        explanation: "正确项先表达愿意，再给原因和替代时间；`No.` 和 `You're asking too much.` 都没有给对方台阶。",
      },
    ],
    transfer: [
      {
        id: 'soften-t1',
        situation: '同事的方案你觉得风险很大，但不想直接否定。',
        rubricFocus: '是否有缓冲 + 软否定 + 讨论出口',
                thinkingSteps: ["先给什么？→ 缓冲/承认对方意图","再说什么？→ 担心风险","给什么出口？→ can we talk through them?"],
        why: "英文不同意的三步：先承认（I see what you are going for）→ 软否定（a bit worried）→ 给讨论出口；比直接说 no 更容易推进。",
modelAnswer: "I see what you're going for, but I'm a bit worried about the risks — can we talk through them?",
      },
      {
        id: 'soften-t2',
        situation: '朋友约你周末帮忙搬家，你没空。',
        rubricFocus: '是否先表达愿意，再说明没空并给替代方案',
                thinkingSteps: ["先给什么？→ I would love to help","再说什么？→ 这周末已有安排","给什么替代？→ take a rain check"],
        why: "拒绝不等于关门：先表达愿意，再说明没空，最后给替代时间/rain check，关系不会被拒绝本身伤到。",
modelAnswer: "I'd love to help, but I've already got plans this weekend — can I take a rain check?",
      },
    ],
  },
  {
    id: 'be-concrete',
    name: '少说大词，多说具体',
    oneLiner: '用具体动作、数字和结果替代空泛形容词。',
    contrast: {
      chineseThinking: '这个方案很好，能带来很多好处。',
      native: 'This plan cuts our turnaround time in half.',
      note: 'good / many benefits 信息量很低；具体到时间和结果，评价才可信。',
    },
    cues: ['把“好/很多/有效”换成数字或动作', '少堆形容词', '用一个细节证明你的评价'],
    recognition: [
      {
        id: 'concrete-r1',
        prompt: '你想夸一个工具好用。',
        options: [
          'This tool cuts my editing time from two hours to twenty minutes.',
          'This tool is very useful and has many advantages.',
          'This tool is good and convenient.',
        ],
        answer: 0,
        explanation: '正确项用具体时间对比证明“好用”；另外两句只有空泛评价。',
      },
      {
        id: 'concrete-r2',
        prompt: '你想说同事帮了很大忙。',
        options: [
          'You helped me a lot.',
          'You stayed late to fix the slides, which saved my presentation.',
          'You are very helpful.',
        ],
        answer: 1,
        explanation: '正确项用具体动作和结果说明帮助；`You helped me a lot.` 和 `You are very helpful.` 都是空泛感谢。',
      },
      {
        id: 'concrete-r3',
        prompt: '你想说这家店服务好。',
        options: [
          'The service here is very good.',
          'This store has excellent service quality.',
          'The waiter remembered our order and checked on us without hovering.',
        ],
        answer: 2,
        explanation: '正确项用两个具体行为证明服务好；另外两句是抽象评价。',
      },
    ],
    transfer: [
      {
        id: 'concrete-t1',
        situation: '你想说“这个新流程让沟通快了很多”。',
        rubricFocus: '是否给出具体时间/步骤对比，而不是只说 faster',
                thinkingSteps: ["原来多慢？→ a week","现在多快？→ a day","哪个动作被压缩？→ back-and-forth"],
        why: "「快了很多」是空泛评价；用 from a week to a day 的具体对比，读者立刻知道快了多少。",
modelAnswer: 'The new process cuts our back-and-forth from a week to a day.',
      },
      {
        id: 'concrete-t2',
        situation: '你想说“这本书对我影响很大”。',
        rubricFocus: '是否用具体改变/行为说明影响，而不是只说 very influential',
                thinkingSteps: ["影响落在什么行为上？→ handle disagreements","以前怎么做？→ argue","现在怎么做？→ ask questions first"],
        why: "「影响很大」没有信息量；说出一个具体改变（先问再争），影响才可信、可迁移。",
modelAnswer: 'This book changed how I handle disagreements — I now ask questions before arguing.',
      },
    ],
  },
  {
    id: 'make-logic-explicit',
    name: '把逻辑说清楚',
    oneLiner: '中文靠意合，英文常把因果、转折、条件说出来。',
    contrast: {
      chineseThinking: '天气不好，我们没去。',
      native: "We didn't go because the weather was terrible.",
      note: '中文两个短句靠语序暗示因果；英文用 because 把关系说清楚。',
    },
    cues: ['先给主句，再补 because/so/although/if', '不要把两个短句只并列', '关系词要具体：因果、转折、条件不要混'],
    recognition: [
      {
        id: 'logic-r1',
        prompt: '你想说“预算不够，我们砍掉了两个功能”。',
        options: [
          "The budget wasn't enough. We cut two features.",
          "We cut two features because the budget wasn't enough.",
          "We cut two features. The budget wasn't enough.",
        ],
        answer: 1,
        explanation: '正确项用 because 明确因果；另外两句只是把两个短句并列，关系靠猜。',
      },
      {
        id: 'logic-r2',
        prompt: '你想说“他很累，但还是把报告写完了”。',
        options: [
          'He was tired. He finished the report.',
          'He was tired, and he finished the report.',
          'He finished the report even though he was exhausted.',
        ],
        answer: 2,
        explanation: '正确项用 even though 明确转折；`He was tired. He finished the report.` 和 `He was tired, and he finished the report.` 都没有把转折说出来。',
      },
      {
        id: 'logic-r3',
        prompt: '你想说“你早点告诉我，我就能改”。',
        options: [
          "If you'd told me earlier, I could have changed it.",
          'You told me earlier, so I can change it.',
          "You didn't tell me earlier, and I couldn't change it.",
        ],
        answer: 0,
        explanation: "正确项用虚拟条件句把“与事实相反的假设”说清楚；`You told me earlier, so I can change it.` 语法成立，但说的是已发生的事实；`You didn't tell me earlier, and I couldn't change it.` 只是并列陈述，都没有假设关系。",
      },
    ],
    transfer: [
      {
        id: 'logic-t1',
        situation: '你想说“路上堵车，所以我迟到了”。',
        rubricFocus: '是否用 because/so 明确因果，而不是两个短句并列',
                thinkingSteps: ["结果是什么？→ I am late","原因是什么？→ traffic","用什么词连接？→ because"],
        why: "中文两个短句靠语序暗示因果；英文用 because 把结果和原因直接连起来，读者不用猜。",
modelAnswer: "I'm late because traffic was a nightmare.",
      },
      {
        id: 'logic-t2',
        situation: '你想说“这个功能很简单，但用户就是找不到”。',
        rubricFocus: '是否用 but/although 明确转折，并补出原因',
                thinkingSteps: ["转折是什么？→ simple but users cannot find it","原因是什么？→ buried in settings","用什么连接？→ but / because"],
        why: "先给转折（simple, but...），再补原因（probably because...），逻辑关系比两个短句并列清楚。",
modelAnswer: "The feature is simple, but users still can't find it — probably because it's buried in the settings menu.",
      },
    ],
  },
  {
    id: 'polite-request',
    name: '请求要有台阶',
    oneLiner: '直接命令改成带缓冲的请求。',
    contrast: {
      chineseThinking: '把门关上。',
      native: 'Could you close the door?',
      note: '英文请求常用 could/would you、I was wondering if，给对方留拒绝空间。',
    },
    cues: ['用 could/would you 开头', '加 just / maybe / when you get a chance', '请求越长越礼貌，但别绕'],
    recognition: [
      {
        id: 'polite-r1',
        prompt: '你想让同事发你一份文件。',
        options: [
          'Could you send me the file when you get a chance?',
          'Send me the file.',
          'You need to send me the file.',
        ],
        answer: 0,
        explanation: '正确项用 could you + when you get a chance，给对方台阶；另外两句是命令句。',
      },
      {
        id: 'polite-r2',
        prompt: '你想让朋友把音乐关小。',
        options: [
          'Turn the music down.',
          'The music is too loud.',
          'Would you mind turning the music down a bit?',
        ],
        answer: 2,
        explanation: '正确项用 would you mind + a bit，礼貌且明确；`Turn the music down.` 是命令，`The music is too loud.` 只是陈述、没提出请求。',
      },
      {
        id: 'polite-r3',
        prompt: '你想请老师晚一点截止。',
        options: [
          'Give me more time.',
          'I was wondering if I could have a short extension on the deadline.',
          'You should give me more time.',
        ],
        answer: 1,
        explanation: '正确项用 I was wondering if 缓冲，适合对老师/上级；另外两句都是命令口吻。',
      },
    ],
    transfer: [
      {
        id: 'polite-t1',
        situation: '你想请邻居把车挪一下，方便你出去。',
        rubricFocus: '是否用 could/would + 缓冲 + 原因',
                thinkingSteps: ["先给什么？→ Excuse me / would you mind","请求是什么？→ move your car a little","为什么？→ I am blocked in"],
        why: "请求前加缓冲，再给一个具体原因，邻居更容易配合；直接命令会让人先感到被指挥。",
modelAnswer: "Excuse me, would you mind moving your car a little? I'm blocked in.",
      },
      {
        id: 'polite-t2',
        situation: '你想请同事帮你看看一段英文。',
        rubricFocus: '是否用 could + when you have a minute + 感谢',
                thinkingSteps: ["先给什么？→ Could you","加什么缓冲？→ when you have a minute","结尾补什么？→ I would really appreciate it"],
        why: "Could you + 时间缓冲 + 感谢，是英文请求的三件套；给对方拒绝空间，也表达尊重。",
modelAnswer: "Could you take a quick look at this paragraph when you have a minute? I'd really appreciate it.",
      },
    ],
  },
  {
    id: 'fill-references',
    name: '该说的代词别省',
    oneLiner: '中文常省主语/宾语，英文要补出明确的指代。',
    contrast: {
      chineseThinking: '找到了吗？',
      native: 'Did you find it?',
      note: '中文可以省略“你”和“它”；英文要把主语和宾语补出来。',
    },
    cues: ['先问“谁对谁做了什么”', '补出 I/you/it/them/this/that', '一句里不要连续省略指代'],
    recognition: [
      {
        id: 'ref-r1',
        prompt: '你让朋友去找那把钥匙，想问结果。',
        options: [
          'Did you find them?',
          'Did you find us?',
          'Did you find it?',
        ],
        answer: 2,
        explanation: '钥匙是单数，正确项用 it；`them` 指复数，`us` 指人，都把指代弄错了。',
      },
      {
        id: 'ref-r2',
        prompt: '你想说“我跟我妈说了，她同意了”。',
        options: [
          'I told my mom, and she agreed.',
          'I told my mom, and he agreed.',
          'I told my mom, and they agreed.',
        ],
        answer: 0,
        explanation: '妈妈是 she，正确项用 she；`he` 和 `they` 都把指代弄错了。',
      },
      {
        id: 'ref-r3',
        prompt: '你想说“我看完了，但没看懂”。',
        options: [
          "I finished reading, but I didn't understand it.",
          "I finished reading it, but I didn't understand it.",
          "I finished reading it, but I didn't understand them.",
        ],
        answer: 1,
        explanation: "正确项把“看”和“懂”的对象都用 it 补全；`I finished reading, but I didn't understand it.` 少了 reading 的宾语，`I finished reading it, but I didn't understand them.` 代词单复数错。",
      },
    ],
    transfer: [
      {
        id: 'ref-t1',
        situation: '朋友问你有没有把钥匙还给房东。',
        rubricFocus: '是否补出 you / the keys / the landlord 的指代',
                thinkingSteps: ["谁问？→ you","问什么？→ return the keys","给谁？→ the landlord"],
        why: "中文可以只问「还了吗？」；英文要把 you、the keys、the landlord 都补出来，指代才清楚。",
modelAnswer: 'Did you return the keys to the landlord?',
      },
      {
        id: 'ref-t2',
        situation: '你想说“我买了，但还没用”。',
        rubricFocus: '是否补出 I / it，不省掉宾语',
                thinkingSteps: ["谁买？→ I","买了什么？→ it","现在什么状态？→ have not used it yet"],
        why: "中文「买了」可以省宾语；英文用 it 补出「买的东西」，后半句再用 it 保持一致。",
modelAnswer: "I bought it, but I haven't used it yet.",
      },
    ],
  },
];

/**
 * 识别题的逐项说明。tone 只表达“这句英文怎么样”，不把“更直接/更正式”误说成语法错误：
 *  - best：最直接、最符合本模式；
 *  - ok：语法/搭配自然，但更正式、更绕、语域或焦点不如 best；
 *  - off：搭配、指代或语用上确有毛病，不推荐。
 * 顺序必须和 choice.options 一一对应；best 必须落在 choice.answer。
 */
export interface IThinkPatternOptionNote {
  tone: 'best' | 'ok' | 'off';
  text: string;
}

export type IThinkPatternOptionNotes = [
  IThinkPatternOptionNote,
  IThinkPatternOptionNote,
  IThinkPatternOptionNote,
];

export const THINK_PATTERN_OPTION_NOTES: Record<string, IThinkPatternOptionNotes> = {
  'subject-first-r1': [
    { tone: 'best', text: '先给主语 we 和动作 discuss，句首就是动作发出者，最直接。' },
    { tone: 'ok', text: '口语里能听到话题前置，能懂；但更像中文把「这个问题」先摆出来，正式表达不如主动主谓直接。' },
    { tone: 'ok', text: '语法成立，但用了被动、又把话题提前；重点落在「被讨论」而不是「我们讨论」。' },
  ],
  'subject-first-r2': [
    { tone: 'ok', text: '口语话题前置，能听懂；但 restaurant 被提到句首，不如 I went to... 直接。' },
    { tone: 'ok', text: '时间和话题两个前置叠在一起，语法成立但语序很绕。' },
    { tone: 'best', text: '先立主语 I，再给地点和时间，句子最顺。' },
  ],
  'subject-first-r3': [
    { tone: 'ok', text: '话题前置，口语能懂；但 children 才是喜欢书的动作发出者，放句首更直接。' },
    { tone: 'best', text: 'children 作主语，动作发出者清楚，最直接。' },
    { tone: 'ok', text: '被动语法成立，但动作发出者被放到句尾，直接性差。' },
  ],
  'verb-driven-r1': [
    { tone: 'ok', text: '语法和搭配都自然，常见于正式/学术写作；但 conduct + 名词化更正式、更绕，母语者日常更常用 analyze。' },
    { tone: 'off', text: 'make an analysis on 的搭配不自然；analysis 通常接 of。即使改成 of，仍比 analyze 绕。' },
    { tone: 'best', text: '直接用动词 analyze 承担动作，最直接。' },
  ],
  'verb-driven-r2': [
    { tone: 'ok', text: '搭配自然，常见于正式书面；但 raise + 名词化比 object 绕。' },
    { tone: 'best', text: 'object 直接作动词，最干净。' },
    { tone: 'off', text: 'make an objection against 不如 raise an objection to / object to 自然。' },
  ],
  'verb-driven-r3': [
    { tone: 'best', text: 'optimize 直接作动词，最直接。' },
    { tone: 'ok', text: '搭配自然，但 carry out + 名词化更正式、更绕。' },
    { tone: 'off', text: 'do an optimization of 搭配不自然；carry out an optimization / optimize 更好。' },
  ],
  'end-focus-r1': [
    { tone: 'ok', text: '语法成立，但主语太长，头重脚轻。' },
    { tone: 'best', text: '用 I heard... from... 避免超长主语，把长描述放句尾。' },
    { tone: 'ok', text: '被动语法成立，长描述也在后面，但重点落在「谁告诉」，整句更绕。' },
  ],
  'end-focus-r2': [
    { tone: 'best', text: 'What worries me most is... 把新信息 after-sales service 留在句尾。' },
    { tone: 'ok', text: '语法成立，但把 after-sales service 放前面，焦点变了。' },
    { tone: 'ok', text: '直接，但焦点落在 worries me most，不是句尾新信息。' },
  ],
  'end-focus-r3': [
    { tone: 'ok', text: '拆成并列句，语法成立，但长信息被分开，句尾焦点弱。' },
    { tone: 'ok', text: '被动 + 长主语，语法成立但头重脚轻。' },
    { tone: 'best', text: '时间/地点前置，长的新信息留在句尾，焦点最清楚。' },
  ],
  'soften-r1': [
    { tone: 'off', text: '语法成立，但太直接，没有缓冲。' },
    { tone: 'off', text: '直接否定对方的方案，容易让人防御。' },
    { tone: 'best', text: '先 not sure 软化，再给讨论出口，最符合英语的缓冲习惯。' },
  ],
  'soften-r2': [
    { tone: 'best', text: 'not really my style 软否定，同时保留对朋友的正面反馈。' },
    { tone: 'off', text: '直给否定，容易伤人。' },
    { tone: 'off', text: '直接负面评价，太生硬。' },
  ],
  'soften-r3': [
    { tone: 'off', text: '太生硬，没有给对方台阶。' },
    { tone: 'best', text: '先表达愿意，再给原因和替代时间。' },
    { tone: 'off', text: '指责对方，容易把关系弄僵。' },
  ],
  'concrete-r1': [
    { tone: 'best', text: '用两个小时到二十分钟的具体对比证明好用。' },
    { tone: 'ok', text: '语法自然，但 useful / many advantages 太空泛。' },
    { tone: 'ok', text: 'good / convenient 太空泛，信息量低。' },
  ],
  'concrete-r2': [
    { tone: 'ok', text: '自然，但 helped me a lot 太空泛。' },
    { tone: 'best', text: '用具体动作和结果说明帮助。' },
    { tone: 'ok', text: 'very helpful 太空泛。' },
  ],
  'concrete-r3': [
    { tone: 'ok', text: '语法自然，但 very good 太空泛。' },
    { tone: 'ok', text: 'excellent service quality 偏书面、抽象。' },
    { tone: 'best', text: '用两个具体行为证明服务好。' },
  ],
  'logic-r1': [
    { tone: 'ok', text: '语法成立，但两个短句并列，因果关系没说出来。' },
    { tone: 'best', text: 'because 明确因果。' },
    { tone: 'ok', text: '两个短句并列，关系靠猜。' },
  ],
  'logic-r2': [
    { tone: 'ok', text: '语法成立，但转折没说出来。' },
    { tone: 'ok', text: 'and 只表并列，不表转折。' },
    { tone: 'best', text: 'even though 明确转折。' },
  ],
  'logic-r3': [
    { tone: 'best', text: '虚拟条件句把与事实相反的假设说清楚。' },
    { tone: 'ok', text: '语法成立，但说的是真实发生，不是假设。' },
    { tone: 'ok', text: '并列陈述，假设关系没说出来。' },
  ],
  'polite-r1': [
    { tone: 'best', text: 'could you + when you get a chance，给对方台阶。' },
    { tone: 'off', text: '命令句，缺缓冲。' },
    { tone: 'off', text: '命令/施压，容易引起反感。' },
  ],
  'polite-r2': [
    { tone: 'off', text: '命令句。' },
    { tone: 'ok', text: '只是陈述音乐太吵，没明确提出请求。' },
    { tone: 'best', text: 'would you mind + a bit，礼貌且明确。' },
  ],
  'polite-r3': [
    { tone: 'off', text: '命令口吻。' },
    { tone: 'best', text: 'I was wondering if 缓冲，适合对老师/上级。' },
    { tone: 'off', text: 'should 施压，像命令。' },
  ],
  'ref-r1': [
    { tone: 'off', text: '钥匙是单数，them 指复数。' },
    { tone: 'off', text: 'us 指人，不是钥匙。' },
    { tone: 'best', text: 'it 指单数的钥匙，指代清楚。' },
  ],
  'ref-r2': [
    { tone: 'best', text: 'she 指妈妈，指代正确。' },
    { tone: 'off', text: 'he 把妈妈的性别指错了。' },
    { tone: 'off', text: 'they 把单数的妈妈指成复数。' },
  ],
  'ref-r3': [
    { tone: 'ok', text: '语法成立，但 reading 后面少了宾语，「读完什么」没说清。' },
    { tone: 'best', text: '两个 it 分别补出 reading 和 understand 的对象。' },
    { tone: 'off', text: 'them 指复数，和前面的 it / 书不一致。' },
  ],
};
