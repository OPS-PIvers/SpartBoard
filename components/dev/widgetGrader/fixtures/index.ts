import type { WidgetType } from '@/types';
import type { WidgetFixtureSet } from './types';
import { checklistFixtures } from './checklist';
import { clockFixtures } from './clock';
import { pollFixtures } from './poll';
import { randomFixtures } from './random';
import { scheduleFixtures } from './schedule';
import { textFixtures } from './text';
import { activityWallFixtures } from './activity-wall';
import { bloomsDetailFixtures } from './blooms-detail';
import { bloomsTaxonomyFixtures } from './blooms-taxonomy';
import { customWidgetFixtures } from './custom-widget';
import { first5Fixtures } from './first-5';
import { flashcardsFixtures } from './flashcards';
import { needDoPutThenFixtures } from './need-do-put-then';
import { projectsFixtures } from './projects';
import { reviewFixtures } from './review';
import { routineGuideFixtures } from './routineGuide';
import { soundboardFixtures } from './soundboard';
import { stationsFixtures } from './stations';
import { urlFixtures } from './url';
import { workSymbolsFixtures } from './work-symbols';

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
  // S5d
  'activity-wall': activityWallFixtures,
  'blooms-detail': bloomsDetailFixtures,
  'blooms-taxonomy': bloomsTaxonomyFixtures,
  'custom-widget': customWidgetFixtures,
  'first-5': first5Fixtures,
  flashcards: flashcardsFixtures,
  'need-do-put-then': needDoPutThenFixtures,
  projects: projectsFixtures,
  review: reviewFixtures,
  routineGuide: routineGuideFixtures,
  soundboard: soundboardFixtures,
  stations: stationsFixtures,
  url: urlFixtures,
  'work-symbols': workSymbolsFixtures,
} as Partial<Record<WidgetType, WidgetFixtureSet>>;

// Types the harness can't grade, with the reason.
export const UNSUPPORTED_FIXTURES: Partial<Record<WidgetType, string>> = {
  sticker: 'Stickers render outside DraggableWindow and have no card to grade.',
};
