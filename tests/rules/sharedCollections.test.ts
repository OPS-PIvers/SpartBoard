// Firestore security-rules tests for /shared_collections/{shareId}.
//
// Covers:
//   - Substitute read gating: inline @orono.k12.mn.us / host / admin pattern
//     (no isSubInBuilding helper — mirrors /shared_boards convention)
//   - 14-day expiresAt cap on substitute creates (1209600000ms)
//   - boardIds list validation (non-empty, max 500)
//   - collection.name must be a non-empty string
//   - intendedMode must be 'copy' or 'substitute'
//   - Substitute shares take only the sub-shares manager's keys on update
//     (re-push, extend, retarget, end now, stamp the names file), and who may
//     read them is unchanged by an update
//   - Copy shares are host-or-admin updatable
//   - Delete: host or admin only
//   - /boards/{boardId} and /content/{contentId} subcollections: read mirrors
//     parent, write = host only
//   - /keys/{keyId} subcollection: host, admin or a sub the share names by
//     email, and never past expiry — a district teacher the share does not name
//     is denied, which is what separates keys/ from content/
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
  doc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

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

// Real Orono staff sign in via Google, which always sets email_verified: true.
const asOronoTeacher = () =>
  testEnv
    .authenticatedContext(ORONO_UID, {
      email: ORONO_EMAIL,
      email_verified: true,
    })
    .firestore();

// Email/password sign-in leaves email_verified false until confirmed, so an
// unverified account can self-report an @orono.k12.mn.us address it doesn't
// own. Regression fixture for the substitute-share email_verified gap.
const asUnverifiedOronoImpersonator = () =>
  testEnv
    .authenticatedContext('unverified-orono-impersonator-uid-sc', {
      email: ORONO_EMAIL,
      email_verified: false,
    })
    .firestore();

const asExternalTeacher = () =>
  testEnv
    .authenticatedContext(EXTERNAL_UID, { email: EXTERNAL_EMAIL })
    .firestore();

// Admin token must carry the admin's email so isAdmin() can match
// /admins/{email.lower()} via request.auth.token.email.lower(), plus
// email_verified: true (isAdmin() now requires it).
const asAdmin = () =>
  testEnv
    .authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
    })
    .firestore();

// A token email with an embedded @ before the orono domain — regression
// fixture for the `[^@]+@orono...` regex hardening (mirrors sharedBoards.test.ts).
const asSpoofedEmail = () =>
  testEnv
    .authenticatedContext('spoofed-uid-sc', {
      email: 'x@evil.com@orono.k12.mn.us',
    })
    .firestore();

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
const contentPath = `shared_collections/${SHARE_ID}/content/drawing_w1`;
const keyPath = `shared_collections/${SHARE_ID}/keys/quiz_q1`;

/** Bundled display content for a widget whose data lives outside the board. */
const contentDoc = () => ({
  kind: 'drawing',
  itemId: 'w1',
  bundledAt: NOW_MS,
  payload: { pages: [] },
});

/** A full copy of an activity, answers included. */
const keyDoc = () => ({
  kind: 'quiz',
  itemId: 'q1',
  bundledAt: NOW_MS,
  payload: { questions: [] },
});

/** A substitute share that names one sub by email. */
const namedSubShareDoc = (overrides: Record<string, unknown> = {}) =>
  subShareDoc({ subEmails: [ORONO_EMAIL], ...overrides });

const UNNAMED_SUB_UID = 'unnamed-orono-sub-uid';
const UNNAMED_SUB_EMAIL = 'someone.else@orono.k12.mn.us';

const asUnnamedOronoSub = () =>
  testEnv
    .authenticatedContext(UNNAMED_SUB_UID, {
      email: UNNAMED_SUB_EMAIL,
      email_verified: true,
    })
    .firestore();

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

  it('a spoofed email with an embedded @ before the orono domain is denied', async () => {
    // Regression (#2150 round 7): `.*@orono...` let `.*` absorb an embedded
    // `@`, so a token email like `x@evil.com@orono.k12.mn.us` matched the
    // old regex. `[^@]+` requires the local part to be @-free.
    await assertFails(getDoc(doc(asSpoofedEmail(), sharePath)));
  });

  it('host can always read their own substitute share', async () => {
    await assertSucceeds(getDoc(doc(asHost(), sharePath)));
  });

  it('admin can read substitute share', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), sharePath)));
  });

  it('an unverified account self-reporting an @orono email is denied', async () => {
    await assertFails(getDoc(doc(asUnverifiedOronoImpersonator(), sharePath)));
  });
});

