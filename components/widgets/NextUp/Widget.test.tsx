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
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextUpWidget } from './Widget';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import { NextUpConfig, WidgetData } from '@/types';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

const mockUpdateWidget = vi.fn();
const mockUpdateDoc = vi.fn((..._args: unknown[]) => Promise.resolve());

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
const updateFileContent = vi.fn((..._args: unknown[]) => Promise.resolve());
const isInAppFolder = vi.fn((fileId: string) =>
  Promise.resolve(fileId !== 'foreign-file-1')
);
const driveService = { downloadFile, updateFileContent, isInAppFolder };
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService }),
}));
type SnapshotListener = (snap: unknown) => void;
let entriesListener: SnapshotListener | null = null;
const mockDeleteDoc = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  onSnapshot: (_q: unknown, listener: SnapshotListener) => {
    entriesListener = listener;
    return () => undefined;
  },
}));

const buildWidget = (config: Partial<NextUpConfig>): WidgetData => ({
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
});

describe('NextUpWidget auto-expiry', () => {
  beforeEach(() => {
    mockUpdateWidget.mockClear();
    mockUpdateDoc.mockClear();
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
    expect(mockUpdateDoc).not.toHaveBeenCalled();
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

    // Only isActive is patched, so the rest of the config can't be overwritten with stale values.
    expect(mockUpdateWidget).toHaveBeenCalledWith('nextup-widget', {
      config: { isActive: false },
    });
    // The student join link closes with it.
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'nextup_sessions/teacher-1_nextup-widget' },
      { isActive: false }
    );
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
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          loadKey: noSubShareKey,
          load: () => Promise.resolve(null),
        })}
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

  it('still runs the teacher’s own session off the share', async () => {
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
    await waitFor(() =>
      expect(downloadFile).toHaveBeenCalledWith('queue-file')
    );
  });
});

describe('NextUpWidget taking in student joins', () => {
  beforeEach(() => {
    mockUpdateWidget.mockClear();
    mockDeleteDoc.mockClear();
    updateFileContent.mockClear();
    entriesListener = null;
    downloadFile.mockResolvedValue({ text: () => Promise.resolve('[]') });
  });

  const entrySnap = (...ids: string[]) => ({
    empty: ids.length === 0,
    docs: ids.map((id) => ({
      id,
      ref: { id },
      data: () => ({ name: `Student ${id}`, joinedAt: 1 }),
    })),
  });

  it('saves the queue, then deletes the joins and patches only lastUpdated', async () => {
    const { findByText } = render(
      <NextUpWidget
        widget={{
          ...buildWidget({
            isActive: true,
            activeDriveFileId: 'queue-file',
            createdAt: Date.now(),
          }),
          id: 'nextup-joins',
        }}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      entriesListener?.(entrySnap('a'));
      await Promise.resolve();
    });
    // A second snapshot arrives before the first drain finishes.
    await act(async () => {
      entriesListener?.(entrySnap('a', 'b'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await findByText('Student a')).toBeInTheDocument();
    expect(await findByText('Student b')).toBeInTheDocument();
    const lastSaved = JSON.parse(
      await (updateFileContent.mock.calls.at(-1)?.[1] as Blob).text()
    ) as { id: string }[];
    expect(lastSaved.map((item) => item.id)).toEqual(['a', 'b']);
    expect(mockDeleteDoc).toHaveBeenCalled();
    for (const [, update] of mockUpdateWidget.mock.calls) {
      expect(update).toEqual({ config: { lastUpdated: expect.any(Number) } });
    }
    expect(mockUpdateWidget).toHaveBeenCalled();
  });

  it('never reads or writes a queue file outside the NextUp folder', async () => {
    downloadFile.mockClear();
    render(
      <NextUpWidget
        widget={{
          ...buildWidget({
            isActive: true,
            activeDriveFileId: 'foreign-file-1',
            createdAt: Date.now(),
          }),
          id: 'nextup-foreign',
        }}
      />
    );
    await act(async () => {
      entriesListener?.(entrySnap('a'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(isInAppFolder).toHaveBeenCalledWith('foreign-file-1', ['NextUp']);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(updateFileContent).not.toHaveBeenCalled();
  });
});
