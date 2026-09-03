import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityWallConfig } from '@/types';

const mockGetDocs = vi.fn(() => Promise.resolve({ docs: [] }));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: (...args: unknown[]) => mockGetDocs(...(args as [])),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
}));

import { useLegacyActivityWallMigration } from './useLegacyActivityWallMigration';

const emptyConfig: ActivityWallConfig = {};

const renderMigration = (libraryCount: number) =>
  renderHook(
    ({ count }: { count: number }) =>
      useLegacyActivityWallMigration({
        uid: 'teacher-1',
        config: emptyConfig,
        widgetId: 'w1',
        libraryLoading: false,
        libraryCount: count,
        saveActivity: vi.fn(() => Promise.resolve()),
        clearLegacyActivities: vi.fn(),
        addToast: vi.fn(),
      }),
    { initialProps: { count: libraryCount } }
  );

describe('useLegacyActivityWallMigration recovery', () => {
  beforeEach(() => {
    mockGetDocs.mockClear();
    localStorage.clear();
  });

  it('never queries sessions once a wall has been observed in the library', () => {
    const { rerender } = renderMigration(1);
    expect(mockGetDocs).not.toHaveBeenCalled();

    // Deleting the last wall must not resurrect it from an orphaned session doc.
    rerender({ count: 0 });
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(localStorage.getItem('aw_library_recovery_v1_teacher-1')).toBe(
      'done'
    );
  });

  it('runs recovery once for a library that has never held a wall', () => {
    renderMigration(0);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('skips recovery when the per-uid flag is already set', () => {
    localStorage.setItem('aw_library_recovery_v1_teacher-1', 'done');
    renderMigration(0);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
