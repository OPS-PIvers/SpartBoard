// Firestore rules regression for the session `workKind` field (docs/plans/STUDENT_LANDING_V2.md D8):
// only the session's teacher writes it, students read it. Run via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-session-work-kind';
const TEACHER_UID = 'wk-teacher';
const OTHER_TEACHER_UID = 'wk-other-teacher';
const STUDENT_UID = 'wk-student';
const CLASS_A = 'class-a';
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

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      orgId: 'orono',
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

interface Case {
  name: string;
  path: string;
  session: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    name: 'quiz_sessions',
    path: 'quiz_sessions/s1',
    session: {
      teacherUid: TEACHER_UID,
      quizTitle: 'Quiz',
      status: 'active',
      classIds: [CLASS_A],
    },
  },
  {
    name: 'video_activity_sessions',
    path: 'video_activity_sessions/s1',
    session: {
      id: 's1',
      teacherUid: TEACHER_UID,
      activityId: 'a1',
      createdAt: 1,
      status: 'active',
      classIds: [CLASS_A],
    },
  },
  {
    name: 'guided_learning_sessions',
    path: 'guided_learning_sessions/s1',
    session: {
      teacherUid: TEACHER_UID,
      title: 'Tour',
      status: 'active',
      classIds: [CLASS_A],
    },
  },
  {
    name: 'mini_app_sessions',
    path: 'mini_app_sessions/s1',
    session: {
      teacherUid: TEACHER_UID,
      appId: 'app-1',
      appTitle: 'Fractions',
      assignmentName: 'Fractions',
      status: 'active',
      classIds: [CLASS_A],
    },
  },
  {
    name: 'activity_wall_sessions',
    path: `activity_wall_sessions/${TEACHER_UID}_s1`,
    session: {
      teacherUid: TEACHER_UID,
      activityId: 'w1',
      status: 'active',
      classIds: [CLASS_A],
    },
  },
  {
    name: 'flashcard_sessions',
    path: 'flashcard_sessions/s1',
    session: {
      id: 's1',
      teacherUid: TEACHER_UID,
      setId: 'set-1',
      kind: 'study',
      status: 'active',
      classIds: [CLASS_A],
      cards: [{ id: 'c1', term: 'a', definition: 'b' }],
    },
  },
  {
    name: 'project_runs',
    path: 'project_runs/s1',
    session: {
      id: 's1',
      teacherUid: TEACHER_UID,
      projectId: 'p1',
      status: 'active',
      classIds: [CLASS_A],
      approvalStepIds: [],
      steps: [],
      acceptingUpdates: true,
    },
  },
];

const seed = async (c: Case, extra: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), c.path), { ...c.session, ...extra });
  });
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe.each(CASES)('$name workKind', (c) => {
  it('lets the session teacher create the session with a workKind', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), c.path), {
        ...c.session,
        workKind: 'resource',
      })
    );
  });

  it('lets the session teacher flip workKind on an existing session', async () => {
    await seed(c, { workKind: 'work' });
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), c.path), { workKind: 'resource' })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), c.path), { workKind: 'work' })
    );
  });

  it('refuses another teacher changing workKind', async () => {
    await seed(c, { workKind: 'work' });
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), c.path), {
        workKind: 'resource',
      })
    );
  });

  it('refuses a student changing workKind', async () => {
    await seed(c, { workKind: 'resource' });
    await assertFails(
      updateDoc(doc(asStudent(), c.path), { workKind: 'work' })
    );
  });

  it('refuses a student creating a session that carries workKind', async () => {
    await assertFails(
      setDoc(doc(asStudent(), c.path), { ...c.session, workKind: 'resource' })
    );
  });

  it('lets a student in the class read the session with its workKind', async () => {
    await seed(c, { workKind: 'resource' });
    const snap = await assertSucceeds(getDoc(doc(asStudent(), c.path)));
    expect(snap.data()?.workKind).toBe('resource');
  });
});
