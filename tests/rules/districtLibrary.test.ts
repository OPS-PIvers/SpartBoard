// District library rules (docs/plans/QUIZ_MCA_PRACTICE.md M26-M30): site-admin writes, targeted staff reads,
// district-only access and admin-only edits of district canonicals. Run with `pnpm run test:rules`.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
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
} from 'firebase/firestore';
import { seedDistrictStaff, STUDENT_GOOGLE_EMAIL } from './districtStaffSeed';

const PROJECT_ID = 'spartboard-district-library';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const ADMIN_EMAIL = 'site.admin@orono.k12.mn.us';
const ADMIN_UID = 'admin-uid';
const ADMIN2_EMAIL = 'second.admin@orono.k12.mn.us';
const ADMIN2_UID = 'admin2-uid';
const BUILDING_ADMIN_EMAIL = 'building.admin@orono.k12.mn.us';
const MIDDLE_EMAIL = 'middle.teacher@orono.k12.mn.us';
const MIDDLE_UID = 'middle-uid';
const HIGH_EMAIL = 'high.teacher@orono.k12.mn.us';
const HIGH_UID = 'high-uid';
const NAMED_EMAIL = 'named.teacher@orono.k12.mn.us';
const NAMED_UID = 'named-uid';
const GRADE8_EMAIL = 'grade8.teacher@orono.k12.mn.us';
const GRADE8_UID = 'grade8-uid';

let testEnv: RulesTestEnvironment;

const as = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();
const asAdmin = () => as(ADMIN_UID, ADMIN_EMAIL);
const asAdmin2 = () => as(ADMIN2_UID, ADMIN2_EMAIL);
const asMiddle = () => as(MIDDLE_UID, MIDDLE_EMAIL);
const asHigh = () => as(HIGH_UID, HIGH_EMAIL);
const asNamed = () => as(NAMED_UID, NAMED_EMAIL);
const asGrade8 = () => as(GRADE8_UID, GRADE8_EMAIL);
const asOutsider = () => as('outsider-uid', 'someone@example.com');
const asStudent = () => as('student-uid', STUDENT_GOOGLE_EMAIL);
const asAnon = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  kind: 'bank',
  title: 'Grade 8 science: Phenomenon 1',
  questionCount: 4,
  status: 'published',
  everyone: false,
  targetBuildings: ['middle', 'orono-middle-school'],
  targetGrades: [],
  targetEmails: [],
  gradeBuildings: [],
  syncGroupId: 'bank-group-1',
  contentVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  updatedBy: ADMIN_UID,
  ...overrides,
});

const bankCanonical = (overrides: Record<string, unknown> = {}) => ({
  id: 'bank-group-1',
  ownerUid: ADMIN_UID,
  plcIds: [],
  version: 1,
  title: 'Grade 8 science: Phenomenon 1',
  questions: [],
  questionCount: 0,
  targetIds: [],
  targetCounts: {},
  createdAt: 1,
  updatedAt: 1,
  districtItemId: 'item-1',
  ...overrides,
});

const quizCanonical = (overrides: Record<string, unknown> = {}) => ({
  id: 'quiz-group-1',
  version: 1,
  title: 'Practice test',
  questions: [],
  participants: { [ADMIN_UID]: { joinedAt: 1 } },
  createdAt: 1,
  updatedAt: 1,
  updatedBy: ADMIN_UID,
  districtItemId: 'item-2',
  ...overrides,
});

