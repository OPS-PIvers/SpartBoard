/**
 * AssignTargetingSection — the shared target-mode toggle + B1 picker trigger +
 * B2 override list + assignment-level window pickers (spec §5 B3, §4 Design
 * Contract). Consumed VERBATIM by all four B3 PRs (quiz/VA/GL/mini-app) — the
 * PRs differ only in save-wiring, never in layout, to prevent four-way drift.
 *
 * Default state (`targetMode: 'class'`) renders NOTHING except one collapsed
 * "+ Individual students & overrides" affordance — class-wide assign
 * click-count is unchanged from today (spec §3a-G, B3 acceptance criterion).
 * Expanding sets `targetMode: 'students'` and reveals the `AssignStudentPicker`
 * trigger, the per-student `OverrideEditorRow` list, and the assignment-level
 * `openAt`/`closeAt` (+ `dueAt` when the consumer opts in) window pickers.
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
 * emits `null` itself. On re-edit of an existing assignment, it is the
 * consumer's save-wiring that must diff against the previously-saved value
 * and translate a removed override/window field into an explicit `null` when
 * building the `setAssignmentTargetsV1` payload, so a real clear is not
 * silently read as "leave the stored value alone".
 *
 * Reference cloned: `CollapsibleSection` (collapsed affordance chrome),
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
import type {
  ClassRoster,
  Rubric,
  Student,
  StudentOverride,
  StudentTargetRef,
} from '@/types';
import {
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

/** Every student across every passed roster, for name lookup + override peers. */
function buildStudentIndex(
  rosters: ClassRoster[]
): Map<string, { student: Student; ref: StudentTargetRef }> {
  const index = new Map<string, { student: Student; ref: StudentTargetRef }>();
  for (const roster of rosters) {
    for (const student of roster.students) {
      const ref: StudentTargetRef | null = student.classLinkSourcedId
        ? { kind: 'classlink', sourcedId: student.classLinkSourcedId }
        : roster.testClassId && student.email
          ? { kind: 'test', email: student.email }
          : null;
      if (!ref) continue;
      index.set(studentTargetRefKey(ref), { student, ref });
    }
  }
  return index;
}

export const AssignTargetingSection: React.FC<AssignTargetingSectionProps> = ({
  rosters,
  value,
  onChange,
  kind,
  showDueAt = false,
  quizContext,
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
          name: entry
            ? `${entry.student.firstName} ${entry.student.lastName}`.trim()
            : t('assignTargeting.unknownStudent', 'Unknown student'),
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

  const expand = () => patch({ targetMode: 'students' });

  const collapse = () =>
    onChange({
      ...EMPTY_ASSIGN_TARGETING_VALUE,
      openAt: value.openAt,
      closeAt: value.closeAt,
      dueAt: value.dueAt,
    });

  if (value.targetMode === 'class') {
    return (
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
    );
  }

  return (
    <CollapsibleSection
      label={t(
        'assignTargeting.sectionLabel',
        'Individual students & overrides'
      )}
      defaultOpen
    >
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
        <div className="flex items-center gap-2">
          {value.targetStudents.length > 0 && (
            <span className="text-xs text-slate-500">
              {t('assignTargeting.selectedCount', '{{count}} selected', {
                count: value.targetStudents.length,
              })}
            </span>
          )}
          <button
            type="button"
            onClick={collapse}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {t('assignTargeting.revertToClass', 'Assign to whole class')}
          </button>
        </div>
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

      <div className="grid grid-cols-2 gap-2">
        <label className="block" htmlFor={openAtId}>
          <span className="text-xs font-medium text-slate-500">
            {t('assignTargeting.opensAt', 'Opens')}
          </span>
          <input
            id={openAtId}
            type="datetime-local"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
            value={msToLocalInputValue(value.openAt)}
            onChange={(e) =>
              patch({ openAt: localInputValueToMs(e.target.value) })
            }
          />
        </label>
        <label className="block" htmlFor={closeAtId}>
          <span className="text-xs font-medium text-slate-500">
            {t('assignTargeting.closesAt', 'Closes')}
          </span>
          <input
            id={closeAtId}
            type="datetime-local"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
            value={msToLocalInputValue(value.closeAt)}
            onChange={(e) =>
              patch({ closeAt: localInputValueToMs(e.target.value) })
            }
          />
        </label>
        {showDueAt && (
          <label className="block col-span-2" htmlFor={dueAtId}>
            <span className="text-xs font-medium text-slate-500">
              {t('assignTargeting.dueAt', 'Due')}
            </span>
            <input
              id={dueAtId}
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
              value={msToLocalInputValue(value.dueAt)}
              onChange={(e) =>
                patch({ dueAt: localInputValueToMs(e.target.value) })
              }
            />
          </label>
        )}
      </div>

      <AssignStudentPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        rosters={rosters}
        selected={value.targetStudents}
        overridesByKey={value.overridesByKey}
        onConfirm={(selected, overridesByKey) => {
          patch({ targetStudents: selected, overridesByKey });
          setPickerOpen(false);
        }}
      />
    </CollapsibleSection>
  );
};
