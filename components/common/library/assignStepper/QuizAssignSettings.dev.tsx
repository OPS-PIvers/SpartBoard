// DEV-only: the in-progress Quiz settings dialog on the stepper, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { QuizAssignment } from '@/types';
import { QuizAssignmentSettingsModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentSettingsModal';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const day = (offset: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const ASSIGNMENT = {
  id: 'a1',
  quizId: 'q1',
  quizTitle: 'Sample Quiz',
  quizDriveFileId: 'drive1',
  teacherUid: 'teacher-1',
  code: 'ABC123',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  sessionMode: 'student',
  sessionOptions: { shuffleAnswerOptions: true, tabWarningsEnabled: true },
  attemptLimit: 1,
  rosterIds: SAMPLE_ROSTERS.slice(0, 2).map((r) => r.id),
  openAt: day(0, 8),
  closeAt: day(1, 15),
  dueAt: day(1, 15),
  dueAtHasTime: true,
  plc: { id: 'plc-1', name: 'Grade 8 Science PLC', sheetUrl: '' },
} as unknown as QuizAssignment;

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
        <QuizAssignmentSettingsModal
          assignment={ASSIGNMENT}
          rosters={SAMPLE_ROSTERS}
          onClose={() => setOpen(false)}
          onSave={() => undefined}
          canShareWithPlc
        />
      )}
    </div>
  );
};

const preview = { title: 'Quiz assignment settings', render: Preview };
export default preview;
