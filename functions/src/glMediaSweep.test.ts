import { describe, it, expect, vi } from 'vitest';
import { createFakeBucket, createFakeDb } from './glMediaTestFakes';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: vi.fn((_opts: unknown, handler: unknown) => handler),
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { runGlMediaSweep, SWEEP_MAX_DELETES } from './glMediaSweep';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const OLD = '2026-09-01T00:00:00Z';
const YOUNG = '2026-09-22T00:00:00Z';
const path = (n: string) => `users/t1/hotspot_images/${n}`;
const url = (p: string) =>
  `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(p)}?alt=media&token=t`;

type Db = Parameters<typeof runGlMediaSweep>[0];
type Bucket = Parameters<typeof runGlMediaSweep>[1];
const sweep = (
  docs: Record<string, Record<string, unknown>>,
  bucket: ReturnType<typeof createFakeBucket>
) =>
  runGlMediaSweep(
    createFakeDb(docs) as unknown as Db,
    bucket as unknown as Bucket,
    NOW
  );

describe('runGlMediaSweep', () => {
  it('deletes only old, marked, unreferenced GL files', async () => {
    const bucket = createFakeBucket([
      { name: path('orphan.webp'), timeCreated: OLD },
      { name: path('young.webp'), timeCreated: YOUNG },
      { name: path('legacy.webp'), timeCreated: OLD, marked: false },
      { name: path('personal.webp'), timeCreated: OLD },
      { name: path('thumbs/personal.webp'), timeCreated: OLD },
      { name: path('building.webp'), timeCreated: OLD },
      { name: path('session.webm'), timeCreated: OLD },
      { name: 'users/t1/stickers/s.png', timeCreated: OLD },
    ]);
    const result = await sweep(
      {
        'users/t1/guided_learning/s1': {
          imagePaths: [path('personal.webp')],
          imageUrl: url(path('thumbs/personal.webp')),
        },
        'building_guided_learning/b1': {
          steps: [{ narration: { storagePath: path('building.webp') } }],
        },
        'guided_learning_sessions/x': {
          publicSteps: [{ videoUrl: url(path('session.webm')) }],
        },
      },
      bucket
    );
    expect(bucket.deleted).toEqual([path('orphan.webp')]);
    expect(result.candidates).toBe(5);
  });

  it('skips files an open tombstone holds', async () => {
    const bucket = createFakeBucket([
      { name: path('held.webp'), timeCreated: OLD },
    ]);
    await sweep(
      {
        'users/t1/gl_media_tombstones/set1': {
          storagePaths: [path('held.webp')],
          assignmentIds: ['a1'],
        },
        'users/t1/guided_learning_assignments/a1': { status: 'active' },
      },
      bucket
    );
    expect(bucket.deleted).toEqual([]);
  });

  it('caps deletions per run', async () => {
    const files = Array.from({ length: SWEEP_MAX_DELETES + 5 }, (_, i) => ({
      name: path(`${i}.webp`),
      timeCreated: OLD,
    }));
    const bucket = createFakeBucket(files);
    const result = await sweep({}, bucket);
    expect(result.deleted).toHaveLength(SWEEP_MAX_DELETES);
  });

  it('reads no Firestore when nothing is old enough', async () => {
    const bucket = createFakeBucket([
      { name: path('young.webp'), timeCreated: YOUNG },
    ]);
    const db = {
      collection: vi.fn(),
      collectionGroup: vi.fn(),
    };
    const result = await runGlMediaSweep(
      db as unknown as Db,
      bucket as unknown as Bucket,
      NOW
    );
    expect(result).toEqual({ candidates: 0, deleted: [] });
    expect(db.collection).not.toHaveBeenCalled();
  });
});
