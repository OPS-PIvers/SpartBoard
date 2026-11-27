// Rules for note blocks and meetingAt (TEAMS_REDESIGN T13, T14, T24) and the team meeting-note template (T12).
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

const PROJECT_ID = 'spartboard-team-meeting-notes';
const PLC_ID = 'team-notes-test';
const PLC_PATH = `plcs/${PLC_ID}`;
const NOTE_PATH = `${PLC_PATH}/notes/n1`;

const LEAD = 'lead-uid';
const CO_LEAD = 'colead-uid';
const MEMBER = 'member-uid';
const VIEWER = 'viewer-uid';
const OUTSIDER = 'outsider-uid';

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

const dataBlock = {
  id: 'b1',
  kind: 'data',
  section: 'How will we know if they learned it?',
  assessmentId: 'a1',
  createdBy: MEMBER,
  createdAt: 1,
};
const decisionBlock = {
  id: 'b2',
  kind: 'decision',
  section: 'Decisions',
  text: 'Reteach Q5 in small groups',
  status: 'decided',
  decidedAt: 2,
  revisitAt: 3,
  link: { kind: 'question', assessmentId: 'a1', questionId: 'q5' },
  createdBy: MEMBER,
  createdAt: 1,
};

const note = (uid: string, extra: Record<string, unknown> = {}) => ({
  id: 'n1',
  title: 'Department meeting',
  body: '## Agenda\n',
  kind: 'meeting',
  createdBy: uid,
  createdAt: serverTimestamp(),
  lastEditedBy: uid,
  lastEditedAt: serverTimestamp(),
  version: 0,
  blocks: [dataBlock, decisionBlock],
  meetingAt: 1_800_000_000_000,
  ...extra,
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
    const db = ctx.firestore();
    const member = (uid: string, role: string) => ({
      uid,
      role,
      status: 'active',
    });
    await setDoc(doc(db, PLC_PATH), {
      name: 'Notes PLC',
      groupType: 'department',
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
  });
});

const seedNote = () =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), NOTE_PATH), {
      ...note(MEMBER),
      createdAt: 1,
      lastEditedAt: 1,
    });
  });

describe('plcs/{plcId}/notes blocks and meetingAt', () => {
  it('lead, co-lead and member can no longer create a note with blocks and meetingAt', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER]) {
      await assertFails(setDoc(doc(as(uid), NOTE_PATH), note(uid)));
    }
  });

  it('viewers and non-members cannot create one either', async () => {
    await assertFails(setDoc(doc(as(VIEWER), NOTE_PATH), note(VIEWER)));
    await assertFails(setDoc(doc(as(OUTSIDER), NOTE_PATH), note(OUTSIDER)));
  });

  it('members and viewers can read blocks; non-members cannot', async () => {
    await seedNote();
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), NOTE_PATH)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), NOTE_PATH)));
  });

  it('nobody can update blocks directly', async () => {
    await seedNote();
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(
        updateDoc(doc(as(uid), NOTE_PATH), {
          blocks: [{ ...decisionBlock, status: 'open' }],
          lastEditedBy: uid,
          lastEditedAt: serverTimestamp(),
          version: 1,
        })
      );
    }
  });

  it('a note without the new fields cannot be saved directly either', async () => {
    const legacy = note(MEMBER);
    delete (legacy as Record<string, unknown>).blocks;
    delete (legacy as Record<string, unknown>).meetingAt;
    await assertFails(setDoc(doc(as(MEMBER), NOTE_PATH), legacy));
  });
});

const seedTrashedNote = () =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), NOTE_PATH), {
      ...note(MEMBER),
      createdAt: 1,
      lastEditedAt: 1,
      version: 2,
      deletedAt: 99,
    });
  });

const restore = (uid: string) =>
  updateDoc(doc(as(uid), NOTE_PATH), {
    deletedAt: null,
    meetingAt: 1_800_000_000_000,
    lastEditedBy: uid,
    lastEditedAt: serverTimestamp(),
    version: 3,
  });

describe('restoring a trashed planned meeting note', () => {
  it('nobody can restore it directly (plcNotesWriteV1 does)', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER, OUTSIDER]) {
      await seedTrashedNote();
      await assertFails(restore(uid));
    }
  });
});

const writeTemplate = (uid: string, extra: Record<string, unknown> = {}) =>
  updateDoc(doc(as(uid), PLC_PATH), {
    meetingNoteTemplate: '## Agenda\n\n## Decisions <!-- decision -->\n',
    updatedAt: serverTimestamp(),
    ...extra,
  });

describe('plcs/{plcId} meetingNoteTemplate', () => {
  it('no one can set or clear it directly (plcSettingsV1 does)', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(writeTemplate(uid));
    }
    await assertFails(
      updateDoc(doc(as(CO_LEAD), PLC_PATH), {
        meetingNoteTemplate: deleteField(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('every member can read it; non-members cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PLC_PATH), {
        meetingNoteTemplate: '## Agenda\n',
      });
    });
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), PLC_PATH)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), PLC_PATH)));
  });
});
