// Firestore security-rules tests for the M1 full sign-in lockout.
//
// `notDeactivated()` in firestore.rules denies teacher-data reads/writes to an
// operator-org member whose member doc is `status: 'inactive'`. Active members
// (and users with no operator-org member doc) are unaffected.
//
// The gate is checked against the operator org (`orono`) by a fixed path —
// see the function comment in firestore.rules for why rules can't resolve the
// caller's org dynamically.
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
import { setDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-inactive-lockout';
const ORG_ID = 'orono';

const ACTIVE_UID = 'active-teacher-uid';
const ACTIVE_EMAIL = 'active.teacher@orono.k12.mn.us';
const INACTIVE_UID = 'inactive-teacher-uid';
const INACTIVE_EMAIL = 'inactive.teacher@orono.k12.mn.us';
const NOORG_UID = 'noorg-teacher-uid';
const NOORG_EMAIL = 'teacher@somewhere-else.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Spell out every claim the rules touch so test contexts match the production
// token surface (the emulator throws "Property X is undefined" on direct claim
// access when a claim is absent, even behind a short-circuit).
const asActive = () =>
  testEnv
    .authenticatedContext(ACTIVE_UID, {
      email: ACTIVE_EMAIL,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asInactive = () =>
  testEnv
    .authenticatedContext(INACTIVE_UID, {
      email: INACTIVE_EMAIL,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asNoOrg = () =>
  testEnv
    .authenticatedContext(NOORG_UID, {
      email: NOORG_EMAIL,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const dashboardPath = (uid: string) => `users/${uid}/dashboards/dash-1`;

const dashboardFields = () => ({
  id: 'dash-1',
  name: 'My Board',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
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
    // Operator-org member docs: one active, one inactive. No doc for the
    // no-org teacher (their domain isn't in this org).
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ACTIVE_EMAIL}`), {
      email: ACTIVE_EMAIL,
      orgId: ORG_ID,
      roleId: 'teacher',
      buildingIds: ['high'],
      status: 'active',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${INACTIVE_EMAIL}`), {
      email: INACTIVE_EMAIL,
      orgId: ORG_ID,
      roleId: 'teacher',
      buildingIds: ['high'],
      status: 'inactive',
    });
    // Seed dashboards under each uid so reads have a doc to find.
    await setDoc(doc(db, dashboardPath(ACTIVE_UID)), dashboardFields());
    await setDoc(doc(db, dashboardPath(INACTIVE_UID)), dashboardFields());
    await setDoc(doc(db, dashboardPath(NOORG_UID)), dashboardFields());
  });
});

describe('M1 full sign-in lockout — notDeactivated() gate', () => {
  it('active member can read their own dashboard', async () => {
    await assertSucceeds(getDoc(doc(asActive(), dashboardPath(ACTIVE_UID))));
  });

  it('active member can write their own dashboard', async () => {
    await assertSucceeds(
      setDoc(doc(asActive(), dashboardPath(ACTIVE_UID)), {
        ...dashboardFields(),
        name: 'Renamed',
      })
    );
  });

  it('inactive member is DENIED reading their own dashboard', async () => {
    await assertFails(getDoc(doc(asInactive(), dashboardPath(INACTIVE_UID))));
  });

  it('inactive member is DENIED writing their own dashboard', async () => {
    await assertFails(
      setDoc(doc(asInactive(), dashboardPath(INACTIVE_UID)), {
        ...dashboardFields(),
        name: 'Smuggled',
      })
    );
  });

  it('inactive member is DENIED reading their own rosters', async () => {
    await assertFails(
      getDoc(doc(asInactive(), `users/${INACTIVE_UID}/rosters/r1`))
    );
  });

  it('a user with no operator-org member doc is unaffected (allowed)', async () => {
    await assertSucceeds(getDoc(doc(asNoOrg(), dashboardPath(NOORG_UID))));
    await assertSucceeds(
      setDoc(doc(asNoOrg(), dashboardPath(NOORG_UID)), {
        ...dashboardFields(),
        name: 'Still works',
      })
    );
  });

  it('reactivating an inactive member restores access', async () => {
    // Flip the member back to active (admin path bypasses rules here).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `organizations/${ORG_ID}/members/${INACTIVE_EMAIL}`
        ),
        {
          email: INACTIVE_EMAIL,
          orgId: ORG_ID,
          roleId: 'teacher',
          buildingIds: ['high'],
          status: 'active',
        }
      );
    });
    await assertSucceeds(
      getDoc(doc(asInactive(), dashboardPath(INACTIVE_UID)))
    );
  });
});
