// Quiz assign on the accordion stepper (docs/plans/shipped/ASSIGN_STEPPER.md PR 3).
import { GoogleDriveService } from '@/utils/googleDriveService';
import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ClassRoster,
  Plc,
  QuizBehaviorSettings,
  StudentOverride,
} from '@/types';
import type { LucideIcon } from 'lucide-react';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
import type { QuizHandRaiseMode } from '@/utils/quizHandRaise';
import type { AssignPeriodAccessContext } from '@/components/common/library/AssignPeriodAccessSection';
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
import { type ModificationsQuizContext } from '@/components/common/library/assignStepper/ModificationsView';
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
import { HandRaiseRow } from '@/components/common/library/assignStepper/QuizFeedbackStep';
import { formatWrittenAnswersValue } from '@/components/common/library/assignStepper/WrittenAnswersStep.format';
import { AlertCircle, Printer } from 'lucide-react';
import { AuthContext } from '@/context/AuthContextValue';
import { clampQuizTimeLimitMinutes } from '@/utils/quizTimeLimit';
import { languageDisplayLabel } from '@/utils/languageDisplayLabel';
import {
  countUnresolvableStudents,
  modificationClassGroups,
  modificationRows,
} from '@/components/common/library/assignStepper/ModificationsView.helpers';
import { ModificationGroupsStep } from '@/components/common/library/assignStepper/ModificationGroupsStep';
import {
  editedOverrides,
  groupRulesOf,
  formatModificationGroupsValue,
  newModificationGroup,
  overridesFromGroups,
  printedGroupPicks,
  rowsInClasses,
  standingDriveFileIds,
  withStandingGroups,
  type ModificationGroup,
  type PrintedGroupPick,
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
    /** Some question has a modified version, so groups can opt into it. */
    hasModifiedQuestions?: boolean;
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
  /** A modification group can print its version. */
  printedVersionsAvailable?: boolean;
  onClose: () => void;
  onSubmit: (extra: {
    printedGroups: PrintedGroupPick[];
    /** What the Modifications step shows, so assign serves exactly that. */
    overridesByKey?: AssignTargetingValue['overridesByKey'];
  }) => void | Promise<void>;
  /** A failed save, shown above the steps while the stepper stays open. */
  error?: string | null;
  /** Quiz settings on a launched assignment: same steps, opened on what was saved. */
  edit?: QuizAssignStepperEdit;
}

export interface QuizAssignStepperEdit {
  /** The assignment's saved per-student overrides; the step opens with them as groups. */
  savedOverrides: Record<string, StudentOverride>;
  /** Classes it went to; their students open on their saved rules, not the class presets. */
  savedClassIds: readonly string[];
  /** Languages the live session serves; any other is flagged, since nothing translates after assign. */
  servedLocales: readonly string[];
  /** Set when it went to picked students: only they can join a group. */
  targetKeys?: ReadonlySet<string>;
  inline?: boolean;
  /** Settings' own When step: a launched assignment edits its window, not how it starts. */
  when: Omit<AssignStepDef, 'id' | 'title'>;
  /** PLC results sharing, which settings starts and stops right away. */
  sharing?: Omit<AssignStepDef, 'id' | 'title'>;
  submitIcon?: LucideIcon;
  disabled?: boolean;
}

