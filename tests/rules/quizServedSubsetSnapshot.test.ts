// Firestore security-rules tests for the M17 `servedQuestionIds` snapshot
// on quiz response docs.
//
// Contract under test:
//   - CREATE: a join payload cannot carry `servedQuestionIds` — the field
//     is stamped on UPDATE only, where it is validated.
//   - UPDATE: a student may write `servedQuestionIds` only when it exactly
//     equals `override.questionIds` on their own pointer doc at
//     /student_assignments/{uid}/items/{assignmentId}. Anything else would
//     let a hostile client shrink the publish-time scoring denominator.
//   - UPDATE: clearing the field (mid-attempt override removal) and writes
//     that don't touch it are always allowed.
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
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  setDoc,
  updateDoc,
  doc,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-served-subset-test';
const SESSION_ID = 'session-served-subset';
const ASSIGNMENT_ID = 'assignment-served-subset';
const TEACHER_UID = 'teacher-served-subset';
const STUDENT_UID = 'student-served-subset';
const CLASS_ID = 'class-served-subset';

const SERVED = ['q0', 'q1'];

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: 'student@school.edu',
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

beforeAll(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostPart, portPart] = emulatorHost ? emulatorHost.split(':') : [];
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: hostPart || '127.0.0.1',
      port: portPart ? Number(portPart) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const responsePath = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;

const seed = async (opts: { pointerSubset?: string[] | null } = {}) => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      assignmentId: ASSIGNMENT_ID,
      status: 'active',
      code: 'SUBSET',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
    });
    await setDoc(doc(db, responsePath), {
      studentUid: STUDENT_UID,
      joinedAt: 1000,
      score: null,
      answers: [],
      status: 'in-progress',
      completedAttempts: 0,
      preSyncVersion: 0,
    });
    if (opts.pointerSubset !== undefined) {
      await setDoc(
        doc(db, `student_assignments/${STUDENT_UID}/items/${ASSIGNMENT_ID}`),
        {
          kind: 'quiz',
          sessionId: SESSION_ID,
          teacherUid: TEACHER_UID,
          ...(opts.pointerSubset
            ? { override: { questionIds: opts.pointerSubset } }
            : {}),
        }
      );
    }
  });
};

const answerWrite = (extra: Record<string, unknown>) => ({
  answers: [
    { questionId: 'q0', answer: 'a', answeredAt: 1, status: 'submitted' },
  ],
  status: 'in-progress',
  lastWriteAt: serverTimestamp(),
  ...extra,
});

beforeEach(async () => {
  await seed({ pointerSubset: SERVED });
});

describe('quiz response CREATE — servedQuestionIds forgery', () => {
  it('CREATE carrying servedQuestionIds is REJECTED', async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        assignmentId: ASSIGNMENT_ID,
        status: 'active',
        code: 'SUBSET',
        classId: CLASS_ID,
        classIds: [CLASS_ID],
      });
    });
    await assertFails(
      setDoc(doc(asStudent(), responsePath), {
        studentUid: STUDENT_UID,
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'joined',
        completedAttempts: 0,
        preSyncVersion: 0,
        servedQuestionIds: ['q0'],
      })
    );
  });
});

describe('quiz response UPDATE — servedQuestionIds validation', () => {
  it('control: answer write without the field SUCCEEDS', async () => {
    await assertSucceeds(
      updateDoc(doc(asStudent(), responsePath), answerWrite({}))
    );
  });

  it('snapshot equal to the pointer override SUCCEEDS', async () => {
    await assertSucceeds(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: SERVED })
      )
    );
  });

  it('snapshot smaller than the pointer override is REJECTED', async () => {
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: ['q0'] })
      )
    );
  });

  it('snapshot with different ids is REJECTED', async () => {
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: ['q2', 'q3'] })
      )
    );
  });

  it('snapshot is REJECTED when the pointer has no override subset', async () => {
    await seed({ pointerSubset: null });
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: SERVED })
      )
    );
  });

  it('snapshot is REJECTED when no pointer doc exists', async () => {
    await seed({});
    await assertFails(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: SERVED })
      )
    );
  });

  it('clearing a stale snapshot via deleteField SUCCEEDS even after override removal', async () => {
    await seed({ pointerSubset: null });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), responsePath), {
        servedQuestionIds: SERVED,
      });
    });
    await assertSucceeds(
      updateDoc(
        doc(asStudent(), responsePath),
        answerWrite({ servedQuestionIds: deleteField() })
      )
    );
  });
});
