// Print response sheets again: the same seats from a saved stack, so a lost sheet imports as its student.
import type { ClassRoster, PaperBatch, Student } from '@/types';
import type { PaperQuizAnalysis, PaperSheetPlan } from './paperSheetPlan';

export interface ReprintSeat {
  seat: number;
  student: Student;
}

export interface ReprintClass {
  roster: ClassRoster;
  seats: ReprintSeat[];
}

/** Why a stack can't print again, or null when it can. */
export type ReprintBlocker = 'versions' | 'changed' | null;

const studentLabel = (s: Student): string =>
  [s.lastName, s.firstName].filter(Boolean).join(', ') || 'Unnamed student';

/** The stack's student seats by class, in the order they printed; students no longer on a roster are left out. */
export function reprintClasses(
  batch: PaperBatch,
  rosters: readonly ClassRoster[]
): ReprintClass[] {
  const byId = new Map(rosters.map((r) => [r.id, r]));
  const out = new Map<string, ReprintClass>();
  const seats = Object.entries(batch.seats)
    .map(([seat, a]) => ({ seat: Number(seat), ...a }))
    .sort((a, b) => a.seat - b.seat);
  for (const { seat, rosterId, studentId } of seats) {
    const roster = byId.get(rosterId);
    const student = roster?.students.find((s) => s.id === studentId);
    if (!roster || !student) continue;
    const entry = out.get(rosterId) ?? { roster, seats: [] };
    entry.seats.push({ seat, student });
    out.set(rosterId, entry);
  }
  return [...out.values()];
}

/** The sheets for the picked seats, each keeping its original seat marker. */
export function reprintSheets(
  classes: readonly ReprintClass[],
  picked: ReadonlySet<number>
): PaperSheetPlan[] {
  return classes.flatMap(({ roster, seats }) =>
    seats
      .filter((s) => picked.has(s.seat))
      .map((s) => ({
        seat: s.seat,
        student: { rosterId: roster.id, studentId: s.student.id },
        displayName: studentLabel(s.student),
        className: roster.name,
        isKeySheet: false,
      }))
  );
}

/** A stack prints again only from the quiz it printed from: same rows, same lettered choices. */
export function reprintBlocker(
  batch: PaperBatch,
  analysis: Pick<PaperQuizAnalysis, 'rows'>
): ReprintBlocker {
  if (batch.versions?.length) return 'versions';
  if (analysis.rows.length !== batch.questionCount) return 'changed';
  const order = batch.choiceOrder;
  if (order && analysis.rows.some((r) => !order[r.questionId]))
    return 'changed';
  return null;
}
