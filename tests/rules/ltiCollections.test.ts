// Firestore security-rules tests for the Schoology LTI 1.3 collections.
//
// Mirrors the Google Classroom add-on collection rules. Four collections:
//
//   lti_oidc_state/{state}                             — server-internal,
//                                                         deny all client R/W
//   lti_launch_codes/{code}                            — server-internal,
//                                                         deny all client R/W
//   lti_course_links/{contextId}                       — authed read,
//                                                         server-only write
//   lti_grade_links/{pseudonymUid}/resources/{rid}     — server-internal,
//                                                         deny all client R/W
//
// Contract: three collections are owned end-to-end by the Admin SDK — OIDC
// handshake state + one-time launch codes (transient secrets) AND the
// grade-sync links (the launch CF writes them and the grade-push CF reads them,
// both server-side; a link carries a student's LTI `sub` + AGS endpoint URLs, so
// no client should enumerate them). Clients can neither read nor write those
// three. Only lti_course_links exposes READ to any authenticated caller (the
// teacher monitor needs link state); its WRITE is server-only — rules cannot
// validate an LTI launch, so a client write would let any authed user squat a
// context_id.
//
// These collections do NOT use the studentRole class-gate helpers (they carry
// no `classId`/`classIds` targeting), so studentRole contexts are exercised
// only to confirm they behave identically to any other authed caller.
//
// Requires a running Firestore emulator. Invoke via:
//   pnpm run test:rules
// which wraps the suite in `firebase emulators:exec --only firestore`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-lti-collections-test';

const STATE_ID = 'oidc-state-1';
const LAUNCH_CODE = 'launch-code-1';
const CONTEXT_ID = 'lti-context-1';
const PSEUDONYM_UID = 'lti-pseudonym-uid-1';
const RESOURCE_LINK_ID = 'resource-link-1';

const TEACHER_UID = 'teacher-uid-1';
const STUDENT_UID = 'student-uid-1';

const STATE_PATH = `lti_oidc_state/${STATE_ID}`;
const LAUNCH_CODE_PATH = `lti_launch_codes/${LAUNCH_CODE}`;
const COURSE_LINK_PATH = `lti_course_links/${CONTEXT_ID}`;
const GRADE_LINK_PATH = `lti_grade_links/${PSEUDONYM_UID}/resources/${RESOURCE_LINK_ID}`;

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

// ---------------------------------------------------------------------------
// Environment + auth contexts
// ---------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

// Token shape note (mirrors studentRoleClassGate.test.ts): the emulator rules
// engine throws "Property X is undefined on object" when a rule reads a claim
// that isn't present, even behind a `!= null` short-circuit. None of these LTI
// rules read custom claims (they only gate on `request.auth != null`), but we
// still spell out the full claim surface in every context to match the rest of
// the rules suite and stay robust to future helper changes.

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

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Seeding — all four docs are written by the Admin SDK in production, so seed
// them via the security-rules bypass (mirrors how other rules tests seed
// server-written docs). This lets the read assertions exercise a populated doc.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, STATE_PATH), {
      nonce: 'nonce-abc',
      createdAt: 1000,
    });
    await setDoc(doc(db, LAUNCH_CODE_PATH), {
      sub: PSEUDONYM_UID,
      createdAt: 1000,
    });
    await setDoc(doc(db, COURSE_LINK_PATH), {
      teacherUid: TEACHER_UID,
      contextId: CONTEXT_ID,
    });
    await setDoc(doc(db, GRADE_LINK_PATH), {
      lineitemUrl: 'https://schoology.example/lineitem/1',
      resourceLinkId: RESOURCE_LINK_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// Unauthenticated client — read AND write DENIED on all four collections.
// ---------------------------------------------------------------------------

describe('LTI collections — unauthenticated client', () => {
  it('cannot read lti_oidc_state', async () => {
    await assertFails(getDoc(doc(asUnauth(), STATE_PATH)));
  });

  it('cannot write lti_oidc_state', async () => {
    await assertFails(setDoc(doc(asUnauth(), STATE_PATH), { nonce: 'x' }));
  });

  it('cannot read lti_launch_codes', async () => {
    await assertFails(getDoc(doc(asUnauth(), LAUNCH_CODE_PATH)));
  });

  it('cannot write lti_launch_codes', async () => {
    await assertFails(setDoc(doc(asUnauth(), LAUNCH_CODE_PATH), { sub: 'x' }));
  });

  it('cannot read lti_course_links', async () => {
    await assertFails(getDoc(doc(asUnauth(), COURSE_LINK_PATH)));
  });

  it('cannot write lti_course_links', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), COURSE_LINK_PATH), { teacherUid: 'x' })
    );
  });

  it('cannot read lti_grade_links resource', async () => {
    await assertFails(getDoc(doc(asUnauth(), GRADE_LINK_PATH)));
  });

  it('cannot write lti_grade_links resource', async () => {
    await assertFails(
      setDoc(doc(asUnauth(), GRADE_LINK_PATH), { lineitemUrl: 'x' })
    );
  });
});

