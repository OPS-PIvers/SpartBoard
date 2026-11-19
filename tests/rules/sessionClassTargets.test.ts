// Class targeting: a session write may add only class ids on the writer's server-written verified_classes list.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm exec vitest run --config vitest.rules.config.ts tests/rules/sessionClassTargets.test.ts

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-session-class-targets';
const ATTACKER_EMAIL = 'mallory.teacher@orono.k12.mn.us';
const VICTIM_EMAIL = 'vic.teacher@orono.k12.mn.us';
const ATTACKER = 'uid-attacker';
const VICTIM = 'uid-victim';
const MINE = 'class-mine';
const THEIRS = 'class-theirs';
const STUDENT_UID = 'student-theirs';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asAttacker = () => asTeacher(ATTACKER, ATTACKER_EMAIL);
const asVictim = () => asTeacher(VICTIM, VICTIM_EMAIL);
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [THEIRS],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

type Kind = {
  name: string;
  /** The field this kind's client writes its classes into. */
  single?: boolean;
  path: (uid: string) => string;
  data: (uid: string, classIds: string[]) => Record<string, unknown>;
  /** An edit that does not touch targeting. */
  edit: Record<string, unknown>;
};

const KINDS: Kind[] = [
  {
    name: 'quiz_sessions',
    path: (uid) => `quiz_sessions/${uid}-q1`,
    data: (uid, classIds) => ({
      teacherUid: uid,
      status: 'waiting',
      classIds,
      classId: classIds[0] ?? '',
    }),
    edit: { status: 'active' },
  },
  {
    name: 'video_activity_sessions',
    path: (uid) => `video_activity_sessions/${uid}-v1`,
    data: (uid, classIds) => ({
      id: `${uid}-v1`,
      activityId: 'act-1',
      teacherUid: uid,
      createdAt: 1000,
      status: 'active',
      classIds,
      classId: classIds[0] ?? '',
    }),
    edit: { assignmentName: 'Renamed' },
  },
  {
    name: 'mini_app_sessions',
    path: (uid) => `mini_app_sessions/${uid}-m1`,
    data: (uid, classIds) => ({
      teacherUid: uid,
      status: 'active',
      assignmentName: 'Mini',
      classIds,
    }),
    edit: { status: 'ended' },
  },
  {
    name: 'guided_learning_sessions',
    single: true,
    path: (uid) => `guided_learning_sessions/${uid}-g1`,
    data: (uid, classIds) => ({
      teacherUid: uid,
      status: 'active',
      classId: classIds[0] ?? '',
    }),
    edit: { status: 'ended' },
  },
  {
    name: 'flashcard_sessions',
    path: (uid) => `flashcard_sessions/${uid}-f1`,
    data: (uid, classIds) => ({
      id: `${uid}-f1`,
      teacherUid: uid,
      setId: 'set-1',
      title: 'Spanish 1',
      kind: 'study',
      cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
      classIds,
      classId: classIds[0] ?? '',
      status: 'active',
      createdAt: 1,
    }),
    edit: { status: 'ended' },
  },
  {
    name: 'project_runs',
    path: (uid) => `project_runs/${uid}_run-1`,
    data: (uid, classIds) => ({
      id: `${uid}_run-1`,
      projectId: 'project-1',
      teacherUid: uid,
      title: 'Poster',
      steps: [{ id: 'step-1', title: 'Research' }],
      classIds,
      approvalStepIds: [],
      showStatusToStudents: true,
      acceptingUpdates: true,
      updatedAt: 1,
    }),
    edit: { title: 'Renamed' },
  },
];

/** Targeting fields for `classIds`, in the shape each kind writes. */
const targeting = (kind: Kind, classIds: string[]) =>
  kind.single ? { classId: classIds[classIds.length - 1] ?? '' } : { classIds };

async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), path), data)
  );
}

