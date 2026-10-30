// Firestore security-rules tests for the quiz join-code lookup collection.
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.
//
// `quiz_join_codes/{code}/sessions/{sessionId}` lets the PIN join resolve a code
// without listing `quiz_sessions` by `code` (a query a list rule can never prove
// was filtered). `quiz_join_codes/{code}` is the code's owner record: one owner per
// code, so no other account can register a session under a code someone holds.
//
// The caller these tests care about most is the ANONYMOUS student: K-2 students
// have no account, so the whole PIN path runs on an anonymous token carrying no
// claims at all. Every read they need is asserted end to end, and every write is
// asserted denied.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
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
  deleteDoc,
  updateDoc,
  collection,
  collectionGroup,
  doc,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-join-code-lookup';

const TEACHER_UID = 'teacher-uid-jc';
const OTHER_TEACHER_UID = 'teacher-uid-jc-2';
const STUDENT_UID = 'student-uid-jc';
const ANON_UID = 'anon-pin-uid-jc';

const CODE = 'ABC123';
const OTHER_CODE = 'ZZZ999';
const SESSION_ID = 'session-jc-1';
const OTHER_SESSION_ID = 'session-jc-2';

const POINTERS = 'sessions';
const COLLECTION = 'quiz_join_codes';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// A real production anonymous token carries no studentRole/classIds/email claim,
// so this context deliberately declares none.
const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const google = (uid: string, email: string) => () =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

// Staff = an active, non-student Orono member doc (seeded below).
const asTeacher = google(TEACHER_UID, 'teacher@school.edu');
const asOtherTeacher = google(OTHER_TEACHER_UID, 'other@school.edu');
// Students share the district domain, so a student signing in with Google looks
// like a teacher by token; only the member doc tells them apart.
const asGoogleStudent = google('google-student-uid', 'kid@school.edu');
const asNoMemberDoc = google('stranger-uid', 'stranger@school.edu');
const asInactiveTeacher = google('inactive-uid', 'gone@school.edu');

const pointer = (code: string, sessionId: string, teacherUid: string) => ({
  sessionId,
  teacherUid,
  createdAt: 1,
  code,
});

const pointerRef = (
  db: ReturnType<typeof asTeacher>,
  code: string,
  id: string
) => doc(db, COLLECTION, code, POINTERS, id);

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

  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const member = (email: string, data: Record<string, unknown>) =>
      setDoc(doc(db, 'organizations', 'orono', 'members', email), data);
    await member('teacher@school.edu', { roleId: 'teacher', status: 'active' });
    await member('other@school.edu', { roleId: 'teacher', status: 'active' });
    await member('kid@school.edu', { roleId: 'student', status: 'active' });
    await member('gone@school.edu', { roleId: 'teacher', status: 'inactive' });
    await setDoc(doc(db, COLLECTION, CODE), {
      teacherUid: TEACHER_UID,
      createdAt: 1,
    });
    await setDoc(doc(db, COLLECTION, OTHER_CODE), {
      teacherUid: OTHER_TEACHER_UID,
      createdAt: 1,
    });
    await setDoc(doc(db, COLLECTION, CODE, POINTERS, SESSION_ID), {
      sessionId: SESSION_ID,
      teacherUid: TEACHER_UID,
      createdAt: 1,
    });
    await setDoc(doc(db, COLLECTION, CODE, POINTERS, OTHER_SESSION_ID), {
      sessionId: OTHER_SESSION_ID,
      teacherUid: TEACHER_UID,
      createdAt: 2,
    });
    await setDoc(doc(db, COLLECTION, OTHER_CODE, POINTERS, 'session-jc-3'), {
      sessionId: 'session-jc-3',
      teacherUid: OTHER_TEACHER_UID,
      createdAt: 3,
    });
    // The session the pointer resolves to, so the join can be walked end to end.
    await setDoc(doc(db, 'quiz_sessions', SESSION_ID), {
      teacherUid: TEACHER_UID,
      code: CODE,
      status: 'active',
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('anonymous PIN student — the path that must keep working', () => {
  it('lists the pointers under a code, in the shape the client sends', async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(asAnonStudent(), COLLECTION, CODE, POINTERS),
          orderBy('createdAt', 'desc'),
          limit(10)
        )
      )
    );
    expect(snap.docs.map((d) => d.id)).toEqual([OTHER_SESSION_ID, SESSION_ID]);
  });

  it('lists the pointers with no orderBy or limit', async () => {
    await assertSucceeds(
      getDocs(collection(asAnonStudent(), COLLECTION, CODE, POINTERS))
    );
  });

  it('gets a single pointer by session id', async () => {
    await assertSucceeds(getDoc(pointerRef(asAnonStudent(), CODE, SESSION_ID)));
  });

  it('resolves the session the pointer names', async () => {
    const db = asAnonStudent();
    const snap = await assertSucceeds(
      getDocs(collection(db, COLLECTION, CODE, POINTERS))
    );
    const sessionId = snap.docs[0].data().sessionId as string;
    const session = await assertSucceeds(
      getDoc(doc(db, 'quiz_sessions', sessionId))
    );
    expect(session.exists()).toBe(true);
  });

  it('reads a code with no pointers as an empty list, not a denial', async () => {
    const snap = await assertSucceeds(
      getDocs(collection(asAnonStudent(), COLLECTION, 'NOSUCH', POINTERS))
    );
    expect(snap.empty).toBe(true);
  });
});

