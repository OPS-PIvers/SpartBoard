import type { TFunction } from 'i18next';
import {
  defaultAvailability,
  type AssignAvailability,
  type AssignWhenMode,
} from '@/utils/assignAvailability';

/** 'when' collects work, 'available' is a study resource, 'live' is Video Activity teacher-paced. */
export type AssignWhenVariant = 'when' | 'available' | 'live';

export interface AssignWhenValue {
  mode: AssignWhenMode;
  availability: AssignAvailability;
}

/** Quiz starts on Manual when it can; everything else is Scheduled. */
export function defaultWhenValue({
  activity,
  now = new Date(),
  bellAvailable,
  manualAvailable,
}: {
  activity: 'quiz' | 'video' | 'gl' | 'flashcards';
  now?: Date;
  bellAvailable: boolean;
  manualAvailable: boolean;
}): AssignWhenValue {
  return {
    mode: activity === 'quiz' && manualAvailable ? 'manual' : 'scheduled',
    availability: defaultAvailability(now, bellAvailable),
  };
}

const formatDay = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const formatClock = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** The collapsed When / Available header value. */
export function formatWhenValue(
  value: AssignWhenValue,
  {
    variant,
    rosterCount,
    manualAvailable,
    t,
  }: {
    variant: AssignWhenVariant;
    rosterCount: number;
    manualAvailable: boolean;
    t: TFunction;
  }
): string {
  if (variant === 'live')
    return t('assignWhen.liveValue', {
      defaultValue: 'You start it from the board',
    });
  if (variant === 'when' && value.mode === 'manual' && manualAvailable)
    return t('assignWhen.manualValue', {
      defaultValue: 'Manual. You start and pause each class.',
    });
  const available = variant === 'available';
  if (value.availability.byRoster && rosterCount > 1)
    return available
      ? t('assignWhen.availableEach', {
          defaultValue: 'Available on different dates for each class',
        })
      : t('assignWhen.openEach', {
          defaultValue: 'Open on different dates for each class',
        });
  const { opens, closes } = value.availability.all;
  const vars = {
    openDay: formatDay(opens.day),
    openTime:
      opens.time === 'bell'
        ? t('assignWhen.startOfClass', { defaultValue: 'start of class' })
        : formatClock(opens.time),
    closeDay: formatDay(closes.day),
    closeTime:
      closes.time === 'bell'
        ? t('assignWhen.endOfClass', { defaultValue: 'end of class' })
        : formatClock(closes.time),
  };
  return available
    ? t('assignWhen.availableRange', {
        ...vars,
        defaultValue:
          'Available {{openDay}}, {{openTime}} to {{closeDay}}, {{closeTime}}',
      })
    : t('assignWhen.openRange', {
        ...vars,
        defaultValue:
          'Open {{openDay}}, {{openTime}} to {{closeDay}}, {{closeTime}}',
      });
}
