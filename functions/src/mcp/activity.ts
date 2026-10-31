// Write log, daily write cap and pre-edit snapshots for Claude writes (CC-D9, CC-D16).
import * as admin from '../firebaseAdmin';
import { DAILY_BOARD_OP_LIMIT, DAILY_WRITE_LIMIT, LOG_TTL_MS } from './config';

type Firestore = admin.firestore.Firestore;
type WriteBatch = admin.firestore.WriteBatch;

export type ItemType =
  | 'flashcard_set'
  | 'folder'
  | 'quiz'
  | 'question_bank'
  | 'video_activity'
  | 'rubric'
  | 'activity_wall'
  | 'mini_app'
  | 'guided_learning'
  | 'meeting_notes'
  | 'board';

export interface ToolContext {
  db: Firestore;
  uid: string;
  email: string;
  grantId: string;
}

export class ToolError extends Error {}

const utcDay = (now: number): string =>
  new Date(now).toISOString().slice(0, 10);

async function reserve(
  ctx: ToolContext,
  field: 'writes' | 'boardOps',
  limit: number,
  message: string,
  now: number
): Promise<void> {
  const ref = ctx.db.doc(`users/${ctx.uid}/claude_usage/${utcDay(now)}`);
  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.get(field) ?? 0) : 0;
    if (count >= limit) throw new ToolError(message);
    tx.set(
      ref,
      {
        [field]: count + 1,
        updatedAt: now,
        expireAt: admin.firestore.Timestamp.fromMillis(now + LOG_TTL_MS),
      },
      { merge: true }
    );
  });
}

/** Reserve one write against today's cap; throws ToolError once the cap is reached. */
export const reserveWrite = (ctx: ToolContext, now = Date.now()) =>
  reserve(
    ctx,
    'writes',
    DAILY_WRITE_LIMIT,
    `Daily limit of ${DAILY_WRITE_LIMIT} Claude changes reached. It resets at midnight UTC.`,
    now
  );

/** Board calls have their own daily allowance; one create_board or edit_board call is one (AI_BOARDS D22). */
export const reserveBoardOp = (ctx: ToolContext, now = Date.now()) =>
  reserve(
    ctx,
    'boardOps',
    DAILY_BOARD_OP_LIMIT,
    `Daily limit of ${DAILY_BOARD_OP_LIMIT} Claude board changes reached. It resets at midnight UTC.`,
    now
  );

export interface ActivityEntry {
  action: 'create' | 'update' | 'restore';
  itemType: ItemType;
  itemId: string;
  title: string;
  revisionId?: string | null;
}

export function logActivity(
  ctx: ToolContext,
  batch: WriteBatch,
  entry: ActivityEntry,
  now = Date.now()
): void {
  const ref = ctx.db.collection(`users/${ctx.uid}/claude_activity`).doc();
  batch.set(ref, {
    ...entry,
    revisionId: entry.revisionId ?? null,
    title: entry.title.slice(0, 200),
    grantId: ctx.grantId,
    at: now,
    expireAt: admin.firestore.Timestamp.fromMillis(now + LOG_TTL_MS),
  });
}

/** Stores the pre-edit content; returns the revision id. */
export function snapshotRevision(
  ctx: ToolContext,
  batch: WriteBatch,
  input: {
    itemType: ItemType;
    itemId: string;
    title: string;
    data: Record<string, unknown>;
  },
  now = Date.now()
): string {
  const ref = ctx.db.collection(`users/${ctx.uid}/claude_revisions`).doc();
  batch.set(ref, {
    itemType: input.itemType,
    itemId: input.itemId,
    title: input.title.slice(0, 200),
    data: input.data,
    createdAt: now,
    expireAt: admin.firestore.Timestamp.fromMillis(now + LOG_TTL_MS),
  });
  return ref.id;
}

/** Set on every Claude write to a student-facing item; SpartBoard shows "Review before assigning" until the teacher opens the editor. */
export const REVIEW_MARK = 'claudeReviewPendingAt';
