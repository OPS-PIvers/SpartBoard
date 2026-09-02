// Firestore security-rules coverage for the Padlet-lite Activity Wall rebuild
// (plan item P1-4): submission create gating (guests, closed wall, per-student
// cap, submission types), student self-edit/delete toggles, the archive-field
// update whitelist, and the teacher-minted gallery short link.
//
// Backward compatibility is the load-bearing case here: the deployed client
// mirrors sessions WITHOUT a `layout` field and posts submissions with no
// `type`/`authorUid`, so every new gate is opt-in on `layout` existing.
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
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-activity-wall-submissions';
const TEACHER_UID = 'teacher-uid';
const ACTIVITY_ID = 'activity-123';
const SESSION_ID = `${TEACHER_UID}_${ACTIVITY_ID}`;
const STUDENT_UID = 'student-uid';
const OTHER_STUDENT_UID = 'other-student-uid';
const ANON_UID = 'anon-uid';
const NON_STUDENT_UID = 'non-student-uid';

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

// A signed-in Google user with no studentRole claim (e.g. a teacher opening a
// colleague's wall link, or a staff member).
const asSignedInNonStudent = (uid = NON_STUDENT_UID) =>
  testEnv
    .authenticatedContext(uid, {
      email: 'someone@example.com',
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore();

const asAnonymous = () =>
  testEnv
    .authenticatedContext(ANON_UID, {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const legacySession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  activityId: ACTIVITY_ID,
  teacherUid: TEACHER_UID,
  title: 'Are we there yet?',
  prompt: 'Share where you are.',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  updatedAt: 1_000_000,
  ...overrides,
});

const padletSession = (overrides: Record<string, unknown> = {}) => ({
  ...legacySession(),
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

const seedSubmission = async (
  submissionId: string,
  data: Record<string, unknown>
) => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(
        ctx.firestore(),
        `activity_wall_sessions/${SESSION_ID}/submissions/${submissionId}`
      ),
      data
    );
  });
};

const submissionPath = (submissionId: string) =>
  `activity_wall_sessions/${SESSION_ID}/submissions/${submissionId}`;

const newSubmission = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  activityId: ACTIVITY_ID,
  content: 'Hello wall',
  submittedAt: 1_700_000,
  status: 'approved',
  type: 'text',
  authorUid: STUDENT_UID,
  isGuest: false,
  participantLabel: 'Sam',
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

describe('activity wall submissions — legacy compatibility', () => {
  it('legacy-shaped create on a legacy session still passes', async () => {
    await seedSession(legacySession());
    await assertSucceeds(
      setDoc(doc(asAnonymous(), submissionPath('legacy-1')), {
        id: 'legacy-1',
        activityId: ACTIVITY_ID,
        content: 'no type, no authorUid',
        submittedAt: 1_700_000,
        status: 'approved',
        participantLabel: 'Guest',
      })
    );
  });

  it('legacy session ignores the new guest gate', async () => {
    await seedSession(legacySession({ allowGuests: false }));
    await assertSucceeds(
      setDoc(doc(asAnonymous(), submissionPath('legacy-2')), {
        id: 'legacy-2',
        content: 'still fine',
        submittedAt: 1_700_000,
        status: 'approved',
      })
    );
  });

  it('legacy photo create with storage metadata still passes', async () => {
    await seedSession(legacySession());
    await assertSucceeds(
      setDoc(doc(asAnonymous(), submissionPath('legacy-3')), {
        id: 'legacy-3',
        content: 'https://example.com/photo.jpg',
        submittedAt: 1_700_000,
        status: 'approved',
        storagePath: 'activity_wall_photos/x/y',
        archiveStatus: 'firebase',
      })
    );
  });
});

