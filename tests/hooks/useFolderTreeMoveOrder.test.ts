import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const updates = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: (_ref: unknown, data: Record<string, unknown>) =>
      updates.push(data),
    commit: () => Promise.resolve(),
  })),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

import { useFolders } from '@/hooks/useFolders';

describe('useFolderTree moveFolder order', () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it('gives back-to-back moves into one parent distinct, increasing order', async () => {
    const { result } = renderHook(() => useFolders('u1', 'quiz'));
    const { moveFolder } = result.current;
    await moveFolder('a', 'p');
    await moveFolder('b', 'p');
    await moveFolder('c', 'p');
    expect(updates.map((u) => u.order)).toEqual([0, 1, 2]);
  });
});
