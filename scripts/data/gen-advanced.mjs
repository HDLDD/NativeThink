// Generate advanced.ts from TOEFL-exclusive words
import fs from 'fs';

function esc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

function pickPhonetic(us, uk) {
  if (uk && uk.length > 1) return '/' + uk.replace(/'/g,'ˈ').replace(/ /g,'') + '/';
  if (us && us.length > 1) return '/' + us.replace(/'/g,'ˈ').replace(/ /g,'') + '/';
  return '';
}

function inferTopics(m) {
  var t = [], m2 = m || '';
  if (/经济|商业|金融|贸易|投资|市场|利润|消费/.test(m2)) t.push('business');
  if (/科技|技术|电脑|网络|数字|电子|软件|数据/.test(m2)) t.push('technology');
  if (/教育|学习|教学|考试|学校|学生|学术/.test(m2)) t.push('education');
  if (/医学|疾病|健康|治疗|药物|手术|身体/.test(m2)) t.push('health');
  if (/法律|法院|犯罪|律师|合同|权利|法规/.test(m2)) t.push('law');
  if (/政治|政府|国家|外交|选举|政策|民主/.test(m2)) t.push('politics');
  if (/环境|气候|自然|生态|污染|资源/.test(m2)) t.push('environment');
  if (/情感|心理|情绪|性格|态度|感觉/.test(m2)) t.push('psychology');
  if (/食物|饮料|烹饪|餐厅|饮食|营养/.test(m2)) t.push('food');
  if (/旅行|交通|运输|旅游|出行|航空/.test(m2)) t.push('travel');
  if (/艺术|音乐|文学|绘画|电影|戏剧|美学/.test(m2)) t.push('arts');
  if (/体育|运动|比赛|健身|锻炼|竞技/.test(m2)) t.push('sports');
  if (/家庭|婚姻|亲戚|朋友|社交|人际/.test(m2)) t.push('social');
  if (/科学|物理|化学|生物|研究|实验/.test(m2)) t.push('science');
  if (/工作|职业|公司|管理|雇佣|薪水|就业/.test(m2)) t.push('work');
  if (/日常|生活|房间|衣物|家具|家居/.test(m2)) t.push('daily');
  if (t.length === 0) t.push('general');
  return t;
}

const advanced = JSON.parse(fs.readFileSync('advanced-subset.json', 'utf8'));
const lines = [];

for (let i = 0; i < advanced.length; i++) {
  const e = advanced[i];
  const w = e.word;
  const phonetic = pickPhonetic(e.us, e.uk);
  const tr = e.translations || [];
  const pos = tr[0] ? tr[0].type : 'n.';
  const meaning = tr.map(function(t) { return t.translation; }).join('；');
  const colls = (e.phrases || []).map(function(p) { return p.phrase; }).slice(0, 8);
  const sents = e.sentences || [];
  const ex = sents.length > 0
    ? sents.slice(0, 2).map(function(s) { return {en: s.sentence, zh: s.translation}; })
    : [{en: 'An example with ' + w + '.', zh: '使用"' + meaning.split('；')[0] + '"的例句。'}];
  const topics = inferTopics(meaning);
  const freq = 8000 + i;
  const exJson = JSON.stringify(ex).replace(/'/g,"\\'");
  const collJson = JSON.stringify(colls);
  const topicsJson = JSON.stringify(topics);
  const deep = esc(w) + '意为' + esc(meaning.split('；')[0]) + '。该词属于ADVANCED级别词汇，适合高阶英语学习者掌握。';

  lines.push("  {word:'"+esc(w)+"',phonetic:'"+esc(phonetic)+"',partOfSpeech:'"+esc(pos)+"',meaning:'"+esc(meaning)+"',level:'advanced',frequencyRank:"+freq+",collocations:"+collJson+",examples:"+exJson+",synonyms:[],antonyms:[],wordFamily:[],register:'neutral',emotion:'neutral',topics:"+topicsJson+",hasNoChineseEquivalent:false,deepExplanation:'"+esc(deep)+"'},");
}

const header = "// ADVANCED wordbank — " + lines.length + " words (high-level practical English)\n// Extracted from TOEFL-exclusive vocabulary, not covered in CET4/CET6/IELTS\nimport type { IWordEntry } from '../schema';\n\nexport const ADVANCED_WORDS: IWordEntry[] = [\n";
const footer = "\n];\n";

fs.writeFileSync('../../src/data/wordbank/data/advanced.ts', header + lines.join('\n') + footer);
console.log('ADVANCED: ' + lines.length + ' words written');
