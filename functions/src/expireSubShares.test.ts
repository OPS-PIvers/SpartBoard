// Unit tests for the hourly `expireSubShares` sweep.
//
// Regression coverage for the pagination-cliff bug fixed alongside extracting
// the testable `runExpireSubShares` core (mirrors `gcPlcOrphans.test.ts` /
// `expireActivityWallShares.test.ts` / `finalizeIdleQuizAttempts.test.ts`):
//
// The expired-substitute-share lookup was a single un-paginated
// `.where('intendedMode', '==', 'substitute').where('expiresAt', '<=', now)
// .limit(MAX_DELETES_PER_RUN).get()` with NO explicit `orderBy`. A Firestore
// query with no explicit `orderBy` falls back to document-ID order (NOT the
// range-filtered field) — the same behavior already confirmed for the
// identical bug in `expireActivityWallShares.ts` (#2268). Docs held in the
// 7-day Drive-grant grace window are matched by the query but deliberately
// left undeleted, so once the matching-but-undeleted backlog exceeded one
// page, the same arbitrary doc-id-ordered slice was re-fetched every hour
// and any genuinely-expired share whose doc id happened to sort past that
// page was NEVER visited by this sweep — permanently missing both its
// eventual deletion and its "unrevoked Drive permissions" warning log.
//
// The fix paginates (`startAfter` cursor on
// `orderBy('expiresAt').orderBy(FieldPath.documentId())`) up to a much
// larger `MAX_SWEEP_PER_RUN` ceiling.
//
// Stub Firestore mirrors the Admin SDK surface the sweep uses:
//   db.collection('shared_boards'|'shared_collections')
//     .where(f, op, v).orderBy(field).limit(n).startAfter(docSnap).get()
//   db.batch() -> { delete(ref), commit() }

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  // The sweep paginates with admin.firestore.FieldPath.documentId(); expose
  // it as the '__name__' sentinel so the stub CollectionRef.orderBy gets a
  // stable value (mirrors gcPlcOrphans.test.ts / expireActivityWallShares
  // .test.ts's stub).
  firestore: Object.assign(vi.fn(), {
    FieldPath: { documentId: vi.fn(() => '__name__') },
  }),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

import { runExpireSubShares, SWEEP_PAGE_SIZE } from './expireSubShares';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

interface StubDoc {
  id: string;
  data: Record<string, unknown>;
}

/**
 * In-memory Firestore mirroring the Admin SDK surface `runExpireSubShares`
 * uses. Only the where/orderBy/limit/startAfter/get + batch().delete/commit
 * surface is supported — enough to faithfully exercise the sweep without an
 * emulator (mirrors `expireActivityWallShares.test.ts`'s stub).
 */
