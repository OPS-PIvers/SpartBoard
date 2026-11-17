// Firestore security-rules regression for the Writing assignment library (docs/plans/WRITING_ASSIGNMENT.md).
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
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-writing-assignments';
const TEACHER_UID = 'writing-teacher';
const OTHER_TEACHER_UID = 'writing-other-teacher';
const STUDENT_UID = 'writing-student';
const ITEM_PATH = `users/${TEACHER_UID}/writing_assignments/wa-1`;
const FOLDER_PATH = `users/${TEACHER_UID}/writing_folders/folder-1`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const stimulus = (i: number) => ({
  id: `s-${i}`,
  type: 'text',
  url: '',
  text: 'A passage.',
  label: `Passage ${i}`,
});

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'wa-1',
  title: 'Argument essay',
  prompt: 'Is homework **worth it**?',
  stimuli: [stimulus(1)],
  minWords: 300,
  maxWords: 600,
  grading: { mode: 'points', points: 20 },
  folderId: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const seedItem = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ITEM_PATH), item());
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
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(
      ctx.firestore(),
      [TEACHER_UID, OTHER_TEACHER_UID].map((uid) => `${uid}@example.com`)
    )
  );
});

describe('writing assignment library: reads', () => {
  it('lets the owner read one item and list the library', async () => {
    await seedItem();
    const db = asTeacher(TEACHER_UID);
    await assertSucceeds(getDoc(doc(db, ITEM_PATH)));
    await assertSucceeds(
      getDocs(collection(db, `users/${TEACHER_UID}/writing_assignments`))
    );
  });

  it('denies another teacher', async () => {
    await seedItem();
    const db = asTeacher(OTHER_TEACHER_UID);
    await assertFails(getDoc(doc(db, ITEM_PATH)));
    await assertFails(
      getDocs(collection(db, `users/${TEACHER_UID}/writing_assignments`))
    );
  });

  it('denies a student-role token, even under its own uid', async () => {
    await seedItem();
    await assertFails(getDoc(doc(asStudent(STUDENT_UID), ITEM_PATH)));
    await assertFails(
      getDoc(
        doc(
          asStudent(STUDENT_UID),
          `users/${STUDENT_UID}/writing_assignments/wa-1`
        )
      )
    );
  });

  it('denies a signed-out reader', async () => {
    await seedItem();
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), ITEM_PATH))
    );
  });
});

describe('writing assignment library: writes', () => {
  it('lets the owner create, update, reorder, archive and delete', async () => {
    const db = asTeacher(TEACHER_UID);
    await assertSucceeds(setDoc(doc(db, ITEM_PATH), item()));
    await assertSucceeds(
      setDoc(
        doc(db, ITEM_PATH),
        item({
          grading: {
            mode: 'rubric',
            rubricId: 'r-1',
            rubricSnapshot: { id: 'r-1', title: 'Essay', criteria: [] },
          },
          updatedAt: 2,
        })
      )
    );
    await assertSucceeds(updateDoc(doc(db, ITEM_PATH), { order: 3 }));
    await assertSucceeds(
      setDoc(
        doc(db, ITEM_PATH),
        { archivedAt: 5, updatedAt: 5 },
        { merge: true }
      )
    );
    await assertSucceeds(deleteDoc(doc(db, ITEM_PATH)));
  });

  it('denies another teacher writing into the library', async () => {
    const db = asTeacher(OTHER_TEACHER_UID);
    await assertFails(setDoc(doc(db, ITEM_PATH), item()));
    await seedItem();
    await assertFails(updateDoc(doc(db, ITEM_PATH), { title: 'Mine now' }));
    await assertFails(deleteDoc(doc(db, ITEM_PATH)));
  });

  it('denies a student-role token, even under its own uid', async () => {
    const own = `users/${STUDENT_UID}/writing_assignments/wa-1`;
    await assertFails(setDoc(doc(asStudent(STUDENT_UID), own), item()));
  });

  it('refuses a doc whose id does not match its path', async () => {
    await assertFails(
      setDoc(doc(asTeacher(TEACHER_UID), ITEM_PATH), item({ id: 'wa-2' }))
    );
  });

  it('refuses a bad shape', async () => {
    const db = asTeacher(TEACHER_UID);
    await assertFails(setDoc(doc(db, ITEM_PATH), item({ title: 42 })));
    await assertFails(setDoc(doc(db, ITEM_PATH), item({ grading: 'points' })));
    await assertFails(setDoc(doc(db, ITEM_PATH), item({ updatedAt: '1' })));
    await assertFails(setDoc(doc(db, ITEM_PATH), item({ stimuli: 'text' })));
    const { grading: _grading, ...noGrading } = item();
    await assertFails(setDoc(doc(db, ITEM_PATH), noGrading));
  });

  it('caps Stimulus tabs at ten', async () => {
    const db = asTeacher(TEACHER_UID);
    const tabs = (n: number) =>
      Array.from({ length: n }, (_, i) => stimulus(i));
    await assertSucceeds(
      setDoc(doc(db, ITEM_PATH), item({ stimuli: tabs(10) }))
    );
    await assertFails(setDoc(doc(db, ITEM_PATH), item({ stimuli: tabs(11) })));
  });
});

describe('writing folders', () => {
  const folder = { id: 'folder-1', name: 'Unit 2', order: 0 };

  it('allows the owner and denies another teacher', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), FOLDER_PATH), folder)
    );
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), FOLDER_PATH)));
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), FOLDER_PATH)));
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), FOLDER_PATH), folder)
    );
  });

  it('denies a student-role token, even under its own uid', async () => {
    const own = `users/${STUDENT_UID}/writing_folders/folder-1`;
    await assertFails(setDoc(doc(asStudent(STUDENT_UID), own), folder));
    await assertFails(getDoc(doc(asStudent(STUDENT_UID), own)));
  });
});
