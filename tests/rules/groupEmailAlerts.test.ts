// Rules for pull-out group email alerts: users/{uid}/group_email_alerts (owner
// only, schedule-shaped, no extra fields) and the admin_settings/group_reminder_emails switch.
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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-group-email-alerts-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_UID = 'teacher-uid-2';
const ADMIN_UID = 'admin-uid-1';
const ADMIN_EMAIL = 'admin@school.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const teacher = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asTeacher = () => teacher(TEACHER_UID, 'teacher@school.edu');
const asOther = () => teacher(OTHER_UID, 'other@school.edu');
const asAdmin = () => teacher(ADMIN_UID, ADMIN_EMAIL);
const asStudentRole = () =>
  testEnv
    .authenticatedContext('student-uid-1', {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();
const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const alertPath = `users/${TEACHER_UID}/group_email_alerts/r1_g1`;
const settingsPath = 'admin_settings/group_reminder_emails';
const valid = () => ({
  rosterId: 'r1',
  groupId: 'g1',
  groupName: 'Speech',
  days: [1, 3],
  alerts: [{ time: '10:15', leadMinutes: 0 }],
  repeat: 'weekly',
  startDate: '2026-09-28',
  timeZone: 'America/Chicago',
  message: 'Walk them over',
  updatedAt: 1,
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
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      role: 'admin',
    });
    await setDoc(doc(ctx.firestore(), alertPath), valid());
    await setDoc(doc(ctx.firestore(), settingsPath), { enabled: false });
  });
});

describe('group_email_alerts — reads', () => {
  it('lets the owner read and list by roster', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), alertPath)));
    await assertSucceeds(
      getDocs(
        query(
          collection(asTeacher(), `users/${TEACHER_UID}/group_email_alerts`),
          where('rosterId', '==', 'r1')
        )
      )
    );
  });

  it('denies other teachers, students and signed-out reads', async () => {
    await assertFails(getDoc(doc(asOther(), alertPath)));
    await assertFails(getDoc(doc(asStudentRole(), alertPath)));
    await assertFails(getDoc(doc(asUnauth(), alertPath)));
  });
});

describe('group_email_alerts — writes', () => {
  it('lets the owner write a schedule-shaped doc and delete it', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), alertPath), { ...valid(), message: 'Go now' })
    );
    await assertSucceeds(deleteDoc(doc(asTeacher(), alertPath)));
  });

  it('denies another teacher writing or deleting it', async () => {
    await assertFails(setDoc(doc(asOther(), alertPath), valid()));
    await assertFails(deleteDoc(doc(asOther(), alertPath)));
  });

  it('denies extra fields such as student names, and a mismatched id', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), alertPath), { ...valid(), students: ['Ben'] })
    );
    await assertFails(
      setDoc(
        doc(asTeacher(), `users/${TEACHER_UID}/group_email_alerts/other`),
        valid()
      )
    );
  });

  it('denies oversized messages and too many alerts', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), alertPath), {
        ...valid(),
        message: 'x'.repeat(501),
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(), alertPath), {
        ...valid(),
        alerts: Array.from({ length: 7 }, () => ({
          time: '10:15',
          leadMinutes: 0,
        })),
      })
    );
  });
});

describe('admin_settings/group_reminder_emails', () => {
  it('lets any signed-in user read it but not signed-out', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), settingsPath)));
    await assertSucceeds(getDoc(doc(asStudentRole(), settingsPath)));
    await assertFails(getDoc(doc(asUnauth(), settingsPath)));
  });

  it('lets only an admin flip it', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), settingsPath), { enabled: true })
    );
    await assertFails(
      setDoc(doc(asTeacher(), settingsPath), { enabled: true })
    );
  });
});
