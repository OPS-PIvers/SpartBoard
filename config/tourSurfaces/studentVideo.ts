import type { TourSurfaceMap } from './types';

// The Video Activity student app; admins record its tours in View as student.
export const SURFACES: TourSurfaceMap = {
  'student-video.page': {
    label: 'Video Activity student page (join, video, questions, finished)',
    kind: 'page',
    url: '/activity/{sessionId}',
    needs: ['live-session'],
    files: ['components/videoActivity/'],
  },
};
