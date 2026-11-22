import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as admin from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: vi.fn() }));

import {
  __resetReleaseLimits,
  handleClaimPaperResponse,
  handleReleasePaperResponse,
} from './claimPaperResponse';
import {
  PIN_LOGIN_MAX_FAILURES,
  PIN_LOGIN_SESSION_MAX_FAILURES,
} from './studentIdentity';

const NOW = 1_800_000_000_000;
const SESSION = 'sess-1';
const TEACHER = 'teacher-1';
const KEY = 'pin-period_1-1234';
const ROW_PATH = `quiz_sessions/${SESSION}/responses/${KEY}`;
const ANON = { uid: 'anon-1', anonymous: true };

let store: Map<string, Record<string, unknown>>;

interface FakeRef {
  path: string;
  id: string;
  collection: (name: string) => { doc: (id: string) => FakeRef };
  get: () => Promise<FakeSnap>;
}
interface FakeSnap {
  exists: boolean;
  ref: FakeRef;
  data: () => Record<string, unknown> | undefined;
}

function ref(path: string): FakeRef {
  return {
    path,
    id: path.split('/').pop() ?? '',
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
    get: () => Promise.resolve(snap(path)),
  };
}
function snap(path: string): FakeSnap {
  const d = store.get(path);
  return { exists: !!d, ref: ref(path), data: () => d };
}
const db = {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: async <T>(
    fn: (tx: {
      get: (r: FakeRef) => Promise<FakeSnap>;
      set: (r: FakeRef, d: Record<string, unknown>) => void;
      update: (r: FakeRef, d: Record<string, unknown>) => void;
    }) => Promise<T>
  ): Promise<T> =>
    fn({
      get: (r) => Promise.resolve(snap(r.path)),
      set: (r, d) => store.set(r.path, d),
      update: (r, d) => store.set(r.path, { ...store.get(r.path), ...d }),
    }),
} as unknown as admin.firestore.Firestore;

const session = (extra: Record<string, unknown> = {}) =>
  store.set(`quiz_sessions/${SESSION}`, {
    teacherUid: TEACHER,
    status: 'active',
    periodNames: ['Period 1'],
    paperWrittenQuestionIds: ['q2'],
    ...extra,
  });
const row = (extra: Record<string, unknown> = {}) =>
  store.set(ROW_PATH, {
    studentUid: KEY,
    pin: '1234',
    classPeriod: 'Period 1',
    status: 'joined',
    answers: [{ questionId: 'q2', paperScanId: 'scan-1' }],
    paperWrittenBatchId: 'batch-1',
    ...extra,
  });
const claim = (
  caller: { uid: string; anonymous: boolean } | null = ANON,
  pin = '1234'
) =>
  handleClaimPaperResponse(
    db,
    caller,
    { sessionId: SESSION, pin, period: 'Period 1' },
    NOW
  );

beforeEach(() => {
  store = new Map();
  session();
  row();
});

