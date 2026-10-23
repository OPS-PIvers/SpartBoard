// Rules for super admin "View as" (docs/plans/ADMIN_VIEW_AS.md D7, D16).
// A view-as tab is signed in as its target with a server-minted `viewAs`
// claim. It reads until exp and writes only while unlocked; admin powers
// never write from it. Requires the emulators; run via `pnpm run test:rules`.

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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-view-as-rules-test';
const TEACHER_UID = 'jane-uid';
const TEACHER_EMAIL = 'jane@orono.k12.mn.us';
const ADMIN_UID = 'admin-target-uid';
const ADMIN_EMAIL = 'principal@orono.k12.mn.us';
const BOSS_UID = 'boss-uid';
const BOSS_EMAIL = 'boss@orono.k12.mn.us';
const SID = 'session-1';

const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const STORAGE_RULES = fileURLToPath(
  new URL('../../storage.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const hostPort = (envValue: string | undefined, fallbackPort: number) => {
  const [host, port] = envValue ? envValue.split(':') : [];
  return {
    host: host || '127.0.0.1',
    port: port ? Number(port) : fallbackPort,
  };
};

const FUTURE = () => Date.now() + 30 * 60 * 1000;
const PAST = () => Date.now() - 60 * 1000;

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

const claim = (over: Record<string, unknown> = {}) => ({
  by: BOSS_EMAIL,
  sid: SID,
  ro: true,
  adminTarget: false,
  exp: FUTURE(),
  ...over,
});

const asTeacher = () =>
  testEnv.authenticatedContext(TEACHER_UID, token(TEACHER_EMAIL));
const asViewAs = (over: Record<string, unknown> = {}) =>
  testEnv.authenticatedContext(TEACHER_UID, token(TEACHER_EMAIL, claim(over)));
const asViewAsAdmin = (over: Record<string, unknown> = {}) =>
  testEnv.authenticatedContext(
    ADMIN_UID,
    token(ADMIN_EMAIL, claim({ adminTarget: true, ...over }))
  );
const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, token(ADMIN_EMAIL));
const asBoss = () => testEnv.authenticatedContext(BOSS_UID, token(BOSS_EMAIL));

const savedWidget = (uid = TEACHER_UID) => `users/${uid}/saved_widgets/w1`;

beforeAll(async () => {
  const fs = hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
  const st = hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(FIRESTORE_RULES, 'utf8'), ...fs },
    storage: { rules: readFileSync(STORAGE_RULES, 'utf8'), ...st },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { roleId: 'domain_admin' });
    await setDoc(doc(db, `admins/${BOSS_EMAIL}`), { roleId: 'super_admin' });
    await setDoc(doc(db, `organizations/orono/members/${BOSS_EMAIL}`), {
      roleId: 'super_admin',
      status: 'active',
    });
    await setDoc(doc(db, savedWidget()), { type: 'clock' });
    await setDoc(doc(db, `users/${TEACHER_UID}`), { lastLogin: 1 });
    await setDoc(doc(db, `users/${TEACHER_UID}/dashboards/b1`), { name: 'B' });
    await setDoc(doc(db, 'admin_settings/view_as'), { enabled: true });
    await setDoc(doc(db, `view_as_sessions/${SID}`), {
      by: BOSS_EMAIL,
      targetUid: TEACHER_UID,
    });
    await setDoc(doc(db, 'admin_audit_log/existing'), { action: 'x' });
  });
});

