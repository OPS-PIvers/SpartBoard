// Removed/departed PLC members keep a `members` map entry for audit; that entry must
// grant no read, content-write or membership-manager power. Requires the Firestore emulator.

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
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-removed-member';
const PLC_ID = 'plc-removed-test';

const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@example.com';
const MEMBER_UID = 'member-uid';
const MEMBER_EMAIL = 'member@example.com';
const COLEAD_UID = 'colead-uid';
const COLEAD_EMAIL = 'colead@example.com';
const EX_MEMBER_UID = 'ex-member-uid';
const EX_MEMBER_EMAIL = 'ex-member@example.com';
const EX_COLEAD_UID = 'ex-colead-uid';
const EX_COLEAD_EMAIL = 'ex-colead@example.com';
const STALE_COLEAD_UID = 'stale-colead-uid';
const STALE_COLEAD_EMAIL = 'stale-colead@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();

const entry = (
  uid: string,
  email: string,
  role: 'lead' | 'coLead' | 'member' | 'viewer',
  status: 'active' | 'removed' = 'active'
) => ({
  uid,
  email,
  displayName: email.split('@')[0],
  role,
  joinedAt: 1,
  status,
});

const inviteId = (email: string) => `${PLC_ID}_${email}`;

const invite = (email: string, byUid: string) => ({
  plcId: PLC_ID,
  plcName: 'Test PLC',
  inviteeEmailLower: email,
  invitedByUid: byUid,
  invitedByName: 'Someone',
  invitedAt: 1,
  status: 'pending',
});

const learningTargets = {
  targets: [],
  masteryCutoffs: { proficient: 1, approaching: 0 },
  updatedAt: 2,
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID, MEMBER_UID, COLEAD_UID],
      memberEmails: {
        [LEAD_UID]: LEAD_EMAIL,
        [MEMBER_UID]: MEMBER_EMAIL,
        [COLEAD_UID]: COLEAD_EMAIL,
      },
      members: {
        [LEAD_UID]: entry(LEAD_UID, LEAD_EMAIL, 'lead'),
        [MEMBER_UID]: entry(MEMBER_UID, MEMBER_EMAIL, 'member'),
        [COLEAD_UID]: entry(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
        // What removeMember / leavePlc leave behind.
        [EX_MEMBER_UID]: entry(
          EX_MEMBER_UID,
          EX_MEMBER_EMAIL,
          'member',
          'removed'
        ),
        [EX_COLEAD_UID]: entry(
          EX_COLEAD_UID,
          EX_COLEAD_EMAIL,
          'coLead',
          'removed'
        ),
        // A legacy leave that dropped the arrays but never flipped the map entry.
        [STALE_COLEAD_UID]: entry(
          STALE_COLEAD_UID,
          STALE_COLEAD_EMAIL,
          'coLead'
        ),
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `plcs/${PLC_ID}/aggregates/a1`), { n: 1 });
    await setDoc(doc(db, `plcs/${PLC_ID}/assessments/a1`), { title: 'x' });
    await setDoc(doc(db, `plcs/${PLC_ID}/meetings/m1`), { title: 'x' });
    await setDoc(doc(db, `plcs/${PLC_ID}/notes/n1`), { title: 'x' });
  });
});

describe('removed PLC members lose content access', () => {
  const asEx = () => as(EX_MEMBER_UID, EX_MEMBER_EMAIL);

  it('denies reading the root doc and aggregates', async () => {
    await assertFails(
      getDoc(doc(as(STALE_COLEAD_UID, STALE_COLEAD_EMAIL), `plcs/${PLC_ID}`))
    );
    await assertFails(getDoc(doc(asEx(), `plcs/${PLC_ID}`)));
    await assertFails(getDoc(doc(asEx(), `plcs/${PLC_ID}/aggregates/a1`)));
    await assertFails(getDocs(collection(asEx(), `plcs/${PLC_ID}/aggregates`)));
  });

  it('denies rewriting meta/learningTargets', async () => {
    await assertFails(
      setDoc(
        doc(asEx(), `plcs/${PLC_ID}/meta/learningTargets`),
        learningTargets
      )
    );
  });

  it('denies deleting assessments, meetings and notes', async () => {
    await assertFails(deleteDoc(doc(asEx(), `plcs/${PLC_ID}/assessments/a1`)));
    await assertFails(deleteDoc(doc(asEx(), `plcs/${PLC_ID}/meetings/m1`)));
    await assertFails(deleteDoc(doc(asEx(), `plcs/${PLC_ID}/notes/n1`)));
  });

  it('active members still read and write', async () => {
    const db = as(MEMBER_UID, MEMBER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}`)));
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}/aggregates/a1`)));
    await assertSucceeds(
      setDoc(doc(db, `plcs/${PLC_ID}/meta/learningTargets`), learningTargets)
    );
    await assertSucceeds(deleteDoc(doc(db, `plcs/${PLC_ID}/notes/n1`)));
  });
});

