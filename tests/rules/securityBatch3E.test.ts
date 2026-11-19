// Security batch 3E: a wall post or comment from a student whose token carries a first name must
// show that name or 'Student'; guests, teachers and tokens minted before the claim existed are unaffected.
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

  it("allows a post under the generic 'Student' label (a tab without the saved name)", async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
        post(STUDENT_UID, { participantLabel: 'Student' })
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

  it("allows a comment under the generic 'Student' label", async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), commentPath('c-1')),
        comment(STUDENT_UID, { participantLabel: 'Student' })
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

describe('shared activity wall gallery — student name on comments', () => {
  const SHARE_ID = 'share-1';
  const sharePath = `shared_activity_walls/${SHARE_ID}`;
  const galleryComment = (overrides: Record<string, unknown> = {}) => ({
    id: 'g-1',
    submissionId: 'sub-1',
    parentCommentId: null,
    content: 'Nice work',
    participantLabel: 'Sam',
    authorUid: STUDENT_UID,
    createdAt: 1_700_000,
    ...overrides,
  });

  beforeEach(async () => {
    await seed(sharePath, {
      id: SHARE_ID,
      sessionId: SESSION_ID,
      originalAuthor: TEACHER_UID,
      title: 'Wall',
      prompt: 'p',
      mode: 'text',
      identificationMode: 'name',
      allowComments: true,
      allowCommentResponses: false,
      allowLikes: true,
      expiresAt: null,
      createdAt: 1_000_000,
    });
  });

  const path = `${sharePath}/comments/g-1`;

  it('allows the first name on the token, and the generic label', async () => {
    await assertSucceeds(
      setDoc(doc(asStudent({ firstName: 'Sam' }), path), galleryComment())
    );
    await assertSucceeds(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), `${sharePath}/comments/g-2`),
        galleryComment({ id: 'g-2', participantLabel: 'Student' })
      )
    );
  });

  it('denies a classmate name', async () => {
    await assertFails(
      setDoc(
        doc(asStudent({ firstName: 'Sam' }), path),
        galleryComment({ participantLabel: 'Riley' })
      )
    );
  });

  it('leaves guests and unclaimed tokens alone', async () => {
    await assertSucceeds(
      setDoc(
        doc(asGuest(), path),
        galleryComment({ authorUid: 'guest-uid', participantLabel: 'Visitor' })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(asStudent(), `${sharePath}/comments/g-3`),
        galleryComment({ id: 'g-3', participantLabel: 'Riley' })
      )
    );
  });
});

