import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PeriodAccess, WritingAssignmentRecord } from '@/types';
import {
  undoWritingClose,
  useWritingClassActions,
} from '@/hooks/useWritingClassActions';

const store = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  sent: [] as Array<Record<string, unknown>>,
  targets: [] as unknown[],
}));
const periods = vi.hoisted(() => ({
  startPeriod: vi.fn(() => Promise.resolve([])),
  reopenPeriod: vi.fn(() => Promise.resolve([])),
  pausePeriod: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' } }),
}));
vi.mock('@/hooks/usePeriodAccess', () => ({
  usePeriodAccess: () => periods,
  closedRow: (now: number) => ({
    state: 'closed',
    closedAt: now,
    pausedAt: now,
  }),
}));
vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({
    setAssignmentTargets: (input: unknown) => {
      store.targets.push(input);
      return Promise.resolve({});
    },
  }),
}));
vi.mock('@/hooks/useWritingAssignmentSessions', () => ({
  WRITING_RECORDS_COLLECTION: 'writing_assignment_records',
  updateWritingSession: (input: Record<string, unknown>) => {
    store.sent.push(input);
    return Promise.resolve();
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => segs.join('/'),
  getDoc: () =>
    Promise.resolve({
      data: () => (store.doc ? structuredClone(store.doc) : undefined),
    }),
}));

const row = (p: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...p,
});

const record = (
  r: Partial<WritingAssignmentRecord> = {}
): WritingAssignmentRecord => ({
  id: 'S1',
  sessionId: 'S1',
  itemId: 'w1',
  title: 'Essay',
  teacherUid: 't1',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  ...r,
});

const render = (r: WritingAssignmentRecord) => {
  store.doc = r as unknown as Record<string, unknown>;
  return renderHook(() => useWritingClassActions(r, [])).result.current;
};

beforeEach(() => {
  store.sent = [];
  store.targets = [];
  vi.clearAllMocks();
});

describe('useWritingClassActions', () => {
  it('closes one class and lets the server end the run on the last one', async () => {
    const a = render(
      record({ periodAccess: { c1: row({ state: 'open' }), c2: row() } })
    );
    await act(() => a.closeClass('c1'));
    expect(store.sent).toEqual([
      expect.objectContaining({
        sessionId: 'S1',
        periodAccess: { c1: expect.objectContaining({ state: 'closed' }) },
        endIfAllClosed: true,
      }),
    ]);
  });

  it('opening a class of an ended run reopens it and keeps the others closed', async () => {
    const a = render(
      record({
        status: 'ended',
        periodAccess: {
          c1: row(),
          c2: row({ state: 'open' }),
          c3: row({ closedAt: 5 }),
        },
      })
    );
    await act(async () => {
      await a.openClass('c1');
    });
    expect(periods.startPeriod).toHaveBeenCalledWith('c1');
    expect(store.sent).toHaveLength(1);
    expect(store.sent[0].reopen).toBe(true);
    const rows = store.sent[0].periodAccess as Record<string, unknown>;
    expect(Object.keys(rows)).toEqual(['c2']);
  });

  it('a single line Close marks and ends; Open clears a passed close and syncs pointers', async () => {
    const a = render(
      record({
        closeAt: 10,
        targetStudents: [{ kind: 'classlink', sourcedId: 'x' }],
      })
    );
    await act(() => a.closeClass(null));
    expect(store.sent[0]).toMatchObject({
      marks: { closedAt: expect.any(Number) },
      end: true,
    });
    await act(async () => {
      await a.openClass(null);
    });
    expect(store.sent[1]).toMatchObject({ window: { closeAt: null } });
    expect(store.targets).toHaveLength(1);
  });

  it('a single line cannot be paused', async () => {
    const a = render(record());
    await expect(a.pauseClass(null)).rejects.toThrow('cannot be paused');
  });

  it('Move to Finished closes every class, marks it and ends', async () => {
    const a = render(
      record({
        periodAccess: { c1: row({ state: 'open' }), c2: row({ closedAt: 3 }) },
      })
    );
    await act(() => a.moveToDone());
    const sent = store.sent[0];
    expect(Object.keys(sent.periodAccess as object)).toEqual(['c1']);
    expect(sent).toMatchObject({
      end: true,
      marks: { doneAt: expect.any(Number) },
    });
  });

  it('refuses anyone but the assigning teacher', async () => {
    const a = render(record({ teacherUid: 'other' }));
    await expect(a.closeAll()).rejects.toThrow('Only the assigning teacher');
  });

  it('Undo puts every class and mark back', async () => {
    await undoWritingClose(
      record({ periodAccess: { c1: row({ state: 'open' }) } })
    );
    expect(store.sent[0]).toMatchObject({
      reopen: true,
      periodAccess: { c1: { state: 'open', closedAt: null } },
      marks: { closedAt: null, doneAt: null },
    });
  });
});
