import { Student } from '@/types';

/**
 * Assigns zero-padded sequential PINs to students that don't have one yet.
 *
 * Never hands out a fallback PIN that collides with any PIN already present
 * in the roster (manually entered or previously assigned) — position-based
 * fallbacks (`String(i + 1).padStart(2, '0')`) skip over any value already
 * taken and keep advancing until they find a free one. Without this, a
 * teacher who hand-sets a PIN like "05" while leaving an earlier student's
 * PIN blank would silently get two students sharing "05", which breaks the
 * PIN-based student login/SSO bridge (see `syncRosterPinIndex` in
 * `hooks/useRosters.ts`).
 *
 * Returns a new array — does not mutate the input.
 */
export function assignPins(students: Student[]): Student[] {
  const used = new Set(
    students.map((s) => s.pin).filter((pin): pin is string => !!pin)
  );
  let next = 1;
  const takeNextAvailablePin = (): string => {
    let candidate = String(next).padStart(2, '0');
    while (used.has(candidate)) {
      next += 1;
      candidate = String(next).padStart(2, '0');
    }
    used.add(candidate);
    next += 1;
    return candidate;
  };

  return students.map((s) =>
    s.pin ? s : { ...s, pin: takeNextAvailablePin() }
  );
}