describe('an SSO student reaches the same lookup', () => {
  it('lists the pointers under a code', async () => {
    await assertSucceeds(
      getDocs(collection(asStudent(), COLLECTION, CODE, POINTERS))
    );
  });
});

describe('the lookup does not become a new enumeration hole', () => {
  it('denies listing every join code', async () => {
    await assertFails(getDocs(collection(asAnonStudent(), COLLECTION)));
  });

  // The owner record is what join filters by, so anyone holding the code reads it.
  it("lets an anonymous student read a code's owner record", async () => {
    const snap = await assertSucceeds(
      getDoc(doc(asAnonStudent(), COLLECTION, CODE))
    );
    expect(snap.data()?.teacherUid).toBe(TEACHER_UID);
  });

  // Nothing grants `sessions` under a recursive wildcard, so this is denied by
  // omission — asserted so a later `match /{path=**}/sessions/{id}` can't
  // silently turn every code into one query.
  it('denies a collectionGroup query across every code', async () => {
    await assertFails(getDocs(collectionGroup(asAnonStudent(), POINTERS)));
  });

  it('denies a teacher the collectionGroup query too', async () => {
    await assertFails(getDocs(collectionGroup(asTeacher(), POINTERS)));
  });
});

// Claim a fresh code and register a session under it, as createAssignment does.
const claimBatch = (
  db: ReturnType<typeof asTeacher>,
  uid: string,
  code: string,
  sessionId: string,
  withSession = true
) => {
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, code), { teacherUid: uid, createdAt: 10 });
  batch.set(pointerRef(db, code, sessionId), {
    sessionId,
    teacherUid: uid,
    createdAt: 10,
  });
  if (withSession) {
    batch.set(doc(db, 'quiz_sessions', sessionId), {
      teacherUid: uid,
      code,
      status: 'active',
    });
  }
  return batch.commit();
};

