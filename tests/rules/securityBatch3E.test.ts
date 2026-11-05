// Security batch 3E: a wall post or comment from a student whose token carries a first name must
// show that name; guests, teachers and tokens minted before the claim existed are unaffected.
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
import { setDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-security-batch-3e';
const TEACHER_UID = 'teacher-uid';
const ACTIVITY_ID = 'activity-123';
const SESSION_ID = `${TEACHER_UID}_${ACTIVITY_ID}`;
const STUDENT_UID = 'student-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asStudent = (claims: Record<string, unknown> = {}) =>
  testEnv
    .authenticatedContext(STUDENT_UID, {
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
      ...claims,
    })
    .firestore();

const asGuest = () =>
  testEnv
    .authenticatedContext('guest-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const session = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  activityId: ACTIVITY_ID,
  teacherUid: TEACHER_UID,
  title: 'Wall',
  prompt: 'Post something',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  updatedAt: 1_000_000,
  layout: 'wall',
  allowedTypes: { photo: false, link: false, file: false, video: false },
  appearance: { kind: 'gradient', value: 'bg-gradient-to-br' },
  allowGuests: true,
  showNames: true,
  maxPostsPerStudent: 0,
  allowStudentEdit: false,
  allowStudentDelete: false,
  acceptingResponses: true,
  allowComments: true,
  driveVisibility: 'domain',
  ...overrides,
});

const seed = async (path: string, data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
};

const submissionPath = (id: string) =>
  `activity_wall_sessions/${SESSION_ID}/submissions/${id}`;
const commentPath = (id: string) =>
  `activity_wall_sessions/${SESSION_ID}/comments/${id}`;

const post = (uid: string, overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  activityId: ACTIVITY_ID,
  content: 'Hello wall',
  submittedAt: 1_700_000,
  status: 'approved',
  type: 'text',
  authorUid: uid,
  isGuest: false,
  participantLabel: 'Sam',
  ...overrides,
});

const comment = (uid: string, overrides: Record<string, unknown> = {}) => ({
  id: 'c-1',
  submissionId: 'sub-1',
  parentCommentId: null,
  content: 'Nice work',
  participantLabel: 'Sam',
  authorUid: uid,
  createdAt: 1_700_000,
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
  await seed(`activity_wall_sessions/${SESSION_ID}`, session());
});

describe('activity wall — student name on posts', () => {
  it('allows a post that carries the first name on the token', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
        post(STUDENT_UID)
      )
    );
  });

  it('denies a post under another name', async () => {
    await assertFails(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
        post(STUDENT_UID, { participantLabel: 'Riley' })
      )
    );
  });

  it('allows a post with no label, which names nobody', async () => {
    const { participantLabel: _omit, ...noLabel } = post(STUDENT_UID);
    await assertSucceeds(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
        noLabel
      )
    );
  });

  it('still allows a token minted before the claim existed', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        post(STUDENT_UID, { participantLabel: 'Riley' })
      )
    );
  });

  it('does not constrain a guest label', async () => {
    await assertSucceeds(
      setDoc(
        doc(asGuest(), submissionPath('sub-1')),
        post('guest-uid', { isGuest: true, participantLabel: 'Visitor' })
      )
    );
  });
});

describe('activity wall — student name on comments', () => {
  beforeEach(async () => {
    await seed(submissionPath('sub-1'), post('other-uid'));
  });

  it('allows a comment that carries the first name on the token', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), commentPath('c-1')),
        comment(STUDENT_UID)
      )
    );
  });

  it('denies a comment under another name', async () => {
    await assertFails(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), commentPath('c-1')),
        comment(STUDENT_UID, { participantLabel: 'Riley' })
      )
    );
  });

  it('still allows a token minted before the claim existed', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), commentPath('c-1')),
        comment(STUDENT_UID, { participantLabel: 'Riley' })
      )
    );
  });

  it('does not constrain a guest comment label', async () => {
    await assertSucceeds(
      setDoc(
        doc(asGuest(), commentPath('c-1')),
        comment('guest-uid', { participantLabel: 'Visitor' })
      )
    );
  });
});
