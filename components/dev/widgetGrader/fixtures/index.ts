import type { WidgetType } from '@/types';
import type { WidgetFixtureSet } from './types';
import { checklistFixtures } from './checklist';
import { clockFixtures } from './clock';
import { pollFixtures } from './poll';
import { randomFixtures } from './random';
import { scheduleFixtures } from './schedule';
import { textFixtures } from './text';

export * from './types';
export {
  STRESS,
  STRESS_ROSTER,
  TYPICAL_ROSTER,
  makeRoster,
  makeStudents,
  range,
} from './stress';

// Keep each slice's additions in its own alphabetized block.
export const WIDGET_FIXTURES: Partial<Record<WidgetType, WidgetFixtureSet>> = {
  // S3 pattern widgets
  checklist: checklistFixtures,
  clock: clockFixtures,
  poll: pollFixtures,
  random: randomFixtures,
  schedule: scheduleFixtures,
  text: textFixtures,
} as Partial<Record<WidgetType, WidgetFixtureSet>>;

// Types the harness can't grade, with the reason.
export const UNSUPPORTED_FIXTURES: Partial<Record<WidgetType, string>> = {
  sticker: 'Stickers render outside DraggableWindow and have no card to grade.',
};
