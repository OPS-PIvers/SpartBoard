// The When body and, for quizzes, the three Quiz rule bodies laid out flat for pages without the stepper shell (D22).
import React from 'react';
import type { ClassRoster, QuizBehaviorSettings } from '@/types';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import { AssignWhenStep } from './AssignWhenStep';
import type { AssignWhenValue } from './assignWhenValue';
import { getAssignStepTitle } from './assignSteps';
import { useQuizRuleGates } from './QuizRuleStepGates';
import { quizRuleStepDefs } from './quizRuleStepDefs';

export interface InlineAssignStepBodiesProps {
  activity: 'quiz' | 'video';
  when: AssignWhenValue;
  onWhenChange: (next: AssignWhenValue) => void;
  /** The classes the assignment goes to. */
  rosters: ClassRoster[];
  /** Quiz only: the rule settings behind Attempts, Integrity and What students see. */
  behavior?: QuizBehaviorSettings;
  onBehaviorChange?: (next: QuizBehaviorSettings) => void;
  disabled?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section aria-label={title} className="space-y-2 py-4 first:pt-0 last:pb-0">
    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
    {children}
  </section>
);

export const InlineAssignStepBodies: React.FC<InlineAssignStepBodiesProps> = ({
  activity,
  when,
  onWhenChange,
  rosters,
  behavior,
  onBehaviorChange,
  disabled = false,
}) => {
  const gates = useQuizRuleGates();
  const handRaiseMode = useQuizHandRaiseMode();
  const ruleSteps =
    activity === 'quiz' && behavior && onBehaviorChange
      ? quizRuleStepDefs({
          value: behavior,
          onChange: onBehaviorChange,
          gates,
          handRaiseMode,
        })
      : [];
  return (
    <fieldset
      disabled={disabled}
      data-testid="inline-assign-step-bodies"
      className="min-w-0 divide-y divide-slate-200"
    >
      <Section title={getAssignStepTitle('when', activity, { kind: 'work' })}>
        <AssignWhenStep
          value={when}
          onChange={onWhenChange}
          variant="when"
          rosters={rosters}
        />
      </Section>
      {ruleSteps.map((step) => (
        <Section key={step.id} title={step.title}>
          {step.body}
        </Section>
      ))}
    </fieldset>
  );
};