describe('users/{uid}/** under a view-as token', () => {
  it('leaves the real teacher reading and writing as before', async () => {
    const db = asTeacher().firestore();
    await assertSucceeds(getDoc(doc(db, savedWidget())));
    await assertSucceeds(setDoc(doc(db, savedWidget()), { type: 'timer' }));
    await assertSucceeds(setDoc(doc(db, `users/${TEACHER_UID}`), { a: 1 }));
  });

  it('read-only: reads the target, writes nothing', async () => {
    const db = asViewAs().firestore();
    await assertSucceeds(getDoc(doc(db, savedWidget())));
    await assertSucceeds(
      getDocs(collection(db, `users/${TEACHER_UID}/dashboards`))
    );
    await assertSucceeds(getDoc(doc(db, `users/${TEACHER_UID}`)));
    await assertFails(setDoc(doc(db, savedWidget()), { type: 'timer' }));
    await assertFails(deleteDoc(doc(db, savedWidget())));
    await assertFails(
      setDoc(doc(db, `users/${TEACHER_UID}/dashboards/b1`), { name: 'X' })
    );
    await assertFails(
      setDoc(doc(db, `users/${TEACHER_UID}`), { lastLogin: 2 })
    );
    await assertFails(
      setDoc(doc(db, `users/${TEACHER_UID}/userProfile/profile`), { a: 1 })
    );
  });

  it('a claim with no ro field reads as read-only', async () => {
    const db = testEnv
      .authenticatedContext(
        TEACHER_UID,
        token(TEACHER_EMAIL, { by: BOSS_EMAIL, sid: SID, exp: FUTURE() })
      )
      .firestore();
    await assertSucceeds(getDoc(doc(db, savedWidget())));
    await assertFails(setDoc(doc(db, savedWidget()), { type: 'timer' }));
  });

  it('unlocked and live: writes the target', async () => {
    const db = asViewAs({ ro: false }).firestore();
    await assertSucceeds(setDoc(doc(db, savedWidget()), { type: 'timer' }));
    await assertSucceeds(setDoc(doc(db, `users/${TEACHER_UID}`), { a: 1 }));
  });

  it('expired: neither reads nor writes, even unlocked', async () => {
    const db = asViewAs({ ro: false, exp: PAST() }).firestore();
    await assertFails(getDoc(doc(db, savedWidget())));
    await assertFails(getDoc(doc(db, `users/${TEACHER_UID}`)));
    await assertFails(setDoc(doc(db, savedWidget()), { type: 'timer' }));
  });

  it('read-only cannot start or end a live session or drop its students', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `sessions/${TEACHER_UID}/students/k`), {
        pin: '1',
        status: 'active',
        joinedAt: 1,
        lastActive: 1,
      });
    });
    const ro = asViewAs().firestore();
    await assertFails(
      setDoc(doc(ro, `sessions/${TEACHER_UID}`), {
        isActive: true,
      })
    );
    await assertFails(deleteDoc(doc(ro, `sessions/${TEACHER_UID}/students/k`)));
    await assertFails(
      setDoc(
        doc(ro, `sessions/${TEACHER_UID}/students/k`),
        { status: 'frozen' },
        { merge: true }
      )
    );
    const unlocked = asViewAs({ ro: false }).firestore();
    await assertSucceeds(
      setDoc(doc(unlocked, `sessions/${TEACHER_UID}`), {
        isActive: true,
      })
    );
  });

  it('never reaches another user', async () => {
    const db = asViewAs({ ro: false }).firestore();
    await assertFails(getDoc(doc(db, savedWidget('someone-else'))));
  });
});

describe('top-level collections keyed on the caller uid', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'shared_boards/share-1'), {
        originalAuthor: 'someone-else',
        participants: {},
        intendedMode: 'synced',
      });
      await setDoc(doc(ctx.firestore(), 'shared_boards/share-mine'), {
        originalAuthor: TEACHER_UID,
        participants: {},
      });
    });
  });
  const join = (ctx: ReturnType<typeof asViewAs>) =>
    setDoc(
      doc(ctx.firestore(), 'shared_boards/share-1'),
      { participants: { [TEACHER_UID]: true } },
      { merge: true }
    );

  it('read-only cannot self-join a shared board or delete its own share', async () => {
    await assertFails(join(asViewAs()));
    await assertFails(
      deleteDoc(doc(asViewAs().firestore(), 'shared_boards/share-mine'))
    );
  });

  it('the real teacher and an unlocked tab can', async () => {
    await assertSucceeds(join(asTeacher()));
    await assertSucceeds(
      deleteDoc(
        doc(asViewAs({ ro: false }).firestore(), 'shared_boards/share-mine')
      )
    );
  });
});

describe('admin powers under a view-as token', () => {
  it('a real admin still writes admin settings', async () => {
    const db = asAdmin().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'admin_settings/view_as'), { enabled: false })
    );
  });

  it('an admin target reads admin settings but cannot write them', async () => {
    const db = asViewAsAdmin().firestore();
    await assertSucceeds(getDoc(doc(db, 'admin_settings/view_as')));
    await assertFails(
      setDoc(doc(db, 'admin_settings/view_as'), { enabled: false })
    );
  });

  it('an admin target cannot write admin settings even if the claim says unlocked', async () => {
    const db = asViewAsAdmin({ ro: false }).firestore();
    await assertFails(
      setDoc(doc(db, 'admin_settings/view_as'), { enabled: false })
    );
  });

  it('an expired admin target cannot read admin settings', async () => {
    const db = asViewAsAdmin({ exp: PAST() }).firestore();
    await assertFails(getDoc(doc(db, 'admin_settings/view_as')));
  });

  it('a super admin target cannot change org members', async () => {
    const db = testEnv
      .authenticatedContext(
        BOSS_UID,
        token(BOSS_EMAIL, claim({ adminTarget: true, ro: false }))
      )
      .firestore();
    await assertFails(
      setDoc(doc(db, `organizations/orono/members/${TEACHER_EMAIL}`), {
        roleId: 'super_admin',
      })
    );
  });
});

