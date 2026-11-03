// Rules coverage for removed PLC members on `plcs/{plcId}/assessments` and `aggregates` (security batch 2E).
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

const PROJECT_ID = 'spartboard-security-2e-rules';
const PLC_ID = 'p1';
const ASSESSMENT_ID = 'a1';
const MEMBER = 'member-uid';
const REMOVED = 'removed-uid';

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

const assessment = (createdBy: string) => ({
  id: ASSESSMENT_ID,
  title: 'Unit 4 CFA',
  kind: 'quiz',
  syncGroupId: 'sync-1',
  status: 'active',
  createdBy,
  createdAt: 1000,
  updatedAt: 1000,
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // The removed member left memberUids but their map entry lingers.
    await setDoc(doc(db, `plcs/${PLC_ID}`), {
      name: 'Test PLC',
      leadUid: MEMBER,
      memberUids: [MEMBER],
      members: {
        [MEMBER]: { role: 'lead', status: 'active' },
        [REMOVED]: { role: 'member', status: 'removed' },
      },
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(
      doc(db, `plcs/${PLC_ID}/assessments/${ASSESSMENT_ID}`),
      assessment(MEMBER)
    );
    await setDoc(doc(db, `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`), {
      assessmentId: ASSESSMENT_ID,
      schemaVersion: 1,
      ranAt: 1000,
    });
  });
});

describe('removed PLC member on assessments and aggregates', () => {
  const ref = (uid: string, id = ASSESSMENT_ID) =>
    doc(as(uid), `plcs/${PLC_ID}/assessments/${id}`);

  it('cannot read an assessment or its aggregate', async () => {
    await assertFails(getDoc(ref(REMOVED)));
    await assertFails(
      getDoc(doc(as(REMOVED), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('cannot create, update or delete an assessment', async () => {
    await assertFails(
      setDoc(ref(REMOVED, 'a2'), { ...assessment(REMOVED), id: 'a2' })
    );
    await assertFails(updateDoc(ref(REMOVED), { title: 'Hijacked' }));
    await assertFails(deleteDoc(ref(REMOVED)));
  });

  it('a current member still reads, creates, updates and deletes', async () => {
    await assertSucceeds(getDoc(ref(MEMBER)));
    await assertSucceeds(
      getDoc(doc(as(MEMBER), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
    await assertSucceeds(
      setDoc(ref(MEMBER, 'a2'), { ...assessment(MEMBER), id: 'a2' })
    );
    await assertSucceeds(updateDoc(ref(MEMBER), { title: 'Renamed' }));
    await assertSucceeds(deleteDoc(ref(MEMBER, 'a2')));
  });
});
