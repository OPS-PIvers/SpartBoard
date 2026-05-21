// Firestore security rules regression coverage for `plc_resources/{resourceId}`.
// Pins the invariants introduced in the PLC redesign Wave 1:
//   - Any authenticated user can read (matches dashboard_templates posture).
//   - Only admins can create/update/delete.
//   - On create/update: `id` must equal resourceId, `kind` and `scope` must
//     be from their allowed enums, required fields must be present and
//     correctly typed, `createdByAdminUid` must equal the admin caller's uid.
//
// Requires a running Firestore emulator — invoke via `pnpm run test:rules`.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { setDoc, getDoc, deleteDoc, doc } from 'firebase/firestore';

const PROJECT_ID = 'spartboard-plc-resources-rules';
const RESOURCE_ID = 'r1';

const ADMIN_UID = 'admin-uid-plcr';
const ADMIN_EMAIL = 'admin@orono.k12.mn.us';
const NON_ADMIN_UID = 'teacher-uid-plcr';
const NON_ADMIN_EMAIL = 'teacher@example.com';

const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

let testEnv: RulesTestEnvironment;

// The isAdmin() rule checks existence of /admins/{email.lower()}.
// Seeding that doc in beforeEach (with security rules disabled) is all
// that is required — the email is matched via request.auth.token.email.lower().
const asAdmin = () =>
  testEnv.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL }).firestore();

const asNonAdmin = () =>
  testEnv
    .authenticatedContext(NON_ADMIN_UID, { email: NON_ADMIN_EMAIL })
    .firestore();

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
// Helpers
// ---------------------------------------------------------------------------

const validResource = (overrides: Record<string, unknown> = {}) => ({
  id: RESOURCE_ID,
  kind: 'quiz',
  title: 'Shared Quiz Resource',
  description: 'An optional admin note',
  refId: 'quiz-ref-abc123',
  scope: 'all',
  plcIds: [],
  createdByAdminUid: ADMIN_UID,
  createdByAdminEmail: ADMIN_EMAIL,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

describe('plc_resources — read', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plc_resources/${RESOURCE_ID}`),
        validResource()
      );
    });
  });

  it('admin can read a plc_resource', async () => {
    await assertSucceeds(
      getDoc(doc(asAdmin(), `plc_resources/${RESOURCE_ID}`))
    );
  });

  it('any authenticated user (non-admin) can read a plc_resource', async () => {
    await assertSucceeds(
      getDoc(doc(asNonAdmin(), `plc_resources/${RESOURCE_ID}`))
    );
  });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe('plc_resources — create', () => {
  it('admin can create a plc_resource with valid kind/scope/plcIds/title/refId', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), `plc_resources/${RESOURCE_ID}`), validResource())
    );
  });

  it('non-admin cannot create a plc_resource', async () => {
    await assertFails(
      setDoc(
        doc(asNonAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ createdByAdminUid: NON_ADMIN_UID })
      )
    );
  });

  it('admin create with invalid kind is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ kind: 'invalid-kind' })
      )
    );
  });

  it('admin create with invalid scope is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ scope: 'building' })
      )
    );
  });

  it('admin create with id mismatch (id != resourceId) is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ id: 'wrong-id' })
      )
    );
  });

  it('admin create with createdByAdminUid != caller uid is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ createdByAdminUid: 'some-other-uid' })
      )
    );
  });

  it('admin create with an unknown extra field is rejected', async () => {
    await assertFails(
      setDoc(
        doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ maliciousField: 'x' })
      )
    );
  });

  it('admin create missing a required field (description) is rejected', async () => {
    const { description: _omitted, ...withoutDescription } = validResource();
    await assertFails(
      setDoc(doc(asAdmin(), `plc_resources/${RESOURCE_ID}`), withoutDescription)
    );
  });

  it('all valid kinds are accepted', async () => {
    const kinds = ['quiz', 'video-activity', 'assignment', 'doc', 'board'];
    for (const kind of kinds) {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
          email: ADMIN_EMAIL,
        });
      });
      await assertSucceeds(
        setDoc(
          doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
          validResource({ kind })
        )
      );
    }
  });

  it('both valid scopes are accepted', async () => {
    for (const scope of ['all', 'selected']) {
      await testEnv.clearFirestore();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `admins/${ADMIN_EMAIL}`), {
          email: ADMIN_EMAIL,
        });
      });
      await assertSucceeds(
        setDoc(
          doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
          validResource({ scope })
        )
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('plc_resources — update', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plc_resources/${RESOURCE_ID}`),
        validResource()
      );
    });
  });

  it('admin can update a plc_resource', async () => {
    await assertSucceeds(
      setDoc(
        doc(asAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ title: 'Updated Title' })
      )
    );
  });

  it('non-admin cannot update a plc_resource', async () => {
    await assertFails(
      setDoc(
        doc(asNonAdmin(), `plc_resources/${RESOURCE_ID}`),
        validResource({ createdByAdminUid: NON_ADMIN_UID, title: 'Hacked' })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('plc_resources — delete', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `plc_resources/${RESOURCE_ID}`),
        validResource()
      );
    });
  });

  it('admin can delete a plc_resource', async () => {
    await assertSucceeds(
      deleteDoc(doc(asAdmin(), `plc_resources/${RESOURCE_ID}`))
    );
  });

  it('non-admin cannot delete a plc_resource', async () => {
    await assertFails(
      deleteDoc(doc(asNonAdmin(), `plc_resources/${RESOURCE_ID}`))
    );
  });
});
