// Firestore security-rules regression for the `/shared_activity_walls/{shareId}`
// match block and the Activity Wall session update used by the gallery share
// flow. The share modal does two writes back-to-back: flips
// `publiclyShared: true` on `activity_wall_sessions/{sessionId}`, then creates
// the share doc. A regression on either rule shows up to the teacher as a
// generic "Missing or insufficient permissions" toast.
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
import { setDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-shared-activity-walls';
const TEACHER_UID = 'teacher-uid';
const OTHER_TEACHER_UID = 'other-teacher-uid';
const ACTIVITY_ID = 'activity-123';
const SESSION_ID = `${TEACHER_UID}_${ACTIVITY_ID}`;
const OTHER_SESSION_ID = `${OTHER_TEACHER_UID}_${ACTIVITY_ID}`;
const SHARE_ID = 'share-xyz';
const COMMENT_ID = 'comment-abc';
const SUBMISSION_ID = 'submission-abc';

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

const asAnonymous = () =>
  testEnv
    .authenticatedContext('anon-uid', {
      firebase: { sign_in_provider: 'anonymous' },
    })
    .firestore();

const sharedDocPayload = (overrides: Record<string, unknown> = {}) => ({
  id: SHARE_ID,
  sessionId: SESSION_ID,
  originalAuthor: TEACHER_UID,
  title: 'Are we there yet?',
  prompt: 'Share where you are.',
  mode: 'text',
  identificationMode: 'anonymous',
  allowComments: false,
  allowCommentResponses: false,
  allowLikes: true,
  expiresAt: null,
  createdAt: 1_000_000,
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `activity_wall_sessions/${SESSION_ID}`), {
      id: SESSION_ID,
      activityId: ACTIVITY_ID,
      teacherUid: TEACHER_UID,
      title: 'Are we there yet?',
      prompt: 'Share where you are.',
      mode: 'text',
      moderationEnabled: false,
      identificationMode: 'anonymous',
      updatedAt: 1_000_000,
    });
  });
});

describe('activity_wall_sessions — publiclyShared update from teacher', () => {
  it('teacher can flip publiclyShared: true on their own session', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), `activity_wall_sessions/${SESSION_ID}`), {
        publiclyShared: true,
      })
    );
  });

  it('anonymous caller cannot flip publiclyShared', async () => {
    await assertFails(
      updateDoc(doc(asAnonymous(), `activity_wall_sessions/${SESSION_ID}`), {
        publiclyShared: true,
      })
    );
  });
});

describe('shared_activity_walls — teacher create', () => {
  it('teacher can create share doc with expected payload', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload()
      )
    );
  });

  it('teacher can create share doc with expiresAt as int', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ expiresAt: 2_000_000 })
      )
    );
  });

  it('anonymous caller cannot create share doc', async () => {
    await assertFails(
      setDoc(
        doc(asAnonymous(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ originalAuthor: 'anon-uid' })
      )
    );
  });

  it('teacher cannot create share doc for another teacher', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ originalAuthor: 'someone-else' })
      )
    );
  });

  it('create denied when payload.id does not match path shareId', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ id: 'a-different-id' })
      )
    );
  });

  it('create denied when sessionId is not owned by the teacher', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ sessionId: OTHER_SESSION_ID })
      )
    );
  });

  it('create denied when an unexpected field is smuggled in', async () => {
    await assertFails(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ adminBackdoor: true })
      )
    );
  });

  it('create accepts optional revoked flag', async () => {
    await assertSucceeds(
      setDoc(
        doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ revoked: false })
      )
    );
  });
});

