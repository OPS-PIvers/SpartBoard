/**
 * mirrorPlcIndex — keep a slim, PII-free `/plcIndex/{plcId}` discovery mirror
 * in lockstep with each PLC root doc (`plcs/{plcId}`).
 *
 * Why (code-review hardening of Decision 1.1): the "PLCs in my building"
 * directory lets same-org peers discover PLCs they could join. Backing it by
 * reading the FULL root doc exposed every teacher's email + displayName (the
 * `members` map / `memberEmails`) to all org peers — a PII leak. The fix splits
 * discovery metadata into this slim sibling doc, which carries NO member PII
 * (only PLC name, orgId, buildingId, and OPAQUE memberUids + a count). The root
 * doc's org-peer read branch is removed, so org peers read `/plcIndex` instead
 * of `/plcs`; full member PII stays gated to PLC members.
 *
 * Trigger: onWrite of the root doc → upsert the mirror; on delete (or an
 * unusable root) → remove it. Server-written via the Admin SDK so clients can
 * never forge a discovery entry; the rules pin `/plcIndex` to read-only.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';

export interface PlcIndexMirror {
  name: string;
  orgId: string | null;
  buildingId: string | null;
  memberUids: string[];
  memberCount: number;
}

/**
 * Build the slim, PII-free index mirror from a PLC root doc. Returns null when
 * the root is unusable for discovery (no name). Carries opaque uids + a count
 * (for the directory's "exclude my PLCs" filter and "N members" label) but
 * DELIBERATELY omits emails / displayNames / roles / status — those stay
 * member-gated on the root doc.
 */
export function buildPlcIndexMirror(
  root: Record<string, unknown>
): PlcIndexMirror | null {
  if (typeof root.name !== 'string') return null;

  // Prefer the active-only denormalized `memberUids` index (kept in lockstep
  // with the canonical `members` map on every membership write); fall back to
  // the active entries of the `members` map for any root lacking the index.
  let memberUids: string[] = [];
  if (Array.isArray(root.memberUids)) {
    memberUids = (root.memberUids as unknown[]).filter(
      (u): u is string => typeof u === 'string'
    );
  } else if (root.members && typeof root.members === 'object') {
    memberUids = Object.entries(root.members as Record<string, unknown>)
      .filter(
        ([, m]) =>
          m !== null &&
          typeof m === 'object' &&
          (m as { status?: unknown }).status !== 'removed'
      )
      .map(([uid]) => uid);
  }

  return {
    name: root.name,
    orgId: typeof root.orgId === 'string' ? root.orgId : null,
    buildingId: typeof root.buildingId === 'string' ? root.buildingId : null,
    memberUids,
    memberCount: memberUids.length,
  };
}

export const mirrorPlcIndex = onDocumentWritten(
  {
    document: 'plcs/{plcId}',
    // Cost posture (§8): one tiny mirror write per root change; cap concurrency
    // so a migration burst can't fan the function out unboundedly.
    memory: '256MiB',
    maxInstances: 5,
  },
  async (event) => {
    const { plcId } = event.params;
    const change = event.data;
    if (!change) {
      logger.warn('mirrorPlcIndex: received event without data', { plcId });
      return;
    }

    const db = admin.firestore();
    const indexRef = db.collection('plcIndex').doc(plcId);

    // Root deleted, or unusable (no name) → drop any stale mirror.
    const mirror = change.after.exists
      ? buildPlcIndexMirror(change.after.data() ?? {})
      : null;
    if (!mirror) {
      await indexRef.delete().catch(() => {
        /* already absent — nothing to remove */
      });
      return;
    }

    // Full overwrite (not merge): the mirror is wholly derived from the root,
    // so a replace keeps it from accumulating stale fields.
    await indexRef.set({
      ...mirror,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);
