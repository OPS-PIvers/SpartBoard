// Staff-audience sessions take only district staff (an active, non-student member doc), named from their own token, across all five assignment types.
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
  doc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import {
  NOT_STAFF_DISTRICT_EMAILS,
  seedDistrictStaff,
} from './districtStaffSeed';

const PROJECT_ID = 'spartboard-staff-audience';
const TEACHER_UID = 'teacher-uid-sa';
const STAFF_UID = 'staff-uid-sa';
const OTHER_UID = 'other-uid-sa';
const STAFF_EMAIL = 'pat.teacher@orono.k12.mn.us';
const STAFF_NAME = 'Pat Teacher';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asGoogle = (
  uid: string,
  email: string,
  opts: { verified?: boolean; name?: string } = {}
) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: opts.verified ?? true,
      name: opts.name ?? STAFF_NAME,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStaff = () => asGoogle(STAFF_UID, 'Pat.Teacher@orono.k12.mn.us');

const asAnon = () =>
  testEnv
    .authenticatedContext(STAFF_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asStudent = () =>
  testEnv
    .authenticatedContext(STAFF_UID, {
      studentRole: true,
      email: STAFF_EMAIL,
      email_verified: true,
      name: STAFF_NAME,
      classIds: [],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const staffFields = { staffEmail: STAFF_EMAIL, staffName: STAFF_NAME };

const seedMembers = (db: Firestore) => seedDistrictStaff(db, [STAFF_EMAIL]);
const notStaffGoogle = () =>
  NOT_STAFF_DISTRICT_EMAILS.map((email) => ({
    email,
    db: asGoogle(STAFF_UID, email),
  }));

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

interface Kind {
  name: string;
  collection: string;
  session: Record<string, unknown>;
  /** The joiner's own doc under the session. */
  sub: string;
  join: (uid: string) => Record<string, unknown>;
}

const KINDS: Kind[] = [
  {
    name: 'guided learning',
    collection: 'guided_learning_sessions',
    session: { teacherUid: TEACHER_UID, assignmentMode: 'submissions' },
    sub: 'responses',
    join: (uid) => ({
      sessionId: 's1',
      studentAnonymousId: uid,
      answers: [],
      startedAt: 1,
      completedAt: null,
      score: null,
    }),
  },
  {
    name: 'quiz',
    collection: 'quiz_sessions',
    session: {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      code: 'STAFF1',
    },
    sub: 'responses',
    join: (uid) => ({
      studentUid: uid,
      joinedAt: 1,
      status: 'joined',
      answers: [],
      score: null,
      submittedAt: null,
      completedAttempts: 0,
      preSyncVersion: 0,
    }),
  },
  {
    name: 'video activity',
    collection: 'video_activity_sessions',
    session: { teacherUid: TEACHER_UID, status: 'active', mode: 'submissions' },
    sub: 'responses',
    join: (uid) => ({
      studentUid: uid,
      joinedAt: 1,
      answers: [],
      completedAt: null,
      score: null,
      completedAttempts: 0,
      tabSwitchWarnings: 0,
    }),
  },
  {
    name: 'mini app',
    collection: 'mini_app_sessions',
    session: {
      teacherUid: TEACHER_UID,
      status: 'active',
      mode: 'submissions',
      submissionsEnabled: true,
    },
    sub: 'submissions',
    join: (uid) => ({ submittedAt: 1, studentUid: uid, payload: { a: 1 } }),
  },
  {
    name: 'flashcards',
    collection: 'flashcard_sessions',
    session: {
      teacherUid: TEACHER_UID,
      kind: 'study',
      status: 'active',
      classIds: [],
      classId: '',
      cards: [{ id: 'card-1', term: 'hola', definition: 'hello' }],
    },
    sub: 'progress',
    join: () => ({
      classId: '',
      cards: {},
      starred: [],
      round: 1,
      studyMs: 0,
      modesUsed: ['flashcards'],
      tests: [],
      lastActiveAt: 1,
    }),
  },
];

describe.each(KINDS)('$name: staff audience', (kind) => {
  const staffPath = `${kind.collection}/s1`;
  const studentPath = `${kind.collection}/s2`;
  const own = (session: string) => `${session}/${kind.sub}/${STAFF_UID}`;

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await seedMembers(db);
      await setDoc(doc(db, staffPath), { ...kind.session, audience: 'staff' });
      await setDoc(doc(db, studentPath), kind.session);
    });
  });

  it('lets signed-in district staff join, named from their token', async () => {
    await assertSucceeds(
      setDoc(doc(asStaff(), own(staffPath)), {
        ...kind.join(STAFF_UID),
        ...staffFields,
      })
    );
  });

  it('refuses a join without the staff name and email', async () => {
    await assertFails(
      setDoc(doc(asStaff(), own(staffPath)), kind.join(STAFF_UID))
    );
  });

  it('refuses a spoofed email or name', async () => {
    await assertFails(
      setDoc(doc(asStaff(), own(staffPath)), {
        ...kind.join(STAFF_UID),
        ...staffFields,
        staffEmail: 'someone.else@orono.k12.mn.us',
      })
    );
    await assertFails(
      setDoc(doc(asStaff(), own(staffPath)), {
        ...kind.join(STAFF_UID),
        ...staffFields,
        staffName: 'Someone Else',
      })
    );
  });

  it('refuses anonymous, student, outside and unverified accounts', async () => {
    const data = { ...kind.join(STAFF_UID), ...staffFields };
    await assertFails(setDoc(doc(asAnon(), own(staffPath)), data));
    await assertFails(setDoc(doc(asStudent(), own(staffPath)), data));
    await assertFails(
      setDoc(doc(asGoogle(STAFF_UID, 'pat@gmail.com'), own(staffPath)), {
        ...data,
        staffEmail: 'pat@gmail.com',
      })
    );
    await assertFails(
      setDoc(
        doc(
          asGoogle(STAFF_UID, STAFF_EMAIL, { verified: false }),
          own(staffPath)
        ),
        data
      )
    );
  });

  it('refuses a student Google account and inactive or student member docs', async () => {
    for (const { email, db } of notStaffGoogle()) {
      await assertFails(
        setDoc(doc(db, own(staffPath)), {
          ...kind.join(STAFF_UID),
          staffEmail: email,
          staffName: STAFF_NAME,
        })
      );
    }
  });

  it('refuses staff fields on a student session', async () => {
    await assertFails(
      setDoc(doc(asStaff(), own(studentPath)), {
        ...kind.join(STAFF_UID),
        ...staffFields,
      })
    );
  });

  it("refuses a join under someone else's id", async () => {
    await assertFails(
      setDoc(doc(asStaff(), `${staffPath}/${kind.sub}/${OTHER_UID}`), {
        ...kind.join(OTHER_UID),
        ...staffFields,
      })
    );
  });
});

