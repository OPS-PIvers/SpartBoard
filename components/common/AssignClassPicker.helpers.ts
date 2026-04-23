/**
 * Shared helper + type definitions for `AssignClassPicker`. Kept in a
 * `.ts` sibling so the `.tsx` component file only exports components
 * (required for Vite's fast-refresh contract).
 */

import type { ClassLinkClass, ClassRoster } from '@/types';

/**
 * Unified picker value. Rosters are the single source of truth for assignment
 * targeting — ClassLink-imported rosters carry `classlinkClassId` metadata so
 * the session-creation layer can still derive ClassLink sourcedIds for the
 * student SSO gate without the assignment UI having to branch.
 */
export interface AssignClassPickerValue {
  rosterIds: string[];
}

/** Default-empty value helper used by callers to seed initial picker state. */
export function makeEmptyPickerValue(): AssignClassPickerValue {
  return { rosterIds: [] };
}

/**
 * Build a human-readable label for a ClassLink class. Retained for the Import
 * dialog, which still lists live ClassLink classes (the import flow is the
 * only place live ClassLink data surfaces after the unification).
 */
export function formatClassLinkClassLabel(cls: ClassLinkClass): string {
  const subjectPrefix = cls.subject ? `${cls.subject} - ` : '';
  const codeSuffix = cls.classCode ? ` (${cls.classCode})` : '';
  return `${subjectPrefix}${cls.title}${codeSuffix}`;
}

/**
 * Derive the selected rosters from the picker value. Filters out IDs that no
 * longer exist (roster deleted after the value was saved as a teacher
 * preference) so downstream consumers never see dangling references.
 */
export function resolveSelectedRosters(
  value: AssignClassPickerValue,
  rosters: ClassRoster[]
): ClassRoster[] {
  if (value.rosterIds.length === 0) return [];
  const byId = new Map(rosters.map((r) => [r.id, r]));
  return value.rosterIds
    .map((id) => byId.get(id))
    .filter((r): r is ClassRoster => r !== undefined);
}
