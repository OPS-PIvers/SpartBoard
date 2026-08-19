// Unit tests for the nightly PLC GC sweep `gcPlcOrphans` (Wave 4 —
// PRD §5.3 / §3.4 / §3.1 / §3.3, Decisions 5.3 / 3.4 / 3.1 / 2.1).
//
// Two layers, mirroring the established functions-test posture
// (`aggregatePlcAssessment.test.ts` / `detachPlcSyncLinkage.test.ts`):
//
//   1. PURE DECISION HELPERS — `isStalePresence` (>5min), `isExpiredTombstone`
//      (>30d, null-safe), `isEmptyGroup`, `isStaleActivity`, and the tolerant
//      `toMillis` parser. These carry the load-bearing invariants and run with
//      no Firestore at all.
//
//   2. SWEEP — `runGcPlcOrphans` driven against an in-memory stub Firestore
//      that emulates the Admin SDK surface the sweep uses (collection().limit()
//      .get(), batched deletes, the versions subcollection). The stub proves
//      the sweep DELETES empty groups + stale presence and LEAVES fresh data
//      untouched — the one-category-minimum acceptance criterion, covered for
//      multiple categories.
//
// The project's Firestore emulator can't boot in this environment (see project
// notes); CI/dev-preview runs the rules-emulator suite. The Admin-SDK sweep is
// pure I/O over a documented surface, so a faithful stub pins the same
// behaviour without the emulator — identical to how the other functions tests
// validate Admin-SDK transaction handlers.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock firebase-admin so the module-level `functionsInit` side effect no-ops
// (`admin.apps.length > 0`).
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  // The sweep paginates with admin.firestore.FieldPath.documentId(); expose it
  // as the '__name__' sentinel so the stub ColRef.orderBy gets a stable value
  // (the stub sorts a documentId()-ordered query by doc id — see makeStubDb).
  firestore: Object.assign(vi.fn(), {
    FieldPath: { documentId: vi.fn(() => '__name__') },
  }),
}));

// `./functionsInit` calls `setGlobalOptions` at import time.
vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

// `onSchedule` returns the handler directly so the module imports without
// registering a real scheduled trigger.
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

import {
  toMillis,
  isStalePresence,
  isExpiredTombstone,
  isStaleActivity,
  isEmptyGroup,
  runGcPlcOrphans,
  STALE_PRESENCE_MS,
  TOMBSTONE_GRACE_MS,
  ACTIVITY_RETENTION_MS,
  VERSION_HISTORY_LIMIT,
  SOFT_DELETE_SUBCOLLECTIONS,
  PLC_PAGE_SIZE,
  GROUP_PAGE_SIZE,
  CATEGORY_PAGE_SIZE,
  MAX_VERSIONS_SCAN_PER_GROUP,
} from './gcPlcOrphans';

// ===========================================================================
// 1. Pure decision helpers
// ===========================================================================

const NOW = 1_700_000_000_000;

/** A minimal Firestore Timestamp-like object (just `.toMillis()`). */
function ts(ms: number) {
  return { toMillis: () => ms };
}

describe('toMillis — tolerant parser', () => {
  it('returns a finite number unchanged', () => {
    expect(toMillis(12345)).toBe(12345);
  });

  it('reads a Firestore Timestamp via toMillis()', () => {
    expect(toMillis(ts(98765))).toBe(98765);
  });

  it('returns 0 for null / undefined / malformed', () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(undefined)).toBe(0);
    expect(toMillis('not-a-date')).toBe(0);
    expect(toMillis(NaN)).toBe(0);
    expect(toMillis({})).toBe(0);
  });
});

describe('isStalePresence — >5min threshold (Decision 2.1)', () => {
  it('is FRESH at exactly the threshold boundary', () => {
    // now - lastActiveAt === threshold → not strictly greater → fresh.
    expect(isStalePresence(NOW - STALE_PRESENCE_MS, NOW)).toBe(false);
  });

  it('is FRESH just inside 5 minutes (recent heartbeat)', () => {
    expect(isStalePresence(NOW - 60 * 1000, NOW)).toBe(false);
    expect(isStalePresence(NOW - (STALE_PRESENCE_MS - 1), NOW)).toBe(false);
  });

  it('is STALE just past 5 minutes', () => {
    expect(isStalePresence(NOW - (STALE_PRESENCE_MS + 1), NOW)).toBe(true);
    expect(isStalePresence(NOW - 10 * 60 * 1000, NOW)).toBe(true);
  });

  it('accepts a Firestore Timestamp', () => {
    expect(isStalePresence(ts(NOW - 60 * 1000), NOW)).toBe(false);
    expect(isStalePresence(ts(NOW - 10 * 60 * 1000), NOW)).toBe(true);
  });

  it('treats a missing/malformed lastActiveAt as stale (no heartbeat)', () => {
    expect(isStalePresence(null, NOW)).toBe(true);
    expect(isStalePresence(undefined, NOW)).toBe(true);
  });
});

