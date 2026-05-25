// Firestore security-rules tests for
//   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}
//   /users/{uid}/dashboards/{dashboardId}/drawings/{widgetId}/pages/{pageId}/objects/{objectId}
//
// Phase 2 PR 2.6 moves DrawingWidget content off the dashboard document into
// a page-nested subcollection. The new rules must mirror the parent
// dashboard rule exactly — owner-only access, studentRole users denied.
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

const PROJECT_ID = 'spartboard-drawing-objects-rules-test';
const TEACHER_UID = 'teacher-uid-1';
const OTHER_TEACHER_UID = 'teacher-uid-2';
const STUDENT_UID = 'student-uid-1';
const DASHBOARD_ID = 'dash-1';
const WIDGET_ID = 'drawing-widget-1';
const PAGE_ID = 'page-1';
const OBJECT_ID = 'object-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Token-shape note: rules engine throws on undefined claim access — spell
// out every claim the rules touch. See dashboardsAccess.test.ts for details.
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

const asStudentRole = () =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      email: '',
      studentRole: true,
      classIds: ['class-A'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const pagePath = (uid: string) =>
  `users/${uid}/dashboards/${DASHBOARD_ID}/drawings/${WIDGET_ID}/pages/${PAGE_ID}`;
const objectPath = (uid: string) =>
  `users/${uid}/dashboards/${DASHBOARD_ID}/drawings/${WIDGET_ID}/pages/${PAGE_ID}/objects/${OBJECT_ID}`;

const pageDocFields = () => ({ background: 'blank' });
const objectDocFields = () => ({
  id: OBJECT_ID,
  kind: 'path',
  z: 0,
  color: '#000',
  width: 4,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
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
  // Seed a page doc + object doc under the teacher so read/update/delete
  // paths have something to find. Bypasses rules so the seed isn't under test.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), pagePath(TEACHER_UID)), pageDocFields());
    await setDoc(
      doc(ctx.firestore(), objectPath(TEACHER_UID)),
      objectDocFields()
    );
  });
});

// ---------------------------------------------------------------------------
// Page metadata doc
// ---------------------------------------------------------------------------

describe('/users/{uid}/dashboards/{id}/drawings/{wid}/pages/{pid}', () => {
  it('owner can read their own page metadata', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), pagePath(TEACHER_UID))));
  });

  it('owner can write their own page metadata', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), pagePath(TEACHER_UID)), { background: 'grid' })
    );
  });

  it('owner can delete their own page metadata', async () => {
    await assertSucceeds(deleteDoc(doc(asTeacher(), pagePath(TEACHER_UID))));
  });

  it('another user cannot read the page metadata', async () => {
    await assertFails(getDoc(doc(asOtherTeacher(), pagePath(TEACHER_UID))));
  });

  it('another user cannot write the page metadata', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), pagePath(TEACHER_UID)), pageDocFields())
    );
  });

  it('studentRole user cannot read the page metadata even under their own uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), pagePath(STUDENT_UID)),
        pageDocFields()
      );
    });
    await assertFails(getDoc(doc(asStudentRole(), pagePath(STUDENT_UID))));
  });

  it('unauthenticated caller cannot read the page metadata', async () => {
    await assertFails(getDoc(doc(asUnauth(), pagePath(TEACHER_UID))));
  });
});

// ---------------------------------------------------------------------------
// Object subcollection
// ---------------------------------------------------------------------------

describe('/users/{uid}/dashboards/{id}/drawings/{wid}/pages/{pid}/objects/{oid}', () => {
  it('owner can read their own drawing object', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), objectPath(TEACHER_UID))));
  });

  it('owner can write their own drawing object', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), objectPath(TEACHER_UID)), objectDocFields())
    );
  });

  it('owner can delete their own drawing object', async () => {
    await assertSucceeds(deleteDoc(doc(asTeacher(), objectPath(TEACHER_UID))));
  });

  it('another user cannot read the drawing object', async () => {
    await assertFails(getDoc(doc(asOtherTeacher(), objectPath(TEACHER_UID))));
  });

  it('another user cannot write the drawing object', async () => {
    await assertFails(
      setDoc(doc(asOtherTeacher(), objectPath(TEACHER_UID)), objectDocFields())
    );
  });

  it('another user cannot delete the drawing object', async () => {
    await assertFails(
      deleteDoc(doc(asOtherTeacher(), objectPath(TEACHER_UID)))
    );
  });

  it('studentRole user cannot read the drawing object even under their own uid', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), objectPath(STUDENT_UID)),
        objectDocFields()
      );
    });
    await assertFails(getDoc(doc(asStudentRole(), objectPath(STUDENT_UID))));
  });

  it('studentRole user cannot write the drawing object under their own uid', async () => {
    await assertFails(
      setDoc(doc(asStudentRole(), objectPath(STUDENT_UID)), objectDocFields())
    );
  });

  it('unauthenticated caller cannot read the drawing object', async () => {
    await assertFails(getDoc(doc(asUnauth(), objectPath(TEACHER_UID))));
  });

  it('unauthenticated caller cannot write the drawing object', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), objectPath(TEACHER_UID)), objectDocFields())
    );
  });
});
