// A synced building_admin /admins doc keeps ordinary admin settings but never
// reaches another teacher's student data; hand-made and synced super/domain
// admins still do.
//
// Requires the Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-site-admin-student-data';
const TEACHER_UID = 'teacher-uid';
const SESSION_ID = 'quiz-session-1';
const VA_SESSION_ID = 'va-session-1';
const STUDENT_UID = 'student-uid';
const OWN_SESSION_ID = 'quiz-session-own';
const RESPONSE_KEY = 'pin-period_1-01';
const PIN_INDEX = `users/${TEACHER_UID}/rosters/roster-1/pin_index/period_1__1234`;
const RESPONSE = `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_KEY}`;
const OWN_RESPONSE = `quiz_sessions/${OWN_SESSION_ID}/responses/${RESPONSE_KEY}`;
const LIVE_STUDENT = `sessions/${TEACHER_UID}/students/${STUDENT_UID}`;
const LEDGER = `quiz_attempt_ledger/${SESSION_ID}__${STUDENT_UID}`;
const VA_RESPONSE = `video_activity_sessions/${VA_SESSION_ID}/responses/${STUDENT_UID}`;
const GL_RESPONSE = `guided_learning_sessions/gl-1/responses/${STUDENT_UID}`;
const MA_SUBMISSION = `mini_app_sessions/ma-1/submissions/${STUDENT_UID}`;
const POLL_ANSWER = `poll_sessions/${TEACHER_UID}_poll-1/answers/0_${STUDENT_UID}`;
const NEXTUP_ENTRY = `nextup_sessions/${TEACHER_UID}_w1/entries/e1`;
const HISTORY = `${RESPONSE}/history/h1`;
const ATTEMPT = `${RESPONSE}/attempts/a1`;
const LIVE_NAMES = `quiz_sessions/${SESSION_ID}/live/leaderboard`;
const ATTEMPT_SCORES = `quiz_sessions/${SESSION_ID}/attemptScores/${RESPONSE_KEY}`;
const ARCHIVED = `quiz_sessions/${SESSION_ID}/archived_responses/${RESPONSE_KEY}`;
const VA_LEDGER = `video_activity_attempt_ledger/${VA_SESSION_ID}__${STUDENT_UID}`;
const MA_ATTEMPT = `${MA_SUBMISSION}/attempts/a1`;
const HIDDEN_WORDS = `poll_sessions/${TEACHER_UID}_poll-1/hidden_words/q1`;
const STUDENT_READS = [
  HISTORY,
  ATTEMPT,
  LIVE_NAMES,
  ATTEMPT_SCORES,
  ARCHIVED,
  VA_LEDGER,
  MA_ATTEMPT,
  HIDDEN_WORDS,
];
const STUDENT_DELETES = [
  LEDGER,
  MA_SUBMISSION,
  MA_ATTEMPT,
  HIDDEN_WORDS,
  NEXTUP_ENTRY,
  POLL_ANSWER,
];

const ADMINS = {
  handMade: 'site-admin@orono.k12.mn.us',
  syncedSuper: 'super@orono.k12.mn.us',
  syncedDomain: 'domain@orono.k12.mn.us',
  syncedBuilding: 'building-admin@orono.k12.mn.us',
} as const;

const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

let testEnv: RulesTestEnvironment;

const as = (email: string) =>
  testEnv
    .authenticatedContext(`uid-${email}`, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

beforeAll(async () => {
  const [host, port] = (
    process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  ).split(':');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES, 'utf8'),
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed(`admins/${ADMINS.handMade}`, { email: ADMINS.handMade });
  for (const [email, roleId] of [
    [ADMINS.syncedSuper, 'super_admin'],
    [ADMINS.syncedDomain, 'domain_admin'],
    [ADMINS.syncedBuilding, 'building_admin'],
  ]) {
    await seed(`admins/${email}`, {
      source: 'organizationMembersSync',
      orgId: 'orono',
      roleId,
      email,
    });
  }
  await seed(PIN_INDEX, { pseudonym: 'pseudo-1' });
  await seed(`quiz_sessions/${SESSION_ID}`, {
    teacherUid: TEACHER_UID,
    status: 'active',
    code: 'ABCDEF',
    classId: 'class-1',
    classIds: ['class-1'],
  });
  await seed(RESPONSE, {
    studentUid: STUDENT_UID,
    pin: '01',
    classPeriod: 'period_1',
    joinedAt: Date.now(),
    score: null,
    answers: [],
    status: 'joined',
    completedAttempts: 0,
    preSyncVersion: 0,
    tabSwitchWarnings: 0,
  });
  await seed(LIVE_STUDENT, { pin: '1234', status: 'active', joinedAt: 1 });
  await seed(LEDGER, {
    studentUid: STUDENT_UID,
    teacherUid: TEACHER_UID,
    quizId: 'quiz-1',
    completedAttempts: 1,
  });
  await seed(`video_activity_sessions/${VA_SESSION_ID}`, {
    teacherUid: TEACHER_UID,
    status: 'active',
  });
  await seed(VA_RESPONSE, { studentUid: STUDENT_UID, answers: [] });
  await seed('guided_learning_sessions/gl-1', { teacherUid: TEACHER_UID });
  await seed(GL_RESPONSE, { studentAnonymousId: STUDENT_UID });
  await seed('mini_app_sessions/ma-1', { teacherUid: TEACHER_UID });
  await seed(MA_SUBMISSION, { studentUid: STUDENT_UID });
  await seed(POLL_ANSWER, { questionIndex: 0, text: 'Ada', votedAt: 1 });
  await seed(NEXTUP_ENTRY, { name: 'Ada', joinedAt: 1 });
  await seed(HISTORY, { questionId: 'q1', answer: 'a', status: 'joined' });
  await seed(ATTEMPT, { closed: true, answers: [] });
  await seed(LIVE_NAMES, { names: [] });
  await seed(ATTEMPT_SCORES, { scores: [] });
  await seed(ARCHIVED, { studentUid: STUDENT_UID, archivedBy: TEACHER_UID });
  await seed(VA_LEDGER, {
    studentUid: STUDENT_UID,
    teacherUid: TEACHER_UID,
    completedAttempts: 1,
  });
  await seed(MA_ATTEMPT, { score: 1 });
  await seed(HIDDEN_WORDS, { words: ['x'] });
  await seed(`quiz_sessions/${OWN_SESSION_ID}`, {
    teacherUid: `uid-${ADMINS.syncedBuilding}`,
    status: 'active',
    code: 'GHIJKL',
    classId: 'class-1',
    classIds: ['class-1'],
  });
  await seed(OWN_RESPONSE, { studentUid: STUDENT_UID, answers: [] });
});

