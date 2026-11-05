// Settings after assigning: Quiz's assignment Settings stepper, with the Flashcards Check rules.
import React, { useState } from 'react';
import { Pause, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  ClassRoster,
  FlashcardAssignment,
  FlashcardCheckRules,
  Plc,
} from '@/types';
import type { FlashcardAssignmentSettingsPatch } from '@/hooks/useFlashcardAssignments';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignStepTitle,
  type AssignStepDef,
} from '@/components/common/library/assignStepper/assignSteps';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import { formatWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { ClassPickerMenu } from '@/components/common/library/assignStepper/ClassPickerMenu';
import {
  formatClassesValue,
  type AssignClassesValue,
} from '@/components/common/library/assignStepper/assignClassesValue';
import { useQuizRuleGates } from '@/components/common/library/assignStepper/QuizRuleStepGates';
import { quizRuleStepDefs } from '@/components/common/library/assignStepper/quizRuleStepDefs';
import {
  behaviorToFlashcardRules,
  flashcardRulesToBehavior,
  rulesFromScoreVisibility,
  scoreVisibilityFromRules,
} from '@/components/common/library/assignStepper/flashcardsRuleValues';
import {
  resolveAvailability,
  type AssignAvailability,
} from '@/utils/assignAvailability';
import { periodAccessClassEdits } from '@/utils/periodPlan';
import {
  assignmentWindowEdit,
  windowBackwards,
  windowBaselineFor,
} from '@/utils/assignmentWindowEdit';
import {
  canEditAssignmentClasses,
  planAssignmentClassEdit,
} from '@/utils/assignmentClassEdit';
import { hasPeriodAccess } from '@/utils/periodAccess';
import { tourTypeAttr } from '@/config/tourAnchors';

interface FlashcardAssignmentSettingsModalProps {
  assignment: FlashcardAssignment;
  rosters: ClassRoster[];
  /** PLCs the teacher can share with, to name the one the results go to. */
  plcs?: readonly Plc[];
  onClose: () => void;
  /** A rejection keeps the dialog open (the caller toasts). */
  onSave: (patch: FlashcardAssignmentSettingsPatch) => Promise<void>;
  /** Opens the "Share results with PLC…" picker; absent outside a PLC. */
  onShareResults?: () => void;
  onStopSharing?: () => void | Promise<void>;
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

export const FlashcardAssignmentSettingsModal: React.FC<
  FlashcardAssignmentSettingsModalProps
> = ({
  assignment,
  rosters,
  plcs = [],
  onClose,
  onSave,
  onShareResults,
  onStopSharing,
}) => {
  const { t } = useTranslation();
  const gates = useQuizRuleGates();
  const isCheck = assignment.kind === 'check';
  const staff = assignment.audience === 'staff';
  // No rosters yet means none could show as checked, and a save would drop the rest.
  const classesEditable =
    !staff && rosters.length > 0 && canEditAssignmentClasses(assignment);
  const [initialClassIds] = useState(() =>
    (assignment.rosterIds ?? []).filter((id) =>
      rosters.some((r) => r.id === id)
    )
  );
  const [classes, setClasses] = useState<AssignClassesValue>({
    classIds: initialClassIds,
    studentsByClass: {},
  });
  const selectedRosters = rosters.filter((r) =>
    classes.classIds.includes(r.id)
  );
  const perPeriod = hasPeriodAccess(assignment);

  const [baseline] = useState(() =>
    windowBaselineFor(assignment, selectedRosters)
  );
  const [availability, setAvailability] = useState<AssignAvailability>(
    baseline.value
  );

  const [initialRules] = useState<FlashcardCheckRules>(
    () =>
      assignment.rules ??
      rulesFromScoreVisibility(assignment.scoreVisibility ?? 'score')
  );
  const [rules, setRules] = useState<FlashcardCheckRules>(initialRules);

  const plcName = assignment.plcShare
    ? plcs.find((p) => p.id === assignment.plcShare?.plcId)?.name
    : undefined;
  const classesChanged = !sameIds(classes.classIds, initialClassIds);

  // A class added to a per-period session opens on the edited window, as in Quiz.
  const classEditFor = () => {
    const edit = planAssignmentClassEdit({
      rosters,
      rosterIds: classes.classIds,
      previousRosterIds: assignment.rosterIds,
    });
    if (!perPeriod || !assignment.accessMode) return edit;
    return {
      ...edit,
      periodAccessRows: periodAccessClassEdits({
        periodAccess: assignment.periodAccess ?? {},
        accessMode: assignment.accessMode,
        rosters: selectedRosters,
        window: resolveAvailability(availability, selectedRosters, undefined),
      }),
    };
  };

  const handleSave = async () => {
    const w = assignmentWindowEdit({
      periodAccess: assignment.periodAccess,
      perPeriod,
      baseline,
      availability,
      rosters: selectedRosters,
    });
    const rulesChanged = JSON.stringify(rules) !== JSON.stringify(initialRules);
    const visibility = scoreVisibilityFromRules(rules);
    const patch: FlashcardAssignmentSettingsPatch = {
      ...(classesChanged && classesEditable
        ? { classEdit: classEditFor() }
        : {}),
      ...('openAt' in w ? { openAt: w.openAt } : {}),
      ...('closeAt' in w ? { closeAt: w.closeAt } : {}),
      ...(w.periodAccessEdits
        ? { periodAccessEdits: w.periodAccessEdits }
        : {}),
      ...(w.due ? { dueAt: w.due.dueAt } : {}),
      ...(isCheck && rulesChanged ? { rules } : {}),
      // What students see maps to the legacy score visibility, unless Publish or Unpublish changed it since.
      ...(isCheck &&
      rulesChanged &&
      visibility !== scoreVisibilityFromRules(initialRules) &&
      (assignment.scoreVisibility ?? 'none') ===
        scoreVisibilityFromRules(initialRules)
        ? { scoreVisibility: visibility }
        : {}),
    };
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[FlashcardAssignmentSettingsModal] save failed:', err);
    }
  };

  // A Manual start has no dates to edit: the teacher starts and pauses each class.
  const manualStart =
    assignment.accessMode === 'assessment' &&
    perPeriod &&
    assignment.openAt == null &&
    assignment.closeAt == null &&
    assignment.dueAt == null;
  const kindCtx = { kind: isCheck ? 'work' : 'resource' } as const;
  const whenVariant = isCheck ? 'when' : 'available';

  const classesStep: AssignStepDef[] = classesEditable
    ? [
        {
          id: 'classes',
          title: getAssignStepTitle('classes', 'flashcards', kindCtx),
          value: formatClassesValue(classes, rosters),
          body: (
            <ClassPickerMenu
              rosters={rosters}
              value={classes}
              onChange={(next) =>
                setClasses({ classIds: next.classIds, studentsByClass: {} })
              }
            />
          ),
        },
      ]
    : [];
  const whenStep: AssignStepDef = {
    id: 'when',
    title: getAssignStepTitle('when', 'flashcards', kindCtx),
    value: formatWhenValue(
      { mode: manualStart ? 'manual' : 'scheduled', availability },
      {
        variant: whenVariant,
        rosterCount: selectedRosters.length,
        manualAvailable: manualStart,
        t,
      }
    ),
    body: manualStart ? (
      <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Pause className="h-4 w-4 shrink-0 text-brand-blue-primary" />
        {t('assignWhen.manualState', {
          defaultValue: 'Starts paused. You start and pause each class.',
        })}
      </p>
    ) : (
      <AssignWhenStep
        value={{ mode: 'scheduled', availability }}
        onChange={(next) => setAvailability(next.availability)}
        variant={whenVariant}
        rosters={selectedRosters}
        sharedOpens={!perPeriod}
        perClass={perPeriod}
      />
    ),
  };
  const ruleSteps = isCheck
    ? quizRuleStepDefs({
        value: flashcardRulesToBehavior(rules),
        onChange: (next) => setRules(behaviorToFlashcardRules(next)),
        gates,
        handRaiseMode: 'force-off',
        flashcards: true,
      })
    : [];
  const sharingStep: AssignStepDef[] =
    isCheck && (assignment.plcShare || onShareResults)
      ? [
          {
            id: 'sharing',
            title: getAssignStepTitle('sharing', 'flashcards', {
              ...kindCtx,
              flashcardsV2: true,
              inPlc: true,
            }),
            // A PLC the teacher has left has no name to show.
            value: assignment.plcShare
              ? plcName
                ? `Shared with ${plcName}`
                : ''
              : 'Not shared',
            body: assignment.plcShare ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-brand-blue-dark truncate">
                  {plcName ? `Sharing results with ${plcName}` : null}
                </span>
                <button
                  type="button"
                  onClick={() => void onStopSharing?.()}
                  {...tourTypeAttr(
                    'flashcards-settings-modal.stop-plc',
                    'flashcards'
                  )}
                  disabled={!onStopSharing}
                  className="shrink-0 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-brand-red-primary hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                >
                  Stop sharing
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onShareResults}
                {...tourTypeAttr(
                  'flashcards-settings-modal.plc-results',
                  'flashcards'
                )}
                className="px-3 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-lighter/40 rounded-lg transition-colors"
              >
                Share results with PLC…
              </button>
            ),
          },
        ]
      : [];

  return (
    <AssignStepper
      isOpen
      onClose={onClose}
      title={assignment.setTitle || 'Untitled set'}
      steps={[...classesStep, whenStep, ...ruleSteps, ...sharingStep]}
      submitLabel="Save"
      submitIcon={Save}
      onSubmit={handleSave}
      disabled={
        windowBackwards(availability, selectedRosters) ||
        (classesEditable &&
          initialClassIds.length > 0 &&
          selectedRosters.length === 0)
      }
      // Flashcards opens maximized; z-dialog sits above a maximized widget.
      zIndex="z-dialog"
    />
  );
};
