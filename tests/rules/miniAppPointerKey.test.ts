// Firestore rules regression: a mini-app session's assignmentId (its student pointer key)
// can only name the session itself, so staff can't plant copies of another teacher's key.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-mini-app-pointer-key';
const TEACHER_UID = 'mapk-teacher';
const VICTIM_UID = 'mapk-victim';
const VICTIM_ARCHIVE_ID = 'victim-archive';
const VICTIM_QUIZ_SESSION_ID = 'victim-quiz';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const session = (extra: Record<string, unknown> = {}) => ({
  teacherUid: TEACHER_UID,
  appId: 'app-1',
  appTitle: 'Fractions',
  assignmentName: 'Fractions',
  status: 'active',
  mode: 'submissions',
  submissionsEnabled: true,
  createdAt: Date.now(),
  ...extra,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await seedDistrictStaff(db, [
      `${TEACHER_UID}@example.com`,
      `${VICTIM_UID}@example.com`,
    ]);
    await setDoc(
      doc(db, `users/${VICTIM_UID}/miniapp_assignments/${VICTIM_ARCHIVE_ID}`),
      { id: VICTIM_ARCHIVE_ID, sessionId: 'victim-mini' }
    );
    await setDoc(
      doc(db, 'mini_app_sessions/victim-mini'),
      session({ teacherUid: VICTIM_UID, assignmentId: VICTIM_ARCHIVE_ID })
    );
    await setDoc(doc(db, `quiz_sessions/${VICTIM_QUIZ_SESSION_ID}`), {
      teacherUid: VICTIM_UID,
      status: 'active',
    });
  });
});

describe('mini_app_sessions create: assignmentId names the session itself', () => {
  it('allows a session whose assignmentId is its own id', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(TEACHER_UID), 'mini_app_sessions/own-1'),
        session({ assignmentId: 'own-1' })
      )
    );
  });

  it('allows a session with no assignmentId (QR share)', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(TEACHER_UID), 'mini_app_sessions/qr-1'), session())
    );
  });

  it("refuses a session carrying another teacher's archive id", async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(TEACHER_UID), 'mini_app_sessions/plant-1'),
        session({ assignmentId: VICTIM_ARCHIVE_ID })
      )
    );
  });

  it("refuses a session carrying another teacher's session id", async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(TEACHER_UID), 'mini_app_sessions/plant-2'),
        session({ assignmentId: VICTIM_QUIZ_SESSION_ID })
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(TEACHER_UID), 'mini_app_sessions/plant-3'),
        session({ assignmentId: 'victim-mini' })
      )
    );
  });

  it("refuses a session carrying an archive id the creator holds that isn't its own id", async () => {
    await testEnv.withSecurityRulesDisabled((ctx) =>
      setDoc(
        doc(
          ctx.firestore(),
          `users/${TEACHER_UID}/miniapp_assignments/${VICTIM_ARCHIVE_ID}`
        ),
        { id: VICTIM_ARCHIVE_ID, sessionId: 'plant-4' }
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(TEACHER_UID), 'mini_app_sessions/plant-4'),
        session({ assignmentId: VICTIM_ARCHIVE_ID })
      )
    );
  });
});
