/**
 * FitWord — 单词自适应显示：按容器可用宽度精确缩放字号，永不换行。
 *
 * 之前的做法是按字符数分级字号（>14 用 text-3xl）+ break-words，
 * 结果是长单词末尾几个字母被断到第二行，看起来像"多出字母"。
 * 这里用 canvas measureText 精确测量并按容器宽度算出合适字号，
 * 配合 white-space: nowrap，保证整词一行显示。
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  /** 字号上限（短词用这个） */
  maxPx?: number;
  /** 字号下限（极长词也不会小于此值，超出部分横向省略号） */
  minPx?: number;
  className?: string;
  /** 右侧为按钮预留的宽度（px） */
  reservePx?: number;
}

export function FitWord({ text, maxPx = 48, minPx = 17, className, reservePx = 0 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(maxPx);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measureAndFit = () => {
      // 必须测量宽度不受文字影响的祖先（h2 宽度由文字决定，会造成循环依赖）
      const box = (el.closest('[data-fit-box]') as HTMLElement | null) ?? el.parentElement?.parentElement ?? el.parentElement;
      const avail = Math.max(40, (box?.clientWidth || 240) - reservePx);
      const cs = getComputedStyle(el);
      const cv = document.createElement('canvas').getContext('2d');
      if (!cv) return;
      const REF = 100;
      cv.font = `italic 900 ${REF}px ${cs.fontFamily || 'sans-serif'}`;
      const w = cv.measureText(text).width || 1;
      const ideal = Math.floor((REF * avail) / w);
      let next = Math.max(minPx, Math.min(maxPx, ideal));
      // 兜底校正：极端字体差异下若仍溢出，按比例再缩
      if (el.scrollWidth > avail + 1 && next > minPx) {
        next = Math.max(minPx, Math.floor(next * (avail / el.scrollWidth) * 0.98));
      }
      setSize((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };

    measureAndFit();
    const ro = new ResizeObserver(measureAndFit);
    const box = (el.closest('[data-fit-box]') as HTMLElement | null) ?? el.parentElement?.parentElement;
    if (box) ro.observe(box);
    window.addEventListener('resize', measureAndFit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureAndFit);
    };
  }, [text, maxPx, minPx, reservePx]);

  return (
    <span
      ref={ref}
      className={cn('font-black italic tracking-tight whitespace-nowrap', className)}
      style={{ fontSize: `${size}px`, lineHeight: 1.15 }}
    >
      {text}
    </span>
  );
}
