export interface TourStartRequest {
  setId: string;
  /** Index among ALL of the set's steps (liveTourStepsOf), not only the anchored ones. */
  fromStep?: number;
  /** Studio preview: run the saved set instead of the published snapshot. */
  draft?: boolean;
  /** Studio runs: reopen the Studio at this step when the run ends. */
  returnToStepId?: string;
}

export const TOUR_START_EVENT = 'spart:start-tour';

/** Where the Studio reopens after a run or a re-recorded step. */
export interface StudioReturn {
  setId: string;
  stepId: string;
}

export const TOUR_OPEN_STUDIO_EVENT = 'spart:open-tour-studio';

/** Asks the recording host to open the Studio on this set at this step. */
export function requestOpenStudio<T extends StudioReturn>(req: T): void {
  window.dispatchEvent(
    new CustomEvent<T>(TOUR_OPEN_STUDIO_EVENT, { detail: req })
  );
}

let studioReturn: StudioReturn | null = null;

// Set by the runner so launch points don't offer a tour while one is running.
let tourRunning = false;

export function requestStartTour(req: TourStartRequest): void {
  studioReturn =
    req.returnToStepId && !tourRunning
      ? { setId: req.setId, stepId: req.returnToStepId }
      : null;
  window.dispatchEvent(
    new CustomEvent<TourStartRequest>(TOUR_START_EVENT, { detail: req })
  );
}

export const setTourRunning = (running: boolean): void => {
  const ended = tourRunning && !running;
  tourRunning = running;
  if (!ended || !studioReturn) return;
  const back = studioReturn;
  studioReturn = null;
  requestOpenStudio(back);
};

export const isTourRunning = (): boolean => tourRunning;

export const TOUR_RECORD_EVENT = 'spart:record-tour';

/** Asks the recording host to start a new tour recording; admin surfaces close themselves on it. */
export function requestRecordTour(): void {
  window.dispatchEvent(new Event(TOUR_RECORD_EVENT));
}

/** Asks the recording host to re-record one step's click, then reopen the Studio on it. */
export function requestRerecordStep(target: StudioReturn): void {
  window.dispatchEvent(
    new CustomEvent<StudioReturn>(TOUR_RECORD_EVENT, { detail: target })
  );
}

/** The step a record request targets, or null for a whole new recording. */
export const rerecordTargetOf = (e: Event): StudioReturn | null => {
  const detail: unknown = e instanceof CustomEvent ? e.detail : null;
  if (!detail || typeof detail !== 'object') return null;
  const { setId, stepId } = detail as Partial<StudioReturn>;
  return typeof setId === 'string' && typeof stepId === 'string'
    ? { setId, stepId }
    : null;
};
