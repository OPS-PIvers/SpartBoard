// Firestore security-rules tests for Guided Learning Archive, which closes the
// session by writing `closeAt = now` beside the teacher's row. Requires a
// running Firestore emulator; invoke via `pnpm run test:rules`.

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
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gl-archive-close-test';
const SESSION_ID = 'gl-session-1';
const SHARE_ID = 'gl-share-1';
const CLASS_A = 'class-A';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const STUDENT_UID = 'student-a-uid';

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

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.edu`,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const sessionPath = (id = SESSION_ID) => `guided_learning_sessions/${id}`;
const respPath = () => `${sessionPath()}/responses/${STUDENT_UID}`;
const progressPath = (id = SESSION_ID) =>
  `${sessionPath(id)}/progress/${STUDENT_UID}`;
const rowPath = () =>
  `users/${TEACHER_UID}/guided_learning_assignments/${SESSION_ID}`;

const baseResp = () => ({
  studentAnonymousId: STUDENT_UID,
  sessionId: SESSION_ID,
  startedAt: 1000,
  completedAt: null,
  score: null,
  answers: [] as unknown[],
});
const progress = () => ({
  furthestStepIdx: 1,
  steps: {},
  startedAt: Timestamp.now(),
});

/** Seeds the session (with `closeAt` when given), the row and a draft response. */
async function seed(closeAt?: number) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const window = closeAt === undefined ? {} : { closeAt };
    await setDoc(doc(db, sessionPath()), {
      teacherUid: TEACHER_UID,
      classId: CLASS_A,
      assignmentMode: 'submissions',
      ...window,
    });
    await setDoc(doc(db, sessionPath(SHARE_ID)), {
      teacherUid: TEACHER_UID,
      assignmentMode: 'view-only',
      ...window,
    });
    await setDoc(doc(db, rowPath()), { status: 'active', updatedAt: 1 });
    await setDoc(doc(db, respPath()), {
      ...baseResp(),
      answers: [{ stepId: 'q1', answer: 'a', isCorrect: null }],
    });
  });
}

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

describe('Guided Learning archive — who can close the session', () => {
  it('the owning teacher archives the row and closes the session in one batch', async () => {
    await seed();
    const now = Date.now();
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.update(doc(db, rowPath()), {
      status: 'archived',
      updatedAt: now,
      archivedAt: now,
      closeAt: now,
    });
    batch.update(doc(db, sessionPath()), { closeAt: now });
    await assertSucceeds(batch.commit());
  });

  it('another teacher cannot close the session', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), sessionPath()), {
        closeAt: Date.now(),
      })
    );
  });

  it('a student cannot close, reopen or extend the session', async () => {
    await seed(Date.now() - 600_000);
    const db = asStudent();
    await assertFails(
      updateDoc(doc(db, sessionPath()), { closeAt: Date.now() })
    );
    await assertFails(updateDoc(doc(db, sessionPath()), { closeAt: null }));
    await assertFails(
      updateDoc(doc(db, sessionPath()), { closeAt: deleteField() })
    );
    await assertFails(
      updateDoc(doc(db, sessionPath()), { closeAt: Date.now() + 3_600_000 })
    );
  });
});

describe('Guided Learning archive — student access after the close', () => {
  const ARCHIVED_AT = () => Date.now() - 600_000; // past the 120 s grace

  it('refuses a new response', async () => {
    await seed(ARCHIVED_AT());
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), respPath()));
    });
    await assertFails(setDoc(doc(asStudent(), respPath()), baseResp()));
  });

  it('refuses an answer and a late submit on a draft', async () => {
    await seed(ARCHIVED_AT());
    const db = asStudent();
    await assertFails(
      updateDoc(doc(db, respPath()), {
        answers: [
          { stepId: 'q1', answer: 'a', isCorrect: null },
          { stepId: 'q2', answer: 'b', isCorrect: null },
        ],
      })
    );
    await assertFails(
      updateDoc(doc(db, respPath()), { completedAt: Date.now() })
    );
  });

  it('refuses progress writes on assignments and view-only shares', async () => {
    await seed(ARCHIVED_AT());
    await assertFails(setDoc(doc(asStudent(), progressPath()), progress()));
    await assertFails(
      setDoc(doc(asStudent(), progressPath(SHARE_ID)), progress())
    );
  });

  it('still lets the student read the session and their own response', async () => {
    await seed(ARCHIVED_AT());
    await assertSucceeds(getDoc(doc(asStudent(), sessionPath())));
    await assertSucceeds(getDoc(doc(asStudent(), respPath())));
  });

  it('still lets the teacher read and grade the response', async () => {
    await seed(ARCHIVED_AT());
    await assertSucceeds(getDoc(doc(asTeacher(), respPath())));
    await assertSucceeds(
      updateDoc(doc(asTeacher(), respPath()), { score: 80 })
    );
  });

  it('lands a submit already in flight inside the grace window', async () => {
    await seed(Date.now());
    await assertSucceeds(
      updateDoc(doc(asStudent(), respPath()), { completedAt: Date.now() })
    );
  });
});
