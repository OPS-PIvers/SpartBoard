import React, { useEffect, useRef, useState } from 'react';

export interface Pos {
  x: number;
  y: number;
}

const KEY_STEP = 20;

const readPos = (key: string): Pos | null => {
  try {
    const raw = localStorage.getItem(key);
    const pos = raw ? (JSON.parse(raw) as Partial<Pos>) : null;
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
      ? { x: pos.x as number, y: pos.y as number }
      : null;
  } catch {
    return null;
  }
};

const writePos = (key: string, pos: Pos | null) => {
  try {
    if (pos) localStorage.setItem(key, JSON.stringify(pos));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the position just isn't remembered.
  }
};

/** Keeps the whole element inside the viewport. */
export const clampPos = (
  pos: Pos,
  size: { w: number; h: number },
  view = { w: window.innerWidth, h: window.innerHeight }
): Pos => ({
  x: Math.round(Math.min(Math.max(pos.x, 0), Math.max(view.w - size.w, 0))),
  y: Math.round(Math.min(Math.max(pos.y, 0), Math.max(view.h - size.h, 0))),
});

/** A floating toolbar moved by its grip, remembered under `storageKey`; null means its default spot. */
export function useDraggablePosition<T extends HTMLElement>(
  storageKey: string
) {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<Pos | null>(() => readPos(storageKey));
  const drag = useRef<{ dx: number; dy: number; pointer: number } | null>(null);

  const sizeOf = () => {
    const r = ref.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  };
  const moveTo = (next: Pos, persist: boolean) => {
    const clamped = clampPos(next, sizeOf());
    setPos(clamped);
    if (persist) writePos(storageKey, clamped);
  };

  // A remembered spot from a larger window is pulled back on screen.
  const placed = pos !== null;
  useEffect(() => {
    if (!placed) return;
    const refit = () => setPos((p) => (p ? clampPos(p, sizeOf()) : p));
    const raf = requestAnimationFrame(refit);
    window.addEventListener('resize', refit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', refit);
    };
  }, [placed]);

  const gripProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = {
        dx: e.clientX - r.left,
        dy: e.clientY - r.top,
        pointer: e.pointerId,
      };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      moveTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, false);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      drag.current = null;
      moveTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, true);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      drag.current = null;
      moveTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, true);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-KEY_STEP, 0],
        ArrowRight: [KEY_STEP, 0],
        ArrowUp: [0, -KEY_STEP],
        ArrowDown: [0, KEY_STEP],
      };
      const step = delta[e.key];
      const r = ref.current?.getBoundingClientRect();
      if (!step || !r) return;
      e.preventDefault();
      moveTo({ x: r.left + step[0], y: r.top + step[1] }, true);
    },
    onDoubleClick: () => {
      setPos(null);
      writePos(storageKey, null);
    },
  };

  return { ref, pos, gripProps };
}
