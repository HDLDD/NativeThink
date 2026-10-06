// phrase-bank — 按级别懒加载的短语词库注册表
import type { PhraseLevel, IPhraseEntry } from './types';

export type { IPhraseEntry, PhraseLevel };
export { PHRASE_LEVELS, PHRASE_LEVEL_LABELS } from './types';

const loaders: Record<PhraseLevel, () => Promise<IPhraseEntry[]>> = {
  zhongkao: () => import('./zhongkao').then(m => m.Zhongkao_PHRASES),
  gaokao: () => import('./gaokao').then(m => m.Gaokao_PHRASES),
  cet4: () => import('./cet4').then(m => m.Cet4_PHRASES),
  cet6: () => import('./cet6').then(m => m.Cet6_PHRASES),
  ielts: () => import('./ielts').then(m => m.Ielts_PHRASES),
  toefl: () => import('./toefl').then(m => m.Toefl_PHRASES),
  postgraduate: () => import('./postgraduate').then(m => m.Postgraduate_PHRASES),
  professional: () => import('./professional').then(m => m.Professional_PHRASES),
  advanced: () => import('./advanced').then(m => m.Advanced_PHRASES),
};

const cache: Partial<Record<PhraseLevel, IPhraseEntry[]>> = {};

/** 按级别加载短语（首次调用触发懒加载，之后走内存缓存） */
export async function loadPhrases(level: PhraseLevel): Promise<IPhraseEntry[]> {
  if (cache[level]) return cache[level];
  cache[level] = await loaders[level]();
  return cache[level];
}
