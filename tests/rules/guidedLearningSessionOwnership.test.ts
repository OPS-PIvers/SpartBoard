// A synced building_admin can't take over a Guided Learning session (teacherUid is immutable,
// only the owner or a site admin updates or deletes it), so it never reaches the session's student data.
//
// Requires the Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gl-session-ownership';
const TEACHER_EMAIL = 'teacher@orono.k12.mn.us';
const TEACHER_UID = `uid-${TEACHER_EMAIL}`;
const STUDENT_UID = 'student-uid';
const SESSION = 'guided_learning_sessions/gl-1';
const CHILDREN = {
  responses: `${SESSION}/responses/${STUDENT_UID}`,
  progress: `${SESSION}/progress/${STUDENT_UID}`,
  content: `${SESSION}/content/steps`,
  views: `${SESSION}/views/v1`,
} as const;

const ADMINS = {
  handMade: 'site-admin@orono.k12.mn.us',
  syncedSuper: 'super@orono.k12.mn.us',
  syncedBuilding: 'building-admin@orono.k12.mn.us',
} as const;

const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

let testEnv: RulesTestEnvironment;

const uidOf = (email: string) => `uid-${email}`;
const as = (email: string) =>
  testEnv
    .authenticatedContext(uidOf(email), {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const session = {
  teacherUid: TEACHER_UID,
  title: 'Cells',
  assignmentMode: 'submissions',
  classId: 'class-1',
  classIds: ['class-1'],
  periodAccess: { 'class-1': { state: 'closed' } },
};

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};
const readDoc = async (path: string) => {
  let data: Record<string, unknown> | undefined;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
};

beforeAll(async () => {
  const [host, port] = (
    process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  ).split(':');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES, 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed(`admins/${ADMINS.handMade}`, { email: ADMINS.handMade });
  for (const [email, roleId] of [
    [ADMINS.syncedSuper, 'super_admin'],
    [ADMINS.syncedBuilding, 'building_admin'],
  ]) {
    await seed(`admins/${email}`, {
      source: 'organizationMembersSync',
      orgId: 'orono',
      roleId,
      email,
    });
  }
  await seed(`organizations/orono/members/${TEACHER_EMAIL}`, {
    roleId: 'teacher',
    status: 'active',
  });
  await seed(SESSION, session);
  await seed(CHILDREN.responses, {
    sessionId: 'gl-1',
    studentAnonymousId: STUDENT_UID,
    answers: [],
    score: 80,
  });
  await seed(CHILDREN.progress, { furthestStepIdx: 1 });
  await seed(CHILDREN.content, { steps: [] });
  await seed(CHILDREN.views, { viewedAt: 1 });
});

describe('synced building admin and another teacher’s GL session', () => {
  const building = () => as(ADMINS.syncedBuilding);
  const buildingUid = uidOf(ADMINS.syncedBuilding);

  it('cannot update the session, including taking teacherUid', async () => {
    await assertFails(
      updateDoc(doc(building(), SESSION), { teacherUid: buildingUid })
    );
    await assertFails(updateDoc(doc(building(), SESSION), { title: 'Mine' }));
    await assertFails(
      setDoc(doc(building(), SESSION), {
        ...session,
        teacherUid: buildingUid,
      })
    );
    expect((await readDoc(SESSION))?.teacherUid).toBe(TEACHER_UID);
  });

  it('cannot delete the session, so it cannot re-create it as its own', async () => {
    await assertFails(deleteDoc(doc(building(), SESSION)));
    await assertFails(
      setDoc(doc(building(), SESSION), {
        ...session,
        teacherUid: buildingUid,
      })
    );
  });

  it('still cannot read, list, update or delete the student data', async () => {
    const db = building();
    for (const path of Object.values(CHILDREN)) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(deleteDoc(doc(db, path)));
    }
    for (const sub of ['responses', 'progress', 'views']) {
      await assertFails(getDocs(collection(db, `${SESSION}/${sub}`)));
    }
    await assertFails(updateDoc(doc(db, CHILDREN.responses), { score: 100 }));
    await assertFails(updateDoc(doc(db, CHILDREN.content), { steps: [1] }));
  });
});

describe('the owning teacher and site admins keep their access', () => {
  it('lets the owner update and delete, but never hand off teacherUid', async () => {
    const db = as(TEACHER_EMAIL);
    await assertSucceeds(updateDoc(doc(db, SESSION), { title: 'Renamed' }));
    await assertFails(
      updateDoc(doc(db, SESSION), { teacherUid: 'someone-else' })
    );
    await assertSucceeds(getDoc(doc(db, CHILDREN.responses)));
    await assertSucceeds(deleteDoc(doc(db, SESSION)));
  });

  it('lets a hand-made or synced super admin update and delete, teacherUid pinned', async () => {
    for (const email of [ADMINS.handMade, ADMINS.syncedSuper]) {
      await seed(SESSION, session);
      const db = as(email);
      await assertSucceeds(updateDoc(doc(db, SESSION), { title: 'Fixed' }));
      await assertFails(
        updateDoc(doc(db, SESSION), { teacherUid: uidOf(email) })
      );
      await assertSucceeds(getDoc(doc(db, CHILDREN.responses)));
      await assertSucceeds(deleteDoc(doc(db, SESSION)));
    }
  });
});
