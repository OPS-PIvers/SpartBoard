// Security batch 4B + AB-113: poll sessions, votes and answers need a server-written join; votes carry voter ids.
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-security-batch-4b';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const TEACHER_UID = 'teacher-4b';
const TEACHER_EMAIL = 'teacher4b@orono.k12.mn.us';
const COTEACHER_EMAIL = 'coteacher4b@orono.k12.mn.us';
const ADMIN_EMAIL = 'admin4b@orono.k12.mn.us';
const ANON_UID = 'anon-4b';
const STRANGER_UID = 'stranger-4b';
const STUDENT_UID = 'student-4b';
const SESSION_ID = `${TEACHER_UID}_K3F9Q`;
const ANON_VOTER = 'a1b2c3d4e5f60718293a';
const STUDENT_VOTER = '0f1e2d3c4b5a69788796';

let testEnv: RulesTestEnvironment;

const asStaff = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () => asStaff(TEACHER_UID, TEACHER_EMAIL);
const asCoTeacher = () => asStaff('coteacher-4b', COTEACHER_EMAIL);
const asAdmin = () => asStaff('admin-4b', ADMIN_EMAIL);
const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds: ['class-4b'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asUnauthed = () => testEnv.unauthenticatedContext().firestore();

type Db = ReturnType<typeof asAnon>;
const sessionRef = (db: Db) => doc(db, `poll_sessions/${SESSION_ID}`);
const voteRef = (db: Db, id: string) =>
  doc(db, `poll_sessions/${SESSION_ID}/votes/${id}`);
const votesCol = (db: Db) =>
  collection(db, `poll_sessions/${SESSION_ID}/votes`);
const answerRef = (db: Db, id: string) =>
  doc(db, `poll_sessions/${SESSION_ID}/answers/${id}`);
const vote = (questionIndex = 0, optionIndex = 1) => ({
  questionIndex,
  optionIndex,
  votedAt: 1,
});
const answer = () => ({
  questionIndex: 1,
  text: 'gravity',
  votedAt: 1,
  answeredAt: serverTimestamp(),
});

const seed = (path: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(ctx.firestore(), [
      TEACHER_EMAIL,
      COTEACHER_EMAIL,
      ADMIN_EMAIL,
    ])
  );
  await seed(`admins/${ADMIN_EMAIL}`, { email: ADMIN_EMAIL });
  await seed('poll_codes/K3F9Q', {
    sessionId: SESSION_ID,
    teacherUid: TEACHER_UID,
    updatedAt: 1,
  });
  await seed(`poll_sessions/${SESSION_ID}`, {
    id: 'K3F9Q',
    teacherUid: TEACHER_UID,
    code: 'K3F9Q',
    questions: [{ id: 'q1', question: 'Q?', options: [] }],
    optionCounts: [2, 0],
    textQuestions: [1],
    currentQuestionIndex: 0,
    active: true,
    startedAt: 1,
  });
  await seed(`poll_joins/${SESSION_ID}__${ANON_UID}`, {
    sessionId: SESSION_ID,
    uid: ANON_UID,
    voterId: ANON_VOTER,
  });
  await seed(`poll_joins/${SESSION_ID}__${STUDENT_UID}`, {
    sessionId: SESSION_ID,
    uid: STUDENT_UID,
    voterId: STUDENT_VOTER,
  });
  await seed(`poll_sessions/${SESSION_ID}/votes/0_${STUDENT_VOTER}`, vote());
});

describe('poll code pointers', () => {
  it('denies every client a pointer read, list or write', async () => {
    for (const db of [asAnon(), asStudent(), asTeacher(), asAdmin()]) {
      await assertFails(getDoc(doc(db, 'poll_codes/K3F9Q')));
      await assertFails(getDocs(collection(db, 'poll_codes')));
      await assertFails(
        setDoc(doc(db, 'poll_codes/K3F9Q'), {
          sessionId: 'x_K3F9Q',
          teacherUid: 'x',
        })
      );
    }
  });
});

describe('poll joins', () => {
  it('stay server-only, even for the device they name', async () => {
    const own = `poll_joins/${SESSION_ID}__${ANON_UID}`;
    await assertFails(getDoc(doc(asAnon(), own)));
    await assertFails(
      setDoc(
        doc(asAnon(STRANGER_UID), `poll_joins/${SESSION_ID}__${STRANGER_UID}`),
        {
          sessionId: SESSION_ID,
          uid: STRANGER_UID,
          voterId: 'mine',
        }
      )
    );
    await assertFails(deleteDoc(doc(asAnon(), own)));
    await seed(`poll_voter_salts/${SESSION_ID}`, { salt: 'x' });
    for (const db of [asAnon(), asTeacher(), asAdmin()]) {
      await assertFails(getDoc(doc(db, `poll_voter_salts/${SESSION_ID}`)));
    }
  });
});

