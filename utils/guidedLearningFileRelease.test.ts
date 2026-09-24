import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';

// In-memory Firestore: paths are joined segments, queries filter on one equality.
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  callable: vi.fn(),
}));

vi.mock('firebase/firestore', () => {
  const docsUnder = (path: string) =>
    [...store.docs.entries()]
      .filter(([p]) => {
        const rest = p.slice(path.length + 1);
        return p.startsWith(`${path}/`) && !rest.includes('/');
      })
      .map(([p, data]) => ({
        id: p.split('/').pop() ?? '',
        ref: p,
        data: () => data,
      }));
  return {
    collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
    doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    query: (path: string, filter: { field: string; value: unknown }) => ({
      path,
      filter,
    }),
    getDocs: (
      q: string | { path: string; filter: { field: string; value: unknown } }
    ) =>
      Promise.resolve({
        docs:
          typeof q === 'string'
            ? docsUnder(q)
            : docsUnder(q.path).filter(
                (d) => d.data()[q.filter.field] === q.filter.value
              ),
      }),
    getDoc: (path: string) =>
      Promise.resolve({
        exists: () => store.docs.has(path),
        data: () => store.docs.get(path),
      }),
    setDoc: (path: string, data: Record<string, unknown>) => {
      store.docs.set(path, data);
      return Promise.resolve();
    },
    deleteDoc: (path: string) => {
      store.docs.delete(path);
      return Promise.resolve();
    },
  };
});
vi.mock('firebase/functions', () => ({
  httpsCallable: () => store.callable,
}));
vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: 't1', email: 't1@example.com' } },
}));

import {
  MAX_LEGACY_SET_LOADS,
  releaseClosedTombstones,
  releaseStorageFiles,
  unreferencedDriveIds,
  writeTombstone,
} from './guidedLearningFileRelease';

const lh3 = (id: string) => `https://lh3.googleusercontent.com/d/${id}`;
const setDoc = (path: string, data: Record<string, unknown>) =>
  store.docs.set(path, data);

beforeEach(() => {
  store.docs.clear();
  store.callable.mockReset().mockResolvedValue({ data: { deleted: 0 } });
});

describe('unreferencedDriveIds', () => {
  it('keeps ids another of the teacher’s sets lists, ignoring the deleted set', async () => {
    setDoc('users/t1/guided_learning/gone', { driveFileIds: ['a', 'b'] });
    setDoc('users/t1/guided_learning/dup', { driveFileIds: ['a'] });
    expect(
      await unreferencedDriveIds({
        uid: 't1',
        candidates: ['a', 'b'],
        excludeSetId: 'gone',
        isAdmin: false,
      })
    ).toEqual(['b']);
  });

  it('reads sets saved before ids were recorded from Drive', async () => {
    setDoc('users/t1/guided_learning/old', { driveFileId: 'json-1' });
    const loadSet = vi.fn().mockResolvedValue({
      imageUrls: [lh3('a')],
    } as Partial<GuidedLearningSet>);
    expect(
      await unreferencedDriveIds({
        uid: 't1',
        candidates: ['a', 'b'],
        isAdmin: false,
        loadSet,
      })
    ).toEqual(['b']);
    expect(loadSet).toHaveBeenCalledWith('json-1');
  });

  it('releases nothing when unrecorded sets cannot all be checked', async () => {
    setDoc('users/t1/guided_learning/old', { driveFileId: 'json-1' });
    expect(
      await unreferencedDriveIds({
        uid: 't1',
        candidates: ['a'],
        isAdmin: false,
      })
    ).toEqual([]);
    for (let i = 0; i < MAX_LEGACY_SET_LOADS + 1; i++)
      setDoc(`users/t1/guided_learning/old${i}`, { driveFileId: `j${i}` });
    const loadSet = vi.fn();
    expect(
      await unreferencedDriveIds({
        uid: 't1',
        candidates: ['a'],
        isAdmin: false,
        loadSet,
      })
    ).toEqual([]);
    expect(loadSet).not.toHaveBeenCalled();
  });

  it('keeps ids a tombstone, a sub-share bundle or (for admins) a Help Center set holds', async () => {
    setDoc('users/t1/gl_media_tombstones/x', { driveFileIds: ['a'] });
    setDoc('shared_collections/sh1', { hostUid: 't1' });
    setDoc('shared_collections/sh1/keys/guidedLearning_y', {
      kind: 'guidedLearning',
      payload: { set: { imageUrls: [lh3('b')] } },
    });
    setDoc('building_guided_learning/hc', { imageUrls: [lh3('c')] });
    const check = { uid: 't1', candidates: ['a', 'b', 'c', 'd'] };
    expect(await unreferencedDriveIds({ ...check, isAdmin: false })).toEqual([
      'c',
      'd',
    ]);
    expect(await unreferencedDriveIds({ ...check, isAdmin: true })).toEqual([
      'd',
    ]);
  });
});

describe('tombstones', () => {
  const deleteDriveFile = vi.fn();
  beforeEach(() => {
    deleteDriveFile.mockReset().mockResolvedValue(undefined);
  });

  const hold = () =>
    writeTombstone('t1', {
      setId: 'gone',
      storagePaths: ['users/t1/hotspot_images/1.webp'],
      driveFileIds: ['a', 'shared'],
      assignmentIds: ['as1', 'as2'],
      createdAt: 1,
    });

  it('holds files while any listed assignment is open', async () => {
    await hold();
    setDoc('users/t1/guided_learning_assignments/as1', { status: 'archived' });
    setDoc('users/t1/guided_learning_assignments/as2', { status: 'active' });
    expect(await releaseClosedTombstones('t1', deleteDriveFile)).toBe(0);
    expect(deleteDriveFile).not.toHaveBeenCalled();
    expect(store.docs.has('users/t1/gl_media_tombstones/gone')).toBe(true);
  });

  it('releases unreferenced Drive files and the tombstone once every assignment closes', async () => {
    await hold();
    setDoc('users/t1/guided_learning_assignments/as1', { status: 'archived' });
    setDoc('users/t1/guided_learning/dup', { driveFileIds: ['shared'] });
    expect(
      await releaseClosedTombstones('t1', deleteDriveFile, { isAdmin: false })
    ).toBe(1);
    expect(deleteDriveFile.mock.calls).toEqual([['a']]);
    expect(store.docs.has('users/t1/gl_media_tombstones/gone')).toBe(false);
  });

  it('keeps the tombstone when a Drive delete fails', async () => {
    await hold();
    deleteDriveFile.mockImplementation(() =>
      Promise.reject(new Error('offline'))
    );
    await releaseClosedTombstones('t1', deleteDriveFile, { isAdmin: false });
    expect(store.docs.has('users/t1/gl_media_tombstones/gone')).toBe(true);
  });
});

describe('releaseStorageFiles', () => {
  it('asks the server to release de-duplicated paths, and swallows failures', async () => {
    await releaseStorageFiles('s1', false, ['p', 'p', 'q']);
    expect(store.callable).toHaveBeenCalledWith({
      setId: 's1',
      building: false,
      paths: ['p', 'q'],
    });
    store.callable.mockRejectedValue(new Error('not deployed'));
    await expect(releaseStorageFiles('s1', true, ['p'])).resolves.toBe(
      undefined
    );
  });

  it('makes no call without paths', async () => {
    await releaseStorageFiles('s1', false, []);
    expect(store.callable).not.toHaveBeenCalled();
  });
});
