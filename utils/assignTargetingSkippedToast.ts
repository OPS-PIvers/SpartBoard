// Shared skipped-students toast copy for the four B3 assign flows
// (Quiz/VA/GL/MiniApp) — one message via `assignTargeting.skippedToast*`
// instead of four hand-rolled strings (F3 fix).
import i18n from '@/i18n/index';

export function skippedTargetsToastMessage(count: number): string {
  return i18n.t('assignTargeting.skippedToast', { count });
}
