// Writing assign on the shared accordion stepper: Classes, When, Writing rules, Integrity (WRITING_ASSIGNMENT.md §4.3).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssignWhen } from '@/hooks/useLastAssignWhen';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignSteps,
  getAssignStepTitle,
  type AssignStepDef,
  type AssignStepId,
} from '@/components/common/library/assignStepper/assignSteps';
import { ClassChecklist } from '@/components/common/library/assignStepper/ClassChecklist';
import { StudentPickMenu } from '@/components/common/library/assignStepper/StudentPickMenu';
import {
  formatClassesValue,
  type AssignClassesValue,
} from '@/components/common/library/assignStepper/assignClassesValue';
import {
  ModificationsLink,
  ModificationsView,
} from '@/components/common/library/assignStepper/ModificationsView';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  whenBackwards,
} from '@/components/common/library/assignStepper/assignWhenValue';
import {
  WritingIntegrityStep,
  WritingRulesStep,
} from '@/components/common/library/assignStepper/WritingAssignSteps';
import {
  DEFAULT_WRITING_INTEGRITY,
  DEFAULT_WRITING_RULES,
  formatWritingIntegrityValue,
  formatWritingRulesValue,
  type WritingIntegrityValue,
  type WritingRulesValue,
} from '@/components/common/library/assignStepper/writingAssignValues';
import { useQuizRuleGates } from '@/components/common/library/assignStepper/QuizRuleStepGates';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { applyWhen } from '@/utils/assignAvailability';
import { buildPeriodGate } from '@/utils/periodPlan';
import {
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import { rosterHasSsoClass } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import {
  buildWritingAssignSubmission,
  type WritingAssignSubmission,
} from '@/utils/writingAssign';
import type { ClassRoster, WritingAssignmentDefinition } from '@/types';

export interface WritingAssignStepperProps {
  isOpen: boolean;
  item: WritingAssignmentDefinition;
  rosters: ClassRoster[];
  onClose: () => void;
  /** Resolves false when the assign failed. */
  onAssign: (submission: WritingAssignSubmission) => Promise<boolean | void>;
}

const CTX = { kind: 'work' as const };

export const WritingAssignStepper: React.FC<WritingAssignStepperProps> = ({
  isOpen,
  item,
  rosters,
  onClose,
  onAssign,
}) => {
  const { t } = useTranslation();
  const gates = useQuizRuleGates();
  const [classes, setClasses] = useState<AssignClassesValue>({
    classIds: [],
    studentsByClass: {},
  });
  const { when, setWhen } = useAssignWhen(
    'writing',
    () =>
      defaultWhenValue({
        activity: 'writing',
        bellAvailable: false,
        manualAvailable: true,
      }),
    { manualDue: true }
  );
  const [targeting, setTargeting] = useState<AssignTargetingValue>(
    EMPTY_ASSIGN_TARGETING_VALUE
  );
  const [showMods, setShowMods] = useState(false);
  const [rules, setRules] = useState<WritingRulesValue>(DEFAULT_WRITING_RULES);
  const [integrity, setIntegrity] = useState<WritingIntegrityValue>(
    DEFAULT_WRITING_INTEGRITY
  );

  const picked = useMemo(
    () =>
      rosters.filter((r) => !r.loadError && classes.classIds.includes(r.id)),
    [rosters, classes.classIds]
  );
  const disabledReason = !picked.some(rosterHasSsoClass)
    ? 'Select at least one ClassLink class.'
    : whenBackwards(when, picked, undefined, 'work')
      ? t('assignAvailability.closesBeforeOpens', 'Closes before it opens.')
      : undefined;

  const bodies: Partial<
    Record<AssignStepId, { value: string; body: React.ReactNode }>
  > = {
    classes: {
      value: formatClassesValue(classes, rosters),
      body: (
        <div className="space-y-3">
          <ClassChecklist
            rosters={rosters}
            value={classes}
            onChange={setClasses}
            anchor={tourTypeAttr('writing.stepper-class-picker', 'writing')}
            rowAnchor={(_classId, rowIndex) =>
              tourFieldAttr(
                'writing.stepper-class-row',
                'writing',
                `row-${rowIndex + 1}`
              )
            }
          />
          <StudentPickMenu
            rosters={rosters}
            value={classes}
            onChange={setClasses}
            rowAnchor={(_classId, rowIndex) =>
              tourFieldAttr(
                'writing.stepper-student-menu',
                'writing',
                `row-${rowIndex + 1}`
              )
            }
          />
          <ModificationsLink
            rosters={rosters}
            selectedRosterIds={classes.classIds}
            value={targeting}
            onOpen={() => setShowMods(true)}
          />
        </div>
      ),
    },
    when: {
      value: formatWhenValue(when, {
        variant: 'when',
        rosterCount: picked.length,
        manualAvailable: true,
        t,
      }),
      body: (
        <AssignWhenStep
          value={when}
          onChange={setWhen}
          variant="when"
          rosters={picked}
          manualAvailable
          perClass
          sharedOpens
        />
      ),
    },
    writing: {
      value: formatWritingRulesValue(rules),
      body: <WritingRulesStep value={rules} onChange={setRules} />,
    },
    integrity: {
      value: formatWritingIntegrityValue(integrity),
      body: <WritingIntegrityStep value={integrity} onChange={setIntegrity} />,
    },
  };

  const steps: AssignStepDef[] = getAssignSteps('writing', CTX).flatMap(
    (id) => {
      const step = bodies[id];
      return step
        ? [{ id, title: getAssignStepTitle(id, 'writing', CTX), ...step }]
        : [];
    }
  );

  const handleSubmit = async () => {
    const resolved = applyWhen(
      { ...targeting, availability: when.availability },
      {
        mode: when.mode,
        manualAvailable: true,
        rosters: picked,
        bellWindow: undefined,
        workKind: { default: 'work', locked: true },
      }
    );
    const periodGate = buildPeriodGate({
      plan: resolved.targeting.periodPlan,
      rosters: picked,
      sharedWindow: resolved.targeting,
      bellWindow: undefined,
      manualStart: when.mode === 'manual',
    });
    await onAssign(
      buildWritingAssignSubmission({
        itemId: item.id,
        rosters,
        classes,
        targeting: resolved.targeting,
        dueAtByRosterId: resolved.dueAtByRosterId,
        periodGate,
        settings: {
          ...rules,
          timeLimitMinutes: gates.timeLimitOn ? rules.timeLimitMinutes : null,
          ...integrity,
          ...(gates.pageProtectionsOn
            ? {}
            : { focusLevel: undefined, blockPrint: false }),
        },
      })
    );
  };

  const title = item.title || 'Untitled writing assignment';
  return (
    <AssignStepper
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      steps={steps}
      submitLabel="Assign"
      onSubmit={handleSubmit}
      disabled={disabledReason !== undefined}
      disabledReason={disabledReason}
      zIndex="z-dialog"
      overlayView={
        showMods ? (
          <ModificationsView
            activityTitle={title}
            rosters={rosters}
            selectedRosterIds={classes.classIds}
            value={targeting}
            onChange={setTargeting}
            onBack={() => setShowMods(false)}
            quizMode={false}
            writingMode
          />
        ) : undefined
      }
    />
  );
};
