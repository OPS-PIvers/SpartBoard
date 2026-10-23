// Rules for `shared_boards/{shareId}/items/{kind}_{itemId}`: the item's owner mirrors a
// read-only copy of a library item there, and the share's members read it.
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-shared-board-items';
const HOST_UID = 'host-uid';
const COLLAB_UID = 'collab-uid';
const VIEWER_UID = 'viewer-uid';
const OUTSIDER_UID = 'outsider-uid';
const STUDENT_UID = 'student-uid';
const SHARE_ID = 'share-1';
const QUIZ_ID = 'quiz-1';
const itemPath = (ownerUid: string) =>
  `shared_boards/${SHARE_ID}/items/quiz_${ownerUid}_${QUIZ_ID}`;
const ITEM_PATH = itemPath(HOST_UID);
const COLLAB_PATH = itemPath(COLLAB_UID);

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = (uid: string, email = `${uid}@orono.k12.mn.us`) =>
  testEnv
    .authenticatedContext(uid, {
      email,
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

const participant = (role: 'collaborator' | 'viewer') => ({
  role,
  name: 'Someone',
  joinedAt: 1_000_000,
});

const item = (ownerUid: string, overrides: Record<string, unknown> = {}) => ({
  kind: 'quiz',
  itemId: QUIZ_ID,
  ownerUid,
  title: 'Fractions check',
  version: '1000',
  publishedAt: 1_000_000,
  payload: { quiz: { id: QUIZ_ID, title: 'Fractions check', questions: [] } },
  ...overrides,
});

const seed = async ({
  itemOwner,
  libraryOwners = [HOST_UID],
}: { itemOwner?: string; libraryOwners?: string[] } = {}) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `shared_boards/${SHARE_ID}`), {
      originalAuthor: HOST_UID,
      intendedMode: 'synced',
      participants: {
        [COLLAB_UID]: participant('collaborator'),
        [VIEWER_UID]: participant('viewer'),
        [STUDENT_UID]: participant('viewer'),
        'anon-uid': participant('viewer'),
      },
    });
    for (const uid of libraryOwners) {
      await setDoc(doc(db, `users/${uid}/quizzes/${QUIZ_ID}`), {
        id: QUIZ_ID,
        title: 'Fractions check',
      });
    }
    if (itemOwner) await setDoc(doc(db, itemPath(itemOwner)), item(itemOwner));
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
});

describe('reading a shared board item', () => {
  it('the host, a collaborator and a viewer read it', async () => {
    await seed({ itemOwner: HOST_UID });
    for (const uid of [HOST_UID, COLLAB_UID, VIEWER_UID]) {
      await assertSucceeds(getDoc(doc(asTeacher(uid), ITEM_PATH)));
    }
  });

  it('a member reads a missing item as missing, not denied', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asTeacher(VIEWER_UID), ITEM_PATH)));
  });

  it('an outsider is denied', async () => {
    await seed({ itemOwner: HOST_UID });
    await assertFails(getDoc(doc(asTeacher(OUTSIDER_UID), ITEM_PATH)));
  });

  it('a member without a verified district email is denied', async () => {
    await seed({ itemOwner: HOST_UID });
    await assertFails(
      getDoc(doc(asTeacher(VIEWER_UID, 'viewer@gmail.com'), ITEM_PATH))
    );
  });

  it('a student-role or anonymous participant is denied', async () => {
    await seed({ itemOwner: HOST_UID });
    await assertFails(getDoc(doc(asStudentRole(STUDENT_UID), ITEM_PATH)));
    await assertFails(getDoc(doc(asAnonymous('anon-uid'), ITEM_PATH)));
  });

  it('a member who left is denied', async () => {
    await seed({ itemOwner: HOST_UID });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `shared_boards/${SHARE_ID}`), {
        originalAuthor: HOST_UID,
        intendedMode: 'synced',
        participants: {},
      });
    });
    await assertFails(getDoc(doc(asTeacher(VIEWER_UID), ITEM_PATH)));
  });
});

describe('a share recreated at an old id', () => {
  it('cannot read a copy whose owner is not a member', async () => {
    await seed({ itemOwner: COLLAB_UID, libraryOwners: [COLLAB_UID] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `shared_boards/${SHARE_ID}`), {
        originalAuthor: OUTSIDER_UID,
        intendedMode: 'synced',
        participants: {},
      });
    });
    await assertFails(getDoc(doc(asTeacher(OUTSIDER_UID), COLLAB_PATH)));
  });
});

