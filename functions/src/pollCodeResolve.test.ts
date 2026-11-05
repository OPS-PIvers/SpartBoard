import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    Timestamp: { fromMillis: (ms: number) => ({ ms }) },
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

import {
  mintPollCode,
  normalizePollCodeInput,
  pollJoinId,
  resolvePollCode,
  POLL_CODE_CALLER_MAX_MISSES,
  POLL_CODE_GLOBAL_MAX_MISSES,
} from './pollCodeResolve';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

type Db = Parameters<typeof resolvePollCode>[0];
const NOW = 10 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const live: Record<string, StubData> = {
  'poll_codes/K3F9Q': { sessionId: 't1_K3F9Q', teacherUid: 't1' },
  'poll_sessions/t1_K3F9Q': { teacherUid: 't1', active: true },
};

const setup = (seed: Record<string, StubData> = live) => {
  const stub = makeStubFirestore(seed);
  return { stub, db: stub.db as unknown as Db };
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
  it('resolves a live code and records the join that opens the session doc', async () => {
    const { stub, db } = setup();
    expect(await resolvePollCode(db, 'anon1', 'K3F9Q', NOW)).toBe('t1_K3F9Q');
    expect(stub.get(`poll_joins/${pollJoinId('t1_K3F9Q', 'anon1')}`)).toEqual(
      expect.objectContaining({ sessionId: 't1_K3F9Q', uid: 'anon1' })
    );
  });

  it('records no join for a pointer whose session is gone', async () => {
    const { stub, db } = setup({
      'poll_codes/K3F9Q': live['poll_codes/K3F9Q'],
    });
    expect(await resolvePollCode(db, 'anon1', 'K3F9Q', NOW)).toBeNull();
    expect(stub.has(`poll_joins/${pollJoinId('t1_K3F9Q', 'anon1')}`)).toBe(
      false
    );
  });

  it('counts each distinct miss once, so a retry of the same code is free', async () => {
    const { stub, db } = setup();
    for (let i = 0; i < 3; i += 1) {
      expect(await resolvePollCode(db, 'anon1', 'AAAAA', NOW)).toBeNull();
    }
    expect(stub.get('poll_code_limits/uid__anon1')?.codes).toEqual(['AAAAA']);
    expect(stub.get('poll_code_limits/global__10')?.misses).toBe(1);
  });

  it('stops resolving for a caller after the miss cap, even a live code', async () => {
    const { db } = setup();
    for (let i = 0; i < POLL_CODE_CALLER_MAX_MISSES; i += 1) {
      await resolvePollCode(db, 'sweeper', `MISS${i}`, NOW);
    }
    expect(await resolvePollCode(db, 'sweeper', 'K3F9Q', NOW)).toBeNull();
    // Another caller is unaffected.
    expect(await resolvePollCode(db, 'anon2', 'K3F9Q', NOW)).toBe('t1_K3F9Q');
  });

  it('lets a capped caller resolve again in a later hour', async () => {
    const { db } = setup();
    for (let i = 0; i < POLL_CODE_CALLER_MAX_MISSES; i += 1) {
      await resolvePollCode(db, 'sweeper', `MISS${i}`, NOW);
    }
    expect(await resolvePollCode(db, 'sweeper', 'K3F9Q', NOW + HOUR)).toBe(
      't1_K3F9Q'
    );
  });

  it('stops every lookup once the shared miss cap is spent, so fresh uids cannot reset it', async () => {
    const { stub, db } = setup({
      ...live,
      'poll_code_limits/global__10': { misses: POLL_CODE_GLOBAL_MAX_MISSES },
    });
    expect(await resolvePollCode(db, 'fresh-uid', 'K3F9Q', NOW)).toBeNull();
    expect(stub.has(`poll_joins/${pollJoinId('t1_K3F9Q', 'fresh-uid')}`)).toBe(
      false
    );
  });

  it('ignores an empty code', async () => {
    const { stub, db } = setup();
    expect(await resolvePollCode(db, 'anon1', '', NOW)).toBeNull();
    expect(stub.writes).toHaveLength(0);
  });
});

describe('mintPollCode', () => {
  it('skips codes a pointer already holds', async () => {
    const { db } = setup({ 'poll_codes/AAAAA': { sessionId: 't1_AAAAA' } });
    const picks = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    expect(await mintPollCode(db, () => picks.shift() ?? 0)).toBe('CCCCC');
  });

  it('gives up after repeated collisions', async () => {
    const { db } = setup({ 'poll_codes/AAAAA': { sessionId: 't1_AAAAA' } });
    await expect(mintPollCode(db, () => 0)).rejects.toThrow(
      'Could not generate a unique poll join code.'
    );
  });
});
