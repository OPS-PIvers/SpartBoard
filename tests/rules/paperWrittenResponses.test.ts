// Rules for handwritten paper answers (docs/plans/shipped/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md §3.5):
//   - quiz_sessions/{sid}/responses/{key}/paperPrivate/{qid}: session teacher reads, server writes.
//   - users/{uid}/paper_transcription_jobs/{id}: owner reads, server writes.
//   - Storage paper_written_crops/{uid}/...: owning teacher creates once, nobody reads.
//
// Requires the Firestore and Storage emulators. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type RulesTestContext,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  getMetadata,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'spartboard-paper-written-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const ADMIN_EMAIL = 'admin@school.edu';
const SSO_STUDENT_UID = 'sso-student-uid';
const ANON_UID = 'anon-pin-uid';
const SESSION_ID = 'session-1';
const RESPONSE_KEY = 'pin-p1-1234';
const QUESTION_ID = 'q-written-1';
const SCAN_ID = 'scan-1';
const JOB_ID = `${SCAN_ID}_3_1_1`;

const FIRESTORE_RULES = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const STORAGE_RULES = fileURLToPath(
  new URL('../../storage.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const hostPort = (envValue: string | undefined, fallbackPort: number) => {
  const [host, port] = envValue ? envValue.split(':') : [];
  return {
    host: host || '127.0.0.1',
    port: port ? Number(port) : fallbackPort,
  };
};

const teacherToken = (email: string): TokenOptions => ({
  email,
  email_verified: true,
  studentRole: false,
  classIds: [],
  firebase: { sign_in_provider: 'google.com' },
});

const asTeacher = () =>
  testEnv.authenticatedContext(TEACHER_UID, teacherToken('t1@school.edu'));
const asOtherTeacher = () =>
  testEnv.authenticatedContext(
    OTHER_TEACHER_UID,
    teacherToken('t2@school.edu')
  );
const asAdmin = () =>
  testEnv.authenticatedContext('admin-uid', teacherToken(ADMIN_EMAIL));
const asSsoStudent = (uid = SSO_STUDENT_UID) =>
  testEnv.authenticatedContext(uid, {
    email: '',
    studentRole: true,
    classIds: ['class-A'],
    firebase: { sign_in_provider: 'custom' },
  });
const asAnon = (uid = ANON_UID) =>
  testEnv.authenticatedContext(uid, {
    email: '',
    studentRole: false,
    classIds: [],
    firebase: { sign_in_provider: 'anonymous' },
  });
const asUnauth = () => testEnv.unauthenticatedContext();

const responsePath = `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_KEY}`;
const privateCol = `${responsePath}/paperPrivate`;
const privatePath = `${privateCol}/${QUESTION_ID}`;
const jobsCol = (uid = TEACHER_UID) => `users/${uid}/paper_transcription_jobs`;
const jobPath = (uid = TEACHER_UID) => `${jobsCol(uid)}/${JOB_ID}`;
const cropPath = (uid = TEACHER_UID, questionId = QUESTION_ID) =>
  `paper_written_crops/${uid}/${SCAN_ID}/3/${questionId}.webp`;

const privateDoc = () => ({
  scanId: SCAN_ID,
  status: 'done',
  rawTranscript: 'photosynthesis makes sugar',
  attempts: 1,
  charged: true,
  updatedAt: 1000,
});

const jobDoc = () => ({
  sessionId: SESSION_ID,
  responseKey: RESPONSE_KEY,
  scanId: SCAN_ID,
  page: 1,
  boxes: [{ questionId: QUESTION_ID, storagePath: cropPath() }],
  status: 'queued',
  attempt: 1,
  charged: false,
  createdAt: 1000,
  updatedAt: 1000,
});

const bytes = (n = 64) => new Uint8Array(n);
const upload = (
  ctx: RulesTestContext,
  path: string,
  contentType = 'image/webp',
  size = 64
) => uploadBytes(ref(ctx.storage(), path), bytes(size), { contentType });

beforeAll(async () => {
  const fs = hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080);
  const st = hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(FIRESTORE_RULES, 'utf8'), ...fs },
    storage: { rules: readFileSync(STORAGE_RULES, 'utf8'), ...st },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { role: 'admin' });
    await setDoc(doc(db, `quiz_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      status: 'ended',
    });
    await setDoc(doc(db, responsePath), {
      studentUid: ANON_UID,
      answers: [],
    });
    await setDoc(doc(db, privatePath), privateDoc());
    await setDoc(doc(db, jobPath()), jobDoc());
  });
});

describe('paperPrivate subdoc', () => {
  it('lets the session teacher get and list it', async () => {
    const db = asTeacher().firestore();
    await assertSucceeds(getDoc(doc(db, privatePath)));
    await assertSucceeds(getDocs(collection(db, privateCol)));
  });

  it('denies the student who owns the response', async () => {
    const db = asAnon().firestore();
    await assertFails(getDoc(doc(db, privatePath)));
    await assertFails(getDocs(collection(db, privateCol)));
  });

  it('denies an SSO student, another teacher and unauthenticated callers', async () => {
    for (const ctx of [asSsoStudent(), asOtherTeacher(), asUnauth()]) {
      await assertFails(getDoc(doc(ctx.firestore(), privatePath)));
      await assertFails(getDocs(collection(ctx.firestore(), privateCol)));
    }
  });

  it('refuses every client write, the teacher included', async () => {
    const db = asTeacher().firestore();
    await assertFails(
      setDoc(doc(db, `${privateCol}/q-new`), { ...privateDoc() })
    );
    await assertFails(updateDoc(doc(db, privatePath), { status: 'pending' }));
    await assertFails(deleteDoc(doc(db, privatePath)));
    await assertFails(
      updateDoc(doc(asAnon().firestore(), privatePath), { status: 'pending' })
    );
  });
});

describe('paper_transcription_jobs', () => {
  it('lets the owner get and list jobs', async () => {
    const db = asTeacher().firestore();
    await assertSucceeds(getDoc(doc(db, jobPath())));
    await assertSucceeds(getDocs(collection(db, jobsCol())));
  });

  it('denies another teacher, a student, an admin and unauthenticated callers', async () => {
    for (const ctx of [
      asOtherTeacher(),
      asSsoStudent(),
      asAdmin(),
      asUnauth(),
    ]) {
      await assertFails(getDoc(doc(ctx.firestore(), jobPath())));
      await assertFails(getDocs(collection(ctx.firestore(), jobsCol())));
    }
  });

  it('denies an anonymous or studentRole caller in their own namespace', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), jobPath(ANON_UID)), jobDoc());
      await setDoc(doc(ctx.firestore(), jobPath(SSO_STUDENT_UID)), jobDoc());
    });
    await assertFails(getDoc(doc(asAnon().firestore(), jobPath(ANON_UID))));
    await assertFails(
      getDoc(doc(asSsoStudent().firestore(), jobPath(SSO_STUDENT_UID)))
    );
  });

  it('refuses owner writes', async () => {
    const db = asTeacher().firestore();
    await assertFails(
      setDoc(doc(db, `${jobsCol()}/${SCAN_ID}_3_1_2`), {
        ...jobDoc(),
        attempt: 2,
      })
    );
    await assertFails(updateDoc(doc(db, jobPath()), { status: 'done' }));
    await assertFails(deleteDoc(doc(db, jobPath())));
  });
});

describe('Storage paper_written_crops', () => {
  it('lets the owning teacher create a WebP or PNG crop', async () => {
    const ctx = asTeacher();
    await assertSucceeds(upload(ctx, cropPath()));
    await assertSucceeds(
      upload(ctx, cropPath(TEACHER_UID, 'q-2'), 'image/png')
    );
  });

  it('accepts exactly 2 MB and refuses anything larger', async () => {
    const ctx = asTeacher();
    await assertSucceeds(
      upload(ctx, cropPath(TEACHER_UID, 'q-max'), 'image/webp', 2 * 1024 * 1024)
    );
    await assertFails(
      upload(
        ctx,
        cropPath(TEACHER_UID, 'q-big'),
        'image/webp',
        2 * 1024 * 1024 + 1
      )
    );
  });

  it('refuses other content types', async () => {
    const ctx = asTeacher();
    const path = cropPath(TEACHER_UID, 'q-type');
    await assertFails(upload(ctx, path, 'image/jpeg'));
    await assertFails(upload(ctx, path, 'image/svg+xml'));
    await assertSucceeds(upload(ctx, path));
  });

  it('refuses another teacher, a student, an anonymous user and unauthenticated callers', async () => {
    const path = cropPath(TEACHER_UID, 'q-who');
    await assertFails(upload(asOtherTeacher(), path));
    await assertFails(upload(asSsoStudent(), path));
    await assertFails(upload(asAnon(), path));
    await assertFails(upload(asUnauth(), path));
    await assertSucceeds(upload(asTeacher(), path));
    await assertFails(upload(asSsoStudent(), cropPath(SSO_STUDENT_UID)));
    await assertFails(upload(asAnon(), cropPath(ANON_UID)));
  });

  it('is create-only: the owner cannot overwrite or delete', async () => {
    const ctx = asTeacher();
    const path = cropPath(TEACHER_UID, 'q-once');
    await assertSucceeds(upload(ctx, path));
    await assertFails(upload(ctx, path));
    await assertFails(deleteObject(ref(ctx.storage(), path)));
  });

  it('refuses every client read, the owner and admins included', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), cropPath()), bytes(), {
        contentType: 'image/webp',
      });
    });
    for (const ctx of [asTeacher(), asAdmin(), asAnon(), asUnauth()]) {
      await assertFails(getMetadata(ref(ctx.storage(), cropPath())));
      await assertFails(getBytes(ref(ctx.storage(), cropPath())));
    }
  });
});
