import fs from 'fs';
let c = fs.readFileSync("src/data/vocabulary.ts","utf8");

// Fix undefined word values in f25
let replacements = [
  "stoicism","eudaimonia","ataraxia","phronesis","arete",
  "logos","pathos","ethos","kairos","telos","nous","psyche",
  "dialectic","hermeneutics","phenomenology","epistemology",
  "ontology","metaphysics","existentialism","nihilism","hedonism"
];

let ri = 0;
c = c.replace(/'undefined'/g, function() {
  return "'" + (replacements[ri++] || "philosophy" + ri) + "'";
});

// Fix undefined meaning values
ri = 0;
let meanings = [
  "坚忍","幸福论","宁静","实践智慧","美德",
  "理性","情感","品格","时机","目的","心智","灵魂",
  "辩证法","诠释学","现象学","认识论",
  "本体论","形而上学","存在主义","虚无主义","享乐主义"
];
c = c.replace(/'哲学概念\d+'/g, function() {
  return "'" + (meanings[ri++] || "哲学概念") + "'";
});

// Remove any remaining undefined in f25
c = c.replace(/'undefined'/g, "'philosophy'");

let remaining = (c.match(/undefined/g)||[]).length;
console.log("Remaining undefined: " + remaining);

fs.writeFileSync("src/data/vocabulary.ts", c);
let wc = (c.match(/W\('/g)||[]).length;
console.log("Total words: " + wc);
