// DEV-only: the Quiz assign stepper with the Modifications step, for /assign-stepper-dev.
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
import {
  DEFAULT_WRITTEN_ANSWERS,
  type WrittenAnswersValue,
} from './WrittenAnswersStep.format';
import type { SharingStepValue } from './SharingStep.format';
import type { Plc } from '@/types';

const PLCS = [{ id: 'plc-a', name: 'English 9 PLC' }] as Plc[];

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
    name: '(S1) Ivers, J ENGLISH I A(2) (18666)',
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
    defaultOverridesByStudentId: { c: { timeMultiplier: 1.5 } },
    groups: [
      { id: 'mods', name: 'Modified Assessments', studentIds: ['b', 'c', 'f'] },
      { id: 'table', name: 'Table 2', studentIds: ['a', 'd'] },
    ],
  },
  {
    id: 'r2',
    name: '(S1) Ivers, J READING FOR HIGH SCHOOL A(1) (18151)',
    driveFileId: null,
    studentCount: 2,
    createdAt: 0,
    students: [person('g', 'Ayaan', 'Hassan'), person('h', 'Kai', 'Johnson')],
  },
];

const mc = (id: string, wrong: number) => ({
  id,
  label: id,
  options: [
    { id: `${id}-correct`, text: 'Right', isCorrect: true },
    ...['A', 'B', 'C'].slice(0, wrong).map((letter, i) => ({
      id: `${id}-incorrect-${i}`,
      text: `Wrong ${letter}`,
      isCorrect: false,
    })),
  ],
});

const Preview: React.FC = () => {
  const [classes, setClasses] = useState({
    classIds: ['r1', 'r2'],
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
  const [behavior, setBehavior] = useState<QuizBehaviorSettings>(() => {
    const base = getQuizAssignPrefill(null);
    return {
      ...base,
      sessionOptions: { ...base.sessionOptions, timeLimitMinutes: 15 },
    };
  });
  const [written, setWritten] = useState<WrittenAnswersValue>(
    DEFAULT_WRITTEN_ANSWERS
  );
  const [sharing, setSharing] = useState<SharingStepValue>({
    plcMode: true,
    plcId: 'plc-a',
  });
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );

  return (
    <>
      <QuizAssignStepper
        title="Vocab Formative Check"
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
            questions: [mc('q1', 3), mc('q2', 3), mc('q3', 1)],
            rubrics: [],
          },
        }}
        written={{ value: written, onChange: setWritten, count: 2 }}
        sharing={{ value: sharing, onChange: setSharing, plcs: PLCS }}
        hasManualGrading={false}
        handRaiseMode="teacher-choice"
        submitLabel="Assign"
        printedVersionsAvailable
        onClose={() => undefined}
        onSubmit={() => undefined}
      />
      <pre
        data-testid="overrides"
        className="fixed bottom-0 left-0 max-h-40 overflow-auto p-2 text-xxs text-white"
      >
        {JSON.stringify(targeting.overridesByKey)}
      </pre>
    </>
  );
};

const preview = { title: 'Quiz assign modifications', render: Preview };
export default preview;
