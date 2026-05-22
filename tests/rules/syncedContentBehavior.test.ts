// Firestore security-rules regression for the optional `behavior` field on
// `/synced_quizzes/{groupId}` and `/synced_video_activities/{groupId}`.
//
// Task 1 added `behavior?` to the TypeScript types; this task (Task 2) gates
// whether the rules actually permit writes that carry that field.
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
import { setDoc, updateDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-synced-content-behavior';
const GROUP_ID = 'g1';
const U1 = 'u1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asU1 = () =>
  testEnv.authenticatedContext(U1, { email: 'u1@example.com' }).firestore();

// A valid behavior map that matches the BehaviorSettings shape from Task 1.
const BEHAVIOR = {
  sessionMode: 'teacher',
  sessionOptions: {},
  attemptLimit: 1,
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const baseQuizDoc = (overrides: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  version: 1,
  title: 'Quiz Title',
  questions: [],
  participants: { [U1]: { joinedAt: 1000 } },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: U1,
  ...overrides,
});

const baseVADoc = (overrides: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  version: 1,
  title: 'VA Title',
  youtubeUrl: 'https://youtu.be/abc',
  questions: [],
  participants: { [U1]: { joinedAt: 1000 } },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: U1,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed both docs so update tests have a base document to work against.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `synced_quizzes/${GROUP_ID}`),
      baseQuizDoc()
    );
    await setDoc(
      doc(ctx.firestore(), `synced_video_activities/${GROUP_ID}`),
      baseVADoc()
    );
  });
});

// ---------------------------------------------------------------------------
// synced_quizzes — behavior field
// ---------------------------------------------------------------------------

describe('synced_quizzes — behavior field on update', () => {
  it('participant can publish a content update that includes a behavior map', async () => {
    await assertSucceeds(
      updateDoc(doc(asU1(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'Updated',
        questions: [],
        updatedAt: 2000,
        updatedBy: U1,
        behavior: BEHAVIOR,
      })
    );
  });

  it('update without behavior still succeeds (behavior is optional)', async () => {
    await assertSucceeds(
      updateDoc(doc(asU1(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'No Behavior',
        questions: [],
        updatedAt: 2000,
        updatedBy: U1,
      })
    );
  });

  it('rejects a behavior field that is not a map (string)', async () => {
    await assertFails(
      updateDoc(doc(asU1(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'Bad Behavior',
        questions: [],
        updatedAt: 2000,
        updatedBy: U1,
        behavior: 'not-a-map',
      })
    );
  });
});

describe('synced_quizzes — behavior field on create', () => {
  beforeEach(async () => {
    // Clear for create tests; no pre-seeded doc needed.
    await testEnv.clearFirestore();
  });

  it('creator can stand up a group with a behavior map included', async () => {
    await assertSucceeds(
      setDoc(
        doc(asU1(), `synced_quizzes/${GROUP_ID}`),
        baseQuizDoc({ behavior: BEHAVIOR })
      )
    );
  });

  it('rejects a behavior field that is not a map on create', async () => {
    await assertFails(
      setDoc(
        doc(asU1(), `synced_quizzes/${GROUP_ID}`),
        baseQuizDoc({ behavior: 42 })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// synced_video_activities — behavior field
// ---------------------------------------------------------------------------

describe('synced_video_activities — behavior field on update', () => {
  it('participant can publish a VA content update that includes a behavior map', async () => {
    await assertSucceeds(
      updateDoc(doc(asU1(), `synced_video_activities/${GROUP_ID}`), {
        version: 2,
        title: 'Updated VA',
        youtubeUrl: 'https://youtu.be/abc',
        questions: [],
        updatedAt: 2000,
        updatedBy: U1,
        behavior: BEHAVIOR,
      })
    );
  });

  it('VA update without behavior still succeeds (behavior is optional)', async () => {
    await assertSucceeds(
      updateDoc(doc(asU1(), `synced_video_activities/${GROUP_ID}`), {
        version: 2,
        title: 'No Behavior VA',
        youtubeUrl: 'https://youtu.be/abc',
        questions: [],
        updatedAt: 2000,
        updatedBy: U1,
      })
    );
  });

  it('rejects a VA behavior field that is not a map (number)', async () => {
    await assertFails(
      updateDoc(doc(asU1(), `synced_video_activities/${GROUP_ID}`), {
        version: 2,
        title: 'Bad Behavior VA',
        youtubeUrl: 'https://youtu.be/abc',
        questions: [],
        updatedAt: 2000,
        updatedBy: U1,
        behavior: 99,
      })
    );
  });
});

describe('synced_video_activities — behavior field on create', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('creator can stand up a VA group with a behavior map included', async () => {
    await assertSucceeds(
      setDoc(
        doc(asU1(), `synced_video_activities/${GROUP_ID}`),
        baseVADoc({ behavior: BEHAVIOR })
      )
    );
  });

  it('rejects a VA behavior field that is not a map on create', async () => {
    await assertFails(
      setDoc(
        doc(asU1(), `synced_video_activities/${GROUP_ID}`),
        baseVADoc({ behavior: false })
      )
    );
  });
});
