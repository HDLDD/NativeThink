/**
 * 英文网文（web novel）推荐清单 —— **只提供官方阅读入口，不内置正文**。
 *
 * 为什么不做内置：见 docs/english-webnovels-candidates.md。要点：
 *  ① Royal Road ToS §2 禁止复制/再利用、§10(i) 禁止 spider/crawl/scrape，§19 版权归作者；
 *  ② 作者本人可能明示禁止再分发（例：qntm 对 `Ra` 明确说 "please do not redistribute Ra yourself"）；
 *  ③ 同人作品（如 HPMOR）作者无权授权底层 IP。
 * 所以本清单全部走 `window.open` 外链，App 内不落地任何正文。
 *
 * `builtin` 标记的是**作者主动 CC 授权**、理论上可内置的作品；即便如此也要守约束：
 *  BY-NC 要求 App 保持非商业；BY-ND 与 App 的 AI 翻译（演绎作品）冲突，基本不可用。
 *
 * 所有 `url` 都实测返回 200（作者站/平台官方页，Royal Road 用稳定的 `?title=` 搜索页而非易变的 fiction id）。
 */
export type WebnovelGroup = 'classic' | 'royalroad' | 'translated' | 'cc';

export interface IWebnovel {
  id: string;
  /** 英文原名 */
  title: string;
  /** 中文名（约定俗成译名，无通用译名时留空） */
  zhTitle?: string;
  author: string;
  /** 一句话中文简介 */
  zhBlurb: string;
  /** 官方阅读入口（已实测 200） */
  url: string;
  /** 展示用的平台名 */
  platform: string;
  group: WebnovelGroup;
  tags: string[];
  /** 篇幅量级提示 */
  length: string;
  /** 作者主动 CC 授权 → 理论上可内置；仍需守许可约束 */
  builtin?: boolean;
  /** 许可/注意事项 */
  licenseNote?: string;
}

export const WEBNOVEL_GROUP_LABEL: Record<WebnovelGroup, string> = {
  classic: '口碑经典（作者自建站）',
  royalroad: 'Royal Road 热门',
  translated: '翻译网文（官方英译平台）',
  cc: '作者 CC 授权（可考虑内置）',
};

