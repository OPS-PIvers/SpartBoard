import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { getDoc, writeBatch } from 'firebase/firestore';
import {
  guidedLearningLifecycle,
  isGuidedLearningEnded,
} from './glClassLifecycle';
import {
  finalizeClassGuidedLearningResponses,
  finalizeOpenGuidedLearningResponses,
} from './glTurnIn';
import { invalidateSessionViewCount } from '@/hooks/useSessionViewCount';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/hooks/useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));
vi.mock('./glTurnIn', () => ({
  finalizeClassGuidedLearningResponses: vi.fn(() => Promise.resolve()),
  finalizeOpenGuidedLearningResponses: vi.fn(() => Promise.resolve()),
}));

const NOW = 1_700_000_000_000;
const UID = 't1';
const SESSION = 'guided_learning_sessions/g1';
const ROW = 'users/t1/guided_learning_assignments/g1';

const batch = { update: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
const sessionCloseAt = (closeAt: unknown, rowCloseAt: unknown = closeAt) =>
  (getDoc as Mock).mockImplementation((path: string) =>
    Promise.resolve({
      data: () => ({ closeAt: path === ROW ? rowCloseAt : closeAt }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  (writeBatch as Mock).mockReturnValue(batch);
});
afterEach(() => vi.useRealTimers());

describe('isGuidedLearningEnded', () => {
  it('reads archived and a passed single-line close as ended', () => {
    expect(isGuidedLearningEnded({ status: 'archived' }, NOW)).toBe(true);
    expect(isGuidedLearningEnded({ status: 'active', closeAt: NOW }, NOW)).toBe(
      true
    );
    expect(
      isGuidedLearningEnded({ status: 'active', closeAt: NOW + 1 }, NOW)
    ).toBe(false);
    expect(
      isGuidedLearningEnded({ status: 'active', closeAt: null }, NOW)
    ).toBe(false);
  });
});

describe('guidedLearningLifecycle', () => {
  it('End archives, then turns work in after the write grace against the closeAt that stands', async () => {
    const archiveAssignment = vi.fn(() => Promise.resolve());
    sessionCloseAt(NOW - 10_000);
    const lc = guidedLearningLifecycle(UID, { archiveAssignment });

    await lc.end('g1');

    expect(archiveAssignment).toHaveBeenCalledWith('g1');
    expect(finalizeOpenGuidedLearningResponses).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(lc.turnInDelayMs);
    expect(finalizeOpenGuidedLearningResponses).toHaveBeenCalledWith(
      'g1',
      NOW - 10_000
    );
    expect(lc.endTurnsIn).toBe(true);
  });

  it('End schedules nothing when the session has no close time', async () => {
    sessionCloseAt(undefined);
    const lc = guidedLearningLifecycle(UID, {
      archiveAssignment: () => Promise.resolve(),
    });
    await lc.end('g1');
    await vi.runAllTimersAsync();
    expect(finalizeOpenGuidedLearningResponses).not.toHaveBeenCalled();
  });

  it('Reopen clears a passed close on both docs and makes the row active', async () => {
    sessionCloseAt(NOW - 1);
    const lc = guidedLearningLifecycle(UID, {
      archiveAssignment: () => Promise.resolve(),
    });

    await lc.reopen('g1');

    expect(batch.update).toHaveBeenCalledWith(ROW, {
      status: 'active',
      updatedAt: NOW,
      archivedAt: null,
      closeAt: null,
    });
    expect(batch.update).toHaveBeenCalledWith(SESSION, { closeAt: null });
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(invalidateSessionViewCount).toHaveBeenCalledWith(
      'guided_learning_sessions',
      'g1'
    );
  });

  it('Reopen keeps a close time that is still ahead', async () => {
    sessionCloseAt(NOW + 60_000);
    const lc = guidedLearningLifecycle(UID, {
      archiveAssignment: () => Promise.resolve(),
    });

    await lc.reopen('g1');

    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.update).toHaveBeenCalledWith(ROW, {
      status: 'active',
      updatedAt: NOW,
      archivedAt: null,
    });
  });

  it('Reopen clears a passed row close even when the session drifted', async () => {
    sessionCloseAt(null, NOW - 1);
    const lc = guidedLearningLifecycle(UID, {
      archiveAssignment: () => Promise.resolve(),
    });

    await lc.reopen('g1');

    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.update).toHaveBeenCalledWith(ROW, {
      status: 'active',
      updatedAt: NOW,
      archivedAt: null,
      closeAt: null,
    });
  });

  it('turnInClass hands off to the class turn-in', async () => {
    const lc = guidedLearningLifecycle(UID, {
      archiveAssignment: () => Promise.resolve(),
    });
    await lc.turnInClass('g1', 'p1', 5);
    expect(finalizeClassGuidedLearningResponses).toHaveBeenCalledWith(
      'g1',
      'p1',
      5
    );
  });
});
