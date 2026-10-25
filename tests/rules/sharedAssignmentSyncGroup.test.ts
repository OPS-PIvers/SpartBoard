// A share's syncGroupId is a join invite: only a participant of that group may
// set it, and it can't be changed after creation.
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

const PROJECT_ID = 'spartboard-share-sync-group';
const GROUP_ID = 'group-1';
const OTHER_GROUP_ID = 'group-2';
const MEMBER_UID = 'member-uid';
const OUTSIDER_UID = 'outsider-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore();
const asAnon = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();

const kinds = [
  ['shared_assignments', 'synced_quizzes'],
  ['shared_video_activity_assignments', 'synced_video_activities'],
] as const;

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
    for (const [, groupColl] of kinds) {
      for (const id of [GROUP_ID, OTHER_GROUP_ID]) {
        await setDoc(doc(ctx.firestore(), `${groupColl}/${id}`), {
          id,
          version: 1,
          participants: { [MEMBER_UID]: { joinedAt: 1 } },
        });
      }
    }
  });
});

describe.each(kinds)('%s syncGroupId', (shareColl) => {
  it('a participant can create a share naming their group', async () => {
    await assertSucceeds(
      setDoc(doc(as(MEMBER_UID), `${shareColl}/s1`), {
        originalAuthor: MEMBER_UID,
        syncGroupId: GROUP_ID,
      })
    );
  });

  it('a non-participant cannot create a share naming the group', async () => {
    await assertFails(
      setDoc(doc(as(OUTSIDER_UID), `${shareColl}/s1`), {
        originalAuthor: OUTSIDER_UID,
        syncGroupId: GROUP_ID,
      })
    );
  });

  it('an anonymous caller cannot forge a share naming the group', async () => {
    await assertFails(
      setDoc(doc(asAnon(OUTSIDER_UID), `${shareColl}/s1`), {
        originalAuthor: OUTSIDER_UID,
        syncGroupId: GROUP_ID,
      })
    );
  });

  it('a share naming a missing group is refused', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER_UID), `${shareColl}/s1`), {
        originalAuthor: MEMBER_UID,
        syncGroupId: 'no-such-group',
      })
    );
  });

  it('a share without syncGroupId still works for anyone signed in', async () => {
    await assertSucceeds(
      setDoc(doc(as(OUTSIDER_UID), `${shareColl}/s1`), {
        originalAuthor: OUTSIDER_UID,
        title: 'copy only',
      })
    );
  });

  it('the author cannot add or change syncGroupId after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${shareColl}/plain`), {
        originalAuthor: OUTSIDER_UID,
      });
      await setDoc(doc(ctx.firestore(), `${shareColl}/linked`), {
        originalAuthor: MEMBER_UID,
        syncGroupId: GROUP_ID,
      });
    });
    await assertFails(
      updateDoc(doc(as(OUTSIDER_UID), `${shareColl}/plain`), {
        syncGroupId: GROUP_ID,
      })
    );
    await assertFails(
      updateDoc(doc(as(MEMBER_UID), `${shareColl}/linked`), {
        syncGroupId: OTHER_GROUP_ID,
      })
    );
    await assertSucceeds(
      updateDoc(doc(as(MEMBER_UID), `${shareColl}/linked`), { title: 'x' })
    );
  });

  it('the author cannot reassign originalAuthor on a linked share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${shareColl}/forged`), {
        originalAuthor: OUTSIDER_UID,
        syncGroupId: GROUP_ID,
      });
    });
    await assertFails(
      updateDoc(doc(as(OUTSIDER_UID), `${shareColl}/forged`), {
        originalAuthor: MEMBER_UID,
      })
    );
  });
});
