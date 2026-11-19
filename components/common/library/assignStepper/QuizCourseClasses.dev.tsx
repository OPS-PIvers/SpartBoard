// DEV-only: the Quiz assign stepper's Classes step with linked Courses, for /assign-stepper-dev?view=QuizCourseClasses.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster } from '@/types';
import type { Course } from '@/utils/course/contract';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import type { AssignmentAudience } from '@/utils/staffAudience';
import { defaultWhenValue, type AssignWhenValue } from './assignWhenValue';
import { ClassChecklistCoursesContext } from './classChecklistCourses';

const roster = (
  id: string,
  name: string,
  studentCount: number
): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount,
  createdAt: 0,
  students: [],
});

const ROSTERS: ClassRoster[] = [
  roster('r1', 'Sample - Mock Period 1 (TEST)', 24),
  roster('r2', 'Sample - Mock Period 1 (TEST)', 1),
  roster('r3', 'Math 7 Period 2', 27),
  roster('r4', 'Math 7 Period 4', 25),
  roster('r5', 'Math 7 Period 6', 22),
  roster('r6', 'WIN Time Intervention', 9),
];

const course = (id: string, name: string, rosterIds: string[]): Course => ({
  id,
  name,
  teacherName: 'Paul Ivers',
  rosterIds,
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: id,
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
});

const COURSES: Course[] = [
  course('k1', 'Sample Course', ['r1', 'r2']),
  course('k2', 'Math 7', ['r3', 'r4', 'r5']),
];

const param = (k: string) => new URLSearchParams(window.location.search).get(k);

const Preview: React.FC = () => {
  const picked = param('picked');
  const [audience, setAudience] = useState<AssignmentAudience>('students');
  const [classes, setClasses] = useState({
    classIds: picked ? picked.split(',') : [],
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
    <ClassChecklistCoursesContext.Provider value={COURSES}>
      <QuizAssignStepper
        title="Gr. 7 Circumference"
        rosters={ROSTERS}
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
    </ClassChecklistCoursesContext.Provider>
  );
};

const preview = { title: 'Quiz assign with Courses', render: Preview };
export default preview;
