// Per-student results publication (GRADEBOOK.md D7) on Video Activity and
// Guided Learning responses: only the owning teacher writes `resultsOverride`,
// and the student can read it on their own response.
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

const PROJECT_ID = 'spartboard-student-results-override';
const TEACHER_UID = 'teacher-uid-sro';
const OTHER_TEACHER_UID = 'teacher-uid-sro-other';
const STUDENT_UID = 'student-uid-sro';
const OTHER_STUDENT_UID = 'student-uid-sro-other';

const VA_SESSION = 'video_activity_sessions/va-sro';
const VA_RESPONSE = `${VA_SESSION}/responses/pin-period_1-01`;
const VA_NEW_RESPONSE = `${VA_SESSION}/responses/pin-period_1-02`;
const GL_SESSION_ID = 'gl-sro';
const GL_SESSION = `guided_learning_sessions/${GL_SESSION_ID}`;
const GL_RESPONSE = `${GL_SESSION}/responses/${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const SHOWN = {
  mode: 'shown',
  visibility: 'score-only',
  publishedAt: 1,
  expiresAt: null,
};

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

describe('video activity responses: resultsOverride', () => {
  it('lets the owning teacher set and clear an override', async () => {
    const ref = doc(asTeacher(TEACHER_UID), VA_RESPONSE);
    await assertSucceeds(updateDoc(ref, { resultsOverride: SHOWN, score: 80 }));
    await assertSucceeds(
      updateDoc(ref, { resultsOverride: { mode: 'hidden', publishedAt: 2 } })
    );
  });

  it('refuses another teacher', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), VA_RESPONSE), {
        resultsOverride: SHOWN,
      })
    );
  });

  it('refuses a student granting themselves an override on update', async () => {
    await assertFails(
      updateDoc(doc(asAnon(STUDENT_UID), VA_RESPONSE), {
        resultsOverride: SHOWN,
      })
    );
  });

  it('refuses a student forging an override at create', async () => {
    const base = {
      studentUid: OTHER_STUDENT_UID,
      pin: '02',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
    };
    const ref = doc(asAnon(OTHER_STUDENT_UID), VA_NEW_RESPONSE);
    await assertFails(setDoc(ref, { ...base, resultsOverride: SHOWN }));
    await assertSucceeds(setDoc(ref, base));
  });

  it('lets the student read their own override and no one else read it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), VA_RESPONSE), {
        resultsOverride: SHOWN,
      });
    });
    await assertSucceeds(getDoc(doc(asAnon(STUDENT_UID), VA_RESPONSE)));
    await assertFails(getDoc(doc(asAnon(OTHER_STUDENT_UID), VA_RESPONSE)));
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), VA_RESPONSE)));
  });
});

describe('guided learning responses: resultsOverride', () => {
  it('lets the owning teacher set and clear an override', async () => {
    const ref = doc(asTeacher(TEACHER_UID), GL_RESPONSE);
    await assertSucceeds(updateDoc(ref, { resultsOverride: SHOWN, score: 80 }));
    await assertSucceeds(
      updateDoc(ref, { resultsOverride: { mode: 'hidden', publishedAt: 2 } })
    );
  });

  it('refuses another teacher', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), GL_RESPONSE), {
        resultsOverride: SHOWN,
      })
    );
  });

  it('refuses a student granting themselves an override on update', async () => {
    await assertFails(
      updateDoc(doc(asAnon(STUDENT_UID), GL_RESPONSE), {
        resultsOverride: SHOWN,
      })
    );
  });

  it('refuses a student forging an override at create', async () => {
    const path = `${GL_SESSION}/responses/${OTHER_STUDENT_UID}`;
    const base = {
      sessionId: GL_SESSION_ID,
      studentAnonymousId: OTHER_STUDENT_UID,
      answers: [],
      startedAt: 1000,
      completedAt: null,
      score: null,
    };
    const ref = doc(asAnon(OTHER_STUDENT_UID), path);
    await assertFails(setDoc(ref, { ...base, resultsOverride: SHOWN }));
    await assertSucceeds(setDoc(ref, base));
  });

  it('lets the student read their own override and no one else read it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), GL_RESPONSE), {
        resultsOverride: SHOWN,
      });
    });
    await assertSucceeds(getDoc(doc(asAnon(STUDENT_UID), GL_RESPONSE)));
    await assertFails(getDoc(doc(asAnon(OTHER_STUDENT_UID), GL_RESPONSE)));
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), GL_RESPONSE)));
  });
});