// ---------------------------------------------------------------------------
// Authenticated (teacher / non-student) client.
//   READ allowed on lti_course_links only.
//   READ denied on the three server-internal collections (state, codes,
//     grade-links).
//   WRITE denied on all four.
// ---------------------------------------------------------------------------

describe('LTI collections — authenticated (non-student) client', () => {
  it('can read lti_course_links', async () => {
    await assertSucceeds(getDoc(doc(asTeacher(), COURSE_LINK_PATH)));
  });

  it('cannot read lti_grade_links resource (server-internal)', async () => {
    await assertFails(getDoc(doc(asTeacher(), GRADE_LINK_PATH)));
  });

  it('cannot read lti_oidc_state (server-internal)', async () => {
    await assertFails(getDoc(doc(asTeacher(), STATE_PATH)));
  });

  it('cannot read lti_launch_codes (server-internal)', async () => {
    await assertFails(getDoc(doc(asTeacher(), LAUNCH_CODE_PATH)));
  });

  it('cannot write lti_oidc_state', async () => {
    await assertFails(setDoc(doc(asTeacher(), STATE_PATH), { nonce: 'x' }));
  });

  it('cannot write lti_launch_codes', async () => {
    await assertFails(setDoc(doc(asTeacher(), LAUNCH_CODE_PATH), { sub: 'x' }));
  });

  it('cannot write lti_course_links (server-only — no context_id squatting)', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), COURSE_LINK_PATH), { teacherUid: TEACHER_UID })
    );
  });

  it('cannot write lti_grade_links resource (server-only)', async () => {
    await assertFails(
      setDoc(doc(asTeacher(), GRADE_LINK_PATH), { lineitemUrl: 'x' })
    );
  });
});

// ---------------------------------------------------------------------------
// studentRole-authed client. These collections don't use the class-gate
// helpers, so a studentRole token behaves exactly like any other authed
// caller: read allowed on lti_course_links, denied on the three server-internal
// collections (state, codes, grade-links), writes denied everywhere. Kept light
// per the "don't over-test" note.
// ---------------------------------------------------------------------------

describe('LTI collections — studentRole-authed client', () => {
  it('can read lti_course_links', async () => {
    await assertSucceeds(getDoc(doc(asStudentRole(), COURSE_LINK_PATH)));
  });

  it('cannot read lti_grade_links resource (server-internal)', async () => {
    await assertFails(getDoc(doc(asStudentRole(), GRADE_LINK_PATH)));
  });

  it('cannot read lti_oidc_state (server-internal)', async () => {
    await assertFails(getDoc(doc(asStudentRole(), STATE_PATH)));
  });

  it('cannot read lti_launch_codes (server-internal)', async () => {
    await assertFails(getDoc(doc(asStudentRole(), LAUNCH_CODE_PATH)));
  });

  it('cannot write any LTI collection', async () => {
    await assertFails(setDoc(doc(asStudentRole(), STATE_PATH), { nonce: 'x' }));
    await assertFails(
      setDoc(doc(asStudentRole(), LAUNCH_CODE_PATH), { sub: 'x' })
    );
    await assertFails(
      setDoc(doc(asStudentRole(), COURSE_LINK_PATH), { teacherUid: 'x' })
    );
    await assertFails(
      setDoc(doc(asStudentRole(), GRADE_LINK_PATH), { lineitemUrl: 'x' })
    );
  });
});
