// Firestore security-rules tests for the M17 session-level `openAt` gate on
// response CREATE. Requires a running Firestore emulator; invoke via
// `pnpm run test:rules`.
//
// Contract (mirrors the `closeAt` gate in assignmentCloseWindow.test.ts, but
// inverted and create-only): each assignment kind enforces
// `openAt == null || request.time.toMillis() >= openAt - grace` on the STUDENT
// CREATE branch. Updates are deliberately NOT gated — an attempt that legitimately
// started must never be bricked by a teacher pushing openAt later. Every pre-M17
// session (no `openAt` field) behaves exactly as before.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-open-window-test';
const SESSION_NO_OPEN = 'session-no-open';
const SESSION_ALREADY_OPEN = 'session-opened-already';
const SESSION_NOT_YET_OPEN = 'session-opens-later';
const CLASS_A = 'class-A';
const TEACHER_UID = 'teacher-uid-1';
const STUDENT_UID = 'student-a-uid';

const PAST = 1_000_000_000_000; // 2001 — safely behind request.time
const FUTURE = 4_000_000_000_000; // 2096 — safely ahead of request.time

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

/** openAt omitted entirely for SESSION_NO_OPEN — the legacy/pre-M17 shape. */
function openAtFor(sessionId: string): Record<string, number> {
  if (sessionId === SESSION_ALREADY_OPEN) return { openAt: PAST };
  if (sessionId === SESSION_NOT_YET_OPEN) return { openAt: FUTURE };
  return {};
}

const ALL_SESSIONS = [
  SESSION_NO_OPEN,
  SESSION_ALREADY_OPEN,
  SESSION_NOT_YET_OPEN,
];

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

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

describe('quiz_sessions/responses — session openAt gate', () => {
  const respPath = (session: string) =>
    `quiz_sessions/${session}/responses/${STUDENT_UID}`;
  const baseResp = () => ({
    studentUid: STUDENT_UID,
    joinedAt: 1000,
    score: null,
    answers: [] as unknown[],
    status: 'active',
    tabSwitchWarnings: 0,
    completedAttempts: 0,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const sessionId of ALL_SESSIONS) {
        await setDoc(doc(db, `quiz_sessions/${sessionId}`), {
          teacherUid: TEACHER_UID,
          classId: CLASS_A,
          status: 'active',
          ...openAtFor(sessionId),
        });
      }
    });
  });

  it('create succeeds on a session with NO openAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_NO_OPEN)), baseResp())
    );
  });

  it('create succeeds after openAt', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_ALREADY_OPEN)), baseResp())
    );
  });

  it('create fails before openAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), respPath(SESSION_NOT_YET_OPEN)), baseResp())
    );
  });

  it('create succeeds inside the open grace window', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // Opens 5s from now — inside the 120s grace.
      await setDoc(doc(ctx.firestore(), `quiz_sessions/session-open-grace`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        status: 'active',
        openAt: Date.now() + 5_000,
      });
    });
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath('session-open-grace')), baseResp())
    );
  });

  it('an already-started attempt keeps updating when openAt moves into the future', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_NOT_YET_OPEN)),
        baseResp()
      );
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_NOT_YET_OPEN)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Video activity
// ---------------------------------------------------------------------------

describe('video_activity_sessions/responses — session openAt gate', () => {
  const respPath = (session: string) =>
    `video_activity_sessions/${session}/responses/${STUDENT_UID}`;
  const baseResp = () => ({
    studentUid: STUDENT_UID,
    name: 'Student A',
    joinedAt: 1000,
    score: null,
    completedAt: null,
    answers: [] as unknown[],
    completedAttempts: 0,
    tabSwitchWarnings: 0,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const sessionId of ALL_SESSIONS) {
        await setDoc(doc(db, `video_activity_sessions/${sessionId}`), {
          id: sessionId,
          activityId: 'act-1',
          teacherUid: TEACHER_UID,
          classId: CLASS_A,
          status: 'active',
          createdAt: 1000,
          ...openAtFor(sessionId),
        });
      }
    });
  });

  it('create succeeds on a session with NO openAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_NO_OPEN)), baseResp())
    );
  });

  it('create succeeds after openAt', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_ALREADY_OPEN)), baseResp())
    );
  });

  it('create fails before openAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), respPath(SESSION_NOT_YET_OPEN)), baseResp())
    );
  });

  it('an already-started attempt keeps updating when openAt moves into the future', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_NOT_YET_OPEN)),
        baseResp()
      );
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_NOT_YET_OPEN)), {
        answers: [{ q: 0, a: 'A' }],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Guided learning
// ---------------------------------------------------------------------------

describe('guided_learning_sessions/responses — session openAt gate', () => {
  const respPath = (session: string) =>
    `guided_learning_sessions/${session}/responses/${STUDENT_UID}`;
  const baseResp = (sessionId: string) => ({
    studentAnonymousId: STUDENT_UID,
    sessionId,
    startedAt: 1000,
    score: null,
    answers: [] as unknown[],
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const sessionId of ALL_SESSIONS) {
        await setDoc(doc(db, `guided_learning_sessions/${sessionId}`), {
          teacherUid: TEACHER_UID,
          classId: CLASS_A,
          status: 'active',
          ...openAtFor(sessionId),
        });
      }
    });
  });

  it('create succeeds on a session with NO openAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), respPath(SESSION_NO_OPEN)),
        baseResp(SESSION_NO_OPEN)
      )
    );
  });

  it('create succeeds after openAt', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), respPath(SESSION_ALREADY_OPEN)),
        baseResp(SESSION_ALREADY_OPEN)
      )
    );
  });

  it('create fails before openAt', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), respPath(SESSION_NOT_YET_OPEN)),
        baseResp(SESSION_NOT_YET_OPEN)
      )
    );
  });

  it('an already-started attempt keeps updating when openAt moves into the future', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_NOT_YET_OPEN)),
        baseResp(SESSION_NOT_YET_OPEN)
      );
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_NOT_YET_OPEN)), {
        answers: [{ q: 0, a: 'A' }],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Mini-app
// ---------------------------------------------------------------------------

describe('mini_app_sessions/submissions — session openAt gate', () => {
  const subPath = (session: string) =>
    `mini_app_sessions/${session}/submissions/${STUDENT_UID}`;
  const validSub = () => ({
    submittedAt: 1000,
    studentUid: STUDENT_UID,
    payload: { score: 42 } as Record<string, unknown>,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const sessionId of ALL_SESSIONS) {
        await setDoc(doc(db, `mini_app_sessions/${sessionId}`), {
          teacherUid: TEACHER_UID,
          classIds: [CLASS_A],
          status: 'active',
          submissionsEnabled: true,
          ...openAtFor(sessionId),
        });
      }
    });
  });

  it('submit succeeds on a session with NO openAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), subPath(SESSION_NO_OPEN)), validSub())
    );
  });

  it('submit succeeds after openAt', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), subPath(SESSION_ALREADY_OPEN)), validSub())
    );
  });

  it('first submit fails before openAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), subPath(SESSION_NOT_YET_OPEN)), validSub())
    );
  });

  it('an existing submission can still be updated when openAt moves into the future', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), subPath(SESSION_NOT_YET_OPEN)),
        validSub()
      );
    });
    await assertSucceeds(
      setDoc(doc(asStudent(), subPath(SESSION_NOT_YET_OPEN)), {
        submittedAt: 2000,
        studentUid: STUDENT_UID,
        payload: { score: 43 },
      })
    );
  });
});
