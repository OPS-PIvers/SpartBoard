// Firestore security-rules regression for the FERPA boundary on PLC
// contributions (PRD §3.6 step 2 / §9 PII risk row, Wave 3 "W3-06").
//
// A `PlcContribution` at `/plcs/{plcId}/contributions/{quizId}_{teacherUid}`
// carries each teacher's raw graded `responses[]`, which embed
// `studentDisplayName` — student-identifying PII. Now that every
// member-facing reader (Shared Data, Meeting Mode, Home) consumes the
// anonymized, server-written `/plcs/{plcId}/aggregates/{assessmentId}`
// sibling, the raw `contributions` read is tightened to OWNER-ONLY:
//   allow read: if isPlcMember()
//                  && request.auth.uid == resource.data.teacherUid;
//
// This suite is the proof of that FERPA boundary. It MUST show:
//   1. Teacher A writes a contribution whose responses[] carry student
//      names.
//   2. Teacher B — a co-member of the SAME PLC — is DENIED reading A's
//      raw contribution (B can never see A's students' names this way).
//   3. Teacher A can still read her OWN contribution (the owning
//      teacher's named roster stays reachable to that teacher).
//   4. A non-member is denied (owner-only is strictly narrower than the
//      prior member-only gate — never wider).
//   5. The sanctioned anonymized path still works: every member can read
//      the `/aggregates` rollup (the PII-free cross-teacher view).
//   6. No other reader path to raw contributions remains — the aggregate
//      a co-member CAN read carries no studentDisplayName.
//   7. The QUERY-SHAPE contract the app actually uses: Firestore evaluates a
//      collection listen against the query CONSTRAINTS holistically, not
//      per-document. An UNCONSTRAINED listen over the contributions
//      collection is rejected wholesale with permission-denied (even for an
//      owning teacher, whose unfiltered query still matches teammates' docs),
//      while a `where('teacherUid','==', self)` query SUCCEEDS and returns
//      only the caller's own docs. This pins the invariant that the
//      single-doc getDoc tests above do NOT exercise — the exact path the
//      provider's `ownContributionsOnly` builder and the standalone
//      `usePlcContributions` hook depend on.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-contributions-pii';
const PLC_ID = 'plc-pii-test';
const QUIZ_ID = 'quiz-pii';
const ASSESSMENT_ID = 'assessment-pii';

const TEACHER_A_UID = 'teacher-a-uid';
const TEACHER_B_UID = 'teacher-b-uid';
const NON_MEMBER_UID = 'outsider-uid';

const CONTRIB_ID_A = `${QUIZ_ID}_${TEACHER_A_UID}`;
const CONTRIB_ID_B = `${QUIZ_ID}_${TEACHER_B_UID}`;

const STUDENT_NAME_A = 'Alice Studentname-A';
const STUDENT_NAME_B = 'Bob Studentname-B';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacherA = () =>
  testEnv
    .authenticatedContext(TEACHER_A_UID, { email: 'teacher-a@example.com' })
    .firestore();
const asTeacherB = () =>
  testEnv
    .authenticatedContext(TEACHER_B_UID, { email: 'teacher-b@example.com' })
    .firestore();
const asNonMember = () =>
  testEnv
    .authenticatedContext(NON_MEMBER_UID, { email: 'outsider@example.com' })
    .firestore();

// A raw `responses[]` entry carrying the FERPA-protected student name —
// the exact datum the owner-only read exists to wall off from other
// teachers.
const piiResponse = (studentDisplayName: string): Record<string, unknown> => ({
  studentDisplayName,
  pin: '0001',
  classPeriod: 'P1',
  status: 'completed',
  scorePercent: 100,
  pointsEarned: 1,
  maxPoints: 1,
  tabSwitchWarnings: 0,
  submittedAt: 2000,
  pointsByQuestionId: { q1: 1 },
});

const contribution = (
  teacherUid: string,
  teacherName: string,
  studentName: string,
  id: string
): Record<string, unknown> => ({
  id,
  schemaVersion: 1,
  quizId: QUIZ_ID,
  syncGroupId: 'sync-group-pii',
  teacherUid,
  teacherName,
  questionsSnapshot: [{ id: 'q1', text: 'Q1', points: 1 }],
  responses: [piiResponse(studentName)],
  updatedAt: 1000,
});

