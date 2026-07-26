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
 * preserving IDs (and `classLinkSourcedId`) from an existing list if possible.
 *
 * Matching is two-phase, not raw array-index lookup: (1) an unchanged name
 * is matched to the existing student with that exact name first, so
 * reordering/inserting lines above it can't reattach its ID to someone else;
 * (2) any names left over (a genuine rename) are paired with any existing
 * students left over, in the order each side appears, so a same-position
 * rename still keeps its ID/pin/ClassLink link — matching the previous
 * position-based behavior for that case only.
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

  const parsed = fList
    .map((f, lineIndex) => {
      const first = f.trim();
      const last = lList[lineIndex] ? lList[lineIndex].trim() : '';
      return { first, last, lineIndex };
    })
    .filter((entry) => entry.first || entry.last);

  const byName = new Map<string, Student[]>();
  for (const s of existingStudents) {
    const key = `${s.firstName} ${s.lastName}`;
    const bucket = byName.get(key);
    if (bucket) bucket.push(s);
    else byName.set(key, [s]);
  }

  const matched = new Array<Student | undefined>(parsed.length).fill(undefined);
  const consumed = new Set<Student>();
  parsed.forEach((entry, idx) => {
    const key = `${entry.first} ${entry.last}`;
    const candidate = byName.get(key)?.shift();
    if (candidate) {
      matched[idx] = candidate;
      consumed.add(candidate);
    }
  });

  const leftoverExisting = existingStudents.filter((s) => !consumed.has(s));
  let leftoverCursor = 0;
  parsed.forEach((entry, idx) => {
    if (matched[idx] !== undefined) return;
    matched[idx] = leftoverExisting[leftoverCursor];
    leftoverCursor++;
  });

  return parsed.map((entry, idx) => {
    const existing = matched[idx];
    const id = existing ? existing.id : crypto.randomUUID();
    const pin = pList
      ? (pList[entry.lineIndex]?.trim() ?? existing?.pin ?? '')
      : (existing?.pin ?? '');

    const student: Student = {
      id,
      firstName: entry.first,
      lastName: entry.last,
      pin,
    };
    if (existing?.classLinkSourcedId !== undefined) {
      student.classLinkSourcedId = existing.classLinkSourcedId;
    }
    return student;
  });
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
