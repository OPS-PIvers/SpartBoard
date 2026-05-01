// Firestore security-rules regression for the `/synced_quizzes/{groupId}`
// match block introduced with synced PLC sharing. The rules carry several
// non-obvious invariants — version monotonicity, immutable participants
// from clients, closed-list, field-surface lockdown — and a single CEL
// edit can silently break any of them. This test pins each one.
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
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  doc,
  getDocs,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-synced-quizzes';
const GROUP_ID = 'group-rules-test';
const TEACHER_A_UID = 'teacher-a-uid';
const TEACHER_B_UID = 'teacher-b-uid';
const NON_PARTICIPANT_UID = 'non-participant-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacherA = () =>
  testEnv
    .authenticatedContext(TEACHER_A_UID, {
      email: 'teacher-a@example.com',
    })
    .firestore();

const asNonParticipant = () =>
  testEnv
    .authenticatedContext(NON_PARTICIPANT_UID, {
      email: 'random@example.com',
    })
    .firestore();

const seededGroup = (overrides: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  version: 1,
  title: 'Quiz Title',
  questions: [],
  participants: {
    [TEACHER_A_UID]: { joinedAt: 1000 },
    [TEACHER_B_UID]: { joinedAt: 1000 },
  },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: TEACHER_A_UID,
  ...overrides,
});

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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `synced_quizzes/${GROUP_ID}`),
      seededGroup()
    );
  });
});

describe('synced_quizzes — read', () => {
  it('any authenticated user can `get` a known group id', async () => {
    // Reads are deliberately broad on the grounds that the groupId is an
    // unguessable v4 UUID. The point of this test is to lock in that
    // posture — flipping it accidentally to participant-only would break
    // join flows where the importer reads the group before joining.
    await assertSucceeds(
      getDoc(doc(asNonParticipant(), `synced_quizzes/${GROUP_ID}`))
    );
  });

  it('listing is closed for any authenticated user', async () => {
    // Without `allow list: false`, anyone could enumerate every synced
    // group's title + questions, defeating the unguessable-id assumption
    // that gates `get`.
    await assertFails(
      getDocs(collection(asNonParticipant(), 'synced_quizzes'))
    );
  });
});

describe('synced_quizzes — update (content publish)', () => {
  it('participant can publish a content update with version + 1', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'Updated Title',
        questions: [],
        updatedAt: 2000,
        updatedBy: TEACHER_A_UID,
      })
    );
  });

  it('non-participant CANNOT publish even with a valid version bump', async () => {
    // The participant gate is the only thing keeping random authenticated
    // users from rewriting peers' quizzes. This is the core security
    // invariant of the whole feature.
    await assertFails(
      updateDoc(doc(asNonParticipant(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'Hijacked',
        questions: [],
        updatedAt: 2000,
        updatedBy: NON_PARTICIPANT_UID,
      })
    );
  });

  it('rejects a non-incrementing version (no change)', async () => {
    await assertFails(
      updateDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`), {
        version: 1,
        title: 'Same Version',
        updatedAt: 2000,
        updatedBy: TEACHER_A_UID,
      })
    );
  });

  it('rejects a multi-step version increment (jumping past peers)', async () => {
    // version + 2 means the caller skipped a peer's edit; the
    // transaction's serializability invariant requires +1 only.
    await assertFails(
      updateDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`), {
        version: 3,
        title: 'Skipped',
        updatedAt: 2000,
        updatedBy: TEACHER_A_UID,
      })
    );
  });

  it('rejects mutating the participants map from a client', async () => {
    // Membership writes are funneled through Cloud Functions so the
    // client rule can stay simple. Allowing self-add here would let any
    // caller squat on a known groupId by adding themselves as a
    // participant and bypassing the join function.
    await assertFails(
      updateDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        participants: {
          [TEACHER_A_UID]: { joinedAt: 1000 },
          [TEACHER_B_UID]: { joinedAt: 1000 },
          [NON_PARTICIPANT_UID]: { joinedAt: 9999 },
        },
        updatedAt: 2000,
        updatedBy: TEACHER_A_UID,
      })
    );
  });

  it('rejects updates that introduce extra top-level fields', async () => {
    // The keys().hasOnly() lockdown prevents a malicious client from
    // smuggling fields onto the doc that downstream consumers might
    // trust (e.g. a fake `notifications` array or a `priority` flag).
    await assertFails(
      updateDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'OK',
        unexpectedField: 'malicious payload',
        updatedAt: 2000,
        updatedBy: TEACHER_A_UID,
      })
    );
  });

  it('rejects spoofing updatedBy to another participant', async () => {
    // updatedBy must equal request.auth.uid so attribution can't be
    // forged — important once the Part-2 notification system uses
    // updatedBy to route alerts.
    await assertFails(
      updateDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`), {
        version: 2,
        title: 'Updated',
        updatedAt: 2000,
        updatedBy: TEACHER_B_UID,
      })
    );
  });
});

describe('synced_quizzes — create (initial group seed)', () => {
  beforeEach(async () => {
    // Don't pre-seed the group for create tests; we want to cover the
    // first write specifically.
    await testEnv.clearFirestore();
  });

  it('creator can stand up a group with themselves as sole initial participant', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`),
        seededGroup({
          participants: { [TEACHER_A_UID]: { joinedAt: 1000 } },
        })
      )
    );
  });

  it('rejects creating a group that includes a non-self participant', async () => {
    // Without this, any authed user could squat on a UUID by seeding it
    // with someone else's uid in `participants`.
    await assertFails(
      setDoc(
        doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`),
        seededGroup({
          participants: {
            [TEACHER_A_UID]: { joinedAt: 1000 },
            [TEACHER_B_UID]: { joinedAt: 1000 },
          },
        })
      )
    );
  });

  it('rejects creating a group with version != 1', async () => {
    // The monotonic version invariant relies on the doc starting at 1.
    await assertFails(
      setDoc(
        doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`),
        seededGroup({
          version: 5,
          participants: { [TEACHER_A_UID]: { joinedAt: 1000 } },
        })
      )
    );
  });

  it('rejects creating a group with extra top-level fields', async () => {
    await assertFails(
      setDoc(
        doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`),
        seededGroup({
          participants: { [TEACHER_A_UID]: { joinedAt: 1000 } },
          extraField: 'not allowed',
        })
      )
    );
  });

  it('rejects creating with a negative joinedAt timestamp', async () => {
    // joinedAt is a Date.now() result — always non-negative. A negative
    // value is either a bug or a forged client.
    await assertFails(
      setDoc(
        doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`),
        seededGroup({
          participants: { [TEACHER_A_UID]: { joinedAt: -1 } },
        })
      )
    );
  });
});

describe('synced_quizzes — delete', () => {
  it('client-side delete is denied universally', async () => {
    // Orphan groups are kept on purpose so a stale share URL still
    // resolves to a bootstrap snapshot rather than 404.
    await assertFails(
      deleteDoc(doc(asTeacherA(), `synced_quizzes/${GROUP_ID}`))
    );
  });
});