describe('isExpiredTombstone — >30d, null-safe (Decision 3.1)', () => {
  it('NEVER expires a live doc (deletedAt null/absent)', () => {
    // The load-bearing guard: GC must not eat active content.
    expect(isExpiredTombstone(null, NOW)).toBe(false);
    expect(isExpiredTombstone(undefined, NOW)).toBe(false);
  });

  it('is NOT expired within the 30-day grace window', () => {
    expect(isExpiredTombstone(NOW - 1 * 24 * 60 * 60 * 1000, NOW)).toBe(false);
    expect(isExpiredTombstone(NOW - (TOMBSTONE_GRACE_MS - 1), NOW)).toBe(false);
  });

  it('is NOT expired at exactly the grace boundary', () => {
    expect(isExpiredTombstone(NOW - TOMBSTONE_GRACE_MS, NOW)).toBe(false);
  });

  it('IS expired past 30 days', () => {
    expect(isExpiredTombstone(NOW - (TOMBSTONE_GRACE_MS + 1), NOW)).toBe(true);
    expect(isExpiredTombstone(NOW - 60 * 24 * 60 * 60 * 1000, NOW)).toBe(true);
  });

  it('accepts a Firestore Timestamp', () => {
    expect(isExpiredTombstone(ts(NOW - 60 * 24 * 60 * 60 * 1000), NOW)).toBe(
      true
    );
    expect(isExpiredTombstone(ts(NOW - 1000), NOW)).toBe(false);
  });

  it('does NOT delete on a malformed (<=0) deletedAt — fail safe', () => {
    expect(isExpiredTombstone('garbage', NOW)).toBe(false);
    expect(isExpiredTombstone(0, NOW)).toBe(false);
    expect(isExpiredTombstone(-5, NOW)).toBe(false);
  });
});

describe('isStaleActivity — >90d (§3.4)', () => {
  it('is fresh within 90 days', () => {
    expect(isStaleActivity(NOW - 10 * 24 * 60 * 60 * 1000, NOW)).toBe(false);
    expect(isStaleActivity(NOW - ACTIVITY_RETENTION_MS, NOW)).toBe(false);
  });

  it('is stale past 90 days', () => {
    expect(isStaleActivity(NOW - (ACTIVITY_RETENTION_MS + 1), NOW)).toBe(true);
  });

  it('treats a missing createdAt as stale (legacy/garbage event)', () => {
    expect(isStaleActivity(null, NOW)).toBe(true);
  });
});

describe('isEmptyGroup', () => {
  it('is empty when participants is an empty object', () => {
    expect(isEmptyGroup({ participants: {} })).toBe(true);
  });

  it('is empty when participants is missing / null / non-object', () => {
    expect(isEmptyGroup({})).toBe(true);
    expect(isEmptyGroup({ participants: null })).toBe(true);
    expect(isEmptyGroup({ participants: 'oops' as unknown })).toBe(true);
  });

  it('is NOT empty when at least one participant remains', () => {
    expect(isEmptyGroup({ participants: { uidA: { joinedAt: 1 } } })).toBe(
      false
    );
  });
});

// ===========================================================================
// 2. Sweep against a stub Firestore (Admin SDK surface)
// ===========================================================================

interface StubDoc {
  id: string;
  data: Record<string, unknown>;
  /** Subcollections keyed by name → array of child docs. */
  sub?: Record<string, StubDoc[]>;
}

/**
 * In-memory Firestore mirroring the Admin SDK surface `runGcPlcOrphans` uses:
 *   db.collection(name).orderBy(FieldPath.documentId()).limit(n).startAfter(d).get()
 *   docSnap.ref.collection('versions').get()
 *   db.batch().delete(ref).commit()
 * Deletes mutate the backing arrays so post-sweep assertions read true state.
 * `orderBy`/`startAfter` mirror `plcWeeklyDigest.test.ts`'s stub: sort by doc
 * id ascending (the '__name__' sentinel the mocked FieldPath.documentId()
 * returns) and slice past the cursor doc — this is what actually exercises
 * cross-page pagination in the regression tests below.
 */
