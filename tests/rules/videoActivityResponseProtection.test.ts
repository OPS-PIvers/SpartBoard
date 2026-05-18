// Firestore security-rules regression for the Video Activity response update
// rule (firestore.rules ~line 2415, student branch). The student-branch
// whitelist on `request.resource.data.diff(resource.data).XXX().hasOnly([...])`
// must use `.affectedKeys()` rather than `.changedKeys()`.
//
// Why this matters — the CEL distinction:
//   - `changedKeys()` returns the set of keys that exist in BOTH the old
//     and new maps with DIFFERENT values. New keys added by the write are
//     NOT included.
//   - `affectedKeys()` returns the union of added, removed, and changed
//     keys — i.e. every key the write touched.
//
// Consequence with `changedKeys().hasOnly([whitelist])`: a write that adds
// a brand-new arbitrary field (one that did not exist on the previous
// document) leaves `changedKeys()` empty, so `hasOnly(...)` trivially
// passes — bypassing the whitelist entirely. The `score == resource.data.score`
// immutability check sitting above the whitelist blocks score smuggling
// specifically, but any unrelated new field (e.g. injected metadata,
// future protection field added to the doc, etc.) gets through.
//
// This test pins the affectedKeys posture so a future edit cannot regress
// the rule back to changedKeys.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-va-response-protection';
const TEACHER_UID = 'teacher-uid-vrp';
const STUDENT_UID = 'student-uid-vrp';
const SESSION_ID = 'va-session-vrp';
const RESPONSE_KEY = `pin-period_1-01`;
const RESPONSE_PATH = `video_activity_sessions/${SESSION_ID}/responses/${RESPONSE_KEY}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Anonymous student auth context — matches the bare-token shape that
// production Firebase anonymous sign-in produces (the PIN-join flow).
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed the parent session + an existing student response. No classId /
  // classIds on the session so `passesStudentClassGateCompat` is a no-op
  // gate (the focus of this suite is the whitelist, not class targeting).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `video_activity_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
    });
    await setDoc(doc(db, RESPONSE_PATH), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
    });
  });
});

describe('video_activity_sessions/{sid}/responses/{rid} — student update whitelist', () => {
  it('allows a legit whitelisted update (answers append, completedAt set)', async () => {
    // Baseline sanity check: a normal in-bounds student submit still works
    // after we tighten the whitelist to affectedKeys. If this regresses,
    // the production submit flow is broken.
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ questionId: 'q1', value: 'a' }],
        completedAt: 2000,
      })
    );
  });

  it('rejects a student write that smuggles a brand-new non-whitelisted field', async () => {
    // THE BYPASS this test pins: under `changedKeys().hasOnly([...])` the
    // smuggled `pwned` field — which does not exist on the prior document
    // — is not part of `changedKeys()`, so the whitelist check passes
    // trivially. The fix is to switch to `affectedKeys()`, which DOES
    // include added keys.
    //
    // We attach a legitimate `answers` append alongside the smuggle so the
    // rest of the student branch's invariants (append-only, attempt cap,
    // completedAt transition, etc.) all pass — proving the whitelist itself
    // is what must reject the write.
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ questionId: 'q1', value: 'a' }],
        pwned: 'arbitrary-injected-value',
      })
    );
  });

  it('rejects a student write that only adds a brand-new non-whitelisted field', async () => {
    // Minimal-surface variant of the smuggle: no whitelisted field is
    // touched at all, only the injected one. Under the old `changedKeys()`
    // posture this also slipped through (changedKeys is empty,
    // hasOnly([...]) trivially true). Under `affectedKeys()` the rule
    // sees the added key and rejects.
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        pwned: 'arbitrary-injected-value',
      })
    );
  });

  it('rejects a student write that changes an existing non-whitelisted field', async () => {
    // Sanity check that the whitelist still covers the original
    // changedKeys() use case (existing key → different value). Both
    // `changedKeys()` and `affectedKeys()` catch this, but pin it so a
    // future edit cannot drop the whitelist entirely.
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        joinedAt: 9999,
      })
    );
  });
});
