/**
 * StreamingText — reveals text progressively with a soft fade on the newest
 * characters, mimicking AI streaming output. Falls back to instant display
 * when the OS prefers reduced motion.
 */

import { useEffect, useRef, useState } from 'react';

interface StreamingTextProps {
  text: string;
  /** characters revealed per tick */
  speed?: number;
  /** ms between ticks */
  interval?: number;
  className?: string;
}

export function StreamingText({ text, speed = 2, interval = 26, className }: StreamingTextProps) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    let reduceMotion = false;
    try {
      reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { /* ignore */ }
    if (reduceMotion) { setVisible(text.length); return; }

    setVisible(0);
    let shown = 0;
    const timer = setInterval(() => {
      shown += speed;
      if (shown >= text.length) {
        setVisible(text.length);
        clearInterval(timer);
      } else {
        setVisible(shown);
      }
    }, interval);
    return () => clearInterval(timer);
  }, [text, speed, interval]);

  if (visible >= text.length) return <span className={className}>{text}</span>;

  const settled = text.slice(0, Math.max(0, visible - 2));
  const incoming = text.slice(Math.max(0, visible - 2), visible);
  return (
    <span className={className}>
      {settled}
      <span key={visible} className="stream-in">{incoming}</span>
      <span className="stream-caret" aria-hidden />
    </span>
  );
}