describe('handleClaimPaperResponse', () => {
  it('hands an unowned scan-first row to an anonymous PIN device and keeps its answers', async () => {
    await expect(claim()).resolves.toEqual({ claimed: true });
    const after = store.get(ROW_PATH);
    expect(after?.studentUid).toBe('anon-1');
    expect(after?.answers).toEqual([
      { questionId: 'q2', paperScanId: 'scan-1' },
    ]);
    expect(after?.paperWrittenBatchId).toBe('batch-1');
    expect(after?.lastWriteAt).toBeInstanceOf(FieldValue);
  });

  it('is idempotent for the device that already holds the row', async () => {
    row({ studentUid: 'anon-1' });
    await expect(claim()).resolves.toEqual({ claimed: true });
  });

  it('refuses a signed-in (non-anonymous) caller', async () => {
    await expect(
      claim({ uid: 'sso-1', anonymous: false })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(claim(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
  });

  it('refuses a wrong PIN and counts it as a miss', async () => {
    await expect(claim(ANON, '9999')).resolves.toEqual({
      claimed: false,
      reason: 'not-found',
    });
    expect(store.get(`pin_login_attempts/${SESSION}__anon-1`)?.failures).toBe(
      1
    );
    expect(store.get(`pin_login_attempts/session__${SESSION}`)?.failures).toBe(
      1
    );
  });

  it('refuses a row another device already owns without spending the shared budgets', async () => {
    row({ studentUid: 'anon-other' });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'not-found',
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe('anon-other');
    expect(store.has(`pin_login_attempts/session__${SESSION}`)).toBe(false);
    expect(store.has(`pin_login_attempts/${SESSION}__anon-1`)).toBe(false);
  });

  it('refuses a device-joined row with no scanned answers without counting a miss', async () => {
    store.set(ROW_PATH, {
      studentUid: 'anon-other',
      pin: '1234',
      classPeriod: 'Period 1',
      status: 'in-progress',
      answers: [],
    });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'not-found',
    });
    expect(store.has(`pin_login_attempts/session__${SESSION}`)).toBe(false);
  });

  it('counts a miss when no row exists at the key', async () => {
    store.delete(ROW_PATH);
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'not-found',
    });
    expect(store.get(`pin_login_attempts/session__${SESSION}`)?.failures).toBe(
      1
    );
  });

  it('refuses a row with no scanned written answers', async () => {
    row({ paperWrittenBatchId: undefined });
    await expect(claim()).resolves.toMatchObject({ claimed: false });
  });

  it('refuses a retired PIN as a counted miss, so retirement cannot be probed', async () => {
    session({ rosterIds: ['r1'] });
    store.set(`users/${TEACHER}/retired_pins/period_1__1234`, {
      rosterIds: ['r1'],
    });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'not-found',
    });
    expect(store.get(`pin_login_attempts/session__${SESSION}`)?.failures).toBe(
      1
    );
    expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
  });

  describe('per-period session', () => {
    const periods = (extra: Record<string, unknown> = {}) =>
      session({
        periodAccess: {
          c1: { label: 'Period 1', state: 'open' },
          c2: { label: 'Period 2', state: 'open' },
          ...extra,
        },
      });

    it('writes the period key the row belongs to with the claim', async () => {
      periods();
      await expect(claim()).resolves.toEqual({ claimed: true });
      expect(store.get(ROW_PATH)).toMatchObject({
        studentUid: 'anon-1',
        classId: 'c1',
      });
    });

    it('takes the picked key when two periods share the label, and refuses a guess', async () => {
      periods({ c3: { label: 'Period 1', state: 'open' } });
      const pick = (classId: string) =>
        handleClaimPaperResponse(
          db,
          ANON,
          { sessionId: SESSION, pin: '1234', period: 'Period 1', classId },
          NOW
        );
      await expect(pick('c2')).resolves.toEqual({
        claimed: false,
        reason: 'period',
      });
      expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
      await expect(pick('c3')).resolves.toEqual({ claimed: true });
      expect(store.get(ROW_PATH)?.classId).toBe('c3');
    });

    it('refuses before claiming when no period carries the row label', async () => {
      session({ periodAccess: { c2: { label: 'Period 2', state: 'open' } } });
      await expect(claim()).resolves.toEqual({
        claimed: false,
        reason: 'period',
      });
      expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
    });
  });

  it('refuses an ended run and a passed closeAt, but keeps the 2-minute grace', async () => {
    session({ status: 'ended', endedAt: NOW - 200000 });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'closed',
    });
    session({ closeAt: NOW - 200000 });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'closed',
    });
    session({ closeAt: NOW - 60000 });
    await expect(claim()).resolves.toEqual({ claimed: true });
  });

  it('refuses before openAt', async () => {
    session({ openAt: NOW + 600000 });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'not-open',
    });
  });

  it('refuses a per-period session in assessment mode', async () => {
    session({
      periodAccess: { c1: { state: 'open' } },
      accessMode: 'assessment',
    });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'assessment',
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
  });

  it('refuses when anonymous joins are off or the session is not hybrid', async () => {
    session({ allowAnonymousJoin: false });
    await expect(claim()).resolves.toMatchObject({ claimed: false });
    session({ paperWrittenQuestionIds: [] });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'not-hybrid',
    });
  });

  it('sends a sign-in-length PIN on a ClassLink-rostered session to pinLoginV1', async () => {
    session({ rosterIds: ['r1'], classIds: ['c1'] });
    await expect(claim(ANON, '123456')).resolves.toEqual({
      claimed: false,
      reason: 'pin-login-required',
    });
  });

  it('stops a caller who has used up its miss budget, even on a real row', async () => {
    store.set(`pin_login_attempts/${SESSION}__anon-1`, {
      windowStart: NOW,
      failures: PIN_LOGIN_MAX_FAILURES,
      indexKeys: [],
    });
    await expect(claim()).resolves.toEqual({
      claimed: false,
      reason: 'rate-limited',
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
  });

  it('stops fresh anonymous uids once the session budget is spent', async () => {
    store.set(`pin_login_attempts/session__${SESSION}`, {
      windowStart: NOW,
      failures: PIN_LOGIN_SESSION_MAX_FAILURES,
      dayStart: NOW,
      dayFailures: PIN_LOGIN_SESSION_MAX_FAILURES,
    });
    await expect(
      claim({ uid: 'anon-fresh', anonymous: true })
    ).resolves.toEqual({ claimed: false, reason: 'rate-limited' });
  });
});

