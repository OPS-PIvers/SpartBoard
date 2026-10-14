// Storage rules for quiz_response_media/{sessionId}/{responseKey}/{file}: the owning student
// uploads audio, PNG pictures and JSON drawing logs (re-uploading a path is the retry); the
// student, session teacher and admins read; the teacher and admins delete.
//
// The Storage emulator does not resolve firestore.get()/exists() (see viewAs.test.ts and
// plcRecordings.test.ts), so every allow path is unobservable here; these cases pin the denials.
//
// Requires the Firestore and Storage emulators. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
  type RulesTestContext,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  getMetadata,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'spartboard-quiz-response-media-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const ADMIN_EMAIL = 'admin@school.edu';
const STUDENT_UID = 'anon-student-1';
const OTHER_STUDENT_UID = 'anon-student-2';
const SESSION_ID = 'session-1';
const RESPONSE_KEY = 'pin-p1-1234';
const OTHER_RESPONSE_KEY = 'pin-p1-5678';
const MB = 1024 * 1024;

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
const anonToken: TokenOptions = {
  email: '',
  studentRole: false,
  classIds: [],
  firebase: { sign_in_provider: 'anonymous' },
};

const asTeacher = () =>
  testEnv.authenticatedContext(TEACHER_UID, teacherToken('t1@school.edu'));
const asOtherTeacher = () =>
  testEnv.authenticatedContext(
    OTHER_TEACHER_UID,
    teacherToken('t2@school.edu')
  );
const asAdmin = () =>
  testEnv.authenticatedContext('admin-uid', teacherToken(ADMIN_EMAIL));
const asStudent = () => testEnv.authenticatedContext(STUDENT_UID, anonToken);
const asOtherStudent = () =>
  testEnv.authenticatedContext(OTHER_STUDENT_UID, anonToken);
const asUnauth = () => testEnv.unauthenticatedContext();

const mediaPath = (file: string, responseKey = RESPONSE_KEY) =>
  `quiz_response_media/${SESSION_ID}/${responseKey}/${file}`;

const upload = (
  ctx: RulesTestContext,
  path: string,
  contentType: string,
  size = 64
) =>
  uploadBytes(ref(ctx.storage(), path), new Uint8Array(size), {
    contentType,
  });

const seedObject = async (path: string, contentType: string) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), new Uint8Array(64), {
      contentType,
    });
  });
};

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
      status: 'active',
    });
    await setDoc(
      doc(db, `quiz_sessions/${SESSION_ID}/responses/${RESPONSE_KEY}`),
      { studentUid: STUDENT_UID, answers: [] }
    );
    await setDoc(
      doc(db, `quiz_sessions/${SESSION_ID}/responses/${OTHER_RESPONSE_KEY}`),
      { studentUid: OTHER_STUDENT_UID, answers: [] }
    );
  });
});

describe('create', () => {
  it('refuses every content type outside audio, PNG and JSON', async () => {
    const ctx = asStudent();
    for (const [file, type] of [
      ['x.jpg', 'image/jpeg'],
      ['x.svg', 'image/svg+xml'],
      ['x.webp', 'image/webp'],
      ['x.html', 'text/html'],
      ['x.txt', 'text/plain'],
      ['x.js', 'application/javascript'],
      ['x.mp4', 'video/mp4'],
      ['x.bin', 'application/octet-stream'],
    ]) {
      await assertFails(upload(ctx, mediaPath(file), type));
    }
  });

  it('refuses audio and logs at 5 MB and pictures at 10 MB', async () => {
    const ctx = asStudent();
    await assertFails(
      upload(ctx, mediaPath('a-big.webm'), 'audio/webm', 5 * MB)
    );
    await assertFails(
      upload(ctx, mediaPath('l-big.json'), 'application/json', 5 * MB)
    );
    await assertFails(
      upload(ctx, mediaPath('p-big.png'), 'image/png', 10 * MB)
    );
  });

  it("refuses uploads under another student's response key", async () => {
    const other = (file: string) => mediaPath(file, OTHER_RESPONSE_KEY);
    await assertFails(upload(asStudent(), other('p1.png'), 'image/png'));
    await assertFails(
      upload(asStudent(), other('l1.json'), 'application/json')
    );
    await assertFails(upload(asStudent(), other('a1.webm'), 'audio/webm'));
  });

  it('refuses the teacher, an admin, another teacher and unauthenticated callers', async () => {
    for (const ctx of [asTeacher(), asAdmin(), asOtherTeacher(), asUnauth()]) {
      await assertFails(upload(ctx, mediaPath('p1.png'), 'image/png'));
      await assertFails(upload(ctx, mediaPath('l1.json'), 'application/json'));
    }
  });

  it('refuses a response key with no response doc', async () => {
    await assertFails(
      upload(asStudent(), mediaPath('p1.png', 'pin-missing'), 'image/png')
    );
  });
});

describe('read', () => {
  beforeEach(async () => {
    await seedObject(mediaPath('p1.png'), 'image/png');
    await seedObject(mediaPath('l1.json'), 'application/json');
    await seedObject(mediaPath('a1.webm'), 'audio/webm');
  });

  it('denies another student, another teacher and unauthenticated callers', async () => {
    for (const ctx of [asOtherStudent(), asOtherTeacher(), asUnauth()]) {
      for (const file of ['p1.png', 'l1.json', 'a1.webm']) {
        await assertFails(getMetadata(ref(ctx.storage(), mediaPath(file))));
        await assertFails(getBytes(ref(ctx.storage(), mediaPath(file))));
      }
    }
  });
});

describe('delete', () => {
  beforeEach(async () => {
    await seedObject(mediaPath('p1.png'), 'image/png');
    await seedObject(mediaPath('l1.json'), 'application/json');
  });

  it('denies the owning student, another student, another teacher and unauthenticated callers', async () => {
    for (const ctx of [
      asStudent(),
      asOtherStudent(),
      asOtherTeacher(),
      asUnauth(),
    ]) {
      await assertFails(deleteObject(ref(ctx.storage(), mediaPath('p1.png'))));
      await assertFails(deleteObject(ref(ctx.storage(), mediaPath('l1.json'))));
    }
  });
});