describe('activity wall submissions — padlet create gating', () => {
  it('student can post a text submission on an open wall', async () => {
    await seedSession(padletSession());
    await assertSucceeds(
      setDoc(doc(asStudent(), submissionPath('sub-1')), newSubmission())
    );
  });

  it('create denied when authorUid does not match the caller', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ authorUid: OTHER_STUDENT_UID })
      )
    );
  });

  it('create denied when authorUid is missing on a padlet session', async () => {
    await seedSession(padletSession());
    const { authorUid: _omit, ...withoutAuthor } = newSubmission();
    void _omit;
    await assertFails(
      setDoc(doc(asStudent(), submissionPath('sub-1')), withoutAuthor)
    );
  });

  it('create denied when the wall is closed', async () => {
    await seedSession(padletSession({ acceptingResponses: false }));
    await assertFails(
      setDoc(doc(asStudent(), submissionPath('sub-1')), newSubmission())
    );
  });

  it('anonymous guest denied when allowGuests is false', async () => {
    await seedSession(padletSession({ allowGuests: false }));
    await assertFails(
      setDoc(
        doc(asAnonymous(), submissionPath('sub-1')),
        newSubmission({ authorUid: ANON_UID, isGuest: true })
      )
    );
  });

  it('anonymous guest allowed when allowGuests is true', async () => {
    await seedSession(padletSession({ allowGuests: true }));
    await assertSucceeds(
      setDoc(
        doc(asAnonymous(), submissionPath('sub-1')),
        newSubmission({ authorUid: ANON_UID, isGuest: true })
      )
    );
  });

  it('signed-in student is unaffected by allowGuests: false', async () => {
    await seedSession(padletSession({ allowGuests: false }));
    await assertSucceeds(
      setDoc(doc(asStudent(), submissionPath('sub-1')), newSubmission())
    );
  });
});

describe('activity wall submissions — type gating', () => {
  it('allows a photo when the photo type is enabled', async () => {
    await seedSession(padletSession());
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({
          type: 'photo',
          content: 'https://example.com/p.jpg',
          storagePath: 'activity_wall_media/a/b/c.jpg',
          archiveStatus: 'firebase',
          fileName: 'c.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1234,
        })
      )
    );
  });

  it('denies a link when the link type is disabled', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ type: 'link', content: 'https://example.com' })
      )
    );
  });

  it('denies an unknown type', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ type: 'sticker' })
      )
    );
  });

  it('denies a word submission outside the wordcloud layout', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ type: 'word', content: 'curious' })
      )
    );
  });

  it('denies a text submission on a wordcloud wall', async () => {
    await seedSession(padletSession({ layout: 'wordcloud' }));
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ type: 'text' })
      )
    );
  });

  it('allows a word submission on a wordcloud wall', async () => {
    await seedSession(padletSession({ layout: 'wordcloud' }));
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ type: 'word', content: 'curious' })
      )
    );
  });
});

describe('activity wall submissions — per-student cap', () => {
  beforeEach(async () => {
    await seedSession(padletSession({ maxPostsPerStudent: 3 }));
  });

  it('allows slot 0', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath(`${STUDENT_UID}__0`)),
        newSubmission({ id: `${STUDENT_UID}__0` })
      )
    );
  });

  it('allows the last slot under the cap', async () => {
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath(`${STUDENT_UID}__2`)),
        newSubmission({ id: `${STUDENT_UID}__2` })
      )
    );
  });

  it('denies a slot at the cap', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath(`${STUDENT_UID}__3`)),
        newSubmission({ id: `${STUDENT_UID}__3` })
      )
    );
  });

  it('denies a zero-padded slot 0 (leading-zero cap bypass)', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath(`${STUDENT_UID}__00`)),
        newSubmission({ id: `${STUDENT_UID}__00` })
      )
    );
  });

  it('denies a zero-padded slot 1 (leading-zero cap bypass)', async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath(`${STUDENT_UID}__01`)),
        newSubmission({ id: `${STUDENT_UID}__01` })
      )
    );
  });

  it('denies a random doc id when a cap is set', async () => {
    await assertFails(
      setDoc(doc(asStudent(), submissionPath('random-id')), newSubmission())
    );
  });

  it("denies writing into another student's slot", async () => {
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath(`${OTHER_STUDENT_UID}__0`)),
        newSubmission({ id: `${OTHER_STUDENT_UID}__0` })
      )
    );
  });

  it('allows a random doc id when the cap is unlimited', async () => {
    await seedSession(padletSession({ maxPostsPerStudent: 0 }));
    await assertSucceeds(
      setDoc(doc(asStudent(), submissionPath('random-id')), newSubmission())
    );
  });
});

