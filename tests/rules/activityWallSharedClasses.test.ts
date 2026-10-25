// Rules for one Activity Wall shared by two teachers' classes: a Synced colleague adds their
// class through saveSharedActivityWallV1 (Admin SDK), never by writing the owner's docs.
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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-aw-shared-classes';
const HOST_UID = 'host-uid';
const COLLAB_UID = 'collab-uid';
const VIEWER_UID = 'viewer-uid';
const ACTIVITY_ID = 'wall-1';
const SESSION_ID = `${HOST_UID}_${ACTIVITY_ID}`;
const SHARE_ID = 'share-1';
const LIBRARY_PATH = `users/${HOST_UID}/activity_wall_activities/${ACTIVITY_ID}`;

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

const asStudent = (uid: string, classIds: string[]) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const participant = (role: 'collaborator' | 'viewer') => ({
  role,
  name: 'Someone',
  joinedAt: 1_000_000,
});

// Both teachers' classes, as the callable leaves the session after the colleague adds theirs.
const sharedSession = {
  id: SESSION_ID,
  activityId: ACTIVITY_ID,
  teacherUid: HOST_UID,
  title: 'Exit ticket',
  prompt: 'What did you learn?',
  mode: 'text',
  layout: 'wall',
  moderationEnabled: false,
  identificationMode: 'name',
  allowGuests: false,
  acceptingResponses: true,
  studentsCanSeePosts: true,
  classIds: ['class-host', 'class-collab'],
  classId: 'class-host',
  updatedAt: 1_000_000,
};

const studentPost = (uid: string) => ({
  id: `${uid}__0`,
  activityId: ACTIVITY_ID,
  type: 'text',
  content: 'My answer',
  submittedAt: 1_000_000,
  status: 'approved',
  authorUid: uid,
  participantLabel: 'Ann',
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
    const db = ctx.firestore();
    await setDoc(doc(db, `shared_boards/${SHARE_ID}`), {
      originalAuthor: HOST_UID,
      intendedMode: 'synced',
      participants: {
        [COLLAB_UID]: participant('collaborator'),
        [VIEWER_UID]: participant('viewer'),
      },
    });
    await setDoc(
      doc(db, `activity_wall_sessions/${SESSION_ID}`),
      sharedSession
    );
    await setDoc(
      doc(db, `activity_wall_sessions/${SESSION_ID}/submissions/approved-1`),
      studentPost('someone')
    );
    await setDoc(doc(db, LIBRARY_PATH), {
      id: ACTIVITY_ID,
      title: 'Exit ticket',
    });
  });
});

describe("students from either teacher's class share one wall", () => {
  it("a student in the colleague's class posts and reads approved posts", async () => {
    const db = asStudent('stu-collab', ['class-collab']);
    await assertSucceeds(
      setDoc(
        doc(
          db,
          `activity_wall_sessions/${SESSION_ID}/submissions/stu-collab__0`
        ),
        studentPost('stu-collab')
      )
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `activity_wall_sessions/${SESSION_ID}/submissions`),
          where('status', '==', 'approved')
        )
      )
    );
  });

  it("the wall lists in the colleague's students' assignments", async () => {
    const db = asStudent('stu-collab', ['class-collab']);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'activity_wall_sessions'),
          where('classIds', 'array-contains-any', ['class-collab'])
        )
      )
    );
  });

  it('a student in neither class can neither post nor read', async () => {
    const db = asStudent('stu-other', ['class-other']);
    await assertFails(
      setDoc(
        doc(
          db,
          `activity_wall_sessions/${SESSION_ID}/submissions/stu-other__0`
        ),
        studentPost('stu-other')
      )
    );
    await assertFails(
      getDocs(
        query(
          collection(db, `activity_wall_sessions/${SESSION_ID}/submissions`),
          where('status', '==', 'approved')
        )
      )
    );
  });
});

describe("colleagues change the owner's wall only through the server", () => {
  it('a collaborator cannot write the session classes or setup directly', async () => {
    const db = asTeacher(COLLAB_UID);
    await assertFails(
      updateDoc(doc(db, `activity_wall_sessions/${SESSION_ID}`), {
        classIds: ['class-host', 'class-collab', 'class-x'],
      })
    );
    await assertFails(
      updateDoc(doc(db, `activity_wall_sessions/${SESSION_ID}`), {
        title: 'Renamed',
      })
    );
  });

  it("collaborators and viewers can't read or write the owner's library", async () => {
    for (const uid of [COLLAB_UID, VIEWER_UID]) {
      const db = asTeacher(uid);
      await assertFails(getDoc(doc(db, LIBRARY_PATH)));
      await assertFails(
        setDoc(doc(db, LIBRARY_PATH), { id: ACTIVITY_ID, title: 'Renamed' })
      );
    }
    await assertSucceeds(getDoc(doc(asTeacher(HOST_UID), LIBRARY_PATH)));
  });
});

describe('a session names its own teacher', () => {
  it("a teacher can't plant a wall in a colleague's library list", async () => {
    const db = asTeacher(COLLAB_UID);
    await assertFails(
      setDoc(doc(db, `activity_wall_sessions/${COLLAB_UID}_planted`), {
        ...sharedSession,
        id: `${COLLAB_UID}_planted`,
        teacherUid: HOST_UID,
      })
    );
    await assertSucceeds(
      setDoc(doc(db, `activity_wall_sessions/${COLLAB_UID}_own`), {
        ...sharedSession,
        id: `${COLLAB_UID}_own`,
        teacherUid: COLLAB_UID,
      })
    );
  });

  it('the owner still updates and lists their own session', async () => {
    const db = asTeacher(HOST_UID);
    await assertSucceeds(
      updateDoc(doc(db, `activity_wall_sessions/${SESSION_ID}`), {
        title: 'Renamed',
      })
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'activity_wall_sessions'),
          where('teacherUid', '==', HOST_UID)
        )
      )
    );
  });
});
