// Firestore rules coverage for the PLC "building directory" discovery surface
// (PRD §2.1, Decision 1.1) AFTER the code-review PII hardening.
//
// Discovery now reads a slim, PII-free `/plcIndex/{plcId}` mirror (server-
// written by the `mirrorPlcIndex` function) instead of the full `/plcs` root
// doc. The root doc carries teacher emails/displayNames (the `members` map +
// `memberEmails`), so its org-peer read branch was REMOVED — same-org peers can
// no longer read it. This suite pins:
//
//   /plcIndex:
//     - A same-org non-member can read an org-stamped index entry (discovery).
//     - An outsider (not in the org) canNOT read it.
//     - A legacy index entry with NO orgId stays member-private to org peers.
//     - A member can read their own index entry.
//     - Writes are SERVER-ONLY — no client (member or org peer) can write it.
//   /plcs root (the PII boundary — the fix):
//     - A member can still read the root (access preserved).
//     - A same-org NON-member can NO LONGER read the root (PII not exposed).
//     - An outsider canNOT read the root.
//     - An org peer still canNOT write the root.
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

    // Full root docs carry member PII (members map + memberEmails).
    await setDoc(doc(db, `plcs/${ORG_PLC_ID}`), {
      name: 'Org-Stamped PLC',
      orgId: ORG_ID,
      buildingId: 'bldg-oms',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: MEMBER_EMAIL },
      members: {
        [MEMBER_UID]: {
          uid: MEMBER_UID,
          email: MEMBER_EMAIL,
          displayName: 'Member',
          role: 'lead',
          joinedAt: 1,
          status: 'active',
        },
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `plcs/${LEGACY_PLC_ID}`), {
      name: 'Legacy PLC',
      leadUid: MEMBER_UID,
      memberUids: [MEMBER_UID],
      memberEmails: { [MEMBER_UID]: MEMBER_EMAIL },
      createdAt: 1,
      updatedAt: 1,
    });

    // Slim, PII-free index mirrors (what mirrorPlcIndex would write). No emails
    // / displayNames — only name / orgId / buildingId / opaque memberUids.
    await setDoc(doc(db, `plcIndex/${ORG_PLC_ID}`), {
      name: 'Org-Stamped PLC',
      orgId: ORG_ID,
      buildingId: 'bldg-oms',
      memberUids: [MEMBER_UID],
      memberCount: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `plcIndex/${LEGACY_PLC_ID}`), {
      name: 'Legacy PLC',
      orgId: null,
      buildingId: null,
      memberUids: [MEMBER_UID],
      memberCount: 1,
      updatedAt: 1,
    });
  });
});

describe('plcIndex/{plcId} read — PII-free discovery mirror', () => {
  it('an org peer (non-member, same org) can read an org-stamped index entry', async () => {
    await assertSucceeds(getDoc(doc(asOrgPeer(), `plcIndex/${ORG_PLC_ID}`)));
  });

  it('a member can read their own index entry', async () => {
    await assertSucceeds(getDoc(doc(asMember(), `plcIndex/${ORG_PLC_ID}`)));
  });

  it('an outsider (not in the org) canNOT read an index entry', async () => {
    await assertFails(getDoc(doc(asOutsider(), `plcIndex/${ORG_PLC_ID}`)));
  });

  it('an org peer canNOT read a legacy index entry that has no orgId', async () => {
    await assertFails(getDoc(doc(asOrgPeer(), `plcIndex/${LEGACY_PLC_ID}`)));
  });

  it('an org peer canNOT WRITE an index entry (server-only mirror)', async () => {
    await assertFails(
      updateDoc(doc(asOrgPeer(), `plcIndex/${ORG_PLC_ID}`), {
        memberCount: 99,
        updatedAt: 2,
      })
    );
  });

  it('even a PLC member canNOT write an index entry (server-only mirror)', async () => {
    await assertFails(
      updateDoc(doc(asMember(), `plcIndex/${ORG_PLC_ID}`), {
        name: 'Renamed via the mirror',
        updatedAt: 2,
      })
    );
  });
});

describe('plcs/{plcId} root read — member-gated (no org-peer PII access)', () => {
  it('a member can read their own PLC root (existing access preserved)', async () => {
    await assertSucceeds(getDoc(doc(asMember(), `plcs/${ORG_PLC_ID}`)));
  });

  it('a same-org NON-member can NO LONGER read the PLC root (PII boundary — the fix)', async () => {
    // The org-peer read branch was removed: org discovery goes through the slim
    // /plcIndex mirror, so a co-org teacher can never read another PLC's raw
    // member emails/displayNames off the root doc.
    await assertFails(getDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an outsider canNOT read the PLC root', async () => {
    await assertFails(getDoc(doc(asOutsider(), `plcs/${ORG_PLC_ID}`)));
  });

  it('an org peer still canNOT write the PLC root', async () => {
    await assertFails(
      updateDoc(doc(asOrgPeer(), `plcs/${ORG_PLC_ID}`), {
        name: 'Hijacked by an org peer',
        updatedAt: 2,
      })
    );
  });
});
