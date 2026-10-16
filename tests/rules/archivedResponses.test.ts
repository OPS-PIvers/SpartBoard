// Firestore rules for quiz_sessions/{id}/archived_responses: the session teacher or an
// admin reads and creates (archivedBy pinned to the caller, reason from a fixed set);
// students and other teachers never read or write; only admins update or delete.
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-archived-responses-test';
const SESSION_ID = 'session-archive-1';
const TEACHER_UID = 'teacher-archive-uid';
const OTHER_TEACHER_UID = 'other-teacher-archive-uid';
const STUDENT_UID = 'student-archive-uid';
const ADMIN_UID = 'admin-archive-uid';
const ADMIN_EMAIL = 'admin@school.edu';
const KEY = 'pin-p1-1234';
const archivePath = (key = KEY) =>
  `quiz_sessions/${SESSION_ID}/archived_responses/${key}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asOtherTeacher = () =>
  testEnv
    .authenticatedContext(OTHER_TEACHER_UID, {
      email: 'other@school.edu',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();
const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const archive = (archivedBy: string, extra: Record<string, unknown> = {}) => ({
  studentUid: STUDENT_UID,
  answers: [],
  archivedBy,
  archivedAt: 1_760_000_000_000,
  archiveReason: 'teacher-removed',
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
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { role: 'admin' });
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
    });
    await setDoc(doc(db, archivePath('seeded')), archive(TEACHER_UID));
  });
});

describe('archived_responses — reads', () => {
  it('session teacher and admin can read', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), archivePath('seeded'))));
    await assertSucceeds(getDoc(doc(asAdmin(), archivePath('seeded'))));
  });

  it('the archived student, another teacher and signed-out callers cannot read', async () => {
    await assertFails(getDoc(doc(asStudent(), archivePath('seeded'))));
    await assertFails(getDoc(doc(asOtherTeacher(), archivePath('seeded'))));
    await assertFails(getDoc(doc(asUnauth(), archivePath('seeded'))));
  });
});

describe('archived_responses — create', () => {
  it('session teacher can archive as themselves', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), archivePath()), archive(TEACHER_UID))
    );
  });

  it('admin can archive as themselves', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), archivePath()), archive(ADMIN_UID))
    );
  });

  it('accepts each allowed archive reason', async () => {
    for (const reason of ['session-ended', 'idle-auto-submit-failed']) {
      await assertSucceeds(
        setDoc(
          doc(asTeacher(), archivePath(`k-${reason}`)),
          archive(TEACHER_UID, { archiveReason: reason })
        )
      );
    }
  });

  it('teacher cannot archive on behalf of someone else', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), archivePath()), archive(ADMIN_UID))
    );
  });

  it('rejects an unknown reason or a non-numeric archivedAt', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), archivePath()),
        archive(TEACHER_UID, { archiveReason: 'other' })
      )
    );
    await assertFails(
      setDoc(
        doc(asTeacher(), archivePath()),
        archive(TEACHER_UID, { archivedAt: 'now' })
      )
    );
  });

  it('students and other teachers cannot archive', async () => {
    await assertFails(
      setDoc(doc(asStudent(), archivePath()), archive(STUDENT_UID))
    );
    await assertFails(
      setDoc(doc(asOtherTeacher(), archivePath()), archive(OTHER_TEACHER_UID))
    );
  });
});

describe('archived_responses — update and delete', () => {
  it('session teacher cannot edit or delete an archive', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), archivePath('seeded')), { answers: ['x'] })
    );
    await assertFails(deleteDoc(doc(asTeacher(), archivePath('seeded'))));
  });

  it('students cannot edit or delete an archive', async () => {
    await assertFails(
      updateDoc(doc(asStudent(), archivePath('seeded')), { answers: ['x'] })
    );
    await assertFails(deleteDoc(doc(asStudent(), archivePath('seeded'))));
  });

  it('admin can update and delete an archive', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin(), archivePath('seeded')), { answers: ['x'] })
    );
    await assertSucceeds(deleteDoc(doc(asAdmin(), archivePath('seeded'))));
  });
});