export const WEBNOVELS: IWebnovel[] = [
  // ── 口碑经典（独立作者站）──
  {
    id: 'worm', title: 'Worm', zhTitle: '蠕虫', author: 'Wildbow',
    zhBlurb: '超级英雄世界里的黑暗成长史，英文网文圈公认的标杆长篇，叙事结构与人物弧线被反复讨论。',
    url: 'https://parahumans.wordpress.com/', platform: '作者自建站', group: 'classic',
    tags: ['超级英雄', '黑暗', '成长'], length: '约 168 万词',
  },
  {
    id: 'ward', title: 'Ward', author: 'Wildbow',
    zhBlurb: '《Worm》的续作，视角转向灾后重建与创伤修复，篇幅与密度同样惊人。',
    url: 'https://www.parahumans.net/', platform: '作者自建站', group: 'classic',
    tags: ['超级英雄', '续作'], length: '约 200 万词',
  },
  {
    id: 'pact', title: 'Pact', author: 'Wildbow',
    zhBlurb: '魔法与现代世界的契约体系，节奏极快、压迫感强，适合喜欢高强度冲突的读者。',
    url: 'https://pactwebserial.wordpress.com/', platform: '作者自建站', group: 'classic',
    tags: ['都市奇幻', '魔法'], length: '约 95 万词',
  },
  {
    id: 'pale', title: 'Pale', author: 'Wildbow',
    zhBlurb: '同一世界观下的另一条线，三个少女被卷入魔法世界，被认为是作者叙事最成熟的一部。',
    url: 'https://palewebserial.wordpress.com/', platform: '作者自建站', group: 'classic',
    tags: ['都市奇幻', '悬疑'], length: '约 300 万词',
  },
  {
    id: 'twig', title: 'Twig', author: 'Wildbow',
    zhBlurb: '生物朋克设定的架空历史，少年实验体的成长与背叛，文字风格最"文学"的一部。',
    url: 'https://twigserial.wordpress.com/', platform: '作者自建站', group: 'classic',
    tags: ['生物朋克', '架空历史'], length: '约 160 万词',
  },
  {
    id: 'unsong', title: 'Unsong', author: 'Scott Alexander',
    zhBlurb: '卡巴拉+语言学+加州梗的硬核荒诞奇幻，语言密度极高，适合英语水平较好的读者。',
    url: 'https://unsongbook.com/', platform: '作者自建站', group: 'classic',
    tags: ['奇幻', '语言游戏', '高难度'], length: '约 25 万词',
  },
  {
    id: 'wandering-inn', title: 'The Wandering Inn', zhTitle: '流浪旅店', author: 'pirateaba',
    zhBlurb: '异世界旅店经营 + 群像史诗，英文网文里篇幅最长、更新最稳的作品之一。',
    url: 'https://wanderinginn.com/', platform: '作者自建站', group: 'classic',
    tags: ['异世界', '群像', '超长篇'], length: '约 1200 万词',
  },
  {
    id: 'practical-guide', title: 'A Practical Guide to Evil', author: 'ErraticErrata',
    zhBlurb: '把"叙事套路"本身当物理定律的奇幻，已完成全集，设定极其巧妙。',
    url: 'https://practicalguidetoevil.wordpress.com/', platform: '作者自建站', group: 'classic',
    tags: ['奇幻', '元叙事', '已完结'], length: '约 300 万词',
  },
  {
    id: 'ra', title: 'Ra', author: 'Sam Hughes (qntm)',
    zhBlurb: '把魔法当作工程学科来做的硬科幻，作者自报 137,774 词，节奏紧凑。',
    url: 'https://qntm.org/ra', platform: 'qntm.org', group: 'classic',
    tags: ['硬科幻', '魔法工程'], length: '约 13.8 万词',
    licenseNote: '作者明示：抓站自用可以，但**不得再分发**该作品。仅外链。',
  },
  {
    id: 'qntm-fiction', title: 'Fine Structure / Ed 等', author: 'Sam Hughes (qntm)',
    zhBlurb: '作者的其余长篇与短篇合集入口，硬科幻/数学向，单篇篇幅比 Ra 更短。',
    url: 'https://qntm.org/fiction', platform: 'qntm.org', group: 'classic',
    tags: ['硬科幻', '数学'], length: '单篇 1~15 万词',
    licenseNote: '各篇许可不同，逐篇确认后再考虑内置。',
  },
  {
    id: 'hpmor', title: 'Harry Potter and the Methods of Rationality', author: 'Eliezer Yudkowsky',
    zhBlurb: '最有名的"理性同人"，用科学方法重写哈利波特，英文网文圈的入门经典。',
    url: 'https://hpmor.com/', platform: 'hpmor.com（授权镜像）', group: 'classic',
    tags: ['同人', '理性', '入门友好'], length: '约 66 万词',
    licenseNote: '**同人作品**：底层 IP 属 J.K. Rowling / Warner，作者无权授权，不可内置。',
  },

  // ── Royal Road 热门（平台站规禁止复制/爬取 → 仅外链）──
  {
    id: 'rr-best', title: 'Royal Road 总榜', author: '—',
    zhBlurb: '英文网文最大站的 Best Rated 榜，想自己淘书从这里进最快。',
    url: 'https://www.royalroad.com/fictions/best-rated', platform: 'Royal Road', group: 'royalroad',
    tags: ['榜单', '入口'], length: '—',
    licenseNote: '站规禁止复制与爬取，仅可外链。',
  },
  {
    id: 'mother-of-learning', title: 'Mother of Learning', author: 'nobody103',
    zhBlurb: '时间循环 + 魔法学院，结构极紧凑，常被当作英文网文的"最佳入门长篇"。',
    url: 'https://www.royalroad.com/fictions/search?title=Mother%20of%20Learning', platform: 'Royal Road', group: 'royalroad',
    tags: ['时间循环', '魔法', '入门友好'], length: '约 80 万词',
  },
  {
    id: 'super-supportive', title: 'Super Supportive', author: 'Sleyca',
    zhBlurb: '超级英雄 + 外星系统，文笔与情感描写在同类里属上乘，长期霸榜。',
    url: 'https://www.royalroad.com/fictions/search?title=Super%20Supportive', platform: 'Royal Road', group: 'royalroad',
    tags: ['超级英雄', '系统'], length: '约 200 万词',
  },
  {
    id: 'perfect-run', title: 'The Perfect Run', author: 'Maxime Durand',
    zhBlurb: '时间循环 + 超级英雄，三卷完结，节奏利落，适合不想追超长篇的读者。',
    url: 'https://www.royalroad.com/fictions/search?title=The%20Perfect%20Run', platform: 'Royal Road', group: 'royalroad',
    tags: ['时间循环', '已完结'], length: '约 50 万词',
  },
  {
    id: 'beware-of-chicken', title: 'Beware of Chicken', author: 'Casualfarmer',
    zhBlurb: '修仙题材的"慢生活"解构，轻松幽默，英语门槛相对低。',
    url: 'https://www.royalroad.com/fictions/search?title=Beware%20of%20Chicken', platform: 'Royal Road', group: 'royalroad',
    tags: ['修仙', '轻松'], length: '约 130 万词',
    licenseNote: '已进 Amazon Kindle Unlimited 独占，网络免费版可能已下架。',
  },
  {
    id: 'hwfwm', title: 'He Who Fights With Monsters', author: 'Shirtaloon',
    zhBlurb: '澳洲作者写的异世界 LitRPG，幽默感强，商业成绩最好的英文网文之一。',
    url: 'https://www.royalroad.com/fictions/search?title=He%20Who%20Fights%20With%20Monsters', platform: 'Royal Road', group: 'royalroad',
    tags: ['LitRPG', '异世界'], length: '约 400 万词',
    licenseNote: '已 KU 独占，网络免费版可能已下架。',
  },
  {
    id: 'dragoneye', title: "Beneath the Dragoneye Moons", author: 'Selkie Myth',
    zhBlurb: '治愈系 + 医疗 + 升级流，女主角视角，日常感强。',
    url: 'https://www.royalroad.com/fictions/search?title=Beneath%20the%20Dragoneye%20Moons', platform: 'Royal Road', group: 'royalroad',
    tags: ['升级流', '治愈'], length: '约 300 万词',
  },
  {
    id: 'worth-the-candle', title: 'Worth the Candle', author: 'Alexander Wales',
    zhBlurb: '把"创作者的心理创伤"写进异世界设定的元叙事作品，思想性强，偏难。',
    url: 'https://www.royalroad.com/fictions/search?title=Worth%20the%20Candle', platform: 'Royal Road', group: 'royalroad',
    tags: ['元叙事', '心理', '高难度'], length: '约 180 万词',
  },
  {
    id: 'mark-of-the-fool', title: 'Mark of the Fool', author: 'J.M. Clarke',
    zhBlurb: '魔法学院 + 逆袭流，已 KU 出版，是同类里商业上最成功的之一。',
    url: 'https://www.royalroad.com/fictions/search?title=Mark%20of%20the%20Fool', platform: 'Royal Road', group: 'royalroad',
    tags: ['学院', '逆袭'], length: '约 300 万词',
  },
  {
    id: 'azarinth-healer', title: 'Azarinth Healer', author: 'Rhaegar',
    zhBlurb: '战斗狂女主的 LitRPG，打斗描写密集，节奏快。',
    url: 'https://www.royalroad.com/fictions/search?title=Azarinth%20Healer', platform: 'Royal Road', group: 'royalroad',
    tags: ['LitRPG', '战斗'], length: '约 300 万词',
  },
  {
    id: 'primal-hunter', title: 'The Primal Hunter', author: 'Zogarth',
    zhBlurb: '系统降临 + 独行猎人，典型爽文结构，语言直白易读。',
    url: 'https://www.royalroad.com/fictions/search?title=The%20Primal%20Hunter', platform: 'Royal Road', group: 'royalroad',
    tags: ['系统', '爽文'], length: '约 300 万词',
  },
  {
    id: 'defiance', title: 'Defiance of the Fall', author: 'TheFirstDefier',
    zhBlurb: '末世系统流代表，设定厚重，英文圈口碑与销量双高。',
    url: 'https://www.royalroad.com/fictions/search?title=Defiance%20of%20the%20Fall', platform: 'Royal Road', group: 'royalroad',
    tags: ['末世', '系统'], length: '约 400 万词',
  },
  {
    id: 'ellc', title: 'Everybody Loves Large Chests', author: 'Neven Iliev',
    zhBlurb: '以怪物（宝箱）为主角的黑色幽默 LitRPG，口味独特。',
    url: 'https://www.royalroad.com/fictions/search?title=Everybody%20Loves%20Large%20Chests', platform: 'Royal Road', group: 'royalroad',
    tags: ['黑色幽默', 'LitRPG'], length: '约 100 万词',
  },

  // ── 翻译网文（官方英译平台）──
  {
    id: 'webtoon-en', title: 'Webtoon 官方英译（ORV / Solo Leveling 等）', author: '—',
    zhBlurb: '韩漫/韩网文官方英文平台，Omniscient Reader、Solo Leveling 等都在这里看正版英文。',
    url: 'https://www.webtoons.com/en/', platform: 'Webtoon', group: 'translated',
    tags: ['官方英译', '韩系'], length: '—',
  },
  {
    id: 'wuxiaworld', title: 'Wuxiaworld（中文网文英译）', author: '—',
    zhBlurb: '中文仙侠/玄幻英译的主要官方平台，Coiling Dragon 等由此进入英文圈。',
    url: 'https://www.wuxiaworld.com/', platform: 'Wuxiaworld', group: 'translated',
    tags: ['官方英译', '仙侠'], length: '—',
    licenseNote: '译作版权链复杂，仅外链，勿内置。',
  },

  // ── 作者主动 CC 授权（可考虑内置，但仍受许可约束）──
  {
    id: 'blindsight', title: 'Blindsight', author: 'Peter Watts',
    zhBlurb: '硬科幻长篇，作者官网提供免费全文下载，正文含 Creative Commons 授权章节。',
    url: 'https://www.rifters.com/real/Blindsight.htm', platform: '作者官网', group: 'cc',
    tags: ['硬科幻', '已出版'], length: '约 12 万词', builtin: true,
    licenseNote: 'CC 授权（须逐个确认变体）。若含 NC 则要求 App 保持非商业。',
  },
  {
    id: 'little-brother', title: 'Little Brother', author: 'Cory Doctorow',
    zhBlurb: '青少年向技术惊悚，作者一贯以 CC 授权发布并鼓励自由传播。',
    url: 'https://craphound.com/littlebrother/download/', platform: 'craphound.com', group: 'cc',
    tags: ['技术惊悚', 'YA'], length: '约 10 万词', builtin: true,
    licenseNote: '通常为 CC BY-NC-SA：可内置但**须保持非商业**并署名。',
  },
  {
    id: 'down-and-out', title: 'Down and Out in the Magic Kingdom', author: 'Cory Doctorow',
    zhBlurb: '第一部以 CC 授权发布的英文长篇，迪士尼未来世界的社交货币设定。',
    url: 'https://craphound.com/down/download/', platform: 'craphound.com', group: 'cc',
    tags: ['科幻', '已出版'], length: '约 6 万词', builtin: true,
    licenseNote: '早期作品变体可能是 **ND** —— ND 与 App 的 AI 翻译冲突，须先确认再内置。',
  },
  {
    id: 'accelerando', title: 'Accelerando', author: 'Charles Stross',
    zhBlurb: '奇点题材的经典长篇，作者曾以 CC 授权发布。',
    url: 'https://www.antipope.org/charlie/blog-static/fiction/accelerando/accelerando-intro.html', platform: 'antipope.org', group: 'cc',
    tags: ['奇点', '硬科幻'], length: '约 15 万词', builtin: true,
    licenseNote: '须按作者页声明确认许可变体；若为 ND 则与 AI 翻译冲突。',
  },
];
