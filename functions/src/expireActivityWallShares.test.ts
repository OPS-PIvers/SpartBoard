// Unit tests for the `expireActivityWallShares` nightly-style sweep.
//
// Regression coverage for the bug: `ActivityWallShareModal` flips
// `publiclyShared: true` onto `activity_wall_sessions/{sessionId}` when a
// gallery link is created, but nothing ever flipped it back to `false` when
// the corresponding `shared_activity_walls` share expired or was revoked.
// Since firestore.rules gates the `submissions` subcollection read (and the
// Storage photo read) on that flag alone — not on the share doc's
// `revoked`/`expiresAt` — a caller who already knows `sessionId` could keep
// reading every submission/photo forever after the teacher's link "expired".
//
// Two layers, mirroring `gcPlcOrphans.test.ts`:
//   1. PURE DECISION HELPER — `isLapsedShare`.
//   2. SWEEP — `runExpireActivityWallShares` against a stub Firestore that
//      emulates the Admin SDK surface used (where/limit/get, doc().update()).

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

import {
  isLapsedShare,
  runExpireActivityWallShares,
} from './expireActivityWallShares';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('isLapsedShare', () => {
  it('is NOT lapsed when permanent (expiresAt null/absent) and not revoked', () => {
    expect(isLapsedShare({ expiresAt: null }, NOW)).toBe(false);
    expect(isLapsedShare({}, NOW)).toBe(false);
  });

  it('is NOT lapsed while expiresAt is still in the future', () => {
    expect(isLapsedShare({ expiresAt: NOW + DAY }, NOW)).toBe(false);
  });

  it('IS lapsed once expiresAt has passed', () => {
    expect(isLapsedShare({ expiresAt: NOW - 1 }, NOW)).toBe(true);
    expect(isLapsedShare({ expiresAt: NOW }, NOW)).toBe(true);
  });

  it('IS lapsed when revoked, regardless of expiresAt', () => {
    expect(isLapsedShare({ revoked: true, expiresAt: NOW + DAY }, NOW)).toBe(
      true
    );
    expect(isLapsedShare({ revoked: true, expiresAt: null }, NOW)).toBe(true);
  });

  it('ignores a malformed expiresAt (non-number) — treated as permanent', () => {
    expect(isLapsedShare({ expiresAt: 'nope' }, NOW)).toBe(false);
  });
});

// ===========================================================================
// Sweep against a stub Firestore
// ===========================================================================

interface StubShareDoc {
  id: string;
  data: Record<string, unknown>;
}

/**
 * In-memory Firestore mirroring the Admin SDK surface
 * `runExpireActivityWallShares` uses:
 *   db.collection('shared_activity_walls').where(f, op, v).limit(n).get()
 *   db.collection('activity_wall_sessions').doc(id).update(data)
 * Only the where clauses this sweep issues are supported (le/eq on
 * expiresAt/revoked/sessionId) — enough to faithfully exercise the sweep
 * without pulling in the Firestore emulator.
 */
function makeStubDb(seed: {
  shares?: StubShareDoc[];
  sessions?: Record<string, Record<string, unknown>>;
}) {
  const shares = seed.shares ?? [];
  const sessions: Record<string, Record<string, unknown>> = {
    ...(seed.sessions ?? {}),
  };
  const updates: Record<string, Record<string, unknown>[]> = {};

  function matches(
    doc: StubShareDoc,
    filters: Array<[string, string, unknown]>
  ): boolean {
    return filters.every(([field, op, value]) => {
      const actual = doc.data[field];
      if (op === '<=')
        return typeof actual === 'number' && actual <= (value as number);
      if (op === '==') return actual === value;
      throw new Error(`Unsupported op in stub: ${op}`);
    });
  }

  function sharedActivityWallsCollection(
    filters: Array<[string, string, unknown]> = [],
    lim?: number
  ) {
    return {
      where: (field: string, op: string, value: unknown) =>
        sharedActivityWallsCollection([...filters, [field, op, value]], lim),
      limit: (n: number) => sharedActivityWallsCollection(filters, n),
      get: () => {
        const rows = shares.filter((d) => matches(d, filters));
        const sliced = lim === undefined ? rows : rows.slice(0, lim);
        return Promise.resolve({
          docs: sliced.map((d) => ({ id: d.id, data: () => d.data })),
        });
      },
    };
  }

  const db = {
    collection: (name: string) => {
      if (name === 'shared_activity_walls') {
        return sharedActivityWallsCollection();
      }
      if (name === 'activity_wall_sessions') {
        return {
          doc: (sessionId: string) => ({
            get: () =>
              Promise.resolve({
                exists: sessionId in sessions,
                data: () => sessions[sessionId],
              }),
            update: (data: Record<string, unknown>) => {
              if (!(sessionId in sessions)) {
                const err = new Error('no such document') as Error & {
                  code: number;
                };
                err.code = 5;
                return Promise.reject(err);
              }
              sessions[sessionId] = { ...sessions[sessionId], ...data };
              updates[sessionId] = [...(updates[sessionId] ?? []), data];
              return Promise.resolve();
            },
          }),
        };
      }
      throw new Error(`Unexpected collection in stub: ${name}`);
    },
  };

  return {
    db: db as unknown as Parameters<typeof runExpireActivityWallShares>[0],
    sessions,
    updates,
  };
}

