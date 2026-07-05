// Firestore security-rules regression for the `/shared_boards/{shareId}`
// match block introduced with the live-share board picker. The rules carry
// four separate update branches (host/admin, collaborator, self-join,
// self-leave) each with its own immutability invariants. A single CEL edit
// can silently relax any of them — most dangerously the
// `originalAuthorName` immutability check that prevents a Synced
// collaborator from spoofing the host display name shown in everyone's
// import-picker / banner UI.
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
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
} from 'firebase/firestore';

const PROJECT_ID = 'spartboard-shared-boards';
const SHARE_ID = 'share-rules-test';
const HOST_UID = 'host-uid';
const COLLAB_UID = 'collaborator-uid';
const VIEWER_UID = 'viewer-uid';
const STRANGER_UID = 'stranger-uid';

const ORONO_UID = 'orono-teacher-uid';
const ORONO_EMAIL = 'teacher@orono.k12.mn.us';
const ADMIN_UID = 'admin-uid-sb';
const ADMIN_EMAIL = 'admin@external-district.org';

const NOW_MS = Date.now();
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000; // 1209600000

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

const asHost = () =>
  testEnv
    .authenticatedContext(HOST_UID, { email: 'host@example.com' })
    .firestore();

const asCollab = () =>
  testEnv
    .authenticatedContext(COLLAB_UID, { email: 'collab@example.com' })
    .firestore();

const asViewer = () =>
  testEnv
    .authenticatedContext(VIEWER_UID, { email: 'viewer@example.com' })
    .firestore();

const asStranger = () =>
  testEnv
    .authenticatedContext(STRANGER_UID, { email: 'stranger@example.com' })
    .firestore();

const asOronoTeacher = () =>
  testEnv.authenticatedContext(ORONO_UID, { email: ORONO_EMAIL }).firestore();

// isAdmin() matches on request.auth.token.email.lower(), so the token needs an email.
const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL }).firestore();

const seededShare = (overrides: Record<string, unknown> = {}) => ({
  name: 'Shared Board',
  background: 'bg-slate-800',
  widgets: [],
  sharedAt: 1000,
  originalAuthor: HOST_UID,
  originalAuthorName: 'Host Display',
  participants: {
    [COLLAB_UID]: { role: 'collaborator', joinedAt: 1000 },
    [VIEWER_UID]: { role: 'viewer', joinedAt: 1000 },
  },
  updatedAt: 1000,
  updatedBy: HOST_UID,
  ...overrides,
});

/** A valid substitute-mode `/shared_boards` document. */
const subShareDoc = (overrides: Record<string, unknown> = {}) => ({
  name: 'Sub Board',
  background: 'bg-slate-800',
  widgets: [],
  sharedAt: 1000,
  originalAuthor: HOST_UID,
  originalAuthorName: 'Host Display',
  intendedMode: 'substitute',
  buildingId: 'ohs',
  expiresAt: NOW_MS + FOURTEEN_DAYS_MS - 60_000, // 1 minute under the cap
  initialState: [],
  updatedAt: 1000,
  updatedBy: HOST_UID,
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
    await setDoc(
      doc(ctx.firestore(), `shared_boards/${SHARE_ID}`),
      seededShare()
    );
    // Seed the admin doc so isAdmin() resolves for ADMIN_EMAIL.
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      email: ADMIN_EMAIL,
    });
  });
});

describe('shared_boards — read', () => {
  it('any authenticated user can read a known shareId', async () => {
    // The shareId is an unguessable Firestore-generated id, so reads are
    // gated only on auth (matches the existing posture).
    await assertSucceeds(
      getDoc(doc(asStranger(), `shared_boards/${SHARE_ID}`))
    );
  });
});

