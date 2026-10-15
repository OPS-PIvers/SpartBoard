// The fixed frame every live tour starts on (LIVE_TOUR_CONSISTENT_START.md C1 to C4).
import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/useAuth';
import type { DockPosition, WidgetType } from '@/types';

export interface TourFrame {
  active: boolean;
  /** Bumped on each start or reset, so every surface closes again. */
  epoch: number;
  /** Widget types the tour clicks in the Dock; any not shown there get a temporary button (C4). */
  dockItemTypes: readonly WidgetType[];
  /** Whether each quick-access button may show while the tour runs. */
  quickAccess: readonly [boolean, boolean];
}

const INACTIVE: TourFrame = {
  active: false,
  epoch: 0,
  dockItemTypes: [],
  quickAccess: [true, true],
};

let frame: TourFrame = INACTIVE;
const listeners = new Set<() => void>();

const publish = (next: TourFrame) => {
  frame = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTourFrame = (): TourFrame => frame;

export function startTourFrame(
  opts: Pick<TourFrame, 'dockItemTypes' | 'quickAccess'>
): void {
  publish({ ...opts, active: true, epoch: frame.epoch + 1 });
}

/** Closes every frame surface again mid-tour without changing what teardown restores. */
export function resetTourFrame(): void {
  if (frame.active) publish({ ...frame, epoch: frame.epoch + 1 });
}

export function endTourFrame(): void {
  if (frame.active) publish({ ...INACTIVE, epoch: frame.epoch });
}

export const useTourFrame = (): TourFrame =>
  useSyncExternalStore(subscribe, getTourFrame, getTourFrame);

/** The Dock sits at the bottom while a tour runs (C2). */
export function useDockPosition(): DockPosition {
  const { dockPosition } = useAuth();
  return useTourFrame().active ? 'bottom' : dockPosition;
}

/** Runs `hold` when a tour frame starts or resets; the first start's return value runs when the frame ends. */
export function useTourFrameHold(hold: () => () => void): void {
  const onHold = useEffectEvent(hold);
  useEffect(() => {
    let epoch = 0;
    let restore: (() => void) | null = null;
    const sync = () => {
      if (!frame.active) {
        const r = restore;
        restore = null;
        epoch = frame.epoch;
        r?.();
        return;
      }
      if (frame.epoch === epoch) return;
      epoch = frame.epoch;
      const r = onHold();
      restore ??= r;
    };
    sync();
    const unsubscribe = subscribe(sync);
    return () => {
      unsubscribe();
      restore?.();
    };
  }, []);
}
