/**
 * QuizAssignmentImportSetupModal — minimal "pick classes" prompt that
 * appears immediately after a teacher pastes a shared-assignment URL.
 *
 * Background: `importSharedAssignment` intentionally drops
 * `rosterIds`/`classIds` from the originator's settings (those refer to
 * rosters in the originator's account). Without this prompt the imported
 * assignment lands paused with no targeting, and teachers don't realize
 * they need to dig into Settings → Class Periods to make it usable.
 *
 * Reuses `AssignClassPicker` so roster selection looks identical to the
 * primary assign flow. Period selection is implicit — derived from the
 * picked rosters via `deriveSessionTargetsFromRosters`, the same helper
 * `createAssignment` uses at first-create time.
 */

import React, { useState } from 'react';
import { ClipboardList, X } from 'lucide-react';
import type { ClassRoster, QuizAssignment } from '@/types';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  deriveSessionTargetsFromRosters,
  type SessionTargets,
} from '@/utils/resolveAssignmentTargets';

interface QuizAssignmentImportSetupModalProps {
  assignment: QuizAssignment;
  rosters: ClassRoster[];
  onSave: (targets: SessionTargets) => Promise<void> | void;
  onEditAllSettings: () => void;
  onClose: () => void;
}

export const QuizAssignmentImportSetupModal: React.FC<
  QuizAssignmentImportSetupModalProps
> = ({ assignment, rosters, onSave, onEditAllSettings, onClose }) => {
  const [pickerValue, setPickerValue] =
    useState<AssignClassPickerValue>(makeEmptyPickerValue);
  const [saving, setSaving] = useState(false);

  const selectedRosters = rosters.filter((r) =>
    pickerValue.rosterIds.includes(r.id)
  );
  const canSave = selectedRosters.length > 0 && !saving;
  const noRosters = rosters.length === 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const derived = deriveSessionTargetsFromRosters(selectedRosters);
      await onSave({
        rosterIds: derived.rosterIds,
        classIds: derived.classIds,
        periodNames: derived.periodNames,
      });
      onClose();
    } catch {
      // The parent's onSave wrapper already surfaces the failure via
      // toast; we deliberately swallow here so the modal stays open
      // (saving=false, edits intact) for the user to retry. Without
      // the catch the rejection escapes into an unhandled promise
      // since the click handler uses `void handleSave()`.
    } finally {
      setSaving(false);
    }
  };

  // While Save is in flight we lock the dismissal controls (X /
  // backdrop / Skip / Edit-all). Without this guard, clicking any of
  // them mid-save would unmount the modal while `setAssignmentRosters`
  // is still pending — React then warns about state updates on an
  // unmounted component, and "Edit all settings…" would open the full
  // settings modal against pre-update assignment data.
  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (saving) return;
    if (e.target === e.currentTarget) onClose();
  };
  const handleClose = () => {
    if (saving) return;
    onClose();
  };
  const handleEditAllSettings = () => {
    if (saving) return;
    onEditAllSettings();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Set up imported assignment
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[18rem]">
                {assignment.quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1 -m-1 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {noRosters ? (
            <p className="text-sm text-slate-600 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
              You don&apos;t have any classes yet. Add a class in{' '}
              <span className="font-bold">My Classes</span> first, then come
              back to assign this quiz.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Pick the classes that should take this quiz. Students will pick
                their period after entering the join code.
              </p>
              <AssignClassPicker
                rosters={rosters}
                value={pickerValue}
                onChange={setPickerValue}
                disabled={saving}
              />
            </>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleEditAllSettings}
            disabled={saving}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit all settings…
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip for now
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void handleSave()}
              className="px-4 py-1.5 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
