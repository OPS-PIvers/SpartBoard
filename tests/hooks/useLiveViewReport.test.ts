import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import type { QuizLiveState } from '@/types';
import {
  LIVE_ACTIVITY_REPORT_MS,
  useLiveViewReport,
  type UseLiveViewReportArgs,
} from '@/hooks/useLiveViewReport';

vi.mock('@/utils/eventTrust', () => ({ isTrustedEvent: () => true }));

describe('useLiveViewReport', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (extra: Partial<UseLiveViewReportArgs> = {}) => {
    const report = vi.fn((_state: QuizLiveState) => Promise.resolve());
    const args: UseLiveViewReportArgs = {
      until: Date.now() + 60_000,
      questionId: 'q1',
      warning: false,
      report,
      ...extra,
    };
    const hook = renderHook(
      (p: UseLiveViewReportArgs) => useLiveViewReport(p),
      {
        initialProps: args,
      }
    );
    return { report, args, ...hook };
  };

  it('sends clicks as activity, at most once per interval with the latest time', () => {
    const { report } = setup();
    expect(report).toHaveBeenCalledTimes(1);
    report.mockClear();

    vi.advanceTimersByTime(1_000);
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(report).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);
    fireEvent.pointerDown(document.body);
    const lastAt = Date.now();
    vi.advanceTimersByTime(LIVE_ACTIVITY_REPORT_MS);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'q1', activeAt: lastAt })
    );

    report.mockClear();
    vi.advanceTimersByTime(LIVE_ACTIVITY_REPORT_MS);
    fireEvent.pointerDown(document.body);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reports the tab warning as soon as it shows and when it clears', () => {
    const { report, args, rerender } = setup();
    report.mockClear();
    rerender({ ...args, warning: true });
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ warning: true })
    );
    rerender({ ...args, warning: false });
    // Left out when off, so a report still passes rules that predate the field.
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.lastCall?.[0]).not.toHaveProperty('warning');
  });

  it('writes nothing while nobody watches, but remembers the last activity', () => {
    const { report, args, rerender } = setup({ until: 0 });
    fireEvent.pointerDown(document.body);
    const clickedAt = Date.now();
    vi.advanceTimersByTime(30_000);
    expect(report).not.toHaveBeenCalled();

    rerender({ ...args, until: Date.now() + 60_000 });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ activeAt: clickedAt })
    );
  });
});
