// feature_permissions / global_permissions hold betaUsers emails: admin-only; others read the stripped mirrors.
// Requires the emulator; run via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;
const TEACHER = 'teacher@orono.k12.mn.us';

const asAnon = () =>
  testEnv.authenticatedContext('anon-uid', {
    firebase: { sign_in_provider: 'anonymous' },
  });
const asStudent = () =>
  testEnv.authenticatedContext('stu-uid', {
    studentRole: true,
    firebase: { sign_in_provider: 'custom' },
  });
const asTeacher = (email = TEACHER) =>
  testEnv.authenticatedContext('t-uid', {
    email,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
const asAdmin = () =>
  testEnv.authenticatedContext('a-uid', {
    email: 'admin@orono.k12.mn.us',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'spartboard-permission-reads-rules-test',
    firestore: {
      rules: readFileSync(
        fileURLToPath(new URL('../../firestore.rules', import.meta.url)),
        'utf8'
      ),
    },
  });
});
afterAll(async () => {
  await testEnv.cleanup();
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/admin@orono.k12.mn.us'), {
      roleId: 'domain_admin',
    });
    await setDoc(doc(db, 'feature_permissions/quiz'), { betaUsers: [TEACHER] });
    await setDoc(doc(db, 'global_permissions/gradebook'), {
      betaUsers: [TEACHER],
    });
    await setDoc(doc(db, 'feature_permissions_public/quiz'), { betaUsers: [] });
    await setDoc(doc(db, 'global_permissions_public/gradebook'), {
      betaUsers: [],
    });
    await setDoc(doc(db, `beta_grants/${TEACHER}`), { features: ['quiz'] });
  });
});

describe('permission docs with betaUsers', () => {
  it.each([
    ['anonymous', asAnon],
    ['student', asStudent],
    ['teacher', asTeacher],
  ])('%s cannot get or list the originals', async (_n, ctx) => {
    const db = ctx().firestore();
    for (const c of ['feature_permissions', 'global_permissions']) {
      await assertFails(getDocs(collection(db, c)));
    }
    await assertFails(getDoc(doc(db, 'feature_permissions/quiz')));
    await assertFails(getDoc(doc(db, 'global_permissions/gradebook')));
  });

  it('admins read and write the originals', async () => {
    const db = asAdmin().firestore();
    await assertSucceeds(getDocs(collection(db, 'feature_permissions')));
    await assertSucceeds(getDocs(collection(db, 'global_permissions')));
    await assertSucceeds(
      setDoc(doc(db, 'feature_permissions/quiz'), { betaUsers: [] })
    );
  });

  it('any signed-in caller reads the stripped mirrors but cannot write them', async () => {
    for (const ctx of [asAnon, asStudent, asTeacher]) {
      const db = ctx().firestore();
      await assertSucceeds(
        getDocs(collection(db, 'feature_permissions_public'))
      );
      await assertSucceeds(
        getDoc(doc(db, 'global_permissions_public/gradebook'))
      );
      await assertFails(
        setDoc(doc(db, 'feature_permissions_public/quiz'), { betaUsers: ['x'] })
      );
    }
  });
});

describe('beta_grants', () => {
  it('an enrolled teacher gets their own grant doc (case-insensitive token email)', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asTeacher('Teacher@Orono.K12.MN.us').firestore(),
          `beta_grants/${TEACHER}`
        )
      )
    );
  });

  it('an unverified token claiming the email cannot read the grant doc', async () => {
    const ctx = testEnv.authenticatedContext('forger', {
      email: TEACHER,
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    });
    await assertFails(getDoc(doc(ctx.firestore(), `beta_grants/${TEACHER}`)));
  });

  it('others cannot read it, list the collection, or write it', async () => {
    for (const ctx of [
      asAnon,
      asStudent,
      () => asTeacher('other@orono.k12.mn.us'),
      asAdmin,
    ]) {
      const db = ctx().firestore();
      await assertFails(getDoc(doc(db, `beta_grants/${TEACHER}`)));
      await assertFails(getDocs(collection(db, 'beta_grants')));
    }
    await assertFails(
      setDoc(doc(asTeacher().firestore(), `beta_grants/${TEACHER}`), {
        features: ['x'],
      })
    );
  });
});
