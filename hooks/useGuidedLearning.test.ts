import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';

const DELETE = Symbol('deleteField');

// Minimal in-memory Firestore: setDoc honours { merge } and deleteField().
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  driveSaves: [] as { set: unknown; existingFileId?: string }[],
  driveInstances: 0,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  query: (path: string) => path,
  orderBy: () => null,
  onSnapshot: () => () => undefined,
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: () => DELETE,
  setDoc: vi.fn(
    (
      path: string,
      data: Record<string, unknown>,
      options?: { merge?: boolean }
    ) => {
      const next: Record<string, unknown> = options?.merge
        ? { ...(store.docs.get(path) ?? {}) }
        : {};
      for (const [key, value] of Object.entries(data)) {
        if (value === DELETE) delete next[key];
        else if (value !== undefined) next[key] = value;
      }
      store.docs.set(path, next);
      return Promise.resolve();
    }
  ),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ googleAccessToken: 'token-1', isAdmin: false }),
}));

vi.mock('./useGoogleDrive', () => ({
  useGoogleDrive: () => ({ isConnected: true }),
}));

vi.mock('@/utils/guidedLearningDriveService', () => ({
  GuidedLearningDriveService: class {
    constructor() {
      store.driveInstances += 1;
    }
    saveSet(set: unknown, existingFileId?: string) {
      store.driveSaves.push({ set, existingFileId });
      return Promise.resolve(existingFileId ?? 'drive-file-1');
    }
    loadSet() {
      return Promise.reject(new Error('unused'));
    }
    deleteSetFile() {
      return Promise.resolve();
    }
  },
}));

import { useGuidedLearning } from './useGuidedLearning';

const META_PATH = 'users/u1/guided_learning/set-1';

const buildSet = (
  overrides: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Cells',
  imageUrls: ['https://example.com/a.png'],
  steps: [],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

beforeEach(() => {
  store.docs.clear();
  store.driveSaves = [];
  store.driveInstances = 0;
});

describe('useGuidedLearning.saveSet', () => {
  it('keeps a set in its folder and its manual order across three autosaves', async () => {
    store.docs.set(META_PATH, {
      id: 'set-1',
      title: 'Cells',
      driveFileId: 'drive-file-1',
      folderId: 'folder-a',
      order: 4,
    });
    const { result } = renderHook(() => useGuidedLearning('u1'));

    for (const title of ['Cells 1', 'Cells 2', 'Cells 3']) {
      await act(async () => {
        await result.current.saveSet(buildSet({ title }), 'drive-file-1');
      });
    }

    const meta = store.docs.get(META_PATH);
    expect(meta?.title).toBe('Cells 3');
    expect(meta?.folderId).toBe('folder-a');
    expect(meta?.order).toBe(4);
  });

  it('clears description and imagePaths the set no longer has', async () => {
    store.docs.set(META_PATH, {
      description: 'old',
      imagePaths: ['gl/old.png'],
      folderId: 'folder-a',
    });
    const { result } = renderHook(() => useGuidedLearning('u1'));

    await act(async () => {
      await result.current.saveSet(buildSet(), 'drive-file-1');
    });

    const meta = store.docs.get(META_PATH);
    expect(meta).not.toHaveProperty('description');
    expect(meta).not.toHaveProperty('imagePaths');
    expect(meta?.folderId).toBe('folder-a');
  });

  it('writes imagePaths and an unknown top-level field through to Drive', async () => {
    const { result } = renderHook(() => useGuidedLearning('u1'));
    const set = {
      ...buildSet({ imagePaths: ['gl/a.png'] }),
      futureField: { kept: true },
    } as GuidedLearningSet;

    await act(async () => {
      await result.current.saveSet(set, 'drive-file-1');
    });

    expect(store.driveSaves[0].set).toMatchObject({
      imagePaths: ['gl/a.png'],
      futureField: { kept: true },
    });
    expect(store.docs.get(META_PATH)?.imagePaths).toEqual(['gl/a.png']);
  });

  it('reuses one Drive service per token across saves', async () => {
    const { result, rerender } = renderHook(() => useGuidedLearning('u1'));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.saveSet(buildSet(), 'drive-file-1');
      });
      rerender();
    }
    expect(store.driveInstances).toBe(1);
  });
});

describe('useGuidedLearning.saveSet file refs', () => {
  const DRIVE_A = 'https://lh3.googleusercontent.com/d/drive-a';
  const STORAGE_B =
    'https://firebasestorage.googleapis.com/v0/b/bkt/o/users%2Fu1%2Fhotspot_images%2F2-b.webp?alt=media&token=t';
  const THUMB_B =
    'https://firebasestorage.googleapis.com/v0/b/bkt/o/users%2Fu1%2Fhotspot_images%2Fthumbs%2F2-b.webp?alt=media&token=u';

  it('records each Drive slide id and every Storage path, thumbnails included', async () => {
    const { result } = renderHook(() => useGuidedLearning('u1'));
    await act(async () => {
      await result.current.saveSet(
        buildSet({
          imageUrls: [DRIVE_A, STORAGE_B],
          slideThumbnails: { [STORAGE_B]: THUMB_B, 'gone-url': 'gone-thumb' },
        }),
        'drive-file-1'
      );
    });
    const meta = store.docs.get(META_PATH);
    expect(meta?.driveFileIds).toEqual(['drive-a']);
    expect(meta?.imagePaths).toEqual([
      'users/u1/hotspot_images/2-b.webp',
      'users/u1/hotspot_images/thumbs/2-b.webp',
    ]);
    expect(store.driveSaves[0].set).toMatchObject({
      driveFileIds: ['drive-a'],
      slideThumbnails: { [STORAGE_B]: THUMB_B },
    });
    expect(meta?.imageUrl).toBe(`${DRIVE_A}=w400`);
  });

  it('keeps driveFileIds across autosaves and clears them once no Drive slide is left', async () => {
    const { result } = renderHook(() => useGuidedLearning('u1'));
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await result.current.saveSet(
          buildSet({ imageUrls: [DRIVE_A], title: `T${i}` }),
          'drive-file-1'
        );
      });
      expect(store.docs.get(META_PATH)?.driveFileIds).toEqual(['drive-a']);
    }
    await act(async () => {
      await result.current.saveSet(buildSet(), 'drive-file-1');
    });
    expect(store.docs.get(META_PATH)).not.toHaveProperty('driveFileIds');
  });
});
