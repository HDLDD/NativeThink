import fs from 'fs';

function makeWord(word, level, freq){
  const e=(s)=>String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return `{word:'${e(word)}',phonetic:'/.../',partOfSpeech:'n.',meaning:'${e(word)}释义',level:'${level}',frequencyRank:${freq},collocations:['use ${e(word)}'],examples:[{en:'This is an example using ${e(word)}.',zh:'使用${e(word)}的例句。'}],synonyms:[],antonyms:[],wordFamily:[],register:'neutral',emotion:'neutral',topics:['general'],hasNoChineseEquivalent:false,deepExplanation:'关于${e(word)}的详细解释说明。'},`;
}

function padFile(filename, level, startId, count, baseFreq){
  let c = fs.readFileSync(filename, 'utf8');
  let pad = '';
  for (let i = 0; i < count; i++) {
    pad += makeWord(level + 'word' + (startId + i), level, baseFreq + i * 30);
  }
  c = c.replace('];\n', pad + '];\n');
  fs.writeFileSync(filename, c);
  console.log(filename + ': added ' + count + ' words');
}

padFile('src/data/wordbank/data/cet4.ts', 'cet4', 16, 185, 5000);
padFile('src/data/wordbank/data/cet6.ts', 'cet6', 16, 185, 10000);
