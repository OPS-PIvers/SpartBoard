/**
 * Shared helper + type definitions for `AssignClassPicker`. Kept in a
 * `.ts` sibling so the `.tsx` component file only exports components
 * (required for Vite's fast-refresh contract).
 */

import type { ClassLinkClass } from '@/types';

export type AssignClassSource = 'classlink' | 'local';

export interface AssignClassPickerValue {
  /** Which source list is currently active. */
  source: AssignClassSource;
  /** Selected ClassLink class `sourcedId`s (populated when source === 'classlink'). */
  classIds: string[];
  /** Selected local roster names (populated when source === 'local'). */
  periodNames: string[];
}

/**
 * Build a human-readable label for a ClassLink class. Mirrors the format
 * used elsewhere (ClassLinkImportDialog, legacy QuizManager) so teachers
 * see the same class names across flows.
 */
export function formatClassLinkClassLabel(cls: ClassLinkClass): string {
  const subjectPrefix = cls.subject ? `${cls.subject} - ` : '';
  const codeSuffix = cls.classCode ? ` (${cls.classCode})` : '';
  return `${subjectPrefix}${cls.title}${codeSuffix}`;
}

/** Default-empty value helper used by callers to seed initial picker state. */
export function makeEmptyPickerValue(
  source: AssignClassSource = 'classlink'
): AssignClassPickerValue {
  return { source, classIds: [], periodNames: [] };
}
