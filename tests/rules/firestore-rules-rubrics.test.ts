// Firestore security-rules tests for M12 rubrics (issue #2602):
//   - /users/{uid}/rubrics/{rubricId} — owner-only CRUD, schema lock,
//     studentRole denial, cross-user denial.
//   - /shared_rubrics/{shareId} — authed get, author-gated create with
//     schema lock, author/admin-only update+delete.
//   - Phase-1 carry-over: a student UPDATE on a quiz response that
//     touches `grading` (incl. rubricScores) is rejected.
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
import { setDoc, updateDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-rubrics-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const STUDENT_UID = 'student-uid-1';
const ANON_UID = 'anon-pin-uid';
const RUBRIC_ID = 'rubric-1';
const SHARE_ID = 'share-1';
const SESSION_ID = 'session-rubrics';
const PIN_KEY = 'pin-period_1-01';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

// Token-shape note: spell out every claim the rules touch — see
// studentRoleClassGate.test.ts for the justification.

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext(OTHER_TEACHER_UID, {
      email: 'other.teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudentRole = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
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

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const teacherRubricPath = `users/${TEACHER_UID}/rubrics/${RUBRIC_ID}`;
const studentRubricPath = `users/${STUDENT_UID}/rubrics/${RUBRIC_ID}`;
const sharePath = `shared_rubrics/${SHARE_ID}`;

const rubricFields = (id = RUBRIC_ID) => ({
  id,
  title: 'AP Lang DBQ Rubric',
  description: 'Document-based question rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Thesis & Argument',
      levels: [
        { id: 'l1', label: 'Below', points: 1 },
        { id: 'l2', label: 'Meets', points: 3 },
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 1000,
});

const sharedRubricFields = (author = TEACHER_UID) => ({
  ...rubricFields(SHARE_ID),
  originalAuthor: author,
  sharedAt: 2000,
});

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
    await setDoc(doc(ctx.firestore(), teacherRubricPath), rubricFields());
  });
});

// ---------------------------------------------------------------------------
// /users/{uid}/rubrics — owner access + schema lock
// ---------------------------------------------------------------------------

describe('/users/{uid}/rubrics — owner access', () => {
  it('owner can read their own rubric', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), teacherRubricPath)));
  });

  it('owner can create a rubric with the locked schema', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `users/${TEACHER_UID}/rubrics/rubric-2`),
        rubricFields('rubric-2')
      )
    );
  });

  it('owner can update their own rubric', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), teacherRubricPath), {
        ...rubricFields(),
        title: 'Renamed',
        updatedAt: 3000,
      })
    );
  });

  it('owner can delete their own rubric', async () => {
    await assertSucceeds(deleteDoc(doc(asTeacher(), teacherRubricPath)));
  });

  it('CREATE with an extra key outside the schema lock is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), `users/${TEACHER_UID}/rubrics/rubric-3`), {
        ...rubricFields('rubric-3'),
        smuggled: true,
      })
    );
  });

  it('CREATE with id != doc id is REJECTED', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), `users/${TEACHER_UID}/rubrics/rubric-4`),
        rubricFields('mismatched-id')
      )
    );
  });

  it('UPDATE that changes id is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), teacherRubricPath), {
        ...rubricFields('hijacked-id'),
      })
    );
  });

  it('CREATE with non-list criteria is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), `users/${TEACHER_UID}/rubrics/rubric-5`), {
        ...rubricFields('rubric-5'),
        criteria: 'not-a-list',
      })
    );
  });
});

describe('/users/{uid}/rubrics — cross-user and role denial', () => {
  it("another teacher cannot read the owner's rubric", async () => {
    await assertFails(getDoc(doc(asOtherTeacher(), teacherRubricPath)));
  });

  it("another teacher cannot write the owner's rubric", async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), teacherRubricPath), rubricFields())
    );
  });

  it("another teacher cannot delete the owner's rubric", async () => {
    await assertFails(deleteDoc(doc(asOtherTeacher(), teacherRubricPath)));
  });

  it('studentRole user cannot create a rubric under their own uid', async () => {
    await assertFails(
      setDoc(doc(asStudentRole(), studentRubricPath), rubricFields())
    );
  });

  it('studentRole user cannot read a rubric under their own uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), studentRubricPath), rubricFields());
    });
    await assertFails(getDoc(doc(asStudentRole(), studentRubricPath)));
  });

  it("anonymous user cannot read the owner's rubric", async () => {
    await assertFails(getDoc(doc(asAnonStudent(), teacherRubricPath)));
  });

  it("unauthenticated caller cannot read the owner's rubric", async () => {
    await assertFails(getDoc(doc(asUnauth(), teacherRubricPath)));
  });
});

// ---------------------------------------------------------------------------
// /shared_rubrics — link-share gates
// ---------------------------------------------------------------------------

describe('/shared_rubrics — create/get/delete gates', () => {
  it('author can create a share doc with the locked schema', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), sharePath), sharedRubricFields())
    );
  });

  it('CREATE with originalAuthor != auth uid is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), sharePath), sharedRubricFields(OTHER_TEACHER_UID))
    );
  });

  it('CREATE with an extra key outside the schema lock is REJECTED', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), sharePath), {
        ...sharedRubricFields(),
        smuggled: true,
      })
    );
  });

  it('any authenticated user can GET a share doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), sharedRubricFields());
    });
    await assertSucceeds(getDoc(doc(asOtherTeacher(), sharePath)));
  });

  it('unauthenticated caller cannot GET a share doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), sharedRubricFields());
    });
    await assertFails(getDoc(doc(asUnauth(), sharePath)));
  });

  it('author can delete their own share doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), sharedRubricFields());
    });
    await assertSucceeds(deleteDoc(doc(asTeacher(), sharePath)));
  });

  it("another user cannot delete the author's share doc", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), sharedRubricFields());
    });
    await assertFails(deleteDoc(doc(asOtherTeacher(), sharePath)));
  });
});

// ---------------------------------------------------------------------------
// Phase-1 carry-over: student grading writes (incl. rubricScores) rejected
// ---------------------------------------------------------------------------

describe('quiz response UPDATE — student cannot touch grading.rubricScores', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'RUBRIC',
        classId: 'class-A',
        classIds: ['class-A'],
      });
      await setDoc(
        doc(db, `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`),
        {
          studentUid: ANON_UID,
          pin: '01',
          classPeriod: 'period_1',
          joinedAt: 1000,
          score: null,
          answers: [],
          status: 'in-progress',
          completedAttempts: 0,
          preSyncVersion: 0,
          tabSwitchWarnings: 0,
        }
      );
    });
  });

  it('student UPDATE writing grading rubricScores is REJECTED', async () => {
    await assertFails(
      updateDoc(
        doc(
          asAnonStudent(),
          `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`
        ),
        {
          grading: {
            q1: {
              pointsAwarded: 999,
              rubricScores: [{ criterionId: 'c1', levelId: 'l2', points: 3 }],
              gradedBy: ANON_UID,
              gradedAt: 2000,
            },
          },
        }
      )
    );
  });
});
