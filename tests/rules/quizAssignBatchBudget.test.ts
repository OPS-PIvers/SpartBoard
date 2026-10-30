// The full batch createAssignment commits (hooks/useQuizAssignments.ts) must stay inside
// Firestore's per-batch get()/exists() budget, PLC-linked or not.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-quiz-assign-batch-budget';
const TEACHER_UID = 'assign-batch-teacher';
const TEACHER_EMAIL = 'assign.batch@orono.k12.mn.us';
const PLC_ID = 'assign-batch-plc';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: TEACHER_EMAIL,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
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
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await seedDistrictStaff(ctx.firestore(), [TEACHER_EMAIL]);
    await setDoc(doc(ctx.firestore(), 'plcs', PLC_ID), {
      name: 'Assign batch PLC',
      leadUid: TEACHER_UID,
      memberUids: [TEACHER_UID],
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

// Same writes, in the same order, as createAssignment's batch.
function assignBatch(
  sessionId: string,
  code: string,
  opts: { plc: boolean; perPeriod: boolean; scoreKey: boolean }
) {
  const db = asTeacher();
  const now = 1000;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', TEACHER_UID, 'quiz_assignments', sessionId), {
    id: sessionId,
    teacherUid: TEACHER_UID,
    quizId: 'quiz-1',
    code,
    status: 'active',
    createdAt: now,
  });
  batch.set(doc(db, 'quiz_sessions', sessionId), {
    teacherUid: TEACHER_UID,
    code,
    status: 'active',
    classIds: ['period-1', 'period-2'],
    publicQuestions: opts.perPeriod ? [] : [{ id: 'q1' }],
    ...(opts.perPeriod
      ? {
          accessMode: 'perPeriod',
          periodAccess: { 'period-1': { open: false } },
          questionsInContent: true,
        }
      : {}),
    ...(opts.plc
      ? { plcId: PLC_ID, syncGroupId: 'sync-1', plcLinkedAt: now }
      : {}),
  });
  if (opts.scoreKey) {
    batch.set(
      doc(
        db,
        'users',
        TEACHER_UID,
        'quiz_assignments',
        sessionId,
        'key',
        'answers'
      ),
      { questions: [{ id: 'q1', correct: 'a' }] }
    );
  }
  if (opts.perPeriod) {
    batch.set(doc(db, 'quiz_sessions', sessionId, 'content', 'questions'), {
      publicQuestions: [{ id: 'q1' }],
    });
  }
  batch.set(doc(db, 'quiz_join_codes', code), {
    teacherUid: TEACHER_UID,
    createdAt: now,
  });
  batch.set(doc(db, 'quiz_join_codes', code, 'sessions', sessionId), {
    sessionId,
    teacherUid: TEACHER_UID,
    createdAt: now,
  });
  return batch.commit();
}

describe('createAssignment batch fits the rules get() budget', () => {
  it('commits the largest shape: PLC link, per-period content and score key', async () => {
    await assertSucceeds(
      assignBatch('assign-plc-full', 'BUDG01', {
        plc: true,
        perPeriod: true,
        scoreKey: true,
      })
    );
  });

  it('commits a PLC-linked session without content or key', async () => {
    await assertSucceeds(
      assignBatch('assign-plc-plain', 'BUDG02', {
        plc: true,
        perPeriod: false,
        scoreKey: false,
      })
    );
  });

  it('commits a non-PLC per-period session with a score key', async () => {
    await assertSucceeds(
      assignBatch('assign-solo-full', 'BUDG03', {
        plc: false,
        perPeriod: true,
        scoreKey: true,
      })
    );
  });

  it('commits a plain non-PLC session', async () => {
    await assertSucceeds(
      assignBatch('assign-solo-plain', 'BUDG04', {
        plc: false,
        perPeriod: false,
        scoreKey: false,
      })
    );
  });

  it('still denies the full shape on a code another teacher holds', async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'quiz_join_codes', 'BUDG05'), {
        teacherUid: 'someone-else',
        createdAt: 1,
      })
    );
    await assertFails(
      assignBatch('assign-held', 'BUDG05', {
        plc: true,
        perPeriod: true,
        scoreKey: true,
      })
    );
  });
});
