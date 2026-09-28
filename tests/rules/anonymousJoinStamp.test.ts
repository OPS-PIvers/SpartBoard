// Response creates on Quiz and Video Activity sessions honor the allowAnonymousJoin stamp for PIN keys.
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
import { setDoc, getDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-anonymous-join-stamp';
const TEACHER_UID = 'teacher-uid-ajs';
const ANON_UID = 'anon-uid-ajs';
const STUDENT_UID = 'student-uid-ajs';
const CLASS_A = 'class-a';
const PIN_KEY = 'pin-period_1-01';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: [CLASS_A],
      firebase: { sign_in_provider: 'custom' },
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
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const pinResponse = (uid: string) => ({
  studentUid: uid,
  pin: '01',
  classPeriod: 'period_1',
  joinedAt: 1000,
  score: null,
  completedAt: null,
  answers: [],
  status: 'joined',
  completedAttempts: 0,
});

const ssoResponse = (uid: string) => ({
  studentUid: uid,
  joinedAt: 1000,
  score: null,
  completedAt: null,
  answers: [],
  status: 'joined',
  completedAttempts: 0,
});

// Stamp variants: false blocks PIN joins; true and absent (legacy) allow them.
const STAMPS: { name: string; stamp: Record<string, boolean> }[] = [
  { name: 'closed', stamp: { allowAnonymousJoin: false } },
  { name: 'open', stamp: { allowAnonymousJoin: true } },
  { name: 'legacy', stamp: {} },
];

describe.each([
  { collection: 'quiz_sessions', extra: { code: 'AJSTST' } },
  { collection: 'video_activity_sessions', extra: {} },
])('$collection responses: allowAnonymousJoin', ({ collection, extra }) => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const { name, stamp } of STAMPS) {
        await setDoc(doc(db, `${collection}/${name}`), {
          teacherUid: TEACHER_UID,
          status: 'active',
          mode: 'submissions',
          ...extra,
          ...stamp,
        });
        await setDoc(doc(db, `${collection}/${name}-class`), {
          teacherUid: TEACHER_UID,
          status: 'active',
          mode: 'submissions',
          classIds: [CLASS_A],
          ...extra,
          ...stamp,
        });
      }
    });
  });

  it('denies a PIN join on a session stamped closed', async () => {
    await assertFails(
      setDoc(
        doc(asAnon(), `${collection}/closed/responses/${PIN_KEY}`),
        pinResponse(ANON_UID)
      )
    );
  });

  it('allows a PIN join on an open or unstamped session', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAnon(), `${collection}/open/responses/${PIN_KEY}`),
        pinResponse(ANON_UID)
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asAnon(), `${collection}/legacy/responses/${PIN_KEY}`),
        pinResponse(ANON_UID)
      )
    );
  });

  it('still allows a signed-in student on a session stamped closed', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), `${collection}/closed-class/responses/${STUDENT_UID}`),
        ssoResponse(STUDENT_UID)
      )
    );
  });

  it('still lets a PIN joiner probe their key before joining', async () => {
    await assertSucceeds(
      getDoc(doc(asAnon(), `${collection}/closed/responses/${PIN_KEY}`))
    );
  });

  it('keeps an existing PIN response readable by its owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `${collection}/closed/responses/${PIN_KEY}`),
        pinResponse(ANON_UID)
      );
    });
    await assertSucceeds(
      getDoc(doc(asAnon(), `${collection}/closed/responses/${PIN_KEY}`))
    );
  });
});
