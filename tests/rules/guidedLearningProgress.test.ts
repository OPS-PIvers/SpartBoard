// Rules tests for guided_learning_sessions/{id}/progress/{uid} (GL Studio plan P2-5).
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.

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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gl-progress-test';
const TEACHER_UID = 'teacher-1';
const OTHER_TEACHER_UID = 'teacher-2';
const STUDENT_UID = 'student-a';
const OTHER_STUDENT_UID = 'student-b';
const VIEWER_UID = 'anon-viewer';
const ADMIN_EMAIL = 'admin@school.org';
const CLASS_A = 'class-A';

const PAST = 1_000_000_000_000;
const FUTURE = 4_000_000_000_000;

const SUBMISSIONS = 'gl-submissions';
const VIEW_ONLY = 'gl-view-only';
const NOT_OPEN = 'gl-not-open';
const CLOSED = 'gl-closed';
const VIEW_ONLY_CLOSED = 'gl-view-only-closed';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = (uid = STUDENT_UID, classIds = [CLASS_A]) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asViewer = () =>
  testEnv
    .authenticatedContext(VIEWER_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.org`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const progressPath = (session: string, uid: string) =>
  `guided_learning_sessions/${session}/progress/${uid}`;

const progress = (over: Record<string, unknown> = {}) => ({
  mode: 'try',
  modeSwitches: 0,
  furthestStepIdx: 2,
  completed: false,
  steps: { s1: { ms: 1200, misclicks: 1, hinted: false } },
  startedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

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
    const session = (id: string, extra: Record<string, unknown>) =>
      setDoc(doc(db, `guided_learning_sessions/${id}`), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_A],
        assignmentMode: 'submissions',
        ...extra,
      });
    await session(SUBMISSIONS, {});
    await session(VIEW_ONLY, { assignmentMode: 'view-only', classIds: [] });
    await session(NOT_OPEN, { openAt: FUTURE });
    await session(CLOSED, { closeAt: PAST });
    await session(VIEW_ONLY_CLOSED, {
      assignmentMode: 'view-only',
      classIds: [],
      closeAt: PAST,
    });
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { roleId: 'super_admin' });
    await setDoc(doc(db, progressPath(SUBMISSIONS, STUDENT_UID)), {
      ...progress(),
      startedAt: Timestamp.fromMillis(PAST),
      updatedAt: Timestamp.fromMillis(PAST),
    });
  });
});

describe('progress writes', () => {
  it('lets a class member create their own doc in a submissions session', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asStudent(OTHER_STUDENT_UID),
          progressPath(SUBMISSIONS, OTHER_STUDENT_UID)
        ),
        progress()
      )
    );
  });

  it('denies writing another uid’s doc', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), progressPath(SUBMISSIONS, OTHER_STUDENT_UID)),
        progress()
      )
    );
  });

  it('denies a student outside the class in submissions mode', async () => {
    await assertFails(
      setDoc(
        doc(
          asStudent(OTHER_STUDENT_UID, ['class-B']),
          progressPath(SUBMISSIONS, OTHER_STUDENT_UID)
        ),
        progress()
      )
    );
  });

  it('allows a share-link viewer with no class', async () => {
    await assertSucceeds(
      setDoc(doc(asViewer(), progressPath(VIEW_ONLY, VIEWER_UID)), progress())
    );
  });

  it('denies writes before openAt in submissions mode', async () => {
    await assertFails(
      setDoc(doc(asStudent(), progressPath(NOT_OPEN, STUDENT_UID)), progress())
    );
  });

  it('denies writes after closeAt plus grace in both modes', async () => {
    await assertFails(
      setDoc(doc(asStudent(), progressPath(CLOSED, STUDENT_UID)), progress())
    );
    await assertFails(
      setDoc(
        doc(asViewer(), progressPath(VIEW_ONLY_CLOSED, VIEWER_UID)),
        progress()
      )
    );
  });

  it('denies a session that does not exist', async () => {
    await assertFails(
      setDoc(doc(asStudent(), progressPath('missing', STUDENT_UID)), progress())
    );
  });

  it('denies an oversized steps map', async () => {
    const steps: Record<string, unknown> = {};
    for (let i = 0; i < 201; i++) steps[`s${i}`] = { ms: 1 };
    await assertFails(
      setDoc(
        doc(asViewer(), progressPath(VIEW_ONLY, VIEWER_UID)),
        progress({ steps })
      )
    );
  });

  it('denies an out-of-range step index, an unknown key and a missing startedAt', async () => {
    const ref = doc(asViewer(), progressPath(VIEW_ONLY, VIEWER_UID));
    await assertFails(setDoc(ref, progress({ furthestStepIdx: 501 })));
    await assertFails(setDoc(ref, progress({ furthestStepIdx: 1.5 })));
    await assertFails(setDoc(ref, progress({ score: 10 })));
    const { startedAt: _omit, ...noStart } = progress();
    await assertFails(setDoc(ref, noStart));
  });

  it('type-checks mode, modeSwitches, completed and updatedAt', async () => {
    const ref = doc(asViewer(), progressPath(VIEW_ONLY, VIEWER_UID));
    await assertFails(setDoc(ref, progress({ mode: 'x'.repeat(5000) })));
    await assertFails(setDoc(ref, progress({ modeSwitches: 'many' })));
    await assertFails(setDoc(ref, progress({ completed: 'yes' })));
    await assertFails(setDoc(ref, progress({ updatedAt: 12345 })));
  });

  it('allows a merge update that keeps startedAt', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), progressPath(SUBMISSIONS, STUDENT_UID)),
        { furthestStepIdx: 3, updatedAt: serverTimestamp() },
        { merge: true }
      )
    );
  });

  it('denies changing startedAt', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), progressPath(SUBMISSIONS, STUDENT_UID)), {
        startedAt: serverTimestamp(),
      })
    );
  });

  it('never lets a student delete', async () => {
    await assertFails(
      deleteDoc(doc(asStudent(), progressPath(SUBMISSIONS, STUDENT_UID)))
    );
  });
});

describe('progress reads', () => {
  const list = (db: ReturnType<typeof asTeacher>) =>
    getDocs(collection(db, `guided_learning_sessions/${SUBMISSIONS}/progress`));

  it('lets the owning teacher get and list', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(), progressPath(SUBMISSIONS, STUDENT_UID)))
    );
    await assertSucceeds(list(asTeacher()));
  });

  it('lets an admin get and list', async () => {
    await assertSucceeds(
      getDoc(doc(asAdmin(), progressPath(SUBMISSIONS, STUDENT_UID)))
    );
    await assertSucceeds(list(asAdmin()));
  });

  it('denies another teacher', async () => {
    await assertFails(
      getDoc(
        doc(
          asTeacher(OTHER_TEACHER_UID),
          progressPath(SUBMISSIONS, STUDENT_UID)
        )
      )
    );
    await assertFails(list(asTeacher(OTHER_TEACHER_UID)));
  });

  it('lets a student get only their own doc and never list', async () => {
    await assertSucceeds(
      getDoc(doc(asStudent(), progressPath(SUBMISSIONS, STUDENT_UID)))
    );
    await assertFails(
      getDoc(
        doc(
          asStudent(OTHER_STUDENT_UID),
          progressPath(SUBMISSIONS, STUDENT_UID)
        )
      )
    );
    await assertFails(list(asStudent()));
  });
});
