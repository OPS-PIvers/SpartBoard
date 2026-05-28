// Firestore security-rules tests for the quiz response CREATE forgery
// guards and the UPDATE `lastWriteAt == request.time` enforcement
// landed in PR #1733 (quiz data-loss fix).
//
// Contract under test:
//   - CREATE: a malicious join payload cannot stamp the cron-only /
//     teacher-only fields `autoSubmitted`, `unlocked`, `unlockedAt`,
//     or `grading`. Without this guard a student could set
//     `unlocked: true` at join and trip the rejoin resume-unlocked
//     branch in useQuizSession (granting an extra attempt without
//     consuming a slot).
//   - CREATE + UPDATE: `lastWriteAt` (the idle-auto-submit cron's
//     cutoff field) must be server-stamped via `serverTimestamp()`,
//     never a client `Date.now()` number or a forged Timestamp. The
//     rule predicate is `lastWriteAt == request.time` (server-resolved
//     equality). Closes the clock-skew failure modes: past-clock
//     devices can't be force-finalized on the next sweep, future-clock
//     devices can't evade idle auto-submit indefinitely, and multi-tab
//     students with drifting clocks can't lock themselves out.
//   - UPDATE: writes that don't touch `lastWriteAt` (e.g. a
//     results-protection `resultsTabWarnings` increment) must still
//     succeed without supplying it — the rule predicate is an
//     `affectedKeys().hasAny(['lastWriteAt'])` short-circuit.
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
import {
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-quiz-response-protection-test';
const SESSION_ID = 'session-protection';
const TEACHER_UID = 'teacher-uid-protection';
const ANON_UID = 'anon-protection-uid';
const STUDENT_UID = 'student-protection-uid';
const CLASS_ID = 'class-protection';

// Anonymous PIN-derived response keys follow `pin-{period}-{pin}` per
// `encodeResponseKeySegment()`. The rule's regex enforces this shape on
// create; for UPDATE the `studentUid` field is the ownership check.
const PIN_KEY = 'pin-period_1-01';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// ---------------------------------------------------------------------------
// Auth contexts
// ---------------------------------------------------------------------------
// Bare anonymous PIN-joiner token. Real production anon Auth tokens carry
// no custom claims; spelling out empty/false defaults here matches the
// shape that the rules engine reads via `.get()`-safe helpers.
const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

// SSO-joined student-role token.
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@school.edu',
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Resolve emulator host/port explicitly rather than via a chained
  // optional + `[0]`/`[1]` access. The chained form is technically
  // safe under ES2020 short-circuit semantics, but the explicit form
  // reads better, avoids surprising future readers, and is robust to
  // a malformed value (e.g. host with no `:port`) which would otherwise
  // resolve to `Number(undefined) = NaN` and silently fail emulator
  // connection.
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed the parent quiz_session. `mode` is omitted so `sessionMode()`
  // defaults to 'submissions' (legacy default — see firestore.rules
  // L2092-2096).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'PROTECT',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
    });
  });
});

// Minimal valid CREATE payload for an anonymous PIN joiner. Tests below
// spread this and override one field at a time so the failure mode under
// test is the one being asserted.
const baseAnonCreate = () => ({
  studentUid: ANON_UID,
  pin: '01',
  classPeriod: 'period_1',
  joinedAt: 1000,
  score: null,
  answers: [],
  status: 'joined' as const,
  completedAttempts: 0,
  preSyncVersion: 0,
  tabSwitchWarnings: 0,
});

// ---------------------------------------------------------------------------
// CREATE: forgery rejection for cron-only / teacher-only fields
// ---------------------------------------------------------------------------