describe('activity wall submissions — student edit and delete toggles', () => {
  const existing = (overrides: Record<string, unknown> = {}) =>
    newSubmission({
      id: 'sub-1',
      authorUid: STUDENT_UID,
      status: 'approved',
      ...overrides,
    });

  it('author can edit when allowStudentEdit is true', async () => {
    await seedSession(padletSession({ allowStudentEdit: true }));
    await seedSubmission('sub-1', existing());
    await assertSucceeds(
      updateDoc(doc(asStudent(), submissionPath('sub-1')), {
        content: 'edited',
        editedAt: 1_800_000,
      })
    );
  });

  it('author cannot edit when allowStudentEdit is false', async () => {
    await seedSession(padletSession({ allowStudentEdit: false }));
    await seedSubmission('sub-1', existing());
    await assertFails(
      updateDoc(doc(asStudent(), submissionPath('sub-1')), {
        content: 'edited',
      })
    );
  });

  it('author cannot edit once the wall is closed', async () => {
    await seedSession(
      padletSession({ allowStudentEdit: true, acceptingResponses: false })
    );
    await seedSubmission('sub-1', existing());
    await assertFails(
      updateDoc(doc(asStudent(), submissionPath('sub-1')), {
        content: 'edited',
      })
    );
  });

  it('author cannot flip status past the moderation queue', async () => {
    await seedSession(
      padletSession({ allowStudentEdit: true, moderationEnabled: true })
    );
    await seedSubmission('sub-1', existing({ status: 'pending' }));
    await assertFails(
      updateDoc(doc(asStudent(), submissionPath('sub-1')), {
        status: 'approved',
      })
    );
  });

  it('a non-author student cannot edit', async () => {
    await seedSession(padletSession({ allowStudentEdit: true }));
    await seedSubmission('sub-1', existing());
    await assertFails(
      updateDoc(doc(asStudent(OTHER_STUDENT_UID), submissionPath('sub-1')), {
        content: 'edited',
      })
    );
  });

  it('author can delete when allowStudentDelete is true', async () => {
    await seedSession(padletSession({ allowStudentDelete: true }));
    await seedSubmission('sub-1', existing());
    await assertSucceeds(deleteDoc(doc(asStudent(), submissionPath('sub-1'))));
  });

  it('author cannot delete when allowStudentDelete is false', async () => {
    await seedSession(padletSession({ allowStudentDelete: false }));
    await seedSubmission('sub-1', existing());
    await assertFails(deleteDoc(doc(asStudent(), submissionPath('sub-1'))));
  });

  it('teacher can always delete', async () => {
    await seedSession(padletSession());
    await seedSubmission('sub-1', existing());
    await assertSucceeds(deleteDoc(doc(asTeacher(), submissionPath('sub-1'))));
  });
});

describe('activity wall submissions — owner update whitelist', () => {
  beforeEach(async () => {
    await seedSession(padletSession({ moderationEnabled: true }));
    await seedSubmission(
      'sub-1',
      newSubmission({ id: 'sub-1', status: 'pending' })
    );
  });

  it('teacher can approve a pending submission', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), {
        status: 'approved',
      })
    );
  });

  it('teacher can pin and reorder a submission', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), {
        pinned: true,
        order: 1.5,
        sectionId: 'col-2',
        cellKey: 'row-1|col-2',
      })
    );
  });

  it('teacher can write every archive-pipeline field', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), {
        archiveStatus: 'archived',
        archiveStartedAt: 1_800_000,
        archivedAt: 1_800_100,
        attemptCount: 2,
        lastAttemptAt: 1_800_050,
        storageCleanupPending: true,
        drivePermission: 'domain',
        driveFileId: 'file-abc',
        driveUrl: 'https://drive.google.com/file/d/file-abc/view',
        archiveError: 'needs-consent',
      })
    );
  });

  it('teacher can mark a submission lost', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), {
        archiveStatus: 'lost',
      })
    );
  });

  it('teacher cannot smuggle an unknown field', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), {
        adminBackdoor: true,
      })
    );
  });
});

