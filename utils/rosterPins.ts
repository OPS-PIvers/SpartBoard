import { Student } from '@/types';

const LINKED_PIN_DIGITS = 4;

/** A random 4-digit PIN; ClassLink-linked PINs sign a student in, so they must not be guessable. */
function randomLinkedPin(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 10 ** LINKED_PIN_DIGITS).padStart(LINKED_PIN_DIGITS, '0');
}

/**
 * Assigns PINs to students that don't have one yet: random 4-digit PINs for
 * ClassLink-linked students, zero-padded sequential PINs for everyone else.
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
  const takeRandomPin = (): string => {
    for (let tries = 0; tries < 1000; tries++) {
      const candidate = randomLinkedPin();
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    return takeNextAvailablePin();
  };

  return students.map((s) => {
    if (s.pin) return s;
    return {
      ...s,
      pin: s.classLinkSourcedId ? takeRandomPin() : takeNextAvailablePin(),
    };
  });
}
