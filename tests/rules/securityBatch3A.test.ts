// Security batch 3A: who can create sessions and public pages, and read poll sessions.
// Requires the Firestore emulator: `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
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
import { seedDistrictStaff } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-security-batch-3a';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);
const ORG_ID = 'orono';
const TEACHER_UID = 'teacher-3a';
const TEACHER_EMAIL = 'teacher3a@orono.k12.mn.us';
const STUDENT_UID = 'student-3a';
const CLASSMATE_UID = 'classmate-3a';
const ANON_UID = 'anon-3a';
const CLASS_ID = 'class-3a';
const POLL_SESSION_ID = `${TEACHER_UID}_K3F9Q`;

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: TEACHER_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

// A studentRole SSO/LTI token: non-anonymous, carries classIds.
const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds: [CLASS_ID],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asOrgUser = (email: string) =>
  testEnv
    .authenticatedContext(`uid-${email}`, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const seed = async (path: string, data: Record<string, unknown>) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled((ctx) =>
    seedDistrictStaff(ctx.firestore(), [TEACHER_EMAIL])
  );
});

describe('mini app sessions: student tokens never own one', () => {
  const session = (teacherUid: string) => ({
    teacherUid,
    status: 'active',
    classIds: [CLASS_ID],
    mode: 'submissions',
    submissionsEnabled: true,
  });

  it('denies a studentRole create and allows a teacher', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), 'mini_app_sessions/s-forged'),
        session(STUDENT_UID)
      )
    );
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'mini_app_sessions/s-real'), session(TEACHER_UID))
    );
  });

  it('gives a student-authored session no owner reads, writes or deletes', async () => {
    await seed('mini_app_sessions/s-forged', session(STUDENT_UID));
    await seed('mini_app_sessions/s-forged/submissions/sub-1', {
      studentUid: CLASSMATE_UID,
      submittedAt: 1,
      payload: { a: 1 },
    });
    await seed('mini_app_sessions/s-forged/private/key', { answers: [] });
    const db = asStudent();
    await assertFails(
      getDoc(doc(db, 'mini_app_sessions/s-forged/submissions/sub-1'))
    );
    await assertFails(
      getDocs(collection(db, 'mini_app_sessions/s-forged/submissions'))
    );
    await assertFails(
      deleteDoc(doc(db, 'mini_app_sessions/s-forged/submissions/sub-1'))
    );
    await assertFails(
      getDoc(doc(db, 'mini_app_sessions/s-forged/private/key'))
    );
    await assertFails(
      setDoc(doc(db, 'mini_app_sessions/s-forged/private/key'), { answers: [] })
    );
    await assertFails(
      setDoc(doc(db, 'mini_app_sessions/s-forged/content/app'), { html: 'x' })
    );
    await assertFails(
      updateDoc(doc(db, 'mini_app_sessions/s-forged'), { status: 'ended' })
    );
  });

  it("keeps the teacher's owner paths and a student's own submission read", async () => {
    await seed('mini_app_sessions/s-real', session(TEACHER_UID));
    await seed('mini_app_sessions/s-real/submissions/sub-1', {
      studentUid: STUDENT_UID,
      submittedAt: 1,
      payload: { a: 1 },
    });
    const t = asTeacher();
    await assertSucceeds(
      getDocs(collection(t, 'mini_app_sessions/s-real/submissions'))
    );
    await assertSucceeds(
      setDoc(doc(t, 'mini_app_sessions/s-real/private/key'), { answers: [] })
    );
    await assertSucceeds(
      getDoc(doc(t, 'mini_app_sessions/s-real/private/key'))
    );
    await assertSucceeds(
      setDoc(doc(t, 'mini_app_sessions/s-real/content/app'), { html: 'x' })
    );
    await assertSucceeds(
      updateDoc(doc(t, 'mini_app_sessions/s-real'), { status: 'ended' })
    );
    await assertSucceeds(
      getDoc(doc(asStudent(), 'mini_app_sessions/s-real/submissions/sub-1'))
    );
  });
});