function makeStubDb(seed: {
  plcs?: StubDoc[];
  synced_quizzes?: StubDoc[];
  synced_video_activities?: StubDoc[];
}) {
  const root: Record<string, StubDoc[]> = {
    plcs: seed.plcs ?? [],
    synced_quizzes: seed.synced_quizzes ?? [],
    synced_video_activities: seed.synced_video_activities ?? [],
  };

  // A ref carries the backing array + the doc it points at so delete() can
  // splice it out of its parent collection.
  interface Ref {
    __doc: StubDoc;
    __parent: StubDoc[];
    collection: (name: string) => CollectionRef;
  }
  interface CollectionRef {
    limit: (n: number) => CollectionRef;
    orderBy: (field: unknown, direction?: 'asc' | 'desc') => CollectionRef;
    startAfter: (cursor: DocSnap) => CollectionRef;
    offset: (n: number) => CollectionRef;
    get: () => Promise<{ docs: DocSnap[]; size: number }>;
  }
  interface DocSnap {
    id: string;
    ref: Ref;
    data: () => Record<string, unknown>;
  }

  const makeRef = (doc: StubDoc, parent: StubDoc[]): Ref => ({
    __doc: doc,
    __parent: parent,
    collection: (name: string) => {
      doc.sub = doc.sub ?? {};
      doc.sub[name] = doc.sub[name] ?? [];
      return makeCollectionRef(doc.sub[name]);
    },
  });

  const makeCollectionRef = (
    backing: StubDoc[],
    opts: {
      lim?: number;
      ordered?: boolean;
      afterId?: string;
      offsetN?: number;
      orderField?: unknown;
      orderDir?: 'asc' | 'desc';
    } = {}
  ): CollectionRef => ({
    limit: (n: number) => makeCollectionRef(backing, { ...opts, lim: n }),
    orderBy: (field: unknown, direction?: 'asc' | 'desc') =>
      makeCollectionRef(backing, {
        ...opts,
        ordered: true,
        orderField: field,
        orderDir: direction ?? 'asc',
      }),
    offset: (n: number) => makeCollectionRef(backing, { ...opts, offsetN: n }),
    startAfter: (cursor: DocSnap) =>
      makeCollectionRef(backing, { ...opts, afterId: cursor.id }),
    get: () => {
      // '__name__' (mocked FieldPath.documentId()) sorts by doc id, same as
      // production. A real field name orders numerically on that field and —
      // mirroring live Firestore — excludes docs where the field is absent.
      const byRealField =
        opts.ordered &&
        opts.orderField !== undefined &&
        opts.orderField !== '__name__';
      let rows = byRealField
        ? backing.filter((d) => d.data[opts.orderField as string] !== undefined)
        : [...backing];
      if (opts.ordered) {
        rows = rows.sort((a, b) => {
          if (!byRealField) {
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          }
          const field = opts.orderField as string;
          const av = Number(a.data[field]);
          const bv = Number(b.data[field]);
          return opts.orderDir === 'desc' ? bv - av : av - bv;
        });
      }
      if (opts.afterId !== undefined) {
        const i = rows.findIndex((d) => d.id === opts.afterId);
        if (i >= 0) rows = rows.slice(i + 1);
      }
      if (opts.offsetN) {
        rows = rows.slice(opts.offsetN);
      }
      const slice = rows.slice(
        0,
        opts.lim === undefined ? rows.length : opts.lim
      );
      return Promise.resolve({
        size: slice.length,
        docs: slice.map((d) => ({
          id: d.id,
          ref: makeRef(d, backing),
          data: () => d.data,
        })),
      });
    },
  });

  let commits = 0;
  const db = {
    collection: (name: string) => {
      root[name] = root[name] ?? [];
      return makeCollectionRef(root[name]);
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
            const idx = ref.__parent.indexOf(ref.__doc);
            if (idx >= 0) ref.__parent.splice(idx, 1);
          }
          return Promise.resolve();
        },
      };
    },
  };

  return {
    db: db as unknown as Parameters<typeof runGcPlcOrphans>[0],
    root,
    commitCount: () => commits,
  };
}

const day = 24 * 60 * 60 * 1000;

