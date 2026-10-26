// Quiz and video activity response reads must not reveal which `pin-{period}-{pin}` keys exist:
// an anonymous caller gets the same denial for a missing key as for another student's.
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
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-response-pin-probe';
const TEACHER_UID = 'teacher-uid-rpp';
const OWNER_UID = 'anon-owner-rpp';
const PROBER_UID = 'anon-prober-rpp';
const SSO_UID = 'sso-student-rpp';
const SESSION_ID = 'session-rpp';
const TAKEN_KEY = 'pin-period_1-1234';
const FREE_KEY = 'pin-period_1-5678';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const asSso = () =>
  testEnv
    .authenticatedContext(SSO_UID, {
      studentRole: true,
      classIds: ['class-a'],
    })
    .firestore();
const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, { email: 'teacher@example.com' })
    .firestore();

// Resolves once the first snapshot or error arrives, so a denied listen can be asserted.
const firstSnapshot = (db: ReturnType<typeof asAnon>, path: string) =>
  new Promise<void>((resolve, reject) => {
    const unsub = onSnapshot(
      doc(db, path),
      () => {
        unsub();
        resolve();
      },
      (err) => reject(err)
    );
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

const KINDS = [
  {
    name: 'quiz',
    collection: 'quiz_sessions',
    response: (uid: string) => ({
      studentUid: uid,
      pin: '1234',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      status: 'joined',
      completedAttempts: 0,
    }),
  },
  {
    name: 'video activity',
    collection: 'video_activity_sessions',
    response: (uid: string) => ({
      studentUid: uid,
      pin: '1234',
      classPeriod: 'period_1',
      joinedAt: 1000,
      score: null,
      answers: [],
      completedAt: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
    }),
  },
] as const;

describe.each(KINDS)('$name responses: PIN key probing', (kind) => {
  const path = (key: string) =>
    `${kind.collection}/${SESSION_ID}/responses/${key}`;

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${kind.collection}/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        mode: 'submissions',
        code: 'RPPTEST',
      });
      await setDoc(doc(db, path(TAKEN_KEY)), kind.response(OWNER_UID));
    });
  });

  it('denies an anonymous get of a missing PIN key, same as a taken one', async () => {
    await assertFails(getDoc(doc(asAnon(PROBER_UID), path(FREE_KEY))));
    await assertFails(getDoc(doc(asAnon(PROBER_UID), path(TAKEN_KEY))));
  });

  it('denies an anonymous listen on a missing PIN key', async () => {
    await assertFails(firstSnapshot(asAnon(PROBER_UID), path(FREE_KEY)));
  });

  it('denies update and delete of a missing or taken PIN key alike', async () => {
    for (const key of [FREE_KEY, TAKEN_KEY]) {
      await assertFails(
        updateDoc(doc(asAnon(PROBER_UID), path(key)), { tabSwitchWarnings: 1 })
      );
      await assertFails(deleteDoc(doc(asAnon(PROBER_UID), path(key))));
    }
  });

  it('lets the owner read their own PIN-keyed response', async () => {
    await assertSucceeds(getDoc(doc(asAnon(OWNER_UID), path(TAKEN_KEY))));
  });

  it('still lets an anonymous student create at a free PIN key and then read it', async () => {
    const db = asAnon(PROBER_UID);
    await assertSucceeds(
      setDoc(doc(db, path(FREE_KEY)), {
        ...kind.response(PROBER_UID),
        pin: '5678',
      })
    );
    await assertSucceeds(getDoc(doc(db, path(FREE_KEY))));
  });

  it('refuses a create over a taken PIN key', async () => {
    await assertFails(
      setDoc(
        doc(asAnon(PROBER_UID), path(TAKEN_KEY)),
        kind.response(PROBER_UID)
      )
    );
  });

  it('lets a caller get a missing doc at their own uid key (SSO and legacy anon probes)', async () => {
    await assertSucceeds(getDoc(doc(asSso(), path(SSO_UID))));
    await assertSucceeds(getDoc(doc(asAnon(PROBER_UID), path(PROBER_UID))));
  });

  it('denies a signed-in student a missing doc at someone else’s key', async () => {
    await assertFails(getDoc(doc(asSso(), path(FREE_KEY))));
    await assertFails(getDoc(doc(asSso(), path(OWNER_UID))));
  });

  it('lets the teacher read missing and existing keys', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), path(FREE_KEY))));
    await assertSucceeds(getDoc(doc(asTeacher(), path(TAKEN_KEY))));
  });
});
