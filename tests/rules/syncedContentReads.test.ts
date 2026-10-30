// Rules tests for who may read PLC synced quiz, question-bank and video-activity docs (they carry answer keys).
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  NOT_STAFF_DISTRICT_EMAILS,
  seedDistrictStaff,
} from './districtStaffSeed';

const PROJECT_ID = 'spartboard-synced-content-reads';
const GROUP_ID = 'group-synced-reads';
const PARTICIPANT_UID = 'participant-uid';
const STAFF_UID = 'staff-uid';
const STAFF_EMAIL = 'peer.teacher@orono.k12.mn.us';
const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
const OUTSIDER_UID = 'outsider-uid';
const PLC_MEMBER_UID = 'plc-member-uid';
const PLC_ID = 'plc-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const google = (uid: string, email: string, extra = {}) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      ...extra,
    })
    .firestore();

const asParticipant = () =>
  google(PARTICIPANT_UID, 'participant.teacher@example.com');
const asStaff = () => google(STAFF_UID, STAFF_EMAIL);
const asAdmin = () => google(ADMIN_UID, ADMIN_EMAIL);
const asOutsider = () => google(OUTSIDER_UID, 'someone@example.com');
// In the owning PLC but holds no staff member doc.
const asPlcMember = () => google(PLC_MEMBER_UID, 'plc.member@example.com');
const asPinLogin = () =>
  google('pin-uid', STAFF_EMAIL, {
    studentRole: true,
    pinLogin: true,
    pinSessionId: 'session-1',
  });
const asUnverifiedStaff = () =>
  testEnv
    .authenticatedContext('unverified-uid', {
      email: STAFF_EMAIL,
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    })
    .firestore();
const asAnonymous = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
// A ClassLink student token; its email is a staff one so only the claim can deny it.
const asStudentRole = () =>
  google('student-role-uid', STAFF_EMAIL, {
    studentRole: true,
    classIds: ['class-1'],
  });

const quizPath = `synced_quizzes/${GROUP_ID}`;
const bankPath = `synced_question_banks/${GROUP_ID}`;
const videoPath = `synced_video_activities/${GROUP_ID}`;

const quizDoc = (over: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  version: 1,
  title: 'Fractions check',
  questions: [{ id: 'q1', text: '1/2 + 1/4?', correctAnswer: '3/4' }],
  participants: { [PARTICIPANT_UID]: { joinedAt: 1000 } },
  plcId: PLC_ID,
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: PARTICIPANT_UID,
  ...over,
});

const videoDoc = (over: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  version: 1,
  title: 'Water cycle',
  youtubeUrl: 'https://www.youtube.com/watch?v=abc',
  questions: [{ id: 'q1', text: 'What is it?', correctAnswer: 'B' }],
  participants: { [PARTICIPANT_UID]: { joinedAt: 1000 } },
  plcId: PLC_ID,
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: PARTICIPANT_UID,
  ...over,
});

const bankDoc = (over: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  ownerUid: PARTICIPANT_UID,
  plcIds: [PLC_ID],
  version: 1,
  title: 'Fractions bank',
  questions: [{ id: 'q1', text: 'x', type: 'MC', correctAnswer: 'a' }],
  questionCount: 1,
  targetIds: [],
  targetCounts: {},
  createdAt: 1,
  updatedAt: 1,
  ...over,
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await seedDistrictStaff(db, [STAFF_EMAIL]);
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { email: ADMIN_EMAIL });
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'Grade 6 math',
      leadUid: PARTICIPANT_UID,
      // The studentRole and PIN uids sit in the PLC to prove the claim still denies them.
      memberUids: [
        PARTICIPANT_UID,
        PLC_MEMBER_UID,
        'student-role-uid',
        'pin-uid',
      ],
    });
    await setDoc(doc(db, quizPath), quizDoc());
    await setDoc(doc(db, bankPath), bankDoc());
    await setDoc(doc(db, videoPath), videoDoc());
  });
});

