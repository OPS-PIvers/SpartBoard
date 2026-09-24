import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';

const DELETE = Symbol('deleteField');

// Minimal in-memory Firestore: setDoc honours { merge } and deleteField().
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  driveSaves: [] as { set: unknown; existingFileId?: string }[],
  driveFiles: new Map<string, unknown>(),
  driveInstances: 0,
  isAdmin: false,
  transactions: 0,
}));

vi.mock('firebase/firestore', () => {
  const write = (
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
  };
  const snapshot = (path: string) => ({
    exists: () => store.docs.has(path),
    data: () => store.docs.get(path),
  });
  return {
    collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
    doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
    query: (path: string) => path,
    orderBy: () => null,
    onSnapshot: () => () => undefined,
    getDoc: vi.fn((path: string) => Promise.resolve(snapshot(path))),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    deleteField: () => DELETE,
    setDoc: vi.fn(
      (
        path: string,
        data: Record<string, unknown>,
        options?: { merge?: boolean }
      ) => {
        write(path, data, options);
        return Promise.resolve();
      }
    ),
    runTransaction: vi.fn(
      async (
        _db: unknown,
        fn: (tx: {
          get: (path: string) => Promise<ReturnType<typeof snapshot>>;
          set: typeof write;
        }) => Promise<void>
      ) => {
        store.transactions += 1;
        await fn({
          get: (path) => Promise.resolve(snapshot(path)),
          set: write,
        });
      }
    ),
  };
});

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ googleAccessToken: 'token-1', isAdmin: store.isAdmin }),
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
    loadSet(fileId: string) {
      return Promise.resolve(store.driveFiles.get(fileId));
    }
    deleteSetFile() {
      return Promise.resolve();
    }
  },
}));

import { useGuidedLearning } from './useGuidedLearning';
import { GuidedLearningSaveConflictError } from '@/components/widgets/GuidedLearning/utils/saveConflict';

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
  store.driveFiles.clear();
  store.driveInstances = 0;
  store.isAdmin = false;
  store.transactions = 0;
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

describe('useGuidedLearning revision guard', () => {
  const BUILDING_PATH = 'building_guided_learning/set-1';

  it('saves a building set whose stored revision matches, keeping the editor stamp', async () => {
    store.isAdmin = true;
    store.docs.set(BUILDING_PATH, { id: 'set-1', updatedAt: 100 });
    const { result } = renderHook(() => useGuidedLearning('u1'));
    await act(async () => {
      await result.current.saveBuildingSet(
        buildSet({ title: 'Mine', updatedAt: 200 }),
        { expectedUpdatedAt: 100 }
      );
    });
    expect(store.transactions).toBe(1);
    expect(store.docs.get(BUILDING_PATH)).toMatchObject({
      title: 'Mine',
      updatedAt: 200,
    });
  });

  it('refuses a building save when another tab saved since the load, and offers their version', async () => {
    store.isAdmin = true;
    store.docs.set(BUILDING_PATH, {
      ...buildSet({ title: 'Theirs' }),
      updatedAt: 150,
    });
    const { result } = renderHook(() => useGuidedLearning('u1'));
    let caught: unknown;
    await act(async () => {
      await result.current
        .saveBuildingSet(buildSet({ title: 'Mine', updatedAt: 200 }), {
          expectedUpdatedAt: 100,
        })
        .catch((err: unknown) => {
          caught = err;
        });
    });
    expect(caught).toBeInstanceOf(GuidedLearningSaveConflictError);
    expect(store.docs.get(BUILDING_PATH)?.title).toBe('Theirs');
    const latest = await (
      caught as GuidedLearningSaveConflictError
    ).loadLatest();
    expect(latest.set.title).toBe('Theirs');
    expect(latest.updatedAt).toBe(150);
  });

  it('overwrites when the guard carries no expected revision', async () => {
    store.isAdmin = true;
    store.docs.set(BUILDING_PATH, { title: 'Theirs', updatedAt: 150 });
    const { result } = renderHook(() => useGuidedLearning('u1'));
    await act(async () => {
      await result.current.saveBuildingSet(
        buildSet({ title: 'Mine', updatedAt: 200 }),
        { expectedUpdatedAt: undefined }
      );
    });
    expect(store.docs.get(BUILDING_PATH)).toMatchObject({
      title: 'Mine',
      updatedAt: 200,
    });
  });

  it('checks the personal metadata revision before touching Drive', async () => {
    store.docs.set(META_PATH, {
      id: 'set-1',
      driveFileId: 'drive-file-1',
      updatedAt: 150,
    });
    store.driveFiles.set('drive-file-1', buildSet({ title: 'Theirs' }));
    const { result } = renderHook(() => useGuidedLearning('u1'));
    let caught: unknown;
    await act(async () => {
      await result.current
        .saveSet(buildSet({ title: 'Mine', updatedAt: 200 }), 'drive-file-1', {
          expectedUpdatedAt: 100,
        })
        .catch((err: unknown) => {
          caught = err;
        });
    });
    expect(caught).toBeInstanceOf(GuidedLearningSaveConflictError);
    expect(store.driveSaves).toHaveLength(0);
    const latest = await (
      caught as GuidedLearningSaveConflictError
    ).loadLatest();
    expect(latest).toMatchObject({ set: { title: 'Theirs' }, updatedAt: 150 });
  });

  it('writes a guarded personal save in a transaction with the editor stamp in both places', async () => {
    store.docs.set(META_PATH, {
      id: 'set-1',
      driveFileId: 'drive-file-1',
      folderId: 'folder-a',
      updatedAt: 100,
    });
    const { result } = renderHook(() => useGuidedLearning('u1'));
    await act(async () => {
      await result.current.saveSet(
        buildSet({ title: 'Mine', updatedAt: 200 }),
        'drive-file-1',
        { expectedUpdatedAt: 100 }
      );
    });
    expect(store.transactions).toBe(1);
    expect(store.driveSaves[0].set).toMatchObject({ updatedAt: 200 });
    expect(store.docs.get(META_PATH)).toMatchObject({
      title: 'Mine',
      updatedAt: 200,
      folderId: 'folder-a',
    });
  });
});
