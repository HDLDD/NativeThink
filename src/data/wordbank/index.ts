// Wordbank unified exports
export type { IWordEntry, IWordQuery, IExample, IWordDetail, IWordDetailMap } from './schema';
export {
  queryWords, getAllWords, getAllTopics, getWordsByLevel,
  getWordCounts, getRandomWords, findWord,
  preloadLevels, isLevelReady, isAllReady, preloadAll,
  preloadProgressive, getUserLevel, getEssentialLevels,
  preloadCoreOnly, preloadDetail, isDetailReady,
  WORD_COUNTS, ALL_PARTS_OF_SPEECH,
} from './wordbank';
