// Firestore security-rules tests for per-period access on quiz sessions
// (docs/plans/PER_PERIOD_ASSIGNMENT_ACCESS.md): the periodOpen / studentLetIn
// gate on response writes, the rules-enforced global pause, the join rules for
// per-period sessions, and the hidden content/questions doc. Requires a running
// Firestore emulator; invoke via `pnpm run test:rules`.

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
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  increment,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-period-access-test';
const TEACHER_UID = 'teacher-uid';
const STUDENT_UID = 'student-uid';
const OTHER_UID = 'other-student-uid';
const ANON_UID = 'anon-uid';
const CLASS_A = 'class-A';
const CLASS_B = 'class-B';
const LOCAL_KEY = 'roster:local-1';
const ANON_KEY = 'pin-p5-1234';

const PAST = 1_000_000_000_000;
const FUTURE = 4_000_000_000_000;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@example.org',
      email_verified: true,
    })
    .firestore();

const asStudent = (uid = STUDENT_UID, classIds = [CLASS_A]) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnon = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

type Period = {
  state: 'closed' | 'open' | 'paused';
  openAt: number | null;
  closeAt: number | null;
  label: string;
  verified: boolean;
  pausedAt: number;
};

const period = (over: Partial<Period> = {}) => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

async function seedSession(
  id: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `quiz_sessions/${id}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      classIds: [CLASS_A, CLASS_B],
      classId: CLASS_A,
      ...extra,
    });
  });
}

async function seedResponse(
  sessionId: string,
  key: string,
  data: Record<string, unknown>
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `quiz_sessions/${sessionId}/responses/${key}`),
      {
        joinedAt: 1000,
        score: null,
        answers: [],
        status: 'joined',
        completedAttempts: 0,
        tabSwitchWarnings: 0,
        ...data,
      }
    );
  });
}

async function seedSeat(
  sessionId: string,
  uid: string,
  responseKey: string
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `quiz_sessions/${sessionId}/seats/${uid}`),
      {
        responseKey,
      }
    );
  });
}

const joinDoc = (uid: string, extra: Record<string, unknown> = {}) => ({
  studentUid: uid,
  joinedAt: 1000,
  score: null,
  answers: [],
  status: 'joined',
  submittedAt: null,
  completedAttempts: 0,
  preSyncVersion: 0,
  ...extra,
});

const answer = {
  questionId: 'q1',
  answer: 'A',
  answeredAt: 1,
  status: 'draft',
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
});

describe('global pause (every session)', () => {
  const S = 'legacy';
  const resp = () =>
    doc(asStudent(), `quiz_sessions/${S}/responses/${STUDENT_UID}`);

  beforeEach(async () => {
    await seedSession(S, { status: 'paused' });
    await seedResponse(S, STUDENT_UID, {
      studentUid: STUDENT_UID,
      status: 'in-progress',
    });
  });

  it('refuses an answer write while paused', async () => {
    await assertFails(
      updateDoc(resp(), { answers: [answer], status: 'in-progress' })
    );
  });

  it('refuses finishing while paused', async () => {
    await assertFails(
      updateDoc(resp(), {
        status: 'completed',
        submittedAt: 5,
        completedAttempts: increment(1),
      })
    );
    await assertFails(updateDoc(resp(), { status: 'completed' }));
  });

  it('still takes tab, hand and period writes while paused', async () => {
    await assertSucceeds(
      updateDoc(resp(), { tabSwitchWarnings: increment(1) })
    );
    await assertSucceeds(updateDoc(resp(), { classPeriod: 'P1' }));
  });

  it('still takes a rejoin reset while paused', async () => {
    await assertSucceeds(
      updateDoc(resp(), { answers: [], status: 'joined', submittedAt: null })
    );
  });

  it('keeps an answer flush landing just after the pause', async () => {
    await seedSession(S, { status: 'paused', pausedAt: Date.now() - 2_000 });
    await assertSucceeds(
      updateDoc(resp(), { answers: [answer], status: 'in-progress' })
    );
    await seedSession(S, { status: 'paused', pausedAt: Date.now() - 60_000 });
    await assertFails(
      updateDoc(resp(), {
        answers: [answer, { ...answer, questionId: 'q2' }],
      })
    );
  });

  it('takes answer writes once active again', async () => {
    await seedSession(S, { status: 'active' });
    await assertSucceeds(
      updateDoc(resp(), { answers: [answer], status: 'in-progress' })
    );
  });

  it('still joins while paused', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(OTHER_UID), `quiz_sessions/${S}/responses/${OTHER_UID}`),
        joinDoc(OTHER_UID)
      )
    );
  });
});

describe('joining a per-period session', () => {
  const S = 'pa-join';
  const respRef = (db: ReturnType<typeof asStudent>, key: string) =>
    doc(db, `quiz_sessions/${S}/responses/${key}`);

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  it('lets a student check in to their closed period', async () => {
    await assertSucceeds(
      setDoc(
        respRef(asStudent(), STUDENT_UID),
        joinDoc(STUDENT_UID, { classId: CLASS_A })
      )
    );
  });

  it('refuses a join with no period', async () => {
    await assertFails(
      setDoc(respRef(asStudent(), STUDENT_UID), joinDoc(STUDENT_UID))
    );
  });

  it('refuses a period outside the caller claim', async () => {
    await assertFails(
      setDoc(
        respRef(asStudent(), STUDENT_UID),
        joinDoc(STUDENT_UID, { classId: CLASS_B })
      )
    );
  });

  it('refuses a period the session does not target', async () => {
    await assertFails(
      setDoc(
        respRef(asStudent(STUDENT_UID, [CLASS_A, 'class-Z']), STUDENT_UID),
        joinDoc(STUDENT_UID, { classId: 'class-Z' })
      )
    );
  });

  it('refuses answers carried in on the join', async () => {
    await assertFails(
      setDoc(
        respRef(asStudent(STUDENT_UID, [CLASS_B]), STUDENT_UID),
        joinDoc(STUDENT_UID, { classId: CLASS_B, answers: [answer] })
      )
    );
  });

  it('refuses the anonymous PIN key in assessment mode', async () => {
    await assertFails(
      setDoc(
        respRef(asAnon(), ANON_KEY),
        joinDoc(ANON_UID, { classId: CLASS_B, pin: '1234', classPeriod: 'P3' })
      )
    );
  });

  it('takes the anonymous PIN key in assignment mode', async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: {
        [CLASS_A]: period(),
        [LOCAL_KEY]: period({ label: 'P5', verified: false }),
      },
    });
    await assertSucceeds(
      setDoc(
        respRef(asAnon(), ANON_KEY),
        joinDoc(ANON_UID, {
          classId: LOCAL_KEY,
          pin: '1234',
          classPeriod: 'P5',
        })
      )
    );
    await assertFails(
      setDoc(
        respRef(asAnon(), 'pin-p5-9999'),
        joinDoc(ANON_UID, { pin: '9999', classPeriod: 'P5' })
      )
    );
  });
});

describe('answer writes on a per-period session', () => {
  const S = 'pa-answers';
  const resp = () =>
    doc(asStudent(), `quiz_sessions/${S}/responses/${STUDENT_UID}`);
  const writeAnswer = () =>
    updateDoc(resp(), { answers: [answer], status: 'in-progress' });

  async function withPeriod(p: Partial<Period>, extra = {}): Promise<void> {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: { [CLASS_A]: period(p), [CLASS_B]: period() },
      ...extra,
    });
  }

  beforeEach(async () => {
    await seedResponse(S, STUDENT_UID, {
      studentUid: STUDENT_UID,
      classId: CLASS_A,
      status: 'in-progress',
    });
  });

  it('takes answers while the period is open', async () => {
    await withPeriod({});
    await assertSucceeds(writeAnswer());
  });

  it('refuses answers while the period is closed or paused', async () => {
    await withPeriod({ state: 'closed' });
    await assertFails(writeAnswer());
    await withPeriod({ state: 'paused' });
    await assertFails(writeAnswer());
  });

  it('refuses answers when the session itself is paused', async () => {
    await withPeriod({}, { status: 'paused' });
    await assertFails(writeAnswer());
  });

  it('refuses answers before a scheduled open, outside the grace', async () => {
    await withPeriod({ openAt: FUTURE });
    await assertFails(writeAnswer());
  });

  it('takes answers just before openAt, inside the grace', async () => {
    await withPeriod({ openAt: Date.now() + 5_000 });
    await assertSucceeds(writeAnswer());
  });

  it('refuses answers after the period closes, outside the grace', async () => {
    await withPeriod({ openAt: PAST, closeAt: PAST });
    await assertFails(writeAnswer());
  });

  it('takes answers just after closeAt, inside the grace', async () => {
    await withPeriod({ closeAt: Date.now() - 5_000 });
    await assertSucceeds(writeAnswer());
  });

  it('keeps an answer flush landing just after the period is paused', async () => {
    await withPeriod({ state: 'paused', pausedAt: Date.now() - 2_000 });
    await assertSucceeds(writeAnswer());
  });

  it('still takes frozen-allowlist writes while closed', async () => {
    await withPeriod({ state: 'closed' });
    await assertSucceeds(
      updateDoc(resp(), { tabSwitchWarnings: increment(1) })
    );
    await assertSucceeds(updateDoc(resp(), { handRaisedAt: null }));
  });

  it('refuses finishing while closed', async () => {
    await withPeriod({ state: 'closed' });
    await assertFails(
      updateDoc(resp(), {
        status: 'completed',
        submittedAt: 5,
        completedAttempts: increment(1),
      })
    );
  });

  it('honours an unexpired Let in now pass, and only that', async () => {
    await withPeriod(
      { state: 'closed' },
      { studentAccess: { [STUDENT_UID]: FUTURE } }
    );
    await assertSucceeds(writeAnswer());
    await withPeriod(
      { state: 'closed' },
      { studentAccess: { [STUDENT_UID]: PAST, [OTHER_UID]: FUTURE } }
    );
    await assertFails(
      updateDoc(resp(), { answers: [answer, { ...answer, questionId: 'q2' }] })
    );
  });

  it('refuses answers on a response with no period', async () => {
    await withPeriod({});
    await seedResponse(S, STUDENT_UID, {
      studentUid: STUDENT_UID,
      status: 'in-progress',
    });
    await assertFails(writeAnswer());
  });
});

describe('content/questions', () => {
  const S = 'pa-content';
  const contentPath = `quiz_sessions/${S}/content/questions`;

  async function withPeriod(p: Partial<Period>, extra = {}): Promise<void> {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: {
        [CLASS_A]: period(p),
        [LOCAL_KEY]: period({ label: 'P5', verified: false, ...p }),
      },
      ...extra,
    });
  }

  beforeEach(async () => {
    await withPeriod({});
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), contentPath), { publicQuestions: [] });
    });
    await seedResponse(S, STUDENT_UID, {
      studentUid: STUDENT_UID,
      classId: CLASS_A,
    });
  });

  it('lets the teacher read and write it', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), contentPath)));
    await assertSucceeds(
      setDoc(doc(asTeacher(), contentPath), { publicQuestions: [] })
    );
  });

  it('lets the teacher write it in the batch that creates the session', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(doc(db, 'quiz_sessions/new-session'), {
      teacherUid: TEACHER_UID,
      status: 'waiting',
    });
    batch.set(doc(db, 'quiz_sessions/new-session/content/questions'), {
      publicQuestions: [],
    });
    await assertSucceeds(batch.commit());
  });

  it('never lets a student write it', async () => {
    await seedSeat(S, STUDENT_UID, STUDENT_UID);
    await assertFails(
      setDoc(doc(asStudent(), contentPath), { publicQuestions: [] })
    );
  });

  it('lets a seated student read it once their period is open', async () => {
    await seedSeat(S, STUDENT_UID, STUDENT_UID);
    await assertSucceeds(getDoc(doc(asStudent(), contentPath)));
  });

  it('hides it from a seated student while their period is closed', async () => {
    await seedSeat(S, STUDENT_UID, STUDENT_UID);
    await withPeriod({ state: 'closed' });
    await assertFails(getDoc(doc(asStudent(), contentPath)));
    await withPeriod({ openAt: FUTURE });
    await assertFails(getDoc(doc(asStudent(), contentPath)));
  });

  it('hides it from a student with no seat', async () => {
    await assertFails(getDoc(doc(asStudent(), contentPath)));
  });

  it('shows it to a let-in student in a closed period', async () => {
    await withPeriod(
      { state: 'closed' },
      { studentAccess: { [STUDENT_UID]: FUTURE } }
    );
    await assertSucceeds(getDoc(doc(asStudent(), contentPath)));
  });

  it('lets an anonymous joiner read it through their PIN-key seat', async () => {
    await seedResponse(S, ANON_KEY, {
      studentUid: ANON_UID,
      classId: LOCAL_KEY,
      pin: '1234',
    });
    await assertSucceeds(
      setDoc(doc(asAnon(), `quiz_sessions/${S}/seats/${ANON_UID}`), {
        responseKey: ANON_KEY,
      })
    );
    await assertSucceeds(getDoc(doc(asAnon(), contentPath)));
  });

  it('refuses a seat pointing at another student response', async () => {
    await assertFails(
      setDoc(doc(asAnon(), `quiz_sessions/${S}/seats/${ANON_UID}`), {
        responseKey: STUDENT_UID,
      })
    );
    await assertFails(
      setDoc(doc(asStudent(), `quiz_sessions/${S}/seats/${OTHER_UID}`), {
        responseKey: STUDENT_UID,
      })
    );
  });

  it('takes a seat in the batch that creates the response', async () => {
    const db = asStudent(OTHER_UID, [CLASS_A]);
    const batch = writeBatch(db);
    batch.set(
      doc(db, `quiz_sessions/${S}/responses/${OTHER_UID}`),
      joinDoc(OTHER_UID, { classId: CLASS_A })
    );
    batch.set(doc(db, `quiz_sessions/${S}/seats/${OTHER_UID}`), {
      responseKey: OTHER_UID,
    });
    await assertSucceeds(batch.commit());
  });

  it('refuses extra fields on a seat and reads of another seat', async () => {
    await assertFails(
      setDoc(doc(asStudent(), `quiz_sessions/${S}/seats/${STUDENT_UID}`), {
        responseKey: STUDENT_UID,
        classId: CLASS_A,
      })
    );
    await seedSeat(S, OTHER_UID, STUDENT_UID);
    await assertFails(
      getDoc(doc(asStudent(), `quiz_sessions/${S}/seats/${OTHER_UID}`))
    );
  });
});