describe('poll session reads', () => {
  it('denies a device that never joined, signed in or not', async () => {
    await assertFails(getDoc(sessionRef(asAnon(STRANGER_UID))));
    await assertFails(getDoc(sessionRef(asStudent(STRANGER_UID))));
    await assertFails(getDoc(sessionRef(asCoTeacher())));
    await assertFails(getDoc(sessionRef(asUnauthed())));
  });

  it('allows a joined device, the owner and an admin', async () => {
    await assertSucceeds(getDoc(sessionRef(asAnon())));
    await assertSucceeds(getDoc(sessionRef(asStudent())));
    await assertSucceeds(getDoc(sessionRef(asTeacher())));
    await assertSucceeds(getDoc(sessionRef(asAdmin())));
  });
});

describe('poll votes', () => {
  it('lets a joined device vote under its voter id', async () => {
    await assertSucceeds(setDoc(voteRef(asAnon(), `0_${ANON_VOTER}`), vote()));
    await assertSucceeds(
      setDoc(voteRef(asStudent(), `0_${STUDENT_VOTER}`), vote(0, 0))
    );
  });

  it('refuses a uid-keyed vote from a joined device', async () => {
    await assertFails(setDoc(voteRef(asAnon(), `0_${ANON_UID}`), vote()));
  });

  it('refuses a device that never joined, under any id', async () => {
    const stranger = asAnon(STRANGER_UID);
    await assertFails(setDoc(voteRef(stranger, `0_${STRANGER_UID}`), vote()));
    await assertFails(setDoc(voteRef(stranger, `0_${ANON_VOTER}`), vote()));
    await assertFails(
      setDoc(voteRef(asStudent(STRANGER_UID), `0_${STRANGER_UID}`), vote())
    );
  });

  it("refuses another device's voter id or uid, and a mismatched question", async () => {
    await assertFails(setDoc(voteRef(asAnon(), `0_${STUDENT_VOTER}`), vote()));
    await assertFails(setDoc(voteRef(asAnon(), `0_${STUDENT_UID}`), vote()));
    await assertFails(setDoc(voteRef(asAnon(), `1_${ANON_VOTER}`), vote()));
    await assertFails(setDoc(voteRef(asAnon(), `0_`), vote()));
  });

  it('lets joined devices and staff read the tally, nobody else', async () => {
    await assertSucceeds(getDocs(votesCol(asAnon())));
    await assertSucceeds(getDocs(votesCol(asStudent())));
    await assertSucceeds(getDocs(votesCol(asTeacher())));
    await assertSucceeds(getDocs(votesCol(asCoTeacher())));
    await assertSucceeds(getDoc(voteRef(asCoTeacher(), `0_${STUDENT_VOTER}`)));
    await assertFails(getDocs(votesCol(asAnon(STRANGER_UID))));
    await assertFails(getDocs(votesCol(asStudent(STRANGER_UID))));
    await assertFails(
      getDoc(voteRef(asAnon(STRANGER_UID), `0_${STUDENT_VOTER}`))
    );
    await assertFails(getDocs(votesCol(asUnauthed())));
  });
});

describe('poll typed answers', () => {
  it('lets a joined device answer and refuses one that never joined', async () => {
    await assertSucceeds(
      setDoc(answerRef(asAnon(), `1_${ANON_UID}`), answer())
    );
    await assertSucceeds(
      setDoc(answerRef(asStudent(), `1_${STUDENT_UID}`), answer())
    );
    await assertFails(
      setDoc(answerRef(asAnon(STRANGER_UID), `1_${STRANGER_UID}`), answer())
    );
  });

  it('keeps answers readable only by their author and the owner', async () => {
    await seed(`poll_sessions/${SESSION_ID}/answers/1_${ANON_UID}`, {
      questionIndex: 1,
      text: 'gravity',
      votedAt: 1,
    });
    await assertSucceeds(getDoc(answerRef(asAnon(), `1_${ANON_UID}`)));
    await assertSucceeds(getDoc(answerRef(asTeacher(), `1_${ANON_UID}`)));
    await assertFails(getDoc(answerRef(asStudent(), `1_${ANON_UID}`)));
    await assertFails(getDoc(answerRef(asCoTeacher(), `1_${ANON_UID}`)));
  });
});
