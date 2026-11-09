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
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';

import {
  claimPollCode,
  mintPollCode,
  mintPollCodeV1,
  normalizePollCodeInput,
  pollJoinId,
  resolvePollCode,
  type RecordMiss,
  CALLER_WINDOW_MS,
  GLOBAL_WINDOW_MS,
  POLL_CODE_CALLER_MAX_MISSES,
  POLL_CODE_GLOBAL_MAX_MISSES,
  POLL_CODE_MINT_MAX_PER_HOUR,
  RESERVATION_TTL_MS,
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
    resolvePollCode(stub.db as unknown as Db, uid, code, now, recordMiss).then(
      (join) => join?.sessionId ?? null
    );
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

  it('gives each device one voter id per session that is not its uid, kept on a rejoin', async () => {
    const stub = makeStubFirestore(live);
    const db = stub.db as unknown as Db;
    const first = await resolvePollCode(db, 'anon1', 'K3F9Q', NOW);
    expect(first?.voterId).toMatch(/^[0-9a-f]{20}$/);
    expect(first?.voterId).not.toContain('anon1');
    const again = await resolvePollCode(db, 'anon1', 'K3F9Q', NOW + 1000);
    expect(again?.voterId).toBe(first?.voterId);
    const other = await resolvePollCode(db, 'anon2', 'K3F9Q', NOW);
    expect(other?.voterId).not.toBe(first?.voterId);
    expect(stub.get(`poll_joins/${pollJoinId('t1_K3F9Q', 'anon1')}`)).toEqual(
      expect.objectContaining({ voterId: first?.voterId, joinedAt: NOW + 1000 })
    );
  });

  it('gives an older join without a voter id a new one', async () => {
    const stub = makeStubFirestore({
      ...live,
      [`poll_joins/${pollJoinId('t1_K3F9Q', 'anon1')}`]: {
        sessionId: 't1_K3F9Q',
        uid: 'anon1',
      },
    });
    const join = await resolvePollCode(
      stub.db as unknown as Db,
      'anon1',
      'K3F9Q',
      NOW
    );
    expect(join?.voterId).toMatch(/^[0-9a-f]{20}$/);
  });

  it('fails the call when the join cannot be recorded', async () => {
    const stub = makeStubFirestore(live);
    stub.hooks.beforeWrite = (_op, path) => {
      if (path.startsWith('poll_joins/')) throw new Error('down');
    };
    await expect(
      resolvePollCode(stub.db as unknown as Db, 'anon1', 'K3F9Q', NOW)
    ).rejects.toMatchObject({ code: 'unavailable' });
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

  it('refuses a capped caller with resource-exhausted, even for a live code', async () => {
    const { resolve } = setup();
    await fillCaller(resolve, 'sweeper', POLL_CODE_CALLER_MAX_MISSES);
    await expect(resolve('sweeper', 'K3F9Q')).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    // A retry of a code it already missed is still answered.
    expect(await resolve('sweeper', 'MISS0')).toBeNull();
    expect(await resolve('anon2', 'K3F9Q')).toBe('t1_K3F9Q');
  });

  it('lets a capped caller resolve again in a later window', async () => {
    const { resolve } = setup();
    await fillCaller(resolve, 'sweeper', POLL_CODE_CALLER_MAX_MISSES);
    expect(await resolve('sweeper', 'K3F9Q', NOW + CALLER_WINDOW_MS)).toBe(
      't1_K3F9Q'
    );
  });

  it('never refuses a valid code over the shared count, and warns once', async () => {
    const { resolve } = setup({
      ...live,
      [GLOBAL_DOC]: { misses: POLL_CODE_GLOBAL_MAX_MISSES },
      [CALLER_DOC('missing')]: { codes: ['ZZZZZ'] },
    });
    expect(await resolve('fresh-uid', 'K3F9Q')).toBe('t1_K3F9Q');
    expect(await resolve('missing', 'K3F9Q')).toBe('t1_K3F9Q');
    expect(await resolve('missing', 'YYYYY')).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
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
      reservedAt: NOW,
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

  it('reclaims only a stale reservation whose session never appeared', async () => {
    const old = NOW - RESERVATION_TTL_MS - 1;
    const { db } = setup({
      'poll_codes/AAAAA': { sessionId: 'x_AAAAA', reservedAt: NOW - 1000 },
      'poll_codes/CCCCC': { sessionId: 'x_CCCCC', updatedAt: old },
      'poll_sessions/x_CCCCC': { teacherUid: 'x' },
      'poll_codes/DDDDD': { sessionId: 'x_DDDDD', reservedAt: old },
    });
    const picks = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
    expect(await mintPollCode(db, 't1', NOW, () => picks.shift() ?? 0)).toBe(
      'DDDDD'
    );
  });

  it('refuses past the per-teacher mint cap', async () => {
    const { db } = setup({
      [`poll_code_limits/mint__t1__${Math.floor(NOW / CALLER_WINDOW_MS)}`]: {
        count: POLL_CODE_MINT_MAX_PER_HOUR,
      },
    });
    await expect(mintPollCode(db, 't1', NOW, () => 0)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(await mintPollCode(db, 't2', NOW, () => 0)).toBe('AAAAA');
  });

  it('makes a code resolve as soon as it is minted and its session written', async () => {
    const { stub, db, resolve } = setup({});
    const code = await mintPollCode(db, 't1', NOW, () => 2);
    stub.store.set(`poll_sessions/t1_${code}`, { teacherUid: 't1' });
    expect(await resolve('anon1', code)).toBe(`t1_${code}`);
  });
});

describe('mintPollCodeV1', () => {
  const call = mintPollCodeV1 as unknown as (req: unknown) => Promise<{
    code: string;
  }>;
  const tokenFor = (email: string) => ({
    email,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  const mintAs = (email: string, seed: Record<string, StubData> = {}) => {
    const { db } = setup(seed);
    vi.mocked(admin.firestore).mockReturnValue(db);
    return call({ auth: { uid: 'u1', token: tokenFor(email) } });
  };

  it.each([
    ['no member doc', {}],
    [
      'a student member doc',
      {
        'organizations/orono/members/704522@orono.k12.mn.us': {
          roleId: 'student',
        },
      },
    ],
    [
      'an inactive member doc',
      {
        'organizations/orono/members/704522@orono.k12.mn.us': {
          roleId: 'teacher',
          status: 'inactive',
        },
      },
    ],
  ])('refuses a verified district account with %s', async (_, seed) => {
    await expect(mintAs('704522@orono.k12.mn.us', seed)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('mints for an Orono staff member, whatever their address domain', async () => {
    const { code } = await mintAs('partner@example.org', {
      'organizations/orono/members/partner@example.org': {
        roleId: 'teacher',
        status: 'active',
      },
    });
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
  });

  it('mints for an admin with no member doc', async () => {
    const { code } = await mintAs('boss@example.org', {
      'admins/boss@example.org': {},
    });
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
  });
});

describe('claimPollCode', () => {
  const pollWidget = (joinCode: string) => ({
    type: 'poll',
    config: { joinCode },
  });
  const board = (over: StubData = {}): StubData => ({
    originalAuthor: 'tA',
    intendedMode: 'synced',
    participants: { tB: { role: 'collaborator', joinedAt: 1 } },
    widgets: [pollWidget('K3F9Q')],
    ...over,
  });
  const seed = (share: StubData, extra: Record<string, StubData> = {}) =>
    makeStubFirestore({
      'poll_codes/K3F9Q': { sessionId: 'tA_K3F9Q', teacherUid: 'tA' },
      'shared_boards/sb1': share,
      ...extra,
    });
  const claim = (
    stub: ReturnType<typeof makeStubFirestore>,
    uid: string,
    shareId = 'sb1'
  ) => claimPollCode(stub.db as unknown as Db, uid, 'K3F9Q', shareId);

  it('adds a Synced collaborator whose board shows the code', async () => {
    const stub = seed(board());
    expect(await claim(stub, 'tB')).toBe(true);
    expect(stub.get('poll_codes/K3F9Q')?.memberUids).toEqual(['tA', 'tB']);
  });

  it('adds the host when the code belongs to a collaborator', async () => {
    const stub = seed(board(), {
      'poll_codes/K3F9Q': { sessionId: 'tB_K3F9Q', teacherUid: 'tB' },
    });
    expect(await claim(stub, 'tA')).toBe(true);
    expect(stub.get('poll_codes/K3F9Q')?.memberUids).toEqual(['tB', 'tA']);
  });

  it('is a no-op for the holder and when no pointer exists', async () => {
    expect(await claim(seed(board()), 'tA')).toBe(true);
    const empty = makeStubFirestore({ 'shared_boards/sb1': board() });
    expect(await claim(empty, 'tB')).toBe(false);
    expect(empty.has('poll_codes/K3F9Q')).toBe(false);
  });

  it('refuses a teacher who is not on the board, or only views it', async () => {
    await expect(claim(seed(board()), 'tX')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    const viewer = board({
      participants: { tB: { role: 'viewer', joinedAt: 1 } },
    });
    await expect(claim(seed(viewer), 'tB')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it("refuses a board of the caller's own that the holder never joined", async () => {
    const own = board({ originalAuthor: 'tX', participants: {} });
    await expect(claim(seed(own), 'tX')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses a board that does not show the code', async () => {
    const other = board({ widgets: [pollWidget('ZZZZZ')] });
    await expect(claim(seed(other), 'tB')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses a missing, copy or substitute share', async () => {
    const missing = makeStubFirestore({
      'poll_codes/K3F9Q': { sessionId: 'tA_K3F9Q', teacherUid: 'tA' },
    });
    await expect(claim(missing, 'tB')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    for (const intendedMode of ['copy', 'substitute']) {
      await expect(
        claim(seed(board({ intendedMode })), 'tB')
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });

  it('counts linked collection members only when the collection lists the board', async () => {
    const share = board({
      originalAuthor: 'tX',
      participants: {},
      linkedCollectionId: 'lc1',
    });
    const link = (over: StubData = {}): StubData => ({
      hostUid: 'tA',
      mode: 'synced',
      participants: {},
      boards: [{ shareId: 'sb1', name: 'B', order: 0 }],
      ...over,
    });
    expect(
      await claim(seed(share, { 'linked_collections/lc1': link() }), 'tX')
    ).toBe(true);
    await expect(
      claim(
        seed(share, { 'linked_collections/lc1': link({ boards: [] }) }),
        'tX'
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      claim(
        seed(share, { 'linked_collections/lc1': link({ ended: true }) }),
        'tX'
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a malformed board id', async () => {
    await expect(claim(seed(board()), 'tB', 'a/b')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
