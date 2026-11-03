// Security batch 2A: quiz and video activity response integrity.
//   - a turned-in quiz attempt's answers are final for the student, except a
//     teacher unlock or a retake that clears them; teacher and own reads still work
//   - quiz submittedAt and video completedAt must sit on the server clock
//   - bank-slot served lists are server-written; a student may only clear one for a retake
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

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
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-security-batch-2a';
const SESSION_ID = 'session-2a';
const VA_SESSION_ID = 'va-session-2a';
const CLASS_ID = 'class-2a';
const TEACHER_UID = 'teacher-2a';
const STUDENT_UID = 'student-2a';
const OTHER_UID = 'student-2a-other';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, { email: 'teacher-2a@example.com' })
    .firestore();

const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.edu`,
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const responsePath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;
const vaResponsePath = `video_activity_sessions/${VA_SESSION_ID}/responses/${STUDENT_UID}`;

const SUBMITTED = [
  { questionId: 'q1', answer: 'a', answeredAt: 1, status: 'submitted' },
];

const seedQuiz = async (
  response: Record<string, unknown>,
  session: Record<string, unknown> = {}
) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      assignmentId: 'assignment-2a',
      status: 'active',
      code: 'BATCH2A',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      totalQuestions: 2,
      attemptLimit: 3,
      ...session,
    });
    await setDoc(doc(db, responsePath), {
      studentUid: STUDENT_UID,
      joinedAt: 1000,
      score: null,
      answers: [],
      status: 'in-progress',
      completedAttempts: 0,
      preSyncVersion: 0,
      submittedAt: null,
      ...response,
    });
  });
};

const BANK_SLOTS = [
  {
    id: 's1',
    count: 1,
    points: 1,
    poolQuestionIds: ['b1', 'b2'],
    position: 1,
  },
];

const seedVa = async (response: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `video_activity_sessions/${VA_SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      activityId: 'activity-2a',
      status: 'active',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      sessionOptions: { attemptLimit: 3 },
    });
    await setDoc(doc(db, vaResponsePath), {
      studentUid: STUDENT_UID,
      joinedAt: 1000,
      score: null,
      answers: [{ questionId: 'v1', answer: 'x' }],
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
      ...response,
    });
  });
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

describe('turned-in quiz answers', () => {
  const completed = {
    status: 'completed',
    answers: SUBMITTED,
    completedAttempts: 1,
    submittedAt: 5000,
  };

  it('a student cannot change answers on a completed attempt', async () => {
    await seedQuiz(completed);
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        answers: [{ ...SUBMITTED[0], answer: 'b' }],
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        answers: [...SUBMITTED, { questionId: 'q2', answer: 'c' }],
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('the student and teacher still read the completed attempt', async () => {
    await seedQuiz(completed);
    await assertSucceeds(getDoc(doc(asStudent(), responsePath)));
    await assertSucceeds(getDoc(doc(asTeacher(), responsePath)));
    await assertFails(getDoc(doc(asStudent(OTHER_UID), responsePath)));
  });

  it('a teacher unlock lets the student resume and change answers', async () => {
    await seedQuiz({ ...completed, unlocked: true });
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        status: 'in-progress',
        answers: [{ ...SUBMITTED[0], answer: 'b' }],
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('a retake under the cap clears the answers', async () => {
    await seedQuiz(completed);
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        status: 'joined',
        answers: [],
        score: null,
        submittedAt: null,
        preSyncVersion: 0,
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('results-view counters still land after submit', async () => {
    await seedQuiz(completed);
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), { resultsTabWarnings: 1 })
    );
  });

  it('the teacher can still edit and grade a completed attempt', async () => {
    await seedQuiz(completed);
    await assertSucceeds(
      updateDoc(doc(asTeacher(), responsePath), {
        answers: [{ ...SUBMITTED[0], answer: 'b' }],
        score: 100,
      })
    );
  });

  it('answering an attempt in progress still works', async () => {
    await seedQuiz({});
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        answers: SUBMITTED,
        lastWriteAt: serverTimestamp(),
      })
    );
  });
});

describe('quiz submittedAt', () => {
  const submit = (submittedAt: unknown) => ({
    status: 'completed',
    answers: SUBMITTED,
    submittedAt,
    completedAttempts: increment(1),
  });

  it('accepts a submit stamped with the current time', async () => {
    await seedQuiz({ answers: SUBMITTED });
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), submit(Date.now()))
    );
  });

  it('refuses a backdated or future submit time', async () => {
    await seedQuiz({ answers: SUBMITTED });
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        submit(Date.now() - 60 * 60_000)
      )
    );
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        submit(Date.now() + 60 * 60_000)
      )
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), submit('yesterday'))
    );
  });

  it('cannot be cleared or rewritten on a completed attempt outside a retake', async () => {
    await seedQuiz({
      status: 'completed',
      answers: SUBMITTED,
      completedAttempts: 1,
      submittedAt: Date.now() - 60 * 60_000,
    });
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { submittedAt: null })
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        submittedAt: Date.now() - 2 * 60 * 60_000,
      })
    );
  });
});

describe('bank-slot served lists', () => {
  const answer = (extra: Record<string, unknown>) => ({
    answers: SUBMITTED,
    lastWriteAt: serverTimestamp(),
    ...extra,
  });

  it('a student cannot write a served list, legal or not', async () => {
    await seedQuiz({}, { bankSlots: BANK_SLOTS });
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answer({ servedQuestionIds: ['q1', 'b1'] })
      )
    );
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answer({ servedQuestionIds: ['q1', 'q1'] })
      )
    );
  });

  it('answer writes that keep the server draw still land', async () => {
    await seedQuiz(
      { servedQuestionIds: ['q1', 'b2'] },
      { bankSlots: BANK_SLOTS }
    );
    await assertSucceeds(updateDoc(doc(asStudent(), responsePath), answer({})));
    await assertSucceeds(getDoc(doc(asStudent(), responsePath)));
  });

  it('a student clears the draw only with a retake', async () => {
    await seedQuiz(
      {
        status: 'completed',
        answers: SUBMITTED,
        completedAttempts: 1,
        submittedAt: 5000,
        servedQuestionIds: ['q1', 'b2'],
      },
      { bankSlots: BANK_SLOTS }
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { servedQuestionIds: null })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        status: 'joined',
        answers: [],
        score: null,
        submittedAt: null,
        preSyncVersion: 0,
        servedQuestionIds: null,
        lastWriteAt: serverTimestamp(),
      })
    );
  });
});

describe('video activity completedAt', () => {
  const finish = (completedAt: unknown) => ({
    completedAt,
    completedAttempts: increment(1),
  });

  it('accepts a finish stamped with the current time', async () => {
    await seedVa();
    await assertSucceeds(
      updateDoc(doc(asStudent(), vaResponsePath), finish(Date.now()))
    );
    await assertSucceeds(getDoc(doc(asStudent(), vaResponsePath)));
    await assertSucceeds(getDoc(doc(asTeacher(), vaResponsePath)));
  });

  it('refuses a backdated or future finish time', async () => {
    await seedVa();
    await assertFails(
      updateDoc(
        doc(asStudent(), vaResponsePath),
        finish(Date.now() - 60 * 60_000)
      )
    );
    await assertFails(
      updateDoc(
        doc(asStudent(), vaResponsePath),
        finish(Date.now() + 60 * 60_000)
      )
    );
  });

  it('the teacher may still set completedAt for a student', async () => {
    await seedVa();
    await assertSucceeds(
      updateDoc(doc(asTeacher(), vaResponsePath), { completedAt: 1234 })
    );
  });
});
