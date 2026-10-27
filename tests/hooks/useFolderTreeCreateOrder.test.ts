import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const addDocMock = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
  addDoc: addDocMock,
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

import { useFolders } from '@/hooks/useFolders';

describe('useFolderTree createFolder order', () => {
  beforeEach(() => {
    addDocMock.mockReset();
    let n = 0;
    addDocMock.mockImplementation(() =>
      Promise.resolve({ id: `f${(n += 1)}` })
    );
  });

  it('gives back-to-back siblings distinct, increasing order', async () => {
    const { result } = renderHook(() => useFolders('u1', 'quiz'));
    const { createFolder } = result.current;
    await createFolder('A', null);
    await createFolder('B', null);
    await createFolder('C', null);
    const orders = addDocMock.mock.calls.map(
      (c) => (c[1] as { order: number }).order
    );
    expect(orders).toEqual([0, 1, 2]);
  });
});
