export interface TourStartRequest {
  setId: string;
  /** Index among ALL of the set's steps (liveTourStepsOf), not only the anchored ones. */
  fromStep?: number;
  /** Runs the saved set instead of the published snapshot. */
  draft?: boolean;
}

export const TOUR_START_EVENT = 'spart:start-tour';

// Set by the runner so launch points don't offer a tour while one is running.
let tourRunning = false;

export function requestStartTour(req: TourStartRequest): void {
  window.dispatchEvent(
    new CustomEvent<TourStartRequest>(TOUR_START_EVENT, { detail: req })
  );
}

export const setTourRunning = (running: boolean): void => {
  tourRunning = running;
};

export const isTourRunning = (): boolean => tourRunning;

export const TOUR_RECORD_EVENT = 'spart:record-tour';

/** Asks the recording host to start a new tour recording; admin surfaces close themselves on it. */
export function requestRecordTour(): void {
  window.dispatchEvent(new Event(TOUR_RECORD_EVENT));
}