describe('guided learning sessions: student tokens never own one', () => {
  const session = (teacherUid: string) => ({
    teacherUid,
    classIds: [CLASS_ID],
    assignmentMode: 'submissions',
  });

  it('denies a studentRole create and allows a teacher', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), 'guided_learning_sessions/g-forged'),
        session(STUDENT_UID)
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), 'guided_learning_sessions/g-real'),
        session(TEACHER_UID)
      )
    );
  });

  it("gives a student-authored session no reads of classmates' responses or owner writes", async () => {
    await seed('guided_learning_sessions/g-forged', session(STUDENT_UID));
    await seed(`guided_learning_sessions/g-forged/responses/${CLASSMATE_UID}`, {
      sessionId: 'g-forged',
      studentAnonymousId: CLASSMATE_UID,
      answers: [],
      score: null,
    });
    const db = asStudent();
    const theirs = `guided_learning_sessions/g-forged/responses/${CLASSMATE_UID}`;
    await assertFails(getDoc(doc(db, theirs)));
    await assertFails(
      getDocs(collection(db, 'guided_learning_sessions/g-forged/responses'))
    );
    await assertFails(updateDoc(doc(db, theirs), { score: 100 }));
    await assertFails(deleteDoc(doc(db, theirs)));
    await assertFails(
      getDocs(collection(db, 'guided_learning_sessions/g-forged/progress'))
    );
    await assertFails(
      setDoc(doc(db, 'guided_learning_sessions/g-forged/content/steps'), {
        steps: [],
      })
    );
    await assertFails(
      updateDoc(doc(db, 'guided_learning_sessions/g-forged'), { title: 'x' })
    );
    await assertFails(deleteDoc(doc(db, 'guided_learning_sessions/g-forged')));
  });

  it("keeps the teacher's reads and writes and a student's own response", async () => {
    await seed('guided_learning_sessions/g-real', session(TEACHER_UID));
    const mine = `guided_learning_sessions/g-real/responses/${STUDENT_UID}`;
    await seed(mine, {
      sessionId: 'g-real',
      studentAnonymousId: STUDENT_UID,
      answers: [],
      score: null,
    });
    const t = asTeacher();
    await assertSucceeds(
      getDocs(collection(t, 'guided_learning_sessions/g-real/responses'))
    );
    await assertSucceeds(updateDoc(doc(t, mine), { score: 90 }));
    await assertSucceeds(
      setDoc(doc(t, 'guided_learning_sessions/g-real/content/steps'), {
        steps: [],
      })
    );
    await assertSucceeds(
      updateDoc(doc(t, 'guided_learning_sessions/g-real'), { title: 'y' })
    );
    await assertSucceeds(getDoc(doc(asStudent(), mine)));
  });
});

describe('video activity sessions (already fixed in #5166)', () => {
  it('denies a studentRole create of a class-targeted session', async () => {
    await assertFails(
      setDoc(doc(asStudent(), 'video_activity_sessions/x'), {
        teacherUid: STUDENT_UID,
        classIds: [CLASS_ID],
      })
    );
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'video_activity_sessions/y'), {
        teacherUid: TEACHER_UID,
        classIds: [CLASS_ID],
      })
    );
  });
});

describe('public flashcard pages need a teacher account', () => {
  const snapshot = (teacherUid: string) => ({
    teacherUid,
    setId: 'set-1',
    title: 'Spanish',
    description: '',
    termLanguage: 'es',
    definitionLanguage: 'en',
    cards: [{ term: 'hola', definition: 'hello' }],
    updatedAt: 1,
  });

  it('denies anonymous create, update and delete', async () => {
    await assertFails(
      setDoc(doc(asAnon(), 'public_flashcard_sets/p-anon'), snapshot(ANON_UID))
    );
    await seed('public_flashcard_sets/p-old', snapshot(ANON_UID));
    await assertFails(
      setDoc(doc(asAnon(), 'public_flashcard_sets/p-old'), snapshot(ANON_UID))
    );
    await assertFails(deleteDoc(doc(asAnon(), 'public_flashcard_sets/p-old')));
  });

  it('still lets a teacher publish, edit and revoke, and anyone read', async () => {
    const t = asTeacher();
    await assertSucceeds(
      setDoc(doc(t, 'public_flashcard_sets/p-1'), snapshot(TEACHER_UID))
    );
    await assertSucceeds(
      setDoc(doc(t, 'public_flashcard_sets/p-1'), {
        ...snapshot(TEACHER_UID),
        title: 'Spanish 2',
      })
    );
    await assertSucceeds(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'public_flashcard_sets/p-1'
        )
      )
    );
    await assertSucceeds(deleteDoc(doc(t, 'public_flashcard_sets/p-1')));
  });
});

