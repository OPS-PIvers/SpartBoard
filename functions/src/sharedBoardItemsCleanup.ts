// Removes a board share's read-only item copies when the share ends, and a member's copies when they leave it.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import './functionsInit';

export const SHARED_BOARD_ITEMS = 'items';

type ShareData = Record<string, unknown> | undefined;

function participantUids(data: ShareData): string[] {
  const p = data?.participants;
  return p && typeof p === 'object' && !Array.isArray(p) ? Object.keys(p) : [];
}

/** What a share write leaves orphaned: every copy (share ended) or the copies of members who left. */
export function orphanedCopies(
  before: ShareData,
  after: ShareData
): { all: true } | { all: false; ownerUids: string[] } {
  if (!after) return { all: true };
  if (!before) return { all: false, ownerUids: [] };
  const stay = new Set(participantUids(after));
  const author = after.originalAuthor;
  if (typeof author === 'string') stay.add(author);
  return {
    all: false,
    ownerUids: participantUids(before).filter((uid) => !stay.has(uid)),
  };
}

export async function cleanupSharedBoardItems(
  db: admin.firestore.Firestore,
  shareId: string,
  before: ShareData,
  after: ShareData
): Promise<number> {
  const plan = orphanedCopies(before, after);
  const items = db
    .collection('shared_boards')
    .doc(shareId)
    .collection(SHARED_BOARD_ITEMS);
  if (plan.all) {
    const snap = await items.get();
    if (snap.empty) return 0;
    await db.recursiveDelete(items);
    return snap.size;
  }
  let removed = 0;
  for (const uid of plan.ownerUids) {
    const snap = await items.where('ownerUid', '==', uid).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    removed += snap.size;
  }
  return removed;
}

export const sharedBoardItemsCleanup = onDocumentWritten(
  { document: 'shared_boards/{shareId}', maxInstances: 10 },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const plan = orphanedCopies(before, after);
    if (!plan.all && plan.ownerUids.length === 0) return;
    const { shareId } = event.params;
    const removed = await cleanupSharedBoardItems(
      admin.firestore(),
      shareId,
      before,
      after
    );
    if (removed > 0) {
      logger.info('[sharedBoardItemsCleanup] removed copies', {
        shareId,
        removed,
        ended: plan.all,
      });
    }
  }
);
