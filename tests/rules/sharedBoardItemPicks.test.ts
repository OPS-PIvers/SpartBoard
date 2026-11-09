// Rules for `users/{uid}/board_item_picks/{shareId}` and the pick a first shared board copy needs.
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
import { arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-shared-board-item-picks';
const HOST_UID = 'host-uid';
const COLLAB_UID = 'collab-uid';
const STUDENT_UID = 'student-uid';
const SHARE_ID = 'share-1';
const OTHER_SHARE_ID = 'share-2';
const QUIZ_ID = 'quiz-1';
const OTHER_QUIZ_ID = 'quiz-2';
const PICKS_PATH = `users/${HOST_UID}/board_item_picks/${SHARE_ID}`;
const ITEM_PATH = `shared_boards/${SHARE_ID}/items/quiz_${HOST_UID}_${QUIZ_ID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudentRole = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      email: `${uid}@orono.k12.mn.us`,
      email_verified: true,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnonymous = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();

const item = (overrides: Record<string, unknown> = {}) => ({
  kind: 'quiz',
  itemId: QUIZ_ID,
  ownerUid: HOST_UID,
  title: 'Fractions check',
  version: '1000',
  publishedAt: 1_000_000,
  payload: { quiz: { id: QUIZ_ID, title: 'Fractions check', questions: [] } },
  ...overrides,
});

const seed = async ({
  picks,
  copy = false,
}: { picks?: Record<string, string[]>; copy?: boolean } = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `shared_boards/${SHARE_ID}`), {
      originalAuthor: HOST_UID,
      intendedMode: 'synced',
      participants: {
        [COLLAB_UID]: { role: 'collaborator', name: 'Co', joinedAt: 1 },
      },
    });
    for (const id of [QUIZ_ID, OTHER_QUIZ_ID]) {
      await setDoc(doc(db, `users/${HOST_UID}/quizzes/${id}`), { id });
    }
    for (const [shareId, items] of Object.entries(picks ?? {})) {
      await setDoc(doc(db, `users/${HOST_UID}/board_item_picks/${shareId}`), {
        items,
      });
    }
    if (copy) await setDoc(doc(db, ITEM_PATH), item());
  });
};

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
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(
      ctx.firestore(),
      [HOST_UID, COLLAB_UID].map((uid) => `${uid}@orono.k12.mn.us`)
    )
  );
});

describe('a teacher’s board item picks', () => {
  it('the teacher reads and records their own picks', async () => {
    await seed({ picks: { [SHARE_ID]: [] } });
    const db = asTeacher(HOST_UID);
    await assertSucceeds(getDoc(doc(db, PICKS_PATH)));
    await assertSucceeds(
      setDoc(
        doc(db, PICKS_PATH),
        { items: arrayUnion(`quiz_${QUIZ_ID}`) },
        { merge: true }
      )
    );
  });

  it('a co-editor can neither read nor write another teacher’s picks', async () => {
    await seed({ picks: { [SHARE_ID]: [`quiz_${QUIZ_ID}`] } });
    const db = asTeacher(COLLAB_UID);
    await assertFails(getDoc(doc(db, PICKS_PATH)));
    await assertFails(
      setDoc(
        doc(db, PICKS_PATH),
        { items: arrayUnion(`quiz_${OTHER_QUIZ_ID}`) },
        { merge: true }
      )
    );
    await assertFails(
      setDoc(doc(db, `users/${HOST_UID}/board_item_picks/${OTHER_SHARE_ID}`), {
        items: [`quiz_${OTHER_QUIZ_ID}`],
      })
    );
  });

  it('student-role and anonymous accounts cannot keep picks', async () => {
    const studentPath = `users/${STUDENT_UID}/board_item_picks/${SHARE_ID}`;
    await assertFails(
      setDoc(doc(asStudentRole(STUDENT_UID), studentPath), { items: [] })
    );
    await assertFails(getDoc(doc(asStudentRole(STUDENT_UID), studentPath)));
    const anonPath = 'users/anon-uid/board_item_picks/share-1';
    await assertFails(
      setDoc(doc(asAnonymous('anon-uid'), anonPath), { items: [] })
    );
    await assertFails(getDoc(doc(asAnonymous('anon-uid'), anonPath)));
  });
});

describe('publishing the first copy of an item', () => {
  it('needs the owner’s pick of that item on that share', async () => {
    await seed({ picks: { [SHARE_ID]: [`quiz_${QUIZ_ID}`] } });
    await assertSucceeds(setDoc(doc(asTeacher(HOST_UID), ITEM_PATH), item()));
  });

  it('is refused with no picks, another item’s pick or another share’s pick', async () => {
    const db = asTeacher(HOST_UID);
    await seed();
    await assertFails(setDoc(doc(db, ITEM_PATH), item()));
    await seed({ picks: { [SHARE_ID]: [`quiz_${OTHER_QUIZ_ID}`] } });
    await assertFails(setDoc(doc(db, ITEM_PATH), item()));
    await seed({ picks: { [OTHER_SHARE_ID]: [`quiz_${QUIZ_ID}`] } });
    await assertFails(setDoc(doc(db, ITEM_PATH), item()));
  });

  it('a pick of the same id under another kind does not count', async () => {
    await seed({ picks: { [SHARE_ID]: [`flashcards_${QUIZ_ID}`] } });
    await assertFails(setDoc(doc(asTeacher(HOST_UID), ITEM_PATH), item()));
  });

  it('a collaborator without their own pick cannot publish their own item', async () => {
    await seed({ picks: { [SHARE_ID]: [`quiz_${QUIZ_ID}`] } });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${COLLAB_UID}/quizzes/${QUIZ_ID}`),
        { id: QUIZ_ID }
      );
    });
    const path = `shared_boards/${SHARE_ID}/items/quiz_${COLLAB_UID}_${QUIZ_ID}`;
    const db = asTeacher(COLLAB_UID);
    await assertFails(setDoc(doc(db, path), item({ ownerUid: COLLAB_UID })));
    await assertSucceeds(
      setDoc(doc(db, `users/${COLLAB_UID}/board_item_picks/${SHARE_ID}`), {
        items: [`quiz_${QUIZ_ID}`],
      })
    );
    await assertSucceeds(setDoc(doc(db, path), item({ ownerUid: COLLAB_UID })));
  });

  it('an existing copy keeps updating without a pick', async () => {
    await seed({ copy: true });
    const db = asTeacher(HOST_UID);
    await assertSucceeds(setDoc(doc(db, ITEM_PATH), item({ version: '2000' })));
    await assertSucceeds(getDoc(doc(asTeacher(COLLAB_UID), ITEM_PATH)));
  });
});
