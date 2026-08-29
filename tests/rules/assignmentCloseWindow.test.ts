// Firestore security-rules tests for the M17 session-level `closeAt` gate on
// response writes (§5 A3). Requires a running Firestore emulator; invoke via
// `pnpm run test:rules`.
//
// Contract: each of the four assignment kinds enforces
// `closeAt == null || request.time.toMillis() < closeAt` on the STUDENT write
// branch only. Teacher grading after close is untouched, and — the zero-
// regression criterion — every pre-M17 session (no `closeAt` field at all)
// behaves exactly as before.
//
// Per-student window shifts are deliberately NOT enforced here (spec §6
// non-goal): a second get() on the hottest write path is not worth it.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-close-window-test';
const SESSION_OPEN = 'session-no-close';
const SESSION_FUTURE = 'session-closes-later';
const SESSION_PAST = 'session-already-closed';
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

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

/** closeAt omitted entirely for SESSION_OPEN — the legacy/pre-M17 shape. */
function closeAtFor(sessionId: string): Record<string, number> {
  if (sessionId === SESSION_FUTURE) return { closeAt: FUTURE };
  if (sessionId === SESSION_PAST) return { closeAt: PAST };
  return {};
}

const ALL_SESSIONS = [SESSION_OPEN, SESSION_FUTURE, SESSION_PAST];

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

describe('quiz_sessions/responses — session closeAt gate', () => {
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
          ...closeAtFor(sessionId),
        });
      }
    });
  });

  it('create succeeds on a session with NO closeAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_OPEN)), baseResp())
    );
  });

  it('create succeeds before closeAt', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_FUTURE)), baseResp())
    );
  });

  it('create fails after closeAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), respPath(SESSION_PAST)), baseResp())
    );
  });

  it('student update succeeds on a session with NO closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_OPEN)), baseResp());
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_OPEN)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
  });

  it('student update fails after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_PAST)), baseResp());
    });
    await assertFails(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
  });

  it('teacher can still grade after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_PAST)), baseResp());
    });
    await assertSucceeds(
      updateDoc(doc(asTeacher(), respPath(SESSION_PAST)), { score: 90 })
    );
  });
});

// ---------------------------------------------------------------------------
// Video activity
// ---------------------------------------------------------------------------

describe('video_activity_sessions/responses — session closeAt gate', () => {
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
          ...closeAtFor(sessionId),
        });
      }
    });
  });

  it('create succeeds on a session with NO closeAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_OPEN)), baseResp())
    );
  });

  it('create succeeds before closeAt', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_FUTURE)), baseResp())
    );
  });

  it('create fails after closeAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), respPath(SESSION_PAST)), baseResp())
    );
  });

  it('student update fails after closeAt but teacher grading still passes', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_PAST)), baseResp());
    });
    await assertFails(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ q: 0, a: 'A' }],
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), respPath(SESSION_PAST)), { score: 80 })
    );
  });
});

// ---------------------------------------------------------------------------
// Guided learning
// ---------------------------------------------------------------------------

describe('guided_learning_sessions/responses — session closeAt gate', () => {
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
          ...closeAtFor(sessionId),
        });
      }
    });
  });

  it('create succeeds on a session with NO closeAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), respPath(SESSION_OPEN)), baseResp(SESSION_OPEN))
    );
  });

  it('create succeeds before closeAt', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), respPath(SESSION_FUTURE)),
        baseResp(SESSION_FUTURE)
      )
    );
  });

  it('create fails after closeAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), respPath(SESSION_PAST)), baseResp(SESSION_PAST))
    );
  });

  it('student update fails after closeAt but teacher grading still passes', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_PAST)),
        baseResp(SESSION_PAST)
      );
    });
    await assertFails(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ q: 0, a: 'A' }],
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), respPath(SESSION_PAST)), { score: 70 })
    );
  });
});

// ---------------------------------------------------------------------------
// Mini-app
// ---------------------------------------------------------------------------

describe('mini_app_sessions/submissions — session closeAt gate', () => {
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
          ...closeAtFor(sessionId),
        });
      }
    });
  });

  it('submit succeeds on a session with NO closeAt (pre-M17 shape)', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), subPath(SESSION_OPEN)), validSub())
    );
  });

  it('submit succeeds before closeAt', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), subPath(SESSION_FUTURE)), validSub())
    );
  });

  it('submit fails after closeAt', async () => {
    await assertFails(
      setDoc(doc(asStudent(), subPath(SESSION_PAST)), validSub())
    );
  });

  it('teacher can still delete a submission after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), subPath(SESSION_PAST)), validSub());
    });
    await assertSucceeds(deleteDoc(doc(asTeacher(), subPath(SESSION_PAST))));
  });
});

