// Rules for the team layout on plcs/{id} (lead and co-lead only) and admin_settings/team_type_defaults.
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
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-team-layout';
const PLC_ID = 'team-layout-test';
const PLC_PATH = `plcs/${PLC_ID}`;
const DEFAULTS_PATH = 'admin_settings/team_type_defaults';

const LEAD = 'lead-uid';
const CO_LEAD = 'colead-uid';
const MEMBER = 'member-uid';
const VIEWER = 'viewer-uid';
const OUTSIDER = 'outsider-uid';
const ADMIN_EMAIL = 'admin@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;
const as = (uid: string) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
    })
    .firestore();
const asAdmin = () =>
  testEnv
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();
const asStudent = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const layout = {
  pages: [
    { id: 'dataOverview', enabled: true },
    { id: 'assessments', enabled: true },
    { id: 'docs', enabled: false },
  ],
  landing: 'dataOverview',
  cards: ['hero', 'goals', 'distribution'],
  hero: { mode: 'pinned', ref: { kind: 'assessment', assessmentId: 'a1' } },
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
    const db = ctx.firestore();
    const member = (uid: string, role: string) => ({
      uid,
      role,
      status: 'active',
    });
    await setDoc(doc(db, PLC_PATH), {
      name: 'Layout PLC',
      leadUid: LEAD,
      memberUids: [LEAD, CO_LEAD, MEMBER, VIEWER],
      memberEmails: {},
      members: {
        [LEAD]: member(LEAD, 'lead'),
        [CO_LEAD]: member(CO_LEAD, 'coLead'),
        [MEMBER]: member(MEMBER, 'member'),
        [VIEWER]: member(VIEWER, 'viewer'),
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    await setDoc(doc(db, DEFAULTS_PATH), { types: {} });
  });
});

const writeLayout = (uid: string, extra: Record<string, unknown> = {}) =>
  updateDoc(doc(as(uid), PLC_PATH), {
    layout,
    updatedAt: serverTimestamp(),
    ...extra,
  });

describe('plcs/{plcId} layout', () => {
  it('the lead and a co-lead can set the layout', async () => {
    await assertSucceeds(writeLayout(LEAD));
    await assertSucceeds(writeLayout(CO_LEAD));
  });

  it('a co-lead can reset the layout to the district default', async () => {
    await assertSucceeds(writeLayout(CO_LEAD));
    await assertSucceeds(
      updateDoc(doc(as(CO_LEAD), PLC_PATH), {
        layout: deleteField(),
        updatedAt: 2,
      })
    );
  });

  it('plain members, viewers and non-members cannot set it', async () => {
    await assertFails(writeLayout(MEMBER));
    await assertFails(writeLayout(VIEWER));
    await assertFails(writeLayout(OUTSIDER));
  });

  it('a member cannot clear a layout the lead set', async () => {
    await assertSucceeds(writeLayout(LEAD));
    await assertFails(
      updateDoc(doc(as(MEMBER), PLC_PATH), {
        layout: deleteField(),
        updatedAt: 2,
      })
    );
  });

  it('a co-lead cannot smuggle another field with the layout', async () => {
    await assertFails(writeLayout(CO_LEAD, { name: 'Renamed' }));
    await assertFails(writeLayout(CO_LEAD, { digestOptIn: true }));
  });

  it('a co-lead keeps the section switches in step with the layout', async () => {
    await assertSucceeds(
      writeLayout(CO_LEAD, {
        'features.notes': false,
        'features.quizzes': true,
      })
    );
    await assertFails(writeLayout(CO_LEAD, { features: 'off' }));
  });

  it('a plain member cannot write switches alongside a layout', async () => {
    await assertFails(writeLayout(MEMBER, { 'features.notes': false }));
  });

  it('rejects a malformed layout from a co-lead', async () => {
    const bad = [
      'dataOverview',
      { ...layout, extra: true },
      { ...layout, pages: 'dataOverview' },
      { ...layout, landing: 3 },
      { ...layout, cards: {} },
      { ...layout, hero: 'pinned' },
      { ...layout, hero: { mode: 'sticky' } },
      { pages: [], landing: 'hub', cards: [] },
    ];
    for (const value of bad) {
      await assertFails(
        updateDoc(doc(as(CO_LEAD), PLC_PATH), { layout: value, updatedAt: 2 })
      );
    }
  });

  it('members and viewers read the layout; non-members cannot', async () => {
    await assertSucceeds(writeLayout(LEAD));
    await assertSucceeds(getDoc(doc(as(MEMBER), PLC_PATH)));
    await assertSucceeds(getDoc(doc(as(VIEWER), PLC_PATH)));
    await assertFails(getDoc(doc(as(OUTSIDER), PLC_PATH)));
  });

  it('a member can still toggle the legacy features map', async () => {
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), PLC_PATH), {
        features: { notes: false },
        updatedAt: 2,
      })
    );
  });
});

describe('plcs/{plcId} create with a layout', () => {
  const newTeam = (extra: Record<string, unknown> = {}) => ({
    name: 'New team',
    leadUid: OUTSIDER,
    memberUids: [OUTSIDER],
    memberEmails: {},
    members: {
      [OUTSIDER]: { uid: OUTSIDER, role: 'lead', status: 'active' },
    },
    groupType: 'plc',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  });
  const create = (extra: Record<string, unknown> = {}) =>
    setDoc(doc(as(OUTSIDER), 'plcs/new-team'), newTeam(extra));

  it('a teacher creates a team with or without a valid layout', async () => {
    await assertSucceeds(create());
    await testEnv.clearFirestore();
    await assertSucceeds(create({ layout }));
  });

  it('rejects a create with a malformed layout', async () => {
    const bad = [
      'dataOverview',
      null,
      { ...layout, extra: true },
      { ...layout, cards: {} },
      { ...layout, hero: { mode: 'sticky' } },
      { pages: [], landing: 'hub', cards: [] },
    ];
    for (const value of bad) {
      await assertFails(create({ layout: value }));
    }
  });
});

describe('admin_settings/team_type_defaults', () => {
  const defaults = {
    types: { plc: { landing: 'dataOverview', heroRule: 'latestAssessment' } },
  };

  it('signed-in staff read it; students and signed-out users cannot', async () => {
    await assertSucceeds(getDoc(doc(as(MEMBER), DEFAULTS_PATH)));
    await assertFails(getDoc(doc(asStudent(), DEFAULTS_PATH)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), DEFAULTS_PATH))
    );
  });

  it('admins write it; teachers cannot', async () => {
    await assertSucceeds(setDoc(doc(asAdmin(), DEFAULTS_PATH), defaults));
    await assertFails(setDoc(doc(as(LEAD), DEFAULTS_PATH), defaults));
    await assertFails(
      updateDoc(doc(as(MEMBER), DEFAULTS_PATH), { goalCoachRubric: [] })
    );
  });
});
