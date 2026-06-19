// Firestore rules coverage for the PLC "building directory" READ branch on
// the root doc (`plcs/{plcId}`), added in Wave 1 / T5 (PRD §2.1, Decision 1.1).
//
// The existing read rule allowed only members + admins. The directory branch
// additionally lets an authenticated member of the PLC's *organization* read a
// PLC that carries a matching `orgId` — powering the "PLCs in my building"
// discovery feed. This suite pins:
//
//   - A non-member who IS in the PLC's org can read an org-stamped PLC.
//   - A non-member who is NOT in that org canNOT read it.
//   - A legacy PLC with NO `orgId` stays member-private (org peers get nothing).
//   - Existing access is preserved (a member reads; an org peer who is also a
//     member still reads).
//   - The directory branch is READ-only — an org peer (non-member) still can't
//     WRITE the PLC root.
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
import { getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-building-directory';
const ORG_ID = 'org-orono';

const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@orono.k12.mn.us';
// Org peer: NOT a member of the PLC, but IS a member of the org.
const ORG_PEER_UID = 'org-peer-uid';
const ORG_PEER_EMAIL = 'peer@orono.k12.mn.us';
// Outsider: neither a PLC member nor an org member.
const OUTSIDER_UID = 'outsider-uid';
const OUTSIDER_EMAIL = 'outsider@elsewhere.org';

const ORG_PLC_ID = 'plc-org-stamped';
const LEGACY_PLC_ID = 'plc-no-org';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMember = () =>
  testEnv.authenticatedContext(MEMBER_UID, { email: MEMBER_EMAIL }).firestore();
const asOrgPeer = () =>
  testEnv
    .authenticatedContext(ORG_PEER_UID, { email: ORG_PEER_EMAIL })
    .firestore();
const asOutsider = () =>
  testEnv
    .authenticatedContext(OUTSIDER_UID, { email: OUTSIDER_EMAIL })
    .firestore();

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
    // Org membership: only MEMBER + ORG_PEER are org members (keyed by
    // lowercased email, matching isOrgMember()).
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${MEMBER_EMAIL}`), {
      roleId: 'staff',
    });
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ORG_PEER_EMAIL}`), {
      roleId: 'staff',
    });

    // Org-stamped PLC — MEMBER is the sole member; carries orgId.
    await setDoc(doc(db, `plcs/${ORG_PLC_ID}`), {
      name: 'Org-Stamped PLC',
      orgId: ORG_ID,
      buildingId: 'bldg-oms',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: MEMBER_EMAIL },
      createdAt: 1,
      updatedAt: 1,
    });

    // Legacy PLC — no orgId, MEMBER is the sole member.
    await setDoc(doc(db, `plcs/${LEGACY_PLC_ID}`), {
      name: 'Legacy PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: MEMBER_EMAIL },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

describe('plcs/{plcId} read — building directory branch', () => {
  it('a member can read their own PLC (existing access preserved)', async () => {
    await assertSucceeds(getDoc(doc(asMember(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an org peer (non-member, same org) can read an org-stamped PLC', async () => {
    await assertSucceeds(getDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an outsider (not in the org, not a member) canNOT read the org-stamped PLC', async () => {
    await assertFails(getDoc(doc(asOutsider(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an org peer canNOT read a legacy PLC that has no orgId (stays member-private)', async () => {
    await assertFails(getDoc(doc(asOrgPeer(), `plcs/${LEGACY_PLC_ID}`)));
  });

  it('the directory branch is read-only — an org peer canNOT write the PLC root', async () => {
    await assertFails(
      updateDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`), {
        name: 'Hijacked by an org peer',
        updatedAt: 2,
      })
    );
  });

  it('an org peer canNOT self-add to memberUids via a plain update (no invite)', async () => {
    // The directory read does not grant write access; self-join still requires
    // the isAcceptingPlcInvite path (a pending invite doc), which is absent.
    await assertFails(
      updateDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`), {
        memberUids: [MEMBER_UID, ORG_PEER_UID],
        memberEmails: {
          [MEMBER_UID]: MEMBER_EMAIL,
          [ORG_PEER_UID]: ORG_PEER_EMAIL,
        },
        updatedAt: 2,
      })
    );
  });
});
