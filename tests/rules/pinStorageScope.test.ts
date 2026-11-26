// Storage mirror of the PIN scope in firestore.rules: a pinLoginV1 token reads its
// own Activity Wall media only in its own session, and never without a session.
//
// Requires the Firestore and Storage emulators. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { getMetadata, ref, uploadString } from 'firebase/storage';

const PROJECT_ID = 'spartboard-pin-storage-scope';
const SESSION_ID = 'teacher-uid_activity-1';
const STUDENT_UID = 'pin-student-uid';
const MEDIA = `activity_wall_media/${SESSION_ID}/${STUDENT_UID}/pic.jpg`;

const hostPort = (envValue: string | undefined, fallbackPort: number) => {
  const [host, port] = envValue ? envValue.split(':') : [];
  return {
    host: host || '127.0.0.1',
    port: port ? Number(port) : fallbackPort,
  };
};

let testEnv: RulesTestEnvironment;

const pinToken = (pinSessionId?: string): TokenOptions => ({
  pinLogin: true,
  ...(pinSessionId === undefined ? {} : { pinSessionId }),
  auth_time: Math.floor(Date.now() / 1000) - 60,
  firebase: { sign_in_provider: 'custom' },
});
const readAs = (pinSessionId?: string) =>
  getMetadata(
    ref(
      testEnv
        .authenticatedContext(STUDENT_UID, pinToken(pinSessionId))
        .storage(),
      MEDIA
    )
  );

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(
        fileURLToPath(new URL('../../firestore.rules', import.meta.url)),
        'utf8'
      ),
      ...hostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    },
    storage: {
      rules: readFileSync(
        fileURLToPath(new URL('../../storage.rules', import.meta.url)),
        'utf8'
      ),
      ...hostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
    },
  });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadString(ref(ctx.storage(), MEDIA), 'x');
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe('PIN tokens and Activity Wall media', () => {
  it('reads its own media in its own session', async () => {
    await assertSucceeds(readAs(SESSION_ID));
  });

  it('cannot read from another session', async () => {
    await assertFails(readAs('teacher-uid_activity-2'));
  });

  it('cannot read with no session, even right after sign-in', async () => {
    await assertFails(readAs());
  });
});
