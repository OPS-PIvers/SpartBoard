// Firestore security-rules regression for the PLC pooling link on
// `quiz_sessions/{sessionId}` (docs/plans/PLC_ASSESSMENT_DATA.md §3.1 / §4).
//
// A session may carry `plcId` + `syncGroupId` so the recompute function can
// pool results across a PLC. The rule pins:
//   - create with a link requires the caller to be in `plcs/{plcId}.memberUids`
//     AND a non-empty `syncGroupId`
//   - update that sets or changes `plcId` re-runs the same gate; clearing it
//     (or leaving it unchanged) needs no PLC read
//   - writes stay owner-only, so a different member cannot link (or unlink)
//     someone else's session
//   - D12 retroactive link: the owner may clear the link, or move it to
//     another PLC they belong to; moving it to a PLC they are not in is denied
//   - plain sessions without `plcId` behave exactly as before
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
import { setDoc, updateDoc, deleteField, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-quiz-session-plc-link';
const PLC_ID = 'plc-link-test';
const OTHER_PLC_ID = 'plc-link-other';
const SECOND_PLC_ID = 'plc-link-second';
const SESSION_ID = 'session-link-test';
const SYNC_GROUP_ID = 'sync-group-1';

const MEMBER_UID = 'member-teacher-uid';
const OTHER_MEMBER_UID = 'other-member-teacher-uid';
const NON_MEMBER_UID = 'non-member-teacher-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMember = () =>
  testEnv
    .authenticatedContext(MEMBER_UID, { email: 'member@example.com' })
    .firestore();

const asOtherMember = () =>
  testEnv
    .authenticatedContext(OTHER_MEMBER_UID, { email: 'other@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'nonmember@example.com' })
    .firestore();

const sessionRef = (db: ReturnType<typeof asMember>) =>
  doc(db, `quiz_sessions/${SESSION_ID}`);

// Minimal owner-authored session payload; the link fields are layered on top.
const baseSession = (
  teacherUid: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  teacherUid,
  status: 'active',
  code: 'LNKTST',
  ...overrides,
});

const linkedSession = (
  teacherUid: string,
  overrides: Record<string, unknown> = {}
) =>
  baseSession(teacherUid, {
    plcId: PLC_ID,
    syncGroupId: SYNC_GROUP_ID,
    plcLinkedAt: 1000,
    ...overrides,
  });

const seedSession = async (data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), data);
  });
};

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
  // Two PLCs: the caller belongs to PLC_ID only, so OTHER_PLC_ID exercises the
  // "changed plcId re-runs the gate" path against a PLC they are not in.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID, OTHER_MEMBER_UID],
      memberEmails: {
        [MEMBER_UID]: 'member@example.com',
        [OTHER_MEMBER_UID]: 'other@example.com',
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `plcs/${OTHER_PLC_ID}`), {
      name: 'Other PLC',
      leadUid: NON_MEMBER_UID,
      memberUids: [NON_MEMBER_UID],
      memberEmails: { [NON_MEMBER_UID]: 'nonmember@example.com' },
      createdAt: 1,
      updatedAt: 1,
    });
    // A second PLC the caller also belongs to, for the "switch pools" path.
    await setDoc(doc(db, `plcs/${SECOND_PLC_ID}`), {
      name: 'Second PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: 'member@example.com' },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('quiz_sessions — create with a PLC link', () => {
  it('a PLC member creates a session linked to their PLC', async () => {
    await assertSucceeds(
      setDoc(sessionRef(asMember()), linkedSession(MEMBER_UID))
    );
  });

  it('rejects a link to a PLC the teacher is not a member of', async () => {
    await assertFails(
      setDoc(sessionRef(asNonMember()), linkedSession(NON_MEMBER_UID))
    );
  });

  it('rejects a link to a PLC that does not exist', async () => {
    await assertFails(
      setDoc(
        sessionRef(asMember()),
        linkedSession(MEMBER_UID, { plcId: 'no-such-plc' })
      )
    );
  });

  it('rejects a member link with an empty syncGroupId', async () => {
    await assertFails(
      setDoc(
        sessionRef(asMember()),
        linkedSession(MEMBER_UID, { syncGroupId: '' })
      )
    );
  });

  it('rejects a member link with syncGroupId missing', async () => {
    const { syncGroupId: _s, ...noGroup } = linkedSession(MEMBER_UID);
    await assertFails(setDoc(sessionRef(asMember()), noGroup));
  });

  it('rejects a member link with an empty plcId', async () => {
    await assertFails(
      setDoc(sessionRef(asMember()), linkedSession(MEMBER_UID, { plcId: '' }))
    );
  });

  it('rejects a non-string plcId', async () => {
    await assertFails(
      setDoc(sessionRef(asMember()), linkedSession(MEMBER_UID, { plcId: 42 }))
    );
  });

  it('still rejects a linked create whose teacherUid is not the caller', async () => {
    await assertFails(
      setDoc(sessionRef(asMember()), linkedSession(OTHER_MEMBER_UID))
    );
  });

  it('a plain session without plcId still creates as before', async () => {
    await assertSucceeds(
      setDoc(sessionRef(asNonMember()), baseSession(NON_MEMBER_UID))
    );
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('quiz_sessions — update the PLC link', () => {
  it('owner adds a valid link to a previously plain session', async () => {
    await seedSession(baseSession(MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asMember()), {
        plcId: PLC_ID,
        syncGroupId: SYNC_GROUP_ID,
        plcLinkedAt: 2000,
      })
    );
  });

  it('owner cannot add a link to a PLC they are not in', async () => {
    await seedSession(baseSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asMember()), {
        plcId: OTHER_PLC_ID,
        syncGroupId: SYNC_GROUP_ID,
      })
    );
  });

  it('owner cannot add a link without a syncGroupId', async () => {
    await seedSession(baseSession(MEMBER_UID));
    await assertFails(updateDoc(sessionRef(asMember()), { plcId: PLC_ID }));
  });

  it('owner cannot retarget an existing link to a PLC they are not in', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asMember()), { plcId: OTHER_PLC_ID })
    );
  });

  it('a different PLC member cannot link someone else’s session (owner-only writes)', async () => {
    await seedSession(baseSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asOtherMember()), {
        plcId: PLC_ID,
        syncGroupId: SYNC_GROUP_ID,
      })
    );
  });

  it('a different PLC member cannot clear someone else’s link', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asOtherMember()), { plcId: deleteField() })
    );
  });

  it('owner clears plcId via deleteField', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asMember()), {
        plcId: deleteField(),
        syncGroupId: deleteField(),
        plcLinkedAt: deleteField(),
      })
    );
  });

  it('owner clears plcId by setting it to null', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertSucceeds(updateDoc(sessionRef(asMember()), { plcId: null }));
  });

  it('owner edits an unrelated field on a linked session without re-linking', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asMember()), { status: 'closed' })
    );
  });

  it('owner who has since left the PLC can still edit unrelated fields (unchanged plcId skips the gate)', async () => {
    await seedSession(linkedSession(NON_MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asNonMember()), { status: 'closed' })
    );
  });

  it('a plain session without plcId still updates as before', async () => {
    await seedSession(baseSession(NON_MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asNonMember()), { status: 'closed' })
    );
  });
});

