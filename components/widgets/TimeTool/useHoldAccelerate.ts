import React, { useCallback, useEffect, useRef } from 'react';

const HOLD_DELAY_MS = 400;
const TICK_INTERVAL_MS = 250;

const multiplierForHeldMs = (heldMs: number): number => {
  if (heldMs < 1000) return 1;
  if (heldMs < 2000) return 2;
  return 5;
};

/**
 * Hook that returns pointer event handlers for a tap-and-hold control with ramp-up.
 *
 * Behavior:
 *  - On pointerdown: fires `onTick(1)` immediately (the "tap" pulse).
 *  - If held past 400ms, starts ticking every 250ms with multiplier 1×, ramping
 *    to 2× after 1s of ticking and 5× after 2s.
 *  - Cancels on pointerup, pointercancel, pointerleave, or unmount.
 */
export const useHoldAccelerate = (onTick: (multiplier: number) => void) => {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickStartRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (holdTimeoutRef.current != null) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (tickIntervalRef.current != null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      stop();
      onTickRef.current(1);
      holdTimeoutRef.current = setTimeout(() => {
        tickStartRef.current = Date.now();
        tickIntervalRef.current = setInterval(() => {
          const heldMs = Date.now() - tickStartRef.current;
          onTickRef.current(multiplierForHeldMs(heldMs));
        }, TICK_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    },
    [stop]
  );

  // Keyboard activation: Enter/Space fire a single 1× step. We handle this
  // explicitly because pointer events don't fire for keyboard activation, and
  // we suppress the native click default to avoid a double-fire after pointerup
  // synthesises a click.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTickRef.current(1);
    }
  }, []);

  return {
    onPointerDown,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onKeyDown,
  };
};
