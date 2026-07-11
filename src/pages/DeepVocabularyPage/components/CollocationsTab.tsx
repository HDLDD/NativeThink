import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Link2,
  ExternalLink,
  Volume2,
  Heart,
  ArrowUpDown,
  Tag,
  BookOpen,
  Sparkles,
  X,
  Hash,
  Layers,
  ChevronLeft,
  ChevronRight,
  Bot,
  Loader2,
  Languages,
  Brain,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { safeStorage } from '@/lib/safe-storage';
import { getAllWords, queryWords, getWordCounts } from '@/data/wordbank';
import STATIC_TRANSLATIONS from '@/data/wordbank/collocation-translations';
import type { IWordEntry } from '@/data/wordbank/schema';
import type { IFavoriteItem } from '@/lib/use-favorites';

// ============================================================
// Collocation pattern detection
// ============================================================
type CollocPattern = 'verb+noun' | 'verb+prep' | 'adj+noun' | 'noun+prep' | 'adv+adj' | 'phrasal_verb' | 'fixed_phrase' | 'other';

const PATTERN_LABELS: Record<CollocPattern, { label: string; icon: LucideIcon; color: string }> = {
  'verb+noun':    { label: '动词+名词', icon: Hash,       color: '#6366F1' },
  'verb+prep':    { label: '动词+介词', icon: ArrowUpDown, color: '#F97316' },
  'adj+noun':     { label: '形容词+名词', icon: Tag,       color: '#EC4899' },
  'noun+prep':    { label: '名词+介词', icon: Link2,       color: '#00B894' },
  'adv+adj':      { label: '副词+形容词', icon: Layers,    color: '#8B5CF6' },
  'phrasal_verb': { label: '短语动词',   icon: Sparkles,   color: '#F59E0B' },
  'fixed_phrase': { label: '固定短语',   icon: BookOpen,   color: '#14B8A6' },
  'other':        { label: '其他',       icon: Tag,        color: '#94A3B8' },
};

function detectPattern(phrase: string): CollocPattern {
  const words = phrase.trim().split(/\s+/);
  if (words.length === 1) return 'other';
  const first = words[0].toLowerCase();
  const last = words[words.length - 1].toLowerCase();
  const isVerbLike = (w: string) =>
    /(ed|ing|ate|ize|ify|ise|en)$/.test(w) ||
    ['be', 'have', 'do', 'make', 'take', 'get', 'give', 'go', 'come', 'put', 'set', 'keep', 'let', 'see', 'know', 'think', 'say', 'tell', 'ask', 'try', 'use', 'find', 'work', 'need', 'feel', 'seem', 'look', 'call', 'show', 'help', 'play', 'run', 'move', 'live', 'like', 'mean', 'hold', 'bring', 'happen', 'stand', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'consider', 'offer', 'follow', 'expect', 'create', 'allow', 'provide', 'believe', 'suggest', 'produce', 'remain', 'appear', 'develop'].includes(w);
  const commonPrep = ['in', 'on', 'at', 'to', 'for', 'with', 'of', 'from', 'by', 'about', 'into', 'through', 'over', 'up', 'down', 'out', 'off', 'across', 'along', 'around', 'between', 'among', 'against', 'within', 'without', 'toward', 'during', 'before', 'after', 'upon'];
  const isAdjEnding = (w: string) => /(ful|less|ous|ive|able|ible|al|ent|ant|ic|ical|ish|like|some|worthy)$/.test(w);
  const isAdvEnding = (w: string) => /ly$/.test(w);
  if (isVerbLike(first) && ['up', 'down', 'out', 'off', 'on', 'in', 'away', 'over', 'through', 'back', 'around', 'along', 'about', 'forth'].includes(last)) return 'phrasal_verb';
  if (isVerbLike(first) && commonPrep.includes(last)) return 'verb+prep';
  if (isVerbLike(first) && !commonPrep.includes(last) && !isAdvEnding(last)) return 'verb+noun';
  if (isAdjEnding(first) && !commonPrep.includes(last) && !isAdvEnding(last)) return 'adj+noun';
  if (isAdvEnding(first) && isAdjEnding(last)) return 'adv+adj';
  if (!isVerbLike(first) && !isAdjEnding(first) && !isAdvEnding(first) && commonPrep.includes(last)) return 'noun+prep';
  if (words.length >= 3) return 'fixed_phrase';
  return 'other';
}

