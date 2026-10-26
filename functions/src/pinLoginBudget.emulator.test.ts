// Runs only under the emulator: firebase emulators:exec --project demo-spartboard --only firestore "pnpm -C functions exec vitest run src/pinLoginBudget.emulator.test.ts"
import { describe, it, expect, beforeAll } from 'vitest';
import * as admin from 'firebase-admin';
import {
  decidePinLogin,
  pinLoginRefs,
  PIN_LOGIN_SESSION_MAX_FAILURES,
} from './studentIdentity';
import { pinIndexKey } from './classlinkShared';

const RUN = !!process.env.FIRESTORE_EMULATOR_HOST;

// A transaction that aborts under contention fails closed, exactly as pinLoginV1 treats it.
const attemptOn =
  (sessionId: string, roster: admin.firestore.DocumentReference) =>
  (pin: string, uid: string) => {
    const db = admin.firestore();
    const key = pinIndexKey('1', pin);
    return decidePinLogin(
      db,
      pinLoginRefs(db, sessionId, uid, key, 't1', [roster.id]),
      [roster.collection('pin_index').doc(key)],
      uid,
      key
    ).catch(() => ({ outcome: 'rate-limited' as const }));
  };

describe.skipIf(!RUN)('pinLoginV1 session budget against the emulator', () => {
  beforeAll(() => {
    if (admin.apps.length === 0)
      admin.initializeApp({ projectId: 'demo-spartboard' });
  });

  it('decides a concurrent burst against the counter it records in', async () => {
    const db = admin.firestore();
    const sessionId = `s_${Math.random().toString(36).slice(2, 8)}`;
    const roster = db.doc(`users/t1/rosters/r1_${sessionId}`);
    const rightKey = pinIndexKey('1', '4821');
    await roster.collection('pin_index').doc(rightKey).set({
      pseudonym: 'PS-right',
      classId: 'CL1',
      orgId: 'org',
    });
    await db.doc(`pin_login_attempts/session__${sessionId}`).set({
      windowStart: Date.now(),
      failures: PIN_LOGIN_SESSION_MAX_FAILURES - 1,
      dayStart: Date.now(),
      dayFailures: PIN_LOGIN_SESSION_MAX_FAILURES - 1,
    });

    const attempt = attemptOn(sessionId, roster);
    const wrong = Array.from({ length: 100 }, (_, i) =>
      attempt(String(5000 + i), `anon-${i}`)
    );
    const results = await Promise.all(wrong);
    const right = await attempt('4821', 'anon-right');

    const misses = results.filter((r) => r.outcome === 'miss').length;
    const stored = (
      await db.doc(`pin_login_attempts/session__${sessionId}`).get()
    ).data();
    // Only one miss fits the remaining budget; every probe that committed is counted.
    expect(misses).toBeLessThanOrEqual(1);
    expect(stored?.failures).toBeGreaterThanOrEqual(
      PIN_LOGIN_SESSION_MAX_FAILURES
    );
    expect(right.outcome).toBe('rate-limited');
  }, 120_000);

  it('lets a whole class join at once, with a few typos', async () => {
    const db = admin.firestore();
    const sessionId = `c_${Math.random().toString(36).slice(2, 8)}`;
    const roster = db.doc(`users/t1/rosters/r1_${sessionId}`);
    const pins = Array.from({ length: 35 }, (_, i) => String(1000 + i * 7));
    await Promise.all(
      pins.map((pin, i) =>
        roster
          .collection('pin_index')
          .doc(pinIndexKey('1', pin))
          .set({ pseudonym: `PS${i}`, classId: 'CL1', orgId: 'org' })
      )
    );
    const attempt = attemptOn(sessionId, roster);
    const results = await Promise.all([
      ...pins.map((pin, i) => attempt(pin, `kid-${i}`)),
      ...Array.from({ length: 5 }, (_, i) =>
        attempt(String(9000 + i), `typo-${i}`)
      ),
    ]);
    expect(
      results.slice(0, pins.length).every((r) => r.outcome === 'minted')
    ).toBe(true);
  }, 120_000);
});
