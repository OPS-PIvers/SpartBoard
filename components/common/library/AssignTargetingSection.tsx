/**
 * AssignTargetingSection — the shared target-mode toggle + B1 picker trigger +
 * B2 override list + assignment-level window pickers (spec §5 B3, §4 Design
 * Contract). Consumed VERBATIM by all four B3 PRs (quiz/VA/GL/mini-app) — the
 * PRs differ only in save-wiring, never in layout, to prevent four-way drift.
 *
 * TWO INDEPENDENT AFFORDANCES (F1 fix — spec Decision 5 gives windows to
 * every assignment, class-wide included):
 *   1. "Schedule" — the `openAt`/`closeAt`/`dueAt` window pickers. Always
 *      rendered, collapsed by default, and NEVER touches `targetMode`.
 *      Collapsed with a window already set shows a compact one-line summary
 *      so the state is never invisible (e.g. "Opens Mon 8:00 AM – Closes Fri
 *      3:00 PM").
 *   2. "Edit or add modifications" — per-student accommodations. Default state
 *      (`targetMode: 'class'`) renders NOTHING but one collapsed
 *      "+ Individual students & overrides" affordance — class-wide assign
 *      click-count is unchanged from today (spec §3a-G, B3 acceptance
 *      criterion). Expanding lists every student in the CHECKED CLASSES,
 *      pre-filled from the roster's standing accommodations
 *      (`defaultOverridesByStudentId`) and editable for this assignment only,
 *      each with a "Skip this student" toggle. The classes decide who gets
 *      the work; the hand-pick student list is retired (assignments already
 *      saved with `targetMode: 'students'` still render and edit through the
 *      legacy branch below).
 *
 * Fully controlled: the parent owns `AssignTargetingValue` and passes it
 * straight into session creation + the `setAssignmentTargetsV1` Cloud
 * Function (`functions/src/studentAssignmentTargets.ts`). `overridesByKey` is
 * keyed with the same NAMESPACED format the CF's `overridesBySourcedId`
 * expects — `classlink:{sourcedId}` / `test:{emailLower}`, produced by
 * `studentTargetRefKey` (`utils/studentTargetRef.ts`).
 *
 * Clear semantics (`functions/src/studentAssignmentTargets.ts` header):
 * an ABSENT key in the CF payload preserves whatever is already stored on the
 * pointer doc; an explicit `null` clears it. This component's `value` only
 * ever represents the CURRENT state (removing a student drops their key from
 * `overridesByKey`; an unset window field is simply `undefined`) — it never
 * emits `null` itself. B3 consumers MUST build the `setAssignmentTargetsV1`
 * payload via `buildSetAssignmentTargetsPayload` (`utils/studentTargetRef.ts`)
 * rather than hand-rolling the diff — it is the one place that translates a
 * real clear into the CF's explicit `null` (F2 fix).
 *
 * Reference cloned: `CollapsibleSection` (collapsed affordance chrome, used
 * for the Schedule affordance only — it owns no competing toggle),
 * `AssignStudentPicker` (B1), `OverrideEditorRow` (B2, including its
 * datetime-local <-> epoch-ms helpers, mirrored here for the assignment-level
 * window since B2's helpers are private to that per-student component).
 */

import React, { useId, useMemo, useState } from 'react';
import type { AssignTranslationContext } from './AssignStudentPicker';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  ChevronRight,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { WindowField } from './AssignWindowField';
import { AssignAvailabilitySection } from './AssignAvailabilitySection';
import {
  chosenWorkKind,
  defaultAvailability,
  type WorkKindSetting,
} from '@/utils/assignAvailability';
import { scaledFont } from './assignWindowUtils';
import {
  AssignPeriodAccessSection,
  type AssignPeriodAccessContext,
} from './AssignPeriodAccessSection';
import { AssignStudentPicker } from './AssignStudentPicker';
import {
  OverrideEditorRow,
  type OverrideEditorPeer,
  type OverrideEditorQuestion,
} from './OverrideEditorRow';
import { ModificationsList } from './assignStepper/ModificationsView';
import {
  clearedModifications,
  countModifications,
  effectiveRosterIdsFor,
  modificationRows,
} from './assignStepper/ModificationsView.helpers';
import type { ClassRoster, Rubric, StudentOverride } from '@/types';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';

