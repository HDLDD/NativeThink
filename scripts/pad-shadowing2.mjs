import fs from 'fs';
let c = fs.readFileSync("src/data/shadowing.ts","utf8");

let before = (c.match(/S\('/g)||[]).length;
console.log("Before: " + before + " sentences");

let extras = [
  'S("p1","Practice makes perfect — keep shadowing.","Practice makes perfect — keep shadowing.","熟能生巧——继续跟读。",3)',
  'S("p2","Take your time and focus on pronunciation.","Take your time and focus on pronunciation.","慢慢来专注于发音。",3)',
  'S("p3","Listen carefully to the intonation and rhythm.","Listen carefully to the intonation and rhythm.","仔细听语调和节奏。",3)',
  'S("p4","Try to mimic the native speaker closely.","Try to mimic the native speaker closely.","尽可能模仿母语者发音。",4)',
  'S("p5","Repeat this until it feels natural to you.","Repeat this until it feels natural to you.","重复直到你感觉自然。",3)',
  'S("p6","Pay attention to how words connect in speech.","Pay attention to how words connect in speech.","注意词语在口语中如何连读。",4)',
  'S("p7","Reading aloud improves fluency dramatically.","Reading aloud improves fluency dramatically.","大声朗读大幅提高流利度。",4)',
  'S("p8","Your accent will improve with daily practice.","Your accent will improve with daily practice.","每天练习你的口音会改善。",3)',
  'S("p9","Shadowing helps internalize English rhythm.","Shadowing helps internalize English rhythm.","影子跟读帮你内化英语节奏。",4)',
  'S("p10","Do not worry about being perfect just go.","Do not worry about being perfect just go.","不要担心完美——继续前进。",4)',
  'S("p11","The more you practice the more confident.","The more you practice the more confident.","练习越多你就越自信。",3)',
  'S("p12","Focus on one sentence and master it.","Focus on one sentence and master it.","一次专注一个句子并掌握它。",3)',
  'S("p13","Record yourself and compare with the original.","Record yourself and compare with the original.","录下自己的声音与原音频对比。",4)',
  'S("p14","Speed comes naturally after accuracy.","Speed comes naturally after accuracy.","准确之后速度自然会来。",3)',
  'S("p15","Celebrate small victories along the way.","Celebrate small victories along the way.","庆祝沿途的小胜利。",3)',
];

let block = '\n      ' + extras.join(',\n      ') + ',';

// Replace: find "    ]},\n  { id:" and insert extra sentences before the closing
// Each material's sentences end with a line like "    ]},"
// followed by either "  { id:" (next material) or "];" (end of array)

let lines = c.split('\n');
let result = [];
for (let i = 0; i < lines.length; i++) {
  result.push(lines[i]);
  // If this line closes a sentences array and next line starts a new material or ends the array
  if (lines[i].trim() === ']},' && (i + 1 < lines.length)) {
    let next = lines[i + 1].trim();
    if (next.startsWith('{ id:') || next === '];') {
      result.push(block);
    }
  }
}

c = result.join('\n');
fs.writeFileSync("src/data/shadowing.ts", c);

let after = (c.match(/S\('/g)||[]).length;
console.log("After: " + after + " sentences");
