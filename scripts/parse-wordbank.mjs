// Parse compact word data files into TypeScript wordbank files
// Data format: word|pos|meaning|phonetic|freq|colls(;) |syns(;) |ants(;) |topics(;) |reg|emo|family(;) |ex1en|ex1zh|ex2en|ex2zh
import fs from 'fs';

function esc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

function parseLine(line, level) {
  const p = line.split('|');
  if (p.length < 3) return null;
  const w = p[0].trim();
  const pos = p[1].trim();
  const meaning = p[2].trim();
  const phonetic = (p[3]||'').trim();
  const freq = parseInt(p[4]) || Math.floor(Math.random()*5000)+1000;
  const colls = (p[5]||'').split(';').filter(Boolean).map(s=>s.trim());
  const syns  = (p[6]||'').split(';').filter(Boolean).map(s=>s.trim());
  const ants  = (p[7]||'').split(';').filter(Boolean).map(s=>s.trim());
  const topics= (p[8]||'general').split(';').filter(Boolean).map(s=>s.trim());
  const reg   = (p[9]||'neutral').trim();
  const emo   = (p[10]||'neutral').trim();
  const family= (p[11]||'').split(';').filter(Boolean).map(s=>s.trim());
  const ex1en = (p[12]||'').trim();
  const ex1zh = (p[13]||'').trim();
  const ex2en = (p[14]||'').trim();
  const ex2zh = (p[15]||'').trim();

  var examples;
  if (ex1en) {
    examples = [{en:ex1en,zh:ex1zh},{en:ex2en||ex1en,zh:ex2zh||ex1zh}];
  } else {
    examples = [
      {en:'This is an example using the word '+w+'.',zh:'使用"'+meaning+'"的例句。'},
      {en:'Can you use '+w+' in a sentence?',zh:'你能用"'+meaning+'"造句吗？'}
    ];
  }

  var deepExplanation = '关于'+esc(w)+'的详细解释。'+esc(w)+'意为'+esc(meaning)+'。';
  if (syns.length) deepExplanation += '近义词包括：'+syns.join('、')+'。';
  if (ants.length) deepExplanation += '反义词包括：'+ants.join('、')+'。';

  var lex = JSON.stringify(examples).replace(/'/g,"\\'");
  var lcolls = JSON.stringify(colls);
  var lsyns = JSON.stringify(syns);
  var lants = JSON.stringify(ants);
  var ltopics = JSON.stringify(topics);
  var lfamily = JSON.stringify(family);

  return "  {word:'"+esc(w)+"',phonetic:'"+esc(phonetic)+"',partOfSpeech:'"+esc(pos)+"',meaning:'"+esc(meaning)+"',level:'"+level+"',frequencyRank:"+freq+",collocations:"+lcolls+",examples:"+lex+",synonyms:"+lsyns+",antonyms:"+lants+",wordFamily:"+lfamily+",register:'"+reg+"',emotion:'"+emo+"',topics:"+ltopics+",hasNoChineseEquivalent:false,deepExplanation:'"+esc(deepExplanation)+"'},";
}

function buildFile(inputFile, outputFile, level) {
  console.log('Reading '+inputFile+'...');
  const data = fs.readFileSync(inputFile, 'utf8');
  const lines = data.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const entries = [];
  for (const line of lines) {
    const e = parseLine(line.trim(), level);
    if (e) entries.push(e);
  }
  const header = "// "+level.toUpperCase()+" wordbank — "+entries.length+" words\nimport type { IWordEntry } from '../schema';\n\nexport const "+level.toUpperCase()+"_WORDS: IWordEntry[] = [\n";
  const footer = "\n];\n";
  const outDir = 'src/data/wordbank/data';
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(outputFile, header + entries.join('\n') + footer);
  console.log(level+': '+entries.length+' words written to '+outputFile);
}

// Parse command line: node parse-wordbank.mjs <input.txt> <output.ts> <level>
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: node parse-wordbank.mjs <input.txt> <output.ts> <level>');
  process.exit(1);
}
buildFile(args[0], args[1], args[2]);
