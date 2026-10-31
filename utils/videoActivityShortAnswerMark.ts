// Saving and parsing a teacher's mark on a Video Activity short answer.
import { doc, FieldPath, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { WrittenAnswerGrade } from '@/types';
import { VA_SESSIONS_COLLECTION } from '@/utils/studentResultsPublish';

/** Writes one mark without touching the response's other marks. */
export async function saveShortAnswerMark(
  sessionId: string,
  responseKey: string,
  questionId: string,
  grade: WrittenAnswerGrade
): Promise<void> {
  await updateDoc(
    doc(db, VA_SESSIONS_COLLECTION, sessionId, 'responses', responseKey),
    new FieldPath('grading', questionId),
    grade
  );
}

/** Clamped to 0..max; null when the box doesn't hold a number. */
export function parseMarkPoints(raw: string, max: number): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(0, n));
}