// The anonymized, server-written rollup that members ARE allowed to read.
// It carries NO student names and NO per-student rows — only counts and
// per-teacher averages (PRD §3.6 PlcAssessmentAggregate / Decision 6.0).
const aggregate = (): Record<string, unknown> => ({
  assessmentId: ASSESSMENT_ID,
  schemaVersion: 1,
  teacherCount: 2,
  studentCount: 2,
  teamAveragePercent: 100,
  perQuestion: [
    { questionId: 'q1', text: 'Q1', correctPercent: 100, points: 1 },
  ],
  perTeacher: [
    {
      teacherUid: TEACHER_A_UID,
      teacherName: 'Teacher A',
      classCount: 1,
      averagePercent: 100,
      studentCount: 1,
    },
    {
      teacherUid: TEACHER_B_UID,
      teacherName: 'Teacher B',
      classCount: 1,
      averagePercent: 100,
      studentCount: 1,
    },
  ],
  ranAt: 3000,
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
    // PLC root so membership lookups resolve. A and B are BOTH members.
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), {
      name: 'PII Test PLC',
      leadUid: TEACHER_A_UID,
      memberUids: [TEACHER_A_UID, TEACHER_B_UID],
      members: {
        [TEACHER_A_UID]: { role: 'lead' },
        [TEACHER_B_UID]: { role: 'member' },
      },
      memberEmails: {
        [TEACHER_A_UID]: 'teacher-a@example.com',
        [TEACHER_B_UID]: 'teacher-b@example.com',
      },
      createdAt: 1,
      updatedAt: 1,
    });

    // Teacher A's contribution carries Alice's name; Teacher B's carries
    // Bob's name. Each is the other teacher's raw PII.
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`),
      contribution(TEACHER_A_UID, 'Teacher A', STUDENT_NAME_A, CONTRIB_ID_A)
    );
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_B}`),
      contribution(TEACHER_B_UID, 'Teacher B', STUDENT_NAME_B, CONTRIB_ID_B)
    );

    // The sanctioned anonymized rollup both members may read.
    await setDoc(
      doc(ctx.firestore(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`),
      aggregate()
    );
  });
});

// ---------------------------------------------------------------------------
// The FERPA boundary: raw contributions are owner-only.
// ---------------------------------------------------------------------------

describe('PLC contributions — FERPA owner-only read boundary', () => {
  it('teacher A can read her OWN contribution (named roster stays reachable to the owner)', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacherA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });

  it('teacher B (a co-member of the same PLC) is DENIED reading teacher A’s raw contribution / student names', async () => {
    await assertFails(
      getDoc(doc(asTeacherB(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });

  it('the boundary is symmetric — teacher A is DENIED reading teacher B’s raw contribution', async () => {
    await assertFails(
      getDoc(doc(asTeacherA(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_B}`))
    );
  });

  it('a non-member is denied (owner-only is strictly narrower than the old member gate — never wider)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/contributions/${CONTRIB_ID_A}`))
    );
  });
});

// ---------------------------------------------------------------------------
// The sanctioned anonymized path: members read /aggregates (no PII).
// ---------------------------------------------------------------------------

describe('PLC aggregates — sanctioned anonymized cross-teacher read', () => {
  it('teacher A can read the aggregate rollup', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacherA(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('teacher B — denied A’s raw contribution — CAN still read the anonymized aggregate', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacherB(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });

  it('the aggregate a co-member can read carries NO student names (no other path to raw PII remains)', async () => {
    const snap = await assertSucceeds(
      getDoc(doc(asTeacherB(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
    const serialized = JSON.stringify(snap.data());
    expect(serialized).not.toContain(STUDENT_NAME_A);
    expect(serialized).not.toContain(STUDENT_NAME_B);
    expect(serialized).not.toContain('studentDisplayName');
  });

  it('a non-member cannot read the aggregate (membership gate on the anonymized path too)', async () => {
    await assertFails(
      getDoc(doc(asNonMember(), `plcs/${PLC_ID}/aggregates/${ASSESSMENT_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// Query-shape contract — the path the app actually uses.
//
// The single-doc getDoc tests above prove per-document allow/deny, but the
// app never reads contributions one doc at a time: both the PlcProvider
// `contributions` slice and the standalone `usePlcContributions` hook open a
// COLLECTION listener. Firestore evaluates a list/query against the query
// CONSTRAINTS holistically — an unconstrained listen whose match set includes
// docs the caller can't read is rejected wholesale, NOT silently row-filtered.
// These tests lock the invariant that the client query MUST pin
// `teacherUid == self`, so the Wave-3 break (unfiltered listen →
// permission-denied for every member, including the owner) can't reappear.
// ---------------------------------------------------------------------------

describe('PLC contributions — collection query shape (owner-scoped listen)', () => {
  it('an UNCONSTRAINED collection query is DENIED (the listener shape the app must NOT use)', async () => {
    await assertFails(
      getDocs(collection(asTeacherA(), `plcs/${PLC_ID}/contributions`))
    );
  });

  it('a `teacherUid == self` query SUCCEEDS and returns ONLY the caller’s own contribution', async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(asTeacherA(), `plcs/${PLC_ID}/contributions`),
          where('teacherUid', '==', TEACHER_A_UID)
        )
      )
    );
    expect(snap.size).toBe(1);
    expect(snap.docs[0].id).toBe(CONTRIB_ID_A);
    expect(snap.docs[0].data().teacherUid).toBe(TEACHER_A_UID);
    // The returned doc is the caller's own — never a teammate's PII.
    const serialized = JSON.stringify(snap.docs[0].data());
    expect(serialized).not.toContain(STUDENT_NAME_B);
  });

  it('the boundary is symmetric — teacher B’s `teacherUid == self` query returns only B’s own doc', async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(asTeacherB(), `plcs/${PLC_ID}/contributions`),
          where('teacherUid', '==', TEACHER_B_UID)
        )
      )
    );
    expect(snap.size).toBe(1);
    expect(snap.docs[0].id).toBe(CONTRIB_ID_B);
  });

  it('a `teacherUid == OTHER` query is DENIED — a member can’t scope to a teammate to read their PII', async () => {
    await assertFails(
      getDocs(
        query(
          collection(asTeacherB(), `plcs/${PLC_ID}/contributions`),
          where('teacherUid', '==', TEACHER_A_UID)
        )
      )
    );
  });

  it('a non-member’s owner-scoped query is DENIED (membership gate still applies to the query path)', async () => {
    await assertFails(
      getDocs(
        query(
          collection(asNonMember(), `plcs/${PLC_ID}/contributions`),
          where('teacherUid', '==', NON_MEMBER_UID)
        )
      )
    );
  });
});
