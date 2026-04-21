import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Mirrors the guard in organizationMembersSync.ts so this module is safe to
// load standalone (tests) or alongside the main bundle.
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Subset of `types/organization.ts` MemberRecord needed to compute counter
 * deltas. Kept local because `functions/tsconfig.json` `rootDir` is `src`.
 */
export interface CounterMemberFields {
  email?: string;
  buildingIds?: string[];
}

export interface CounterDeltas {
  orgDelta: number;
  buildingDeltas: Map<string, number>;
  emailDomainDeltas: Map<string, number>;
}

/**
 * Extract the lowercase domain portion of an email (no leading `@`). Mirrors
 * scripts/recount-org-members.js `emailDomain()` so the trigger agrees with
 * the reconcile tool on bucket identity.
 */
export function emailDomain(email: unknown): string {
  if (typeof email !== 'string') return '';
  const at = email.lastIndexOf('@');
  if (at === -1) return '';
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

/**
 * Pure delta computation for one member-doc change. Kept pure so the full
 * transition matrix can be unit-tested without an emulator.
 *
 * Conventions:
 *  - The org counter changes by +1 (create), -1 (delete), 0 (update).
 *  - Per-building and per-domain maps contain only non-zero deltas — entries
 *    present in both `before.buildingIds` and `after.buildingIds` cancel out
 *    and are dropped before returning.
 *  - Duplicate building ids in either array increment the delta per entry,
 *    matching the recount script's one-increment-per-occurrence behavior.
 *  - Empty-string building ids and missing emails are ignored.
 */
export function planMemberCounterDeltas(
  before: CounterMemberFields | null,
  after: CounterMemberFields | null
): CounterDeltas {
  const orgDelta = (after ? 1 : 0) - (before ? 1 : 0);

  const buildingDeltas = new Map<string, number>();
  const bumpBuilding = (id: unknown, n: number): void => {
    if (typeof id !== 'string' || id === '') return;
    buildingDeltas.set(id, (buildingDeltas.get(id) ?? 0) + n);
  };
  if (before && Array.isArray(before.buildingIds)) {
    for (const id of before.buildingIds) bumpBuilding(id, -1);
  }
  if (after && Array.isArray(after.buildingIds)) {
    for (const id of after.buildingIds) bumpBuilding(id, 1);
  }
  for (const [k, v] of [...buildingDeltas]) {
    if (v === 0) buildingDeltas.delete(k);
  }

  const emailDomainDeltas = new Map<string, number>();
  const bumpDomain = (d: string, n: number): void => {
    if (!d) return;
    emailDomainDeltas.set(d, (emailDomainDeltas.get(d) ?? 0) + n);
  };
  if (before) bumpDomain(emailDomain(before.email), -1);
  if (after) bumpDomain(emailDomain(after.email), 1);
  for (const [k, v] of [...emailDomainDeltas]) {
    if (v === 0) emailDomainDeltas.delete(k);
  }

  return { orgDelta, buildingDeltas, emailDomainDeltas };
}

/**
 * Given the current `/organizations/{orgId}/domains` collection, find the
 * doc id whose `domain` field matches the email-domain bucket. The stored
 * field may or may not include a leading `@` (the UI writes with `@`, but
 * the recount script tolerates either), so both shapes are considered.
 * Returns `null` when no domain doc matches.
 */
export function resolveDomainDocId(
  bucket: string,
  domainDocs: { id: string; domain: unknown }[]
): string | null {
  if (!bucket) return null;
  for (const d of domainDocs) {
    const stored =
      typeof d.domain === 'string'
        ? d.domain.trim().toLowerCase().replace(/^@/, '')
        : '';
    if (stored && stored === bucket) return d.id;
  }
  return null;
}

/**
 * Firestore trigger that maintains the denormalized `users` counters on
 *   /organizations/{orgId}
 *   /organizations/{orgId}/buildings/{buildingId}
 *   /organizations/{orgId}/domains/{domainId}
 *
 * Design notes:
 *  - Uses `FieldValue.increment()` against `update()` (not `set({merge:true})`)
 *    on building and domain docs so a deleted building/domain is NOT
 *    resurrected if a stale member doc still references it; the per-path
 *    `update` fails with "No document to update", which we log and skip.
 *  - The org doc always exists, so its increment uses `update()` and is
 *    treated as an error if it fails.
 *  - NEVER throws. Throwing from the handler triggers Firestore's
 *    handler-level retry, which on a counter trigger would deterministically
 *    double-apply every per-path increment that succeeded before the throw.
 *    We log and swallow exceptions instead. Note that this only suppresses
 *    handler-retry duplication — Firestore/Eventarc delivery is itself
 *    at-least-once, so a rare duplicate invocation could still double-apply
 *    a delta. `scripts/recount-org-members.js` is the authoritative
 *    reconcile tool for any drift (predated writes, partial failures, or
 *    the duplicate-delivery case).
 */
export const organizationMemberCounters = onDocumentWritten(
  'organizations/{orgId}/members/{emailLower}',
  async (event) => {
    const { orgId, emailLower: rawEmailLower } = event.params;
    // Defensive normalization, matching organizationMembersSync. Phase 1
    // rules enforce lowercase doc ids, but lowercasing again is cheap
    // insurance against a future rule relaxation.
    const emailLower =
      typeof rawEmailLower === 'string' ? rawEmailLower.toLowerCase() : '';
    const change = event.data;
    if (!change) {
      logger.warn('organizationMemberCounters: received event without data', {
        orgId,
        emailLower,
      });
      return;
    }

    const before = change.before.exists
      ? (change.before.data() as CounterMemberFields)
      : null;
    const after = change.after.exists
      ? (change.after.data() as CounterMemberFields)
      : null;

    const { orgDelta, buildingDeltas, emailDomainDeltas } =
      planMemberCounterDeltas(before, after);

    if (
      orgDelta === 0 &&
      buildingDeltas.size === 0 &&
      emailDomainDeltas.size === 0
    ) {
      logger.info('organizationMemberCounters: no counter-relevant change', {
        orgId,
        emailLower,
      });
      return;
    }

    const db = admin.firestore();

    if (orgDelta !== 0) {
      try {
        await db
          .doc(`organizations/${orgId}`)
          .update({ users: FieldValue.increment(orgDelta) });
      } catch (err) {
        logger.error('organizationMemberCounters: org increment failed', {
          orgId,
          emailLower,
          orgDelta,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const [buildingId, delta] of buildingDeltas) {
      try {
        await db
          .doc(`organizations/${orgId}/buildings/${buildingId}`)
          .update({ users: FieldValue.increment(delta) });
      } catch (err) {
        logger.warn('organizationMemberCounters: building increment skipped', {
          orgId,
          emailLower,
          buildingId,
          delta,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (emailDomainDeltas.size > 0) {
      let domainDocs: { id: string; domain: unknown }[] = [];
      try {
        const snap = await db
          .collection(`organizations/${orgId}/domains`)
          .get();
        domainDocs = snap.docs.map((d) => ({
          id: d.id,
          domain: (d.data() as { domain?: unknown }).domain,
        }));
      } catch (err) {
        logger.warn('organizationMemberCounters: domain list read failed', {
          orgId,
          emailLower,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      for (const [bucket, delta] of emailDomainDeltas) {
        const domainId = resolveDomainDocId(bucket, domainDocs);
        if (!domainId) {
          logger.warn('organizationMemberCounters: no matching domain doc', {
            orgId,
            emailLower,
            bucket,
            delta,
          });
          continue;
        }
        try {
          await db
            .doc(`organizations/${orgId}/domains/${domainId}`)
            .update({ users: FieldValue.increment(delta) });
        } catch (err) {
          logger.warn('organizationMemberCounters: domain increment skipped', {
            orgId,
            emailLower,
            domainId,
            bucket,
            delta,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    logger.info('organizationMemberCounters: applied', {
      orgId,
      emailLower,
      orgDelta,
      buildingDeltas: Object.fromEntries(buildingDeltas),
      emailDomainDeltas: Object.fromEntries(emailDomainDeltas),
    });
  }
);
