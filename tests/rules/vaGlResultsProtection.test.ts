// Results protection on Video Activity and Guided Learning responses: a student
// may only raise their own tab-warning count and lock; the teacher unlocks.
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
import { setDoc, updateDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-va-gl-results-protection';
const TEACHER_UID = 'teacher-uid-vgp';
const OTHER_TEACHER_UID = 'teacher-uid-vgp-other';
const STUDENT_UID = 'student-uid-vgp';
const OTHER_STUDENT_UID = 'student-uid-vgp-other';

const VA_SESSION = 'video_activity_sessions/va-vgp';
const VA_RESPONSE = `${VA_SESSION}/responses/pin-period_1-01`;
const GL_SESSION_ID = 'gl-vgp';
const GL_SESSION = `guided_learning_sessions/${GL_SESSION_ID}`;
const GL_RESPONSE = `${GL_SESSION}/responses/${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, VA_SESSION), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
    });
    await setDoc(doc(db, VA_RESPONSE), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAt: 2000,
      completedAttempts: 1,
      tabSwitchWarnings: 0,
    });
    await setDoc(doc(db, GL_SESSION), {
      teacherUid: TEACHER_UID,
      assignmentMode: 'submissions',
    });
    await setDoc(doc(db, GL_RESPONSE), {
      sessionId: GL_SESSION_ID,
      studentAnonymousId: STUDENT_UID,
      answers: [],
      startedAt: 1000,
      completedAt: 2000,
      score: null,
    });
  });
});

const CASES = [
  ['video activity', VA_RESPONSE],
  ['guided learning', GL_RESPONSE],
] as const;

describe.each(CASES)('%s responses: results protection', (_label, path) => {
  it('lets the student raise their warning count and lock themselves out', async () => {
    const ref = doc(asAnon(STUDENT_UID), path);
    await assertSucceeds(updateDoc(ref, { resultsTabWarnings: 1 }));
    await assertSucceeds(
      updateDoc(ref, {
        resultsTabWarnings: 2,
        resultsLockedOut: true,
        resultsLockedOutAt: 3000,
      })
    );
  });

  it('refuses a student lowering the count or unlocking', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), path), {
        resultsTabWarnings: 3,
        resultsLockedOut: true,
      });
    });
    const ref = doc(asAnon(STUDENT_UID), path);
    await assertFails(updateDoc(ref, { resultsTabWarnings: 0 }));
    await assertFails(updateDoc(ref, { resultsLockedOut: false }));
  });

  it('refuses a student bundling other fields with a warning', async () => {
    await assertFails(
      updateDoc(doc(asAnon(STUDENT_UID), path), {
        resultsTabWarnings: 1,
        score: 100,
      })
    );
  });

  it('refuses another student', async () => {
    await assertFails(
      updateDoc(doc(asAnon(OTHER_STUDENT_UID), path), {
        resultsTabWarnings: 1,
      })
    );
  });

  it('lets the owning teacher unlock, and not another teacher', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), path), {
        resultsTabWarnings: 3,
        resultsLockedOut: true,
      });
    });
    const unlock = { resultsTabWarnings: 2, resultsLockedOut: false };
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), path), unlock)
    );
    await assertSucceeds(updateDoc(doc(asTeacher(TEACHER_UID), path), unlock));
  });

  it('lets the student and teacher read the lock state, not another student', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), path), { resultsLockedOut: true });
    });
    await assertSucceeds(getDoc(doc(asAnon(STUDENT_UID), path)));
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), path)));
    await assertFails(getDoc(doc(asAnon(OTHER_STUDENT_UID), path)));
  });
});
