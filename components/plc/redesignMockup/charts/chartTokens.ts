// SVG fill classes for the bar colours the score and PLC components already use; literal so Tailwind keeps them.

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const FILL_FOR_BG: Record<string, string> = {
  'bg-emerald-500': 'fill-emerald-500',
  'bg-brand-blue-light': 'fill-brand-blue-light',
  'bg-brand-blue-primary': 'fill-brand-blue-primary',
  'bg-amber-400': 'fill-amber-400',
  'bg-brand-red-light': 'fill-brand-red-light',
  'bg-slate-300': 'fill-slate-300',
};

export const fillFor = (bg: string): string =>
  FILL_FOR_BG[bg] ?? 'fill-slate-300';

/** Marks from AnswerDistributionBars: correct, the chosen wrong answer, the rest. */
export const ANSWER_BG = {
  correct: 'bg-emerald-500',
  wrong: 'bg-brand-blue-light',
  rest: 'bg-slate-300',
} as const;

export const GRID = 'stroke-slate-200';
export const AXIS = 'stroke-slate-300';
export const AXIS_TEXT = 'fill-slate-500 text-xxs';
export const LABEL_TEXT = 'fill-slate-700 text-xs font-semibold';

/** Horizontal bar with a rounded data end and a square baseline. */
export function hbarPath(
  x0: number,
  x1: number,
  y: number,
  h: number,
  r = 4
): string {
  const w = x1 - x0;
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x0},${y}H${x1 - rr}A${rr},${rr} 0 0 1 ${x1},${y + rr}V${y + h - rr}A${rr},${rr} 0 0 1 ${x1 - rr},${y + h}H${x0}Z`;
}

/** Vertical bar with a rounded top and a square baseline. */
export function vbarPath(
  x: number,
  y0: number,
  y1: number,
  w: number,
  r = 4
): string {
  const h = y0 - y1;
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y0}V${y1 + rr}A${rr},${rr} 0 0 1 ${x + rr},${y1}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y1 + rr}V${y0}Z`;
}

/** Measures an element's width so SVG text never stretches. */
export function useWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