// ---------------------------------------------------------------------------
// Grace window (F4) + post-close exemptions (F5)
// ---------------------------------------------------------------------------
//
// The gate carries a fixed 120s grace so the client's mid-attempt auto-submit
// (spec §3a-D) is not rejected as it races closeAt, and it is scoped so two
// PRE-EXISTING student flows keep working after close: published-results
// anti-screenshot writes, and a teacher-granted `unlocked` extension.

const SESSION_GRACE = 'session-closed-within-grace';
const SESSION_UNLOCKED = 'session-closed-unlocked';

describe('quiz closeAt — grace window and post-close exemptions', () => {
  const respPath = (session: string) =>
    `quiz_sessions/${session}/responses/${STUDENT_UID}`;
  const baseResp = (extra: Record<string, unknown> = {}) => ({
    studentUid: STUDENT_UID,
    joinedAt: 1000,
    score: null,
    answers: [] as unknown[],
    status: 'active',
    tabSwitchWarnings: 0,
    completedAttempts: 0,
    ...extra,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Closed 5s ago — inside the 120s grace.
      await setDoc(doc(db, `quiz_sessions/${SESSION_GRACE}`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        status: 'active',
        closeAt: Date.now() - 5_000,
      });
      await setDoc(doc(db, `quiz_sessions/${SESSION_PAST}`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        status: 'active',
        closeAt: PAST,
      });
    });
  });

  it('accepts the mid-attempt auto-submit landing just after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_GRACE)), baseResp());
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_GRACE)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
        status: 'completed',
        submittedAt: 2000,
      })
    );
  });

  it('still denies an ordinary answer write long after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_PAST)), baseResp());
    });
    await assertFails(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
  });

  it('allows a results-protection-only write after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_PAST)),
        baseResp({ score: 90, status: 'completed', resultsTabWarnings: 0 })
      );
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        resultsTabWarnings: 1,
        resultsLockedOut: true,
        resultsLockedOutAt: 3000,
      })
    );
  });

  it('allows the unlocked student to finish and clear the flag after closeAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_PAST)),
        baseResp({ unlocked: true, status: 'joined' })
      );
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
        status: 'completed',
        submittedAt: 2000,
        unlocked: false,
      })
    );
  });

  it('denies a post-close answer write when unlocked is false', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_PAST)),
        baseResp({ unlocked: false })
      );
    });
    await assertFails(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
  });
});

describe('video activity closeAt — grace window and unlocked exemption', () => {
  const respPath = (session: string) =>
    `video_activity_sessions/${session}/responses/${STUDENT_UID}`;
  const baseResp = (extra: Record<string, unknown> = {}) => ({
    studentUid: STUDENT_UID,
    name: 'Student A',
    joinedAt: 1000,
    score: null,
    completedAt: null,
    answers: [] as unknown[],
    completedAttempts: 0,
    tabSwitchWarnings: 0,
    ...extra,
  });

  const seedSession = async (sessionId: string, closeAt: number) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `video_activity_sessions/${sessionId}`),
        {
          id: sessionId,
          activityId: 'act-1',
          teacherUid: TEACHER_UID,
          classId: CLASS_A,
          status: 'active',
          createdAt: 1000,
          closeAt,
        }
      );
    });
  };

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('accepts the mid-attempt auto-submit landing just after closeAt', async () => {
    await seedSession(SESSION_GRACE, Date.now() - 5_000);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_GRACE)), baseResp());
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_GRACE)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
        completedAt: 2000,
      })
    );
  });

  it('allows the unlocked student to finish and clear the flag after closeAt', async () => {
    await seedSession(SESSION_UNLOCKED, PAST);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath(SESSION_UNLOCKED)),
        baseResp({ unlocked: true })
      );
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath(SESSION_UNLOCKED)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
        completedAt: 2000,
        unlocked: false,
      })
    );
  });

  it('denies a post-close answer write when not unlocked', async () => {
    await seedSession(SESSION_PAST, PAST);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), respPath(SESSION_PAST)), baseResp());
    });
    await assertFails(
      updateDoc(doc(asStudent(), respPath(SESSION_PAST)), {
        answers: [{ questionId: 'q1', answer: 'A' }],
      })
    );
  });
});
