/**
 * 点词查词 —— 与阅读器同一条链路，抽出来供多处复用。
 *
 * 顺序：学习词库（离线即时中文）→ 本地大词典 ECDICT（离线，含音标/英英释义）→ 在线 API（最后手段）。
 * 离线优先：用户网络差时前两级已能覆盖绝大多数常见词。
 */
import { queryWords } from '@/data/wordbank';
import { lookupDictionary } from '@/data/dictionary';

export interface IWordLookup {
  word: string;
  phonetic: string;
  /** 英文释义（大词典优先） */
  meaning: string;
  /** 中文释义 */
  zhMeaning: string;
  /** 若是变形词，原形是什么 */
  fromForm?: string;
}

export async function lookupWord(raw: string): Promise<IWordLookup | null> {
  const cleaned = raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  if (!cleaned || cleaned.length < 2) return null;

  // 1) 学习词库（离线，即时中文）
  const bankResults = queryWords({ search: cleaned, limit: 1 });
  const bankZh = bankResults.length > 0 ? (bankResults[0].meaning || '') : '';

  // 2) 本地大词典 —— 5.7 万常用词，含英英释义 + 音标，离线秒查
  try {
    const entry = await lookupDictionary(cleaned);
    if (entry) {
      return {
        word: entry.word,
        phonetic: entry.phonetic || '',
        meaning: entry.definition || entry.translation || bankZh || '未找到释义',
        zhMeaning: entry.translation || bankZh,
        fromForm: entry.fromForm,
      };
    }
  } catch { /* 落到在线查询 */ }

  // 3) 在线词典 API（最后手段 —— 大词典未收录的生僻词）
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`);
    if (!res.ok) return { word: cleaned, phonetic: '', meaning: bankZh || '未找到释义', zhMeaning: bankZh };
    const data = await res.json();
    const entry = data[0];
    const phonetic = entry.phonetic || (entry.phonetics?.[0]?.text) || '';
    const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || '';
    return { word: cleaned, phonetic, meaning, zhMeaning: bankZh };
  } catch {
    return { word: cleaned, phonetic: '', meaning: bankZh || '未找到释义', zhMeaning: bankZh };
  }
}
