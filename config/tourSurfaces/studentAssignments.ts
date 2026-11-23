import type { TourSurfaceMap } from './types';

export const SURFACES: TourSurfaceMap = {
  'student-assignments.page': {
    label: 'My Assignments and Gradebook tab (student app, /my-assignments)',
    kind: 'page',
    url: '/my-assignments',
    needs: ['student-data'],
    files: ['components/student/'],
  },
};
