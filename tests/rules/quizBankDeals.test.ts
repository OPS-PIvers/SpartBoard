// Firestore rules for balanced bank slots (docs/plans/shipped/QUIZ_IMPORT_VERSIONS.md V18-V19):
//   - quiz_sessions/{id}/bank_deals/{dealId}: any signed-in read; a counter that
//     only a seated student advances, by one, on a session with bank slots; teacher deletes
//   - the counter's `by` is the caller's uid, never the (PIN-bearing) response key
//   - responses: `dealtQuestionIds` is a capped list on the student surface, never set at create
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
import {
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-bank-deals';
const SESSION_ID = 'session-deals-1';
const CLASS_ID = 'class-deals-1';
const TEACHER_UID = 'teacher-deals-uid';
const STUDENT_UID = 'student-deals-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@school.edu',
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const dealPath = `quiz_sessions/${SESSION_ID}/bank_deals/s1__period_1`;
const PIN_KEY = 'pin-period_1-4821';
const responsePath = `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`;
const seatPath = `quiz_sessions/${SESSION_ID}/seats/${STUDENT_UID}`;

const seed = async (opts: {
  bankSlots: boolean;
  dealt?: number;
  seated?: boolean;
}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      assignmentId: 'assignment-deals-1',
      status: 'active',
      code: 'DEALS1',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      totalQuestions: 2,
      ...(opts.bankSlots
        ? {
            bankSlots: [
              {
                id: 's1',
                count: 1,
                points: 1,
                poolQuestionIds: ['va', 'vb'],
                position: 1,
                dealing: 'balanced',
              },
            ],
          }
        : {}),
    });
    await setDoc(doc(db, responsePath), {
      studentUid: STUDENT_UID,
      joinedAt: 1000,
      score: null,
      answers: [],
      status: 'joined',
      completedAttempts: 0,
      preSyncVersion: 0,
      classPeriod: 'Period 1',
    });
    if (opts.seated !== false) {
      await setDoc(doc(db, seatPath), { responseKey: PIN_KEY });
    }
    if (opts.dealt !== undefined) {
      await setDoc(doc(db, dealPath), { dealt: opts.dealt });
    }
  });
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
});

