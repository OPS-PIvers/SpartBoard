// Quiz run transitions are teacher-only: students and other teachers can read a
// session but never start, pause, advance or end it, and the teacher's End
// finalize may turn in a student's work. Also pins that a draft write without
// a status is accepted. Requires the Firestore emulator (`pnpm run test:rules`).

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
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-session-transitions';
const SESSION_ID = 'session-transitions';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const STUDENT_UID = 'student-uid';
const ANON_UID = 'anon-uid';
const CLASS_ID = 'class-A';
const ANON_KEY = 'pin-p1-1234';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.org`,
      email_verified: true,
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

type Db = ReturnType<typeof asTeacher>;

const sessionRef = (db: Db) => doc(db, `quiz_sessions/${SESSION_ID}`);
const responseRef = (db: Db, key = ANON_KEY) =>
  doc(db, `quiz_sessions/${SESSION_ID}/responses/${key}`);

const draft = { questionId: 'q1', answer: 'a', answeredAt: 1, status: 'draft' };

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
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      sessionMode: 'teacher',
      currentQuestionIndex: 0,
      totalQuestions: 2,
      questionPhase: 'answering',
      autoProgressAt: null,
      classIds: [CLASS_ID],
      classId: CLASS_ID,
    });
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}/responses/${ANON_KEY}`), {
      studentUid: ANON_UID,
      pin: '1234',
      joinedAt: 1000,
      score: null,
      status: 'in-progress',
      answers: [draft],
      completedAttempts: 0,
      tabSwitchWarnings: 0,
      unlocked: true,
    });
  });
});

describe('quiz session doc: run transitions', () => {
  it('lets anyone signed in read the session', async () => {
    await assertSucceeds(getDoc(sessionRef(asTeacher())));
    await assertSucceeds(getDoc(sessionRef(asAnon())));
    await assertSucceeds(getDoc(sessionRef(asStudent())));
  });

  it('lets the teacher pause, resume, advance and end', async () => {
    const db = asTeacher();
    await assertSucceeds(
      updateDoc(sessionRef(db), {
        status: 'paused',
        pausedAt: 5,
        autoProgressAt: null,
      })
    );
    await assertSucceeds(updateDoc(sessionRef(db), { status: 'active' }));
    await assertSucceeds(
      updateDoc(sessionRef(db), {
        currentQuestionIndex: 1,
        questionPhase: 'reviewing',
        autoProgressAt: 10,
      })
    );
    await assertSucceeds(
      updateDoc(sessionRef(db), {
        status: 'ended',
        endedAt: 20,
        currentQuestionIndex: 2,
      })
    );
  });

  const studentWrites: [string, Record<string, unknown>][] = [
    ['pause', { status: 'paused', pausedAt: 5 }],
    ['end', { status: 'ended', endedAt: 5 }],
    ['advance', { currentQuestionIndex: 1 }],
    ['open review', { questionPhase: 'reviewing' }],
    ['schedule auto-advance', { autoProgressAt: 5 }],
  ];

  for (const [name, patch] of studentWrites) {
    it(`refuses a student or another teacher who tries to ${name}`, async () => {
      await assertFails(updateDoc(sessionRef(asAnon()), patch));
      await assertFails(updateDoc(sessionRef(asStudent()), patch));
      await assertFails(
        updateDoc(sessionRef(asTeacher(OTHER_TEACHER_UID)), patch)
      );
    });
  }

  it('refuses the teacher handing the session to another teacher', async () => {
    await assertFails(
      updateDoc(sessionRef(asTeacher()), { teacherUid: OTHER_TEACHER_UID })
    );
  });

  it('refuses a student who tries to delete the session', async () => {
    await assertFails(deleteDoc(sessionRef(asAnon())));
    await assertFails(deleteDoc(sessionRef(asStudent())));
  });
});

describe('quiz responses: End finalize and draft writes', () => {
  it('lets the teacher turn in a student’s work and both of them read it', async () => {
    await assertSucceeds(
      updateDoc(responseRef(asTeacher()), {
        status: 'completed',
        submittedAt: 30,
        unlocked: false,
        completedAttempts: 1,
        answers: [{ ...draft, status: 'submitted' }],
      })
    );
    await assertSucceeds(getDoc(responseRef(asTeacher())));
    await assertSucceeds(getDoc(responseRef(asAnon())));
  });

  it('refuses another teacher’s finalize and read', async () => {
    const other = asTeacher(OTHER_TEACHER_UID);
    await assertFails(
      updateDoc(responseRef(other), {
        status: 'completed',
        submittedAt: 30,
      })
    );
    await assertFails(getDoc(responseRef(other)));
  });

  it('accepts a draft write that leaves status alone', async () => {
    await assertSucceeds(
      updateDoc(responseRef(asAnon()), {
        answers: [{ ...draft, answer: 'ab' }],
        lastWriteAt: serverTimestamp(),
      })
    );
  });

  it('accepts the first draft moving a joined student to in-progress', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(responseRef(ctx.firestore()), {
        status: 'joined',
        answers: [],
      });
    });
    await assertSucceeds(
      updateDoc(responseRef(asAnon()), {
        status: 'in-progress',
        answers: [draft],
        lastWriteAt: serverTimestamp(),
      })
    );
  });
});
