// Unit tests for the `expireSubShares` hourly sweep.
//
// Regression coverage for the pagination-cliff bug: the expired-substitute-doc
// lookup used a single un-paginated `.limit(MAX_DELETES_PER_RUN)` query. Docs
// with `driveGrants[]` sit in query results for up to `ORPHAN_GRACE_DAYS`
// without being deleted (intentional grace window), so once more than one
// page of simultaneously-expiring grace-window docs accumulated, that same
// oldest-`expiresAt` page was re-fetched every run — starving any
// later-sorting candidate (including a doc with NO grants, meant to delete
// *immediately*) out of every run's window until the backlog aged out. Mirrors
// the identical bug already fixed in `gcPlcOrphans.ts` / `expireActivityWall
// Shares.ts` — both of which were originally modeled on THIS file's shape.
//
// Two layers, mirroring `expireActivityWallShares.test.ts`:
//   1. BASELINE SWEEP BEHAVIOR — immediate delete, grace-window skip,
//      grace-expired forced delete, boards subcollection cleanup.
//   2. PAGINATION REGRESSION — a ready-to-delete doc that sorts past the
//      first page must still be read and deleted in the same run.

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  // The sweep paginates with admin.firestore.FieldPath.documentId(); expose
  // it as the '__name__' sentinel so the stub CollectionRef.orderBy gets a
  // stable value (mirrors gcPlcOrphans.test.ts's / expireActivityWallShares
  // .test.ts's stub).
  firestore: Object.assign(vi.fn(), {
    FieldPath: { documentId: vi.fn(() => '__name__') },
  }),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

import { sweepCollection, READ_PAGE_SIZE } from './expireSubShares';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// ===========================================================================
// Stub Firestore mirroring the Admin SDK surface `sweepCollection` uses:
//   db.collection(name).where(f, op, v).orderBy(field).limit(n)
//     .startAfter(docSnap).get()
//   docSnap.ref.collection('boards').get()
//   db.batch().delete(ref).commit()
// `orderBy`/`startAfter` mirror `expireActivityWallShares.test.ts`'s stub:
// sort by the ordered field(s) (falling back to doc id for the '__name__'
// sentinel) and slice past the cursor doc's ordering-field values — this is
// what actually exercises cross-page pagination in the regression test below.
// Absent an explicit `orderBy`, Firestore itself implicitly orders an
// inequality-filtered query ascending by the filtered field — the stub
// mirrors that default too, so it faithfully represents BOTH the pre-fix
// (no explicit orderBy) and post-fix (explicit orderBy) query shapes.
// ===========================================================================

interface StubDoc {
  id: string;
  data: Record<string, unknown>;
  boards?: StubDoc[];
}

