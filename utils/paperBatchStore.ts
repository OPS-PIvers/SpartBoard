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
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PaperBatch, PaperPendingReview } from '@/types';

const PAPER_BATCHES_COLLECTION = 'paper_batches';

/** Bounds the sign-in sweep; a teacher never has more deferred stacks than this. */
const PENDING_COPY_SCAN_LIMIT = 25;

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

/**
 * Batches a teammate printed before this teacher had the quiz in their library
 * (PLC_DELEGATED_PAPER_PRINTING.md D20). Ordering on the marker is what filters:
 * a doc without the field is not in that index, so a normal library scans none.
 */
export async function listPendingQuizCopyBatches(
  userId: string,
  max = PENDING_COPY_SCAN_LIMIT
): Promise<PaperBatch[]> {
  const snap = await getDocs(
    query(
      batchesRef(userId),
      orderBy('pendingQuizCopy.requestedAt'),
      limit(max)
    )
  );
  return snap.docs.map((d) => d.data() as PaperBatch);
}

/** Bind a deferred batch to the copy that now exists and drop the marker. */
export async function clearPendingQuizCopy(
  userId: string,
  batchId: string,
  quizId: string
): Promise<void> {
  await updateDoc(doc(batchesRef(userId), batchId), {
    quizId,
    pendingQuizCopy: deleteField(),
  });
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
