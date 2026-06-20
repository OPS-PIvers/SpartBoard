// Firestore security-rules regression for the bounded version-history
// subcollections introduced in PLC Wave 4 (PRD §5.1 / §3.10, Decision 5.1):
//   /synced_quizzes/{groupId}/versions/{versionId}
//   /synced_video_activities/{groupId}/versions/{versionId}
//
// Invariants pinned:
//   - A PARTICIPANT of the parent group can READ + CREATE a version doc.
//   - Creates are schema-locked (`keys().hasOnly([...])`) and self-attributed
//     (`savedBy == request.auth.uid`).
//   - A NON-PARTICIPANT cannot read or create.
//   - update + delete are denied for EVERYONE (history is server-only GC).
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
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-synced-versions';
const GROUP_ID = 'group-versions-test';
const VERSION_ID = '1';

const PARTICIPANT_UID = 'participant-uid';
const NON_PARTICIPANT_UID = 'non-participant-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asParticipant = () =>
  testEnv
    .authenticatedContext(PARTICIPANT_UID, { email: 'participant@example.com' })
    .firestore();

const asNonParticipant = () =>
  testEnv
    .authenticatedContext(NON_PARTICIPANT_UID, { email: 'random@example.com' })
    .firestore();

const seededGroup = () => ({
  id: GROUP_ID,
  version: 2,
  title: 'Group Title',
  questions: [],
  participants: { [PARTICIPANT_UID]: { joinedAt: 1000 } },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: PARTICIPANT_UID,
});

const seededVideoActivityGroup = () => ({
  ...seededGroup(),
  youtubeUrl: 'https://youtu.be/abc',
});

const validSnapshot = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  content: { title: 'Snapshot Title', questions: [] },
  savedBy: PARTICIPANT_UID,
  savedAt: 1500,
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

// ---------------------------------------------------------------------------
// Shared suite generator — the two collections have identical version rules.
// ---------------------------------------------------------------------------

function describeVersionsCollection(
  label: string,
  collectionName: string,
  seedGroup: () => Record<string, unknown>
): void {
  const groupPath = `${collectionName}/${GROUP_ID}`;
  const versionPath = `${groupPath}/versions/${VERSION_ID}`;

  describe(`${label} — version history rules`, () => {
    beforeEach(async () => {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), groupPath), seedGroup());
      });
    });

    describe('read', () => {
      it('participant can read a version snapshot', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), versionPath), validSnapshot());
        });
        await assertSucceeds(getDoc(doc(asParticipant(), versionPath)));
      });

      it('non-participant CANNOT read a version snapshot', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), versionPath), validSnapshot());
        });
        await assertFails(getDoc(doc(asNonParticipant(), versionPath)));
      });
    });

    describe('create', () => {
      it('participant can create a schema-locked, self-attributed snapshot', async () => {
        await assertSucceeds(
          setDoc(doc(asParticipant(), versionPath), validSnapshot())
        );
      });

      it('non-participant CANNOT create a snapshot', async () => {
        await assertFails(
          setDoc(
            doc(asNonParticipant(), versionPath),
            validSnapshot({ savedBy: NON_PARTICIPANT_UID })
          )
        );
      });

      it('rejects a snapshot whose savedBy is not the caller', async () => {
        await assertFails(
          setDoc(
            doc(asParticipant(), versionPath),
            validSnapshot({ savedBy: 'someone-else' })
          )
        );
      });

      it('rejects a snapshot with extra top-level fields', async () => {
        await assertFails(
          setDoc(
            doc(asParticipant(), versionPath),
            validSnapshot({ extra: 'smuggled' })
          )
        );
      });

      it('rejects a snapshot missing a required field', async () => {
        await assertFails(
          setDoc(doc(asParticipant(), versionPath), {
            version: 1,
            content: { title: 'x', questions: [] },
            savedBy: PARTICIPANT_UID,
            // savedAt omitted
          })
        );
      });

      it('rejects a non-int version', async () => {
        await assertFails(
          setDoc(
            doc(asParticipant(), versionPath),
            validSnapshot({ version: 'one' })
          )
        );
      });
    });

    describe('update / delete', () => {
      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), versionPath), validSnapshot());
        });
      });

      it('participant CANNOT update a snapshot (append-only)', async () => {
        await assertFails(
          updateDoc(doc(asParticipant(), versionPath), { savedAt: 9999 })
        );
      });

      it('participant CANNOT delete a snapshot (server-side GC only)', async () => {
        await assertFails(deleteDoc(doc(asParticipant(), versionPath)));
      });

      it('non-participant CANNOT delete a snapshot', async () => {
        await assertFails(deleteDoc(doc(asNonParticipant(), versionPath)));
      });
    });
  });
}

describeVersionsCollection('synced_quizzes', 'synced_quizzes', seededGroup);
describeVersionsCollection(
  'synced_video_activities',
  'synced_video_activities',
  seededVideoActivityGroup
);