// ============================================================
// Level colors & labels
// ============================================================
const LEVEL_COLORS: Record<string, { hex: string; bg: string; bgLight: string; text: string; border: string; badge: string; badgeText: string }> = {
  all:          { hex: '#00B894', bg: 'bg-emerald-50 dark:bg-emerald-500/15', bgLight: 'bg-emerald-50/50 dark:bg-emerald-500/8', text: 'text-emerald-600', border: 'border-emerald-200 dark:border-emerald-500/20', badge: 'bg-emerald-100 dark:bg-emerald-500/15', badgeText: 'text-emerald-600' },
  zhongkao:     { hex: '#EF4444', bg: 'bg-red-50 dark:bg-red-500/15', bgLight: 'bg-red-50/50 dark:bg-red-500/8', text: 'text-red-600', border: 'border-red-200 dark:border-red-500/20', badge: 'bg-red-100 dark:bg-red-500/15', badgeText: 'text-red-600' },
  gaokao:       { hex: '#F97316', bg: 'bg-orange-50 dark:bg-orange-500/15', bgLight: 'bg-orange-50/50 dark:bg-orange-500/8', text: 'text-orange-600', border: 'border-orange-200 dark:border-orange-500/20', badge: 'bg-orange-100 dark:bg-orange-500/15', badgeText: 'text-orange-600' },
  cet4:         { hex: '#0EA5E9', bg: 'bg-sky-50 dark:bg-sky-500/15', bgLight: 'bg-sky-50/50 dark:bg-sky-500/8', text: 'text-sky-600', border: 'border-sky-200 dark:border-sky-500/20', badge: 'bg-sky-100 dark:bg-sky-500/15', badgeText: 'text-sky-600' },
  cet6:         { hex: '#6C5CE7', bg: 'bg-violet-50 dark:bg-violet-500/15', bgLight: 'bg-violet-50/50 dark:bg-violet-500/8', text: 'text-violet-600', border: 'border-violet-200 dark:border-violet-500/20', badge: 'bg-violet-100 dark:bg-violet-500/15', badgeText: 'text-violet-600' },
  ielts:        { hex: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-500/15', bgLight: 'bg-amber-50/50 dark:bg-amber-500/8', text: 'text-amber-600', border: 'border-amber-200 dark:border-amber-500/20', badge: 'bg-amber-100 dark:bg-amber-500/15', badgeText: 'text-amber-600' },
  toefl:        { hex: '#EC4899', bg: 'bg-rose-50 dark:bg-rose-500/15', bgLight: 'bg-rose-50/50 dark:bg-rose-500/8', text: 'text-rose-600', border: 'border-rose-200 dark:border-rose-500/20', badge: 'bg-rose-100 dark:bg-rose-500/15', badgeText: 'text-rose-600' },
  postgraduate: { hex: '#8B5CF6', bg: 'bg-purple-50 dark:bg-purple-500/15', bgLight: 'bg-purple-50/50 dark:bg-purple-500/8', text: 'text-purple-600', border: 'border-purple-200 dark:border-purple-500/20', badge: 'bg-purple-100 dark:bg-purple-500/15', badgeText: 'text-purple-600' },
  professional: { hex: '#14B8A6', bg: 'bg-teal-50 dark:bg-teal-500/15', bgLight: 'bg-teal-50/50 dark:bg-teal-500/8', text: 'text-teal-600', border: 'border-teal-200 dark:border-teal-500/20', badge: 'bg-teal-100 dark:bg-teal-500/15', badgeText: 'text-teal-600' },
  advanced:     { hex: '#64748B', bg: 'bg-slate-50 dark:bg-slate-500/15', bgLight: 'bg-slate-50/50 dark:bg-slate-500/8', text: 'text-slate-600', border: 'border-slate-200 dark:border-slate-500/20', badge: 'bg-slate-100 dark:bg-slate-500/15', badgeText: 'text-slate-600' },
};

const LEVEL_LABELS: Record<string, string> = {
  all: '全部', zhongkao: '中考', gaokao: '高考', cet4: '四级', cet6: '六级', ielts: '雅思', toefl: '托福', postgraduate: '考研', professional: '专业', advanced: '高阶',
};

const LEVEL_KEYS = ['all', 'zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'] as const;
const SUB_LEVELS = ['zhongkao', 'gaokao', 'cet4', 'cet6', 'ielts', 'toefl', 'postgraduate', 'professional', 'advanced'] as const;
const PAGE_SIZES = [15, 30, 50];

// ============================================================
// Types
// ============================================================
interface CollocEntry {
  phrase: string;
  words: IWordEntry[];
  examples: { en: string; zh: string }[];
  pattern: CollocPattern;
}

interface CollocationsTabProps {
  selectedLevel: string;
  tts: { speak: (text: string, opts?: { rate?: number }) => void };
  handleLookupCollocation: (phrase: string) => void;
  onTranslateColloc: (phrase: string) => Promise<string>;
  addFavorite: (item: Omit<IFavoriteItem, 'id' | 'createdAt'>) => boolean;
  removeFavorite: (id: string) => void;
  isFavorited: (content: string, type: IFavoriteItem['type']) => boolean;
  favorites: IFavoriteItem[];
  selectedWord: IWordEntry | null;
  /** Jump to word detail in browse tab */
  onSelectWord?: (word: IWordEntry) => void;
}

// ============================================================
// Component
// ============================================================
export default function CollocationsTab({
  selectedLevel,
  tts,
  handleLookupCollocation,
  onTranslateColloc,
  addFavorite,
  removeFavorite,
  isFavorited,
  favorites,
  onSelectWord,
}: CollocationsTabProps) {
  const COLLOC_MEMORY_KEY = '__nativethink_colloc_state';

  function loadPersisted<T>(field: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(COLLOC_MEMORY_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      const val = saved[field];
      if (typeof val !== typeof (fallback as unknown)) return fallback;
      if (fallback instanceof Set) return (Array.isArray(val) ? new Set(val) : fallback) as T;
      return val as T;
    } catch { return fallback; }
  }

  function persistState(partial: Record<string, unknown>) {
    try {
      let existing: Record<string, unknown> = {};
      const raw = localStorage.getItem(COLLOC_MEMORY_KEY);
      if (raw) { try { existing = JSON.parse(raw); } catch { /* ignore */ } }
      Object.assign(existing, partial);
      localStorage.setItem(COLLOC_MEMORY_KEY, JSON.stringify(existing));
    } catch { /* ignore */ }
  }

  // ---- State ----
  // Selected levels: Set of level keys or 'all' to include everything
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    () => loadPersisted<Set<string>>('selectedLevels', new Set(selectedLevel === 'all' ? [...SUB_LEVELS] : [selectedLevel])),
  );
  const [searchColloc, setSearchColloc] = useState('');
  const [selectedColloc, setSelectedColloc] = useState<string | null>(
    () => loadPersisted<{ phrase: string; page: number } | null>('lastSelection', null)?.phrase || null,
  );
  const [pageSize, setPageSize] = useState(() => loadPersisted("pageSize", 15));
  const [currentPage, setCurrentPage] = useState(
    () => loadPersisted<{ phrase: string; page: number } | null>('lastSelection', null)?.page || 0,
  );
  const [batchTranslating, setBatchTranslating] = useState(false);
  const collocListRef = useRef<HTMLDivElement>(null);
  const SCROLL_MEMORY_KEY = '__nativethink_colloc_scroll';

  // Persist selected collocation + page + scroll for tab-switch memory
  useEffect(() => {
    persistState({ lastSelection: selectedColloc ? { phrase: selectedColloc, page: currentPage } : null });
  }, [selectedColloc, currentPage]);

  // Save scroll position on scroll
  const handleCollocListScroll = useCallback(() => {
    if (collocListRef.current) {
      try { localStorage.setItem(SCROLL_MEMORY_KEY, String(collocListRef.current.scrollTop)); } catch { /* ignore */ }
    }
  }, []);

  // ===== 记忆功能：标记已记住的搭配 =====
  const MEMORIZED_STORAGE_KEY = '__nativethink_colloc_memorized';
  const [memorizedCollocs, setMemorizedCollocs] = useState<Set<string>>(() => {
    try {
      // Use raw localStorage for memory — safeStorage prefix can change with login state
      const raw = localStorage.getItem(MEMORIZED_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'memorized' | 'unmemorized'>('all');

  const toggleMemorized = (phrase: string) => {
    const key = phrase.toLowerCase();
    setMemorizedCollocs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      try { localStorage.setItem(MEMORIZED_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const handleToggleLevel = (key: string) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // If nothing selected, default to all levels
      if (next.size === 0) {
        SUB_LEVELS.forEach((l) => next.add(l));
      }
      persistState({ selectedLevels: [...next] });
      setSelectedColloc(null);
      setCurrentPage(0);
      return next;
    });
  };

  const handleSelectAllLevels = () => {
    const all = new Set(SUB_LEVELS);
    setSelectedLevels(all);
    persistState({ selectedLevels: [...all] });
    setSelectedColloc(null);
    setCurrentPage(0);
  };

  // Sync selectedLevels with parent's selectedLevel prop
  useEffect(() => {
    setSelectedLevels(new Set(selectedLevel === 'all' ? [...SUB_LEVELS] : [selectedLevel]));
    setSelectedColloc(null);
    setCurrentPage(0);
  }, [selectedLevel]);

  const wordCounts = useMemo(() => getWordCounts(), []);

  // ===== Lazy compute: collocations for selected level(s) =====
  // Cap processing to prevent browser freeze with large wordbanks (75K+ words).
  // Full computation would process hundreds of thousands of collocation entries,
  // easily exceeding main-thread budget and causing "page unresponsive" crashes.
  const MAX_WORDS_PER_LEVEL = 2000;   // max words to scan per level
  const MAX_ENTRIES = 3000;           // max collocation entries to return

  const allCollocEntries = useMemo(() => {
    try {
      const lvls = [...selectedLevels];
      if (lvls.length === 0) return [];

      const map = new Map<string, CollocEntry & { seenWords: Set<string> }>();
      let entryCount = 0;

      for (const lvl of lvls) {
        let words: IWordEntry[];
        try { words = queryWords({ level: lvl, limit: MAX_WORDS_PER_LEVEL }); } catch { continue; }
        if (!Array.isArray(words)) continue;
        let wordCount = 0;
        for (const w of words) {
          if (wordCount++ >= MAX_WORDS_PER_LEVEL) break;
          if (!w?.collocations) continue;
          const wk = w.word?.toLowerCase();
          if (!wk) continue;
          for (const c of w.collocations) {
            if (!c) continue;
            const key = c.toLowerCase();
            if (!map.has(key)) {
              if (entryCount++ >= MAX_ENTRIES) break;
              map.set(key, { phrase: c, words: [], examples: [], pattern: detectPattern(c), seenWords: new Set() });
            }
            const entry = map.get(key)!;
            if (entry.seenWords.has(wk)) continue;
            entry.seenWords.add(wk);
            entry.words.push(w);
            if (entry.examples.length < 2 && w.examples?.length > 0) {
              const newEx = w.examples.find((ex) => !entry.examples.some((e) => e.en === ex.en));
              if (newEx) entry.examples.push(newEx);
            }
          }
          if (entryCount >= MAX_ENTRIES) break;
        }
        if (entryCount >= MAX_ENTRIES) break;
      }

      return Array.from(map.values())
        .map(({ seenWords, ...entry }) => entry)
        .filter((e) => e.words.length >= 1)
        .sort((a, b) => b.words.length - a.words.length || a.phrase.localeCompare(b.phrase));
    } catch {
      return [];
    }
  }, [selectedLevels]);

  // Restore scroll position after collocation data loads
  useEffect(() => {
    const el = collocListRef.current;
    if (!el) return;
    try {
      const saved = localStorage.getItem(SCROLL_MEMORY_KEY);
      if (saved) {
        const top = parseInt(saved, 10);
        requestAnimationFrame(() => { el.scrollTop = top; });
      }
    } catch { /* ignore */ }
  }, [allCollocEntries.length > 0]);

  // Search + memory filter
  const filteredEntries = useMemo(() => {
    let result = allCollocEntries;
    if (searchColloc.trim()) {
      const q = searchColloc.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.phrase.toLowerCase().includes(q) ||
          e.words.some((w) => w.word.toLowerCase().includes(q) || w.meaning.includes(q)),
      );
    }
    if (memoryFilter === 'memorized') {
      result = result.filter((e) => memorizedCollocs.has(e.phrase.toLowerCase()));
    } else if (memoryFilter === 'unmemorized') {
      result = result.filter((e) => !memorizedCollocs.has(e.phrase.toLowerCase()));
    }
    return result;
  }, [allCollocEntries, searchColloc, memoryFilter, memorizedCollocs]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const pageEntries = useMemo(
    () => filteredEntries.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [filteredEntries, currentPage, pageSize],
  );

  // Clamp page when filters change
  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(Math.max(0, totalPages - 1));
  }, [totalPages, currentPage]);

  // 点击搭配时朗读短语
  const collocTtsRef = useRef(tts);
  collocTtsRef.current = tts;
  const lastSpokenCollocKey = useRef('');
  useEffect(() => {
    if (!selectedColloc) return;
    const entry = allCollocEntries.find((e) => e.phrase.toLowerCase() === selectedColloc.toLowerCase());
    if (!entry) return;
    const key = entry.phrase.toLowerCase();
    if (lastSpokenCollocKey.current === key) return;
    lastSpokenCollocKey.current = key;
    collocTtsRef.current.speak(entry.phrase, { rate: 0.85 });
  }, [selectedColloc, allCollocEntries]);

  // Selected collocation detail
  const selectedEntry = useMemo(
    () => (selectedColloc ? allCollocEntries.find((e) => e.phrase.toLowerCase() === selectedColloc.toLowerCase()) : null),
    [selectedColloc, allCollocEntries],
  );

  // ===== Collocation translation: static map → AI cache → AI on-demand =====
  const AI_CACHE_KEY = '__nativethink_colloc_ai_tranlations';

  const [aiCache, setAiCache] = useState<Record<string, string>>(() => {
    try {
      const raw = safeStorage.getItem(AI_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [translating, setTranslating] = useState<string | null>(null);

  /** Resolve translation: static map first, then AI cache, then on-demand AI */
  function getTranslation(phrase: string): string | null {
    const key = phrase.toLowerCase();
    // 1. Static pre-translated map
    if (STATIC_TRANSLATIONS[key]) return STATIC_TRANSLATIONS[key];
    // 2. AI cache (localStorage)
    if (aiCache[key]) return aiCache[key];
    return null;
  }

  async function handleTranslate(phrase: string) {
    const key = phrase.toLowerCase();
    if (STATIC_TRANSLATIONS[key] || aiCache[key]) return; // already have it
    setTranslating(key);
    try {
      const zh = await onTranslateColloc(phrase);
      setAiCache((prev) => {
        const next = { ...prev, [key]: zh };
        safeStorage.setItem(AI_CACHE_KEY, JSON.stringify(next));
        return next;
      });
    } catch { /* user will see no translation — they can click AI detail instead */ }
    finally { setTranslating(null); }
  }

  /** Batch translate all untranslated collocations on the current page */
  async function handleBatchTranslate() {
    const untranslated = pageEntries.filter((e) => {
      const key = e.phrase.toLowerCase();
      return !STATIC_TRANSLATIONS[key] && !aiCache[key];
    });
    if (untranslated.length === 0) return;
    setBatchTranslating(true);

    // Translate sequentially to avoid rate-limiting
    let done = 0;
    for (const entry of untranslated) {
      const key = entry.phrase.toLowerCase();
      // Skip if already translated (may have been translated while we were waiting)
      if (STATIC_TRANSLATIONS[key] || aiCache[key]) { done++; continue; }
      setTranslating(key);
      try {
        const zh = await onTranslateColloc(entry.phrase);
        setAiCache((prev) => {
          const next = { ...prev, [key]: zh };
          safeStorage.setItem(AI_CACHE_KEY, JSON.stringify(next));
          return next;
        });
        done++;
      } catch { done++; }
      finally { setTranslating(null); }
    }
    setBatchTranslating(false);
  }

  const totalWordsWithColloc = useMemo(() => {
    const s = new Set<string>();
    allCollocEntries.forEach((e) => e.words.forEach((w) => s.add(w.word)));
    return s.size;
  }, [allCollocEntries]);

  const isEmpty = allCollocEntries.length === 0;

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ================================================================ */}
      {/* LEFT COLUMN — Paginated collocation list */}
      {/* ================================================================ */}
      <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-40 self-start">
        <Card className="rounded-[32px] border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-2xl bg-amber-50 dark:bg-amber-500/15 text-amber-500 flex items-center justify-center">
                <Link2 className="size-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-[900] italic text-foreground">短语库</CardTitle>
                <CardDescription className="text-xs font-medium mt-0.5">
                  {isEmpty ? '选择一个词库' : `${allCollocEntries.length} 个搭配 · ${memorizedCollocs.size} 已记 · ${totalWordsWithColloc} 个单词`}
                </CardDescription>
              </div>
            </div>

            {/* Memory filter + search */}
            {!isEmpty && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-0.5 bg-muted rounded-xl p-0.5">
                {([
                  { key: 'all', label: '全部' },
                  { key: 'memorized', label: '已记' },
                  { key: 'unmemorized', label: '未记' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setMemoryFilter(key)}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all',
                      memoryFilter === key
                        ? 'bg-white dark:bg-card text-[#00B894] shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                    {key === 'all' && memorizedCollocs.size > 0 && (
                      <span className="ml-0.5 text-[8px] opacity-70">{allCollocEntries.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Search + batch translate */}
            {!isEmpty && (
              <div className="relative mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchColloc}
                    onChange={(e) => { setSearchColloc(e.target.value); setCurrentPage(0); }}
                    placeholder="搜索搭配或单词…输入后回车筛选"
                    className="pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-card border-border text-xs font-bold focus-visible:ring-2 focus-visible:ring-amber-200"
                  />
                  {searchColloc && (
                    <button onClick={() => setSearchColloc('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                {onTranslateColloc && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={batchTranslating}
                    onClick={handleBatchTranslate}
                    className="shrink-0 rounded-xl text-[9px] font-black uppercase tracking-wider bg-violet-50 dark:bg-violet-500/10 text-violet-500 hover:bg-violet-100 gap-1"
                    title="自动翻译本页所有未翻译搭配"
                  >
                    <Sparkles className="size-3" />
                    {batchTranslating ? '翻译中…' : '翻译本页'}
                  </Button>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-0">
            {isEmpty ? (
              <div className="text-center py-12 text-muted-foreground">
                <Link2 className="size-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">所选词库暂无搭配数据</p>
              </div>
            ) : (
              <>
                {/* Collocation list */}
                <div ref={collocListRef} onScroll={handleCollocListScroll} className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
                  {pageEntries.map((entry) => {
                    const patInfo = PATTERN_LABELS[entry.pattern];
                    const isSelected = selectedColloc?.toLowerCase() === entry.phrase.toLowerCase();
                    // Determine primary level for color accent
                    const primaryLevel = entry.words[0]?.level || 'cet4';
                    const lc = LEVEL_COLORS[primaryLevel];
                    const zh = getTranslation(entry.phrase);
                    const isTranslating = translating === entry.phrase.toLowerCase();

                    return (
                      <button
                        key={entry.phrase}
                        onClick={() => setSelectedColloc(entry.phrase)}
                        className={cn(
                          'w-full text-left p-3 rounded-2xl transition-all duration-200 border-2',
                          isSelected
                            ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-500/10 shadow-sm'
                            : 'border-transparent bg-muted/30 hover:bg-muted hover:border-border',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); tts.speak(entry.phrase, { rate: 0.85 }); }}
                                className="shrink-0 text-muted-foreground/40 hover:text-[#00B894] transition-colors"
                                title={`朗读 "${entry.phrase}"`}
                              >
                                <Volume2 className="size-3.5" />
                              </button>
                              <span className="text-sm font-black text-foreground">{entry.phrase}</span>
                              <span
                                className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
                                style={{ backgroundColor: patInfo.color + '16', color: patInfo.color }}
                              >
                                {patInfo.label}
                              </span>
                            </div>
                            {zh ? (
                              <p className="text-[11px] text-amber-600 font-medium mt-0.5">{zh}</p>
                            ) : isTranslating ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5"><Loader2 className="size-2.5 animate-spin" />翻译中...</span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleTranslate(entry.phrase); }}
                                className="text-[10px] text-muted-foreground/40 hover:text-amber-500 font-medium mt-0.5 transition-colors"
                              >
                                点击翻译
                              </button>
                            )}
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {entry.words.slice(0, 5).map((w) => (
                                <button
                                  key={w.word}
                                  onClick={(e) => { e.stopPropagation(); onSelectWord?.(w); }}
                                  className="text-[9px] text-muted-foreground bg-muted hover:bg-amber-100 hover:text-amber-600 px-1.5 py-0.5 rounded-md font-medium transition-colors"
                                  title={onSelectWord ? `跳转到 ${w.word}` : undefined}
                                >
                                  {w.word}
                                </button>
                              ))}
                              {entry.words.length > 5 && (
                                <span className="text-[9px] text-muted-foreground/50">+{entry.words.length - 5}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleMemorized(entry.phrase); }}
                              title={memorizedCollocs.has(entry.phrase.toLowerCase()) ? '取消记忆' : '标记为已记'}
                              className={cn(
                                'p-0.5 rounded-lg transition-colors',
                                memorizedCollocs.has(entry.phrase.toLowerCase())
                                  ? 'text-[#00B894] hover:text-[#00B894]/70'
                                  : 'text-muted-foreground/30 hover:text-[#00B894]',
                              )}
                            >
                              <Brain className={cn('size-3.5', memorizedCollocs.has(entry.phrase.toLowerCase()) && 'fill-[#00B894]/20')} />
                            </button>
                            <Badge className="text-[9px] font-black rounded-full px-2 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-600 border-none">
                              {entry.words.length}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Pagination + page size */}
                {!isEmpty && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50 gap-2">
                    {/* Page size selector */}
                    <div className="flex items-center gap-0.5" title="每页显示条数">
                      {PAGE_SIZES.map((size) => (
                        <button
                          key={size}
                          onClick={() => { setPageSize(size); setCurrentPage(0); persistState({ pageSize: size }); }}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors',
                            pageSize === size
                              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          title={`每页显示 ${size} 条`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>

                    {/* Page navigation */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-amber-500 h-7 px-2"
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>

                      {/* Clickable page number → input for jumping */}
                      <PageJump
                        current={currentPage + 1}
                        total={totalPages}
                        onJump={(pg) => setCurrentPage(Math.max(0, Math.min(totalPages - 1, pg - 1)))}
                      />

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        className="rounded-xl text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-amber-500 h-7 px-2"
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* RIGHT COLUMN — Detail panel (styled like learning page) */}
      {/* ================================================================ */}
      <div className="col-span-12 lg:col-span-7">
        {selectedEntry ? (
          <div className="space-y-4">
            {/* Main detail card */}
            <Card className="rounded-[40px] border-2 border-amber-200/50 shadow-sm overflow-hidden">
              <CardContent className="p-8">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      {/* Prev/Next phrase navigation */}
                      <Button variant="ghost" size="icon"
                        onClick={() => {
                          const idx = filteredEntries.findIndex((e) => e.phrase.toLowerCase() === selectedEntry.phrase.toLowerCase());
                          if (idx > 0) {
                            const newPage = Math.floor((idx - 1) / pageSize);
                            if (newPage !== currentPage) { setCurrentPage(newPage); persistState({ page: newPage }); }
                            setSelectedColloc(filteredEntries[idx - 1].phrase);
                          }
                        }}
                        disabled={filteredEntries.findIndex((e) => e.phrase.toLowerCase() === selectedEntry.phrase.toLowerCase()) <= 0}
                        className="rounded-xl size-7 text-muted-foreground hover:text-amber-500 shrink-0"
                        title="上一个搭配"
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <h2 className="text-3xl font-black italic text-foreground tracking-tight">{selectedEntry.phrase}</h2>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => tts.speak(selectedEntry.phrase, { rate: 0.85 })}
                        className="rounded-2xl bg-muted text-muted-foreground hover:text-[#00B894]"
                      >
                        <Volume2 className="size-5" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => {
                          const idx = filteredEntries.findIndex((e) => e.phrase.toLowerCase() === selectedEntry.phrase.toLowerCase());
                          if (idx < filteredEntries.length - 1) {
                            const newPage = Math.floor((idx + 1) / pageSize);
                            if (newPage !== currentPage) { setCurrentPage(newPage); persistState({ page: newPage }); }
                            setSelectedColloc(filteredEntries[idx + 1].phrase);
                          }
                        }}
                        disabled={filteredEntries.findIndex((e) => e.phrase.toLowerCase() === selectedEntry.phrase.toLowerCase()) >= filteredEntries.length - 1}
                        className="rounded-xl size-7 text-muted-foreground hover:text-amber-500 shrink-0"
                        title="下一个搭配"
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(() => {
                        const patInfo = PATTERN_LABELS[selectedEntry.pattern];
                        return (
                          <Badge
                            className="rounded-full px-3 py-1 text-[10px] font-black border-0 text-white"
                            style={{ backgroundColor: patInfo.color }}
                          >
                            {patInfo.label}
                          </Badge>
                        );
                      })()}
                      {(() => {
                        const zh = getTranslation(selectedEntry.phrase);
                        const isTr = translating === selectedEntry.phrase.toLowerCase();
                        return zh ? (
                          <span className="text-sm text-amber-600 font-medium">{zh}</span>
                        ) : isTr ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />翻译中...</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTranslate(selectedEntry.phrase); }}
                            className="text-xs text-muted-foreground/50 hover:text-amber-500 font-medium transition-colors flex items-center gap-1"
                          >
                            <Languages className="size-3" />翻译
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => toggleMemorized(selectedEntry.phrase)}
                      title={memorizedCollocs.has(selectedEntry.phrase.toLowerCase()) ? '取消记忆' : '标记为已记'}
                      className={cn(
                        'rounded-2xl',
                        memorizedCollocs.has(selectedEntry.phrase.toLowerCase())
                          ? 'text-[#00B894]'
                          : 'text-muted-foreground hover:text-[#00B894]',
                      )}
                    >
                      <Brain className={cn('size-5', memorizedCollocs.has(selectedEntry.phrase.toLowerCase()) && 'fill-[#00B894]/20')} />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => {
                        const faved = isFavorited(selectedEntry.phrase, 'chunk');
                        if (faved) {
                          const fav = favorites.find((f) => f.content === selectedEntry.phrase && f.type === 'chunk');
                          if (fav) removeFavorite(fav.id);
                        } else {
                          addFavorite({ type: 'chunk', content: selectedEntry.phrase, meaning: selectedEntry.examples[0]?.zh || '', category: selectedEntry.words[0]?.level || 'unknown' });
                        }
                      }}
                      className={cn(
                        'rounded-2xl',
                        isFavorited(selectedEntry.phrase, 'chunk') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
                      )}
                    >
                      <Heart className={cn('size-5', isFavorited(selectedEntry.phrase, 'chunk') && 'fill-current')} />
                    </Button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-4 rounded-2xl bg-muted/50">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">类型</p>
                    <p className="text-sm font-black text-foreground">{PATTERN_LABELS[selectedEntry.pattern].label}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-muted/50">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">关联单词</p>
                    <p className="text-sm font-black text-foreground">{selectedEntry.words.length} 个</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-muted/50">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">例句</p>
                    <p className="text-sm font-black text-foreground">{selectedEntry.examples.length} 条</p>
                  </div>
                </div>

                {/* Source words */}
                <div className="mb-4">
                  <p className="text-xs font-black uppercase tracking-wider text-foreground mb-2">关联单词</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedEntry.words
                      .sort((a, b) => a.word.localeCompare(b.word))
                      .map((w) => {
                        const wLc = LEVEL_COLORS[w.level] || LEVEL_COLORS.cet4;
                        return (
                          <div
                            key={w.word}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border-2 transition-all',
                              onSelectWord && 'cursor-pointer hover:shadow-sm hover:scale-[1.02]',
                            )}
                            style={{ borderColor: wLc.hex + '30', backgroundColor: wLc.hex + '0D' }}
                          >
                            <button
                              onClick={() => onSelectWord?.(w)}
                              className="flex items-center gap-1.5 text-left"
                              title={onSelectWord ? `点击跳转到 ${w.word} 详情` : undefined}
                            >
                              <span className="text-xs font-bold text-foreground hover:text-[#00B894] transition-colors">{w.word}</span>
                              <span className="text-[9px] text-muted-foreground">{w.partOfSpeech}</span>
                            </button>
                            <Button
                              variant="ghost" size="icon"
                              onClick={(e) => { e.stopPropagation(); tts.speak(w.word, { rate: 0.85 }); }}
                              className="rounded-lg size-5 text-muted-foreground hover:text-[#00B894]"
                            >
                              <Volume2 className="size-3" />
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* AI lookup button */}
                <Button
                  variant="outline"
                  onClick={() => handleLookupCollocation(selectedEntry.phrase)}
                  className="w-full rounded-2xl border-dashed border-amber-300 text-amber-500 hover:bg-amber-50 text-xs font-black uppercase tracking-wider gap-2"
                >
                  <Bot className="size-4" />
                  AI 深度解析此搭配
                </Button>
              </CardContent>
            </Card>

            {/* Example sentences */}
            {selectedEntry.examples.map((ex, i) => (
              <Card key={i} className="rounded-[32px] border-border shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-base font-medium text-foreground italic">「{ex.en}」</p>
                      <p className="text-sm text-muted-foreground font-medium mt-2">{ex.zh}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => tts.speak(ex.en, { rate: 0.9 })}
                        className="rounded-xl size-8 text-muted-foreground hover:text-[#00B894]"
                      >
                        <Volume2 className="size-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => {
                          if (isFavorited(ex.en, 'expression')) {
                            const fav = favorites.find((f) => f.content === ex.en && f.type === 'expression');
                            if (fav) removeFavorite(fav.id);
                          } else {
                            addFavorite({ type: 'expression', content: ex.en, meaning: ex.zh, category: selectedEntry.words[0]?.level || 'unknown' });
                          }
                        }}
                        className={cn(
                          'rounded-xl size-8 shrink-0',
                          isFavorited(ex.en, 'expression') ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-500',
                        )}
                      >
                        <Heart className={cn('size-4', isFavorited(ex.en, 'expression') && 'fill-current')} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* Empty state */
          <Card className="rounded-[40px] border-border shadow-sm">
            <CardContent className="p-16 text-center">
              <div className="size-20 rounded-3xl bg-muted mx-auto mb-4 flex items-center justify-center text-muted-foreground">
                <BookOpen className="size-9" />
              </div>
              <h3 className="text-xl font-black text-foreground mb-2">
                {isEmpty ? '暂无搭配数据' : '选择一个搭配'}
              </h3>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                {isEmpty
                  ? '所选词库中没有搭配数据，试试勾选上方其他等级'
                  : '👈 从左侧列表点击任意搭配，即可查看释义、例句和关联单词'}
              </p>
              {!isEmpty && (
                <div className="flex items-center justify-center gap-4 mt-4 text-[10px] font-bold text-muted-foreground/60">
                  <span>💡 点击搭配展开</span>
                  <span>🔍 搜索快速定位</span>
                  <span>❤️ 收藏常用搭配</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Inline page number with click-to-jump input */
function PageJump({ current, total, onJump }: { current: number; total: number; onJump: (pg: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(current));

  const commit = () => {
    const n = parseInt(val, 10);
    if (n >= 1 && n <= total) onJump(n);
    setVal(String(current));
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setVal(String(current)); }}
        className="text-[10px] font-black text-muted-foreground tabular-nums px-1.5 py-0.5 rounded hover:bg-muted min-w-[3em] text-center"
        title="点击跳转页面"
      >
        {current} / {total}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(String(current)); setEditing(false); } }}
      onBlur={commit}
      className="w-12 text-center rounded-lg bg-muted border border-amber-200 text-[10px] font-black tabular-nums py-0.5 outline-none focus:ring-1 focus:ring-amber-300"
    />
  );
}
