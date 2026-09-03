// Firestore security-rules coverage for the merged Activity Wall student page
// (docs/plans/ACTIVITY_WALL_MERGED_STUDENT_PAGE.md): the student-link audience
// reads approved posts while `studentsCanSeePosts` is on, never another
// student's pending post, teachers post auto-approved under moderation, and
// session-level likes/comments follow the wall's own engagement flags.
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
import {
  setDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-activity-wall-merged-page';
const TEACHER_UID = 'teacher-uid';
const ACTIVITY_ID = 'activity-123';
const SESSION_ID = `${TEACHER_UID}_${ACTIVITY_ID}`;
const STUDENT_UID = 'student-uid';
const OTHER_STUDENT_UID = 'other-student-uid';
const ANON_UID = 'anon-uid';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asTeacher = () =>
  testEnv
    .authenticatedContext(TEACHER_UID, {
      email: 'teacher@example.com',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asStudent = (uid = STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      studentRole: true,
      classIds: ['class-1'],
      firebase: { sign_in_provider: 'custom' },
    })
    .firestore();

const asAnonymous = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const padletSession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  activityId: ACTIVITY_ID,
  teacherUid: TEACHER_UID,
  title: 'Wall',
  prompt: 'Post something',
  mode: 'photo',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  updatedAt: 1_000_000,
  layout: 'wall',
  allowedTypes: { photo: true, link: false, file: false, video: false },
  appearance: { kind: 'gradient', value: 'bg-gradient-to-br' },
  allowGuests: false,
  showNames: true,
  maxPostsPerStudent: 0,
  allowStudentEdit: false,
  allowStudentDelete: false,
  acceptingResponses: true,
  driveVisibility: 'domain',
  ...overrides,
});

const seedSession = async (data: Record<string, unknown>) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), `activity_wall_sessions/${SESSION_ID}`),
      data
    );
  });
};

const submissionPath = (submissionId: string) =>
  `activity_wall_sessions/${SESSION_ID}/submissions/${submissionId}`;

const seedSubmission = async (
  submissionId: string,
  data: Record<string, unknown>
) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), submissionPath(submissionId)), data);
  });
};

const submission = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  activityId: ACTIVITY_ID,
  content: 'Hello wall',
  submittedAt: 1_700_000,
  status: 'approved',
  type: 'text',
  authorUid: OTHER_STUDENT_UID,
  isGuest: false,
  participantLabel: 'Sam',
  ...overrides,
});

const approvedQuery = (db: ReturnType<typeof asStudent>) =>
  getDocs(
    query(
      collection(db, `activity_wall_sessions/${SESSION_ID}/submissions`),
      where('status', '==', 'approved')
    )
  );

const likePath = (submissionId: string, uid: string) =>
  `activity_wall_sessions/${SESSION_ID}/likes/${submissionId}__${uid}`;

const commentPath = (commentId: string) =>
  `activity_wall_sessions/${SESSION_ID}/comments/${commentId}`;

const like = (submissionId: string, uid: string) => ({
  id: `${submissionId}__${uid}`,
  submissionId,
  authorUid: uid,
  createdAt: 1_700_000,
});

const comment = (
  commentId: string,
  uid: string,
  overrides: Record<string, unknown> = {}
) => ({
  id: commentId,
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
});

describe('merged student page — reading the wall', () => {
  it('student lists approved posts when studentsCanSeePosts is unset', async () => {
    await seedSession(padletSession());
    await seedSubmission('sub-1', submission());
    await assertSucceeds(approvedQuery(asStudent()));
  });

  it('student lists approved posts when studentsCanSeePosts is true', async () => {
    await seedSession(padletSession({ studentsCanSeePosts: true }));
    await seedSubmission('sub-1', submission());
    await assertSucceeds(approvedQuery(asStudent()));
  });

  it('student is denied the approved list when the wall is hidden', async () => {
    await seedSession(padletSession({ studentsCanSeePosts: false }));
    await seedSubmission('sub-1', submission());
    await assertFails(approvedQuery(asStudent()));
  });

  it('student still lists their own posts on a hidden wall', async () => {
    await seedSession(padletSession({ studentsCanSeePosts: false }));
    await seedSubmission('mine', submission({ authorUid: STUDENT_UID }));
    await assertSucceeds(
      getDocs(
        query(
          collection(
            asStudent(),
            `activity_wall_sessions/${SESSION_ID}/submissions`
          ),
          where('authorUid', '==', STUDENT_UID)
        )
      )
    );
  });

  it("student cannot read another student's pending post", async () => {
    await seedSession(padletSession({ moderationEnabled: true }));
    await seedSubmission('pending', submission({ status: 'pending' }));
    await assertFails(getDoc(doc(asStudent(), submissionPath('pending'))));
  });

  it('student reads their own pending post', async () => {
    await seedSession(padletSession({ moderationEnabled: true }));
    await seedSubmission(
      'mine-pending',
      submission({ status: 'pending', authorUid: STUDENT_UID })
    );
    await assertSucceeds(
      getDoc(doc(asStudent(), submissionPath('mine-pending')))
    );
  });

  it('guest on an SSO-only wall is denied the approved list', async () => {
    await seedSession(padletSession({ allowGuests: false }));
    await seedSubmission('sub-1', submission());
    await assertFails(approvedQuery(asAnonymous()));
  });

  it('guest on a guest-allowed wall reads approved posts', async () => {
    await seedSession(padletSession({ allowGuests: true }));
    await seedSubmission('sub-1', submission());
    await assertSucceeds(approvedQuery(asAnonymous()));
  });

  it('legacy session (no layout) does not open reads to students', async () => {
    const { layout: _layout, ...legacy } = padletSession();
    await seedSession(legacy);
    await seedSubmission('sub-1', submission());
    await assertFails(approvedQuery(asStudent()));
  });
});

