import { RefObject, useEffect } from 'react';

type ScrollAxis = 'x' | 'y';
type DragState = 'idle' | 'undecided' | 'scrolling' | 'passthrough';

interface UseDragScrollOptions {
  disabled?: boolean;
  /** Pixels of total movement before committing to a direction (default: 8) */
  minDistance?: number;
}

/**
 * Attaches pointer-drag-to-scroll to a scrollable container ref.
 *
 * Direction is disambiguated before committing: movement clearly along the
 * primary axis enters scroll mode (capturing the pointer and stopping
 * propagation to prevent dnd-kit from activating); movement clearly along the
 * secondary axis falls through to other handlers (collapse gesture, dnd-kit).
 */
export function useDragScroll(
  ref: RefObject<HTMLElement | null>,
  axis: ScrollAxis = 'x',
  options: UseDragScrollOptions = {}
) {
  const { disabled = false, minDistance = 8 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let state: DragState = 'idle';
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let activePointerId: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      // Only respond to the primary pointer (left mouse button, first touch)
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Ignore a second pointer while a scroll gesture is already in flight
      if (activePointerId !== null) return;

      state = 'undecided';
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = el.scrollLeft;
      startScrollTop = el.scrollTop;
      activePointerId = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state === 'idle' || state === 'passthrough') return;
      if (e.pointerId !== activePointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      if (state === 'undecided') {
        if (Math.sqrt(dx * dx + dy * dy) < minDistance) return;

        const primaryDelta = axis === 'x' ? adx : ady;
        const secondaryDelta = axis === 'x' ? ady : adx;

        // Use >= so a perfectly diagonal drag (primaryDelta === secondaryDelta)
        // commits to scroll rather than falling through to the collapse handler.
        if (primaryDelta >= secondaryDelta) {
          state = 'scrolling';
          try {
            el.setPointerCapture(e.pointerId);
          } catch (_err) {
            // Capture may fail on some browsers — scroll still works without it
          }
        } else {
          // Secondary axis dominates — hand off to collapse or dnd-kit
          state = 'passthrough';
          return;
        }
      }

      if (state === 'scrolling') {
        // Block dnd-kit (document-level) from seeing this move event
        e.stopImmediatePropagation();
        e.preventDefault();

        if (axis === 'x') {
          el.scrollLeft = startScrollLeft - dx;
        } else {
          el.scrollTop = startScrollTop - dy;
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      if (state === 'scrolling') {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch (_err) {
          // Ignore — pointer may already be released
        }
      }
      state = 'idle';
      activePointerId = null;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, [ref, axis, disabled, minDistance]);
}
