/**
 * Firestore access for scored paper work at `users/{teacherUid}/scored_work/{workId}`
 * with one `scores/{seat}` doc per student. Plain functions: nothing here holds a name.
 */

import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  PaperSeatAssignment,
  ScoredWork,
  ScoredWorkPlcLink,
  ScoredWorkScore,
} from '@/types';

const WORK_COLLECTION = 'scored_work';
const SCORES_COLLECTION = 'scores';

const workRef = (userId: string) =>
  collection(db, 'users', userId, WORK_COLLECTION);
const scoresRef = (userId: string, workId: string) =>
  collection(db, 'users', userId, WORK_COLLECTION, workId, SCORES_COLLECTION);

export const saveScoredWork = (
  userId: string,
  work: ScoredWork
): Promise<void> => setDoc(doc(workRef(userId), work.id), work);

export const updateScoredWork = (
  userId: string,
  workId: string,
  patch: Partial<Pick<ScoredWork, 'driveFolderId' | 'title'>> & {
    plc?: ScoredWorkPlcLink;
  }
): Promise<void> =>
  updateDoc(doc(workRef(userId), workId), {
    ...patch,
    updatedAt: Date.now(),
  });

/** Record where one scanned page went in Drive; a rescan overwrites the same slot. */
export const saveScanPageId = (
  userId: string,
  workId: string,
  seat: number,
  pageCount: number,
  page: number,
  existing: Array<string | null> | undefined,
  fileId: string
): Promise<void> => {
  const next = Array.from(
    { length: pageCount },
    (_, i) => existing?.[i] ?? null
  );
  next[page - 1] = fileId;
  return updateDoc(doc(workRef(userId), workId), {
    [`scans.${seat}`]: next,
    updatedAt: Date.now(),
  });
};

/** Hand a walk-in's spare sheet to a roster student once the teacher knows who it was. */
export const assignSpareSeat = (
  userId: string,
  workId: string,
  seat: number,
  student: PaperSeatAssignment
): Promise<void> =>
  updateDoc(doc(workRef(userId), workId), {
    [`seats.${seat}`]: student,
    spareSeats: arrayRemove(seat),
    updatedAt: Date.now(),
  });

export function subscribeScoredWork(
  userId: string,
  onData: (work: ScoredWork[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(workRef(userId), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((d) => d.data() as ScoredWork)),
    onError
  );
}

export function subscribeScores(
  userId: string,
  workId: string,
  onData: (scores: ScoredWorkScore[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    scoresRef(userId, workId),
    (snap) => onData(snap.docs.map((d) => d.data() as ScoredWorkScore)),
    onError
  );
}

export const saveScore = (
  userId: string,
  workId: string,
  score: ScoredWorkScore
): Promise<void> =>
  setDoc(doc(scoresRef(userId, workId), String(score.seat)), score);

export const deleteScore = (
  userId: string,
  workId: string,
  seat: number
): Promise<void> => deleteDoc(doc(scoresRef(userId, workId), String(seat)));

/** Remove a set and its scores. Drive files stay with the teacher. */
export async function deleteScoredWork(
  userId: string,
  workId: string
): Promise<void> {
  const scores = await getDocs(scoresRef(userId, workId));
  const batch = writeBatch(db);
  scores.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(workRef(userId), workId));
  await batch.commit();
}
