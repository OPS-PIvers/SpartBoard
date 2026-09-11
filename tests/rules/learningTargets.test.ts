// Firestore security-rules regression for the learning-targets feature
// (docs/plans/QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md §5):
//   - /standards_catalog/{id}: any authed read, admin-only write
//   - /plcs/{plcId}/meta/learningTargets: member reads, non-viewer writes,
//     schema lock-down, 1,000-target cap, masteryCutoffs range, no delete
//   - /users/{uid}/userProfile/learningTargets: owner-only (existing rule)
//   - /admin_settings/subjects: any authed read, admin-only write
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-learning-targets';
const PLC_ID = 'plc-targets-rules-test';
const ADMIN_EMAIL = 'admin@example.com';

const ADMIN_UID = 'admin-uid';
const MEMBER_UID = 'member-uid';
const VIEWER_UID = 'viewer-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
    .firestore();

const asViewer = () =>
  testEnv
    .authenticatedContext(VIEWER_UID, { email: 'viewer@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'random@example.com' })
    .firestore();

const META_PATH = `plcs/${PLC_ID}/meta/learningTargets`;

const target = (i: number) => ({
  id: `t-${i}`,
  label: `Target ${i}`,
  createdAt: 1,
  updatedAt: 1,
});

const validList = (overrides: Record<string, unknown> = {}) => ({
  targets: [target(1)],
  updatedAt: 1000,
  ...overrides,
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
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID, VIEWER_UID],
      memberEmails: {
        [MEMBER_UID]: 'member@example.com',
        [VIEWER_UID]: 'viewer@example.com',
      },
      members: {
        [MEMBER_UID]: { role: 'lead' },
        [VIEWER_UID]: { role: 'viewer' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

describe('standards_catalog', () => {
  const benchmark = {
    id: 'mn-ela-2020:2.2.1.1',
    set: 'mn-ela-2020',
    subject: 'ela',
    code: '2.2.1.1',
    grade: '2',
    strand: 'Writing',
    standard: 'W1',
    text: 'Write.',
    searchText: '2.2.1.1 write.',
  };

  it('admin can seed; a teacher cannot write', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'standards_catalog/mn-ela-2020:2.2.1.1'), benchmark)
    );
    await assertFails(
      setDoc(
        doc(asMember(), 'standards_catalog/mn-ela-2020:2.2.1.2'),
        benchmark
      )
    );
  });

  it('any authed user can read; anonymous cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'standards_catalog/mn-ela-2020:2.2.1.1'),
        benchmark
      );
    });
    await assertSucceeds(
      getDoc(doc(asNonMember(), 'standards_catalog/mn-ela-2020:2.2.1.1'))
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'standards_catalog/mn-ela-2020:2.2.1.1'
        )
      )
    );
  });
});

describe('plcs/{plcId}/meta/learningTargets', () => {
  it('member creates and updates; viewer and non-member cannot', async () => {
    await assertSucceeds(setDoc(doc(asMember(), META_PATH), validList()));
    await assertSucceeds(
      setDoc(
        doc(asMember(), META_PATH),
        validList({ targets: [target(1), target(2)], updatedAt: 2000 })
      )
    );
    await assertFails(setDoc(doc(asViewer(), META_PATH), validList()));
    await assertFails(setDoc(doc(asNonMember(), META_PATH), validList()));
  });

  it('members (including viewers) read; non-members cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), META_PATH), validList());
    });
    await assertSucceeds(getDoc(doc(asViewer(), META_PATH)));
    await assertFails(getDoc(doc(asNonMember(), META_PATH)));
  });

  it('only the learningTargets doc id is writable under meta', async () => {
    await assertFails(
      setDoc(doc(asMember(), `plcs/${PLC_ID}/meta/other`), validList())
    );
  });

  it('rejects extra keys, non-list targets, missing updatedAt', async () => {
    await assertFails(
      setDoc(doc(asMember(), META_PATH), validList({ extra: true }))
    );
    await assertFails(
      setDoc(doc(asMember(), META_PATH), validList({ targets: 'nope' }))
    );
    await assertFails(
      setDoc(doc(asMember(), META_PATH), { targets: [target(1)] })
    );
  });

  it('caps the list at 1,000 targets', async () => {
    const thousand = Array.from({ length: 1000 }, (_, i) => target(i));
    await assertSucceeds(
      setDoc(doc(asMember(), META_PATH), validList({ targets: thousand }))
    );
    await assertFails(
      setDoc(
        doc(asMember(), META_PATH),
        validList({ targets: [...thousand, target(1000)] })
      )
    );
  });

  it('validates masteryCutoffs shape and range', async () => {
    await assertSucceeds(
      setDoc(
        doc(asMember(), META_PATH),
        validList({ masteryCutoffs: { proficient: 80, approaching: 60 } })
      )
    );
    await assertFails(
      setDoc(
        doc(asMember(), META_PATH),
        validList({ masteryCutoffs: { proficient: 60, approaching: 80 } })
      )
    );
    await assertFails(
      setDoc(
        doc(asMember(), META_PATH),
        validList({ masteryCutoffs: { proficient: 101, approaching: 60 } })
      )
    );
    await assertFails(
      setDoc(
        doc(asMember(), META_PATH),
        validList({
          masteryCutoffs: { proficient: 80, approaching: 60, extra: 1 },
        })
      )
    );
  });

  it('nobody deletes the doc, not even a lead', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), META_PATH), validList());
    });
    await assertFails(deleteDoc(doc(asMember(), META_PATH)));
  });
});

describe('users/{uid}/userProfile/learningTargets', () => {
  it('owner reads and writes; another user cannot', async () => {
    const path = `users/${MEMBER_UID}/userProfile/learningTargets`;
    await assertSucceeds(setDoc(doc(asMember(), path), validList()));
    await assertSucceeds(getDoc(doc(asMember(), path)));
    await assertFails(getDoc(doc(asNonMember(), path)));
    await assertFails(setDoc(doc(asNonMember(), path), validList()));
  });
});

describe('admin_settings/subjects', () => {
  const subjectsDoc = {
    subjects: [{ id: 'ela', label: 'English Language Arts' }],
    updatedAt: 1,
  };

  it('admins write; teachers cannot', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'admin_settings/subjects'), subjectsDoc)
    );
    await assertFails(
      setDoc(doc(asMember(), 'admin_settings/subjects'), subjectsDoc)
    );
  });

  it('any authed user reads subjects but not other admin settings', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'admin_settings/subjects'),
        subjectsDoc
      );
      await setDoc(doc(ctx.firestore(), 'admin_settings/app_settings'), {
        x: 1,
      });
    });
    await assertSucceeds(getDoc(doc(asMember(), 'admin_settings/subjects')));
    await assertFails(getDoc(doc(asMember(), 'admin_settings/app_settings')));
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'admin_settings/subjects'
        )
      )
    );
  });
});
