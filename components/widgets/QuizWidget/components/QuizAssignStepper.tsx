// Quiz assign on the accordion stepper (docs/plans/ASSIGN_STEPPER.md PR 3), behind `assign-stepper`.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassRoster, Plc, QuizBehaviorSettings } from '@/types';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
import { manualStartAvailable } from '@/utils/assignAvailability';
import type { QuizHandRaiseMode } from '@/utils/quizHandRaise';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignSteps,
  getAssignStepTitle,
  type AssignStepDef,
} from '@/components/common/library/assignStepper/assignSteps';
import { ClassPickerMenu } from '@/components/common/library/assignStepper/ClassPickerMenu';
import { StudentPickMenu } from '@/components/common/library/assignStepper/StudentPickMenu';
import {
  formatClassesValue,
  type AssignClassesValue,
} from '@/components/common/library/assignStepper/assignClassesValue';
import {
  ModificationsLink,
  ModificationsView,
  type ModificationsQuizContext,
} from '@/components/common/library/assignStepper/ModificationsView';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  formatWhenValue,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import { useQuizRuleGates } from '@/components/common/library/assignStepper/QuizRuleStepGates';
import { quizRuleStepDefs } from '@/components/common/library/assignStepper/quizRuleStepDefs';
import { SharingStep } from '@/components/common/library/assignStepper/SharingStep';
import {
  formatSharingValue,
  isSharingStepAvailable,
  PICK_A_PLC,
  sharingNeedsPlc,
  type SharingStepValue,
} from '@/components/common/library/assignStepper/SharingStep.format';

export interface QuizAssignStepperProps {
  title: string;
  /** Every roster; ones that failed to load are not offered. */
  rosters: ClassRoster[];
  classes: AssignClassesValue;
  onClassesChange: (next: AssignClassesValue) => void;
  when: AssignWhenValue;
  onWhenChange: (next: AssignWhenValue) => void;
  behavior: QuizBehaviorSettings;
  onBehaviorChange: (next: QuizBehaviorSettings) => void;
  /** Omit to leave out per-student modifications (PLC quiz assign). */
  modifications?: {
    targeting: AssignTargetingValue;
    onTargetingChange: (next: AssignTargetingValue) => void;
    quizContext: ModificationsQuizContext;
  };
  /** Omit when sharing is fixed (PLC quiz assign, D21): no Sharing step. */
  sharing?: {
    value: SharingStepValue;
    onChange: (next: SharingStepValue) => void;
    plcs: readonly Plc[];
  };
  periodAccess?: AssignPeriodAccessContext;
  hasManualGrading: boolean;
  handRaiseMode: QuizHandRaiseMode;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}

export const QuizAssignStepper: React.FC<QuizAssignStepperProps> = ({
  title,
  rosters,
  classes,
  onClassesChange,
  when,
  onWhenChange,
  behavior,
  onBehaviorChange,
  modifications,
  sharing,
  periodAccess,
  hasManualGrading,
  handRaiseMode,
  submitLabel,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const gates = useQuizRuleGates();
  const [modsOpen, setModsOpen] = useState(false);
  const usable = rosters.filter((r) => !r.loadError);
  const picked = usable.filter((r) => classes.classIds.includes(r.id));
  const plcs = sharing?.plcs ?? [];
  const inPlc = !!sharing && isSharingStepAvailable(plcs, 'work');
  const ctx = { kind: 'work' as const, inPlc };
  const needsPlc = !!sharing && inPlc && sharingNeedsPlc(sharing.value, plcs);

  const bodies: Record<string, Omit<AssignStepDef, 'id' | 'title'>> = {
    classes: {
      value: formatClassesValue(classes, rosters),
      body: (
        <div className="space-y-3">
          <ClassPickerMenu
            rosters={rosters}
            value={classes}
            onChange={onClassesChange}
          />
          <StudentPickMenu
            rosters={usable}
            value={classes}
            onChange={onClassesChange}
          />
          {modifications && picked.length > 0 && (
            <ModificationsLink
              rosters={usable}
              selectedRosterIds={classes.classIds}
              value={modifications.targeting}
              onOpen={() => setModsOpen(true)}
            />
          )}
        </div>
      ),
    },
    when: {
      value: formatWhenValue(when, {
        variant: 'when',
        rosterCount: picked.length,
        manualAvailable: manualStartAvailable(periodAccess?.bellWindow),
        t,
      }),
      body: (
        <AssignWhenStep
          value={when}
          onChange={onWhenChange}
          variant="when"
          rosters={picked}
          periodAccess={periodAccess}
          // Per-class due dates save without bells; only a period gate saves per-class opens.
          perClass
          sharedOpens={!periodAccess}
        />
      ),
    },
  };
  if (sharing) {
    bodies.sharing = {
      value: needsPlc
        ? PICK_A_PLC
        : formatSharingValue(sharing.value, { plcs }),
      body: (
        <SharingStep
          value={sharing.value}
          onChange={sharing.onChange}
          plcs={plcs}
        />
      ),
    };
  }
  const ruleSteps = new Map(
    quizRuleStepDefs({
      value: behavior,
      onChange: onBehaviorChange,
      gates,
      hasManualGrading,
      handRaiseMode,
    }).map((step) => [step.id, step])
  );

  const steps: AssignStepDef[] = getAssignSteps('quiz', ctx).map(
    (id) =>
      ruleSteps.get(id) ?? {
        id,
        title: getAssignStepTitle(id, 'quiz', ctx),
        ...bodies[id],
      }
  );

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={title}
      steps={steps}
      submitLabel={submitLabel}
      onSubmit={onSubmit}
      disabled={needsPlc}
      disabledReason={needsPlc ? PICK_A_PLC : undefined}
      overlayView={
        modifications && modsOpen ? (
          <ModificationsView
            activityTitle={title}
            rosters={usable}
            selectedRosterIds={classes.classIds}
            value={modifications.targeting}
            onChange={modifications.onTargetingChange}
            onBack={() => setModsOpen(false)}
            quizMode
            quizContext={modifications.quizContext}
          />
        ) : undefined
      }
    />
  );
};
