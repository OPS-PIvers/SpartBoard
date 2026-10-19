// Storage rules for the hosted pronunciation model: public get, no list, no client writes.
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
  type RulesTestContext,
} from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getBytes,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';

const PROJECT_ID = 'spartboard-pronunciation-model-rules-test';
const MODEL_PATH = 'pronunciation-models/test-model/model_q4.onnx';

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

const asSignedOut = () => testEnv.unauthenticatedContext();
const asStudent = () =>
  testEnv.authenticatedContext('sso-student-1', {
    studentRole: true,
    firebase: { sign_in_provider: 'custom' },
  });
const asTeacher = () =>
  testEnv.authenticatedContext('teacher-1', {
    email: 't1@school.edu',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

const upload = (ctx: RulesTestContext, path: string) =>
  uploadBytes(ref(ctx.storage(), path), new Uint8Array(16), {
    contentType: 'application/octet-stream',
  });

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

describe('pronunciation-models/**', () => {
  it('anyone can download the model, signed in or not', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await upload(ctx, MODEL_PATH);
    });
    await assertSucceeds(getBytes(ref(asSignedOut().storage(), MODEL_PATH)));
    await assertSucceeds(getBytes(ref(asStudent().storage(), MODEL_PATH)));
    await assertSucceeds(getBytes(ref(asTeacher().storage(), MODEL_PATH)));
  });

  it('nobody can list the folder', async () => {
    await assertFails(
      listAll(ref(asSignedOut().storage(), 'pronunciation-models'))
    );
    await assertFails(
      listAll(ref(asTeacher().storage(), 'pronunciation-models/test-model'))
    );
  });

  it('no client can upload, overwrite or delete', async () => {
    await assertFails(upload(asSignedOut(), 'pronunciation-models/x/y.onnx'));
    await assertFails(upload(asTeacher(), MODEL_PATH));
    await assertFails(upload(asStudent(), 'pronunciation-models/x/y.onnx'));
    await assertFails(deleteObject(ref(asTeacher().storage(), MODEL_PATH)));
  });
});
