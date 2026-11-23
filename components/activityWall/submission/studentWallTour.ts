import { createContext, useContext } from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

/** True on the student wall page only, so the board's shared post form stays untagged. */
export const StudentWallTourContext = createContext(false);

const keep = (attrs: TourAnchorAttrs): TourAnchorAttrs => attrs;
const drop = (_attrs: TourAnchorAttrs): TourAnchorAttrs => ({});

/** Wraps a post form anchor so it renders only under the student wall page. */
export const useStudentWallTour = () =>
  useContext(StudentWallTourContext) ? keep : drop;
