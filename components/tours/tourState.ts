export interface TourStartRequest {
  setId: string;
  fromStep?: number;
}

export const TOUR_START_EVENT = 'spart:start-tour';

export function requestStartTour(req: TourStartRequest): void {
  window.dispatchEvent(
    new CustomEvent<TourStartRequest>(TOUR_START_EVENT, { detail: req })
  );
}

// Set by the runner so launch points don't offer a tour while one is running.
let tourRunning = false;

export const setTourRunning = (running: boolean): void => {
  tourRunning = running;
};

export const isTourRunning = (): boolean => tourRunning;

export const TOUR_RECORD_EVENT = 'spart:record-tour';

/** Asks the recording host to start a new tour recording; admin surfaces close themselves on it. */
export function requestRecordTour(): void {
  window.dispatchEvent(new Event(TOUR_RECORD_EVENT));
}
