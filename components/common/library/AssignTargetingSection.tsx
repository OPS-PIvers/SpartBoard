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
 *   2. "Individual students & overrides" — `targetMode`. Default state
 *      (`targetMode: 'class'`) renders NOTHING but one collapsed
 *      "+ Individual students & overrides" affordance — class-wide assign
 *      click-count is unchanged from today (spec §3a-G, B3 acceptance
 *      criterion). Expanding sets `targetMode: 'students'` and reveals the
 *      `AssignStudentPicker` trigger and the per-student `OverrideEditorRow`
 *      list. This affordance owns a SINGLE expand/collapse control (the
 *      "+ Individual…" / "Assign to whole class" pair) — it is intentionally
 *      NOT wrapped in `CollapsibleSection`, which would stack a second,
 *      independent toggle on top of it (F3 fix).
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
import { useTranslation } from 'react-i18next';
import { Plus, Users } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { AssignStudentPicker } from './AssignStudentPicker';
import {
  OverrideEditorRow,
  type OverrideEditorPeer,
  type OverrideEditorQuestion,
} from './OverrideEditorRow';
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
  | 'mini-app';

export interface AssignTargetingQuizContext {
  questions: OverrideEditorQuestion[];
  rubrics: Rubric[];
}

export interface AssignTargetingSectionProps {
  rosters: ClassRoster[];
  value: AssignTargetingValue;
  onChange: (next: AssignTargetingValue) => void;
  kind: AssignTargetingKind;
  /** Quiz-only assignment-level due date (Decision 5); other kinds omit. */
  showDueAt?: boolean;
  /** Present only for quiz consumers — unlocks question subset / MC hider / rubric swap in B2 rows. */
  quizContext?: AssignTargetingQuizContext;
  /**
   * Fired on first expansion into 'students' mode (F1 fix — the host lazily
   * loads full quiz content only when the teacher actually opens this
   * affordance, instead of on every modal open).
   */
  onExpand?: () => void;
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

export const AssignTargetingSection: React.FC<AssignTargetingSectionProps> = ({
  rosters,
  value,
  onChange,
  kind,
  showDueAt = false,
  quizContext,
  onExpand,
}) => {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const patch = (next: Partial<AssignTargetingValue>) =>
    onChange({ ...value, ...next });

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

  const expand = () => {
    patch({ targetMode: 'students' });
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
  const individualSection =
    value.targetMode === 'class' ? (
      <div className="border-t border-slate-200/70 pt-3">
        <button
          type="button"
          onClick={expand}
          className="flex items-center gap-1.5 text-sm font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t(
            'assignTargeting.expandAffordance',
            '+ Individual students & overrides'
          )}
        </button>
      </div>
    ) : (
      <div className="border-t border-slate-200/70 pt-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-brand-blue-dark">
            {t(
              'assignTargeting.sectionLabel',
              'Individual students & overrides'
            )}
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
          onConfirm={(selected, overridesByKey, groupIds) => {
            patch({
              targetStudents: selected,
              overridesByKey,
              targetGroupIds: groupIds,
            });
            setPickerOpen(false);
          }}
        />
      </div>
    );

  return (
    <div className="space-y-0">
      {scheduleSection}
      {individualSection}
    </div>
  );
};
