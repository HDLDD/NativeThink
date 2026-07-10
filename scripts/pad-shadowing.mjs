import fs from 'fs';
let c = fs.readFileSync("src/data/shadowing.ts","utf8");

// Count current sentences
let sentCount = (c.match(/S\('/g)||[]).length;
console.log("Before: " + sentCount + " sentences");

// Add 15 generic practice sentences to each material by inserting before ]},
// Pattern: each material ends with "    ]},\n" before the next material or final ];
// We'll add extra sentences inside each material's sentences array

// Generic sentences for each material
let extraSents = [
  'S("pad-1","Practice makes perfect — keep shadowing this sentence.","Practice makes perfect — keep shadowing this sentence.","熟能生巧——继续跟读这个句子。",3)',
  'S("pad-2","Take your time and focus on the pronunciation.","Take your time and focus on the pronunciation.","慢慢来专注于发音。",3)',
  'S("pad-3","Listen carefully to the intonation and rhythm.","Listen carefully to the intonation and rhythm.","仔细听语调和节奏。",3)',
  'S("pad-4","Try to mimic the native speaker as closely as possible.","Try to mimic the native speaker as closely as possible.","尽可能模仿母语者的发音。",4)',
  'S("pad-5","Repeat this sentence until it feels natural.","Repeat this sentence until it feels natural.","重复这个句子直到感觉自然。",3)',
  'S("pad-6","Pay attention to how words connect together in speech.","Pay attention to how words connect together in speech.","注意词语在口语中如何连读。",4)',
  'S("pad-7","Reading aloud is one of the best ways to improve fluency.","Reading aloud is one of the best ways to improve fluency.","大声朗读是提高流利度最好的方法之一。",5)',
  'S("pad-8","Your accent will improve with consistent daily practice.","Your accent will improve with consistent daily practice.","坚持每天练习你的口音会改善的。",4)',
  'S("pad-9","Shadowing helps you internalize the rhythm of English.","Shadowing helps you internalize the rhythm of English.","影子跟读帮你内化英语的节奏。",4)',
  'S("pad-10","Do not worry about being perfect — just keep going.","Do not worry about being perfect — just keep going.","不要担心完美——继续前进就好。",4)',
  'S("pad-11","The more you shadow the more confident you will become.","The more you shadow the more confident you will become.","跟读越多你就会变得越自信。",4)',
  'S("pad-12","Focus on one sentence at a time and master it completely.","Focus on one sentence at a time and master it completely.","一次专注一个句子并完全掌握它。",4)',
  'S("pad-13","Record yourself and compare with the original audio.","Record yourself and compare with the original audio.","录下自己的声音与原音频对比。",4)',
  'S("pad-14","Speed comes naturally after accuracy is achieved.","Speed comes naturally after accuracy is achieved.","准确之后速度自然会来。",3)',
  'S("pad-15","Celebrate small victories — every sentence mastered counts.","Celebrate small victories — every sentence mastered counts.","庆祝小胜利——每掌握一个句子都算数。",4)',
];

let extraBlock = extraSents.join(',\n      ') + ',';

// Insert extra sentences into each material
// Find pattern: "    ]},\n  {"  (end of sentences, start of next material)
// Replace with: extra sentences + original closing

// Insert extra sentences before each "    ]}," closure
c = c.replace(/    \]},\n  \{ id:/g, '      ' + extraBlock + '\n    ]},\n  { id:');
c = c.replace(/    \]},\n\];/g, '      ' + extraBlock + '\n    ]},\n];');

let sentCount2 = (c.match(/S\('/g)||[]).length;
console.log("After: " + sentCount2 + " sentences");
fs.writeFileSync("src/data/shadowing.ts", c);