// A teacher's own team canonical: no district mark.
const teamCanonical = (id: string) => {
  const data: Record<string, unknown> = quizCanonical({
    id,
    participants: { [MIDDLE_UID]: { joinedAt: 1 } },
    updatedBy: MIDDLE_UID,
  });
  delete data.districtItemId;
  return data;
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await seedDistrictStaff(db, [
      ADMIN_EMAIL,
      ADMIN2_EMAIL,
      BUILDING_ADMIN_EMAIL,
      MIDDLE_EMAIL,
      HIGH_EMAIL,
      NAMED_EMAIL,
      GRADE8_EMAIL,
    ]);
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), { addedAt: 1 });
    await setDoc(doc(db, `admins/${ADMIN2_EMAIL}`), { addedAt: 1 });
    // A building admin mirrored from org membership is an admin but not a site admin.
    await setDoc(doc(db, `admins/${BUILDING_ADMIN_EMAIL}`), {
      source: 'organizationMembersSync',
      orgId: 'orono',
      roleId: 'building_admin',
    });
    await setDoc(doc(db, `users/${MIDDLE_UID}/userProfile/profile`), {
      selectedBuildings: ['middle'],
      gradesTaught: [],
    });
    await setDoc(doc(db, `users/${HIGH_UID}/userProfile/profile`), {
      selectedBuildings: ['high'],
      gradesTaught: [],
    });
    await setDoc(doc(db, `users/${NAMED_UID}/userProfile/profile`), {
      selectedBuildings: ['high'],
    });
    await setDoc(doc(db, `users/${GRADE8_UID}/userProfile/profile`), {
      selectedBuildings: ['high'],
      gradesTaught: ['8'],
    });
    await setDoc(doc(db, 'district_library/item-1'), item());
    await setDoc(
      doc(db, 'district_library/draft-1'),
      item({ id: 'draft-1', status: 'draft', everyone: true })
    );
    await setDoc(
      doc(db, 'district_library/named-1'),
      item({
        id: 'named-1',
        targetBuildings: [],
        targetEmails: [NAMED_EMAIL],
      })
    );
    await setDoc(
      doc(db, 'district_library/grade-1'),
      item({
        id: 'grade-1',
        targetBuildings: [],
        targetGrades: ['8'],
        gradeBuildings: ['middle', 'orono-middle-school'],
      })
    );
    await setDoc(doc(db, 'district_library_index/published'), {
      items: {
        'item-1': {
          everyone: false,
          targetBuildings: ['middle'],
          targetGrades: [],
          gradeBuildings: [],
        },
      },
      updatedAt: 1,
    });
    await setDoc(
      doc(db, 'synced_question_banks/bank-group-1'),
      bankCanonical()
    );
    await setDoc(doc(db, 'synced_quizzes/quiz-group-1'), quizCanonical());
  });
});

describe('district_library reads', () => {
  it('a teacher in a targeted building reads the item', async () => {
    await assertSucceeds(getDoc(doc(asMiddle(), 'district_library/item-1')));
  });

  it('a teacher in another building cannot', async () => {
    await assertFails(getDoc(doc(asHigh(), 'district_library/item-1')));
  });

  it('a named teacher reads their item and finds it by query', async () => {
    await assertSucceeds(getDoc(doc(asNamed(), 'district_library/named-1')));
    await assertSucceeds(
      getDocs(
        query(
          collection(asNamed(), 'district_library'),
          where('targetEmails', 'array-contains', NAMED_EMAIL),
          where('status', '==', 'published')
        )
      )
    );
    await assertFails(getDoc(doc(asHigh(), 'district_library/named-1')));
  });

  it('grades match picked grades, and buildings that teach the grade when none are picked', async () => {
    await assertSucceeds(getDoc(doc(asGrade8(), 'district_library/grade-1')));
    await assertSucceeds(getDoc(doc(asMiddle(), 'district_library/grade-1')));
    await assertFails(getDoc(doc(asHigh(), 'district_library/grade-1')));
  });

  it('drafts are admin-only, even when they target everyone', async () => {
    await assertFails(getDoc(doc(asMiddle(), 'district_library/draft-1')));
    await assertSucceeds(getDoc(doc(asAdmin(), 'district_library/draft-1')));
  });

  it('nobody outside district staff reads anything (M30)', async () => {
    for (const db of [asOutsider(), asStudent(), asAnon()]) {
      await assertFails(getDoc(doc(db, 'district_library/item-1')));
      await assertFails(getDoc(doc(db, 'district_library_index/published')));
    }
  });

  it('teachers cannot list the whole collection; admins can', async () => {
    await assertFails(getDocs(collection(asMiddle(), 'district_library')));
    await assertSucceeds(getDocs(collection(asAdmin(), 'district_library')));
  });

  it('district staff read the index doc', async () => {
    await assertSucceeds(
      getDoc(doc(asMiddle(), 'district_library_index/published'))
    );
  });
});

