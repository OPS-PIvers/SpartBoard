import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT,
  PAPER_HANDWRITTEN_FEATURE,
} from './paperWritten';

/** What import shows before it runs; mirrors `readPaperHandwritingQuota` on the server. */
export interface PaperImportQuota {
  /** Transcription is switched off for everyone. */
  disabled: boolean;
  /** Pages left today; `Infinity` when unlimited. */
  remaining: number;
}

export type ReadDocData = (
  collection: string,
  id: string
) => Promise<Record<string, unknown> | undefined>;

/** UTC day, matching the server's `ai_usage` counters. */
export const paperQuotaDay = (nowMs: number) =>
  new Date(nowMs).toISOString().slice(0, 10);

export async function readPaperImportQuota(
  read: ReadDocData,
  opts: { uid: string; isAdmin: boolean; nowMs: number }
): Promise<PaperImportQuota> {
  const [gemini, perm, usage] = await Promise.all([
    read('global_permissions', 'gemini-functions'),
    read('global_permissions', PAPER_HANDWRITTEN_FEATURE),
    read(
      'ai_usage',
      `${opts.uid}_${PAPER_HANDWRITTEN_FEATURE}_${paperQuotaDay(opts.nowMs)}`
    ),
  ]);
  const disabled = gemini?.enabled === false;
  const config = (perm?.config ?? {}) as {
    dailyLimit?: unknown;
    dailyLimitEnabled?: unknown;
  };
  const limit =
    typeof config.dailyLimit === 'number' &&
    Number.isFinite(config.dailyLimit) &&
    config.dailyLimit >= 0
      ? Math.floor(config.dailyLimit)
      : PAPER_HANDWRITTEN_DEFAULT_DAILY_LIMIT;
  if (opts.isAdmin || config.dailyLimitEnabled === false) {
    return { disabled, remaining: Infinity };
  }
  const used = Number(usage?.count ?? 0);
  const spent = Number.isFinite(used) && used > 0 ? used : 0;
  return { disabled, remaining: Math.max(0, limit - spent) };
}

export const firestoreDocData: ReadDocData = async (collection, id) =>
  (await getDoc(doc(db, collection, id))).data();