describe('activity wall submissions — size bounds', () => {
  it('denies a create with an oversize title', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ title: 'x'.repeat(201) })
      )
    );
  });

  it('allows a create with a title at the bound', async () => {
    await seedSession(padletSession());
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ title: 'x'.repeat(200) })
      )
    );
  });

  it('denies an owner update that grows the title past the bound', async () => {
    await seedSession(padletSession());
    await seedSubmission('sub-1', newSubmission({ id: 'sub-1' }));
    await assertFails(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), {
        title: 'x'.repeat(201),
      })
    );
  });

  it('denies a linkPreview carrying an unknown key', async () => {
    await seedSession(padletSession({ allowedTypes: { link: true } }));
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({
          type: 'link',
          content: 'https://example.com',
          linkPreview: { title: 'ok', script: '<img>' },
        })
      )
    );
  });

  it('denies a linkPreview with an oversize description', async () => {
    await seedSession(padletSession({ allowedTypes: { link: true } }));
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({
          type: 'link',
          content: 'https://example.com',
          linkPreview: { description: 'x'.repeat(501) },
        })
      )
    );
  });

  it('allows a well-formed linkPreview', async () => {
    await seedSession(padletSession({ allowedTypes: { link: true } }));
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({
          type: 'link',
          content: 'https://example.com',
          linkPreview: {
            title: 'Example',
            description: 'A page',
            image: 'https://example.com/og.png',
            domain: 'example.com',
            videoId: 'abc123',
          },
        })
      )
    );
  });
});

describe('activity wall submissions — owner update type checks', () => {
  beforeEach(async () => {
    await seedSession(padletSession());
    await seedSubmission('sub-1', newSubmission({ id: 'sub-1' }));
  });

  it('denies a type-confused pinned value', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), { pinned: 'yes' })
    );
  });

  it('denies a type-confused order value', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), { order: 'first' })
    );
  });

  it('denies rewriting type to an unknown value', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), submissionPath('sub-1')), { type: 'sticker' })
    );
  });
});

describe('activity wall submissions — author self-read', () => {
  beforeEach(async () => {
    await seedSession(padletSession());
    await seedSubmission(
      'sub-mine',
      newSubmission({ id: 'sub-mine', authorUid: STUDENT_UID })
    );
    await seedSubmission(
      'sub-theirs',
      newSubmission({ id: 'sub-theirs', authorUid: OTHER_STUDENT_UID })
    );
  });

  it('author can get their own post on a non-public wall', async () => {
    await assertSucceeds(getDoc(doc(asStudent(), submissionPath('sub-mine'))));
  });

  it('author can query their own posts with a matching authorUid filter', async () => {
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

  it("a different student cannot get another student's post on a non-public wall", async () => {
    await assertFails(getDoc(doc(asStudent(), submissionPath('sub-theirs'))));
  });

  it('a student query without the authorUid filter is denied', async () => {
    await assertFails(
      getDocs(
        collection(
          asStudent(),
          `activity_wall_sessions/${SESSION_ID}/submissions`
        )
      )
    );
  });
});

describe('activity wall submissions — padlet access gate', () => {
  it('signed-in non-student denied on an SSO-only wall', async () => {
    await seedSession(padletSession({ allowGuests: false }));
    await assertFails(
      setDoc(
        doc(asSignedInNonStudent(), submissionPath('sub-1')),
        newSubmission({ authorUid: NON_STUDENT_UID })
      )
    );
  });

  it('signed-in non-student allowed on a guest wall', async () => {
    await seedSession(padletSession({ allowGuests: true }));
    await assertSucceeds(
      setDoc(
        doc(asSignedInNonStudent(), submissionPath('sub-1')),
        newSubmission({ authorUid: NON_STUDENT_UID })
      )
    );
  });

  it('studentRole user allowed on an SSO-only wall', async () => {
    await seedSession(padletSession({ allowGuests: false }));
    await assertSucceeds(
      setDoc(doc(asStudent(), submissionPath('sub-1')), newSubmission())
    );
  });
});

describe('activity wall submissions — create-time moderation fields', () => {
  it('create with pinned: true is denied', async () => {
    await seedSession(padletSession());
    await assertFails(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ pinned: true })
      )
    );
  });

  it('create with order allowed on a timeline session', async () => {
    await seedSession(padletSession({ layout: 'timeline' }));
    await assertSucceeds(
      setDoc(
        doc(asStudent(), submissionPath('sub-1')),
        newSubmission({ order: 1.5 })
      )
    );
  });

  it('student self-edit cannot set pinned', async () => {
    await seedSession(padletSession({ allowStudentEdit: true }));
    await seedSubmission('sub-1', newSubmission({ id: 'sub-1' }));
    await assertFails(
      updateDoc(doc(asStudent(), submissionPath('sub-1')), { pinned: true })
    );
  });
});

