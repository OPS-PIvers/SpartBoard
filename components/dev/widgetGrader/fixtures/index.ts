import type { WidgetType } from '@/types';
import type { WidgetFixtureSet } from './types';
import { checklistFixtures } from './checklist';
import { clockFixtures } from './clock';
import { pollFixtures } from './poll';
import { randomFixtures } from './random';
import { scheduleFixtures } from './schedule';
import { textFixtures } from './text';
import { breathingFixtures } from './breathing';
import { catalystFixtures } from './catalyst';
import { catalystInstructionFixtures } from './catalyst-instruction';
import { catalystVisualFixtures } from './catalyst-visual';
import { countdownFixtures } from './countdown';
import { mathToolFixtures } from './mathTool';
import { mathToolsFixtures } from './mathTools';
import { nextUpFixtures } from './nextUp';
import { onboardingFixtures } from './onboarding';
import { pdfFixtures } from './pdf';
import { quizFixtures } from './quiz';
import { recessGearFixtures } from './recessGear';
import { seatingChartFixtures } from './seating-chart';
import { smartNotebookFixtures } from './smartNotebook';
import { stickersFixtures } from './stickers';
import { talkingToolFixtures } from './talking-tool';

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
  // S5b
  breathing: breathingFixtures,
  catalyst: catalystFixtures,
  'catalyst-instruction': catalystInstructionFixtures,
  'catalyst-visual': catalystVisualFixtures,
  countdown: countdownFixtures,
  mathTool: mathToolFixtures,
  mathTools: mathToolsFixtures,
  nextUp: nextUpFixtures,
  onboarding: onboardingFixtures,
  pdf: pdfFixtures,
  quiz: quizFixtures,
  recessGear: recessGearFixtures,
  'seating-chart': seatingChartFixtures,
  smartNotebook: smartNotebookFixtures,
  stickers: stickersFixtures,
  'talking-tool': talkingToolFixtures,
} as Partial<Record<WidgetType, WidgetFixtureSet>>;

// Types the harness can't grade, with the reason.
export const UNSUPPORTED_FIXTURES: Partial<Record<WidgetType, string>> = {
  sticker: 'Stickers render outside DraggableWindow and have no card to grade.',
};
