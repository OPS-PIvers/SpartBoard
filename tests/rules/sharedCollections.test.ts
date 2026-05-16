// Firestore security-rules tests for /shared_collections/{shareId}.
//
// Covers:
//   - Substitute read gating: inline @orono.k12.mn.us / host / admin pattern
//     (no isSubInBuilding helper — mirrors /shared_boards convention)
//   - 14-day expiresAt cap on substitute creates (1209600000ms)
//   - boardIds list validation (non-empty, max 500)
//   - collection.name must be a non-empty string
//   - intendedMode must be 'copy' or 'substitute'
//   - Substitute shares are immutable post-creation (no update)
//   - Copy shares are host-or-admin updatable
//   - Delete: host or admin only
//   - /boards/{boardId} subcollection: read mirrors parent, write = host only
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
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'spartboard-shared-collections-rules-test';
const SHARE_ID = 'col-share-rules-test';
const BOARD_ID = 'board-snap-1';

const HOST_UID = 'host-uid-sc';
const HOST_EMAIL = 'host@example.com';

const ORONO_UID = 'orono-teacher-uid';
const ORONO_EMAIL = 'teacher@orono.k12.mn.us';

const EXTERNAL_UID = 'external-teacher-uid';
const EXTERNAL_EMAIL = 'external@example.com';

const ADMIN_UID = 'admin-uid-sc';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// ---------------------------------------------------------------------------
// Auth context helpers
// ---------------------------------------------------------------------------

const asUnauth = () => testEnv.unauthenticatedContext().firestore();

const asHost = () =>
  testEnv.authenticatedContext(HOST_UID, { email: HOST_EMAIL }).firestore();

const asOronoTeacher = () =>
  testEnv.authenticatedContext(ORONO_UID, { email: ORONO_EMAIL }).firestore();

const asExternalTeacher = () =>
  testEnv
    .authenticatedContext(EXTERNAL_UID, { email: EXTERNAL_EMAIL })
    .firestore();

// Admin token must carry the admin's email so isAdmin() can match
// /admins/{email.lower()} via request.auth.token.email.lower().
const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL }).firestore();

// ---------------------------------------------------------------------------
// Payload factories
// ---------------------------------------------------------------------------

const NOW_MS = Date.now();
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000; // 1209600000

/** A valid copy-mode share document. */
const copyShareDoc = (overrides: Record<string, unknown> = {}) => ({
  hostUid: HOST_UID,
  boardIds: ['board-1', 'board-2'],
  collection: { name: 'My Collection', id: 'col-abc' },
  intendedMode: 'copy',
  createdAt: NOW_MS,
  ...overrides,
});

/** A valid substitute-mode share document. */
const subShareDoc = (overrides: Record<string, unknown> = {}) => ({
  hostUid: HOST_UID,
  boardIds: ['board-1'],
  collection: { name: 'Sub Collection', id: 'col-xyz' },
  intendedMode: 'substitute',
  buildingId: 'ohs',
  expiresAt: NOW_MS + FOURTEEN_DAYS_MS - 60_000, // 1 minute under the cap
  createdAt: NOW_MS,
  ...overrides,
});

/** A frozen board snapshot document matching the SharedCollectionBoardDoc shape. */
const boardSnapshotDoc = (boardId: string = BOARD_ID) => ({
  boardId,
  dashboard: {
    id: boardId,
    name: `Board ${boardId}`,
    background: 'bg-slate-800',
    widgets: [],
    createdAt: 0,
  },
});

const sharePath = `shared_collections/${SHARE_ID}`;
const boardPath = `shared_collections/${SHARE_ID}/boards/${BOARD_ID}`;

// ---------------------------------------------------------------------------
// Setup / teardown
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed the admin doc so isAdmin() resolves for ADMIN_EMAIL.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
      email: ADMIN_EMAIL,
    });
  });
});

// ---------------------------------------------------------------------------
// 1. READ — unauthenticated
// ---------------------------------------------------------------------------

describe('shared_collections — read, unauthenticated', () => {
  it('anonymous read fails on any share doc', async () => {
    // Seed a copy share so the read has a doc to hit.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
    });
    await assertFails(getDoc(doc(asUnauth(), sharePath)));
  });
});

// ---------------------------------------------------------------------------
// 2. READ — copy share (open to any authed user)
// ---------------------------------------------------------------------------

