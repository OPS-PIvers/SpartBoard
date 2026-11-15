// Worst-case legitimate PIN joins stay under the 1,000-expression rules limit. Requires the Firestore emulator.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'spartboard-pin-join-budget';
const TEACHER = 'teacher-pjb';
const QUIZ = 'pjb-quiz';
const VA = 'pjb-va';
const RUNS = 10;
const N = 30;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const anonDb = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();

const ids = (prefix: string) =>
  Array.from({ length: N }, (_, i) => `${prefix}-${i}`);
const CLASS = 'class-0';
const periodNames = ['Period 1', ...ids('Period').slice(1)];
const periodAccess = Object.fromEntries(
  ids('class').map((c, i) => [
    c,
    {
      state: 'open',
      openAt: Date.now() - 3600000,
      closeAt: Date.now() + 3600000,
      label: i === 0 ? 'Period One' : `Period ${i}`,
      rosterId: `roster-${i}`,
      bellPeriodId: null,
      verified: true,
    },
  ])
);

const bigSession = (code: string) => ({
  teacherUid: TEACHER,
  status: 'active',
  mode: 'submissions',
  code,
  rosterIds: ids('roster'),
  classIds: ids('class'),
  periodNames,
  periodAccess,
  accessMode: 'assignment',
  openAt: Date.now() - 3600000,
  closeAt: Date.now() + 3600000,
  classPeriodByClassId: Object.fromEntries(
    ids('class').map((c, i) => [c, periodNames[i]])
  ),
  allowAnonymousJoin: true,
});

const pinFor = (i: number) => String(i + 2).padStart(2, '0');

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
    await setDoc(doc(db, `quiz_sessions/${QUIZ}`), bigSession('PJBA'));
    await setDoc(doc(db, `video_activity_sessions/${VA}`), bigSession('PJBB'));
    // Every PIN is retired by other teachers' rosters, so each retirement lookup loads a doc and runs hasAny.
    for (let i = 0; i < RUNS; i++) {
      for (const per of ['period_1', 'period_one']) {
        await setDoc(
          doc(db, `users/${TEACHER}/retired_pins/${per}__${pinFor(i)}`),
          { rosterIds: ids('other-roster'), rosterId: 'other', updatedAt: 1 }
        );
      }
    }
  });
});

describe('worst-case legitimate PIN joins stay under the expression limit', () => {
  it(`quiz: a periodAccess PIN join with its seat, ${RUNS} times`, async () => {
    for (let i = 0; i < RUNS; i++) {
      const uid = `anon-q-${i}`;
      const db = anonDb(uid);
      const key = `pin-period_1-${pinFor(i)}`;
      await assertSucceeds(
        writeBatch(db)
          .set(doc(db, `quiz_sessions/${QUIZ}/responses/${key}`), {
            studentUid: uid,
            pin: pinFor(i),
            classPeriod: 'Period 1',
            classId: CLASS,
            joinedAt: 0,
            lastWriteAt: serverTimestamp(),
            attemptStartedAt: serverTimestamp(),
            status: 'joined',
            answers: [],
            score: null,
            submittedAt: null,
            completedAttempts: 0,
            preSyncVersion: 0,
          })
          .set(doc(db, `quiz_sessions/${QUIZ}/seats/${uid}`), {
            responseKey: key,
          })
          .commit()
      );
    }
  });

  it(`video activity: a periodAccess PIN join whose label differs from its key period, with its seat, ${RUNS} times`, async () => {
    for (let i = 0; i < RUNS; i++) {
      const uid = `anon-v-${i}`;
      const db = anonDb(uid);
      const key = `pin-period_1-${pinFor(i)}`;
      await assertSucceeds(
        writeBatch(db)
          .set(doc(db, `video_activity_sessions/${VA}/responses/${key}`), {
            studentUid: uid,
            pin: pinFor(i),
            classPeriod: 'Period One',
            classId: CLASS,
            joinedAt: 0,
            answers: [],
            completedAt: null,
            score: null,
            completedAttempts: 0,
            tabSwitchWarnings: 0,
          })
          .set(doc(db, `video_activity_sessions/${VA}/seats/${uid}`), {
            responseKey: key,
          })
          .commit()
      );
    }
  });

  it('video activity: refuses a doc period the session does not name', async () => {
    const db = anonDb('anon-v-x');
    await assertFails(
      setDoc(doc(db, `video_activity_sessions/${VA}/responses/pin-zz-02`), {
        studentUid: 'anon-v-x',
        pin: '02',
        classPeriod: 'zz',
        classId: CLASS,
        joinedAt: Date.now(),
        answers: [],
        completedAt: null,
        score: null,
        completedAttempts: 0,
        tabSwitchWarnings: 0,
      })
    );
  });
});
