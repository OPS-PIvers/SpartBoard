import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { updateDoc, writeBatch } from 'firebase/firestore';
import {
  guidedLearningLifecycle,
  isGuidedLearningEnded,
} from './glClassLifecycle';
import {
  finalizeClassGuidedLearningResponses,
  finalizeOpenGuidedLearningResponses,
} from './glTurnIn';
import { invalidateSessionViewCount } from '@/hooks/useSessionViewCount';

const docs = vi.hoisted(
  (): Record<string, Record<string, unknown> | undefined> => ({})
);

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn((path: string) => Promise.resolve({ data: () => docs[path] })),
  updateDoc: vi.fn(() => Promise.resolve()),
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
const setAssignmentTargets = vi.fn(() =>
  Promise.resolve({ written: 0, removed: 0, skipped: [] })
);
const archiveAssignment = vi.fn(() => {
  // Mirrors archiveAssignment: a close that has not passed becomes now.
  const c = docs[SESSION]?.closeAt;
  if (!(typeof c === 'number' && c <= NOW)) {
    docs[SESSION] = { ...docs[SESSION], closeAt: NOW };
    docs[ROW] = { ...docs[ROW], closeAt: NOW, status: 'archived' };
  }
  return Promise.resolve();
});
const make = () =>
  guidedLearningLifecycle(UID, { archiveAssignment, setAssignmentTargets });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  (writeBatch as Mock).mockReturnValue(batch);
  for (const k of Object.keys(docs)) delete docs[k];
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

describe('end', () => {
  it('archives, then turns work in after the write grace against the closeAt that stands', async () => {
    docs[SESSION] = { closeAt: NOW - 10_000 };
    const lc = make();

    await lc.end('g1');

    expect(archiveAssignment).toHaveBeenCalledWith('g1');
    expect(updateDoc).toHaveBeenCalledWith(ROW, { closedAt: NOW });
    expect(finalizeOpenGuidedLearningResponses).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(lc.turnInDelayMs);
    expect(finalizeOpenGuidedLearningResponses).toHaveBeenCalledWith(
      'g1',
      NOW - 10_000
    );
    expect(lc.endTurnsIn).toBe(true);
  });

  it('keeps a future close that archive replaces, and turns in against now', async () => {
    docs[SESSION] = { closeAt: NOW + 86_400_000 };
    const lc = make();

    await lc.end('g1');

    expect(updateDoc).toHaveBeenCalledWith(ROW, {
      closedAt: NOW,
      closeAtBeforeEnd: NOW + 86_400_000,
    });
    await vi.advanceTimersByTimeAsync(lc.turnInDelayMs);
    expect(finalizeOpenGuidedLearningResponses).toHaveBeenCalledWith('g1', NOW);
  });
  it('keeps a close mark the Assigned tab already wrote', async () => {
    docs[SESSION] = { closeAt: NOW - 10_000 };
    docs[ROW] = { closedAt: NOW - 5_000 };

    await make().end('g1');

    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('reopen', () => {
  it('clears a passed close on both docs and makes the row active', async () => {
    docs[SESSION] = { closeAt: NOW - 1 };
    docs[ROW] = { closeAt: NOW - 1, status: 'archived' };

    await make().reopen('g1');

    expect(batch.update).toHaveBeenCalledWith(ROW, {
      status: 'active',
      updatedAt: NOW,
      archivedAt: null,
      closeAtBeforeEnd: null,
      closeAt: null,
    });
    expect(batch.update).toHaveBeenCalledWith(SESSION, { closeAt: null });
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(invalidateSessionViewCount).toHaveBeenCalledWith(
      'guided_learning_sessions',
      'g1'
    );
    expect(setAssignmentTargets).not.toHaveBeenCalled();
  });

  it('puts back the close End replaced while it is still ahead', async () => {
    docs[SESSION] = { closeAt: NOW + 86_400_000 };
    const lc = make();
    await lc.end('g1');
    docs[ROW] = { ...docs[ROW], closeAtBeforeEnd: NOW + 86_400_000 };

    await lc.reopen('g1');

    expect(batch.update).toHaveBeenCalledWith(
      ROW,
      expect.objectContaining({ closeAt: NOW + 86_400_000 })
    );
    expect(batch.update).toHaveBeenCalledWith(SESSION, {
      closeAt: NOW + 86_400_000,
    });
  });

  it('drops a kept close that has since passed', async () => {
    docs[SESSION] = { closeAt: NOW - 5 };
    docs[ROW] = { closeAt: NOW - 5, closeAtBeforeEnd: NOW - 1 };
    await make().reopen('g1');
    expect(batch.update).toHaveBeenCalledWith(SESSION, { closeAt: null });
  });

  it('keeps a close time that is still ahead', async () => {
    docs[SESSION] = { closeAt: NOW + 60_000 };
    docs[ROW] = { closeAt: NOW + 60_000 };

    await make().reopen('g1');

    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.update).toHaveBeenCalledWith(ROW, {
      status: 'active',
      updatedAt: NOW,
      archivedAt: null,
      closeAtBeforeEnd: null,
    });
  });

  it('clears a passed row close even when the session drifted', async () => {
    docs[SESSION] = { closeAt: null };
    docs[ROW] = { closeAt: NOW - 1 };

    await make().reopen('g1');

    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.update).toHaveBeenCalledWith(
      ROW,
      expect.objectContaining({ closeAt: null })
    );
  });

  it("rewrites students' own pointer close when the run has pointers", async () => {
    docs[SESSION] = { closeAt: NOW - 1 };
    docs[ROW] = {
      closeAt: NOW - 1,
      targetMode: 'students',
      targetStudents: [{ sourcedId: 's1' }],
    };

    await make().reopen('g1');

    expect(setAssignmentTargets).toHaveBeenCalledWith({
      assignmentId: 'g1',
      kind: 'guided-learning',
      sessionId: 'g1',
      targetMode: 'students',
      add: [],
      remove: [],
      overridesBySourcedId: {},
      window: { closeAt: null },
    });
  });
});

describe('onWindowCleared', () => {
  it('rewrites pointers only for a run that has them', async () => {
    docs[ROW] = { targetMode: 'class' };
    await make().onWindowCleared('g1', { openAt: null });
    expect(setAssignmentTargets).not.toHaveBeenCalled();

    docs[ROW] = { targetMode: 'class', excludedTargets: [{ sourcedId: 's' }] };
    await make().onWindowCleared('g1', { openAt: null });
    expect(setAssignmentTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'guided-learning',
        sessionId: 'g1',
        window: { openAt: null },
      })
    );
  });
});

describe('turnInClass', () => {
  it('hands off to the class turn-in', async () => {
    await make().turnInClass('g1', 'p1', 5);
    expect(finalizeClassGuidedLearningResponses).toHaveBeenCalledWith(
      'g1',
      'p1',
      5
    );
  });
});
