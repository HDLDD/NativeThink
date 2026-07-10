// V3: Download source files via GitHub API and generate independent level files.
// Each level generated INDEPENDENTLY (no cross-level dedup).
// Overlap between levels is expected and correct (CET6 naturally includes CET4 words).
import fs from 'fs';
import path from 'path';
import https from 'https';

const API_BASE = 'https://api.github.com/repos/KyleBing/english-vocabulary/contents/json_original/json-sentence';
const OUT_DIR = '../../src/data/wordbank/data';
const CACHE_DIR = '.v3-cache';

// Files per level — each level generated independently from its own source files
const LEVEL_FILES = {
  cet4: [
    'CET4_2.json','CET4_3.json','CET4_1.json',
  ],
  cet6: [
    'CET6_2.json','CET6_3.json','CET6_1.json',
    'KaoYan_2.json','KaoYan_3.json','KaoYan_1.json',
    'GaoZhong_2.json','GaoZhong_3.json',
  ],
  ielts: [
    'IELTS_2.json','IELTS_3.json',
    'BEC_2.json','BEC_3.json',
  ],
  toefl: [
    'TOEFL_2.json','TOEFL_3.json',
  ],
  advanced: [
    'GRE_2.json','GRE_3.json',
    'GMAT_2.json','GMAT_3.json',
    'SAT_2.json','SAT_3.json',
    'Level8_2.json','Level8_1.json',
  ],
};

