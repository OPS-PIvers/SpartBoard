// Firestore rules tests for quiz Stop checkpoints (`partsDone`, `partHeld` on
// response docs, `partsOpen` on the session).
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

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
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-stop-checkpoint-test';
const SESSION_ID = 'session-stop';
const TEACHER_UID = 'teacher-stop';
const STUDENT_UID = 'student-stop';
const OTHER_UID = 'other-stop';
const CLASS_ID = 'class-stop';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const studentCtx = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.edu`,
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asStudent = () => studentCtx(STUDENT_UID);
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, { email: 't@school.edu' })
    .firestore();

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

const sessionPath = `quiz_sessions/${SESSION_ID}`;
const responsePath = `${sessionPath}/responses/${STUDENT_UID}`;

const seed = async (response: Record<string, unknown> | null) => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, sessionPath), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'STOP01',
      sessionMode: 'student',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
    });
    if (response) {
      await setDoc(doc(db, responsePath), {
        studentUid: STUDENT_UID,
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'in-progress',
        completedAttempts: 0,
        preSyncVersion: 0,
        ...response,
      });
    }
  });
};

describe('student response', () => {
  it('holding at a Stop with a part count SUCCEEDS', async () => {
    await seed({});
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        partsDone: 1,
        partHeld: true,
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('clearing the hold, and a new attempt deleting both fields, SUCCEEDS', async () => {
    await seed({ partsDone: 1, partHeld: true });
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), { partHeld: null })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        partsDone: deleteField(),
        partHeld: deleteField(),
      })
    );
  });

  it('a non-number part count or a non-true hold is REJECTED', async () => {
    await seed({});
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { partsDone: '2' })
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { partHeld: 'yes' })
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { partHeld: false })
    );
  });

  it('a hold forged at join is REJECTED', async () => {
    await seed(null);
    await assertFails(
      setDoc(doc(asStudent(), responsePath), {
        studentUid: STUDENT_UID,
        joinedAt: 1000,
        lastWriteAt: serverTimestamp(),
        score: null,
        answers: [],
        submittedAt: null,
        status: 'joined',
        completedAttempts: 0,
        preSyncVersion: 0,
        partHeld: true,
      })
    );
  });

  it('another student writing the hold is REJECTED', async () => {
    await seed({});
    await assertFails(
      updateDoc(doc(studentCtx(OTHER_UID), responsePath), { partHeld: true })
    );
  });

  it('the student and teacher can READ the held response', async () => {
    await seed({ partsDone: 1, partHeld: true });
    await assertSucceeds(getDoc(doc(asStudent(), responsePath)));
    await assertSucceeds(getDoc(doc(asTeacher(), responsePath)));
  });
});

describe('session partsOpen', () => {
  it('the teacher opening a part SUCCEEDS, and a student can READ it', async () => {
    await seed(null);
    await assertSucceeds(
      updateDoc(doc(asTeacher(), sessionPath), {
        'partsOpen.periods.Hour 2': 2,
      })
    );
    await assertSucceeds(getDoc(doc(asStudent(), sessionPath)));
  });

  it('a student opening a part is REJECTED', async () => {
    await seed(null);
    await assertFails(
      updateDoc(doc(asStudent(), sessionPath), { 'partsOpen.all': 2 })
    );
  });
});
