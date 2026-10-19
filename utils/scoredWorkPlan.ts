import { MAX_SEAT, MAX_PAGE } from './paperSheetMarker';
import type {
  ClassRosterMeta,
  PaperSeatAssignment,
  Rubric,
  ScoredWork,
  Student,
} from '@/types';

export interface ScoredWorkSelection {
  roster: Pick<ClassRosterMeta, 'id' | 'name'>;
  students: readonly Student[];
}

/** One printed copy of the worksheet. Names only ever reach the paper. */
export interface ScoredWorkSheet {
  seat: number;
  student: PaperSeatAssignment | null;
  displayName: string;
  className: string;
}

export interface ScoredWorkPlanInput {
  id: string;
  title: string;
  rubric: Rubric;
  selections: readonly ScoredWorkSelection[];
  spareCount: number;
  pageCount: number;
  now: number;
}

const studentLabel = (s: Student): string =>
  [s.lastName, s.firstName].filter(Boolean).join(', ') || 'Unnamed student';

/** Most pages of a worksheet one student can receive; the marker holds 6 page bits. */
export const MAX_WORKSHEET_PAGES = MAX_PAGE;

/** Allocate a unique seat to every printed copy and build the PII-free record. */
export function planScoredWork(input: ScoredWorkPlanInput): {
  work: ScoredWork;
  sheets: ScoredWorkSheet[];
} {
  if (
    !Number.isInteger(input.pageCount) ||
    input.pageCount < 1 ||
    input.pageCount > MAX_WORKSHEET_PAGES
  ) {
    throw new RangeError(
      `A worksheet holds 1 to ${MAX_WORKSHEET_PAGES} pages per student.`
    );
  }
  const sheets: ScoredWorkSheet[] = [];
  const seats: Record<number, PaperSeatAssignment> = {};
  const spareSeats: number[] = [];
  let nextSeat = 1;
  const takeSeat = (): number => {
    if (nextSeat > MAX_SEAT) {
      throw new RangeError(
        `A print run holds at most ${MAX_SEAT} sheets; split it up.`
      );
    }
    const seat = nextSeat;
    nextSeat += 1;
    return seat;
  };

  for (const { roster, students } of input.selections) {
    for (const student of students) {
      const seat = takeSeat();
      seats[seat] = { rosterId: roster.id, studentId: student.id };
      sheets.push({
        seat,
        student: seats[seat],
        displayName: studentLabel(student),
        className: roster.name,
      });
    }
  }
  for (let i = 0; i < Math.max(0, input.spareCount); i += 1) {
    const seat = takeSeat();
    spareSeats.push(seat);
    sheets.push({
      seat,
      student: null,
      displayName: 'Name ______________________',
      className: '',
    });
  }

  return {
    work: {
      id: input.id,
      title: input.title,
      rubric: input.rubric,
      rosterIds: input.selections.map((s) => s.roster.id),
      seats,
      spareSeats,
      pageCount: input.pageCount,
      createdAt: input.now,
      updatedAt: input.now,
    },
    sheets,
  };
}
