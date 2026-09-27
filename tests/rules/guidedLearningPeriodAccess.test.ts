// Firestore security-rules tests for per-period access on guided learning
// sessions (docs/plans/shipped/PER_PERIOD_ASSIGNMENT_ACCESS.md): the seat that names
// the student's period, the glOpen gate on responses and progress, and the
// hidden content doc. Requires a running Firestore emulator; invoke via
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
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gl-period-access-test';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const ADMIN_UID = 'admin-uid';
const ADMIN_EMAIL = 'admin@example.org';
const STUDENT_UID = 'student-uid';
const OTHER_UID = 'other-student-uid';
const ANON_UID = 'anon-uid';
const CLASS_A = 'class-A';
const CLASS_B = 'class-B';
const LOCAL_KEY = 'roster:local-1';

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

const sessionPath = (id: string) => `guided_learning_sessions/${id}`;
const seatPath = (id: string, uid: string) =>
  `guided_learning_sessions/${id}/seats/${uid}`;
const contentPath = (id: string) =>
  `guided_learning_sessions/${id}/content/steps`;
const responsePath = (id: string, uid: string) =>
  `guided_learning_sessions/${id}/responses/${uid}`;
const progressPath = (id: string, uid: string) =>
  `guided_learning_sessions/${id}/progress/${uid}`;

async function seedSession(
  id: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, sessionPath(id)), {
      teacherUid: TEACHER_UID,
      title: 'Cells',
      assignmentMode: 'submissions',
      classIds: [CLASS_A, CLASS_B],
      classId: CLASS_A,
      publicSteps: [],
      imageUrls: [],
      ...extra,
    });
    if ('periodAccess' in extra) {
      await setDoc(doc(db, contentPath(id)), {
        publicSteps: [{ id: 's1' }],
        imageUrls: ['https://img/1.png'],
      });
    }
  });
}

async function seedSeat(id: string, uid: string, classId: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), seatPath(id, uid)), { classId });
  });
}

async function seedResponse(id: string, uid: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), responsePath(id, uid)),
      response(id, uid)
    );
  });
}

const response = (id: string, uid: string, extra = {}) => ({
  sessionId: id,
  studentAnonymousId: uid,
  answers: [{ stepId: 's1', answer: 'a', isCorrect: null }],
  startedAt: 1000,
  completedAt: 2000,
  score: null,
  ...extra,
});

const progress = () => ({
  mode: 'try',
  modeSwitches: 0,
  furthestStepIdx: 1,
  completed: false,
  steps: {},
  startedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
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
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      email: ADMIN_EMAIL,
    });
  });
});

describe('seating a student on a per-period guided learning session', () => {
  const S = 'gl-seat';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  it('seats a signed-in student in their closed period', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), { classId: CLASS_A })
    );
  });

  it('refuses a period outside the caller claim', async () => {
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), { classId: CLASS_B })
    );
  });

  it('refuses a period the session does not target', async () => {
    await assertFails(
      setDoc(
        doc(
          asStudent(STUDENT_UID, [CLASS_A, 'class-Z']),
          seatPath(S, STUDENT_UID)
        ),
        { classId: 'class-Z' }
      )
    );
  });

  it('refuses a seat with no period', async () => {
    await assertFails(setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), {}));
  });

  it('refuses extra keys, answers included', async () => {
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), {
        classId: CLASS_A,
        answers: [],
      })
    );
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), {
        classId: CLASS_A,
        note: 'x',
      })
    );
  });

  it("refuses another student's seat", async () => {
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, OTHER_UID)), { classId: CLASS_A })
    );
  });

  it('refuses an anonymous PIN joiner in assessment mode', async () => {
    await assertFails(
      setDoc(doc(asAnon(), seatPath(S, ANON_UID)), { classId: CLASS_B })
    );
  });

  it('seats an anonymous PIN joiner in assignment mode', async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: {
        [CLASS_A]: period(),
        [LOCAL_KEY]: period({ label: 'P5', verified: false }),
      },
    });
    await assertSucceeds(
      setDoc(doc(asAnon(), seatPath(S, ANON_UID)), { classId: LOCAL_KEY })
    );
  });

  it('lets a student read only their own seat', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertSucceeds(getDoc(doc(asStudent(), seatPath(S, STUDENT_UID))));
    await assertFails(
      getDoc(doc(asStudent(OTHER_UID), seatPath(S, STUDENT_UID)))
    );
  });
});

