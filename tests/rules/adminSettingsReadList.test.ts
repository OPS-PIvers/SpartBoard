// Rules tests for the admin_settings docs non-admins may read: one list in the wildcard block, checked doc by doc.
// Requires a running Firestore emulator. Invoke via: pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-admin-settings-read-list-rules-test';
const ADMIN_EMAIL = 'admin@school.edu';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const SIGNED_IN_DOCS = [
  'subjects',
  'flashcardsSpeak',
  'flashcardsSpeakWordFixes',
  'import_conversion',
  'quiz_translation',
  'plc_note_collab',
  'paper_answer_sheets',
  'sub_launch_as_teacher',
  'plc_delegated_printing',
  'roster_groups_integration',
  'projects_widget',
  'quiz_document_import',
  'group_reminder_emails',
  'claude_review_reminders',
  'quiz_recording_notice',
  'getting_started',
  'board_backgrounds',
  'student_context_menu',
  'student_grammarly',
];
const STAFF_DOCS = ['gradebook', 'focus_sessions'];
const NOT_ANON_DOCS = ['team_type_defaults'];
const SUPER_ADMIN_WRITE = new Set(['sub_launch_as_teacher', 'focus_sessions']);
const ADMIN_ONLY_DOCS = [
  'quiz_read_aloud',
  'user_roles',
  'view_as',
  'subjectsX',
  'xsubjects',
  'subjects/history/1',
];

let testEnv: RulesTestEnvironment;

const ctx = (uid: string, claims: Record<string, unknown>) =>
  testEnv.authenticatedContext(uid, claims).firestore();
const asTeacher = () =>
  ctx('teacher-uid', {
    email: 'teacher@school.edu',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
const asAdmin = () =>
  ctx('admin-uid', {
    email: ADMIN_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
const asStudentRole = () =>
  ctx('student-uid', {
    email: '',
    studentRole: true,
    classIds: ['class-A'],
    firebase: { sign_in_provider: 'custom' },
  });
const asAnon = () =>
  ctx('anon-uid', { firebase: { sign_in_provider: 'anonymous' } });
const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const ALL = [
  ...SIGNED_IN_DOCS,
  ...STAFF_DOCS,
  ...NOT_ANON_DOCS,
  ...ADMIN_ONLY_DOCS,
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
  await testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `admins/${ADMIN_EMAIL}`), {
      role: 'admin',
    });
    for (const id of ALL) {
      await setDoc(doc(c.firestore(), `admin_settings/${id}`), {
        enabled: true,
      });
    }
  });
});

const ref = (db: ReturnType<typeof asTeacher>, id: string) =>
  doc(db, `admin_settings/${id}`);

describe('admin_settings read list — reads', () => {
  it('any signed-in user, including students, reads the shared docs', async () => {
    for (const id of SIGNED_IN_DOCS) {
      await assertSucceeds(getDoc(ref(asTeacher(), id)));
      await assertSucceeds(getDoc(ref(asStudentRole(), id)));
      await assertSucceeds(getDoc(ref(asAnon(), id)));
      await assertFails(getDoc(ref(asUnauth(), id)));
    }
  });

  it('staff docs: teachers read, students and anonymous users do not', async () => {
    for (const id of STAFF_DOCS) {
      await assertSucceeds(getDoc(ref(asTeacher(), id)));
      await assertFails(getDoc(ref(asStudentRole(), id)));
      await assertFails(getDoc(ref(asAnon(), id)));
      await assertFails(getDoc(ref(asUnauth(), id)));
    }
  });

  it('team type defaults: any non-anonymous user reads', async () => {
    for (const id of NOT_ANON_DOCS) {
      await assertSucceeds(getDoc(ref(asTeacher(), id)));
      await assertSucceeds(getDoc(ref(asStudentRole(), id)));
      await assertFails(getDoc(ref(asAnon(), id)));
      await assertFails(getDoc(ref(asUnauth(), id)));
    }
  });

  it('other docs, near-miss names and subpaths stay admin-only', async () => {
    for (const id of ADMIN_ONLY_DOCS) {
      await assertFails(getDoc(ref(asTeacher(), id)));
      await assertFails(getDoc(ref(asStudentRole(), id)));
      await assertSucceeds(getDoc(ref(asAdmin(), id)));
    }
  });
});

describe('admin_settings read list — writes', () => {
  it('admins write the shared docs except the super-admin-only ones', async () => {
    for (const id of [...SIGNED_IN_DOCS, ...STAFF_DOCS, ...NOT_ANON_DOCS]) {
      const write = setDoc(ref(asAdmin(), id), { enabled: false });
      if (SUPER_ADMIN_WRITE.has(id)) await assertFails(write);
      else await assertSucceeds(write);
    }
  });

  it('teachers, students and anonymous users write none of them', async () => {
    for (const id of ALL) {
      await assertFails(setDoc(ref(asTeacher(), id), { enabled: false }));
      await assertFails(setDoc(ref(asStudentRole(), id), { enabled: false }));
      await assertFails(setDoc(ref(asAnon(), id), { enabled: false }));
      await assertFails(deleteDoc(ref(asTeacher(), id)));
    }
  });

  it('admins cannot write user_roles or view_as', async () => {
    await assertFails(
      setDoc(ref(asAdmin(), 'user_roles'), { superAdmins: [] })
    );
    await assertFails(setDoc(ref(asAdmin(), 'view_as'), { enabled: true }));
  });
});
