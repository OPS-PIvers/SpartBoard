import type {
  SpecialistScheduleBuildingConfig,
  SpecialistScheduleConfig,
} from '@/types';
import {
  pickDueWarning,
  type DueWarning,
  type WarnableBlock,
} from '@/components/widgets/Schedule/blockWarning';
import { parseTime, specialistItemsForDate } from './utils';

const toSec = (t: string | undefined): number => {
  const m = parseTime(t);
  return m < 0 ? -1 : m * 60;
};

// A Daily Schedule block warns only when it has an end time.
export const findDueSpecialistWarning = (
  config: SpecialistScheduleConfig,
  building: SpecialistScheduleBuildingConfig | undefined,
  nowMs: number
): DueWarning | null => {
  const blocks = specialistItemsForDate(config, building, new Date(nowMs)).map(
    (item): WarnableBlock => ({
      key: item.id,
      task: item.task,
      startSec: toSec(item.startTime),
      endSec: toSec(item.endTime),
      warning: item.warning,
    })
  );
  return pickDueWarning(blocks, config.warningsFired, nowMs);
};
