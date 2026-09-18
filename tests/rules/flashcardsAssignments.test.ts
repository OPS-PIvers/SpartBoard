// Firestore security-rules regression for Flashcards PR 3 (sessions + progress).
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-flashcards-assignments';
const TEACHER_UID = 'fc-teacher';
const OTHER_TEACHER_UID = 'fc-other-teacher';
const STUDENT_UID = 'fc-student';
const OUTSIDER_UID = 'fc-outsider';
const CLASS_A = 'class-a';
const SESSION_PATH = 'flashcard_sessions/session-1';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = (uid: string, classIds: string[]) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      orgId: 'orono',
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1',
  teacherUid: TEACHER_UID,
  setId: 'set-1',
  title: 'Spanish 1',
  kind: 'study',
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
  classIds: [CLASS_A],
  classId: CLASS_A,
  status: 'active',
  createdAt: 1,
  ...overrides,
});

const progress = (overrides: Record<string, unknown> = {}) => ({
  classId: CLASS_A,
  cards: { 'card-1': { s: 1, due: 2, c: 1, w: 0 } },
  starred: [],
  round: 1,
  studyMs: 1000,
  modesUsed: ['flashcards'],
  tests: [],
  lastActiveAt: 1,
  ...overrides,
});

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
};

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

describe('flashcard_sessions', () => {
  it('lets a teacher create and end their own session only', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), SESSION_PATH), session())
    );
    await assertFails(
      setDoc(
        doc(asTeacher(OTHER_TEACHER_UID), 'flashcard_sessions/session-2'),
        session({ id: 'session-2' })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asTeacher(TEACHER_UID), SESSION_PATH),
        { status: 'ended', endedAt: 2 },
        { merge: true }
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(OTHER_TEACHER_UID), SESSION_PATH),
        { status: 'active' },
        { merge: true }
      )
    );
  });

  it('denies students creating sessions', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(STUDENT_UID, [CLASS_A]), SESSION_PATH),
        session({ teacherUid: STUDENT_UID })
      )
    );
  });

  it('gates student reads by class or pointer', async () => {
    await seed(SESSION_PATH, session());
    await assertSucceeds(
      getDoc(doc(asStudent(STUDENT_UID, [CLASS_A]), SESSION_PATH))
    );
    await assertFails(
      getDoc(doc(asStudent(OUTSIDER_UID, ['class-z']), SESSION_PATH))
    );
    await seed(`student_assignments/${OUTSIDER_UID}/items/session-1`, {
      kind: 'flashcards',
      sessionId: 'session-1',
      teacherUid: TEACHER_UID,
      classId: CLASS_A,
      createdAt: 1,
      updatedAt: 1,
    });
    await assertSucceeds(
      getDoc(doc(asStudent(OUTSIDER_UID, ['class-z']), SESSION_PATH))
    );
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), SESSION_PATH))
    );
  });

  it('allows the student class-list query', async () => {
    await seed(SESSION_PATH, session());
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudent(STUDENT_UID, [CLASS_A]), 'flashcard_sessions'),
          where('classIds', 'array-contains-any', [CLASS_A]),
          where('status', '==', 'active')
        )
      )
    );
  });

  it('allows the class query a multi-class student really sends', async () => {
    await seed(SESSION_PATH, session());
    const db = asStudent(STUDENT_UID, [CLASS_A, 'class-b']);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'flashcard_sessions'),
          where('classIds', 'array-contains-any', [CLASS_A, 'class-b']),
          where('status', '==', 'active')
        )
      )
    );
    // The Ended channel adds orderBy + limit; both need a matching doc in the
    // result set, because an empty result never reaches the rule at all.
    await seed(
      'flashcard_sessions/session-2',
      session({
        id: 'session-2',
        classIds: ['class-b'],
        classId: 'class-b',
        status: 'ended',
        endedAt: 2,
      })
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'flashcard_sessions'),
          where('classIds', 'array-contains-any', ['class-b']),
          where('status', '==', 'ended'),
          orderBy('endedAt', 'desc'),
          limit(50)
        )
      )
    );
  });

  it("keeps one teacher out of another teacher's sessions", async () => {
    await seed(SESSION_PATH, session());
    const otherDb = asTeacher(OTHER_TEACHER_UID);
    await assertFails(getDoc(doc(otherDb, SESSION_PATH)));
    await assertFails(getDocs(collection(otherDb, 'flashcard_sessions')));
    await assertFails(
      getDocs(
        query(
          collection(otherDb, 'flashcard_sessions'),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(otherDb, 'flashcard_sessions'),
          where('teacherUid', '==', OTHER_TEACHER_UID)
        )
      )
    );
  });

  it('denies an unconstrained student query over the collection', async () => {
    await seed(SESSION_PATH, session());
    const outsiderDb = asStudent(OUTSIDER_UID, ['class-z']);
    await assertFails(getDocs(collection(outsiderDb, 'flashcard_sessions')));
    await assertFails(
      getDocs(
        query(
          collection(outsiderDb, 'flashcard_sessions'),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
    await assertFails(
      getDocs(
        query(
          collection(outsiderDb, 'flashcard_sessions'),
          where('classIds', 'array-contains-any', [CLASS_A]),
          where('status', '==', 'active')
        )
      )
    );
  });

  it('keeps a roster-targeted session off the open collection', async () => {
    // classIds is empty when a teacher targets a roster or group; those
    // students arrive through their student_assignments pointer.
    await seed(SESSION_PATH, session({ classIds: [], classId: '' }));
    const outsiderDb = asStudent(OUTSIDER_UID, ['class-z']);
    await assertFails(getDoc(doc(outsiderDb, SESSION_PATH)));
    await assertFails(getDocs(collection(outsiderDb, 'flashcard_sessions')));
    await assertFails(
      getDocs(
        query(
          collection(outsiderDb, 'flashcard_sessions'),
          where('classIds', '==', []),
          where('status', '==', 'active')
        )
      )
    );
    await seed(`student_assignments/${OUTSIDER_UID}/items/session-1`, {
      kind: 'flashcards',
      sessionId: 'session-1',
      teacherUid: TEACHER_UID,
      classId: '',
      createdAt: 1,
      updatedAt: 1,
    });
    await assertSucceeds(getDoc(doc(outsiderDb, SESSION_PATH)));
  });
});

describe('flashcard_sessions progress', () => {
  const progressPath = `${SESSION_PATH}/progress/${STUDENT_UID}`;

  it('lets a class student write their own progress', async () => {
    await seed(SESSION_PATH, session());
    const studentDb = asStudent(STUDENT_UID, [CLASS_A]);
    await assertSucceeds(setDoc(doc(studentDb, progressPath), progress()));
    await assertSucceeds(
      setDoc(
        doc(studentDb, progressPath),
        { round: 2, lastActiveAt: 2 },
        { merge: true }
      )
    );
    await assertSucceeds(getDoc(doc(studentDb, progressPath)));
    await assertFails(
      setDoc(
        doc(studentDb, `${SESSION_PATH}/progress/${OUTSIDER_UID}`),
        progress()
      )
    );
  });

  it('rejects server-owned score fields from students', async () => {
    await seed(SESSION_PATH, session({ kind: 'check', checkMode: 'write' }));
    const studentDb = asStudent(STUDENT_UID, [CLASS_A]);
    await assertFails(
      setDoc(
        doc(studentDb, progressPath),
        progress({ submittedAt: 5, score: 1, total: 1 })
      )
    );
  });

  it('freezes progress after submit, close, or end', async () => {
    const studentDb = asStudent(STUDENT_UID, [CLASS_A]);

    await seed(SESSION_PATH, session({ kind: 'check', checkMode: 'write' }));
    await seed(progressPath, progress({ submittedAt: 5, score: 1, total: 1 }));
    await assertFails(
      setDoc(doc(studentDb, progressPath), { round: 3 }, { merge: true })
    );

    await testEnv.clearFirestore();
    await seed(SESSION_PATH, session({ closeAt: Date.now() - 600000 }));
    await assertFails(setDoc(doc(studentDb, progressPath), progress()));

    await testEnv.clearFirestore();
    await seed(SESSION_PATH, session({ status: 'ended' }));
    await assertFails(setDoc(doc(studentDb, progressPath), progress()));
  });

  it('needs a class or a pointer to write progress on a roster-targeted session', async () => {
    await seed(SESSION_PATH, session({ classIds: [], classId: '' }));
    const outsiderDb = asStudent(OUTSIDER_UID, ['class-z']);
    const outsiderProgress = `${SESSION_PATH}/progress/${OUTSIDER_UID}`;
    await assertFails(
      setDoc(doc(outsiderDb, outsiderProgress), progress({ classId: '' }))
    );
    await seed(`student_assignments/${OUTSIDER_UID}/items/session-1`, {
      kind: 'flashcards',
      sessionId: 'session-1',
      teacherUid: TEACHER_UID,
      classId: '',
      createdAt: 1,
      updatedAt: 1,
    });
    await assertSucceeds(
      setDoc(doc(outsiderDb, outsiderProgress), progress({ classId: '' }))
    );
  });

  it('keeps other students out and lets the teacher read and reset', async () => {
    await seed(SESSION_PATH, session());
    await seed(progressPath, progress());
    await assertFails(
      getDoc(doc(asStudent(OUTSIDER_UID, [CLASS_A]), progressPath))
    );
    await assertFails(
      setDoc(
        doc(
          asStudent(OUTSIDER_UID, ['class-z']),
          `${SESSION_PATH}/progress/${OUTSIDER_UID}`
        ),
        progress()
      )
    );
    const teacherDb = asTeacher(TEACHER_UID);
    await assertSucceeds(
      getDocs(collection(teacherDb, `${SESSION_PATH}/progress`))
    );
    await assertFails(
      getDocs(
        collection(asTeacher(OTHER_TEACHER_UID), `${SESSION_PATH}/progress`)
      )
    );
    await assertSucceeds(deleteDoc(doc(teacherDb, progressPath)));
  });
});