// ---------------------------------------------------------------------------
// 4b. READ — substitute share expiry enforcement
// ---------------------------------------------------------------------------
// The client-side `loadSharedCollection` filters expired shares, but a
// hostile client (direct REST/curl) could otherwise read frozen Board
// snapshots indefinitely after expiry. The rule rejects expired reads for
// non-host/non-admin callers; host + admin can still read past expiry for
// cleanup / debugging.

describe('shared_collections — read, substitute share expiry', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        subShareDoc({ expiresAt: NOW_MS - 60_000 }) // 1 minute past
      );
    });
  });

  it('Orono email is denied on expired substitute share', async () => {
    await assertFails(getDoc(doc(asOronoTeacher(), sharePath)));
  });

  it('host can still read their own expired substitute share', async () => {
    await assertSucceeds(getDoc(doc(asHost(), sharePath)));
  });

  it('admin can read expired substitute share', async () => {
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
    // Use Date.now() instead of the module-load NOW_MS so the 10s margin
    // is measured against the actual request time. With NOW_MS the margin
    // erodes during emulator boot + earlier-test execution and CI flakes.
    await assertFails(
      setDoc(
        doc(asHost(), sharePath),
        subShareDoc({ expiresAt: Date.now() + FOURTEEN_DAYS_MS + 10_000 })
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
// 12b. CREATE — substitute Drive-grant fields (subEmails / driveGrants)
// ---------------------------------------------------------------------------
// Drive roster grants live on the substitute Collection parent doc (M5),
// mirroring /shared_boards. Create must accept them; the existing
// substitute-immutability rule (case 14) then pins them — a host cannot
// rewrite driveGrants after a sub has opened a board.

describe('shared_collections — create, substitute Drive-grant fields', () => {
  const driveGrants = [
    { email: 'sub@orono.k12.mn.us', fileId: 'file-1', permissionId: 'perm-1' },
  ];

  it('substitute create accepted with subEmails + driveGrants', async () => {
    await assertSucceeds(
      setDoc(
        doc(asHost(), sharePath),
        subShareDoc({
          subEmails: ['sub@orono.k12.mn.us'],
          driveGrants,
        })
      )
    );
  });

  it('only the host rewrites driveGrants, which is how a sub is added later', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        subShareDoc({ subEmails: ['sub@orono.k12.mn.us'], driveGrants })
      );
    });
    const added = [
      ...driveGrants,
      { email: 'ohssub@orono.k12.mn.us', fileId: 'f', permissionId: 'p2' },
    ];
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        subEmails: ['sub@orono.k12.mn.us', 'ohssub@orono.k12.mn.us'],
        driveGrants: added,
        updatedAt: NOW_MS,
      })
    );
    await assertFails(
      updateDoc(doc(asOronoTeacher(), sharePath), { driveGrants: added })
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

describe('shared_collections — update, substitute manager writes', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
    });
  });

  it('host can re-push the boards, sections and contentVersion', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        boardIds: ['board-1', 'board-2'],
        boards: [
          { id: 'board-1', name: 'Monday', sectionId: 'col-xyz', order: 0 },
          { id: 'board-2', name: 'Tuesday', sectionId: 'col-xyz', order: 1 },
        ],
        sections: [{ id: 'col-xyz', name: 'Sub Collection' }],
        kind: 'collection',
        defaultBoardId: 'board-1',
        contentVersion: 2,
        updatedAt: NOW_MS,
      })
    );
  });

  it('host can extend the expiry inside the 14-day cap', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        expiresAt: NOW_MS + FOURTEEN_DAYS_MS - 60_000,
        updatedAt: NOW_MS,
      })
    );
  });

  it('extend past 14 days is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        expiresAt: NOW_MS + FOURTEEN_DAYS_MS + 60_000,
      })
    );
  });

  it('host can stamp the expiry in the past to end the share now', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        expiresAt: NOW_MS - 1,
        updatedAt: NOW_MS,
      })
    );
  });

  // The names file id first appears on a re-push, when the teacher has typed
  // names into a widget since the share was made (plan §3.4).
  it('host can stamp the names file on a re-push', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        namesFileId: 'names-file-1',
        contentVersion: 2,
        updatedAt: NOW_MS,
      })
    );
  });

  it('host can retarget the named subs', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        subEmails: ['ohssub@orono.k12.mn.us'],
        updatedAt: NOW_MS,
      })
    );
  });

  it('more than 20 named subs is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        subEmails: Array.from(
          { length: 21 },
          (_, i) => `sub${i.toString()}@orono.k12.mn.us`
        ),
      })
    );
  });

  it('buildingId stays pinned', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), { buildingId: 'oms' })
    );
  });

  it('intendedMode stays pinned', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), { intendedMode: 'copy' })
    );
  });

  it('hostUid stays pinned', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), { hostUid: ORONO_UID })
    );
  });

  it('a key outside the allowlist is rejected even alongside allowed ones', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        contentVersion: 2,
        initialState: { widgets: [] },
      })
    );
  });

  // The /subs directory and the host's manager render boardIds and
  // collection.name unguarded, so the shape create demands has to hold after
  // an update too — a direct REST write is the boundary, not the client.
  it('emptying the board list is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), { boardIds: [], updatedAt: NOW_MS })
    );
  });

  it('a board list that is not a list is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        boardIds: 'board-1',
        updatedAt: NOW_MS,
      })
    );
  });

  it('a board list past the 500 cap is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        boardIds: Array.from(
          { length: 501 },
          (_, i) => `board-${i.toString()}`
        ),
        updatedAt: NOW_MS,
      })
    );
  });

  it('blanking the collection name is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        collection: { name: '' },
        updatedAt: NOW_MS,
      })
    );
  });

  it('a board tree past the 500 cap is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        boards: Array.from({ length: 501 }, (_, i) => ({
          id: `board-${i.toString()}`,
          name: 'Board',
          sectionId: 'col-xyz',
          order: i,
        })),
        updatedAt: NOW_MS,
      })
    );
  });

  it('the share cannot be turned back into a copy share', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        intendedMode: 'copy',
        updatedAt: NOW_MS,
      })
    );
  });

  it('a named sub cannot update the share', async () => {
    await assertFails(
      updateDoc(doc(asOronoTeacher(), sharePath), { contentVersion: 99 })
    );
  });

  it('a non-host teacher cannot end the share', async () => {
    await assertFails(
      updateDoc(doc(asExternalTeacher(), sharePath), { expiresAt: NOW_MS - 1 })
    );
  });
});

