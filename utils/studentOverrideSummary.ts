/** Collapsed-row chip summary for a `StudentOverride` (M17 spec §5 B2, Decision 16). */

import type { StudentOverride } from '@/types';

export const summarizeOverride = (
  override: StudentOverride,
  opts: { totalQuestions?: number } = {}
): string[] => {
  const chips: string[] = [];
  if (override.timeMultiplier === 'unlimited') chips.push('Unlimited time');
  else if (override.timeMultiplier)
    chips.push(`${override.timeMultiplier}x time`);
  if (override.questionIds) {
    const total = opts.totalQuestions ?? override.questionIds.length;
    chips.push(`${override.questionIds.length}/${total} Qs`);
  }
  const hiddenCount = Object.values(
    override.hiddenOptionIdsByQuestion ?? {}
  ).reduce((sum, ids) => sum + ids.length, 0);
  if (hiddenCount > 0) chips.push(`${hiddenCount} option(s) hidden`);
  const rubricCount = Object.keys(
    override.rubricOverrideByQuestion ?? {}
  ).length;
  if (rubricCount > 0) chips.push(`${rubricCount} rubric swap(s)`);
  if (override.tabWarningThreshold === 'off') chips.push('Tab warnings off');
  else if (typeof override.tabWarningThreshold === 'number')
    chips.push(`Tab warning: ${override.tabWarningThreshold}`);
  if (override.openAt || override.closeAt) chips.push('Window shifted');
  return chips;
};
