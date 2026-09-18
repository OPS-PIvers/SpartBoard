// Firestore security-rules regression for the Projects widget foundation.
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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-project-runs';
const TEACHER_UID = 'projects-teacher';
const OTHER_TEACHER_UID = 'projects-other-teacher';
const MEMBER_UID = 'projects-member';
const OUTSIDER_UID = 'projects-outsider';
const CLASS_ID = 'classlink-section-1';
const OTHER_CLASS_ID = 'classlink-section-2';
const RUN_ID = `${TEACHER_UID}_project-1`;
const GROUP_PATH = `project_runs/${RUN_ID}/groups/group-1`;
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
      email: `${uid}@example.com`,
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const run = (overrides: Record<string, unknown> = {}) => ({
  id: RUN_ID,
  projectId: 'project-1',
  teacherUid: TEACHER_UID,
  title: 'Ecosystem poster',
  steps: [
    { id: 'step-1', title: 'Research' },
    { id: 'step-2', title: 'Draft', requiresApproval: true },
  ],
  classIds: [CLASS_ID],
  approvalStepIds: ['step-2'],
  showStatusToStudents: true,
  acceptingUpdates: true,
  updatedAt: 1,
  ...overrides,
});

const group = (overrides: Record<string, unknown> = {}) => ({
  id: 'group-1',
  name: 'Group 1',
  classId: CLASS_ID,
  memberUids: [MEMBER_UID],
  order: 0,
  stepStates: { 'step-1': 'notStarted', 'step-2': 'notStarted' },
  needsSupport: false,
  workLinks: [],
  updatedAt: 1,
  ...overrides,
});

/**
 * Deactivating the teacher's operator-org member doc, the one thing
 * `notDeactivated()` reads.
 */
const deactivateTeacher = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(
        ctx.firestore(),
        `organizations/orono/members/${TEACHER_UID}@example.com`
      ),
      {
        email: `${TEACHER_UID}@example.com`,
        roleId: 'teacher',
        status: 'inactive',
      }
    );
  });
};

const seed = async (
  runOverrides: Record<string, unknown> = {},
  groupOverrides: Record<string, unknown> = {}
) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'project_runs', RUN_ID), run(runOverrides));
    await setDoc(doc(db, GROUP_PATH), group(groupOverrides));
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

describe('project library', () => {
  const path = `users/${TEACHER_UID}/projects/project-1`;
  const definition = {
    id: 'project-1',
    title: 'Ecosystem poster',
    steps: [{ id: 'step-1', title: 'Research' }],
    createdAt: 1,
    updatedAt: 1,
  };

  it('allows the owner and denies another teacher', async () => {
    await assertSucceeds(setDoc(doc(asTeacher(TEACHER_UID), path), definition));
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), path), definition)
    );
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), path)));
  });

  it('denies a student-role user even under their own uid', async () => {
    const own = `users/${MEMBER_UID}/projects/project-1`;
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), own), definition)
    );
  });
});

describe('run document', () => {
  it('lets a student in a targeted class read it but never write it', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), 'project_runs', RUN_ID))
    );
    await assertFails(
      updateDoc(
        doc(asStudent(MEMBER_UID, [CLASS_ID]), 'project_runs', RUN_ID),
        { acceptingUpdates: false }
      )
    );
  });

  it('denies a student whose classIds do not include the run', async () => {
    await seed();
    await assertFails(
      getDoc(
        doc(asStudent(OUTSIDER_UID, [OTHER_CLASS_ID]), 'project_runs', RUN_ID)
      )
    );
  });

  it('denies another teacher', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), 'project_runs', RUN_ID), {
        title: 'Hijacked',
      })
    );
  });

  it('denies another teacher reading it at all', async () => {
    await seed();
    await assertFails(
      getDoc(doc(asTeacher(OTHER_TEACHER_UID), 'project_runs', RUN_ID))
    );
  });
});

