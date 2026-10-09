// DEV-only: the PLC quiz assign on the stepper (D21), as PlcNewQuizAssignmentModal renders it, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { manualStartAvailable } from '@/utils/assignAvailability';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { defaultWhenValue } from './assignWhenValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const ROSTERS = SAMPLE_ROSTERS.map((r, i) => ({
  ...r,
  bellPeriod: { buildingId: 'b', periodId: String(i + 1) },
}));

const CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: (_roster, date) => {
    const open = new Date(date);
    open.setHours(8, 0, 0, 0);
    return { openAt: open.getTime(), closeAt: open.getTime() + 3_000_000 };
  },
  onTagRoster: () => undefined,
};

const Preview: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [classes, setClasses] = useState({
    classIds: ['c1', 'c2'],
    studentsByClass: {},
  });
  const [when, setWhen] = useState(() =>
    defaultWhenValue({
      activity: 'quiz',
      bellAvailable: true,
      manualAvailable: manualStartAvailable(CTX.bellWindow),
    })
  );
  const [behavior, setBehavior] = useState(() => getQuizAssignPrefill(null));

  return open ? (
    <QuizAssignStepper
      title="Unit 1 checkpoint"
      rosters={ROSTERS}
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      periodAccess={CTX}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      onClose={() => setOpen(false)}
      onSubmit={() => undefined}
    />
  ) : (
    <button type="button" onClick={() => setOpen(true)}>
      Open
    </button>
  );
};

const preview = { title: 'PLC quiz assign', render: Preview };
export default preview;
