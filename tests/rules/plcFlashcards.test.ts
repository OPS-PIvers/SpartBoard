// Rules for /plcs/{plcId}/flashcard_sets and /plcs/{plcId}/flashcard_results: reads only, clients cannot write (plcContentWriteV1 does).
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

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

const PROJECT_ID = 'spartboard-plc-flashcards';
const PLC_ID = 'plc-flashcards-rules-test';
const SET_ID = 'set-1';
const RESULT_ID = 'assignment-1';

const MEMBER_A_UID = 'member-a-uid';
const MEMBER_B_UID = 'member-b-uid';
const VIEWER_UID = 'viewer-uid';
const NON_MEMBER_UID = 'non-member-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asMemberA = () =>
  testEnv
    .authenticatedContext(MEMBER_A_UID, { email: 'member-a@example.com' })
    .firestore();

const asMemberB = () =>
  testEnv
    .authenticatedContext(MEMBER_B_UID, { email: 'member-b@example.com' })
    .firestore();

const asViewer = () =>
  testEnv
    .authenticatedContext(VIEWER_UID, { email: 'viewer@example.com' })
    .firestore();

const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'random@example.com' })
    .firestore();

const validSet = (overrides: Record<string, unknown> = {}) => ({
  id: SET_ID,
  title: 'Cell parts',
  termLanguage: 'en-US',
  definitionLanguage: 'en-US',
  cards: [{ id: 'c1', term: 'Nucleus', definition: 'Control center' }],
  createdAt: 500,
  updatedAt: 1000,
  sharedBy: MEMBER_A_UID,
  sharedByEmail: 'member-a@example.com',
  sharedByName: 'Member A',
  sharedAt: 1000,
  ...overrides,
});

const validResult = (overrides: Record<string, unknown> = {}) => ({
  id: RESULT_ID,
  setId: SET_ID,
  setTitle: 'Cell parts',
  kind: 'check',
  classLabel: 'Period 2',
  students: 24,
  completed: 20,
  averagePercent: 81.5,
  cards: [
    {
      term: 'Nucleus',
      definition: 'Control center',
      correct: 18,
      answered: 20,
    },
  ],
  sharedBy: MEMBER_A_UID,
  sharedByEmail: 'member-a@example.com',
  sharedByName: 'Member A',
  sharedAt: 1000,
  updatedAt: 1000,
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
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER_A_UID,
      memberUids: [MEMBER_A_UID, MEMBER_B_UID, VIEWER_UID],
      members: {
        [MEMBER_A_UID]: { role: 'lead' },
        [MEMBER_B_UID]: { role: 'member' },
        [VIEWER_UID]: { role: 'viewer' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

const setPath = `plcs/${PLC_ID}/flashcard_sets/${SET_ID}`;
const resultPath = `plcs/${PLC_ID}/flashcard_results/${RESULT_ID}`;

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

describe('plcs/{plcId}/flashcard_sets — read', () => {
  beforeEach(() => seed(setPath, validSet()));

  it('a member can read', async () => {
    await assertSucceeds(getDoc(doc(asMemberB(), setPath)));
  });

  it('a viewer can read', async () => {
    await assertSucceeds(getDoc(doc(asViewer(), setPath)));
  });

  it('a non-member cannot read', async () => {
    await assertFails(getDoc(doc(asNonMember(), setPath)));
  });
});

describe('plcs/{plcId}/flashcard_sets — client writes refused', () => {
  it('a member can no longer share a valid set', async () => {
    await assertFails(setDoc(doc(asMemberA(), setPath), validSet()));
  });

  it('a viewer and a non-member cannot share', async () => {
    await assertFails(
      setDoc(doc(asViewer(), setPath), validSet({ sharedBy: VIEWER_UID }))
    );
    await assertFails(
      setDoc(
        doc(asNonMember(), setPath),
        validSet({ sharedBy: NON_MEMBER_UID })
      )
    );
  });

  it('reads a set that carries Speak settings, but refuses a settings edit', async () => {
    const speak = {
      dialects: ['en-US'],
      preset: 'beginner',
      strict: false,
      groups: {},
      attempts: 3,
      example: true,
    };
    await seed(setPath, validSet({ speak }));
    await assertSucceeds(getDoc(doc(asViewer(), setPath)));
    await assertFails(
      updateDoc(doc(asMemberB(), setPath), {
        speak: { ...speak, attempts: 5 },
        updatedAt: 2000,
      })
    );
  });

  it('no member can unshare with a tombstone, rewrite attribution or delete', async () => {
    await seed(setPath, validSet());
    await assertFails(
      updateDoc(doc(asMemberB(), setPath), { deletedAt: 2000, updatedAt: 2000 })
    );
    await assertFails(
      updateDoc(doc(asMemberA(), setPath), { deletedAt: 2000, updatedAt: 2000 })
    );
    await assertFails(
      updateDoc(doc(asMemberB(), setPath), { sharedBy: MEMBER_B_UID })
    );
    await assertFails(deleteDoc(doc(asMemberA(), setPath)));
  });

  it('a viewer cannot unshare or delete', async () => {
    await seed(setPath, validSet());
    await assertFails(
      updateDoc(doc(asViewer(), setPath), { deletedAt: 2000, updatedAt: 2000 })
    );
    await assertFails(deleteDoc(doc(asViewer(), setPath)));
  });
});

describe('plcs/{plcId}/flashcard_results — read', () => {
  beforeEach(() => seed(resultPath, validResult()));

  it('a member can read', async () => {
    await assertSucceeds(getDoc(doc(asMemberB(), resultPath)));
  });

  it('a viewer can read', async () => {
    await assertSucceeds(getDoc(doc(asViewer(), resultPath)));
  });

  it('a non-member cannot read', async () => {
    await assertFails(getDoc(doc(asNonMember(), resultPath)));
  });
});

describe('plcs/{plcId}/flashcard_results — client writes refused', () => {
  it('a member can no longer share their own results', async () => {
    await assertFails(setDoc(doc(asMemberA(), resultPath), validResult()));
  });

  it('a viewer and a non-member cannot share results', async () => {
    await assertFails(
      setDoc(doc(asViewer(), resultPath), validResult({ sharedBy: VIEWER_UID }))
    );
    await assertFails(
      setDoc(
        doc(asNonMember(), resultPath),
        validResult({ sharedBy: NON_MEMBER_UID })
      )
    );
  });

  it('not even the sharer can refresh or remove it', async () => {
    await seed(resultPath, validResult());
    await assertFails(
      setDoc(
        doc(asMemberA(), resultPath),
        validResult({ completed: 22, updatedAt: 2000 })
      )
    );
    await assertFails(deleteDoc(doc(asMemberA(), resultPath)));
    await assertFails(deleteDoc(doc(asMemberB(), resultPath)));
  });
});
