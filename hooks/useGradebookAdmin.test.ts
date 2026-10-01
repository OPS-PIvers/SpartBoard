import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const setDoc = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  deleteDoc: vi.fn(),
  onSnapshot: () => () => undefined,
  query: (ref: unknown) => ref,
  setDoc: (...args: unknown[]) => setDoc(...args),
  where: () => null,
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ orgId: null, user: null }),
}));
vi.mock('@/hooks/useGradingPeriods', () => ({
  useGradingPeriodSets: () => ({ sets: [], loading: false }),
}));

import { useGradebookAdmin } from './useGradebookAdmin';

describe('useGradebookAdmin', () => {
  it('saves every level plus the three-level fields older clients read', async () => {
    const { result } = renderHook(() => useGradebookAdmin());
    await result.current.saveScale({
      levels: [
        { name: 'Exceeds', min: 90, color: 'blue' },
        { name: 'Meets', min: 75, color: 'emerald' },
        { name: 'Near', min: 50, color: 'amber' },
        { name: 'Below', min: 0, color: 'rose' },
      ],
    });
    expect(setDoc).toHaveBeenCalledWith(
      'admin_settings/gradebook',
      expect.objectContaining({
        levels: [
          { name: 'Exceeds', min: 90, color: 'blue' },
          { name: 'Meets', min: 75, color: 'emerald' },
          { name: 'Near', min: 50, color: 'amber' },
          { name: 'Below', min: 0, color: 'rose' },
        ],
        proficient: 90,
        approaching: 75,
        levelNames: ['Exceeds', 'Meets', 'Below'],
      })
    );
  });
});
