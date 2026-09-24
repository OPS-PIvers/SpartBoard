// Rules for PLC norming copies (member read, no client writes) and the private flag pointer (owner read only).
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
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-norming';
const PLC_ID = 'plc-norming-test';
const FLAGGER = 'flagger-uid';
const TEAMMATE = 'teammate-uid';
const OUTSIDER = 'outsider-uid';
const COPY = `plcs/${PLC_ID}/norming/n1`;
const SOURCE = 'plc_norming_sources/s1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;
const as = (uid: string) =>
  testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .firestore();

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
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'Norming PLC',
      leadUid: FLAGGER,
      memberUids: [FLAGGER, TEAMMATE],
      memberEmails: {},
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, COPY), {
      id: 'n1',
      assessmentId: 'a1',
      questionId: 'q1',
      level: 'high',
      kind: 'text',
      answerText: 'An answer',
      flaggedByUid: FLAGGER,
    });
    await setDoc(doc(db, SOURCE), {
      normingId: 'n1',
      plcId: PLC_ID,
      flaggedByUid: FLAGGER,
      sessionId: 'sess-1',
      responseKey: 'key-1',
      questionId: 'q1',
    });
  });
});

describe('plcs/{plcId}/norming', () => {
  it('members read and list copies; outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(as(TEAMMATE), COPY)));
    await assertSucceeds(
      getDocs(
        query(
          collection(as(TEAMMATE), `plcs/${PLC_ID}/norming`),
          where('assessmentId', '==', 'a1')
        )
      )
    );
    await assertFails(getDoc(doc(as(OUTSIDER), COPY)));
    await assertFails(
      getDocs(collection(as(OUTSIDER), `plcs/${PLC_ID}/norming`))
    );
  });

  it('nobody writes copies from a client, the flagger included', async () => {
    await assertFails(
      setDoc(doc(as(FLAGGER), `plcs/${PLC_ID}/norming/n2`), {
        level: 'low',
        flaggedByUid: FLAGGER,
      })
    );
    await assertFails(updateDoc(doc(as(FLAGGER), COPY), { level: 'low' }));
    await assertFails(deleteDoc(doc(as(FLAGGER), COPY)));
    await assertFails(
      updateDoc(doc(as(TEAMMATE), COPY), { answerText: 'forged' })
    );
  });
});

describe('plc_norming_sources', () => {
  it('only the flagging teacher reads the pointer', async () => {
    await assertSucceeds(getDoc(doc(as(FLAGGER), SOURCE)));
    await assertSucceeds(
      getDocs(
        query(
          collection(as(FLAGGER), 'plc_norming_sources'),
          where('flaggedByUid', '==', FLAGGER),
          where('sessionId', '==', 'sess-1')
        )
      )
    );
    await assertFails(getDoc(doc(as(TEAMMATE), SOURCE)));
    await assertFails(
      getDocs(
        query(
          collection(as(TEAMMATE), 'plc_norming_sources'),
          where('sessionId', '==', 'sess-1')
        )
      )
    );
    await assertFails(getDocs(collection(as(TEAMMATE), 'plc_norming_sources')));
  });

  it('nobody writes pointers from a client', async () => {
    await assertFails(
      setDoc(doc(as(FLAGGER), 'plc_norming_sources/s2'), {
        flaggedByUid: FLAGGER,
      })
    );
    await assertFails(updateDoc(doc(as(FLAGGER), SOURCE), { level: 'low' }));
    await assertFails(deleteDoc(doc(as(FLAGGER), SOURCE)));
  });
});
