// DEV-only: class presets prefilled as modification groups, and the Student view version menu, for /assign-stepper-dev.
/* eslint-disable react-refresh/only-export-components -- default export is a harness preview record */
import React, { useState } from 'react';
import type { ClassRoster, QuizBehaviorSettings, QuizData } from '@/types';
import { QuizAssignStepper } from '@/components/widgets/QuizWidget/components/QuizAssignStepper';
import { QuizStudentView } from '@/components/quiz/QuizStudentView';
import { toOverrideEditorQuestions } from '@/components/common/library/toOverrideEditorQuestions';
import { getQuizAssignPrefill } from '@/utils/quizBehavior';
import { languageDisplayLabel } from '@/utils/languageDisplayLabel';
import { translateHiddenOptionIdsToText } from '@/utils/quizHiddenOptions';
import {
  versionsFromOverrides,
  type StudentViewVersion,
} from '@/utils/quizStudentViewVersions';
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
    defaultOverridesByStudentId: {
      b: {
        answerChoices: 3,
        timeMultiplier: 1.5,
        readAloud: true,
        language: 'es',
      },
      f: {
        answerChoices: 3,
        timeMultiplier: 1.5,
        readAloud: true,
        language: 'es',
      },
      c: { timeMultiplier: 2, blockCopyPaste: false },
    },
    groups: [
      { id: 'mods', name: 'Modified Assessments', studentIds: ['b', 'c', 'f'] },
    ],
  },
];

const mc = (
  id: string,
  text: string,
  correct: string,
  wrong: string[],
  modifiedText?: string
) => ({
  id,
  type: 'MC' as const,
  text,
  correctAnswer: correct,
  incorrectAnswers: wrong,
  timeLimit: 0,
  ...(modifiedText ? { modifiedText } : {}),
});

const QUIZ: QuizData = {
  id: 'quiz-versions',
  title: 'Vocab Formative Check',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    mc(
      'q1',
      'Which word best describes a character who refuses to change their mind, even when shown clear evidence?',
      'Stubborn',
      ['Generous', 'Curious', 'Timid'],
      'Which word means someone will not change their mind?'
    ),
    mc('q2', 'What is the antonym of "ancient"?', 'Modern', [
      'Old',
      'Historic',
      'Aged',
    ]),
    mc('q3', 'A "benevolent" ruler is…', 'Kind', ['Cruel']),
  ],
};

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
  const [behavior, setBehavior] = useState<QuizBehaviorSettings>(() => {
    const base = getQuizAssignPrefill(null);
    return {
      ...base,
      sessionOptions: { ...base.sessionOptions, timeLimitMinutes: 15 },
    };
  });
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [open, setOpen] = useState<{
    versions: StudentViewVersion[];
    initialVersionId?: string;
  } | null>(null);

  return (
    <>
      <QuizAssignStepper
        title={QUIZ.title}
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
            questions: toOverrideEditorQuestions(QUIZ),
            rubrics: [],
          },
        }}
        hasManualGrading={false}
        handRaiseMode="teacher-choice"
        submitLabel="Assign"
        onClose={() => undefined}
        onSubmit={() =>
          setOpen({
            versions: versionsFromOverrides(
              translateHiddenOptionIdsToText(
                QUIZ.questions,
                targeting.overridesByKey
              ).overridesByKey,
              languageDisplayLabel
            ),
          })
        }
      />
      {open && (
        <QuizStudentView
          quiz={QUIZ}
          behavior={behavior}
          timeLimitOn
          tabAwayTimerOn={false}
          versions={open.versions}
          initialVersionId={open.initialVersionId}
          onExit={() => setOpen(null)}
        />
      )}
    </>
  );
};

const preview = { title: 'Quiz version preview', render: Preview };
export default preview;
