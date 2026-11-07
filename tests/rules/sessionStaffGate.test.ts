// Student-facing sessions and public flashcard pages take district staff or an admin, never a student's own district Google account.
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
import { setDoc, doc, updateDoc } from 'firebase/firestore';
import {
  NOT_STAFF_DISTRICT_EMAILS,
  seedDistrictStaff,
} from './districtStaffSeed';

const PROJECT_ID = 'spartboard-session-staff-gate';
const STAFF_EMAIL = 'pat.staff@orono.k12.mn.us';
const ADMIN_EMAIL = 'admin.only@example.org';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const uidFor = (email: string) => `uid-${email}`;
const asGoogle = (email: string) =>
  testEnv
    .authenticatedContext(uidFor(email), {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

type Kind = {
  name: string;
  path: (uid: string) => string;
  data: (uid: string) => Record<string, unknown>;
  edit: Record<string, unknown>;
};

const KINDS: Kind[] = [
  {
    name: 'mini_app_sessions',
    path: () => 'mini_app_sessions/s1',
    data: (uid) => ({
      teacherUid: uid,
      classIds: ['class-a'],
      status: 'active',
      assignmentName: 'Mini',
    }),
    edit: { status: 'ended' },
  },
  {
    name: 'guided_learning_sessions',
    path: () => 'guided_learning_sessions/s1',
    data: (uid) => ({ teacherUid: uid, classId: 'class-a', status: 'active' }),
    edit: { status: 'ended' },
  },
  {
    name: 'video_activity_sessions',
    path: () => 'video_activity_sessions/s1',
    data: (uid) => ({
      id: 's1',
      activityId: 'act-1',
      activityTitle: 'Test',
      youtubeUrl: 'https://youtu.be/x',
      questions: [],
      settings: {},
      allowedPins: [],
      createdAt: 1000,
      assignmentName: 'Assignment',
      classId: 'class-a',
      teacherUid: uid,
      status: 'active',
    }),
    edit: { assignmentName: 'Renamed' },
  },
  {
    name: 'activity_wall_sessions',
    path: (uid) => `activity_wall_sessions/${uid}_wall-1`,
    data: (uid) => ({ teacherUid: uid, classId: 'class-a', title: 'Wall' }),
    edit: { title: 'Renamed' },
  },
  {
    name: 'flashcard_sessions',
    path: () => 'flashcard_sessions/s1',
    data: (uid) => ({
      id: 's1',
      teacherUid: uid,
      setId: 'set-1',
      title: 'Spanish 1',
      kind: 'study',
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
      classIds: ['class-a'],
      classId: 'class-a',
      status: 'active',
      createdAt: 1,
    }),
    edit: { status: 'ended' },
  },
  {
    name: 'project_runs',
    path: (uid) => `project_runs/${uid}_run-1`,
    data: (uid) => ({
      id: `${uid}_run-1`,
      projectId: 'project-1',
      teacherUid: uid,
      title: 'Poster',
      steps: [{ id: 'step-1', title: 'Research' }],
      classIds: ['class-a'],
      approvalStepIds: [],
      showStatusToStudents: true,
      acceptingUpdates: true,
      updatedAt: 1,
    }),
    edit: { title: 'Renamed' },
  },
  {
    name: 'public_flashcard_sets',
    path: () => 'public_flashcard_sets/share-1',
    data: (uid) => ({
      teacherUid: uid,
      setId: 'set-1',
      title: 'Spanish basics',
      description: '',
      termLanguage: 'es-US',
      definitionLanguage: 'en-US',
      cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
      updatedAt: 1,
    }),
    edit: { title: 'Renamed' },
  },
];

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
    await seedDistrictStaff(ctx.firestore(), [STAFF_EMAIL]);
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {});
  });
});

describe.each(KINDS)('$name', (kind) => {
  it.each(NOT_STAFF_DISTRICT_EMAILS)(
    'refuses a create from %s, a district account that is not staff',
    async (email) => {
      const uid = uidFor(email);
      await assertFails(
        setDoc(doc(asGoogle(email), kind.path(uid)), kind.data(uid))
      );
    }
  );

  it.each(NOT_STAFF_DISTRICT_EMAILS)(
    'refuses an edit from %s on a doc it already owns',
    async (email) => {
      const uid = uidFor(email);
      await testEnv.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), kind.path(uid)), kind.data(uid))
      );
      await assertFails(
        updateDoc(doc(asGoogle(email), kind.path(uid)), kind.edit)
      );
    }
  );

  it('lets staff create and edit their own', async () => {
    const uid = uidFor(STAFF_EMAIL);
    const db = asGoogle(STAFF_EMAIL);
    await assertSucceeds(setDoc(doc(db, kind.path(uid)), kind.data(uid)));
    await assertSucceeds(updateDoc(doc(db, kind.path(uid)), kind.edit));
  });

  it('lets an admin with no member doc create their own', async () => {
    const uid = uidFor(ADMIN_EMAIL);
    await assertSucceeds(
      setDoc(doc(asGoogle(ADMIN_EMAIL), kind.path(uid)), kind.data(uid))
    );
  });
});