describe('activity wall submissions — published gallery hides pending posts', () => {
  beforeEach(async () => {
    await seedSession(padletSession({ publiclyShared: true }));
    await seedSubmission(
      'sub-pending',
      newSubmission({ id: 'sub-pending', status: 'pending' })
    );
    await seedSubmission(
      'sub-approved',
      newSubmission({ id: 'sub-approved', status: 'approved' })
    );
  });

  it('anonymous gallery viewer cannot get a pending post', async () => {
    await assertFails(
      getDoc(doc(asAnonymous(), submissionPath('sub-pending')))
    );
  });

  it('anonymous gallery viewer can get an approved post', async () => {
    await assertSucceeds(
      getDoc(doc(asAnonymous(), submissionPath('sub-approved')))
    );
  });

  it('a status-filtered gallery query succeeds', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(
            asAnonymous(),
            `activity_wall_sessions/${SESSION_ID}/submissions`
          ),
          where('status', '==', 'approved')
        )
      )
    );
  });

  it('an unfiltered gallery query is denied', async () => {
    await assertFails(
      getDocs(
        collection(
          asAnonymous(),
          `activity_wall_sessions/${SESSION_ID}/submissions`
        )
      )
    );
  });

  it('the owning teacher still reads pending posts', async () => {
    await assertSucceeds(
      getDoc(doc(asTeacher(), submissionPath('sub-pending')))
    );
  });
});

describe('short_links — teacher-minted gallery codes', () => {
  const shortLink = (overrides: Record<string, unknown> = {}) => ({
    code: 'abc123',
    destination: 'https://spartboard.web.app/activity-wall/gallery/share-xyz',
    createdBy: TEACHER_UID,
    createdByEmail: 'teacher@example.com',
    createdAt: 1_700_000,
    clicks: 0,
    ...overrides,
  });

  it('teacher can mint a gallery short link', async () => {
    await assertSucceeds(
      setDoc(doc(asTeacher(), 'short_links/abc123'), shortLink())
    );
  });

  it('teacher cannot mint a link to an arbitrary destination', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), 'short_links/abc123'),
        shortLink({ destination: 'https://evil.example.com/phish' })
      )
    );
  });

  it('teacher cannot mint a gallery path on a foreign host', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), 'short_links/abc123'),
        shortLink({
          destination:
            'https://evil.example.com/activity-wall/gallery/share-xyz',
        })
      )
    );
  });

  it('teacher cannot mint a look-alike host', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), 'short_links/abc123'),
        shortLink({
          destination:
            'https://spartboard.web.app.evil.com/activity-wall/gallery/share-xyz',
        })
      )
    );
  });

  it('teacher can mint a dev preview-channel gallery link', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), 'short_links/abc123'),
        shortLink({
          destination:
            'https://spartboard--dev-paul-1a2b3c4d.web.app/activity-wall/gallery/share-xyz',
        })
      )
    );
  });

  it('teacher can mint a firebaseapp.com gallery link', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), 'short_links/abc123'),
        shortLink({
          destination:
            'https://spartboard.firebaseapp.com/activity-wall/gallery/share-xyz',
        })
      )
    );
  });

  it('teacher cannot mint a link attributed to someone else', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), 'short_links/abc123'),
        shortLink({ createdBy: OTHER_STUDENT_UID })
      )
    );
  });

  it('anonymous caller cannot mint a gallery short link', async () => {
    await assertFails(
      setDoc(
        doc(asAnonymous(), 'short_links/abc123'),
        shortLink({ createdBy: ANON_UID, createdByEmail: '' })
      )
    );
  });
});
