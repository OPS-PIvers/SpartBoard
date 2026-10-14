/**
 * QuizAssignmentSettingsModal — edit the settings for a single assignment.
 *
 * Behavior (attempts, shuffles, integrity, feedback, gamification) is editable
 * on a launched assignment; the session mode stays fixed. Also edits the due
 * date, targeting fields, and PLC results sharing (D12).
 */

import React, { useContext, useState } from 'react';
import { ClipboardCheck, Pause, Save, Share2 } from 'lucide-react';
import type {
  QuizAssignment,
  QuizBehaviorSettings,
  ClassRoster,
} from '@/types';
import type { QuizAssignmentSettingsPatch } from '@/hooks/useQuizAssignments';
import { AssignAvailabilitySection } from '@/components/common/library/AssignAvailabilitySection';
import {
  availabilityFromStored,
  changedWindow,
  closesBeforeOpens,
  periodAccessWindowEdits,
  resolveAvailability,
  specForRoster,
  type AssignAvailability,
} from '@/utils/assignAvailability';
import {
  AssignModal,
  CollapsibleSection,
  QuizBehaviorSettingsPanel,
} from '@/components/common/library';
import { AuthContext } from '@/context/AuthContextValue';
import { earliestDueAt } from '@/utils/perClassDueDates';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  resolveSelectedRosters,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import { formatBehaviorSummary } from '@/utils/quizBehavior';
import { AssignStepper } from '@/components/common/library/assignStepper/AssignStepper';
import {
  getAssignStepTitle,
  type AssignStepDef,
} from '@/components/common/library/assignStepper/assignSteps';
import { AssignWhenStep } from '@/components/common/library/assignStepper/AssignWhenStep';
import { formatWhenValue } from '@/components/common/library/assignStepper/assignWhenValue';
import { useQuizRuleGates } from '@/components/common/library/assignStepper/QuizRuleStepGates';
import { quizRuleStepDefs } from '@/components/common/library/assignStepper/quizRuleStepDefs';
import { useTranslation } from 'react-i18next';
import { getAssignmentWidgetKind } from '@/utils/quizWidgetKind';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import { tourTypeAttr } from '@/config/tourAnchors';

interface QuizAssignmentSettingsModalProps {
  assignment: QuizAssignment;
  rosters: ClassRoster[];
  onClose: () => void;
  onSave: (patch: QuizAssignmentSettingsPatch) => Promise<void> | void;
  /** True when the teacher belongs to at least one PLC. */
  canShareWithPlc?: boolean;
  /** Opens the "Share results with PLC…" picker (unlinked assignments). */
  onShareResults?: () => void;
  /** Clears the PLC results link (linked assignments). */
  onStopSharing?: () => void | Promise<void>;
  /** Quiz-kind assignment with the Review split on: hide gamification and board reveal (D9). */
  assessmentOnly?: boolean;
}

/** Options object driven through AssignModal's `options` generic. */
interface SettingsOptions {
  className: string;
  /** Unified roster picker state (rosterIds[]). */
  picker: AssignClassPickerValue;
}

/**
 * Hydrate the unified picker value from a (possibly legacy) assignment.
 *
 * Precedence:
 *   1. `a.rosterIds` — new post-unification assignments store these directly.
 *   2. legacy fallback — derive rosterIds from the stored `periodNames`
 *      (match against `roster.name`) so an existing assignment opens with the
 *      right classes preselected. Quiz assignments never carried `classIds`
 *      on the assignment doc (legacy ClassLink targeting lived on the session
 *      doc), so there's nothing to recover via `mapLegacyClassIdsToRosterIds`
 *      here — name-matching is the only legacy path.
 *
 * Unknown roster IDs / names simply drop out — the picker only shows rosters
 * the teacher still has, mirroring `resolveAssignmentTargets`.
 */
function hydratePickerValue(
  a: QuizAssignment,
  rosters: ClassRoster[]
): AssignClassPickerValue {
  // An explicit `rosterIds` (including `[]`) is authoritative and must
  // short-circuit before the legacy periodNames path: `[]` means "no rosters
  // selected", not "fall back to name-matching". Only an absent field
  // (undefined) consults the legacy periodNames below.
  if (a.rosterIds !== undefined) {
    const existing = new Set(rosters.map((r) => r.id));
    const matched = a.rosterIds.filter((id) => existing.has(id));
    return matched.length > 0 ? { rosterIds: matched } : makeEmptyPickerValue();
  }

  const legacyNames = a.periodNames ?? (a.periodName ? [a.periodName] : []);
  const byName = new Set(legacyNames);
  const fromNames = rosters.filter((r) => byName.has(r.name)).map((r) => r.id);

  return fromNames.length > 0
    ? { rosterIds: fromNames }
    : makeEmptyPickerValue();
}

function initialOptionsFor(
  a: QuizAssignment,
  rosters: ClassRoster[]
): SettingsOptions {
  return {
    className: a.className?.trim() ? a.className : a.quizTitle,
    picker: hydratePickerValue(a, rosters),
  };
}

