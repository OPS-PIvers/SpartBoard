// Firestore security-rules tests for dissolving a PLC with pending invites.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
//
// deletePlc (hooks/usePlcs.ts) lists every invite for the PLC by plcId, then
// deletes them in the same batch as the PLC doc. The list query must pass for
// the lead and co-leads, and stay closed to plain members and outsiders.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-delete-invites';
const PLC_ID = 'plc-1';
const OTHER_PLC_ID = 'plc-2';
const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@orono.k12.mn.us';
const COLEAD_UID = 'colead-uid';
const COLEAD_EMAIL = 'colead@orono.k12.mn.us';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@orono.k12.mn.us';
const OUTSIDER_UID = 'outsider-uid';
const OUTSIDER_EMAIL = 'outsider@orono.k12.mn.us';
const ORG_ID = 'org-orono';
const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
const OTHER_ADMIN_UID = 'other-admin-uid';
const OTHER_ADMIN_EMAIL = 'admin@elsewhere.org';
const INVITEE_A = 'a@orono.k12.mn.us';
const INVITEE_B = 'b@orono.k12.mn.us';

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

const invite = (plcId: string, email: string, invitedByUid: string) => ({
  plcId,
  plcName: 'Math PLC',
  inviteeEmailLower: email,
  invitedByUid,
  invitedByName: 'Someone',
  invitedAt: Date.now(),
  status: 'pending',
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      id: PLC_ID,
      name: 'Math PLC',
      orgId: ORG_ID,
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, COLEAD_UID, MEMBER_UID],
      members: {
        [LEAD_UID]: { role: 'lead', status: 'active' },
        [COLEAD_UID]: { role: 'coLead', status: 'active' },
        [MEMBER_UID]: { role: 'member', status: 'active' },
      },
    });
    await setDoc(doc(db, `plcs/${OTHER_PLC_ID}`), {
      id: OTHER_PLC_ID,
      name: 'Other PLC',
      leadUid: OUTSIDER_UID,
      memberUids: [OUTSIDER_UID],
    });
    // Both are site admins; only ADMIN belongs to the PLC's org.
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });
    await setDoc(doc(db, `admins/${OTHER_ADMIN_EMAIL}`), {
      email: OTHER_ADMIN_EMAIL,
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ADMIN_EMAIL}`), {
      email: ADMIN_EMAIL,
    });
    // One invite sent by the lead, one by the co-lead.
    await setDoc(
      doc(db, `plc_invitations/${PLC_ID}_${INVITEE_A}`),
      invite(PLC_ID, INVITEE_A, LEAD_UID)
    );
    await setDoc(
      doc(db, `plc_invitations/${PLC_ID}_${INVITEE_B}`),
      invite(PLC_ID, INVITEE_B, COLEAD_UID)
    );
    await setDoc(
      doc(db, `plc_invitations/${OTHER_PLC_ID}_${INVITEE_A}`),
      invite(OTHER_PLC_ID, INVITEE_A, OUTSIDER_UID)
    );
  });
});

const as = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();

type Db = ReturnType<typeof as>;

const invitesFor = (db: Db, plcId: string) =>
  getDocs(
    query(collection(db, 'plc_invitations'), where('plcId', '==', plcId))
  );

// Mirrors deletePlc: list invites by plcId, then batch-delete them with the PLC.
const dissolve = async (db: Db, plcId: string) => {
  const snap = await invitesFor(db, plcId);
  const batch = writeBatch(db);
  snap.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, `plcs/${plcId}`));
  await batch.commit();
};

describe('plc_invitations list by plcId', () => {
  it('lead can list every invite for their PLC, including a co-lead invite', async () => {
    const snap = await assertSucceeds(
      invitesFor(as(LEAD_UID, LEAD_EMAIL), PLC_ID)
    );
    if (snap.size !== 2)
      throw new Error(`expected 2 invites, got ${snap.size}`);
  });

  it('co-lead can list every invite for the PLC', async () => {
    await assertSucceeds(invitesFor(as(COLEAD_UID, COLEAD_EMAIL), PLC_ID));
  });

  it('a plain member cannot list the PLC invites', async () => {
    await assertFails(invitesFor(as(MEMBER_UID, MEMBER_EMAIL), PLC_ID));
  });

  it('an outsider cannot list another PLC invites', async () => {
    await assertFails(invitesFor(as(OUTSIDER_UID, OUTSIDER_EMAIL), PLC_ID));
  });

  it('a lead cannot list invites without a plcId filter', async () => {
    await assertFails(
      getDocs(collection(as(LEAD_UID, LEAD_EMAIL), 'plc_invitations'))
    );
  });

  it('co-lead can read a single invite the lead sent', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          as(COLEAD_UID, COLEAD_EMAIL),
          `plc_invitations/${PLC_ID}_${INVITEE_A}`
        )
      )
    );
  });

  it('a plain member cannot read a single invite', async () => {
    await assertFails(
      getDoc(
        doc(
          as(MEMBER_UID, MEMBER_EMAIL),
          `plc_invitations/${PLC_ID}_${INVITEE_A}`
        )
      )
    );
  });

  it('the invitee can still query their own invites by email', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(as('a-uid', INVITEE_A), 'plc_invitations'),
          where('inviteeEmailLower', '==', INVITEE_A)
        )
      )
    );
  });
});

describe('deletePlc batch', () => {
  it('the lead who created the PLC can dissolve it with pending invites', async () => {
    await assertSucceeds(dissolve(as(LEAD_UID, LEAD_EMAIL), PLC_ID));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const left = await invitesFor(ctx.firestore(), PLC_ID);
      if (!left.empty) throw new Error('invites were not swept');
    });
  });

  it('an in-org admin who is not a member can dissolve it for recovery', async () => {
    await assertSucceeds(dissolve(as(ADMIN_UID, ADMIN_EMAIL), PLC_ID));
  });

  it('an admin from another org cannot list or dissolve it', async () => {
    await assertFails(
      invitesFor(as(OTHER_ADMIN_UID, OTHER_ADMIN_EMAIL), PLC_ID)
    );
    await assertFails(dissolve(as(OTHER_ADMIN_UID, OTHER_ADMIN_EMAIL), PLC_ID));
  });

  it('a co-lead cannot dissolve the PLC', async () => {
    await assertFails(dissolve(as(COLEAD_UID, COLEAD_EMAIL), PLC_ID));
  });

  it('a plain member cannot dissolve the PLC', async () => {
    await assertFails(dissolve(as(MEMBER_UID, MEMBER_EMAIL), PLC_ID));
  });
});