describe('a code has one owner', () => {
  it('lets a teacher claim a fresh code with its session and pointer', async () => {
    await assertSucceeds(
      claimBatch(asTeacher(), TEACHER_UID, 'NEWCODE', 'session-new')
    );
  });

  it('lets the owner register another session under a code they hold', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(pointerRef(db, CODE, 'session-again'), {
      sessionId: 'session-again',
      teacherUid: TEACHER_UID,
      createdAt: 20,
    });
    batch.set(doc(db, 'quiz_sessions', 'session-again'), {
      teacherUid: TEACHER_UID,
      code: CODE,
      status: 'active',
    });
    await assertSucceeds(batch.commit());
  });

  it('denies a second teacher claiming a held code', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), COLLECTION, CODE), {
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 30,
      })
    );
  });

  it('denies a second teacher a pointer under a held code', async () => {
    await assertFails(
      setDoc(pointerRef(asOtherTeacher(), CODE, 'squat'), {
        sessionId: 'squat',
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 31,
      })
    );
  });

  it('denies a second teacher a session carrying a held code', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), 'quiz_sessions', 'squat'), {
        teacherUid: OTHER_TEACHER_UID,
        code: CODE,
        status: 'active',
        startedAt: 9_999_999_999_999,
      })
    );
  });

  it('denies the whole hijack batch', async () => {
    await assertFails(
      claimBatch(asOtherTeacher(), OTHER_TEACHER_UID, CODE, 'squat-2')
    );
  });

  it("denies moving one's own session onto a held code", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quiz_sessions', 'other-own'), {
        teacherUid: OTHER_TEACHER_UID,
        code: OTHER_CODE,
        status: 'active',
      });
    });
    await assertFails(
      updateDoc(doc(asOtherTeacher(), 'quiz_sessions', 'other-own'), {
        code: CODE,
      })
    );
  });

  it('lets an owner edit a session without touching its code', async () => {
    await assertSucceeds(
      updateDoc(doc(asOtherTeacher(), 'quiz_sessions', 'other-own'), {
        status: 'paused',
      })
    );
  });

  // Transitional, for a tab on the previous client, which writes no owner record.
  it('lets staff use a code nobody has claimed yet', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(pointerRef(db, 'UNCLAIMED', 'unclaimed'), {
      sessionId: 'unclaimed',
      teacherUid: TEACHER_UID,
      createdAt: 50,
    });
    batch.set(doc(db, 'quiz_sessions', 'unclaimed'), {
      teacherUid: TEACHER_UID,
      code: 'UNCLAIMED',
      status: 'active',
    });
    await assertSucceeds(batch.commit());
  });

  it('lets staff create a session with no code', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'quiz_sessions', 'no-code'), {
        teacherUid: TEACHER_UID,
        status: 'waiting',
      })
    );
  });

  it("denies claiming a code in another teacher's name", async () => {
    await assertFails(
      setDoc(doc(asTeacher(), COLLECTION, 'FRAME1'), {
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 32,
      })
    );
  });

  it('denies a non-canonical code', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), COLLECTION, 'abc123'), {
        teacherUid: TEACHER_UID,
        createdAt: 33,
      })
    );
  });

  it('denies extra fields on the owner record', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), COLLECTION, 'EXTRA1'), {
        teacherUid: TEACHER_UID,
        createdAt: 34,
        note: 'free storage',
      })
    );
  });

  it('denies the owner updating or deleting the owner record', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), COLLECTION, CODE), { createdAt: 99 })
    );
    await assertFails(deleteDoc(doc(asTeacher(), COLLECTION, CODE)));
  });
});

describe('only staff claim codes or create sessions', () => {
  const nonStaff: [string, () => ReturnType<typeof asTeacher>, string][] = [
    ['an anonymous student', asAnonStudent, ANON_UID],
    ['a studentRole student', asStudent, STUDENT_UID],
    ['a student signed in with Google', asGoogleStudent, 'google-student-uid'],
    ['an account with no member doc', asNoMemberDoc, 'stranger-uid'],
    ['an inactive teacher', asInactiveTeacher, 'inactive-uid'],
  ];
  for (const [who, as, uid] of nonStaff) {
    it(`denies ${who} claiming a code`, async () => {
      await assertFails(
        setDoc(doc(as(), COLLECTION, `NS${uid.length}X`), {
          teacherUid: uid,
          createdAt: 40,
        })
      );
    });

    it(`denies ${who} the full claim batch`, async () => {
      await assertFails(claimBatch(as(), uid, `NB${uid.length}X`, `ns-${uid}`));
    });

    it(`denies ${who} a code-less session`, async () => {
      await assertFails(
        setDoc(doc(as(), 'quiz_sessions', `ns-plain-${uid}`), {
          teacherUid: uid,
          status: 'active',
        })
      );
    });
  }
});

