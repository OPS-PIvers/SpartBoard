import { useEffect, useEffectEvent, useState } from 'react';
import { widgetRefRegistry } from '@/components/common/widgetRefRegistry';

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BoxLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Below this many pixels of travel the gesture is a Ctrl+click, not a box.
const MIN_DRAG_PX = 4;

const NOT_BOARD_SELECTOR =
  'button, a, input, textarea, select, [role="dialog"], [role="menu"], [contenteditable="true"]';

// The click that follows a box drag or Ctrl+click must not clear the selection or open a toolbar.
const swallowNextClick = () => {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, true), 0);
};

export const boxesIntersect = (a: BoxLike, b: BoxLike): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export const toRect = (
  x0: number,
  y0: number,
  x1: number,
  y1: number
): MarqueeRect => ({
  left: Math.min(x0, x1),
  top: Math.min(y0, y1),
  width: Math.abs(x1 - x0),
  height: Math.abs(y1 - y0),
});

/** Ids of the given widgets whose on-screen box overlaps `rect`. */
export const widgetsInRect = (
  rect: MarqueeRect,
  widgetIds: readonly string[],
  getBox: (id: string) => BoxLike | null
): string[] => {
  const box = {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
  return widgetIds.filter((id) => {
    const b = getBox(id);
    return !!b && boxesIntersect(box, b);
  });
};

/** Ctrl/Cmd + drag on empty board draws a selection box; Ctrl/Cmd + click on a widget toggles it. */
export function useBoardMarqueeSelect({
  enabled,
  getSelectableIds,
  onSelect,
  onToggle,
}: {
  enabled: boolean;
  getSelectableIds: () => string[];
  onSelect: (ids: string[]) => void;
  onToggle: (id: string) => void;
}): MarqueeRect | null {
  const [rect, setRect] = useState<MarqueeRect | null>(null);

  const finish = useEffectEvent((finalRect: MarqueeRect | null) => {
    if (!finalRect) return;
    const ids = widgetsInRect(finalRect, getSelectableIds(), (id) => {
      const el = widgetRefRegistry.get(id);
      return el?.isConnected ? el.getBoundingClientRect() : null;
    });
    onSelect(ids);
  });

  const widgetAt = useEffectEvent((target: Element): string | null => {
    for (const id of getSelectableIds()) {
      if (widgetRefRegistry.get(id)?.contains(target)) return id;
    }
    return null;
  });

  const toggle = useEffectEvent((id: string) => onToggle(id));

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; pointerId: number } | null = null;
    let current: MarqueeRect | null = null;

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.pointerId) return;
      e.preventDefault();
      const next = toRect(start.x, start.y, e.clientX, e.clientY);
      if (!current && Math.max(next.width, next.height) < MIN_DRAG_PX) return;
      current = next;
      setRect(next);
    };
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.pointerId) return;
      const finalRect = e.type === 'pointerup' ? current : null;
      start = null;
      current = null;
      setRect(null);
      detach();
      if (finalRect) swallowNextClick();
      finish(finalRect);
    };
    const detach = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
    };
    const onDown = (e: PointerEvent) => {
      if (start || e.button !== 0 || e.pointerType !== 'mouse') return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest('#dashboard-zoom-surface')) return;
      if (target.closest('.widget')) {
        const id = widgetAt(target);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        window.addEventListener('pointerup', swallowNextClick, {
          capture: true,
          once: true,
        });
        toggle(id);
        return;
      }
      if (target.closest(NOT_BOARD_SELECTOR)) return;
      // Own the gesture: the board's pan/swipe handler must not see it.
      e.preventDefault();
      e.stopPropagation();
      start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
    };

    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      detach();
      setRect(null);
    };
  }, [enabled]);

  return enabled ? rect : null;
}
