/** Collapsed-row chip summary for a `StudentOverride` (M17 spec §5 B2, Decision 16). */

import type { TFunction } from 'i18next';
import type { StudentOverride } from '@/types';

export const summarizeOverride = (
  override: StudentOverride,
  t: TFunction,
  opts: { totalQuestions?: number } = {}
): string[] => {
  const chips: string[] = [];
  if (override.timeMultiplier === 'unlimited')
    chips.push(
      t('studentOverride.chip.unlimitedTime', {
        defaultValue: 'Unlimited time',
      })
    );
  else if (override.timeMultiplier)
    chips.push(
      t('studentOverride.chip.extendedTime', {
        multiplier: override.timeMultiplier,
        defaultValue: '{{multiplier}}x time',
      })
    );
  if (override.questionIds) {
    const total = opts.totalQuestions ?? override.questionIds.length;
    chips.push(
      t('studentOverride.chip.questionSubset', {
        selected: override.questionIds.length,
        total,
        defaultValue: '{{selected}}/{{total}} Qs',
      })
    );
  }
  const hiddenCount = Object.values(
    override.hiddenOptionIdsByQuestion ?? {}
  ).reduce((sum, ids) => sum + ids.length, 0);
  if (hiddenCount > 0)
    chips.push(
      t('studentOverride.chip.hiddenOptions', {
        count: hiddenCount,
        defaultValue: '{{count}} option hidden',
        defaultValue_other: '{{count}} options hidden',
      })
    );
  const rubricCount = Object.keys(
    override.rubricOverrideByQuestion ?? {}
  ).length;
  if (rubricCount > 0)
    chips.push(
      t('studentOverride.chip.rubricSwaps', {
        count: rubricCount,
        defaultValue: '{{count}} rubric swap',
        defaultValue_other: '{{count}} rubric swaps',
      })
    );
  if (override.tabWarningThreshold === 'off')
    chips.push(
      t('studentOverride.chip.tabWarningsOff', {
        defaultValue: 'Tab warnings off',
      })
    );
  else if (typeof override.tabWarningThreshold === 'number')
    chips.push(
      t('studentOverride.chip.tabWarning', {
        threshold: override.tabWarningThreshold,
        defaultValue: 'Tab warning: {{threshold}}',
      })
    );
  if (override.openAt || override.closeAt)
    chips.push(
      t('studentOverride.chip.windowShifted', {
        defaultValue: 'Window shifted',
      })
    );
  return chips;
};
