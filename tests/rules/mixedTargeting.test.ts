// Rules regression for mixed class + student targeting (ASSIGN_STEPPER D5b).
// A session's `studentTargetClassIds` is a delivery hint written by setAssignmentTargetsV1;
// access still runs through class match or pointer. Requires `pnpm run test:rules`.

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
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-mixed-targeting';
const TEACHER_UID = 'mt-teacher';
const OTHER_TEACHER_UID = 'mt-other-teacher';
const WHOLE_STUDENT = 'mt-whole-student';
const PICKED_STUDENT = 'mt-picked-student';
const OUTSIDER = 'mt-outsider';
const CLASS_WHOLE = 'class-whole';
const CLASS_PARTIAL = 'class-partial';
const FC_PATH = 'flashcard_sessions/fc-1';
const QUIZ_PATH = 'quiz_sessions/quiz-1';
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

const mixed = {
  classIds: [CLASS_WHOLE, CLASS_PARTIAL],
  classId: CLASS_WHOLE,
  studentTargetClassIds: [CLASS_PARTIAL],
};

const fcSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'fc-1',
  teacherUid: TEACHER_UID,
  setId: 'set-1',
  title: 'Spanish 1',
  kind: 'study',
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
  status: 'active',
  createdAt: 1,
  ...mixed,
  ...overrides,
});

const progress = (classId: string) => ({
  classId,
  cards: { 'card-1': { s: 1, due: 2, c: 1, w: 0 } },
  starred: [],
  round: 1,
  studyMs: 1000,
  modesUsed: ['flashcards'],
  tests: [],
  lastActiveAt: 1,
});

const pointer = (kind: string, sessionId: string) => ({
  kind,
  sessionId,
  teacherUid: TEACHER_UID,
  classId: CLASS_PARTIAL,
  createdAt: 1,
  updatedAt: 1,
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

describe('mixed targeting — teacher session writes', () => {
  it('lets the owner create a mixed session and keep editing it', async () => {
    const db = asTeacher(TEACHER_UID);
    await assertSucceeds(setDoc(doc(db, FC_PATH), fcSession()));
    await assertSucceeds(
      setDoc(doc(db, FC_PATH), { status: 'ended', endedAt: 2 }, { merge: true })
    );
  });

  it('keeps another teacher from changing the narrowing', async () => {
    await seed(FC_PATH, fcSession());
    await assertFails(
      setDoc(
        doc(asTeacher(OTHER_TEACHER_UID), FC_PATH),
        { studentTargetClassIds: [] },
        { merge: true }
      )
    );
  });

  it('keeps students from writing the narrowing', async () => {
    await seed(FC_PATH, fcSession());
    await assertFails(
      setDoc(
        doc(asStudent(WHOLE_STUDENT, [CLASS_WHOLE]), FC_PATH),
        { studentTargetClassIds: [] },
        { merge: true }
      )
    );
  });
});

describe('mixed targeting — flashcard session reads and progress writes', () => {
  beforeEach(async () => {
    await seed(FC_PATH, fcSession());
  });

  it('a whole-class student reads, lists and writes progress', async () => {
    const db = asStudent(WHOLE_STUDENT, [CLASS_WHOLE]);
    await assertSucceeds(getDoc(doc(db, FC_PATH)));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'flashcard_sessions'),
          where('classIds', 'array-contains-any', [CLASS_WHOLE]),
          where('status', '==', 'active')
        )
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, `${FC_PATH}/progress/${WHOLE_STUDENT}`),
        progress(CLASS_WHOLE)
      )
    );
  });

  it('a picked student in the narrowed class reads and writes progress', async () => {
    await seed(
      `student_assignments/${PICKED_STUDENT}/items/fc-1`,
      pointer('flashcards', 'fc-1')
    );
    const db = asStudent(PICKED_STUDENT, [CLASS_PARTIAL]);
    await assertSucceeds(getDoc(doc(db, FC_PATH)));
    await assertSucceeds(
      getDoc(doc(db, `student_assignments/${PICKED_STUDENT}/items/fc-1`))
    );
    await assertSucceeds(
      setDoc(
        doc(db, `${FC_PATH}/progress/${PICKED_STUDENT}`),
        progress(CLASS_PARTIAL)
      )
    );
  });

  it('a student in neither class nor holding a pointer stays out', async () => {
    const db = asStudent(OUTSIDER, ['class-z']);
    await assertFails(getDoc(doc(db, FC_PATH)));
    await assertFails(
      setDoc(doc(db, `${FC_PATH}/progress/${OUTSIDER}`), progress('class-z'))
    );
  });
});

describe('mixed targeting — pointer docs', () => {
  beforeEach(async () => {
    await seed(
      `student_assignments/${PICKED_STUDENT}/items/quiz-1`,
      pointer('quiz', 'quiz-1')
    );
  });

  it('only the picked student reads their pointer', async () => {
    const path = `student_assignments/${PICKED_STUDENT}/items/quiz-1`;
    await assertSucceeds(
      getDoc(doc(asStudent(PICKED_STUDENT, [CLASS_PARTIAL]), path))
    );
    await assertFails(
      getDoc(doc(asStudent(WHOLE_STUDENT, [CLASS_PARTIAL]), path))
    );
    await assertFails(getDoc(doc(asTeacher(TEACHER_UID), path)));
  });

  it('no client creates or edits a pointer', async () => {
    await assertFails(
      setDoc(
        doc(
          asStudent(WHOLE_STUDENT, [CLASS_PARTIAL]),
          `student_assignments/${WHOLE_STUDENT}/items/quiz-1`
        ),
        pointer('quiz', 'quiz-1')
      )
    );
    await assertFails(
      setDoc(
        doc(
          asTeacher(TEACHER_UID),
          `student_assignments/${PICKED_STUDENT}/items/quiz-1`
        ),
        { excluded: true },
        { merge: true }
      )
    );
  });
});

describe('mixed targeting — quiz sessions', () => {
  it('the owner writes a mixed quiz session and both student kinds read it', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), QUIZ_PATH), {
        teacherUid: TEACHER_UID,
        quizId: 'quiz-src',
        quizTitle: 'Fractions',
        status: 'waiting',
        ...mixed,
      })
    );
    await assertSucceeds(
      getDoc(doc(asStudent(WHOLE_STUDENT, [CLASS_WHOLE]), QUIZ_PATH))
    );
    await assertSucceeds(
      getDoc(doc(asStudent(PICKED_STUDENT, [CLASS_PARTIAL]), QUIZ_PATH))
    );
    await assertFails(
      setDoc(
        doc(asTeacher(OTHER_TEACHER_UID), QUIZ_PATH),
        { studentTargetClassIds: [] },
        { merge: true }
      )
    );
  });
});
