// Student sign-in hardening: who may create a quiz session, and what a
// pinLoginV1 token (studentRole + pinLogin, one session) may read.
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
} from '@firebase/rules-unit-testing';
import {
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  doc,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-pin-sign-in-hardening';
const TEACHER_UID = 'teacher-uid-psh';
const ANON_UID = 'anon-uid-psh';
const STUDENT_UID = 'student-uid-psh';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();

const asSso = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      classIds: [CLASS_A, CLASS_B],
      sso: true,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asPin = (pinSessionId: string | null = 's1') =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      classIds: [CLASS_A],
      pinLogin: true,
      ...(pinSessionId ? { pinSessionId } : {}),
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const session = (teacherUid: string) => ({
  teacherUid,
  code: 'ABC123',
  status: 'waiting',
  rosterIds: ['r1'],
});

const pointer = (classId: string) => ({
  kind: 'quiz',
  sessionId: 's1',
  teacherUid: TEACHER_UID,
  classId,
  createdAt: 1,
  updatedAt: 1,
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
    await setDoc(doc(db, 'quiz_sessions/existing'), session(TEACHER_UID));
    const items = `student_assignments/${STUDENT_UID}/items`;
    await setDoc(doc(db, `${items}/in-a`), pointer(CLASS_A));
    await setDoc(doc(db, `${items}/in-b`), pointer(CLASS_B));
    await setDoc(doc(db, `student_grades/${STUDENT_UID}/classes/${CLASS_A}`), {
      studentUid: STUDENT_UID,
      entries: {},
    });
    for (const sid of ['s1', 's2']) {
      const inClass = { ...session(TEACHER_UID), classIds: [CLASS_A] };
      await setDoc(doc(db, `quiz_sessions/${sid}`), inClass);
      await setDoc(doc(db, `video_activity_sessions/${sid}`), inClass);
      const response = { studentUid: STUDENT_UID, answers: [] };
      await setDoc(
        doc(db, `quiz_sessions/${sid}/responses/${STUDENT_UID}`),
        response
      );
      await setDoc(
        doc(db, `video_activity_sessions/${sid}/responses/${STUDENT_UID}`),
        response
      );
      await setDoc(doc(db, `quiz_attempt_ledger/${sid}__${STUDENT_UID}`), {
        studentUid: STUDENT_UID,
        teacherUid: TEACHER_UID,
        completedAttempts: 1,
      });
    }
  });
});

describe('quiz_sessions create', () => {
  it('lets a signed-in teacher create their own session', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'quiz_sessions/new'), session(TEACHER_UID))
    );
  });

  it('denies an anonymous visitor creating a session they own', async () => {
    await assertFails(
      setDoc(doc(asAnon(), 'quiz_sessions/new'), session(ANON_UID))
    );
  });

  it('keeps the owner update and every signed-in read working', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), 'quiz_sessions/existing'), {
        status: 'active',
      })
    );
    await assertSucceeds(getDoc(doc(asAnon(), 'quiz_sessions/existing')));
    await assertSucceeds(
      getDocs(
        query(
          collection(asAnon(), 'quiz_sessions'),
          where('code', '==', 'ABC123')
        )
      )
    );
    await assertSucceeds(getDoc(doc(asPin(), 'quiz_sessions/existing')));
  });
});

