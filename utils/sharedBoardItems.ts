// Read-only copies of library items that board members can't reach in the owner's library (co-teaching plan slices 4-5).

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { quizHasBankSlots } from '@/utils/questionBanks';
import type {
  QuizData,
  SubShareGuidedLearningView,
  SubShareQuizView,
  SubShareVideoActivityView,
  VideoActivityData,
} from '@/types';

/** Kinds mirrored under a board share; firestore.rules `sbItemCollection` maps each to its library collection. */
export type SharedBoardItemKind = 'quiz' | 'videoActivity' | 'guidedLearning';

/** A `shared_boards/{shareId}/items/{kind}_{ownerUid}_{itemId}` doc. */
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

/** The owner is part of the id, so no other member can claim an item id first. */
export function sharedBoardItemDocId(
  kind: SharedBoardItemKind,
  ownerUid: string,
  itemId: string
): string {
  return `${kind}_${ownerUid}_${itemId}`;
}

/** The id a member's linked copy takes in their own library, so Assign twice reuses it. */
export function sharedBoardCopyId(itemId: string): string {
  return `${itemId}-copy`;
}

const itemRef = (
  shareId: string,
  kind: SharedBoardItemKind,
  ownerUid: string,
  itemId: string
) =>
  doc(
    db,
    'shared_boards',
    shareId,
    SHARED_BOARD_ITEMS,
    sharedBoardItemDocId(kind, ownerUid, itemId)
  );

/** Writes the owner's copy unless the stored one is already this version. Returns whether it wrote. */
export async function publishSharedBoardItem<T>(
  shareId: string,
  item: Omit<SharedBoardItemDoc<T>, 'publishedAt' | 'payload'>,
  buildPayload: () => Promise<T>
): Promise<boolean> {
  const ref = itemRef(shareId, item.kind, item.ownerUid, item.itemId);
  const existing = await getDoc(ref);
  if (
    existing.exists() &&
    (existing.data() as Partial<SharedBoardItemDoc>).version === item.version
  ) {
    return false;
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

/** The quiz field by field: PLC linkage, sync state and bank slots stay with the owner. */
export function sharedBoardQuizPayload(data: QuizData): SharedBoardQuizPayload {
  return {
    quiz: {
      id: data.id,
      title: data.title || 'Quiz',
      questions: Array.isArray(data.questions) ? data.questions : [],
      createdAt: data.createdAt ?? 0,
      updatedAt: data.updatedAt ?? 0,
      ...(data.stimuli ? { stimuli: data.stimuli } : {}),
      ...(data.language ? { language: data.language } : {}),
    },
    hasBankSlots: quizHasBankSlots(data),
  };
}

export function sharedBoardVideoActivityPayload(
  data: VideoActivityData
): SharedBoardVideoActivityPayload {
  return {
    activity: {
      id: data.id,
      title: data.title || 'Video activity',
      youtubeUrl: data.youtubeUrl ?? '',
      questions: Array.isArray(data.questions) ? data.questions : [],
      createdAt: data.createdAt ?? 0,
      updatedAt: data.updatedAt ?? 0,
      ...(data.videoDuration ? { videoDuration: data.videoDuration } : {}),
    },
  };
}

const LIBRARY_COLLECTION: Record<SharedBoardItemKind, string> = {
  quiz: 'quizzes',
  videoActivity: 'video_activities',
  guidedLearning: 'guided_learning',
};

/** Whether the viewer already holds the linked copy, so Assign never overwrites their edits to it. */
export async function hasSharedBoardCopy(
  uid: string,
  kind: SharedBoardItemKind,
  copyId: string
): Promise<boolean> {
  const snap = await getDoc(
    doc(db, 'users', uid, LIBRARY_COLLECTION[kind], copyId)
  );
  return snap.exists();
}
