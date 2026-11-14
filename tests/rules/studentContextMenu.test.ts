// Firestore security-rules tests for the student right-click and Grammarly switches:
//   /admin_settings/student_context_menu and student_grammarly — any authed user reads them (every student
//   page reads it); only an admin flips it.
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
import { setDoc, updateDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-student-context-menu-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const ADMIN_UID = 'admin-uid-1';
const ADMIN_EMAIL = 'admin@school.edu';
const STUDENT_UID = 'student-uid-1';
const ANON_UID = 'anon-pin-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudentRole = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnonStudent = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const SETTINGS_PATHS = [
  'admin_settings/student_context_menu',
  'admin_settings/student_grammarly',
];

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
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      role: 'admin',
    });
    for (const path of SETTINGS_PATHS) {
      await setDoc(doc(ctx.firestore(), path), { enabled: true });
    }
  });
});

describe.each(SETTINGS_PATHS)('/%s — reads', (settingsPath) => {
  it('lets an ordinary teacher read the switch', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), settingsPath)));
  });

  it('lets an admin read the switch', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), settingsPath)));
  });

  it('lets a signed-in student read it, like every other rollout switch', async () => {
    await assertSucceeds(getDoc(doc(asStudentRole(), settingsPath)));
    await assertSucceeds(getDoc(doc(asAnonStudent(), settingsPath)));
  });

  it('denies an unauthenticated read', async () => {
    await assertFails(getDoc(doc(asUnauth(), settingsPath)));
  });
});

describe.each(SETTINGS_PATHS)('/%s — writes', (settingsPath) => {
  it('lets an admin flip it', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), settingsPath), { enabled: true })
    );
    await assertSucceeds(
      updateDoc(doc(asAdmin(), settingsPath), { enabled: false })
    );
  });

  it('denies a teacher flipping it', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), settingsPath), { enabled: true })
    );
    await assertFails(
      updateDoc(doc(asTeacher(), settingsPath), { enabled: true })
    );
    await assertFails(deleteDoc(doc(asTeacher(), settingsPath)));
  });

  it('denies a student and an unauthenticated write', async () => {
    await assertFails(
      setDoc(doc(asStudentRole(), settingsPath), { enabled: true })
    );
    await assertFails(
      setDoc(doc(asAnonStudent(), settingsPath), { enabled: true })
    );
    await assertFails(setDoc(doc(asUnauth(), settingsPath), { enabled: true }));
  });
});
