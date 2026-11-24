// Students holding a printed group copy of a device quiz.
import type { PaperBatch } from '@/types';

/** Roster seat key, `rosterId:studentId`, matching the monitor's roster rows. */
export const paperSeatKey = (rosterId: string, studentId: string): string =>
  `${rosterId}:${studentId}`;

/** Every roster student holding a seat in one of a device assignment's printed stacks. */
export function paperCopySeatKeys(
  batches: readonly Pick<PaperBatch, 'seats'>[]
): Set<string> {
  const keys = new Set<string>();
  for (const b of batches)
    for (const seat of Object.values(b.seats ?? {}))
      if (seat?.rosterId && seat.studentId)
        keys.add(paperSeatKey(seat.rosterId, seat.studentId));
  return keys;
}
