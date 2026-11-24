import type { TourSurfaceMap } from './types';

// Student-facing pages; the teacher-side quiz pieces in components/quiz/ stay on board surfaces.
export const SURFACES: TourSurfaceMap = {
  'student-quiz.page': {
    label: 'Quiz student app: join, questions, review and results (URL /quiz)',
    kind: 'page',
    url: '/quiz',
    files: ['components/quiz/'],
  },
};
