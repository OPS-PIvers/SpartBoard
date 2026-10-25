// Rules tests: a quiz response create cannot seed server-owned media archive fields (needs the emulator).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-quiz-response-archive-fields';
const TEACHER_UID = 'teacher-uid-qraf';
const SESSION_PATH = 'quiz_sessions/quiz-qraf';
const PIN_KEY = 'pin-period_1-01';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
const asStudentRole = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      classIds: [],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@school.edu`,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const baseResponse = (uid: string) => ({
  studentUid: uid,
  joinedAt: 1000,
  status: 'joined',
  answers: [{ questionId: 'q1', artifacts: [{ id: 'art-1', kind: 'audio' }] }],
  score: null,
  submittedAt: null,
  completedAttempts: 0,
  preSyncVersion: 0,
});

const forgedArchive = {
  'art-1': { archiveStatus: 'deleting', driveFileId: 'victim-drive-id' },
};

const callers: Array<
  [string, (uid: string) => ReturnType<typeof asAnon>, string, string]
> = [
  ['anonymous PIN joiner', asAnon, 'anon-qraf', PIN_KEY],
  ['studentRole user', asStudentRole, 'sso-qraf', 'sso-qraf'],
  ['another teacher', asTeacher, 'other-teacher-qraf', PIN_KEY],
];

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: host || '127.0.0.1',
      port: port ? Number(port) : 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), SESSION_PATH), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      code: 'QRAF01',
    });
  });
});

describe.each(callers)(
  'quiz response create by %s',
  (_label, ctxFor, uid, key) => {
    const path = `${SESSION_PATH}/responses/${key}`;

    it('accepts a plain join', async () => {
      await assertSucceeds(setDoc(doc(ctxFor(uid), path), baseResponse(uid)));
    });

    it('refuses a forged artifactArchive', async () => {
      await assertFails(
        setDoc(doc(ctxFor(uid), path), {
          ...baseResponse(uid),
          artifactArchive: forgedArchive,
        })
      );
    });

    it('refuses a forged hasStuckArchive flag', async () => {
      await assertFails(
        setDoc(doc(ctxFor(uid), path), {
          ...baseResponse(uid),
          hasStuckArchive: true,
        })
      );
    });

    it('refuses forged backTranslations', async () => {
      await assertFails(
        setDoc(doc(ctxFor(uid), path), {
          ...baseResponse(uid),
          backTranslations: { q1: 'forged' },
        })
      );
    });
  }
);

describe('quiz response update by its owning student', () => {
  const path = `${SESSION_PATH}/responses/${PIN_KEY}`;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path), baseResponse('anon-qraf'));
    });
  });

  it('refuses adding artifactArchive', async () => {
    await assertFails(
      updateDoc(doc(asAnon('anon-qraf'), path), {
        artifactArchive: forgedArchive,
      })
    );
  });

  it('refuses setting hasStuckArchive', async () => {
    await assertFails(
      updateDoc(doc(asAnon('anon-qraf'), path), { hasStuckArchive: true })
    );
  });
});
