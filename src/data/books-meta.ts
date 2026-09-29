/**
 * 书单元数据 —— 由 `node scripts/gen-books-meta.cjs` 从 books.ts 生成，**不要手改**。
 *
 * 只放卡片要显示的字段（外加 pageCount / totalWords 这类预计算好的计数），
 * 目的是让「书单列表」不必把 22 本书的正文（231KB gzip）一起下载。
 * 正文仍归 books.ts（节选兜底）与 public/books/<id>.txt（随包全文）管。
 */

export interface IBookMeta {
  id: string;
  title: string;
  zhTitle: string;
  author: string;
  zhAuthor: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  totalWords: number;
  /** 节选版页数：进度百分比用它，别再为了算长度去 import 正文 */
  pageCount: number;
  gutenbergId: number | null;
}

export const BOOK_META: IBookMeta[] = [
  {"id":"1342","title":"Pride and Prejudice","zhTitle":"傲慢与偏见","author":"Jane Austen","zhAuthor":"简·奥斯汀","topic":"literature","difficulty":"intermediate","totalWords":4878,"pageCount":18,"gutenbergId":1342},
  {"id":"84","title":"Frankenstein","zhTitle":"弗兰肯斯坦","author":"Mary Shelley","zhAuthor":"玛丽·雪莱","topic":"literature","difficulty":"intermediate","totalWords":4780,"pageCount":19,"gutenbergId":84},
  {"id":"11","title":"Alice's Adventures in Wonderland","zhTitle":"爱丽丝梦游仙境","author":"Lewis Carroll","zhAuthor":"刘易斯·卡罗尔","topic":"literature","difficulty":"intermediate","totalWords":4884,"pageCount":22,"gutenbergId":11},
  {"id":"1661","title":"The Adventures of Sherlock Holmes","zhTitle":"福尔摩斯探案集","author":"Arthur Conan Doyle","zhAuthor":"柯南·道尔","topic":"literature","difficulty":"intermediate","totalWords":4848,"pageCount":20,"gutenbergId":1661},
  {"id":"345","title":"Dracula","zhTitle":"德古拉","author":"Bram Stoker","zhAuthor":"布莱姆·斯托克","topic":"literature","difficulty":"intermediate","totalWords":4774,"pageCount":19,"gutenbergId":345},
  {"id":"2701","title":"Moby Dick","zhTitle":"白鲸","author":"Herman Melville","zhAuthor":"赫尔曼·梅尔维尔","topic":"literature","difficulty":"intermediate","totalWords":4839,"pageCount":18,"gutenbergId":2701},
  {"id":"43","title":"Dr. Jekyll and Mr. Hyde","zhTitle":"化身博士","author":"Robert Louis Stevenson","zhAuthor":"史蒂文森","topic":"literature","difficulty":"intermediate","totalWords":4893,"pageCount":18,"gutenbergId":43},
  {"id":"174","title":"The Picture of Dorian Gray","zhTitle":"道林·格雷的画像","author":"Oscar Wilde","zhAuthor":"奥斯卡·王尔德","topic":"literature","difficulty":"intermediate","totalWords":4679,"pageCount":18,"gutenbergId":174},
  {"id":"730","title":"Oliver Twist","zhTitle":"雾都孤儿","author":"Charles Dickens","zhAuthor":"查尔斯·狄更斯","topic":"literature","difficulty":"intermediate","totalWords":4872,"pageCount":20,"gutenbergId":730},
  {"id":"1400","title":"Great Expectations","zhTitle":"远大前程","author":"Charles Dickens","zhAuthor":"查尔斯·狄更斯","topic":"literature","difficulty":"intermediate","totalWords":4890,"pageCount":20,"gutenbergId":1400},
  {"id":"2600","title":"War and Peace","zhTitle":"战争与和平","author":"Leo Tolstoy","zhAuthor":"列夫·托尔斯泰","topic":"literature","difficulty":"intermediate","totalWords":4838,"pageCount":20,"gutenbergId":2600},
  {"id":"1184","title":"The Count of Monte Cristo","zhTitle":"基督山伯爵","author":"Alexandre Dumas","zhAuthor":"大仲马","topic":"literature","difficulty":"intermediate","totalWords":4870,"pageCount":18,"gutenbergId":1184},
  {"id":"98","title":"A Tale of Two Cities","zhTitle":"双城记","author":"Charles Dickens","zhAuthor":"查尔斯·狄更斯","topic":"literature","difficulty":"intermediate","totalWords":4830,"pageCount":20,"gutenbergId":98},
  {"id":"1260","title":"Jane Eyre","zhTitle":"简·爱","author":"Charlotte Brontë","zhAuthor":"夏洛蒂·勃朗特","topic":"literature","difficulty":"intermediate","totalWords":4736,"pageCount":19,"gutenbergId":1260},
  {"id":"768","title":"Wuthering Heights","zhTitle":"呼啸山庄","author":"Emily Brontë","zhAuthor":"艾米莉·勃朗特","topic":"literature","difficulty":"intermediate","totalWords":4863,"pageCount":19,"gutenbergId":768},
  {"id":"76","title":"Huckleberry Finn","zhTitle":"哈克贝利·费恩历险记","author":"Mark Twain","zhAuthor":"马克·吐温","topic":"literature","difficulty":"intermediate","totalWords":4896,"pageCount":20,"gutenbergId":76},
  {"id":"244","title":"A Study in Scarlet","zhTitle":"血字的研究","author":"Arthur Conan Doyle","zhAuthor":"柯南·道尔","topic":"literature","difficulty":"intermediate","totalWords":4812,"pageCount":19,"gutenbergId":244},
  {"id":"1232","title":"The Prince","zhTitle":"君主论","author":"Niccolò Machiavelli","zhAuthor":"马基雅维利","topic":"philosophy","difficulty":"advanced","totalWords":4819,"pageCount":20,"gutenbergId":1232},
  {"id":"1635","title":"Meditations","zhTitle":"沉思录","author":"Marcus Aurelius","zhAuthor":"马可·奥勒留","topic":"philosophy","difficulty":"advanced","totalWords":4906,"pageCount":18,"gutenbergId":1635},
  {"id":"3600","title":"Essays of Michel de Montaigne","zhTitle":"蒙田随笔","author":"Michel de Montaigne","zhAuthor":"蒙田","topic":"philosophy","difficulty":"advanced","totalWords":4797,"pageCount":18,"gutenbergId":3600},
  {"id":"1228","title":"On the Origin of Species","zhTitle":"物种起源","author":"Charles Darwin","zhAuthor":"查尔斯·达尔文","topic":"science","difficulty":"advanced","totalWords":4693,"pageCount":20,"gutenbergId":1228},
  {"id":"3300","title":"The Wealth of Nations","zhTitle":"国富论","author":"Adam Smith","zhAuthor":"亚当·斯密","topic":"business","difficulty":"intermediate","totalWords":4403,"pageCount":16,"gutenbergId":3300},
];

export const BOOK_META_BY_ID: Record<string, IBookMeta> = Object.fromEntries(
  BOOK_META.map((b) => [b.id, b]),
);
