// Rules tests: a PIN device claims a scan-first hybrid row the paper import left unowned (AB-127).
// Requires a running Firestore emulator (pnpm run test:rules).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getDoc, updateDoc, setDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-paper-adopt-test';
const SESSION_ID = 'session-paper-adopt';
const TEACHER_UID = 'teacher-uid-adopt';
const DEVICE_UID = 'anon-adopt-uid';
const OTHER_DEVICE_UID = 'anon-adopt-other';
const PIN_KEY = 'pin-period_1-1234';
const RESPONSE_PATH = `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const PAPER_ANSWER = {
  questionId: 'q2',
  answer: '',
  answeredAt: 1,
  status: 'submitted',
  paperScanId: 'scan-1',
  paperTranscript: 'pending',
};

// What importPaperResponses writes for a seat with no device row and no pseudonym.
const scanFirstRow = (extra: Record<string, unknown> = {}) => ({
  studentUid: PIN_KEY,
  pin: '1234',
  classPeriod: 'Period 1',
  joinedAt: 1000,
  status: 'joined',
  score: null,
  submittedAt: null,
  completedAttempts: 0,
  preSyncVersion: 0,
  answers: [PAPER_ANSWER],
  paperWrittenBatchId: 'batch-1',
  paperWrittenSeat: 3,
  ...extra,
});

const seed = (row: Record<string, unknown>, session = {}) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      code: 'ADOPT1',
      periodNames: ['Period 1'],
      paperWrittenQuestionIds: ['q2'],
      ...session,
    });
    await setDoc(doc(ctx.firestore(), RESPONSE_PATH), row);
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
});

describe('quiz response — adopting a scan-first hybrid row', () => {
  it('the unowned row is unreadable before the claim', async () => {
    await seed(scanFirstRow());
    await assertFails(getDoc(doc(asAnon(DEVICE_UID), RESPONSE_PATH)));
  });

  it('a device claims it, keeps the paper answers and can then read it', async () => {
    await seed(scanFirstRow());
    const db = asAnon(DEVICE_UID);
    await assertSucceeds(
      updateDoc(doc(db, RESPONSE_PATH), { studentUid: DEVICE_UID })
    );
    const snap = await assertSucceeds(getDoc(doc(db, RESPONSE_PATH)));
    expect(snap.data()?.answers).toEqual([PAPER_ANSWER]);
    expect(snap.data()?.paperWrittenBatchId).toBe('batch-1');
  });

  it('a second device is refused once the row is claimed', async () => {
    await seed(scanFirstRow());
    await assertSucceeds(
      updateDoc(doc(asAnon(DEVICE_UID), RESPONSE_PATH), {
        studentUid: DEVICE_UID,
      })
    );
    const other = asAnon(OTHER_DEVICE_UID);
    await assertFails(
      updateDoc(doc(other, RESPONSE_PATH), { studentUid: OTHER_DEVICE_UID })
    );
    await assertFails(getDoc(doc(other, RESPONSE_PATH)));
  });

  it('the claim cannot write anything but its own uid', async () => {
    await seed(scanFirstRow());
    const db = asAnon(DEVICE_UID);
    await assertFails(
      updateDoc(doc(db, RESPONSE_PATH), {
        studentUid: DEVICE_UID,
        answers: [],
      })
    );
    await assertFails(
      updateDoc(doc(db, RESPONSE_PATH), { studentUid: OTHER_DEVICE_UID })
    );
  });

  it('a row with no scanned written answers cannot be claimed', async () => {
    const { paperWrittenBatchId: _b, ...plain } = scanFirstRow();
    await seed(plain);
    await assertFails(
      updateDoc(doc(asAnon(DEVICE_UID), RESPONSE_PATH), {
        studentUid: DEVICE_UID,
      })
    );
  });

  it('a row already owned by a device cannot be claimed', async () => {
    await seed(scanFirstRow({ studentUid: OTHER_DEVICE_UID }));
    await assertFails(
      updateDoc(doc(asAnon(DEVICE_UID), RESPONSE_PATH), {
        studentUid: DEVICE_UID,
      })
    );
  });

  it('no claim once the session has ended', async () => {
    await seed(scanFirstRow(), { status: 'ended', endedAt: 1 });
    await assertFails(
      updateDoc(doc(asAnon(DEVICE_UID), RESPONSE_PATH), {
        studentUid: DEVICE_UID,
      })
    );
  });

  it('no claim when the session takes no anonymous joins', async () => {
    await seed(scanFirstRow(), { allowAnonymousJoin: false });
    await assertFails(
      updateDoc(doc(asAnon(DEVICE_UID), RESPONSE_PATH), {
        studentUid: DEVICE_UID,
      })
    );
  });
});
