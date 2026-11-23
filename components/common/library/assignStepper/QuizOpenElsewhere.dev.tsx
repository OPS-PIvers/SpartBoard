// DEV-only: the Quiz assign dialog when the quiz is already open for Period 3 (?picked=none for nothing picked), for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster } from '@/types';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { defaultWhenValue, type AssignWhenValue } from './assignWhenValue';
import type { OpenAssignmentInput } from '@/utils/openAssignmentClasses';

const NAMES = [
  'Period 1 Math 7',
  'Period 2 Math 7',
  'Period 3 Math 7',
  'Period 4 Math 7',
  'Period 5 Math 7',
  'Period 6 Math 7',
];

const pickedNone = (): boolean =>
  new URLSearchParams(window.location.search).get('picked') === 'none';

const makeRosters = (): ClassRoster[] =>
  NAMES.map((name, i) => ({
    id: `r${i + 1}`,
    name,
    driveFileId: null,
    studentCount: 22 + ((i * 5) % 14),
    createdAt: 0,
    students: [],
  }));

const OPEN: OpenAssignmentInput[] = [
  {
    id: 'a1',
    live: true,
    createdAt: 1,
    rosterIds: ['r3'],
    canAddClasses: true,
  },
];

const Preview: React.FC = () => {
  const [rosters] = useState(makeRosters);
  const [classes, setClasses] = useState({
    classIds: pickedNone() ? [] : ['r4'],
    studentsByClass: {},
  });
  const [when, setWhen] = useState<AssignWhenValue>(() => ({
    ...defaultWhenValue({
      activity: 'quiz',
      bellAvailable: false,
      manualAvailable: true,
    }),
    mode: 'manual',
  }));
  const [behavior, setBehavior] = useState(() => getQuizAssignPrefill(null));

  return (
    <QuizAssignStepper
      title="Gr. 7 Circumference (5 questions)"
      rosters={rosters}
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      openAssignments={OPEN}
      onAddToOpen={() => Promise.resolve()}
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  );
};

const preview = { title: 'Quiz assign already open', render: Preview };
export default preview;
