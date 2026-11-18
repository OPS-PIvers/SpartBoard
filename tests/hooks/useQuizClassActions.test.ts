import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { updateDoc } from 'firebase/firestore';
import type { PeriodAccess, QuizAssignment } from '@/types';
import { useQuizClassActions } from '@/hooks/useQuizClassActions';

const calls: string[] = [];
const periods = {
  startPeriod: vi.fn((k: string) => {
    calls.push(`start:${k}`);
    return Promise.resolve([]);
  }),
  reopenPeriod: vi.fn((k: string) => {
    calls.push(`reopen:${k}`);
    return Promise.resolve([]);
  }),
  pausePeriod: vi.fn((k: string) => {
    calls.push(`pause:${k}`);
    return Promise.resolve();
  }),
  closePeriod: vi.fn((k: string) => {
    calls.push(`close:${k}`);
    return Promise.resolve();
  }),
  closeAllPeriods: vi.fn(() => {
    calls.push('closeAll');
    return Promise.resolve();
  }),
};
const periodSession = vi.fn();
vi.mock('@/hooks/usePeriodAccess', () => ({
  usePeriodAccess: (session: unknown) => {
    periodSession(session);
    return periods;
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  updateDoc: vi.fn((_ref: string, fields: Record<string, unknown>) => {
    calls.push(`mark:${JSON.stringify(fields)}`);
    return Promise.resolve();
  }),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' } }),
}));

const lifecycle = {
  pauseAssignment: vi.fn((id: string) => {
    calls.push(`status:pause:${id}`);
    return Promise.resolve();
  }),
  resumeAssignment: vi.fn((id: string) => {
    calls.push(`status:resume:${id}`);
    return Promise.resolve();
  }),
  deactivateAssignment: vi.fn((id: string) => {
    calls.push(`status:end:${id}`);
    return Promise.resolve();
  }),
  reopenAssignment: vi.fn((id: string) => {
    calls.push(`status:reopen:${id}`);
    return Promise.resolve();
  }),
};

const row = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});
const assignment = (over: Partial<QuizAssignment>): QuizAssignment =>
  ({
    id: 'a1',
    teacherUid: 't1',
    status: 'active',
    ...over,
  }) as QuizAssignment;

const run = async (
  a: QuizAssignment,
  fn: (x: ReturnType<typeof useQuizClassActions>) => Promise<unknown>
) => {
  const { result } = renderHook(() => useQuizClassActions(a, lifecycle, []));
  await act(async () => {
    await fn(result.current);
  });
};

describe('useQuizClassActions (D21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it('opening a class of a paused assignment opens the class, then makes it active', async () => {
    await run(
      assignment({ status: 'paused', periodAccess: { c1: row(), c2: row() } }),
      (x) => x.openClass('c1')
    );
    expect(calls).toEqual(['start:c1', 'status:resume:a1']);
  });

  it('leaves an active status alone when another class opens', async () => {
    await run(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } }),
      (x) => x.openClass('c2')
    );
    expect(calls).toEqual(['start:c2']);
  });

  it('closing one class while another is Ready keeps the run going', async () => {
    await run(
      assignment({
        periodAccess: { c1: row({ state: 'open' }), c2: row() },
      }),
      (x) => x.closeClass('c1')
    );
    expect(calls).toEqual(['close:c1']);
  });

  it('closing the last class not closed ends the run', async () => {
    await run(
      assignment({
        periodAccess: {
          c1: row({ state: 'open' }),
          c2: row({ closedAt: 5 }),
          c3: row({ state: 'open', closeAt: 1 }),
        },
      }),
      (x) => x.closeClass('c1')
    );
    expect(calls).toEqual(['close:c1', 'status:end:a1']);
  });

  it('D9: reopening a class of an ended run keeps the others closed and opens at once', async () => {
    await run(
      assignment({
        status: 'inactive',
        periodAccess: {
          c1: row({ closedAt: 5 }),
          c2: row({ state: 'open' }),
          c3: row({ closedAt: 6 }),
        },
      }),
      (x) => x.reopenClass('c1')
    );
    expect(calls).toEqual([
      'close:c2',
      'reopen:c1',
      'status:reopen:a1',
      'status:resume:a1',
    ]);
  });

  it('Close for all classes closes every class, then ends the run', async () => {
    await run(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } }),
      (x) => x.closeAll()
    );
    expect(calls).toEqual(['closeAll', 'status:end:a1']);
  });

  it('Move to Done closes every class, stamps doneAt, then ends the run', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(777);
    await run(
      assignment({ periodAccess: { c1: row({ state: 'open' }), c2: row() } }),
      (x) => x.moveToDone()
    );
    expect(calls).toEqual(['closeAll', 'mark:{"doneAt":777}', 'status:end:a1']);
    expect((updateDoc as Mock).mock.calls[0][0]).toBe(
      'users/t1/quiz_assignments/a1'
    );
    vi.restoreAllMocks();
  });

  it('a single-line assignment maps onto the whole-assignment status (D15)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(888);
    const single = assignment({});
    await run(single, (x) => x.closeClass(null));
    expect(periodSession).toHaveBeenCalledWith(null);
    expect(calls).toEqual(['mark:{"closedAt":888}', 'status:end:a1']);
    calls.length = 0;
    await run(assignment({ status: 'inactive', closedAt: 888 }), (x) =>
      x.reopenClass(null)
    );
    expect(calls).toEqual([
      'mark:{"closedAt":null,"doneAt":null}',
      'status:reopen:a1',
      'status:resume:a1',
    ]);
    calls.length = 0;
    await run(single, (x) => x.pauseClass(null));
    expect(calls).toEqual(['status:pause:a1']);
    vi.restoreAllMocks();
  });
});
