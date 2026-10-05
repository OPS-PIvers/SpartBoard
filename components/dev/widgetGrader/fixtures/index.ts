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
import { calendarFixtures } from './calendar';
import { classesFixtures } from './classes';
import { diceFixtures } from './dice';
import { drawingFixtures } from './drawing';
import { embedFixtures } from './embed';
import { expectationsFixtures } from './expectations';
import { instructionalRoutinesFixtures } from './instructionalRoutines';
import { lunchCountFixtures } from './lunchCount';
import { materialsFixtures } from './materials';
import { miniAppFixtures } from './miniApp';
import { qrFixtures } from './qr';
import { scoreboardFixtures } from './scoreboard';
import { soundFixtures } from './sound';
import { timeToolFixtures } from './time-tool';
import { trafficFixtures } from './traffic';
import { weatherFixtures } from './weather';
import { webcamFixtures } from './webcam';
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
  // S5a
  calendar: calendarFixtures,
  classes: classesFixtures,
  dice: diceFixtures,
  drawing: drawingFixtures,
  embed: embedFixtures,
  expectations: expectationsFixtures,
  instructionalRoutines: instructionalRoutinesFixtures,
  lunchCount: lunchCountFixtures,
  materials: materialsFixtures,
  miniApp: miniAppFixtures,
  qr: qrFixtures,
  scoreboard: scoreboardFixtures,
  sound: soundFixtures,
  'time-tool': timeToolFixtures,
  traffic: trafficFixtures,
  weather: weatherFixtures,
  webcam: webcamFixtures,
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
