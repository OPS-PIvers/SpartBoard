/**
 * Firestore access for printed paper answer-sheet runs at
 * `users/{teacherUid}/paper_batches/{batchId}`.
 *
 * Plain functions rather than a hook: printing writes one doc and walks away,
 * and the import half (Increment 2) reads by quiz. Nothing here subscribes.
 */

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PaperBatch, PaperPendingReview } from '@/types';

const PAPER_BATCHES_COLLECTION = 'paper_batches';

const batchesRef = (userId: string) =>
  collection(db, 'users', userId, PAPER_BATCHES_COLLECTION);

/** Write a freshly printed batch. The doc id is the batch id. */
export async function savePaperBatch(
  userId: string,
  batch: PaperBatch
): Promise<void> {
  await setDoc(doc(batchesRef(userId), batch.id), batch);
}

/** Every batch printed for one quiz, newest first. */
export async function listPaperBatchesForQuiz(
  userId: string,
  quizId: string
): Promise<PaperBatch[]> {
  const snap = await getDocs(
    query(batchesRef(userId), where('quizId', '==', quizId))
  );
  return snap.docs
    .map((d) => d.data() as PaperBatch)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Park or clear an unfinished review on its batch (plan Q26). */
export async function savePendingReview(
  userId: string,
  batchId: string,
  review: PaperPendingReview | null
): Promise<void> {
  await updateDoc(doc(batchesRef(userId), batchId), {
    pendingReview: review ?? deleteField(),
  });
}

export async function deletePaperBatch(
  userId: string,
  batchId: string
): Promise<void> {
  await deleteDoc(doc(batchesRef(userId), batchId));
}

/**
 * Drop every batch belonging to a deleted quiz (plan Q29 — batches outlive the
 * stack of paper, but not the quiz). Best-effort: a failure here must never
 * block the quiz delete the teacher actually asked for.
 */
export async function deletePaperBatchesForQuiz(
  userId: string,
  quizId: string
): Promise<void> {
  const snap = await getDocs(
    query(batchesRef(userId), where('quizId', '==', quizId))
  );
  if (snap.empty) return;
  const writes = writeBatch(db);
  for (const d of snap.docs) writes.delete(d.ref);
  await writes.commit();
}
