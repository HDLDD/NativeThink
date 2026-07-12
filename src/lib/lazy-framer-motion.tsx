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
export function useFramerMotion() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFramerMotion must be used within <LazyFramerProvider>');
  return ctx;
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
