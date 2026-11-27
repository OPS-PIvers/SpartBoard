// Rules for team updates, their acks and the team calendar URL (TEAMS_REDESIGN T27, T28).
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
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-updates';
const PLC_ID = 'updates-test';
const PLC_PATH = `plcs/${PLC_ID}`;
const UPDATES = `${PLC_PATH}/updates`;
const ACK_UPDATE = `${UPDATES}/ack-me`;
const PLAIN_UPDATE = `${UPDATES}/plain`;

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

const CAL =
  'https://calendar.google.com/calendar/embed?src=staff%40orono.k12.mn.us&ctz=America%2FChicago';

const newUpdate = (uid: string, extra: Record<string, unknown> = {}) => ({
  title: 'Fire drill Thursday',
  body: 'Use the north stairwell.',
  requiresAck: false,
  inDigest: true,
  pinned: false,
  reactions: {},
  authorUid: uid,
  authorName: 'Lead Person',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
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
      name: 'Building staff',
      groupType: 'building',
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
    const seeded = {
      title: 'Seeded',
      body: '',
      inDigest: false,
      pinned: false,
      reactions: {},
      authorUid: LEAD,
      authorName: 'Lead Person',
      createdAt: 1,
      updatedAt: 1,
    };
    await setDoc(doc(db, ACK_UPDATE), { ...seeded, requiresAck: true });
    await setDoc(doc(db, PLAIN_UPDATE), { ...seeded, requiresAck: false });
    await setDoc(doc(db, `${ACK_UPDATE}/acks/${CO_LEAD}`), {
      uid: CO_LEAD,
      name: 'Co Lead',
      ackedAt: 1,
    });
  });
});

describe('plcs/{plcId}/updates reads', () => {
  it('every member, viewers included, reads updates; non-members cannot', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER]) {
      await assertSucceeds(getDoc(doc(as(uid), PLAIN_UPDATE)));
      await assertSucceeds(getDocs(collection(as(uid), UPDATES)));
    }
    await assertFails(getDoc(doc(as(OUTSIDER), PLAIN_UPDATE)));
    await assertFails(getDocs(collection(as(OUTSIDER), UPDATES)));
  });
});

