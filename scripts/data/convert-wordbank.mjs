// Convert KyleBing json-sentence data to NativeThink wordbank format
import fs from 'fs';
import path from 'path';

const BASE = 'kylebing-temp/json_original/json-sentence';

// File groups per level (prefer files with more data, ordered by quality)
const LEVEL_FILES = {
  cet4: ['CET4_2.json','CET4_3.json','CET4_1.json','Level4_2.json','Level4_1.json'],
  cet6: ['CET6_2.json','CET6_3.json','CET6_1.json'],
  ielts: ['IELTS_3.json','IELTS_2.json'],
  toefl: ['TOEFL_2.json','TOEFL_3.json'],
};

// Escaping for TypeScript string literals
function esc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// Infer topics from Chinese meaning
function inferTopics(meaning) {
  const topics = [];
  const m = meaning || '';
  if (/经济|商业|金融|贸易|投资|市场|利润|消费/.test(m)) topics.push('business');
  if (/科技|技术|电脑|网络|数字|电子|软件|数据/.test(m)) topics.push('technology');
  if (/教育|学习|教学|考试|学校|学生|学术/.test(m)) topics.push('education');
  if (/医学|疾病|健康|治疗|药物|手术/.test(m)) topics.push('health');
  if (/法律|法院|犯罪|律师|合同|权利/.test(m)) topics.push('law');
  if (/政治|政府|国家|外交|选举|政策/.test(m)) topics.push('politics');
  if (/环境|气候|自然|生态|污染/.test(m)) topics.push('environment');
  if (/情感|心理|情绪|性格|态度/.test(m)) topics.push('psychology');
  if (/食物|饮料|烹饪|餐厅|饮食/.test(m)) topics.push('food');
  if (/旅行|交通|运输|旅游|出行/.test(m)) topics.push('travel');
  if (/艺术|音乐|文学|绘画|电影|戏剧/.test(m)) topics.push('arts');
  if (/体育|运动|比赛|健身|锻炼/.test(m)) topics.push('sports');
  if (/家庭|婚姻|亲戚|朋友|社交/.test(m)) topics.push('social');
  if (/科学|物理|化学|生物|研究|实验/.test(m)) topics.push('science');
  if (/工作|职业|公司|管理|雇佣|薪水/.test(m)) topics.push('work');
  if (/日常|生活|家庭|房间|衣物|家具/.test(m)) topics.push('daily');
  if (topics.length === 0) topics.push('general');
  return topics;
}

// Infer register from word characteristics
function inferRegister(word, meaning) {
  const m = meaning || '';
  if (/正式|庄严|礼节|公文/.test(m)) return 'formal';
  if (/俚语|口语|俗语|随便/.test(m)) return 'informal';
  // Longer, Latin-derived words tend to be more formal
  if (word.length > 10 && /tion$|ment$|ence$|ance$|ious$/.test(word)) return 'formal';
  return 'neutral';
}

// Infer emotion from meaning
function inferEmotion(meaning) {
  const m = meaning || '';
  if (/好|美|优|快乐|幸福|成功|积极|爱|赞|喜欢|优秀|出色|伟大|卓越|幸运/.test(m)) return 'positive';
  if (/坏|恶|丑|痛苦|失败|消极|恨|厌恶|糟糕|恐怖|灾难|疾病|死亡|暴力|犯罪/.test(m)) return 'negative';
  return 'neutral';
}

