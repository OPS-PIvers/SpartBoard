// A deactivated operator-org member loses /admins grants (AB-141) and PLC access (AB-146);
// active members and an /admins doc with no operator-org member doc keep theirs.
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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-deactivated-admins-plc';
const ACTIVE = 'active.admin@orono.k12.mn.us';
const INACTIVE = 'inactive.admin@orono.k12.mn.us';
const NOORG = 'admin@elsewhere.edu';
const PLC_ID = 'plc-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const uidFor = (email: string) => `uid-${email}`;
const as = (email: string) =>
  testEnv
    .authenticatedContext(uidFor(email), {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const seed = async (path: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

const CASES = [
  { name: 'active', email: ACTIVE, allowed: true },
  { name: 'no operator-org doc', email: NOORG, allowed: true },
  { name: 'deactivated', email: INACTIVE, allowed: false },
] as const;

const expectRule = (allowed: boolean, p: Promise<unknown>) =>
  allowed ? assertSucceeds(p) : assertFails(p);

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
  await seed(`organizations/orono/members/${ACTIVE}`, {
    email: ACTIVE,
    roleId: 'teacher',
    status: 'active',
  });
  await seed(`organizations/orono/members/${INACTIVE}`, {
    email: INACTIVE,
    roleId: 'teacher',
    status: 'inactive',
  });
  for (const email of [ACTIVE, INACTIVE, NOORG]) {
    await seed(`admins/${email}`, {});
  }
  await seed('admin_settings/batch_probe', { enabled: true });
  const uids = [ACTIVE, INACTIVE, NOORG].map(uidFor);
  await seed(`plcs/${PLC_ID}`, {
    name: 'Grade 7 Math',
    leadUid: uidFor(INACTIVE),
    memberUids: uids,
    members: Object.fromEntries(
      uids.map((u, i) => [
        u,
        { role: i === 1 ? 'lead' : 'member', status: 'active' },
      ])
    ),
  });
  await seed(`plcs/${PLC_ID}/notes/n1`, {
    id: 'n1',
    title: 'Agenda',
    body: '',
    createdBy: uidFor(ACTIVE),
    createdAt: 1,
    lastEditedBy: uidFor(ACTIVE),
    lastEditedAt: 1,
  });
});

describe('a deactivated member loses /admins grants', () => {
  for (const c of CASES) {
    it(`${c.name}: reads admin settings and writes a global permission`, async () => {
      const db = as(c.email);
      await expectRule(
        c.allowed,
        getDoc(doc(db, 'admin_settings/batch_probe'))
      );
      await expectRule(
        c.allowed,
        setDoc(doc(db, 'global_permissions/some-feature'), {
          enabled: true,
          accessLevel: 'admin',
        })
      );
    });
  }
});

describe('a deactivated member loses PLC access', () => {
  for (const c of CASES) {
    it(`${c.name}: reads the group, lists their groups, reads and edits notes`, async () => {
      const db = as(c.email);
      await expectRule(c.allowed, getDoc(doc(db, `plcs/${PLC_ID}`)));
      await expectRule(
        c.allowed,
        getDocs(
          query(
            collection(db, 'plcs'),
            where('memberUids', 'array-contains', uidFor(c.email))
          )
        )
      );
      await expectRule(c.allowed, getDoc(doc(db, `plcs/${PLC_ID}/notes/n1`)));
      await expectRule(
        c.allowed,
        updateDoc(doc(db, `plcs/${PLC_ID}/notes/n1`), {
          title: 'Agenda v2',
          lastEditedBy: uidFor(c.email),
          lastEditedAt: 2,
        })
      );
    });
  }

  it('a deactivated lead cannot manage membership', async () => {
    await assertFails(
      updateDoc(doc(as(INACTIVE), `plcs/${PLC_ID}`), {
        memberUids: [uidFor(INACTIVE)],
      })
    );
    await assertFails(deleteDoc(doc(as(INACTIVE), `plcs/${PLC_ID}`)));
  });
});
