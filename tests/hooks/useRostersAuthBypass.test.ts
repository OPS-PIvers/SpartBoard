import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';
import { useRosters } from '@/hooks/useRosters';
import type { Student } from '@/types';

// VITE_AUTH_BYPASS swaps every Firestore/Drive path for an in-memory store.
// The real updateRoster prunes dangling group/override entries on any of the
// three roster-file fields; these tests pin the mock store to that same
// contract so the two can't drift.
vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
  isAuthBypass: true,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: {} }),
}));

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null }),
}));

const mockUser = { uid: 'teacher-1' } as User;

const student = (overrides: Partial<Student> = {}): Student => ({
  id: 's1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  pin: '01',
  ...overrides,
});

/** Seeds a roster with two students, a group, and per-student overrides. */
const seedRoster = async () => {
  const { result } = renderHook(() => useRosters(mockUser));
  let id = '';
  await act(async () => {
    id = await result.current.addRoster('Period 1', [
      student({ id: 's1' }),
      student({ id: 's2', firstName: 'Grace', pin: '02' }),
    ]);
  });
  await act(async () => {
    await result.current.updateRoster(id, {
      groups: [{ id: 'g1', name: 'Reds', studentIds: ['s1', 's2'] }],
      defaultOverridesByStudentId: {
        s1: { timeMultiplier: 2 },
        s2: { timeMultiplier: 1.5 },
      },
    });
  });
  // The mock store is a process-wide singleton, so assert on this roster by
  // id rather than on the collection length.
  await waitFor(() =>
    expect(result.current.rosters.find((r) => r.id === id)).toBeDefined()
  );
  return { result, id };
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useRosters — auth-bypass mock store', () => {
  it('prunes dangling group members and overrides when students are removed', async () => {
    const { result, id } = await seedRoster();

    await act(async () => {
      await result.current.updateRoster(id, {
        students: [student({ id: 's1' })],
      });
    });

    const roster = result.current.rosters.find((r) => r.id === id);
    expect(roster?.groups?.[0].studentIds).toEqual(['s1']);
    expect(roster?.defaultOverridesByStudentId).toEqual({
      s1: { timeMultiplier: 2 },
    });
  });

  it('prunes on a defaultOverridesByStudentId-only write, matching the real path', async () => {
    const { result, id } = await seedRoster();

    // No `students` and no `groups` in this write — the real updateRoster
    // still prunes here, so bypass mode must too.
    await act(async () => {
      await result.current.updateRoster(id, {
        defaultOverridesByStudentId: {
          s1: { timeMultiplier: 2 },
          ghost: { timeMultiplier: 1.5 },
        },
      });
    });

    const roster = result.current.rosters.find((r) => r.id === id);
    expect(
      Object.keys(roster?.defaultOverridesByStudentId ?? {})
    ).not.toContain('ghost');
    expect(roster?.defaultOverridesByStudentId).toEqual({
      s1: { timeMultiplier: 2 },
    });
  });
});