// ---------------------------------------------------------------------------
// D12: retroactive share / stop sharing (owner-only, membership re-checked)
// ---------------------------------------------------------------------------

describe('quiz_sessions — retroactive PLC link (D12)', () => {
  it('owner links an existing plain session and re-keys the pool in one write', async () => {
    await seedSession(baseSession(MEMBER_UID, { status: 'inactive' }));
    await assertSucceeds(
      updateDoc(sessionRef(asMember()), {
        plcId: PLC_ID,
        syncGroupId: 'library-pool-group',
        plcLinkedAt: 3000,
      })
    );
  });

  it('owner moves the link to another PLC they belong to', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asMember()), {
        plcId: SECOND_PLC_ID,
        syncGroupId: 'second-pool-group',
        plcLinkedAt: 3000,
      })
    );
  });

  it('owner cannot move the link to a PLC they are not in', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asMember()), {
        plcId: OTHER_PLC_ID,
        syncGroupId: 'other-pool-group',
        plcLinkedAt: 3000,
      })
    );
  });

  it('owner cannot move the link while emptying the pool key', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asMember()), {
        plcId: SECOND_PLC_ID,
        syncGroupId: '',
      })
    );
  });

  it('owner clears all three link fields (stop sharing)', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asMember()), {
        plcId: deleteField(),
        syncGroupId: deleteField(),
        plcLinkedAt: deleteField(),
      })
    );
  });

  it('owner who has since left the PLC can still stop sharing', async () => {
    await seedSession(linkedSession(NON_MEMBER_UID));
    await assertSucceeds(
      updateDoc(sessionRef(asNonMember()), {
        plcId: deleteField(),
        syncGroupId: deleteField(),
        plcLinkedAt: deleteField(),
      })
    );
  });

  it('a non-owner PLC member cannot stop sharing someone else’s session', async () => {
    await seedSession(linkedSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asOtherMember()), {
        plcId: deleteField(),
        syncGroupId: deleteField(),
        plcLinkedAt: deleteField(),
      })
    );
  });

  it('a non-owner cannot retroactively link someone else’s session to a PLC they share', async () => {
    await seedSession(baseSession(MEMBER_UID));
    await assertFails(
      updateDoc(sessionRef(asOtherMember()), {
        plcId: PLC_ID,
        syncGroupId: SYNC_GROUP_ID,
        plcLinkedAt: 3000,
      })
    );
  });
});