describe('writing a shared board item', () => {
  it('the host publishes and republishes an item from their own library', async () => {
    await seed();
    const db = asTeacher(HOST_UID);
    await assertSucceeds(setDoc(doc(db, ITEM_PATH), item(HOST_UID)));
    await assertSucceeds(
      setDoc(doc(db, ITEM_PATH), item(HOST_UID, { version: '2000' }))
    );
  });

  it('a collaborator publishes an item from their own library', async () => {
    await seed({ libraryOwners: [COLLAB_UID] });
    await assertSucceeds(
      setDoc(doc(asTeacher(COLLAB_UID), COLLAB_PATH), item(COLLAB_UID))
    );
  });

  it('a viewer cannot publish, even an item they own', async () => {
    await seed({ libraryOwners: [VIEWER_UID] });
    await assertFails(
      setDoc(doc(asTeacher(VIEWER_UID), itemPath(VIEWER_UID)), item(VIEWER_UID))
    );
  });

  it('nobody publishes an item missing from their own library', async () => {
    await seed({ libraryOwners: [] });
    await assertFails(
      setDoc(doc(asTeacher(HOST_UID), ITEM_PATH), item(HOST_UID))
    );
  });

  it('nobody publishes in another member’s name', async () => {
    await seed({ libraryOwners: [HOST_UID, COLLAB_UID] });
    await assertFails(
      setDoc(doc(asTeacher(COLLAB_UID), ITEM_PATH), item(HOST_UID))
    );
  });

  it('a collaborator cannot overwrite or edit the host’s item', async () => {
    await seed({ itemOwner: HOST_UID, libraryOwners: [HOST_UID, COLLAB_UID] });
    const db = asTeacher(COLLAB_UID);
    await assertFails(setDoc(doc(db, ITEM_PATH), item(COLLAB_UID)));
    await assertFails(updateDoc(doc(db, ITEM_PATH), { title: 'Changed' }));
  });

  it('a member holding the same item id cannot take over the owner’s copy', async () => {
    await seed({ itemOwner: HOST_UID, libraryOwners: [HOST_UID, COLLAB_UID] });
    const collab = asTeacher(COLLAB_UID);
    await assertFails(setDoc(doc(collab, ITEM_PATH), item(COLLAB_UID)));
    await assertSucceeds(setDoc(doc(collab, COLLAB_PATH), item(COLLAB_UID)));
    await assertSucceeds(
      setDoc(
        doc(asTeacher(HOST_UID), ITEM_PATH),
        item(HOST_UID, { version: '2000' })
      )
    );
  });

  it('an outsider cannot publish into the share', async () => {
    await seed({ libraryOwners: [OUTSIDER_UID] });
    await assertFails(
      setDoc(
        doc(asTeacher(OUTSIDER_UID), itemPath(OUTSIDER_UID)),
        item(OUTSIDER_UID)
      )
    );
  });

  it('the doc id must match the kind and item id, and the kind must be known', async () => {
    await seed();
    const db = asTeacher(HOST_UID);
    await assertFails(
      setDoc(
        doc(db, `shared_boards/${SHARE_ID}/items/quiz_${HOST_UID}_other`),
        item(HOST_UID)
      )
    );
    await assertFails(
      setDoc(
        doc(db, `shared_boards/${SHARE_ID}/items/poll_${HOST_UID}_${QUIZ_ID}`),
        item(HOST_UID, { kind: 'poll' })
      )
    );
  });

  it('extra fields and a non-map payload are refused', async () => {
    await seed();
    const db = asTeacher(HOST_UID);
    await assertFails(
      setDoc(doc(db, ITEM_PATH), item(HOST_UID, { extra: true }))
    );
    await assertFails(
      setDoc(doc(db, ITEM_PATH), item(HOST_UID, { payload: 'text' }))
    );
  });

  it('a student-role user cannot publish', async () => {
    await seed({ libraryOwners: [STUDENT_UID] });
    await assertFails(
      setDoc(
        doc(asStudentRole(STUDENT_UID), itemPath(STUDENT_UID)),
        item(STUDENT_UID)
      )
    );
  });

  it('the owner and the host delete; other members cannot', async () => {
    await seed({ itemOwner: COLLAB_UID, libraryOwners: [COLLAB_UID] });
    await assertFails(deleteDoc(doc(asTeacher(VIEWER_UID), COLLAB_PATH)));
    await assertSucceeds(deleteDoc(doc(asTeacher(HOST_UID), COLLAB_PATH)));
    await seed({ itemOwner: COLLAB_UID, libraryOwners: [COLLAB_UID] });
    await assertSucceeds(deleteDoc(doc(asTeacher(COLLAB_UID), COLLAB_PATH)));
  });
});

describe('Flashcards, Notebook and Projects items', () => {
  const KINDS = [
    { kind: 'flashcards', collection: 'flashcard_sets' },
    { kind: 'notebook', collection: 'notebooks' },
    { kind: 'project', collection: 'projects' },
  ] as const;
  const ITEM_ID = 'item-1';

  const seedLibrary = async (collectionName: string) => {
    await seed({ libraryOwners: [] });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${HOST_UID}/${collectionName}/${ITEM_ID}`),
        { title: 'Mine' }
      );
    });
  };

  for (const { kind, collection } of KINDS) {
    const path = `shared_boards/${SHARE_ID}/items/${kind}_${HOST_UID}_${ITEM_ID}`;
    const body = item(HOST_UID, {
      kind,
      itemId: ITEM_ID,
      payload: { view: { id: ITEM_ID } },
    });

    it(`the host publishes a ${kind} item from their ${collection} and members read it`, async () => {
      await seedLibrary(collection);
      await assertSucceeds(setDoc(doc(asTeacher(HOST_UID), path), body));
      for (const uid of [COLLAB_UID, VIEWER_UID]) {
        await assertSucceeds(getDoc(doc(asTeacher(uid), path)));
      }
      await assertFails(getDoc(doc(asTeacher(OUTSIDER_UID), path)));
    });

    it(`a ${kind} item needs the item in ${collection}, not another library`, async () => {
      await seedLibrary(collection === 'notebooks' ? 'projects' : 'notebooks');
      await assertFails(setDoc(doc(asTeacher(HOST_UID), path), body));
    });
  }
});