export type { AssignTargetingValue } from '@/utils/studentTargetRef';
export { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';

export type AssignTargetingKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app'
  | 'flashcards';

export interface AssignTargetingQuizContext {
  questions: OverrideEditorQuestion[];
  rubrics: Rubric[];
  /** Drives the §10 translation coverage advisory; absent = no advisory. */
  translation?: AssignTranslationContext;
}

export interface AssignTargetingSectionProps {
  rosters: ClassRoster[];
  /** Ids of the classes checked in `AssignClassPicker`; omitted = every roster. */
  selectedRosterIds?: string[];
  value: AssignTargetingValue;
  onChange: (next: AssignTargetingValue) => void;
  kind: AssignTargetingKind;
  /** Guided-learning/mini-app assignment-level due date; Quiz/VA keep their legacy due-date field and omit this. */
  showDueAt?: boolean;
  /** Present only for quiz consumers — unlocks question subset / MC hider / rubric swap in B2 rows. */
  quizContext?: AssignTargetingQuizContext;
  /** Quiz only. Host passes `canAccessFeature('quiz-read-aloud')`. */
  readAloudAvailable?: boolean;
  /**
   * Fired on first expansion into 'students' mode (F1 fix — the host lazily
   * loads full quiz content only when the teacher actually opens this
   * affordance, instead of on every modal open).
   */
  onExpand?: () => void;
  /** False hides the modifications affordance entirely (no roster resolves here). */
  allowModifications?: boolean;
  /** False when the host has no class picker (the hub), changing the empty-state copy. */
  canPickClasses?: boolean;
  /** False on a re-edit: standing roster accommodations must not apply retroactively. */
  useRosterDefaults?: boolean;
  /**
   * True only for the one consumer that mounts this component inline inside
   * its own CSS-container-query front face (`MiniApp/Widget.tsx`'s non-portaled
   * `MiniAppAssignModal`) rather than inside the shared portaled `AssignModal`.
   * Switches this file's own text/icon sizing to `cqmin`-scaled inline styles;
   * the imported `CollapsibleSection`/`AssignStudentPicker`/`OverrideEditorRow`
   * are unaffected (out of scope — see the css-scaling journal).
   */
  cqScaled?: boolean;
  /** Per-period start and windows; the section shows once two or more classes are checked. */
  periodAccess?: AssignPeriodAccessContext;
  /** Host field rendered inside Schedule (Quiz's due date). */
  scheduleExtra?: React.ReactNode;
  /** Overrides the "Schedule" header. */
  scheduleLabel?: string;
  /** `assign-availability` on: Availability & Due Date replaces Schedule and the period mode; the host saves through `applyAvailability`. */
  availabilityEnabled?: boolean;
  /** False hides "All classes / Each class" where only one window can be saved. */
  availabilityEachClass?: boolean;
  /** `study-resources` on: adds the Submissions Enabled / Study Resource choice to Availability, preset to the kind's default. */
  workKind?: WorkKindSetting;
  /** Collapsed-state summary for `scheduleExtra`. */
  scheduleExtraSummary?: string | null;
}

/** `min(Xpx, Ycqmin)` square icon size, only when `cqScaled`. */
const scaledIcon = (
  cqScaled: boolean | undefined,
  px: number,
  cqmin: number
): React.CSSProperties | undefined =>
  cqScaled
    ? {
        width: `min(${px}px, ${cqmin}cqmin)`,
        height: `min(${px}px, ${cqmin}cqmin)`,
      }
    : undefined;

/**
 * Every student across every passed roster, for name lookup + override peers.
 * Reuses `resolveStudentTargetRef` (F4 fix) rather than re-deriving refs
 * inline, so this stays in lock-step with `AssignStudentPicker`'s derivation.
 */
function buildStudentIndex(
  rosters: ClassRoster[]
): Map<string, { name: string }> {
  const index = new Map<string, { name: string }>();
  for (const roster of rosters) {
    for (const student of roster.students) {
      const ref = resolveStudentTargetRef(student, roster);
      if (!ref) continue;
      index.set(studentTargetRefKey(ref), {
        name: `${student.firstName} ${student.lastName}`.trim(),
      });
    }
  }
  return index;
}

/** Compact one-liner used as the Schedule affordance's collapsed-state summary. */
function formatScheduleSummary(
  value: Pick<AssignTargetingValue, 'openAt' | 'closeAt'>,
  t: (
    key: string,
    defaultValue: string,
    opts?: Record<string, unknown>
  ) => string
): string | null {
  if (value.openAt == null && value.closeAt == null) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  if (value.openAt != null && value.closeAt != null) {
    return t(
      'assignTargeting.scheduleSummaryBoth',
      'Opens {{open}} – Closes {{close}}',
      { open: fmt(value.openAt), close: fmt(value.closeAt) }
    );
  }
  if (value.openAt != null) {
    return t('assignTargeting.scheduleSummaryOpenOnly', 'Opens {{open}}', {
      open: fmt(value.openAt),
    });
  }
  return t('assignTargeting.scheduleSummaryCloseOnly', 'Closes {{close}}', {
    close: fmt(value.closeAt as number),
  });
}

export const AssignTargetingSection: React.FC<AssignTargetingSectionProps> = ({
  rosters,
  selectedRosterIds,
  value,
  onChange,
  kind,
  showDueAt = false,
  quizContext,
  readAloudAvailable = false,
  onExpand,
  allowModifications = true,
  canPickClasses = true,
  useRosterDefaults = true,
  cqScaled = false,
  periodAccess,
  scheduleExtra,
  scheduleExtraSummary,
  scheduleLabel,
  availabilityEnabled = false,
  availabilityEachClass = true,
  workKind: workKindSetting,
}) => {
  const { t } = useTranslation();
  const [openedAt] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const openAtId = useId();
  const closeAtId = useId();
  const dueAtId = useId();

  const studentIndex = useMemo(() => buildStudentIndex(rosters), [rosters]);

  const selectedRows = useMemo(
    () =>
      value.targetStudents.map((ref) => {
        const key = studentTargetRefKey(ref);
        const entry = studentIndex.get(key);
        return {
          key,
          ref,
          name:
            entry?.name ??
            t('assignTargeting.unknownStudent', 'Unknown student'),
        };
      }),
    [value.targetStudents, studentIndex, t]
  );

  const effectiveRosterIds = useMemo(
    () => effectiveRosterIdsFor({ rosters, selectedRosterIds }),
    [selectedRosterIds, rosters]
  );

  const modificationCounts = useMemo(
    () =>
      countModifications(
        modificationRows({ rosters, selectedRosterIds, useRosterDefaults }),
        value
      ),
    [rosters, selectedRosterIds, useRosterDefaults, value]
  );
  const modifiedCount = modificationCounts.modified;
  const skippedCount = modificationCounts.skipped;

  // Drops every edit and skip this dialog made, the control the pacing error
  // tells the teacher to reach for.
  const clearModifications = () => onChange(clearedModifications(value));

  const patch = (next: Partial<AssignTargetingValue>) =>
    onChange({ ...value, ...next });

  const workKind = chosenWorkKind(value, workKindSetting);

  const setOverrideForKey = (key: string, override: StudentOverride) =>
    patch({ overridesByKey: { ...value.overridesByKey, [key]: override } });

  const removeStudent = (key: string) => {
    const nextStudents = value.targetStudents.filter(
      (ref) => studentTargetRefKey(ref) !== key
    );
    const nextOverrides = { ...value.overridesByKey };
    delete nextOverrides[key];
    patch({ targetStudents: nextStudents, overridesByKey: nextOverrides });
  };

  const openModifications = () => {
    setExpanded(true);
    onExpand?.();
  };

  // Reverting to class-wide clears targeting/overrides ONLY — the Schedule
  // affordance is fully independent of targetMode (F1 fix), so a window the
  // teacher already set survives the revert.
  const collapse = () =>
    onChange({
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      openAt: value.openAt,
      closeAt: value.closeAt,
      dueAt: value.dueAt,
      periodPlan: value.periodPlan,
      availability: value.availability,
    });

  const scheduleSummary = [
    formatScheduleSummary(value, t),
    scheduleExtraSummary,
  ]
    .filter(Boolean)
    .join(' · ');

  // Schedule — always rendered regardless of targetMode (spec Decision 5:
  // windows apply to class-wide assignments too). A single `CollapsibleSection`
  // toggle is safe here because Schedule owns no other competing control.
  const scheduleSection = (
    <CollapsibleSection
      label={scheduleLabel ?? t('assignTargeting.scheduleLabel', 'Schedule')}
      icon={CalendarClock}
      summary={scheduleSummary || undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <WindowField
          id={openAtId}
          label={t('assignTargeting.opensAt', 'Opens')}
          value={value.openAt}
          onChange={(ms) => patch({ openAt: ms })}
          cqScaled={cqScaled}
        />
        <WindowField
          id={closeAtId}
          label={t('assignTargeting.closesAt', 'Closes')}
          value={value.closeAt}
          onChange={(ms) => patch({ closeAt: ms })}
          cqScaled={cqScaled}
        />
        {showDueAt && (
          <WindowField
            id={dueAtId}
            className="col-span-2"
            label={t('assignTargeting.dueAt', 'Due')}
            value={value.dueAt}
            onChange={(ms) => patch({ dueAt: ms })}
            cqScaled={cqScaled}
          />
        )}
      </div>
      {scheduleExtra}
    </CollapsibleSection>
  );

  const periodRosters = periodAccess
    ? rosters.filter((r) => effectiveRosterIds.includes(r.id))
    : [];
  const periodSection =
    periodAccess && periodRosters.length > 1 ? (
      <AssignPeriodAccessSection
        rosters={periodRosters}
        plan={value.periodPlan}
        onChange={(periodPlan) => patch({ periodPlan })}
        context={periodAccess}
        sharedOpenAt={value.openAt}
      />
    ) : null;

  // Individual students & overrides — a single expand/collapse control (the
  // "+ Individual…" / "Assign to whole class" pair below), never wrapped in a
  // second `CollapsibleSection` toggle (F3 fix).
  const modificationsSummary =
    skippedCount > 0 || modifiedCount > 0
      ? [
          skippedCount > 0
            ? t('assignTargeting.summarySkipped', '{{count}} skipped', {
                count: skippedCount,
              })
            : null,
          modifiedCount > 0
            ? t('assignTargeting.summaryModified', '{{count}} modified', {
                count: modifiedCount,
              })
            : null,
        ]
          .filter(Boolean)
          .join(', ')
      : null;

  const classSection = !expanded ? (
    <div className="border-t border-slate-200/70 pt-3">
      <button
        type="button"
        onClick={openModifications}
        aria-expanded={false}
        className={
          cqScaled
            ? 'group flex w-full items-center gap-2 py-1 font-bold text-brand-blue-dark hover:text-brand-blue-primary transition-colors'
            : 'group flex w-full items-center gap-2 py-1 text-sm font-bold text-brand-blue-dark hover:text-brand-blue-primary transition-colors'
        }
        style={scaledFont(cqScaled, 14, 5.5)}
      >
        <SlidersHorizontal
          className={
            cqScaled
              ? 'text-brand-blue-primary'
              : 'w-4 h-4 text-brand-blue-primary'
          }
          style={scaledIcon(cqScaled, 16, 4.5)}
          aria-hidden="true"
        />
        {t('assignTargeting.expandAffordance', 'Edit or add modifications')}
        {modificationsSummary && (
          <span className="font-medium text-slate-500">
            {`— ${modificationsSummary}`}
          </span>
        )}
        <ChevronRight
          aria-hidden="true"
          className={
            cqScaled
              ? 'ml-auto text-slate-400'
              : 'ml-auto w-4 h-4 text-slate-400'
          }
          style={scaledIcon(cqScaled, 16, 4.5)}
        />
      </button>
    </div>
  ) : (
    <div className="border-t border-slate-200/70 pt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            cqScaled
              ? 'font-bold text-brand-blue-dark'
              : 'text-sm font-bold text-brand-blue-dark'
          }
          style={scaledFont(cqScaled, 14, 5.5)}
        >
          {t('assignTargeting.modificationsLabel', 'Modifications')}
        </span>
        <div className="flex items-center gap-3">
          {(modifiedCount > 0 || skippedCount > 0) && (
            <button
              type="button"
              onClick={clearModifications}
              className={
                cqScaled
                  ? 'font-medium text-slate-500 hover:text-brand-red-primary transition-colors'
                  : 'text-xs font-medium text-slate-500 hover:text-brand-red-primary transition-colors'
              }
              style={scaledFont(cqScaled, 12, 4.5)}
            >
              {t(
                'assignTargeting.clearModifications',
                'Clear all modifications'
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={
              cqScaled
                ? 'font-medium text-slate-500 hover:text-slate-700 transition-colors'
                : 'text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors'
            }
            style={scaledFont(cqScaled, 12, 4.5)}
          >
            {t('assignTargeting.collapse', 'Done')}
          </button>
        </div>
      </div>

      <ModificationsList
        rosters={rosters}
        selectedRosterIds={selectedRosterIds}
        useRosterDefaults={useRosterDefaults}
        value={value}
        onChange={onChange}
        quizMode={kind === 'quiz'}
        quizContext={quizContext}
        readAloudAvailable={readAloudAvailable}
        canPickClasses={canPickClasses}
        cqScaled={cqScaled}
        showAll={showAll}
        onShowAllChange={setShowAll}
      />
    </div>
  );

  // Legacy read/edit path: assignments saved before class-mode modifications
  // still carry a hand-picked `targetMode: 'students'` set.
  const legacySection = (
    <div className="border-t border-slate-200/70 pt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            cqScaled
              ? 'font-bold text-brand-blue-dark'
              : 'text-sm font-bold text-brand-blue-dark'
          }
          style={scaledFont(cqScaled, 14, 5.5)}
        >
          {t('assignTargeting.sectionLabel', 'Individual students & overrides')}
        </span>
        <button
          type="button"
          onClick={collapse}
          className={
            cqScaled
              ? 'font-medium text-slate-500 hover:text-slate-700 transition-colors'
              : 'text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors'
          }
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          {t('assignTargeting.revertToClass', 'Assign to whole class')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className={
            cqScaled
              ? 'inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 py-1.5 font-semibold text-white hover:bg-brand-blue-dark transition-colors'
              : 'inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark transition-colors'
          }
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          <Users
            className={cqScaled ? undefined : 'w-3.5 h-3.5'}
            style={scaledIcon(cqScaled, 14, 3.5)}
            aria-hidden="true"
          />
          {value.targetStudents.length > 0
            ? t('assignTargeting.editStudents', 'Edit students')
            : t('assignTargeting.chooseStudents', 'Choose students')}
        </button>
        {value.targetStudents.length > 0 && (
          <span
            className={cqScaled ? 'text-slate-500' : 'text-xs text-slate-500'}
            style={scaledFont(cqScaled, 12, 4.5)}
          >
            {t('assignTargeting.selectedCount', '{{count}} selected', {
              count: value.targetStudents.length,
            })}
          </span>
        )}
      </div>

      {selectedRows.length === 0 ? (
        <p
          className={cqScaled ? 'text-slate-500' : 'text-xs text-slate-500'}
          style={scaledFont(cqScaled, 12, 4.5)}
        >
          {t('assignTargeting.noStudentsYet', 'No students chosen.')}
        </p>
      ) : (
        <div className="space-y-2">
          {selectedRows.map((row) => {
            const peers: OverrideEditorPeer[] = selectedRows
              .filter((r) => r.key !== row.key)
              .map((r) => ({
                id: r.key,
                name: r.name,
                override: value.overridesByKey[r.key] ?? {},
              }));
            return (
              <div key={row.key} className="flex items-start gap-2">
                <div className="flex-1">
                  <OverrideEditorRow
                    studentName={row.name}
                    override={value.overridesByKey[row.key] ?? {}}
                    onChange={(next) => setOverrideForKey(row.key, next)}
                    quizMode={kind === 'quiz'}
                    readAloudAvailable={readAloudAvailable}
                    questions={quizContext?.questions ?? []}
                    rubrics={quizContext?.rubrics ?? []}
                    peers={peers}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStudent(row.key)}
                  className={
                    cqScaled
                      ? 'font-medium text-slate-400 hover:text-brand-red-primary transition-colors'
                      : 'mt-1 text-xs font-medium text-slate-400 hover:text-brand-red-primary transition-colors'
                  }
                  style={
                    cqScaled
                      ? {
                          marginTop: 'min(4px, 1cqmin)',
                          ...scaledFont(cqScaled, 12, 4.5),
                        }
                      : undefined
                  }
                  aria-label={t(
                    'assignTargeting.removeStudent',
                    'Remove {{name}}',
                    {
                      name: row.name,
                    }
                  )}
                >
                  {t('assignTargeting.remove', 'Remove')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AssignStudentPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        rosters={rosters}
        selected={value.targetStudents}
        overridesByKey={value.overridesByKey}
        selectedGroupIds={value.targetGroupIds}
        translation={quizContext?.translation}
        onConfirm={(selected, overridesByKey, groupIds) => {
          const readded = new Set(selected.map(studentTargetRefKey));
          patch({
            targetStudents: selected,
            overridesByKey,
            targetGroupIds: groupIds,
            excludedStudents: (value.excludedStudents ?? []).filter(
              (ref) => !readded.has(studentTargetRefKey(ref))
            ),
          });
          setPickerOpen(false);
        }}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {availabilityEnabled ? (
        <AssignAvailabilitySection
          value={
            value.availability ??
            defaultAvailability(openedAt, !!periodAccess, workKind)
          }
          onChange={(availability) => patch({ availability })}
          rosters={rosters.filter((r) => effectiveRosterIds.includes(r.id))}
          periodAccess={periodAccess}
          eachClass={availabilityEachClass}
          cqScaled={cqScaled}
          workKind={workKind}
          onWorkKindChange={
            workKindSetting && !workKindSetting.locked
              ? (next, availability) => patch({ workKind: next, availability })
              : undefined
          }
        />
      ) : (
        <>
          {scheduleSection}
          {periodSection}
        </>
      )}
      {value.targetMode === 'students' &&
      (value.excludedStudents ?? []).length === 0
        ? legacySection
        : allowModifications
          ? classSection
          : null}
    </div>
  );
};
