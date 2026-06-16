// Firestore security-rules tests for the plc_invitations email length bound (F24).
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps this file in `firebase emulators:exec --only firestore`.
//
// Covers the `request.resource.data.inviteeEmailLower.size() <= 255` bound on
// the lead create/update rule: a normal-length invite still succeeds, while a
// pathologically oversized email is rejected on both create and update.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-rules-test';
const PLC_ID = 'plc-1';
const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@orono.k12.mn.us';

// Deterministic invite doc id format mirrors plcInviteDocId() in firestore.rules.
const inviteDocId = (plcId: string, emailLower: string) =>
  `${plcId}_${emailLower}`;

// ESM-safe path resolution — the repo is `"type": "module"`.
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

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
    // PLC root doc: the create/update rule requires leadUid == caller uid.
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      id: PLC_ID,
      name: 'Math PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID],
      memberEmails: [LEAD_EMAIL],
    });
  });
});

const asLead = () =>
  testEnv.authenticatedContext(LEAD_UID, { email: LEAD_EMAIL }).firestore();

const inviteDoc = (emailLower: string) => ({
  plcId: PLC_ID,
  plcName: 'Math PLC',
  inviteeEmailLower: emailLower,
  invitedByUid: LEAD_UID,
  invitedByName: 'Lead Teacher',
  invitedAt: Date.now(),
  status: 'pending',
});

describe('plc_invitations — invitee email length bound (F24)', () => {
  it('lead can create an invite with a normal-length email', async () => {
    const email = 'invitee@orono.k12.mn.us';
    await assertSucceeds(
      setDoc(
        doc(asLead(), `plc_invitations/${inviteDocId(PLC_ID, email)}`),
        inviteDoc(email)
      )
    );
  });

  it('lead can create an invite at the 255-char boundary', async () => {
    // Build a syntactically-shaped email exactly 255 chars long.
    const local = 'a'.repeat(255 - '@orono.k12.mn.us'.length);
    const email = `${local}@orono.k12.mn.us`;
    // Sanity: exactly at the limit.
    if (email.length !== 255) {
      throw new Error(`expected 255-char email, got ${email.length}`);
    }
    await assertSucceeds(
      setDoc(
        doc(asLead(), `plc_invitations/${inviteDocId(PLC_ID, email)}`),
        inviteDoc(email)
      )
    );
  });

  it('lead cannot create an invite with an over-limit email (256 chars)', async () => {
    const local = 'a'.repeat(256 - '@orono.k12.mn.us'.length);
    const email = `${local}@orono.k12.mn.us`;
    if (email.length !== 256) {
      throw new Error(`expected 256-char email, got ${email.length}`);
    }
    await assertFails(
      setDoc(
        doc(asLead(), `plc_invitations/${inviteDocId(PLC_ID, email)}`),
        inviteDoc(email)
      )
    );
  });

  it('lead cannot update an existing invite that carries an over-limit email', async () => {
    // Seed an over-limit invite *at its own path* with rules disabled, then
    // attempt a lead overwrite of that same doc. Because the doc already
    // exists, this exercises the `update` branch of `allow create, update`
    // (not `create`). The doc id is derived from the over-limit email so the
    // plcInviteDocId() id check passes and the `size() <= 255` length bound is
    // what rejects the write.
    const local = 'a'.repeat(300 - '@orono.k12.mn.us'.length);
    const overEmail = `${local}@orono.k12.mn.us`;
    const overPath = `plc_invitations/${inviteDocId(PLC_ID, overEmail)}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), overPath), inviteDoc(overEmail));
    });

    await assertFails(
      setDoc(doc(asLead(), overPath), {
        ...inviteDoc(overEmail),
        plcName: 'Math PLC (renamed)',
      })
    );
  });
});
