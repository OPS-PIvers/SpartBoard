/** Discreet teacher-facing "modified" marker for D2's per-student roster (spec Decision 10 r2 / §3a-F). */

import type { TFunction } from 'i18next';
import type { StudentOverride } from '@/types';

export function studentOverrideModifiedNote(
  override: StudentOverride | undefined,
  totalQuestions: number | null,
  t: TFunction
): string | null {
  if (!override) return null;
  if (override.questionIds && totalQuestions != null) {
    return t('assignmentsHub.detail.modifiedWithCount', {
      defaultValue: 'modified ({{selected}} of {{total}} Qs)',
      selected: override.questionIds.length,
      total: totalQuestions,
    });
  }
  return t('assignmentsHub.detail.modified', { defaultValue: 'modified' });
}
