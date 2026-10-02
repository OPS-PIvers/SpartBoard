// Firestore security-rules tests for `student_sections/{uid}`.
//
// studentLoginV1 records a student's full OneRoster section list here so
// getStudentClassDirectoryV1 can re-check it against rosters. Only the Admin
// SDK touches it: the student it describes, teachers, admins and anonymous
// callers can neither read nor write it (the default deny-all covers it).
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
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

const PROJECT_ID = 'spartboard-student-sections-test';
const STUDENT_UID = 'student-pseudonym-1';
const TEACHER_UID = 'teacher-uid-1';
const ADMIN_EMAIL = 'admin@school.edu';
const SECTIONS_PATH = `student_sections/${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      orgId: 'org-1',
      classIds: ['ENG'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

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
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });
    await setDoc(doc(db, SECTIONS_PATH), {
      orgId: 'org-1',
      sectionIds: ['ENG', 'HOMEROOM'],
      updatedAt: 1000,
    });
  });
});

const callers = [
  ['the student it describes', asStudent],
  ['a teacher', asTeacher],
  ['an admin', asAdmin],
  ['an anonymous caller', asUnauth],
] as const;

describe('student_sections is server-only', () => {
  for (const [label, as] of callers) {
    describe(label, () => {
      it('cannot read the doc', async () => {
        await assertFails(getDoc(doc(as(), SECTIONS_PATH)));
      });

      it('cannot list the collection', async () => {
        await assertFails(getDocs(collection(as(), 'student_sections')));
      });

      it('cannot create a doc', async () => {
        await assertFails(
          setDoc(doc(as(), 'student_sections/new-student'), {
            orgId: 'org-1',
            sectionIds: ['ENG'],
          })
        );
      });

      it('cannot widen its own sections', async () => {
        await assertFails(
          updateDoc(doc(as(), SECTIONS_PATH), {
            sectionIds: ['ENG', 'HOMEROOM', 'OTHER'],
          })
        );
      });

      it('cannot delete the doc', async () => {
        await assertFails(deleteDoc(doc(as(), SECTIONS_PATH)));
      });
    });
  }
});