describe('the content doc', () => {
  const S = 'gl-content';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  it('is hidden from a student seated in a closed period', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertFails(getDoc(doc(asStudent(), contentPath(S))));
  });

  it('is hidden from a student with no seat', async () => {
    await assertFails(getDoc(doc(asStudent(), contentPath(S))));
  });

  it('opens to a student seated in an open period', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_B);
    await assertSucceeds(
      getDoc(doc(asStudent(STUDENT_UID, [CLASS_B]), contentPath(S)))
    );
  });

  it('opens once the teacher starts the period', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertFails(getDoc(doc(asStudent(), contentPath(S))));
    await assertSucceeds(
      updateDoc(doc(asTeacher(), sessionPath(S)), {
        [`periodAccess.${CLASS_A}.state`]: 'open',
      })
    );
    await assertSucceeds(getDoc(doc(asStudent(), contentPath(S))));
  });

  it('stays hidden before a scheduled open and after the close grace', async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: {
        [CLASS_A]: period({ openAt: FUTURE }),
        [CLASS_B]: period({ closeAt: PAST }),
      },
    });
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await seedSeat(S, OTHER_UID, CLASS_B);
    await assertFails(getDoc(doc(asStudent(), contentPath(S))));
    await assertFails(
      getDoc(doc(asStudent(OTHER_UID, [CLASS_B]), contentPath(S)))
    );
  });

  it('opens to a student let in now, until the pass runs out', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
      studentAccess: { [STUDENT_UID]: FUTURE, [OTHER_UID]: PAST },
    });
    await seedSeat(S, OTHER_UID, CLASS_A);
    await assertSucceeds(getDoc(doc(asStudent(), contentPath(S))));
    await assertFails(getDoc(doc(asStudent(OTHER_UID), contentPath(S))));
  });

  it('stays readable to a student who finished, after their period closes', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertFails(getDoc(doc(asStudent(), contentPath(S))));
    await seedResponse(S, STUDENT_UID);
    await assertSucceeds(getDoc(doc(asStudent(), contentPath(S))));
    await assertFails(getDoc(doc(asStudent(OTHER_UID), contentPath(S))));
  });

  it('is always readable by the teacher and an admin', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), contentPath(S))));
    await assertSucceeds(getDoc(doc(asAdmin(), contentPath(S))));
    await assertFails(
      getDoc(doc(asTeacher(OTHER_TEACHER_UID), contentPath(S)))
    );
  });

  it('is written by the teacher with the session in one batch, and by no one else', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(doc(db, sessionPath('gl-new')), {
      teacherUid: TEACHER_UID,
      title: 'New',
      publicSteps: [],
      imageUrls: [],
      stepsInContent: true,
      periodAccess: { [CLASS_A]: period() },
    });
    batch.set(doc(db, contentPath('gl-new')), {
      publicSteps: [{ id: 's1' }],
      imageUrls: [],
    });
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(doc(asStudent(), contentPath(S)), { publicSteps: [] })
    );
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), contentPath(S)), {
        publicSteps: [],
      })
    );
  });
});

describe('responses and progress on a per-period session', () => {
  const S = 'gl-writes';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  const b = () => asStudent(STUDENT_UID, [CLASS_B]);

  it('refuses a finished response while the seat names a closed period', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertFails(
      setDoc(
        doc(asStudent(), responsePath(S, STUDENT_UID)),
        response(S, STUDENT_UID, { classId: CLASS_A })
      )
    );
  });

  it('refuses a response with no seat', async () => {
    await assertFails(
      setDoc(doc(b(), responsePath(S, STUDENT_UID)), response(S, STUDENT_UID))
    );
  });

  it('takes a response, classId included, while the period is open', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_B);
    await assertSucceeds(
      setDoc(
        doc(b(), responsePath(S, STUDENT_UID)),
        response(S, STUDENT_UID, { classId: CLASS_B })
      )
    );
  });

  it('takes a response from a student let in past a closed period', async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
      studentAccess: { [STUDENT_UID]: FUTURE },
    });
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertSucceeds(
      setDoc(
        doc(asStudent(), responsePath(S, STUDENT_UID)),
        response(S, STUDENT_UID)
      )
    );
  });

  it('refuses a response update once the period is paused, and takes it when open', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_B);
    await seedResponse(S, STUDENT_UID);
    const next = {
      answers: [
        { stepId: 's1', answer: 'a', isCorrect: null },
        { stepId: 's2', answer: 'b', isCorrect: null },
      ],
    };
    await assertSucceeds(
      updateDoc(doc(b(), responsePath(S, STUDENT_UID)), next)
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), sessionPath(S)), {
        [`periodAccess.${CLASS_B}.state`]: 'paused',
      });
    });
    await assertFails(
      updateDoc(doc(b(), responsePath(S, STUDENT_UID)), {
        answers: [
          ...next.answers,
          { stepId: 's3', answer: 'c', isCorrect: null },
        ],
      })
    );
  });

  it('holds progress writes while the period is shut and takes them when open', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await seedSeat(S, OTHER_UID, CLASS_B);
    await assertFails(
      setDoc(doc(asStudent(), progressPath(S, STUDENT_UID)), progress())
    );
    await assertSucceeds(
      setDoc(
        doc(asStudent(OTHER_UID, [CLASS_B]), progressPath(S, OTHER_UID)),
        progress()
      )
    );
  });

  it('lets the teacher read responses and progress regardless of period', async () => {
    await seedResponse(S, STUDENT_UID);
    await assertSucceeds(
      getDoc(doc(asTeacher(), responsePath(S, STUDENT_UID)))
    );
  });
});

describe('a legacy guided learning session', () => {
  const S = 'gl-legacy';

  beforeEach(async () => {
    await seedSession(S);
  });

  it('takes a response and progress with no seat', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), responsePath(S, STUDENT_UID)),
        response(S, STUDENT_UID)
      )
    );
    await assertSucceeds(
      setDoc(doc(asStudent(), progressPath(S, STUDENT_UID)), progress())
    );
    await assertSucceeds(
      setDoc(doc(asAnon(), responsePath(S, ANON_UID)), response(S, ANON_UID))
    );
  });

  it('still reads the session doc for anyone signed in', async () => {
    await assertSucceeds(getDoc(doc(asAnon(), sessionPath(S))));
  });
});
