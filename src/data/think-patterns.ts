export interface IThinkPatternChoice {
  id: string;
  prompt: string;
  options: [string, string, string];
  answer: 0 | 1 | 2;
  explanation: string;
}

export type ThinkTransferKind = 'scenario' | 'wording';

export interface IThinkPatternTransfer {
  id: string;
  /** 缺省视为 scenario，兼容 2026-10-23 的 24 个老迁移项 */
  kind?: ThinkTransferKind;
  situation: string;
  /** 给 AI 的判定重点（用户不可见） */
  rubricFocus: string;
  /** 迁移前给用户看的“先想三步” */
  thinkingSteps: [string, string, string];
  /** 反馈卡里解释参考表达为什么自然 */
  why: string;
  modelAnswer: string;
}

export type ThinkPatternLayer = 'structure' | 'verb' | 'clarity' | 'pragmatics';

export interface IThinkPatternLayerMeta {
  id: ThinkPatternLayer;
  name: string;
  description: string;
}

export const THINK_PATTERN_LAYERS: IThinkPatternLayerMeta[] = [
  { id: 'structure', name: '信息结构', description: '谁在前、什么在后、指代是否补全。' },
  { id: 'verb', name: '动词与焦点', description: '动作由谁承担、结果怎么落在句子里。' },
  { id: 'clarity', name: '逻辑与信息', description: '关系是否明说、断言力度、细节是否足够。' },
  { id: 'pragmatics', name: '语域与语用', description: '正式度、面子、请求/拒绝/赞美的默认脚本。' },
];