describe('district_library writes', () => {
  it('a site admin creates, updates and deletes items', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAdmin(), 'district_library/new-1'),
        item({ id: 'new-1', status: 'draft' })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asAdmin(), 'district_library/new-1'),
        item({ id: 'new-1', status: 'published', everyone: true })
      )
    );
    await assertSucceeds(deleteDoc(doc(asAdmin(), 'district_library/new-1')));
  });

  it('teachers and building admins cannot write', async () => {
    await assertFails(
      setDoc(
        doc(asMiddle(), 'district_library/new-2'),
        item({ id: 'new-2', updatedBy: MIDDLE_UID })
      )
    );
    await assertFails(
      setDoc(
        doc(
          as('building-admin-uid', BUILDING_ADMIN_EMAIL),
          'district_library/new-3'
        ),
        item({ id: 'new-3', updatedBy: 'building-admin-uid' })
      )
    );
    await assertFails(deleteDoc(doc(asMiddle(), 'district_library/item-1')));
  });

  it('rejects unknown keys, a wrong id and someone else as updatedBy', async () => {
    await assertFails(
      setDoc(
        doc(asAdmin(), 'district_library/new-4'),
        item({ id: 'new-4', publicShareUrl: 'x' })
      )
    );
    await assertFails(
      setDoc(doc(asAdmin(), 'district_library/new-5'), item({ id: 'other' }))
    );
    await assertFails(
      setDoc(
        doc(asAdmin(), 'district_library/new-6'),
        item({ id: 'new-6', updatedBy: MIDDLE_UID })
      )
    );
  });

  it('only a site admin writes the index doc, and only the published one', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'district_library_index/published'), {
        items: {},
        updatedAt: 2,
      })
    );
    await assertFails(
      setDoc(doc(asAdmin(), 'district_library_index/other'), { items: {} })
    );
    await assertFails(
      setDoc(doc(asMiddle(), 'district_library_index/published'), {
        items: {},
        updatedAt: 2,
      })
    );
  });
});

