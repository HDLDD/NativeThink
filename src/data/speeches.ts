// Famous speeches + TED talks — full text data
// Extracted from ArticlePage to keep component lean
import type { IReadingContent, IParagraph } from './reading';
import { buildPages } from './reading';

export interface SpeechMeta {
  id: string; title: string; zhTitle: string; author: string; year: number;
  type: string; topic: string; image?: string; preview: string;
}

/** Build a speech reading content from paragraph array */
function speechContent(meta: SpeechMeta, paras: IParagraph[]): IReadingContent {
  return {
    id: meta.id,
    type: 'speech',
    title: meta.title,
    zhTitle: meta.zhTitle,
    author: meta.author,
    source: meta.type,
    topic: meta.topic,
    difficulty: 'intermediate',
    cover: meta.image,
    pages: buildPages(paras),
    totalWords: paras.reduce((s, p) => s + p.en.split(/\s+/).filter(Boolean).length, 0),
  };
}

// ── Metadata for all speeches ──
export const FAMOUS_SPEECHES_META: SpeechMeta[] = [
  { id: 'mlk-dream', title: 'I Have a Dream', zhTitle: '我有一个梦想', author: 'Martin Luther King Jr.', year: 1963, type: '历史演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Martin_Luther_King%2C_Jr..jpg/440px-Martin_Luther_King%2C_Jr..jpg', preview: 'I am happy to join with you today...' },
  { id: 'gettysburg', title: 'The Gettysburg Address', zhTitle: '葛底斯堡演说', author: 'Abraham Lincoln', year: 1863, type: '历史演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Abraham_Lincoln_O-77_matte_collodion_print.jpg/440px-Abraham_Lincoln_O-77_matte_collodion_print.jpg', preview: 'Four score and seven years ago...' },
  { id: 'churchill-finest', title: 'Their Finest Hour', zhTitle: '最光辉的时刻', author: 'Winston Churchill', year: 1940, type: '历史演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Sir_Winston_Churchill_-_19086236948.jpg/440px-Sir_Winston_Churchill_-_19086236948.jpg', preview: 'What General Weygand called the Battle of France is over...' },
  { id: 'jfk-inaugural', title: 'Inaugural Address', zhTitle: '就职演说', author: 'John F. Kennedy', year: 1961, type: '历史演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/John_F._Kennedy%2C_White_House_color_photo_portrait.jpg/440px-John_F._Kennedy%2C_White_House_color_photo_portrait.jpg', preview: 'We observe today not a victory of party...' },
  { id: 'susan-anthony', title: "On Women's Right to Vote", zhTitle: '论妇女选举权', author: 'Susan B. Anthony', year: 1873, type: '历史演讲', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Susan_B._Anthony_c1855.png/440px-Susan_B._Anthony_c1855.png', preview: 'Friends and fellow citizens...' },
  { id: 'ted-robinson-school', title: 'Do Schools Kill Creativity?', zhTitle: '学校扼杀创造力吗？', author: 'Sir Ken Robinson', year: 2006, type: 'TED', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Sir_Ken_Robinson.jpg/440px-Sir_Ken_Robinson.jpg', preview: 'Good morning. How are you?...' },
  { id: 'ted-sinek-leaders', title: 'How Great Leaders Inspire Action', zhTitle: '伟大领袖如何激励行动', author: 'Simon Sinek', year: 2009, type: 'TED', topic: 'business', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Simon_Sinek_2019.jpg/440px-Simon_Sinek_2019.jpg', preview: 'How do you explain when things...' },
  { id: 'ted-brown-vulnerability', title: 'The Power of Vulnerability', zhTitle: '脆弱的力量', author: 'Brené Brown', year: 2010, type: 'TED', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Brene_Brown_2018.png/440px-Brene_Brown_2018.png', preview: "So, I'll start with this..." },
  { id: 'ted-cuddy-body', title: 'Your Body Language Shapes Who You Are', zhTitle: '肢体语言塑造你自己', author: 'Amy Cuddy', year: 2012, type: 'TED', topic: 'science', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Amy_Cuddy_2018.jpg/440px-Amy_Cuddy_2018.jpg', preview: 'So I want to start by offering...' },
  { id: 'ted-duckworth-grit', title: 'Grit: The Power of Passion and Perseverance', zhTitle: '毅力：激情与坚持的力量', author: 'Angela Duckworth', year: 2013, type: 'TED', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Angela_Duckworth_2017.jpg/440px-Angela_Duckworth_2017.jpg', preview: 'When I was 27 years old...' },
  { id: 'ted-harari-nationalism', title: 'Why Fascism is so Tempting', zhTitle: '法西斯主义为何诱人', author: 'Yuval Noah Harari', year: 2018, type: 'TED', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Yuval_Noah_Harari_2022.jpg/440px-Yuval_Noah_Harari_2022.jpg', preview: 'So, humankind has two great stories...' },
  { id: 'ted-gates-climate', title: 'Innovating to Zero', zhTitle: '创新到零排放', author: 'Bill Gates', year: 2010, type: 'TED', topic: 'science', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Bill_Gates_2018.jpg/440px-Bill_Gates_2018.jpg', preview: "I'm going to talk today about energy..." },
  { id: 'ted-adichie-single', title: 'The Danger of a Single Story', zhTitle: '单一故事的危险', author: 'Chimamanda Adichie', year: 2009, type: 'TED', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Chimamanda_Adichie_2015.jpg/440px-Chimamanda_Adichie_2015.jpg', preview: "I'm a storyteller..." },
  { id: 'ted-urban-procrastination', title: 'Inside the Mind of a Master Procrastinator', zhTitle: '拖延症大师的内心世界', author: 'Tim Urban', year: 2016, type: 'TED', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Tim_Urban_2016.jpg/440px-Tim_Urban_2016.jpg', preview: 'So in college, I was a government major...' },
  { id: 'ted-godin-tribes', title: 'The Tribes We Lead', zhTitle: '我们领导的部落', author: 'Seth Godin', year: 2009, type: 'TED', topic: 'business', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Seth_Godin_2009.jpg/440px-Seth_Godin_2009.jpg', preview: 'Something really important is happening...' },
  { id: 'jobs-stanford', title: 'Stanford Commencement Address', zhTitle: '斯坦福毕业演讲', author: 'Steve Jobs', year: 2005, type: '毕业演讲', topic: 'business', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Steve_Jobs_Headshot_2010-CROP_%28cropped_2%29.jpg/440px-Steve_Jobs_Headshot_2010-CROP_%28cropped_2%29.jpg', preview: 'I am honored to be with you today...' },
  { id: 'rowling-harvard', title: 'The Fringe Benefits of Failure', zhTitle: '失败带来的额外收益', author: 'J.K. Rowling', year: 2008, type: '毕业演讲', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/J._K._Rowling_2010.jpg/440px-J._K._Rowling_2010.jpg', preview: 'President Faust, members of the Harvard Corporation...' },
  { id: 'obama-yes-we-can', title: 'Yes We Can Speech', zhTitle: '是的，我们可以', author: 'Barack Obama', year: 2008, type: '政治演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/President_Barack_Obama.jpg/440px-President_Barack_Obama.jpg', preview: 'If there is anyone out there...' },
  { id: 'rand-Atlas', title: 'This is John Galt Speaking', zhTitle: '约翰·高尔特演说', author: 'Ayn Rand', year: 1957, type: '文学演讲', topic: 'philosophy', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Ayn_Rand_%281943_Talbot_portrait%29.jpg/440px-Ayn_Rand_%281943_Talbot_portrait%29.jpg', preview: 'For twelve years you have been asking...' },
  { id: 'mandela-inaugural', title: 'Inaugural Address', zhTitle: '就职演说', author: 'Nelson Mandela', year: 1994, type: '历史演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Nelson_Mandela_1994.jpg/440px-Nelson_Mandela_1994.jpg', preview: 'Our deepest fear is not that we are inadequate...' },
  { id: 'greta-un-climate', title: 'How Dare You', zhTitle: '你们怎么敢', author: 'Greta Thunberg', year: 2019, type: 'UN演讲', topic: 'science', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Greta_Thunberg_2020_%28cropped%29.jpg/440px-Greta_Thunberg_2020_%28cropped%29.jpg', preview: 'My message is that we\'ll be watching you...' },
  { id: 'emma-heforshe', title: 'HeForShe Gender Equality', zhTitle: '他为她性别平等', author: 'Emma Watson', year: 2014, type: 'UN演讲', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Emma_Watson_2013.jpg/440px-Emma_Watson_2013.jpg', preview: 'Today we are launching a campaign...' },
  { id: 'malala-un', title: 'Education for All', zhTitle: '全民教育', author: 'Malala Yousafzai', year: 2013, type: 'UN演讲', topic: 'culture', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Malala_Yousafzai_2015.jpg/440px-Malala_Yousafzai_2015.jpg', preview: 'In the name of God...' },
  { id: 'reagan-challenger', title: 'The Challenger Disaster Speech', zhTitle: '挑战者号灾难演说', author: 'Ronald Reagan', year: 1986, type: '历史演讲', topic: 'history', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Official_Portrait_of_President_Reagan_1981.jpg/440px-Official_Portrait_of_President_Reagan_1981.jpg', preview: "Ladies and gentlemen, I'd planned to speak..." },
];

// ── Speech full texts ──
export function getSpeechContent(id: string): string {
  return SPEECH_TEXTS[id] || '';
}

const SPEECH_TEXTS: Record<string, string> = {};

// MLK - I Have a Dream
SPEECH_TEXTS['mlk-dream'] = `I am happy to join with you today in what will go down in history as the greatest demonstration for freedom in the history of our nation.

Five score years ago, a great American, in whose symbolic shadow we stand today, signed the Emancipation Proclamation. This momentous decree came as a great beacon light of hope to millions of Negro slaves who had been seared in the flames of withering injustice. It came as a joyous daybreak to end the long night of their captivity.

But one hundred years later, the Negro still is not free. One hundred years later, the life of the Negro is still sadly crippled by the manacles of segregation and the chains of discrimination. One hundred years later, the Negro lives on a lonely island of poverty in the midst of a vast ocean of material prosperity. One hundred years later, the Negro is still languished in the corners of American society and finds himself an exile in his own land. And so we've come here today to dramatize a shameful condition.

I have a dream that one day this nation will rise up and live out the true meaning of its creed: "We hold these truths to be self-evident, that all men are created equal."

I have a dream that one day on the red hills of Georgia, the sons of former slaves and the sons of former slave owners will be able to sit down together at the table of brotherhood.

I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin but by the content of their character. I have a dream today!

This is our hope, and this is the faith that I go back to the South with. With this faith, we will be able to hew out of the mountain of despair a stone of hope.

When we allow freedom to ring, we will be able to speed up that day when all of God's children will be able to join hands and sing: Free at last! Free at last! Thank God Almighty, we are free at last!`;

// Gettysburg Address
SPEECH_TEXTS['gettysburg'] = `Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.

Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battlefield of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.

But, in a larger sense, we can not dedicate — we can not consecrate — we can not hallow — this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here.

It is rather for us to be here dedicated to the great task remaining before us — that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion — that we here highly resolve that these dead shall not have died in vain — that this nation, under God, shall have a new birth of freedom — and that government of the people, by the people, for the people, shall not perish from the earth.`;

// Churchill
SPEECH_TEXTS['churchill-finest'] = `What General Weygand called the Battle of France is over. I expect that the Battle of Britain is about to begin. Upon this battle depends the survival of Christian civilization.

Hitler knows that he will have to break us in this Island or lose the war. If we can stand up to him, all Europe may be free and the life of the world may move forward into broad, sunlit uplands. But if we fail, then the whole world, including the United States, will sink into the abyss of a new Dark Age.

Let us therefore brace ourselves to our duties, and so bear ourselves that, if the British Empire and its Commonwealth last for a thousand years, men will still say, "This was their finest hour."

We shall go on to the end. We shall fight in France, we shall fight on the seas and oceans, we shall fight with growing confidence and growing strength in the air, we shall defend our Island, whatever the cost may be. We shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets, we shall fight in the hills; we shall never surrender.`;

// JFK
SPEECH_TEXTS['jfk-inaugural'] = `We observe today not a victory of party but a celebration of freedom — symbolizing an end as well as a beginning — signifying renewal as well as change.

The world is very different now. For man holds in his mortal hands the power to abolish all forms of human poverty and all forms of human life. And yet the same revolutionary beliefs for which our forebears fought are still at issue around the globe.

Let the word go forth from this time and place, to friend and foe alike, that the torch has been passed to a new generation of Americans — born in this century, tempered by war, disciplined by a hard and bitter peace, proud of our ancient heritage.

And so, my fellow Americans: ask not what your country can do for you — ask what you can do for your country. My fellow citizens of the world: ask not what America will do for you, but what together we can do for the freedom of man.`;

// Susan B. Anthony
SPEECH_TEXTS['susan-anthony'] = `Friends and fellow citizens: I stand before you tonight under indictment for the alleged crime of having voted at the last presidential election, without having a lawful right to vote. It shall be my work this evening to prove to you that in thus voting, I not only committed no crime, but, instead, simply exercised my citizen's rights.

The preamble of the Federal Constitution says: "We, the people of the United States, in order to form a more perfect union..." It was we, the people; not we, the white male citizens; nor yet we, the male citizens; but we, the whole people, who formed the Union. And we formed it, not to give the blessings of liberty, but to secure them — not to the half of ourselves, but to the whole people — women as well as men.

The only question left to be settled now is: Are women persons? And I hardly believe any of our opponents will have the hardihood to say they are not. Being persons, then, women are citizens; and no state has a right to make any law that shall abridge their privileges or immunities.`;

// Steve Jobs Stanford
SPEECH_TEXTS['jobs-stanford'] = `I am honored to be with you today at your commencement from one of the finest universities in the world. I never graduated from college. Truth be told, this is the closest I've ever gotten to a college graduation. Today I want to tell you three stories from my life. That's it. No big deal. Just three stories.

The first story is about connecting the dots. I dropped out of Reed College after the first 6 months, but then stayed around as a drop-in for another 18 months or so before I really quit. So why did I drop out? It started before I was born... I decided to drop out and trust that it would all work out OK. It was pretty scary at the time, but looking back it was one of the best decisions I ever made.

My second story is about love and loss. I was lucky — I found what I loved to do early in life. Woz and I started Apple in my parents' garage when I was 20. We worked hard, and in 10 years Apple had grown from just the two of us in a garage into a $2 billion company with over 4000 employees... And then I got fired.

My third story is about death. When I was 17, I read a quote that went something like: "If you live each day as if it was your last, someday you'll most certainly be right." Remembering that I'll be dead soon is the most important tool I've ever encountered to help me make the big choices in life.

Your time is limited, so don't waste it living someone else's life. Stay hungry, stay foolish.`;

// Obama Yes We Can
SPEECH_TEXTS['obama-yes-we-can'] = `If there is anyone out there who still doubts that America is a place where all things are possible, who still wonders if the dream of our founders is alive in our time, who still questions the power of our democracy, tonight is your answer.

It's the answer told by lines that stretched around schools and churches in numbers this nation has never seen, by people who waited three hours and four hours, many for the very first time in their lives, because they believed that this time must be different.

It's the answer spoken by young and old, rich and poor, Democrat and Republican, black, white, Latino, Asian, Native American, gay, straight, disabled and not disabled. Americans who sent a message to the world that we have never been just a collection of individuals or a collection of red states and blue states. We are, and always will be, the United States of America.

Yes, we can. Yes, we can. Yes, we can. This is our moment. This is our time — to put our people back to work and open doors of opportunity for our kids; to restore prosperity and promote the cause of peace; to reclaim the American Dream. Where we are met with cynicism and doubt, we will respond with that timeless creed that sums up the spirit of a people: Yes, we can.`;

// Rowling Harvard
SPEECH_TEXTS['rowling-harvard'] = `President Faust, members of the Harvard Corporation and the Board of Overseers, members of the faculty, proud parents, and, above all, graduates. The first thing I would like to say is "thank you."

I have come up with two answers. On this wonderful day when we are gathered together to celebrate your academic success, I have decided to talk to you about the benefits of failure. And as you stand on the threshold of what is sometimes called "real life," I want to extol the crucial importance of imagination.

Why do I talk about the benefits of failure? Simply because failure meant a stripping away of the inessential. I stopped pretending to myself that I was anything other than what I was, and began to direct all my energy into finishing the only work that mattered to me.

Imagination is not only the uniquely human capacity to envision that which is not, and therefore the fount of all invention and innovation. In its arguably most transformative capacity, it is the power that enables us to empathise with humans whose experiences we have never shared.

As is a tale, so is life: not how long it is, but how good it is, is what matters. I wish you all very good lives.`;

// Reagan Challenger
SPEECH_TEXTS['reagan-challenger'] = `Ladies and gentlemen, I'd planned to speak to you tonight to report on the state of the Union, but the events of earlier today have led me to change those plans. Today is a day for mourning and remembering.

Nancy and I are pained to the core by the tragedy of the shuttle Challenger. We know we share this pain with all of the people of our country. This is truly a national loss.

We've never lost an astronaut in flight; we've never had a tragedy like this. And perhaps we've forgotten the courage it took for the crew of the shuttle. But they, the Challenger Seven, were aware of the dangers, but overcame them and did their jobs brilliantly. We mourn seven heroes.

Your loved ones were daring and brave, and they had that special grace, that special spirit that says, "Give me a challenge, and I'll meet it with joy." They had a hunger to explore the universe and discover its truths.

The crew of the space shuttle Challenger honored us by the manner in which they lived their lives. We will never forget them, nor the last time we saw them, this morning, as they prepared for their journey and waved goodbye and "slipped the surly bonds of Earth" to "touch the face of God."`;

// TED talks — abridged versions
SPEECH_TEXTS['ted-robinson-school'] = `Good morning. How are you? It's been great, hasn't it? I've been blown away by the whole thing.

There have been three themes running through the conference. One is the extraordinary evidence of human creativity in all of the presentations. Just the variety of it and the range of it. The second is that it's put us in a place where we have no idea what's going to happen, in terms of the future.

Children starting school this year will be retiring in 2065. Nobody has a clue what the world will look like in five years' time. And yet we're meant to be educating them for it.

We are educating people out of their creative capacities. Picasso once said that all children are born artists. The problem is to remain an artist as we grow up. I believe this passionately, that we don't grow into creativity, we grow out of it. Or rather, we get educated out of it.

Our education system has mined our minds in the way that we strip-mine the earth: for a particular commodity. And for the future, it won't serve us. We have to rethink the fundamental principles on which we're educating our children.`;

SPEECH_TEXTS['ted-sinek-leaders'] = `How do you explain when things don't go as we assume? Or better, how do you explain when others are able to achieve things that seem to defy all of the assumptions?

Why is Apple so innovative? Year after year, they're more innovative than all their competition. And yet, they're just a computer company. They have the same access to the same talent, the same agencies, the same consultants, the same media. Then why is it that they seem to have something different?

People don't buy what you do; they buy why you do it. The goal is not to do business with everybody who needs what you have. The goal is to do business with people who believe what you believe.

Martin Luther King gave the "I Have a Dream" speech, not the "I Have a Plan" speech. Leaders hold a position of power or authority, but those who lead inspire us. Whether they're individuals or organizations, we follow those who lead, not because we have to, but because we want to.`;

SPEECH_TEXTS['ted-brown-vulnerability'] = `So, I'll start with this: a couple years ago, an event planner called me because I was going to do a speaking event. And she called, and she said, "I'm really struggling with how to write about you on the little flyer."

I'm a researcher and a storyteller. I study human connection — our ability to empathize, belong, love. In my research, I asked people to tell me about connection. They told me about disconnection — about being let go, about heartbreak.

This is what I found: shame is really easily understood as the fear of disconnection. The people who have a strong sense of love and belonging believe they're worthy of love and belonging. That's the only difference.

What they had in common was courage — the courage to be imperfect, the compassion to be kind to themselves first and then to others, and connection as a result of authenticity. They fully embraced vulnerability. They believed that what made them vulnerable made them beautiful.`;

SPEECH_TEXTS['ted-cuddy-body'] = `So I want to start by offering you a free no-tech life hack, and all it requires of you is this: that you change your posture for two minutes.

Body language affects how others see us, but it may also change how we see ourselves. Social psychologist Amy Cuddy argues that "power posing" — standing in a posture of confidence, even when we don't feel confident — can boost feelings of confidence, and might have an impact on our chances for success.

Our bodies change our minds, and our minds can change our behavior, and our behavior can change our outcomes. Don't fake it till you make it. Fake it till you become it. Do it enough until you actually become it and internalize.

Tiny tweaks can lead to big changes. Before you go into the next stressful evaluative situation, try a power pose for two minutes. Configure your brain to cope the best in that situation.`;

SPEECH_TEXTS['ted-duckworth-grit'] = `When I was 27 years old, I left a very demanding job in management consulting for a job that was even more demanding: teaching. I taught seventh grade math in the New York City public schools.

I was shocked by the fact that the best and worst students were not always the ones with the highest or lowest IQs. Some of my strongest performers did not have stellar IQ scores, and some of my smartest kids weren't doing so well.

I started studying kids and adults in all kinds of challenging settings. In every study, my question was: who is successful here and why? My research team and I went to West Point, we went to the National Spelling Bee, we studied rookie teachers in really tough neighborhoods.

One characteristic emerged as a significant predictor of success. It wasn't social intelligence. It wasn't good looks, physical health, and it wasn't IQ. It was grit. Grit is passion and perseverance for very long-term goals. Grit is having stamina. Grit is sticking with your future, day in, day out — not just for the week, not just for the month, but for years — and working really hard to make that future a reality.`;

SPEECH_TEXTS['ted-harari-nationalism'] = `So, humankind has two great stories. One is the story of nationalism, and the other is the story of liberalism. And there is a battle going on between these two stories.

The nationalist story says that the world is divided into nations, and each nation has a unique culture, a unique history, a unique destiny. You owe your primary loyalty to your nation.

The liberal story says that the ultimate value is the individual human being. There is no higher authority than the individual. Human rights are universal. Every individual has the right to live, to freedom, to the pursuit of happiness, regardless of nationality.

Both stories are fiction. They are not objective realities. They are stories that we humans invented and that we tell each other. But you cannot organize society without some story. Fascism is appealing because it offers a very simple story. It tells people that there is a struggle for supremacy between nations, and your nation is the best.

And the really important thing is: the story that will win in the 21st century is not the nationalist story and not the liberal story. It will be a new story. And we need to start writing it now. Because if we don't write a new story, we might find ourselves in a very dark place. So we need to get to know each other better. We need to appreciate the stories of other people. And we need to create together a new global story that will encompass all of humankind.`;

// Bill Gates — Innovating to Zero (TED 2010)
SPEECH_TEXTS['ted-gates-climate'] = `I'm going to talk today about energy and climate. And that might seem a bit surprising because my full-time work at the foundation is mostly about vaccines and seeds. But I also have an interest in energy and climate.

We're going to have to actually take the CO2 emissions from the world and get them down to zero. That's what it means to talk about climate change. CO2 is a greenhouse gas. It traps heat from the sun, and so as you put more CO2 into the atmosphere, the temperature goes up.

Now, where does CO2 come from? People think of it as just coming from electricity and cars. But really, if you look at the whole world, there are five main sources. There's electricity generation, about 25 percent. There's manufacturing — making cement, steel, aluminum — about 25 percent. There's agriculture — mostly from livestock and fertilizer — about 20 percent. There's transportation — cars, trucks, planes, ships — about 20 percent. And there's buildings — heating and cooling — about 10 percent.

So we need to get all five of these sectors down to zero. And that's a huge challenge. Because the energy industry is a 5 trillion dollar a year industry, with enormous capital investments that last for 30, 40, 50 years.

What we need is an energy miracle. We need breakthroughs that are the equivalent of the Internet, but for energy. We need technologies like advanced nuclear — that's safer, cheaper, and produces less waste. We need carbon capture and storage — pulling CO2 out of the air or out of power plant emissions.

The world needs to invest much more in energy research and development. We need hundreds of companies working on hundreds of ideas. And governments need to create the incentives — the carbon taxes, the R&D funding, the deployment subsidies — that will drive this innovation.

We can do this. It won't be easy. It will be the most difficult thing humanity has ever done. But if we succeed, we'll have clean, cheap, reliable energy for everyone on the planet. And that's a future worth fighting for.`;

// Chimamanda Adichie — The Danger of a Single Story (TED 2009)
SPEECH_TEXTS['ted-adichie-single'] = `I'm a storyteller. And I would like to tell you a few personal stories about what I like to call "the danger of the single story."

I grew up on a university campus in eastern Nigeria. My mother says that I started reading at the age of two, although I think four is probably closer to the truth. So I was an early reader, and what I read were British and American children's books.

I was also an early writer, and when I began to write, at about the age of seven, stories in pencil with crayon illustrations that my poor mother was obligated to read, I wrote exactly the kinds of stories I was reading: All my characters were white and blue-eyed, they played in the snow, they ate apples, and they talked a lot about the weather, how lovely it was that the sun had come out. This despite the fact that I lived in Nigeria. I had never been outside Nigeria. We didn't have snow, we ate mangoes, and we never talked about the weather because there was no need to.

What this demonstrates is how impressionable and vulnerable we are in the face of a story, particularly as children. Because all I had read were books in which characters were foreign, I had become convinced that books by their very nature had to have foreigners in them.

But then I discovered African writers — Chinua Achebe, Camara Laye. Their stories saved me from having a single story of what books are.

I come from a conventional, middle-class Nigerian family. My father was a professor. My mother was an administrator. And so we had, as was the norm, live-in domestic help. When I was eight, we got a new house boy. His name was Fide. The only thing my mother told us about him was that his family was very poor. And so I felt enormous pity for Fide's family.

Then one Saturday we went to his village to visit, and his mother showed us a beautifully patterned basket that his brother had made. I was startled. It had not occurred to me that anybody in his family could actually make something. All I had heard about them was how poor they were, so it had become impossible for me to see them as anything else but poor. Their poverty was my single story of them.

Years later, I left Nigeria to go to university in the United States. My American roommate was shocked by me. She asked where I had learned to speak English so well, and was confused when I said that Nigeria happened to have English as its official language. She had a single story of Africa: a single story of catastrophe.

The single story creates stereotypes, and the problem with stereotypes is not that they are untrue, but that they are incomplete. They make one story become the only story.

The consequence of the single story is this: It robs people of dignity. It makes our recognition of our equal humanity difficult. It emphasizes how we are different rather than how we are similar.

Stories matter. Many stories matter. Stories have been used to dispossess and to malign, but stories can also be used to empower and to humanize. Stories can break the dignity of a people, but stories can also repair that broken dignity.

When we reject the single story, when we realize that there is never a single story about any place, we regain a kind of paradise.`;

// Tim Urban — Inside the Mind of a Master Procrastinator (TED 2016)
SPEECH_TEXTS['ted-urban-procrastination'] = `So in college, I was a government major, which means I had to write a lot of papers. Now, when a normal student writes a paper, they might spread the work out a little like this. You start a little slowly and then you get enough work done in the middle, but you'd kind of write the whole thing in a couple of weeks.

But I was different. I was a chronic procrastinator. And I wrote all of my 90-page senior thesis over 72 hours. I pulled two all-nighters. I was sprinting, and I didn't eat, and I didn't sleep. And I submitted it just at the deadline.

I have a confession to make. That 90-page thesis I wrote? I didn't get a very good grade. But more importantly, I realized that this was not a sustainable way to live. And yet, I kept doing it. Year after year, I kept procrastinating.

So I started to think about what was going on inside the brain of a procrastinator. And I think the best way to explain it is with a little story.

Inside the brain of a non-procrastinator, there's a Rational Decision-Maker who runs the show. He makes the plans, he thinks about the future, he does the thing.

But inside the brain of a procrastinator, there's also a Rational Decision-Maker. But he has company. There's also an Instant Gratification Monkey. The Instant Gratification Monkey lives entirely in the present moment. He has no memory of the past, no knowledge of the future, and he only cares about two things: easy and fun.

Now, sometimes it makes sense to be doing things that are easy and fun. That's why we have the Monkey. But the problem is when the Rational Decision-Maker has made a rational decision to do something productive, and the Monkey doesn't like that plan.

The Monkey takes the wheel. And then we find ourselves watching YouTube videos about some random topic for three hours, or reorganizing our bookshelf, or going down a Wikipedia rabbit hole. And we know we shouldn't be doing it, but we just can't seem to stop. That's the Monkey at work.

But here's the thing. The procrastinator has something that the non-procrastinator doesn't have. It's called the Panic Monster. The Panic Monster is dormant most of the time, but he wakes up anytime a deadline gets dangerously close. And the Panic Monster is the only thing the Monkey is terrified of.

When the Panic Monster shows up, the Monkey runs away and the Rational Decision-Maker takes control again. And that's how procrastinators end up writing 90-page theses in 72 hours.

But there's a problem. There's a whole other kind of procrastination that doesn't involve deadlines. It's the kind of procrastination that happens in the absence of deadlines — the things you want to do with your life. Maybe you want to start a business, or get in shape, or learn to paint. There's no deadline. The Panic Monster never shows up. And so the Monkey just keeps doing his thing, and your long-term dreams just keep getting put off.

This is why I think we need to think carefully about what we're procrastinating on. We need to stay aware of the Monkey. And we need to remind ourselves that the things we're putting off — the things without deadlines — are often the most important.`;

// Seth Godin — The Tribes We Lead (TED 2009)
SPEECH_TEXTS['ted-godin-tribes'] = `Something really important is happening. The Internet has enabled a fundamental shift in how people connect with each other. For the first time in history, anyone can find their tribe — a group of people who share their interests, their passions, their values. And more importantly, anyone can lead a tribe.

A tribe is a group of people connected to one another, connected to a leader, and connected to an idea. For millions of years, human beings have been part of one tribe or another. A group needs only two things to be a tribe: a shared interest and a way to communicate.

Tribes need leadership. Sometimes one person leads, sometimes more. People want connection and growth and something new. They want change.

What leaders do: they connect people to one another. For a long time, leadership was about winning the attention of the masses. You had money, you had factories, you had TV stations. You pushed your message out to everyone at once. The challenge of our time is that the old model of leadership is broken.

The Internet has blown up the old model. Now, anyone can start a movement. Anyone can find their tribe. The question isn't "Can you start a movement?" The question is "Will you?"

Here's what's interesting: most people are afraid to lead. They're afraid of being wrong, of being criticized, of standing out. But the truth is, leadership is now a choice. It's not something you're born into. It's not something you're appointed to. It's a choice you make every single day.

The thing is, tribes are everywhere. There are tribes of Apple fanatics, of CrossFit enthusiasts, of people who care about climate change, of knitters, of entrepreneurs. And each of these tribes is looking for someone to lead them. Not to manage them — but to lead them. To connect them. To give them a voice.

So here's my challenge to you: go find your tribe. Or better yet, start one. Because what the world needs now is more leaders. It needs people who are willing to stand up and say, "Follow me." Not because they have all the answers, but because they have the courage to ask the questions.

And the beautiful thing is, you don't need permission. You just need to care enough to make something happen.`;

// Ayn Rand — This is John Galt Speaking (Atlas Shrugged)
SPEECH_TEXTS['rand-Atlas'] = `For twelve years you have been asking: Who is John Galt? This is John Galt speaking. I am the man who loves his life. I am the man who does not sacrifice his love or his values. I am the man who has deprived you of victims and thus has destroyed your world.

You have heard it said that this is an age of moral crisis. You have said it yourself. But your moral crisis is the opposite of what you think. You are not suffering from a failure to practice the morality you profess. You are suffering from practicing it — and the disaster is the result.

For centuries, the battle of morality was fought between those who claimed that your life belongs to God and those who claimed that it belongs to your neighbors — between those who preached that the good is self-sacrifice for the sake of ghosts in heaven and those who preached that the good is self-sacrifice for the sake of incompetents on earth. And no one came to say that your life belongs to you and that the good is to live it.

Happiness is that state of consciousness which proceeds from the achievement of one's values. A morality that holds need as a claim holds emptiness as a value. It sees man as a perpetual beggar. It tells him that the way to receive is to give, and the way to be loved is to love. But the choice is not between self-sacrifice and domination. The choice is between independence and dependence.

I have removed the source of all your power: the willingness of men to be victims. I have withdrawn the sanction of the victim. You have been using fear as your weapon. But what you fear is the truth. The truth is that you have no right to exist if you exist by means of the unearned.

Do not say that I am destroying the world. I am not destroying it. I am withdrawing from it. And the world is collapsing because it was built on the premise that I and those like me would continue to support it. We are on strike against the creed of unearned rewards and unrewarded duties.

I will not live for the sake of another man, nor ask another man to live for mine.`;

// Nelson Mandela — Inaugural Address (1994)
SPEECH_TEXTS['mandela-inaugural'] = `Your Majesties, Your Royal Highnesses, Distinguished Guests, Comrades and Friends:

Today, all of us do, by our presence here, and by our celebrations in other parts of our country and the world, confer glory and hope to newborn liberty. Out of the experience of an extraordinary human disaster that lasted too long, must be born a society of which all humanity will be proud.

Our daily deeds as ordinary South Africans must produce an actual South African reality that will reinforce humanity's belief in justice, strengthen its confidence in the nobility of the human soul and sustain all our hopes for a glorious life for all.

All this we owe both to ourselves and to the peoples of the world who are so well represented here today.

The time for the healing of the wounds has come. The moment to bridge the chasms that divide us has come. The time to build is upon us. We have, at last, achieved our political emancipation. We pledge ourselves to liberate all our people from the continuing bondage of poverty, deprivation, suffering, gender and other discrimination.

We succeeded to take our last steps to freedom in conditions of relative peace. We commit ourselves to the construction of a complete, just and lasting peace.

We enter into a covenant that we shall build the society in which all South Africans, both black and white, will be able to walk tall, without any fear in their hearts, assured of their inalienable right to human dignity — a rainbow nation at peace with itself and the world.

Never, never and never again shall it be that this beautiful land will again experience the oppression of one by another and suffer the indignity of being the skunk of the world. The sun shall never set on so glorious a human achievement. Let freedom reign. God bless Africa.`;

// Greta Thunberg — How Dare You (UN Climate Summit 2019)
SPEECH_TEXTS['greta-un-climate'] = `My message is that we'll be watching you. This is all wrong. I shouldn't be up here. I should be back in school on the other side of the ocean. Yet you all come to us young people for hope. How dare you!

You have stolen my dreams and my childhood with your empty words. And yet I'm one of the lucky ones. People are suffering. People are dying. Entire ecosystems are collapsing. We are in the beginning of a mass extinction, and all you can talk about is money and fairy tales of eternal economic growth. How dare you!

For more than 30 years, the science has been crystal clear. How dare you continue to look away and come here saying that you're doing enough, when the politics and solutions needed are still nowhere in sight.

You say you hear us and that you understand the urgency. But no matter how sad and angry I am, I do not want to believe that. Because if you really understood the situation and still kept on failing to act, then you would be evil. And that I refuse to believe.

The popular idea of cutting our emissions in half in 10 years only gives us a 50% chance of staying below 1.5 degrees Celsius, and the risk of setting off irreversible chain reactions beyond human control.

Fifty percent may be acceptable to you. But those numbers do not include tipping points, most feedback loops, additional warming hidden by toxic air pollution, or the aspects of equity and climate justice. They also rely on my generation sucking hundreds of billions of tons of your CO2 out of the air with technologies that barely exist.

So a 50% risk is simply not acceptable to us — we who have to live with the consequences.

To have a 67% chance of staying below a 1.5 degrees global temperature rise, the world had a remaining carbon budget of about 420 gigatons of CO2 left to emit. Today that number is already down to less than 350 gigatons.

How dare you pretend that this can be solved with business as usual and some technical solutions? With today's emissions levels, that remaining budget will be entirely gone within less than eight and a half years.

There will not be any solutions or plans presented in line with these figures here today, because these numbers are too uncomfortable. And you are still not mature enough to tell it like it is.

You are failing us. But the young people are starting to understand your betrayal. The eyes of all future generations are upon you. And if you choose to fail us, I say: We will never forgive you.

We will not let you get away with this. Right here, right now is where we draw the line. The world is waking up. And change is coming, whether you like it or not.`;

// Emma Watson — HeForShe (UN 2014)
SPEECH_TEXTS['emma-heforshe'] = `Today we are launching a campaign called "HeForShe." I am reaching out to you because I need your help. We want to end gender inequality — and to do that we need everyone to be involved.

I was appointed six months ago and the more I have spoken about feminism, the more I have realized that fighting for women's rights has too often become synonymous with man-hating. If there is one thing I know for certain, it is that this has to stop.

For the record, feminism by definition is: the belief that men and women should have equal rights and opportunities. It is the theory of the political, economic and social equality of the sexes.

I started questioning gender-based assumptions when at eight I was confused at being called "bossy" because I wanted to direct the plays we would put on for our parents — but the boys were not. When at 14 I started being sexualized by certain elements of the press. When at 15 my girlfriends started dropping out of their sports teams because they didn't want to appear "muscly." When at 18 my male friends were unable to express their feelings.

I decided I was a feminist and this seemed uncomplicated to me. But my recent research has shown me that feminism has become an unpopular word. Apparently I am among the ranks of women whose expressions are seen as too strong, too aggressive, isolating, anti-men and, unattractive.

Why is the word such an uncomfortable one? I think it is right that as a woman I am paid the same as my male counterparts. We don't often talk about men being imprisoned by gender stereotypes but I can see that they are and that when they are free, things will change for women as a natural consequence. If men don't have to be aggressive in order to be accepted, women won't feel compelled to be submissive. If men don't have to control, women won't have to be controlled.

Both men and women should feel free to be sensitive. Both men and women should feel free to be strong. It is time that we all perceive gender on a spectrum, not as two opposing sets of ideals.

I want men to take up this mantle. So their daughters, sisters and mothers can be free from prejudice, but also so that their sons have permission to be vulnerable and human too. We claim those parts of themselves they abandoned, and in doing so, we are a truer and more complete version of humanity.

In my nervousness for this speech and in my moments of doubt, I've told myself firmly — if not me, who? If not now, when? If you have similar doubts when opportunities are presented to you, I hope those words might be helpful.

You might be thinking: who is this Harry Potter girl, and what is she doing up on stage at the UN? It's a good question, and trust me when I say I have been asking myself the same thing. I don't know if I am qualified to be here. All I know is that I care about this problem. And I want to make it better.

And having seen what I've seen, and given the chance, I feel it is my duty to say something. English statesman Edmund Burke said: "All that is needed for the forces of evil to triumph is for enough good men and women to do nothing."

In my nervousness for this speech, I told myself: If not me, who? If not now, when? I invite you to step forward, to be seen, and to ask yourself: If not me, who? If not now, when? Thank you.`;

// Malala Yousafzai — Education for All (UN 2013)
SPEECH_TEXTS['malala-un'] = `In the name of God, the Most Beneficent, the Most Merciful. Honorable UN Secretary General Mr. Ban Ki-moon, respected President of the General Assembly, and dear brothers and sisters: Assalamu alaikum.

Today, it is an honor for me to be speaking again after a long time. Being here with such honorable people is a great moment in my life. And it is an honor for me that today I am wearing a shawl of the late Benazir Bhutto.

I don't know where to begin my speech. I don't know what people would be expecting me to say. But first of all, thank you to God for whom we all are equal, and thank you to every person who has prayed for my fast recovery and a new life. I cannot believe how much love people have shown me.

Dear brothers and sisters, do remember one thing. Malala Day is not my day. Today is the day of every woman, every boy and every girl who have raised their voice for their rights.

There are hundreds of human rights activists and social workers who are not only speaking for human rights, but who are struggling to achieve their goals of education, peace and equality. Thousands of people have been killed by the terrorists, and millions have been injured. I am just one of them.

So here I stand. So here I stand, one girl among many. I speak — not for myself, but for all girls and boys. I raise up my voice — not so that I can shout, but so that those without a voice can be heard. Those who have fought for their rights: Their right to live in peace. Their right to be treated with dignity. Their right to equality of opportunity. Their right to be educated.

We call upon all governments to ensure free compulsory education for every child all over the world. We call upon all governments to fight against terrorism and violence, to protect children from brutality and harm. We call upon the developed nations to support the expansion of educational opportunities for girls in the developing world.

We call upon all communities to be tolerant — to reject prejudice based on caste, creed, sect, religion or gender. To ensure freedom and equality for women so they can flourish. We cannot all succeed when half of us are held back.

We call upon our sisters around the world to be brave — to embrace the strength within themselves and realize their full potential.

Dear brothers and sisters, we want schools and education for every child's bright future. We will continue our journey to our destination of peace and education for everyone. No one can stop us. We will speak for our rights and we will bring change through our voice. We must believe in the power and the strength of our words. Our words can change the world.

Because we are all together, united for the cause of education. And if we want to achieve our goal, then let us empower ourselves with the weapon of knowledge and let us shield ourselves with unity and togetherness.

Let us wage a glorious struggle against illiteracy, poverty and terrorism. Let us pick up our books and our pens. They are our most powerful weapons. One child, one teacher, one book and one pen can change the world. Education is the only solution. Education first. Thank you.`;

// Build speech IReadingContent objects
export function buildSpeechContent(id: string): IReadingContent | null {
  const meta = FAMOUS_SPEECHES_META.find((m) => m.id === id);
  const text = SPEECH_TEXTS[id];
  if (!meta || !text) return null;

  const paragraphs: IParagraph[] = text
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 30)
    .map((en) => ({ en, zh: '' }));

  return speechContent(meta, paragraphs);
}
