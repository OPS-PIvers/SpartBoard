import type { TourSurfaceMap } from './types';

export const SURFACES: TourSurfaceMap = {
  'student.help': {
    label:
      'Help button on student pages (quiz, video, guided learning, activity wall, My Assignments)',
    kind: 'shared',
    files: ['components/student/tours/StudentHelpButton.tsx'],
  },
  'student.help-menu': {
    label: 'Help menu on student pages',
    kind: 'menu',
    files: ['components/student/tours/StudentHelpMenu.tsx'],
    opensWith: 'student.help',
  },
  'student-assignments.page': {
    label: 'My Assignments and Gradebook tab (student app, /my-assignments)',
    kind: 'page',
    url: '/my-assignments',
    needs: ['student-data'],
    files: ['components/student/'],
  },
};
