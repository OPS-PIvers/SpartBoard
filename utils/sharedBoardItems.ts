// Read-only copies of library items that board members can't reach in the owner's library (co-teaching plan slices 4-5).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  SubShareGuidedLearningView,
  SubShareQuizView,
  SubShareVideoActivityView,
} from '@/types';

/** Kinds mirrored under a board share; firestore.rules `sbItemCollection` maps each to its library collection. */
export type SharedBoardItemKind = 'quiz' | 'videoActivity' | 'guidedLearning';

/** A `shared_boards/{shareId}/items/{kind}_{itemId}` doc. */
export interface SharedBoardItemDoc<T = unknown> {
  kind: SharedBoardItemKind;
  itemId: string;
  ownerUid: string;
  title: string;
  /** Publisher-chosen; a write is skipped while the stored version matches. */
  version: string;
  publishedAt: number;
  payload: T;
}

export interface SharedBoardQuizPayload {
  quiz: SubShareQuizView;
  /** Bank draws can't travel: the banks are the owner's. */
  hasBankSlots: boolean;
}

export interface SharedBoardVideoActivityPayload {
  activity: SubShareVideoActivityView;
}

export interface SharedBoardGuidedLearningPayload {
  set: SubShareGuidedLearningView;
}

export const SHARED_BOARD_ITEMS = 'items';

export function sharedBoardItemDocId(
  kind: SharedBoardItemKind,
  itemId: string
): string {
  return `${kind}_${itemId}`;
}

/** The id a member's linked copy takes in their own library, so Assign twice reuses it. */
export function sharedBoardCopyId(itemId: string): string {
  return `${itemId}-copy`;
}

const itemRef = (shareId: string, kind: SharedBoardItemKind, itemId: string) =>
  doc(
    db,
    'shared_boards',
    shareId,
    SHARED_BOARD_ITEMS,
    sharedBoardItemDocId(kind, itemId)
  );

/** Writes the owner's copy unless the stored one is already this version. Returns whether it wrote. */
export async function publishSharedBoardItem<T>(
  shareId: string,
  item: Omit<SharedBoardItemDoc<T>, 'publishedAt' | 'payload'>,
  buildPayload: () => Promise<T>
): Promise<boolean> {
  const ref = itemRef(shareId, item.kind, item.itemId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const data = existing.data() as Partial<SharedBoardItemDoc>;
    // Another member's item under the same id is theirs to keep.
    if (data.ownerUid !== item.ownerUid) return false;
    if (data.version === item.version) return false;
  }
  const payload = await buildPayload();
  const next: SharedBoardItemDoc<T> = {
    ...item,
    publishedAt: Date.now(),
    payload,
  };
  await setDoc(ref, next);
  return true;
}

export { itemRef as sharedBoardItemRef };
