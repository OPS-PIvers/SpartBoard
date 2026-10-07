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
  it('lead, co-lead and member can create a note with blocks and meetingAt', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER]) {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), PLC_PATH), {
          name: 'Notes PLC',
          leadUid: LEAD,
          memberUids: [LEAD, CO_LEAD, MEMBER, VIEWER],
          memberEmails: {},
          members: {
            [LEAD]: { uid: LEAD, role: 'lead', status: 'active' },
            [CO_LEAD]: { uid: CO_LEAD, role: 'coLead', status: 'active' },
            [MEMBER]: { uid: MEMBER, role: 'member', status: 'active' },
            [VIEWER]: { uid: VIEWER, role: 'viewer', status: 'active' },
          },
          createdAt: 1,
          updatedAt: 1,
        });
      });
      await assertSucceeds(setDoc(doc(as(uid), NOTE_PATH), note(uid)));
    }
  });

  it('viewers and non-members cannot create one', async () => {
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

  it('a member can update blocks with the version bump', async () => {
    await seedNote();
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), NOTE_PATH), {
        blocks: [{ ...decisionBlock, status: 'open' }],
        lastEditedBy: MEMBER,
        lastEditedAt: serverTimestamp(),
        version: 1,
      })
    );
  });

  it('viewers and non-members cannot update blocks', async () => {
    await seedNote();
    for (const uid of [VIEWER, OUTSIDER]) {
      await assertFails(
        updateDoc(doc(as(uid), NOTE_PATH), {
          blocks: [],
          lastEditedBy: uid,
          lastEditedAt: serverTimestamp(),
          version: 1,
        })
      );
    }
  });

  it('rejects more than 100 blocks, non-list blocks and a non-int meetingAt', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      ...dataBlock,
      id: `b${i}`,
    }));
    await assertFails(
      setDoc(doc(as(MEMBER), NOTE_PATH), note(MEMBER, { blocks: many }))
    );
    await assertFails(
      setDoc(doc(as(MEMBER), NOTE_PATH), note(MEMBER, { blocks: 'x' }))
    );
    await assertFails(
      setDoc(doc(as(MEMBER), NOTE_PATH), note(MEMBER, { meetingAt: 'soon' }))
    );
    await assertSucceeds(
      setDoc(doc(as(MEMBER), NOTE_PATH), note(MEMBER, { meetingAt: null }))
    );
  });

  it('a note without the new fields still saves (today’s client)', async () => {
    const legacy = note(MEMBER);
    delete (legacy as Record<string, unknown>).blocks;
    delete (legacy as Record<string, unknown>).meetingAt;
    await assertSucceeds(setDoc(doc(as(MEMBER), NOTE_PATH), legacy));
    await assertSucceeds(
      updateDoc(doc(as(MEMBER), NOTE_PATH), {
        body: '## Agenda\n- item',
        lastEditedBy: MEMBER,
        lastEditedAt: serverTimestamp(),
        version: 1,
      })
    );
  });

  it('unknown keys stay locked out', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), NOTE_PATH), note(MEMBER, { agenda: [] }))
    );
  });
});

const writeTemplate = (uid: string, extra: Record<string, unknown> = {}) =>
  updateDoc(doc(as(uid), PLC_PATH), {
    meetingNoteTemplate: '## Agenda\n\n## Decisions <!-- decision -->\n',
    updatedAt: serverTimestamp(),
    ...extra,
  });

describe('plcs/{plcId} meetingNoteTemplate', () => {
  it('the lead and a co-lead can set it', async () => {
    await assertSucceeds(writeTemplate(LEAD));
    await assertSucceeds(writeTemplate(CO_LEAD));
  });

  it('a co-lead can clear it or set it to none', async () => {
    await assertSucceeds(writeTemplate(CO_LEAD));
    await assertSucceeds(
      updateDoc(doc(as(CO_LEAD), PLC_PATH), {
        meetingNoteTemplate: deleteField(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(writeTemplate(CO_LEAD, { meetingNoteTemplate: '' }));
  });

  it('members, viewers and non-members cannot set it', async () => {
    await assertFails(writeTemplate(MEMBER));
    await assertFails(writeTemplate(VIEWER));
    await assertFails(writeTemplate(OUTSIDER));
  });

  it('a co-lead cannot change other fields with it', async () => {
    await assertFails(writeTemplate(CO_LEAD, { name: 'Renamed' }));
  });

  it('rejects a non-string or oversized template', async () => {
    await assertFails(writeTemplate(CO_LEAD, { meetingNoteTemplate: 3 }));
    await assertFails(
      writeTemplate(CO_LEAD, { meetingNoteTemplate: 'x'.repeat(20001) })
    );
  });

  it('every member can read it; non-members cannot', async () => {
    await assertSucceeds(writeTemplate(LEAD));
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), PLC_PATH)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), PLC_PATH)));
  });
});