describe('flashcards: staff session reads', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await seedMembers(db);
      await setDoc(doc(db, 'flashcard_sessions/s1'), {
        ...KINDS[4].session,
        audience: 'staff',
      });
      await setDoc(doc(db, 'flashcard_sessions/s2'), KINDS[4].session);
    });
  });

  it('lets district staff read a staff session only', async () => {
    await assertSucceeds(getDoc(doc(asStaff(), 'flashcard_sessions/s1')));
    await assertFails(getDoc(doc(asStaff(), 'flashcard_sessions/s2')));
    await assertFails(
      getDoc(doc(asGoogle(STAFF_UID, 'pat@gmail.com'), 'flashcard_sessions/s1'))
    );
    for (const { db } of notStaffGoogle()) {
      await assertFails(getDoc(doc(db, 'flashcard_sessions/s1')));
    }
  });
});

describe('flashcards: student joins and locked audience', () => {
  const session = { ...KINDS[4].session, classIds: ['c1'] };
  const progress = (session: string) =>
    `flashcard_sessions/${session}/progress/${STAFF_UID}`;
  const asClassStudent = (classIds: string[]) =>
    testEnv
      .authenticatedContext(STAFF_UID, {
        studentRole: true,
        classIds,
        firebase: { sign_in_provider: 'custom' },
      })
      .firestore();

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await seedMembers(db);
      await setDoc(doc(db, 'flashcard_sessions/s1'), {
        ...session,
        audience: 'staff',
      });
      await setDoc(doc(db, 'flashcard_sessions/s2'), session);
      await setDoc(doc(db, 'flashcard_sessions/s3'), {
        ...session,
        classIds: [],
      });
      await setDoc(doc(db, `student_assignments/${STAFF_UID}/items/s3`), {
        sessionId: 's3',
      });
    });
  });

  it('still takes a class student and a pointed-to student on a student session', async () => {
    await assertSucceeds(
      setDoc(
        doc(asClassStudent(['c1']), progress('s2')),
        KINDS[4].join(STAFF_UID)
      )
    );
    await assertSucceeds(
      setDoc(doc(asClassStudent([]), progress('s3')), KINDS[4].join(STAFF_UID))
    );
    await assertFails(
      setDoc(
        doc(asClassStudent(['c9']), progress('s2')),
        KINDS[4].join(STAFF_UID)
      )
    );
  });

  it('refuses a staff account on a student session', async () => {
    await assertFails(
      setDoc(doc(asStaff(), progress('s2')), KINDS[4].join(STAFF_UID))
    );
  });

  it('keeps staff fields fixed on a progress update', async () => {
    await assertSucceeds(
      setDoc(doc(asStaff(), progress('s1')), {
        ...KINDS[4].join(STAFF_UID),
        ...staffFields,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asStaff(), progress('s1')), { lastActiveAt: 2 })
    );
    await assertFails(
      updateDoc(doc(asStaff(), progress('s1')), { staffName: 'Someone Else' })
    );
  });

  it("refuses a teacher switching a session's audience", async () => {
    const teacher = asGoogle(TEACHER_UID, 'teacher@orono.k12.mn.us');
    await assertFails(
      updateDoc(doc(teacher, 'flashcard_sessions/s2'), { audience: 'staff' })
    );
    await assertFails(
      updateDoc(doc(teacher, 'flashcard_sessions/s1'), { audience: 'students' })
    );
    await assertSucceeds(
      updateDoc(doc(teacher, 'flashcard_sessions/s2'), { status: 'ended' })
    );
  });
});

describe('quiz: a student session still takes PIN joins', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quiz_sessions/s2'), KINDS[1].session);
    });
  });

  it('keys an anonymous join by PIN, not uid', async () => {
    const join = { ...KINDS[1].join(STAFF_UID), pin: '01', classPeriod: 'p1' };
    await assertSucceeds(
      setDoc(doc(asAnon(), 'quiz_sessions/s2/responses/pin-p1-01'), join)
    );
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'quiz_sessions/s2'), KINDS[1].session);
    });
    await assertFails(
      setDoc(doc(asAnon(), `quiz_sessions/s2/responses/${STAFF_UID}`), join)
    );
  });
});
