// Rules tests: archive state and the paper seat on a quiz response are server-written only.
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
import { setDoc, updateDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-archive-fields-test';
const SESSION_ID = 'session-archive-fields';
const TEACHER_UID = 'teacher-uid-archive';
const ANON_UID = 'anon-archive-uid';
const SSO_UID = 'sso-archive-uid';
const CLASS_ID = 'class-archive';
const PIN_KEY = 'pin-period_1-01';
const RESPONSE_PATH = `quiz_sessions/${SESSION_ID}/responses/${PIN_KEY}`;
const TEACHER_RESPONSE_PATH = `quiz_sessions/${SESSION_ID}/responses/pin-period_1-02`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudentRole = () =>
  testEnv
    .authenticatedContext(SSO_UID, {
      email: 'kid@school.edu',
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

const baseResponse = (studentUid: string = ANON_UID) => ({
  studentUid,
  pin: '01',
  classPeriod: 'period_1',
  joinedAt: 1000,
  score: null,
  answers: [],
  status: 'joined' as const,
  completedAttempts: 0,
  preSyncVersion: 0,
  tabSwitchWarnings: 0,
});

const SEEDED_FIELDS: Record<string, unknown> = {
  artifactArchive: { hw_scan_q1: { storageCleanupPending: true } },
  hasStuckArchive: true,
  paperSeat: 4,
  paperBatchId: 'batch-1',
};

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
      code: 'ARCHIV',
      classId: CLASS_ID,
      classIds: [CLASS_ID],
    });
  });
});

describe('quiz response CREATE — server-owned archive fields', () => {
  it('control: minimal valid CREATE succeeds', async () => {
    await assertSucceeds(
      setDoc(doc(asAnonStudent(), RESPONSE_PATH), baseResponse())
    );
  });

  it('control: studentRole and teacher CREATE without them succeed', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asStudentRole(),
          `quiz_sessions/${SESSION_ID}/responses/${SSO_UID}`
        ),
        baseResponse(SSO_UID)
      )
    );
    await assertSucceeds(
      setDoc(doc(asTeacher(), TEACHER_RESPONSE_PATH), {
        ...baseResponse(TEACHER_UID),
        pin: '02',
      })
    );
  });

  for (const [field, value] of Object.entries(SEEDED_FIELDS)) {
    it(`anonymous CREATE with ${field} is REJECTED`, async () => {
      await assertFails(
        setDoc(doc(asAnonStudent(), RESPONSE_PATH), {
          ...baseResponse(),
          [field]: value,
        })
      );
    });

    it(`studentRole CREATE with ${field} is REJECTED`, async () => {
      await assertFails(
        setDoc(
          doc(
            asStudentRole(),
            `quiz_sessions/${SESSION_ID}/responses/${SSO_UID}`
          ),
          { ...baseResponse(SSO_UID), [field]: value }
        )
      );
    });

    it(`teacher CREATE with ${field} is REJECTED`, async () => {
      await assertFails(
        setDoc(doc(asTeacher(), TEACHER_RESPONSE_PATH), {
          ...baseResponse(TEACHER_UID),
          pin: '02',
          [field]: value,
        })
      );
    });
  }
});

describe('quiz response UPDATE — server-owned archive fields', () => {
  it('student cannot add archive state or a seat', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), RESPONSE_PATH), baseResponse());
    });
    for (const [field, value] of Object.entries(SEEDED_FIELDS)) {
      await assertFails(
        updateDoc(doc(asAnonStudent(), RESPONSE_PATH), { [field]: value })
      );
    }
  });
});
