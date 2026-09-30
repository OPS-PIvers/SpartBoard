// Firestore security-rules regression for the gradebook data model (docs/plans/GRADEBOOK.md).
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gradebook-rules';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const ORG = 'orono';
const TEACHER = 'teacher-uid';
const OTHER = 'other-teacher-uid';
const STUDENT = 'student-uid';
const ADMIN = 'admin-uid';
const PLC = 'plc-gradebook';
const SESSION = 'quiz-session-1';
const OTHER_SESSION = 'quiz-session-2';
const MARK_ID = `${SESSION}__${STUDENT}`;

let testEnv: RulesTestEnvironment;

const teacherDb = () =>
  testEnv
    .authenticatedContext(TEACHER, {
      email: 'teacher@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const otherDb = () =>
  testEnv
    .authenticatedContext(OTHER, {
      email: 'other@elsewhere.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const adminDb = () =>
  testEnv
    .authenticatedContext(ADMIN, {
      email: 'admin@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const studentDb = (uid = STUDENT) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const mark = (overrides: Record<string, unknown> = {}) => ({
  kind: 'quiz',
  sessionId: SESSION,
  studentUid: STUDENT,
  ownerUid: TEACHER,
  editorUids: [],
  rosterIds: ['roster-1'],
  override: { points: 9, at: 1 },
  comment: { text: 'Nice work', shared: false, at: 1 },
  flags: ['late'],
  suppressedAuto: [],
  publishOverride: null,
  updatedAt: 1,
  ...overrides,
});

const column = (overrides: Record<string, unknown> = {}) => ({
  kind: 'quiz',
  sessionId: SESSION,
  ownerUid: TEACHER,
  editorUids: [],
  category: null,
  countsTowardOverall: true,
  maxPointsOverride: null,
  attemptPolicy: 'latest',
  targets: [],
  hiddenInRosterIds: [],
  updatedAt: 1,
  ...overrides,
});

const settingsBody = {
  name: 'My settings',
  flags: [],
  categoriesEnabled: false,
  categories: [],
  scale: { source: 'district' },
  method: 'decaying',
  studentVisibility: {
    scores: true,
    flags: true,
    comments: true,
    standards: false,
  },
  autoFlags: true,
  updatedAt: 1,
};

const history = (overrides: Record<string, unknown> = {}) => ({
  ownerUid: TEACHER,
  byUid: TEACHER,
  at: 2,
  field: 'override',
  before: null,
  after: { points: 9 },
  batchId: null,
  ...overrides,
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
    await setDoc(doc(db, 'admins/admin@example.com'), { email: 'admin' });
    await setDoc(doc(db, `organizations/${ORG}/members/admin@example.com`), {
      roleId: 'domain_admin',
    });
    await setDoc(doc(db, `organizations/${ORG}/members/teacher@example.com`), {
      roleId: 'teacher',
      buildingIds: ['middle'],
    });
    await setDoc(doc(db, `quiz_sessions/${SESSION}`), { teacherUid: TEACHER });
    await setDoc(doc(db, `quiz_sessions/${OTHER_SESSION}`), {
      teacherUid: OTHER,
    });
    await setDoc(doc(db, `grade_index/${MARK_ID}`), {
      ownerUid: TEACHER,
      rosterIds: ['roster-1'],
      kind: 'quiz',
      sessionId: SESSION,
      studentUid: STUDENT,
    });
    await setDoc(doc(db, `plcs/${PLC}`), {
      leadUid: TEACHER,
      memberUids: [TEACHER, OTHER],
      members: { [TEACHER]: { role: 'lead' }, [OTHER]: { role: 'member' } },
    });
    await setDoc(doc(db, `student_grades/${STUDENT}/classes/class-1`), {
      studentUid: STUDENT,
      entries: {},
    });
    await setDoc(doc(db, 'admin_settings/gradebook'), {
      proficient: 80,
      approaching: 60,
      levelNames: ['Proficient', 'Approaching', 'Beginning'],
      updatedAt: 1,
    });
  });
});

describe('grade_index', () => {
  it('lets the owner get and query their rows', async () => {
    await assertSucceeds(getDoc(doc(teacherDb(), `grade_index/${MARK_ID}`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(teacherDb(), 'grade_index'),
          where('ownerUid', '==', TEACHER),
          where('rosterIds', 'array-contains', 'roster-1')
        )
      )
    );
  });

  it("denies other teachers and students the owner's rows", async () => {
    await assertFails(getDoc(doc(otherDb(), `grade_index/${MARK_ID}`)));
    await assertFails(getDoc(doc(studentDb(), `grade_index/${MARK_ID}`)));
    await assertFails(
      getDocs(
        query(
          collection(otherDb(), 'grade_index'),
          where('ownerUid', '==', TEACHER)
        )
      )
    );
  });

  it('denies every client write', async () => {
    await assertFails(
      setDoc(doc(teacherDb(), 'grade_index/x__y'), { ownerUid: TEACHER })
    );
    await assertFails(deleteDoc(doc(teacherDb(), `grade_index/${MARK_ID}`)));
  });
});

describe('gradebook_marks', () => {
  it('lets the session owner create, update, read and query a mark', async () => {
    const db = teacherDb();
    await assertSucceeds(setDoc(doc(db, `gradebook_marks/${MARK_ID}`), mark()));
    await assertSucceeds(
      updateDoc(doc(db, `gradebook_marks/${MARK_ID}`), {
        flags: ['missing'],
        publishOverride: 'published',
        updatedAt: 2,
      })
    );
    await assertSucceeds(getDoc(doc(db, `gradebook_marks/${MARK_ID}`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'gradebook_marks'),
          where('ownerUid', '==', TEACHER),
          where('rosterIds', 'array-contains', 'roster-1')
        )
      )
    );
  });

  it("refuses a mark on another teacher's session", async () => {
    await assertFails(
      setDoc(
        doc(teacherDb(), `gradebook_marks/${OTHER_SESSION}__${STUDENT}`),
        mark({ sessionId: OTHER_SESSION })
      )
    );
  });

  it('refuses a mismatched id, a spoofed owner, editors or bad fields', async () => {
    const db = teacherDb();
    await assertFails(
      setDoc(doc(db, `gradebook_marks/${SESSION}__someone`), mark())
    );
    await assertFails(
      setDoc(doc(db, `gradebook_marks/${MARK_ID}`), mark({ ownerUid: OTHER }))
    );
    await assertFails(
      setDoc(
        doc(db, `gradebook_marks/${MARK_ID}`),
        mark({ editorUids: [OTHER] })
      )
    );
    await assertFails(
      setDoc(
        doc(db, `gradebook_marks/${MARK_ID}`),
        mark({ publishOverride: 'always' })
      )
    );
    await assertFails(
      setDoc(doc(db, `gradebook_marks/${MARK_ID}`), mark({ extra: true }))
    );
    await assertFails(
      setDoc(
        doc(db, `gradebook_marks/${MARK_ID}`),
        mark({ kind: 'not-a-kind' })
      )
    );
  });

  it('keeps identity fields fixed and hides marks from others', async () => {
    await assertSucceeds(
      setDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}`), mark())
    );
    await assertFails(
      updateDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}`), {
        ownerUid: OTHER,
      })
    );
    await assertFails(
      updateDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}`), {
        studentUid: 'someone',
      })
    );
    await assertFails(getDoc(doc(otherDb(), `gradebook_marks/${MARK_ID}`)));
    await assertFails(getDoc(doc(studentDb(), `gradebook_marks/${MARK_ID}`)));
    await assertFails(
      updateDoc(doc(otherDb(), `gradebook_marks/${MARK_ID}`), { flags: [] })
    );
    await assertFails(deleteDoc(doc(otherDb(), `gradebook_marks/${MARK_ID}`)));
    await assertSucceeds(
      deleteDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}`))
    );
  });

  it('refuses a studentRole caller', async () => {
    await assertFails(
      setDoc(doc(studentDb(TEACHER), `gradebook_marks/${MARK_ID}`), mark())
    );
  });
});

