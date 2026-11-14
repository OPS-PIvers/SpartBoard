// Rules tests: imported paper answers (entries with paperScanId) are locked against student writes.
// Requires a running Firestore emulator (pnpm run test:rules).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-paper-answer-lock-test';
const SESSION_ID = 'session-paper-lock';
const TEACHER_UID = 'teacher-uid-paper-lock';
const STUDENT_UID = 'anon-paper-lock-uid';
const CLASS_ID = 'class-paper-lock';
const RESPONSE_PATH = `quiz_sessions/${SESSION_ID}/responses/${STUDENT_UID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudentRole = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const MC = {
  questionId: 'q1',
  answer: 'A',
  answeredAt: 1,
  status: 'submitted',
};
const PAPER = {
  questionId: 'q2',
  answer: 'photosynthesis',
  answeredAt: 2,
  status: 'submitted',
  paperScanId: 'scan-1',
  paperTranscript: 'done',
  artifacts: [
    {
      id: 'hw_scan-1_q2',
      slot: 'primary',
      kind: 'handwriting',
      storagePath: 'paper/scan-1/q2.png',
      mimeType: 'image/png',
      uploadState: 'uploaded',
    },
  ],
};
const PAPER_2 = { ...PAPER, questionId: 'q4', paperScanId: 'scan-1' };

const seed = async (data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), RESPONSE_PATH), {
      studentUid: STUDENT_UID,
      pin: '01',
      classPeriod: 'period_1',
      joinedAt: Date.now(),
      score: null,
      status: 'in-progress',
      completedAttempts: 0,
      preSyncVersion: 0,
      tabSwitchWarnings: 0,
      ...data,
    });
  });

const hybrid = (answers: unknown[], extra: Record<string, unknown> = {}) =>
  seed({
    answers,
    paperWrittenBatchId: 'batch-1',
    paperWrittenSeat: 3,
    ...extra,
  });

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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'PAPERL',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      attemptLimit: 2,
      paperWrittenQuestionIds: ['q2', 'q4'],
    });
  });
});

describe('hybrid paper response: student writes keep paper answers', () => {
  it('control: the student can still answer and change device questions', async () => {
    await hybrid([PAPER]);
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), { answers: [PAPER, MC] })
    );
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [PAPER, { ...MC, answer: 'B' }],
      })
    );
  });

  it('control: the draft rewrite that moves the changed entry to the end is allowed', async () => {
    await hybrid([MC, PAPER]);
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [PAPER, { ...MC, answer: 'C' }],
      })
    );
  });

  it('refuses editing a transcribed paper answer', async () => {
    await hybrid([MC, PAPER]);
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [MC, { ...PAPER, answer: 'forged' }],
      })
    );
  });

  it('refuses a stale draft that drops a paper answer', async () => {
    await hybrid([MC, PAPER]);
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ ...MC, answer: 'B' }],
      })
    );
  });

  it('refuses dropping every answer without a retake', async () => {
    await hybrid([MC, PAPER, PAPER_2]);
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), { answers: [] })
    );
  });

  it('refuses forging a new paper answer', async () => {
    await hybrid([MC]);
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [MC, { ...PAPER, questionId: 'q9' }],
      })
    );
  });

  it('refuses a device entry that shadows a paper answer', async () => {
    await hybrid([MC, PAPER]);
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [
          {
            questionId: 'q2',
            answer: 'forged',
            status: 'submitted',
            paperTranscript: 'done',
          },
          MC,
          PAPER,
        ],
      })
    );
  });

  it('refuses changing a paper answer on a scan-first joined row', async () => {
    await hybrid([PAPER], { status: 'joined' });
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ ...PAPER, paperTranscript: 'blank', answer: '' }],
      })
    );
  });

  it('refuses changing a paper answer after a teacher unlock', async () => {
    await hybrid([MC, PAPER], {
      status: 'completed',
      unlocked: true,
      completedAttempts: 1,
    });
    await assertFails(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [MC, { ...PAPER, answer: 'forged' }],
      })
    );
  });

  it('control: a retake still clears the answers, as the previous app does', async () => {
    await hybrid([MC, PAPER], {
      status: 'completed',
      completedAttempts: 1,
      submittedAt: 5,
    });
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        status: 'joined',
        answers: [],
        score: null,
        submittedAt: null,
        preSyncVersion: 0,
      })
    );
  });

  it('control: the teacher can still edit a paper answer', async () => {
    await hybrid([MC, PAPER]);
    await assertSucceeds(
      updateDoc(doc(asTeacher(), RESPONSE_PATH), {
        answers: [MC, { ...PAPER, answer: 'fixed' }],
      })
    );
  });

  it('student and teacher can still read the response', async () => {
    await hybrid([MC, PAPER]);
    await assertSucceeds(getDoc(doc(asStudent(), RESPONSE_PATH)));
    await assertSucceeds(getDoc(doc(asTeacher(), RESPONSE_PATH)));
  });
});

describe('hybrid response: the costliest student path stays under the expression limit', () => {
  it('an unlocked studentRole student turns in after the close time', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
        teacherUid: TEACHER_UID,
        status: 'active',
        code: 'PAPERL',
        classId: CLASS_ID,
        classIds: [CLASS_ID],
        closeAt: 1_000_000_000_000,
        paperWrittenQuestionIds: ['q2', 'q4'],
      });
    });
    await hybrid([PAPER], { status: 'joined', unlocked: true });
    await assertSucceeds(
      updateDoc(doc(asStudentRole(), RESPONSE_PATH), {
        answers: [PAPER, MC],
        status: 'completed',
        submittedAt: Date.now(),
        completedAttempts: 1,
        unlocked: false,
      })
    );
  });
});

describe('device-only response', () => {
  it('control: a first answer on a doc with no answers field is unchanged', async () => {
    await seed({});
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), { answers: [MC] })
    );
  });

  it('control: a device answer to a paper question before any import is unchanged', async () => {
    await seed({ answers: [] });
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ ...MC, questionId: 'q2', answer: '' }],
      })
    );
  });

  it('control: multi-entry rewrites are unchanged', async () => {
    await seed({ answers: [MC, { ...MC, questionId: 'q3' }] });
    await assertSucceeds(
      updateDoc(doc(asStudent(), RESPONSE_PATH), {
        answers: [{ ...MC, questionId: 'q5' }],
      })
    );
  });
});