export interface IThinkPattern {
  id: string;
  layer: ThinkPatternLayer;
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
    layer: 'structure',
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
      {
        id: 'subject-first-w1',
        kind: 'wording',
        situation: '你想说“这个 bug 我们下周修”。',
        rubricFocus: '是否用 we 作主语、动作在前，而不是把 this bug 放在句首',
        thinkingSteps: ['谁修？→ we', '动作和时间？→ fix ... next week', '对象？→ this bug'],
        why: '中文把「这个 bug」当话题；英文先立主语 we，再让 fix 接对象和时间。',
        modelAnswer: "We'll fix this bug next week.",
      },
    ],
  },
  {
    id: 'verb-driven',
    layer: 'verb',
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
      {
        id: 'verb-driven-w1',
        kind: 'wording',
        situation: '你想说“我们得对方案做一次评估”。',
        rubricFocus: '是否用 evaluate/assess 这类动词，而不是“conduct an evaluation of”',
        thinkingSteps: ['谁评估？→ We', '动作是什么？→ evaluate/assess', '对象？→ the plan'],
        why: '「做一次评估」是名词化；英文用 evaluate/assess 直接承担动作。',
        modelAnswer: 'We need to evaluate the plan.',
      },
    ],
  },
  {
    id: 'end-focus',
    layer: 'structure',
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
      {
        id: 'end-focus-w1',
        kind: 'wording',
        situation: '你想说“最让我失望的是他连招呼都没打”。',
        rubricFocus: '是否用 What...was... 或 it 结构把新信息留在句尾',
        thinkingSteps: ['重点是什么？→ 他没打招呼', '用什么结构？→ What disappointed me most was...', '新信息放哪？→ that 从句放句尾'],
        why: '中文「最让我失望的是……」对应 What...was...；英文把新信息留到句尾，焦点更清楚。',
        modelAnswer: "What disappointed me most was that he didn't even say hello.",
      },
    ],
  },
  {
    id: 'soften-disagreement',
    layer: 'pragmatics',
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
      {
        id: 'soften-w1',
        kind: 'wording',
        situation: '朋友问你他的新发型怎么样，你觉得不太适合他。',
        rubricFocus: '是否先缓冲/承认，再软否定，而不是直接说难看',
        thinkingSteps: ['先给什么？→ I see what you were going for', '再说什么？→ not sure it suits you', '给什么出口？→ maybe try ...'],
        why: '先承认对方的意图，再用 not sure 软否定，最后给一个具体建议；比直接评价更自然。',
        modelAnswer: "I see what you were going for, but I'm not sure it suits you — maybe try something shorter?",
      },
    ],
  },
  {
    id: 'be-concrete',
    layer: 'clarity',
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
      {
        id: 'concrete-w1',
        kind: 'wording',
        situation: '你想说“这次改动效果很好”。',
        rubricFocus: '是否用具体指标/结果证明效果好，而不是只说 very effective',
        thinkingSteps: ['哪个指标变了？→ support tickets', '变了多少？→ down 30%', '时间范围？→ since the change'],
        why: '「效果很好」是空泛评价；用 support tickets down 30% 这类具体结果，效果才可信。',
        modelAnswer: 'This change cut support tickets by 30%.',
      },
    ],
  },
  {
    id: 'make-logic-explicit',
    layer: 'clarity',
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
      {
        id: 'logic-w1',
        kind: 'wording',
        situation: '你想说“他没回消息，所以我打了电话”。',
        rubricFocus: '是否用 because/so 明确因果，而不是两个短句并列',
        thinkingSteps: ['结果是什么？→ I called him', '原因是什么？→ he had not replied', '用什么词连接？→ because'],
        why: '中文两个短句靠语序暗示因果；英文用 because 把原因直接连上。',
        modelAnswer: 'I called him because he hadn’t replied.',
      },
    ],
  },
  {
    id: 'polite-request',
    layer: 'pragmatics',
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
      {
        id: 'polite-w1',
        kind: 'wording',
        situation: '同事在忙，你想请他有空时把报告发你。',
        rubricFocus: '是否用 could/would + 时间缓冲，给对方拒绝空间',
        thinkingSteps: ['先给什么？→ Could you', '加什么缓冲？→ when you have a moment', '请求是什么？→ send me the report'],
        why: 'Could you + when you have a moment 把命令变成请求；对方在忙时尤其需要这个缓冲。',
        modelAnswer: 'Could you send me the report when you have a moment?',
      },
    ],
  },
  {
    id: 'fill-references',
    layer: 'structure',
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
      {
        id: 'ref-w1',
        kind: 'wording',
        situation: '朋友问你有没有把书还给图书馆。',
        rubricFocus: '是否补出 you / the book / the library 的指代',
        thinkingSteps: ['谁还？→ you', '还什么？→ the book', '还给谁？→ the library'],
        why: '中文可以只问「还了吗？」；英文要把 you、the book、the library 都补出来。',
        modelAnswer: 'Did you return the book to the library?',
      },
    ],
  },
  {
    id: 'hedge-stance',
    layer: 'clarity',
    name: '把断言调到可讨论',
    oneLiner: '预测和评价用 may/might/tend to，不把推断说成事实。',
    contrast: {
      chineseThinking: '这个方案一定会失败。',
      native: 'This plan could fail.',
      note: '中文常用“一定/肯定”表达判断；英文在预测和评价里常用 could/may/tend to 调节确定性，避免把推断说成事实。',
    },
    cues: ['区分事实与推断：预测用 may/might/could', '概括用 tend to / seem to', '只有确认的事实用 will/is'],
    recognition: [
      {
        id: 'hedge-r1',
        prompt: '你想说“这个政策会影响小企业”。（这是预测）',
        options: [
          'This policy will affect small businesses.',
          'This policy may affect small businesses.',
          'This policy is going to destroy small businesses.',
        ],
        answer: 1,
        explanation: '预测影响用 may 更稳；will 把预测说成确定，destroy 又过度。',
      },
      {
        id: 'hedge-r2',
        prompt: '你想说“他好像不太同意”。（这是推断）',
        options: [
          "He doesn't agree.",
          'He will never agree.',
          'He seems not to agree.',
        ],
        answer: 2,
        explanation: "seems 明示这是推断；doesn't agree 像事实断言，will never 过度。",
      },
      {
        id: 'hedge-r3',
        prompt: '你想说“这个年龄段的孩子通常喜欢具体例子”。（这是概括）',
        options: [
          'Children of this age tend to like concrete examples.',
          'Children of this age like concrete examples.',
          'Every child of this age loves concrete examples.',
        ],
        answer: 0,
        explanation: 'tend to 明示这是概括；likes 像全称判断，every child 过度。',
      },
    ],
    transfer: [
      {
        id: 'hedge-t1',
        situation: '你想在报告里写“远程办公可能会降低通勤成本，但也可能影响团队协作”。',
        rubricFocus: '是否用 may/might/could 调节两面判断，而不是 will 一刀切',
        thinkingSteps: ['第一面是什么？→ lower commuting costs', '第二面是什么？→ affect collaboration', '用什么力度？→ may / could，不用 will'],
        why: '报告里的预测不是事实；may/could 把两面都留成可讨论的判断。',
        modelAnswer: 'Remote work may lower commuting costs, but it could also affect team collaboration.',
      },
      {
        id: 'hedge-t2',
        situation: '你想说“用户似乎更喜欢短一点的视频”。',
        rubricFocus: '是否用 seem/tend to 表达推断/概括，而不是绝对断言',
        thinkingSteps: ['这是事实还是推断？→ 从数据看出的推断', '用什么词？→ seem to / tend to', '比较对象？→ shorter videos'],
        why: '从数据里看出来的是倾向，不是全称事实；seem to/tend to 更准确。',
        modelAnswer: 'Users seem to prefer shorter videos.',
      },
      {
        id: 'hedge-w1',
        kind: 'wording',
        situation: '你想说“这个功能可能会增加服务器成本”。',
        rubricFocus: '是否用 could/may 调节预测，而不是 will 一刀切',
        thinkingSteps: ['这是事实还是预测？→ 预测', '用什么词？→ could / may', '影响是什么？→ server costs'],
        why: '预测成本影响用 could 更稳；will 会把推断说成确定。',
        modelAnswer: 'This feature could increase server costs.',
      },
    ],
  },
  {
    id: 'register-shift',
    layer: 'pragmatics',
    name: '先看场景再选正式度',
    oneLiner: '邮件/论文可以正式，聊天/会议要直接；名词化不是一律错。',
    contrast: {
      chineseThinking: '无论在哪都说“对数据进行分析”。',
      native: "Slack: Let's look at the data. / Email: We'll analyze the data.",
      note: '正式写作可以用名词化，日常沟通更常用动词；不是“名词化一律错”，而是“看场景选正式度”。',
    },
    cues: ['先判断场景：论文/邮件/聊天', '正式写作允许名词化，口语优先动词', '同一个意思准备两档说法'],
    recognition: [
      {
        id: 'register-r1',
        prompt: '你在团队 Slack 里说“我们明天分析一下数据”。哪个更合适？',
        options: [
          "We'll look at the data tomorrow.",
          'We will conduct an analysis of the data tomorrow.',
          'We shall undertake an analysis of the data tomorrow.',
        ],
        answer: 0,
        explanation: 'Slack 是即时沟通，look at 最自然；conduct an analysis 适合正式报告；shall undertake 过于公文。',
      },
      {
        id: 'register-r2',
        prompt: '你在给客户的正式邮件里写“我们已分析数据”。哪个更合适？',
        options: [
          'We looked at the data.',
          "We've analyzed the data.",
          'We did a look at the data.',
        ],
        answer: 1,
        explanation: '正式邮件用 analyze 的完成时最稳；looked at 偏口语；did a look at 搭配不自然。',
      },
      {
        id: 'register-r3',
        prompt: '你在论文里写“本研究对数据进行了分析”。哪个更合适？',
        options: [
          'We analyzed the data.',
          'We had a look at the data.',
          'This study conducted an analysis of the data.',
        ],
        answer: 2,
        explanation: '学术写作里 conduct an analysis of 很常见，和语域匹配；analyzed 也可以，但更直接、略口语；had a look at 太随意。',
      },
    ],
    transfer: [
      {
        id: 'register-t1',
        situation: '同一件事，写给客户邮件：“我们周四之前会检查这份合同”。请写正式邮件版本。',
        rubricFocus: '是否用正式但自然的表达（review/check the contract），不堆砌公文词',
        thinkingSteps: ['场景是什么？→ 客户邮件', '动作是什么？→ review/check', '时间？→ by Thursday'],
        why: '正式邮件不需要堆大词；review the contract by Thursday 已经足够正式、清楚。',
        modelAnswer: "We'll review the contract by Thursday.",
      },
      {
        id: 'register-t2',
        situation: '你想在 Slack 里请同事“对用户反馈做一次整理”。请写即时沟通版本。',
        rubricFocus: '是否用口语化动词（sort through/look through），而不是 conduct an analysis of',
        thinkingSteps: ['场景是什么？→ Slack', '动作是什么？→ sort through', '对象？→ user feedback'],
        why: 'Slack 里优先用动词短语；sort through the user feedback 比 conduct an analysis of 更符合即时沟通。',
        modelAnswer: 'Can you sort through the user feedback?',
      },
      {
        id: 'register-w1',
        kind: 'wording',
        situation: '你在正式邮件里请对方“看一下附件”。请写正式版本。',
        rubricFocus: '是否用 review/take a look at 的正式但自然表达，不堆公文词',
        thinkingSteps: ['场景是什么？→ 正式邮件', '动作是什么？→ review / take a look at', '对象？→ the attachment'],
        why: '正式邮件里 Please review the attachment 已经足够正式；不需要堆砌公文词。',
        modelAnswer: 'Please review the attached file.',
      },
    ],
  },
  {
    id: 'compliment-response',
    layer: 'pragmatics',
    name: '赞美先接住',
    oneLiner: '先感谢/接受，再补充，不先自贬。',
    contrast: {
      chineseThinking: '哪里哪里，还差得远。',
      native: "Thanks! I'm glad you liked it.",
      note: '中文常用自贬表示谦虚；英文里直接否定赞美容易让对方尴尬，先接住再补充更自然。',
    },
    cues: ['先 accept：Thanks / I appreciate that', "再 add：I'm glad... / It took a while", '不要用 no/no no 直接否定对方的判断'],
    recognition: [
      {
        id: 'compliment-r1',
        prompt: '同事夸你“这个方案做得真好”。你怎么回？',
        options: [
          "No, it's not good at all.",
          "Thanks! I'm glad it worked out.",
          "It's nothing.",
        ],
        answer: 1,
        explanation: '先接住赞美再补充，最自然；直接否定会让对方尴尬。',
      },
      {
        id: 'compliment-r2',
        prompt: '老师夸你“你的发音进步很大”。你怎么回？',
        options: [
          "Thanks! I've been practicing every day.",
          'No, my pronunciation is still bad.',
          "You're wrong.",
        ],
        answer: 0,
        explanation: '感谢 + 说明努力，既接住赞美又自然；否定和反驳都不合适。',
      },
      {
        id: 'compliment-r3',
        prompt: '朋友夸你“你做的菜太好吃了”。你怎么回？',
        options: [
          "It's just okay.",
          'You must be hungry.',
          "I'm glad you like it — it's my mom's recipe.",
        ],
        answer: 2,
        explanation: '接受 + 分享来源，是英文里常见的接法；自贬或转移话题都显得不自然。',
      },
    ],
    transfer: [
      {
        id: 'compliment-t1',
        situation: '同事说“你昨天的分享很清楚，谢谢”。请用英文回应。',
        rubricFocus: '是否先感谢/接受，再补充一句，而不是自贬',
        thinkingSteps: ['先接住什么？→ Thanks / I appreciate that', '补充什么？→ glad it was clear', '不要做什么？→ 不要 no/no 自贬'],
        why: '英文赞美回应先 accept 再 add；先自贬会让对方觉得自己的判断被否定。',
        modelAnswer: "Thanks! I'm glad it was clear.",
      },
      {
        id: 'compliment-t2',
        situation: '朋友夸你“你最近英语说得越来越自然了”。请用英文回应。',
        rubricFocus: '是否感谢 + 说明练习/分享，不直接否定',
        thinkingSteps: ['先接住什么？→ Thanks', '补充什么？→ I have been practicing', '不要做什么？→ 不要自贬'],
        why: '感谢 + 说明努力，既谦虚又自然；直接说“还很差”会让对话不好接。',
        modelAnswer: "Thanks! I've been practicing a lot lately.",
      },
      {
        id: 'compliment-w1',
        kind: 'wording',
        situation: '客户夸你“你们的响应速度很快”。请用英文回应。',
        rubricFocus: '是否先感谢/接受，再补充，不先自贬',
        thinkingSteps: ['先接住什么？→ Thank you', '补充什么？→ glad we could help quickly', '不要做什么？→ 不要自贬'],
        why: '英文赞美回应先 accept 再 add；客户夸响应速度时，感谢并确认结果最自然。',
        modelAnswer: "Thank you — I'm glad we could help quickly.",
      },
    ],
  },
  {
    id: 'result-state',
    layer: 'verb',
    name: '把结果说进句子里',
    oneLiner: '中文常用“把…V得…”说结果；英文常让动词或形容词直接承担结果。',
    contrast: {
      chineseThinking: '我把房间打扫干净了。',
      native: 'I cleaned the room. / I got the room clean.',
      note: '中文用“打扫干净”把动作和结果分开说；英文常用动词本身或“动词+宾语+形容词”把结果放进同一句。',
    },
    cues: ['先问“动作之后的结果是什么”', '结果可以用动词本身（clean）或 V + O + adj（get it clean）', '不要逐字翻“V 得/得干净”'],
    recognition: [
      {
        id: 'result-r1',
        prompt: '你想说“他把门推开了”。',
        options: [
          'He pushed the door open.',
          'He pushed the door and it was open.',
          'He opened the door by pushing.',
        ],
        answer: 0,
        explanation: 'push the door open 把动作和结果放在同一句，最自然；and it was open 割裂结果，by pushing 绕。',
      },
      {
        id: 'result-r2',
        prompt: '你想说“我把衣服洗干净了”。',
        options: [
          'I washed the clothes and they were clean.',
          'I got the clothes clean.',
          'I made the clothes clean by washing.',
        ],
        answer: 1,
        explanation: 'get the clothes clean 直接说结果；并列句松散，by washing 绕。',
      },
      {
        id: 'result-r3',
        prompt: '你想说“她把孩子哄睡了”。',
        options: [
          'She coaxed the child and the child slept.',
          'She made the child sleep by coaxing.',
          'She put the child to sleep.',
        ],
        answer: 2,
        explanation: 'put the child to sleep 是自然的结果表达；并列句和 by coaxing 都绕。',
      },
    ],
    transfer: [
      {
        id: 'result-t1',
        situation: '你想说“我把报告改好了，可以发了”。',
        rubricFocus: '是否用 get the report ready / finish the report 这类结果表达，而不是逐字翻“改好”',
        thinkingSteps: ['动作是什么？→ revise/edit', '结果是什么？→ ready to send', '用哪个结构？→ get the report ready / finish it'],
        why: '“改好”是动作+结果；英文用 get the report ready 或 finish the report 把结果直接说出来。',
        modelAnswer: "I've got the report ready to send.",
      },
      {
        id: 'result-t2',
        situation: '你想说“他把窗户擦干净了”。',
        rubricFocus: '是否用 clean the window / get the window clean，而不是“wipe the window clean”逐字直译',
        thinkingSteps: ['动作是什么？→ wipe/clean', '结果是什么？→ clean', '用哪个动词？→ clean the window / get it clean'],
        why: '英文常直接用 clean 承担“擦+干净”的结果；get the window clean 也可以，但 clean the window 更简洁。',
        modelAnswer: 'He cleaned the window.',
      },
      {
        id: 'result-w1',
        kind: 'wording',
        situation: '你想说“我把问题解决了”。',
        rubricFocus: '是否用 fix/solve 直接承担“解决”的结果，而不是逐字翻“把问题弄好”',
        thinkingSteps: ['动作是什么？→ fix/solve', '结果是什么？→ the problem is solved', '用哪个动词？→ fix / solve'],
        why: '中文「把问题解决了」是动作+结果；英文用 fix/solve 直接承担结果，比 make the problem good 自然。',
        modelAnswer: 'I fixed the problem.',
      },
    ],
  },
];