describe('gradebook_marks history', () => {
  it('appends an entry in the same batch as the mark', async () => {
    const db = teacherDb();
    const batch = writeBatch(db);
    batch.set(doc(db, `gradebook_marks/${MARK_ID}`), mark());
    batch.set(doc(db, `gradebook_marks/${MARK_ID}/history/h1`), history());
    await assertSucceeds(batch.commit());
    await assertSucceeds(
      getDoc(doc(db, `gradebook_marks/${MARK_ID}/history/h1`))
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `gradebook_marks/${MARK_ID}/history`),
          where('ownerUid', '==', TEACHER)
        )
      )
    );
  });

  it('is append-only and owner-only', async () => {
    await assertSucceeds(
      setDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}`), mark())
    );
    await assertSucceeds(
      setDoc(
        doc(teacherDb(), `gradebook_marks/${MARK_ID}/history/h1`),
        history()
      )
    );
    await assertFails(
      updateDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}/history/h1`), {
        at: 3,
      })
    );
    await assertFails(
      deleteDoc(doc(teacherDb(), `gradebook_marks/${MARK_ID}/history/h1`))
    );
    await assertFails(
      getDoc(doc(otherDb(), `gradebook_marks/${MARK_ID}/history/h1`))
    );
    await assertFails(
      setDoc(
        doc(otherDb(), `gradebook_marks/${MARK_ID}/history/h2`),
        history({ ownerUid: OTHER, byUid: OTHER })
      )
    );
    await assertFails(
      setDoc(
        doc(teacherDb(), `gradebook_marks/${MARK_ID}/history/h3`),
        history({ byUid: OTHER })
      )
    );
  });
});

