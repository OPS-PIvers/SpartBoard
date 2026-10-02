import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import type { StudentProgressSummary } from '../../utils/progress';

interface Props {
  progress: StudentProgressSummary | undefined;
  /** Sessions without the v2 player never write progress. */
  playerV2: boolean;
  stepCount: number | null;
  className?: string;
  style?: React.CSSProperties;
}

/** "Slide 7 of 12 · active 2 days ago" for one student (docs/plans/STUDENT_LANDING_V2.md D24). */
export const StudentProgressLine: React.FC<Props> = ({
  progress,
  playerV2,
  stepCount,
  className,
  style,
}) => {
  const { t } = useTranslation();
  const now = useMinuteClock();

  if (!playerV2) {
    return (
      <p className={className} style={style}>
        {t('glStudentProgress.notTracked')}
      </p>
    );
  }
  if (!progress) return null;

  const current = progress.furthestStepIdx + 1;
  const slide =
    stepCount && stepCount > 0
      ? t('glStudentProgress.slideOf', {
          current: Math.min(current, stepCount),
          total: stepCount,
        })
      : t('glStudentProgress.slide', { current });

  let active: string | null = null;
  if (progress.updatedAt !== null) {
    const minutes = Math.max(
      0,
      Math.floor((now - progress.updatedAt) / 60_000)
    );
    if (minutes < 1) active = t('glStudentProgress.activeNow');
    else if (minutes < 60)
      active = t('glStudentProgress.activeMinutes', { count: minutes });
    else if (minutes < 60 * 24)
      active = t('glStudentProgress.activeHours', {
        count: Math.floor(minutes / 60),
      });
    else
      active = t('glStudentProgress.activeDays', {
        count: Math.floor(minutes / (60 * 24)),
      });
  }

  return (
    <p className={className} style={style}>
      {active ? `${slide} · ${active}` : slide}
    </p>
  );
};
