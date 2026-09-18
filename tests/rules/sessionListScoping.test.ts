// Firestore security-rules tests for `allow list` scoping on the session
// collections. Requires a running Firestore emulator; invoke via
// `pnpm run test:rules`.
//
// These four collections previously shipped `allow read: if request.auth != null`,
// which folds `get` and `list` together and let ANY signed-in caller — including
// an anonymous PIN student — enumerate every teacher's sessions. `get` stays
// permissive (join-by-id and pointer hydration depend on it); `list` is now
// scoped by sessionListScoped().
//
// A `list` rule is evaluated ONCE against the query with an EMPTY resource, so
// these tests exercise the REAL client query shapes rather than asserting on
// documents. A query that matches nothing is always allowed, so every
// assertSucceeds below runs against a seeded matching document.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  setDoc,
  getDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-session-list-scoping';

const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const STUDENT_UID = 'student-uid-1';
const ANON_UID = 'anon-pin-uid';
const CLASS_A = 'class-A';
const CLASS_Z = 'class-Z';

// The four collections this PR scopes. quiz_sessions is deliberately excluded:
// its PIN join flow lists by join code, which a list rule cannot prove.
const SCOPED_COLLECTIONS = [
  'video_activity_sessions',
  'guided_learning_sessions',
  'mini_app_sessions',
  'activity_wall_sessions',
] as const;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Every context spells out the full claim surface the rules may touch — the
// emulator does not auto-populate claims and a direct read of a missing one
// throws. `asAnonStudent` deliberately omits them all, reproducing a real
// production anonymous token.
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext(OTHER_TEACHER_UID, {
      email: 'other@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
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

beforeAll(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const col of SCOPED_COLLECTIONS) {
      // Post-5A doc: targets classes via the `classIds` list.
      await setDoc(doc(db, col, 'session-list-shape'), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_A],
        activityId: 'activity-1',
        appId: 'app-1',
        status: 'active',
        createdAt: 1,
        endedAt: 10,
      });
      // Pre-5A doc: targets a single class via the legacy `classId` field.
      await setDoc(doc(db, col, 'session-single-shape'), {
        teacherUid: TEACHER_UID,
        classId: CLASS_A,
        activityId: 'activity-1',
        appId: 'app-1',
        status: 'active',
        createdAt: 2,
        endedAt: 11,
      });
      // Another teacher's session, targeting a class the student is not in.
      await setDoc(doc(db, col, 'session-foreign'), {
        teacherUid: OTHER_TEACHER_UID,
        classIds: [CLASS_Z],
        classId: CLASS_Z,
        activityId: 'activity-2',
        appId: 'app-2',
        status: 'active',
        createdAt: 3,
        endedAt: 12,
      });
      // Ended session, for the My Assignments "Completed" channel.
      await setDoc(doc(db, col, 'session-ended'), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_A],
        status: 'ended',
        createdAt: 4,
        endedAt: 13,
      });
    }
  });
});

describe.each(SCOPED_COLLECTIONS)('%s list scoping', (col) => {
  // ---- The hole this PR closes -------------------------------------------

  it('denies an unfiltered list to a studentRole user', async () => {
    await assertFails(getDocs(collection(asStudent(), col)));
  });

  it('denies an unfiltered list to an anonymous PIN student', async () => {
    await assertFails(getDocs(collection(asAnonStudent(), col)));
  });

  it('denies an unfiltered list to a signed-in teacher', async () => {
    await assertFails(getDocs(collection(asTeacher(), col)));
  });

  it("denies a teacher listing another teacher's sessions", async () => {
    await assertFails(
      getDocs(
        query(
          collection(asTeacher(), col),
          where('teacherUid', '==', OTHER_TEACHER_UID)
        )
      )
    );
  });

  it('denies a studentRole user listing a class they do not hold', async () => {
    await assertFails(
      getDocs(
        query(
          collection(asStudent(), col),
          where('classIds', 'array-contains-any', [CLASS_Z])
        )
      )
    );
  });

  it('denies an anonymous PIN student the class-scoped list shape', async () => {
    await assertFails(
      getDocs(
        query(
          collection(asAnonStudent(), col),
          where('classIds', 'array-contains-any', [CLASS_A])
        )
      )
    );
  });

  // ---- The real client queries that must keep working ---------------------

  it('allows the My Assignments classIds query (useStudentAssignments list shape)', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudent(), col),
          where('classIds', 'array-contains-any', [CLASS_A])
        )
      )
    );
  });

  it('allows the My Assignments legacy classId query (single shape)', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(asStudent(), col), where('classId', 'in', [CLASS_A]))
      )
    );
  });

  it('allows the class query with a server-side status filter', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudent(), col),
          where('classIds', 'array-contains-any', [CLASS_A]),
          where('status', '==', 'active')
        )
      )
    );
  });

  it('allows the Completed channel query (status + orderBy endedAt + limit)', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudent(), col),
          where('classIds', 'array-contains-any', [CLASS_A]),
          where('status', '==', 'ended'),
          orderBy('endedAt', 'desc'),
          limit(50)
        )
      )
    );
  });

  it('allows a teacher to list their own sessions by teacherUid', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), col),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
  });

  // ---- `get` stays permissive --------------------------------------------

  it('still allows get by id for an anonymous PIN student', async () => {
    await assertSucceeds(getDoc(doc(asAnonStudent(), col, 'session-foreign')));
  });

  it('still allows get by id for a studentRole user outside the class', async () => {
    await assertSucceeds(getDoc(doc(asStudent(), col, 'session-foreign')));
  });
});

// ---- Widget-specific teacher queries -------------------------------------

describe('widget teacher list queries', () => {
  it('allows the MiniApp widget session query (appId + teacherUid + createdAt)', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), 'mini_app_sessions'),
          where('appId', '==', 'app-1'),
          where('teacherUid', '==', TEACHER_UID),
          orderBy('createdAt', 'desc')
        )
      )
    );
  });

  it('allows the Video Activity session query (activityId + teacherUid + createdAt)', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), 'video_activity_sessions'),
          where('activityId', '==', 'activity-1'),
          where('teacherUid', '==', TEACHER_UID),
          orderBy('createdAt', 'desc')
        )
      )
    );
  });

  it('allows the Activity Wall legacy-migration recovery query (teacherUid)', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), 'activity_wall_sessions'),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
  });

  it('denies the same Activity Wall query aimed at another teacher', async () => {
    await assertFails(
      getDocs(
        query(
          collection(asOtherTeacher(), 'activity_wall_sessions'),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
  });
});

// ---- quiz_sessions is deliberately still permissive ----------------------

describe('quiz_sessions (intentionally unscoped)', () => {
  it('still allows the anonymous PIN join code lookup', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quiz_sessions', 'quiz-1'), {
        teacherUid: TEACHER_UID,
        code: 'ABC123',
        status: 'active',
      });
    });
    await assertSucceeds(
      getDocs(
        query(
          collection(asAnonStudent(), 'quiz_sessions'),
          where('code', '==', 'ABC123')
        )
      )
    );
  });
});
