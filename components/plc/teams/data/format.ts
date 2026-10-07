// Date and mastery-band labels shared by the Data overview views.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MasteryBand } from '@/utils/quizTargetStats';

export function useDateFormat() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language ? i18n.language : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
    return (ms: number) => (ms > 0 ? f.format(ms) : '');
  }, [i18n.language]);
}

export function useBandLabel() {
  const { t } = useTranslation();
  return (band: MasteryBand | null): string =>
    band === 'proficient'
      ? t('plcDataOverview.band.proficient', { defaultValue: 'Proficient' })
      : band === 'approaching'
        ? t('plcDataOverview.band.approaching', { defaultValue: 'Approaching' })
        : band === 'beginning'
          ? t('plcDataOverview.band.beginning', { defaultValue: 'Beginning' })
          : '';
}
