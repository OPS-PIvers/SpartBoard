import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteFile = vi.fn().mockResolvedValue(undefined);
const groupGet = vi.fn();
const buildingGet = vi.fn();

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collectionGroup: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: groupGet })) })),
    })),
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: buildingGet })) })),
    })),
  })),
  storage: vi.fn(() => ({
    bucket: vi.fn(() => ({ file: vi.fn(() => ({ delete: deleteFile })) })),
  })),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: vi.fn((_path: unknown, handler: unknown) => handler),
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import {
  readImagePaths,
  gcOrphanedSlidePaths,
  gcGuidedLearningMedia,
} from './gcGuidedLearningMedia';

const empty = { empty: true };
const hit = { empty: false };

beforeEach(() => {
  deleteFile.mockClear();
  groupGet.mockReset();
  buildingGet.mockReset();
});

describe('readImagePaths', () => {
  it('keeps unique non-empty string paths only', () => {
    expect(
      readImagePaths({ imagePaths: ['a', '', 'a', 3, null, 'b'] })
    ).toEqual(['a', 'b']);
    expect(readImagePaths({})).toEqual([]);
    expect(readImagePaths(undefined)).toEqual([]);
  });
});

describe('gcOrphanedSlidePaths', () => {
  it('deletes paths no remaining set references', async () => {
    groupGet.mockResolvedValue(empty);
    buildingGet.mockResolvedValue(empty);
    const deleted = await gcOrphanedSlidePaths(['u/1.png', 'u/2.png']);
    expect(deleted).toEqual(['u/1.png', 'u/2.png']);
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('keeps a path a duplicate personal set still lists', async () => {
    groupGet.mockResolvedValue(hit);
    buildingGet.mockResolvedValue(empty);
    expect(await gcOrphanedSlidePaths(['u/shared.png'])).toEqual([]);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('keeps a path a building set still lists', async () => {
    groupGet.mockResolvedValue(empty);
    buildingGet.mockResolvedValue(hit);
    expect(await gcOrphanedSlidePaths(['u/shared.png'])).toEqual([]);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('continues past a failing path', async () => {
    groupGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(empty);
    buildingGet.mockResolvedValue(empty);
    expect(await gcOrphanedSlidePaths(['u/bad.png', 'u/ok.png'])).toEqual([
      'u/ok.png',
    ]);
  });
});

describe('gcGuidedLearningMedia trigger', () => {
  it('reads imagePaths off the deleted metadata doc', async () => {
    groupGet.mockResolvedValue(empty);
    buildingGet.mockResolvedValue(empty);
    const handler = gcGuidedLearningMedia as unknown as (
      e: unknown
    ) => Promise<void>;
    await handler({
      params: { uid: 'u', setId: 's' },
      data: { data: () => ({ imagePaths: ['u/x.png'] }) },
    });
    expect(deleteFile).toHaveBeenCalledOnce();
  });
});