const countedList = (ids: string[]) => ({
  ids,
  classlink: ids,
  test: [],
  lms: [],
  updatedAt: 1,
  classlinkAt: 1,
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
    await seedDistrictStaff(ctx.firestore(), [ATTACKER_EMAIL, VICTIM_EMAIL]);
    await setDoc(
      doc(ctx.firestore(), `verified_classes/${ATTACKER}`),
      countedList([MINE])
    );
    await setDoc(
      doc(ctx.firestore(), `verified_classes/${VICTIM}`),
      countedList([THEIRS])
    );
  });
});

describe.each(KINDS)('$name', (kind) => {
  it('lets a teacher create and edit a session for a class on their list', async () => {
    const db = asAttacker();
    const ref = doc(db, kind.path(ATTACKER));
    await assertSucceeds(setDoc(ref, kind.data(ATTACKER, [MINE])));
    await assertSucceeds(updateDoc(ref, kind.edit));
  });

  it('refuses a create that targets a class missing from the list', async () => {
    const ids = kind.single ? [THEIRS] : [MINE, THEIRS];
    await assertFails(
      setDoc(doc(asAttacker(), kind.path(ATTACKER)), kind.data(ATTACKER, ids))
    );
  });

  it('refuses an edit that adds a class missing from the list', async () => {
    await seed(kind.path(ATTACKER), kind.data(ATTACKER, [MINE]));
    await assertFails(
      updateDoc(
        doc(asAttacker(), kind.path(ATTACKER)),
        targeting(kind, [MINE, THEIRS])
      )
    );
  });

  it('keeps edits working on an older session holding a class no longer on the list', async () => {
    await seed(kind.path(ATTACKER), kind.data(ATTACKER, [THEIRS]));
    const ref = doc(asAttacker(), kind.path(ATTACKER));
    await assertSucceeds(updateDoc(ref, kind.edit));
    await assertSucceeds(updateDoc(ref, targeting(kind, [])));
  });

  it('does not narrow a teacher whose list ClassLink never answered for while enforce is off', async () => {
    await seed(`verified_classes/${ATTACKER}`, {
      ids: [],
      classlink: [],
      test: [],
      lms: [],
      updatedAt: 1,
    });
    await assertSucceeds(
      setDoc(
        doc(asAttacker(), kind.path(ATTACKER)),
        kind.data(ATTACKER, [THEIRS])
      )
    );
  });

  it('refuses a teacher with no list once super admins turn on enforce', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(ctx.firestore(), `verified_classes/${ATTACKER}`));
      await setDoc(
        doc(ctx.firestore(), 'admin_settings/verified_classes_fill'),
        { enabled: true, enforce: true }
      );
    });
    await assertFails(
      setDoc(
        doc(asAttacker(), kind.path(ATTACKER)),
        kind.data(ATTACKER, [THEIRS])
      )
    );
    await assertSucceeds(
      setDoc(doc(asAttacker(), kind.path(ATTACKER)), kind.data(ATTACKER, []))
    );
  });
});

describe('the student class channel', () => {
  it("lists only the real teacher's quiz session for that class's students", async () => {
    await assertSucceeds(
      setDoc(
        doc(asVictim(), 'quiz_sessions/real'),
        KINDS[0].data(VICTIM, [THEIRS])
      )
    );
    await assertFails(
      setDoc(
        doc(asAttacker(), 'quiz_sessions/forged'),
        KINDS[0].data(ATTACKER, [THEIRS])
      )
    );
    const snap = await getDocs(
      query(
        collection(asStudent(), 'quiz_sessions'),
        where('classIds', 'array-contains-any', [THEIRS])
      )
    );
    expect(snap.docs.map((d) => d.id)).toEqual(['real']);
  });
});

describe('verified_classes', () => {
  it('has no client write path', async () => {
    await assertFails(
      setDoc(
        doc(asAttacker(), `verified_classes/${ATTACKER}`),
        countedList([MINE, THEIRS])
      )
    );
  });

  it('only super admins set enforce', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'admins/mallory.teacher@orono.k12.mn.us'), {})
    );
    await assertFails(
      setDoc(doc(asAttacker(), 'admin_settings/verified_classes_fill'), {
        enforce: false,
      })
    );
  });
});
