// Rules for the gradebook admin, PLC and district surfaces (GRADEBOOK.md D16-D18).
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
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-gradebook-admin-rules';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

const ORG = 'orono';
const PLC = 'plc-gradebook';
const LEAD = 'lead-uid';
const CO_LEAD = 'co-lead-uid';
const MEMBER = 'member-uid';
const VIEWER = 'viewer-uid';
const OUTSIDER = 'outsider-uid';
const ADMIN = 'admin-uid';

let testEnv: RulesTestEnvironment;

const dbFor = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();
const adminDb = () => dbFor(ADMIN, 'admin@example.com');
const leadDb = () => dbFor(LEAD, 'lead@example.com');
const coLeadDb = () => dbFor(CO_LEAD, 'colead@example.com');
const memberDb = () => dbFor(MEMBER, 'member@example.com');
const viewerDb = () => dbFor(VIEWER, 'viewer@example.com');
const outsiderDb = () => dbFor(OUTSIDER, 'outsider@elsewhere.com');
const studentDb = () =>
  testEnv
    .authenticatedContext('student-uid', {
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const settingsBody = {
  name: 'Grade 8 ELA',
  flags: [],
  categoriesEnabled: false,
  categories: [],
  scale: { source: 'plc', plcId: PLC },
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
const district = {
  ...settingsBody,
  scale: { source: 'district' },
  orgId: ORG,
  buildingIds: ['middle'],
  isDefault: false,
};
const periods = {
  name: 'Middle school quarters',
  orgId: ORG,
  buildingIds: ['middle'],
  periods: [{ id: 'q1', label: 'Q1', start: '2026-09-02', end: '2026-11-06' }],
  updatedAt: 1,
};
const PLC_SET = `plcs/${PLC}/meta/gradebookSettings`;
const PLC_TARGETS = `plcs/${PLC}/meta/learningTargets`;

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
    for (const email of [
      'lead@example.com',
      'colead@example.com',
      'member@example.com',
      'viewer@example.com',
    ]) {
      await setDoc(doc(db, `organizations/${ORG}/members/${email}`), {
        roleId: 'teacher',
        buildingIds: ['middle'],
      });
    }
    await setDoc(doc(db, `plcs/${PLC}`), {
      leadUid: LEAD,
      memberUids: [LEAD, CO_LEAD, MEMBER, VIEWER],
      members: {
        [LEAD]: { role: 'lead' },
        [CO_LEAD]: { role: 'coLead' },
        [MEMBER]: { role: 'member' },
        [VIEWER]: { role: 'viewer' },
      },
    });
    await setDoc(doc(db, PLC_SET), { ...settingsBody, updatedBy: LEAD });
    await setDoc(doc(db, PLC_TARGETS), {
      targets: [],
      masteryCutoffs: { proficient: 80, approaching: 60 },
      updatedAt: 1,
    });
    await setDoc(doc(db, 'grading_period_sets/p1'), periods);
    await setDoc(doc(db, 'gradebook_district_configs/d1'), district);
    await setDoc(doc(db, 'admin_settings/gradebook'), {
      proficient: 80,
      approaching: 60,
      levelNames: ['Proficient', 'Approaching', 'Beginning'],
      updatedAt: 1,
    });
  });
});

