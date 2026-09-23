// Rules for video_activity_sessions create ownership and the teacher-only key/answers doc.
// Requires a running Firestore emulator: pnpm run test:rules

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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-va-session-key';
const TEACHER_UID = 'teacher-va-key';
const OTHER_TEACHER_UID = 'other-teacher-va-key';
const STUDENT_UID = 'student-va-key';
const SESSION_ID = 'va-session-key';
const SESSION_PATH = `video_activity_sessions/${SESSION_ID}`;
const KEY_PATH = `${SESSION_PATH}/key/answers`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const sessionDoc = (teacherUid: string, mode = 'submissions') => ({
  id: SESSION_ID,
  activityId: 'act-1',
  teacherUid,
  status: 'active',
  mode,
  createdAt: 1,
  questions: [],
  publicQuestions: [{ id: 'q1', timestamp: 5, text: 'Q?', type: 'MC' }],
});

const keyDoc = {
  questions: [{ id: 'q1', correctAnswer: 'Paris', incorrectAnswers: ['Rome'] }],
};

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
});

const seed = async (mode = 'submissions') => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, SESSION_PATH), sessionDoc(TEACHER_UID, mode));
    await setDoc(doc(db, KEY_PATH), keyDoc);
  });
};

describe('video_activity_sessions create', () => {
  it('lets a teacher create a session they own, with its key in one batch', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(doc(db, SESSION_PATH), sessionDoc(TEACHER_UID));
    batch.set(doc(db, KEY_PATH), keyDoc);
    await assertSucceeds(batch.commit());
  });

  it('rejects a session attributed to another teacher', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), SESSION_PATH), sessionDoc(OTHER_TEACHER_UID))
    );
  });

  it('rejects a session with no teacherUid', async () => {
    const { teacherUid: _omit, ...noOwner } = sessionDoc(TEACHER_UID);
    void _omit;
    await assertFails(setDoc(doc(asTeacher(), SESSION_PATH), noOwner));
  });

  it('rejects anonymous creators even when they name themselves', async () => {
    await assertFails(
      setDoc(doc(asAnonStudent(), SESSION_PATH), sessionDoc(STUDENT_UID))
    );
  });
});

describe('video_activity_sessions/{id}/key', () => {
  it('lets the owning teacher read and rewrite the key', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asTeacher(), KEY_PATH)));
    await assertSucceeds(setDoc(doc(asTeacher(), KEY_PATH), keyDoc));
  });

  it('hides the key from students, who can still read the session', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asAnonStudent(), SESSION_PATH)));
    await assertFails(getDoc(doc(asAnonStudent(), KEY_PATH)));
    await assertFails(setDoc(doc(asAnonStudent(), KEY_PATH), keyDoc));
  });

  it('hides the key from other teachers', async () => {
    await seed();
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), KEY_PATH)));
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), KEY_PATH), keyDoc)
    );
  });

  it('refuses a key write under a session that does not exist', async () => {
    await assertFails(setDoc(doc(asTeacher(), KEY_PATH), keyDoc));
  });

  it('lets the owner delete the key alongside the session', async () => {
    await seed();
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.delete(doc(db, KEY_PATH));
    batch.delete(doc(db, SESSION_PATH));
    await assertSucceeds(batch.commit());
  });
});

describe('video_activity_sessions helpers after the vaS() refactor', () => {
  it('still records views only on view-only sessions', async () => {
    await seed('view-only');
    await assertSucceeds(
      addDoc(collection(asAnonStudent(), `${SESSION_PATH}/views`), {
        viewedAt: serverTimestamp(),
      })
    );
  });

  it('still refuses views on submission sessions', async () => {
    await seed();
    await assertFails(
      addDoc(collection(asAnonStudent(), `${SESSION_PATH}/views`), {
        viewedAt: serverTimestamp(),
      })
    );
  });

  it('still lets a student create a PIN response and blocks others deleting it', async () => {
    await seed();
    const path = `${SESSION_PATH}/responses/pin-period_1-01`;
    await assertSucceeds(
      setDoc(doc(asAnonStudent(), path), {
        studentUid: STUDENT_UID,
        pin: '01',
        joinedAt: 1,
        answers: [],
        score: null,
        completedAt: null,
        completedAttempts: 0,
        tabSwitchWarnings: 0,
      })
    );
    await assertFails(deleteDoc(doc(asTeacher(OTHER_TEACHER_UID), path)));
    await assertSucceeds(deleteDoc(doc(asTeacher(), path)));
  });
});
