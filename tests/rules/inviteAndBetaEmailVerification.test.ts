// Regression for the remaining PLC-invite + beta-allowlist chokepoints that
// still trusted the self-reported `request.auth.token.email` claim with no
// `email_verified` gate (this project also supports email/password sign-in,
// so email_verified is NOT guaranteed true). Before this fix, an attacker
// could register an unverified account claiming a real invitee's or a real
// beta tester's email address and:
//   - accept a PLC invite addressed to that teacher (isAcceptingPlcInvite),
//   - read/accept-or-decline that teacher's plc_invitations doc directly,
//   - read beta-gated admin_backgrounds / custom_widgets docs.
// Mirrors orgRoleEmailVerification.test.ts's proof shape for the sibling
// org-role-hierarchy fix.
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
import { setDoc, updateDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-invite-beta-email-verification';
const PLC_ID = 'plc-1';
const LEAD_UID = 'lead-uid';
const LEAD_EMAIL = 'lead@orono.k12.mn.us';
const INVITEE_EMAIL = 'invitee@orono.k12.mn.us';
const ATTACKER_UID = 'attacker-uid';
const REAL_INVITEE_UID = 'real-invitee-uid';

const BETA_EMAIL = 'beta-tester@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const inviteDocId = (plcId: string, emailLower: string) =>
  `${plcId}_${emailLower}`;

let testEnv: RulesTestEnvironment;

// Same uid space an attacker could occupy: any self-registered account can
// claim a real invitee/beta-tester's email as its token `email` — only
// `email_verified` is out of their control (Google Sign-In sets it;
// email/password does not).
const asUnverified = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: false })
    .firestore();
const asVerified = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: true })
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
    // No `members` map, so isAcceptingPlcInvite's membersUntouchedOrSelfAppended
    // short-circuits true and the test isolates the email_verified gate rather
    // than the members-map branch. memberEmails is a uid->email MAP (not an
    // array) — isAcceptingPlcInvite calls .diff()/.get() on it.
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      id: PLC_ID,
      name: 'Math PLC',
      leadUid: LEAD_UID,
      memberUids: [LEAD_UID],
      memberEmails: { [LEAD_UID]: LEAD_EMAIL },
    });
    await setDoc(
      doc(db, `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`),
      {
        plcId: PLC_ID,
        plcName: 'Math PLC',
        inviteeEmailLower: INVITEE_EMAIL,
        invitedByUid: LEAD_UID,
        invitedByName: 'Lead Teacher',
        invitedAt: Date.now(),
        status: 'pending',
      }
    );
    await setDoc(doc(db, 'admin_backgrounds/beta-bg'), {
      accessLevel: 'beta',
      betaUsers: [BETA_EMAIL],
    });
    await setDoc(doc(db, 'custom_widgets/beta-widget'), {
      published: true,
      enabled: true,
      accessLevel: 'beta',
      betaUsers: [BETA_EMAIL],
    });
  });
});

describe('isAcceptingPlcInvite() requires a verified email claim', () => {
  const acceptedUpdate = {
    memberUids: [LEAD_UID, REAL_INVITEE_UID],
    memberEmails: { [LEAD_UID]: LEAD_EMAIL, [REAL_INVITEE_UID]: INVITEE_EMAIL },
    updatedAt: Date.now(),
  };

  it('denies an unverified caller self-reporting the invitee email from accepting', async () => {
    await assertFails(
      updateDoc(
        doc(asUnverified(ATTACKER_UID, INVITEE_EMAIL), `plcs/${PLC_ID}`),
        {
          memberUids: [LEAD_UID, ATTACKER_UID],
          memberEmails: {
            [LEAD_UID]: LEAD_EMAIL,
            [ATTACKER_UID]: INVITEE_EMAIL,
          },
          updatedAt: Date.now(),
        }
      )
    );
  });

  it('allows the real invitee to accept once their token carries email_verified: true', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asVerified(REAL_INVITEE_UID, INVITEE_EMAIL), `plcs/${PLC_ID}`),
        acceptedUpdate
      )
    );
  });
});

describe('plc_invitations invitee read requires a verified email claim', () => {
  it('denies an unverified caller self-reporting the invitee email from reading the invite', async () => {
    await assertFails(
      getDoc(
        doc(
          asUnverified(ATTACKER_UID, INVITEE_EMAIL),
          `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`
        )
      )
    );
  });

  it('allows the real invitee to read their own invite once verified', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asVerified(REAL_INVITEE_UID, INVITEE_EMAIL),
          `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`
        )
      )
    );
  });
});

describe('plc_invitations invitee accept/decline update requires a verified email claim', () => {
  it('denies an unverified caller self-reporting the invitee email from accepting the invite doc', async () => {
    await assertFails(
      updateDoc(
        doc(
          asUnverified(ATTACKER_UID, INVITEE_EMAIL),
          `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`
        ),
        { status: 'accepted', respondedAt: Date.now() }
      )
    );
  });

  it('allows the real invitee to accept the invite doc once verified', async () => {
    await assertSucceeds(
      updateDoc(
        doc(
          asVerified(REAL_INVITEE_UID, INVITEE_EMAIL),
          `plc_invitations/${inviteDocId(PLC_ID, INVITEE_EMAIL)}`
        ),
        { status: 'accepted', respondedAt: Date.now() }
      )
    );
  });
});

describe('admin_backgrounds beta allowlist requires a verified email claim', () => {
  it('denies an unverified caller self-reporting a real beta tester email', async () => {
    await assertFails(
      getDoc(
        doc(
          asUnverified('impostor-uid', BETA_EMAIL),
          'admin_backgrounds/beta-bg'
        )
      )
    );
  });

  it('allows the real beta tester once verified', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asVerified('real-beta-uid', BETA_EMAIL),
          'admin_backgrounds/beta-bg'
        )
      )
    );
  });
});

describe('custom_widgets beta allowlist requires a verified email claim', () => {
  it('denies an unverified caller self-reporting a real beta tester email', async () => {
    await assertFails(
      getDoc(
        doc(
          asUnverified('impostor-uid', BETA_EMAIL),
          'custom_widgets/beta-widget'
        )
      )
    );
  });

  it('allows the real beta tester once verified', async () => {
    await assertSucceeds(
      getDoc(
        doc(
          asVerified('real-beta-uid', BETA_EMAIL),
          'custom_widgets/beta-widget'
        )
      )
    );
  });
});
