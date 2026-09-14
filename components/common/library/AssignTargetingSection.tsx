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
import { SlidersHorizontal, Users } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { AssignStudentPicker } from './AssignStudentPicker';
import {
  OverrideEditorRow,
  type OverrideEditorPeer,
  type OverrideEditorQuestion,
} from './OverrideEditorRow';
import type {
  ClassRoster,
  Rubric,
  StudentOverride,
  StudentTargetRef,
} from '@/types';
import {
  classStudentRows,
  effectiveClassOverride,
  resolveStudentTargetRef,
  studentTargetRefKey,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
  type ClassStudentRow,
} from '@/utils/studentTargetRef';
import {
  isNonEnglishQuizSource,
  uncoveredLocalesForTargets,
} from '@/utils/quizTranslationAdvisory';
import { languageNativeLabel } from '@/utils/languageNativeLabel';

export type { AssignTargetingValue } from '@/utils/studentTargetRef';
export { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';

export type AssignTargetingKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'mini-app';

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
}

/** ms epoch <-> `<input type="datetime-local">` value (local time, no seconds). */
const msToLocalInputValue = (ms: number | undefined): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(ms - tzOffsetMs).toISOString().slice(0, 16);
};
const localInputValueToMs = (value: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

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

/** `<input type="datetime-local">`-shaped labeled field, shared by the Schedule row. */
const WindowField: React.FC<{
  id: string;
  label: string;
  className?: string;
  value: number | undefined;
  onChange: (ms: number | undefined) => void;
}> = ({ id, label, className, value, onChange }) => (
  <label className={`block ${className ?? ''}`} htmlFor={id}>
    <span className="text-xs font-medium text-slate-500">{label}</span>
    <input
      id={id}
      type="datetime-local"
      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
      value={msToLocalInputValue(value)}
      onChange={(e) => onChange(localInputValueToMs(e.target.value))}
    />
  </label>
);

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

/** One class-mode student row: skip toggle + the shared override editor. */
const ClassStudentOverrideRow: React.FC<{
  row: ClassStudentRow;
  override: StudentOverride;
  hasStanding: boolean;
  skipped: boolean;
  onOverrideChange: (next: StudentOverride) => void;
  onSkipChange: (skipped: boolean) => void;
  quizMode: boolean;
  readAloudAvailable: boolean;
  questions: OverrideEditorQuestion[];
  rubrics: Rubric[];
  peers: OverrideEditorPeer[];
}> = ({
  row,
  override,
  hasStanding,
  skipped,
  onOverrideChange,
  onSkipChange,
  quizMode,
  readAloudAvailable,
  questions,
  rubrics,
  peers,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        {hasStanding && (
          <span className="rounded-full bg-brand-blue-lighter px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue-dark">
            {t('assignTargeting.standingBadge', 'Standing')}
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={skipped}
            aria-label={t('assignTargeting.skipStudentNamed', 'Skip {{name}}', {
              name: row.name,
            })}
            onChange={(e) => onSkipChange(e.target.checked)}
          />
          {t('assignTargeting.skipStudent', 'Skip this student')}
        </label>
      </div>
      <div className={skipped ? 'opacity-50 pointer-events-none' : undefined}>
        <OverrideEditorRow
          studentName={row.name}
          override={override}
          onChange={onOverrideChange}
          quizMode={quizMode}
          readAloudAvailable={readAloudAvailable}
          questions={questions}
          rubrics={rubrics}
          peers={peers}
        />
      </div>
    </div>
  );
};

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
}) => {
  const { t } = useTranslation();
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
    () => selectedRosterIds ?? rosters.map((r) => r.id),
    [selectedRosterIds, rosters]
  );

  const classRows = useMemo(() => {
    const rows = classStudentRows({
      rosters,
      selectedRosterIds: effectiveRosterIds,
    });
    if (useRosterDefaults) return rows;
    // Re-edit: the stored snapshot is frozen, so standing defaults are inert.
    return rows.map(
      ({ defaultOverride: _ignored, ...rest }): ClassStudentRow => rest
    );
  }, [rosters, effectiveRosterIds, useRosterDefaults]);

  const anyClassChecked = effectiveRosterIds.length > 0;

  // Students in the checked classes with no school sign-in: the class channel
  // still delivers to them, but they can never carry a pointer doc.
  const unresolvableCount = useMemo(() => {
    const selected = new Set(effectiveRosterIds);
    let count = 0;
    for (const roster of rosters) {
      if (!selected.has(roster.id)) continue;
      for (const student of roster.students) {
        if (!resolveStudentTargetRef(student, roster)) count += 1;
      }
    }
    return count;
  }, [rosters, effectiveRosterIds]);

  // Pruned to the checked classes — an unchecked class must not keep a skip.
  const excludedInScope = useMemo(() => {
    const rowKeys = new Set(classRows.map((row) => row.key));
    return (value.excludedStudents ?? []).filter((ref) =>
      rowKeys.has(studentTargetRefKey(ref))
    );
  }, [value.excludedStudents, classRows]);

  const excludedKeys = useMemo(
    () => new Set(excludedInScope.map(studentTargetRefKey)),
    [excludedInScope]
  );

  const modifiedCount = useMemo(
    () =>
      classRows.filter(
        (row) =>
          !excludedKeys.has(row.key) &&
          !!effectiveClassOverride(row, value.overridesByKey)
      ).length,
    [classRows, excludedKeys, value.overridesByKey]
  );

  // Rows the teacher has a reason to see first: a standing roster
  // accommodation, an edit made here, or a skip. Everything else collapses.
  const isPromoted = (row: ClassStudentRow) =>
    !!row.defaultOverride ||
    !!value.overridesByKey[row.key] ||
    excludedKeys.has(row.key);
  const promotedRows = classRows.filter(isPromoted);
  const remainingRows = classRows.filter((row) => !isPromoted(row));
  const visibleRows = showAll
    ? [...promotedRows, ...remainingRows]
    : promotedRows;

  // Grouped by class so a multi-class assign never mixes two sections into one
  // undifferentiated list; last name orders each section.
  const groupedRows = new Map<string, ClassStudentRow[]>();
  for (const row of visibleRows) {
    const existing = groupedRows.get(row.rosterName);
    if (existing) existing.push(row);
    else groupedRows.set(row.rosterName, [row]);
  }
  const visibleGroups = [...groupedRows.entries()].map(
    ([rosterName, groupRows]) => ({
      rosterName,
      rows: [...groupRows].sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name)
      ),
    })
  );

  const multiClass = visibleGroups.length > 1;

  // Drops every edit and skip this dialog made — the control the pacing error
  // tells the teacher to reach for.
  const clearModifications = () =>
    patch({
      targetStudents: [],
      overridesByKey: {},
      excludedStudents: [],
    });

  const translationAdvisory = useMemo(() => {
    const translation = quizContext?.translation;
    if (!translation) return [];
    return uncoveredLocalesForTargets(
      classRows
        .filter((row) => !excludedKeys.has(row.key))
        .map((row) => ({
          name: row.name,
          language: effectiveClassOverride(row, value.overridesByKey)?.language,
        })),
      translation
    );
  }, [classRows, excludedKeys, quizContext?.translation, value.overridesByKey]);

  const patch = (next: Partial<AssignTargetingValue>) =>
    onChange({ ...value, ...next });

  const setOverrideForKey = (key: string, override: StudentOverride) =>
    patch({ overridesByKey: { ...value.overridesByKey, [key]: override } });

  const setSkipped = (ref: StudentTargetRef, skipped: boolean) => {
    const key = studentTargetRefKey(ref);
    patch({
      excludedStudents: skipped
        ? [...(value.excludedStudents ?? []), ref]
        : (value.excludedStudents ?? []).filter(
            (r) => studentTargetRefKey(r) !== key
          ),
    });
  };

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

  const nonEnglishSource = isNonEnglishQuizSource(
    quizContext?.translation?.sourceLanguage
  );
  const translationGenerateDisabled =
    nonEnglishSource ||
    quizContext?.translation?.hasBankSlots === true ||
    (quizContext?.translation?.cap?.remaining ?? 1) <= 0 ||
    !!quizContext?.translation?.generating;

  // Reverting to class-wide clears targeting/overrides ONLY — the Schedule
  // affordance is fully independent of targetMode (F1 fix), so a window the
  // teacher already set survives the revert.
  const collapse = () =>
    onChange({
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      openAt: value.openAt,
      closeAt: value.closeAt,
      dueAt: value.dueAt,
    });

  const scheduleSummary = formatScheduleSummary(value, t);

  // Schedule — always rendered regardless of targetMode (spec Decision 5:
  // windows apply to class-wide assignments too). A single `CollapsibleSection`
  // toggle is safe here because Schedule owns no other competing control.
  const scheduleSection = (
    <CollapsibleSection
      label={t('assignTargeting.scheduleLabel', 'Schedule')}
      summary={scheduleSummary ?? undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <WindowField
          id={openAtId}
          label={t('assignTargeting.opensAt', 'Opens')}
          value={value.openAt}
          onChange={(ms) => patch({ openAt: ms })}
        />
        <WindowField
          id={closeAtId}
          label={t('assignTargeting.closesAt', 'Closes')}
          value={value.closeAt}
          onChange={(ms) => patch({ closeAt: ms })}
        />
        {showDueAt && (
          <WindowField
            id={dueAtId}
            className="col-span-2"
            label={t('assignTargeting.dueAt', 'Due')}
            value={value.dueAt}
            onChange={(ms) => patch({ dueAt: ms })}
          />
        )}
      </div>
    </CollapsibleSection>
  );

  // Individual students & overrides — a single expand/collapse control (the
  // "+ Individual…" / "Assign to whole class" pair below), never wrapped in a
  // second `CollapsibleSection` toggle (F3 fix).
  const modificationsSummary =
    excludedInScope.length > 0 || modifiedCount > 0
      ? [
          excludedInScope.length > 0
            ? t('assignTargeting.summarySkipped', '{{count}} skipped', {
                count: excludedInScope.length,
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
        className="flex items-center gap-1.5 text-sm font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        {t('assignTargeting.expandAffordance', 'Edit or add modifications')}
        {modificationsSummary && (
          <span className="font-medium text-slate-500">
            {`— ${modificationsSummary}`}
          </span>
        )}
      </button>
    </div>
  ) : (
    <div className="border-t border-slate-200/70 pt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-brand-blue-dark">
          {t('assignTargeting.modificationsLabel', 'Modifications')}
        </span>
        <div className="flex items-center gap-3">
          {(modifiedCount > 0 || excludedInScope.length > 0) && (
            <button
              type="button"
              onClick={clearModifications}
              className="text-xs font-medium text-slate-500 hover:text-brand-red-primary transition-colors"
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
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {t('assignTargeting.collapse', 'Done')}
          </button>
        </div>
      </div>

      {translationAdvisory.length > 0 && (
        <div className="space-y-1.5">
          {translationAdvisory.map((entry) => (
            <div
              key={entry.locale}
              role="status"
              className="flex items-center gap-2 text-xxs text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5"
            >
              <span className="flex-1">
                {t('quizTranslation.assign.advisory.missing', {
                  count: entry.names.length,
                  others: entry.names.length - 1,
                  name: entry.names[0],
                  language: languageNativeLabel(entry.locale),
                })}
              </span>
              {quizContext?.translation?.onGenerate && (
                <button
                  type="button"
                  disabled={translationGenerateDisabled}
                  onClick={() =>
                    quizContext.translation?.onGenerate?.([entry.locale])
                  }
                  className="shrink-0 rounded-md border border-amber-500/50 px-2 py-0.5 font-bold text-amber-700 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {t('quizTranslation.assign.generate')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {unresolvableCount > 0 && (
        <p className="text-xs text-slate-500">
          {t(
            'assignTargeting.noSignInCount',
            '{{count}} students in these classes have no school sign-in and cannot be individually modified.',
            { count: unresolvableCount }
          )}
        </p>
      )}

      {classRows.length === 0 ? (
        <p className="text-xs text-slate-500">
          {anyClassChecked
            ? t(
                'assignTargeting.noSignInStudents',
                'No one in the checked classes has a school sign-in, so there is nobody to modify individually.'
              )
            : canPickClasses
              ? t(
                  'assignTargeting.noClassStudents',
                  'Check a class above to modify individual students.'
                )
              : t(
                  'assignTargeting.noLinkedClass',
                  'This assignment is not linked to a class you can modify here.'
                )}
        </p>
      ) : (
        <>
          {excludedInScope.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xxs text-amber-700"
            >
              {t(
                'assignTargeting.skipNotice',
                'Skipped students will not see this assignment. Everyone else in these classes still receives it.'
              )}
            </p>
          )}
          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <div key={group.rosterName} className="space-y-2">
                {multiClass && (
                  <p className="text-xxs font-bold uppercase tracking-wider text-slate-500">
                    {group.rosterName}
                  </p>
                )}
                {group.rows.map((row) => (
                  <ClassStudentOverrideRow
                    key={row.key}
                    row={row}
                    override={
                      value.overridesByKey[row.key] ?? row.defaultOverride ?? {}
                    }
                    hasStanding={!!row.defaultOverride}
                    skipped={excludedKeys.has(row.key)}
                    onOverrideChange={(next) =>
                      setOverrideForKey(row.key, next)
                    }
                    onSkipChange={(skipped) => setSkipped(row.ref, skipped)}
                    quizMode={kind === 'quiz'}
                    readAloudAvailable={readAloudAvailable}
                    questions={quizContext?.questions ?? []}
                    rubrics={quizContext?.rubrics ?? []}
                    peers={visibleRows
                      .filter((peer) => peer.key !== row.key)
                      .map((peer) => ({
                        id: peer.key,
                        name: peer.name,
                        override:
                          value.overridesByKey[peer.key] ??
                          peer.defaultOverride ??
                          {},
                      }))}
                  />
                ))}
              </div>
            ))}
          </div>
          {remainingRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="text-xs font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors"
            >
              {showAll
                ? t('assignTargeting.showFewer', 'Show fewer')
                : t('assignTargeting.showMore', 'Show {{count}} more', {
                    count: remainingRows.length,
                  })}
            </button>
          )}
        </>
      )}
    </div>
  );

  // Legacy read/edit path: assignments saved before class-mode modifications
  // still carry a hand-picked `targetMode: 'students'` set.
  const legacySection = (
    <div className="border-t border-slate-200/70 pt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-brand-blue-dark">
          {t('assignTargeting.sectionLabel', 'Individual students & overrides')}
        </span>
        <button
          type="button"
          onClick={collapse}
          className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          {t('assignTargeting.revertToClass', 'Assign to whole class')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark transition-colors"
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          {value.targetStudents.length > 0
            ? t('assignTargeting.editStudents', 'Edit students')
            : t('assignTargeting.chooseStudents', 'Choose students')}
        </button>
        {value.targetStudents.length > 0 && (
          <span className="text-xs text-slate-500">
            {t('assignTargeting.selectedCount', '{{count}} selected', {
              count: value.targetStudents.length,
            })}
          </span>
        )}
      </div>

      {selectedRows.length === 0 ? (
        <p className="text-xs text-slate-500">
          {t(
            'assignTargeting.noStudentsYet',
            'No students chosen yet — everyone in the class stays untargeted.'
          )}
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
                  className="mt-1 text-xs font-medium text-slate-400 hover:text-brand-red-primary transition-colors"
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
    <div className="space-y-0">
      {scheduleSection}
      {value.targetMode === 'students' &&
      (value.excludedStudents ?? []).length === 0
        ? legacySection
        : allowModifications
          ? classSection
          : null}
    </div>
  );
};