// Download a file via GitHub API
function downloadFile(filename) {
  return new Promise((resolve, reject) => {
    const cachePath = path.join(CACHE_DIR, filename);
    if (fs.existsSync(cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        console.log('  CACHED: ' + filename + ' (' + (Array.isArray(data) ? data.length : 1) + ' entries)');
        resolve(data);
        return;
      } catch(e) {}
    }
    const url = API_BASE + '/' + filename + '?ref=master';
    console.log('  DOWNLOADING: ' + filename + '...');
    https.get(url, { headers: { 'Accept': 'application/vnd.github.v3.raw', 'User-Agent': 'NativeThink/1.0' } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          fs.mkdirSync(CACHE_DIR, { recursive: true });
          fs.writeFileSync(cachePath, body);
          const arr = Array.isArray(data) ? data : [data];
          console.log('  DONE: ' + filename + ' (' + arr.length + ' entries)');
          resolve(data);
        } catch(e) {
          console.log('  PARSE ERROR: ' + filename + ' - ' + e.message);
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Escaping
function esc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// Infer topics
function inferTopics(meaning) {
  var t = [], m = meaning || '';
  if (/经济|商业|金融|贸易|投资|市场|利润|消费|公司|企业|银行|股票|基金|税款|预算|财政|货币|贷款|债务|破产|资产|股份|盈利|营收/.test(m)) t.push('business');
  if (/科技|技术|电脑|网络|数字|电子|软件|数据|程序|算法|芯片|人工智能|机器人|自动化|信息|通信|卫星|航天|工程|机械|制造/.test(m)) t.push('technology');
  if (/教育|学习|教学|考试|学校|学生|学术|教授|课程|毕业|论文|学位|硕士|博士|本科|学院|大学|教室|培训|阅读|写作|数学|历史|地理|哲学/.test(m)) t.push('education');
  if (/医学|疾病|健康|治疗|药物|手术|身体|器官|血液|心脏|肝脏|肾脏|骨骼|肌肉|神经|症状|诊断|麻醉|疫苗|病毒|细菌|感染|医院|医生|护士|患者|康复/.test(m)) t.push('health');
  if (/法律|法院|犯罪|律师|合同|权利|法规|诉讼|审判|法官|证据|证人|被告|原告|辩护|判决|罪行|刑罚|监狱|警察|合法|非法|宪法|立法|司法/.test(m)) t.push('law');
  if (/政治|政府|国家|外交|选举|政策|民主|总统|议会|国会|政党|统治|权利|主权|领土|民族|殖民|革命|改革|官僚|体制|治理|投票|竞选|外交官|大使|条约/.test(m)) t.push('politics');
  if (/环境|气候|自然|生态|污染|资源|能源|太阳能|风能|海洋|森林|沙漠|河流|湖泊|山脉|地震|台风|火山|天气|降雨|温度|物种|生物|植物|动物|环保|可持续发展/.test(m)) t.push('environment');
  if (/情感|心理|情绪|性格|态度|感觉|爱情|悲伤|快乐|愤怒|恐惧|焦虑|抑郁|激情|同情|怜悯|羡慕|嫉妒|憎恨|喜悦|忧郁|孤独|自豪|羞耻|内疚/.test(m)) t.push('psychology');
  if (/食物|饮料|烹饪|餐厅|饮食|营养|蔬菜|水果|肉类|海鲜|香料|调味|烘焙|菜单|食谱|早餐|午餐|晚餐|甜点|厨师|厨房|味道|口味/.test(m)) t.push('food');
  if (/旅行|交通|运输|旅游|出行|航空|飞机|火车|汽车|轮船|巴士|出租车|地铁|高速|公路|机场|车站|港口|酒店|住宿|观光|景点|导游|行李|护照|签证/.test(m)) t.push('travel');
  if (/艺术|音乐|文学|绘画|电影|戏剧|美学|诗歌|小说|雕塑|建筑|舞蹈|歌剧|摄影|设计|时尚|服装|珠宝|工艺|收藏|展览|博物馆|画廊|表演|舞台/.test(m)) t.push('arts');
  if (/体育|运动|比赛|健身|锻炼|竞技|足球|篮球|网球|游泳|跑步|滑雪|拳击|高尔夫|马拉松|奥运|冠军|教练|裁判|球场|锦标赛|联赛/.test(m)) t.push('sports');
  if (/家庭|婚姻|亲戚|朋友|社交|人际|父母|子女|兄弟|姐妹|夫妻|离婚|继承|祖先|后代|邻居|同事|伙伴|友谊|关系|社团|聚会/.test(m)) t.push('social');
  if (/科学|物理|化学|生物|研究|实验|理论|公式|定律|分子|原子|元素|基因|细胞|进化|数学|统计|逻辑|假设|证明|发现|观测|分析|量子|力学|相对论/.test(m)) t.push('science');
  if (/工作|职业|公司|管理|雇佣|薪水|就业|面试|简历|职位|晋升|辞职|退休|加班|假期|合同|同事|老板|员工|部门|会议|报告|项目|任务|绩效|行业/.test(m)) t.push('work');
  if (/日常|生活|房间|衣物|家具|家居|购物|支付|清洁|整理|洗漱|睡觉|起床|穿衣|打扮|天气|时间|日期|季节|节日|庆祝/) t.push('daily');
  if (/军事|战争|军队|武器|士兵|海军|空军|陆军|战斗|攻击|防御|战略|战术|将军|司令|部署|导弹|坦克|战机|军舰|核武器|情报|间谍/.test(m)) t.push('military');
  if (/宗教|信仰|教会|教堂|寺庙|神|上帝|祈祷|礼拜|圣经|佛经|牧师|神父|僧侣|灵魂|天堂|地狱|神圣|世俗|仪式|祭祀|崇拜/.test(m)) t.push('religion');
  if (t.length === 0) t.push('general');
  return t;
}

function inferRegister(word, meaning) {
  var m = meaning || '';
  if (/正式|庄严|礼节|公文/.test(m)) return 'formal';
  if (/俚语|口语|俗语|随便/.test(m)) return 'informal';
  if (word.length > 10 && /tion$|ment$|ence$|ance$|ious$|ology$|graphy$|sophy$/.test(word)) return 'formal';
  return 'neutral';
}

function inferEmotion(meaning) {
  var m = meaning || '';
  if (/好|美|优|快乐|幸福|成功|积极|爱|赞|喜欢|优秀|出色|伟大|卓越|幸运|善良|美好|甜蜜|温暖|舒适|精彩|辉煌|繁荣|和平|安全|健康|美丽|聪明|勇敢|坚强|慷慨|宽容|幽默|优雅|高尚|神圣/.test(m)) return 'positive';
  if (/坏|恶|丑|痛苦|失败|消极|恨|厌恶|糟糕|恐怖|灾难|疾病|死亡|暴力|犯罪|毒|害|伪|假|错误|故障|缺陷|废物|破坏|摧毁|腐蚀|衰退|危机|危险|威胁|侵略|歧视|压迫|剥削|虐待|欺骗|背叛|腐败|衰落|萧条/.test(m)) return 'negative';
  return 'neutral';
}

function pickPhonetic(us, uk) {
  if (uk && uk.length > 1) return '/' + uk.replace(/'/g,'ˈ').replace(/ /g,'') + '/';
  if (us && us.length > 1) return '/' + us.replace(/'/g,'ˈ').replace(/ /g,'') + '/';
  return '';
}

function convertEntry(entry, level, freq) {
  var w = entry.word;
  var phonetic = pickPhonetic(entry.us, entry.uk);
  var translations = entry.translations || [];
  var pos = translations[0]?.type || 'n.';
  var meaning = translations.map(function(t) { return t.translation; }).join('；');
  var collocations = (entry.phrases || []).map(function(p) { return p.phrase; }).slice(0, 8);
  var sentences = entry.sentences || [];
  var examples = sentences.length > 0
    ? sentences.slice(0, 2).map(function(s) { return {en: s.sentence, zh: s.translation}; })
    : [{en: 'An example with ' + w + '.', zh: '使用"' + meaning.split('；')[0] + '"的例句。'}];
  var topics = inferTopics(meaning);
  var register = inferRegister(w, meaning);
  var emotion = inferEmotion(meaning);
  var levelLabel = level === 'advanced' ? 'ADVANCED' : level.toUpperCase();
  var deepExplanation = esc(w) + '意为' + esc(meaning.split('；')[0]) + '。该词属于' + levelLabel + '级别词汇。';
  var exJson = JSON.stringify(examples).replace(/'/g,"\\'");
  var collJson = JSON.stringify(collocations);
  var topicsJson = JSON.stringify(topics);
  return "  {word:'"+esc(w)+"',phonetic:'"+esc(phonetic)+"',partOfSpeech:'"+esc(pos)+"',meaning:'"+esc(meaning)+"',level:'"+level+"',frequencyRank:"+freq+",collocations:"+collJson+",examples:"+exJson+",synonyms:[],antonyms:[],wordFamily:[],register:'"+register+"',emotion:'"+emotion+"',topics:"+topicsJson+",hasNoChineseEquivalent:false,deepExplanation:'"+esc(deepExplanation)+"'},";
}

// Merge entries from files (dedup WITHIN a single level only)
function mergeEntries(allData) {
  var map = new Map();
  var totalRead = 0;
  for (var di = 0; di < allData.length; di++) {
    var arr = Array.isArray(allData[di]) ? allData[di] : [allData[di]];
    totalRead += arr.length;
    for (var ei = 0; ei < arr.length; ei++) {
      var entry = arr[ei];
      var key = (entry.word || '').toLowerCase().trim();
      if (!key || key.length < 2) continue;
      var existing = map.get(key);
      var newScore = (entry.sentences||[]).length + (entry.phrases||[]).length + (entry.translations||[]).length;
      var oldScore = existing ? (existing.sentences||[]).length + (existing.phrases||[]).length + (existing.translations||[]).length : -1;
      if (!existing || newScore > oldScore) map.set(key, entry);
    }
  }
  console.log('  MERGED: ' + totalRead + ' total entries → ' + map.size + ' unique');
  return map;
}

async function generateLevel(level, filenames) {
  console.log('\n=== ' + level.toUpperCase() + ' ===');
  // Download all files for this level
  var allData = [];
  for (var fi = 0; fi < filenames.length; fi++) {
    try {
      var data = await downloadFile(filenames[fi]);
      allData.push(data);
    } catch(e) {
      console.log('  FAILED to download ' + filenames[fi] + ': ' + e.message);
    }
  }
  if (allData.length === 0) {
    console.log('  NO DATA for ' + level);
    return 0;
  }
  var map = mergeEntries(allData);
  var entries = Array.from(map.values());
  entries.sort(function(a,b) { return (a.word||'').toLowerCase().localeCompare((b.word||'').toLowerCase()); });
  var lines = [];
  for (var i = 0; i < entries.length; i++) {
    lines.push(convertEntry(entries[i], level, i + 1));
  }
  var header = "// " + level.toUpperCase() + " wordbank — " + lines.length + " words\n// Data source: KyleBing/english-vocabulary (MIT license)\n// Generated independently: may include words also found in lower levels\nimport type { IWordEntry } from '../schema';\n\nexport const " + level.toUpperCase() + "_WORDS: IWordEntry[] = [\n";
  var footer = "\n];\n";
  var outDir = path.resolve(OUT_DIR);
  fs.mkdirSync(outDir, {recursive: true});
  var outputPath = path.join(outDir, level + '.ts');
  fs.writeFileSync(outputPath, header + lines.join('\n') + footer);
  console.log('  WRITTEN: ' + outputPath + ' (' + lines.length + ' words)');
  return lines.length;
}

// Main
async function main() {
  var levels = [
    { level: 'cet4', files: LEVEL_FILES.cet4 },
    { level: 'cet6', files: LEVEL_FILES.cet6 },
    { level: 'ielts', files: LEVEL_FILES.ielts },
    { level: 'toefl', files: LEVEL_FILES.toefl },
    { level: 'advanced', files: LEVEL_FILES.advanced },
  ];

  var grandTotal = 0;
  for (var li = 0; li < levels.length; li++) {
    var l = levels[li];
    grandTotal += await generateLevel(l.level, l.files);
  }

  console.log('\n=== DONE ===');
  console.log('Grand total across all files: ' + grandTotal + ' (includes cross-level overlap)');
  console.log('Files in: ' + path.resolve(OUT_DIR));

  console.log('\n--- Per-Level Counts ---');
  for (var si = 0; si < levels.length; si++) {
    var lv = levels[si];
    var filePath = path.join(OUT_DIR, lv.level + '.ts');
    var content = fs.readFileSync(filePath, 'utf8');
    var match = content.match(/— (\d+) words/);
    console.log(lv.level.toUpperCase().padEnd(10) + ': ' + (match ? match[1] : '?') + ' words');
  }
}

main().catch(function(e) { console.error('FATAL:', e.message); process.exit(1); });
