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
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

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

const ADMIN_EMAIL = 'projects-admin@example.com';

const asAdmin = () =>
  testEnv
    .authenticatedContext('projects-admin', {
      email: ADMIN_EMAIL,
      email_verified: true,
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

  it('constrains the values a member may write, not just the keys', async () => {
    await seed();
    const db = asStudent(MEMBER_UID, [CLASS_ID]);
    // The client sanitizes work links, but the client is not the boundary.
    await assertFails(
      updateDoc(doc(db, GROUP_PATH), { needsSupport: 'yes please' })
    );
    await assertFails(
      updateDoc(doc(db, GROUP_PATH), {
        workLinks: Array.from({ length: 21 }, (_, i) => ({
          id: `w${i}`,
          url: 'https://example.com',
          addedByUid: MEMBER_UID,
          addedAt: 1,
        })),
      })
    );
    await assertFails(updateDoc(doc(db, GROUP_PATH), { updatedAt: 'now' }));
    await assertSucceeds(
      updateDoc(doc(db, GROUP_PATH), { needsSupport: true, updatedAt: 3 })
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

  it('pins actorRole to what the caller actually is', async () => {
    await seed();
    // Correctly attributed to their own uid, but claiming the teacher's role.
    await assertFails(
      setDoc(
        doc(asStudent(MEMBER_UID, [CLASS_ID]), eventPath),
        event(MEMBER_UID, 'teacher')
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(TEACHER_UID), eventPath),
        event(TEACHER_UID, 'student')
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asTeacher(TEACHER_UID), eventPath),
        event(TEACHER_UID, 'teacher')
      )
    );
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

describe('the /my-assignments run query', () => {
  // A list rule is proved against the query, not the returned documents, so
  // every assertSucceeds here runs against a seeded matching doc: a query that
  // returns nothing is always allowed and would prove nothing.
  const byClass = (db: ReturnType<typeof asStudent>, classIds: string[]) =>
    getDocs(
      query(
        collection(db, 'project_runs'),
        where('classIds', 'array-contains-any', classIds)
      )
    );
  const byTeacher = (db: ReturnType<typeof asTeacher>, uid: string) =>
    getDocs(
      query(collection(db, 'project_runs'), where('teacherUid', '==', uid))
    );

  it('lets a student run the query the page issues', async () => {
    await seed();
    await assertSucceeds(
      byClass(asStudent(MEMBER_UID, [CLASS_ID]), [CLASS_ID])
    );
  });

  it('lets the teacher list her own runs', async () => {
    await seed();
    await assertSucceeds(byTeacher(asTeacher(TEACHER_UID), TEACHER_UID));
  });

  it('refuses an unfiltered listing to everyone', async () => {
    await seed();
    await assertFails(
      getDocs(collection(asStudent(MEMBER_UID, [CLASS_ID]), 'project_runs'))
    );
    await assertFails(
      getDocs(collection(asTeacher(TEACHER_UID), 'project_runs'))
    );
    await assertFails(
      getDocs(
        collection(testEnv.unauthenticatedContext().firestore(), 'project_runs')
      )
    );
  });

  it('refuses a class the student does not hold', async () => {
    await seed();
    await assertFails(
      byClass(asStudent(MEMBER_UID, [OTHER_CLASS_ID]), [CLASS_ID])
    );
  });

  it('refuses a teacher aiming the filter at a colleague', async () => {
    await seed();
    await assertFails(byTeacher(asTeacher(OTHER_TEACHER_UID), TEACHER_UID));
  });

  it('refuses the class shape to an anonymous caller', async () => {
    await seed();
    await assertFails(
      getDocs(
        query(
          collection(
            testEnv.unauthenticatedContext().firestore(),
            'project_runs'
          ),
          where('classIds', 'array-contains-any', [CLASS_ID])
        )
      )
    );
  });

  it('still hides an out-of-class run from a get', async () => {
    await seed();
    await assertFails(
      getDoc(
        doc(asStudent(OUTSIDER_UID, [OTHER_CLASS_ID]), 'project_runs', RUN_ID)
      )
    );
  });
});

describe('group uploads', () => {
  const UPLOAD_ID = 'upload-1';
  const uploadPath = `${GROUP_PATH}/uploads/${UPLOAD_ID}`;
  const storagePathFor = (groupId = 'group-1', uploadId = UPLOAD_ID) =>
    `project_uploads/${RUN_ID}/${groupId}/${uploadId}/poster.pdf`;

  const upload = (overrides: Record<string, unknown> = {}) => ({
    id: UPLOAD_ID,
    fileName: 'poster.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    uploadedByUid: MEMBER_UID,
    uploadedAt: 1,
    storagePath: storagePathFor(),
    archiveStatus: 'firebase',
    ...overrides,
  });

  const seedUpload = async (overrides: Record<string, unknown> = {}) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), uploadPath), upload(overrides));
    });
  };

  it('lets a member add a file to their own group', async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath), upload())
    );
  });

  it('refuses a classmate who is not in the group', async () => {
    await seed();
    await assertFails(
      setDoc(
        doc(asStudent(OUTSIDER_UID, [CLASS_ID]), uploadPath),
        upload({ uploadedByUid: OUTSIDER_UID })
      )
    );
  });

  it('refuses a storagePath belonging to another group', async () => {
    await seed();
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath), {
        ...upload(),
        storagePath: storagePathFor('group-2'),
      })
    );
  });

  it('refuses a storagePath that does not match the doc id', async () => {
    await seed();
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath), {
        ...upload(),
        storagePath: storagePathFor('group-1', 'upload-2'),
      })
    );
  });

  it('refuses a file that claims to be archived already', async () => {
    await seed();
    // Otherwise a member could skip the Drive pipeline and pin driveUrl
    // to anything they liked.
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath), {
        ...upload(),
        archiveStatus: 'archived',
        driveUrl: 'https://drive.google.com/file/d/evil/view',
      })
    );
  });

  it('refuses an upload attributed to someone else', async () => {
    await seed();
    await assertFails(
      setDoc(
        doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath),
        upload({ uploadedByUid: OUTSIDER_UID })
      )
    );
  });

  it('refuses a member once the run stops accepting updates', async () => {
    await seed({ acceptingUpdates: false });
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath), upload())
    );
    // The teacher is not subject to her own closed-to-students switch.
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), uploadPath), {
        ...upload(),
        uploadedByUid: TEACHER_UID,
      })
    );
  });

  it('is read by the group and the teacher, and by nobody else', async () => {
    await seed();
    await seedUpload();
    await assertSucceeds(
      getDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath))
    );
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), uploadPath)));
    // A classmate can see the group's progress bar but not its files.
    await assertFails(
      getDoc(doc(asStudent(OUTSIDER_UID, [CLASS_ID]), uploadPath))
    );
    await assertFails(getDoc(doc(asTeacher(OTHER_TEACHER_UID), uploadPath)));
  });

  it('refuses a listing to a classmate outside the group', async () => {
    await seed();
    await seedUpload();
    await assertSucceeds(
      getDocs(
        collection(asStudent(MEMBER_UID, [CLASS_ID]), `${GROUP_PATH}/uploads`)
      )
    );
    await assertFails(
      getDocs(
        collection(asStudent(OUTSIDER_UID, [CLASS_ID]), `${GROUP_PATH}/uploads`)
      )
    );
  });

  it('never lets a student move the archive fields', async () => {
    await seed();
    await seedUpload();
    // The trigger writes these as admin; a client that could would be able to
    // point driveUrl anywhere.
    await assertFails(
      updateDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath), {
        archiveStatus: 'archived',
        driveUrl: 'https://drive.google.com/file/d/evil/view',
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(TEACHER_UID), uploadPath), {
        archiveStatus: 'archived',
      })
    );
  });

  it('lets the group and the teacher take a file back down', async () => {
    await seed();
    await seedUpload();
    await assertFails(
      deleteDoc(doc(asStudent(OUTSIDER_UID, [CLASS_ID]), uploadPath))
    );
    await assertSucceeds(
      deleteDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), uploadPath))
    );
  });
});

describe('a deactivated teacher', () => {
  it('loses read and write on their own run, groups and grades', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_UID), GROUP_PATH)));

    await deactivateTeacher();
    await assertFails(
      getDoc(doc(asTeacher(TEACHER_UID), 'project_runs', RUN_ID))
    );
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

describe('the projects_widget rollout switch', () => {
  const path = 'admin_settings/projects_widget';

  it('is readable by any signed-in teacher and writable only by an admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), { enabled: true });
      await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {});
    });
    // The whole feature hangs off this read: deny it and every teacher who is
    // not an admin sees Projects switched off whatever the admin set.
    await assertSucceeds(getDoc(doc(asTeacher(OTHER_TEACHER_UID), path)));
    await assertSucceeds(getDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), path)));
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), path), { enabled: false })
    );
    await assertFails(
      setDoc(doc(asStudent(MEMBER_UID, [CLASS_ID]), path), { enabled: false })
    );
    await assertSucceeds(setDoc(doc(asAdmin(), path), { enabled: false }));
  });

  it('stays closed to a signed-out reader', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), { enabled: true });
    });
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), path))
    );
  });
});
