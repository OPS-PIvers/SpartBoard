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