describe('org admin roles under a view-as token', () => {
  it('a building admin target cannot use its org admin powers', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `organizations/orono/members/${TEACHER_EMAIL}`),
        {
          roleId: 'building_admin',
          buildingIds: ['high'],
          status: 'active',
        }
      );
      await setDoc(
        doc(ctx.firestore(), 'organizations/orono/members/kid@orono.k12.mn.us'),
        {
          roleId: 'teacher',
          buildingIds: ['high'],
          status: 'active',
        }
      );
    });
    const real = asTeacher().firestore();
    await assertSucceeds(
      setDoc(
        doc(real, 'organizations/orono/members/kid@orono.k12.mn.us'),
        { status: 'inactive' },
        { merge: true }
      )
    );
    const tab = asViewAs({ ro: false }).firestore();
    await assertFails(
      setDoc(
        doc(tab, 'organizations/orono/members/kid@orono.k12.mn.us'),
        { status: 'active' },
        { merge: true }
      )
    );
  });
});

describe('view_as_sessions', () => {
  it('super admins read; teachers and plain admins do not', async () => {
    await assertSucceeds(
      getDoc(doc(asBoss().firestore(), `view_as_sessions/${SID}`))
    );
    await assertSucceeds(
      getDocs(collection(asBoss().firestore(), 'view_as_sessions'))
    );
    await assertFails(
      getDoc(doc(asTeacher().firestore(), `view_as_sessions/${SID}`))
    );
    await assertFails(
      getDoc(doc(asAdmin().firestore(), `view_as_sessions/${SID}`))
    );
    await assertFails(
      getDoc(doc(asViewAs().firestore(), `view_as_sessions/${SID}`))
    );
  });

  it('nobody writes from a client, super admins included', async () => {
    await assertFails(
      setDoc(doc(asBoss().firestore(), 'view_as_sessions/s2'), {
        by: BOSS_EMAIL,
      })
    );
    await assertFails(
      setDoc(doc(asBoss().firestore(), `view_as_sessions/${SID}`), {
        unlocked: true,
      })
    );
    await assertFails(
      deleteDoc(doc(asBoss().firestore(), `view_as_sessions/${SID}`))
    );
    await assertFails(
      setDoc(
        doc(asViewAs({ ro: false }).firestore(), `view_as_sessions/${SID}`),
        { unlocked: true }
      )
    );
  });
});

describe('admin_audit_log from a view-as tab', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
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
  const log = (ctx: ReturnType<typeof asViewAs>) =>
    collection(ctx.firestore(), 'admin_audit_log');

  it('an unlocked tab logs its own save, approval and outward action', async () => {
    for (const action of [
      'view_as_save',
      'view_as_approve',
      'view_as_outward',
    ]) {
      await assertSucceeds(
        addDoc(log(asViewAs({ ro: false })), entry({ action }))
      );
    }
  });

  it('refuses a read-only or expired tab', async () => {
    await assertFails(addDoc(log(asViewAs()), entry()));
    await assertFails(
      addDoc(log(asViewAs({ ro: false, exp: PAST() })), entry())
    );
  });

  it('refuses lifecycle entries, which only the server writes', async () => {
    for (const action of [
      'view_as_start',
      'view_as_unlock',
      'view_as_end',
      'view_as_revert',
      'user_account_deleted',
    ]) {
      await assertFails(
        addDoc(log(asViewAs({ ro: false })), entry({ action }))
      );
    }
  });

  it('refuses an entry whose identity does not match the claim', async () => {
    const tab = asViewAs({ ro: false });
    await assertFails(addDoc(log(tab), entry({ sid: 'other' })));
    await assertFails(
      addDoc(log(tab), entry({ email: 'someone@orono.k12.mn.us' }))
    );
    await assertFails(addDoc(log(tab), entry({ targetUid: 'other-uid' })));
    await assertFails(
      addDoc(log(tab), entry({ targetEmail: 'x@orono.k12.mn.us' }))
    );
    await assertFails(addDoc(log(tab), entry({ timestamp: 5 })));
    await assertFails(addDoc(log(tab), entry({ extra: true })));
  });

  it('a teacher without the claim cannot log, and view-as tabs cannot read or edit the log', async () => {
    await assertFails(addDoc(log(asTeacher()), entry()));
    await assertFails(
      getDoc(
        doc(asViewAs({ ro: false }).firestore(), 'admin_audit_log/existing')
      )
    );
    await assertFails(
      setDoc(
        doc(asViewAs({ ro: false }).firestore(), 'admin_audit_log/existing'),
        { action: 'y' }
      )
    );
  });

  it('admins still read and append the log', async () => {
    await assertSucceeds(
      getDoc(doc(asAdmin().firestore(), 'admin_audit_log/existing'))
    );
    await assertSucceeds(
      addDoc(collection(asAdmin().firestore(), 'admin_audit_log'), {
        action: 'settings_changed',
      })
    );
  });
});

