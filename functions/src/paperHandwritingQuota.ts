// Page quota for handwritten paper answers (plan D25): read-only checks and a charge-once write.
import * as admin from 'firebase-admin';
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import {
  PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT,
  PAPER_HANDWRITTEN_FEATURE,
} from './paperWrittenTypes';

export type PaperModelTier = 'standard' | 'advanced';

export interface PaperHandwritingQuota {
  /** The `gemini-functions` kill switch is off; nobody transcribes, admins included. */
  geminiDisabled: boolean;
  unlimited: boolean;
  limit: number;
  used: number;
  /** Pages left today; `Infinity` when unlimited. */
  remaining: number;
  modelTier: PaperModelTier;
}

export interface PaperPageCharge {
  alreadyCharged: boolean;
  /** Queues the counter and job writes; call after every other read in the transaction. */
  apply: () => void;
}

/** UTC day, matching every other `ai_usage` counter. */
export function paperQuotaDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function paperHandwritingUsageRef(
  db: Firestore,
  uid: string,
  nowMs: number
): DocumentReference {
  return db
    .collection('ai_usage')
    .doc(`${uid}_${PAPER_HANDWRITTEN_FEATURE}_${paperQuotaDay(nowMs)}`);
}

export function normalizeModelTier(value: unknown): PaperModelTier {
  return value === 'advanced' ? 'advanced' : 'standard';
}

function countOf(data: Record<string, unknown> | undefined): number {
  const n = Number(data?.count ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Read-only: never writes, so import can show the page count before anything is charged. */
export async function readPaperHandwritingQuota(
  db: Firestore,
  opts: { uid: string; isAdmin: boolean; nowMs: number }
): Promise<PaperHandwritingQuota> {
  const [gemini, perm, usage] = await Promise.all([
    db.collection('global_permissions').doc('gemini-functions').get(),
    db.collection('global_permissions').doc(PAPER_HANDWRITTEN_FEATURE).get(),
    paperHandwritingUsageRef(db, opts.uid, opts.nowMs).get(),
  ]);
  const geminiDisabled = gemini.exists && gemini.data()?.enabled === false;
  const config = (perm.data()?.config ?? {}) as {
    dailyLimit?: unknown;
    dailyLimitEnabled?: unknown;
    modelTier?: unknown;
  };
  const limit =
    typeof config.dailyLimit === 'number' &&
    Number.isFinite(config.dailyLimit) &&
    config.dailyLimit >= 0
      ? Math.floor(config.dailyLimit)
      : PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT;
  const unlimited = opts.isAdmin || config.dailyLimitEnabled === false;
  const used = countOf(usage.data());
  return {
    geminiDisabled,
    unlimited,
    limit,
    used,
    remaining: unlimited ? Infinity : Math.max(0, limit - used),
    modelTier: normalizeModelTier(config.modelTier),
  };
}

/** How many of `pages` fit today; the rest go over quota. */
export function splitPagesByQuota(
  quota: PaperHandwritingQuota,
  pages: number
): { allowed: number; overQuota: number } {
  if (quota.geminiDisabled) return { allowed: 0, overQuota: pages };
  const allowed = Math.min(pages, quota.remaining);
  return { allowed, overQuota: pages - allowed };
}

// Reads inside `tx`; `apply()` charges one page and marks the job, and no-ops on a charged job.
export async function preparePaperPageCharge(
  tx: Transaction,
  db: Firestore,
  opts: { uid: string; jobRef: DocumentReference; nowMs: number }
): Promise<PaperPageCharge> {
  const usageRef = paperHandwritingUsageRef(db, opts.uid, opts.nowMs);
  const [job, usage] = await Promise.all([
    tx.get(opts.jobRef),
    tx.get(usageRef),
  ]);
  const alreadyCharged = job.data()?.charged === true;
  const used = countOf(usage.data());
  return {
    alreadyCharged,
    apply: () => {
      if (alreadyCharged) return;
      tx.set(
        usageRef,
        {
          count: used + 1,
          featureId: PAPER_HANDWRITTEN_FEATURE,
          lastUsed: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        opts.jobRef,
        { charged: true, updatedAt: opts.nowMs },
        { merge: true }
      );
    },
  };
}
