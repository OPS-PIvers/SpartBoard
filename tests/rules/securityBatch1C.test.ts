// Security batch 1C: who may start a PLC, and an invite accept that must match its own invite.
// Requires a running Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, updateDoc, doc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-security-batch-1c';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const TEACHER_UID = 'teacher-uid';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
const STUDENT_GOOGLE_UID = 'student-google-uid';
const STUDENT_GOOGLE_EMAIL = '704522@orono.k12.mn.us';
const INACTIVE_UID = 'inactive-uid';
const INACTIVE_EMAIL = 'former.teacher@orono.k12.mn.us';

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
    const seedMember = (email: string, data: Record<string, unknown>) =>
      setDoc(doc(db, `organizations/orono/members/${email}`), {
        email,
        orgId: 'orono',
        ...data,
      });
    await Promise.all([
      seedMember(TEACHER_EMAIL, { roleId: 'teacher', status: 'active' }),
      seedMember(INACTIVE_EMAIL, { roleId: 'teacher', status: 'inactive' }),
      seedMember('p_s@orono.k12.mn.us', {
        roleId: 'teacher',
        status: 'active',
      }),
    ]);
  });
});

const newPlc = (uid: string, email: string) => ({
  id: 'new-plc',
  name: 'Grade 7 Math',
  orgId: 'orono',
  buildingId: null,
  leadUid: uid,
  memberUids: [uid],
  memberEmails: { [uid]: email },
  members: {
    [uid]: {
      uid,
      email,
      displayName: 'Lead',
      role: 'lead',
      status: 'active',
      joinedAt: 1,
    },
  },
  createdAt: 1,
  updatedAt: 1,
});

describe('plcs create: district staff only', () => {
  it('a verified staff teacher creates a PLC and reads it back', async () => {
    const db = testEnv
      .authenticatedContext(TEACHER_UID, {
        email: TEACHER_EMAIL,
        email_verified: true,
      })
      .firestore();
    await assertSucceeds(
      setDoc(doc(db, 'plcs/new-plc'), newPlc(TEACHER_UID, TEACHER_EMAIL))
    );
    await assertSucceeds(getDoc(doc(db, 'plcs/new-plc')));
  });

  it('an anonymous account cannot create a PLC', async () => {
    const db = testEnv
      .authenticatedContext('anon-uid', {
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();
    await assertFails(setDoc(doc(db, 'plcs/new-plc'), newPlc('anon-uid', '')));
  });

  it('a student-role token cannot create a PLC, even with a staff address', async () => {
    const db = testEnv
      .authenticatedContext('student-role-uid', {
        email: TEACHER_EMAIL,
        email_verified: true,
        studentRole: true,
        classIds: ['c1'],
      })
      .firestore();
    await assertFails(
      setDoc(doc(db, 'plcs/new-plc'), newPlc('student-role-uid', TEACHER_EMAIL))
    );
  });

  it('a student Google account on the district domain cannot create a PLC', async () => {
    const db = testEnv
      .authenticatedContext(STUDENT_GOOGLE_UID, {
        email: STUDENT_GOOGLE_EMAIL,
        email_verified: true,
      })
      .firestore();
    await assertFails(
      setDoc(
        doc(db, 'plcs/new-plc'),
        newPlc(STUDENT_GOOGLE_UID, STUDENT_GOOGLE_EMAIL)
      )
    );
  });

  it('an unverified email or an inactive member cannot create a PLC', async () => {
    const unverified = testEnv
      .authenticatedContext(TEACHER_UID, {
        email: TEACHER_EMAIL,
        email_verified: false,
      })
      .firestore();
    await assertFails(
      setDoc(
        doc(unverified, 'plcs/new-plc'),
        newPlc(TEACHER_UID, TEACHER_EMAIL)
      )
    );
    const inactive = testEnv
      .authenticatedContext(INACTIVE_UID, {
        email: INACTIVE_EMAIL,
        email_verified: true,
      })
      .firestore();
    await assertFails(
      setDoc(
        doc(inactive, 'plcs/new-plc'),
        newPlc(INACTIVE_UID, INACTIVE_EMAIL)
      )
    );
  });
});

describe('plcs invite accept: the invite must be for this PLC and this person', () => {
  const VICTIM_PLC = 'X';
  const LEAD_UID = 'lead-uid';
  const LEAD_EMAIL = 'lead@orono.k12.mn.us';
  const ATTACKER_UID = 'attacker-uid';
  const ATTACKER_EMAIL = 'p_s@orono.k12.mn.us';
  const INVITEE_EMAIL = 's@orono.k12.mn.us';
  const INVITEE_UID = 'invitee-uid';

  const seedPlcAndInvite = async (invite: {
    id: string;
    plcId: string;
    inviteeEmailLower: string;
  }) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `plcs/${VICTIM_PLC}`), {
        name: 'Victim PLC',
        leadUid: LEAD_UID,
        memberUids: [LEAD_UID],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL },
        createdAt: 1,
        updatedAt: 1,
      });
      await setDoc(doc(db, `plc_invitations/${invite.id}`), {
        plcId: invite.plcId,
        plcName: 'Some PLC',
        inviteeEmailLower: invite.inviteeEmailLower,
        invitedByUid: ATTACKER_UID,
        invitedByName: 'Someone',
        invitedAt: 1,
        status: 'pending',
      });
    });
  };

  const acceptAs = (uid: string, email: string) =>
    updateDoc(
      doc(
        testEnv
          .authenticatedContext(uid, { email, email_verified: true })
          .firestore(),
        `plcs/${VICTIM_PLC}`
      ),
      {
        memberUids: [LEAD_UID, uid],
        memberEmails: { [LEAD_UID]: LEAD_EMAIL, [uid]: email },
        updatedAt: 2,
      }
    );

  it('an invite made for PLC X_p and s@ does not let p_s@ join PLC X', async () => {
    // 'X_p' + '_' + 's@...' and 'X' + '_' + 'p_s@...' are the same doc id.
    await seedPlcAndInvite({
      id: `X_p_${INVITEE_EMAIL}`,
      plcId: 'X_p',
      inviteeEmailLower: INVITEE_EMAIL,
    });
    await assertFails(acceptAs(ATTACKER_UID, ATTACKER_EMAIL));
    await assertFails(
      getDoc(
        doc(
          testEnv
            .authenticatedContext(ATTACKER_UID, {
              email: ATTACKER_EMAIL,
              email_verified: true,
            })
            .firestore(),
          `plcs/${VICTIM_PLC}`
        )
      )
    );
  });

  it('the real invitee accepts their own invite and can then read the PLC', async () => {
    await seedPlcAndInvite({
      id: `${VICTIM_PLC}_${INVITEE_EMAIL}`,
      plcId: VICTIM_PLC,
      inviteeEmailLower: INVITEE_EMAIL,
    });
    await assertSucceeds(acceptAs(INVITEE_UID, INVITEE_EMAIL));
    await assertSucceeds(
      getDoc(
        doc(
          testEnv
            .authenticatedContext(INVITEE_UID, {
              email: INVITEE_EMAIL,
              email_verified: true,
            })
            .firestore(),
          `plcs/${VICTIM_PLC}`
        )
      )
    );
  });

  it('an invite whose invitee field names someone else does not admit the caller', async () => {
    await seedPlcAndInvite({
      id: `${VICTIM_PLC}_${INVITEE_EMAIL}`,
      plcId: VICTIM_PLC,
      inviteeEmailLower: 'other@orono.k12.mn.us',
    });
    await assertFails(acceptAs(INVITEE_UID, INVITEE_EMAIL));
  });
});
