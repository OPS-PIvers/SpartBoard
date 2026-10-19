import type { ClassRoster, PaperSeatAssignment } from '@/types';

/** "Last, First" for a seat, or null for a spare or a student no longer on the roster. */
export function seatDisplayName(
  rosters: readonly Pick<ClassRoster, 'id' | 'name' | 'students'>[],
  seat: PaperSeatAssignment | undefined
): { name: string; className: string } | null {
  if (!seat) return null;
  const roster = rosters.find((r) => r.id === seat.rosterId);
  const student = roster?.students.find((s) => s.id === seat.studentId);
  if (!roster || !student) return null;
  const name =
    [student.lastName, student.firstName].filter(Boolean).join(', ') ||
    'Unnamed student';
  return { name, className: roster.name };
}
