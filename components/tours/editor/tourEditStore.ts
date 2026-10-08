import { useSyncExternalStore } from 'react';
import type { GuidedLearningSet, GuidedLearningTourBinding } from '@/types';
import type { TourSlots } from '@/components/tours/tourSession';

export interface TourEditRequest {
  setId: string;
  /** Opens the editor with this step selected. */
  stepId?: string;
}

export const TOUR_EDIT_EVENT = 'spart:edit-tour';

/** Asks the editor host to open the board editor on this tour's draft. */
export function requestEditTour(req: TourEditRequest): void {
  window.dispatchEvent(
    new CustomEvent<TourEditRequest>(TOUR_EDIT_EVENT, { detail: req })
  );
}

/** What the editor wants the runner to show. */
export interface TourEditTarget {
  /** The draft as edited, unsaved changes included. */
  set: GuidedLearningSet;
  /** Index among liveTourStepsOf(set). */
  selected: number;
  /** Bumped to rebuild the stage and replay up to `selected`. */
  replay: number;
  readAloud: boolean;
  /** Record from here is capturing clicks; the runner shows nothing and doesn't advance. */
  recording?: boolean;
  /** Asks the runner to take this step's picture again; `n` changes on every ask. */
  retake?: { stepId: string; n: number };
  /** Live tour editing v2: sandboxed replays, checkpoints, pick and pause clear the stage. */
  v2?: boolean;
  /** The admin is picking a control; the runner shows nothing and doesn't advance. */
  picking?: boolean;
  /** The admin is setting the board up by hand; the runner shows nothing and doesn't advance. */
  paused?: boolean;
  /** Widgets a saved starting board gave slots to; `n` changes on every capture. */
  adopt?: { slots: Record<number, string>; n: number };
}

/** What the runner reports back to the panel. */
export interface TourEditPlayback {
  /** The step the runner is showing. */
  index: number;
  anchor: 'idle' | 'searching' | 'found' | 'missing';
  rect: { x: number; y: number; w: number; h: number } | null;
  /** Replaying earlier steps on the way to `selected`. */
  jumping: boolean;
  /** Stopped on a step the admin has to click. */
  blocked: boolean;
  /** Steps whose control was not found when they last played. */
  missing: readonly string[];
  /** Tour slot to widget id on the stage, so a picked widget control records its slot. */
  slots: TourSlots;
}

export const IDLE_PLAYBACK: TourEditPlayback = {
  index: 0,
  anchor: 'idle',
  rect: null,
  jumping: false,
  blocked: false,
  missing: [],
  slots: {},
};

const createStore = <T>(initial: T) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
};

const target = createStore<TourEditTarget | null>(null);
const playback = createStore<TourEditPlayback>(IDLE_PLAYBACK);

export const getTourEdit = target.get;
export const setTourEdit = target.set;

/** Ends the edit session; the runner tears its stage down. */
export const clearTourEdit = (): void => {
  target.set(null);
  playback.set(IDLE_PLAYBACK);
};

/** Moves the selection; the runner plays or fast-forwards to it. */
export const selectTourEditStep = (index: number): void => {
  const current = target.get();
  if (!current) return;
  const max = Math.max(current.set.steps.length - 1, 0);
  const selected = Math.min(Math.max(index, 0), max);
  if (selected !== current.selected) target.set({ ...current, selected });
};

/** Hides the runner's tip and spotlight while Record from here captures real clicks. */
export const setTourEditRecording = (recording: boolean): void => {
  const current = target.get();
  if (!current || !!current.recording === recording) return;
  target.set({ ...current, recording });
};

/** Hides the runner while the admin picks a control (v2). */
export const setTourEditPicking = (picking: boolean): void => {
  const current = target.get();
  if (!current?.v2 || !!current.picking === picking) return;
  target.set({ ...current, picking });
};

/** Pauses the tour so the admin can arrange the board by hand (v2). */
export const setTourEditPaused = (paused: boolean): void => {
  const current = target.get();
  if (!current?.v2 || !!current.paused === paused) return;
  target.set({ ...current, paused });
};

/** Ends a pause; with `slots`, the runner follows the widgets a starting board just captured. */
export const resumeTourEdit = (slots?: Record<number, string>): void => {
  const current = target.get();
  if (!current) return;
  target.set({
    ...current,
    paused: false,
    ...(slots ? { adopt: { slots, n: (current.adopt?.n ?? 0) + 1 } } : {}),
  });
};

export const useTourEditTarget = (): TourEditTarget | null =>
  useSyncExternalStore(target.subscribe, target.get, target.get);

export const getTourEditPlayback = playback.get;

const sameRect = (a: TourEditPlayback['rect'], b: TourEditPlayback['rect']) =>
  a === b ||
  (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Published by the runner; unchanged reports keep the old object. */
export const reportTourEditPlayback = (next: TourEditPlayback): void => {
  const prev = playback.get();
  if (
    prev.index === next.index &&
    prev.anchor === next.anchor &&
    prev.jumping === next.jumping &&
    prev.blocked === next.blocked &&
    sameRect(prev.rect, next.rect) &&
    prev.missing.join() === next.missing.join() &&
    JSON.stringify(prev.slots) === JSON.stringify(next.slots)
  )
    return;
  playback.set(next);
};

export const useTourEditPlayback = (): TourEditPlayback =>
  useSyncExternalStore(playback.subscribe, playback.get, playback.get);

/** Asks the runner for a new picture of this step when it next shows it. */
export const retakeTourEditThumbnail = (stepId: string): void => {
  const current = target.get();
  if (!current) return;
  target.set({
    ...current,
    retake: { stepId, n: (current.retake?.n ?? 0) + 1 },
  });
};

/** A picture the runner took of a step's control, already blurred. */
export interface TourEditShot {
  stepId: string;
  /** The binding the picture was taken of. */
  tour: GuidedLearningTourBinding;
  frame: Blob;
}

const shotListeners = new Set<(shot: TourEditShot) => void>();

/** Called by the runner; the editor uploads the picture as the step's thumbnail. */
export const reportTourEditShot = (shot: TourEditShot): void =>
  shotListeners.forEach((l) => l(shot));

export const onTourEditShot = (
  listener: (shot: TourEditShot) => void
): (() => void) => {
  shotListeners.add(listener);
  return () => {
    shotListeners.delete(listener);
  };
};
