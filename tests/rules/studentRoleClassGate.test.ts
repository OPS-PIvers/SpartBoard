// Firestore security-rules tests for the GIS student-role class gate.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps the suite in `firebase emulators:exec --only firestore`.
//
// Covers the five session collections where passesStudentClassGate() is applied:
//   quiz_sessions, video_activity_sessions, guided_learning_sessions,
//   mini_app_sessions, activity_wall_sessions

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, addDoc, collection, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-student-gate-test';
const SESSION_A = 'session-class-a';
const SESSION_B = 'session-class-b';
const CLASS_A = 'class-A';
const CLASS_B = 'class-B';
const TEACHER_UID = 'teacher-uid-1';
const STUDENT_A_UID = 'student-a-uid';
const STUDENT_EMPTY_UID = 'student-empty-uid';
const ADMIN_EMAIL = 'admin@example.com';
const ANON_UID = 'anon-pin-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

// ---------------------------------------------------------------------------
// Environment + auth contexts
// ---------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

const asStudentA = () =>
  testEnv
    .authenticatedContext(STUDENT_A_UID, {
      studentRole: true,
      classIds: [CLASS_A],
    })
    .firestore();

const asStudentEmpty = () =>
  testEnv
    .authenticatedContext(STUDENT_EMPTY_UID, {
      studentRole: true,
      classIds: [],
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

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
// Seeding helpers
// ---------------------------------------------------------------------------

function sessionDoc(classId: string) {
  return { teacherUid: TEACHER_UID, classId, status: 'active' };
}

function vaFields(sessionId: string, classId: string) {
  return {
    id: sessionId,
    activityId: 'act-1',
    activityTitle: 'Test',
    youtubeUrl: 'https://youtu.be/x',
    questions: [],
    settings: {},
    allowedPins: [],
    createdAt: 1000,
    assignmentName: 'Assignment',
    classId,
    teacherUid: TEACHER_UID,
    status: 'active',
  };
}

type SeedOptions = { withResponses?: boolean };

async function seedSessions(cols: string[], opts: SeedOptions = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });

    for (const col of cols) {
      const isVa = col === 'video_activity_sessions';
      await setDoc(
        doc(db, `${col}/${SESSION_A}`),
        isVa ? vaFields(SESSION_A, CLASS_A) : sessionDoc(CLASS_A)
      );
      await setDoc(
        doc(db, `${col}/${SESSION_B}`),
        isVa ? vaFields(SESSION_B, CLASS_B) : sessionDoc(CLASS_B)
      );

      if (opts.withResponses) {
        if (col === 'quiz_sessions') {
          await setDoc(
            doc(db, `${col}/${SESSION_A}/responses/${STUDENT_A_UID}`),
            {
              studentUid: STUDENT_A_UID,
              pin: '9999',
              joinedAt: 1000,
              score: null,
              answers: [],
              status: 'active',
              tabSwitchWarnings: 0,
            }
          );
        } else if (col === 'video_activity_sessions') {
          await setDoc(
            doc(db, `${col}/${SESSION_A}/responses/${STUDENT_A_UID}`),
            {
              studentUid: STUDENT_A_UID,
              pin: '9999',
              name: 'Student A',
              joinedAt: 1000,
              score: null,
              completedAt: null,
              answers: [],
            }
          );
        } else if (col === 'guided_learning_sessions') {
          await setDoc(
            doc(db, `${col}/${SESSION_A}/responses/${STUDENT_A_UID}`),
            {
              studentAnonymousId: STUDENT_A_UID,
              sessionId: SESSION_A,
              score: null,
              answers: [],
            }
          );
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Session-level read gate — all five collections
// ---------------------------------------------------------------------------

const ALL_SESSION_COLS = [
  'quiz_sessions',
  'video_activity_sessions',
  'guided_learning_sessions',
  'mini_app_sessions',
  'activity_wall_sessions',
];

describe('student-role class gate — session reads', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions(ALL_SESSION_COLS);
  });

  for (const col of ALL_SESSION_COLS) {
    describe(col, () => {
      it('student with matching classId can read session-A', async () => {
        await assertSucceeds(getDoc(doc(asStudentA(), `${col}/${SESSION_A}`)));
      });

      it('student with matching classId cannot read session-B (wrong class)', async () => {
        await assertFails(getDoc(doc(asStudentA(), `${col}/${SESSION_B}`)));
      });

      it('student with empty classIds cannot read any session', async () => {
        await assertFails(getDoc(doc(asStudentEmpty(), `${col}/${SESSION_A}`)));
        await assertFails(getDoc(doc(asStudentEmpty(), `${col}/${SESSION_B}`)));
      });

      it('teacher (no studentRole claim) can read any session', async () => {
        await assertSucceeds(getDoc(doc(asTeacher(), `${col}/${SESSION_A}`)));
        await assertSucceeds(getDoc(doc(asTeacher(), `${col}/${SESSION_B}`)));
      });

      it('anonymous PIN student can read any session', async () => {
        await assertSucceeds(
          getDoc(doc(asAnonStudent(), `${col}/${SESSION_A}`))
        );
        await assertSucceeds(
          getDoc(doc(asAnonStudent(), `${col}/${SESSION_B}`))
        );
      });

      it('unauthenticated caller cannot read', async () => {
        await assertFails(getDoc(doc(asUnauth(), `${col}/${SESSION_A}`)));
      });
    });
  }
});

// ---------------------------------------------------------------------------
// quiz_sessions/responses — create, read, update (immutability)
// ---------------------------------------------------------------------------

describe('quiz_sessions/responses — student-role gate', () => {
  const respPath = (session: string) =>
    `quiz_sessions/${session}/responses/${STUDENT_A_UID}`;
  const baseResp = (pin = '1234', score: null | number = null) => ({
    studentUid: STUDENT_A_UID,
    pin,
    joinedAt: 1000,
    score,
    answers: [],
    status: 'active',
    tabSwitchWarnings: 0,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions(['quiz_sessions'], { withResponses: true });
  });

  it('student in class-A can create response on session-A', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), {
        ...baseResp(),
        joinedAt: 2000,
      })
    );
  });

  it('student in class-A cannot create response on session-B', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_B)), {
        ...baseResp(),
        joinedAt: 2000,
      })
    );
  });

  it('student in class-A can read own response on session-A', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), respPath(SESSION_A))));
  });

  it('student in class-A cannot read response on session-B', async () => {
    await assertFails(getDoc(doc(asStudentA(), respPath(SESSION_B))));
  });

  it('teacher can read any response', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), respPath(SESSION_A))));
  });

  it('student can update allowed fields on session-A response', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), {
        ...baseResp('9999'),
        answers: [{ q: 0, a: 'B' }],
        status: 'submitted',
        submittedAt: 3000,
      })
    );
  });

  it('student cannot mutate immutable pin field', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), baseResp('CHANGED'))
    );
  });

  it('student cannot set score field', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), baseResp('9999', 100))
    );
  });

  it('student in class-A cannot update response on session-B', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_B)), baseResp('9999'))
    );
  });

  it('anonymous PIN student can create response without studentRole restriction', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_A}/responses/${ANON_UID}`
        ),
        {
          studentUid: ANON_UID,
          pin: '5678',
          joinedAt: 2000,
          score: null,
          answers: [],
          status: 'active',
          tabSwitchWarnings: 0,
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// video_activity_sessions/responses — create, read, update
// ---------------------------------------------------------------------------

describe('video_activity_sessions/responses — student-role gate', () => {
  const col = 'video_activity_sessions';
  const respPath = (session: string) =>
    `${col}/${session}/responses/${STUDENT_A_UID}`;
  const baseResp = (pin = '1234') => ({
    studentUid: STUDENT_A_UID,
    pin,
    name: 'Student A',
    joinedAt: 1000,
    score: null,
    completedAt: null,
    answers: [],
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions([col], { withResponses: true });
  });

  it('student in class-A can create response on session-A', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), {
        ...baseResp(),
        joinedAt: 2000,
      })
    );
  });

  it('student in class-A cannot create response on session-B', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_B)), {
        ...baseResp(),
        joinedAt: 2000,
      })
    );
  });

  it('student in class-A can read own response on session-A', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), respPath(SESSION_A))));
  });

  it('student in class-A cannot read response on session-B', async () => {
    await assertFails(getDoc(doc(asStudentA(), respPath(SESSION_B))));
  });

  it('teacher can read responses on any session', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), respPath(SESSION_A))));
  });

  it('student can update allowed fields on session-A response', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), {
        ...baseResp('9999'),
        completedAt: 3000,
        answers: [{ q: 0, a: 'A' }],
      })
    );
  });

  it('student in class-A cannot update response on session-B', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_B)), baseResp('9999'))
    );
  });

  it('anonymous PIN student can create response without studentRole restriction', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAnonStudent(), `${col}/${SESSION_A}/responses/${ANON_UID}`),
        {
          studentUid: ANON_UID,
          pin: '5678',
          name: 'Anon',
          joinedAt: 2000,
          score: null,
          completedAt: null,
          answers: [],
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// guided_learning_sessions/responses — create, read, update
// ---------------------------------------------------------------------------

describe('guided_learning_sessions/responses — student-role gate', () => {
  const col = 'guided_learning_sessions';
  const respPath = (session: string) =>
    `${col}/${session}/responses/${STUDENT_A_UID}`;
  const baseResp = (session = SESSION_A) => ({
    studentAnonymousId: STUDENT_A_UID,
    sessionId: session,
    score: null,
    answers: [],
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions([col], { withResponses: true });
  });

  it('student in class-A can create response on session-A', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), baseResp())
    );
  });

  it('student in class-A cannot create response on session-B', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_B)), baseResp(SESSION_B))
    );
  });

  it('student in class-A can read own response on session-A', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), respPath(SESSION_A))));
  });

  it('student in class-A cannot read response on session-B', async () => {
    await assertFails(getDoc(doc(asStudentA(), respPath(SESSION_B))));
  });

  it('teacher can read responses on any session', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), respPath(SESSION_A))));
  });

  it('student can update allowed fields on session-A response', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath(SESSION_A)), {
        ...baseResp(),
        answers: [{ q: 0, a: 'B' }],
        completedAt: 3000,
      })
    );
  });

  it('student in class-A cannot update response on session-B', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), respPath(SESSION_B)), baseResp(SESSION_B))
    );
  });

  it('anonymous PIN student can create response without studentRole restriction', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAnonStudent(), `${col}/${SESSION_A}/responses/${ANON_UID}`),
        {
          studentAnonymousId: ANON_UID,
          sessionId: SESSION_A,
          score: null,
          answers: [],
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// activity_wall_sessions/submissions — create
// ---------------------------------------------------------------------------

describe('activity_wall_sessions/submissions — student-role gate', () => {
  const col = 'activity_wall_sessions';
  const subCol = (session: string) =>
    collection(asStudentA(), `${col}/${session}/submissions`);
  const validSub = () => ({
    id: 'sub-1',
    content: 'Hello world',
    submittedAt: 1000,
    status: 'pending' as const,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions([col]);
  });

  it('student in class-A can submit to session-A', async () => {
    await assertSucceeds(addDoc(subCol(SESSION_A), validSub()));
  });

  it('student in class-A cannot submit to session-B (wrong class)', async () => {
    await assertFails(addDoc(subCol(SESSION_B), validSub()));
  });

  it('student with empty classIds cannot submit to any session', async () => {
    await assertFails(
      addDoc(
        collection(asStudentEmpty(), `${col}/${SESSION_A}/submissions`),
        validSub()
      )
    );
  });

  it('anonymous PIN student can submit without studentRole restriction', async () => {
    await assertSucceeds(
      addDoc(
        collection(asAnonStudent(), `${col}/${SESSION_A}/submissions`),
        validSub()
      )
    );
  });

  it('teacher (non-anonymous) can submit (no studentRole block)', async () => {
    await assertSucceeds(
      addDoc(
        collection(asTeacher(), `${col}/${SESSION_A}/submissions`),
        validSub()
      )
    );
  });

  it('unauthenticated caller cannot submit', async () => {
    await assertFails(
      addDoc(
        collection(asUnauth(), `${col}/${SESSION_A}/submissions`),
        validSub()
      )
    );
  });
});

// ---------------------------------------------------------------------------
// mini_app_sessions/submissions — create/update gate + payload validation
// ---------------------------------------------------------------------------

describe('mini_app_sessions/submissions — student-role gate', () => {
  const col = 'mini_app_sessions';
  const subPath = (session: string, uid: string) =>
    `${col}/${session}/submissions/${uid}`;
  const validSub = () => ({
    submittedAt: 1000,
    payload: { score: 42, answers: [1, 2, 3] } as Record<string, unknown>,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions([col]);
  });

  it('student in class-A can submit to session-A under their own pseudonym', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), validSub())
    );
  });

  it('student in class-A cannot submit to session-B (wrong class)', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_B, STUDENT_A_UID)), validSub())
    );
  });

  it('student with empty classIds cannot submit to any session', async () => {
    await assertFails(
      setDoc(
        doc(asStudentEmpty(), subPath(SESSION_A, STUDENT_EMPTY_UID)),
        validSub()
      )
    );
  });

  it('anonymous PIN student can submit under their own auth uid', async () => {
    await assertSucceeds(
      setDoc(doc(asAnonStudent(), subPath(SESSION_A, ANON_UID)), validSub())
    );
  });

  it('anonymous PIN student cannot submit under a different uid', async () => {
    await assertFails(
      setDoc(
        doc(asAnonStudent(), subPath(SESSION_A, 'some-other-uid')),
        validSub()
      )
    );
  });

  it('unauthenticated caller cannot submit', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), subPath(SESSION_A, 'x')), validSub())
    );
  });

  it('submission with extra keys is rejected', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), {
        ...validSub(),
        sneaky: 'extra-field',
      })
    );
  });

  it('submission with non-map payload is rejected', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), {
        submittedAt: 1000,
        payload: 'just-a-string',
      })
    );
  });

  it('submission with non-int submittedAt is rejected', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), {
        submittedAt: 'not-a-number',
        payload: { score: 1 },
      })
    );
  });

  it('submission to ended session is rejected', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${col}/${SESSION_A}`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        status: 'ended',
      });
    });
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), validSub())
    );
  });

  it('student can read own submission; cannot read another student uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), subPath(SESSION_A, STUDENT_A_UID)),
        validSub()
      );
      await setDoc(
        doc(ctx.firestore(), subPath(SESSION_A, 'other-uid')),
        validSub()
      );
    });
    await assertSucceeds(
      getDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)))
    );
    await assertFails(
      getDoc(doc(asStudentA(), subPath(SESSION_A, 'other-uid')))
    );
  });

  it('teacher can read any submission on their session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), subPath(SESSION_A, 'anyone')),
        validSub()
      );
    });
    await assertSucceeds(
      getDoc(doc(asTeacher(), subPath(SESSION_A, 'anyone')))
    );
  });
});
