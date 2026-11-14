// DEV-only: the Quiz assign stepper's class checklist with ?classes=N rosters, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster } from '@/types';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import type { AssignmentAudience } from '@/utils/staffAudience';
import { defaultWhenValue, type AssignWhenValue } from './assignWhenValue';

const NAMES = [
  'Period 1 Math 7',
  'Period 2 Math 7',
  'Period 3 Advanced Math 7 and Pre-Algebra Enrichment (Semester 2)',
  'Period 4 Math 7',
  'Period 5 Math 7',
  'Period 6 Math 7',
  'Period 7 Math 7',
  'WIN Time Intervention',
  'Math Lab',
  'Advisory',
];

const rosterCount = (): number => {
  const n = Number(new URLSearchParams(window.location.search).get('classes'));
  return Number.isInteger(n) && n > 0 ? Math.min(n, NAMES.length) : 9;
};

const makeRosters = (n: number): ClassRoster[] =>
  NAMES.slice(0, n).map((name, i) => ({
    id: `r${i + 1}`,
    name,
    driveFileId: null,
    studentCount: 22 + ((i * 5) % 14),
    createdAt: 0,
    students: [],
  }));

const Preview: React.FC = () => {
  const [rosters] = useState(() => makeRosters(rosterCount()));
  const [audience, setAudience] = useState<AssignmentAudience>('students');
  const [classes, setClasses] = useState({
    classIds: rosters.slice(0, 1).map((r) => r.id),
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
      audience={{ audience, setAudience, canAssignToStaff: true }}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  );
};

const preview = { title: 'Quiz assign class checklist', render: Preview };
export default preview;
