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
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
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

const downloadFile = vi.fn();
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: { downloadFile } }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  deleteDoc: vi.fn(),
  onSnapshot: () => () => undefined,
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

// A sub cannot read the teacher's Drive, so the queue they see is the one the
// share carried (plan §3.4).
describe('NextUpWidget inside a sub share', () => {
  beforeEach(() => {
    mockUpdateWidget.mockClear();
    downloadFile.mockClear();
  });

  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={{
          shareId: 'share-1',
          version: 0,
          load: () => Promise.resolve(null),
        }}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }

  const shared = buildWidget({
    isActive: true,
    activeDriveFileId: 'queue-file',
    createdAt: Date.now(),
    subShareQueue: [
      { id: 'q1', name: 'Ada', status: 'active', joinedAt: 1 },
      { id: 'q2', name: 'Bo', status: 'waiting', joinedAt: 2 },
    ],
  });

  it('shows the queue the share carried', () => {
    const { getByText } = render(
      <InShare>
        <NextUpWidget widget={shared} />
      </InShare>
    );

    expect(getByText('Ada')).toBeInTheDocument();
    expect(getByText('Bo')).toBeInTheDocument();
  });

  it('reads nothing from the teacher’s Drive and writes no config', () => {
    render(
      <InShare>
        <NextUpWidget widget={shared} />
      </InShare>
    );

    expect(downloadFile).not.toHaveBeenCalled();
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  // Both write to the teacher's Drive queue file, which a sub cannot touch.
  it('offers neither Next nor Reset', () => {
    const { queryByText, queryByTitle } = render(
      <InShare>
        <NextUpWidget widget={shared} />
      </InShare>
    );

    expect(queryByText('NEXT')).not.toBeInTheDocument();
    expect(queryByTitle('Reset Queue')).not.toBeInTheDocument();
  });

  it('says so when nobody was in the queue', () => {
    const { getByText } = render(
      <InShare>
        <NextUpWidget widget={buildWidget({ isActive: true })} />
      </InShare>
    );

    expect(getByText('No queue')).toBeInTheDocument();
  });

  it('still runs the teacher’s own session off the share', () => {
    downloadFile.mockResolvedValue({ text: () => Promise.resolve('[]') });
    const { getByText } = render(
      <NextUpWidget
        widget={buildWidget({
          isActive: true,
          activeDriveFileId: 'queue-file',
          createdAt: Date.now(),
        })}
      />
    );

    expect(getByText('NEXT')).toBeInTheDocument();
    expect(downloadFile).toHaveBeenCalledWith('queue-file');
  });
});
