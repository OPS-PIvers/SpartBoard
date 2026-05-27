import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Firestore } from 'firebase/firestore';
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
import { migrateDrawingConfig } from '@/utils/migrateDrawingConfig';

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

const dummyDb = { __mock: 'db' } as unknown as Firestore;

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
    // chunk size, that's ceil(1202 / 450) = 3 batches. The expected per-
    // batch counts (450, 450, 302) rely on the WriteOp queue ordering
    // (page-meta before its objects, page by page); a refactor that flips
    // object-then-page ordering would still chunk correctly but the slice
    // boundaries below would no longer split cleanly along page edges.
    expect(batches).toHaveLength(3);
    expect(batches[0].set).toHaveBeenCalledTimes(450);
    expect(batches[1].set).toHaveBeenCalledTimes(450);
    expect(batches[2].set).toHaveBeenCalledTimes(1202 - 900);
  });

  it.each([
    { totalObjs: 449, expectedBatches: 1 }, // 449 objs + 1 page = 450 ops, 1 batch
    { totalObjs: 450, expectedBatches: 2 }, // 450 objs + 1 page = 451 ops, 2 batches
    { totalObjs: 899, expectedBatches: 2 }, // 899 + 1 = 900 ops, 2 batches
    { totalObjs: 900, expectedBatches: 3 }, // 900 + 1 = 901 ops, 3 batches
  ])(
    'chunks $totalObjs objects (+ 1 page meta) into $expectedBatches batch(es) at the 450-op boundary',
    async ({ totalObjs, expectedBatches }) => {
      const config: DrawingConfig = {
        pages: [
          {
            id: 'p1',
            objects: Array.from({ length: totalObjs }, (_, i) =>
              pathObj({ id: `o-${i}`, z: i })
            ),
            background: 'blank',
          },
        ],
      };
      await migrateDrawingToSubcollection({
        db: dummyDb,
        uid: 'u',
        dashboardId: 'd',
        widgetId: 'w',
        config,
      });
      expect(batches).toHaveLength(expectedBatches);
    }
  );

  it('is idempotent: re-running on the post-migration output is a no-op', async () => {
    const config: DrawingConfig = {
      pages: [
        { id: 'p1', objects: [pathObj({ id: 'a' })], background: 'grid' },
      ],
    };
    const { migratedConfig } = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'u',
      dashboardId: 'd',
      widgetId: 'w',
      config,
    });
    // Reset captured batches so we only count what the SECOND call writes.
    batches.length = 0;
    writeBatchMock.mockClear();
    const second = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'u',
      dashboardId: 'd',
      widgetId: 'w',
      config: migratedConfig,
    });
    expect(second.ran).toBe(false);
    expect(second.migratedConfig).toBe(migratedConfig);
    expect(batches).toHaveLength(0);
    expect(writeBatchMock).not.toHaveBeenCalled();
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

  it('migrates a pre-Phase-2 legacy widget (objects[], no pages) through the full chain', async () => {
    // Real-world legacy shape: a widget authored before PR 2.3 carries
    // `objects[]` at the top level and has no `pages[]`. The kicker MUST
    // run the synchronous DrawingConfig migration first; otherwise
    // `needsSubcollectionMigration` returns false and the subcollection
    // writes never fire. This test exercises the full chain.
    const legacyConfig = {
      objects: [pathObj({ id: 'legacy-1' }), pathObj({ id: 'legacy-2', z: 1 })],
      color: '#abc',
    } as unknown as DrawingConfig;
    expect(needsSubcollectionMigration(legacyConfig)).toBe(false);
    const synced = migrateDrawingConfig(legacyConfig);
    expect(needsSubcollectionMigration(synced)).toBe(true);
    const { ran, migratedConfig } = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'u',
      dashboardId: 'd',
      widgetId: 'w',
      config: synced,
    });
    expect(ran).toBe(true);
    expect(migratedConfig.subcollectionMigrated).toBe(true);
    // One batch covers: 1 page-meta + 2 objects = 3 ops.
    expect(batches).toHaveLength(1);
    expect(batches[0].set).toHaveBeenCalledTimes(3);
  });

  it('is a no-op for a config with empty pages (no wasted batch, no flag flip)', async () => {
    // `needsSubcollectionMigration` returns false for `pages: [{objects:[]}]`
    // so the kicker won't call this function in production — but admin
    // scripts and direct callers should also see a true no-op rather than
    // a wasted batch commit. Matches the function docstring's idempotency
    // claim: a call with nothing to relocate produces zero writes and
    // returns `ran: false`.
    const config: DrawingConfig = {
      pages: [{ id: 'p1', objects: [], background: 'blank' }],
    };
    const { ran, migratedConfig } = await migrateDrawingToSubcollection({
      db: dummyDb,
      uid: 'u',
      dashboardId: 'd',
      widgetId: 'w',
      config,
    });
    expect(ran).toBe(false);
    expect(batches).toHaveLength(0);
    // Untouched config returned (no flag flip).
    expect(migratedConfig).toBe(config);
    expect(migratedConfig.subcollectionMigrated).toBeUndefined();
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
