import React, { useSyncExternalStore } from 'react';

interface TourSpotlightProps {
  rect: { x: number; y: number; width: number; height: number } | null;
  padding?: number;
  radius?: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

const onResize = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`;
const noViewport = () => '0x0';

const canScroll = (el: Element, dx: number, dy: number) => {
  const style = getComputedStyle(el);
  const y =
    dy !== 0 &&
    /(auto|scroll|overlay)/.test(style.overflowY) &&
    el.scrollHeight > el.clientHeight;
  const x =
    dx !== 0 &&
    /(auto|scroll|overlay)/.test(style.overflowX) &&
    el.scrollWidth > el.clientWidth;
  return x || y;
};

/** Hands a wheel over the dim to whatever sits under it: its handlers first, then native scroll. */
function passWheelThrough(e: WheelEvent, layer: Element | null): void {
  if (typeof document.elementsFromPoint !== 'function') return;
  const below = document
    .elementsFromPoint(e.clientX, e.clientY)
    .find((el) => !layer?.contains(el) && !el.closest('[data-tour-ignore]'));
  if (!below) return;
  const forwarded = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: e.clientX,
    clientY: e.clientY,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaMode: e.deltaMode,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
  });
  if (!below.dispatchEvent(forwarded)) return;
  let el: Element | null = below;
  while (el && !canScroll(el, e.deltaX, e.deltaY)) el = el.parentElement;
  const unit =
    e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
  el?.scrollBy({ left: e.deltaX * unit, top: e.deltaY * unit });
}

/** Full-viewport dim with a rounded cutout; the cutout passes clicks through, the dim does not. */
export const TourSpotlight: React.FC<TourSpotlightProps> = ({
  rect,
  padding = 6,
  radius = 10,
}) => {
  // Re-render on resize so the dim keeps covering the whole viewport.
  const [vw, vh] = useSyncExternalStore(onResize, viewportKey, noViewport)
    .split('x')
    .map(Number);
  let d = `M0,0 H${vw} V${vh} H0 Z`;
  if (rect) {
    const x = round(rect.x - padding);
    const y = round(rect.y - padding);
    const w = round(rect.width + padding * 2);
    const h = round(rect.height + padding * 2);
    const r = Math.min(radius, w / 2, h / 2);
    d += ` M${x + r},${y} H${x + w - r} A${r},${r} 0 0,1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0,1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0,1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0,1 ${x + r},${y} Z`;
  }
  return (
    <svg
      data-testid="tour-spotlight"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      width={vw}
      height={vh}
    >
      <path
        d={d}
        fillRule="evenodd"
        className="fill-slate-950/55 motion-safe:transition-[d] motion-safe:duration-300"
        style={{ pointerEvents: 'auto' }}
        onWheel={(e) =>
          passWheelThrough(e.nativeEvent, e.currentTarget.ownerSVGElement)
        }
      />
      {rect && (
        <rect
          data-testid="tour-spotlight-ring"
          x={rect.x - padding}
          y={rect.y - padding}
          width={rect.width + padding * 2}
          height={rect.height + padding * 2}
          rx={radius}
          className="fill-none stroke-white"
          strokeWidth={2}
        />
      )}
    </svg>
  );
};
