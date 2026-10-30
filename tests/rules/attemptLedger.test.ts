// Attempt ledgers (quiz and video activity): a row sits only at
// `{sessionId}__{own uid}`, names its session's teacher, and that teacher can
// read, refund and delete every row in the session.
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-attempt-ledger-test';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const STUDENT_UID = 'student-uid';
const VICTIM_UID = 'victim-uid';
const ANON_UID = 'anon-uid';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';
const SID = 'sess-1';
const ADMIN_EMAIL = 'admin@school.edu';

let testEnv: RulesTestEnvironment;

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
      email: 'other@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asStudent = (uid = STUDENT_UID, classIds = [CLASS_A]) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
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

const KINDS = [
  {
    name: 'quiz_attempt_ledger',
    sessions: 'quiz_sessions',
    templateKey: 'quizId',
  },
  {
    name: 'video_activity_attempt_ledger',
    sessions: 'video_activity_sessions',
    templateKey: 'activityId',
  },
] as const;

for (const kind of KINDS) {
  const path = (sid: string, uid: string) => `${kind.name}/${sid}__${uid}`;
  const entry = (uid: string, over: Record<string, unknown> = {}) => ({
    [kind.templateKey]: 'template-1',
    studentUid: uid,
    teacherUid: TEACHER_UID,
    completedAttempts: 1,
    lastAttemptAt: 1,
    lastSessionId: SID,
    ...over,
  });

  describe(kind.name, () => {
    beforeEach(async () => {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
        await setDoc(doc(db, `${kind.sessions}/${SID}`), {
          teacherUid: TEACHER_UID,
          [kind.templateKey]: 'template-1',
          classIds: [CLASS_A],
          classId: CLASS_A,
        });
        await setDoc(doc(db, `${kind.sessions}/open`), {
          teacherUid: TEACHER_UID,
          [kind.templateKey]: 'template-1',
        });
        // A row squatted before the fix: victim's key, attacker's uid, forged teacher.
        await setDoc(
          doc(db, path(SID, VICTIM_UID)),
          entry(STUDENT_UID, { teacherUid: STUDENT_UID })
        );
      });
    });

    describe('create', () => {
      it('allows a student their own key in an enrolled class', async () => {
        await assertSucceeds(
          setDoc(doc(asStudent(), path(SID, STUDENT_UID)), entry(STUDENT_UID))
        );
      });

      it("denies a signed-in student another student's key", async () => {
        await assertFails(
          setDoc(
            doc(asStudent(), path(SID, 'someone-else')),
            entry(STUDENT_UID)
          )
        );
      });

      it("denies an anonymous user another student's key", async () => {
        await assertFails(
          setDoc(doc(asAnon(), path(SID, 'someone-else')), entry(ANON_UID))
        );
      });

      it('denies an anonymous user even their own key', async () => {
        await assertFails(
          setDoc(
            doc(asAnon(), path('open', ANON_UID)),
            entry(ANON_UID, { lastSessionId: 'open' })
          )
        );
      });

      it('denies a forged teacherUid', async () => {
        await assertFails(
          setDoc(
            doc(asStudent(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID, { teacherUid: STUDENT_UID })
          )
        );
      });

      it('denies a lastSessionId that does not match the id', async () => {
        await assertFails(
          setDoc(
            doc(asStudent(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID, { lastSessionId: 'open' })
          )
        );
        const { lastSessionId: _omit, ...noSession } = entry(STUDENT_UID);
        await assertFails(
          setDoc(doc(asStudent(), path(SID, STUDENT_UID)), noSession)
        );
      });

      it('denies a row for a session that does not exist', async () => {
        await assertFails(
          setDoc(
            doc(asStudent(), path('missing', STUDENT_UID)),
            entry(STUDENT_UID, { lastSessionId: 'missing' })
          )
        );
      });

      it("denies a studentRole user outside the session's class", async () => {
        await assertFails(
          setDoc(
            doc(asStudent(STUDENT_UID, [CLASS_B]), path(SID, STUDENT_UID)),
            entry(STUDENT_UID)
          )
        );
      });

      it('allows a session with no class targeting', async () => {
        await assertSucceeds(
          setDoc(
            doc(asStudent(STUDENT_UID, [CLASS_B]), path('open', STUDENT_UID)),
            entry(STUDENT_UID, { lastSessionId: 'open' })
          )
        );
      });

      it('denies forging prior completions', async () => {
        await assertFails(
          setDoc(
            doc(asStudent(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID, { completedAttempts: 2 })
          )
        );
      });
    });

    describe('read', () => {
      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(
            doc(ctx.firestore(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID)
          );
        });
      });

      it('lets the student read their own row and probe a missing one', async () => {
        await assertSucceeds(getDoc(doc(asStudent(), path(SID, STUDENT_UID))));
        await assertSucceeds(
          getDoc(doc(asStudent(), path('open', STUDENT_UID)))
        );
      });

      it("denies another student reading a student's row", async () => {
        await assertFails(
          getDoc(doc(asStudent('other-student'), path(SID, STUDENT_UID)))
        );
      });

      it('lets the session teacher read any row, including a forged one', async () => {
        await assertSucceeds(getDoc(doc(asTeacher(), path(SID, STUDENT_UID))));
        await assertSucceeds(getDoc(doc(asTeacher(), path(SID, VICTIM_UID))));
      });

      it('denies another teacher', async () => {
        await assertFails(
          getDoc(doc(asOtherTeacher(), path(SID, STUDENT_UID)))
        );
      });

      it('lets an admin read', async () => {
        await assertSucceeds(getDoc(doc(asAdmin(), path(SID, STUDENT_UID))));
      });
    });

    describe('update', () => {
      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(
            doc(ctx.firestore(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID)
          );
        });
      });

      it('lets the student add one attempt on their own key', async () => {
        await assertSucceeds(
          updateDoc(doc(asStudent(), path(SID, STUDENT_UID)), {
            completedAttempts: 2,
            lastAttemptAt: 2,
            lastSessionId: SID,
          })
        );
      });

      it("denies a squatter updating a row at someone else's key", async () => {
        await assertFails(
          updateDoc(doc(asStudent(), path(SID, VICTIM_UID)), {
            completedAttempts: 2,
            lastAttemptAt: 2,
          })
        );
      });

      it('lets the session teacher refund a forged row', async () => {
        await assertSucceeds(
          updateDoc(doc(asTeacher(), path(SID, VICTIM_UID)), {
            completedAttempts: 0,
          })
        );
      });

      it('denies another teacher a refund', async () => {
        await assertFails(
          updateDoc(doc(asOtherTeacher(), path(SID, STUDENT_UID)), {
            completedAttempts: 0,
          })
        );
      });

      it('denies the student changing teacherUid or studentUid', async () => {
        await assertFails(
          updateDoc(doc(asStudent(), path(SID, STUDENT_UID)), {
            completedAttempts: 2,
            lastAttemptAt: 2,
            teacherUid: STUDENT_UID,
          })
        );
        await assertFails(
          updateDoc(doc(asStudent(), path(SID, STUDENT_UID)), {
            completedAttempts: 2,
            lastAttemptAt: 2,
            studentUid: 'someone-else',
          })
        );
      });

      it('denies a student lowering or deleting a pre-fix row naming them as teacher', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(
            doc(ctx.firestore(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID, { teacherUid: STUDENT_UID })
          );
        });
        await assertFails(
          updateDoc(doc(asStudent(), path(SID, STUDENT_UID)), {
            completedAttempts: 0,
          })
        );
        await assertFails(deleteDoc(doc(asStudent(), path(SID, STUDENT_UID))));
      });

      it('denies the teacher raising the count', async () => {
        await assertFails(
          updateDoc(doc(asTeacher(), path(SID, STUDENT_UID)), {
            completedAttempts: 5,
          })
        );
      });
    });

    describe('delete', () => {
      it('lets the session teacher delete any row, including a forged one', async () => {
        await assertSucceeds(
          deleteDoc(doc(asTeacher(), path(SID, VICTIM_UID)))
        );
      });

      it('lets the session teacher delete a missing row (no-op)', async () => {
        await assertSucceeds(deleteDoc(doc(asTeacher(), path(SID, 'nobody'))));
      });

      it('denies the student and another teacher deleting', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(
            doc(ctx.firestore(), path(SID, STUDENT_UID)),
            entry(STUDENT_UID)
          );
        });
        await assertFails(deleteDoc(doc(asStudent(), path(SID, STUDENT_UID))));
        await assertFails(
          deleteDoc(doc(asOtherTeacher(), path(SID, VICTIM_UID)))
        );
      });
    });
  });
}
