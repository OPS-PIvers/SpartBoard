// The When body and, for quizzes, the three Quiz rule bodies laid out flat for pages without the stepper shell (D22).
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassRoster, QuizBehaviorSettings } from '@/types';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import { Toggle } from '@/components/common/Toggle';
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
  /** With onWindowOnChange, the When body shows only while the Schedule switch is on. */
  windowOn?: boolean;
  onWindowOnChange?: (on: boolean) => void;
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
  windowOn = true,
  onWindowOnChange,
}) => {
  const { t } = useTranslation();
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
  const scheduleLabel = t('assignTargeting.scheduleLabel', 'Schedule');
  return (
    <fieldset
      disabled={disabled}
      data-testid="inline-assign-step-bodies"
      className="min-w-0 divide-y divide-slate-200"
    >
      <Section title={getAssignStepTitle('when', activity, { kind: 'work' })}>
        {onWindowOnChange && (
          <div className="flex min-h-[2rem] items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">
              {scheduleLabel}
            </span>
            <Toggle
              size="sm"
              checked={windowOn}
              onChange={onWindowOnChange}
              label={scheduleLabel}
            />
          </div>
        )}
        {windowOn && (
          <AssignWhenStep
            value={when}
            onChange={onWhenChange}
            variant="when"
            rosters={rosters}
          />
        )}
      </Section>
      {ruleSteps.map((step) => (
        <Section key={step.id} title={step.title}>
          {step.body}
        </Section>
      ))}
    </fieldset>
  );
};
