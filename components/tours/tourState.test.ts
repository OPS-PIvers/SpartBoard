import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HELP_CENTER_OPEN_EVENT,
  recordOriginOf,
  requestOpenHelpCenter,
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

  it('marks a record request with where it started', () => {
    const record = listen(TOUR_RECORD_EVENT);
    requestRecordTour('help-center');
    expect(detailOf(record)).toEqual({ origin: 'help-center' });
    expect(recordOriginOf(record.mock.calls[0][0] as Event)).toBe(
      'help-center'
    );
  });

  it('treats a click event or no argument as a widget start', () => {
    const record = listen(TOUR_RECORD_EVENT);
    (requestRecordTour as (arg?: unknown) => void)(new MouseEvent('click'));
    requestRecordTour();
    expect(detailOf(record, 0)).toEqual({ origin: 'widget' });
    expect(detailOf(record, 1)).toEqual({ origin: 'widget' });
    expect(recordOriginOf(new Event(TOUR_RECORD_EVENT))).toBe('widget');
  });

  it('asks Admin Settings to open the Help Center on an item', () => {
    const open = listen(HELP_CENTER_OPEN_EVENT);
    requestOpenHelpCenter({ selectId: 'item-1' });
    requestOpenHelpCenter();
    expect(detailOf(open, 0)).toEqual({ selectId: 'item-1' });
    expect(detailOf(open, 1)).toEqual({});
  });
});
