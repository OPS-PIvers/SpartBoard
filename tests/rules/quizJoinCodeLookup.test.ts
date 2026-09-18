// Firestore security-rules tests for the quiz join-code lookup collection.
// Requires a running Firestore emulator; invoke via `pnpm run test:rules`.
//
// `quiz_join_codes/{code}/sessions/{sessionId}` exists so the PIN join can
// resolve a code without listing `quiz_sessions` by `code` — a query a list rule
// can never prove was filtered, which is why that collection still answers an
// unfiltered list to anyone signed in. Here the code is a path segment, so the
// lookup is provable by construction.
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

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
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

  it('denies reading the parent code doc', async () => {
    await assertFails(getDoc(doc(asAnonStudent(), COLLECTION, CODE)));
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

describe('writes are the owning teacher only', () => {
  it('allows a teacher to register their own session', async () => {
    await assertSucceeds(
      setDoc(pointerRef(asTeacher(), 'NEWCODE', 'session-new'), {
        sessionId: 'session-new',
        teacherUid: TEACHER_UID,
        createdAt: 10,
      })
    );
  });

  it("denies a teacher claiming another teacher's uid", async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), 'NEWCODE2', 'session-new-2'), {
        sessionId: 'session-new-2',
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 11,
      })
    );
  });

  it('denies a pointer whose sessionId does not match its doc id', async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), 'NEWCODE3', 'session-new-3'), {
        sessionId: 'some-other-session',
        teacherUid: TEACHER_UID,
        createdAt: 12,
      })
    );
  });

  it('denies extra fields, so the collection cannot become free storage', async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), 'NEWCODE4', 'session-new-4'), {
        ...pointer('NEWCODE4', 'session-new-4', TEACHER_UID),
      })
    );
  });

  it('denies a non-canonical code in the path', async () => {
    await assertFails(
      setDoc(pointerRef(asTeacher(), 'abc123', 'session-new-5'), {
        sessionId: 'session-new-5',
        teacherUid: TEACHER_UID,
        createdAt: 13,
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
});