describe('group document', () => {
  it('lets a member move a non-approval step to done', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), GROUP_PATH), {
        stepStates: { 'step-1': 'done', 'step-2': 'notStarted' },
        lastStepChange: { stepId: 'step-1', at: 2 },
        updatedAt: 2,
      })
    );
  });

  it('stops a member at readyForReview on an approval step', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), GROUP_PATH), {
        stepStates: { 'step-1': 'notStarted', 'step-2': 'readyForReview' },
        lastStepChange: { stepId: 'step-2', at: 2 },
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), GROUP_PATH), {
        stepStates: { 'step-1': 'notStarted', 'step-2': 'done' },
        lastStepChange: { stepId: 'step-2', at: 3 },
        updatedAt: 3,
      })
    );
  });

  it('rejects a step change that lies about which step it moved', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), GROUP_PATH), {
        stepStates: { 'step-1': 'notStarted', 'step-2': 'done' },
        lastStepChange: { stepId: 'step-1', at: 2 },
        updatedAt: 2,
      })
    );
  });

  it('lets the teacher set done on an approval step', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), GROUP_PATH), {
        stepStates: { 'step-1': 'notStarted', 'step-2': 'done' },
        updatedAt: 2,
      })
    );
  });

  it('denies a member editing membership, name or class', async () => {
    await seed();
    const db = asStudent(MEMBER_UID, [CLASS_ID]);
    await assertFails(
      updateDoc(doc(db, GROUP_PATH), { memberUids: [MEMBER_UID, OUTSIDER_UID] })
    );
    await assertFails(updateDoc(doc(db, GROUP_PATH), { name: 'The Best' }));
    await assertFails(
      updateDoc(doc(db, GROUP_PATH), { classId: OTHER_CLASS_ID })
    );
  });

  it('denies another teacher reading a group in someone else\u2019s run', async () => {
    await seed();
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), GROUP_PATH)));
  });

  it('denies a classmate who is not in the group', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(asStudent(OUTSIDER_UID, [CLASS_ID]), GROUP_PATH))
    );
    await assertFails(
      updateDoc(doc(asStudent(OUTSIDER_UID, [CLASS_ID]), GROUP_PATH), {
        needsSupport: true,
        updatedAt: 2,
      })
    );
  });

  it('freezes student writes once the teacher closes the run', async () => {
    await seed({ acceptingUpdates: false });
    await assertFails(
      updateDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), GROUP_PATH), {
        needsSupport: true,
        updatedAt: 2,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), GROUP_PATH), {
        needsSupport: true,
        updatedAt: 2,
      })
    );
  });
});

describe('event log', () => {
  const eventPath = `${GROUP_PATH}/events/event-1`;
  const event = (actorUid: string, actorRole: 'student' | 'teacher') => ({
    id: 'event-1',
    at: 2,
    actorUid,
    actorRole,
    kind: 'stepState',
  });

  it('is append-only and pinned to the caller', async () => {
    await seed();
    const db = asStudent(MEMBER_UID, [CLASS_ID]);
    await assertFails(
      setDoc(doc(db, eventPath), event(TEACHER_UID, 'teacher'))
    );
    await assertSucceeds(
      setDoc(doc(db, eventPath), event(MEMBER_UID, 'student'))
    );
    await assertFails(updateDoc(doc(db, eventPath), { kind: 'upload' }));
  });

  it('is never readable by a student, including their own entry', async () => {
    await seed();
    await assertSucceeds(
      setDoc(
        doc(asStudent(MEMBER_UID, [CLASS_ID]), eventPath),
        event(MEMBER_UID, 'student')
      )
    );
    await assertFails(
      getDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), eventPath))
    );
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), eventPath)));
  });
});

describe('grades', () => {
  const gradePath = `project_runs/${RUN_ID}/grades/group-1`;
  const grade = (released: boolean) => ({
    groupId: 'group-1',
    rubricScores: [],
    points: 18,
    maxPoints: 20,
    released,
    gradedAt: 2,
  });

  it('hides an unreleased score from the group it belongs to', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), gradePath), grade(false));
    });
    await assertFails(
      getDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), gradePath))
    );
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), gradePath)));
  });

  it('shows a released score to members only', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), gradePath), grade(true));
    });
    await assertSucceeds(
      getDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), gradePath))
    );
    await assertFails(
      getDoc(doc(asStudent(OUTSIDER_UID, [CLASS_ID]), gradePath))
    );
  });

  it('is never student-writable', async () => {
    await seed();
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), gradePath), grade(true))
    );
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), gradePath), grade(true))
    );
  });
});

describe('a deactivated teacher', () => {
  it('loses read and write on the groups and grades of their own run', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), GROUP_PATH)));

    await deactivateTeacher();
    await assertFails(getDoc(doc(asTeacher(TEACHER_UID), GROUP_PATH)));
    await assertFails(
      updateDoc(doc(asTeacher(TEACHER_UID), GROUP_PATH), { name: 'Renamed' })
    );
    const gradePath = `project_runs/${RUN_ID}/grades/group-1`;
    await assertFails(
      setDoc(doc(asTeacher(TEACHER_UID), gradePath), {
        released: true,
        points: 9,
        updatedAt: 1,
      })
    );
  });
});