// Pick the best phonetic from us/uk
function pickPhonetic(us, uk) {
  if (uk && uk.length > 1) return '/' + uk.replace(/'/g,'ˈ').replace(/ /g,'') + '/';
  if (us && us.length > 1) return '/' + us.replace(/'/g,'ˈ').replace(/ /g,'') + '/';
  return '';
}

// Convert a json-sentence entry to IWordEntry line
function convertEntry(entry, level, freq) {
  const w = entry.word;
  const phonetic = pickPhonetic(entry.us, entry.uk);

  // Build POS and meaning from translations
  const translations = entry.translations || [];
  const pos = translations[0]?.type || 'n.';
  const meaning = translations.map(t => t.translation).join('；');

  // Collocations from phrases
  const collocations = (entry.phrases || []).map(p => p.phrase).slice(0, 8);

  // Examples from sentences
  const sentences = entry.sentences || [];
  const examples = sentences.length > 0
    ? sentences.slice(0, 2).map(s => ({en: s.sentence, zh: s.translation}))
    : [{en: 'An example with ' + w + '.', zh: '使用"' + meaning.split('；')[0] + '"的例句。'}];

  const topics = inferTopics(meaning);
  const register = inferRegister(w, meaning);
  const emotion = inferEmotion(meaning);
  const deepExplanation = esc(w) + '意为' + esc(meaning.split('；')[0]) + '。该词属于' + level.toUpperCase() + '级别词汇，常用频次排名约' + freq + '。';

  var exJson = JSON.stringify(examples).replace(/'/g,"\\'");
  var collJson = JSON.stringify(collocations);
  var topicsJson = JSON.stringify(topics);

  return "  {word:'"+esc(w)+"',phonetic:'"+esc(phonetic)+"',partOfSpeech:'"+esc(pos)+"',meaning:'"+esc(meaning)+"',level:'"+level+"',frequencyRank:"+freq+",collocations:"+collJson+",examples:"+exJson+",synonyms:[],antonyms:[],wordFamily:[],register:'"+register+"',emotion:'"+emotion+"',topics:"+topicsJson+",hasNoChineseEquivalent:false,deepExplanation:'"+esc(deepExplanation)+"'},";
}

// Merge entries from multiple files, deduplicating by word
function mergeFiles(filenames) {
  const map = new Map();
  let totalRead = 0;

  for (const fn of filenames) {
    const filePath = path.join(BASE, fn);
    if (!fs.existsSync(filePath)) {
      console.log('  SKIP (not found): ' + fn);
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const arr = Array.isArray(data) ? data : [data];
      totalRead += arr.length;

      for (const entry of arr) {
        const key = (entry.word || '').toLowerCase().trim();
        if (!key || key.length < 2) continue;

        const existing = map.get(key);
        // Keep entry with more data (more sentences + phrases + translations)
        const newScore = (entry.sentences||[]).length + (entry.phrases||[]).length + (entry.translations||[]).length;
        const oldScore = existing ? (existing.sentences||[]).length + (existing.phrases||[]).length + (existing.translations||[]).length : -1;

        if (!existing || newScore > oldScore) {
          map.set(key, entry);
        }
      }
      console.log('  READ ' + fn + ': ' + arr.length + ' entries (total unique so far: ' + map.size + ')');
    } catch(e) {
      console.log('  ERROR reading ' + fn + ': ' + e.message);
    }
  }
  console.log('  MERGED: ' + totalRead + ' total → ' + map.size + ' unique');
  return map;
}

// Generate wordbank file
function generateFile(level, filenames, outputPath) {
  console.log('\n=== ' + level.toUpperCase() + ' ===');
  const map = mergeFiles(filenames);
  const entries = Array.from(map.values());

  // Sort alphabetically
  entries.sort((a, b) => (a.word||'').toLowerCase().localeCompare((b.word||'').toLowerCase()));

  const lines = [];
  let freq = 1;
  for (const entry of entries) {
    lines.push(convertEntry(entry, level, freq++));
  }

  const header = "// " + level.toUpperCase() + " wordbank — " + lines.length + " words\n// Data source: KyleBing/english-vocabulary (MIT license)\nimport type { IWordEntry } from '../schema';\n\nexport const " + level.toUpperCase() + "_WORDS: IWordEntry[] = [\n";
  const footer = "\n];\n";

  const outDir = path.dirname(outputPath);
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(outputPath, header + lines.join('\n') + footer);
  console.log('  WRITTEN: ' + outputPath + ' (' + lines.length + ' words)');
  return lines.length;
}

// Main
const WORDNANK_DIR = '../../src/data/wordbank/data';
const levels = [
  { level: 'cet4', files: LEVEL_FILES.cet4, out: path.join(WORDNANK_DIR, 'cet4.ts') },
  { level: 'cet6', files: LEVEL_FILES.cet6, out: path.join(WORDNANK_DIR, 'cet6.ts') },
  { level: 'ielts', files: LEVEL_FILES.ielts, out: path.join(WORDNANK_DIR, 'ielts.ts') },
  { level: 'toefl', files: LEVEL_FILES.toefl, out: path.join(WORDNANK_DIR, 'toefl.ts') },
];

let totalWords = 0;
for (const {level, files, out} of levels) {
  totalWords += generateFile(level, files, out);
}

console.log('\n=== DONE ===');
console.log('Total words generated: ' + totalWords);
console.log('Files in: ' + path.resolve(WORDNANK_DIR));
