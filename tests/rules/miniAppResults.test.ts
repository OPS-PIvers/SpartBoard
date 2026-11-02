// Firestore security-rules tests for Mini App results v2 (docs/plans/shipped/MINI_APP_RESULTS.md D5, D6):
// v2 sessions refuse direct submission writes, attempts are server-only, the session key and the
// teacher's key library are hidden from students, and v1 sessions keep working unchanged.
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
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-ma-results-test';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const STUDENT_UID = 'student-uid';
const ANON_UID = 'anon-uid';
const CLASS_A = 'class-A';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.org`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const sessionPath = (id: string) => `mini_app_sessions/${id}`;
const submissionPath = (id: string, docId: string) =>
  `mini_app_sessions/${id}/submissions/${docId}`;
const attemptPath = (id: string, docId: string, n: string) =>
  `${submissionPath(id, docId)}/attempts/${n}`;
const keyPath = (id: string) => `mini_app_sessions/${id}/private/key`;
const libraryKeyPath = (uid: string, appId: string) =>
  `users/${uid}/mini_app_keys/${appId}`;

const sessionDoc = (extra: Record<string, unknown> = {}) => ({
  id: 'x',
  teacherUid: TEACHER_UID,
  appId: 'app-1',
  appTitle: 'Fractions',
  appHtml: '<html></html>',
  assignmentName: 'Fractions',
  status: 'active',
  createdAt: 1,
  mode: 'submissions',
  submissionsEnabled: true,
  classIds: [CLASS_A],
  ...extra,
});

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

const submission = (uid: string, payload: Record<string, unknown>) => ({
  submittedAt: 1000,
  studentUid: uid,
  payload,
});

const KEY = { questions: { q1: { correct: 'B' } } };

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

describe('v1 sessions keep direct submissions', () => {
  beforeEach(async () => {
    await seed(sessionPath('v1'), sessionDoc());
  });

  it('lets an anonymous student write and read their own submission', async () => {
    const db = asAnon();
    await assertSucceeds(
      setDoc(
        doc(db, submissionPath('v1', ANON_UID)),
        submission(ANON_UID, { score: 3 })
      )
    );
    await assertSucceeds(getDoc(doc(db, submissionPath('v1', ANON_UID))));
  });

  it('lets a signed-in student mark done', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('v1', 'pseudo-1')),
        submission(STUDENT_UID, { completed: true })
      )
    );
  });
});

describe('v2 sessions write only through the function', () => {
  beforeEach(async () => {
    await seed(sessionPath('v2'), sessionDoc({ resultsVersion: 2 }));
    await seed(
      submissionPath('v2', 'pseudo-1'),
      submission(STUDENT_UID, { items: [] })
    );
    await seed(attemptPath('v2', 'pseudo-1', '1'), {
      attemptNo: 1,
      studentUid: STUDENT_UID,
    });
    await seed(keyPath('v2'), KEY);
  });

  it('refuses a direct submission and a direct I am done', async () => {
    await assertFails(
      setDoc(
        doc(asAnon(), submissionPath('v2', ANON_UID)),
        submission(ANON_UID, { score: 3 })
      )
    );
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('v2', 'pseudo-1')),
        submission(STUDENT_UID, { completed: true })
      )
    );
  });

  it('still lets a student read their own summary', async () => {
    await assertSucceeds(
      getDoc(doc(asStudent(), submissionPath('v2', 'pseudo-1')))
    );
    await assertFails(getDoc(doc(asAnon(), submissionPath('v2', 'pseudo-1'))));
  });

  it('lets only the teacher read attempts, and nobody write them', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(), attemptPath('v2', 'pseudo-1', '1')))
    );
    await assertFails(
      getDoc(doc(asStudent(), attemptPath('v2', 'pseudo-1', '1')))
    );
    await assertFails(
      getDoc(
        doc(asTeacher(OTHER_TEACHER_UID), attemptPath('v2', 'pseudo-1', '1'))
      )
    );
    await assertFails(
      setDoc(doc(asStudent(), attemptPath('v2', 'pseudo-1', '2')), {
        attemptNo: 2,
        studentUid: STUDENT_UID,
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(), attemptPath('v2', 'pseudo-1', '2')), {
        attemptNo: 2,
      })
    );
  });

  it('hides the session key from students and other teachers', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), keyPath('v2'))));
    await assertFails(getDoc(doc(asStudent(), keyPath('v2'))));
    await assertFails(getDoc(doc(asAnon(), keyPath('v2'))));
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), keyPath('v2'))));
  });

  it('lets only the session teacher write the key', async () => {
    await assertSucceeds(setDoc(doc(asTeacher(), keyPath('v2')), KEY));
    await assertFails(setDoc(doc(asStudent(), keyPath('v2')), KEY));
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), keyPath('v2')), KEY)
    );
  });
});

describe('creating a v2 session with its key', () => {
  it('writes the session and key in one batch', async () => {
    const db = asTeacher();
    await assertSucceeds(
      writeBatch(db)
        .set(doc(db, sessionPath('new')), sessionDoc({ resultsVersion: 2 }))
        .set(doc(db, keyPath('new')), KEY)
        .commit()
    );
  });
});

describe('the teacher key library', () => {
  it('is owner-only for reads and writes', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), libraryKeyPath(TEACHER_UID, 'app-1')), KEY)
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), libraryKeyPath(TEACHER_UID, 'app-1')))
    );
    await assertFails(
      getDoc(
        doc(asTeacher(OTHER_TEACHER_UID), libraryKeyPath(TEACHER_UID, 'app-1'))
      )
    );
    await assertFails(
      getDoc(doc(asStudent(), libraryKeyPath(TEACHER_UID, 'app-1')))
    );
    await assertFails(
      setDoc(doc(asStudent(), libraryKeyPath(TEACHER_UID, 'app-1')), KEY)
    );
  });
});
