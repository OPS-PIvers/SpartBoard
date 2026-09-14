// Shared skipped-students toast copy for the four B3 assign flows
// (Quiz/VA/GL/MiniApp) — one message via `assignTargeting.skippedToast*`
// instead of four hand-rolled strings (F3 fix).
import i18n from '@/i18n/index';

export function skippedTargetsToastMessage(
  count: number,
  /** How many of those were skips the teacher asked for that did not land. */
  exclusionCount = 0
): string {
  const base = i18n.t('assignTargeting.skippedToast', { count });
  if (exclusionCount <= 0) return base;
  return `${base} ${i18n.t('assignTargeting.skippedExclusionToast', {
    count: exclusionCount,
  })}`;
}