describe('handleReleasePaperResponse', () => {
  const TEACHER_CALLER = { uid: TEACHER, anonymous: false, studentRole: false };
  const release = (
    caller: Parameters<typeof handleReleasePaperResponse>[1] = TEACHER_CALLER,
    raw: unknown = { sessionId: SESSION, responseKey: KEY },
    now = NOW
  ) => handleReleasePaperResponse(db, caller, raw, now);

  beforeEach(() => {
    __resetReleaseLimits();
    row({ studentUid: 'anon-1' });
  });

  it('puts a claimed row back at its PIN key, then the next PIN join can claim it', async () => {
    await expect(release()).resolves.toEqual({ released: true });
    const after = store.get(ROW_PATH);
    expect(after?.studentUid).toBe(KEY);
    expect(after?.answers).toEqual([
      { questionId: 'q2', paperScanId: 'scan-1' },
    ]);
    await expect(claim({ uid: 'anon-2', anonymous: true })).resolves.toEqual({
      claimed: true,
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe('anon-2');
  });

  it('is idempotent for a row already at its PIN key', async () => {
    row();
    await expect(release()).resolves.toEqual({ released: true });
    expect(store.get(ROW_PATH)?.studentUid).toBe(KEY);
  });

  it('refuses a teacher who does not own the session', async () => {
    await expect(
      release({ uid: 'teacher-2', anonymous: false, studentRole: false })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.get(ROW_PATH)?.studentUid).toBe('anon-1');
  });

  it('refuses students, anonymous devices and signed-out callers', async () => {
    await expect(
      release({ uid: TEACHER, anonymous: false, studentRole: true })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      release({ uid: 'anon-1', anonymous: true, studentRole: false })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(release(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe('anon-1');
  });

  it('refuses a key that is not a PIN row or a path', async () => {
    for (const responseKey of ['uid-1', 'pin-a/b', '']) {
      await expect(
        release(TEACHER_CALLER, { sessionId: SESSION, responseKey })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });

  it('leaves a row with no scanned written answers alone', async () => {
    row({ studentUid: 'anon-1', paperWrittenBatchId: undefined });
    await expect(release()).resolves.toEqual({
      released: false,
      reason: 'not-claimed',
    });
    expect(store.get(ROW_PATH)?.studentUid).toBe('anon-1');
  });

  it('reports a missing row', async () => {
    store.delete(ROW_PATH);
    await expect(release()).resolves.toEqual({
      released: false,
      reason: 'not-found',
    });
  });

  it('rate limits a teacher after 30 releases a minute', async () => {
    for (let i = 0; i < 30; i++) await release();
    await expect(release()).resolves.toEqual({
      released: false,
      reason: 'rate-limited',
    });
    await expect(
      release(TEACHER_CALLER, undefined, NOW + 61_000)
    ).resolves.toEqual({ released: true });
  });
});