describe('quiz_sessions/{id}/bank_deals/{dealId}', () => {
  it('signed-in callers read the counter; unauthenticated cannot', async () => {
    await seed({ bankSlots: true, dealt: 3 });
    await assertSucceeds(getDoc(doc(asStudent(), dealPath)));
    await assertSucceeds(getDoc(doc(asTeacher(), dealPath)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), dealPath))
    );
  });

  it('a student creates the counter at 1 and advances it by exactly one', async () => {
    await seed({ bankSlots: true });
    await assertFails(
      setDoc(doc(asStudent(), dealPath), { dealt: 2, by: STUDENT_UID })
    );
    await assertSucceeds(
      setDoc(doc(asStudent(), dealPath), { dealt: 1, by: STUDENT_UID })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), dealPath), { dealt: 2, by: STUDENT_UID })
    );
    await assertFails(
      updateDoc(doc(asStudent(), dealPath), { dealt: 4, by: STUDENT_UID })
    );
    await assertFails(
      updateDoc(doc(asStudent(), dealPath), { dealt: 0, by: STUDENT_UID })
    );
    await assertFails(
      updateDoc(doc(asStudent(), dealPath), { dealt: 2, by: STUDENT_UID })
    );
  });

  it('rejects extra keys and counters on a session without bank slots', async () => {
    await seed({ bankSlots: true });
    await assertFails(
      setDoc(doc(asStudent(), dealPath), {
        dealt: 1,
        by: STUDENT_UID,
        seats: { x: 1 },
      })
    );
    await seed({ bankSlots: false });
    await assertFails(
      setDoc(doc(asStudent(), dealPath), { dealt: 1, by: STUDENT_UID })
    );
  });

  it('refuses callers without their own response in the session', async () => {
    await seed({ bankSlots: true });
    const stranger = testEnv
      .authenticatedContext('stranger-uid', { email: 'x@example.com' })
      .firestore();
    await assertFails(setDoc(doc(stranger, dealPath), { dealt: 1 }));
    await assertFails(
      setDoc(doc(stranger, dealPath), { dealt: 1, by: STUDENT_UID })
    );
    await assertFails(
      setDoc(doc(stranger, dealPath), { dealt: 1, by: 'stranger-uid' })
    );
    await assertFails(setDoc(doc(asStudent(), dealPath), { dealt: 1 }));
  });

  it('never stores the response key: `by` must be the caller uid', async () => {
    await seed({ bankSlots: true });
    await assertFails(
      setDoc(doc(asStudent(), dealPath), { dealt: 1, by: PIN_KEY })
    );
    await assertSucceeds(
      setDoc(doc(asStudent(), dealPath), { dealt: 1, by: STUDENT_UID })
    );
  });

  it('refuses a student with no seat unless the seat lands in the same write', async () => {
    await seed({ bankSlots: true, seated: false });
    const db = asStudent();
    await assertFails(setDoc(doc(db, dealPath), { dealt: 1, by: STUDENT_UID }));
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(doc(db, dealPath));
        await tx.get(doc(db, responsePath));
        tx.set(doc(db, seatPath), { responseKey: PIN_KEY });
        tx.set(doc(db, dealPath), { dealt: 1, by: STUDENT_UID });
        tx.update(doc(db, responsePath), {
          servedQuestionIds: ['f1', 'va'],
          dealtQuestionIds: ['va'],
          lastWriteAt: serverTimestamp(),
        });
      })
    );
  });

  it('only the session teacher deletes a counter', async () => {
    await seed({ bankSlots: true, dealt: 2 });
    await assertFails(deleteDoc(doc(asStudent(), dealPath)));
    await assertFails(deleteDoc(doc(asTeacher(OTHER_TEACHER_UID), dealPath)));
    await assertSucceeds(deleteDoc(doc(asTeacher(), dealPath)));
  });

  it('the deal transaction writes the counter and the response together', async () => {
    await seed({ bankSlots: true, dealt: 1 });
    const db = asStudent();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const counter = await tx.get(doc(db, dealPath));
        await tx.get(doc(db, responsePath));
        const dealt = (counter.data()?.dealt as number | undefined) ?? 0;
        tx.set(doc(db, dealPath), { dealt: dealt + 1, by: STUDENT_UID });
        tx.update(doc(db, responsePath), {
          servedQuestionIds: ['f1', 'vb'],
          dealtQuestionIds: ['vb'],
          lastWriteAt: serverTimestamp(),
        });
      })
    );
  });
});

describe('responses dealtQuestionIds', () => {
  it('cannot be set, nor partsDone, when the response is created', async () => {
    await seed({ bankSlots: true });
    const db = asStudent();
    const fresh = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;
    const base = {
      studentUid: STUDENT_UID,
      joinedAt: 2000,
      score: null,
      answers: [],
      status: 'joined',
      completedAttempts: 0,
      preSyncVersion: 0,
    };
    await assertFails(
      setDoc(doc(db, fresh), { ...base, dealtQuestionIds: ['va'] })
    );
    await assertFails(setDoc(doc(db, fresh), { ...base, partsDone: 3 }));
    await assertSucceeds(setDoc(doc(db, fresh), base));
  });

  it('accepts a list within the cap', async () => {
    await seed({ bankSlots: true });
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), {
        dealtQuestionIds: ['va', 'vb'],
      })
    );
  });

  it('rejects a non-list and a list over 150 ids', async () => {
    await seed({ bankSlots: true });
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), { dealtQuestionIds: 'va' })
    );
    await assertFails(
      updateDoc(doc(asStudent(), responsePath), {
        dealtQuestionIds: Array.from({ length: 151 }, (_, i) => `q${i}`),
      })
    );
  });
});