const SELECT_A_CLASS_FIRST = 'Select a class first';

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
  printedVersionsAvailable = false,
  onClose,
  onSubmit,
  error,
  edit,
}) => {
  const { t } = useTranslation();
  const gates = useQuizRuleGates();
  const [sharingCount, setSharingCount] = useState(0);
  const auth = useContext(AuthContext);
  const groupsOn = !!modifications;
  const usable = rosters.filter((r) => !r.loadError);
  const staff = audience?.audience === 'staff';
  // Every roster, not just the checked ones, so a student on two rosters carries both presets.
  const allRows = modificationRows({ rosters: usable });
  const presetByKey = new Map(
    allRows.map((row) => [row.key, row.defaultOverride] as const)
  );
  // Editing, a saved class's students open on what was saved; a newly checked class brings its presets.
  const savedClass = new Set(edit?.savedClassIds ?? []);
  const startingRule = (row: { key: string; rosterId: string }) =>
    edit && (row.key in edit.savedOverrides || savedClass.has(row.rosterId))
      ? groupRulesOf(edit.savedOverrides[row.key])
      : presetByKey.get(row.key);
  // Students the step reaches for these classes; their class presets arrive as groups.
  const reachedRows = (next: AssignClassesValue) =>
    groupsOn && !staff
      ? rowsInClasses(
          modificationRows({
            rosters: usable,
            selectedRosterIds: next.classIds,
          }),
          next,
          usable
        )
          .filter((row) => !edit?.targetKeys || edit.targetKeys.has(row.key))
          .map((row) => {
            const { defaultOverride: _own, ...rest } = row;
            const merged = startingRule(row);
            return merged && Object.keys(merged).length > 0
              ? { ...rest, defaultOverride: merged }
              : rest;
          })
      : [];
  const [seeded, setSeeded] = useState<ReadonlySet<string>>(
    () => new Set(reachedRows(classes).map((row) => row.key))
  );
  const [groups, setGroups] = useState<ModificationGroup[]>(() =>
    withStandingGroups(
      [newModificationGroup()],
      reachedRows(classes),
      new Set()
    )
  );
  // What the step opened with, so Save rewrites only the students whose rules changed.
  const [openedWith] = useState(() => ({ groups, seeded }));
  const picked = staff
    ? []
    : usable.filter((r) => classes.classIds.includes(r.id));
  const plcs = sharing?.plcs ?? [];
  const inPlc = !!sharing && isSharingStepAvailable(plcs, 'work');
  const ctx = { kind: 'work' as const, inPlc };
  const needsPlc = !!sharing && inPlc && sharingNeedsPlc(sharing.value, plcs);
  // Staff hides the Due row, so a due date can't hold Assign back.
  // Editing, settings checks its own window through `edit.disabled`.
  const backwards =
    !edit &&
    whenBackwards(
      staff
        ? {
            ...when,
            availability: { ...when.availability, manualDue: undefined },
          }
        : when,
      picked,
      periodAccess?.bellWindow
    );

  const groupRows = reachedRows(classes);
  // Supports already in use, by a class preset or the saved assignment, are never deleted here.
  const keepFileIds = new Set([
    ...standingDriveFileIds(allRows),
    ...Object.values(edit?.savedOverrides ?? {}).flatMap((o) =>
      (o.supports ?? []).flatMap((s) => (s.kind === 'drive' ? [s.fileId] : []))
    ),
  ]);
  const sessionMinutes = gates.timeLimitOn
    ? clampQuizTimeLimitMinutes(behavior.sessionOptions.timeLimitMinutes)
    : null;
  const timeLimitLabel =
    sessionMinutes != null || modifications?.hasQuestionTimeLimits
      ? 'Same as class'
      : undefined;
  // Without a time limit the time rule does nothing, so the summary leaves it out; the override stays for when one is set.
  const withTime = (list: ModificationGroup[]) =>
    timeLimitLabel
      ? list
      : list.map((g) => ({ ...g, time: 'standard' as const }));
  // Every roster, not just the checked ones, so re-checking a class keeps its students' rules.
  const groupOverrides = (
    list: ModificationGroup[],
    shown: ReadonlySet<string>
  ) =>
    overridesFromGroups(
      printedVersionsAvailable
        ? list
        : list.map((g) => ({ ...g, printed: false })),
      allRows,
      shown
    );
  const applyGroups = (
    next: ModificationGroup[],
    shown: ReadonlySet<string> = seeded
  ) => {
    setGroups(next);
    if (!modifications) return;
    modifications.onTargetingChange({
      ...modifications.targeting,
      overridesByKey: groupOverrides(next, shown),
    });
  };

  // A newly reached student brings their class presets in as a group, once.
  const changeClasses = (next: AssignClassesValue) => {
    onClassesChange(next);
    const rows = reachedRows(next);
    if (rows.every((row) => seeded.has(row.key))) return;
    const shown = new Set([...seeded, ...rows.map((row) => row.key)]);
    applyGroups(withStandingGroups(groups, rows, seeded), shown);
    setSeeded(shown);
  };

  const bodies: Record<string, Omit<AssignStepDef, 'id' | 'title'>> = {
    classes: {
      value: formatClassesValue(classes, rosters),
      body: (
        <div className="space-y-3">
          <ClassChecklist
            rosters={rosters}
            value={classes}
            onChange={changeClasses}
          />
          {/* An assignment sent to students with no class has no class to narrow. */}
          {!edit?.targetKeys && (
            <StudentPickMenu
              rosters={usable}
              value={classes}
              onChange={changeClasses}
            />
          )}
        </div>
      ),
    },
    when: edit?.when ?? {
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
  const ruleSteps = new Map(
    quizRuleStepDefs({
      value: behavior,
      onChange: onBehaviorChange,
      gates,
      hasManualGrading,
      handRaiseMode,
      hideHandRaise: true,
    }).map((step) => [step.id, step])
  );

  // The last step holds written answers, raise a hand and PLC sharing.
  const handRaiseShown = handRaiseMode === 'teacher-choice';
  const extrasShown = !!written || handRaiseShown;
  const lastTitle =
    extrasShown && inPlc
      ? 'Additional settings and sharing'
      : extrasShown
        ? 'Additional settings'
        : getAssignStepTitle('sharing', 'quiz', ctx);
  const sharingTitle = edit
    ? getAssignStepTitle('sharing', 'quiz', ctx)
    : lastTitle;
  const handRaiseOn = behavior.sessionOptions.handRaiseEnabled === true;
  const onPaperWritten = written?.value.where === 'paper';
  const lastParts = [
    onPaperWritten
      ? formatWrittenAnswersValue(written.value, written.count)
      : null,
    handRaiseShown && handRaiseOn ? 'Raise hand on' : null,
    sharing && inPlc
      ? needsPlc
        ? PICK_A_PLC
        : formatSharingValue(sharing.value, { plcs })
      : null,
  ].filter((part): part is string => !!part);
  // Only what differs from the defaults is named, so the summary stays short.
  const lastValue =
    lastParts.join(', ') ||
    (written ? 'Written answers on the device' : 'Raise hand off');
  if (edit) {
    if (edit.sharing) bodies.sharing = edit.sharing;
  } else if (extrasShown || inPlc) {
    bodies.sharing = {
      value: lastValue,
      body: (
        <div className="space-y-1.5">
          {written && <WrittenAnswersStep {...written} />}
          {handRaiseShown && (
            <HandRaiseRow value={behavior} onChange={onBehaviorChange} />
          )}
          {sharing && inPlc && (
            <SharingStep
              value={sharing.value}
              onChange={sharing.onChange}
              plcs={plcs}
            />
          )}
        </div>
      ),
    };
  }

  const stepIds: AssignStepId[] = getAssignSteps('quiz', ctx).filter(
    (id) => id !== 'sharing'
  );
  if (bodies.sharing) stepIds.push('sharing');
  // The step stays listed before a class is picked so later steps keep their numbers.
  const modsListed = groupsOn && !!modifications && !staff;
  const modsShown = modsListed && picked.length > 0;
  if (modsListed) {
    stepIds.splice(stepIds.indexOf('feedback'), 0, 'modifications');
  }
  if (modsListed && !modsShown) {
    bodies.modifications = {
      value: SELECT_A_CLASS_FIRST,
      body: null,
      disabled: true,
    };
  }
  if (modsShown && modifications) {
    bodies.modifications = {
      value: formatModificationGroupsValue(
        withTime(groups),
        new Set(groupRows.map((row) => row.key)),
        languageDisplayLabel
      ),
      body: (
        <ModificationGroupsStep
          groups={groups}
          onChange={applyGroups}
          rows={groupRows}
          classGroups={modificationClassGroups(
            usable,
            classes.classIds,
            groupRows
          )}
          unresolvableCount={countUnresolvableStudents({
            rosters: usable,
            selectedRosterIds: classes.classIds,
          })}
          quizContext={modifications.quizContext}
          timeLimitLabel={timeLimitLabel}
          hasModifiedQuestions={modifications.hasModifiedQuestions === true}
          overridesByKey={modifications.targeting.overridesByKey}
          onSharingChange={(sharing) =>
            setSharingCount((n) => Math.max(0, n + (sharing ? 1 : -1)))
          }
          printedAvailable={printedVersionsAvailable}
          keepFileIds={keepFileIds}
          servedLocales={edit?.servedLocales}
        />
      ),
    };
  }
  const printedGroups =
    printedVersionsAvailable && modsShown
      ? printedGroupPicks(groups, groupRows)
      : [];
  const onPaper = written?.value.where === 'paper' || printedGroups.length > 0;
  const steps: AssignStepDef[] = stepIds.map((id) => {
    const step = ruleSteps.get(id) ?? {
      id,
      title:
        id === 'sharing' ? sharingTitle : getAssignStepTitle(id, 'quiz', ctx),
      ...bodies[id],
    };
    return id === 'classes' && audience
      ? withAudienceSwitch(step, audience)
      : step;
  });

  return (
    <AssignStepper
      isOpen
      onClose={() => {
        // Closing without assigning leaves the shared support copies unused.
        const token = auth?.googleAccessToken;
        const drive = token
          ? new GoogleDriveService(token, auth.refreshGoogleToken)
          : null;
        for (const g of groups)
          for (const sup of g.supports ?? [])
            if (sup.kind === 'drive' && !keepFileIds.has(sup.fileId))
              void drive?.deleteFile(sup.fileId).catch(() => undefined);
        onClose();
      }}
      title={title}
      topSwitch={
        error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-brand-red-primary/30 bg-brand-red-lighter/40 px-3 py-2 text-sm font-medium text-brand-red-dark"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : undefined
      }
      steps={steps}
      submitLabel={onPaper ? 'Assign and print' : submitLabel}
      submitIcon={onPaper ? Printer : edit?.submitIcon}
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
      onSubmit={() =>
        onSubmit({
          printedGroups,
          ...(groupsOn && !staff
            ? {
                overridesByKey: edit
                  ? editedOverrides(
                      edit.savedOverrides,
                      groupOverrides(openedWith.groups, openedWith.seeded),
                      groupOverrides(groups, seeded)
                    )
                  : groupOverrides(groups, seeded),
              }
            : {}),
        })
      }
      inline={edit?.inline}
      disabled={
        needsPlc || backwards || sharingCount > 0 || edit?.disabled === true
      }
      disabledReason={
        needsPlc
          ? PICK_A_PLC
          : sharingCount > 0
            ? 'Still sharing a Drive file.'
            : backwards
              ? t(
                  'assignAvailability.closesBeforeOpens',
                  'Closes before it opens.'
                )
              : undefined
      }
    />
  );
};
