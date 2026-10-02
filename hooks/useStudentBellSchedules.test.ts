import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  impl: (): Promise<unknown> => Promise.resolve({ data: () => undefined }),
  reads: 0,
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: () => {
    fs.reads += 1;
    return fs.impl();
  },
}));

import { useStudentBellSchedules } from './useStudentBellSchedules';

const config = {
  buildingDefaults: { oms: { buildingId: 'oms', items: [], schedules: [] } },
};

describe('useStudentBellSchedules', () => {
  it('does not read until enabled', () => {
    const { result } = renderHook(() => useStudentBellSchedules(false));
    expect(result.current.status).toBe('ready');
    expect(result.current.scheduleFor('oms')).toBeNull();
    expect(fs.reads).toBe(0);
  });

  it('reads the building schedule once and caches it', async () => {
    fs.impl = () => Promise.resolve({ data: () => ({ config }) });
    const first = renderHook(() => useStudentBellSchedules(true));
    expect(first.result.current.status).toBe('loading');
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(first.result.current.scheduleFor('oms')?.buildingId).toBe('oms');
    expect(first.result.current.scheduleFor('other')).toBeNull();

    const second = renderHook(() => useStudentBellSchedules(true));
    expect(second.result.current.status).toBe('ready');
    expect(fs.reads).toBe(1);
  });
});
