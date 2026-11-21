// Firestore rules for the Speech to text marker (`dictated`) on quiz responses.
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
  arrayUnion,
  doc,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-dictated';
const TEACHER_UID = 'teacher-uid-dictated';
const STUDENT_UID = 'student-uid-dictated';
const OTHER_UID = 'other-uid-dictated';
const QUIZ_SESSION = 'quiz-session-dictated';
const PIN_KEY = 'pin-period_1-01';

const SESSION = `quiz_sessions/${QUIZ_SESSION}`;
const RESPONSE = `quiz_sessions/${QUIZ_SESSION}/responses/${PIN_KEY}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asStudent = () => anon(STUDENT_UID);
const asOther = () => anon(OTHER_UID);
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, SESSION), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'DICTATE',
    });
    await setDoc(doc(db, RESPONSE), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAttempts: 0,
      status: 'in-progress',
      submittedAt: null,
      preSyncVersion: 0,
      lastWriteAt: Timestamp.fromMillis(1000),
    });
  });
});

const response = (db: ReturnType<typeof asStudent>) => doc(db, RESPONSE);
const seed = (data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled((ctx) =>
    updateDoc(doc(ctx.firestore(), RESPONSE), data)
  );

describe('dictated on quiz responses', () => {
  it('lets the student add one dictated question at a time', async () => {
    await assertSucceeds(
      updateDoc(response(asStudent()), { dictated: arrayUnion('q1') })
    );
    await assertSucceeds(
      updateDoc(response(asStudent()), { dictated: arrayUnion('q2') })
    );
  });

  it('refuses another student', async () => {
    await assertFails(
      updateDoc(response(asOther()), { dictated: arrayUnion('q1') })
    );
  });

  it('refuses anything but a list that grows by one short string', async () => {
    await seed({ dictated: ['q1'] });
    const db = asStudent();
    await assertFails(updateDoc(response(db), { dictated: 'q1' }));
    await assertFails(updateDoc(response(db), { dictated: ['q1', 7] }));
    await assertFails(
      updateDoc(response(db), { dictated: ['q1', 'q2', 'q3'] })
    );
    await assertFails(updateDoc(response(db), { dictated: ['other', 'q2'] }));
    await assertFails(
      updateDoc(response(db), { dictated: ['q1', 'x'.repeat(65)] })
    );
  });

  it('caps the list at 300', async () => {
    const ids = Array.from({ length: 299 }, (_, i) => `q${i}`);
    await seed({ dictated: ids });
    await assertSucceeds(
      updateDoc(response(asStudent()), { dictated: arrayUnion('last') })
    );
    await assertFails(
      updateDoc(response(asStudent()), { dictated: arrayUnion('over') })
    );
  });

  it('refuses the marker alongside any other field', async () => {
    await assertFails(
      updateDoc(response(asStudent()), {
        dictated: arrayUnion('q1'),
        score: 100,
      })
    );
  });

  it('refuses a turned-in attempt until the teacher unlocks it', async () => {
    await seed({ status: 'completed', submittedAt: 2000 });
    await assertFails(
      updateDoc(response(asStudent()), { dictated: arrayUnion('q1') })
    );
    await seed({ unlocked: true });
    await assertSucceeds(
      updateDoc(response(asStudent()), { dictated: arrayUnion('q1') })
    );
  });

  it('lets the student clear the list for a new attempt', async () => {
    await seed({ dictated: ['q1', 'q2'] });
    await assertSucceeds(updateDoc(response(asStudent()), { dictated: [] }));
  });

  it('refuses the marker on the join write', async () => {
    const own = `quiz_sessions/${QUIZ_SESSION}/responses/${OTHER_UID}`;
    await assertFails(
      setDoc(doc(asOther(), own), {
        studentUid: OTHER_UID,
        joinedAt: 1000,
        score: null,
        answers: [],
        completedAttempts: 0,
        status: 'joined',
        submittedAt: null,
        preSyncVersion: 0,
        dictated: ['q1'],
      })
    );
  });

  it('lets the teacher write it', async () => {
    await assertSucceeds(
      updateDoc(response(asTeacher()), { dictated: ['q1', 'q2'] })
    );
  });
});
