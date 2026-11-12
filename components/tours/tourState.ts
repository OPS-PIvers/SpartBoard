import { useSyncExternalStore } from 'react';

export interface TourStartRequest {
  setId: string;
  /** Index among ALL of the set's steps (liveTourStepsOf), not only the anchored ones. */
  fromStep?: number;
  /** Runs the saved set instead of the published snapshot. */
  draft?: boolean;
  /** Started from Getting Started, so finishing it offers the next tour there. */
  chain?: 'getting-started';
}

export const TOUR_START_EVENT = 'spart:start-tour';

// Set by the runner so launch points don't offer a tour while one is running.
let tourRunning = false;

export function requestStartTour(req: TourStartRequest): void {
  window.dispatchEvent(
    new CustomEvent<TourStartRequest>(TOUR_START_EVENT, { detail: req })
  );
}

const runningListeners = new Set<() => void>();

export const setTourRunning = (running: boolean): void => {
  if (tourRunning === running) return;
  tourRunning = running;
  runningListeners.forEach((fn) => fn());
};

export const isTourRunning = (): boolean => tourRunning;

export const subscribeTourRunning = (fn: () => void): (() => void) => {
  runningListeners.add(fn);
  return () => {
    runningListeners.delete(fn);
  };
};

export const useTourRunning = (): boolean =>
  useSyncExternalStore(subscribeTourRunning, isTourRunning, isTourRunning);

export const TOUR_RECORD_EVENT = 'spart:record-tour';

/** Where a recording or edit started: a Help Center start reopens Admin Settings when it ends (H13). */
export type TourOrigin = 'help-center' | 'widget';

export interface TourRecordRequest {
  origin: TourOrigin;
}

// Also used as a bare onClick handler, so anything but 'help-center' counts as a widget start.
const originOf = (value: unknown): TourOrigin =>
  value === 'help-center' ? 'help-center' : 'widget';

/** Asks the recording host to start a new tour recording; admin surfaces close themselves on it. */
export function requestRecordTour(origin?: TourOrigin): void {
  window.dispatchEvent(
    new CustomEvent<TourRecordRequest>(TOUR_RECORD_EVENT, {
      detail: { origin: originOf(origin) },
    })
  );
}

/** Reads a record event's origin; a plain Event from older callers is a widget start. */
export const recordOriginOf = (event: Event): TourOrigin =>
  originOf((event as CustomEvent<TourRecordRequest | null>).detail?.origin);

export const HELP_CENTER_OPEN_EVENT = 'spart:open-help-center';

export interface HelpCenterOpenRequest {
  /** The help_resources item to select once Admin Settings > Help Center is open. */
  selectId?: string;
}

/** Opens Admin Settings > Help Center, optionally with one item selected. */
export function requestOpenHelpCenter(req: HelpCenterOpenRequest = {}): void {
  window.dispatchEvent(
    new CustomEvent<HelpCenterOpenRequest>(HELP_CENTER_OPEN_EVENT, {
      detail: req,
    })
  );
}
