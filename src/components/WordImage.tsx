/**
 * WordImage — 单词插图：真实照片（后端图片代理），本地缓存，点击换图。
 *
 * - 缓存 30 天（localStorage），同一单词第二次查看秒出
 * - 加载失败/无结果 → 显示首字母占位卡（不占失败感）
 * - 点击图片轮换同一单词的不同结果图
 */

import { useState, useEffect, useCallback } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const CACHE_PREFIX = '__nativethink_word_img_v2_';
const TTL = 30 * 24 * 3600 * 1000;

interface CacheEntry {
  urls: string[];
  at: number;
}

function loadCache(word: string): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + word);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.urls?.length) return null;
    if (Date.now() - entry.at > TTL) return null;
    return entry.urls;
  } catch { return null; }
}

function saveCache(word: string, urls: string[]): void {
  try { localStorage.setItem(CACHE_PREFIX + word, JSON.stringify({ urls, at: Date.now() } as CacheEntry)); } catch { /* quota */ }
}

interface Props {
  word: string;
  className?: string;
  /** true = 无图时整块隐藏（闪卡等沉浸场景），不显示占位箱 */
  hideOnEmpty?: boolean;
}

export function WordImage({ word, className, hideOnEmpty }: Props) {
  const key = word.toLowerCase();
  const [urls, setUrls] = useState<string[] | null>(null); // null = 未加载
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrls(null); setIdx(0); setBroken(false);
    const cached = loadCache(key);
    if (cached) { setUrls(cached); return; }
    // 带超时的插图请求 — 上游慢时不无限转圈
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(`/api/word-image?word=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((data) => {
        if (cancelled) return;
        const imgs: string[] = data?.images || [];
        if (imgs.length) { saveCache(key, imgs); setUrls(imgs); }
        else setUrls([]);
      })
      .catch(() => { if (!cancelled) setUrls([]); })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);

  const cycle = useCallback(() => {
    if (urls && urls.length > 1) setIdx((i) => (i + 1) % urls.length);
  }, [urls]);

  const src = urls && urls.length > 0 ? urls[idx % urls.length] : null;

  // 沉浸场景：加载中/无图时不渲染占位箱，让内容（单词）成为绝对主角
  if (hideOnEmpty && (urls === null || !src || broken)) return null;

  return (
    <div
      className={cn(
        'relative w-full h-44 sm:h-56 rounded-[24px] overflow-hidden bg-muted group/wi',
        className,
      )}
      onClick={cycle}
      title={urls && urls.length > 1 ? '点击查看更多插图' : undefined}
    >
      {/* Loading */}
      {urls === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
          <RefreshCw className="size-5 text-muted-foreground/40" />
        </div>
      )}
      {/* Image */}
      {urls !== null && src && !broken && (
        <>
          <img
            key={src}
            src={src}
            alt={word}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-300"
            onError={() => {
              // 当前图挂了 → 尝试下一张；全部失败 → 占位
              if (urls.length > 1 && idx < urls.length - 1) setIdx((i) => i + 1);
              else setBroken(true);
            }}
          />
          {/* 底部渐隐 + 单词角标 */}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          {urls.length > 1 && (
            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[9px] font-bold opacity-0 group-hover/wi:opacity-100 transition-opacity pointer-events-none">
              {(idx % urls.length) + 1}/{urls.length} · 点击换图
            </span>
          )}
        </>
      )}
      {/* 无图占位：首字母大卡 */}
      {urls !== null && (!src || broken) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
          <span className="text-4xl font-black italic text-[#00B894]/40 uppercase">{word.charAt(0)}</span>
          <span className="text-[10px] font-bold text-muted-foreground/50 flex items-center gap-1">
            <ImageOff className="size-3" />暂无插图
          </span>
        </div>
      )}
    </div>
  );
}
