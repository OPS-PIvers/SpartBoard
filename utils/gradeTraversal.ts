import type { ArtifactSlot } from '@/types';

export type GraderMode = 'question' | 'student';

export interface TraversalSlot {
  slot: ArtifactSlot;
  isGraded: boolean;
}

export interface TraversalRow {
  /** Stable identity for the student across questions (response key). */
  studentKey: string;
  slots: TraversalSlot[];
}

export interface TraversalQuestion {
  questionId: string;
  rows: TraversalRow[];
}

export interface TraversalTarget {
  questionIdx: number;
  questionId: string;
  studentKey: string;
  slot: ArtifactSlot;
  isGraded: boolean;
}

/** Students in first-seen order across every question. */
export function collectStudents(questions: TraversalQuestion[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of questions) {
    for (const row of q.rows) {
      if (seen.has(row.studentKey)) continue;
      seen.add(row.studentKey);
      out.push(row.studentKey);
    }
  }
  return out;
}

/** Flat grading order: question-major or student-major. */
export function buildTraversal(
  mode: GraderMode,
  questions: TraversalQuestion[]
): TraversalTarget[] {
  const out: TraversalTarget[] = [];
  const push = (
    questionIdx: number,
    q: TraversalQuestion,
    row: TraversalRow
  ) => {
    for (const s of row.slots) {
      out.push({
        questionIdx,
        questionId: q.questionId,
        studentKey: row.studentKey,
        slot: s.slot,
        isGraded: s.isGraded,
      });
    }
  };
  if (mode === 'question') {
    questions.forEach((q, qi) => q.rows.forEach((row) => push(qi, q, row)));
    return out;
  }
  for (const student of collectStudents(questions)) {
    questions.forEach((q, qi) => {
      const row = q.rows.find((r) => r.studentKey === student);
      if (row) push(qi, q, row);
    });
  }
  return out;
}

export function findPosition(
  list: TraversalTarget[],
  questionIdx: number,
  studentKey: string | undefined,
  slot: ArtifactSlot
): number {
  const exact = list.findIndex(
    (t) =>
      t.questionIdx === questionIdx &&
      t.studentKey === studentKey &&
      t.slot === slot
  );
  if (exact >= 0) return exact;
  return list.findIndex(
    (t) => t.questionIdx === questionIdx && t.studentKey === studentKey
  );
}

/** Next ungraded target after `from` in `dir`, wrapping; null when none remain. */
export function nextUngraded(
  list: TraversalTarget[],
  from: number,
  dir: 1 | -1
): number | null {
  const n = list.length;
  if (n === 0) return null;
  for (let step = 1; step <= n; step++) {
    const idx = (((from + dir * step) % n) + n) % n;
    if (idx === from) break;
    if (!list[idx].isGraded) return idx;
  }
  return null;
}
