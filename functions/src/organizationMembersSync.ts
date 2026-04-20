import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

// Ensure admin is initialized exactly once. `index.ts` also calls
// `initializeApp()`; guarding on `admin.apps.length` makes this module
// safe whether it's loaded standalone (tests) or alongside the main bundle.
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Subset of `types/organization.ts` MemberRecord needed for admin-mapping.
 * Kept local because the `functions/tsconfig.json` `rootDir` is `src`, so we
 * cannot import the canonical type from the repo root. Keep the field names
 * in lockstep with `types/organization.ts` — the regression guard depends
 * on reading `roleId` and `status` verbatim from the stored member doc.
 */
export interface MemberDocFields {
  roleId?: string;
  status?: string;
  email?: string;
}

/** Roles that mirror into `/admins/{emailLower}`. */
export const ADMIN_ROLES: readonly string[] = [
  'super_admin',
  'domain_admin',
  'building_admin',
];

/** Provenance marker written on every CF-created admin doc. */
export const PROVENANCE_SOURCE = 'organizationMembersSync';

export interface AdminCreatePayload {
  source: typeof PROVENANCE_SOURCE;
  orgId: string;
  roleId: string;
  email: string;
  updatedAt: string;
}

export interface AdminUpdatePayload {
  orgId: string;
  roleId: string;
  updatedAt: string;
}

export type AdminAction =
  | { type: 'create'; payload: AdminCreatePayload }
  | { type: 'update'; payload: AdminUpdatePayload }
  | { type: 'delete' }
  | { type: 'noop'; reason: string };

/**
 * Pure transition helper that maps a member-doc change (plus the current
 * state of `/admins/{emailLower}`) to the action the CF should take. Kept
 * pure so the full regression matrix can be unit-tested without an
 * emulator. See `organizationMembersSync.test.ts` for the case list.
 *
 * CRITICAL: any branch that would mutate or delete `/admins/{emailLower}`
 * MUST check for `existingAdmin?.source === PROVENANCE_SOURCE`. Pre-Phase-4
 * admin docs carry no marker and must never be touched by this CF.
 */
export function computeAdminAction(
  before: MemberDocFields | null,
  after: MemberDocFields | null,
  existingAdmin: { source?: string } | null,
  orgId: string,
  emailLower: string,
  now: string
): AdminAction {
  const shouldBeAdmin =
    after !== null &&
    typeof after.roleId === 'string' &&
    ADMIN_ROLES.includes(after.roleId) &&
    after.status === 'active';

  const wasAdmin =
    before !== null &&
    typeof before.roleId === 'string' &&
    ADMIN_ROLES.includes(before.roleId) &&
    before.status === 'active';

  if (shouldBeAdmin) {
    // `after` is non-null here and `after.roleId` is a string in ADMIN_ROLES.
    const afterRoleId = after.roleId as string;

    if (!existingAdmin) {
      return {
        type: 'create',
        payload: {
          source: PROVENANCE_SOURCE,
          orgId,
          roleId: afterRoleId,
          email: emailLower,
          updatedAt: now,
        },
      };
    }

    if (existingAdmin.source === PROVENANCE_SOURCE) {
      // Only update fields we own. Don't clobber a pre-existing admin doc
      // even if it somehow already has a matching source marker plus extra
      // operator-managed fields — `update()` only touches the three keys
      // we write here.
      return {
        type: 'update',
        payload: {
          orgId,
          roleId: afterRoleId,
          updatedAt: now,
        },
      };
    }

    return {
      type: 'noop',
      reason:
        'Admin doc exists without organizationMembersSync provenance marker; leaving untouched.',
    };
  }

  if (wasAdmin) {
    if (existingAdmin && existingAdmin.source === PROVENANCE_SOURCE) {
      return { type: 'delete' };
    }
    if (existingAdmin) {
      return {
        type: 'noop',
        reason:
          'Admin doc exists without organizationMembersSync provenance marker; refusing to delete.',
      };
    }
    // Was an admin by role+status, but no admin doc exists. Nothing to do.
    return {
      type: 'noop',
      reason: 'Member lost admin-eligible role/status but no admin doc exists.',
    };
  }

  // Neither before nor after qualifies as an admin — nothing to mirror.
  return { type: 'noop', reason: 'No admin-status transition.' };
}

