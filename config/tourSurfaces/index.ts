import type { TourSurfaceDef } from './types';
import { SURFACES as BOARD } from './board';
import { SURFACES as ADMIN } from './admin';
import { SURFACES as PLC } from './plc';
import { SURFACES as QUIZ } from './quiz';
import { SURFACES as LIBRARY } from './library';
import { SURFACES as GUIDED_LEARNING } from './guidedLearning';
import { SURFACES as WIDGETS } from './widgets';

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
} as const;

export const TOUR_SURFACES: Readonly<Record<string, TourSurfaceDef>> =
  Object.fromEntries(
    Object.values(TOUR_SURFACE_AREAS).flatMap((area) => Object.entries(area))
  );