describe('storage under a view-as token', () => {
  const path = `users/${TEACHER_UID}/stickers/a.png`;
  const put = (ctx: ReturnType<typeof asViewAs>) =>
    uploadBytes(ref(ctx.storage(), path), new Uint8Array(8), {
      contentType: 'image/png',
    });

  it('the real teacher uploads', async () => {
    await assertSucceeds(put(asTeacher()));
  });

  it('read-only reads but cannot upload; unlocked uploads; expired cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), new Uint8Array(8), {
        contentType: 'image/png',
      });
    });
    await assertSucceeds(getBytes(ref(asViewAs().storage(), path)));
    await assertFails(put(asViewAs()));
    await assertSucceeds(put(asViewAs({ ro: false })));
    await assertFails(put(asViewAs({ ro: false, exp: PAST() })));
    await assertFails(getBytes(ref(asViewAs({ exp: PAST() }).storage(), path)));
  });

  // The emulator does not resolve storage's firestore.exists() admin lookup, so
  // only the denial is observable here; the guard sits ahead of that lookup.
  it("an admin target cannot write another user's files", async () => {
    const other = `users/${TEACHER_UID}/backgrounds/b.png`;
    await assertFails(
      uploadBytes(
        ref(asViewAsAdmin({ ro: false }).storage(), other),
        new Uint8Array(8),
        { contentType: 'image/png' }
      )
    );
  });
});

describe('email-keyed self-writes under a view-as token', () => {
  const member = `organizations/orono/members/${TEACHER_EMAIL}`;
  const invite = 'plc_invitations/inv-1';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, member), {
        email: TEACHER_EMAIL,
        orgId: 'orono',
        roleId: 'teacher',
        status: 'active',
        lastActive: '2026-01-01T00:00:00.000Z',
      });
      await setDoc(doc(db, invite), {
        plcId: 'plc-1',
        inviteeEmailLower: TEACHER_EMAIL,
        invitedByUid: 'lead-uid',
        status: 'pending',
      });
    });
  });

  it('the real teacher stamps lastActive and answers an invite', async () => {
    const db = asTeacher().firestore();
    await assertSucceeds(
      setDoc(
        doc(db, member),
        { lastActive: '2026-10-01T00:00:00.000Z' },
        { merge: true }
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, invite),
        { status: 'accepted', respondedAt: 1 },
        { merge: true }
      )
    );
  });

  it('read-only reads both but writes neither', async () => {
    const db = asViewAs().firestore();
    await assertSucceeds(getDoc(doc(db, member)));
    await assertSucceeds(getDoc(doc(db, invite)));
    await assertFails(
      setDoc(
        doc(db, member),
        { lastActive: '2026-10-01T00:00:00.000Z' },
        { merge: true }
      )
    );
    await assertFails(
      setDoc(
        doc(db, invite),
        { status: 'accepted', respondedAt: 1 },
        { merge: true }
      )
    );
  });

  it('expired cannot stamp lastActive even unlocked', async () => {
    const db = asViewAs({ ro: false, exp: PAST() }).firestore();
    await assertFails(
      setDoc(
        doc(db, member),
        { lastActive: '2026-10-01T00:00:00.000Z' },
        { merge: true }
      )
    );
  });
});