describe('merged student page — teacher posting', () => {
  it('teacher creates an approved post under moderation', async () => {
    await seedSession(padletSession({ moderationEnabled: true }));
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), submissionPath('teacher-1')),
        submission({
          id: 'teacher-1',
          status: 'approved',
          authorUid: TEACHER_UID,
          authorRole: 'teacher',
          participantLabel: 'Ms. Ivers',
        })
      )
    );
  });

  it('student cannot stamp authorRole teacher', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('fake-teacher')),
        submission({
          id: 'fake-teacher',
          authorUid: STUDENT_UID,
          authorRole: 'teacher',
        })
      )
    );
  });

  it('teacher post must be approved, not pending', async () => {
    await seedSession(padletSession({ moderationEnabled: true }));
    await assertFails(
      setDoc(
        doc(asTeacher(), submissionPath('teacher-pending')),
        submission({
          id: 'teacher-pending',
          status: 'pending',
          authorUid: TEACHER_UID,
          authorRole: 'teacher',
        })
      )
    );
  });
});

describe('merged student page — session likes and comments', () => {
  it('student likes a post when allowLikes is on', async () => {
    await seedSession(padletSession({ allowLikes: true }));
    await assertSucceeds(
      setDoc(
        doc(asStudent(), likePath('sub-1', STUDENT_UID)),
        like('sub-1', STUDENT_UID)
      )
    );
  });

  it('like is denied when allowLikes is off', async () => {
    await seedSession(padletSession({ allowLikes: false }));
    await assertFails(
      setDoc(
        doc(asStudent(), likePath('sub-1', STUDENT_UID)),
        like('sub-1', STUDENT_UID)
      )
    );
  });

  it('like doc id must be {submissionId}__{uid}', async () => {
    await seedSession(padletSession({ allowLikes: true }));
    await assertFails(
      setDoc(
        doc(asStudent(), likePath('sub-1', OTHER_STUDENT_UID)),
        like('sub-1', STUDENT_UID)
      )
    );
  });

  it('gallery viewer likes on a publicly shared wall', async () => {
    await seedSession(
      padletSession({ allowLikes: true, publiclyShared: true })
    );
    await assertSucceeds(
      setDoc(
        doc(asAnonymous(), likePath('sub-1', ANON_UID)),
        like('sub-1', ANON_UID)
      )
    );
  });

  it('guest on an SSO-only, unshared wall cannot like', async () => {
    await seedSession(padletSession({ allowLikes: true }));
    await assertFails(
      setDoc(
        doc(asAnonymous(), likePath('sub-1', ANON_UID)),
        like('sub-1', ANON_UID)
      )
    );
  });

  it('teacher removes any like', async () => {
    await seedSession(padletSession({ allowLikes: true }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), likePath('sub-1', STUDENT_UID)),
        like('sub-1', STUDENT_UID)
      );
    });
    await assertSucceeds(
      deleteDoc(doc(asTeacher(), likePath('sub-1', STUDENT_UID)))
    );
  });

  it('student comments when allowComments is on', async () => {
    await seedSession(padletSession({ allowComments: true }));
    await assertSucceeds(
      setDoc(doc(asStudent(), commentPath('c-1')), comment('c-1', STUDENT_UID))
    );
  });

  it('comment is denied when allowComments is off', async () => {
    await seedSession(padletSession({ allowComments: false }));
    await assertFails(
      setDoc(doc(asStudent(), commentPath('c-1')), comment('c-1', STUDENT_UID))
    );
  });

  it('reply is denied when allowCommentResponses is off', async () => {
    await seedSession(
      padletSession({ allowComments: true, allowCommentResponses: false })
    );
    await assertFails(
      setDoc(
        doc(asStudent(), commentPath('c-2')),
        comment('c-2', STUDENT_UID, { parentCommentId: 'c-1' })
      )
    );
  });

  it('reply succeeds when allowCommentResponses is on', async () => {
    await seedSession(
      padletSession({ allowComments: true, allowCommentResponses: true })
    );
    await assertSucceeds(
      setDoc(
        doc(asStudent(), commentPath('c-2')),
        comment('c-2', STUDENT_UID, { parentCommentId: 'c-1' })
      )
    );
  });

  it('student reads likes and comments on a visible wall', async () => {
    await seedSession(padletSession({ allowLikes: true, allowComments: true }));
    await assertSucceeds(
      getDocs(
        collection(asStudent(), `activity_wall_sessions/${SESSION_ID}/likes`)
      )
    );
    await assertSucceeds(
      getDocs(
        collection(asStudent(), `activity_wall_sessions/${SESSION_ID}/comments`)
      )
    );
  });
});