describe('PLC Gradebook subsection', () => {
  it('lets every member and viewer read the shared set', async () => {
    await assertSucceeds(getDoc(doc(memberDb(), PLC_SET)));
    await assertSucceeds(getDoc(doc(viewerDb(), PLC_SET)));
    await assertFails(getDoc(doc(outsiderDb(), PLC_SET)));
    await assertFails(getDoc(doc(studentDb(), PLC_SET)));
  });

  it('lets the lead and co-leads edit and stop sharing it', async () => {
    await assertSucceeds(
      setDoc(doc(coLeadDb(), PLC_SET), {
        ...settingsBody,
        method: 'mean',
        updatedBy: CO_LEAD,
      })
    );
    await assertSucceeds(deleteDoc(doc(leadDb(), PLC_SET)));
    await assertSucceeds(
      setDoc(doc(leadDb(), PLC_SET), { ...settingsBody, updatedBy: LEAD })
    );
  });

  it('keeps members and viewers read-only', async () => {
    await assertFails(
      setDoc(doc(memberDb(), PLC_SET), { ...settingsBody, updatedBy: MEMBER })
    );
    await assertFails(
      setDoc(doc(viewerDb(), PLC_SET), { ...settingsBody, updatedBy: VIEWER })
    );
    await assertFails(deleteDoc(doc(memberDb(), PLC_SET)));
    await assertFails(
      setDoc(doc(coLeadDb(), PLC_SET), { ...settingsBody, updatedBy: LEAD })
    );
  });

  it('edits the PLC cutoffs in place on learningTargets', async () => {
    await assertSucceeds(
      updateDoc(doc(leadDb(), PLC_TARGETS), {
        masteryCutoffs: { proficient: 85, approaching: 70 },
        updatedAt: 2,
      })
    );
    await assertSucceeds(getDoc(doc(viewerDb(), PLC_TARGETS)));
    await assertFails(
      updateDoc(doc(leadDb(), PLC_TARGETS), {
        masteryCutoffs: { proficient: 60, approaching: 70 },
        updatedAt: 3,
      })
    );
    await assertFails(
      updateDoc(doc(viewerDb(), PLC_TARGETS), {
        masteryCutoffs: { proficient: 90, approaching: 70 },
        updatedAt: 3,
      })
    );
  });
});

describe('grading period sets', () => {
  it('lets org teachers read and admins edit and delete', async () => {
    await assertSucceeds(getDoc(doc(memberDb(), 'grading_period_sets/p1')));
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'grading_period_sets/p1'), {
        buildingIds: ['middle', 'high'],
        updatedAt: 2,
      })
    );
    await assertSucceeds(deleteDoc(doc(adminDb(), 'grading_period_sets/p1')));
  });

  it('refuses teachers, outsiders and bad shapes', async () => {
    await assertFails(getDoc(doc(outsiderDb(), 'grading_period_sets/p1')));
    await assertFails(
      getDocs(
        query(
          collection(outsiderDb(), 'grading_period_sets'),
          where('orgId', '==', ORG)
        )
      )
    );
    await assertFails(
      updateDoc(doc(leadDb(), 'grading_period_sets/p1'), { name: 'x' })
    );
    await assertFails(deleteDoc(doc(leadDb(), 'grading_period_sets/p1')));
    await assertFails(
      setDoc(doc(adminDb(), 'grading_period_sets/p2'), {
        ...periods,
        periods: Array.from({ length: 13 }, (_, i) => ({ id: `p${i}` })),
      })
    );
    await assertFails(
      setDoc(doc(adminDb(), 'grading_period_sets/p2'), {
        ...periods,
        extra: true,
      })
    );
  });
});

describe('district configurations', () => {
  it('lets admins set a default and delete', async () => {
    await assertSucceeds(
      updateDoc(doc(adminDb(), 'gradebook_district_configs/d1'), {
        isDefault: true,
        updatedAt: 2,
      })
    );
    await assertSucceeds(
      deleteDoc(doc(adminDb(), 'gradebook_district_configs/d1'))
    );
  });

  it('refuses teacher edits and non-boolean defaults', async () => {
    await assertSucceeds(
      getDoc(doc(memberDb(), 'gradebook_district_configs/d1'))
    );
    await assertFails(
      updateDoc(doc(leadDb(), 'gradebook_district_configs/d1'), {
        isDefault: true,
      })
    );
    await assertFails(
      deleteDoc(doc(leadDb(), 'gradebook_district_configs/d1'))
    );
    await assertFails(
      updateDoc(doc(adminDb(), 'gradebook_district_configs/d1'), {
        isDefault: 'yes',
      })
    );
  });
});

describe('admin_settings/gradebook', () => {
  it('lets admins replace the district scale and signed-out users read nothing', async () => {
    await assertSucceeds(
      setDoc(doc(adminDb(), 'admin_settings/gradebook'), {
        proficient: 85,
        approaching: 65,
        levelNames: ['Meets', 'Nearly', 'Not yet'],
        updatedAt: 2,
      })
    );
    await assertSucceeds(getDoc(doc(memberDb(), 'admin_settings/gradebook')));
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'admin_settings/gradebook'
        )
      )
    );
  });
});