describe('gradebook_columns', () => {
  it('lets the session owner set up a column', async () => {
    const db = teacherDb();
    await assertSucceeds(
      setDoc(doc(db, `gradebook_columns/${SESSION}`), column())
    );
    await assertSucceeds(
      updateDoc(doc(db, `gradebook_columns/${SESSION}`), {
        attemptPolicy: 'highest',
        maxPointsOverride: 20,
      })
    );
    await assertSucceeds(getDoc(doc(db, `gradebook_columns/${SESSION}`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, 'gradebook_columns'),
          where('ownerUid', '==', TEACHER)
        )
      )
    );
  });

  it("refuses another teacher's session, bad values and outside reads", async () => {
    await assertFails(
      setDoc(
        doc(teacherDb(), `gradebook_columns/${OTHER_SESSION}`),
        column({ sessionId: OTHER_SESSION })
      )
    );
    await assertFails(
      setDoc(
        doc(teacherDb(), `gradebook_columns/${SESSION}`),
        column({ attemptPolicy: 'best' })
      )
    );
    await assertFails(
      setDoc(
        doc(teacherDb(), `gradebook_columns/${SESSION}`),
        column({ maxPointsOverride: 0 })
      )
    );
    await assertSucceeds(
      setDoc(doc(teacherDb(), `gradebook_columns/${SESSION}`), column())
    );
    await assertFails(getDoc(doc(otherDb(), `gradebook_columns/${SESSION}`)));
    await assertFails(
      updateDoc(doc(teacherDb(), `gradebook_columns/${SESSION}`), {
        sessionId: OTHER_SESSION,
      })
    );
  });
});

describe('personal settings and class state', () => {
  it('is owner-only', async () => {
    const path = `users/${TEACHER}/gradebook_settings/cfg-1`;
    await assertSucceeds(
      setDoc(doc(teacherDb(), path), {
        ...settingsBody,
        ownerUid: TEACHER,
        editorUids: [],
        isDefault: true,
      })
    );
    await assertSucceeds(getDoc(doc(teacherDb(), path)));
    await assertFails(getDoc(doc(otherDb(), path)));
    await assertFails(
      setDoc(doc(teacherDb(), path), {
        ...settingsBody,
        ownerUid: TEACHER,
        editorUids: [],
        method: 'median',
      })
    );

    const classPath = `users/${TEACHER}/gradebook_classes/roster-1`;
    const classState = {
      rosterId: 'roster-1',
      ownerUid: TEACHER,
      editorUids: [],
      configRef: { source: 'personal', configId: 'cfg-1' },
      sort: null,
      nameFormat: 'last-first',
      cellFormat: 'percent',
      cardLayouts: {},
      updatedAt: 1,
    };
    await assertSucceeds(setDoc(doc(teacherDb(), classPath), classState));
    await assertSucceeds(getDoc(doc(teacherDb(), classPath)));
    await assertFails(getDoc(doc(otherDb(), classPath)));
    await assertFails(
      setDoc(doc(teacherDb(), classPath), { ...classState, rosterId: 'x' })
    );
  });
});

