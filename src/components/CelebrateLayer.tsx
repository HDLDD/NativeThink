import { useEffect, useRef } from 'react';
import { attachCelebrationSink, celebrationPalette } from '@/lib/celebrate';

/**
 * 奖励时刻：全站唯一的程序化 canvas 出口（挂在 src/index.tsx，与 <Toaster /> 同一层）。
 *
 * 第一版从**视口中心**炸开、粒子铺满整屏 —— 桌面合成器截图里直接压住了正文，
 * 违反"配图不许压过正文"。现在从触发元素中心起、半径封顶、700ms 自己收干净。
 * 三条硬约束：DPR 夹到 2（手机上 3× 全屏 canvas 白烧显存）、粒子上限 46、
 * 卸载即 cancelAnimationFrame（否则路由切走了 rAF 还在跑）。
 */
const LIFE_S = 0.7;
const PARTICLES = 46;
const MAX_DPR = 2;

export default function CelebrateLayer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    attachCelebrationSink((kind, anchor) => {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;                                     // 拿不到 2d 就 no-op，绝不回退成 toast
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const box = anchor?.getBoundingClientRect();
      const ox = box && box.width > 1 ? Math.min(Math.max(box.left + box.width / 2, 24), w - 24) : w / 2;
      const oy = box && box.height > 1 ? Math.min(Math.max(box.top + box.height / 2, 24), h - 24) : h / 2;
      const R = Math.min(Math.hypot(box?.width || 160, box?.height || 48) * 0.9, 240);
      const cols = celebrationPalette(kind);
      const ps = Array.from({ length: PARTICLES }, (_, i) => {
        const a = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
        const sp = R * (0.55 + Math.random() * 0.6);
        return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R * 0.22, r: 1.3 + Math.random() * 2.2, c: i % 3, t: 0 };
      });
      cancelAnimationFrame(rafRef.current);
      let t0 = performance.now();
      const loop = (t: number) => {
        const dt = Math.min((t - t0) / 1000, 0.033);
        ctx.clearRect(0, 0, w, h);
        let alive = 0;
        for (const p of ps) {
          p.t += dt;
          if (p.t > LIFE_S) continue;
          alive++;
          p.vy += 380 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          ctx.globalAlpha = Math.max(0, 1 - p.t / LIFE_S);
          ctx.fillStyle = cols[p.c];
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (alive) rafRef.current = requestAnimationFrame(loop);
        else ctx.clearRect(0, 0, w, h);
      };
      rafRef.current = requestAnimationFrame(loop);
    });
    return () => {
      attachCelebrationSink(null);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[60]" />;
}