describe('runGcPlcOrphans — empty synced groups (category a)', () => {
  it('deletes empty groups and preserves groups with participants', async () => {
    const { db, root } = makeStubDb({
      synced_quizzes: [
        { id: 'empty-q', data: { participants: {} } },
        { id: 'live-q', data: { participants: { uidA: { joinedAt: 1 } } } },
        { id: 'noparts-q', data: {} }, // missing map → empty → reaped
      ],
      synced_video_activities: [
        { id: 'empty-va', data: { participants: {} } },
        { id: 'live-va', data: { participants: { uidB: { joinedAt: 2 } } } },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.emptyGroups).toBe(3); // empty-q, noparts-q, empty-va
    expect(root.synced_quizzes.map((d) => d.id)).toEqual(['live-q']);
    expect(root.synced_video_activities.map((d) => d.id)).toEqual(['live-va']);
  });
});

describe('runGcPlcOrphans — stale presence (category c, Decision 2.1)', () => {
  it('prunes presence older than 5 min and leaves fresh heartbeats', async () => {
    const { db, root } = makeStubDb({
      plcs: [
        {
          id: 'plc-1',
          data: {},
          sub: {
            presence: [
              { id: 'fresh', data: { lastActiveAt: NOW - 60 * 1000 } },
              { id: 'stale', data: { lastActiveAt: NOW - 10 * 60 * 1000 } },
              { id: 'abandoned', data: {} }, // no heartbeat → stale
            ],
          },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.presence).toBe(2); // stale + abandoned
    const remaining = root.plcs[0].sub!.presence.map((d) => d.id);
    expect(remaining).toEqual(['fresh']);
  });
});

describe('runGcPlcOrphans — expired tombstones (category d, Decision 3.1)', () => {
  it('hard-deletes tombstones >30d and never touches live docs', async () => {
    const { db, root } = makeStubDb({
      plcs: [
        {
          id: 'plc-1',
          data: {},
          sub: {
            notes: [
              { id: 'live', data: { deletedAt: null } },
              { id: 'recent-del', data: { deletedAt: NOW - 5 * day } },
              { id: 'old-del', data: { deletedAt: NOW - 40 * day } },
            ],
            comments: [
              { id: 'old-comment', data: { deletedAt: NOW - 60 * day } },
            ],
          },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    // old-del (notes) + old-comment (comments) = 2
    expect(counts.tombstones).toBe(2);
    expect(root.plcs[0].sub!.notes.map((d) => d.id)).toEqual([
      'live',
      'recent-del',
    ]);
    expect(root.plcs[0].sub!.comments).toHaveLength(0);
  });

  it('sweeps every soft-deletable subcollection name', async () => {
    // One expired tombstone in each soft-deletable subcollection.
    const sub: Record<string, StubDoc[]> = {};
    for (const name of SOFT_DELETE_SUBCOLLECTIONS) {
      sub[name] = [{ id: `${name}-old`, data: { deletedAt: NOW - 40 * day } }];
    }
    const { db, root } = makeStubDb({
      plcs: [{ id: 'plc-1', data: {}, sub }],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.tombstones).toBe(SOFT_DELETE_SUBCOLLECTIONS.length);
    for (const name of SOFT_DELETE_SUBCOLLECTIONS) {
      expect(root.plcs[0].sub![name]).toHaveLength(0);
    }
  });
});

describe('runGcPlcOrphans — stale activity (category b, §3.4)', () => {
  it('trims activity older than 90 days, keeps recent', async () => {
    const { db, root } = makeStubDb({
      plcs: [
        {
          id: 'plc-1',
          data: {},
          sub: {
            activity: [
              { id: 'recent', data: { createdAt: NOW - 10 * day } },
              { id: 'old', data: { createdAt: NOW - 120 * day } },
            ],
          },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.activity).toBe(1);
    expect(root.plcs[0].sub!.activity.map((d) => d.id)).toEqual(['recent']);
  });
});

describe('runGcPlcOrphans — version overflow (category e)', () => {
  it('keeps the newest VERSION_HISTORY_LIMIT snapshots and deletes the rest', async () => {
    // 13 version snapshots keyed by numeric version id → 3 overflow.
    const versions: StubDoc[] = Array.from({ length: 13 }, (_, i) => ({
      id: String(i + 1),
      data: { version: i + 1 },
    }));
    const { db, root } = makeStubDb({
      // group has a participant so it's NOT reaped as empty — we only test
      // version trimming here.
      synced_quizzes: [
        {
          id: 'g1',
          data: { participants: { uidA: { joinedAt: 1 } } },
          sub: { versions: versions },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.versionOverflow).toBe(3);
    const remaining = root.synced_quizzes[0]
      .sub!.versions.map((d) => Number(d.id))
      .sort((a, b) => a - b);
    // Newest 10 kept: versions 4..13.
    expect(remaining).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(remaining).toHaveLength(VERSION_HISTORY_LIMIT);
  });

  it('does nothing when version count is at or under the cap', async () => {
    const versions: StubDoc[] = Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 1),
      data: { version: i + 1 },
    }));
    const { db, root } = makeStubDb({
      synced_quizzes: [
        {
          id: 'g1',
          data: { participants: { uidA: { joinedAt: 1 } } },
          sub: { versions },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.versionOverflow).toBe(0);
    expect(root.synced_quizzes[0].sub!.versions).toHaveLength(5);
  });
});

describe('runGcPlcOrphans — version overflow is bounded per group (MAX_VERSIONS_SCAN_PER_GROUP)', () => {
  // Before the fix, `sweepVersionOverflow` read the ENTIRE `versions`
  // subcollection with a single un-bounded `.get()` and sorted it in memory —
  // the one sweep in this file with no per-run ceiling. A group whose backlog
  // has grown large (client prune stuck failing) could blow past the
  // function's pinned 256MiB budget or simply dominate the run, and — since
  // this sweep runs BEFORE the per-PLC loop with no try/catch around it — a
  // single pathological group could abort the whole run before any PLC's
  // activity/presence/tombstone sweep even starts. This proves the fix caps
  // deletions at MAX_VERSIONS_SCAN_PER_GROUP per run and leaves the rest for
  // next run, exactly like every other ceiling in this file.
  it('caps deletions at MAX_VERSIONS_SCAN_PER_GROUP and leaves the remainder for next run', async () => {
    const overflowBeyondCap = 50;
    const totalOverflow = MAX_VERSIONS_SCAN_PER_GROUP + overflowBeyondCap;
    const total = VERSION_HISTORY_LIMIT + totalOverflow;
    const versions: StubDoc[] = Array.from({ length: total }, (_, i) => ({
      id: String(i + 1),
      data: { version: i + 1 },
    }));
    const { db, root } = makeStubDb({
      synced_quizzes: [
        {
          id: 'g1',
          data: { participants: { uidA: { joinedAt: 1 } } },
          sub: { versions },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    // Un-bounded (pre-fix) behaviour deletes ALL overflow in one run
    // (totalOverflow); the fix must cap it at MAX_VERSIONS_SCAN_PER_GROUP.
    expect(counts.versionOverflow).toBe(MAX_VERSIONS_SCAN_PER_GROUP);
    const remaining = root.synced_quizzes[0].sub!.versions;
    // The un-swept remainder (newest kept + leftover overflow) stays behind
    // for the next run to pick up — nothing is lost, just deferred.
    expect(remaining).toHaveLength(VERSION_HISTORY_LIMIT + overflowBeyondCap);
    // The newest VERSION_HISTORY_LIMIT snapshots are never touched.
    const newestIds = Array.from({ length: VERSION_HISTORY_LIMIT }, (_, i) =>
      String(total - i)
    );
    const remainingIds = new Set(remaining.map((d) => d.id));
    for (const id of newestIds) {
      expect(remainingIds.has(id)).toBe(true);
    }
  });

  it('warns when the per-group ceiling is hit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const total = VERSION_HISTORY_LIMIT + MAX_VERSIONS_SCAN_PER_GROUP + 1;
    const versions: StubDoc[] = Array.from({ length: total }, (_, i) => ({
      id: String(i + 1),
      data: { version: i + 1 },
    }));
    const { db } = makeStubDb({
      synced_quizzes: [
        {
          id: 'g1',
          data: { participants: { uidA: { joinedAt: 1 } } },
          sub: { versions },
        },
      ],
    });

    await runGcPlcOrphans(db, NOW);

    expect(
      warnSpy.mock.calls.some((call) =>
        String(call[0]).includes('MAX_VERSIONS_SCAN_PER_GROUP')
      )
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it('does not touch a group whose overflow is within the cap (unchanged behaviour)', async () => {
    const versions: StubDoc[] = Array.from({ length: 13 }, (_, i) => ({
      id: String(i + 1),
      data: { version: i + 1 },
    }));
    const { db, root } = makeStubDb({
      synced_quizzes: [
        {
          id: 'g1',
          data: { participants: { uidA: { joinedAt: 1 } } },
          sub: { versions },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.versionOverflow).toBe(3);
    expect(root.synced_quizzes[0].sub!.versions).toHaveLength(
      VERSION_HISTORY_LIMIT
    );
  });

  it('pins the documented trade-off: a version doc missing the `version` field is left untouched (neither counted nor deleted)', async () => {
    const versions: StubDoc[] = [
      ...Array.from({ length: VERSION_HISTORY_LIMIT + 5 }, (_, i) => ({
        id: String(i + 1),
        data: { version: i + 1 },
      })),
      { id: 'malformed', data: {} },
    ];
    const { db, root } = makeStubDb({
      synced_quizzes: [
        {
          id: 'g1',
          data: { participants: { uidA: { joinedAt: 1 } } },
          sub: { versions },
        },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    // Firestore's orderBy('version') excludes the fieldless doc from the
    // query entirely — it's invisible to the sweep, not swept as overflow.
    expect(counts.versionOverflow).toBe(5);
    const remainingIds = root.synced_quizzes[0].sub!.versions.map((d) => d.id);
    expect(remainingIds).toContain('malformed');
  });
});

describe('runGcPlcOrphans — full sweep summary', () => {
  it('reports per-category counts and is idempotent on a clean DB', async () => {
    const { db } = makeStubDb({
      plcs: [{ id: 'plc-1', data: {}, sub: { presence: [], activity: [] } }],
      synced_quizzes: [
        { id: 'live', data: { participants: { uidA: { joinedAt: 1 } } } },
      ],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts).toEqual({
      emptyGroups: 0,
      activity: 0,
      presence: 0,
      tombstones: 0,
      versionOverflow: 0,
    });

    // A second run on the now-clean DB still deletes nothing.
    const second = await runGcPlcOrphans(db, NOW);
    expect(second).toEqual(counts);
  });
});

// ===========================================================================
// 3. Pagination regressions — a PLC/group past the first page must still be
//    swept. Before the fix, `runGcPlcOrphans` read a single un-paginated
//    `.limit()` page per collection, so anything past PLC_PAGE_SIZE /
//    GROUP_PAGE_SIZE was silently never visited by ANY run, forever (the
//    exact bug `plcWeeklyDigest` was already fixed for — see its "Fixes the
//    prior single limit() page" comment).
// ===========================================================================

describe('runGcPlcOrphans — PLC pagination past the first page', () => {
  it('sweeps stale presence in a PLC beyond PLC_PAGE_SIZE, not just the first page', async () => {
    // One PLC per id 'plc-000' .. 'plc-{PLC_PAGE_SIZE}', each with a single
    // stale presence doc. Zero-padded ids sort lexicographically in doc-id
    // order, matching the production orderBy(FieldPath.documentId()) cursor.
    const total = PLC_PAGE_SIZE + 5;
    const plcs = Array.from({ length: total }, (_, i) => ({
      id: `plc-${String(i).padStart(6, '0')}`,
      data: {},
      sub: {
        presence: [
          { id: 'stale', data: { lastActiveAt: NOW - 10 * 60 * 1000 } },
        ],
      },
    }));
    const { db, root } = makeStubDb({ plcs });

    const counts = await runGcPlcOrphans(db, NOW);

    // Every PLC's stale presence doc must be pruned in a single run — not
    // just the first PLC_PAGE_SIZE of them.
    expect(counts.presence).toBe(total);
    for (const plc of root.plcs) {
      expect(plc.sub!.presence).toHaveLength(0);
    }
  });
});

describe('runGcPlcOrphans — synced-group pagination past the first page', () => {
  it('reaps empty groups beyond GROUP_PAGE_SIZE, not just the first page', async () => {
    const total = GROUP_PAGE_SIZE + 5;
    const synced_quizzes = Array.from({ length: total }, (_, i) => ({
      id: `grp-${String(i).padStart(6, '0')}`,
      data: { participants: {} },
    }));
    const { db, root } = makeStubDb({ synced_quizzes });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.emptyGroups).toBe(total);
    expect(root.synced_quizzes).toHaveLength(0);
  });

  it('trims version overflow for a group beyond GROUP_PAGE_SIZE, not just the first page', async () => {
    const versions = Array.from({ length: 13 }, (_, i) => ({
      id: String(i + 1),
      data: { version: i + 1 },
    }));
    // Pad the target group's version-overflow victim to the very end of the
    // collection (past GROUP_PAGE_SIZE) with filler live groups ahead of it.
    const filler = Array.from({ length: GROUP_PAGE_SIZE + 5 }, (_, i) => ({
      id: `filler-${String(i).padStart(6, '0')}`,
      data: { participants: { uidA: { joinedAt: 1 } } },
    }));
    const target = {
      id: 'zzz-target',
      data: { participants: { uidA: { joinedAt: 1 } } },
      sub: { versions },
    };
    const { db, root } = makeStubDb({
      synced_quizzes: [...filler, target],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.versionOverflow).toBe(3);
    const targetDoc = root.synced_quizzes.find((d) => d.id === 'zzz-target')!;
    expect(targetDoc.sub!.versions).toHaveLength(VERSION_HISTORY_LIMIT);
  });
});

describe('runGcPlcOrphans — per-PLC category pagination past the first page', () => {
  // Before the fix, `sweepPlc` read each of activity / presence / every
  // soft-delete subcollection with a single un-paginated `.limit(500).get()`
  // and NO `orderBy` — so once a subcollection held more than 500 docs, the
  // fetched page was an arbitrary (doc-id-ordered, age-unrelated) slice, and
  // any doc outside that slice was silently never visited by any run, ever.
  // This is the identical bug class already fixed for cross-PLC iteration
  // (PLC_PAGE_SIZE) and the synced-group sweep (GROUP_PAGE_SIZE), one level
  // deeper: inside a single PLC's own subcollections.

  it('sweeps stale activity beyond the first category page, not just the first 500 docs', async () => {
    // 500 fresh docs with doc ids sorting BEFORE the stale one, so they fill
    // the entire first page and push the genuinely-stale doc out of it.
    const fresh = Array.from({ length: CATEGORY_PAGE_SIZE }, (_, i) => ({
      id: `fresh-${String(i).padStart(6, '0')}`,
      data: { createdAt: NOW - 1 * day },
    }));
    const stale = { id: 'zzz-stale', data: { createdAt: NOW - 120 * day } };
    const { db, root } = makeStubDb({
      plcs: [{ id: 'plc-1', data: {}, sub: { activity: [...fresh, stale] } }],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.activity).toBe(1);
    const remaining = root.plcs[0].sub!.activity.map((d) => d.id);
    expect(remaining).not.toContain('zzz-stale');
  });

  it('sweeps stale presence beyond the first category page, not just the first 500 docs', async () => {
    const fresh = Array.from({ length: CATEGORY_PAGE_SIZE }, (_, i) => ({
      id: `fresh-${String(i).padStart(6, '0')}`,
      data: { lastActiveAt: NOW - 60 * 1000 },
    }));
    const stale = {
      id: 'zzz-stale',
      data: { lastActiveAt: NOW - 10 * 60 * 1000 },
    };
    const { db, root } = makeStubDb({
      plcs: [{ id: 'plc-1', data: {}, sub: { presence: [...fresh, stale] } }],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.presence).toBe(1);
    const remaining = root.plcs[0].sub!.presence.map((d) => d.id);
    expect(remaining).not.toContain('zzz-stale');
  });

  it('hard-deletes an expired tombstone beyond the first category page, not just the first 500 docs', async () => {
    const fresh = Array.from({ length: CATEGORY_PAGE_SIZE }, (_, i) => ({
      id: `fresh-${String(i).padStart(6, '0')}`,
      data: { deletedAt: null },
    }));
    const expired = { id: 'zzz-stale', data: { deletedAt: NOW - 40 * day } };
    const { db, root } = makeStubDb({
      plcs: [{ id: 'plc-1', data: {}, sub: { notes: [...fresh, expired] } }],
    });

    const counts = await runGcPlcOrphans(db, NOW);

    expect(counts.tombstones).toBe(1);
    const remaining = root.plcs[0].sub!.notes.map((d) => d.id);
    expect(remaining).not.toContain('zzz-stale');
  });
});

describe('gcPlcOrphans — scheduled wrapper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('imports and exposes the onSchedule handler', async () => {
    // The mocked onSchedule returns the handler; importing must not throw.
    const mod = await import('./gcPlcOrphans');
    expect(typeof mod.gcPlcOrphans).toBe('function');
  });
});
