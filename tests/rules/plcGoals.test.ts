// Rules coverage for My Groups goals at plcs/{plcId}/goals: members read,
// non-viewer members write, outsiders and viewers are refused.
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

describe('create', () => {
  it('lets the lead and an editor create', async () => {
    await assertSucceeds(setDoc(doc(as(LEAD), GOAL_PATH), goal(LEAD)));
    await assertSucceeds(
      setDoc(doc(as(EDITOR), `plcs/${PLC_ID}/goals/g2`), {
        ...goal(EDITOR),
        id: 'g2',
      })
    );
  });

  it('lets an editor create a goal without a measure', async () => {
    const { measure: _measure, ...rest } = goal(EDITOR);
    await assertSucceeds(setDoc(doc(as(EDITOR), GOAL_PATH), rest));
  });

  it('refuses viewers and outsiders', async () => {
    await assertFails(setDoc(doc(as(VIEWER), GOAL_PATH), goal(VIEWER)));
    await assertFails(setDoc(doc(as(OUTSIDER), GOAL_PATH), goal(OUTSIDER)));
  });

  it('refuses a forged author, a mismatched id and unknown fields', async () => {
    await assertFails(setDoc(doc(as(EDITOR), GOAL_PATH), goal(LEAD)));
    await assertFails(
      setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, { id: 'other' }))
    );
    await assertFails(
      setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, { pinned: true }))
    );
  });

  it('refuses too many practices or a non-list', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `p${i}`,
      text: 'x',
    }));
    await assertFails(
      setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, { practices: many }))
    );
    await assertFails(
      setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, { practices: 'x' }))
    );
  });
});

describe('progress numbers', () => {
  const nums = { baseline: 58, current: 64, target: 80 };

  it('lets the lead and an editor create a goal with numbers', async () => {
    await assertSucceeds(setDoc(doc(as(LEAD), GOAL_PATH), goal(LEAD, nums)));
    await assertSucceeds(
      setDoc(doc(as(EDITOR), `plcs/${PLC_ID}/goals/g2`), {
        ...goal(EDITOR, nums),
        id: 'g2',
      })
    );
  });

  it('refuses viewers and outsiders writing numbers', async () => {
    await assertFails(setDoc(doc(as(VIEWER), GOAL_PATH), goal(VIEWER, nums)));
    await assertFails(
      setDoc(doc(as(OUTSIDER), GOAL_PATH), goal(OUTSIDER, nums))
    );
    await seedGoal();
    await assertFails(
      updateDoc(doc(as(VIEWER), GOAL_PATH), { current: 70, updatedAt: 2 })
    );
    await assertFails(
      updateDoc(doc(as(OUTSIDER), GOAL_PATH), { current: 70, updatedAt: 2 })
    );
  });

  it('refuses out-of-range and non-integer numbers', async () => {
    for (const bad of [
      { target: 101 },
      { baseline: -1 },
      { current: 64.5 },
      { current: '64' },
    ]) {
      await assertFails(setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, bad)));
    }
    await seedGoal();
    await assertFails(
      updateDoc(doc(as(EDITOR), GOAL_PATH), { target: 150, updatedAt: 2 })
    );
  });

  it('lets an editor set and then clear the numbers', async () => {
    await seedGoal();
    await assertSucceeds(
      updateDoc(doc(as(EDITOR), GOAL_PATH), { ...nums, updatedAt: 2 })
    );
    await assertSucceeds(
      updateDoc(doc(as(EDITOR), GOAL_PATH), {
        baseline: deleteField(),
        current: deleteField(),
        target: deleteField(),
        updatedAt: 3,
      })
    );
  });

  it('lets members read a goal with numbers and denies outsiders', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), GOAL_PATH), goal(LEAD, nums));
    });
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), GOAL_PATH)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), GOAL_PATH)));
  });
});

describe('SMART frame pieces', () => {
  const pieces = {
    dueDate: '2027-05-14',
    students: 'our 7th graders',
    outcome: 'write a claim with two pieces of evidence',
    title: `By May 14, 2027, ${'x'.repeat(400)}.`,
  };

  it('lets an editor create and update a goal with the pieces', async () => {
    await assertSucceeds(
      setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, pieces))
    );
    await assertSucceeds(
      updateDoc(doc(as(EDITOR), GOAL_PATH), {
        dueDate: deleteField(),
        students: 'all 7th graders',
        updatedAt: 2,
      })
    );
  });

  it('refuses viewers and outsiders writing the pieces', async () => {
    await assertFails(setDoc(doc(as(VIEWER), GOAL_PATH), goal(VIEWER, pieces)));
    await assertFails(
      setDoc(doc(as(OUTSIDER), GOAL_PATH), goal(OUTSIDER, pieces))
    );
    await seedGoal();
    await assertFails(
      updateDoc(doc(as(VIEWER), GOAL_PATH), { outcome: 'x', updatedAt: 2 })
    );
  });

  it('refuses a bad date, long pieces and an over-long sentence', async () => {
    for (const bad of [
      { dueDate: 'May 14' },
      { dueDate: 20270514 },
      { students: 'x'.repeat(201) },
      { outcome: 'x'.repeat(301) },
      { outcome: 5 },
      { title: 'x'.repeat(601) },
    ]) {
      await assertFails(setDoc(doc(as(EDITOR), GOAL_PATH), goal(EDITOR, bad)));
    }
  });

  it('lets members read a goal with the pieces and denies outsiders', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), GOAL_PATH), goal(LEAD, pieces));
    });
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), GOAL_PATH)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), GOAL_PATH)));
  });
});

describe('update and delete', () => {
  it('lets an editor change the title, practices and clear the measure', async () => {
    await seedGoal();
    await assertSucceeds(
      updateDoc(doc(as(EDITOR), GOAL_PATH), {
        title: 'New title',
        practices: [],
        measure: deleteField(),
        updatedAt: 2,
      })
    );
  });

  it('refuses rewriting the author or creation time', async () => {
    await seedGoal();
    await assertFails(
      updateDoc(doc(as(EDITOR), GOAL_PATH), { createdBy: EDITOR })
    );
    await assertFails(updateDoc(doc(as(EDITOR), GOAL_PATH), { createdAt: 5 }));
  });

  it('refuses viewer edits and deletes', async () => {
    await seedGoal();
    await assertFails(
      updateDoc(doc(as(VIEWER), GOAL_PATH), { title: 'x', updatedAt: 2 })
    );
    await assertFails(deleteDoc(doc(as(VIEWER), GOAL_PATH)));
  });

  it('lets an editor delete', async () => {
    await seedGoal();
    await assertSucceeds(deleteDoc(doc(as(EDITOR), GOAL_PATH)));
  });
});
