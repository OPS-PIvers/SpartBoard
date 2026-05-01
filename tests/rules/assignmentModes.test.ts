// Firestore security-rules tests for the assignment-modes feature (PR #1473).
//
// Two enforcement surfaces:
//   1. `views/{viewId}` subcollections under each of the four widget session
//      collections — view-tracking writes for view-only Share links. The
//      rule must require the parent session to exist AND be in view-only
//      mode (`mode == 'view-only'` for Quiz/VA/Mini App, `assignmentMode`
//      for Guided Learning), and must accept only a single `viewedAt`
//      timestamp field.
//   2. Response/submission writes on the four widgets' subcollections must
//      be DENIED when the parent session is in view-only mode. This is the
//      defense-in-depth gate alongside the client-side `if (isViewOnly)
//      return;` checks in the four student apps.
//
// The GL field-naming asymmetry (assignmentMode vs mode) is the most
// regression-prone part: a refactor that consolidates to a single field
// will silently weaken GL's gate unless this test suite catches it.
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
import { setDoc, addDoc, collection, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-assignment-modes';
const TEACHER_UID = 'teacher-uid-am';
const STUDENT_UID = 'anon-student-uid';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Anonymous student auth context — matches the bare-token shape that
// production Firebase anonymous sign-in produces, which is how view-only
// share links authenticate.
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
});

// ---------------------------------------------------------------------------
// `views/{viewId}` subcollection — Quiz / Video Activity / Mini App share
// the `mode` field check. Guided Learning uses `assignmentMode`. The four
// widget paths get the same suite of tests via a shared factory so a
// regression in one widget surfaces here as a deterministic failure for
// just that widget.
// ---------------------------------------------------------------------------

interface ViewsRulesFixture {
  /** Human-readable widget name for test descriptions. */
  label: string;
  /** Top-level Firestore collection path. */
  collectionName: string;
  /** Field on the session doc that carries the assignment mode. */
  modeField: 'mode' | 'assignmentMode';
  /** Extra fields a session needs to satisfy unrelated rule preconditions. */
  baseSessionData: Record<string, unknown>;
}

const QUIZ_FIXTURE: ViewsRulesFixture = {
  label: 'quiz_sessions',
  collectionName: 'quiz_sessions',
  modeField: 'mode',
  baseSessionData: {
    teacherUid: TEACHER_UID,
    status: 'active',
    code: 'AMTEST',
  },
};
const VA_FIXTURE: ViewsRulesFixture = {
  label: 'video_activity_sessions',
  collectionName: 'video_activity_sessions',
  modeField: 'mode',
  baseSessionData: { teacherUid: TEACHER_UID, status: 'active' },
};
const MA_FIXTURE: ViewsRulesFixture = {
  label: 'mini_app_sessions',
  collectionName: 'mini_app_sessions',
  modeField: 'mode',
  baseSessionData: { teacherUid: TEACHER_UID, status: 'active' },
};
const GL_FIXTURE: ViewsRulesFixture = {
  label: 'guided_learning_sessions',
  collectionName: 'guided_learning_sessions',
  modeField: 'assignmentMode',
  baseSessionData: { teacherUid: TEACHER_UID },
};

const FIXTURES = [QUIZ_FIXTURE, VA_FIXTURE, MA_FIXTURE, GL_FIXTURE];