describe('shared_boards — read, substitute share', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_boards/${SHARE_ID}`),
        subShareDoc()
      );
    });
  });

  it('non-Orono email is denied on substitute share', async () => {
    await assertFails(getDoc(doc(asStranger(), `shared_boards/${SHARE_ID}`)));
  });

  it('Orono email is allowed on substitute share', async () => {
    await assertSucceeds(
      getDoc(doc(asOronoTeacher(), `shared_boards/${SHARE_ID}`))
    );
  });

  it('a spoofed email with an embedded @ before the orono domain is denied', async () => {
    // Regression: `.*@orono...` let `.*` absorb an embedded `@`, so a token
    // email like `x@evil.com@orono.k12.mn.us` matched the old regex. `[^@]+`
    // requires the local part to be @-free, closing the gap.
    const spoofedDb = testEnv
      .authenticatedContext('spoofed-uid', {
        email: 'x@evil.com@orono.k12.mn.us',
      })
      .firestore();
    await assertFails(getDoc(doc(spoofedDb, `shared_boards/${SHARE_ID}`)));
  });

  it('host can always read their own substitute share', async () => {
    await assertSucceeds(getDoc(doc(asHost(), `shared_boards/${SHARE_ID}`)));
  });

  it('admin can read substitute share', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), `shared_boards/${SHARE_ID}`)));
  });
});

// Regression: the @orono.k12.mn.us read branch had no expiresAt cutoff.
describe('shared_boards — read, substitute share expiry', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_boards/${SHARE_ID}`),
        subShareDoc({ expiresAt: NOW_MS - 60_000 }) // 1 minute past
      );
    });
  });

  it('Orono email is denied on expired substitute share', async () => {
    await assertFails(
      getDoc(doc(asOronoTeacher(), `shared_boards/${SHARE_ID}`))
    );
  });

  it('host can still read their own expired substitute share', async () => {
    await assertSucceeds(getDoc(doc(asHost(), `shared_boards/${SHARE_ID}`)));
  });

  it('admin can read expired substitute share', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), `shared_boards/${SHARE_ID}`)));
  });
});

describe('shared_boards — host update', () => {
  it('host can update content fields', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), `shared_boards/${SHARE_ID}`), {
        name: 'Renamed by host',
        widgets: [{ id: 'w1' }],
        updatedAt: 2000,
        updatedBy: HOST_UID,
      })
    );
  });

  it('host can rewrite the participants map (kick/promote)', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), `shared_boards/${SHARE_ID}`), {
        [`participants.${COLLAB_UID}`]: {
          role: 'viewer',
          joinedAt: 1500,
        },
        updatedAt: 2000,
        updatedBy: HOST_UID,
      })
    );
  });

  it('host can delete the shared doc (revoke)', async () => {
    await assertSucceeds(deleteDoc(doc(asHost(), `shared_boards/${SHARE_ID}`)));
  });

  it('non-host cannot delete the shared doc', async () => {
    await assertFails(deleteDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`)));
  });
});

describe('shared_boards — collaborator update', () => {
  it('collaborator can update content (Synced bidirectional)', async () => {
    await assertSucceeds(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        name: 'Renamed by collab',
        widgets: [{ id: 'w1' }],
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('collaborator CANNOT change originalAuthor (host uid spoof)', async () => {
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        originalAuthor: COLLAB_UID,
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('collaborator CANNOT change originalAuthorName (host display-name spoof)', async () => {
    // This is the spoofing attack the immutability check at
    // firestore.rules:611 prevents. Without it, a Synced collaborator
    // could rewrite the host display name shown in every other
    // participant's import-picker and ShareStatusBanner UI.
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        originalAuthorName: 'Imposter',
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('collaborator CANNOT mutate the participants map', async () => {
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 9999,
        },
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('collaborator CANNOT change sharedAt', async () => {
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        sharedAt: 9999,
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });
});

describe('shared_boards — viewer (read-only)', () => {
  it('viewer CANNOT update content', async () => {
    // View-only mode is one-way by design — the viewer's role check on
    // the collaborator update branch fails, and no other branch matches.
    await assertFails(
      updateDoc(doc(asViewer(), `shared_boards/${SHARE_ID}`), {
        name: 'Hijacked by viewer',
        updatedAt: 2000,
        updatedBy: VIEWER_UID,
      })
    );
  });
});

describe('shared_boards — self-join', () => {
  it('stranger can append themselves to participants (Synced join)', async () => {
    await assertSucceeds(
      updateDoc(doc(asStranger(), `shared_boards/${SHARE_ID}`), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
  });

  it('stranger can append themselves as viewer (View-Only join)', async () => {
    await assertSucceeds(
      updateDoc(doc(asStranger(), `shared_boards/${SHARE_ID}`), {
        [`participants.${STRANGER_UID}`]: {
          role: 'viewer',
          joinedAt: 2000,
        },
      })
    );
  });

  it('stranger CANNOT add ANOTHER user during self-join', async () => {
    // The diff().affectedKeys().hasOnly([uid]) clause prevents a caller
    // from sneaking unrelated participants into the same write.
    await assertFails(
      updateDoc(doc(asStranger(), `shared_boards/${SHARE_ID}`), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
        [`participants.${'another-user'}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
      })
    );
  });

  it('stranger CANNOT change other fields during self-join', async () => {
    // The diff().affectedKeys().hasOnly(['participants']) clause keeps
    // the join write to a single field — no smuggling content edits.
    await assertFails(
      updateDoc(doc(asStranger(), `shared_boards/${SHARE_ID}`), {
        [`participants.${STRANGER_UID}`]: {
          role: 'collaborator',
          joinedAt: 2000,
        },
        name: 'Hijacked while joining',
      })
    );
  });
});

