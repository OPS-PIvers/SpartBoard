// Firestore security-rules regression for `/plcs/{plcId}/rubrics/{id}`
// (M12 Phase 3-I — PLC Rubric Library). Mirrors the plcQuizzes invariants:
//   - membership-gated reads
//   - non-viewer members create / update / delete (PLC-owned model)
//   - schema lock-down (`keys().hasOnly([...])`)
//   - identity + attribution immutable on update (`id`, `sharedBy`,
//     `sharedByEmail`, `sharedByName`, `sharedAt`, `createdAt`)
//   - `sharedBy` must equal the caller on create (no impersonation)
//   - viewer-role members are denied writes (plcCanEditContent)
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
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-rubrics';
const PLC_ID = 'plc-rubrics-rules-test';
const PLC_RUBRIC_ID = 'plc-rubric-rules-test';

const MEMBER_A_UID = 'member-a-uid';
const MEMBER_B_UID = 'member-b-uid';
const VIEWER_UID = 'viewer-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMemberA = () =>
  testEnv
    .authenticatedContext(MEMBER_A_UID, { email: 'member-a@example.com' })
    .firestore();

const asMemberB = () =>
  testEnv
    .authenticatedContext(MEMBER_B_UID, { email: 'member-b@example.com' })
    .firestore();

const asViewer = () =>
  testEnv
    .authenticatedContext(VIEWER_UID, { email: 'viewer@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'random@example.com' })
    .firestore();

const validEntry = (overrides: Record<string, unknown> = {}) => ({
  id: PLC_RUBRIC_ID,
  title: 'AP Lang DBQ Rubric',
  description: 'Document-based question rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Thesis & Argument',
      levels: [
        { id: 'l1', label: 'Below', points: 1 },
        { id: 'l2', label: 'Meets', points: 3 },
      ],
    },
  ],
  createdAt: 500,
  updatedAt: 1000,
  sharedBy: MEMBER_A_UID,
  sharedByEmail: 'member-a@example.com',
  sharedByName: 'Member A',
  sharedAt: 1000,
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
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_A_UID,
      memberUids: [MEMBER_A_UID, MEMBER_B_UID, VIEWER_UID],
      members: {
        [MEMBER_A_UID]: { role: 'lead' },
        [MEMBER_B_UID]: { role: 'member' },
        [VIEWER_UID]: { role: 'viewer' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

const rubricPath = `plcs/${PLC_ID}/rubrics/${PLC_RUBRIC_ID}`;

describe('plcs/{plcId}/rubrics — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), rubricPath), validEntry());
    });
  });

  it('a PLC member can read entries', async () => {
    await assertSucceeds(getDoc(doc(asMemberB(), rubricPath)));
  });

  it('a viewer-role member can read entries', async () => {
    await assertSucceeds(getDoc(doc(asViewer(), rubricPath)));
  });

  it('a non-member cannot read entries (membership gate)', async () => {
    await assertFails(getDoc(doc(asNonMember(), rubricPath)));
  });
});

describe('plcs/{plcId}/rubrics — create', () => {
  it('a non-viewer member can create a valid entry', async () => {
    await assertSucceeds(setDoc(doc(asMemberA(), rubricPath), validEntry()));
  });

  it('a viewer-role member cannot create (plcCanEditContent)', async () => {
    await assertFails(
      setDoc(
        doc(asViewer(), rubricPath),
        validEntry({
          sharedBy: VIEWER_UID,
          sharedByEmail: 'viewer@example.com',
          sharedByName: 'Viewer',
        })
      )
    );
  });

  it('a non-member cannot fabricate an entry', async () => {
    await assertFails(
      setDoc(
        doc(asNonMember(), rubricPath),
        validEntry({ sharedBy: NON_MEMBER_UID })
      )
    );
  });

  it('rejects when sharedBy != caller (no impersonation)', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), rubricPath),
        validEntry({ sharedBy: MEMBER_B_UID })
      )
    );
  });

  it('rejects when path id != entry.id (path/payload mismatch)', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), `plcs/${PLC_ID}/rubrics/different-id`),
        validEntry({ id: PLC_RUBRIC_ID })
      )
    );
  });

  it('rejects extra unknown fields (schema lock-down)', async () => {
    await assertFails(
      setDoc(doc(asMemberA(), rubricPath), {
        ...validEntry(),
        unexpected: 'extra',
      })
    );
  });

  it('rejects non-list criteria', async () => {
    await assertFails(
      setDoc(
        doc(asMemberA(), rubricPath),
        validEntry({ criteria: 'not-a-list' })
      )
    );
  });
});

describe('plcs/{plcId}/rubrics — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), rubricPath), validEntry());
    });
  });

  it('any non-viewer member can mirror content fields', async () => {
    await assertSucceeds(
      updateDoc(doc(asMemberB(), rubricPath), {
        title: 'Renamed',
        criteria: [],
        updatedAt: 2000,
      })
    );
  });

  it('a viewer-role member cannot update', async () => {
    await assertFails(
      updateDoc(doc(asViewer(), rubricPath), { title: 'Hijacked' })
    );
  });

  it('rejects an attempt to change sharedBy (attribution immutability)', async () => {
    await assertFails(
      updateDoc(doc(asMemberB(), rubricPath), { sharedBy: MEMBER_B_UID })
    );
  });

  it('rejects an attempt to mutate id (immutability)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), rubricPath), { id: 'different-id' })
    );
  });

  it('rejects an attempt to mutate sharedAt (immutability)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), rubricPath), { sharedAt: 9999999 })
    );
  });

  it('rejects an attempt to mutate createdAt (immutability)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), rubricPath), { createdAt: 9999999 })
    );
  });

  it('rejects an update introducing an extra field (schema lock-down)', async () => {
    await assertFails(
      updateDoc(doc(asMemberA(), rubricPath), { unexpected: 'extra-field' })
    );
  });

  it('a non-member cannot update an entry', async () => {
    await assertFails(
      updateDoc(doc(asNonMember(), rubricPath), { title: 'Hijacked' })
    );
  });
});

describe('plcs/{plcId}/rubrics — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), rubricPath), validEntry());
    });
  });

  it('the original sharer can unshare', async () => {
    await assertSucceeds(deleteDoc(doc(asMemberA(), rubricPath)));
  });

  it('any non-viewer teammate can unshare (PLC-owned model)', async () => {
    await assertSucceeds(deleteDoc(doc(asMemberB(), rubricPath)));
  });

  it('a viewer-role member cannot delete', async () => {
    await assertFails(deleteDoc(doc(asViewer(), rubricPath)));
  });

  it('a non-member cannot delete', async () => {
    await assertFails(deleteDoc(doc(asNonMember(), rubricPath)));
  });
});
