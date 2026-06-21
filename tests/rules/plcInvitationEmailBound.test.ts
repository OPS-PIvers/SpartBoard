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

// ---------------------------------------------------------------------------
// M-1: a lead OR a co-lead may create/revoke invites (membership management,
// not lead-only); a plain member may not. Uses a members-map-shaped PLC so
// isPlcMembershipManager resolves the co-lead via plcRoleOf. Also pins the L-1
// keys().hasOnly schema lock on the invite doc.
// ---------------------------------------------------------------------------
const M1_PLC_ID = 'plc-m1';
const COLEAD_UID = 'colead-uid';
const COLEAD_EMAIL = 'colead@orono.k12.mn.us';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@orono.k12.mn.us';

const m1Member = (uid: string, email: string, role: string) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt: 1,
  status: 'active',
});

const asCoLead = () =>
  testEnv.authenticatedContext(COLEAD_UID, { email: COLEAD_EMAIL }).firestore();
const asPlainMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();

const m1Invite = (inviterUid: string, emailLower: string) => ({
  plcId: M1_PLC_ID,
  plcName: 'M1 PLC',
  inviteeEmailLower: emailLower,
  invitedByUid: inviterUid,
  invitedByName: 'Inviter',
  invitedAt: Date.now(),
  status: 'pending',
});

describe('plc_invitations — manager create gate (M-1: lead OR coLead)', () => {
  const invitee = 'newteacher@orono.k12.mn.us';
  const invitePath = `plc_invitations/${inviteDocId(M1_PLC_ID, invitee)}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `plcs/${M1_PLC_ID}`), {
        id: M1_PLC_ID,
        name: 'M1 PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID],
        memberEmails: {
          [LEAD_UID]: LEAD_EMAIL,
          [COLEAD_UID]: COLEAD_EMAIL,
          [MEMBER_UID]: MEMBER_EMAIL,
        },
        members: {
          [LEAD_UID]: m1Member(LEAD_UID, LEAD_EMAIL, 'lead'),
          [COLEAD_UID]: m1Member(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
          [MEMBER_UID]: m1Member(MEMBER_UID, MEMBER_EMAIL, 'member'),
        },
      });
    });
  });

  it('the lead can create an invite', async () => {
    await assertSucceeds(
      setDoc(doc(asLead(), invitePath), m1Invite(LEAD_UID, invitee))
    );
  });

  it('a co-lead can create an invite (M-1)', async () => {
    await assertSucceeds(
      setDoc(doc(asCoLead(), invitePath), m1Invite(COLEAD_UID, invitee))
    );
  });

  it('a plain member canNOT create an invite', async () => {
    await assertFails(
      setDoc(doc(asPlainMember(), invitePath), m1Invite(MEMBER_UID, invitee))
    );
  });

  it('rejects an invite carrying an unknown extra field (L-1 schema lock)', async () => {
    await assertFails(
      setDoc(doc(asLead(), invitePath), {
        ...m1Invite(LEAD_UID, invitee),
        sneaky: 'unexpected',
      })
    );
  });
});
