import { Student } from '@/types';

const LINKED_PIN_DIGITS = 6;

/** A linked student's PIN shorter than this can't sign them in (mirrors `isBridgeablePin` in functions). */
const needsNewLinkedPin = (s: Student): boolean =>
  !!s.classLinkSourcedId &&
  !!s.pin &&
  s.pin.replace(/[^a-z0-9]/gi, '').length < LINKED_PIN_DIGITS;

/** A random 6-digit PIN; ClassLink-linked PINs sign a student in, so they must not be guessable. */
function randomLinkedPin(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 10 ** LINKED_PIN_DIGITS).padStart(LINKED_PIN_DIGITS, '0');
}

/** Swaps in a new PIN and keeps the old one so past responses still resolve to this student. */
const withNewPin = (s: Student, pin: string): Student => ({
  ...s,
  pin,
  formerPins: [...new Set([...(s.formerPins ?? []), s.pin])],
});

/**
 * Assigns PINs to students that don't have one yet: random 6-digit PINs for
 * ClassLink-linked students, zero-padded sequential PINs for everyone else.
 * A linked student's short PIN (the old 01, 02, … defaults) is replaced too,
 * and moves to `formerPins`, which is never handed out again.
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
 * Read paths pass `randomForLinked: false` so an unsaved fill stays the same on every load.
 *
 * Returns a new array — does not mutate the input.
 */
export function assignPins(
  students: Student[],
  { randomForLinked = true }: { randomForLinked?: boolean } = {}
): Student[] {
  const replacing = (s: Student) => randomForLinked && needsNewLinkedPin(s);
  const used = new Set(
    students.flatMap((s) => [
      ...(s.pin ? [s.pin] : []),
      ...(s.formerPins ?? []),
    ])
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
    if (replacing(s)) return withNewPin(s, takeRandomPin());
    if (s.pin) return s;
    return {
      ...s,
      pin:
        s.classLinkSourcedId && randomForLinked
          ? takeRandomPin()
          : takeNextAvailablePin(),
    };
  });
}
