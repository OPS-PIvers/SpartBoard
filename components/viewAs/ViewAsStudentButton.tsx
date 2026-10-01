// "View as student" on a student row, shown only inside a teacher's View as tab (docs/plans/ADMIN_VIEW_AS.md D15).
import React, { useContext, useState } from 'react';
import { Loader2, ScanEye } from 'lucide-react';
import { useViewAs } from '@/context/useViewAs';
import { DialogContext } from '@/context/DialogContextValue';
import type { StudentPreviewKind } from '@/types/viewAs';
import { openStudentPreviewTab } from '@/utils/viewAsStudent';

interface ViewAsStudentButtonProps {
  kind: StudentPreviewKind;
  sessionId: string;
  /** The response doc id (quiz, VA, GL) or post author uid (activity wall). */
  studentKey: string | null | undefined;
  /** `dark` for rows on a dark surface. */
  tone?: 'light' | 'dark';
}

export const ViewAsStudentButton: React.FC<ViewAsStudentButtonProps> = ({
  kind,
  sessionId,
  studentKey,
  tone = 'light',
}) => {
  const viewAs = useViewAs();
  const dialog = useContext(DialogContext);
  const [busy, setBusy] = useState(false);
  if (!viewAs || !studentKey || !sessionId) return null;

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    openStudentPreviewTab({ kind, sessionId, studentKey })
      .catch((err: unknown) =>
        dialog?.showAlert(
          err instanceof Error
            ? err.message
            : 'Could not open the student view.'
        )
      )
      .finally(() => setBusy(false));
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      title="View as student"
      aria-label="View as student"
      data-testid="view-as-student"
      className={`inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-md disabled:opacity-50 ${
        tone === 'dark'
          ? 'text-slate-300 hover:text-white hover:bg-white/10'
          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
      }`}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <ScanEye size={14} />
      )}
    </button>
  );
};
