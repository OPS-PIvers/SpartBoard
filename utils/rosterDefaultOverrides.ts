/**
 * Helpers for `ClassRoster.defaultOverridesByStudentId` — the standing
 * accommodations a teacher sets once on a roster so every future assignment
 * starts from them (applied by `AssignStudentPicker.applyDefaultOverride`).
 */

import type { StudentOverride } from '@/types';

/**
 * True when an override carries no active accommodation. The editor patches
 * fields to `undefined` when cleared, so a "cleared" override is an object of
 * empty values rather than an absent one.
 */
export const isEmptyStudentOverride = (
  override: StudentOverride | undefined
): boolean => {
  if (!override) return true;
  const values: unknown[] = Object.values(override);
  return values.every((value) => {
    if (value === undefined || value === null || value === false) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  });
};

/** Drops cleared keys so a stored override never carries `undefined` values. */
const compactStudentOverride = (override: StudentOverride): StudentOverride => {
  const next: Record<string, unknown> = {};
  const entries: Array<[string, unknown]> = Object.entries(override);
  for (const [key, value] of entries) {
    if (value === undefined || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }
    next[key] = value;
  }
  return next as StudentOverride;
};

/**
 * Returns the map with `studentId`'s standing override replaced. An override
 * with nothing set is removed entirely — `applyDefaultOverride` treats any
 * present entry as an accommodation, so an empty object must never be stored.
 */
export const setRosterDefaultOverride = (
  overrides: Record<string, StudentOverride>,
  studentId: string,
  next: StudentOverride
): Record<string, StudentOverride> => {
  const result = { ...overrides };
  if (isEmptyStudentOverride(next)) delete result[studentId];
  else result[studentId] = compactStudentOverride(next);
  return result;
};
