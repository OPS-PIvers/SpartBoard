// Changes the classes on an in-progress Video Activity, Mini App or Guided Learning assignment.
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AccessMode, ClassRoster, PeriodAccess } from '@/types';
import { Modal } from '@/components/common/Modal';
import { ClassPickerMenu } from '@/components/common/library/assignStepper/ClassPickerMenu';
import type { AssignClassesValue } from '@/components/common/library/assignStepper/assignClassesValue';
import {
  planAssignmentClassEdit,
  type AssignmentClassEdit,
} from '@/utils/assignmentClassEdit';
import { tourAttr } from '@/config/tourAnchors';

export const EDIT_CLASSES_LABEL = 'Edit classes';

interface AssignmentClassesModalProps {
  rosters: ClassRoster[];
  assignment: {
    rosterIds?: string[];
    periodAccess?: Record<string, PeriodAccess>;
    accessMode?: AccessMode;
  };
  onClose: () => void;
  /** Saves the edit; a rejection keeps the dialog open (the caller toasts). */
  onSave: (edit: AssignmentClassEdit) => Promise<void>;
}

export const AssignmentClassesModal: React.FC<AssignmentClassesModalProps> = ({
  rosters,
  assignment,
  onClose,
  onSave,
}) => {
  const initial = (assignment.rosterIds ?? []).filter((id) =>
    rosters.some((r) => r.id === id)
  );
  const [classes, setClasses] = useState<AssignClassesValue>({
    classIds: initial,
    studentsByClass: {},
  });
  const [saving, setSaving] = useState(false);
  const unchanged =
    classes.classIds.length === initial.length &&
    classes.classIds.every((id) => initial.includes(id));
  // No classes would open the assignment to anyone with the link; no rosters means they haven't loaded.
  const blocked = classes.classIds.length === 0 || rosters.length === 0;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(
        planAssignmentClassEdit({
          rosters,
          rosterIds: classes.classIds,
          previousRosterIds: assignment.rosterIds,
          periodAccess: assignment.periodAccess,
          accessMode: assignment.accessMode,
        })
      );
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex justify-center gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        {...tourAttr('assignment-classes.cancel')}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || unchanged || blocked}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-60"
        {...tourAttr('assignment-classes.save')}
      >
        {saving && (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        )}
        Save
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={saving ? () => undefined : onClose}
      title={EDIT_CLASSES_LABEL}
      maxWidth="max-w-md"
      contentClassName="px-5 pt-3 pb-1"
      footer={footer}
      footerClassName="px-5 pb-5 pt-3"
      captureEscape
    >
      <ClassPickerMenu
        rosters={rosters}
        value={classes}
        onChange={setClasses}
        disabled={saving}
        menuInFlow
      />
    </Modal>
  );
};
