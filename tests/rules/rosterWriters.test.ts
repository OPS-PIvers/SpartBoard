// Firestore rules: only a teacher account writes users/{uid}/rosters, so the class directory's collection-group scan can't be seeded.
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-roster-writers';
const UID = 'roster-owner';
const ROSTER = `users/${UID}/rosters/r1`;
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const teacherToken: TokenOptions = {
  email: `${UID}@example.com`,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
};
const asTeacher = () =>
  testEnv.authenticatedContext(UID, teacherToken).firestore();
const asStudentRole = () =>
  testEnv
    .authenticatedContext(UID, {
      studentRole: true,
      classIds: ['CL1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asAnonymous = () =>
  testEnv
    .authenticatedContext(UID, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: host || '127.0.0.1',
      port: port ? Number(port) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('users/{uid}/rosters writers', () => {
  it('lets a teacher create, update, read and delete their own roster', async () => {
    const ref = doc(asTeacher(), ROSTER);
    await assertSucceeds(
      setDoc(ref, { name: 'Period 1', classlinkClassId: 'CL1' })
    );
    await assertSucceeds(updateDoc(ref, { name: 'Period 2' }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('denies an anonymous user a roster under its own uid', async () => {
    await assertFails(
      setDoc(doc(asAnonymous(), ROSTER), { classlinkClassId: 'CL1' })
    );
  });

  it('denies a studentRole token a roster under its own uid', async () => {
    await assertFails(
      setDoc(doc(asStudentRole(), ROSTER), { classlinkClassId: 'CL1' })
    );
  });

  it('denies an anonymous or studentRole owner an update to an existing roster', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ROSTER), { name: 'Old' });
    });
    await assertFails(
      updateDoc(doc(asAnonymous(), ROSTER), { classlinkClassId: 'CL1' })
    );
    await assertFails(
      updateDoc(doc(asStudentRole(), ROSTER), { classlinkClassId: 'CL1' })
    );
  });
});
