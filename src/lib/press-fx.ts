/**
 * press-fx.ts —— 全站按压词汇的唯一实现：一处指针事件委托 + 涟漪节点。
 *
 * 为什么是命令式模块而不是组件：全站有 307 处裸 `<button>`（另有 395 处 `<Button>`），
 * 不可能逐个包一层组件；而"一套词汇"这条判据要求所有可点东西走同一条路径。
 * 为什么不用 CSS 的 `:active` 画涟漪：纯 CSS 拿不到触点坐标，只能中心扩散，一眼就廉价。
 * 为什么连**缩放**也不能只靠 `:active`：模拟器 APK 上用 CDP 设备级真触摸实测，`pointerdown`
 * 到了元素、涟漪也建了，但整页 `:active` 计数恒为 0 —— 这个 WebView 触摸下不进 `:active`。
 * 所以本模块在 pointerdown 上挂 `data-pressing`（CSS 里与 `:active` 并列），松手三种路径收掉。
 *
 * 契约（属性就是接口，别在别处再写一份）：
 *   （裸 `<button>` / `<a href>` / `[role=button]` **默认就参与**，soft 档，不用写属性）
 *   data-press="strong|soft"  自己点名档位；同时会退出 CSS 的默认层（默认层 `:not([data-press])`）
 *   data-press="off"          完全不参与（含缩放）—— 唯一的例外口子
 *   data-fx-ripple="0"        只缩放、不画涟漪（asChild 那种不能往别人家里塞节点的按钮）
 *   data-pressing             由本模块在按下时挂、抬起/取消/失焦时收（外部不要自己写）
 *
 * 降级在**这一层**判，不是靠 CSS 藏：实测过靠 CSS 藏的版本 DOM 里仍留着一个涟漪节点。
 */

const MAX_IN_FLIGHT = 3;
const toneCache = new WeakMap<HTMLElement, boolean>();
let started = false;

/** 底色亮度 → 涟漪用白（深底）还是用墨（浅底）。透明就往上找一层有背景的祖先。 */
function onDark(node: HTMLElement): boolean {
  const hit = toneCache.get(node);
  if (hit !== undefined) return hit;
  let tone = false;
  if (node.parentElement) {
    const raw = getComputedStyle(node).backgroundColor || '';
    const m = raw.match(/[\d.]+/g);
    const solid = m && m.length >= 3 && !(m.length === 4 && Number(m[3]) === 0);
    if (solid) {
      const lum = (0.299 * Number(m![0]) + 0.587 * Number(m![1]) + 0.114 * Number(m![2])) / 255;
      tone = lum < 0.55;
    } else {
      tone = onDark(node.parentElement as HTMLElement);
    }
  }
  toneCache.set(node, tone);
  return tone;
}

function ripple(host: HTMLElement, clientX: number, clientY: number) {
  const cs = getComputedStyle(host);
  // 行内盒不画：`.fx-ripple-host` 是 absolute inset:0，而行内盒既不能被 transform 也不能当包含块，
  // 硬画会把涟漪甩到某个祖先的框里（正文里的 `<a>` 全是这一类）。
  if (cs.display === 'inline' || cs.display === 'contents') return;
  // 静态定位的宿主同样不能当包含块 —— 显式接线的宿主都带 relative，
  // 但"默认可点"这一层覆盖全站裸按钮，不可能要求 307 处都写对，所以在这里兜住。
  if (cs.position === 'static') host.style.position = 'relative';
  const box = host.getBoundingClientRect();
  // 拿不到有效尺寸就不画 —— 绝不猜坐标
  if (box.width < 2 || box.height < 2) return;
  let wrap = host.querySelector<HTMLElement>(':scope > .fx-ripple-host');
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = 'fx-ripple-host';
    host.appendChild(wrap);
  }
  const inflight = wrap.childElementCount;
  if (inflight >= MAX_IN_FLIGHT) wrap.firstElementChild?.remove();   // 丢最旧的，不无界增长
  const node = document.createElement('span');
  node.className = 'fx-ripple';
  const dark = onDark(host);
  if (dark) node.setAttribute('data-on-dark', '');
  const d = Math.max(box.width, box.height) * 2.2;
  node.style.left = `${clientX - box.left}px`;
  node.style.top = `${clientY - box.top}px`;
  node.style.width = node.style.height = `${d}px`;
  node.addEventListener('animationend', () => node.remove(), { once: true });
  wrap.appendChild(node);
}

/** 挂上委托；返回撤销函数（测试与热更新用）。重复调用是幂等的。 */
export function initPressFx(root: HTMLElement | Document = document): () => void {
  if (started) return () => {};
  started = true;
  const onDown = (e: PointerEvent) => {
    // 键盘触发没有触点坐标，也不该有"按下去"的形变：只交给 :active，画涟漪与挂按压态都跳过
    if (e.pointerType === 'keyboard') return;
    const target = e.target as HTMLElement | null;
    // 参与者 = 默认可点的三种元素 + 显式声明了 data-press 的任何元素（练习面上有 div 卡）。
    // 这段选择器与 index.css 的默认层、走查脚本里的计数必须同源，守卫 ⑪ 盯着。
    const host = target?.closest?.('button, a[href], [role="button"], [data-press]') as HTMLElement | null;
    if (!host) return;
    if (host.getAttribute('data-press') === 'off') return;
    if (host.hasAttribute('disabled') || host.getAttribute('aria-disabled') === 'true') return;
    /** 缩放档位靠这个属性，不靠 `:active` —— 实测这台 WebView 触摸下根本不进 `:active`（见 index.css 同处注释） */
    host.setAttribute('data-pressing', '');
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    if (host.getAttribute('data-fx-ripple') === '0') return;
    ripple(host, e.clientX, e.clientY);
  };
  /** 松手/取消/失焦都要收回去 —— 少一条就会留下一个"永久按着"的元素 */
  const release = () => {
    document.querySelectorAll('[data-pressing]').forEach((el) => el.removeAttribute('data-pressing'));
  };
  const el = (root as Document).body ? (root as Document) : (root as HTMLElement);
  el.addEventListener('pointerdown', onDown as EventListener, { passive: true });
  el.addEventListener('pointerup', release, { passive: true });
  el.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('blur', release);
  return () => {
    started = false;
    el.removeEventListener('pointerdown', onDown as EventListener);
    el.removeEventListener('pointerup', release as EventListener);
    el.removeEventListener('pointercancel', release as EventListener);
    window.removeEventListener('blur', release);
    release();
  };
}

/** 给单测/守卫用的只读探针：当前有多少涟漪节点在飞 */
export function rippleCount(): number {
  return typeof document === 'undefined' ? 0 : document.querySelectorAll('.fx-ripple').length;
}
