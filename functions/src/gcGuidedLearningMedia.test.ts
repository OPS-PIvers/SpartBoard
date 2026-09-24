import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeBucket, createFakeDb } from './glMediaTestFakes';

const state = vi.hoisted(() => ({
  db: null as unknown,
  bucket: null as unknown,
}));

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => state.db),
  storage: vi.fn(() => ({ bucket: vi.fn(() => state.bucket) })),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentDeleted: vi.fn((_opts: unknown, handler: unknown) => handler),
  onDocumentWritten: vi.fn((_opts: unknown, handler: unknown) => handler),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
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
  gcBuildingGuidedLearningMedia,
  releaseGuidedLearningMediaV1,
} from './gcGuidedLearningMedia';

const P1 = 'users/t1/hotspot_images/1-a.webp';
const P2 = 'users/t1/hotspot_images/2-b.webp';
const url = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media&token=t`;

let bucket: ReturnType<typeof createFakeBucket>;
function setup(docs: Record<string, Record<string, unknown>>) {
  state.db = createFakeDb(docs);
  bucket = createFakeBucket([]);
  state.bucket = bucket;
}

type Handler = (e: unknown) => Promise<unknown>;
const run = (fn: unknown, e: unknown) => (fn as Handler)(e);

beforeEach(() => setup({}));

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
    expect(await gcOrphanedSlidePaths([P1, P2])).toEqual([P1, P2]);
    expect(bucket.deleted).toEqual([P1, P2]);
  });

  it('keeps a path a duplicate personal set still lists', async () => {
    setup({
      'users/t1/guided_learning/dup': { imagePaths: [P1], driveFileIds: [] },
    });
    expect(await gcOrphanedSlidePaths([P1, P2])).toEqual([P2]);
  });

  it('never deletes a file uploaded before GL uploads were marked', async () => {
    state.bucket = bucket = createFakeBucket([
      { name: P1, timeCreated: '', marked: false },
    ]);
    expect(await gcOrphanedSlidePaths([P1, P2])).toEqual([P2]);
    expect(bucket.deleted).toEqual([P2]);
  });

  it('keeps every file of an owner with a set an older client saved', async () => {
    setup({
      'users/t1/guided_learning/old': { imagePaths: [] },
      'users/t2/guided_learning/new': { driveFileIds: [] },
    });
    const P3 = 'users/t2/hotspot_images/3-c.webp';
    expect(await gcOrphanedSlidePaths([P1, P3])).toEqual([P3]);
  });

  it('keeps a path a building or Help Center set shows, even unlisted', async () => {
    setup({
      'building_guided_learning/b1': {
        imageUrls: [],
        steps: [{ audioUrl: url(P1) }],
        helpCenter: true,
      },
    });
    expect(await gcOrphanedSlidePaths([P1])).toEqual([]);
  });

  it('keeps a path a published tour still shows after its set moved on', async () => {
    setup({
      'building_guided_learning_tours/b1': {
        set: { imageUrls: [url(P1)], steps: [] },
        publishedAt: 1,
      },
    });
    expect(await gcOrphanedSlidePaths([P1, P2])).toEqual([P2]);
  });

  it('keeps a path an assignment session or its period content uses', async () => {
    setup({
      'guided_learning_sessions/s1': { imageUrls: [url(P1)], publicSteps: [] },
      'guided_learning_sessions/s2': { stepsInContent: true, imageUrls: [] },
      'guided_learning_sessions/s2/content/steps': {
        publicSteps: [{ narration: { url: url(P2) } }],
      },
    });
    expect(await gcOrphanedSlidePaths([P1, P2])).toEqual([]);
  });

  it('keeps a path a sub-share bundle copied', async () => {
    setup({
      'shared_collections/sh1/keys/guidedLearning_x': {
        kind: 'guidedLearning',
        payload: { set: { imageUrls: [url(P1)] } },
      },
    });
    expect(await gcOrphanedSlidePaths([P1])).toEqual([]);
  });

  it('keeps a path an open tombstone holds, and releases it once its assignments close', async () => {
    const docs: Record<string, Record<string, unknown>> = {
      'users/t1/gl_media_tombstones/set1': {
        storagePaths: [P1],
        assignmentIds: ['a1', 'a2'],
      },
      'users/t1/guided_learning_assignments/a1': { status: 'archived' },
      'users/t1/guided_learning_assignments/a2': { status: 'active' },
    };
    setup(docs);
    expect(await gcOrphanedSlidePaths([P1])).toEqual([]);
    docs['users/t1/guided_learning_assignments/a2'] = { status: 'archived' };
    setup(docs);
    expect(await gcOrphanedSlidePaths([P1])).toEqual([P1]);
  });

  it('treats a tombstone with no readable assignments as holding', async () => {
    setup({ 'users/t1/gl_media_tombstones/set1': { storagePaths: [P1] } });
    expect(await gcOrphanedSlidePaths([P1])).toEqual([]);
  });

  it('ignores only the named set when the editor releases its own files', async () => {
    setup({
      'users/t1/guided_learning/own': { imagePaths: [P1], driveFileIds: [] },
      'building_guided_learning/b1': { imagePaths: [P2] },
    });
    expect(
      await gcOrphanedSlidePaths([P1, P2], {
        ignorePersonal: { uid: 't1', setId: 'own' },
      })
    ).toEqual([P1]);
  });
});

describe('set-delete triggers', () => {
  it('personal: deletes only the owner’s unreferenced uploads', async () => {
    setup({
      'users/t1/guided_learning/dup': { imagePaths: [P2], driveFileIds: [] },
    });
    await run(gcGuidedLearningMedia, {
      params: { uid: 't1', setId: 's' },
      data: {
        data: () => ({
          imagePaths: [P1, P2, 'users/other/hotspot_images/x.png', 'x/y'],
        }),
      },
    });
    expect(bucket.deleted).toEqual([P1]);
  });

  it('building: keeps files a duplicate building set shares', async () => {
    setup({ 'building_guided_learning/copy': { imagePaths: [P1] } });
    await run(gcBuildingGuidedLearningMedia, {
      params: { setId: 'orig' },
      data: { data: () => ({ imagePaths: [P1, P2] }) },
    });
    expect(bucket.deleted).toEqual([P2]);
  });
});

describe('releaseGuidedLearningMediaV1', () => {
  it('lets a teacher release their own files, never another user’s', async () => {
    setup({
      'users/t1/guided_learning/own': { imagePaths: [P1], driveFileIds: [] },
    });
    const res = await run(releaseGuidedLearningMediaV1, {
      auth: { uid: 't1', token: {} },
      data: {
        setId: 'own',
        paths: [P1, 'users/t2/hotspot_images/z.png'],
      },
    });
    expect(res).toEqual({ deleted: 1 });
    expect(bucket.deleted).toEqual([P1]);
  });

  it('refuses a building release from a non-admin', async () => {
    await expect(
      run(releaseGuidedLearningMediaV1, {
        auth: { uid: 't1', token: {} },
        data: { setId: 'b1', building: true, paths: [P1] },
      })
    ).rejects.toThrow('Admin access required.');
  });

  it('requires sign-in', async () => {
    await expect(
      run(releaseGuidedLearningMediaV1, { data: { setId: 's', paths: [] } })
    ).rejects.toThrow('Sign in required.');
  });
});