describe('views/{viewId} subcollection — view-only gate', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.label, () => {
      const sessionId = `${fixture.collectionName}-session`;

      const seedSession = async (
        modeValue: 'submissions' | 'view-only' | undefined
      ) => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          const db = ctx.firestore();
          const data: Record<string, unknown> = {
            ...fixture.baseSessionData,
          };
          if (modeValue !== undefined) {
            data[fixture.modeField] = modeValue;
          }
          await setDoc(doc(db, `${fixture.collectionName}/${sessionId}`), data);
        });
      };

      const viewsCollection = () =>
        collection(asStudent(), `${fixture.collectionName}/${sessionId}/views`);

      it('allows view doc create when session exists and is view-only', async () => {
        await seedSession('view-only');
        await assertSucceeds(
          addDoc(viewsCollection(), { viewedAt: new Date() })
        );
      });

      it('denies view doc create when the parent session does NOT exist', async () => {
        // No seedSession — the session id points to a non-existent doc. The
        // rule must reject so a malicious authenticated user can't spam view
        // docs under arbitrary session ids to inflate metrics.
        await assertFails(addDoc(viewsCollection(), { viewedAt: new Date() }));
      });

      it('denies view doc create when the session is in submissions mode', async () => {
        await seedSession('submissions');
        await assertFails(addDoc(viewsCollection(), { viewedAt: new Date() }));
      });

      it('denies view doc create when the session has no mode field set (legacy / pre-feature)', async () => {
        // Pre-feature sessions default to `'submissions'` semantics — view
        // tracking is exclusive to view-only sessions, so legacy sessions
        // must reject view writes too.
        await seedSession(undefined);
        await assertFails(addDoc(viewsCollection(), { viewedAt: new Date() }));
      });

      it('denies view doc create with extra fields beyond viewedAt', async () => {
        await seedSession('view-only');
        await assertFails(
          addDoc(viewsCollection(), {
            viewedAt: new Date(),
            // Anything beyond `viewedAt` violates `keys().hasOnly(['viewedAt'])`
            studentUid: STUDENT_UID,
          })
        );
      });

      it('denies view doc create when viewedAt is not a timestamp', async () => {
        await seedSession('view-only');
        await assertFails(
          addDoc(viewsCollection(), {
            viewedAt: 'not-a-timestamp',
          })
        );
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Submission/response writes — must be DENIED when the parent session is in
// view-only mode. Each widget has its own response shape and rule path; the
// shared invariant is the view-only gate.
// ---------------------------------------------------------------------------

describe('Quiz responses — view-only mode blocks submissions', () => {
  const sessionId = 'quiz-vo-session';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `quiz_sessions/${sessionId}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'AMTEST',
        mode: 'view-only',
      });
    });
  });

  it("denies anonymous PIN response create when mode === 'view-only'", async () => {
    const responseKey = `pin-period_1-01`;
    const path = `quiz_sessions/${sessionId}/responses/${responseKey}`;
    await assertFails(
      setDoc(doc(asStudent(), path), {
        studentUid: STUDENT_UID,
        pin: '01',
        classPeriod: 'period_1',
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'joined',
        completedAttempts: 0,
      })
    );
  });
});

describe('Video Activity responses — view-only mode blocks submissions', () => {
  const sessionId = 'va-vo-session';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `video_activity_sessions/${sessionId}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        mode: 'view-only',
      });
    });
  });

  it("denies response create when mode === 'view-only'", async () => {
    const path = `video_activity_sessions/${sessionId}/responses/${STUDENT_UID}`;
    await assertFails(
      setDoc(doc(asStudent(), path), {
        studentUid: STUDENT_UID,
        score: null,
        completedAt: null,
        answers: [],
        joinedAt: 1000,
      })
    );
  });
});

describe('Mini App submissions — view-only mode blocks writes', () => {
  const sessionId = 'ma-vo-session';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `mini_app_sessions/${sessionId}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        mode: 'view-only',
        // submissionsEnabled is now derived from mode; force-set both ways
        // to prove the rule's `mode` check holds even if a doc somehow
        // carries inconsistent fields.
        submissionsEnabled: true,
      });
    });
  });

  it("denies submission create when mode === 'view-only' (even with submissionsEnabled=true)", async () => {
    // submissionsEnabled=true alone would historically allow the write; the
    // mode gate must dominate so a doc with inconsistent fields can't bypass.
    const path = `mini_app_sessions/${sessionId}/submissions/${STUDENT_UID}`;
    await assertFails(
      setDoc(doc(asStudent(), path), {
        studentUid: STUDENT_UID,
        submittedAt: 1000,
        payload: { foo: 'bar' },
      })
    );
  });
});

describe('Guided Learning responses — view-only mode blocks submissions', () => {
  const sessionId = 'gl-vo-session';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `guided_learning_sessions/${sessionId}`), {
        teacherUid: TEACHER_UID,
        // GL uses `assignmentMode` (the asymmetry — see types.ts and the
        // useStudentAssignments filter for the full rationale). The session's
        // own `mode` field is play-mode (structured/guided/explore).
        mode: 'guided',
        assignmentMode: 'view-only',
      });
    });
  });

  it("denies response create when assignmentMode === 'view-only'", async () => {
    const path = `guided_learning_sessions/${sessionId}/responses/${STUDENT_UID}`;
    await assertFails(
      setDoc(doc(asStudent(), path), {
        studentAnonymousId: STUDENT_UID,
        sessionId,
        score: null,
        startedAt: 1000,
        completedAt: null,
        answers: [],
      })
    );
  });

  it('verifies the asymmetry: GL with mode=view-only AND assignmentMode=submissions ALLOWS the response', async () => {
    // The trap from the useStudentAssignments filter test surfaces here too.
    // GL's session `mode` is play-mode and might (in some refactor scenario)
    // collide with the literal 'view-only'. The rule must check
    // `assignmentMode`, not `mode`, so this case allows the response.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `guided_learning_sessions/gl-trap`), {
        teacherUid: TEACHER_UID,
        mode: 'view-only', // play-mode field — must NOT gate
        assignmentMode: 'submissions',
      });
    });

    const path = `guided_learning_sessions/gl-trap/responses/${STUDENT_UID}`;
    await assertSucceeds(
      setDoc(doc(asStudent(), path), {
        studentAnonymousId: STUDENT_UID,
        sessionId: 'gl-trap',
        score: null,
        startedAt: 1000,
        completedAt: null,
        answers: [],
      })
    );
  });
});
