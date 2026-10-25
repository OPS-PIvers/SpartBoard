// Removed/departed PLC members keep a `members` map entry for audit; that entry must
// grant no read, content-write or membership-manager power. Requires the Firestore emulator.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const VIEWER_UID = 'viewer-uid';
const VIEWER_EMAIL = 'viewer@example.com';
const UNKEYED_UID = 'unkeyed-uid';
const UNKEYED_EMAIL = 'unkeyed@example.com';
const EX_VIEWER_UID = 'ex-viewer-uid';
const EX_VIEWER_EMAIL = 'ex-viewer@example.com';
const NEW_UID = 'new-uid';
const NEW_EMAIL = 'newcomer@example.com';

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
      memberUids: [LEAD_UID, MEMBER_UID, COLEAD_UID, VIEWER_UID, UNKEYED_UID],
      memberEmails: {
        [LEAD_UID]: LEAD_EMAIL,
        [MEMBER_UID]: MEMBER_EMAIL,
        [COLEAD_UID]: COLEAD_EMAIL,
        [VIEWER_UID]: VIEWER_EMAIL,
        [UNKEYED_UID]: UNKEYED_EMAIL,
      },
      members: {
        [LEAD_UID]: entry(LEAD_UID, LEAD_EMAIL, 'lead'),
        [MEMBER_UID]: entry(MEMBER_UID, MEMBER_EMAIL, 'member'),
        [COLEAD_UID]: entry(COLEAD_UID, COLEAD_EMAIL, 'coLead'),
        // Auto-roster building-group viewer.
        [VIEWER_UID]: {
          ...entry(VIEWER_UID, VIEWER_EMAIL, 'viewer'),
          addedBy: 'autoRoster',
        },
        [EX_VIEWER_UID]: entry(
          EX_VIEWER_UID,
          EX_VIEWER_EMAIL,
          'viewer',
          'removed'
        ),
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

describe('current members keep their access', () => {
  it('an auto-roster viewer reads the root doc and aggregates but cannot write content', async () => {
    const db = as(VIEWER_UID, VIEWER_EMAIL);
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}`)));
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}/aggregates/a1`)));
    await assertSucceeds(getDocs(collection(db, `plcs/${PLC_ID}/aggregates`)));
    await assertFails(
      setDoc(doc(db, `plcs/${PLC_ID}/meta/learningTargets`), learningTargets)
    );
    await assertFails(deleteDoc(doc(db, `plcs/${PLC_ID}/notes/n1`)));
  });

  it('an unkeyed member on a mapped PLC reads and edits content', async () => {
    const db = as(UNKEYED_UID, UNKEYED_EMAIL);
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}`)));
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}/aggregates/a1`)));
    await assertSucceeds(
      setDoc(doc(db, `plcs/${PLC_ID}/meta/learningTargets`), learningTargets)
    );
    await assertSucceeds(deleteDoc(doc(db, `plcs/${PLC_ID}/notes/n1`)));
  });
});

describe('accepting an invite on a mapped PLC', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, `plc_invitations/${inviteId(NEW_EMAIL)}`),
        invite(NEW_EMAIL, LEAD_UID)
      );
      await setDoc(
        doc(db, `plc_invitations/${inviteId(EX_VIEWER_EMAIL)}`),
        invite(EX_VIEWER_EMAIL, LEAD_UID)
      );
    });
  });

  it('allows a first-time arrays-only accept', async () => {
    const db = as(NEW_UID, NEW_EMAIL);
    await assertSucceeds(
      updateDoc(doc(db, `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(NEW_UID),
        [`memberEmails.${NEW_UID}`]: NEW_EMAIL,
        updatedAt: 2,
      })
    );
    await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}`)));
  });

  it('denies a self entry carrying keys the client never writes', async () => {
    await assertFails(
      updateDoc(doc(as(NEW_UID, NEW_EMAIL), `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(NEW_UID),
        [`memberEmails.${NEW_UID}`]: NEW_EMAIL,
        [`members.${NEW_UID}`]: {
          ...entry(NEW_UID, NEW_EMAIL, 'member'),
          mentorRole: 'mentor',
        },
        updatedAt: 2,
      })
    );
  });

  it('a rejoin over a removed viewer entry resets it to an active member who can edit', async () => {
    const db = as(EX_VIEWER_UID, EX_VIEWER_EMAIL);
    await assertSucceeds(
      updateDoc(doc(db, `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(EX_VIEWER_UID),
        [`memberEmails.${EX_VIEWER_UID}`]: EX_VIEWER_EMAIL,
        [`members.${EX_VIEWER_UID}`]: entry(
          EX_VIEWER_UID,
          EX_VIEWER_EMAIL,
          'member'
        ),
        updatedAt: 2,
      })
    );
    const snap = await assertSucceeds(getDoc(doc(db, `plcs/${PLC_ID}`)));
    const mine = (
      snap.data()?.members as Record<string, { role: string; status: string }>
    )[EX_VIEWER_UID];
    expect(mine).toMatchObject({ role: 'member', status: 'active' });
    await assertSucceeds(
      setDoc(doc(db, `plcs/${PLC_ID}/meta/learningTargets`), learningTargets)
    );
  });

  it('a rejoin over a removed viewer entry cannot add a mentor tag', async () => {
    await assertFails(
      updateDoc(doc(as(EX_VIEWER_UID, EX_VIEWER_EMAIL), `plcs/${PLC_ID}`), {
        memberUids: arrayUnion(EX_VIEWER_UID),
        [`memberEmails.${EX_VIEWER_UID}`]: EX_VIEWER_EMAIL,
        [`members.${EX_VIEWER_UID}`]: {
          ...entry(EX_VIEWER_UID, EX_VIEWER_EMAIL, 'member'),
          mentorRole: 'mentor',
        },
        updatedAt: 2,
      })
    );
  });
});
