// DEV-only: the Questions rule on a modification group, for /assign-stepper-dev?view=QuizFewerQuestions.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster, QuizBehaviorSettings } from '@/types';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import { defaultWhenValue, type AssignWhenValue } from './assignWhenValue';

const person = (id: string, first: string, last: string) => ({
  id,
  firstName: first,
  lastName: last,
  pin: id,
  classLinkSourcedId: `SID-${id}`,
});

const ROSTERS: ClassRoster[] = [
  {
    id: 'r1',
    name: '(S1) Ivers, J US HISTORY A(3) (18702)',
    driveFileId: null,
    studentCount: 6,
    createdAt: 0,
    students: [
      person('a', 'Hamza', 'Abdi'),
      person('b', 'Margaret', 'Anderson-Whitfield'),
      person('c', 'Linh', 'Bui'),
      person('d', 'Owen', 'Carlson'),
      person('e', 'Sofia', 'Diaz'),
      person('f', 'J', 'Erickson'),
    ],
    groups: [
      { id: 'mods', name: 'Modified Assessments', studentIds: ['b', 'c', 'f'] },
    ],
  },
];

const TOPICS = [
  'What was the main cause of the Missouri Compromise?',
  'Which amendment abolished slavery in the United States?',
  'Who wrote the Emancipation Proclamation?',
  'Explain why the Union blockade mattered to the Southern economy.',
  'Which battle is called the turning point of the Civil War?',
  'Match each leader to the side they led.',
  'Put these events of Reconstruction in order.',
  'What did the Homestead Act give settlers?',
  'Describe one effect of the transcontinental railroad.',
  'The ____ Act moved Native nations west of the Mississippi.',
];
const QUESTIONS = Array.from({ length: 60 }, (_, i) => ({
  id: `q${i + 1}`,
  label: TOPICS[i % TOPICS.length],
}));

const Preview: React.FC = () => {
  const [classes, setClasses] = useState({
    classIds: ['r1'],
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
  const [behavior, setBehavior] = useState<QuizBehaviorSettings>(() =>
    getQuizAssignPrefill(null)
  );
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );

  return (
    <QuizAssignStepper
      title="Unit 4 Test: Civil War and Reconstruction"
      rosters={ROSTERS}
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      modifications={{
        targeting,
        onTargetingChange: setTargeting,
        hasModifiedQuestions: true,
        quizContext: {
          questions: QUESTIONS,
          rubrics: [],
          fewerQuestions: true,
        },
      }}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      printedVersionsAvailable
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  );
};

const preview = {
  title: 'Quiz modifications: fewer questions',
  render: Preview,
};
export default preview;
