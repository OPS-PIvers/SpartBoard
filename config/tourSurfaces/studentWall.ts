import type { TourSurfaceMap } from './types';

const AW = 'components/activityWall/';

export const SURFACES: TourSurfaceMap = {
  'student-wall.page': {
    label: 'Activity Wall student page (URL /activity-wall/{sessionId})',
    kind: 'page',
    url: '/activity-wall/{sessionId}',
    needs: ['live-session'],
    files: [
      `${AW}ActivityWallStudentApp.tsx`,
      `${AW}submission/WallShell.tsx`,
      `${AW}engagement/`,
      `${AW}render/SubmissionCard.tsx`,
    ],
  },
  'student-wall.composer': {
    label: 'Add a post form on the student wall',
    kind: 'modal',
    files: [
      `${AW}submission/ComposerSheet.tsx`,
      `${AW}submission/ContentFields.tsx`,
      `${AW}submission/StructureFields.tsx`,
      `${AW}submission/SubmissionTypePicker.tsx`,
      `${AW}submission/MapPinPicker.tsx`,
    ],
    opensWith: 'student.activity-wall.add-post',
    alsoOpensWith: ['student.activity-wall.post-edit:student-wall'],
  },
};
