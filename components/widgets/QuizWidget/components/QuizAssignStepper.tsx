// Quiz assign on the accordion stepper (docs/plans/shipped/ASSIGN_STEPPER.md PR 3).
import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassRoster, Plc, QuizBehaviorSettings } from '@/types';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
import type { QuizHandRaiseMode } from '@/utils/quizHandRaise';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignSteps,
  getAssignStepTitle,
  type AssignStepDef,
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
  type ModificationsQuizContext,
} from '@/components/common/library/assignStepper/ModificationsView';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import {
  formatWhenValue,
  whenBackwards,
  type AssignWhenValue,
} from '@/components/common/library/assignStepper/assignWhenValue';
import { useQuizRuleGates } from '@/components/common/library/assignStepper/QuizRuleStepGates';
import { quizRuleStepDefs } from '@/components/common/library/assignStepper/quizRuleStepDefs';
import { SharingStep } from '@/components/common/library/assignStepper/SharingStep';
import { WrittenAnswersStep } from '@/components/common/library/assignStepper/WrittenAnswersStep';
import { formatWrittenAnswersValue } from '@/components/common/library/assignStepper/WrittenAnswersStep.format';
import { Printer } from 'lucide-react';
import { AuthContext } from '@/context/AuthContextValue';
import { clampQuizTimeLimitMinutes } from '@/utils/quizTimeLimit';
import { languageNativeLabel } from '@/utils/languageNativeLabel';
import {
  countUnresolvableStudents,
  modificationRows,
} from '@/components/common/library/assignStepper/ModificationsView.helpers';
import { ModificationGroupsStep } from '@/components/common/library/assignStepper/ModificationGroupsStep';
import {
  formatModificationGroupsValue,
  newModificationGroup,
  overridesFromGroups,
  rowsInClasses,
  type ModificationGroup,
} from '@/components/common/library/assignStepper/modificationGroups';
import { tourTypeAttr } from '@/config/tourAnchors';
import {
  withAudienceSwitch,
  type AssignAudienceState,
} from '@/components/common/library/assignStepper/assignAudience';
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
    /** Any question carries its own time limit, so the time rule applies without a quiz-wide one. */
    hasQuestionTimeLimits?: boolean;
  };
  /** Omit when sharing is fixed (PLC quiz assign, D21): no Sharing step. */
  sharing?: {
    value: SharingStepValue;
    onChange: (next: SharingStepValue) => void;
    plcs: readonly Plc[];
  };
  periodAccess?: AssignPeriodAccessContext;
  /** Students or Staff; omit to leave out the switch (PLC quiz assign). */
  audience?: AssignAudienceState;
  hasManualGrading: boolean;
  handRaiseMode: QuizHandRaiseMode;
  submitLabel: string;
  /** Offer written questions on paper; omit to leave the step out. */
  written?: React.ComponentProps<typeof WrittenAnswersStep>;
  /** Leaves the stepper for the paper print flow; omit when paper sheets are off. */
  onAssignOnPaper?: () => void;
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
  audience,
  hasManualGrading,
  handRaiseMode,
  submitLabel,
  written,
  onAssignOnPaper,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const gates = useQuizRuleGates();
  const [modsOpen, setModsOpen] = useState(false);
  const auth = useContext(AuthContext);
  const groupsOn =
    !!modifications && auth?.canAccessFeature?.('modification-groups') === true;
  const [groups, setGroups] = useState<ModificationGroup[]>(() => [
    newModificationGroup(),
  ]);
  const usable = rosters.filter((r) => !r.loadError);
  const staff = audience?.audience === 'staff';
  const picked = staff
    ? []
    : usable.filter((r) => classes.classIds.includes(r.id));
  const plcs = sharing?.plcs ?? [];
  const inPlc = !!sharing && isSharingStepAvailable(plcs, 'work');
  const ctx = { kind: 'work' as const, inPlc };
  const needsPlc = !!sharing && inPlc && sharingNeedsPlc(sharing.value, plcs);
  // Staff hides the Due row, so a due date can't hold Assign back.
  const backwards = whenBackwards(
    staff
      ? {
          ...when,
          availability: { ...when.availability, manualDue: undefined },
        }
      : when,
    picked,
    periodAccess?.bellWindow
  );

  const groupRows =
    groupsOn && !staff
      ? rowsInClasses(
          modificationRows({
            rosters: usable,
            selectedRosterIds: classes.classIds,
          }),
          classes
        )
      : [];
  const sessionMinutes = gates.timeLimitOn
    ? clampQuizTimeLimitMinutes(behavior.sessionOptions.timeLimitMinutes)
    : null;
  const timeLimitLabel =
    sessionMinutes != null
      ? `${sessionMinutes} min`
      : modifications?.hasQuestionTimeLimits
        ? 'Standard'
        : undefined;
  // Without a time limit the time rule does nothing, so the summary leaves it out; the override stays for when one is set.
  const withTime = (list: ModificationGroup[]) =>
    timeLimitLabel
      ? list
      : list.map((g) => ({ ...g, time: 'standard' as const }));
  const applyGroups = (next: ModificationGroup[]) => {
    setGroups(next);
    if (!modifications) return;
    // Every roster, not just the checked ones, so re-checking a class keeps its students' rules.
    const allRows = modificationRows({ rosters: usable });
    modifications.onTargetingChange({
      ...modifications.targeting,
      overridesByKey: overridesFromGroups(
        next,
        allRows,
        modifications.quizContext.questions
      ),
    });
  };

  const bodies: Record<string, Omit<AssignStepDef, 'id' | 'title'>> = {
    classes: {
      value: formatClassesValue(classes, rosters),
      body: (
        <div className="space-y-3">
          <ClassChecklist
            rosters={rosters}
            value={classes}
            onChange={onClassesChange}
          />
          <StudentPickMenu
            rosters={usable}
            value={classes}
            onChange={onClassesChange}
          />
          {modifications && !groupsOn && picked.length > 0 && (
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
        manualAvailable: true,
        staff,
        t,
      }),
      body: (
        <AssignWhenStep
          value={when}
          onChange={onWhenChange}
          variant="when"
          rosters={picked}
          periodAccess={periodAccess}
          manualAvailable
          staff={staff}
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

  const stepIds = getAssignSteps('quiz', ctx);
  if (groupsOn && modifications && !staff && picked.length > 0) {
    stepIds.splice(stepIds.indexOf('classes') + 1, 0, 'modifications');
    bodies.modifications = {
      value: formatModificationGroupsValue(
        withTime(groups),
        new Set(groupRows.map((row) => row.key)),
        languageNativeLabel
      ),
      body: (
        <ModificationGroupsStep
          groups={groups}
          onChange={applyGroups}
          rows={groupRows}
          unresolvableCount={countUnresolvableStudents({
            rosters: usable,
            selectedRosterIds: classes.classIds,
          })}
          quizContext={modifications.quizContext}
          timeLimitLabel={timeLimitLabel}
          overridesByKey={modifications.targeting.overridesByKey}
        />
      ),
    };
  }
  if (written) {
    stepIds.splice(stepIds.indexOf('when') + 1, 0, 'written');
    bodies.written = {
      value: formatWrittenAnswersValue(written.value, written.count),
      body: <WrittenAnswersStep {...written} />,
    };
  }
  const onPaper = written?.value.where === 'paper';
  const steps: AssignStepDef[] = stepIds.map((id) => {
    const step = ruleSteps.get(id) ?? {
      id,
      title: getAssignStepTitle(id, 'quiz', ctx),
      ...bodies[id],
    };
    return id === 'classes' && audience
      ? withAudienceSwitch(step, audience)
      : step;
  });

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={title}
      steps={steps}
      submitLabel={onPaper ? 'Assign and print' : submitLabel}
      submitIcon={onPaper ? Printer : undefined}
      altAction={
        onAssignOnPaper && !onPaper
          ? {
              label: 'Assign on paper',
              icon: Printer,
              onClick: onAssignOnPaper,
              anchor: tourTypeAttr('quiz-library.assign-paper', 'quiz'),
            }
          : undefined
      }
      onSubmit={onSubmit}
      disabled={needsPlc || backwards}
      disabledReason={
        needsPlc
          ? PICK_A_PLC
          : backwards
            ? t(
                'assignAvailability.closesBeforeOpens',
                'Closes before it opens.'
              )
            : undefined
      }
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
            pageProtectionsAvailable
          />
        ) : undefined
      }
    />
  );
};
