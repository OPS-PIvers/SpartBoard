// Write log, daily write cap and pre-edit snapshots for Claude writes (CC-D9, CC-D16).
import * as admin from 'firebase-admin';
import { DAILY_WRITE_LIMIT, LOG_TTL_MS } from './config';

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
  | 'mini_app';

export interface ToolContext {
  db: Firestore;
  uid: string;
  email: string;
  grantId: string;
}

export class ToolError extends Error {}

const utcDay = (now: number): string =>
  new Date(now).toISOString().slice(0, 10);

/** Reserve one write against today's cap; throws ToolError once the cap is reached. */
export async function reserveWrite(
  ctx: ToolContext,
  now = Date.now()
): Promise<void> {
  const ref = ctx.db.doc(`users/${ctx.uid}/claude_usage/${utcDay(now)}`);
  await ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.get('writes') ?? 0) : 0;
    if (count >= DAILY_WRITE_LIMIT) {
      throw new ToolError(
        `Daily limit of ${DAILY_WRITE_LIMIT} Claude changes reached. It resets at midnight UTC.`
      );
    }
    tx.set(
      ref,
      {
        writes: count + 1,
        updatedAt: now,
        expireAt: admin.firestore.Timestamp.fromMillis(now + LOG_TTL_MS),
      },
      { merge: true }
    );
  });
}

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