/**
 * 思维体检：每个模式抽一道识别题，按四层顺序排列。
 * 只用于选择接下来练哪些模式，不写 SM-2、不算“思维分”。
 */
export interface IThinkPatternDiagnosticItem {
  patternId: string;
  choiceId: string;
}

export const THINK_PATTERN_DIAGNOSTIC: IThinkPatternDiagnosticItem[] = [
  { patternId: 'subject-first', choiceId: 'subject-first-r1' },
  { patternId: 'end-focus', choiceId: 'end-focus-r1' },
  { patternId: 'fill-references', choiceId: 'ref-r1' },
  { patternId: 'verb-driven', choiceId: 'verb-driven-r1' },
  { patternId: 'result-state', choiceId: 'result-r1' },
  { patternId: 'be-concrete', choiceId: 'concrete-r1' },
  { patternId: 'make-logic-explicit', choiceId: 'logic-r1' },
  { patternId: 'hedge-stance', choiceId: 'hedge-r1' },
  { patternId: 'soften-disagreement', choiceId: 'soften-r1' },
  { patternId: 'polite-request', choiceId: 'polite-r1' },
  { patternId: 'compliment-response', choiceId: 'compliment-r1' },
  { patternId: 'register-shift', choiceId: 'register-r1' },
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
  'hedge-r1': [
    { tone: 'ok', text: '语法自然，但 will 把预测说成确定；除非你有证据，否则力度过强。' },
    { tone: 'best', text: 'may 给判断留余地，最符合“预测影响”的语域。' },
    { tone: 'off', text: 'destroy 过度绝对，还带情绪，不像报告里的判断。' },
  ],
  'hedge-r2': [
    { tone: 'ok', text: '语法自然，但把推断说成事实，力度过强。' },
    { tone: 'off', text: 'never 过度绝对，把一次观察说成永久结论。' },
    { tone: 'best', text: 'seems 明示这是推断，力度最准。' },
  ],
  'hedge-r3': [
    { tone: 'best', text: 'tend to 明示这是概括，不把倾向说成规律。' },
    { tone: 'ok', text: '语法自然，但像全称判断，忽略了例外。' },
    { tone: 'off', text: 'every child 过度绝对，和“通常”矛盾。' },
  ],
  'register-r1': [
    { tone: 'best', text: 'Slack 是即时沟通，look at 直接、自然。' },
    { tone: 'ok', text: '语法和搭配自然，但放在 Slack 里太正式。' },
    { tone: 'off', text: 'shall undertake 过于公文，和即时沟通的语域不匹配。' },
  ],
  'register-r2': [
    { tone: 'ok', text: '语法自然，但正式邮件里 looked at 偏口语。' },
    { tone: 'best', text: '正式邮件用 analyze 的完成时，语域最匹配。' },
    { tone: 'off', text: 'did a look at 搭配不自然；用 looked at / analyzed 更好。' },
  ],
  'register-r3': [
    { tone: 'ok', text: '语法自然，学术写作也能用；只是比名词化更直接、略口语。' },
    { tone: 'off', text: 'had a look at 太口语，不适合论文。' },
    { tone: 'best', text: '学术语域里 conduct an analysis of 常见、自然，和论文匹配。' },
  ],
  'compliment-r1': [
    { tone: 'off', text: '直接否定对方的判断，容易让对话卡住。' },
    { tone: 'best', text: '先感谢、再补充，最符合英文赞美回应。' },
    { tone: 'ok', text: '语法自然，但 it’s nothing 仍是自贬，英文里偏生硬。' },
  ],
  'compliment-r2': [
    { tone: 'best', text: '感谢 + 说明努力，既接住赞美又自然。' },
    { tone: 'off', text: '自贬过度，让老师不好接。' },
    { tone: 'off', text: '直接反驳，失礼。' },
  ],
  'compliment-r3': [
    { tone: 'ok', text: '语法自然，但仍是自贬，容易让对方觉得赞美被推开。' },
    { tone: 'off', text: '转移话题，像在否定对方的赞美。' },
    { tone: 'best', text: '接受 + 分享来源，自然且有信息量。' },
  ],
  'result-r1': [
    { tone: 'best', text: 'V + O + adj，把动作和结果放在同一句。' },
    { tone: 'ok', text: '语法成立，但结果被拆成并列句，重点散了。' },
    { tone: 'ok', text: '语法成立，但 by pushing 把方式放到后面，句子更绕。' },
  ],
  'result-r2': [
    { tone: 'ok', text: '语法成立，但结果被拆成两句，力度弱。' },
    { tone: 'best', text: 'get + O + adj，直接说结果。' },
    { tone: 'ok', text: '语法成立，但 by washing 结构绕。' },
  ],
  'result-r3': [
    { tone: 'ok', text: '语法成立，但结果被拆成两句。' },
    { tone: 'ok', text: '语法成立，但 by coaxing 结构绕。' },
    { tone: 'best', text: 'put + O + to sleep，动作和结果一体。' },
  ],
};