export const QuizAssignmentSettingsModal: React.FC<
  QuizAssignmentSettingsModalProps
> = ({
  assignment,
  rosters,
  onClose,
  onSave,
  canShareWithPlc = false,
  onShareResults,
  onStopSharing,
  assessmentOnly = false,
}) => {
  const [options, setOptions] = useState<SettingsOptions>(() =>
    initialOptionsFor(assignment, rosters)
  );

  const [initialBehavior] = useState<QuizBehaviorSettings>(() => ({
    sessionMode: assignment.sessionMode,
    sessionOptions: assignment.sessionOptions ?? {},
    attemptLimit: assignment.attemptLimit ?? null,
  }));
  const [behavior, setBehavior] =
    useState<QuizBehaviorSettings>(initialBehavior);
  const canAccessFeature = useContext(AuthContext)?.canAccessFeature;
  const stepperOn = canAccessFeature?.('assign-stepper') === true;
  const { t } = useTranslation();
  const ruleGates = useQuizRuleGates();
  const perPeriod =
    assignment.accessMode === 'assignment' &&
    Object.keys(assignment.periodAccess ?? {}).length > 0;
  const selectedRostersForDue = resolveSelectedRosters(options.picker, rosters);
  // The window as saved, resolved the same way as the edit so unchanged fields are never rewritten.
  const [availabilityBaseline] = useState(() => {
    const ids = selectedRostersForDue.map((r) => r.id);
    const value = availabilityFromStored(assignment, ids);
    return {
      value,
      resolved: resolveAvailability(value, selectedRostersForDue, undefined),
    };
  });
  const [availability, setAvailability] = useState<AssignAvailability>(
    availabilityBaseline.value
  );
  const availabilityBackwards =
    selectedRostersForDue.length > 1 && availability.byRoster
      ? selectedRostersForDue.some((r) =>
          closesBeforeOpens(specForRoster(availability, r.id), [r], undefined)
        )
      : closesBeforeOpens(availability.all, selectedRostersForDue, undefined);
  const windowFields = (): QuizAssignmentSettingsPatch => {
    const resolved = resolveAvailability(
      availability,
      selectedRostersForDue,
      undefined
    );
    const changed = changedWindow(availabilityBaseline.resolved, resolved);
    const dueChanged = 'dueAt' in changed || 'dueAtByRosterId' in changed;
    const rowEdits = perPeriod
      ? periodAccessWindowEdits(
          assignment.periodAccess ?? {},
          availabilityBaseline.resolved,
          resolved
        )
      : {};
    // A per-class session gates on its rows; a shared window would add a second gate.
    const edit: QuizAssignmentSettingsPatch = perPeriod
      ? Object.keys(rowEdits).length > 0
        ? { periodAccessEdits: rowEdits }
        : {}
      : {
          ...('openAt' in changed ? { openAt: changed.openAt } : {}),
          ...('closeAt' in changed ? { closeAt: changed.closeAt } : {}),
        };
    if (!dueChanged) return edit;
    const perClass: Record<string, number> | undefined =
      resolved.dueAtByRosterId;
    const dueAt = perClass ? earliestDueAt(perClass) : (resolved.dueAt ?? null);
    const out: QuizAssignmentSettingsPatch = {
      ...edit,
      dueAt,
      dueAtHasTime: dueAt != null,
    };
    if (perClass || assignment.dueAtByRosterId) out.dueAtByRosterId = perClass;
    return out;
  };

  const handleAssign = async () => {
    // Intentionally pass empty strings (not undefined) so that clearing a
    // field actually writes '' to Firestore. Using `|| undefined` would cause
    // updateDoc to skip the field and leave the previous value in place.
    // The PLC link is never part of this patch — the Share / Stop sharing
    // actions write it through the widget's share hooks.

    // Unified targeting: derive both `rosterIds` (new source of truth) and
    // `periodNames` (back-compat read path) from the selected rosters. Writing
    // BOTH keeps existing readers (period-name fallback) working while moving
    // the assignment into roster-ID space — `deriveSessionTargetsFromRosters`
    // is the same derivation the create flow uses, so the two paths stay in
    // lock-step on dedup. Unknown picked IDs (roster deleted after selection)
    // drop out via the lookup.
    const selectedRosters = resolveSelectedRosters(options.picker, rosters);
    const targets = deriveSessionTargetsFromRosters(selectedRosters);

    const patch: QuizAssignmentSettingsPatch = {
      className: options.className.trim(),
      rosterIds: targets.rosterIds,
      periodName: targets.periodNames[0] ?? '',
      periodNames: targets.periodNames,
      ...windowFields(),
      // Behavior rides the patch only when edited; sessionMode never does.
      ...(JSON.stringify(behavior.sessionOptions) !==
      JSON.stringify(initialBehavior.sessionOptions)
        ? { sessionOptions: behavior.sessionOptions }
        : {}),
      ...(behavior.attemptLimit !== initialBehavior.attemptLimit
        ? { attemptLimit: behavior.attemptLimit }
        : {}),
    };
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[QuizAssignmentSettingsModal] save failed:', err);
    }
  };

  // The stepper edits Assessment assignments only; Review and live ones keep the full modal.
  if (stepperOn && getAssignmentWidgetKind(assignment) === 'quiz') {
    // A Manual start has no dates to edit: the teacher starts and pauses each class.
    const manualStart =
      assignment.accessMode === 'assessment' &&
      Object.keys(assignment.periodAccess ?? {}).length > 0 &&
      assignment.openAt == null &&
      assignment.closeAt == null &&
      assignment.dueAt == null;
    const whenStep: AssignStepDef = {
      id: 'when',
      title: getAssignStepTitle('when', 'quiz', { kind: 'work' }),
      value: formatWhenValue(
        { mode: manualStart ? 'manual' : 'scheduled', availability },
        {
          variant: 'when',
          rosterCount: selectedRostersForDue.length,
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
          variant="when"
          rosters={selectedRostersForDue}
          sharedOpens={!perPeriod}
          perClass
        />
      ),
    };
    const sharingStep: AssignStepDef[] =
      assignment.plc || canShareWithPlc
        ? [
            {
              id: 'sharing',
              title: getAssignStepTitle('sharing', 'quiz', { kind: 'work' }),
              value: assignment.plc
                ? `Shared with ${assignment.plc.name}`
                : 'Not shared',
              body: assignment.plc ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-brand-blue-dark truncate">
                    {`Sharing results with ${assignment.plc.name}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onStopSharing?.()}
                    {...tourTypeAttr('quiz-settings-modal.stop-plc', 'quiz')}
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
                  {...tourTypeAttr('quiz-settings-modal.plc-results', 'quiz')}
                  disabled={!onShareResults}
                  className="px-3 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-lighter/40 rounded-lg transition-colors disabled:opacity-40"
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
        title={assignment.quizTitle}
        steps={[
          whenStep,
          ...quizRuleStepDefs({
            value: behavior,
            onChange: setBehavior,
            gates: ruleGates,
            handRaiseMode: 'force-off',
          }),
          ...sharingStep,
        ]}
        submitLabel="Save"
        submitIcon={Save}
        onSubmit={handleAssign}
        disabled={availabilityBackwards}
      />
    );
  }

  return (
    <AssignModal<SettingsOptions>
      isOpen
      onClose={onClose}
      itemTitle={assignment.quizTitle}
      options={options}
      onOptionsChange={setOptions}
      assignmentName={options.className}
      onAssignmentNameChange={(v) =>
        setOptions((prev) => ({ ...prev, className: v }))
      }
      confirmLabel="Save"
      confirmDisabled={availabilityBackwards}
      onAssign={handleAssign}
      extraSlot={
        <>
          <AssignClassPicker
            rosters={rosters}
            value={options.picker}
            onChange={(picker) => setOptions((prev) => ({ ...prev, picker }))}
          />

          <AssignAvailabilitySection
            value={availability}
            onChange={setAvailability}
            rosters={selectedRostersForDue}
            sharedOpens={!perPeriod}
          />

          <CollapsibleSection
            label="Assessment Settings"
            icon={ClipboardCheck}
            summary={
              <span data-testid="assignment-behavior-summary">
                {formatBehaviorSummary(behavior, { omitMode: assessmentOnly })}
              </span>
            }
          >
            <QuizBehaviorSettingsPanel
              value={behavior}
              onChange={setBehavior}
              variant={assessmentOnly ? 'quiz' : 'live'}
              handRaiseMode="force-off"
            />
          </CollapsibleSection>
        </>
      }
      plcSlot={
        <div className="border-t border-slate-200/70 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Share2
                className="w-4 h-4 shrink-0 text-brand-blue-primary"
                aria-hidden="true"
              />
              <span className="text-sm font-bold text-brand-blue-dark truncate">
                {assignment.plc
                  ? `Sharing results with ${assignment.plc.name}`
                  : 'PLC results'}
              </span>
            </div>
            {assignment.plc ? (
              <button
                type="button"
                onClick={() => void onStopSharing?.()}
                {...tourTypeAttr('quiz-settings-modal.stop-plc', 'quiz')}
                disabled={!onStopSharing}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-brand-red-primary hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
              >
                Stop sharing
              </button>
            ) : canShareWithPlc ? (
              <button
                type="button"
                onClick={onShareResults}
                {...tourTypeAttr('quiz-settings-modal.plc-results', 'quiz')}
                disabled={!onShareResults}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-lighter/40 rounded-lg transition-colors disabled:opacity-40"
              >
                Share results with PLC…
              </button>
            ) : null}
          </div>
          <p className="text-xxs text-slate-500">
            {assignment.plc
              ? 'Scores pool on the PLC page without student names.'
              : canShareWithPlc
                ? 'Pool scores with one of your PLCs.'
                : 'Join a PLC to pool results with a team.'}
          </p>
        </div>
      }
    />
  );
};
