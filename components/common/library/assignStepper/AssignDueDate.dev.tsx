// DEV-only: the Quiz assign stepper with the due date flag's When step, for /assign-stepper-dev?view=AssignDueDate.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster } from '@/types';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import type { AssignmentAudience } from '@/utils/staffAudience';
import { useAssignWhen } from '@/hooks/useLastAssignWhen';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { defaultWhenValue } from './assignWhenValue';

const params = () => new URLSearchParams(window.location.search);

const ROSTERS: ClassRoster[] = ['Period 1 Math 7', 'Period 2 Math 7'].map(
  (name, i) => ({
    id: `r${i + 1}`,
    name,
    driveFileId: null,
    studentCount: 24,
    createdAt: 0,
    students: [],
    bellPeriod: { buildingId: 'b', periodId: String(i + 1) },
  })
);

// Late-day bells so the preview's end of class is still ahead.
const CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: (roster, date) => {
    const at = (h: number, m: number) =>
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        h,
        m
      ).getTime();
    return roster.id === 'r1'
      ? { openAt: at(22, 0), closeAt: at(22, 50) }
      : { openAt: at(22, 55), closeAt: at(23, 45) };
  },
  onTagRoster: () => undefined,
};

const Preview: React.FC = () => {
  const bells = params().get('bells') !== '0';
  const classCount = Number(params().get('classes') ?? '1');
  const [audience, setAudience] = useState<AssignmentAudience>('students');
  const [classes, setClasses] = useState({
    classIds: ROSTERS.slice(0, classCount).map((r) => r.id),
    studentsByClass: {},
  });
  const { when, setWhen } = useAssignWhen(
    'quiz',
    () => {
      const seed = defaultWhenValue({
        activity: 'quiz',
        bellAvailable: bells,
        manualAvailable: true,
      });
      return {
        ...seed,
        mode: params().get('mode') === 'scheduled' ? 'scheduled' : 'manual',
      };
    },
    { manualDue: true }
  );
  const [behavior, setBehavior] = useState(() => getQuizAssignPrefill(null));
  const due = params().get('due');
  const [seeded, setSeeded] = useState(false);
  if (!seeded && due === 'date' && when.availability.manualDue) {
    setSeeded(true);
    setWhen({
      ...when,
      availability: {
        ...when.availability,
        manualDue: {
          kind: 'date',
          day: when.availability.all.closes.day,
          time: '23:59',
        },
      },
    });
  }

  return (
    <QuizAssignStepper
      title="Gr. 7 Circumference (5 questions)"
      rosters={
        bells ? ROSTERS : ROSTERS.map((r) => ({ ...r, bellPeriod: undefined }))
      }
      classes={classes}
      onClassesChange={setClasses}
      when={when}
      onWhenChange={setWhen}
      behavior={behavior}
      onBehaviorChange={setBehavior}
      audience={{ audience, setAudience, canAssignToStaff: false }}
      periodAccess={bells ? CTX : undefined}
      hasManualGrading={false}
      handRaiseMode="teacher-choice"
      submitLabel="Assign"
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  );
};

const preview = { title: 'Quiz assign due date', render: Preview };
export default preview;
