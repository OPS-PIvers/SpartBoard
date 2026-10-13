import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ storage: {}, db: {}, auth: {} }));
vi.mock('./useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null, userDomain: '' }),
}));

const resolvers: Array<() => void> = [];
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(
    (r: { path: string }) =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({ ref: r }));
      })
  ),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(() => Promise.resolve('url')),
  deleteObject: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn() }));

import { useStorage } from './useStorage';

describe('useStorage uploading flag', () => {
  it('stays true until every concurrent upload finishes', async () => {
    const { result } = renderHook(() => useStorage());
    const file = new File(['x'], 'a.png');
    let p1!: Promise<string>;
    let p2!: Promise<string>;
    act(() => {
      p1 = result.current.uploadSticker('u', file);
      p2 = result.current.uploadSticker('u', file);
    });
    await act(async () => {
      resolvers[0]();
      await p1;
    });
    expect(result.current.uploading).toBe(true);
    await act(async () => {
      resolvers[1]();
      await p2;
    });
    expect(result.current.uploading).toBe(false);
  });
});
