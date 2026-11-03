// Security batch 2H: a tour draft carrying sample copies (answer keys) in tourSetup.materials reads for staff only.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

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
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-security-2h';
const ADMIN_EMAIL = 'admin@example.com';
const SETS = 'building_guided_learning';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext('teacher-uid', {
      email: 'teacher@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asAnonStudent = () =>
  testEnv
    .authenticatedContext('anon-student-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asStudentRole = () =>
  testEnv
    .authenticatedContext('sso-student-uid', {
      email: 'kid@example.com',
      email_verified: true,
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asSignedOut = () => testEnv.unauthenticatedContext().firestore();

const lesson = { id: 'lesson', title: 'A lesson', steps: [], imageUrls: [] };
const tourDraft = {
  id: 'tour',
  title: 'A tour',
  steps: [],
  imageUrls: [],
  tourSetup: {
    widgets: ['quiz'],
    materials: [
      {
        id: 'm1',
        kind: 'quiz',
        source: 'sample',
        label: 'A quiz',
        sample: {
          fromId: 'q1',
          title: 'Quiz',
          meta: {},
          data: { questions: [{ id: 'a', correctAnswer: 'Paris' }] },
        },
      },
    ],
  },
};
const emptiedTour = {
  ...tourDraft,
  id: 'emptied',
  tourSetup: { widgets: ['quiz'] },
  steps: [
    { id: 's1', tour: { start: { open: { content: { data: { a: 1 } } } } } },
  ],
};
const flaggedTour = {
  id: 'flagged',
  title: 'T',
  steps: [],
  imageUrls: [],
  hasLiveTour: true,
};
const modeTour = {
  id: 'mode',
  title: 'T',
  steps: [],
  imageUrls: [],
  mode: 'tour',
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, `${SETS}/lesson`), lesson);
    await setDoc(doc(db, `${SETS}/tour`), tourDraft);
    await setDoc(doc(db, `${SETS}/emptied`), emptiedTour);
    await setDoc(doc(db, `${SETS}/flagged`), flaggedTour);
    await setDoc(doc(db, `${SETS}/mode`), modeTour);
  });
});

describe('tour draft sample copies', () => {
  it('lets teachers and admins read and list every set', async () => {
    for (const db of [asTeacher(), asAdmin()]) {
      await assertSucceeds(getDoc(doc(db, `${SETS}/lesson`)));
      await assertSucceeds(getDoc(doc(db, `${SETS}/tour`)));
      for (const id of ['emptied', 'flagged', 'mode'])
        await assertSucceeds(getDoc(doc(db, `${SETS}/${id}`)));
      await assertSucceeds(getDocs(collection(db, SETS)));
    }
  });

  it('denies anonymous and student-role sessions a draft with samples, and any list', async () => {
    for (const db of [asAnonStudent(), asStudentRole()]) {
      for (const id of ['tour', 'emptied', 'flagged', 'mode'])
        await assertFails(getDoc(doc(db, `${SETS}/${id}`)));
      await assertFails(getDocs(collection(db, SETS)));
    }
  });

  it('still lets a signed-in session read a set without samples, or one that is missing', async () => {
    for (const db of [asAnonStudent(), asStudentRole()]) {
      await assertSucceeds(getDoc(doc(db, `${SETS}/lesson`)));
      await assertSucceeds(getDoc(doc(db, `${SETS}/missing`)));
    }
  });

  it('denies signed-out reads', async () => {
    await assertFails(getDoc(doc(asSignedOut(), `${SETS}/lesson`)));
    await assertFails(getDocs(collection(asSignedOut(), SETS)));
  });

  it('keeps writes admin-only', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), `${SETS}/new`), { ...lesson, id: 'new' })
    );
    for (const db of [asTeacher(), asAnonStudent(), asStudentRole()]) {
      await assertFails(setDoc(doc(db, `${SETS}/lesson`), tourDraft));
      await assertFails(deleteDoc(doc(db, `${SETS}/lesson`)));
    }
  });
});