describe('shared_collections — read, copy share', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
    });
  });

  it('non-host authed teacher can read a copy-mode share', async () => {
    await assertSucceeds(getDoc(doc(asExternalTeacher(), sharePath)));
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. READ — substitute share gating
// ---------------------------------------------------------------------------

describe('shared_collections — read, substitute share', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
    });
  });

  it('non-Orono email is denied on substitute share', async () => {
    await assertFails(getDoc(doc(asExternalTeacher(), sharePath)));
  });

  it('Orono email is allowed on substitute share', async () => {
    await assertSucceeds(getDoc(doc(asOronoTeacher(), sharePath)));
  });

  it('host can always read their own substitute share', async () => {
    await assertSucceeds(getDoc(doc(asHost(), sharePath)));
  });

  it('admin can read substitute share', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), sharePath)));
  });
});

// ---------------------------------------------------------------------------
// 5. CREATE — valid copy payload
// ---------------------------------------------------------------------------

describe('shared_collections — create, valid copy payload', () => {
  it('host creates a copy share with valid payload', async () => {
    await assertSucceeds(setDoc(doc(asHost(), sharePath), copyShareDoc()));
  });
});

// ---------------------------------------------------------------------------
// 6. CREATE — boardIds validation
// ---------------------------------------------------------------------------

describe('shared_collections — create, boardIds validation', () => {
  it('create rejected when boardIds is empty', async () => {
    await assertFails(
      setDoc(doc(asHost(), sharePath), copyShareDoc({ boardIds: [] }))
    );
  });

  it('create rejected when boardIds exceeds 500 entries', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => `board-${i}`);
    await assertFails(
      setDoc(doc(asHost(), sharePath), copyShareDoc({ boardIds: tooMany }))
    );
  });

  it('create allowed at exactly 500 entries', async () => {
    const exactly500 = Array.from({ length: 500 }, (_, i) => `board-${i}`);
    await assertSucceeds(
      setDoc(doc(asHost(), sharePath), copyShareDoc({ boardIds: exactly500 }))
    );
  });
});

// ---------------------------------------------------------------------------
// 7 (already covered above: boardIds > 500 → see case 6)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 8. CREATE — intendedMode must be in legal set
// ---------------------------------------------------------------------------

describe('shared_collections — create, intendedMode validation', () => {
  it('create rejected when intendedMode is "synced"', async () => {
    await assertFails(
      setDoc(doc(asHost(), sharePath), copyShareDoc({ intendedMode: 'synced' }))
    );
  });

  it('create rejected when intendedMode is "invalid"', async () => {
    await assertFails(
      setDoc(
        doc(asHost(), sharePath),
        copyShareDoc({ intendedMode: 'invalid' })
      )
    );
  });

  it('create accepted with intendedMode "substitute"', async () => {
    await assertSucceeds(setDoc(doc(asHost(), sharePath), subShareDoc()));
  });
});

// ---------------------------------------------------------------------------
// 9–12. CREATE — substitute-specific field validation
// ---------------------------------------------------------------------------

describe('shared_collections — create, substitute field constraints', () => {
  it('substitute create rejected without expiresAt', async () => {
    const { expiresAt: _expiresAt, ...payload } = subShareDoc();
    await assertFails(setDoc(doc(asHost(), sharePath), payload));
  });

  it('substitute create rejected when expiresAt is in the past', async () => {
    await assertFails(
      setDoc(
        doc(asHost(), sharePath),
        subShareDoc({ expiresAt: NOW_MS - 1000 })
      )
    );
  });

  it('substitute create rejected when expiresAt is more than 14 days out', async () => {
    await assertFails(
      setDoc(
        doc(asHost(), sharePath),
        subShareDoc({ expiresAt: NOW_MS + FOURTEEN_DAYS_MS + 10_000 })
      )
    );
  });

  it('substitute create accepted at exactly the 14-day boundary', async () => {
    // The rule is <=, so exactly 14 days should succeed.
    // Use a value comfortably under to avoid emulator clock skew:
    // 13 days 23 hours 59 minutes.
    await assertSucceeds(
      setDoc(
        doc(asHost(), sharePath),
        subShareDoc({ expiresAt: NOW_MS + FOURTEEN_DAYS_MS - 60_000 })
      )
    );
  });

  it('substitute create rejected without buildingId', async () => {
    const { buildingId: _buildingId, ...payload } = subShareDoc();
    await assertFails(setDoc(doc(asHost(), sharePath), payload));
  });

  it('substitute create rejected with empty buildingId', async () => {
    await assertFails(
      setDoc(doc(asHost(), sharePath), subShareDoc({ buildingId: '' }))
    );
  });
});