describe('synced building admin', () => {
  const db = () => as(ADMINS.syncedBuilding);

  it("cannot read another teacher's roster pin_index", async () => {
    await assertFails(getDoc(doc(db(), PIN_INDEX)));
  });

  it('cannot read, update or delete a quiz response', async () => {
    await assertFails(getDoc(doc(db(), RESPONSE)));
    await assertFails(updateDoc(doc(db(), RESPONSE), { score: 100 }));
    await assertFails(deleteDoc(doc(db(), RESPONSE)));
  });

  it('cannot read live-session PINs, ledgers or video activity responses', async () => {
    await assertFails(getDoc(doc(db(), LIVE_STUDENT)));
    await assertFails(getDoc(doc(db(), LEDGER)));
    await assertFails(getDoc(doc(db(), VA_RESPONSE)));
  });

  it('cannot change or remove a live-session student record', async () => {
    await assertFails(updateDoc(doc(db(), LIVE_STUDENT), { status: 'frozen' }));
    await assertFails(deleteDoc(doc(db(), LIVE_STUDENT)));
  });

  it('cannot read guided learning, mini-app, poll or Next Up student work', async () => {
    await assertFails(getDoc(doc(db(), GL_RESPONSE)));
    await assertFails(getDoc(doc(db(), MA_SUBMISSION)));
    await assertFails(getDoc(doc(db(), POLL_ANSWER)));
    await assertFails(getDoc(doc(db(), NEXTUP_ENTRY)));
  });

  it('cannot read attempts, history, scores, archives or other student records', async () => {
    for (const path of STUDENT_READS) {
      await assertFails(getDoc(doc(db(), path)));
    }
  });

  it('cannot grade an attempt or delete ledgers, submissions or answers', async () => {
    await assertFails(updateDoc(doc(db(), ATTEMPT), { grading: { q1: 1 } }));
    for (const path of STUDENT_DELETES) {
      await assertFails(deleteDoc(doc(db(), path)));
    }
  });

  it('keeps full access to their own session as its teacher', async () => {
    await assertSucceeds(getDoc(doc(db(), OWN_RESPONSE)));
    await assertSucceeds(deleteDoc(doc(db(), OWN_RESPONSE)));
  });

  it('still writes ordinary admin settings', async () => {
    await assertSucceeds(
      setDoc(doc(db(), 'admin_settings/app_settings'), { a: 1 })
    );
  });
});

describe.each([
  ['hand-made admin', ADMINS.handMade],
  ['synced super admin', ADMINS.syncedSuper],
  ['synced domain admin', ADMINS.syncedDomain],
])('%s', (_label, email) => {
  it('keeps access to student data', async () => {
    const db = as(email);
    await assertSucceeds(getDoc(doc(db, PIN_INDEX)));
    await assertSucceeds(getDoc(doc(db, RESPONSE)));
    await assertSucceeds(updateDoc(doc(db, RESPONSE), { score: 100 }));
    await assertSucceeds(getDoc(doc(db, LIVE_STUDENT)));
    await assertSucceeds(getDoc(doc(db, LEDGER)));
    await assertSucceeds(getDoc(doc(db, VA_RESPONSE)));
    await assertSucceeds(getDoc(doc(db, GL_RESPONSE)));
    await assertSucceeds(getDoc(doc(db, MA_SUBMISSION)));
    await assertSucceeds(getDoc(doc(db, POLL_ANSWER)));
    await assertSucceeds(getDoc(doc(db, NEXTUP_ENTRY)));
    await assertSucceeds(
      updateDoc(doc(db, LIVE_STUDENT), { status: 'frozen' })
    );
    await assertSucceeds(deleteDoc(doc(db, RESPONSE)));
  });

  it('keeps read, grade and delete access to the other student records', async () => {
    const db = as(email);
    for (const path of STUDENT_READS) {
      await assertSucceeds(getDoc(doc(db, path)));
    }
    await assertSucceeds(updateDoc(doc(db, ATTEMPT), { grading: { q1: 1 } }));
    for (const path of STUDENT_DELETES) {
      await assertSucceeds(deleteDoc(doc(db, path)));
    }
  });
});