// Root cause: the READ rule was `if request.auth != null` with no reference
// to `revoked` / `expiresAt` at all, even though those fields exist
// specifically so ActivityWallGalleryView can show a "revoked" / "expired"
// state. The client-side check is purely cosmetic — any direct Firestore
// SDK/REST caller can keep reading a gallery's title/prompt/sessionId/
// identificationMode forever after the teacher revokes or the link expires.
// Sibling collections /shared_boards and /shared_collections already gate
// their substitute-mode reads on expiresAt; this collection was the
// asymmetric one that never got the same treatment.
describe('shared_activity_walls — read gating (expiresAt / revoked)', () => {
  const asViewer = () =>
    testEnv
      .authenticatedContext('viewer-uid', {
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();

  const asAdminUser = () =>
    testEnv
      .authenticatedContext('admin-uid', {
        email: 'admin@example.com',
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'admins/admin@example.com'), {});
    });
  });

  it('viewer can read a live (non-revoked, non-expired) share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ expiresAt: Date.now() + 1_000_000 })
      );
    });
    await assertSucceeds(
      getDoc(doc(asViewer(), `shared_activity_walls/${SHARE_ID}`))
    );
  });

  it('viewer cannot read a revoked share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ revoked: true })
      );
    });
    await assertFails(
      getDoc(doc(asViewer(), `shared_activity_walls/${SHARE_ID}`))
    );
  });

  it('viewer cannot read a share past its expiresAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ expiresAt: Date.now() - 1_000 })
      );
    });
    await assertFails(
      getDoc(doc(asViewer(), `shared_activity_walls/${SHARE_ID}`))
    );
  });

  it('original author can still read their own revoked share (cleanup/management)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ revoked: true })
      );
    });
    await assertSucceeds(
      getDoc(doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`))
    );
  });

  it('admin can still read an expired share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ expiresAt: Date.now() - 1_000 })
      );
    });
    await assertSucceeds(
      getDoc(doc(asAdminUser(), `shared_activity_walls/${SHARE_ID}`))
    );
  });
});

describe('shared_activity_walls — identity-field immutability on update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload()
      );
    });
  });

  it('teacher can revoke their own share (toggle a mutable field)', async () => {
    await assertSucceeds(
      updateDoc(doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`), {
        revoked: true,
      })
    );
  });

  it('teacher cannot retarget sessionId after create', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`), {
        sessionId: OTHER_SESSION_ID,
      })
    );
  });

  it('teacher cannot hijack originalAuthor', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`), {
        originalAuthor: OTHER_TEACHER_UID,
      })
    );
  });

  it('teacher cannot rewrite createdAt', async () => {
    await assertFails(
      updateDoc(doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`), {
        createdAt: 9_999_999,
      })
    );
  });

  it('teacher can delete their own share', async () => {
    await assertSucceeds(
      deleteDoc(doc(asTeacher(), `shared_activity_walls/${SHARE_ID}`))
    );
  });
});

describe('shared_activity_walls/comments — schema lockdown', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ allowComments: true, allowCommentResponses: true })
      );
    });
  });

  const commentPayload = (overrides: Record<string, unknown> = {}) => ({
    id: COMMENT_ID,
    submissionId: SUBMISSION_ID,
    content: 'Looks great!',
    participantLabel: 'Viewer',
    authorUid: 'viewer-uid',
    createdAt: 1_500_000,
    ...overrides,
  });

  const asViewer = () =>
    testEnv
      .authenticatedContext('viewer-uid', {
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();

  it('viewer can post a top-level comment', async () => {
    await assertSucceeds(
      setDoc(
        doc(
          asViewer(),
          `shared_activity_walls/${SHARE_ID}/comments/${COMMENT_ID}`
        ),
        commentPayload()
      )
    );
  });

  it('comment denied when payload.id does not match path commentId', async () => {
    await assertFails(
      setDoc(
        doc(
          asViewer(),
          `shared_activity_walls/${SHARE_ID}/comments/${COMMENT_ID}`
        ),
        commentPayload({ id: 'mismatch' })
      )
    );
  });

  it('comment denied when an unexpected field is smuggled in', async () => {
    await assertFails(
      setDoc(
        doc(
          asViewer(),
          `shared_activity_walls/${SHARE_ID}/comments/${COMMENT_ID}`
        ),
        commentPayload({ pinned: true })
      )
    );
  });
});

describe('shared_activity_walls/likes — schema lockdown', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_activity_walls/${SHARE_ID}`),
        sharedDocPayload({ allowLikes: true })
      );
    });
  });

  const asViewer = () =>
    testEnv
      .authenticatedContext('viewer-uid', {
        firebase: { sign_in_provider: 'anonymous' },
      })
      .firestore();

  const likeId = `${SUBMISSION_ID}__viewer-uid`;
  // Mirrors what ActivityWallGalleryView.tsx writes — the `id` field
  // duplicates the path-derived doc id (per the ActivityWallLike type).
  const likePayload = (overrides: Record<string, unknown> = {}) => ({
    id: likeId,
    submissionId: SUBMISSION_ID,
    authorUid: 'viewer-uid',
    createdAt: 1_600_000,
    ...overrides,
  });

  it('viewer can like a submission once (with id mirroring the path)', async () => {
    await assertSucceeds(
      setDoc(
        doc(asViewer(), `shared_activity_walls/${SHARE_ID}/likes/${likeId}`),
        likePayload()
      )
    );
  });

  it('viewer can also like without the optional id field', async () => {
    const { id: _omit, ...payloadWithoutId } = likePayload();
    void _omit;
    await assertSucceeds(
      setDoc(
        doc(asViewer(), `shared_activity_walls/${SHARE_ID}/likes/${likeId}`),
        payloadWithoutId
      )
    );
  });

  it('like denied when an unexpected field is smuggled in', async () => {
    await assertFails(
      setDoc(
        doc(asViewer(), `shared_activity_walls/${SHARE_ID}/likes/${likeId}`),
        likePayload({ weight: 5 })
      )
    );
  });
});
