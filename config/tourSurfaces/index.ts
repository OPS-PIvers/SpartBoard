import type { TourSurfaceDef } from './types';
import { SURFACES as BOARD } from './board';
import { SURFACES as ADMIN } from './admin';
import { SURFACES as PLC } from './plc';
import { SURFACES as QUIZ } from './quiz';
import { SURFACES as LIBRARY } from './library';
import { SURFACES as GUIDED_LEARNING } from './guidedLearning';
import { SURFACES as WIDGETS } from './widgets';
import { SURFACES as STUDENT_WALL } from './studentWall';
import { SURFACES as STUDENT_ASSIGNMENTS } from './studentAssignments';
import { SURFACES as STUDENT_VIDEO } from './studentVideo';
import { SURFACES as STUDENT_GUIDED_LEARNING } from './studentGuidedLearning';

export * from './types';

/** Each area's surfaces; tests/tourAnchorRoutes.test.ts fails on an id two areas share. */
export const TOUR_SURFACE_AREAS = {
  board: BOARD,
  admin: ADMIN,
  plc: PLC,
  quiz: QUIZ,
  library: LIBRARY,
  guidedLearning: GUIDED_LEARNING,
  widgets: WIDGETS,
  studentWall: STUDENT_WALL,
  studentAssignments: STUDENT_ASSIGNMENTS,
  studentVideo: STUDENT_VIDEO,
  studentGuidedLearning: STUDENT_GUIDED_LEARNING,
} as const;

export const TOUR_SURFACES: Readonly<Record<string, TourSurfaceDef>> =
  Object.fromEntries(
    Object.values(TOUR_SURFACE_AREAS).flatMap((area) => Object.entries(area))
  );
