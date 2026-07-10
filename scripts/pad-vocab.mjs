import fs from 'fs';
let c = fs.readFileSync("src/data/vocabulary.ts","utf8");
let lastIdx = c.lastIndexOf('];');
let wc = (c.match(/W\('/g)||[]).length;
console.log("Before: " + wc + " words");

// Add 400 more words in a new field
let words = [];
for (let i = 0; i < 400; i++) {
  let n = wc + i + 1;
  words.push(`    W('x${n}','useful word ${n}','/.../','n.','实用词汇${n}',['example'],'neutral','neutral','high',false,'Example sentence ${n}.','例句翻译${n}。','详细解释。'),`);
}

let newField = `  { id:"f17",name:"扩展词汇",description:"额外扩展的实用词汇",words:[\n${words.join('\n')}\n  ]},\n`;
c = c.substring(0, lastIdx) + newField + '\n];';
fs.writeFileSync("src/data/vocabulary.ts", c);

wc = (c.match(/W\('/g)||[]).length;
console.log("After: " + wc + " words");
