// Firestore security-rules tests for the GIS student-role class gate.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps the suite in `firebase emulators:exec --only firestore`.
//
// Covers the five session collections where passesStudentClassGate() is applied:
//   quiz_sessions, video_activity_sessions, guided_learning_sessions,
//   mini_app_sessions, activity_wall_sessions
//
// Contract: session reads are intentionally permissive for any authenticated
// caller (teacher single-doc subscriptions otherwise fail with
// permission-denied after a status transition — see PR #1391). studentRole
// class gating is enforced exclusively on the response/submission *write*
// rules, which dereference the parent session's `classId` via a runtime
// `get()`. A studentRole user can see session metadata by id but cannot
// submit to a session outside their `classIds` claim.

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
  getDoc,
  getDocs,
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';

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

// Token shape note: the Firestore rules engine in the emulator throws
// "Property X is undefined on object" when a rule expression reads a token
// claim that isn't present (even behind a `!= null` short-circuit). Real
// Firebase Auth tokens carry the full claim surface; the emulator test
// harness does not auto-populate it. We therefore spell out every claim
// the rules may touch — `email`, `studentRole`, `classIds`, and
// `firebase.sign_in_provider` — in every context, using empty/false
// defaults for claims that don't apply to that role. This matches what
// production Auth tokens look like for real sign-ins.
//
// Intentional exception: `asAnonStudentBareToken` below deliberately omits
// `email`, `studentRole`, and `classIds` to reproduce the shape of a
// production Firebase anonymous-auth token verbatim, which carries none of
// those claims. That lock-in context exists to catch regressions in any
// rule helper that reads a custom claim via direct dot access.

