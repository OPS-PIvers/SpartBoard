// Firestore rules tests for the quiz time-limit fields on response docs:
// `attemptStartedAt` (server-stamped attempt start) and `timeUp`.
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
  Timestamp,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-time-limit-test';
const SESSION_ID = 'session-time-limit';
const TEACHER_UID = 'teacher-time-limit';
const STUDENT_UID = 'student-time-limit';
const OTHER_UID = 'other-time-limit';
const CLASS_ID = 'class-time-limit';

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

const responsePath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;
const EARLIER = Timestamp.fromMillis(Date.now() - 10 * 60_000);

const seed = async (response: Record<string, unknown> | null) => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'TIMED1',
      sessionMode: 'student',
      timeLimitMinutes: 30,
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

const joinPayload = (extra: Record<string, unknown>) => ({
  studentUid: STUDENT_UID,
  joinedAt: 1000,
  lastWriteAt: serverTimestamp(),
  score: null,
  answers: [],
  submittedAt: null,
  status: 'joined',
  completedAttempts: 0,
  preSyncVersion: 0,
  ...extra,
});

describe('CREATE', () => {
  beforeEach(async () => {
    await seed(null);
  });

  it('a server-stamped attemptStartedAt SUCCEEDS', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), responsePath),
        joinPayload({ attemptStartedAt: serverTimestamp() })
      )
    );
  });

  it('a client-chosen attemptStartedAt is REJECTED', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), responsePath),
        joinPayload({
          attemptStartedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
        })
      )
    );
  });

  it('timeUp at join is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asStudent(), responsePath), joinPayload({ timeUp: true }))
    );
  });
});

describe('UPDATE attemptStartedAt', () => {
  it('re-stamping a running clock mid-attempt is REJECTED', async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        attemptStartedAt: serverTimestamp(),
      })
    );
  });

  it('deleting a running clock is REJECTED', async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        attemptStartedAt: deleteField(),
      })
    );
  });

  it('stamping a missing clock with server time SUCCEEDS', async () => {
    await seed({});
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        attemptStartedAt: serverTimestamp(),
      })
    );
  });

  it('stamping a missing clock with a client time is REJECTED', async () => {
    await seed({});
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        attemptStartedAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      })
    );
  });

  it('a new attempt (completed -> joined) restarts the clock', async () => {
    await seed({
      status: 'completed',
      completedAttempts: 1,
      attemptStartedAt: EARLIER,
      timeUp: true,
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        status: 'joined',
        answers: [],
        score: null,
        submittedAt: null,
        preSyncVersion: 0,
        attemptStartedAt: serverTimestamp(),
        timeUp: deleteField(),
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it("another student can't touch the clock", async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertFails(
      updateDoc(doc(studentCtx(OTHER_UID), responsePath), {
        attemptStartedAt: serverTimestamp(),
      })
    );
  });

  it('the teacher can restart the clock on unlock', async () => {
    await seed({
      status: 'completed',
      attemptStartedAt: EARLIER,
      timeUp: true,
    });
    await assertSucceeds(
      updateDoc(doc(asTeacher(), responsePath), {
        status: 'in-progress',
        unlocked: true,
        timeUp: deleteField(),
        attemptStartedAt: serverTimestamp(),
      })
    );
  });
});

describe('UPDATE timeUp', () => {
  it('setting it with the submit SUCCEEDS', async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        status: 'completed',
        submittedAt: Date.now(),
        completedAttempts: 1,
        timeUp: true,
      })
    );
  });

  it('setting it without submitting is REJECTED', async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { timeUp: true })
    );
  });

  it('clearing it outside a new attempt is REJECTED', async () => {
    await seed({ status: 'completed', completedAttempts: 1, timeUp: true });
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { timeUp: deleteField() })
    );
  });
});

describe('READ', () => {
  it('the student reads their own timed response', async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertSucceeds(getDoc(doc(asStudent(), responsePath)));
  });

  it('the teacher reads it', async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertSucceeds(getDoc(doc(asTeacher(), responsePath)));
  });

  it("another student can't read it", async () => {
    await seed({ attemptStartedAt: EARLIER });
    await assertFails(getDoc(doc(studentCtx(OTHER_UID), responsePath)));
  });
});
