// Course and Agenda read rules (docs/plans/COURSE_AND_AGENDA.md §4.1): saveCourseV1 is the only writer. Run via `pnpm run test:rules`.

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
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-course-agenda';
const TEACHER = 'teacher-uid';
const CO_TEACHER = 'co-teacher-uid';
const CLASS_A = 'cl-class-a';
const CLASS_B = 'cl-class-b';
const COURSE = `users/${TEACHER}/courses/course-1`;
const PAGE_A = `class_pages/${CLASS_A}/teachers/${TEACHER}`;
const PAGE_A_CO = `class_pages/${CLASS_A}/teachers/${CO_TEACHER}`;
const PAGE_B = `class_pages/${CLASS_B}/teachers/${TEACHER}`;
const LINK = 'course_page_links/link-1';
const FAMILY = 'family_pages/share-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asStudent = (classIds: string[]) =>
  testEnv
    .authenticatedContext('student-uid', {
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asAnon = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const copy = { courseName: 'English 9', teacherName: 'T', agenda: null };

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
    await setDoc(doc(db, COURSE), { name: 'English 9', rosterIds: ['r1'] });
    await setDoc(doc(db, PAGE_A), copy);
    await setDoc(doc(db, PAGE_A_CO), copy);
    await setDoc(doc(db, PAGE_B), copy);
    await setDoc(doc(db, LINK), { classIds: [CLASS_A, CLASS_B] });
    await setDoc(doc(db, FAMILY), copy);
  });
});

const everyone = () => [
  asTeacher(),
  asTeacher(CO_TEACHER),
  asStudent([CLASS_A]),
  asAnon(),
  asSignedOut(),
];

describe('users/{uid}/courses', () => {
  it('lets only the owning teacher read', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), COURSE)));
    await assertSucceeds(
      getDocs(collection(asTeacher(), `users/${TEACHER}/courses`))
    );
    await assertFails(getDoc(doc(asTeacher(CO_TEACHER), COURSE)));
    await assertFails(getDoc(doc(asStudent([CLASS_A]), COURSE)));
    await assertFails(getDoc(doc(asSignedOut(), COURSE)));
  });

  it('refuses every client write, the owner included', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), `users/${TEACHER}/courses/new`), { name: 'x' })
    );
    await assertFails(updateDoc(doc(asTeacher(), COURSE), { name: 'y' }));
    await assertFails(deleteDoc(doc(asTeacher(), COURSE)));
  });

  it('keeps a student-role token out even with a matching uid', async () => {
    const studentAsOwner = testEnv
      .authenticatedContext(TEACHER, {
        studentRole: true,
        classIds: [CLASS_A],
        firebase: { sign_in_provider: 'custom' },
      })
      .firestore();
    await assertFails(getDoc(doc(studentAsOwner, COURSE)));
  });
});

describe('class_pages', () => {
  it("lets a student read and list their own class's copies, every teacher's", async () => {
    const db = asStudent([CLASS_A]);
    await assertSucceeds(getDoc(doc(db, PAGE_A)));
    await assertSucceeds(getDoc(doc(db, PAGE_A_CO)));
    await assertSucceeds(
      getDocs(collection(db, `class_pages/${CLASS_A}/teachers`))
    );
  });

  it("keeps a student out of a class they aren't in", async () => {
    const db = asStudent([CLASS_A]);
    await assertFails(getDoc(doc(db, PAGE_B)));
    await assertFails(
      getDocs(collection(db, `class_pages/${CLASS_B}/teachers`))
    );
    await assertFails(getDoc(doc(asStudent([]), PAGE_A)));
  });

  it('lets a teacher read only their own copy', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), PAGE_A)));
    await assertFails(getDoc(doc(asTeacher(), PAGE_A_CO)));
    await assertFails(
      getDocs(collection(asTeacher(), `class_pages/${CLASS_A}/teachers`))
    );
  });

  it('keeps anonymous and signed-out callers out', async () => {
    await assertFails(getDoc(doc(asAnon(), PAGE_A)));
    await assertFails(getDoc(doc(asSignedOut(), PAGE_A)));
  });

  it('refuses every client write', async () => {
    for (const db of everyone()) {
      await assertFails(setDoc(doc(db, PAGE_A), copy));
      await assertFails(
        setDoc(doc(db, `class_pages/${CLASS_A}/teachers/x`), copy)
      );
      await assertFails(deleteDoc(doc(db, PAGE_A)));
    }
  });
});

describe('course_page_links', () => {
  it('lets any signed-in caller get one by id, but not list them', async () => {
    for (const db of [asTeacher(), asStudent([]), asAnon()]) {
      await assertSucceeds(getDoc(doc(db, LINK)));
      await assertFails(getDocs(collection(db, 'course_page_links')));
    }
    await assertFails(getDoc(doc(asSignedOut(), LINK)));
  });

  it('refuses every client write', async () => {
    for (const db of everyone()) {
      await assertFails(setDoc(doc(db, LINK), { classIds: ['x'] }));
      await assertFails(deleteDoc(doc(db, LINK)));
    }
  });
});

describe('family_pages', () => {
  it('lets anyone get one by id, signed out included, but never list', async () => {
    for (const db of everyone()) {
      await assertSucceeds(getDoc(doc(db, FAMILY)));
      await assertFails(getDocs(collection(db, 'family_pages')));
    }
  });

  it('refuses every client write', async () => {
    for (const db of everyone()) {
      await assertFails(setDoc(doc(db, FAMILY), copy));
      await assertFails(setDoc(doc(db, 'family_pages/new'), copy));
      await assertFails(deleteDoc(doc(db, FAMILY)));
    }
  });
});
