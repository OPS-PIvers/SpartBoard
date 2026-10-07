import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestRecordTour,
  requestStartTour,
  setTourRunning,
  TOUR_RECORD_EVENT,
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
  it('dispatches a start request as given', () => {
    const start = listen(TOUR_START_EVENT);
    requestStartTour({ setId: 'set-1', draft: true, fromStep: 2 });
    expect(detailOf(start)).toEqual({
      setId: 'set-1',
      draft: true,
      fromStep: 2,
    });
  });

  it('asks the recording host for a new recording', () => {
    const record = listen(TOUR_RECORD_EVENT);
    requestRecordTour();
    expect(record).toHaveBeenCalledTimes(1);
  });
});
