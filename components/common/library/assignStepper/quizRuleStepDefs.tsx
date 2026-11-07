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
  flashcards = false,
}: {
  value: QuizBehaviorSettings;
  onChange: (next: QuizBehaviorSettings) => void;
  gates: QuizRuleGates;
  hasManualGrading?: boolean;
  handRaiseMode?: QuizHandRaiseMode;
  /** Flashcards Check: the same steps without quiz-only rows (see QuizRuleStepProps). */
  flashcards?: boolean;
}): AssignStepDef[] {
  const title = (id: 'attempts' | 'integrity' | 'feedback') =>
    getAssignStepTitle(id, flashcards ? 'flashcards' : 'quiz', {
      kind: 'work',
    });
  const ctx = { ...gates, flashcards };
  return [
    {
      id: 'attempts',
      title: title('attempts'),
      value: formatQuizAttemptsValue(value, ctx),
      body: (
        <QuizAttemptsStep
          value={value}
          onChange={onChange}
          flashcards={flashcards}
        />
      ),
    },
    {
      id: 'integrity',
      title: title('integrity'),
      value: formatQuizIntegrityValue(value, gates),
      body: (
        <QuizIntegrityStep
          value={value}
          onChange={onChange}
          flashcards={flashcards}
        />
      ),
    },
    {
      id: 'feedback',
      title: title('feedback'),
      value: formatQuizFeedbackValue(value, {
        ...ctx,
        scoreOnSubmitOn: gates.scoreOnSubmitOn || flashcards,
        hasManualGrading,
      }),
      body: (
        <QuizFeedbackStep
          value={value}
          onChange={onChange}
          hasManualGrading={hasManualGrading}
          handRaiseMode={handRaiseMode}
          flashcards={flashcards}
        />
      ),
    },
  ];
}