describe('shared_collections — update, a copy share cannot become a sub share', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
    });
  });

  // The copy branch of the update rule is unrestricted, so without the pin a
  // host could promote their own copy share into a substitute one — readable by
  // every verified district account, in any building, for as long as they liked.
  it('flipping intendedMode to substitute is rejected', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        intendedMode: 'substitute',
        buildingId: 'ohs',
        expiresAt: NOW_MS + FOURTEEN_DAYS_MS * 100,
      })
    );
  });

  it('a copy share still takes an ordinary edit', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        collection: { name: 'Renamed' },
      })
    );
  });

  // The host/admin check reads the pre-update doc, so without the top-level pin
  // a host could hand their own copy share to an arbitrary uid — and lose the
  // ability to update or delete it afterwards.
  it('a copy share cannot be reassigned to another host', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), { hostUid: ORONO_UID })
    );
  });

  it('a copy share cannot take more than 20 named subs', async () => {
    await assertFails(
      updateDoc(doc(asHost(), sharePath), {
        subEmails: Array.from(
          { length: 21 },
          (_, i) => `sub${i.toString()}@orono.k12.mn.us`
        ),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 14b. READ after a manager write — an update must not change who can read,
// and ending a share must cut the sub off on the parent AND the boards.
// ---------------------------------------------------------------------------

describe('shared_collections — read after substitute manager writes', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
  });

  it('an Orono sub still reads the share and its boards after an update', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        contentVersion: 2,
        updatedAt: NOW_MS,
      })
    );
    await assertSucceeds(getDoc(doc(asOronoTeacher(), sharePath)));
    await assertSucceeds(getDoc(doc(asOronoTeacher(), boardPath)));
  });

  it('ending the share denies the sub the share doc and its boards', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), {
        expiresAt: NOW_MS - 1,
        updatedAt: NOW_MS,
      })
    );
    await assertFails(getDoc(doc(asOronoTeacher(), sharePath)));
    await assertFails(getDoc(doc(asOronoTeacher(), boardPath)));
  });

  it('the host still reads an ended share, so the sweep can clean it up', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), { expiresAt: NOW_MS - 1 })
    );
    await assertSucceeds(getDoc(doc(asHost(), sharePath)));
    await assertSucceeds(getDoc(doc(asHost(), boardPath)));
  });

  it('an external teacher is still denied after an update', async () => {
    await assertSucceeds(
      updateDoc(doc(asHost(), sharePath), { contentVersion: 3 })
    );
    await assertFails(getDoc(doc(asExternalTeacher(), sharePath)));
    await assertFails(getDoc(doc(asExternalTeacher(), boardPath)));
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

  it('a spoofed email with an embedded @ before the orono domain is denied on the board subcollection', async () => {
    // Regression (#2150 round 7): the same `[^@]+` hardening applies to this
    // subcollection's inline email branch (firestore.rules line ~1046).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(getDoc(doc(asSpoofedEmail(), boardPath)));
  });

  it('unauthenticated read of board doc fails', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(getDoc(doc(asUnauth(), boardPath)));
  });

  it('Orono teacher denied reading board on expired substitute share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        subShareDoc({ expiresAt: NOW_MS - 60_000 })
      );
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(getDoc(doc(asOronoTeacher(), boardPath)));
  });

  it('host can read board on expired substitute share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        subShareDoc({ expiresAt: NOW_MS - 60_000 })
      );
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertSucceeds(getDoc(doc(asHost(), boardPath)));
  });

  it('an unverified account self-reporting an @orono email is denied on the board subcollection', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), boardPath), boardSnapshotDoc());
    });
    await assertFails(getDoc(doc(asUnverifiedOronoImpersonator(), boardPath)));
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