describe('runExpireActivityWallShares', () => {
  it('relocks a session once its only share has expired', async () => {
    const { db, sessions } = makeStubDb({
      shares: [
        {
          id: 'share-1',
          data: { sessionId: 'teacher1_act1', expiresAt: NOW - DAY },
        },
      ],
      sessions: { teacher1_act1: { publiclyShared: true } },
    });

    const result = await runExpireActivityWallShares(db, NOW);

    expect(result).toEqual({ lapsedShares: 1, sessionsRelocked: 1 });
    expect(sessions.teacher1_act1.publiclyShared).toBe(false);
  });

  it('relocks a session once its only share is revoked (expiresAt still in the future)', async () => {
    const { db, sessions } = makeStubDb({
      shares: [
        {
          id: 'share-1',
          data: {
            sessionId: 'teacher1_act1',
            revoked: true,
            expiresAt: NOW + DAY,
          },
        },
      ],
      sessions: { teacher1_act1: { publiclyShared: true } },
    });

    const result = await runExpireActivityWallShares(db, NOW);

    expect(result).toEqual({ lapsedShares: 1, sessionsRelocked: 1 });
    expect(sessions.teacher1_act1.publiclyShared).toBe(false);
  });

  it('does NOT relock a session that still has a live (permanent) share', async () => {
    // Re-share scenario: one expired link + one permanent link still active
    // for the SAME session — publiclyShared must stay true.
    const { db, sessions } = makeStubDb({
      shares: [
        {
          id: 'share-old',
          data: { sessionId: 'teacher1_act1', expiresAt: NOW - DAY },
        },
        {
          id: 'share-new',
          data: { sessionId: 'teacher1_act1', expiresAt: null },
        },
      ],
      sessions: { teacher1_act1: { publiclyShared: true } },
    });

    const result = await runExpireActivityWallShares(db, NOW);

    expect(result).toEqual({ lapsedShares: 1, sessionsRelocked: 0 });
    expect(sessions.teacher1_act1.publiclyShared).toBe(true);
  });

  it('leaves a permanent (never-expiring) share untouched', async () => {
    const { db, sessions } = makeStubDb({
      shares: [
        {
          id: 'share-1',
          data: { sessionId: 'teacher1_act1', expiresAt: null },
        },
      ],
      sessions: { teacher1_act1: { publiclyShared: true } },
    });

    const result = await runExpireActivityWallShares(db, NOW);

    expect(result).toEqual({ lapsedShares: 0, sessionsRelocked: 0 });
    expect(sessions.teacher1_act1.publiclyShared).toBe(true);
  });

  it('is idempotent — a second run on an already-relocked session finds nothing new to do', async () => {
    const { db, sessions } = makeStubDb({
      shares: [
        {
          id: 'share-1',
          data: { sessionId: 'teacher1_act1', expiresAt: NOW - DAY },
        },
      ],
      sessions: { teacher1_act1: { publiclyShared: true } },
    });

    await runExpireActivityWallShares(db, NOW);
    expect(sessions.teacher1_act1.publiclyShared).toBe(false);

    const second = await runExpireActivityWallShares(db, NOW);
    expect(second).toEqual({ lapsedShares: 1, sessionsRelocked: 0 });
    expect(sessions.teacher1_act1.publiclyShared).toBe(false);
  });

  it('does not throw when the session doc no longer exists (nothing to relock)', async () => {
    const { db } = makeStubDb({
      shares: [
        {
          id: 'share-1',
          data: { sessionId: 'deleted-session', expiresAt: NOW - DAY },
        },
      ],
      sessions: {},
    });

    const result = await runExpireActivityWallShares(db, NOW);
    expect(result).toEqual({ lapsedShares: 1, sessionsRelocked: 0 });
  });

  it('handles multiple lapsed shares across different sessions', async () => {
    const { db, sessions } = makeStubDb({
      shares: [
        {
          id: 'share-a',
          data: { sessionId: 'teacherA_act1', expiresAt: NOW - DAY },
        },
        {
          id: 'share-b',
          data: { sessionId: 'teacherB_act1', revoked: true, expiresAt: null },
        },
      ],
      sessions: {
        teacherA_act1: { publiclyShared: true },
        teacherB_act1: { publiclyShared: true },
      },
    });

    const result = await runExpireActivityWallShares(db, NOW);

    expect(result).toEqual({ lapsedShares: 2, sessionsRelocked: 2 });
    expect(sessions.teacherA_act1.publiclyShared).toBe(false);
    expect(sessions.teacherB_act1.publiclyShared).toBe(false);
  });
});

describe('expireActivityWallShares — scheduled wrapper', () => {
  it('imports and exposes the onSchedule handler', async () => {
    const mod = await import('./expireActivityWallShares');
    expect(typeof mod.expireActivityWallShares).toBe('function');
  });
});