function makeStubDb(seed: { docs: StubDoc[] }) {
  const store = [...seed.docs];
  const deleted: string[] = [];
  let commits = 0;

  type Filter = [string, string, unknown];
  interface Ref {
    __doc: StubDoc;
    collection: (name: string) => CollectionRef;
  }
  interface DocSnap {
    id: string;
    ref: Ref;
    data: () => Record<string, unknown>;
  }
  interface CollectionRef {
    where: (field: string, op: string, value: unknown) => CollectionRef;
    orderBy: (field: unknown) => CollectionRef;
    limit: (n: number) => CollectionRef;
    startAfter: (cursor: DocSnap) => CollectionRef;
    get: () => Promise<{ docs: DocSnap[]; size: number; empty: boolean }>;
  }

  function matches(doc: StubDoc, filters: Filter[]): boolean {
    return filters.every(([field, op, value]) => {
      const actual = doc.data[field];
      if (op === '<=')
        return typeof actual === 'number' && actual <= (value as number);
      if (op === '==') return actual === value;
      throw new Error(`Unsupported op in stub: ${op}`);
    });
  }

  function fieldValue(doc: StubDoc, field: string): unknown {
    return field === '__name__' ? doc.id : doc.data[field];
  }

  function compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return (a as string | number) < (b as string | number) ? -1 : 1;
  }

  const makeRef = (doc: StubDoc): Ref => ({
    __doc: doc,
    collection: (name: string) => {
      if (name !== 'boards')
        throw new Error(`Unexpected subcollection: ${name}`);
      doc.boards = doc.boards ?? [];
      return boardsCollection(doc.boards);
    },
  });

  function boardsCollection(backing: StubDoc[]): CollectionRef {
    return {
      where: () => {
        throw new Error(
          'boards subcollection does not support where() in stub'
        );
      },
      orderBy: () => boardsCollection(backing),
      limit: () => boardsCollection(backing),
      startAfter: () => boardsCollection(backing),
      get: () =>
        Promise.resolve({
          size: backing.length,
          empty: backing.length === 0,
          docs: backing.map((d) => ({
            id: d.id,
            ref: makeRef(d),
            data: () => d.data,
          })),
        }),
    };
  }

  function docsCollection(
    filters: Filter[] = [],
    order: string[] = [],
    lim?: number,
    afterDoc?: StubDoc
  ): CollectionRef {
    return {
      where: (field: string, op: string, value: unknown) =>
        docsCollection([...filters, [field, op, value]], order, lim, afterDoc),
      orderBy: (field: unknown) =>
        docsCollection(filters, [...order, field as string], lim, afterDoc),
      limit: (n: number) => docsCollection(filters, order, n, afterDoc),
      startAfter: (cursor: DocSnap) => {
        const cursorDoc = store.find((d) => d.id === cursor.id);
        return docsCollection(filters, order, lim, cursorDoc);
      },
      get: () => {
        // Mirror real Firestore's implicit ordering: an inequality filter,
        // absent an explicit orderBy, sorts ascending by the filtered field.
        const effectiveOrder =
          order.length > 0
            ? order
            : filters.find(([, op]) => op === '<=')?.[0]
              ? [filters.find(([, op]) => op === '<=')![0]]
              : [];
        // Always tiebreak by doc id for determinism, matching Firestore's
        // default document-id tiebreaker.
        const orderWithTiebreak = effectiveOrder.includes('__name__')
          ? effectiveOrder
          : [...effectiveOrder, '__name__'];

        let rows = store.filter((d) => matches(d, filters));
        rows = [...rows].sort((a, b) => {
          for (const field of orderWithTiebreak) {
            const cmp = compareValues(
              fieldValue(a, field),
              fieldValue(b, field)
            );
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
        if (afterDoc) {
          const afterValues = orderWithTiebreak.map((f) =>
            fieldValue(afterDoc, f)
          );
          rows = rows.filter((d) => {
            for (let i = 0; i < orderWithTiebreak.length; i++) {
              const cmp = compareValues(
                fieldValue(d, orderWithTiebreak[i]),
                afterValues[i]
              );
              if (cmp !== 0) return cmp > 0;
            }
            return false;
          });
        }
        const sliced = lim === undefined ? rows : rows.slice(0, lim);
        return Promise.resolve({
          size: sliced.length,
          empty: sliced.length === 0,
          docs: sliced.map((d) => ({
            id: d.id,
            ref: makeRef(d),
            data: () => d.data,
          })),
        });
      },
    };
  }

  const db = {
    collection: (name: string) => {
      if (name !== 'shared_boards' && name !== 'shared_collections') {
        throw new Error(`Unexpected collection in stub: ${name}`);
      }
      return docsCollection();
    },
    batch: () => {
      const pending: Ref[] = [];
      return {
        delete: (ref: Ref) => {
          pending.push(ref);
        },
        commit: () => {
          commits += 1;
          for (const ref of pending) {
            const idx = store.indexOf(ref.__doc);
            if (idx >= 0) {
              store.splice(idx, 1);
              deleted.push(ref.__doc.id);
            }
          }
          return Promise.resolve();
        },
      };
    },
  };

  return {
    db: db as unknown as Parameters<typeof sweepCollection>[0],
    store,
    deleted,
    commitCount: () => commits,
  };
}

// ===========================================================================
// 1. Baseline sweep behavior
// ===========================================================================

describe('sweepCollection — baseline behavior', () => {
  it('deletes immediately a doc with NO driveGrants once expired', async () => {
    const { db, deleted } = makeStubDb({
      docs: [
        {
          id: 'no-grants',
          data: {
            intendedMode: 'substitute',
            expiresAt: NOW - 1000,
            driveGrants: [],
          },
        },
      ],
    });

    const result = await sweepCollection(
      db,
      'shared_boards',
      NOW,
      'originalAuthor',
      false
    );

    expect(result).toEqual({ deleted: 1, inGrace: 0, orphanedGrants: 0 });
    expect(deleted).toEqual(['no-grants']);
  });

  it('leaves a doc with driveGrants in the grace window untouched', async () => {
    const { db, deleted } = makeStubDb({
      docs: [
        {
          id: 'has-grants',
          data: {
            intendedMode: 'substitute',
            expiresAt: NOW - DAY, // expired 1 day ago — inside 7-day grace
            driveGrants: [
              { email: 'a@b.com', fileId: 'f1', permissionId: 'p1' },
            ],
          },
        },
      ],
    });

    const result = await sweepCollection(
      db,
      'shared_boards',
      NOW,
      'originalAuthor',
      false
    );

    expect(result).toEqual({ deleted: 0, inGrace: 1, orphanedGrants: 0 });
    expect(deleted).toEqual([]);
  });

  it('force-deletes a doc with driveGrants once the grace window has fully elapsed', async () => {
    const { db, deleted } = makeStubDb({
      docs: [
        {
          id: 'grace-expired',
          data: {
            intendedMode: 'substitute',
            expiresAt: NOW - 8 * DAY, // expired 8 days ago — past 7-day grace
            driveGrants: [
              { email: 'a@b.com', fileId: 'f1', permissionId: 'p1' },
            ],
          },
        },
      ],
    });

    const result = await sweepCollection(
      db,
      'shared_boards',
      NOW,
      'originalAuthor',
      false
    );

    expect(result).toEqual({ deleted: 1, inGrace: 0, orphanedGrants: 1 });
    expect(deleted).toEqual(['grace-expired']);
  });

  it('ignores a non-expired or non-substitute doc', async () => {
    const { db, deleted } = makeStubDb({
      docs: [
        {
          id: 'not-expired',
          data: { intendedMode: 'substitute', expiresAt: NOW + DAY },
        },
        {
          id: 'wrong-mode',
          data: { intendedMode: 'normal', expiresAt: NOW - 1000 },
        },
      ],
    });

    const result = await sweepCollection(
      db,
      'shared_boards',
      NOW,
      'originalAuthor',
      false
    );

    expect(result).toEqual({ deleted: 0, inGrace: 0, orphanedGrants: 0 });
    expect(deleted).toEqual([]);
  });

  it('reaps the boards/ subcollection before deleting a shared_collections parent', async () => {
    const { db } = makeStubDb({
      docs: [
        {
          id: 'collection-1',
          data: {
            intendedMode: 'substitute',
            expiresAt: NOW - 1000,
            driveGrants: [],
          },
          boards: [
            { id: 'board-a', data: {} },
            { id: 'board-b', data: {} },
          ],
        },
      ],
    });

    const result = await sweepCollection(
      db,
      'shared_collections',
      NOW,
      'hostUid',
      true
    );

    expect(result.deleted).toBe(1);
  });
});

// ===========================================================================
// 2. Pagination regression — a ready-to-delete doc that sorts past the first
// page must still be read and deleted in the same run.
//
// Before the fix: the query was a single un-paginated `.limit(READ_PAGE_SIZE)`
// (`MAX_DELETES_PER_RUN`, same number). A backlog of `READ_PAGE_SIZE`
// simultaneously-expired grace-window docs (driveGrants present, expired
// recently) fully occupies that one page every run — none of them are ready
// to delete, so they never leave the query's result set — permanently
// pushing out any later-sorting expired doc, INCLUDING one with no grants
// that should be deleted immediately.
// ===========================================================================

describe('sweepCollection — pagination past the first page', () => {
  it('still finds and deletes a no-grants doc that sorts past READ_PAGE_SIZE behind a grace-window backlog', async () => {
    // Every filler is in-grace (has grants, expired within the last day) and
    // shares the same expiresAt so id is the sort tiebreaker — exactly
    // READ_PAGE_SIZE of them fully occupies the first (and, pre-fix, only)
    // page.
    const fillers: StubDoc[] = Array.from(
      { length: READ_PAGE_SIZE },
      (_, i) => ({
        id: `filler-${String(i).padStart(6, '0')}`,
        data: {
          intendedMode: 'substitute',
          expiresAt: NOW - DAY,
          driveGrants: [{ email: 'a@b.com', fileId: 'f1', permissionId: 'p1' }],
        },
      })
    );
    // The target sorts after every filler (larger expiresAt) and has no
    // grants, so it should be deleted immediately once actually read.
    const target: StubDoc = {
      id: 'target-no-grants',
      data: {
        intendedMode: 'substitute',
        expiresAt: NOW - 1000,
        driveGrants: [],
      },
    };

    const { db, deleted } = makeStubDb({ docs: [...fillers, target] });

    const result = await sweepCollection(
      db,
      'shared_boards',
      NOW,
      'originalAuthor',
      false
    );

    expect(result.inGrace).toBe(READ_PAGE_SIZE);
    // The regression: the target must be found and deleted even though it
    // sorts past the first page.
    expect(deleted).toEqual(['target-no-grants']);
    expect(result.deleted).toBe(1);
  });
});

describe('expireSubShares — scheduled wrapper', () => {
  it('imports and exposes the onSchedule handler', async () => {
    const mod = await import('./expireSubShares');
    expect(typeof mod.expireSubShares).toBe('function');
  });
});
