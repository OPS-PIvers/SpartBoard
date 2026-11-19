import React, { useRef, useCallback, useEffect } from 'react';

/** Distance in px the pointer can move before cancelling the long press. */
const MOVE_THRESHOLD = 15;
/** How long the pointer must be held before firing. */
const HOLD_DELAY_MS = 600;
/** How long after release a stray click from the held press is still swallowed. */
const RELEASE_GRACE_MS = 500;

// After a long press fires, swallow the release's click and compat mousedown so it can't also tap or start a drag.
function swallowReleaseOfHeldPress(): void {
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'click') done();
  };
  const onRelease = () => {
    graceTimer ??= setTimeout(done, RELEASE_GRACE_MS);
  };
  function done() {
    if (graceTimer) clearTimeout(graceTimer);
    window.removeEventListener('click', stop, true);
    window.removeEventListener('mousedown', stop, true);
    window.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('pointercancel', onRelease, true);
    window.removeEventListener('pointerdown', done, true);
    window.removeEventListener('keydown', done, true);
  }
  window.addEventListener('click', stop, true);
  window.addEventListener('mousedown', stop, true);
  window.addEventListener('pointerup', onRelease, true);
  window.addEventListener('pointercancel', onRelease, true);
  window.addEventListener('pointerdown', done, true);
  window.addEventListener('keydown', done, true);
}

interface UseLongPressOptions {
  /** Skip long-press detection entirely (e.g. during edit/drag mode). */
  disabled?: boolean;
  /**
   * Extra handler to invoke at the start of the press (e.g. dnd-kit listener passthrough).
   * Accepts a generic Function to match dnd-kit's SyntheticListenerMap type.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  onPointerDown?: ((e: React.PointerEvent) => void) | Function;
}

/**
 * Returns pointer-event handlers that detect a long press while cancelling
 * if the pointer moves beyond a threshold.  Attach `onPointerUp` to both
 * `onPointerUp` and `onPointerLeave` on the target element.
 */
export function useLongPress(
  onLongPress: () => void,
  options?: UseLongPressOptions
) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      options?.onPointerDown?.(e);
      clear();
      if (options?.disabled) return;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        swallowReleaseOfHeldPress();
        onLongPress();
      }, HOLD_DELAY_MS);
    },
    [clear, onLongPress, options]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startPosRef.current;
      if (!timerRef.current || !start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        clear();
      }
    },
    [clear]
  );

  // Unmount mid-press must cancel the pending timer — no pointerup/cancel will ever arrive.
  useEffect(() => clear, [clear]);

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: clear,
    onPointerMove: handlePointerMove,
    onPointerCancel: clear,
  } as const;
}