describe('quiz response CREATE — cron/teacher-only field forgery', () => {
  it('control: minimal valid CREATE succeeds (without lastWriteAt)', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        baseAnonCreate()
      )
    );
  });

  it('CREATE with autoSubmitted: true is REJECTED', async () => {
    // Cron-only signal. A student setting it at join would falsely
    // mark the attempt as auto-finalized from the start, evading
    // teacher attention.
    await assertFails(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        { ...baseAnonCreate(), autoSubmitted: true }
      )
    );
  });

  it('CREATE with unlocked: true is REJECTED', async () => {
    // Teacher-only signal. A student setting it at join would trip
    // the rejoin resume-unlocked branch in useQuizSession and grant
    // an extra attempt without consuming a slot — silently bypassing
    // the assignment's attempt cap.
    await assertFails(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        { ...baseAnonCreate(), unlocked: true }
      )
    );
  });

  it('CREATE with unlockedAt timestamp is REJECTED', async () => {
    // Companion field to `unlocked`. Stamped by the teacher's unlock
    // action; forging it client-side has no useful purpose for the
    // student but is denied for surface-area minimization.
    await assertFails(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        { ...baseAnonCreate(), unlockedAt: 1000 }
      )
    );
  });

  it('CREATE with forged grading payload is REJECTED', async () => {
    // Grading data is teacher-only. A forged `grading.<qid>` write at
    // CREATE would let a student pre-populate their own rubric scores
    // and pass them through to the teacher's view.
    await assertFails(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        {
          ...baseAnonCreate(),
          grading: { q1: { pointsAwarded: 999, gradedBy: 'student' } },
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// CREATE: lastWriteAt server-stamp enforcement
// ---------------------------------------------------------------------------

describe('quiz response CREATE — lastWriteAt server-stamp enforcement', () => {
  it('CREATE with lastWriteAt: serverTimestamp() SUCCEEDS', async () => {
    // The SDK resolves `serverTimestamp()` to `request.time` at rule
    // evaluation. Equality holds; create passes.
    await assertSucceeds(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        { ...baseAnonCreate(), lastWriteAt: serverTimestamp() }
      )
    );
  });

  it('CREATE with lastWriteAt as a client Timestamp is REJECTED', async () => {
    // A forged Timestamp (e.g. crafted by a future-clocked client to
    // evade the 90-min idle sweep) is rejected because it does not
    // equal `request.time`.
    await assertFails(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        {
          ...baseAnonCreate(),
          lastWriteAt: Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24),
        }
      )
    );
  });

  it('CREATE with lastWriteAt: Date.now() (number) is REJECTED', async () => {
    // Symmetric regression shield to the UPDATE-side numeric-rejection
    // test below. The pre-PR-#1720 codepath wrote `Date.now()` on both
    // CREATE and UPDATE; without a CREATE-side test, a partial
    // regression that only re-introduces a numeric stamp on the join
    // path would slip through.
    await assertFails(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        { ...baseAnonCreate(), lastWriteAt: Date.now() }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// UPDATE: lastWriteAt server-stamp enforcement
// ---------------------------------------------------------------------------

describe('quiz response UPDATE — lastWriteAt server-stamp enforcement', () => {
  // Each UPDATE test starts from a freshly-seeded response doc. Seeded
  // with a `lastWriteAt` already in place so the update path's diff
  // computation has a baseline.
  async function seedResponse(
    opts: { studentUid?: string; key?: string } = {}
  ) {
    const key = opts.key ?? PIN_KEY;
    const studentUid = opts.studentUid ?? ANON_UID;
    // Seed with the full production schema (classId + classIds present)
    // so the assertFails tests below anchor on the rule under test
    // rather than on incidental gaps in the seed. If a future rules
    // change adds a response-side classId requirement, this defense-in-
    // depth keeps the existing tests from silently turning into
    // assertFails-for-wrong-reason green-lights.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `quiz_sessions/${SESSION_ID}/responses/${key}`), {
        studentUid,
        pin: '01',
        classPeriod: 'period_1',
        classId: CLASS_ID,
        classIds: [CLASS_ID],
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'in-progress',
        completedAttempts: 0,
        preSyncVersion: 0,
        tabSwitchWarnings: 0,
        lastWriteAt: Timestamp.fromMillis(1000),
      });
    });
  }

  it('UPDATE touching lastWriteAt with serverTimestamp() SUCCEEDS', async () => {
    await seedResponse();
    await assertSucceeds(
      updateDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        {
          status: 'in-progress',
          answers: [{ questionId: 'q1', status: 'submitted' }],
          lastWriteAt: serverTimestamp(),
        }
      )
    );
  });

  it('UPDATE with lastWriteAt: Date.now() (number) is REJECTED', async () => {
    // The original pre-PR-#1720 codepath wrote `Date.now()` (a JS
    // number). Under the new rule, that number is not equal to the
    // server-resolved `request.time` Timestamp → the predicate fails
    // and the update is rejected. This is the regression-shield: if
    // someone reintroduces a client-side numeric stamp on the
    // autosave path, this test reds.
    await seedResponse();
    await assertFails(
      updateDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        {
          status: 'in-progress',
          answers: [{ questionId: 'q1', status: 'submitted' }],
          lastWriteAt: Date.now(),
        }
      )
    );
  });

  it('UPDATE with lastWriteAt as a forged future Timestamp is REJECTED', async () => {
    // Future-clock evasion attempt: a student writes a Timestamp far
    // in the future hoping the idle sweep never catches them. The
    // rule rejects because the value is not equal to `request.time`.
    await seedResponse();
    await assertFails(
      updateDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        {
          status: 'in-progress',
          answers: [{ questionId: 'q1', status: 'submitted' }],
          lastWriteAt: Timestamp.fromMillis(Date.now() + 1000 * 60 * 60 * 24),
        }
      )
    );
  });

  it('UPDATE that does NOT touch lastWriteAt SUCCEEDS without supplying it', async () => {
    // results-protection / tab-warning writes after publish don't
    // refresh idle-cron freshness. The rule's
    // `affectedKeys().hasAny(['lastWriteAt'])` short-circuit must
    // allow these through with no `lastWriteAt` in the payload.
    await seedResponse();
    await assertSucceeds(
      updateDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        { tabSwitchWarnings: 1 }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// UPDATE: teacher-context lastWriteAt refresh on student-owned response
// ---------------------------------------------------------------------------

describe('quiz response UPDATE — teacher refreshes lastWriteAt on student-owned response', () => {
  // `resumeAssignment` in hooks/useQuizAssignments.ts batch-writes
  // `lastWriteAt: serverTimestamp()` on every joined/in-progress
  // response while authenticated as the teacher (auth.uid ==
  // sessionTeacherUid()). The teacher branch in firestore.rules is
  // currently unrestricted so this works — but no existing test pins
  // the contract, leaving a future teacher-branch tightening able to
  // silently break the resume flow in production. This is the missing
  // positive shield.
  const asTeacher = () =>
    testEnv
      .authenticatedContext(TEACHER_UID, {
        email: 'teacher@school.edu',
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();

  async function seedStudentResponse() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`),
        {
          studentUid: ANON_UID,
          pin: '01',
          classPeriod: 'period_1',
          classId: CLASS_ID,
          classIds: [CLASS_ID],
          joinedAt: 1000,
          score: null,
          answers: [],
          status: 'in-progress',
          completedAttempts: 0,
          preSyncVersion: 0,
          tabSwitchWarnings: 0,
          lastWriteAt: Timestamp.fromMillis(1000),
        }
      );
    });
  }

  it('teacher UPDATE of lastWriteAt: serverTimestamp() on a student-owned response SUCCEEDS', async () => {
    await seedStudentResponse();
    await assertSucceeds(
      updateDoc(
        doc(asTeacher(), `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`),
        { lastWriteAt: serverTimestamp() }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// UPDATE: unlocked self-elevation rejection (companion to CREATE guard)
// ---------------------------------------------------------------------------

describe('quiz response UPDATE — unlocked self-elevation', () => {
  // Seed a fresh student-owned response with the full production
  // schema (classId/classIds present) so the assertFails/assertSucceeds
  // pair below anchors on the unlocked predicate, not on incidental
  // gaps in the seed.
  async function seedSsoResponse() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`),
        {
          studentUid: STUDENT_UID,
          classPeriod: 'period_1',
          classId: CLASS_ID,
          classIds: [CLASS_ID],
          joinedAt: 1000,
          score: null,
          answers: [],
          status: 'completed',
          completedAttempts: 1,
          preSyncVersion: 0,
          tabSwitchWarnings: 0,
        }
      );
    });
  }

  it('UPDATE setting unlocked: true is REJECTED', async () => {
    // The CREATE-side guard above blocks forging `unlocked: true` at
    // join. This is the companion UPDATE-side guard: a student who
    // already joined cannot post-hoc flip themselves to unlocked via
    // an update. The rule predicate is
    //   `request.resource.data.get('unlocked', false) == false`
    // — students may only ever CLEAR the flag (write false), never
    // raise it. The teacher's unlock action runs from the unrestricted
    // teacher branch and is not affected.
    await seedSsoResponse();
    await assertFails(
      updateDoc(
        doc(
          asStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`
        ),
        { unlocked: true }
      )
    );
  });

  it('UPDATE setting unlocked: false SUCCEEDS (positive control)', async () => {
    // Positive control for the rejection test above. With the same
    // seed and the same auth context, writing `unlocked: false`
    // must succeed — students are permitted to clear the flag, just
    // not raise it. This anchors the negative test to the unlocked
    // predicate specifically; if a future seed change causes the
    // negative test to fail for an unrelated reason, this positive
    // control will red and catch the drift.
    await seedSsoResponse();
    await assertSucceeds(
      updateDoc(
        doc(
          asStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`
        ),
        { unlocked: false }
      )
    );
  });
});