describe.each([
  ['synced_quizzes', quizPath],
  ['synced_question_banks', bankPath],
  ['synced_video_activities', videoPath],
])('%s reads', (collectionName, path) => {
  it('anonymous and studentRole tokens cannot get a group whose id they hold', async () => {
    await assertFails(getDoc(doc(asAnonymous(), path)));
    await assertFails(getDoc(doc(asStudentRole(), path)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), path))
    );
  });

  it('district-domain accounts without an active staff member doc cannot get it', async () => {
    for (const email of NOT_STAFF_DISTRICT_EMAILS) {
      await assertFails(getDoc(doc(google(`not-staff-${email}`, email), path)));
    }
  });

  it('an unrelated signed-in user with no member doc cannot get it', async () => {
    await assertFails(getDoc(doc(asOutsider(), path)));
  });

  it('PIN-login and unverified staff-address tokens cannot get it', async () => {
    await assertFails(getDoc(doc(asPinLogin(), path)));
    await assertFails(getDoc(doc(asUnverifiedStaff(), path)));
  });

  it('a member of the owning PLC can get it without a staff member doc', async () => {
    await assertSucceeds(getDoc(doc(asPlcMember(), path)));
  });

  it('the participant or owner, verified staff and admins can get it', async () => {
    await assertSucceeds(getDoc(doc(asParticipant(), path)));
    await assertSucceeds(getDoc(doc(asStaff(), path)));
    await assertSucceeds(getDoc(doc(asAdmin(), path)));
  });

  it('a teacher may probe a missing id before creating it; anonymous may not', async () => {
    const missing = `${collectionName}/not-created-yet`;
    await assertSucceeds(getDoc(doc(asOutsider(), missing)));
    await assertFails(getDoc(doc(asAnonymous(), missing)));
    await assertFails(getDoc(doc(asStudentRole(), missing)));
  });

  it('list stays closed, even for staff and admins', async () => {
    await assertFails(getDocs(collection(asStaff(), collectionName)));
    await assertFails(getDocs(collection(asAdmin(), collectionName)));
    await assertFails(getDocs(collection(asAnonymous(), collectionName)));
  });
});

describe('writes are unchanged by the read gate', () => {
  it('synced_quizzes: participant publishes; staff, anonymous and studentRole cannot', async () => {
    const next = (uid: string) =>
      quizDoc({ version: 2, updatedAt: 2000, updatedBy: uid });
    await assertSucceeds(
      setDoc(doc(asParticipant(), quizPath), next(PARTICIPANT_UID))
    );
    await assertFails(setDoc(doc(asStaff(), quizPath), next(STAFF_UID)));
    await assertFails(
      setDoc(doc(asPlcMember(), quizPath), next(PLC_MEMBER_UID))
    );
    await assertFails(setDoc(doc(asAnonymous(), quizPath), next('anon-uid')));
    await assertFails(
      setDoc(doc(asStudentRole(), quizPath), next('student-role-uid'))
    );
  });

  it('synced_quizzes: a teacher stands up their own group', async () => {
    await assertSucceeds(
      setDoc(
        doc(asOutsider(), 'synced_quizzes/fresh'),
        quizDoc({
          id: 'fresh',
          participants: { [OUTSIDER_UID]: { joinedAt: 1 } },
          updatedBy: OUTSIDER_UID,
        })
      )
    );
  });

  it('synced_question_banks: owner republishes; staff and anonymous cannot', async () => {
    await assertSucceeds(
      setDoc(doc(asParticipant(), bankPath), bankDoc({ version: 2 }))
    );
    await assertFails(
      setDoc(doc(asStaff(), bankPath), bankDoc({ version: 3 }))
    );
    await assertFails(
      setDoc(doc(asPlcMember(), bankPath), bankDoc({ version: 3 }))
    );
    await assertFails(
      setDoc(doc(asAnonymous(), bankPath), bankDoc({ version: 3 }))
    );
  });

  it('synced_question_banks: a teacher creates their own bank copy', async () => {
    await assertSucceeds(
      setDoc(
        doc(asOutsider(), 'synced_question_banks/fresh'),
        bankDoc({ id: 'fresh', ownerUid: OUTSIDER_UID })
      )
    );
  });

  it('synced_video_activities: participant publishes; staff and studentRole cannot', async () => {
    const next = (uid: string) =>
      videoDoc({ version: 2, updatedAt: 2000, updatedBy: uid });
    await assertSucceeds(
      setDoc(doc(asParticipant(), videoPath), next(PARTICIPANT_UID))
    );
    await assertFails(setDoc(doc(asStaff(), videoPath), next(STAFF_UID)));
    await assertFails(
      setDoc(doc(asStudentRole(), videoPath), next('student-role-uid'))
    );
  });
});

describe('synced_question_banks shared to several PLCs', () => {
  it('a member of a later PLC can get it; a member of none cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const id of ['plc-a', 'plc-b']) {
        await setDoc(doc(db, `plcs/${id}`), {
          name: id,
          leadUid: PARTICIPANT_UID,
          memberUids: [PARTICIPANT_UID],
        });
      }
      await setDoc(
        doc(db, bankPath),
        bankDoc({ plcIds: ['plc-a', 'plc-b', PLC_ID] })
      );
    });
    await assertSucceeds(getDoc(doc(asPlcMember(), bankPath)));
    await assertFails(getDoc(doc(asOutsider(), bankPath)));
  });
});
