import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStudioReturn,
  handOffSnapshots,
  requestRecordTour,
  requestRerecordStep,
  requestStartTour,
  rerecordTargetOf,
  setTourRunning,
  TOUR_OPEN_STUDIO_EVENT,
  TOUR_RECORD_EVENT,
  TOUR_SNAPSHOTS_EVENT,
  TOUR_START_EVENT,
} from './tourState';

const listeners: [string, EventListener][] = [];
const listen = (type: string) => {
  const fn = vi.fn();
  listeners.push([type, fn]);
  window.addEventListener(type, fn);
  return fn;
};
const detailOf = (fn: ReturnType<typeof vi.fn>, call = 0) =>
  (fn.mock.calls[call][0] as CustomEvent).detail as unknown;

afterEach(() => {
  listeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
  listeners.length = 0;
  setTourRunning(false);
});

describe('tourState', () => {
  it('reopens the Studio at the step a Studio run started from once it ends', () => {
    const start = listen(TOUR_START_EVENT);
    const open = listen(TOUR_OPEN_STUDIO_EVENT);
    requestStartTour({
      setId: 'set-1',
      draft: true,
      fromStep: 2,
      returnToStepId: 'step-3',
    });
    expect(detailOf(start)).toEqual({
      setId: 'set-1',
      draft: true,
      fromStep: 2,
      returnToStepId: 'step-3',
    });
    setTourRunning(true);
    expect(open).not.toHaveBeenCalled();
    setTourRunning(false);
    expect(detailOf(open)).toEqual({ setId: 'set-1', stepId: 'step-3' });
    setTourRunning(true);
    setTourRunning(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("sends a draft run's pictures to review instead of reopening the Studio", () => {
    const open = listen(TOUR_OPEN_STUDIO_EVENT);
    const review = listen(TOUR_SNAPSHOTS_EVENT);
    requestStartTour({ setId: 'set-1', draft: true, returnToStepId: 's' });
    setTourRunning(true);
    const shots = {
      setId: 'set-1',
      stepId: 's',
      shots: [
        {
          stepId: 's',
          tour: { anchor: 'dock.open-tools', action: 'click' as const },
          frame: new Blob(['x']),
          boxes: [],
          placement: {
            xPct: 50,
            yPct: 50,
            region: { shape: 'rect' as const, wPct: 5, hPct: 5 },
          },
        },
      ],
    };
    handOffSnapshots(shots);
    setTourRunning(false);
    expect(detailOf(review)).toBe(shots);
    expect(open).not.toHaveBeenCalled();
  });

  it('ignores an empty hand-off', () => {
    const review = listen(TOUR_SNAPSHOTS_EVENT);
    setTourRunning(true);
    handOffSnapshots({ setId: 'a', stepId: 'b', shots: [] });
    setTourRunning(false);
    expect(review).not.toHaveBeenCalled();
  });

  it('does not reopen the Studio after a run started elsewhere', () => {
    const open = listen(TOUR_OPEN_STUDIO_EVENT);
    requestStartTour({ setId: 'set-1', draft: true, returnToStepId: 's' });
    requestStartTour({ setId: 'set-2' });
    setTourRunning(true);
    setTourRunning(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('forgets the Studio return once cleared after a failed launch', () => {
    const open = listen(TOUR_OPEN_STUDIO_EVENT);
    requestStartTour({ setId: 'set-1', draft: true, returnToStepId: 's' });
    clearStudioReturn();
    setTourRunning(true);
    setTourRunning(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('tells a step re-record apart from a new recording', () => {
    const record = listen(TOUR_RECORD_EVENT);
    requestRecordTour();
    requestRerecordStep({ setId: 'set-1', stepId: 'step-2' });
    expect(rerecordTargetOf(record.mock.calls[0][0] as Event)).toBeNull();
    expect(rerecordTargetOf(record.mock.calls[1][0] as Event)).toEqual({
      setId: 'set-1',
      stepId: 'step-2',
    });
  });
});
