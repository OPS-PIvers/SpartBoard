// Security batch 2B: who may publish to /subs, who may use collection links, and when a sub loses a launched run.
// Requires a running Firestore emulator: `pnpm run test:rules`.

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
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { seedDistrictStaff, STUDENT_GOOGLE_EMAIL } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-security-batch-2b';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const TEACHER_UID = 'teacher-uid';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
const SUB_UID = 'sub-uid';
const SUB_EMAIL = 'sub@orono.k12.mn.us';
const STUDENT_UID = 'student-google-uid';
const HOUR = 60 * 60 * 1000;

let testEnv: RulesTestEnvironment;
type Db = ReturnType<
  ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']
>;

const google = (uid: string, email: string): Db =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () => google(TEACHER_UID, TEACHER_EMAIL);
const asSub = () => google(SUB_UID, SUB_EMAIL);
// A student who signs in with Google directly: district address, no staff member doc.
const asStudentGoogle = () => google(STUDENT_UID, STUDENT_GOOGLE_EMAIL);
const asStudentRole = () =>
  testEnv
    .authenticatedContext('student-role-uid', {
      email: 'student-role-uid@orono.k12.mn.us',
      email_verified: true,
      studentRole: true,
      classIds: ['c1'],
    })
    .firestore();
const asAnon = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

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
    await seedDistrictStaff(ctx.firestore(), [TEACHER_EMAIL, SUB_EMAIL]);
  });
});

const subBoardShare = (uid: string, extra: Record<string, unknown> = {}) => ({
  originalAuthor: uid,
  originalAuthorName: 'Ms. Rivera',
  intendedMode: 'substitute',
  buildingId: 'schumann',
  expiresAt: Date.now() + 24 * HOUR,
  initialState: [],
  widgets: [],
  participants: {},
  ...extra,
});

const subCollectionShare = (
  uid: string,
  extra: Record<string, unknown> = {}
) => ({
  hostUid: uid,
  hostDisplayName: 'Ms. Rivera',
  intendedMode: 'substitute',
  buildingId: 'schumann',
  expiresAt: Date.now() + 24 * HOUR,
  boardIds: ['b1'],
  collection: { name: 'Monday plans' },
  ...extra,
});

describe('/subs portal: only staff publish substitute shares', () => {
  const nonStaff: [string, () => Db, string][] = [
    ['an anonymous session', asAnon, 'anon-uid'],
    ['a student-role session', asStudentRole, 'student-role-uid'],
    ['a student Google session', asStudentGoogle, STUDENT_UID],
  ];

  for (const [who, as, uid] of nonStaff) {
    it(`${who} cannot publish a board share to /subs`, async () => {
      await assertFails(
        setDoc(doc(as(), 'shared_boards/forged'), subBoardShare(uid))
      );
    });
    it(`${who} cannot publish a collection share to /subs`, async () => {
      await assertFails(
        setDoc(doc(as(), 'shared_collections/forged'), subCollectionShare(uid))
      );
    });
  }

  it('a non-staff session can still make an ordinary board share', async () => {
    await assertSucceeds(
      setDoc(doc(asStudentGoogle(), 'shared_boards/plain'), {
        originalAuthor: STUDENT_UID,
        widgets: [],
        participants: {},
      })
    );
  });

  it('a teacher publishes board and collection shares, and a sub reads them', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'shared_boards/b'), subBoardShare(TEACHER_UID))
    );
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), 'shared_collections/c'),
        subCollectionShare(TEACHER_UID)
      )
    );
    await assertSucceeds(getDoc(doc(asSub(), 'shared_boards/b')));
    await assertSucceeds(getDoc(doc(asSub(), 'shared_collections/c')));
  });

  it('a share without a teacher name, or with a null one, is accepted', async () => {
    const { originalAuthorName: _n, ...board } = subBoardShare(TEACHER_UID);
    await assertSucceeds(setDoc(doc(asTeacher(), 'shared_boards/b'), board));
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), 'shared_collections/c'),
        subCollectionShare(TEACHER_UID, { hostDisplayName: null })
      )
    );
  });

  it('the teacher name shown to subs is bounded', async () => {
    const long = 'x'.repeat(101);
    await assertFails(
      setDoc(
        doc(asTeacher(), 'shared_boards/b'),
        subBoardShare(TEACHER_UID, { originalAuthorName: long })
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(), 'shared_collections/c'),
        subCollectionShare(TEACHER_UID, { hostDisplayName: long })
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(), 'shared_collections/c2'),
        subCollectionShare(TEACHER_UID, { hostDisplayName: 7 })
      )
    );
  });

  it('the host cannot rename themselves on a live substitute board share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'shared_boards/b'),
        subBoardShare(TEACHER_UID)
      );
    });
    await assertFails(
      updateDoc(doc(asTeacher(), 'shared_boards/b'), {
        originalAuthorName: 'Principal',
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), 'shared_boards/b'), { name: 'Monday' })
    );
  });
});

