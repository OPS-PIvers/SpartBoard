// Firestore security-rules tests for per-period access on mini-app sessions
// (docs/plans/shipped/PER_PERIOD_ASSIGNMENT_ACCESS.md): the seat that names the
// student's period, the maOpen gate on submissions, the teacher's gate writes
// and the hidden content doc. Requires a running Firestore emulator; invoke
// via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-ma-period-access-test';
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

const sessionPath = (id: string) => `mini_app_sessions/${id}`;
const seatPath = (id: string, uid: string) =>
  `mini_app_sessions/${id}/seats/${uid}`;
const contentPath = (id: string) => `mini_app_sessions/${id}/content/app`;
const submissionPath = (id: string, docId: string) =>
  `mini_app_sessions/${id}/submissions/${docId}`;

async function seedSession(
  id: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, sessionPath(id)), {
      teacherUid: TEACHER_UID,
      appId: 'app-1',
      appTitle: 'Fractions',
      appHtml: '',
      assignmentName: 'Fractions',
      status: 'active',
      mode: 'submissions',
      submissionsEnabled: true,
      classIds: [CLASS_A, CLASS_B],
      ...extra,
    });
    if ('periodAccess' in extra) {
      await setDoc(doc(db, contentPath(id)), { appHtml: '<html>app</html>' });
    }
  });
}

async function seedSeat(id: string, uid: string, classId: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), seatPath(id, uid)), { classId });
  });
}

const submission = (uid: string) => ({
  submittedAt: 1000,
  studentUid: uid,
  payload: { score: 3 },
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

describe('seating a student on a per-period mini-app session', () => {
  const S = 'ma-seat';

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

  it('refuses a period outside the caller claim or the session', async () => {
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), { classId: CLASS_B })
    );
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

  it('refuses extra keys and another student’s seat', async () => {
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), {
        classId: CLASS_A,
        note: 'x',
      })
    );
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, OTHER_UID)), { classId: CLASS_A })
    );
  });

  it('refuses an anonymous student in assessment mode', async () => {
    await assertFails(
      setDoc(doc(asAnon(), seatPath(S, ANON_UID)), { classId: CLASS_B })
    );
  });

  it('seats an anonymous student in assignment mode', async () => {
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

describe('the mini-app content doc', () => {
  const S = 'ma-content';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  it('is hidden from a student seated in a closed period or with no seat', async () => {
    await assertFails(getDoc(doc(asStudent(), contentPath(S))));
    await seedSeat(S, STUDENT_UID, CLASS_A);
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
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
      studentAccess: { [STUDENT_UID]: FUTURE, [OTHER_UID]: PAST },
    });
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await seedSeat(S, OTHER_UID, CLASS_A);
    await assertSucceeds(getDoc(doc(asStudent(), contentPath(S))));
    await assertFails(getDoc(doc(asStudent(OTHER_UID), contentPath(S))));
  });

  it('is always readable by the teacher and an admin, not another teacher', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), contentPath(S))));
    await assertSucceeds(getDoc(doc(asAdmin(), contentPath(S))));
    await assertFails(
      getDoc(doc(asTeacher(OTHER_TEACHER_UID), contentPath(S)))
    );
  });

  it('is written by the teacher with the session in one batch, and by no one else', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(doc(db, sessionPath('ma-new')), {
      teacherUid: TEACHER_UID,
      appId: 'app-1',
      appTitle: 'Fractions',
      appHtml: '',
      appInContent: true,
      assignmentName: 'Fractions',
      status: 'active',
      periodAccess: { [CLASS_A]: period() },
    });
    batch.set(doc(db, contentPath('ma-new')), { appHtml: '<html>app</html>' });
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(doc(asStudent(), contentPath(S)), { appHtml: 'x' })
    );
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), contentPath(S)), {
        appHtml: 'x',
      })
    );
  });
});

describe('gate writes on a mini-app session', () => {
  const S = 'ma-gate';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
    });
  });

  it('lets the owner start, pause and let a student in', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), sessionPath(S)), {
        [`periodAccess.${CLASS_A}.state`]: 'open',
        [`periodAccess.${CLASS_A}.closeAt`]: FUTURE,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), sessionPath(S)), {
        [`periodAccess.${CLASS_A}.state`]: 'paused',
        [`periodAccess.${CLASS_A}.pausedAt`]: PAST,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), sessionPath(S)), {
        [`studentAccess.${STUDENT_UID}`]: FUTURE,
      })
    );
  });

  it('refuses gate writes from another teacher or a student', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(OTHER_TEACHER_UID), sessionPath(S)), {
        [`periodAccess.${CLASS_A}.state`]: 'open',
      })
    );
    await assertFails(
      updateDoc(doc(asStudent(), sessionPath(S)), {
        [`studentAccess.${STUDENT_UID}`]: FUTURE,
      })
    );
  });

  it('still refuses the owner a change to the app itself', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), sessionPath(S)), { appHtml: '<html>x</html>' })
    );
  });
});

describe('submissions on a per-period mini-app session', () => {
  const S = 'ma-writes';

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

  it('refuses a submission while the seat names a closed period', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath(S, 'ps-1')),
        submission(STUDENT_UID)
      )
    );
  });

  it('refuses a submission with no seat', async () => {
    await assertFails(
      setDoc(doc(b(), submissionPath(S, 'ps-1')), submission(STUDENT_UID))
    );
  });

  it('takes a submission while the period is open, and refuses it once paused', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_B);
    await assertSucceeds(
      setDoc(doc(b(), submissionPath(S, 'ps-1')), submission(STUDENT_UID))
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), sessionPath(S)), {
        [`periodAccess.${CLASS_B}.state`]: 'paused',
      });
    });
    await assertFails(
      setDoc(doc(b(), submissionPath(S, 'ps-1')), {
        ...submission(STUDENT_UID),
        submittedAt: 2000,
      })
    );
  });

  it('takes an anonymous student’s submission in their open period', async () => {
    await seedSeat(S, ANON_UID, CLASS_B);
    await assertSucceeds(
      setDoc(doc(asAnon(), submissionPath(S, ANON_UID)), submission(ANON_UID))
    );
  });

  it('takes a submission from a student let in past a closed period', async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
      studentAccess: { [STUDENT_UID]: FUTURE },
    });
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath(S, 'ps-1')),
        submission(STUDENT_UID)
      )
    );
  });
});

describe('a legacy mini-app session', () => {
  const S = 'ma-legacy';

  beforeEach(async () => {
    await seedSession(S, { appHtml: '<html>legacy</html>' });
  });

  it('takes a submission with no seat', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath(S, 'ps-1')),
        submission(STUDENT_UID)
      )
    );
    await assertSucceeds(
      setDoc(doc(asAnon(), submissionPath(S, ANON_UID)), submission(ANON_UID))
    );
  });

  it('still reads the session doc for anyone signed in', async () => {
    await assertSucceeds(getDoc(doc(asAnon(), sessionPath(S))));
  });
});
