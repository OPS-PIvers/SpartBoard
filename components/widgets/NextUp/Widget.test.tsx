/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Regression test for the NextUp auto-expiry day-rollover check.
 *
 * Bug: the widget's auto-expiry `useEffect` only re-ran when
 * `config.isActive`/`config.createdAt` changed identity — there was no
 * time-based re-trigger. A session left active on an idle classroom display
 * overnight (no student joining the queue, no other config write) stayed
 * "active" indefinitely past midnight instead of auto-expiring at the next
 * calendar day, because nothing ever caused the effect to re-run and
 * re-evaluate `new Date()` against the stored `createdAt`. Same root cause
 * as CountdownWidget (#1774) and CalendarWidget (#1955): a date comparison
 * with no ticking dependency.
 *
 * Fix: added a `nowTick` state that ticks every 60s via `setInterval` and is
 * included in the auto-expiry effect's dependency array, so the day
 * comparison (extracted to the pure, independently-tested
 * `shouldExpireNextUpQueue` in nextUpQueueUtils.ts) re-runs periodically
 * regardless of whether `config` changed.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextUpWidget } from './Widget';
import { NextUpConfig, WidgetData } from '@/types';

const mockUpdateWidget = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    activeDashboard: { widgets: [] },
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null }),
}));

const buildWidget = (config: Partial<NextUpConfig>): WidgetData =>
  ({
    id: 'nextup-widget',
    type: 'nextUp',
    x: 0,
    y: 0,
    w: 350,
    h: 500,
    z: 1,
    flipped: false,
    config: {
      activeDriveFileId: null,
      sessionName: 'Help Queue',
      isActive: false,
      createdAt: 0,
      lastUpdated: 0,
      displayCount: 3,
      styling: {
        fontFamily: 'lexend',
        themeColor: '#2d3f89',
        animation: 'slide',
      },
      ...config,
    } satisfies NextUpConfig,
  }) as WidgetData;

describe('NextUpWidget auto-expiry', () => {
  beforeEach(() => {
    mockUpdateWidget.mockClear();
    vi.useFakeTimers();
    // A few minutes before local midnight.
    vi.setSystemTime(new Date('2026-07-23T23:58:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not expire an active session created earlier the same day', () => {
    render(
      <NextUpWidget
        widget={buildWidget({
          isActive: true,
          createdAt: new Date('2026-07-23T08:00:00').getTime(),
        })}
      />
    );

    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  it('auto-expires an idle overnight session once the clock ticks past midnight', () => {
    render(
      <NextUpWidget
        widget={buildWidget({
          isActive: true,
          // Created a few minutes before the fake "now" above — matches
          // today, so no expiry on mount.
          createdAt: new Date('2026-07-23T23:50:00').getTime(),
        })}
      />
    );

    // No config write yet — the session was created today.
    expect(mockUpdateWidget).not.toHaveBeenCalled();

    // Advance past midnight with NO other state change (mirrors an idle
    // classroom display: no student joins the queue overnight).
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000); // +5 minutes → 00:03 next day
    });

    expect(mockUpdateWidget).toHaveBeenCalledWith('nextup-widget', {
      config: expect.objectContaining({ isActive: false }),
    });
  });
});