describe('building admin status changes stop at higher tiers', () => {
  const BA = 'ba3a@orono.k12.mn.us';
  const DA = 'da3a@orono.k12.mn.us';
  const SA = 'sa3a@orono.k12.mn.us';
  const T = 'staff3a@orono.k12.mn.us';
  const member = (email: string, roleId: string, status: string) => ({
    email,
    orgId: ORG_ID,
    roleId,
    status,
    buildingIds: ['high'],
  });
  const path = (email: string) => `organizations/${ORG_ID}/members/${email}`;

  beforeEach(async () => {
    await seed(`organizations/${ORG_ID}`, { id: ORG_ID, name: 'Orono' });
    await seed(path(BA), member(BA, 'building_admin', 'active'));
    await seed(path(T), member(T, 'teacher', 'active'));
    await seed(path(SA), member(SA, 'super_admin', 'active'));
  });

  it('denies active to inactive and inactive to active on a domain admin', async () => {
    await seed(path(DA), member(DA, 'domain_admin', 'active'));
    await assertFails(
      updateDoc(doc(asOrgUser(BA), path(DA)), { status: 'inactive' })
    );
    await seed(path(DA), member(DA, 'domain_admin', 'inactive'));
    await assertFails(
      updateDoc(doc(asOrgUser(BA), path(DA)), { status: 'active' })
    );
  });

  it('still denies a super admin target, and lets a domain admin change one', async () => {
    await assertFails(
      updateDoc(doc(asOrgUser(BA), path(SA)), { status: 'inactive' })
    );
    await seed(path(DA), member(DA, 'domain_admin', 'active'));
    await seed(
      path('t2@orono.k12.mn.us'),
      member('t2@orono.k12.mn.us', 'domain_admin', 'inactive')
    );
    await assertSucceeds(
      updateDoc(doc(asOrgUser(DA), path('t2@orono.k12.mn.us')), {
        status: 'active',
      })
    );
  });

  it('still lets a building admin change a teacher in their building', async () => {
    await assertSucceeds(
      updateDoc(doc(asOrgUser(BA), path(T)), { status: 'inactive' })
    );
    await assertSucceeds(
      updateDoc(doc(asOrgUser(BA), path(T)), { status: 'active' })
    );
  });
});

// Poll reads stay open this release so open tabs keep working; AB-113 closes them.
describe('poll codes and sessions keep working for open tabs', () => {
  const session = {
    id: 'K3F9Q',
    teacherUid: TEACHER_UID,
    code: 'K3F9Q',
    questions: [{ id: 'q1', question: 'Q?', options: [] }],
    optionCounts: [2],
    active: true,
  };

  beforeEach(async () => {
    await seed('poll_codes/K3F9Q', {
      sessionId: POLL_SESSION_ID,
      teacherUid: TEACHER_UID,
      updatedAt: 1,
    });
    await seed(`poll_sessions/${POLL_SESSION_ID}`, session);
  });

  it('still lets an old student tab and an old teacher tab read a pointer by code', async () => {
    await assertSucceeds(getDoc(doc(asAnon(), 'poll_codes/K3F9Q')));
    await assertSucceeds(getDoc(doc(asTeacher(), 'poll_codes/ZZZZZ')));
    await assertFails(getDocs(collection(asAnon(), 'poll_codes')));
    await assertFails(getDocs(collection(asTeacher(), 'poll_codes')));
  });

  it('still lets a participant read the session and vote, and the owner read it', async () => {
    await assertSucceeds(
      getDoc(doc(asAnon(), `poll_sessions/${POLL_SESSION_ID}`))
    );
    await assertSucceeds(
      getDoc(doc(asTeacher(), `poll_sessions/${POLL_SESSION_ID}`))
    );
    await assertSucceeds(
      setDoc(
        doc(asAnon(), `poll_sessions/${POLL_SESSION_ID}/votes/0_${ANON_UID}`),
        { questionIndex: 0, optionIndex: 1, votedAt: 1 }
      )
    );
  });

  it('leaves server-written pointers, joins and limits closed to clients', async () => {
    const join = `poll_joins/${POLL_SESSION_ID}__${ANON_UID}`;
    await assertFails(
      setDoc(doc(asAnon(), join), { sessionId: POLL_SESSION_ID, uid: ANON_UID })
    );
    await assertFails(getDoc(doc(asAnon(), join)));
    await assertFails(
      getDoc(doc(asAnon(), `poll_code_limits/uid__${ANON_UID}__1`))
    );
    await assertFails(
      setDoc(doc(asAnon(), `poll_code_limits/uid__${ANON_UID}__1`), {
        codes: [],
      })
    );
    await assertFails(
      setDoc(doc(asTeacher(), 'poll_codes/NEWCD'), {
        sessionId: `${TEACHER_UID}_NEWCD`,
        teacherUid: TEACHER_UID,
        updatedAt: 1,
      })
    );
  });
});