describe('plcs/{plcId}/updates writes', () => {
  it('nobody can post an update directly (plcTeamItemsV1 does)', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(
        setDoc(doc(as(uid), `${UPDATES}/x-${uid}`), newUpdate(uid))
      );
    }
    await assertFails(
      setDoc(
        doc(as(CO_LEAD), `${UPDATES}/u2`),
        newUpdate(CO_LEAD, {
          requiresAck: true,
          linkUrl: 'https://example.com/page',
        })
      )
    );
  });

  it('nobody, leads included, can edit, pin or delete an update directly', async () => {
    const edit = {
      title: 'Edited',
      pinned: true,
      updatedAt: serverTimestamp(),
    };
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(updateDoc(doc(as(uid), PLAIN_UPDATE), edit));
      await assertFails(deleteDoc(doc(as(uid), PLAIN_UPDATE)));
    }
    await assertFails(deleteDoc(doc(as(LEAD), ACK_UPDATE)));
  });

  it('a lead cannot rewrite the author or reactions', async () => {
    await assertFails(
      updateDoc(doc(as(CO_LEAD), PLAIN_UPDATE), {
        authorUid: CO_LEAD,
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(as(LEAD), PLAIN_UPDATE), {
        title: 'x',
        reactions: { [MEMBER]: true },
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('members and leads toggle only their own reaction', async () => {
    const ref = (uid: string) => doc(as(uid), PLAIN_UPDATE);
    await assertSucceeds(
      updateDoc(ref(MEMBER), { [`reactions.${MEMBER}`]: true })
    );
    await assertSucceeds(
      updateDoc(ref(VIEWER), { [`reactions.${VIEWER}`]: true })
    );
    await assertSucceeds(updateDoc(ref(LEAD), { [`reactions.${LEAD}`]: true }));
    await assertSucceeds(
      updateDoc(ref(MEMBER), { [`reactions.${MEMBER}`]: deleteField() })
    );
    await assertFails(
      updateDoc(ref(MEMBER), { [`reactions.${LEAD}`]: deleteField() })
    );
    await assertFails(
      updateDoc(ref(MEMBER), { [`reactions.${CO_LEAD}`]: true })
    );
    await assertFails(
      updateDoc(ref(MEMBER), { [`reactions.${MEMBER}`]: false })
    );
    await assertFails(
      updateDoc(ref(MEMBER), { [`reactions.${MEMBER}`]: true, title: 'Mine' })
    );
    await assertFails(
      updateDoc(ref(OUTSIDER), { [`reactions.${OUTSIDER}`]: true })
    );
  });
});

describe('plcs/{plcId}/updates/{id}/acks', () => {
  const ack = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    name: 'Someone',
    ackedAt: serverTimestamp(),
    ...extra,
  });

  it('a member and a viewer acknowledge for themselves', async () => {
    await assertSucceeds(
      setDoc(doc(as(MEMBER), `${ACK_UPDATE}/acks/${MEMBER}`), ack(MEMBER))
    );
    await assertSucceeds(
      setDoc(doc(as(VIEWER), `${ACK_UPDATE}/acks/${VIEWER}`), ack(VIEWER))
    );
  });

  it('nobody acknowledges for someone else, twice, or on a post that needs none', async () => {
    await assertFails(
      setDoc(doc(as(MEMBER), `${ACK_UPDATE}/acks/${VIEWER}`), ack(VIEWER))
    );
    await assertFails(
      setDoc(doc(as(LEAD), `${ACK_UPDATE}/acks/${MEMBER}`), ack(MEMBER))
    );
    await assertFails(
      setDoc(doc(as(MEMBER), `${ACK_UPDATE}/acks/${MEMBER}`), ack(VIEWER))
    );
    await assertFails(
      setDoc(doc(as(MEMBER), `${PLAIN_UPDATE}/acks/${MEMBER}`), ack(MEMBER))
    );
    await assertFails(
      setDoc(doc(as(OUTSIDER), `${ACK_UPDATE}/acks/${OUTSIDER}`), ack(OUTSIDER))
    );
    await assertFails(
      setDoc(
        doc(as(MEMBER), `${ACK_UPDATE}/acks/${MEMBER}`),
        ack(MEMBER, { ackedAt: 5 })
      )
    );
    await assertFails(
      setDoc(doc(as(CO_LEAD), `${ACK_UPDATE}/acks/${CO_LEAD}`), ack(CO_LEAD))
    );
    await assertFails(
      deleteDoc(doc(as(CO_LEAD), `${ACK_UPDATE}/acks/${CO_LEAD}`))
    );
  });

  it('a member reads only their own ack; the lead and co-lead read all', async () => {
    await assertSucceeds(
      getDoc(doc(as(MEMBER), `${ACK_UPDATE}/acks/${MEMBER}`))
    );
    await assertFails(getDoc(doc(as(MEMBER), `${ACK_UPDATE}/acks/${CO_LEAD}`)));
    await assertFails(getDocs(collection(as(MEMBER), `${ACK_UPDATE}/acks`)));
    await assertFails(getDocs(collection(as(VIEWER), `${ACK_UPDATE}/acks`)));
    await assertFails(getDocs(collection(as(OUTSIDER), `${ACK_UPDATE}/acks`)));
    await assertSucceeds(getDocs(collection(as(LEAD), `${ACK_UPDATE}/acks`)));
    await assertSucceeds(
      getDocs(collection(as(CO_LEAD), `${ACK_UPDATE}/acks`))
    );
  });
});

describe('plcs/{plcId} calendarEmbedUrl', () => {
  const setCal = (uid: string, value: unknown) =>
    updateDoc(doc(as(uid), PLC_PATH), {
      calendarEmbedUrl: value,
      updatedAt: serverTimestamp(),
    });

  it('nobody can set or clear the calendar directly (plcSettingsV1 does)', async () => {
    for (const uid of [LEAD, CO_LEAD, MEMBER, VIEWER, OUTSIDER]) {
      await assertFails(setCal(uid, CAL));
    }
    await assertFails(
      updateDoc(doc(as(CO_LEAD), PLC_PATH), {
        calendarEmbedUrl: deleteField(),
        updatedAt: 2,
      })
    );
  });

  it('members read the calendar on the team doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), PLC_PATH), {
        calendarEmbedUrl: CAL,
      });
    });
    await assertSucceeds(getDoc(doc(as(MEMBER), PLC_PATH)));
    await assertSucceeds(getDoc(doc(as(VIEWER), PLC_PATH)));
  });
});
