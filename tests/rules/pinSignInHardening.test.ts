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
  serverTimestamp,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  doc,
  query,
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

const asPin = (
  pinSessionId: string | null = 'sess-a',
  authTime = Math.floor(Date.now() / 1000)
) =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      classIds: [CLASS_A],
      pinLogin: true,
      ...(pinSessionId ? { pinSessionId } : {}),
      auth_time: authTime,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const HOUR = 3600;

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
    for (const id of ['sess-a', 'sess-b']) {
      await setDoc(doc(db, `quiz_sessions/${id}`), {
        ...session(TEACHER_UID),
        classId: CLASS_A,
        status: 'active',
      });
      await setDoc(doc(db, `quiz_sessions/${id}/responses/${STUDENT_UID}`), {
        studentUid: STUDENT_UID,
        status: 'in-progress',
        answers: [],
        score: null,
      });
      await setDoc(doc(db, `quiz_attempt_ledger/${id}__${STUDENT_UID}`), {
        studentUid: STUDENT_UID,
        teacherUid: TEACHER_UID,
        quizId: 'quiz-1',
        completedAttempts: 1,
        lastAttemptAt: 1,
      });
    }
    await setDoc(doc(db, `student_grades/${STUDENT_UID}/classes/${CLASS_A}`), {
      studentUid: STUDENT_UID,
      entries: {},
    });
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

  const response = (sessionId: string) =>
    `quiz_sessions/${sessionId}/responses/${STUDENT_UID}`;

  it('reads and writes its own response in the session it was proven for', async () => {
    await assertSucceeds(getDoc(doc(asPin(), response('sess-a'))));
    await assertSucceeds(
      updateDoc(doc(asPin(), response('sess-a')), { status: 'in-progress' })
    );
  });

  it("cannot read or write the same student's response in another session", async () => {
    await assertFails(getDoc(doc(asPin(), response('sess-b'))));
    await assertFails(
      updateDoc(doc(asPin(), response('sess-b')), { status: 'in-progress' })
    );
  });

  it('denies a pre-scope PIN token (no session) once its 12h grace has passed', async () => {
    const stale = Math.floor(Date.now() / 1000) - 13 * HOUR;
    await assertFails(getDoc(doc(asPin(null, stale), response('sess-a'))));
    await assertFails(
      updateDoc(doc(asPin(null, stale), response('sess-b')), {
        status: 'in-progress',
      })
    );
  });

  it('keeps a pre-scope PIN token working for 12h so open tabs survive the release', async () => {
    const recent = Math.floor(Date.now() / 1000) - 11 * HOUR;
    await assertSucceeds(getDoc(doc(asPin(null, recent), response('sess-b'))));
    await assertSucceeds(
      updateDoc(doc(asPin(null, recent), response('sess-b')), {
        status: 'in-progress',
      })
    );
  });

  it('reads and updates its attempt ledger and the clock probe in its own session only', async () => {
    const ledger = (sid: string) =>
      `quiz_attempt_ledger/${sid}__${STUDENT_UID}`;
    await assertSucceeds(getDoc(doc(asPin(), ledger('sess-a'))));
    await assertSucceeds(
      updateDoc(doc(asPin(), ledger('sess-a')), {
        completedAttempts: 2,
        lastAttemptAt: 2,
      })
    );
    await assertFails(getDoc(doc(asPin(), ledger('sess-b'))));
    await assertFails(
      updateDoc(doc(asPin(), ledger('sess-b')), {
        completedAttempts: 2,
        lastAttemptAt: 2,
      })
    );
    const probe = doc(asPin(), `server_time_probe/${STUDENT_UID}`);
    await assertSucceeds(setDoc(probe, { at: serverTimestamp() }));
    await assertSucceeds(getDoc(probe));
  });

  it('creates its first ledger entry on completion in its own session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(
        doc(ctx.firestore(), `quiz_attempt_ledger/sess-a__${STUDENT_UID}`)
      );
    });
    const entry = {
      studentUid: STUDENT_UID,
      teacherUid: TEACHER_UID,
      quizId: 'quiz-1',
      completedAttempts: 1,
      lastAttemptAt: 1,
      lastSessionId: 'sess-a',
    };
    await assertSucceeds(
      setDoc(doc(asPin(), `quiz_attempt_ledger/sess-a__${STUDENT_UID}`), entry)
    );
    await assertFails(
      setDoc(doc(asPin(), `quiz_attempt_ledger/sess-c__${STUDENT_UID}`), entry)
    );
  });

  it('saves answers in its session through a Let in now pass', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'quiz_sessions/sess-a'), {
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
      await setDoc(doc(db, response('sess-a')), {
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
      updateDoc(doc(asPin(), response('sess-a')), { answers })
    );
  });

  it('reads and saves video answers in its session and nowhere else', async () => {
    const va = (sid: string) =>
      `video_activity_sessions/${sid}/responses/${STUDENT_UID}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const sid of ['sess-a', 'sess-b']) {
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
        await setDoc(doc(db, va(sid)), {
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
    await assertSucceeds(getDoc(doc(asPin(), va('sess-a'))));
    await assertSucceeds(updateDoc(doc(asPin(), va('sess-a')), { answers }));
    await assertFails(getDoc(doc(asPin(), va('sess-b'))));
    await assertFails(updateDoc(doc(asPin(), va('sess-b')), { answers }));
  });

  it("cannot read the student's assignment pointers", async () => {
    await assertFails(getDoc(doc(asPin(), `${items}/in-a`)));
    await assertFails(getDoc(doc(asPin(), `${items}/in-b`)));
    await assertFails(
      getDocs(
        query(collection(asPin(), items), where('classId', '==', CLASS_A))
      )
    );
    await assertFails(getDocs(collection(asPin(), items)));
  });

  it("reads its own session's pointer, and no other", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${items}/sess-a`), {
        ...pointer(CLASS_A),
        sessionId: 'sess-a',
        override: { language: 'es' },
      });
    });
    await assertSucceeds(getDoc(doc(asPin(), `${items}/sess-a`)));
    await assertSucceeds(getDoc(doc(asPin(), `${items}/missing`)));
    await assertFails(getDoc(doc(asPin('sess-b'), `${items}/sess-a`)));
    await assertFails(getDoc(doc(asPin(), `${items}/in-a`)));
    await assertFails(
      getDocs(
        query(collection(asPin(), items), where('sessionId', '==', 'sess-a'))
      )
    );
  });

  it('leaves the SSO student response reads unchanged', async () => {
    await assertSucceeds(getDoc(doc(asSso(), response('sess-a'))));
    await assertSucceeds(getDoc(doc(asSso(), response('sess-b'))));
  });

  it('cannot read grades', async () => {
    await assertFails(getDoc(doc(asPin(), grades)));
    await assertFails(
      getDocs(collection(asPin(), `student_grades/${STUDENT_UID}/classes`))
    );
  });

  it('leaves the SSO student reads unchanged', async () => {
    await assertSucceeds(getDoc(doc(asSso(), `${items}/in-b`)));
    await assertSucceeds(getDocs(collection(asSso(), items)));
    await assertSucceeds(getDoc(doc(asSso(), grades)));
  });

  it('never lets a PIN token write pointers or grades', async () => {
    await assertFails(setDoc(doc(asPin(), `${items}/in-a`), pointer(CLASS_A)));
    await assertFails(setDoc(doc(asPin(), grades), { entries: {} }));
  });
});
