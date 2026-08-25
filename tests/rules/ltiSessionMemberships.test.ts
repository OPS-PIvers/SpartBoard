// Firestore security-rules regression for
// `lti_session_memberships/{sessionId}/contexts/{contextId}` (see
// functions/src/lti/nrpsStore.ts). This collection persists a Schoology NRPS
// `context_memberships_url` per session — a service endpoint, never a
// name/email — but is still deny-all for every client: only the Admin SDK
// (launch + grade-push Cloud Functions) ever touches it. Before this file,
// the rule (`allow read, write: if false;`) had ZERO test coverage, so a
// typo'd future edit (e.g. `if true` or a scoped owner check) could silently
// open student roster data to any authenticated caller with no CI signal.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-lti-session-memberships';

const SESSION_ID = 'quiz-session-1';
const CONTEXT_ID = 'lti-context-1';
const CONTEXT_PATH = `lti_session_memberships/${SESSION_ID}/contexts/${CONTEXT_ID}`;

const TEACHER_UID = 'teacher-uid-1';
const STUDENT_UID = 'student-uid-1';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_UID = 'admin-uid-1';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// Token shape mirrors ltiCollections.test.ts — spell out the full claim
// surface even though this rule only checks `request.auth != null`, to stay
// robust to future helper changes and match the rest of the suite.

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@school.edu',
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

const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      studentRole: false,
      classIds: [],
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

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

// The doc is only ever written by the Admin SDK in production (the LTI
// launch Cloud Function), so seed it via the security-rules bypass — mirrors
// ltiCollections.test.ts's seeding for the other server-internal LTI docs.
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, CONTEXT_PATH), {
      context_memberships_url: 'https://schoology.example/nrps/context-1',
    });
    await setDoc(doc(db, `admins/${ADMIN_EMAIL}`), {});
  });
});

describe('lti_session_memberships — deny-all for every client', () => {
  it('denies an unauthenticated client reading it', async () => {
    await assertFails(getDoc(doc(asUnauth(), CONTEXT_PATH)));
  });

  it('denies an unauthenticated client writing it', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), CONTEXT_PATH), {
        context_memberships_url: 'https://evil.example/nrps',
      })
    );
  });

  it('denies an authenticated teacher reading it, even the session owner', async () => {
    await assertFails(getDoc(doc(asTeacher(), CONTEXT_PATH)));
  });

  it('denies an authenticated teacher writing it', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), CONTEXT_PATH), {
        context_memberships_url: 'https://evil.example/nrps',
      })
    );
  });

  it('denies an authenticated teacher deleting it', async () => {
    await assertFails(deleteDoc(doc(asTeacher(), CONTEXT_PATH)));
  });

  it('denies a studentRole client reading it', async () => {
    await assertFails(getDoc(doc(asStudentRole(), CONTEXT_PATH)));
  });

  it('denies a studentRole client writing it', async () => {
    await assertFails(
      setDoc(doc(asStudentRole(), CONTEXT_PATH), {
        context_memberships_url: 'https://evil.example/nrps',
      })
    );
  });

  it('denies even an admin reading it (no client bypass for this collection)', async () => {
    await assertFails(getDoc(doc(asAdmin(), CONTEXT_PATH)));
  });

  it('denies even an admin writing it', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), CONTEXT_PATH), {
        context_memberships_url: 'https://evil.example/nrps',
      })
    );
  });
});
