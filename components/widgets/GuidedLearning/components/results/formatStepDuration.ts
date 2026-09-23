import type { TFunction } from 'i18next';

export function formatStepDuration(ms: number, t: TFunction): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return t('glEngagement.seconds', { seconds: total });
  return t('glEngagement.minutes', {
    minutes: Math.floor(total / 60),
    seconds: String(total % 60).padStart(2, '0'),
  });
}
