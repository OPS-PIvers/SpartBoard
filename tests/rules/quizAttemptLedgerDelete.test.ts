// Firestore security-rules tests for the quiz_attempt_ledger (and the
// parallel video_activity_attempt_ledger) DELETE rule.
//
// Regression context:
//   The teacher monitor's "Remove student" action (`removeStudent` in
//   useQuizSession.ts) runs an ATOMIC batch: archive the response, delete
//   the response, and delete the cross-launch attempt ledger. A ledger doc
//   is only ever written for non-anonymous (SSO/studentRole) joiners that
//   finalize via `completeQuiz`. Many common states therefore have NO
//   ledger doc: anonymous PIN joiners, idle/force auto-submitted blanks
//   (`autoSubmitted: true`), joined-but-never-submitted stubs, and legacy
//   pre-ledger responses.
//
//   The delete rule used to be:
//       allow delete: if request.auth != null &&
//         (request.auth.uid == resource.data.teacherUid || isAdmin());
//   For a NON-EXISTENT ledger, `resource` is null, so `resource.data.teacherUid`
//   null-derefs and the rule DENIES. Because the remove is one atomic batch,
//   that denial rolls back the archive + response delete too — surfacing to
//   the teacher as a "Missing or insufficient permissions" toast (observed in
//   prod for an SSO student whose attempt was idle auto-submitted blank).
//
//   Fix: add a `resource == null ||` short-circuit (mirroring the collection's
//   READ rule) so deleting a missing ledger is a harmless no-op. The owner /
//   admin gate still applies whenever the doc actually exists.
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
import { setDoc, deleteDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-quiz-ledger-delete-test';

const QUIZ_ID = 'quiz-ledger-delete';
const ACTIVITY_ID = 'activity-ledger-delete';
const TEACHER_UID = 'teacher-ledger-uid';
const OTHER_TEACHER_UID = 'other-teacher-ledger-uid';
const STUDENT_UID = 'student-ledger-uid';
const ADMIN_UID = 'admin-ledger-uid';
const ADMIN_EMAIL = 'admin@school.edu';

// Doc ids follow `${quizId}__${studentUid}` / `${activityId}__${studentUid}`
// (see `quizLedgerKey` / `videoActivityLedgerKey`). The `__existing` /
// `__missing` suffixes below just give each test its own key so a seeded
// doc in one case can't leak into a "non-existent" assertion in another.
const QUIZ_LEDGER_EXISTING = `${QUIZ_ID}__${STUDENT_UID}`;
const QUIZ_LEDGER_MISSING = `${QUIZ_ID}__missing-${STUDENT_UID}`;
const VA_LEDGER_EXISTING = `${ACTIVITY_ID}__${STUDENT_UID}`;
const VA_LEDGER_MISSING = `${ACTIVITY_ID}__missing-${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// ---------------------------------------------------------------------------
// Auth contexts
// ---------------------------------------------------------------------------

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext(OTHER_TEACHER_UID, {
      email: 'other-teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

// SSO student-role token — owns the ledger's studentUid but must NOT be able
// to delete an existing ledger (that would wipe their own attempt cap).
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@school.edu',
      studentRole: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
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

const quizLedgerDoc = (teacherUid: string) => ({
  quizId: QUIZ_ID,
  studentUid: STUDENT_UID,
  teacherUid,
  completedAttempts: 1,
  lastAttemptAt: 1000,
});

const vaLedgerDoc = (teacherUid: string) => ({
  activityId: ACTIVITY_ID,
  studentUid: STUDENT_UID,
  teacherUid,
  completedAttempts: 1,
  lastAttemptAt: 1000,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Mark ADMIN_EMAIL as an admin (isAdmin() checks /admins/{email.lower()}).
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    // Seed the "existing" ledgers owned by TEACHER_UID. The "missing" keys
    // are intentionally left absent so the non-existent-delete cases hit a
    // truly null `resource`.
    await setDoc(
      doc(db, `quiz_attempt_ledger/${QUIZ_LEDGER_EXISTING}`),
      quizLedgerDoc(TEACHER_UID)
    );
    await setDoc(
      doc(db, `video_activity_attempt_ledger/${VA_LEDGER_EXISTING}`),
      vaLedgerDoc(TEACHER_UID)
    );
  });
});

// ---------------------------------------------------------------------------
// quiz_attempt_ledger DELETE
// ---------------------------------------------------------------------------

describe('quiz_attempt_ledger DELETE', () => {
  it('REGRESSION: the owning teacher can delete a NON-EXISTENT ledger (removeStudent no-ledger path)', async () => {
    // This is the exact failure that produced the "Missing or insufficient
    // permissions" toast: removeStudent batch-deletes a ledger that was
    // never written (idle auto-submit / anonymous / joined-only). The
    // `resource == null` short-circuit must make this a harmless no-op.
    await assertSucceeds(
      deleteDoc(doc(asTeacher(), `quiz_attempt_ledger/${QUIZ_LEDGER_MISSING}`))
    );
  });

  it('the owning teacher can delete their own EXISTING ledger', async () => {
    await assertSucceeds(
      deleteDoc(doc(asTeacher(), `quiz_attempt_ledger/${QUIZ_LEDGER_EXISTING}`))
    );
  });

  it('a non-owning teacher CANNOT delete an existing ledger', async () => {
    await assertFails(
      deleteDoc(
        doc(asOtherTeacher(), `quiz_attempt_ledger/${QUIZ_LEDGER_EXISTING}`)
      )
    );
  });

  it('the student CANNOT delete their own existing ledger (would wipe the attempt cap)', async () => {
    await assertFails(
      deleteDoc(doc(asStudent(), `quiz_attempt_ledger/${QUIZ_LEDGER_EXISTING}`))
    );
  });

  it('a student deleting a NON-EXISTENT ledger is an allowed no-op (resource == null; nothing to wipe)', async () => {
    // The `resource == null` branch admits any authenticated caller, but it
    // can only ever "delete" a doc that does not exist — a no-op that leaks
    // and destroys nothing. An EXISTING ledger stays gated (case above).
    await assertSucceeds(
      deleteDoc(doc(asStudent(), `quiz_attempt_ledger/${QUIZ_LEDGER_MISSING}`))
    );
  });

  it('an admin can delete an existing ledger', async () => {
    await assertSucceeds(
      deleteDoc(doc(asAdmin(), `quiz_attempt_ledger/${QUIZ_LEDGER_EXISTING}`))
    );
  });
});

// ---------------------------------------------------------------------------
// video_activity_attempt_ledger DELETE (same hardening, kept symmetric)
// ---------------------------------------------------------------------------

describe('video_activity_attempt_ledger DELETE', () => {
  it('the owning teacher can delete a NON-EXISTENT VA ledger (parity with quiz ledger)', async () => {
    await assertSucceeds(
      deleteDoc(
        doc(asTeacher(), `video_activity_attempt_ledger/${VA_LEDGER_MISSING}`)
      )
    );
  });

  it('a non-owning teacher CANNOT delete an existing VA ledger', async () => {
    await assertFails(
      deleteDoc(
        doc(
          asOtherTeacher(),
          `video_activity_attempt_ledger/${VA_LEDGER_EXISTING}`
        )
      )
    );
  });
});
