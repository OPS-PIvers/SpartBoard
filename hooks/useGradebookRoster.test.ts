import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import type { ClassRoster } from '@/types';
import {
  resetGradebookRosterCache,
  useGradebookRoster,
} from './useGradebookRoster';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('@/config/firebase', () => ({
  functions: {},
  auth: { currentUser: { uid: 'teacher-1' } },
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const roster = (extra: Partial<ClassRoster>): ClassRoster => ({
  id: 'r1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 1,
  createdAt: 0,
  students: [
    {
      id: 's1',
      firstName: 'Ada',
      lastName: 'L',
      pin: '',
      classLinkSourcedId: 'sid-1',
    },
  ],
  ...extra,
});

describe('useGradebookRoster', () => {
  const mockHttpsCallable = httpsCallable as Mock;
  let call: Mock;

  beforeEach(() => {
    resetGradebookRosterCache();
    call = vi.fn(() =>
      Promise.resolve({
        data: {
          students: [{ refKey: 'classlink:sid-1', studentUid: 'uid-1' }],
        },
      })
    );
    mockHttpsCallable.mockReturnValue(call);
  });

  it('stays idle without the flag or for a local roster', () => {
    const off = renderHook(() =>
      useGradebookRoster(roster({ classlinkClassId: 'c1' }), false)
    );
    const local = renderHook(() => useGradebookRoster(roster({}), true));
    expect(off.result.current.status).toBe('idle');
    expect(local.result.current.status).toBe('idle');
    expect(call).not.toHaveBeenCalled();
  });

  it('resolves uids once per roster and shares the cached call', async () => {
    const r = roster({ classlinkClassId: 'c1' });
    const a = renderHook(() => useGradebookRoster(r, true));
    const b = renderHook(() => useGradebookRoster(r, true));
    expect(a.result.current.status).toBe('loading');
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(a.result.current.studentUidByStudentId.get('s1')).toBe('uid-1');
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith({ rosterId: 'r1' });
  });

  it('reports an error and retries on the next mount', async () => {
    call.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    const r = roster({ classlinkClassId: 'c1' });
    const first = renderHook(() => useGradebookRoster(r, true));
    await waitFor(() => expect(first.result.current.status).toBe('error'));
    const second = renderHook(() => useGradebookRoster(r, true));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(call).toHaveBeenCalledTimes(2);
  });
});
