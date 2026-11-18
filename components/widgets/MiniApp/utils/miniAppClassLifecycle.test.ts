import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDoc } from 'firebase/firestore';
import { miniAppLifecycle } from './miniAppClassLifecycle';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

const endAssignment = vi.fn(() => Promise.resolve());
const reactivateAssignment = vi.fn(() => Promise.resolve());
const setAssignmentTargets = vi.fn(() =>
  Promise.resolve({ written: 0, removed: 0, skipped: [] })
);
const make = () =>
  miniAppLifecycle('t1', {
    endAssignment,
    reactivateAssignment,
    setAssignmentTargets,
  });
const row = (data: Record<string, unknown> | undefined) =>
  (getDoc as Mock).mockResolvedValue({ data: () => data });

beforeEach(() => vi.clearAllMocks());

describe('miniAppLifecycle', () => {
  it('End and Reopen drive the existing end and reactivate writes by assignment id', async () => {
    const lc = make();
    await lc.end('row-1');
    await lc.reopen('row-1');
    expect(endAssignment).toHaveBeenCalledWith('row-1');
    expect(reactivateAssignment).toHaveBeenCalledWith('row-1');
  });

  it('has no turn-in or run-wide pause, and reads inactive as ended', () => {
    const lc = make();
    expect(lc).not.toHaveProperty('turnInClass');
    expect(lc).not.toHaveProperty('pause');
    expect(lc.isEnded({ status: 'inactive' })).toBe(true);
    expect(lc.isEnded({ status: 'active' })).toBe(false);
  });

  it('rewrites student pointers by session id when a cleared window has them', async () => {
    row({
      sessionId: 'sess-1',
      targetMode: 'students',
      targetStudents: [{ sourcedId: 's1' }],
    });
    await make().onWindowCleared('row-1', { closeAt: null });
    expect(getDoc).toHaveBeenCalledWith('users/t1/miniapp_assignments/row-1');
    expect(setAssignmentTargets).toHaveBeenCalledWith({
      assignmentId: 'row-1',
      kind: 'mini-app',
      sessionId: 'sess-1',
      targetMode: 'students',
      add: [],
      remove: [],
      overridesBySourcedId: {},
      window: { closeAt: null },
    });
  });

  it('skips the call for a class-wide run or a missing row', async () => {
    row({ sessionId: 'sess-1', targetMode: 'class' });
    await make().onWindowCleared('row-1', { closeAt: null });
    row(undefined);
    await make().onWindowCleared('row-1', { openAt: null });
    expect(setAssignmentTargets).not.toHaveBeenCalled();
  });
});
