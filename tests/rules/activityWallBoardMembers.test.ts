// Rules for board members on an Activity Wall shown on a Synced or View-Only board:
// the wall owner lists the board's share as "shareId/hostUid" in `boardAccess/boards`; verified
// district members of that share read approved posts, and the host and collaborators
// also moderate and post.
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
// What the owner's client writes: the share id pinned to its host.
const ENTRY = `${SHARE_ID}/${HOST_UID}`;
const OTHER_ENTRY = `${OTHER_SHARE_ID}/${OUTSIDER_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asOutsideAccount = (uid: string, email: string, verified = true) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: verified,
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
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
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
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
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
    await seed({ [COLLAB_SESSION]: session(COLLAB_UID, [ENTRY]) });
    await assertSucceeds(approvedQuery(asTeacher(HOST_UID), COLLAB_SESSION));
  });

  it('a teacher outside the share cannot read', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(approvedQuery(asTeacher(OUTSIDER_UID), HOST_SESSION));
  });

  it('nobody reads until the owner lists the share', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID) });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('access ends when the share is deleted', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `shared_boards/${SHARE_ID}`));
    });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('access ends when the member leaves the share', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertSucceeds(
      updateDoc(doc(asTeacher(VIEWER_UID), `shared_boards/${SHARE_ID}`), {
        [`participants.${VIEWER_UID}`]: deleteField(),
      })
    );
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('listing a share the owner does not belong to grants nothing', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [OTHER_ENTRY]) });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('checks every listed share up to three', async () => {
    await seed({
      [HOST_SESSION]: session(HOST_UID, ['gone-a/x', 'gone-b/y', ENTRY]),
    });
    await assertSucceeds(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('a list longer than three grants nothing', async () => {
    await seed({
      [HOST_SESSION]: session(HOST_UID, [ENTRY, 'a/x', 'b/x', 'c/x']),
    });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('student and anonymous members cannot read', async () => {
    // Posts hidden from students, so only the board-member branch could admit them.
    await seed({
      [HOST_SESSION]: {
        ...session(HOST_UID, [ENTRY]),
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

describe('district accounts only', () => {
  it('a member signed in with a non-district account cannot read', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(
      approvedQuery(
        asOutsideAccount('gmail-uid', 'someone@gmail.com'),
        HOST_SESSION
      )
    );
  });

  it('an unverified district address cannot read or moderate', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    const db = asOutsideAccount(
      'unverified-uid',
      'unverified-uid@orono.k12.mn.us',
      false
    );
    await assertFails(approvedQuery(db, HOST_SESSION));
    await assertFails(
      updateDoc(
        doc(db, `activity_wall_sessions/${HOST_SESSION}/submissions/pending-1`),
        { status: 'approved' }
      )
    );
  });
});

const submissionRef = (
  db: ReturnType<typeof asTeacher>,
  sessionId: string,
  id: string
) => doc(db, `activity_wall_sessions/${sessionId}/submissions/${id}`);

const teacherPost = (uid: string) => ({
  id: 'new-1',
  type: 'text',
  content: 'A teacher note',
  submittedAt: 1_000_000,
  status: 'approved',
  authorUid: uid,
  authorRole: 'teacher',
  participantLabel: 'Ms. Co',
});

describe('collaborators moderate the owner wall', () => {
  it('a collaborator reads pending posts by get and unfiltered query', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    const db = asTeacher(COLLAB_UID);
    await assertSucceeds(getDoc(submissionRef(db, HOST_SESSION, 'pending-1')));
    await assertSucceeds(
      getDocs(
        collection(db, `activity_wall_sessions/${HOST_SESSION}/submissions`)
      )
    );
  });

  it('a collaborator approves, hides, pins, moves and edits posts', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    const db = asTeacher(COLLAB_UID);
    await assertSucceeds(
      updateDoc(submissionRef(db, HOST_SESSION, 'pending-1'), {
        status: 'approved',
      })
    );
    await assertSucceeds(
      updateDoc(submissionRef(db, HOST_SESSION, 'approved-1'), {
        status: 'pending',
      })
    );
    await assertSucceeds(
      updateDoc(submissionRef(db, HOST_SESSION, 'approved-1'), {
        pinned: true,
        sectionId: 'col-2',
        order: 3,
      })
    );
    await assertSucceeds(
      updateDoc(submissionRef(db, HOST_SESSION, 'approved-1'), {
        content: 'Fixed spelling',
        editedAt: 2_000_000,
      })
    );
  });

  it('a collaborator deletes a post', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertSucceeds(
      deleteDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'approved-1')
      )
    );
  });

  it('a collaborator posts as a teacher', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertSucceeds(
      setDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'new-1'),
        teacherPost(COLLAB_UID)
      )
    );
  });

  it('a teacher post must carry the poster as author', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(
      setDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'new-1'),
        teacherPost(HOST_UID)
      )
    );
  });

  it('the host moderates a collaborator wall on their own board', async () => {
    await seed({ [COLLAB_SESSION]: session(COLLAB_UID, [ENTRY]) });
    const db = asTeacher(HOST_UID);
    await assertSucceeds(
      getDoc(submissionRef(db, COLLAB_SESSION, 'pending-1'))
    );
    await assertSucceeds(
      updateDoc(submissionRef(db, COLLAB_SESSION, 'pending-1'), {
        status: 'approved',
      })
    );
  });

  it('a collaborator cannot touch archive or authorship fields', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    const db = asTeacher(COLLAB_UID);
    for (const patch of [
      { storagePath: `activity_wall_media/${HOST_SESSION}/x/evil.png` },
      { archiveStatus: 'firebase' },
      { driveUrl: 'https://example.com' },
      { authorUid: COLLAB_UID },
      { authorRole: 'teacher' },
      { type: 'link' },
    ]) {
      await assertFails(
        updateDoc(submissionRef(db, HOST_SESSION, 'approved-1'), patch)
      );
    }
  });

  it('a collaborator cannot repoint an upload post', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `activity_wall_sessions/${HOST_SESSION}/submissions/photo-1`
        ),
        { ...post('approved'), type: 'photo', content: 'https://drive/x' }
      );
    });
    const db = asTeacher(COLLAB_UID);
    await assertFails(
      updateDoc(submissionRef(db, HOST_SESSION, 'photo-1'), {
        content: 'https://evil.example/x.png',
      })
    );
    await assertSucceeds(
      updateDoc(submissionRef(db, HOST_SESSION, 'photo-1'), {
        title: 'A caption',
        editedAt: 2_000_000,
      })
    );
  });

  it('a collaborator cannot set an unknown status', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(
      updateDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'pending-1'),
        { status: 'featured' }
      )
    );
  });

  it('collaborating on another board does not reach this wall', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [OTHER_ENTRY]) });
    await assertFails(
      updateDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'pending-1'),
        { status: 'approved' }
      )
    );
  });
});

describe('review hardening', () => {
  it('a share re-created at a listed id by someone else grants nothing', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `shared_boards/${SHARE_ID}`));
    });
    const db = asTeacher(VIEWER_UID);
    await assertSucceeds(
      setDoc(doc(db, `shared_boards/${SHARE_ID}`), {
        originalAuthor: VIEWER_UID,
        intendedMode: 'synced',
        participants: { [HOST_UID]: participant('collaborator') },
      })
    );
    await assertFails(approvedQuery(db, HOST_SESSION));
    await assertFails(
      updateDoc(submissionRef(db, HOST_SESSION, 'pending-1'), {
        status: 'approved',
      })
    );
  });

  it('an entry without the host pin grants nothing', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [SHARE_ID]) });
    await assertFails(approvedQuery(asTeacher(VIEWER_UID), HOST_SESSION));
  });

  it('a collaborator on a View-Only share only reads', async () => {
    await seed(
      { [HOST_SESSION]: session(HOST_UID, [ENTRY]) },
      {
        [SHARE_ID]: {
          originalAuthor: HOST_UID,
          intendedMode: 'view-only',
          participants: { [COLLAB_UID]: participant('collaborator') },
        },
      }
    );
    const db = asTeacher(COLLAB_UID);
    await assertSucceeds(approvedQuery(db, HOST_SESSION));
    await assertFails(
      updateDoc(submissionRef(db, HOST_SESSION, 'pending-1'), {
        status: 'approved',
      })
    );
  });

  it('a content edit must be stamped', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(
      updateDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'approved-1'),
        { content: 'Silent rewrite' }
      )
    );
  });

  it('the edit stamp only moves forward and cannot be removed', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    const db = asTeacher(COLLAB_UID);
    const ref = submissionRef(db, HOST_SESSION, 'approved-1');
    await assertSucceeds(
      updateDoc(ref, { content: 'Fixed spelling', editedAt: 2_000_000 })
    );
    await assertFails(updateDoc(ref, { editedAt: deleteField() }));
    await assertFails(updateDoc(ref, { editedAt: 1_500_000 }));
    await assertFails(updateDoc(ref, { title: 'Unstamped title' }));
    await assertFails(updateDoc(ref, { label: 'Unstamped label' }));
    await assertSucceeds(
      updateDoc(ref, { title: 'Stamped title', editedAt: 3_000_000 })
    );
  });

  it("a collaborator cannot swap a link post's URL", async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `activity_wall_sessions/${HOST_SESSION}/submissions/link-1`
        ),
        { ...post('approved'), type: 'link', content: 'https://good.example' }
      );
    });
    await assertFails(
      updateDoc(submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'link-1'), {
        content: 'https://evil.example',
        editedAt: 2_000_000,
      })
    );
  });

  it('a collaborator cannot create an upload post', async () => {
    await seed({
      [HOST_SESSION]: {
        ...session(HOST_UID, [ENTRY]),
        allowedTypes: { photo: true, link: true, file: true, video: true },
      },
    });
    const db = asTeacher(COLLAB_UID);
    await assertFails(
      setDoc(submissionRef(db, HOST_SESSION, 'new-1'), {
        ...teacherPost(COLLAB_UID),
        type: 'photo',
        content: 'https://evil.example/x.png',
      })
    );
    await assertFails(
      setDoc(submissionRef(db, HOST_SESSION, 'new-1'), {
        ...teacherPost(COLLAB_UID),
        storagePath: `activity_wall_media/${HOST_SESSION}/new-1/x.png`,
      })
    );
    await assertSucceeds(
      setDoc(submissionRef(db, HOST_SESSION, 'new-1'), {
        ...teacherPost(COLLAB_UID),
        type: 'link',
        content: 'https://good.example',
      })
    );
  });

  it('stale listed shares do not block a guest editing or deleting their own post', async () => {
    await seed({
      [HOST_SESSION]: {
        ...session(HOST_UID, ['gone-a/x', 'gone-b/y', 'gone-c/z']),
        allowGuests: true,
        allowStudentEdit: true,
        allowStudentDelete: true,
        acceptingResponses: true,
      },
    });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `activity_wall_sessions/${HOST_SESSION}/submissions/own-1`
        ),
        { ...post('approved'), authorUid: OUTSIDER_UID }
      );
    });
    const db = asTeacher(OUTSIDER_UID);
    await assertSucceeds(
      updateDoc(submissionRef(db, HOST_SESSION, 'own-1'), {
        content: 'Edited by me',
        status: 'pending',
        editedAt: 2_000_000,
      })
    );
    await assertSucceeds(deleteDoc(submissionRef(db, HOST_SESSION, 'own-1')));
  });
});

describe('view-only members cannot write the owner wall', () => {
  it('a viewer cannot read pending posts', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(
      getDoc(submissionRef(asTeacher(VIEWER_UID), HOST_SESSION, 'pending-1'))
    );
  });

  it('a viewer cannot approve, edit, delete or post', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    const db = asTeacher(VIEWER_UID);
    await assertFails(
      updateDoc(submissionRef(db, HOST_SESSION, 'pending-1'), {
        status: 'approved',
      })
    );
    await assertFails(
      updateDoc(submissionRef(db, HOST_SESSION, 'approved-1'), {
        pinned: true,
      })
    );
    await assertFails(deleteDoc(submissionRef(db, HOST_SESSION, 'approved-1')));
    await assertFails(
      setDoc(submissionRef(db, HOST_SESSION, 'new-1'), teacherPost(VIEWER_UID))
    );
  });

  it('a former collaborator loses moderation when they leave', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertSucceeds(
      updateDoc(doc(asTeacher(COLLAB_UID), `shared_boards/${SHARE_ID}`), {
        [`participants.${COLLAB_UID}`]: deleteField(),
      })
    );
    await assertFails(
      updateDoc(
        submissionRef(asTeacher(COLLAB_UID), HOST_SESSION, 'pending-1'),
        { status: 'approved' }
      )
    );
  });

  it('a student post on a student-only wall is still refused to a viewer', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(
      setDoc(submissionRef(asTeacher(VIEWER_UID), HOST_SESSION, 'new-1'), {
        ...post('approved'),
        authorUid: VIEWER_UID,
      })
    );
  });
  it('only the owner can change the board access list', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, []) });
    const path = `activity_wall_sessions/${HOST_SESSION}/boardAccess/boards`;
    await assertFails(
      setDoc(doc(asTeacher(VIEWER_UID), path), { boardShareIds: [ENTRY] })
    );
    await assertFails(
      setDoc(
        doc(
          asTeacher(HOST_UID),
          `activity_wall_sessions/${HOST_SESSION}/boardAccess/other`
        ),
        { boardShareIds: [ENTRY] }
      )
    );
    await assertSucceeds(
      setDoc(doc(asTeacher(HOST_UID), path), { boardShareIds: [ENTRY] })
    );
  });
});

describe('the board access list stays private', () => {
  const path = `activity_wall_sessions/${HOST_SESSION}/boardAccess/boards`;

  it('the owner and board members read it', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertSucceeds(getDoc(doc(asTeacher(HOST_UID), path)));
    await assertSucceeds(getDoc(doc(asTeacher(VIEWER_UID), path)));
  });

  it('students, guests and outsiders cannot read it', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
    await assertFails(getDoc(doc(asStudentRole('class-student'), path)));
    await assertFails(getDoc(doc(asAnonymous('guest-uid'), path)));
    await assertFails(getDoc(doc(asTeacher(OUTSIDER_UID), path)));
  });

  it('the session doc students read carries no share ids', async () => {
    await seed({ [HOST_SESSION]: session(HOST_UID, [ENTRY]) });
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
