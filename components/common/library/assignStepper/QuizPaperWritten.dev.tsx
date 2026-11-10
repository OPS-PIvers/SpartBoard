// DEV-only: Quiz assign with written answers on paper, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { defaultWhenValue, type AssignWhenValue } from './assignWhenValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';
import type { WrittenAnswersValue } from './WrittenAnswersStep.format';
import type { PaperWrittenBoxRow } from '@/utils/paperWrittenHybrid';

const SAMPLE_WRITTEN: PaperWrittenBoxRow[] = [
  {
    questionId: 'w1',
    label: '3',
    text: 'Explain why the Moon stays in orbit around the Earth.',
    size: 'M',
    style: 'lines',
  },
  {
    questionId: 'w2',
    label: '5',
    text: 'Use the provided resources and write an argumentative essay clearly arguing one side. Use details from the sources to support your argument.',
    size: 'full',
    style: 'lines',
  },
];

const Preview: React.FC = () => {
  const paper = new URLSearchParams(window.location.search).get('where');
  const [classes, setClasses] = useState({
    classIds: ['c1', 'c2'],
    studentsByClass: {},
  });
  const [when, setWhen] = useState<AssignWhenValue>(() =>
    defaultWhenValue({
      activity: 'quiz',
      bellAvailable: false,
      manualAvailable: true,
    })
  );
  const [behavior, setBehavior] = useState(() => getQuizAssignPrefill(null));
  const [written, setWritten] = useState<WrittenAnswersValue>({
    where: paper === 'device' ? 'device' : 'paper',
    spares: 2,
    boxSizes: {},
    boxStyles: {},
  });

  return (
    <QuizAssignStepper
      title="Unit 4: Gravity and Orbits"
      rosters={SAMPLE_ROSTERS}
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      hasManualGrading
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      written={{
        value: written,
        onChange: setWritten,
        count: 2,
        rows: SAMPLE_WRITTEN.map((row) => ({
          ...row,
          size: written.boxSizes[row.questionId] ?? row.size,
          style: written.boxStyles[row.questionId]?.style ?? row.style,
        })),
      }}
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  );
};

const preview = { title: 'Quiz written answers on paper', render: Preview };
export default preview;