describe('removed co-leads lose membership-manager power', () => {
  it('a removed or stale co-lead cannot create an invite', async () => {
    for (const [uid, email] of [
      [EX_COLEAD_UID, EX_COLEAD_EMAIL],
      [STALE_COLEAD_UID, STALE_COLEAD_EMAIL],
    ]) {
      await assertFails(
        setDoc(
          doc(as(uid, email), `plc_invitations/${inviteId(email)}`),
          invite(email, uid)
        )
      );
    }
  });

  it('an active co-lead can still invite', async () => {
    const email = 'new@example.com';
    await assertSucceeds(
      setDoc(
        doc(as(COLEAD_UID, COLEAD_EMAIL), `plc_invitations/${inviteId(email)}`),
        invite(email, COLEAD_UID)
      )
    );
  });

  it('a co-lead who rejoined without the entry reset is not a manager', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(EX_COLEAD_UID),
        [`memberEmails.${EX_COLEAD_UID}`]: EX_COLEAD_EMAIL,
      });
    });
    const email = 'friend@example.com';
    await assertFails(
      setDoc(
        doc(
          as(EX_COLEAD_UID, EX_COLEAD_EMAIL),
          `plc_invitations/${inviteId(email)}`
        ),
        invite(email, EX_COLEAD_UID)
      )
    );
  });

  it('a removed co-lead cannot transfer the lead', async () => {
    await assertFails(
      updateDoc(doc(as(EX_COLEAD_UID, EX_COLEAD_EMAIL), `plcs/${PLC_ID}`), {
        leadUid: MEMBER_UID,
        [`members.${MEMBER_UID}.role`]: 'lead',
        [`members.${LEAD_UID}.role`]: 'member',
        updatedAt: 2,
      })
    );
  });
});

describe('re-accepting an invite resets a stale entry', () => {
  const asExColead = () => as(EX_COLEAD_UID, EX_COLEAD_EMAIL);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plc_invitations/${inviteId(EX_COLEAD_EMAIL)}`),
        invite(EX_COLEAD_EMAIL, LEAD_UID)
      );
    });
  });

  it('denies an accept that leaves the old coLead entry in place', async () => {
    await assertFails(
      updateDoc(doc(asExColead(), `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(EX_COLEAD_UID),
        [`memberEmails.${EX_COLEAD_UID}`]: EX_COLEAD_EMAIL,
        updatedAt: 2,
      })
    );
  });

  it('allows an accept that rewrites the entry as an active member, which then cannot invite', async () => {
    await assertSucceeds(
      updateDoc(doc(asExColead(), `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(EX_COLEAD_UID),
        [`memberEmails.${EX_COLEAD_UID}`]: EX_COLEAD_EMAIL,
        [`members.${EX_COLEAD_UID}`]: entry(
          EX_COLEAD_UID,
          EX_COLEAD_EMAIL,
          'member'
        ),
        updatedAt: 2,
      })
    );
    const email = 'friend@example.com';
    await assertFails(
      setDoc(
        doc(asExColead(), `plc_invitations/${inviteId(email)}`),
        invite(email, EX_COLEAD_UID)
      )
    );
  });

  it('denies an accept that rewrites the entry back to coLead', async () => {
    await assertFails(
      updateDoc(doc(asExColead(), `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(EX_COLEAD_UID),
        [`memberEmails.${EX_COLEAD_UID}`]: EX_COLEAD_EMAIL,
        [`members.${EX_COLEAD_UID}`]: entry(
          EX_COLEAD_UID,
          EX_COLEAD_EMAIL,
          'coLead'
        ),
        updatedAt: 2,
      })
    );
  });
});