// Regression: `allow list` is evaluated against the QUERY (only
// equality-pinned fields carry a value; a range-filtered field errors), so
// none of the get-side branches — `intendedMode != 'substitute'`, `hostUid`,
// `expiresAt` — could pass the /subs Collections query. See sharedBoards.
describe('shared_collections — substitute directory list query', () => {
  const dirQuery = (db: ReturnType<typeof asOronoTeacher>) =>
    query(
      collection(db, 'shared_collections'),
      where('intendedMode', '==', 'substitute'),
      where('buildingId', '==', 'ohs'),
      where('expiresAt', '>', Date.now())
    );

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'shared_collections/live-col'),
        subShareDoc()
      );
    });
  });

  it('Orono sub can run the /subs Collections directory query', async () => {
    await assertSucceeds(getDocs(dirQuery(asOronoTeacher())));
  });

  it('the query still succeeds when it matches nothing', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'shared_collections/live-col'));
    });
    await assertSucceeds(getDocs(dirQuery(asOronoTeacher())));
  });

  it('non-Orono email is denied on the directory query', async () => {
    await assertFails(getDocs(dirQuery(asExternalTeacher())));
  });

  it('an unverified account self-reporting an @orono email is denied the directory query', async () => {
    await assertFails(getDocs(dirQuery(asUnverifiedOronoImpersonator())));
  });

  it('host can list their own substitute Collection shares', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(asHost(), 'shared_collections'),
          where('hostUid', '==', HOST_UID),
          where('intendedMode', '==', 'substitute')
        )
      )
    );
  });

  it('an unscoped list is denied for a non-admin', async () => {
    await assertFails(
      getDocs(query(collection(asOronoTeacher(), 'shared_collections')))
    );
  });
});

// ---------------------------------------------------------------------------
// 20. Subcollection /content/{contentId} — read mirrors parent, write = host
// ---------------------------------------------------------------------------

