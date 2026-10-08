// The three Quiz rule steps as stepper defs, shared by every Quiz assign surface (D8).
import React from 'react';
import type { QuizBehaviorSettings } from '@/types';
import type { QuizHandRaiseMode } from '@/utils/quizHandRaise';
import type { AssignStepDef } from './assignSteps';
import { getAssignStepTitle } from './assignSteps';
import { QuizAttemptsStep } from './QuizAttemptsStep';
import { QuizIntegrityStep } from './QuizIntegrityStep';
import { QuizFeedbackStep } from './QuizFeedbackStep';
import type { QuizRuleGates } from './QuizRuleStepValues';
import {
  formatQuizAttemptsValue,
  formatQuizFeedbackValue,
  formatQuizIntegrityValue,
} from './QuizRuleStepValues';

export function quizRuleStepDefs({
  value,
  onChange,
  gates,
  hasManualGrading = false,
  handRaiseMode,
}: {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
  gates: QuizRuleGates;
  hasManualGrading?: boolean;
  handRaiseMode?: QuizHandRaiseMode;
}): AssignStepDef[] {
  const title = (id: 'attempts' | 'integrity' | 'feedback') =>
    getAssignStepTitle(id, 'quiz', { kind: 'work' });
  return [
    {
      id: 'attempts',
      title: title('attempts'),
      value: formatQuizAttemptsValue(value, gates),
      body: <QuizAttemptsStep value={value} onChange={onChange} />,
    },
    {
      id: 'integrity',
      title: title('integrity'),
      value: formatQuizIntegrityValue(value),
      body: <QuizIntegrityStep value={value} onChange={onChange} />,
    },
    {
      id: 'feedback',
      title: title('feedback'),
      value: formatQuizFeedbackValue(value, { ...gates, hasManualGrading }),
      body: (
        <QuizFeedbackStep
          value={value}
          onChange={onChange}
          hasManualGrading={hasManualGrading}
          handRaiseMode={handRaiseMode}
        />
      ),
    },
  ];
}