describe('collection links and board self-join need a staff account', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'linked_collections/link'), {
        hostUid: TEACHER_UID,
        mode: 'synced',
        name: 'Unit 3',
        boards: [{ shareId: 'board', name: 'Day 1', order: 0 }],
        participants: {},
        createdAt: 1000,
        updatedAt: 1000,
        updatedBy: TEACHER_UID,
        ended: false,
      });
      await setDoc(doc(db, 'shared_boards/board'), {
        originalAuthor: TEACHER_UID,
        intendedMode: 'synced',
        linkedCollectionId: 'link',
        widgets: [],
        participants: {},
      });
    });
  });

  const join = (uid: string) => ({
    [`participants.${uid}`]: { role: 'collaborator', joinedAt: 2000 },
  });

  it('a student Google session cannot read or join the link', async () => {
    const db = asStudentGoogle();
    await assertFails(getDoc(doc(db, 'linked_collections/link')));
    await assertFails(
      updateDoc(doc(db, 'linked_collections/link'), join(STUDENT_UID))
    );
  });

  it('a student Google session cannot self-join the board share', async () => {
    await assertFails(
      updateDoc(
        doc(asStudentGoogle(), 'shared_boards/board'),
        join(STUDENT_UID)
      )
    );
  });

  it('a student Google session cannot create a link', async () => {
    await assertFails(
      setDoc(doc(asStudentGoogle(), 'linked_collections/mine'), {
        hostUid: STUDENT_UID,
        mode: 'synced',
        name: 'Mine',
        boards: [],
        participants: {},
        ended: false,
      })
    );
  });

  it('a student who already joined loses collaborator edits on the link', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(
        doc(ctx.firestore(), 'linked_collections/link'),
        join(STUDENT_UID)
      );
    });
    await assertFails(
      updateDoc(doc(asStudentGoogle(), 'linked_collections/link'), {
        name: 'Gone',
        updatedBy: STUDENT_UID,
      })
    );
    // Leaving is still allowed.
    await assertSucceeds(
      updateDoc(doc(asStudentGoogle(), 'linked_collections/link'), {
        [`participants.${STUDENT_UID}`]: deleteField(),
      })
    );
  });

  it('a student who already joined a board loses collaborator edits and item copies', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(
        doc(ctx.firestore(), 'shared_boards/board'),
        join(STUDENT_UID)
      );
      await setDoc(doc(ctx.firestore(), `users/${STUDENT_UID}/quizzes/q1`), {
        title: 'Mine',
      });
    });
    const db = asStudentGoogle();
    await assertFails(
      updateDoc(doc(db, 'shared_boards/board'), { name: 'Defaced' })
    );
    await assertFails(
      setDoc(doc(db, `shared_boards/board/items/quiz_${STUDENT_UID}_q1`), {
        kind: 'quiz',
        itemId: 'q1',
        ownerUid: STUDENT_UID,
        title: 'Mine',
        version: '1',
        publishedAt: 1,
        payload: {},
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'shared_boards/board'), {
        [`participants.${STUDENT_UID}`]: deleteField(),
      })
    );
  });

  it('a staff teacher reads and joins the link and the board, then edits', async () => {
    const db = asSub();
    await assertSucceeds(getDoc(doc(db, 'linked_collections/link')));
    await assertSucceeds(
      updateDoc(doc(db, 'linked_collections/link'), {
        [`participants.${SUB_UID}`]: {
          role: 'collaborator',
          name: 'Sub',
          joinedAt: 2000,
        },
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'shared_boards/board'), join(SUB_UID))
    );
    await assertSucceeds(
      updateDoc(doc(db, 'linked_collections/link'), {
        name: 'Unit 3 review',
        updatedBy: SUB_UID,
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'shared_boards/board'), { name: 'Day 1 review' })
    );
  });
});

describe('a sub loses a launched run when the share stops naming them', () => {
  const SESSION = 'quiz_sessions/run';
  const RESPONSE = `${SESSION}/responses/kid`;
  const VA_KEY = 'video_activity_sessions/run/key/answers';

  async function seed(share: Record<string, unknown> | null, on = true) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const stamp = {
        teacherUid: TEACHER_UID,
        status: 'active',
        classIds: [],
        launchedBy: { uid: SUB_UID, email: SUB_EMAIL, shareId: 'share' },
        subMonitorUids: [SUB_UID],
        subMonitorUntil: Date.now() + 24 * HOUR,
      };
      await setDoc(doc(db, SESSION), { ...stamp, quizId: 'q1' });
      await setDoc(doc(db, RESPONSE), { studentUid: 'kid', score: 3 });
      await setDoc(doc(db, 'video_activity_sessions/run'), {
        ...stamp,
        activityId: 'va1',
      });
      await setDoc(doc(db, VA_KEY), { questions: [] });
      await setDoc(doc(db, 'admin_settings/sub_launch_as_teacher'), {
        enabled: on,
      });
      if (share) {
        await setDoc(doc(db, 'shared_collections/share'), {
          hostUid: TEACHER_UID,
          intendedMode: 'substitute',
          expiresAt: Date.now() + 24 * HOUR,
          subEmails: [SUB_EMAIL],
          ...share,
        });
      }
    });
  }

  const reads = [
    () => getDoc(doc(asSub(), RESPONSE)),
    () => getDoc(doc(asSub(), VA_KEY)),
  ];

  it('the sub reads the run while the share is live', async () => {
    await seed({});
    for (const r of reads) await assertSucceeds(r());
  });

  it('the teacher still reads the run after the share ends', async () => {
    await seed({ expiresAt: Date.now() - HOUR });
    await assertSucceeds(getDoc(doc(asTeacher(), RESPONSE)));
  });

  it('denied once the host ends the share early', async () => {
    await seed({ expiresAt: Date.now() - HOUR });
    for (const r of reads) await assertFails(r());
  });

  it('denied once the host removes the sub', async () => {
    await seed({ subEmails: ['other.sub@orono.k12.mn.us'] });
    for (const r of reads) await assertFails(r());
  });

  it('denied once the share is deleted', async () => {
    await seed({});
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'shared_collections/share'));
    });
    for (const r of reads) await assertFails(r());
  });

  it('denied once an admin turns the switch off', async () => {
    await seed({}, false);
    for (const r of reads) await assertFails(r());
  });
});
