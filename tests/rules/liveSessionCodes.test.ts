// Firestore security-rules tests for the Live Session broadcast doc `sessions/{uid}` and
// its join-code owner pointers `live_session_codes/{code}` (hooks/useLiveSession.ts).
//
// Contract under test: only a verified, non-anonymous, non-studentRole teacher writes
// their own session doc, in the client's shape, and its `code` must be a pointer that
// teacher owns. Pointers are create-if-absent, so a second principal can never make a
// lookup of a claimed code resolve to anyone but its owner.
//
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-live-session-codes-test';
const TEACHER_UID = 'teacher-live';
const OTHER_TEACHER_UID = 'teacher-other';
const ATTACKER_UID = 'aaa-attacker';
const CODE = 'ABC123';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const teacherDb = (uid: string, email = `${uid}@school.edu`) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore() as unknown as Firestore;

const anonDb = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore() as unknown as Firestore;

const studentRoleDb = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds: ['c1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore() as unknown as Firestore;

const unverifiedDb = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: 'someone@example.com',
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    })
    .firestore() as unknown as Firestore;

const session = (uid: string, over: Record<string, unknown> = {}) => ({
  id: uid,
  isActive: true,
  activeWidgetId: 'w1',
  activeWidgetType: 'embed',
  activeWidgetConfig: { url: 'https://example.com' },
  code: CODE,
  frozen: false,
  createdAt: 1000,
  ...over,
});

// What startSession commits: the code pointer and the session doc together.
const startLive = (db: Firestore, uid: string, code = CODE) => {
  const batch = writeBatch(db);
  batch.set(doc(db, `live_session_codes/${code}`), {
    teacherUid: uid,
    createdAt: 1000,
  });
  batch.set(doc(db, `sessions/${uid}`), session(uid, { code }));
  return batch.commit();
};

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('live session — who can broadcast', () => {
  it('control: a verified teacher claims a code and goes live in one batch', async () => {
    await assertSucceeds(startLive(teacherDb(TEACHER_UID), TEACHER_UID));
  });

  it('denies an anonymous /join principal going live under its own uid', async () => {
    const db = anonDb(ATTACKER_UID);
    await assertFails(startLive(db, ATTACKER_UID, 'ZZZ999'));
    await assertFails(
      setDoc(doc(db, `sessions/${ATTACKER_UID}`), session(ATTACKER_UID))
    );
  });

  it('denies a studentRole token going live', async () => {
    const db = studentRoleDb(ATTACKER_UID);
    await assertFails(startLive(db, ATTACKER_UID, 'ZZZ999'));
    await assertFails(
      setDoc(doc(db, `sessions/${ATTACKER_UID}`), session(ATTACKER_UID))
    );
  });

  it('denies an unverified email account going live', async () => {
    await assertFails(
      startLive(unverifiedDb(ATTACKER_UID), ATTACKER_UID, 'ZZZ999')
    );
  });

  it('denies a session doc whose code has no pointer', async () => {
    await assertFails(
      setDoc(
        doc(teacherDb(TEACHER_UID), `sessions/${TEACHER_UID}`),
        session(TEACHER_UID)
      )
    );
  });

  it('denies a field outside the client shape', async () => {
    const db = teacherDb(TEACHER_UID);
    const batch = writeBatch(db);
    batch.set(doc(db, `live_session_codes/${CODE}`), {
      teacherUid: TEACHER_UID,
      createdAt: 1000,
    });
    batch.set(doc(db, `sessions/${TEACHER_UID}`), {
      ...session(TEACHER_UID),
      payload: 'x',
    });
    await assertFails(batch.commit());
  });

  it('lets a teacher claim the unclaimed code of their pre-pointer live session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `sessions/${TEACHER_UID}`),
        session(TEACHER_UID)
      );
    });
    await assertSucceeds(
      setDoc(doc(teacherDb(TEACHER_UID), `live_session_codes/${CODE}`), {
        teacherUid: TEACHER_UID,
        createdAt: 1000,
      })
    );
  });

  it("denies writing another teacher's session doc", async () => {
    await assertFails(
      setDoc(
        doc(teacherDb(OTHER_TEACHER_UID), `sessions/${TEACHER_UID}`),
        session(TEACHER_UID)
      )
    );
  });
});

describe('live session — a claimed code has one owner', () => {
  beforeEach(async () => {
    await startLive(teacherDb(TEACHER_UID), TEACHER_UID);
  });

  it('denies a second teacher re-claiming the live code', async () => {
    const db = teacherDb(OTHER_TEACHER_UID);
    await assertFails(startLive(db, OTHER_TEACHER_UID));
    await assertFails(
      setDoc(doc(db, `live_session_codes/${CODE}`), {
        teacherUid: OTHER_TEACHER_UID,
        createdAt: 2000,
      })
    );
    await assertFails(
      setDoc(
        doc(db, `sessions/${OTHER_TEACHER_UID}`),
        session(OTHER_TEACHER_UID)
      )
    );
  });

  it('denies an anonymous principal re-claiming the live code', async () => {
    const db = anonDb(ATTACKER_UID);
    await assertFails(
      setDoc(doc(db, `sessions/${ATTACKER_UID}`), session(ATTACKER_UID))
    );
    await assertFails(deleteDoc(doc(db, `live_session_codes/${CODE}`)));
  });

  it("denies another teacher deleting the owner's pointer", async () => {
    await assertFails(
      deleteDoc(doc(teacherDb(OTHER_TEACHER_UID), `live_session_codes/${CODE}`))
    );
  });

  it('a student resolves the code to the owning teacher only', async () => {
    const db = anonDb('student-anon');
    const pointer = await assertSucceeds(
      getDoc(doc(db, `live_session_codes/${CODE}`))
    );
    if (pointer.data()?.teacherUid !== TEACHER_UID) {
      throw new Error('code resolved to the wrong teacher');
    }
    await assertFails(getDocs(collection(db, 'live_session_codes')));
  });

  it('lets the owner switch, freeze and end without re-claiming the code', async () => {
    const ref = doc(teacherDb(TEACHER_UID), `sessions/${TEACHER_UID}`);
    await assertSucceeds(
      updateDoc(ref, { activeWidgetId: 'w2', activeWidgetType: 'poll' })
    );
    await assertSucceeds(updateDoc(ref, { frozen: true }));
    await assertSucceeds(
      updateDoc(ref, { isActive: false, activeWidgetId: null, frozen: false })
    );
  });

  it('lets the owner move to a new code and drop the old pointer', async () => {
    const db = teacherDb(TEACHER_UID);
    await assertSucceeds(startLive(db, TEACHER_UID, 'NEW999'));
    await assertSucceeds(deleteDoc(doc(db, `live_session_codes/${CODE}`)));
  });

  it("denies the owner moving to a code they don't own", async () => {
    await startLive(teacherDb(OTHER_TEACHER_UID), OTHER_TEACHER_UID, 'OTH777');
    await assertFails(
      updateDoc(doc(teacherDb(TEACHER_UID), `sessions/${TEACHER_UID}`), {
        code: 'OTH777',
      })
    );
  });
});
