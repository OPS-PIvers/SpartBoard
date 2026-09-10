/**
 * QuizAssignmentSettingsModal — edit the settings for a single assignment.
 *
 * Wave 2-QZ / Task 12 (freeze-live): behavior settings are now READ-ONLY on
 * a launched assignment — they were snapshotted at create time from the quiz.
 * To change behavior, edit the quiz (Settings tab); it affects future
 * assignments only. This modal now shows:
 *   • A read-only behavior summary (formatBehaviorSummary) with an
 *     "Edit in quiz" hint.
 *   • An editable due-date input.
 *   • Editable targeting fields: class name, periods.
 *   • PLC results sharing status with Share / Stop sharing actions (D12);
 *     the link itself is written by the widget's share hooks, not this patch.
 * The save patch no longer includes sessionMode / sessionOptions / attemptLimit.
 */

import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import type {
  QuizAssignment,
  QuizAssignmentSettings,
  ClassRoster,
} from '@/types';
import { AssignModal } from '@/components/common/library';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  resolveSelectedRosters,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import { formatBehaviorSummary } from '@/utils/quizBehavior';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import {
  DEFAULT_DUE_TIME,
  dueInputsToEpoch,
  splitDueAtToInputs,
} from '@/utils/localDate';

interface QuizAssignmentSettingsModalProps {
  assignment: QuizAssignment;
  rosters: ClassRoster[];
  onClose: () => void;
  onSave: (patch: Partial<QuizAssignmentSettings>) => Promise<void> | void;
  /** True when the teacher belongs to at least one PLC. */
  canShareWithPlc?: boolean;
  /** Opens the "Share results with PLC…" picker (unlinked assignments). */
  onShareResults?: () => void;
  /** Clears the PLC results link (linked assignments). */
  onStopSharing?: () => void | Promise<void>;
}

/** Options object driven through AssignModal's `options` generic. */
interface SettingsOptions {
  className: string;
  /** Unified roster picker state (rosterIds[]). */
  picker: AssignClassPickerValue;
  /** 'YYYY-MM-DD' local, or '' for no due date */
  dueDate: string;
  /** 'HH:MM' local time-of-day (defaults to end-of-day) */
  dueTime: string;
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
  const due = splitDueAtToInputs(a.dueAt ?? null, a.dueAtHasTime);
  return {
    className: a.className ?? '',
    picker: hydratePickerValue(a, rosters),
    dueDate: due.date,
    dueTime: due.time,
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
}) => {
  const [options, setOptions] = useState<SettingsOptions>(() =>
    initialOptionsFor(assignment, rosters)
  );

  // Build read-only behavior summary from the assignment's frozen behavior.
  const behaviorSummary = formatBehaviorSummary({
    sessionMode: assignment.sessionMode,
    sessionOptions: assignment.sessionOptions ?? {},
    attemptLimit: assignment.attemptLimit ?? null,
  });

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

    // Freeze-live: behavior fields (sessionMode, sessionOptions, attemptLimit)
    // are intentionally OMITTED from the patch. They were frozen at create
    // time and must only change by editing the source quiz (affects future
    // assignments). Omitting them means Firestore leaves those fields untouched.
    const patch: Partial<QuizAssignmentSettings> = {
      className: options.className.trim(),
      rosterIds: targets.rosterIds,
      periodName: targets.periodNames[0] ?? '',
      periodNames: targets.periodNames,
      dueAt: dueInputsToEpoch(options.dueDate, options.dueTime),
      // The time picker always yields an explicit local time, so mark the value
      // as time-bearing (when a date is set) — distinguishes it from legacy
      // date-only dueAts so the round-trip/Classroom conversion reads it right.
      dueAtHasTime: !!options.dueDate,
    };
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[QuizAssignmentSettingsModal] save failed:', err);
    }
  };

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
      onAssign={handleAssign}
      extraSlot={
        <>
          <div>
            <AssignClassPicker
              rosters={rosters}
              value={options.picker}
              onChange={(picker) => setOptions((prev) => ({ ...prev, picker }))}
            />
            <p className="text-xxs text-slate-400 mt-0.5">
              Select class periods for this assignment. Students will choose
              their class when joining.
            </p>
          </div>

          {/* Due date + time */}
          <div>
            <label
              htmlFor="assignment-settings-due-date"
              className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1"
            >
              Due Date <span className="font-normal">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="assignment-settings-due-date"
                type="date"
                data-testid="assignment-due-date"
                value={options.dueDate}
                onChange={(e) =>
                  setOptions((p) => ({ ...p, dueDate: e.target.value }))
                }
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="time"
                data-testid="assignment-due-time"
                aria-label="Due time"
                value={options.dueTime}
                disabled={!options.dueDate}
                onChange={(e) =>
                  setOptions((p) => ({
                    ...p,
                    dueTime: e.target.value || DEFAULT_DUE_TIME,
                  }))
                }
                className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <p className="text-xxs text-slate-400 mt-0.5">
              Uses your local time. Synced to Google Classroom when assigned
              there.
            </p>
          </div>

          {/* Read-only behavior summary — freeze-live: behavior is frozen at
              create time. To change it, edit the quiz settings (affects future
              assignments). */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xxs font-bold text-slate-400 uppercase tracking-widest">
                Behavior
              </p>
              <span className="text-xxs text-slate-400">
                Edit in the quiz editor
              </span>
            </div>
            <p
              data-testid="assignment-behavior-summary"
              className="text-sm text-slate-600 leading-snug"
            >
              {behaviorSummary}
            </p>
          </div>
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
                disabled={!onStopSharing}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-brand-red-primary hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
              >
                Stop sharing
              </button>
            ) : canShareWithPlc ? (
              <button
                type="button"
                onClick={onShareResults}
                disabled={!onShareResults}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-lighter/40 rounded-lg transition-colors disabled:opacity-40"
              >
                Share results with PLC…
              </button>
            ) : null}
          </div>
          <p className="text-xxs text-slate-500">
            {assignment.plc
              ? 'Completed, scored results pool with your team on the PLC page. No student names are shared.'
              : canShareWithPlc
                ? 'Pool this assignment’s scored results with a PLC you belong to.'
                : 'Join a PLC to pool results with a team.'}
          </p>
        </div>
      }
    />
  );
};
