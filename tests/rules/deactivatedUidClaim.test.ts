// A deactivated member stays locked out by uid (the `deactivated` claim), whatever email the token carries;
// a demoted student or deactivated member no longer passes isOrgMember() org reads.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-deactivated-uid-claim';
const UID = 'teacher-uid';
const ACTIVE = 'active.teacher@orono.k12.mn.us';
const SESSION = 'quiz-session-1';
const PLC_ID = 'plc-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const google = (extra: TokenOptions): TokenOptions => ({
  studentRole: false,
  classIds: [],
  firebase: { sign_in_provider: 'google.com' },
  ...extra,
});

// The same uid after deactivation, under every email shape an account change could produce.
const DEACTIVATED_TOKENS: Array<[string, TokenOptions]> = [
  [
    'a different verified email',
    google({
      email: 'renamed@personal.example',
      email_verified: true,
      deactivated: true,
    }),
  ],
  [
    'an unverified email',
    google({
      email: 'renamed@personal.example',
      email_verified: false,
      deactivated: true,
    }),
  ],
  ['no email', google({ deactivated: true })],
];

const asUid = (token: TokenOptions) =>
  testEnv.authenticatedContext(UID, token).firestore();
const as = (email: string, uid = `uid-${email}`) =>
  testEnv
    .authenticatedContext(uid, google({ email, email_verified: true }))
    .firestore();

const seed = async (path: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
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
  await seed(`users/${UID}/dashboards/d1`, { id: 'd1', name: 'Board' });
  await seed(`quiz_sessions/${SESSION}`, {
    teacherUid: UID,
    classId: '',
    classIds: [],
  });
  await seed(`quiz_sessions/${SESSION}/responses/s1`, {
    studentUid: 's1',
    pin: '1',
  });
  await seed(`plcs/${PLC_ID}`, {
    name: 'PLC',
    leadUid: UID,
    memberUids: [UID],
    members: { [UID]: { role: 'lead', status: 'active' } },
  });
});

describe('the deactivated claim locks the uid out whatever its email', () => {
  const reads = (db: ReturnType<typeof asUid>): Promise<unknown>[] => [
    getDoc(doc(db, `users/${UID}/dashboards/d1`)),
    setDoc(doc(db, `users/${UID}/dashboards/d1`), {
      id: 'd1',
      name: 'Changed',
    }),
    getDoc(doc(db, `quiz_sessions/${SESSION}/responses/s1`)),
    getDoc(doc(db, `plcs/${PLC_ID}`)),
    getDocs(
      query(collection(db, 'plcs'), where('memberUids', 'array-contains', UID))
    ),
  ];

  for (const [label, token] of DEACTIVATED_TOKENS) {
    it(`denies boards, session responses and PLC docs with ${label}`, async () => {
      for (const p of reads(asUid(token))) await assertFails(p);
    });
  }

  it('the same uid without the claim keeps access', async () => {
    const db = asUid(
      google({ email: 'renamed@personal.example', email_verified: true })
    );
    for (const p of reads(db)) await assertSucceeds(p);
  });
});

describe('isOrgMember() needs a live, non-student member doc', () => {
  const DEMOTED = 'student@orono.k12.mn.us';
  const INACTIVE = 'gone.teacher@orono.k12.mn.us';
  const REMOVED = 'removed.teacher@orono.k12.mn.us';
  const INVITED = 'invited.teacher@orono.k12.mn.us';

  beforeEach(async () => {
    const member = (email: string, roleId: string, status: string) =>
      seed(`organizations/orono/members/${email}`, {
        email,
        orgId: 'orono',
        roleId,
        status,
        buildingIds: [],
      });
    await member(ACTIVE, 'teacher', 'active');
    await member(INVITED, 'teacher', 'invited');
    await member(DEMOTED, 'student', 'active');
    await member(INACTIVE, 'teacher', 'inactive');
    await member(REMOVED, 'teacher', 'removed');
    await seed('organizations/orono', { id: 'orono', name: 'Orono' });
    await seed('organizations/orono/buildings/high', { id: 'high' });
    await seed('organizations/orono/domains/d1', {
      domain: '@orono.k12.mn.us',
    });
    await seed('organizations/orono/roles/teacher', { id: 'teacher' });
    await seed('gradebook_district_configs/c1', { orgId: 'orono' });
    await seed('announcements/a1', { orgId: 'orono', title: 'Hi' });
  });

  const orgReads = (db: ReturnType<typeof as>): Promise<unknown>[] => [
    getDoc(doc(db, 'organizations/orono')),
    getDocs(collection(db, 'organizations/orono/members')),
    getDoc(doc(db, `organizations/orono/members/${ACTIVE}`)),
    getDocs(collection(db, 'organizations/orono/buildings')),
    getDocs(collection(db, 'organizations/orono/domains')),
    getDocs(collection(db, 'organizations/orono/roles')),
    getDoc(doc(db, 'gradebook_district_configs/c1')),
    getDoc(doc(db, 'announcements/a1')),
  ];

  for (const email of [DEMOTED, INACTIVE, REMOVED]) {
    it(`${email} is denied org reads but can still read their own doc`, async () => {
      const db = as(email);
      for (const p of orgReads(db)) await assertFails(p);
      await assertSucceeds(
        getDoc(doc(db, `organizations/orono/members/${email}`))
      );
    });
  }

  for (const email of [ACTIVE, INVITED]) {
    it(`${email} keeps org reads`, async () => {
      for (const p of orgReads(as(email))) await assertSucceeds(p);
    });
  }
});
