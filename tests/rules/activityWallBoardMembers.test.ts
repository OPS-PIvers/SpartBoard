// Rules for board members reading an Activity Wall on a Synced or View-Only board:
// the wall owner lists the board's /shared_boards id in `boardAccess/boards`, and members
// of that share may read the wall's approved posts, nothing else.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

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
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-aw-board-members';
const HOST_UID = 'host-uid';
const COLLAB_UID = 'collab-uid';
const VIEWER_UID = 'viewer-uid';
const OUTSIDER_UID = 'outsider-uid';
const STUDENT_UID = 'student-uid';
const ACTIVITY_ID = 'wall-1';
const HOST_SESSION = `${HOST_UID}_${ACTIVITY_ID}`;
const COLLAB_SESSION = `${COLLAB_UID}_${ACTIVITY_ID}`;
const SHARE_ID = 'share-1';
const OTHER_SHARE_ID = 'share-2';

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

const asStudentRole = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnonymous = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const participant = (role: 'collaborator' | 'viewer') => ({
  role,
  name: 'Someone',
  joinedAt: 1_000_000,
});

const session = (ownerUid: string, boardShareIds?: unknown) => ({
  id: `${ownerUid}_${ACTIVITY_ID}`,
  activityId: ACTIVITY_ID,
  teacherUid: ownerUid,
  title: 'Exit ticket',
  prompt: 'What did you learn?',
  mode: 'text',
  layout: 'grid',
  moderationEnabled: true,
  identificationMode: 'name',
  allowGuests: false,
  updatedAt: 1_000_000,
  ...(boardShareIds === undefined ? {} : { __boardShareIds: boardShareIds }),
});

const post = (status: 'approved' | 'pending') => ({
  type: 'text',
  content: 'A student answer',
  submittedAt: 1_000_000,
  status,
  authorUid: 'author-uid',
  participantLabel: 'Ann',
});

const seed = async (
  sessions: Record<string, Record<string, unknown>>,
  shares: Record<string, Record<string, unknown>> = {
    [SHARE_ID]: {
      originalAuthor: HOST_UID,
      intendedMode: 'synced',
      participants: {
        [COLLAB_UID]: participant('collaborator'),
        [VIEWER_UID]: participant('viewer'),
        [STUDENT_UID]: participant('viewer'),
        'anon-uid': participant('viewer'),
      },
    },
    [OTHER_SHARE_ID]: {
      originalAuthor: OUTSIDER_UID,
      intendedMode: 'synced',
      participants: { [VIEWER_UID]: participant('viewer') },
    },
  }
) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, data] of Object.entries(shares)) {
      await setDoc(doc(db, `shared_boards/${id}`), data);
    }
    for (const [id, { __boardShareIds, ...data }] of Object.entries(sessions)) {
      await setDoc(doc(db, `activity_wall_sessions/${id}`), data);
      if (__boardShareIds !== undefined) {
        await setDoc(
          doc(db, `activity_wall_sessions/${id}/boardAccess/boards`),
          {
            boardShareIds: __boardShareIds,
          }
        );
      }
      await setDoc(
        doc(db, `activity_wall_sessions/${id}/submissions/approved-1`),
        post('approved')
      );
      await setDoc(
        doc(db, `activity_wall_sessions/${id}/submissions/pending-1`),
        post('pending')
      );
    }
  });
};

const approvedQuery = (db: ReturnType<typeof asTeacher>, sessionId: string) =>
  getDocs(
    query(
      collection(db, `activity_wall_sessions/${sessionId}/submissions`),
      where('status', '==', 'approved')
    )
  );

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

