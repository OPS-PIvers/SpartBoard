// Hover and focus state for chart marks; the tooltip reads it.

import type React from 'react';
import { useState } from 'react';

export interface TipRow {
  value: string;
  label: string;
  /** Background class for the key swatch; omit for plain rows. */
  swatch?: string;
}

export interface TipContent {
  heading: string;
  rows: TipRow[];
}

export interface TipState {
  x: number;
  y: number;
  content: TipContent;
}

export function useChartTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const bind = (content: TipContent) => ({
    tabIndex: 0,
    onPointerMove: (e: React.PointerEvent<Element>) => {
      const host = (e.currentTarget as Element).closest('[data-chart]');
      const box = host?.getBoundingClientRect();
      if (!box) return;
      setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
    },
    onFocus: (e: React.FocusEvent<Element>) => {
      const host = (e.currentTarget as Element).closest('[data-chart]');
      const box = host?.getBoundingClientRect();
      const mark = (e.currentTarget as Element).getBoundingClientRect();
      if (!box) return;
      setTip({
        x: mark.left - box.left + mark.width / 2,
        y: mark.top - box.top,
        content,
      });
    },
    onPointerLeave: () => setTip(null),
    onBlur: () => setTip(null),
    className: 'cursor-default focus:outline-none',
  });
  return { tip, setTip, bind };
}