describe('quiz_sessions reads', () => {
  it('denies an anonymous student listing every session', async () => {
    await assertFails(getDocs(collection(asAnonStudent(), 'quiz_sessions')));
  });

  it('denies a studentRole student listing every session', async () => {
    await assertFails(getDocs(collection(asStudent(), 'quiz_sessions')));
  });

  it('denies a teacher listing every session', async () => {
    await assertFails(getDocs(collection(asTeacher(), 'quiz_sessions')));
  });

  it("denies a teacher listing a colleague's sessions", async () => {
    await assertFails(
      getDocs(
        query(
          collection(asTeacher(), 'quiz_sessions'),
          where('teacherUid', '==', OTHER_TEACHER_UID)
        )
      )
    );
  });

  it("denies a Google-signed-in student listing a teacher's sessions", async () => {
    await assertFails(
      getDocs(
        query(
          collection(asGoogleStudent(), 'quiz_sessions'),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
  });

  it('lets a studentRole student list sessions for their own class', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asStudent(), 'quiz_sessions'),
          where('classIds', 'array-contains-any', ['class-A'])
        )
      )
    );
  });

  it('lets a teacher list their own sessions', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), 'quiz_sessions'),
          where('teacherUid', '==', TEACHER_UID)
        )
      )
    );
  });

  it('lets anyone signed in get a session by id', async () => {
    await assertSucceeds(
      getDoc(doc(asAnonStudent(), 'quiz_sessions', SESSION_ID))
    );
    await assertSucceeds(getDoc(doc(asStudent(), 'quiz_sessions', SESSION_ID)));
  });
});

describe('writes are the owning teacher only', () => {
  it("denies a teacher claiming another teacher's uid", async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), CODE, 'session-new-2'), {
        sessionId: 'session-new-2',
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 11,
      })
    );
  });

  it('denies a pointer whose sessionId does not match its doc id', async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), CODE, 'session-new-3'), {
        sessionId: 'some-other-session',
        teacherUid: TEACHER_UID,
        createdAt: 12,
      })
    );
  });

  it('denies extra fields, so the collection cannot become free storage', async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), CODE, 'session-new-4'), {
        ...pointer(CODE, 'session-new-4', TEACHER_UID),
      })
    );
  });

  it('denies an anonymous student writing a pointer', async () => {
    await assertFails(
      setDoc(pointerRef(asAnonStudent(), CODE, 'session-anon'), {
        sessionId: 'session-anon',
        teacherUid: ANON_UID,
        createdAt: 14,
      })
    );
  });

  // The one thing this collection must never allow: re-aiming a live code at a
  // different session, which would silently redirect a class mid-join.
  it('denies updating a pointer, including by its owner', async () => {
    await assertFails(
      updateDoc(pointerRef(asTeacher(), CODE, SESSION_ID), {
        sessionId: 'hijacked-session',
      })
    );
  });

  it('denies overwriting an existing pointer with a valid-looking one', async () => {
    await assertFails(
      setDoc(pointerRef(asOtherTeacher(), CODE, SESSION_ID), {
        sessionId: SESSION_ID,
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 15,
      })
    );
  });

  it("denies a teacher deleting another teacher's pointer", async () => {
    await assertFails(
      deleteDoc(pointerRef(asOtherTeacher(), CODE, SESSION_ID))
    );
  });

  it('denies an anonymous student deleting a pointer', async () => {
    await assertFails(deleteDoc(pointerRef(asAnonStudent(), CODE, SESSION_ID)));
  });

  it('allows the owning teacher to delete their pointer', async () => {
    await assertSucceeds(
      deleteDoc(pointerRef(asTeacher(), CODE, OTHER_SESSION_ID))
    );
  });

  // deleteAssignment batches the pointer delete atomically with the session and
  // assignment deletes. Every session that predates this collection has no
  // pointer, and a delete rule that dereferences a null `resource` throws, which
  // Firestore reports as a denial — that would fail the whole batch and break
  // deleting a quiz until the backfill has run.
  it('allows deleting a pointer that was never written', async () => {
    await assertSucceeds(
      deleteDoc(pointerRef(asTeacher(), CODE, 'session-with-no-pointer'))
    );
  });

  it('allows deleting a pointer under a code that has none', async () => {
    await assertSucceeds(
      deleteDoc(pointerRef(asTeacher(), 'NEVERUSED', 'session-legacy'))
    );
  });
});
