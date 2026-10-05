import type { WidgetType } from '@/types';
import type { WidgetFixtureSet } from './types';
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
} as Partial<Record<WidgetType, WidgetFixtureSet>>;

// Types the harness can't grade, with the reason.
export const UNSUPPORTED_FIXTURES: Partial<Record<WidgetType, string>> = {
  sticker: 'Stickers render outside DraggableWindow and have no card to grade.',
};
