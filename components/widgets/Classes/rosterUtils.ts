import { Student } from '@/types';

/**
 * Splits a list of full names (one per line) into first and last names.
 * Tries to split on the last space found in each line.
 */
export const splitNames = (
  fullNames: string
): { firsts: string[]; lasts: string[] } => {
  const lines = fullNames.split('\n');
  const newFirsts: string[] = [];
  const newLasts: string[] = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed) {
      const lastSpaceIndex = trimmed.lastIndexOf(' ');
      if (lastSpaceIndex > 0) {
        // Split on last space (common pattern: "First Middle Last")
        newFirsts.push(trimmed.substring(0, lastSpaceIndex));
        newLasts.push(trimmed.substring(lastSpaceIndex + 1));
      } else {
        // No space found, keep in first name
        newFirsts.push(trimmed);
        newLasts.push('');
      }
    } else {
      newFirsts.push('');
      newLasts.push('');
    }
  });

  return { firsts: newFirsts, lasts: newLasts };
};

/**
 * Merges separate lists of first and last names into a single list of full names.
 */
export const mergeNames = (firsts: string, lasts: string): string[] => {
  const fList = firsts.split('\n');
  const lList = lasts.split('\n');
  const merged: string[] = [];

  const maxLength = Math.max(fList.length, lList.length);
  for (let i = 0; i < maxLength; i++) {
    const first = fList[i] ? fList[i].trim() : '';
    const last = lList[i] ? lList[i].trim() : '';
    if (first || last) {
      merged.push([first, last].filter(Boolean).join(' '));
    } else {
      merged.push('');
    }
  }
  return merged;
};

/**
 * Generates a list of Student objects from first and last names,
 * preserving IDs from an existing list if possible.
 */
export const generateStudentsList = (
  firsts: string,
  lasts: string,
  existingStudents: Student[] = [],
  pins?: string
): Student[] => {
  const fList = firsts.split('\n');
  const lList = lasts.split('\n');
  const pList = pins?.split('\n');

  return fList
    .map((f, i) => {
      const first = f.trim();
      const last = lList[i] ? lList[i].trim() : '';
      if (!first && !last) return null;

      // Try to find an existing student at this position to preserve ID
      const existing = existingStudents[i];
      const id = existing ? existing.id : crypto.randomUUID();
      const pin = pList
        ? pList[i]?.trim() || existing?.pin || ''
        : (existing?.pin ?? '');

      return { id, firstName: first, lastName: last, pin };
    })
    .filter((s): s is Student => s !== null);
};

/**
 * Finds duplicate PINs in a list of students.
 * Returns a Set of PIN values that appear more than once.
 */
export const findDuplicatePins = (students: Student[]): Set<string> => {
  const seen = new Map<string, number>();
  for (const s of students) {
    if (s.pin) {
      seen.set(s.pin, (seen.get(s.pin) ?? 0) + 1);
    }
  }
  const dupes = new Set<string>();
  for (const [pin, count] of seen) {
    if (count > 1) dupes.add(pin);
  }
  return dupes;
};
