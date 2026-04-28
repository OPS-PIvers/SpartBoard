// Firestore security-rules tests for /users/{uid}/dashboards/{dashboardId}.
//
// Covers the studentRole denial added alongside the AppContent + DashboardContext
// guards: a token carrying `studentRole: true` (minted by `studentLoginV1`)
// must not be able to read or write under any user's dashboards subcollection,
// even their own. Teachers retain full access to their own dashboards and
// remain locked out of other users'.
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
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-dashboards-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const STUDENT_UID = 'student-uid-1';
const ANON_UID = 'anon-pin-uid';
const DASHBOARD_ID = 'dash-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

// Token-shape note: the rules engine in the emulator throws "Property X is
// undefined" on direct claim access when the claim is missing, even behind a
// short-circuit. Spell out every claim the rules touch so test contexts
// match the production token surface — see studentRoleClassGate.test.ts for
// the full justification.

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asOtherTeacher = () =>
  testEnv
    .authenticatedContext(OTHER_TEACHER_UID, {
      email: 'other.teacher@school.edu',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudentRoleSelf = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asStudentRoleAttackerOnTeacher = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnonPin = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      email: '',
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const teacherDashboardPath = `users/${TEACHER_UID}/dashboards/${DASHBOARD_ID}`;
const studentDashboardPath = `users/${STUDENT_UID}/dashboards/${DASHBOARD_ID}`;

const dashboardFields = () => ({
  id: DASHBOARD_ID,
  name: 'My Board',
  background: 'bg-slate-900',
  widgets: [],
  createdAt: 1000,
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
  // Seed an existing dashboard under the teacher's uid so read/update/delete
  // paths can be exercised. Bypasses rules so the seed itself is not the
  // thing under test.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), teacherDashboardPath), dashboardFields());
  });
});

// ---------------------------------------------------------------------------
// Teacher (non-studentRole) — full access to own, denied on others
// ---------------------------------------------------------------------------

describe('/users/{uid}/dashboards — teacher access', () => {
  it('teacher can read their own dashboard', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), teacherDashboardPath)));
  });

  it('teacher can create a dashboard under their own uid', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), `users/${TEACHER_UID}/dashboards/dash-2`), {
        ...dashboardFields(),
        id: 'dash-2',
      })
    );
  });

  it('teacher can update their own dashboard', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), teacherDashboardPath), {
        ...dashboardFields(),
        name: 'Renamed',
      })
    );
  });

  it('teacher can delete their own dashboard', async () => {
    await assertSucceeds(deleteDoc(doc(asTeacher(), teacherDashboardPath)));
  });

  it("teacher cannot read another user's dashboard", async () => {
    await assertFails(getDoc(doc(asOtherTeacher(), teacherDashboardPath)));
  });

  it("teacher cannot write to another user's dashboard", async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), teacherDashboardPath), {
        ...dashboardFields(),
        name: 'Hijacked',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// studentRole — denied even on their own uid
// ---------------------------------------------------------------------------

describe('/users/{uid}/dashboards — studentRole denial', () => {
  it('studentRole user cannot read a dashboard under their own uid', async () => {
    // Seed a dashboard at the student's uid so the read has a doc to find.
    // Without this we cannot distinguish "rule denied" from "no doc here".
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), studentDashboardPath),
        dashboardFields()
      );
    });
    await assertFails(getDoc(doc(asStudentRoleSelf(), studentDashboardPath)));
  });

  it('studentRole user cannot create a dashboard under their own uid', async () => {
    await assertFails(
      setDoc(doc(asStudentRoleSelf(), studentDashboardPath), dashboardFields())
    );
  });

  it('studentRole user cannot update a dashboard under their own uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), studentDashboardPath),
        dashboardFields()
      );
    });
    await assertFails(
      setDoc(doc(asStudentRoleSelf(), studentDashboardPath), {
        ...dashboardFields(),
        name: 'Smuggled',
      })
    );
  });

  it('studentRole user cannot delete a dashboard under their own uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), studentDashboardPath),
        dashboardFields()
      );
    });
    await assertFails(
      deleteDoc(doc(asStudentRoleSelf(), studentDashboardPath))
    );
  });

  it("studentRole user cannot read a teacher's dashboard", async () => {
    await assertFails(
      getDoc(doc(asStudentRoleAttackerOnTeacher(), teacherDashboardPath))
    );
  });

  it("studentRole user cannot write to a teacher's dashboard", async () => {
    await assertFails(
      setDoc(
        doc(asStudentRoleAttackerOnTeacher(), teacherDashboardPath),
        dashboardFields()
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Other auth shapes — confirm the rule still rejects them as before
// ---------------------------------------------------------------------------

describe('/users/{uid}/dashboards — other auth shapes', () => {
  it('anonymous PIN-token user cannot read a teacher dashboard', async () => {
    await assertFails(getDoc(doc(asAnonPin(), teacherDashboardPath)));
  });

  it('anonymous PIN-token user cannot write to a teacher dashboard', async () => {
    await assertFails(
      setDoc(doc(asAnonPin(), teacherDashboardPath), dashboardFields())
    );
  });

  it('unauthenticated caller cannot read a teacher dashboard', async () => {
    await assertFails(getDoc(doc(asUnauth(), teacherDashboardPath)));
  });

  it('unauthenticated caller cannot write to a teacher dashboard', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), teacherDashboardPath), dashboardFields())
    );
  });
});
