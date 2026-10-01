// Rules for the View as log (docs/plans/ADMIN_VIEW_AS.md D16): view-as entries are
// super-admin reads only, and nobody but the server or a view-as tab writes them.
// Requires the emulator; run via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

// Mirrors VIEW_AS_LOG_ACTIONS in types/viewAs.ts (this config has no @/ alias).
const VIEW_AS_LOG_ACTIONS = [
  'view_as_start',
  'view_as_student',
  'view_as_renew',
  'view_as_unlock',
  'view_as_end',
  'view_as_save',
  'view_as_approve',
  'view_as_outward',
  'view_as_revert',
];

const PROJECT_ID = 'spartboard-view-as-log-rules-test';
const TEACHER_UID = 'jane-uid';
const TEACHER_EMAIL = 'jane@orono.k12.mn.us';
const ADMIN_EMAIL = 'principal@orono.k12.mn.us';
const BOSS_EMAIL = 'boss@orono.k12.mn.us';
const SID = 'session-1';

const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const token = (
  email: string,
  viewAs?: Record<string, unknown>
): TokenOptions => ({
  email,
  email_verified: true,
  studentRole: false,
  classIds: [],
  firebase: { sign_in_provider: viewAs ? 'custom' : 'google.com' },
  ...(viewAs ? { viewAs } : {}),
});

const asTeacher = () =>
  testEnv.authenticatedContext(TEACHER_UID, token(TEACHER_EMAIL));
const asUnlockedTab = () =>
  testEnv.authenticatedContext(
    TEACHER_UID,
    token(TEACHER_EMAIL, {
      by: BOSS_EMAIL,
      sid: SID,
      ro: false,
      adminTarget: false,
      exp: Date.now() + 30 * 60 * 1000,
    })
  );
const asAdmin = () =>
  testEnv.authenticatedContext('admin-uid', token(ADMIN_EMAIL));
const asBoss = () =>
  testEnv.authenticatedContext('boss-uid', token(BOSS_EMAIL));

const logQuery = (ctx: ReturnType<typeof asBoss>) =>
  query(
    collection(ctx.firestore(), 'admin_audit_log'),
    where('action', 'in', [...VIEW_AS_LOG_ACTIONS]),
    orderBy('timestamp', 'desc'),
    limit(50)
  );

const tabEntry = (over: Record<string, unknown> = {}) => ({
  action: 'view_as_save',
  sid: SID,
  email: BOSS_EMAIL,
  targetEmail: TEACHER_EMAIL,
  targetUid: TEACHER_UID,
  path: `users/${TEACHER_UID}/userProfile/profile`,
  before: { a: 1 },
  after: { a: 2 },
  timestamp: serverTimestamp(),
  ...over,
});

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES, 'utf8'),
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { roleId: 'domain_admin' });
    await setDoc(doc(db, `admins/${BOSS_EMAIL}`), { roleId: 'super_admin' });
    await setDoc(doc(db, `organizations/orono/members/${BOSS_EMAIL}`), {
      roleId: 'super_admin',
      status: 'active',
    });
    await setDoc(doc(db, 'admin_audit_log/save1'), {
      ...tabEntry(),
      timestamp: new Date(),
    });
    await setDoc(doc(db, 'admin_audit_log/other'), {
      action: 'user_account_deleted',
      email: BOSS_EMAIL,
      timestamp: new Date(),
    });
  });
});

describe('reading the View as log', () => {
  it('a super admin gets and lists view-as entries', async () => {
    const db = asBoss().firestore();
    await assertSucceeds(getDoc(doc(db, 'admin_audit_log/save1')));
    await assertSucceeds(getDocs(logQuery(asBoss())));
  });

  it('other admins read other audit entries but never view-as ones', async () => {
    const db = asAdmin().firestore();
    await assertSucceeds(getDoc(doc(db, 'admin_audit_log/other')));
    await assertFails(getDoc(doc(db, 'admin_audit_log/save1')));
    await assertFails(getDocs(logQuery(asAdmin())));
  });

  it('teachers and view-as tabs read nothing', async () => {
    await assertFails(
      getDoc(doc(asTeacher().firestore(), 'admin_audit_log/other'))
    );
    await assertFails(
      getDoc(doc(asUnlockedTab().firestore(), 'admin_audit_log/save1'))
    );
    await assertFails(getDocs(logQuery(asUnlockedTab())));
  });
});

describe('writing view-as entries', () => {
  it('no admin, super admins included, forges one from their own session', async () => {
    for (const ctx of [asAdmin(), asBoss()]) {
      for (const action of ['view_as_save', 'view_as_revert']) {
        await assertFails(
          addDoc(collection(ctx.firestore(), 'admin_audit_log'), {
            ...tabEntry({ action }),
          })
        );
      }
    }
  });

  it('admins still append other audit entries', async () => {
    await assertSucceeds(
      addDoc(collection(asAdmin().firestore(), 'admin_audit_log'), {
        action: 'model_config_change',
        email: ADMIN_EMAIL,
        timestamp: serverTimestamp(),
      })
    );
  });

  it("an unlocked tab may only log paths inside the target's account", async () => {
    const log = collection(asUnlockedTab().firestore(), 'admin_audit_log');
    await assertSucceeds(addDoc(log, tabEntry()));
    await assertSucceeds(
      addDoc(log, tabEntry({ path: `users/${TEACHER_UID}` }))
    );
    await assertSucceeds(
      addDoc(
        log,
        tabEntry({
          action: 'view_as_approve',
          path: `users/${TEACHER_UID}/dashboards/b1#widgets/w1`,
        })
      )
    );
    const outward = tabEntry({ action: 'view_as_outward' });
    delete (outward as Record<string, unknown>).path;
    await assertSucceeds(addDoc(log, outward));
    await assertFails(addDoc(log, tabEntry({ path: 'users/other-uid/x/y' })));
    await assertFails(
      addDoc(log, tabEntry({ path: 'admin_settings/view_as' }))
    );
    await assertFails(
      addDoc(log, tabEntry({ path: `users/${TEACHER_UID}/private/google` }))
    );
    await assertFails(addDoc(log, tabEntry({ path: 5 })));
  });
});
