// Rules coverage for My Groups links at plcs/{plcId}/links: members read,
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
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-links';
const PLC_ID = 'plc-links-test';
const LINK_PATH = `plcs/${PLC_ID}/links/l1`;

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

const link = (createdBy: string, extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  title: 'Turn and Talk',
  url: 'https://spartboard.web.app/guided-learning/share/abc',
  note: 'Before Tuesday PD',
  createdBy,
  createdByName: 'Lead',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const seedLink = async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), LINK_PATH), link(LEAD));
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
  it('lets every member read and list links, viewers included', async () => {
    await seedLink();
    for (const uid of [LEAD, EDITOR, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), LINK_PATH)));
      await assertSucceeds(
        getDocs(collection(as(uid), `plcs/${PLC_ID}/links`))
      );
    }
  });

  it('denies outsiders', async () => {
    await seedLink();
    await assertFails(getDoc(doc(as(OUTSIDER), LINK_PATH)));
    await assertFails(
      getDocs(collection(as(OUTSIDER), `plcs/${PLC_ID}/links`))
    );
  });
});

describe('create', () => {
  it('lets the lead and an editor create', async () => {
    await assertSucceeds(setDoc(doc(as(LEAD), LINK_PATH), link(LEAD)));
    const { note: _note, ...noNote } = link(EDITOR, { id: 'l2' });
    await assertSucceeds(
      setDoc(doc(as(EDITOR), `plcs/${PLC_ID}/links/l2`), noNote)
    );
  });

  it('refuses viewers and outsiders', async () => {
    await assertFails(setDoc(doc(as(VIEWER), LINK_PATH), link(VIEWER)));
    await assertFails(setDoc(doc(as(OUTSIDER), LINK_PATH), link(OUTSIDER)));
  });

  it('refuses a forged author, a non-https link and extra keys', async () => {
    await assertFails(setDoc(doc(as(EDITOR), LINK_PATH), link(LEAD)));
    await assertFails(
      setDoc(
        doc(as(EDITOR), LINK_PATH),
        link(EDITOR, { url: 'javascript:alert(1)' })
      )
    );
    await assertFails(
      setDoc(doc(as(EDITOR), LINK_PATH), link(EDITOR, { pinned: true }))
    );
  });
});

describe('update and delete', () => {
  it('lets an editor edit but not change the author', async () => {
    await seedLink();
    await assertSucceeds(
      updateDoc(doc(as(EDITOR), LINK_PATH), { title: 'Renamed' })
    );
    await assertFails(
      updateDoc(doc(as(EDITOR), LINK_PATH), { createdBy: EDITOR })
    );
  });

  it('lets an editor delete and refuses a viewer', async () => {
    await seedLink();
    await assertFails(deleteDoc(doc(as(VIEWER), LINK_PATH)));
    await assertFails(updateDoc(doc(as(VIEWER), LINK_PATH), { title: 'x' }));
    await assertSucceeds(deleteDoc(doc(as(EDITOR), LINK_PATH)));
  });
});
