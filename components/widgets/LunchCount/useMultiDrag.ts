import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { beginWidgetDrag, endWidgetDrag } from '@/utils/widgetDragFlag';

export interface ActiveDrag {
  pointerId: number;
  id: string;
  name: string;
  x: number;
  y: number;
  over: string | null;
}

interface PendingDrag {
  id: string;
  name: string;
  startX: number;
  startY: number;
  started: boolean;
}

// Movement before a press turns into a drag; shorter presses are taps.
const DRAG_THRESHOLD_PX = 8;

const zoneAt = (x: number, y: number): string | null => {
  if (typeof document.elementFromPoint !== 'function') return null;
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>('[data-drop-zone]')?.dataset.dropZone ?? null;
};

const chipOf = (e: React.SyntheticEvent<HTMLElement>) => ({
  id: e.currentTarget.dataset.studentId ?? '',
  name: e.currentTarget.dataset.studentName ?? '',
});

// One drag per pointer, so several fingers can each carry a chip at once. Chips carry data-student-id/-name.
export function useMultiDrag(
  onDrop: (id: string, zone: string | null) => void,
  onTap: (id: string) => void
) {
  const [drags, setDrags] = useState<ActiveDrag[]>([]);
  const pendingRef = useRef(new Map<number, PendingDrag>());
  // A drag ends in a click on the captured chip; swallow it so the drop isn't undone.
  const justDroppedRef = useRef(new Set<string>());
  const callbacksRef = useRef({ onDrop, onTap });
  useLayoutEffect(() => {
    callbacksRef.current = { onDrop, onTap };
  });

  const handlers = useMemo(() => {
    const anyStarted = () =>
      [...pendingRef.current.values()].some((d) => d.started);

    const finish = (pointerId: number) => {
      const p = pendingRef.current.get(pointerId);
      pendingRef.current.delete(pointerId);
      if (p?.started && !anyStarted()) endWidgetDrag();
      setDrags((prev) => prev.filter((d) => d.pointerId !== pointerId));
      return p;
    };

    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const { id, name } = chipOf(e);
        const pending = pendingRef.current;
        if ([...pending.values()].some((d) => d.id === id)) return;
        justDroppedRef.current.delete(id);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pending.set(e.pointerId, {
          id,
          name,
          startX: e.clientX,
          startY: e.clientY,
          started: false,
        });
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const p = pendingRef.current.get(e.pointerId);
        if (!p) return;
        if (!p.started) {
          const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
          if (moved < DRAG_THRESHOLD_PX) return;
          if (!anyStarted()) beginWidgetDrag();
          p.started = true;
        }
        const next: ActiveDrag = {
          pointerId: e.pointerId,
          id: p.id,
          name: p.name,
          x: e.clientX,
          y: e.clientY,
          over: zoneAt(e.clientX, e.clientY),
        };
        setDrags((prev) => [
          ...prev.filter((d) => d.pointerId !== e.pointerId),
          next,
        ]);
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const p = finish(e.pointerId);
        if (!p?.started) return;
        justDroppedRef.current.add(p.id);
        callbacksRef.current.onDrop(p.id, zoneAt(e.clientX, e.clientY));
      },
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
        finish(e.pointerId);
      },
      // A chip that unmounts mid-drag loses capture with no pointerup.
      onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => {
        if (pendingRef.current.has(e.pointerId)) finish(e.pointerId);
      },
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        const { id } = chipOf(e);
        if (justDroppedRef.current.delete(id)) return;
        callbacksRef.current.onTap(id);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        callbacksRef.current.onTap(chipOf(e).id);
      },
    };
  }, []);

  return { drags, handlers };
}
