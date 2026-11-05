// DEV-only: the Quiz assign stepper with the Staff audience, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import type { AssignmentAudience } from '@/utils/staffAudience';
import { defaultWhenValue } from './assignWhenValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const Preview: React.FC = () => {
  const [audience, setAudience] = useState<AssignmentAudience>('staff');
  const [classes, setClasses] = useState({
    classIds: ['c1'],
    studentsByClass: {},
  });
  const [when, setWhen] = useState(() => ({
    ...defaultWhenValue({
      activity: 'quiz',
      bellAvailable: false,
      manualAvailable: true,
    }),
    mode: 'manual' as const,
  }));
  const [behavior, setBehavior] = useState(() => getQuizAssignPrefill(null));

  return (
    <QuizAssignStepper
      title="Staff PD check-in"
      rosters={SAMPLE_ROSTERS}
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      audience={{ audience, setAudience, canAssignToStaff: true }}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  );
};

const preview = { title: 'Quiz assign to Staff', render: Preview };
export default preview;
