import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
    FieldValue: {
      increment: (n: number) => ({ __increment: n }),
      arrayUnion: (...v: unknown[]) => ({ __union: v }),
    },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

vi.mock('firebase-functions/logger', () => ({ warn: vi.fn() }));

import {
  mintPollCode,
  normalizePollCodeInput,
  pollJoinId,
  resolvePollCode,
  type RecordMiss,
  CALLER_WINDOW_MS,
  GLOBAL_WINDOW_MS,
  POLL_CODE_CALLER_MAX_MISSES,
  POLL_CODE_GLOBAL_MAX_MISSES,
} from './pollCodeResolve';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof resolvePollCode>[0];
const NOW = 60 * 60 * 1000 * 10;
const CALLER_DOC = (uid: string, now = NOW) =>
  `poll_code_limits/uid__${uid}__${Math.floor(now / CALLER_WINDOW_MS)}`;
const GLOBAL_DOC = `poll_code_limits/global__${Math.floor(NOW / GLOBAL_WINDOW_MS)}`;

const live: Record<string, StubData> = {
  'poll_codes/K3F9Q': { sessionId: 't1_K3F9Q', teacherUid: 't1' },
  'poll_sessions/t1_K3F9Q': { teacherUid: 't1', active: true },
};

const setup = (seed: Record<string, StubData> = live) => {
  const stub = makeStubFirestore(seed);
  // Plain read-modify-write stand-in for the FieldValue increments.
  const recordMiss: RecordMiss = (caller, global, code) => {
    const c = stub.get(caller.path);
    const codes = Array.isArray(c?.codes) ? (c.codes as string[]) : [];
    stub.store.set(caller.path, { codes: [...codes, code] });
    const misses = stub.get(global.path)?.misses;
    stub.store.set(global.path, {
      misses: (typeof misses === 'number' ? misses : 0) + 1,
    });
    return Promise.resolve();
  };
  const resolve = (uid: string, code: string, now = NOW) =>
    resolvePollCode(stub.db as unknown as Db, uid, code, now, recordMiss);
  return { stub, db: stub.db as unknown as Db, resolve };
};

const fillCaller = async (
  resolve: (uid: string, code: string) => Promise<string | null>,
  uid: string,
  n: number
) => {
  for (let i = 0; i < n; i += 1) await resolve(uid, `MISS${i}`);
};

describe('normalizePollCodeInput', () => {
  it('matches the client normalizer and rejects non-codes', () => {
    expect(normalizePollCodeInput(' k3f-9q ')).toBe('K3F9Q');
    expect(normalizePollCodeInput('')).toBe('');
    expect(normalizePollCodeInput(42)).toBe('');
    expect(normalizePollCodeInput('A'.repeat(17))).toBe('');
  });
});