// A wall that hides names stores only a placeholder label from students and guests.
describe('activity wall — name-hidden wall stores no student name', () => {
  const asTeacher = () =>
    testEnv
      .authenticatedContext(TEACHER_UID, {
        email: 'teacher@example.com',
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();

  const hide = (overrides: Record<string, unknown> = {}) =>
    seed(
      `activity_wall_sessions/${SESSION_ID}`,
      session({ showNames: false, ...overrides })
    );

  describe('posts', () => {
    it('denies the first name on the token, any other name and a guest name', async () => {
      await hide();
      await assertFails(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
          post(STUDENT_UID, { participantLabel: 'Sam' })
        )
      );
      await assertFails(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
          post(STUDENT_UID, { participantLabel: 'Riley' })
        )
      );
      await assertFails(
        setDoc(
          doc(asStudent(), submissionPath('sub-2')),
          post(STUDENT_UID, { id: 'sub-2', participantLabel: 'Riley' })
        )
      );
      await assertFails(
        setDoc(
          doc(asGuest(), submissionPath('sub-3')),
          post('guest-uid', {
            id: 'sub-3',
            isGuest: true,
            participantLabel: 'Visitor',
          })
        )
      );
    });

    it('denies a PIN-style label on a name-hidden wall', async () => {
      await hide({ identificationMode: 'pin' });
      await assertFails(
        setDoc(
          doc(asStudent(), submissionPath('sub-1')),
          post(STUDENT_UID, { participantLabel: 'PIN: 1234' })
        )
      );
    });

    it('allows the anonymous placeholder, the generic labels and no label', async () => {
      await hide();
      const db = asStudent({ firstName: 'Sam' });
      await assertSucceeds(
        setDoc(
          doc(db, submissionPath('sub-1')),
          post(STUDENT_UID, { participantLabel: 'Anonymous' })
        )
      );
      await assertSucceeds(
        setDoc(
          doc(db, submissionPath('sub-2')),
          post(STUDENT_UID, { id: 'sub-2', participantLabel: 'Student' })
        )
      );
      await assertSucceeds(
        setDoc(
          doc(asGuest(), submissionPath('sub-3')),
          post('guest-uid', {
            id: 'sub-3',
            isGuest: true,
            participantLabel: 'Guest',
          })
        )
      );
      const { participantLabel: _omit, ...noLabel } = post(STUDENT_UID, {
        id: 'sub-4',
      });
      await assertSucceeds(setDoc(doc(db, submissionPath('sub-4')), noLabel));
    });

    it('treats a session with no showNames and a non-name mode as hidden', async () => {
      const { showNames: _drop, ...legacy } = session();
      await seed(`activity_wall_sessions/${SESSION_ID}`, legacy);
      await assertFails(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
          post(STUDENT_UID)
        )
      );
    });

    it('treats a session with no showNames and a name mode as shown', async () => {
      const { showNames: _drop, ...legacy } = session({
        identificationMode: 'name',
      });
      await seed(`activity_wall_sessions/${SESSION_ID}`, legacy);
      await assertSucceeds(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
          post(STUDENT_UID)
        )
      );
    });

    it('lets the teacher post under a name on a name-hidden wall', async () => {
      await hide();
      await assertSucceeds(
        setDoc(
          doc(asTeacher(), submissionPath('sub-1')),
          post(TEACHER_UID, {
            authorRole: 'teacher',
            participantLabel: 'Ms. Lee',
          })
        )
      );
    });

    it('still lets a student show the first name once the wall shows names', async () => {
      await hide({ showNames: true });
      await assertSucceeds(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), submissionPath('sub-1')),
          post(STUDENT_UID)
        )
      );
    });
  });

  describe('comments', () => {
    beforeEach(async () => {
      await hide();
      await seed(submissionPath('sub-1'), post('other-uid'));
    });

    it('denies the first name on the token and any other name', async () => {
      await assertFails(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), commentPath('c-1')),
          comment(STUDENT_UID, { participantLabel: 'Sam' })
        )
      );
      await assertFails(
        setDoc(
          doc(asStudent(), commentPath('c-2')),
          comment(STUDENT_UID, { id: 'c-2', participantLabel: 'Riley' })
        )
      );
      await assertFails(
        setDoc(
          doc(asGuest(), commentPath('c-3')),
          comment('guest-uid', { id: 'c-3', participantLabel: 'Visitor' })
        )
      );
    });

    it('allows the anonymous placeholder and the generic labels', async () => {
      const db = asStudent({ firstName: 'Sam' });
      await assertSucceeds(
        setDoc(
          doc(db, commentPath('c-1')),
          comment(STUDENT_UID, { participantLabel: 'Anonymous' })
        )
      );
      await assertSucceeds(
        setDoc(
          doc(db, commentPath('c-2')),
          comment(STUDENT_UID, { id: 'c-2', participantLabel: 'Student' })
        )
      );
    });

    it('lets the owning teacher comment under a name', async () => {
      await assertSucceeds(
        setDoc(
          doc(asTeacher(), commentPath('c-1')),
          comment(TEACHER_UID, { participantLabel: 'Ms. Lee' })
        )
      );
    });
  });

  describe('shared gallery comments', () => {
    const SHARE_ID = 'share-hidden';
    const sharePath = `shared_activity_walls/${SHARE_ID}`;
    const galleryComment = (overrides: Record<string, unknown> = {}) => ({
      id: 'g-1',
      submissionId: 'sub-1',
      parentCommentId: null,
      content: 'Nice work',
      participantLabel: 'Anonymous',
      authorUid: STUDENT_UID,
      createdAt: 1_700_000,
      ...overrides,
    });

    beforeEach(async () => {
      await hide();
      await seed(sharePath, {
        id: SHARE_ID,
        sessionId: SESSION_ID,
        originalAuthor: TEACHER_UID,
        title: 'Wall',
        prompt: 'p',
        mode: 'text',
        identificationMode: 'name',
        allowComments: true,
        allowCommentResponses: false,
        allowLikes: true,
        expiresAt: null,
        createdAt: 1_000_000,
      });
    });

    it('denies a real name and allows the placeholder', async () => {
      await assertFails(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), `${sharePath}/comments/g-1`),
          galleryComment({ participantLabel: 'Sam' })
        )
      );
      await assertSucceeds(
        setDoc(
          doc(asStudent({ firstName: 'Sam' }), `${sharePath}/comments/g-2`),
          galleryComment({ id: 'g-2' })
        )
      );
    });
  });
});