function makeStubDb(seed: {
  shared_boards?: StubDoc[];
  shared_collections?: StubDoc[];
}) {
  const stores: Record<string, Map<string, Record<string, unknown>>> = {
    shared_boards: new Map(
      (seed.shared_boards ?? []).map((d) => [d.id, d.data])
    ),
    shared_collections: new Map(
      (seed.shared_collections ?? []).map((d) => [d.id, d.data])
    ),
  };

  type Filter = [string, string, unknown];

  function matches(
    id: string,
    data: Record<string, unknown>,
    filters: Filter[]
  ): boolean {
    return filters.every(([field, op, value]) => {
      const actual = data[field];
      if (op === '<=')
        return typeof actual === 'number' && actual <= (value as number);
      if (op === '==') return actual === value;
      throw new Error(`Unsupported op in stub: ${op}`);
    });
  }

  function fieldValue(
    id: string,
    data: Record<string, unknown>,
    field: string
  ): unknown {
    return field === '__name__' ? id : data[field];
  }

  /** Lexicographic/numeric compare; undefined sorts first ("smallest"). */
  function compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return (a as string | number) < (b as string | number) ? -1 : 1;
  }

  function collectionRef(
    collectionName: string,
    filters: Filter[] = [],
    order: string[] = [],
    lim?: number,
    afterId?: string
  ) {
    const store = stores[collectionName];
    return {
      where: (field: string, op: string, value: unknown) =>
        collectionRef(
          collectionName,
          [...filters, [field, op, value]],
          order,
          lim,
          afterId
        ),
      orderBy: (field: string) =>
        collectionRef(collectionName, filters, [...order, field], lim, afterId),
      limit: (n: number) =>
        collectionRef(collectionName, filters, order, n, afterId),
      startAfter: (cursor: { id: string }) =>
        collectionRef(collectionName, filters, order, lim, cursor.id),
      get: () => {
        let rows = [...store.entries()].filter(([id, data]) =>
          matches(id, data, filters)
        );
        // Mirror real Firestore: with NO explicit orderBy, results sort by
        // document ID, not the range-filtered field. This is the crux of the
        // regression being tested — see module header.
        const effectiveOrder = order.length > 0 ? order : ['__name__'];
        rows = rows.sort(([idA, dataA], [idB, dataB]) => {
          for (const field of effectiveOrder) {
            const cmp = compareValues(
              fieldValue(idA, dataA, field),
              fieldValue(idB, dataB, field)
            );
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
        if (afterId !== undefined) {
          const afterData = store.get(afterId) ?? {};
          const afterValues = effectiveOrder.map((f) =>
            fieldValue(afterId, afterData, f)
          );
          rows = rows.filter(([id, data]) => {
            for (let i = 0; i < effectiveOrder.length; i++) {
              const cmp = compareValues(
                fieldValue(id, data, effectiveOrder[i]),
                afterValues[i]
              );
              if (cmp !== 0) return cmp > 0;
            }
            return false;
          });
        }
        const sliced = lim === undefined ? rows : rows.slice(0, lim);
        return Promise.resolve({
          empty: sliced.length === 0,
          size: sliced.length,
          docs: sliced.map(([id, data]) => ({
            id,
            data: () => data,
            ref: {
              id,
              collection: (subName: string) => {
                if (subName !== 'boards') {
                  throw new Error(
                    `Unexpected subcollection in stub: ${subName}`
                  );
                }
                return {
                  get: () => Promise.resolve({ empty: true, docs: [] }),
                };
              },
            },
          })),
        });
      },
    };
  }

  const db = {
    collection: (name: string) => {
      if (!(name in stores)) {
        throw new Error(`Unexpected collection in stub: ${name}`);
      }
      return collectionRef(name);
    },
    batch: () => {
      const pendingDeletes: { id: string; collectionName: string }[] = [];
      return {
        delete: (ref: { id: string }) => {
          // Every doc ref in this stub comes from `shared_boards` or
          // `shared_collections` — figure out which store it belongs to by
          // checking membership (both id spaces are disjoint in these tests).
          for (const [name, store] of Object.entries(stores)) {
            if (store.has(ref.id)) {
              pendingDeletes.push({ id: ref.id, collectionName: name });
              break;
            }
          }
        },
        commit: () => {
          for (const { id, collectionName } of pendingDeletes) {
            stores[collectionName].delete(id);
          }
          return Promise.resolve();
        },
      };
    },
  };

  return {
    db: db as unknown as Parameters<typeof runExpireSubShares>[0],
    stores,
  };
}

describe('runExpireSubShares', () => {
  it('deletes an expired share with no driveGrants immediately', async () => {
    const { db, stores } = makeStubDb({
      shared_boards: [
        {
          id: 'share-1',
          data: { intendedMode: 'substitute', expiresAt: NOW - DAY },
        },
      ],
    });

    const result = await runExpireSubShares(db, NOW);

    expect(result.boards).toEqual({
      deleted: 1,
      inGrace: 0,
      orphanedGrants: 0,
    });
    expect(stores.shared_boards.has('share-1')).toBe(false);
  });

  // The two sweeps run independently (Promise.allSettled) with different hostField/
  // deleteBoardsSubcollection args — assert on result.collections too, not just result.boards.
  it('deletes an expired shared_collections share with no driveGrants immediately', async () => {
    const { db, stores } = makeStubDb({
      shared_collections: [
        {
          id: 'collection-1',
          data: { intendedMode: 'substitute', expiresAt: NOW - DAY },
        },
      ],
    });

    const result = await runExpireSubShares(db, NOW);

    expect(result.collections).toEqual({
      deleted: 1,
      inGrace: 0,
      orphanedGrants: 0,
    });
    expect(stores.shared_collections.has('collection-1')).toBe(false);
  });

  it('leaves a share with driveGrants in the 7-day grace window untouched', async () => {
    const { db, stores } = makeStubDb({
      shared_boards: [
        {
          id: 'share-1',
          data: {
            intendedMode: 'substitute',
            expiresAt: NOW - DAY, // expired 1 day ago — well within 7-day grace
            driveGrants: [
              { email: 'sub@example.com', fileId: 'f1', permissionId: 'p1' },
            ],
          },
        },
      ],
    });

    const result = await runExpireSubShares(db, NOW);

    expect(result.boards).toEqual({
      deleted: 0,
      inGrace: 1,
      orphanedGrants: 0,
    });
    expect(stores.shared_boards.has('share-1')).toBe(true);
  });

  it('force-deletes a share with driveGrants once the grace window has elapsed', async () => {
    const { db, stores } = makeStubDb({
      shared_boards: [
        {
          id: 'share-1',
          data: {
            intendedMode: 'substitute',
            expiresAt: NOW - 8 * DAY, // expired 8 days ago — past 7-day grace
            driveGrants: [
              { email: 'sub@example.com', fileId: 'f1', permissionId: 'p1' },
            ],
          },
        },
      ],
    });

    const result = await runExpireSubShares(db, NOW);

    expect(result.boards).toEqual({
      deleted: 1,
      inGrace: 0,
      orphanedGrants: 1,
    });
    expect(stores.shared_boards.has('share-1')).toBe(false);
  });

  it('leaves a not-yet-expired substitute share untouched', async () => {
    const { db, stores } = makeStubDb({
      shared_boards: [
        {
          id: 'share-1',
          data: { intendedMode: 'substitute', expiresAt: NOW + DAY },
        },
      ],
    });

    const result = await runExpireSubShares(db, NOW);

    expect(result.boards).toEqual({
      deleted: 0,
      inGrace: 0,
      orphanedGrants: 0,
    });
    expect(stores.shared_boards.has('share-1')).toBe(true);
  });

  it('ignores non-substitute shares regardless of expiresAt', async () => {
    const { db, stores } = makeStubDb({
      shared_boards: [
        {
          id: 'share-1',
          data: { intendedMode: 'normal', expiresAt: NOW - DAY },
        },
      ],
    });

    const result = await runExpireSubShares(db, NOW);

    expect(result.boards).toEqual({
      deleted: 0,
      inGrace: 0,
      orphanedGrants: 0,
    });
    expect(stores.shared_boards.has('share-1')).toBe(true);
  });
});

// ===========================================================================
// Pagination regression — an expired share past the first page must still be
// swept. Before the fix, the expired-doc lookup was a single un-paginated
// `.limit(MAX_DELETES_PER_RUN)` page with NO `orderBy`, so once more than one
// page's worth of expired-but-still-undeletable (grace-window) docs
// accumulated, Firestore's default document-ID ordering meant the SAME top
// page was re-fetched every run — any expired share whose doc id sorted past
// that page was never reached, forever.
// ===========================================================================

describe('runExpireSubShares — pagination past the first page', () => {
  it('sweeps an expired share whose doc id sorts past SWEEP_PAGE_SIZE', async () => {
    // A full page of expired, grace-window (undeletable) filler docs — these
    // occupy the "first page" under document-ID ordering and, pre-fix,
    // permanently crowd out anything sorting after them since they never get
    // deleted (grace hasn't elapsed) and free no slots for a later doc.
    const filler: StubDoc[] = Array.from(
      { length: SWEEP_PAGE_SIZE },
      (_, i) => ({
        id: `share-${String(i).padStart(6, '0')}`,
        data: {
          intendedMode: 'substitute',
          expiresAt: NOW - DAY, // expired, but still within 7-day grace
          driveGrants: [
            { email: 'sub@example.com', fileId: 'f1', permissionId: 'p1' },
          ],
        },
      })
    );
    // The target: expired LONGER ago than any filler doc (genuinely the
    // stalest share in the collection) with NO driveGrants — an immediate,
    // uncontested delete candidate — but its doc id sorts lexicographically
    // last, so a doc-ID-ordered `.limit(SWEEP_PAGE_SIZE)` page excludes it
    // entirely while 500 grace-window fillers occupy every slot.
    const target: StubDoc = {
      id: 'share-zzz-target',
      data: { intendedMode: 'substitute', expiresAt: NOW - 30 * DAY },
    };

    const { db, stores } = makeStubDb({
      shared_boards: [...filler, target],
    });

    const result = await runExpireSubShares(db, NOW);

    // The target must be found and deleted; the 500 grace-window fillers
    // must be visited (counted as inGrace) but left in place.
    expect(result.boards.deleted).toBe(1);
    expect(result.boards.inGrace).toBe(SWEEP_PAGE_SIZE);
    expect(stores.shared_boards.has('share-zzz-target')).toBe(false);
  });
});
