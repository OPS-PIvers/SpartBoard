import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { DrawableObject, DrawingConfig, PathObject } from '@/types';

interface MockBatch {
  set: Mock;
  commit: Mock;
}

const writeBatchMock = vi.fn();
const docMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]): unknown => docMock(...args),
  writeBatch: (...args: unknown[]): unknown => writeBatchMock(...args),
}));

import {
  FIRESTORE_BATCH_OP_LIMIT,
  migrateDrawingToSubcollection,
  needsSubcollectionMigration,
} from '@/utils/migrateDrawingToSubcollection';

const pathObj = (overrides: Partial<PathObject> = {}): PathObject => ({
  id: 'obj-1',
  kind: 'path',
  z: 0,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  color: '#000',
  width: 4,
  ...overrides,
});

const makeBatch = (): MockBatch => ({
  set: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

const dummyDb = { __mock: 'db' } as unknown as Parameters<
  typeof migrateDrawingToSubcollection
>[0]['db'];

describe('migrateDrawingToSubcollection', () => {
  let batches: MockBatch[];

  beforeEach(() => {
    batches = [];
    writeBatchMock.mockImplementation(() => {
      const b = makeBatch();
      batches.push(b);
      return b;
    });
    docMock.mockImplementation((...args: unknown[]) => ({
      type: 'doc',
      path: args.slice(1),
    }));
  });

  it('FIRESTORE_BATCH_OP_LIMIT is 450 (50-op margin under Firestore hard cap)', () => {
    expect(FIRESTORE_BATCH_OP_LIMIT).toBe(450);
  });

  it('short-circuits when subcollectionMigrated is already true', async () => {
    const config: DrawingConfig = {
      pages: [
        { id: 'p1', objects: [pathObj({ id: 'a' })], background: 'blank' },
      ],
      subcollectionMigrated: true,
    };
    const { ran, migratedConfig } = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'user-1',
      dashboardId: 'dash-1',
      widgetId: 'wid-1',
      config,
    });
    expect(ran).toBe(false);
    expect(migratedConfig).toBe(config);
    expect(writeBatchMock).not.toHaveBeenCalled();
  });

  it('writes one page-meta doc + one object doc for a single-object page', async () => {
    const config: DrawingConfig = {
      pages: [
        { id: 'p1', objects: [pathObj({ id: 'a' })], background: 'grid' },
      ],
    };
    const { ran, migratedConfig } = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'user-1',
      dashboardId: 'dash-1',
      widgetId: 'wid-1',
      config,
    });
    expect(ran).toBe(true);
    expect(batches).toHaveLength(1);
    expect(batches[0].set).toHaveBeenCalledTimes(2); // page + object
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(migratedConfig.subcollectionMigrated).toBe(true);
    // Denormalized cache keeps id + background but strips objects.
    expect(migratedConfig.pages).toEqual([
      { id: 'p1', objects: [], background: 'grid' },
    ]);
  });

  it('chunks 600 objects across 2 pages into 3 batches (≤450 ops each)', async () => {
    const makeObjects = (prefix: string, count: number): DrawableObject[] =>
      Array.from({ length: count }, (_, i) =>
        pathObj({ id: `${prefix}-${i}`, z: i })
      );

    const config: DrawingConfig = {
      pages: [
        {
          id: 'p1',
          objects: makeObjects('A', 600),
          background: 'blank',
        },
        {
          id: 'p2',
          objects: makeObjects('B', 600),
          background: 'blank',
        },
      ],
    };

    const { ran } = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'user-1',
      dashboardId: 'dash-1',
      widgetId: 'wid-1',
      config,
    });
    expect(ran).toBe(true);
    // Total ops = 2 page docs + 1200 object docs = 1202. With a 450-op
    // chunk size, that's ceil(1202 / 450) = 3 batches.
    expect(batches).toHaveLength(3);
    expect(batches[0].set).toHaveBeenCalledTimes(450);
    expect(batches[1].set).toHaveBeenCalledTimes(450);
    expect(batches[2].set).toHaveBeenCalledTimes(1202 - 900);
  });

  it('rethrows on batch failure WITHOUT setting subcollectionMigrated (retry-safe)', async () => {
    const config: DrawingConfig = {
      pages: [
        { id: 'p1', objects: [pathObj({ id: 'a' })], background: 'blank' },
      ],
    };
    // Force first batch's commit to reject.
    writeBatchMock.mockImplementationOnce(() => ({
      set: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error('emulator down')),
    }));

    await expect(
      migrateDrawingToSubcollection({
        db: dummyDb,
        uid: 'user-1',
        dashboardId: 'dash-1',
        widgetId: 'wid-1',
        config,
      })
    ).rejects.toThrow('emulator down');
    // Config flag must NOT have been set (caller would otherwise persist a
    // half-migrated state).
    expect(config.subcollectionMigrated).toBeUndefined();
  });

  it('writes object docs to the page-nested path', async () => {
    const config: DrawingConfig = {
      pages: [
        { id: 'p1', objects: [pathObj({ id: 'obj-x' })], background: 'blank' },
      ],
    };
    await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'user-1',
      dashboardId: 'dash-1',
      widgetId: 'wid-1',
      config,
    });
    // Last doc() call is for the object — assert its path components.
    const objectDocCall = docMock.mock.calls.find((args) => {
      const path = args.slice(1) as unknown[];
      return path[path.length - 1] === 'obj-x';
    });
    expect(objectDocCall).toBeTruthy();
    if (!objectDocCall) throw new Error('objectDocCall not found');
    expect(objectDocCall.slice(1)).toEqual([
      'users',
      'user-1',
      'dashboards',
      'dash-1',
      'drawings',
      'wid-1',
      'pages',
      'p1',
      'objects',
      'obj-x',
    ]);
  });
});

describe('needsSubcollectionMigration', () => {
  it('returns false when flag is set', () => {
    expect(
      needsSubcollectionMigration({
        pages: [{ id: 'p1', objects: [pathObj()], background: 'blank' }],
        subcollectionMigrated: true,
      })
    ).toBe(false);
  });

  it('returns false when no page has objects', () => {
    expect(
      needsSubcollectionMigration({
        pages: [{ id: 'p1', objects: [], background: 'blank' }],
      })
    ).toBe(false);
  });

  it('returns true when an unmigrated page has objects', () => {
    expect(
      needsSubcollectionMigration({
        pages: [{ id: 'p1', objects: [pathObj()], background: 'blank' }],
      })
    ).toBe(true);
  });

  it('handles null/undefined safely', () => {
    expect(needsSubcollectionMigration(null)).toBe(false);
    expect(needsSubcollectionMigration(undefined)).toBe(false);
  });
});
