// Firestore security-rules tests for per-period access on flashcard sessions
// (docs/plans/PER_PERIOD_ASSIGNMENT_ACCESS.md): the empty-cards create, the
// seat that names the student's period, the fcOpen gate on progress and the
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
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-fc-period-access-test';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const STUDENT_UID = 'student-uid';
const OTHER_UID = 'other-student-uid';
const CLASS_A = 'class-A';
const CLASS_B = 'class-B';

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

const asStudent = (uid = STUDENT_UID, classIds = [CLASS_A]) =>
  testEnv
    .authenticatedContext(uid, {
      email: '',
      studentRole: true,
      orgId: 'orono',
      classIds,
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const period = (over: Record<string, unknown> = {}) => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

const CARDS = [{ id: 'card-1', term: 'hola', definition: 'hello' }];

const sessionPath = (id: string) => `flashcard_sessions/${id}`;
const seatPath = (id: string, uid: string) =>
  `flashcard_sessions/${id}/seats/${uid}`;
const contentPath = (id: string) => `flashcard_sessions/${id}/content/cards`;
const progressPath = (id: string, uid: string) =>
  `flashcard_sessions/${id}/progress/${uid}`;

const sessionDoc = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  teacherUid: TEACHER_UID,
  setId: 'set-1',
  title: 'Spanish 1',
  kind: 'study',
  termLanguage: 'es-US',
  definitionLanguage: 'en-US',
  cards: CARDS,
  classIds: [CLASS_A, CLASS_B],
  classId: CLASS_A,
  status: 'active',
  createdAt: 1,
  ...extra,
});

async function seedSession(
  id: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const perPeriod = 'periodAccess' in extra;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(
      doc(db, sessionPath(id)),
      sessionDoc(
        id,
        perPeriod ? { cards: [], cardsInContent: true, ...extra } : extra
      )
    );
    if (perPeriod) await setDoc(doc(db, contentPath(id)), { cards: CARDS });
  });
}

async function seedSeat(id: string, uid: string, classId: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), seatPath(id, uid)), { classId });
  });
}

const progress = (classId = CLASS_A, over: Record<string, unknown> = {}) => ({
  classId,
  cards: { 'card-1': { s: 1, due: 2, c: 1, w: 0 } },
  starred: [],
  round: 1,
  studyMs: 1000,
  modesUsed: ['flashcards'],
  tests: [],
  lastActiveAt: 1,
  ...over,
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
});

describe('creating a per-period flashcard session', () => {
  it('takes empty cards with the content doc in one batch', async () => {
    const db = asTeacher();
    const batch = writeBatch(db);
    batch.set(
      doc(db, sessionPath('fc-new')),
      sessionDoc('fc-new', {
        cards: [],
        cardsInContent: true,
        accessMode: 'assessment',
        periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
      })
    );
    batch.set(doc(db, contentPath('fc-new')), { cards: CARDS });
    await assertSucceeds(batch.commit());
  });

  it('refuses empty cards without cardsInContent', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), sessionPath('fc-empty')),
        sessionDoc('fc-empty', { cards: [] })
      )
    );
  });

  it('refuses a content write from a student or another teacher', async () => {
    await seedSession('fc-c', { periodAccess: { [CLASS_A]: period() } });
    await assertFails(
      setDoc(doc(asStudent(), contentPath('fc-c')), { cards: [] })
    );
    await assertFails(
      setDoc(doc(asTeacher(OTHER_TEACHER_UID), contentPath('fc-c')), {
        cards: [],
      })
    );
  });
});

describe('seating a student on a per-period flashcard session', () => {
  const S = 'fc-seat';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  it('seats a student in their closed period', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), { classId: CLASS_A })
    );
  });

  it('refuses a period outside the caller claim or the session, and extra keys', async () => {
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
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, STUDENT_UID)), {
        classId: CLASS_A,
        note: 'x',
      })
    );
  });

  it("refuses another student's seat and lets a student read only their own", async () => {
    await assertFails(
      setDoc(doc(asStudent(), seatPath(S, OTHER_UID)), { classId: CLASS_A })
    );
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertSucceeds(getDoc(doc(asStudent(), seatPath(S, STUDENT_UID))));
    await assertFails(
      getDoc(doc(asStudent(OTHER_UID), seatPath(S, STUDENT_UID)))
    );
  });
});

