/// <reference types="vite/client" />
/**
 * 本地大词典（ECDICT 子集，5.7 万常用词）— 阅读器查词的离线主源。
 *
 * - 按首字母分块懒加载（import.meta.glob → 每块约 0.4MB，按需拉取）
 * - 二分查找 + 屈折形式反查（went/did/studies → 原词）
 * - 数据由 scripts/build-dictionary.cjs 从 ECDICT 生成
 */

export interface IDictionaryEntry {
  word: string;
  phonetic: string;
  translation: string;
  definition: string;
  /** 命中的是屈折形式时，对应词条的原形 */
  fromForm?: string;
}

interface RawEntry { w: string; p: string; t: string; d: string }
interface LetterChunk { e: RawEntry[]; f: Record<string, string> }

const modules = import.meta.glob('./data/*.ts');
const cache = new Map<string, LetterChunk>();
const pending = new Map<string, Promise<LetterChunk>>();

async function loadLetter(letter: string): Promise<LetterChunk> {
  const cached = cache.get(letter);
  if (cached) return cached;
  const inFlight = pending.get(letter);
  if (inFlight) return inFlight;

  const loader = modules[`./data/${letter}.ts`];
  if (!loader) return { e: [], f: {} };

  const p = (loader() as Promise<{ default: string }>)
    .then((m) => {
      const chunk = JSON.parse(m.default) as LetterChunk;
      cache.set(letter, chunk);
      pending.delete(letter);
      return chunk;
    })
    .catch(() => {
      pending.delete(letter);
      return { e: [], f: {} } as LetterChunk;
    });
  pending.set(letter, p);
  return p;
}

function findEntry(chunk: LetterChunk, word: string): IDictionaryEntry | null {
  const arr = chunk.e;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = arr[mid].w < word ? -1 : arr[mid].w > word ? 1 : 0;
    if (cmp === 0) {
      const r = arr[mid];
      return { word: r.w, phonetic: r.p, translation: r.t, definition: r.d };
    }
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

function cleanWord(raw: string): string {
  return raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
}

/**
 * 查词典：直接命中 → 屈折形式反查（went → go）→ null（调用方再走在线 API）。
 */
export async function lookupDictionary(raw: string): Promise<IDictionaryEntry | null> {
  const word = cleanWord(raw);
  if (word.length < 2 || !/^[a-z]/.test(word)) return null;

  const chunk = await loadLetter(word[0]);
  const direct = findEntry(chunk, word);
  if (direct) return direct;

  const lemma = chunk.f[word];
  if (lemma) {
    const lemmaChunk = await loadLetter(lemma[0]);
    const hit = findEntry(lemmaChunk, lemma);
    if (hit) return { ...hit, fromForm: word };
  }
  return null;
}