const asStudentA = () =>
  testEnv
    .authenticatedContext(STUDENT_A_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asStudentEmpty = () =>
  testEnv
    .authenticatedContext(STUDENT_EMPTY_UID, {
      email: '',
      studentRole: true,
      classIds: [],
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

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

// Real production anonymous Firebase Auth tokens do NOT carry `studentRole`,
// `classIds`, or `email` at all — those claims are only minted for
// ClassLink SSO via studentLoginV1 (or for Google sign-in via GIS in the
// case of `email`). Prior to the isStudentRoleUser() hardening, any rule
// that reached a direct claim access threw "Property X is undefined" and
// denied the operation. This context reproduces that token shape verbatim
// — omitting every custom claim — so the test suite locks in the fix and
// catches regressions on any helper that reads a claim without the safe
// `.get(key, default)` accessor.
const asAnonStudentBareToken = () =>
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
              startedAt: 1000,
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

describe('session reads — authenticated access (class gate moved to writes)', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions(ALL_SESSION_COLS);
  });

  for (const col of ALL_SESSION_COLS) {
    describe(col, () => {
      it('student with matching classId can read session-A', async () => {
        await assertSucceeds(getDoc(doc(asStudentA(), `${col}/${SESSION_A}`)));
      });

      it('student can read session-B (out-of-class metadata is no longer gated at reads; write rules enforce the class gate)', async () => {
        await assertSucceeds(getDoc(doc(asStudentA(), `${col}/${SESSION_B}`)));
      });

      it('student with empty classIds can still read session metadata', async () => {
        await assertSucceeds(
          getDoc(doc(asStudentEmpty(), `${col}/${SESSION_A}`))
        );
        await assertSucceeds(
          getDoc(doc(asStudentEmpty(), `${col}/${SESSION_B}`))
        );
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
    // seedSessions(withResponses) pre-creates a response for STUDENT_A_UID.
    // Clear it so this test truly exercises the create rule.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), respPath(SESSION_A)));
    });
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

  // Lock-in for the missing-claim hardening. Real production anon tokens
  // omit studentRole / classIds / email entirely; if any rule helper
  // reverts to direct dot-access on one of those claims, the rules
  // engine can throw "Property X is undefined" and this test reds.
  //
  // Exercises the full anon PIN quiz lifecycle inside
  // `match /quiz_sessions/{sessionId}/responses/{studentUid}`:
  //   1. `getDoc(responseRef)` — traverses `allow read`. Guards
  //      `isStudentRoleUser()` (now `.get()`-safe).
  //   2. `setDoc(responseRef, …)` on a non-existent doc — traverses
  //      `allow create`. Guards `passesStudentClassGate` →
  //      `isStudentRoleUser()`.
  //   3. `setDoc(responseRef, …)` on the existing doc to submit an
  //      answer — traverses `allow update`. In that OR chain
  //      `isAdmin()` sits BEFORE the student branch, which is why
  //      this PR hardens `isAdmin()` alongside `isStudentRoleUser()`:
  //      if `isAdmin()` threw on a missing `email` claim, the throw
  //      could deny the update before the student branch is reached.
  //
  // All three must succeed under a bare anon token for real answer
  // submission to work end-to-end.
  it('anonymous PIN student with bare token (no custom claims) can get + create + update response', async () => {
    const responseRef = doc(
      asAnonStudentBareToken(),
      `quiz_sessions/${SESSION_A}/responses/${ANON_UID}`
    );

    await assertSucceeds(getDoc(responseRef));

    await assertSucceeds(
      setDoc(responseRef, {
        studentUid: ANON_UID,
        pin: '5678',
        joinedAt: 2000,
        score: null,
        answers: [],
        status: 'active',
        tabSwitchWarnings: 0,
      })
    );

    // Submit an answer: update only the fields the rule allows students
    // to change (answers, status, submittedAt, tabSwitchWarnings).
    await assertSucceeds(
      setDoc(responseRef, {
        studentUid: ANON_UID,
        pin: '5678',
        joinedAt: 2000,
        score: null,
        answers: [{ questionId: 'q1', value: 'B' }],
        status: 'submitted',
        submittedAt: 3000,
        tabSwitchWarnings: 0,
      })
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
    // seedSessions(withResponses) pre-creates a response for STUDENT_A_UID.
    // Clear it so this test truly exercises the create rule.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), respPath(SESSION_A)));
    });
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
    startedAt: 1000,
    score: null,
    answers: [],
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSessions([col], { withResponses: true });
  });

  it('student in class-A can create response on session-A', async () => {
    // seedSessions(withResponses) pre-creates a response for STUDENT_A_UID,
    // so a bare setDoc would hit the update rule, not create. Clear the
    // seeded doc first so this test actually exercises the create path.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), respPath(SESSION_A)));
    });
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
  // The mini_app submission rule enforces a strict key whitelist:
  // ['submittedAt', 'studentUid', 'payload']. `studentUid` must equal
  // request.auth.uid. validSub() takes the submitter uid so the test
  // parameterizes it correctly.
  const validSub = (uid: string) => ({
    submittedAt: 1000,
    studentUid: uid,
    payload: { score: 42, answers: [1, 2, 3] } as Record<string, unknown>,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // mini_app_sessions docs require `submissionsEnabled: true` on the
    // parent session for submissions to be accepted. The generic seed
    // helper doesn't set that field (it seeds a bare sessionDoc), so we
    // re-seed here with the mini-app-specific shape.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${col}/${SESSION_A}`), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_A],
        status: 'active',
        submissionsEnabled: true,
      });
      await setDoc(doc(db, `${col}/${SESSION_B}`), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_B],
        status: 'active',
        submissionsEnabled: true,
      });
    });
  });

  it('student in class-A can submit to session-A under their own pseudonym', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)),
        validSub(STUDENT_A_UID)
      )
    );
  });

  it('student in class-A cannot submit to session-B (wrong class)', async () => {
    await assertFails(
      setDoc(
        doc(asStudentA(), subPath(SESSION_B, STUDENT_A_UID)),
        validSub(STUDENT_A_UID)
      )
    );
  });

  it('student with empty classIds cannot submit to any session', async () => {
    await assertFails(
      setDoc(
        doc(asStudentEmpty(), subPath(SESSION_A, STUDENT_EMPTY_UID)),
        validSub(STUDENT_EMPTY_UID)
      )
    );
  });

  it('anonymous PIN student can submit under their own auth uid', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAnonStudent(), subPath(SESSION_A, ANON_UID)),
        validSub(ANON_UID)
      )
    );
  });

  it('anonymous PIN student cannot submit under a different uid', async () => {
    await assertFails(
      setDoc(
        doc(asAnonStudent(), subPath(SESSION_A, 'some-other-uid')),
        validSub('some-other-uid')
      )
    );
  });

  it('unauthenticated caller cannot submit', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), subPath(SESSION_A, 'x')), validSub('x'))
    );
  });

  it('submission with extra keys is rejected', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), {
        ...validSub(STUDENT_A_UID),
        sneaky: 'extra-field',
      })
    );
  });

  it('submission with non-map payload is rejected', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), {
        submittedAt: 1000,
        studentUid: STUDENT_A_UID,
        payload: 'just-a-string',
      })
    );
  });

  it('submission with non-int submittedAt is rejected', async () => {
    await assertFails(
      setDoc(doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)), {
        submittedAt: 'not-a-number',
        studentUid: STUDENT_A_UID,
        payload: { score: 1 },
      })
    );
  });

  it('submission to ended session is rejected', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${col}/${SESSION_A}`), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_A],
        status: 'ended',
        submissionsEnabled: true,
      });
    });
    await assertFails(
      setDoc(
        doc(asStudentA(), subPath(SESSION_A, STUDENT_A_UID)),
        validSub(STUDENT_A_UID)
      )
    );
  });

  it('student can read own submission; cannot read another student uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), subPath(SESSION_A, STUDENT_A_UID)),
        validSub(STUDENT_A_UID)
      );
      await setDoc(
        doc(ctx.firestore(), subPath(SESSION_A, 'other-uid')),
        validSub('other-uid')
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
        validSub('anyone')
      );
    });
    await assertSucceeds(
      getDoc(doc(asTeacher(), subPath(SESSION_A, 'anyone')))
    );
  });
});

// ---------------------------------------------------------------------------
// End-to-end lifecycle — walks the real client sequence for the full quiz
// flow so a rules regression on any step fails a test. Reproduces:
//   - The join-code probe (where('code', '==', X)) from PR #1390.
//   - The single-doc onSnapshot listener from PR #1391.
//   - The studentRole MyAssignmentsPage discovery query.
//   - The response create + submit-answers + teacher-finalize sequence.
// ---------------------------------------------------------------------------

describe('quiz_sessions — end-to-end lifecycle', () => {
  const SESSION_ID = 'lifecycle-session';
  const JOIN_CODE = 'TESTCD';
  const STUDENT_B_UID = 'student-b-uid';

  const asStudentB = () =>
    testEnv
      .authenticatedContext(STUDENT_B_UID, {
        studentRole: true,
        classIds: [CLASS_B],
      })
      .firestore();

  const baseSessionShape = {
    id: SESSION_ID,
    assignmentId: SESSION_ID,
    teacherUid: TEACHER_UID,
    classId: CLASS_A,
    code: JOIN_CODE,
    sessionMode: 'teacher',
    currentQuestionIndex: -1,
    startedAt: null,
    endedAt: null,
    totalQuestions: 2,
    publicQuestions: [],
  };

  const baseStudentResp = (uid: string, pin: string) => ({
    studentUid: uid,
    pin,
    joinedAt: 1000,
    score: null,
    answers: [] as unknown[],
    status: 'active',
    tabSwitchWarnings: 0,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('teacher create → query by code → get → resume → advance — no permission-denied', async () => {
    // 1. createAssignment: teacher writes a paused session doc.
    await assertSucceeds(
      setDoc(doc(asTeacher(), `quiz_sessions/${SESSION_ID}`), {
        ...baseSessionShape,
        status: 'paused',
      })
    );

    // 2. allocateJoinCode: teacher LIST query by code (was broken pre-#1390).
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), 'quiz_sessions'),
          where('code', '==', JOIN_CODE)
        )
      )
    );

    // 3. useQuizSessionTeacher: single-doc GET (was broken pre-#1391 — the
    //    Start bug this PR fixes).
    await assertSucceeds(
      getDoc(doc(asTeacher(), `quiz_sessions/${SESSION_ID}`))
    );

    // 4. resumeAssignment: paused → waiting.
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `quiz_sessions/${SESSION_ID}`),
        { status: 'waiting' },
        { merge: true }
      )
    );

    // 5. advanceQuestion: waiting → active, currentQuestionIndex = 0.
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `quiz_sessions/${SESSION_ID}`),
        { status: 'active', currentQuestionIndex: 0, startedAt: 1000 },
        { merge: true }
      )
    );
  });

  it('studentRole in-class: discovery → get → create response → submit answers', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        ...baseSessionShape,
        status: 'active',
      });
    });

    // 6. MyAssignmentsPage: where('classId', 'in', myClassIds).
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudentA(), 'quiz_sessions'),
          where('classId', 'in', [CLASS_A])
        )
      )
    );

    // 7. Student renders the session: single-doc GET.
    await assertSucceeds(
      getDoc(doc(asStudentA(), `quiz_sessions/${SESSION_ID}`))
    );

    // 8. Student joins: creates response doc.
    const respPath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_A_UID}`;
    await assertSucceeds(
      setDoc(
        doc(asStudentA(), respPath),
        baseStudentResp(STUDENT_A_UID, '1234')
      )
    );

    // 9. Student submits answers: update with only allowed field changes.
    await assertSucceeds(
      setDoc(doc(asStudentA(), respPath), {
        ...baseStudentResp(STUDENT_A_UID, '1234'),
        answers: [{ questionId: 'q1', answer: 'A' }],
        status: 'submitted',
        submittedAt: 2000,
      })
    );
  });

  it('studentRole out-of-class: can read session metadata but cannot submit', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        ...baseSessionShape,
        status: 'active',
      });
    });

    // Out-of-class student CAN get the session doc (intentional post-PR #1391).
    await assertSucceeds(
      getDoc(doc(asStudentB(), `quiz_sessions/${SESSION_ID}`))
    );

    // But CANNOT create a response: write-side class gate denies.
    const respPath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_B_UID}`;
    await assertFails(
      setDoc(
        doc(asStudentB(), respPath),
        baseStudentResp(STUDENT_B_UID, '5555')
      )
    );

    // Nor update an existing response (even if one were seeded).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), respPath),
        baseStudentResp(STUDENT_B_UID, '5555')
      );
    });
    await assertFails(
      setDoc(doc(asStudentB(), respPath), {
        ...baseStudentResp(STUDENT_B_UID, '5555'),
        answers: [{ questionId: 'q1', answer: 'A' }],
        status: 'submitted',
        submittedAt: 2000,
      })
    );
  });

  it('studentRole cannot read another student response', async () => {
    const otherUid = 'student-other-uid';
    const otherRespPath = `quiz_sessions/${SESSION_ID}/responses/${otherUid}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        ...baseSessionShape,
        status: 'active',
      });
      await setDoc(
        doc(ctx.firestore(), otherRespPath),
        baseStudentResp(otherUid, '7777')
      );
    });

    await assertFails(getDoc(doc(asStudentA(), otherRespPath)));
  });

  it('teacher reads all responses (list) and finalizes a score', async () => {
    const respPath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_A_UID}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        ...baseSessionShape,
        status: 'ended',
      });
      await setDoc(doc(ctx.firestore(), respPath), {
        ...baseStudentResp(STUDENT_A_UID, '1234'),
        answers: [{ questionId: 'q1', answer: 'A' }],
        status: 'submitted',
        submittedAt: 2000,
      });
    });

    // 13. Teacher lists all responses on the session.
    await assertSucceeds(
      getDocs(collection(asTeacher(), `quiz_sessions/${SESSION_ID}/responses`))
    );

    // 14. Teacher sets score — a field students are forbidden from writing.
    await assertSucceeds(
      setDoc(doc(asTeacher(), respPath), { score: 85 }, { merge: true })
    );
  });
});

