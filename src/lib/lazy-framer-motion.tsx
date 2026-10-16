import {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  type ReactNode,
  type ComponentType,
} from 'react';

// ---------- types (kept minimal – enough for the animations we use) ----------
export interface LazyMotionDivProps {
  key?: string | number;
  initial?: Record<string, unknown>;
  animate?: Record<string, unknown>;
  exit?: Record<string, unknown>;
  transition?: Record<string, unknown>;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

export interface LazyAnimatePresenceProps {
  mode?: 'wait' | 'sync' | 'popLayout';
  children: ReactNode;
}

interface LazyFramerCtx {
  LazyMotionDiv: ComponentType<LazyMotionDivProps>;
  LazyAnimatePresence: ComponentType<LazyAnimatePresenceProps>;
}

// ---------- context ----------
const Ctx = createContext<LazyFramerCtx | null>(null);

// ---------- provider ----------
export function LazyFramerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    // Dynamic import – the framer-motion chunk is never in the main bundle
    import('framer-motion').then(({ motion, AnimatePresence }) => {
      // Wrap motion.div so consumers don't need to know about the proxy
      const MotionDiv = motion.div as unknown as ComponentType<LazyMotionDivProps>;
      const Presence = AnimatePresence as unknown as ComponentType<LazyAnimatePresenceProps>;

      // Store resolved values on the context via module-level ref
      resolved.LazyMotionDiv = MotionDiv;
      resolved.LazyAnimatePresence = Presence;
      setReady(true);
    });
  }, []);

  // Render children immediately – motion components fall back gracefully
  return (
    <Ctx.Provider value={ready ? resolved : fallback}>
      {children}
    </Ctx.Provider>
  );
}

// ---------- hook ----------
let warnedOutsideProvider = false;

export function useFramerMotion() {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // 以前这里 throw：漏包一层 provider 的代价是**整页白屏**（2026-10-17 真机报障 ——
  // 收藏页「开始回顾」渲染 ProgressPage 的 FavoriteReviewMode 却没带 provider）。
  // 共享组件的动画前置条件不该能掀翻用户正在用的页面，所以退化成无动画渲染，
  // 同时留一条一次性警告当开发期的绊线。
  if (!warnedOutsideProvider) {
    warnedOutsideProvider = true;
    console.warn('[framer] useFramerMotion 在 <LazyFramerProvider> 之外被调用 —— 本次动画降级为无动画（渲染点请补 provider）');
  }
  return fallback;
}

// ---------- fallback components (render children without animation) ----------
const FallbackMotionDiv = ({ children, className, style, onClick }: LazyMotionDivProps) => (
  <div className={className} style={style} onClick={onClick}>{children}</div>
);

const FallbackAnimatePresence = ({ children }: LazyAnimatePresenceProps) => <>{children}</>;

const fallback: LazyFramerCtx = {
  LazyMotionDiv: FallbackMotionDiv,
  LazyAnimatePresence: FallbackAnimatePresence,
};

// Mutable slot – filled once the dynamic import resolves
const resolved: LazyFramerCtx = {
  LazyMotionDiv: FallbackMotionDiv,
  LazyAnimatePresence: FallbackAnimatePresence,
};