describe('shared_boards — self-leave', () => {
  it('collaborator can remove their own participants entry', async () => {
    await assertSucceeds(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        [`participants.${COLLAB_UID}`]: deleteField(),
      })
    );
  });

  it('viewer can remove their own participants entry', async () => {
    await assertSucceeds(
      updateDoc(doc(asViewer(), `shared_boards/${SHARE_ID}`), {
        [`participants.${VIEWER_UID}`]: deleteField(),
      })
    );
  });

  it('participant CANNOT remove ANOTHER user during self-leave', async () => {
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        [`participants.${COLLAB_UID}`]: deleteField(),
        [`participants.${VIEWER_UID}`]: deleteField(),
      })
    );
  });

  it('participant CANNOT change other fields during self-leave', async () => {
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        [`participants.${COLLAB_UID}`]: deleteField(),
        name: 'Hijacked while leaving',
      })
    );
  });
});

// `intendedMode` is the host-chosen import mode. The recipient flow trusts
// it to skip the picker and to drive role assignment, so any update path
// that allows it to drift would let a participant spoof the host's choice.
describe('shared_boards — intendedMode immutability', () => {
  beforeEach(async () => {
    // Re-seed with intendedMode so we can exercise the immutability check.
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `shared_boards/${SHARE_ID}`),
        seededShare({ intendedMode: 'view-only' })
      );
      // Re-seed the admin doc wiped by clearFirestore() above (top-level
      // beforeEach already seeded it, but this block clears again).
      await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
        email: ADMIN_EMAIL,
      });
    });
  });

  it('host CANNOT mutate intendedMode after create', async () => {
    await assertFails(
      updateDoc(doc(asHost(), `shared_boards/${SHARE_ID}`), {
        intendedMode: 'synced',
        updatedAt: 2000,
        updatedBy: HOST_UID,
      })
    );
  });

  it('collaborator CANNOT mutate intendedMode', async () => {
    await assertFails(
      updateDoc(doc(asCollab(), `shared_boards/${SHARE_ID}`), {
        intendedMode: 'synced',
        updatedAt: 2000,
        updatedBy: COLLAB_UID,
      })
    );
  });

  it('host can still update content while intendedMode stays the same', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), `shared_boards/${SHARE_ID}`), {
        name: 'Renamed but mode preserved',
        intendedMode: 'view-only',
        updatedAt: 2000,
        updatedBy: HOST_UID,
      })
    );
  });
});
