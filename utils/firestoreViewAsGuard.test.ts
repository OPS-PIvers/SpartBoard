import { beforeEach, describe, expect, it, vi } from 'vitest';

const blocks = vi.hoisted(() => ({ value: false }));
const real = vi.hoisted(() => ({
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new' })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  runTransaction: vi.fn(() => Promise.resolve('done')),
  commit: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  setDoc: real.setDoc,
  updateDoc: real.updateDoc,
  addDoc: real.addDoc,
  deleteDoc: real.deleteDoc,
  runTransaction: real.runTransaction,
  writeBatch: () => ({ commit: real.commit, set: vi.fn() }),
  doc: vi.fn(),
}));

vi.mock('@/utils/viewAsTab', () => ({
  ViewAsReadOnlyError: class ViewAsReadOnlyError extends Error {},
  viewAsBlocksRawWrite: () => blocks.value,
}));

import * as guard from './firestoreViewAsGuard';

describe('firestoreViewAsGuard', () => {
  beforeEach(() => {
    blocks.value = false;
    vi.clearAllMocks();
  });

  it('passes writes through when the guard allows them', async () => {
    const db = {} as never;
    await guard.setDoc({} as never, {});
    await guard.updateDoc({} as never, {});
    await guard.addDoc({} as never, {});
    await guard.deleteDoc({} as never);
    await guard.runTransaction(db, () => Promise.resolve());
    await guard.writeBatch(db).commit();
    expect(real.setDoc).toHaveBeenCalledTimes(1);
    expect(real.updateDoc).toHaveBeenCalledTimes(1);
    expect(real.addDoc).toHaveBeenCalledTimes(1);
    expect(real.deleteDoc).toHaveBeenCalledTimes(1);
    expect(real.runTransaction).toHaveBeenCalledTimes(1);
    expect(real.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects every write kind without calling Firestore when blocked', async () => {
    blocks.value = true;
    const db = {} as never;
    await expect(guard.setDoc({} as never, {})).rejects.toThrow();
    await expect(guard.updateDoc({} as never, {})).rejects.toThrow();
    await expect(guard.addDoc({} as never, {})).rejects.toThrow();
    await expect(guard.deleteDoc({} as never)).rejects.toThrow();
    await expect(
      guard.runTransaction(db, () => Promise.resolve())
    ).rejects.toThrow();
    await expect(guard.writeBatch(db).commit()).rejects.toThrow();
    expect(real.setDoc).not.toHaveBeenCalled();
    expect(real.runTransaction).not.toHaveBeenCalled();
    expect(real.commit).not.toHaveBeenCalled();
  });

  it('re-exports the rest of the Firestore API', () => {
    expect(guard.doc).toBeDefined();
  });
});