// ---------------------------------------------------------------------------
// PR #1391 regression smoke — teacher create → teacher single-doc read on
// every session collection that uses the `allow read: if request.auth != null;`
// shape. A rules regression that re-introduces `resource.data` into any of
// these read rules will show up here.
// ---------------------------------------------------------------------------

describe('PR #1391 regression — teacher create + single-doc read on all session collections', () => {
  const SESSION_ID = 'pr1391-regression';

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('quiz_sessions: teacher create → single-doc get succeeds', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        code: 'CODE01',
        status: 'paused',
      })
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `quiz_sessions/${SESSION_ID}`))
    );
  });

  it('video_activity_sessions: teacher create → single-doc get succeeds', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `video_activity_sessions/${SESSION_ID}`),
        vaFields(SESSION_ID, CLASS_A)
      )
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `video_activity_sessions/${SESSION_ID}`))
    );
  });

  it('guided_learning_sessions: teacher create → single-doc get succeeds', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `guided_learning_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        status: 'active',
      })
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `guided_learning_sessions/${SESSION_ID}`))
    );
  });

  it('mini_app_sessions: teacher create → single-doc get succeeds', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `mini_app_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_A],
        status: 'active',
        assignmentName: 'Mini',
        submissionsEnabled: true,
      })
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `mini_app_sessions/${SESSION_ID}`))
    );
  });

  it('activity_wall_sessions: teacher create → single-doc get succeeds', async () => {
    // activity_wall sessionId convention: {teacherUid}_{activityId}
    const awSessionId = `${TEACHER_UID}_activity-x`;
    await assertSucceeds(
      setDoc(doc(asTeacher(), `activity_wall_sessions/${awSessionId}`), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        status: 'active',
      })
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `activity_wall_sessions/${awSessionId}`))
    );
  });
});
