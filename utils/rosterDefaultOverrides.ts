/**
 * Helpers for `ClassRoster.defaultOverridesByStudentId` — the standing
 * accommodations a teacher sets once on a roster so every future assignment
 * starts from them (applied by `AssignStudentPicker.applyDefaultOverride`).
 */

import type { StudentOverride } from '@/types';

/** Three-state switches where `false` means "Allow" rather than cleared. */
const TRI_STATE_KEYS = new Set<string>(['blockCopyPaste']);

/**
 * True when an override carries no active accommodation. The editor patches
 * fields to `undefined` when cleared, so a "cleared" override is an object of
 * empty values rather than an absent one.
 */
export const isEmptyStudentOverride = (
  override: StudentOverride | undefined
): boolean => {
  if (!override) return true;
  const entries: Array<[string, unknown]> = Object.entries(override);
  return entries.every(([key, value]) => {
    if (value === undefined || value === null) return true;
    if (value === false) return !TRI_STATE_KEYS.has(key);
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  });
};

/** Standing defaults have no assignment to shift; strip these before storing. */
const WINDOW_SHIFT_KEYS = new Set(['openAt', 'closeAt']);

/** Drops cleared keys so a stored override never carries `undefined` values. */
const compactStudentOverride = (override: StudentOverride): StudentOverride => {
  const next: Record<string, unknown> = {};
  const entries: Array<[string, unknown]> = Object.entries(override);
  for (const [key, value] of entries) {
    if (WINDOW_SHIFT_KEYS.has(key)) continue;
    if (value === undefined) continue;
    if (value === false && !TRI_STATE_KEYS.has(key)) continue;
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
  return next;
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

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** The settings every listed student has in common; what a group's row shows. */
export const sharedStudentOverride = (
  overrides: Record<string, StudentOverride>,
  studentIds: string[]
): StudentOverride => {
  if (studentIds.length === 0) return {};
  const [first, ...rest] = studentIds.map((id) =>
    compactStudentOverride(overrides[id] ?? {})
  );
  const shared: Record<string, unknown> = {};
  const entries: Array<[string, unknown]> = Object.entries(first);
  for (const [key, value] of entries) {
    if (
      rest.every((o) => sameValue((o as Record<string, unknown>)[key], value))
    )
      shared[key] = value;
  }
  return shared;
};

/** Applies a group-level edit: each setting that changed is set on every listed student, the rest stay theirs. */
export const applyGroupOverride = (
  overrides: Record<string, StudentOverride>,
  studentIds: string[],
  next: StudentOverride
): Record<string, StudentOverride> => {
  const prev: Record<string, unknown> = {
    ...sharedStudentOverride(overrides, studentIds),
  };
  const after: Record<string, unknown> = { ...next };
  const changed = [...new Set([...Object.keys(prev), ...Object.keys(after)])]
    .filter((key) => !WINDOW_SHIFT_KEYS.has(key))
    .filter((key) => !sameValue(prev[key], after[key]));
  if (changed.length === 0) return overrides;
  let result = overrides;
  for (const id of studentIds) {
    const own: Record<string, unknown> = { ...(result[id] ?? {}) };
    for (const key of changed) own[key] = after[key];
    result = setRosterDefaultOverride(result, id, own);
  }
  return result;
};