describe('board members read the owner wall', () => {
  it('a viewer and a collaborator read approved posts by get and query', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    for (const uid of [VIEWER_UID, COLLAB_UID]) {
      const db = asTeacher(uid);
      await assertSucceeds(
        getDoc(
          doc(
            db,
            `activity_wall_sessions/${HOST_SESSION}/submissions/approved-1`
          )
        )
      );
      await assertSucceeds(approvedQuery(db, HOST_SESSION));
    }
  });

  it('pending posts stay hidden from members', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    const db = asTeacher(VIEWER_UID);
    await assertFails(
      getDoc(
        doc(db, `activity_wall_sessions/${HOST_SESSION}/submissions/pending-1`)
      )
    );
    await assertFails(
      getDocs(
        collection(db, `activity_wall_sessions/${HOST_SESSION}/submissions`)
      )
    );
  });

  it('the host reads a collaborator wall on their own board', async () => {
    await seed({ [COLLAB_SESSION]: session(COLLAB_UID, [SHARE_ID]) });
    await assertSucceeds(approvedQuery(asTeacher(HOST_UID), COLLAB_SESSION));
  });

  it('a teacher outside the share cannot read', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await assertFails(approvedQuery(asTeacher(OUTSIDER_UID), HOST_SESSION));
  });

  it('nobody reads until the owner lists the share', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID) });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('access ends when the share is deleted', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `shared_boards/${SHARE_ID}`));
    });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('access ends when the member leaves the share', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await assertSucceeds(
      updateDoc(doc(asTeacher(VIEWER_UID), `shared_boards/${SHARE_ID}`), {
        [`participants.${VIEWER_UID}`]: deleteField(),
      })
    );
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('listing a share the owner does not belong to grants nothing', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [OTHER_SHARE_ID]) });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('checks every listed share up to three', async () => {
    await seed({
      [HOST_SESSION]: session(HOST_UID, ['gone-a', 'gone-b', SHARE_ID]),
    });
    await assertSucceeds(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('a list longer than three grants nothing', async () => {
    await seed({
      [HOST_SESSION]: session(HOST_UID, [SHARE_ID, 'a', 'b', 'c']),
    });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('student and anonymous members cannot read', async () => {
    // Posts hidden from students, so only the board-member branch could admit them.
    await seed({
      [HOST_SESSION]: {
        ...session(HOST_UID, [SHARE_ID]),
        studentsCanSeePosts: false,
      },
    });
    await assertSucceeds(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
    await assertFails(
      getDoc(
        doc(
          asStudentRole(STUDENT_UID),
          `activity_wall_sessions/${HOST_SESSION}/submissions/approved-1`
        )
      )
    );
    await assertFails(approvedQuery(asAnonymous('anon-uid'), HOST_SESSION));
  });
});

describe('board members cannot write the owner wall', () => {
  it('a collaborator cannot edit, approve or delete posts', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    const db = asTeacher(COLLAB_UID);
    await assertFails(
      updateDoc(
        doc(db, `activity_wall_sessions/${HOST_SESSION}/submissions/pending-1`),
        { status: 'approved' }
      )
    );
    await assertFails(
      deleteDoc(
        doc(db, `activity_wall_sessions/${HOST_SESSION}/submissions/approved-1`)
      )
    );
  });

  it('a collaborator cannot post to a wall that takes only students', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await assertFails(
      setDoc(
        doc(
          asTeacher(COLLAB_UID),
          `activity_wall_sessions/${HOST_SESSION}/submissions/new-1`
        ),
        { ...post('approved'), authorUid: COLLAB_UID }
      )
    );
  });

  it('only the owner can change the board access list', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, []) });
    const path = `activity_wall_sessions/${HOST_SESSION}/boardAccess/boards`;
    await assertFails(
      setDoc(doc(asTeacher(VIEWER_UID), path), { boardShareIds: [SHARE_ID] })
    );
    await assertFails(
      setDoc(
        doc(
          asTeacher(HOST_UID),
          `activity_wall_sessions/${HOST_SESSION}/boardAccess/other`
        ),
        {
          boardShareIds: [SHARE_ID],
        }
      )
    );
    await assertSucceeds(
      setDoc(doc(asTeacher(HOST_UID), path), { boardShareIds: [SHARE_ID] })
    );
  });
});

describe('the board access list stays private', () => {
  const path = `activity_wall_sessions/${HOST_SESSION}/boardAccess/boards`;

  it('the owner and board members read it', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await assertSucceeds(getDoc(doc(asTeacher(HOST_UID), path)));
    await assertSucceeds(getDoc(doc(asTeacher(VIEWER_UID), path)));
  });

  it('students, guests and outsiders cannot read it', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await assertFails(getDoc(doc(asStudentRole('class-student'), path)));
    await assertFails(getDoc(doc(asAnonymous('guest-uid'), path)));
    await assertFails(getDoc(doc(asTeacher(OUTSIDER_UID), path)));
  });

  it('the session doc students read carries no share ids', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    const snap = await getDoc(
      doc(
        asStudentRole('class-student'),
        `activity_wall_sessions/${HOST_SESSION}`
      )
    );
    expect(JSON.stringify(snap.data())).not.toContain(SHARE_ID);
  });
});

describe('only teachers can self-join a board share', () => {
  const join = (db: ReturnType<typeof asTeacher>, uid: string) =>
    updateDoc(doc(db, `shared_boards/${SHARE_ID}`), {
      [`participants.${uid}`]: participant('collaborator'),
    });

  it('a teacher can join, a student or guest cannot', async () => {
    await seed({});
    await assertSucceeds(join(asTeacher('new-teacher'), 'new-teacher'));
    await assertFails(join(asStudentRole('class-student'), 'class-student'));
    await assertFails(join(asAnonymous('guest-uid'), 'guest-uid'));
  });
});
