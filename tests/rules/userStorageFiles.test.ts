// Storage rules for per-user teacher files under users/{uid}/...: owner uploads within a
// per-folder size and type cap, never from an anonymous or studentRole account; deletes
// stay open to the owner. The owner branch compares uids only, so allows are observable.
//
// Requires the Firestore and Storage emulators. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
  type RulesTestContext,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-user-storage-files-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_UID = 'teacher-uid-2';
const ANON_UID = 'anon-uid-1';
const STUDENT_UID = 'sso-student-1';
const MB = 1024 * 1024;

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

const teacherToken: TokenOptions = {
  email: 't1@school.edu',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
};
const anonToken: TokenOptions = {
  firebase: { sign_in_provider: 'anonymous' },
};
const studentToken: TokenOptions = {
  studentRole: true,
  classIds: ['class-1'],
  firebase: { sign_in_provider: 'custom' },
};

const asTeacher = () => testEnv.authenticatedContext(TEACHER_UID, teacherToken);
const asOther = () =>
  testEnv.authenticatedContext(OTHER_UID, {
    ...teacherToken,
    email: 't2@school.edu',
  });
const asAnon = () => testEnv.authenticatedContext(ANON_UID, anonToken);
const asStudent = () => testEnv.authenticatedContext(STUDENT_UID, studentToken);

const upload = (
  ctx: RulesTestContext,
  path: string,
  contentType: string | undefined,
  size = 64
) =>
  uploadBytes(
    ref(ctx.storage(), path),
    new Uint8Array(size),
    contentType ? { contentType } : undefined
  );

beforeAll(async () => {
  const st = hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: readFileSync(STORAGE_RULES, 'utf8'), ...st },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

// Unique object names instead of clearStorage(), which races other Storage suites running in parallel.
let seq = 0;
beforeEach(() => {
  seq += 1;
});

const FOLDERS: {
  folder: string;
  okType: string;
  badType?: string;
  maxMb: number;
}[] = [
  {
    folder: 'backgrounds',
    okType: 'image/jpeg',
    badType: 'text/html',
    maxMb: 200,
  },
  {
    folder: 'screenshots',
    okType: 'image/png',
    badType: 'text/html',
    maxMb: 50,
  },
  {
    folder: 'stickers',
    okType: 'image/png',
    badType: 'application/pdf',
    maxMb: 25,
  },
  {
    folder: 'display_images',
    okType: 'image/svg+xml',
    badType: 'text/html',
    maxMb: 25,
  },
  { folder: 'hotspot_images', okType: 'video/mp4', maxMb: 250 },
  { folder: 'instructional', okType: 'image/png', maxMb: 50 },
  { folder: 'notebooks', okType: 'image/svg+xml', maxMb: 250 },
  {
    folder: 'pdfs',
    okType: 'application/pdf',
    badType: 'image/png',
    maxMb: 50,
  },
];

describe.each(FOLDERS)(
  'users/{uid}/$folder',
  ({ folder, okType, badType, maxMb }) => {
    const own = () => `users/${TEACHER_UID}/${folder}/item-${seq}`;

    it('owner can upload, overwrite, read and delete', async () => {
      await assertSucceeds(upload(asTeacher(), own(), okType));
      await assertSucceeds(upload(asTeacher(), own(), okType));
      await assertSucceeds(getBytes(ref(asTeacher().storage(), own())));
      await assertSucceeds(deleteObject(ref(asTeacher().storage(), own())));
    });

    it('another teacher cannot upload or read', async () => {
      await assertFails(upload(asOther(), own(), okType));
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await upload(ctx, own(), okType);
      });
      await assertFails(getBytes(ref(asOther().storage(), own())));
      await assertFails(deleteObject(ref(asOther().storage(), own())));
    });

    it('an anonymous account cannot upload to its own folder', async () => {
      await assertFails(
        upload(asAnon(), `users/${ANON_UID}/${folder}/x-${seq}`, okType)
      );
    });

    it('a studentRole account cannot upload to its own folder', async () => {
      await assertFails(
        upload(asStudent(), `users/${STUDENT_UID}/${folder}/x-${seq}`, okType)
      );
    });

    // Buffers past 50 MB make the emulator run slow, so the large caps are pinned by source only.
    it.runIf(maxMb <= 50)(
      `owner cannot upload more than ${maxMb} MB`,
      async () => {
        await assertFails(upload(asTeacher(), own(), okType, maxMb * MB + 1));
      }
    );

    if (badType) {
      it(`owner cannot upload ${badType}`, async () => {
        await assertFails(upload(asTeacher(), own(), badType));
      });
    }
  }
);

describe('storage isAdmin()', () => {
  it('requires a verified email, like firestore.rules', () => {
    // The emulator cannot resolve firestore.exists(), so the admin branch is pinned by source.
    const rules = readFileSync(STORAGE_RULES, 'utf8');
    const body =
      /function isAdmin\(\) \{([\s\S]*?)\n {4}\}/.exec(rules)?.[1] ?? '';
    expect(body).toContain(
      "request.auth.token.get('email_verified', false) == true"
    );
  });
});