/**
 * Firestore trigger that mirrors organization membership into `/admins/{emailLower}`.
 *
 * CRITICAL INVARIANT — DO NOT REMOVE:
 *   This function MUST NEVER delete or modify a `/admins/{emailLower}` doc
 *   that lacks `source: 'organizationMembersSync'`. Pre-Phase-4 admins (the
 *   six emails migrated into `/admins/*` before this CF existed) do not
 *   carry the provenance marker. If this invariant is violated, a mapping
 *   bug in member-doc transitions could silently demote production admins.
 *
 *   Before changing the guard logic below, re-read the Phase 4 decision
 *   entry dated 2026-04-19 in docs/organization_wiring_implementation.md.
 */
export const organizationMembersSync = onDocumentWritten(
  'organizations/{orgId}/members/{emailLower}',
  async (event) => {
    const { orgId, emailLower: rawEmail } = event.params;
    // Defensive normalization. Phase 1 rules enforce lowercase doc ids, but
    // lowercasing again is cheap insurance against a future rule relaxation.
    const emailLower = rawEmail.toLowerCase();

    const change = event.data;
    if (!change) {
      logger.warn('organizationMembersSync: received event without data', {
        orgId,
        emailLower,
      });
      return;
    }

    const beforeData = change.before.exists
      ? (change.before.data() as MemberDocFields)
      : null;
    const afterData = change.after.exists
      ? (change.after.data() as MemberDocFields)
      : null;

    // Short-circuit when the transition is irrelevant to admin mapping.
    // Specifically: both the previous and next admin-eligibility evaluate
    // to the same boolean AND the roleId is unchanged. A name-only change
    // on an active domain_admin, for example, should NOT rewrite the admin
    // doc's `updatedAt`.
    const beforeEligible =
      beforeData !== null &&
      typeof beforeData.roleId === 'string' &&
      ADMIN_ROLES.includes(beforeData.roleId) &&
      beforeData.status === 'active';
    const afterEligible =
      afterData !== null &&
      typeof afterData.roleId === 'string' &&
      ADMIN_ROLES.includes(afterData.roleId) &&
      afterData.status === 'active';
    const roleIdUnchanged = beforeData?.roleId === afterData?.roleId;

    if (beforeEligible === afterEligible && roleIdUnchanged) {
      logger.info('organizationMembersSync: no admin-relevant change', {
        orgId,
        emailLower,
        beforeEligible,
        afterEligible,
      });
      return;
    }

    const db = admin.firestore();
    const adminRef = db.doc(`admins/${emailLower}`);

    let existingAdmin: { source?: string } | null = null;
    try {
      const adminSnap = await adminRef.get();
      existingAdmin = adminSnap.exists
        ? (adminSnap.data() as { source?: string })
        : null;
    } catch (err) {
      logger.error(
        'organizationMembersSync: failed to read existing admin doc',
        {
          orgId,
          emailLower,
          error: err instanceof Error ? err.message : String(err),
        }
      );
      // Bail without throwing — Firestore retries throws and a retry loop
      // here could amplify the failure mode on transient infrastructure
      // issues.
      return;
    }

    const now = new Date().toISOString();
    const action = computeAdminAction(
      beforeData,
      afterData,
      existingAdmin,
      orgId,
      emailLower,
      now
    );

    try {
      if (action.type === 'create') {
        await adminRef.set(action.payload);
        logger.info('organizationMembersSync: created admin doc', {
          orgId,
          emailLower,
          roleId: action.payload.roleId,
        });
        return;
      }

      if (action.type === 'update') {
        // Spread into a plain object so the Admin SDK's `UpdateData` index-
        // signature requirement is satisfied without loosening our payload
        // type.
        await adminRef.update({ ...action.payload });
        logger.info('organizationMembersSync: updated admin doc', {
          orgId,
          emailLower,
          roleId: action.payload.roleId,
        });
        return;
      }

      if (action.type === 'delete') {
        await adminRef.delete();
        logger.info('organizationMembersSync: deleted admin doc', {
          orgId,
          emailLower,
        });
        return;
      }

      // noop
      logger.info('organizationMembersSync: noop', {
        orgId,
        emailLower,
        reason: action.reason,
      });
    } catch (err) {
      // Log and swallow. NEVER throw — a thrown trigger is retried by
      // Firestore, which could amplify a mapping bug into a loop that
      // thrashes `/admins/{email}` (especially dangerous for the delete
      // path). Operators watch the logs for these errors.
      logger.error('organizationMembersSync: admin write failed', {
        orgId,
        emailLower,
        actionType: action.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);
