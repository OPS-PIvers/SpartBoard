// Security batch 5A: a deactivated operator-org teacher loses the teacher branches of
// session, response, ledger and gradebook rules; an active teacher, a teacher with no
// operator-org member doc, substitutes, site admins and the student paths are unaffected.
// Storage owner branches read Firestore, which the Storage emulator can't resolve, so they aren't tested here.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  type Firestore,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-security-batch-5a';
const ORG_ID = 'orono';
const ACTIVE_UID = 'active-teacher-uid';
const ACTIVE_EMAIL = 'active.teacher@orono.k12.mn.us';
const INACTIVE_UID = 'inactive-teacher-uid';
const INACTIVE_EMAIL = 'inactive.teacher@orono.k12.mn.us';
const NOORG_UID = 'noorg-teacher-uid';
const NOORG_EMAIL = 'teacher@somewhere-else.edu';
const STUDENT_UID = 'anon-student-uid';
const SUB_UID = 'sub-uid';
const SUB_EMAIL = 'sub@gmail.com';
const ADMIN_UID = 'site-admin-uid';
const ADMIN_EMAIL = 'site.admin@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const teacher = (uid: string, email: string): Firestore =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore() as unknown as Firestore;

const asActive = () => teacher(ACTIVE_UID, ACTIVE_EMAIL);
const asInactive = () => teacher(INACTIVE_UID, INACTIVE_EMAIL);
const asNoOrg = () => teacher(NOORG_UID, NOORG_EMAIL);
const asSub = () => teacher(SUB_UID, SUB_EMAIL);
const asAdmin = () => teacher(ADMIN_UID, ADMIN_EMAIL);
const asStudent = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore() as unknown as Firestore;
const asSsoStudent = () =>
  testEnv
    .authenticatedContext('sso-student-uid', {
      email: 'kid@orono.k12.mn.us',
      email_verified: true,
      studentRole: true,
      classIds: ['c1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore() as unknown as Firestore;

const TEACHERS = [
  { name: 'active', uid: ACTIVE_UID, ctx: asActive, allowed: true },
  { name: 'no-org', uid: NOORG_UID, ctx: asNoOrg, allowed: true },
  { name: 'deactivated', uid: INACTIVE_UID, ctx: asInactive, allowed: false },
] as const;

const expectRule = (allowed: boolean, p: Promise<unknown>) =>
  allowed ? assertSucceeds(p) : assertFails(p);

const response = (studentUid: string) => ({
  studentUid,
  status: 'joined',
  answers: [],
  completedAttempts: 0,
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
    const members: [string, string, string][] = [
      [ACTIVE_EMAIL, 'teacher', 'active'],
      [INACTIVE_EMAIL, 'teacher', 'inactive'],
      [ADMIN_EMAIL, 'super_admin', 'active'],
    ];
    for (const [email, roleId, status] of members) {
      await setDoc(doc(db, `organizations/${ORG_ID}/members/${email}`), {
        email,
        roleId,
        status,
      });
    }
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
    for (const uid of [ACTIVE_UID, INACTIVE_UID, NOORG_UID]) {
      const q = `quiz_sessions/qs-${uid}`;
      await setDoc(doc(db, q), {
        teacherUid: uid,
        status: 'active',
        classIds: ['c1'],
        subMonitorUids: [SUB_UID],
        subMonitorUntil: Date.now() + 3600000,
      });
      const r = `${q}/responses/${STUDENT_UID}`;
      await setDoc(doc(db, r), response(STUDENT_UID));
      await setDoc(doc(db, `${r}/attempts/a1`), { closed: true });
      await setDoc(doc(db, `${q}/attemptScores/${STUDENT_UID}`), { score: 1 });
      await setDoc(doc(db, `${q}/archived_responses/old`), response('old'));
      await setDoc(doc(db, `quiz_attempt_ledger/qs-${uid}__${STUDENT_UID}`), {
        teacherUid: uid,
        studentUid: STUDENT_UID,
        quizId: 'q',
        completedAttempts: 2,
      });
      const va = `video_activity_sessions/va-${uid}`;
      await setDoc(doc(db, va), { teacherUid: uid, status: 'active' });
      await setDoc(
        doc(db, `${va}/responses/${STUDENT_UID}`),
        response(STUDENT_UID)
      );
      const gl = `guided_learning_sessions/gl-${uid}`;
      await setDoc(doc(db, gl), { teacherUid: uid });
      await setDoc(
        doc(db, `${gl}/responses/${STUDENT_UID}`),
        response(STUDENT_UID)
      );
      const ma = `mini_app_sessions/ma-${uid}`;
      await setDoc(doc(db, ma), { teacherUid: uid });
      await setDoc(doc(db, `${ma}/submissions/${STUDENT_UID}`), {
        studentUid: STUDENT_UID,
      });
      const aw = `activity_wall_sessions/${uid}_a1`;
      await setDoc(doc(db, aw), { teacherUid: uid });
      await setDoc(doc(db, `${aw}/submissions/s1`), {
        authorUid: STUDENT_UID,
        content: 'hi',
        status: 'approved',
      });
      await setDoc(doc(db, `flashcard_sessions/fc-${uid}`), {
        teacherUid: uid,
      });
      await setDoc(doc(db, `sessions/${uid}`), {
        isActive: true,
        code: 'ABC123',
        frozen: false,
      });
      await setDoc(doc(db, `sessions/${uid}/students/${STUDENT_UID}`), {
        pin: '1',
        status: 'active',
      });
      await setDoc(doc(db, `grade_index/row-${uid}`), {
        ownerUid: uid,
        editorUids: [],
      });
      await setDoc(doc(db, `focus_sessions/focus-${uid}`), {
        teacherUids: [uid],
      });
      await setDoc(doc(db, `poll_sessions/${uid}_p1`), { teacherUid: uid });
      await setDoc(
        doc(db, `poll_sessions/${uid}_p1/answers/0_${STUDENT_UID}`),
        {
          text: 'x',
        }
      );
      await setDoc(doc(db, `nextup_sessions/${uid}_n1/entries/e1`), {
        name: 'x',
        joinedAt: 1,
      });
    }
  });
});

describe('batch 5A: deactivated teachers lose session data access', () => {
  for (const t of TEACHERS) {
    describe(`${t.name} teacher on their own sessions`, () => {
      it('quiz: reads, lists, grades and deletes responses', async () => {
        const db = t.ctx();
        const q = `quiz_sessions/qs-${t.uid}`;
        const r = `${q}/responses/${STUDENT_UID}`;
        await expectRule(t.allowed, getDoc(doc(db, r)));
        await expectRule(t.allowed, getDocs(collection(db, `${q}/responses`)));
        await expectRule(t.allowed, getDoc(doc(db, `${r}/attempts/a1`)));
        await expectRule(
          t.allowed,
          getDoc(doc(db, `${q}/attemptScores/${STUDENT_UID}`))
        );
        await expectRule(
          t.allowed,
          getDoc(doc(db, `${q}/archived_responses/old`))
        );
        await expectRule(t.allowed, updateDoc(doc(db, r), { score: 90 }));
        await expectRule(t.allowed, deleteDoc(doc(db, r)));
      });

      it('quiz: lists, updates and deletes the session', async () => {
        const db = t.ctx();
        await expectRule(
          t.allowed,
          getDocs(
            query(
              collection(db, 'quiz_sessions'),
              where('teacherUid', '==', t.uid)
            )
          )
        );
        await expectRule(
          t.allowed,
          updateDoc(doc(db, `quiz_sessions/qs-${t.uid}`), { status: 'ended' })
        );
        await expectRule(
          t.allowed,
          deleteDoc(doc(db, `quiz_sessions/qs-${t.uid}`))
        );
      });

      it('quiz attempt ledger: reads, lowers and deletes the row', async () => {
        const db = t.ctx();
        const l = `quiz_attempt_ledger/qs-${t.uid}__${STUDENT_UID}`;
        await expectRule(t.allowed, getDoc(doc(db, l)));
        await expectRule(
          t.allowed,
          updateDoc(doc(db, l), { completedAttempts: 1 })
        );
        await expectRule(t.allowed, deleteDoc(doc(db, l)));
      });

      it('video activity: reads, lists, grades and deletes responses, deletes the session', async () => {
        const db = t.ctx();
        const va = `video_activity_sessions/va-${t.uid}`;
        const r = `${va}/responses/${STUDENT_UID}`;
        await expectRule(t.allowed, getDoc(doc(db, r)));
        await expectRule(t.allowed, getDocs(collection(db, `${va}/responses`)));
        await expectRule(t.allowed, updateDoc(doc(db, r), { score: 5 }));
        await expectRule(t.allowed, deleteDoc(doc(db, r)));
        await expectRule(t.allowed, deleteDoc(doc(db, va)));
      });

      it('guided learning: reads, lists, grades and deletes responses', async () => {
        const db = t.ctx();
        const gl = `guided_learning_sessions/gl-${t.uid}`;
        const r = `${gl}/responses/${STUDENT_UID}`;
        await expectRule(t.allowed, getDoc(doc(db, r)));
        await expectRule(t.allowed, getDocs(collection(db, `${gl}/responses`)));
        await expectRule(t.allowed, updateDoc(doc(db, r), { score: 5 }));
        await expectRule(t.allowed, deleteDoc(doc(db, r)));
      });

      it('mini app and activity wall: reads submissions', async () => {
        const db = t.ctx();
        await expectRule(
          t.allowed,
          getDoc(
            doc(db, `mini_app_sessions/ma-${t.uid}/submissions/${STUDENT_UID}`)
          )
        );
        const w = `activity_wall_sessions/${t.uid}_a1/submissions`;
        await expectRule(t.allowed, getDoc(doc(db, `${w}/s1`)));
        await expectRule(t.allowed, getDocs(collection(db, w)));
      });

      it('live session: reads the roster, freezes a student, ends the session', async () => {
        const db = t.ctx();
        const s = `sessions/${t.uid}`;
        await expectRule(t.allowed, getDoc(doc(db, s)));
        await expectRule(
          t.allowed,
          getDoc(doc(db, `${s}/students/${STUDENT_UID}`))
        );
        await expectRule(
          t.allowed,
          updateDoc(doc(db, `${s}/students/${STUDENT_UID}`), {
            status: 'frozen',
          })
        );
        await expectRule(t.allowed, deleteDoc(doc(db, s)));
      });

      it('flashcards, gradebook, focus, next up and polls: reads', async () => {
        const db = t.ctx();
        await expectRule(
          t.allowed,
          getDoc(doc(db, `flashcard_sessions/fc-${t.uid}`))
        );
        await expectRule(
          t.allowed,
          getDoc(doc(db, `grade_index/row-${t.uid}`))
        );
        await expectRule(
          t.allowed,
          getDoc(doc(db, `focus_sessions/focus-${t.uid}`))
        );
        await expectRule(
          t.allowed,
          getDocs(
            query(
              collection(db, 'focus_sessions'),
              where('teacherUids', 'array-contains', t.uid)
            )
          )
        );
        await expectRule(
          t.allowed,
          getDocs(collection(db, `nextup_sessions/${t.uid}_n1/entries`))
        );
        await expectRule(
          t.allowed,
          getDoc(doc(db, `poll_sessions/${t.uid}_p1`))
        );
        await expectRule(
          t.allowed,
          getDocs(collection(db, `poll_sessions/${t.uid}_p1/answers`))
        );
      });
    });
  }

  it('a substitute monitor with no member doc still reads responses', async () => {
    await assertSucceeds(
      getDocs(collection(asSub(), `quiz_sessions/qs-${ACTIVE_UID}/responses`))
    );
  });

  it('an active site admin still reads and grades responses', async () => {
    const r = `quiz_sessions/qs-${INACTIVE_UID}/responses/${STUDENT_UID}`;
    await assertSucceeds(getDoc(doc(asAdmin(), r)));
    await assertSucceeds(updateDoc(doc(asAdmin(), r), { score: 80 }));
  });

  it("an SSO student still lists their class's quiz sessions", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asSsoStudent(), 'quiz_sessions'),
          where('classIds', 'array-contains-any', ['c1'])
        )
      )
    );
  });

  it('the student still reads and answers their own response on a deactivated teacher’s quiz', async () => {
    const db = asStudent();
    const r = `quiz_sessions/qs-${INACTIVE_UID}/responses/${STUDENT_UID}`;
    await assertSucceeds(getDoc(doc(db, r)));
    await assertSucceeds(updateDoc(doc(db, r), { status: 'in-progress' }));
  });

  it('reactivating the member restores access', async () => {
    const r = `quiz_sessions/qs-${INACTIVE_UID}/responses/${STUDENT_UID}`;
    await assertFails(getDoc(doc(asInactive(), r)));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(
        doc(
          ctx.firestore(),
          `organizations/${ORG_ID}/members/${INACTIVE_EMAIL}`
        ),
        { status: 'active' }
      );
    });
    const snap = await assertSucceeds(getDoc(doc(asInactive(), r)));
    expect(snap.exists()).toBe(true);
  });
});
