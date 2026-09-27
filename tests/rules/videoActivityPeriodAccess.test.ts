// Firestore security-rules tests for per-period access on video activity
// sessions (docs/plans/shipped/PER_PERIOD_ASSIGNMENT_ACCESS.md): the join rules, the
// periodOpen / studentLetIn gate on response writes, and the hidden content
// and seats docs. Requires a running Firestore emulator; invoke via
// `pnpm run test:rules`.

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

const PROJECT_ID = 'spartboard-va-period-access-test';
const TEACHER_UID = 'teacher-uid';
const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@example.org';
const SUB_UID = 'sub-uid';
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

const asTeacher = (uid = TEACHER_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.org`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
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

const asAnon = (uid = ANON_UID) =>
  testEnv
    .authenticatedContext(uid, {
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
    await setDoc(doc(ctx.firestore(), `video_activity_sessions/${id}`), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
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
      doc(
        ctx.firestore(),
        `video_activity_sessions/${sessionId}/responses/${key}`
      ),
      {
        joinedAt: 1000,
        score: null,
        answers: [],
        completedAt: null,
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
      doc(ctx.firestore(), `video_activity_sessions/${sessionId}/seats/${uid}`),
      { responseKey }
    );
  });
}

const joinDoc = (uid: string, extra: Record<string, unknown> = {}) => ({
  studentUid: uid,
  joinedAt: 1000,
  score: null,
  answers: [],
  completedAt: null,
  completedAttempts: 0,
  tabSwitchWarnings: 0,
  ...extra,
});

const answer = { questionId: 'q1', answer: 'A', answeredAt: 1 };

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

describe('joining a per-period video activity', () => {
  const S = 'va-join';
  const respRef = (db: ReturnType<typeof asStudent>, key: string) =>
    doc(db, `video_activity_sessions/${S}/responses/${key}`);

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

  it('takes the anonymous PIN key in assignment mode, with a period only', async () => {
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

  it('leaves joins on a legacy session without periodAccess unchanged', async () => {
    await seedSession('va-legacy');
    await assertSucceeds(
      setDoc(
        doc(
          asStudent(),
          `video_activity_sessions/va-legacy/responses/${STUDENT_UID}`
        ),
        joinDoc(STUDENT_UID)
      )
    );
    await assertSucceeds(
      setDoc(
        doc(
          asAnon(),
          `video_activity_sessions/va-legacy/responses/${ANON_KEY}`
        ),
        joinDoc(ANON_UID, { pin: '1234', classPeriod: 'P5' })
      )
    );
  });
});

describe('answer writes on a per-period video activity', () => {
  const S = 'va-answers';
  const resp = () =>
    doc(asStudent(), `video_activity_sessions/${S}/responses/${STUDENT_UID}`);
  const writeAnswer = () => updateDoc(resp(), { answers: [answer] });

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

  it('refuses finishing while closed', async () => {
    await withPeriod({ state: 'closed' });
    await assertFails(updateDoc(resp(), { completedAt: 5 }));
    await assertFails(updateDoc(resp(), { completedAttempts: increment(1) }));
  });

  it('takes finishing while open', async () => {
    await withPeriod({});
    await assertSucceeds(
      updateDoc(resp(), {
        answers: [answer],
        completedAt: 5,
        completedAttempts: increment(1),
      })
    );
  });

  it('still takes tab-switch bumps while closed', async () => {
    await withPeriod({ state: 'closed' });
    await assertSucceeds(
      updateDoc(resp(), { tabSwitchWarnings: increment(1) })
    );
  });

  it('refuses a rejoin reset while closed, since it clears answers', async () => {
    await seedResponse(S, STUDENT_UID, {
      studentUid: STUDENT_UID,
      classId: CLASS_A,
      answers: [answer],
      completedAt: 5,
      completedAttempts: 1,
    });
    await withPeriod({ state: 'closed' });
    await assertFails(updateDoc(resp(), { answers: [], completedAt: null }));
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
    await seedResponse(S, STUDENT_UID, { studentUid: STUDENT_UID });
    await assertFails(writeAnswer());
  });

  it('refuses moving the response to another period', async () => {
    await withPeriod({ state: 'closed' });
    await assertFails(updateDoc(resp(), { classId: CLASS_B }));
  });

  it('leaves answer writes on a legacy session unchanged', async () => {
    await seedSession(S);
    await seedResponse(S, STUDENT_UID, { studentUid: STUDENT_UID });
    await assertSucceeds(writeAnswer());
  });
});

describe('content and seats', () => {
  const S = 'va-content';
  const contentPath = `video_activity_sessions/${S}/content/questions`;
  const seatPath = (uid: string) => `video_activity_sessions/${S}/seats/${uid}`;

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
      await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
        email: ADMIN_EMAIL,
      });
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

  it('lets an admin read it', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), contentPath)));
  });

  it('refuses another teacher reading or writing it', async () => {
    await assertFails(getDoc(doc(asTeacher('other-teacher'), contentPath)));
    await assertFails(
      setDoc(doc(asTeacher('other-teacher'), contentPath), {
        publicQuestions: [],
      })
    );
  });

  it('lets a monitoring sub read it until the share expires', async () => {
    await withPeriod(
      { state: 'closed' },
      { subMonitorUids: [SUB_UID], subMonitorUntil: FUTURE }
    );
    await assertSucceeds(getDoc(doc(asTeacher(SUB_UID), contentPath)));
    await withPeriod(
      { state: 'closed' },
      { subMonitorUids: [SUB_UID], subMonitorUntil: PAST }
    );
    await assertFails(getDoc(doc(asTeacher(SUB_UID), contentPath)));
  });

  it('lets the teacher write it in the batch that creates the session', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(doc(db, 'video_activity_sessions/new-session'), {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
    });
    batch.set(
      doc(db, 'video_activity_sessions/new-session/content/questions'),
      {
        publicQuestions: [],
      }
    );
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

  it('shows it to a student once the teacher ends the activity, for their review', async () => {
    await seedSeat(S, STUDENT_UID, STUDENT_UID);
    await withPeriod({ state: 'closed' }, { status: 'ended' });
    await assertSucceeds(getDoc(doc(asStudent(), contentPath)));
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
      setDoc(doc(asAnon(), seatPath(ANON_UID)), { responseKey: ANON_KEY })
    );
    await assertSucceeds(getDoc(doc(asAnon(), contentPath)));
  });

  it('refuses a seat pointing at another student response', async () => {
    await assertFails(
      setDoc(doc(asAnon(), seatPath(ANON_UID)), { responseKey: STUDENT_UID })
    );
    await assertFails(
      setDoc(doc(asStudent(), seatPath(OTHER_UID)), {
        responseKey: STUDENT_UID,
      })
    );
  });

  it('takes a seat in the batch that creates the response', async () => {
    const db = asStudent(OTHER_UID, [CLASS_A]);
    const batch = writeBatch(db);
    batch.set(
      doc(db, `video_activity_sessions/${S}/responses/${OTHER_UID}`),
      joinDoc(OTHER_UID, { classId: CLASS_A })
    );
    batch.set(doc(db, seatPath(OTHER_UID)), { responseKey: OTHER_UID });
    await assertSucceeds(batch.commit());
  });

  it('lets a student read only their own seat and refuses extra fields', async () => {
    await seedSeat(S, STUDENT_UID, STUDENT_UID);
    await assertSucceeds(getDoc(doc(asStudent(), seatPath(STUDENT_UID))));
    await assertFails(
      setDoc(doc(asStudent(), seatPath(STUDENT_UID)), {
        responseKey: STUDENT_UID,
        classId: CLASS_A,
      })
    );
    await seedSeat(S, OTHER_UID, STUDENT_UID);
    await assertFails(getDoc(doc(asStudent(), seatPath(OTHER_UID))));
  });
});
