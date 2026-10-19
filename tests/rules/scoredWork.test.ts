// Firestore security-rules tests for scored paper work:
//   - /users/{uid}/scored_work/{workId} and its /scores/{seat} docs are owner-only.
//   - /plcs/{plcId}/scored_work_aggregates is member-readable, server-written.
//   - /plcs/{plcId}/scored_work_sources is closed to every client.
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
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-scored-work-rules-test';
const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';
const MEMBER_UID = 'member-uid';
const OUTSIDER_UID = 'outsider-uid';
const ANON_UID = 'anon-uid';
const PLC_ID = 'plc-1';
const WORK_ID = 'work-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const teacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.edu`,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const workPath = (uid = OWNER_UID) => `users/${uid}/scored_work/${WORK_ID}`;
const scorePath = (uid = OWNER_UID) => `${workPath(uid)}/scores/1`;
const aggregatePath = `plcs/${PLC_ID}/scored_work_aggregates/series-1`;
const sourcePath = `plcs/${PLC_ID}/scored_work_sources/${OWNER_UID}__${WORK_ID}`;

const workFields = () => ({
  id: WORK_ID,
  title: 'Essay',
  rosterIds: ['r1'],
  seats: { 1: { rosterId: 'r1', studentId: 's1' } },
  spareSeats: [],
  pageCount: 1,
  createdAt: 1,
  updatedAt: 1,
});
const scoreFields = () => ({
  seat: 1,
  levels: { a: 1 },
  points: 4,
  max: 4,
  scoredAt: 1,
});

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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, workPath()), workFields());
    await setDoc(doc(db, scorePath()), scoreFields());
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID, OWNER_UID],
      memberEmails: {
        [MEMBER_UID]: `${MEMBER_UID}@school.edu`,
        [OWNER_UID]: `${OWNER_UID}@school.edu`,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, aggregatePath), { seriesKey: 'series-1' });
    await setDoc(doc(db, sourcePath), { teacherUid: OWNER_UID });
  });
});

describe('scored_work — owner only', () => {
  it('lets the owner read and write a set and its scores', async () => {
    const db = teacher(OWNER_UID);
    await assertSucceeds(getDoc(doc(db, workPath())));
    await assertSucceeds(updateDoc(doc(db, workPath()), { title: 'Renamed' }));
    await assertSucceeds(getDoc(doc(db, scorePath())));
    await assertSucceeds(updateDoc(doc(db, scorePath()), { points: 3 }));
    await assertSucceeds(deleteDoc(doc(db, scorePath())));
    await assertSucceeds(deleteDoc(doc(db, workPath())));
  });

  it('denies another teacher, an anonymous joiner and the signed-out', async () => {
    for (const db of [
      teacher(OTHER_UID),
      asAnon(),
      testEnv.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(doc(db, workPath())));
      await assertFails(getDoc(doc(db, scorePath())));
      await assertFails(updateDoc(doc(db, scorePath()), { points: 4 }));
    }
  });
});

describe('PLC scored work — pooled results only', () => {
  it('lets a member read the aggregate and nobody write it', async () => {
    const db = teacher(MEMBER_UID);
    await assertSucceeds(getDoc(doc(db, aggregatePath)));
    await assertFails(setDoc(doc(db, aggregatePath), { seriesKey: 'x' }));
    await assertFails(deleteDoc(doc(db, aggregatePath)));
  });

  it('denies an outsider the aggregate', async () => {
    await assertFails(getDoc(doc(teacher(OUTSIDER_UID), aggregatePath)));
  });

  it('keeps per-teacher sources closed to every client, even the author', async () => {
    for (const uid of [MEMBER_UID, OWNER_UID]) {
      const db = teacher(uid);
      await assertFails(getDoc(doc(db, sourcePath)));
      await assertFails(setDoc(doc(db, sourcePath), { teacherUid: uid }));
    }
  });
});