describe('shared_collections/content — read', () => {
  it('positive: Orono sub reads bundled content on a live substitute share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertSucceeds(getDoc(doc(asOronoTeacher(), contentPath)));
  });

  it('positive: non-host authed teacher reads content on a copy share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertSucceeds(getDoc(doc(asExternalTeacher(), contentPath)));
  });

  it('negative: non-Orono teacher denied content on a substitute share', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertFails(getDoc(doc(asExternalTeacher(), contentPath)));
  });

  it('negative: Orono sub denied content once the share has expired', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        subShareDoc({ expiresAt: NOW_MS - 60_000 })
      );
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertFails(getDoc(doc(asOronoTeacher(), contentPath)));
  });

  it('negative: an unverified account self-reporting an @orono email is denied content', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertFails(
      getDoc(doc(asUnverifiedOronoImpersonator(), contentPath))
    );
  });

  it('negative: unauthenticated read of content fails', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertFails(getDoc(doc(asUnauth(), contentPath)));
  });

  it('positive: host reads content on an expired share, for cleanup', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        subShareDoc({ expiresAt: NOW_MS - 60_000 })
      );
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertSucceeds(getDoc(doc(asHost(), contentPath)));
  });
});

describe('shared_collections/content — write authorization', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
    });
  });

  it('host can write and delete bundled content', async () => {
    await assertSucceeds(setDoc(doc(asHost(), contentPath), contentDoc()));
    await assertSucceeds(deleteDoc(doc(asHost(), contentPath)));
  });

  it('a sub cannot write content', async () => {
    await assertFails(setDoc(doc(asOronoTeacher(), contentPath), contentDoc()));
  });

  it('a sub cannot delete content', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), contentPath), contentDoc());
    });
    await assertFails(deleteDoc(doc(asOronoTeacher(), contentPath)));
  });
});

// ---------------------------------------------------------------------------
// 21. Subcollection /keys/{keyId} — named subs only
// ---------------------------------------------------------------------------

describe('shared_collections/keys — read', () => {
  it('positive: a sub the share names by email can read a key', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), namedSubShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertSucceeds(getDoc(doc(asOronoTeacher(), keyPath)));
  });

  // The whole point of keys/ being separate from content/: any verified
  // district account can read the boards of any live substitute share, and
  // answer keys must not travel that far.
  it('negative: a district teacher the share does not name is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), namedSubShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(getDoc(doc(asUnnamedOronoSub(), keyPath)));
  });

  it('negative: a named sub is denied once the share has expired', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), sharePath),
        namedSubShareDoc({ expiresAt: NOW_MS - 60_000 })
      );
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(getDoc(doc(asOronoTeacher(), keyPath)));
  });

  it('negative: an unverified account self-reporting a named @orono email is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), namedSubShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(getDoc(doc(asUnverifiedOronoImpersonator(), keyPath)));
  });

  it('negative: a share naming nobody exposes its keys to nobody but the host', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), subShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(getDoc(doc(asOronoTeacher(), keyPath)));
    await assertSucceeds(getDoc(doc(asHost(), keyPath)));
  });

  it('negative: a copy share does not open its keys to every authed user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), copyShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(getDoc(doc(asExternalTeacher(), keyPath)));
  });

  it('positive: host and admin can read a key', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), namedSubShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertSucceeds(getDoc(doc(asHost(), keyPath)));
    await assertSucceeds(getDoc(doc(asAdmin(), keyPath)));
  });

  it('negative: unauthenticated read of a key fails', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), namedSubShareDoc());
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(getDoc(doc(asUnauth(), keyPath)));
  });
});

describe('shared_collections/keys — write authorization', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), sharePath), namedSubShareDoc());
    });
  });

  it('host can write and delete a key', async () => {
    await assertSucceeds(setDoc(doc(asHost(), keyPath), keyDoc()));
    await assertSucceeds(deleteDoc(doc(asHost(), keyPath)));
  });

  it('a named sub cannot write a key', async () => {
    await assertFails(setDoc(doc(asOronoTeacher(), keyPath), keyDoc()));
  });

  it('a named sub cannot delete a key', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), keyPath), keyDoc());
    });
    await assertFails(deleteDoc(doc(asOronoTeacher(), keyPath)));
  });
});
