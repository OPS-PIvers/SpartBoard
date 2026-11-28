// Storage rules: the pre-redesign `activity_wall_photos/` prefix is read-only; nothing writes it any more.
// The Storage emulator does not resolve firestore.get(), so the shared-gallery allow branch is pinned by source.
//
// Requires the Firestore and Storage emulators. Invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'spartboard-legacy-wall-photos-rules-test';
const TEACHER_UID = 'teacher-uid';
const SESSION_ID = `${TEACHER_UID}_wall-1`;
const STUDENT_UID = 'student-uid';

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

const google = { firebase: { sign_in_provider: 'google.com' } };

// Unique object names: other Storage suites call clearStorage() in parallel.
let seq = 0;
const seedPhoto = async (): Promise<string> => {
  seq += 1;
  const path = `activity_wall_photos/${SESSION_ID}/sub-${seq}`;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), new Uint8Array(64), {
      contentType: 'image/png',
    });
  });
  return path;
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES, 'utf8'),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
    storage: {
      rules: readFileSync(STORAGE_RULES, 'utf8'),
      ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `activity_wall_sessions/${SESSION_ID}`), {
      teacherUid: TEACHER_UID,
      publiclyShared: false,
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('legacy activity_wall_photos objects', () => {
  it('the owning teacher can still read an old photo', async () => {
    const path = await seedPhoto();
    const st = testEnv.authenticatedContext(TEACHER_UID, google).storage();
    await assertSucceeds(getBytes(ref(st, path)));
  });

  it('a publicly shared wall lets any signed-in caller, anonymous included, read', () => {
    const rules = readFileSync(STORAGE_RULES, 'utf8');
    const from = rules.indexOf('match /activity_wall_photos/');
    const block = rules.slice(from, rules.indexOf('\n    }', from));
    expect(block).toMatch(/allow read: if request\.auth != null &&/);
    expect(block).toContain(
      "documents/activity_wall_sessions/$(sessionId)\n          ).data.get('publiclyShared', false) == true"
    );
    expect(block).not.toMatch(/sign_in_provider|studentRole/);
  });

  it('a non-owner cannot read a photo on a wall that is not shared', async () => {
    const path = await seedPhoto();
    const st = testEnv.authenticatedContext(STUDENT_UID, google).storage();
    await assertFails(getBytes(ref(st, path)));
  });

  it('the owning teacher can no longer delete one', async () => {
    const path = await seedPhoto();
    const st = testEnv.authenticatedContext(TEACHER_UID, google).storage();
    await assertFails(deleteObject(ref(st, path)));
  });

  it('nobody can upload a new one', async () => {
    for (const uid of [TEACHER_UID, STUDENT_UID]) {
      const st = testEnv.authenticatedContext(uid, google).storage();
      seq += 1;
      await assertFails(
        uploadBytes(
          ref(st, `activity_wall_photos/${SESSION_ID}/new-${seq}`),
          new Uint8Array(8),
          { contentType: 'image/png' }
        )
      );
    }
  });
});
