// Rules coverage for My Groups goals at plcs/{plcId}/goals: members read,
// outsiders are refused, and no client writes (plcTeamItemsV1 does).
//
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
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-goals';
const PLC_ID = 'plc-goals-test';
const GOAL_PATH = `plcs/${PLC_ID}/goals/g1`;

const LEAD = 'lead-uid';
const EDITOR = 'editor-uid';
const VIEWER = 'viewer-uid';
const OUTSIDER = 'outsider-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const as = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore();

const member = (uid: string, role: string) => ({
  uid,
  email: `${uid}@example.com`,
  role,
  joinedAt: 1,
  status: 'active',
});

const goal = (createdBy: string, extra: Record<string, unknown> = {}) => ({
  id: 'g1',
  title: 'Raise reading stamina',
  measure: '80% at 20 minutes',
  practices: [
    { id: 'p1', routineId: 'turn-and-talk', text: '' },
    { id: 'p2', text: 'Daily independent reading' },
  ],
  order: 0,
  createdBy,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const seedGoal = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), GOAL_PATH), goal(LEAD));
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'Group',
      leadUid: LEAD,
      memberUids: [LEAD, EDITOR, VIEWER],
      members: {
        [LEAD]: member(LEAD, 'lead'),
        [EDITOR]: member(EDITOR, 'member'),
        [VIEWER]: member(VIEWER, 'viewer'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
  });
});

describe('read', () => {
  it('lets every member read and list goals, viewers included', async () => {
    await seedGoal();
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), GOAL_PATH)));
      await assertSucceeds(
        getDocs(collection(as(uid), `plcs/${PLC_ID}/goals`))
      );
    }
  });

  it('denies outsiders', async () => {
    await seedGoal();
    await assertFails(getDoc(doc(as(OUTSIDER), GOAL_PATH)));
    await assertFails(
      getDocs(collection(as(OUTSIDER), `plcs/${PLC_ID}/goals`))
    );
  });
});

const nums = { baseline: 58, current: 64, target: 80 };
const pieces = {
  dueDate: '2027-05-14',
  students: 'our 7th graders',
  outcome: 'write a claim with two pieces of evidence',
  title: 'By May 14, 2027, write a claim.',
};

describe('members read a goal with numbers and SMART pieces', () => {
  it('lets members read it and denies outsiders', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), GOAL_PATH),
        goal(LEAD, { ...nums, ...pieces })
      );
    });
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), GOAL_PATH)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), GOAL_PATH)));
  });
});

describe('client writes refused (plcTeamItemsV1 writes goals)', () => {
  it('refuses create for the lead, an editor, viewers and outsiders', async () => {
    await assertFails(setDoc(doc(as(LEAD), GOAL_PATH), goal(LEAD)));
    await assertFails(setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, nums)));
    await assertFails(setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, pieces)));
    await assertFails(setDoc(doc(as(VIEWER), GOAL_PATH), goal(VIEWER)));
    await assertFails(setDoc(doc(as(OUTSIDER), GOAL_PATH), goal(OUTSIDER)));
  });

  it('refuses update, including numbers and pieces, for everyone', async () => {
    await seedGoal();
    for (const uid of [LEAD, EDITOR, VIEWER, OUTSIDER]) {
      await assertFails(
        updateDoc(doc(as(uid), GOAL_PATH), { title: 'New title', updatedAt: 2 })
      );
      await assertFails(
        updateDoc(doc(as(uid), GOAL_PATH), { ...nums, updatedAt: 2 })
      );
      await assertFails(
        updateDoc(doc(as(uid), GOAL_PATH), { ...pieces, updatedAt: 2 })
      );
    }
    await assertFails(
      updateDoc(doc(as(EDITOR), GOAL_PATH), {
        baseline: deleteField(),
        measure: deleteField(),
        updatedAt: 3,
      })
    );
  });

  it('refuses delete for everyone', async () => {
    await seedGoal();
    for (const uid of [LEAD, EDITOR, VIEWER, OUTSIDER]) {
      await assertFails(deleteDoc(doc(as(uid), GOAL_PATH)));
    }
  });
});
