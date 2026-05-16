// Firestore security-rules tests for the results-view screenshot-protection
// fields on quiz response docs (Task 11).
//
// Contract:
//   - Students may only INCREMENT `resultsTabWarnings` (monotonic) on their
//     own response doc — decrementing is rejected.
//   - Students may transition `resultsLockedOut` from `false → true` (the
//     auto-lockout when threshold is reached) but never `true → false`
//     (self-unlock is rejected).
//   - Students may set/update `resultsLockedOutAt` (timestamp goes with the
//     lockout flip).
//   - Students writing these fields together with any field outside the
//     existing allowed whitelist (e.g. `score`) must be rejected — the
//     existing `changedKeys().hasOnly([...])` whitelist enforces this.
//   - Teachers (session owner) can write any of the three fields freely,
//     including DECREMENTING `resultsTabWarnings` and clearing
//     `resultsLockedOut` back to false. This is what powers the Task 12
//     teacher unlock affordance.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-results-protection-test';
const SESSION_ID = 'session-results-protection';
const TEACHER_UID = 'teacher-uid-results';
const STUDENT_A_UID = 'student-a-anon';
const STUDENT_B_UID = 'student-b-anon';
const CLASS_ID = 'class-results';

// Anonymous PIN-derived response keys follow the
// `pin-{encodedPeriod}-{encodedPin}` shape enforced by the create rule.
// For UPDATE tests the key shape doesn't matter (only the studentUid field
// check does), but we keep it well-formed for realism.
const RESPONSE_A_KEY = `pin-period_1-01`;
const RESPONSE_B_KEY = `pin-period_1-02`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// ---------------------------------------------------------------------------
// Auth contexts — match the claim shape used by other rules tests so the
// emulator doesn't throw on undefined-claim reads inside helper functions.
// ---------------------------------------------------------------------------

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudentA = () =>
  testEnv
    .authenticatedContext(STUDENT_A_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudentB = () =>
  testEnv
    .authenticatedContext(STUDENT_B_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

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

// Seed one session and one response per student before each test. Using
// `withSecurityRulesDisabled` so the seed doesn't have to satisfy the
// create-time constraints.
async function seedSessionAndResponses(
  opts: {
    warnings?: number;
    lockedOut?: boolean;
    lockedOutAt?: number;
  } = {}
) {
  const { warnings, lockedOut, lockedOutAt } = opts;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'RPTEST',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      mode: 'submissions',
    });
    const baseResponse = {
      studentUid: STUDENT_A_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: 80,
      answers: [],
      status: 'completed',
      completedAttempts: 1,
      preSyncVersion: 0,
      tabSwitchWarnings: 0,
      ...(warnings !== undefined ? { resultsTabWarnings: warnings } : {}),
      ...(lockedOut !== undefined ? { resultsLockedOut: lockedOut } : {}),
      ...(lockedOutAt !== undefined ? { resultsLockedOutAt: lockedOutAt } : {}),
    };
    await setDoc(
      doc(db, `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`),
      baseResponse
    );
    await setDoc(
      doc(db, `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_B_KEY}`),
      {
        ...baseResponse,
        studentUid: STUDENT_B_UID,
        pin: '02',
      }
    );
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// Student-side rules
// ---------------------------------------------------------------------------

describe('results-protection — student writes', () => {
  it('student CAN increment resultsTabWarnings on their own response', async () => {
    await seedSessionAndResponses({ warnings: 1 });
    await assertSucceeds(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 2 }
      )
    );
  });

  it('student CAN keep resultsTabWarnings unchanged (no-op update)', async () => {
    await seedSessionAndResponses({ warnings: 1 });
    // Update a different allowed field — the rule should accept it because
    // resultsTabWarnings stays the same.
    await assertSucceeds(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 1 }
      )
    );
  });

  it('student CANNOT decrement resultsTabWarnings', async () => {
    await seedSessionAndResponses({ warnings: 3 });
    await assertFails(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 2 }
      )
    );
  });

  it('student CAN transition resultsLockedOut from false → true (auto-lockout flip)', async () => {
    await seedSessionAndResponses({ warnings: 2, lockedOut: false });
    // Mirror what useResultsTabWarnings writes when threshold is reached.
    await assertSucceeds(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        {
          resultsTabWarnings: 3,
          resultsLockedOut: true,
          resultsLockedOutAt: 1700000000000,
        }
      )
    );
  });

  it('student CANNOT self-unlock (resultsLockedOut: true → false)', async () => {
    await seedSessionAndResponses({
      warnings: 3,
      lockedOut: true,
      lockedOutAt: 1000,
    });
    await assertFails(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsLockedOut: false }
      )
    );
  });

  it("student CANNOT write protection fields on another student's response", async () => {
    await seedSessionAndResponses({ warnings: 1, lockedOut: false });
    // Student B tries to bump warnings on Student A's doc.
    await assertFails(
      updateDoc(
        doc(
          asStudentB(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 2 }
      )
    );
  });

  it('student CANNOT smuggle a score change inside a protection-field update', async () => {
    // The existing changedKeys().hasOnly([...]) whitelist guards the field
    // surface — score is allowed (students can null it on rejoin) but only
    // ever as `null`. A non-null score must still be rejected even when
    // packaged with a legit protection-field increment.
    await seedSessionAndResponses({ warnings: 1 });
    await assertFails(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 2, score: 100 }
      )
    );
  });

  it('student CANNOT mix protection-field writes with a non-whitelisted field', async () => {
    // `studentUid` is not in the whitelist — the existing hasOnly() must
    // catch any attempt to add an arbitrary field alongside protection ones.
    await seedSessionAndResponses({ warnings: 1 });
    await assertFails(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 2, somethingElse: 'hack' }
      )
    );
  });

  it('student CAN write resultsTabWarnings on a doc that previously had no such field (legacy default 0)', async () => {
    // Legacy responses created before the feature have no
    // resultsTabWarnings field. The `.get('resultsTabWarnings', 0)` default
    // in the rule must allow the first increment (0 → 1).
    await seedSessionAndResponses({}); // no warnings/lockout fields seeded
    await assertSucceeds(
      updateDoc(
        doc(
          asStudentA(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 1 }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Teacher-side rules — the teacher branch on the response update rule is
// unrestricted. These tests pin that contract so a future tightening of
// the teacher branch doesn't accidentally break the Task 12 unlock flow.
// ---------------------------------------------------------------------------

describe('results-protection — teacher writes', () => {
  it('teacher CAN decrement resultsTabWarnings (Task 12 unlock affordance)', async () => {
    await seedSessionAndResponses({
      warnings: 3,
      lockedOut: true,
      lockedOutAt: 1000,
    });
    await assertSucceeds(
      updateDoc(
        doc(
          asTeacher(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsTabWarnings: 2 }
      )
    );
  });

  it('teacher CAN clear resultsLockedOut from true → false', async () => {
    await seedSessionAndResponses({
      warnings: 3,
      lockedOut: true,
      lockedOutAt: 1000,
    });
    await assertSucceeds(
      updateDoc(
        doc(
          asTeacher(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        { resultsLockedOut: false }
      )
    );
  });

  it('teacher CAN write all three protection fields together in one update', async () => {
    await seedSessionAndResponses({
      warnings: 3,
      lockedOut: true,
      lockedOutAt: 1000,
    });
    await assertSucceeds(
      updateDoc(
        doc(
          asTeacher(),
          `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_A_KEY}`
        ),
        {
          resultsTabWarnings: 0,
          resultsLockedOut: false,
          resultsLockedOutAt: 0,
        }
      )
    );
  });
});