describe('PIN sign-in token scope', () => {
  const items = `student_assignments/${STUDENT_UID}/items`;
  const grades = `student_grades/${STUDENT_UID}/classes/${CLASS_A}`;
  const quizResponse = (sid: string) =>
    `quiz_sessions/${sid}/responses/${STUDENT_UID}`;
  const vaResponse = (sid: string) =>
    `video_activity_sessions/${sid}/responses/${STUDENT_UID}`;
  const ledger = (sid: string) => `quiz_attempt_ledger/${sid}__${STUDENT_UID}`;

  it("reads the student's work in the session its PIN was proven for", async () => {
    await assertSucceeds(getDoc(doc(asPin(), quizResponse('s1'))));
    await assertSucceeds(getDoc(doc(asPin(), ledger('s1'))));
    await assertSucceeds(getDoc(doc(asPin(), vaResponse('s1'))));
    await assertSucceeds(
      setDoc(doc(asPin(), `server_time_probe/${STUDENT_UID}`), {
        at: serverTimestamp(),
      })
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(asPin(), 'quiz_sessions/s1/responses'),
          where('studentUid', '==', STUDENT_UID)
        )
      )
    );
  });

  it("cannot read the same student's work in another session of the class", async () => {
    await assertFails(getDoc(doc(asPin(), quizResponse('s2'))));
    await assertFails(getDoc(doc(asPin(), ledger('s2'))));
    await assertFails(getDoc(doc(asPin(), vaResponse('s2'))));
    await assertFails(
      setDoc(doc(asPin(), quizResponse('s2')), { studentUid: STUDENT_UID })
    );
  });

  it("cannot list the class's other sessions through its class claim", async () => {
    await assertFails(
      getDocs(
        query(
          collection(asPin(), 'video_activity_sessions'),
          where('classIds', 'array-contains-any', [CLASS_A])
        )
      )
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(asSso(), 'video_activity_sessions'),
          where('classIds', 'array-contains-any', [CLASS_A])
        )
      )
    );
  });

  it('gets nothing from a token minted without a session', async () => {
    await assertFails(getDoc(doc(asPin(null), quizResponse('s1'))));
  });

  it('cannot read pointers or grades', async () => {
    await assertFails(getDoc(doc(asPin(), `${items}/in-a`)));
    await assertFails(
      getDocs(
        query(collection(asPin(), items), where('classId', '==', CLASS_A))
      )
    );
    await assertFails(getDoc(doc(asPin(), grades)));
    await assertFails(
      getDocs(collection(asPin(), `student_grades/${STUDENT_UID}/classes`))
    );
  });

  it('leaves the SSO student reads unchanged', async () => {
    await assertSucceeds(getDoc(doc(asSso(), `${items}/in-b`)));
    await assertSucceeds(getDocs(collection(asSso(), items)));
    await assertSucceeds(getDoc(doc(asSso(), grades)));
    await assertSucceeds(getDoc(doc(asSso(), quizResponse('s2'))));
    await assertSucceeds(getDoc(doc(asSso(), ledger('s2'))));
  });

  it('never lets a PIN token write pointers or grades', async () => {
    await assertFails(setDoc(doc(asPin(), `${items}/in-a`), pointer(CLASS_A)));
    await assertFails(setDoc(doc(asPin(), grades), { entries: {} }));
  });

  // The Let-in-now answer write sits near the 1,000-expression cap, so a costlier PIN authUid() fails it.
  it('saves answers in its session through a Let in now pass', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'quiz_sessions/s1'), {
        ...session(TEACHER_UID),
        status: 'active',
        classIds: [CLASS_A],
        classId: CLASS_A,
        accessMode: 'assessment',
        periodAccess: {
          [CLASS_A]: { state: 'closed', openAt: null, closeAt: null },
        },
        studentAccess: { [STUDENT_UID]: 4_000_000_000_000 },
      });
      await setDoc(doc(db, quizResponse('s1')), {
        studentUid: STUDENT_UID,
        classId: CLASS_A,
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'in-progress',
        completedAttempts: 0,
        tabSwitchWarnings: 0,
      });
    });
    const answers = [
      { questionId: 'q1', answer: 'A', answeredAt: 1, status: 'draft' },
    ];
    await assertSucceeds(
      updateDoc(doc(asPin(), quizResponse('s1')), { answers })
    );
  });

  it('saves video answers in its session and nowhere else', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const sid of ['s1', 's2']) {
        await setDoc(doc(db, `video_activity_sessions/${sid}`), {
          teacherUid: TEACHER_UID,
          status: 'active',
          mode: 'submissions',
          classIds: [CLASS_A],
          classId: CLASS_A,
          accessMode: 'assessment',
          periodAccess: {
            [CLASS_A]: { state: 'closed', openAt: null, closeAt: null },
          },
          studentAccess: { [STUDENT_UID]: 4_000_000_000_000 },
        });
        await setDoc(doc(db, vaResponse(sid)), {
          studentUid: STUDENT_UID,
          classId: CLASS_A,
          joinedAt: 1000,
          score: null,
          answers: [],
          completedAt: null,
          completedAttempts: 0,
          tabSwitchWarnings: 0,
        });
      }
    });
    const answers = [{ questionId: 'q1', answer: 'A', answeredAt: 1 }];
    await assertSucceeds(
      updateDoc(doc(asPin(), vaResponse('s1')), { answers })
    );
    await assertFails(updateDoc(doc(asPin(), vaResponse('s2')), { answers }));
  });
});