describe('district canonicals', () => {
  it('a second site admin corrects a bank and a quiz they did not create', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin2(), 'synced_question_banks/bank-group-1'), {
        version: 2,
        title: 'Corrected',
        updatedAt: 2,
      })
    );
    await assertSucceeds(
      updateDoc(doc(asAdmin2(), 'synced_quizzes/quiz-group-1'), {
        version: 2,
        title: 'Corrected',
        updatedAt: 2,
        updatedBy: ADMIN2_UID,
      })
    );
  });

  it('teachers read canonicals but never edit them', async () => {
    await assertSucceeds(
      getDoc(doc(asMiddle(), 'synced_question_banks/bank-group-1'))
    );
    await assertSucceeds(
      getDoc(doc(asMiddle(), 'synced_quizzes/quiz-group-1'))
    );
    await assertFails(
      updateDoc(doc(asMiddle(), 'synced_question_banks/bank-group-1'), {
        version: 2,
        updatedAt: 2,
      })
    );
    await assertFails(
      updateDoc(doc(asMiddle(), 'synced_quizzes/quiz-group-1'), {
        version: 2,
        updatedAt: 2,
        updatedBy: MIDDLE_UID,
      })
    );
  });

  it('the district mark cannot be added, changed or removed by an update', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), 'synced_question_banks/bank-group-1'), {
        version: 2,
        updatedAt: 2,
        districtItemId: 'other',
      })
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'synced_quizzes/teacher-group'),
        teamCanonical('teacher-group')
      );
    });
    await assertFails(
      updateDoc(doc(asMiddle(), 'synced_quizzes/teacher-group'), {
        version: 2,
        updatedAt: 2,
        updatedBy: MIDDLE_UID,
        districtItemId: 'item-2',
      })
    );
  });

  it('a teacher the item does not target cannot learn its syncGroupId from anything they can read', async () => {
    // HIGH_UID teaches at the high school; item-1 targets the middle school.
    const high = asHigh();
    await assertFails(getDoc(doc(high, 'district_library/item-1')));
    await assertFails(getDocs(collection(high, 'district_library')));
    await assertFails(
      getDocs(
        query(
          collection(high, 'district_library'),
          where('status', '==', 'published')
        )
      )
    );
    const index = await assertSucceeds(
      getDoc(doc(high, 'district_library_index/published'))
    );
    expect(JSON.stringify(index.data())).not.toContain('bank-group-1');
    // Drafts are hidden from every teacher, including ones they would target.
    await assertFails(getDoc(doc(asMiddle(), 'district_library/draft-1')));
  });

  it('the canonical id and kind are fixed once the draft exists', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), 'district_library/item-1'), {
        syncGroupId: 'guessable',
        updatedAt: 3,
        updatedBy: ADMIN_UID,
      })
    );
    await assertFails(
      updateDoc(doc(asAdmin(), 'district_library/item-1'), {
        kind: 'quiz',
        updatedAt: 3,
        updatedBy: ADMIN_UID,
      })
    );
  });

  it('only a site admin creates a canonical carrying the district mark', async () => {
    await assertFails(
      setDoc(
        doc(asMiddle(), 'synced_quizzes/new-group'),
        quizCanonical({
          id: 'new-group',
          participants: { [MIDDLE_UID]: { joinedAt: 1 } },
          updatedBy: MIDDLE_UID,
        })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asAdmin(), 'synced_quizzes/district-item-2'),
        quizCanonical({ id: 'district-item-2' })
      )
    );
  });

  it('the uploader loses write access with their admin doc, as participant and as owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`));
    });
    await assertFails(
      updateDoc(doc(asAdmin(), 'synced_quizzes/quiz-group-1'), {
        version: 2,
        title: 'Changed',
        updatedAt: 2,
        updatedBy: ADMIN_UID,
      })
    );
    await assertFails(
      updateDoc(doc(asAdmin(), 'synced_question_banks/bank-group-1'), {
        version: 2,
        title: 'Changed',
        updatedAt: 2,
      })
    );
    await assertFails(
      deleteDoc(doc(asAdmin(), 'synced_question_banks/bank-group-1'))
    );
  });

  it('a teacher listed as a participant still cannot edit a district canonical', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'synced_quizzes/quiz-group-1'),
        quizCanonical({ participants: { [MIDDLE_UID]: { joinedAt: 1 } } })
      );
    });
    await assertFails(
      updateDoc(doc(asMiddle(), 'synced_quizzes/quiz-group-1'), {
        version: 2,
        updatedAt: 2,
        updatedBy: MIDDLE_UID,
      })
    );
  });

  it('even the owning site admin cannot delete a district bank', async () => {
    await assertFails(
      deleteDoc(doc(asAdmin(), 'synced_question_banks/bank-group-1'))
    );
  });

  it("a participant still edits their own team's canonical", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'synced_quizzes/team-group'),
        teamCanonical('team-group')
      );
    });
    await assertSucceeds(
      updateDoc(doc(asMiddle(), 'synced_quizzes/team-group'), {
        version: 2,
        updatedAt: 2,
        updatedBy: MIDDLE_UID,
      })
    );
  });
});

describe('teacher bank links', () => {
  const link = {
    itemId: 'item-1',
    kind: 'bank',
    syncGroupId: 'bank-group-1',
    ownerUid: ADMIN_UID,
    title: 'Grade 8 science: Phenomenon 1',
    questionCount: 4,
    targetIds: [],
    addedAt: 1,
  };

  it('a teacher writes and removes their own links only', async () => {
    await assertSucceeds(
      setDoc(doc(asMiddle(), `users/${MIDDLE_UID}/district_links/item-1`), link)
    );
    await assertSucceeds(
      deleteDoc(doc(asMiddle(), `users/${MIDDLE_UID}/district_links/item-1`))
    );
    await assertFails(
      setDoc(doc(asHigh(), `users/${MIDDLE_UID}/district_links/item-1`), link)
    );
    await assertFails(
      setDoc(doc(asMiddle(), `users/${MIDDLE_UID}/district_links/item-1`), {
        ...link,
        questions: [],
      })
    );
  });
});