describe('the flashcard content doc', () => {
  const S = 'fc-content';

  beforeEach(async () => {
    await seedSession(S, {
      accessMode: 'assessment',
      periodAccess: {
        [CLASS_A]: period({ state: 'closed' }),
        [CLASS_B]: period({ label: 'P3' }),
      },
    });
  });

  it('is hidden from a student with no seat or seated in a closed period', async () => {
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

  it('stays readable to a student who submitted a Check, after their period closes', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), progressPath(S, OTHER_UID)),
        progress(CLASS_A)
      );
      await setDoc(
        doc(ctx.firestore(), progressPath(S, STUDENT_UID)),
        progress(CLASS_A, { submittedAt: 5, score: 1, total: 1 })
      );
    });
    await seedSeat(S, OTHER_UID, CLASS_A);
    await assertSucceeds(getDoc(doc(asStudent(), contentPath(S))));
    await assertFails(getDoc(doc(asStudent(OTHER_UID), contentPath(S))));
  });

  it('is always readable by the teacher, not another teacher', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), contentPath(S))));
    await assertFails(
      getDoc(doc(asTeacher(OTHER_TEACHER_UID), contentPath(S)))
    );
  });

  it('is deleted by the teacher before the session', async () => {
    await assertSucceeds(deleteDoc(doc(asTeacher(), contentPath(S))));
    await assertSucceeds(deleteDoc(doc(asTeacher(), sessionPath(S))));
  });
});

describe('progress on a per-period flashcard session', () => {
  const S = 'fc-writes';

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

  it('refuses progress while the seat names a closed period', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertFails(
      setDoc(doc(asStudent(), progressPath(S, STUDENT_UID)), progress())
    );
  });

  it('refuses progress with no seat', async () => {
    await assertFails(
      setDoc(doc(b(), progressPath(S, STUDENT_UID)), progress(CLASS_B))
    );
  });

  it('takes progress while the period is open, and refuses it once paused', async () => {
    await seedSeat(S, STUDENT_UID, CLASS_B);
    await assertSucceeds(
      setDoc(doc(b(), progressPath(S, STUDENT_UID)), progress(CLASS_B))
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), sessionPath(S)), {
        [`periodAccess.${CLASS_B}.state`]: 'paused',
      });
    });
    await assertFails(
      setDoc(
        doc(b(), progressPath(S, STUDENT_UID)),
        progress(CLASS_B, { round: 2 })
      )
    );
  });

  it('takes progress from a student let in past a closed period', async () => {
    await seedSession(S, {
      accessMode: 'assignment',
      periodAccess: { [CLASS_A]: period({ state: 'closed' }) },
      studentAccess: { [STUDENT_UID]: FUTURE },
    });
    await seedSeat(S, STUDENT_UID, CLASS_A);
    await assertSucceeds(
      setDoc(doc(asStudent(), progressPath(S, STUDENT_UID)), progress())
    );
  });

  it('lets the teacher read progress and write the gate regardless of period', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), progressPath(S, STUDENT_UID)),
        progress()
      );
    });
    await assertSucceeds(
      getDoc(doc(asTeacher(), progressPath(S, STUDENT_UID)))
    );
    await assertSucceeds(
      updateDoc(doc(asTeacher(), sessionPath(S)), {
        [`studentAccess.${STUDENT_UID}`]: FUTURE,
      })
    );
  });
});

describe('a legacy flashcard session', () => {
  const S = 'fc-legacy';

  beforeEach(async () => {
    await seedSession(S);
  });

  it('takes progress with no seat', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent(), progressPath(S, STUDENT_UID)), progress())
    );
  });

  it('still lets a class student read the session', async () => {
    await assertSucceeds(getDoc(doc(asStudent(), sessionPath(S))));
  });
});
