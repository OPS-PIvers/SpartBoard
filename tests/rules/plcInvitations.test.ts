// Firestore security rules regression coverage for `plc_invitations/{inviteId}`.
// Pins the create-side hardening added for finding F24: the invitee email
// (`inviteeEmailLower`) must be a string bounded to <= 255 chars, mirroring the
// size validation other collections apply (rollout_requests, admin_backgrounds).
// Without the bound a PLC lead could write an unbounded string into the invite,
// so this suite asserts:
//   - A normal-length invite from the PLC lead still succeeds.
//   - An over-limit invitee email is rejected, even from the lead.
//
// The create rule additionally requires `invitedByUid` to equal the caller,
// the parent PLC's `leadUid` to equal the caller, and the doc id to match the
// deterministic `plcId + '_' + inviteeEmailLower` format — all preserved here
// so the size bound is the only thing under test for the negative case.
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
import { setDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-invitations-rules';
const PLC_ID = 'plc-invitations-test';

const LEAD_UID = 'lead-uid-plci';
const LEAD_EMAIL = 'lead@example.com';
const NON_LEAD_UID = 'member-uid-plci';
const NON_LEAD_EMAIL = 'member@example.com';

const INVITEE_EMAIL = 'invitee@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();

const asNonLead = () =>
  testEnv
    .authenticatedContext(NON_LEAD_UID, { email: NON_LEAD_EMAIL })
    .firestore();

// Mirrors `plcInviteDocId(plcId, emailLower)` in firestore.rules — the create
// rule forces the doc id to this deterministic format.
const inviteDocId = (plcId: string, emailLower: string) =>
  `${plcId}_${emailLower}`;

// The invite shape the app writes (see hooks/usePlcInvitations.ts `sendInvite`).
const validInvite = (overrides: Record<string, unknown> = {}) => ({
  plcId: PLC_ID,
  plcName: 'Test PLC',
  inviteeEmailLower: INVITEE_EMAIL,
  invitedByUid: LEAD_UID,
  invitedByName: 'Lead Teacher',
  invitedAt: 1000,
  status: 'pending',
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
  // Seed the parent PLC so the create rule's leadUid get() resolves.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID],
      memberEmails: { [LEAD_UID]: LEAD_EMAIL },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Create — inviteeEmailLower size bound (F24)
// ---------------------------------------------------------------------------

describe('plc_invitations — create (email length bound)', () => {
  it('PLC lead can create an invite with a normal-length email', async () => {
    await assertSucceeds(
      setDoc(
        doc(asLead(), `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`),
        validInvite()
      )
    );
  });

  it('rejects an invite whose inviteeEmailLower exceeds 255 chars', async () => {
    // 246-char local part + "@example.com" (12) = 258 chars > 255.
    const overLimitEmail = `${'a'.repeat(246)}@example.com`;
    await assertFails(
      setDoc(
        doc(asLead(), `plc_invitations/${inviteDocId(PLC_ID, overLimitEmail)}`),
        validInvite({ inviteeEmailLower: overLimitEmail })
      )
    );
  });

  it('accepts an invite whose inviteeEmailLower is exactly 255 chars', async () => {
    // 243-char local part + "@example.com" (12) = 255 chars (boundary).
    const boundaryEmail = `${'a'.repeat(243)}@example.com`;
    await assertSucceeds(
      setDoc(
        doc(asLead(), `plc_invitations/${inviteDocId(PLC_ID, boundaryEmail)}`),
        validInvite({ inviteeEmailLower: boundaryEmail })
      )
    );
  });

  it('a non-lead cannot create an invite (authz unchanged by the bound)', async () => {
    await assertFails(
      setDoc(
        doc(
          asNonLead(),
          `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`
        ),
        validInvite({ invitedByUid: NON_LEAD_UID })
      )
    );
  });
});