describe('PLC gradebook settings', () => {
  const path = `plcs/${PLC}/meta/gradebookSettings`;
  it('lets the lead write and members read', async () => {
    await assertSucceeds(
      setDoc(doc(teacherDb(), path), { ...settingsBody, updatedBy: TEACHER })
    );
    await assertSucceeds(getDoc(doc(otherDb(), path)));
    await assertFails(getDoc(doc(adminDb(), path)));
  });

  it('refuses members who are not leads', async () => {
    await assertFails(
      setDoc(doc(otherDb(), path), { ...settingsBody, updatedBy: OTHER })
    );
    await assertFails(deleteDoc(doc(otherDb(), path)));
  });
});

describe('district configurations and grading periods', () => {
  const district = {
    ...settingsBody,
    orgId: ORG,
    buildingIds: ['middle'],
    isDefault: true,
  };
  const periods = {
    name: 'Middle school quarters',
    orgId: ORG,
    buildingIds: ['middle'],
    periods: [
      { id: 'q1', label: 'Q1', start: '2026-09-02', end: '2026-11-06' },
    ],
    updatedAt: 1,
  };

  it('lets org admins write and org teachers read and query', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'gradebook_district_configs/d1'), district)
    );
    await assertSucceeds(
      setDoc(doc(adminDb(), 'grading_period_sets/p1'), periods)
    );
    await assertSucceeds(
      getDoc(doc(teacherDb(), 'gradebook_district_configs/d1'))
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(teacherDb(), 'gradebook_district_configs'),
          where('orgId', '==', ORG)
        )
      )
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(teacherDb(), 'grading_period_sets'),
          where('orgId', '==', ORG)
        )
      )
    );
  });

  it('refuses teachers writing and outsiders reading', async () => {
    await assertFails(
      setDoc(doc(teacherDb(), 'gradebook_district_configs/d2'), district)
    );
    await assertFails(
      setDoc(doc(teacherDb(), 'grading_period_sets/p2'), periods)
    );
    await assertSucceeds(
      setDoc(doc(adminDb(), 'gradebook_district_configs/d1'), district)
    );
    await assertFails(getDoc(doc(otherDb(), 'gradebook_district_configs/d1')));
    await assertFails(
      getDoc(doc(studentDb(), 'gradebook_district_configs/d1'))
    );
    await assertFails(
      setDoc(doc(adminDb(), 'gradebook_district_configs/d3'), {
        ...district,
        orgId: 'other-org',
      })
    );
  });
});

describe('admin_settings/gradebook', () => {
  it('lets teachers read and only admins write', async () => {
    await assertSucceeds(getDoc(doc(teacherDb(), 'admin_settings/gradebook')));
    await assertFails(getDoc(doc(studentDb(), 'admin_settings/gradebook')));
    await assertFails(
      updateDoc(doc(teacherDb(), 'admin_settings/gradebook'), {
        proficient: 90,
      })
    );
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'admin_settings/gradebook'), { proficient: 90 })
    );
  });
});

describe('student_grades', () => {
  const path = `student_grades/${STUDENT}/classes/class-1`;
  it('lets only that student read their projection', async () => {
    await assertSucceeds(getDoc(doc(studentDb(), path)));
    await assertSucceeds(
      getDocs(collection(studentDb(), `student_grades/${STUDENT}/classes`))
    );
    await assertFails(getDoc(doc(studentDb('another-student'), path)));
    await assertFails(getDoc(doc(teacherDb(), path)));
  });

  it('serves the Grades tab reads and nothing wider', async () => {
    await assertSucceeds(
      getDoc(doc(studentDb(), 'global_permissions/student-gradebook'))
    );
    await assertFails(
      getDocs(
        collection(
          studentDb('another-student'),
          `student_grades/${STUDENT}/classes`
        )
      )
    );
    await assertFails(getDoc(doc(studentDb(), `student_grades/${STUDENT}`)));
    const pinStudent = testEnv
      .authenticatedContext(STUDENT, {
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();
    await assertFails(getDoc(doc(pinStudent, path)));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), path))
    );
  });

  it('denies every client write', async () => {
    await assertFails(setDoc(doc(studentDb(), path), { entries: {} }));
    await assertFails(setDoc(doc(teacherDb(), path), { entries: {} }));
  });
});
