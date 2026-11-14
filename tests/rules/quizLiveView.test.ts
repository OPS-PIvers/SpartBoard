// Firestore security-rules tests for Quiz Live view (docs/plans/shipped/QUIZ_LIVE_VIEW.md D13, D18).
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.
//
// Contract: a watched student writes only their own `live/state` doc and never reads the
// teacher's action log; the session teacher reads `live/state`; the log is owner-only.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-live-view-test';
const TEACHER_UID = 'teacher-live';
const OTHER_TEACHER_UID = 'other-teacher-live';
const STUDENT_UID = 'student-live';
const OTHER_STUDENT_UID = 'other-student-live';
const ADMIN_EMAIL = 'site-admin-live@orono.k12.mn.us';
const SESSION = 'session-live';

const RESPONSE = `quiz_sessions/${SESSION}/responses/${STUDENT_UID}`;
const STATE = `${RESPONSE}/live/state`;
const LOG = `users/${TEACHER_UID}/quiz_assignments/${SESSION}/live_log/entry-1`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const staff = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const student = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      studentRole: true,
      classIds: [],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const anon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION}`), {
      id: SESSION,
      teacherUid: TEACHER_UID,
      status: 'active',
      classIds: [],
      quizId: 'q1',
    });
    await setDoc(doc(db, RESPONSE), {
      studentUid: STUDENT_UID,
      status: 'in-progress',
      answers: [],
      score: null,
      completedAttempts: 0,
    });
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, LOG), {
      kind: 'nudge',
      responseKey: STUDENT_UID,
      at: 1,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('quiz Live view: live/state', () => {
  it('lets the owning student write their position', async () => {
    await assertSucceeds(
      setDoc(doc(student(STUDENT_UID), STATE), { questionId: 'q1', at: 5 })
    );
    await assertSucceeds(
      setDoc(doc(student(STUDENT_UID), STATE), { questionId: 'q2', at: 6 })
    );
  });

  it('rejects extra fields, a wrong doc id and another student', async () => {
    await assertFails(
      setDoc(doc(student(STUDENT_UID), STATE), {
        questionId: 'q1',
        at: 5,
        answer: 'x',
      })
    );
    await assertFails(
      setDoc(doc(student(STUDENT_UID), `${RESPONSE}/live/other`), {
        questionId: 'q1',
        at: 5,
      })
    );
    await assertFails(
      setDoc(doc(student(OTHER_STUDENT_UID), STATE), {
        questionId: 'q1',
        at: 5,
      })
    );
  });

  it('lets only the session teacher read it', async () => {
    await assertSucceeds(getDoc(doc(staff(TEACHER_UID), STATE)));
    await assertFails(getDoc(doc(staff(OTHER_TEACHER_UID), STATE)));
    await assertFails(getDoc(doc(student(OTHER_STUDENT_UID), STATE)));
  });

  it('keeps the teacher from writing a position but lets them delete it', async () => {
    await assertFails(
      setDoc(doc(staff(TEACHER_UID), STATE), { questionId: 'q9', at: 9 })
    );
    await assertSucceeds(deleteDoc(doc(staff(TEACHER_UID), STATE)));
  });
});

describe('quiz Live view: liveView stamp on the response', () => {
  it('lets the session teacher stamp and the student read it', async () => {
    await assertSucceeds(
      updateDoc(doc(staff(TEACHER_UID), RESPONSE), {
        'liveView.until': 10,
        'liveView.notify': false,
      })
    );
    await assertSucceeds(getDoc(doc(student(STUDENT_UID), RESPONSE)));
  });

  it('keeps a student from stamping their own response', async () => {
    await assertFails(
      updateDoc(doc(student(STUDENT_UID), RESPONSE), {
        'liveView.until': 0,
      })
    );
  });
});

describe('quiz Live view: live_log', () => {
  it('is read and written only by its owner', async () => {
    await assertSucceeds(getDoc(doc(staff(TEACHER_UID), LOG)));
    await assertSucceeds(
      setDoc(doc(staff(TEACHER_UID), LOG.replace('entry-1', 'entry-2')), {
        kind: 'screenshot',
        responseKey: STUDENT_UID,
        at: 2,
        driveFileId: 'abc',
      })
    );
    await assertSucceeds(deleteDoc(doc(staff(TEACHER_UID), LOG)));
    await assertFails(
      getDoc(doc(staff(OTHER_TEACHER_UID), LOG.replace('entry-1', 'entry-2')))
    );
    await assertFails(
      getDoc(doc(student(STUDENT_UID), LOG.replace('entry-1', 'entry-2')))
    );
  });
});

describe('quiz Live view: hardening', () => {
  const seedState = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), STATE), { questionId: 'q1', at: 5 });
    });

  it('keeps a student from writing notify, nudge or clearing the stamp', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), RESPONSE), {
        'liveView.until': 10,
        'liveView.notify': false,
      });
    });
    const db = student(STUDENT_UID);
    await assertFails(
      updateDoc(doc(db, RESPONSE), { 'liveView.notify': true })
    );
    await assertFails(
      updateDoc(doc(db, RESPONSE), {
        'liveView.nudge': { at: 1, noteId: 'x' },
      })
    );
    await assertFails(
      updateDoc(doc(db, RESPONSE), { liveView: deleteField() })
    );
  });

  it('keeps a student from creating a response that carries liveView', async () => {
    const base = {
      studentUid: OTHER_STUDENT_UID,
      status: 'joined',
      answers: [],
      score: null,
      completedAttempts: 0,
    };
    const path = `quiz_sessions/${SESSION}/responses/${OTHER_STUDENT_UID}`;
    await assertFails(
      setDoc(doc(student(OTHER_STUDENT_UID), path), {
        ...base,
        liveView: { until: 10, notify: false },
      })
    );
    await assertSucceeds(setDoc(doc(student(OTHER_STUDENT_UID), path), base));
  });

  it('keeps students from reading or deleting live/state', async () => {
    await seedState();
    await assertFails(getDoc(doc(student(STUDENT_UID), STATE)));
    await assertFails(deleteDoc(doc(student(STUDENT_UID), STATE)));
  });

  it('rejects a bad questionId or at', async () => {
    const db = student(STUDENT_UID);
    await assertFails(setDoc(doc(db, STATE), { questionId: 5, at: 1 }));
    await assertFails(
      setDoc(doc(db, STATE), { questionId: 'x'.repeat(201), at: 1 })
    );
    await assertFails(setDoc(doc(db, STATE), { questionId: 'q1', at: '1' }));
  });

  it('keeps another teacher from stamping, reading or deleting', async () => {
    await seedState();
    const other = staff(OTHER_TEACHER_UID);
    await assertFails(
      updateDoc(doc(other, RESPONSE), { 'liveView.until': 99 })
    );
    await assertFails(getDoc(doc(other, STATE)));
    await assertFails(deleteDoc(doc(other, STATE)));
  });

  it('keeps a site admin from stamping', async () => {
    const admin = testEnv
      .authenticatedContext('site-admin-live', {
        email: ADMIN_EMAIL,
        email_verified: true,
        studentRole: false,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    await assertFails(
      updateDoc(doc(admin, RESPONSE), { 'liveView.until': 99 })
    );
  });

  it('keeps studentRole and anonymous users out of live_log', async () => {
    await assertFails(getDoc(doc(student(TEACHER_UID), LOG)));
    await assertFails(
      setDoc(doc(student(TEACHER_UID), LOG.replace('entry-1', 'entry-3')), {
        kind: 'nudge',
        responseKey: STUDENT_UID,
        at: 3,
      })
    );
    await assertFails(getDoc(doc(anon('anon-live'), LOG)));
    await assertFails(
      setDoc(doc(anon('anon-live'), LOG.replace('entry-1', 'entry-4')), {
        kind: 'nudge',
        responseKey: STUDENT_UID,
        at: 4,
      })
    );
  });
});
