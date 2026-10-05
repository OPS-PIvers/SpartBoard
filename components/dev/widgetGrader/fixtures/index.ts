import type { WidgetType } from '@/types';
import type { WidgetFixtureSet } from './types';
import { blendingBoardFixtures } from './blending-board';
import { carRiderProFixtures } from './car-rider-pro';
import { conceptWebFixtures } from './concept-web';
import { graphicOrganizerFixtures } from './graphic-organizer';
import { guidedLearningFixtures } from './guided-learning';
import { hotspotImageFixtures } from './hotspot-image';
import { musicFixtures } from './music';
import { numberLineFixtures } from './numberLine';
import { revealGridFixtures } from './reveal-grid';
import { specialistScheduleFixtures } from './specialist-schedule';
import { starterPackFixtures } from './starter-pack';
import { syntaxFramerFixtures } from './syntax-framer';
import { videoActivityFixtures } from './video-activity';
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
  // S5c
  'blending-board': blendingBoardFixtures,
  'car-rider-pro': carRiderProFixtures,
  'concept-web': conceptWebFixtures,
  'graphic-organizer': graphicOrganizerFixtures,
  'guided-learning': guidedLearningFixtures,
  'hotspot-image': hotspotImageFixtures,
  music: musicFixtures,
  numberLine: numberLineFixtures,
  'reveal-grid': revealGridFixtures,
  'specialist-schedule': specialistScheduleFixtures,
  'starter-pack': starterPackFixtures,
  'syntax-framer': syntaxFramerFixtures,
  'video-activity': videoActivityFixtures,
} as Partial<Record<WidgetType, WidgetFixtureSet>>;

// Types the harness can't grade, with the reason.
export const UNSUPPORTED_FIXTURES: Partial<Record<WidgetType, string>> = {
  sticker: 'Stickers render outside DraggableWindow and have no card to grade.',
};
