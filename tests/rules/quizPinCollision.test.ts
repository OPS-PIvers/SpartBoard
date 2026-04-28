// Firestore security-rules regression for the anonymous-PIN deterministic
// response key. Locks in the response-doc read/update denial when two
// different anonymous UIDs hash to the same key (real PIN+period collision
// across students, OR same student rejoining from a fresh browser session
// where the anonymous UID has rotated).
//
// The denial itself is correct/intended (the rule binds ownership to the
// `studentUid` field, not the doc key). What this test guards is:
//   1. The rule still denies cross-anon reads/writes — preventing data
//      leakage if someone widens the read/update rule too aggressively.
//   2. The bug surface is documented: any client code path that probes the
//      deterministic key without handling permission-denied will reproduce
//      the original "Uncaught (in promise) FirebaseError: Missing or
//      insufficient permissions" against this test scenario.
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
import { setDoc, getDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-quiz-pin-collision';
const SESSION_ID = 'pin-collision-session';
const TEACHER_UID = 'teacher-uid-pc';
const ANON_A_UID = 'anon-a-uid';
const ANON_B_UID = 'anon-b-uid';

// Deterministic key encoding mirrors `encodeResponseKeySegment()` on the
// client (`hooks/useQuizSession.ts`). For inputs without special characters
// the encoding is identity, which is all this test needs.
const PERIOD = 'period_1';
const PIN = '01';
const COLLIDING_KEY = `pin-${PERIOD}-${PIN}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

// ---------------------------------------------------------------------------
// Auth contexts — match the bare-token shape that production Firebase
// anonymous sign-in produces (no studentRole, classIds, or email claims).
// ---------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

const asAnonA = () =>
  testEnv
    .authenticatedContext(ANON_A_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asAnonB = () =>
  testEnv
    .authenticatedContext(ANON_B_UID, {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('quiz_sessions/responses — anonymous PIN deterministic-key collision', () => {
  const responsePath = `quiz_sessions/${SESSION_ID}/responses/${COLLIDING_KEY}`;

  const respDoc = (ownerUid: string) => ({
    studentUid: ownerUid,
    pin: PIN,
    classPeriod: PERIOD,
    joinedAt: 1000,
    score: null,
    answers: [],
    status: 'joined',
    completedAttempts: 0,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Untargeted session (no classId/classIds) — the open class-gate path
      // anonymous PIN joiners use in production.
      await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'PCTEST',
      });
      // Anon A has already joined: their response doc occupies the
      // deterministic key.
      await setDoc(doc(db, responsePath), respDoc(ANON_A_UID));
    });
  });

  it('owner anon A can read their own response at the deterministic key', async () => {
    // Sanity check: ownership-based read still works for the original
    // joiner. This proves the test fixture is wired correctly before we
    // assert the cross-anon denials below.
    await assertSucceeds(getDoc(doc(asAnonA(), responsePath)));
  });

  it('different anon B is DENIED reading anon A’s response at the same deterministic key', async () => {
    // This is the exact path `findExistingResponseDoc` exercises on the
    // first probe: getDoc on the deterministic key. Pre-fix, the denial
    // bubbled out as an unhandled promise rejection in the browser console;
    // the rule itself denying is correct and locked in here.
    await assertFails(getDoc(doc(asAnonB(), responsePath)));
  });

  it('different anon B is DENIED creating/overwriting at anon A’s deterministic key', async () => {
    // setDoc on an existing doc owned by another anon UID resolves to the
    // `update` rule — denied because `request.auth.uid != resource.data.studentUid`.
    // This is what surfaces to `joinQuizSession`'s outer catch after the
    // read probe is silenced; the .catch on the form submit / period
    // confirm prevents it from bubbling as an unhandled rejection.
    await assertFails(
      setDoc(doc(asAnonB(), responsePath), respDoc(ANON_B_UID))
    );
  });

  it('different anon B CAN read at a non-colliding deterministic key (no doc) and CAN create their own', async () => {
    // Same period, different PIN — different deterministic key, no
    // existing doc. The read returns `resource == null` (allowed) and the
    // create succeeds (key shape matches the regex, studentUid == auth.uid).
    const noConflictPath = `quiz_sessions/${SESSION_ID}/responses/pin-${PERIOD}-02`;
    await assertSucceeds(getDoc(doc(asAnonB(), noConflictPath)));
    await assertSucceeds(
      setDoc(doc(asAnonB(), noConflictPath), {
        ...respDoc(ANON_B_UID),
        pin: '02',
      })
    );
  });
});