describe('resolvePollCode', () => {
  it('resolves a live code and records the join', async () => {
    const { stub, resolve } = setup();
    expect(await resolve('anon1', 'K3F9Q')).toBe('t1_K3F9Q');
    expect(stub.get(`poll_joins/${pollJoinId('t1_K3F9Q', 'anon1')}`)).toEqual(
      expect.objectContaining({ sessionId: 't1_K3F9Q', uid: 'anon1' })
    );
  });

  it('records no join for a pointer whose session is gone', async () => {
    const { stub, resolve } = setup({
      'poll_codes/K3F9Q': live['poll_codes/K3F9Q'],
    });
    expect(await resolve('anon1', 'K3F9Q')).toBeNull();
    expect(stub.has(`poll_joins/${pollJoinId('t1_K3F9Q', 'anon1')}`)).toBe(
      false
    );
  });

  it('counts each distinct miss once, so a retry of the same code is free', async () => {
    const { stub, resolve } = setup();
    for (let i = 0; i < 3; i += 1) {
      expect(await resolve('anon1', 'AAAAA')).toBeNull();
    }
    expect(stub.get(CALLER_DOC('anon1'))?.codes).toEqual(['AAAAA']);
    expect(stub.get(GLOBAL_DOC)?.misses).toBe(1);
  });

  it('stops resolving for a caller after the miss cap, even a live code', async () => {
    const { resolve } = setup();
    await fillCaller(resolve, 'sweeper', POLL_CODE_CALLER_MAX_MISSES);
    expect(await resolve('sweeper', 'K3F9Q')).toBeNull();
    expect(await resolve('anon2', 'K3F9Q')).toBe('t1_K3F9Q');
  });

  it('lets a capped caller resolve again in a later window', async () => {
    const { resolve } = setup();
    await fillCaller(resolve, 'sweeper', POLL_CODE_CALLER_MAX_MISSES);
    expect(await resolve('sweeper', 'K3F9Q', NOW + CALLER_WINDOW_MS)).toBe(
      't1_K3F9Q'
    );
  });

  it('once the shared cap trips, blocks only callers already missing', async () => {
    const { resolve } = setup({
      ...live,
      [GLOBAL_DOC]: { misses: POLL_CODE_GLOBAL_MAX_MISSES },
      [CALLER_DOC('missing')]: { codes: ['ZZZZZ'] },
    });
    // A caller with no misses still joins, and so does a retry of an earlier code.
    expect(await resolve('fresh-uid', 'K3F9Q')).toBe('t1_K3F9Q');
    expect(await resolve('missing', 'ZZZZZ')).toBeNull();
    expect(await resolve('missing', 'K3F9Q')).toBeNull();
  });

  it('frees the shared cap in the next 10-minute window', async () => {
    const { resolve } = setup({
      ...live,
      [GLOBAL_DOC]: { misses: POLL_CODE_GLOBAL_MAX_MISSES },
      [CALLER_DOC('missing')]: { codes: ['ZZZZZ'] },
    });
    expect(await resolve('missing', 'K3F9Q', NOW + GLOBAL_WINDOW_MS)).toBe(
      't1_K3F9Q'
    );
  });

  it('never fails the call when a counter write fails', async () => {
    const stub = makeStubFirestore(live);
    const failing: RecordMiss = () => Promise.reject(new Error('contention'));
    await expect(
      resolvePollCode(stub.db as unknown as Db, 'a', 'AAAAA', NOW, failing)
    ).resolves.toBeNull();
  });

  it('counts misses with blind increments by default', async () => {
    const stub = makeStubFirestore(live);
    await resolvePollCode(stub.db as unknown as Db, 'a', 'AAAAA', NOW);
    const byPath = new Map(stub.writes.map((w) => [w.path, w.data]));
    expect(byPath.get(GLOBAL_DOC)?.misses).toEqual({ __increment: 1 });
    expect(byPath.get(CALLER_DOC('a'))?.codes).toEqual({ __union: ['AAAAA'] });
  });

  it('ignores an empty code', async () => {
    const { stub, resolve } = setup();
    expect(await resolve('anon1', '')).toBeNull();
    expect(stub.writes).toHaveLength(0);
  });
});

describe('mintPollCode', () => {
  it('reserves a free code with the pointer fields pollCodePointer writes', async () => {
    const { stub, db } = setup({
      'poll_codes/AAAAA': { sessionId: 'x_AAAAA' },
    });
    const picks = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    expect(await mintPollCode(db, 't1', NOW, () => picks.shift() ?? 0)).toBe(
      'CCCCC'
    );
    expect(stub.get('poll_codes/CCCCC')).toEqual({
      sessionId: 't1_CCCCC',
      teacherUid: 't1',
      updatedAt: NOW,
    });
    expect(stub.get('poll_codes/AAAAA')).toEqual({ sessionId: 'x_AAAAA' });
  });

  it('never hands the same code to two mints', async () => {
    const { db } = setup({});
    const first = await mintPollCode(db, 't1', NOW, () => 0);
    expect(first).toBe('AAAAA');
    await expect(mintPollCode(db, 't2', NOW, () => 0)).rejects.toThrow(
      'Could not generate a unique poll join code.'
    );
  });

  it('makes a code resolve as soon as it is minted and its session written', async () => {
    const { stub, db, resolve } = setup({});
    const code = await mintPollCode(db, 't1', NOW, () => 2);
    stub.store.set(`poll_sessions/t1_${code}`, { teacherUid: 't1' });
    expect(await resolve('anon1', code)).toBe(`t1_${code}`);
  });
});
