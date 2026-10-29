// DEV-only: Settings on an in-progress Video Activity assignment, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { VideoActivityAssignment } from '@/types';
import { VideoAssignmentSettingsModal } from '@/components/widgets/VideoActivityWidget/components/VideoAssignmentSettingsModal';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const day = (offset: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const ASSIGNMENT = {
  id: 'a1',
  activityId: 'v1',
  activityTitle: 'Cell Division Video',
  activityDriveFileId: 'drive1',
  teacherUid: 'teacher-1',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  rosterIds: SAMPLE_ROSTERS.slice(0, 2).map((r) => r.id),
  openAt: day(0, 8),
  closeAt: day(1, 15),
  dueAt: day(1, 15),
  sessionSettings: {
    autoPlay: false,
    requireCorrectAnswer: true,
    allowSkipping: false,
  },
  sessionOptions: {
    attemptLimit: 2,
    answerRulesSet: true,
    tabWarningsEnabled: true,
    shuffleAnswerOptions: true,
  },
} as VideoActivityAssignment;

const Preview: React.FC = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-2 text-sm text-slate-600">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-bold text-brand-blue-primary"
      >
        Open
      </button>
      {open && (
        <VideoAssignmentSettingsModal
          assignment={ASSIGNMENT}
          rosters={SAMPLE_ROSTERS}
          onClose={() => setOpen(false)}
          onSave={() => undefined}
        />
      )}
    </div>
  );
};

const preview = {
  title: 'Video Activity assignment settings',
  render: Preview,
};
export default preview;