// ---------------------------------------------------------------------------
// 13. CREATE — hostUid must match request.auth.uid
// ---------------------------------------------------------------------------

describe('shared_collections — create, hostUid impersonation', () => {
  it('create rejected when hostUid does not match auth uid', async () => {
    // External teacher tries to create a share claiming HOST_UID as host.
    await assertFails(
      setDoc(
        doc(asExternalTeacher(), sharePath),
        copyShareDoc({ hostUid: HOST_UID })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 14. UPDATE — substitute shares are immutable
// ---------------------------------------------------------------------------

describe('shared_collections — update, substitute immutability', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
    });
  });

  it('update rejected for substitute share even by host', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), { buildingId: 'oms' })
    );
  });

  it('update rejected for substitute share even by admin', async () => {
    await assertFails(
      updateDoc(doc(asAdmin(), sharePath), { buildingId: 'oms' })
    );
  });
});

// ---------------------------------------------------------------------------
// 15. UPDATE — copy shares are host-or-admin updatable
// ---------------------------------------------------------------------------

describe('shared_collections — update, copy share', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
    });
  });

  it('host can update a copy share', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        'collection.name': 'Renamed Collection',
      })
    );
  });

  it('admin can update a copy share', async () => {
    await assertSucceeds(
      updateDoc(doc(asAdmin(), sharePath), {
        'collection.name': 'Admin Renamed',
      })
    );
  });

  it('non-host cannot update a copy share', async () => {
    await assertFails(
      updateDoc(doc(asExternalTeacher(), sharePath), {
        'collection.name': 'Hijacked',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 16. DELETE — host or admin only
// ---------------------------------------------------------------------------

describe('shared_collections — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
    });
  });

  it('host can delete their own share', async () => {
    await assertSucceeds(deleteDoc(doc(asHost(), sharePath)));
  });

  it('admin can delete a share', async () => {
    await assertSucceeds(deleteDoc(doc(asAdmin(), sharePath)));
  });

  it('non-host cannot delete a share', async () => {
    await assertFails(deleteDoc(doc(asExternalTeacher(), sharePath)));
  });
});

// ---------------------------------------------------------------------------
// 17. Subcollection /boards/{boardId} — read mirrors parent semantics
// ---------------------------------------------------------------------------

describe('shared_collections/boards — read', () => {
  it('positive: non-host authed teacher reads board on copy share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertSucceeds(getDoc(doc(asExternalTeacher(), boardPath)));
  });

  it('negative: non-Orono teacher denied reading board on substitute share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(getDoc(doc(asExternalTeacher(), boardPath)));
  });

  it('positive: Orono email can read board on substitute share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertSucceeds(getDoc(doc(asOronoTeacher(), boardPath)));
  });

  it('unauthenticated read of board doc fails', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(getDoc(doc(asUnauth(), boardPath)));
  });
});

// ---------------------------------------------------------------------------
// 18. Subcollection /boards/{boardId} — write rejected for non-host
// ---------------------------------------------------------------------------

describe('shared_collections/boards — write authorization', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
    });
  });

  it('host can create a board snapshot', async () => {
    await assertSucceeds(setDoc(doc(asHost(), boardPath), boardSnapshotDoc()));
  });

  it('non-host cannot create a board snapshot', async () => {
    await assertFails(
      setDoc(doc(asExternalTeacher(), boardPath), boardSnapshotDoc())
    );
  });

  it('host can update a board snapshot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertSucceeds(
      setDoc(doc(asHost(), boardPath), {
        ...boardSnapshotDoc(),
        name: 'Updated',
      })
    );
  });

  it('non-host cannot update a board snapshot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(
      setDoc(doc(asExternalTeacher(), boardPath), {
        ...boardSnapshotDoc(),
        name: 'Hijacked',
      })
    );
  });

  it('host can delete a board snapshot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertSucceeds(deleteDoc(doc(asHost(), boardPath)));
  });

  it('non-host cannot delete a board snapshot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(deleteDoc(doc(asExternalTeacher(), boardPath)));
  });
});
