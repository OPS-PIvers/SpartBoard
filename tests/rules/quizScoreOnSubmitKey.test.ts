// Rules for the score-on-submit answer key under users/{uid}/quiz_assignments/{id}/key.
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-score-on-submit';
const TEACHER_UID = 'teacher-uid-sos';
const OTHER_TEACHER_UID = 'teacher-uid-other';
const STUDENT_UID = 'anon-student-sos';
const KEY_PATH = `users/${TEACHER_UID}/quiz_assignments/a1/key/answers`;
const KEY = {
  questions: [
    {
      id: 'q1',
      type: 'MC',
      points: 1,
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome'],
    },
  ],
};
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER_UID) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@school.edu` }).firestore();
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), KEY_PATH), KEY);
  });
});

describe('score-on-submit answer key', () => {
  it('lets the owning teacher read, write and delete it', async () => {
    const db = asTeacher();
    await assertSucceeds(getDoc(doc(db, KEY_PATH)));
    await assertSucceeds(setDoc(doc(db, KEY_PATH), KEY));
    await assertSucceeds(deleteDoc(doc(db, KEY_PATH)));
  });

  it('never lets a student read or write it', async () => {
    const db = asStudent();
    await assertFails(getDoc(doc(db, KEY_PATH)));
    await assertFails(setDoc(doc(db, KEY_PATH), KEY));
  });

  it('never lets another teacher read or write it', async () => {
    const db = asTeacher(OTHER_TEACHER_UID);
    await assertFails(getDoc(doc(db, KEY_PATH)));
    await assertFails(setDoc(doc(db, KEY_PATH), KEY));
  });

  it('denies signed-out reads', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, KEY_PATH)));
  });
});
