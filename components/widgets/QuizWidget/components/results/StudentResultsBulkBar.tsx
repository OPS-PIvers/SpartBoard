import React, { useState } from 'react';
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Printer,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';
import type { QuizResponse, QuizScoreVisibility, Toast } from '@/types';
import { getResponseDocKey } from '@/hooks/useQuizSession';
import { logError } from '@/utils/logError';
import { ShowResultsDialog } from './ShowResultsDialog';
import type {
  StudentResultsActions,
  StudentResultsSelection,
} from './studentResultsSelection';

interface StudentResultsBulkBarProps {
  /** Rows on screen; selected keys outside this list are ignored. */
  responses: QuizResponse[];
  selection: StudentResultsSelection;
  actions: StudentResultsActions;
  classVisibility: QuizScoreVisibility;
  resolveName: (response: QuizResponse) => string;
  addToast: (message: string, type?: Toast['type']) => void;
  /** Opens the results print with these students ticked; absent hides the action. */
  onPrint?: (responseKeys: string[]) => void;
  /** Downloads these students' results; absent hides the action. */
  onExport?: (responseKeys: string[]) => void;
  /** Reopens the quiz for these students; resolves true once done. */
  onReopen?: (responseKeys: string[]) => Promise<boolean>;
  /** Why Reopen is unavailable right now, shown on the disabled button. */
  reopenBlockedReason?: string | null;
}

const plural = (n: number) => `${n} student${n === 1 ? '' : 's'}`;

export const StudentResultsBulkBar: React.FC<StudentResultsBulkBarProps> = ({
  responses,
  selection,
  actions,
  classVisibility,
  resolveName,
  addToast,
  onPrint,
  onExport,
  onReopen,
  reopenBlockedReason = null,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<'hide' | 'clear' | 'reopen' | null>(null);
  const selected = responses.filter((r) =>
    selection.selectedResponseKeys.has(getResponseDocKey(r))
  );
  if (selected.length === 0) return null;

  const keys = selected.map((r) => getResponseDocKey(r) as string);
  const completedKeys = selected
    .filter((r) => r.status === 'completed')
    .map((r) => getResponseDocKey(r) as string);

  const run = async (kind: 'hide' | 'clear') => {
    setBusy(kind);
    try {
      if (kind === 'hide') {
        await actions.hide(keys);
        addToast(`Results hidden from ${plural(keys.length)}.`, 'success');
      } else {
        await actions.clear(keys);
        addToast(
          `${plural(keys.length)} now ${keys.length === 1 ? 'follows' : 'follow'} the class setting.`,
          'success'
        );
      }
      selection.clearSelection();
    } catch (err) {
      logError(`StudentResultsBulkBar.${kind}`, err);
      addToast('Could not update the selected students. Try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleShow = async (
    visibility: Exclude<QuizScoreVisibility, 'none'>,
    expiresAt: number | null
  ) => {
    try {
      const { responsesUpdated, skipped } = await actions.publish(
        completedKeys,
        visibility,
        expiresAt
      );
      const notDone = selected.length - completedKeys.length + skipped;
      addToast(
        notDone > 0
          ? `Results shown to ${plural(responsesUpdated)}. ${plural(notDone)} ${notDone === 1 ? "hasn't" : "haven't"} finished yet.`
          : `Results shown to ${plural(responsesUpdated)}.`,
        'success'
      );
      setDialogOpen(false);
      selection.clearSelection();
    } catch (err) {
      logError('StudentResultsBulkBar.publish', err);
      addToast('Could not show results. Try again.', 'error');
    }
  };

  const reopen = async () => {
    if (!onReopen) return;
    setBusy('reopen');
    try {
      if (await onReopen(completedKeys)) selection.clearSelection();
    } finally {
      setBusy(null);
    }
  };

  const copyNames = async () => {
    try {
      await navigator.clipboard.writeText(selected.map(resolveName).join('\n'));
      addToast(`Copied ${plural(selected.length)}.`, 'success');
    } catch (err) {
      logError('StudentResultsBulkBar.copyNames', err);
      addToast('Could not copy names.', 'error');
    }
  };

  const buttonCls =
    'inline-flex items-center rounded-md bg-white/15 hover:bg-white/25 font-sans font-semibold text-white disabled:opacity-50 transition-colors';
  const buttonStyle = {
    gap: 'min(4px, 1cqmin)',
    padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
    fontSize: 'min(11px, 3.5cqmin)',
  };
  const iconStyle = { width: 'min(12px, 4cqmin)', height: 'min(12px, 4cqmin)' };

  return (
    <div
      role="toolbar"
      aria-label="Selected students"
      className="sticky top-0 z-10 flex flex-wrap items-center rounded-lg bg-brand-blue-primary text-white shadow-sm"
      style={{
        gap: 'min(6px, 1.5cqmin)',
        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
      }}
    >
      <span
        className="font-sans font-bold"
        style={{ fontSize: 'min(12px, 4cqmin)' }}
      >
        {selected.length} selected
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        disabled={busy !== null || completedKeys.length === 0}
        title={
          completedKeys.length === 0
            ? 'None of the selected students have finished yet'
            : undefined
        }
        className={buttonCls}
        style={buttonStyle}
      >
        <Eye style={iconStyle} />
        Show results…
      </button>
      <button
        type="button"
        onClick={() => void run('hide')}
        disabled={busy !== null}
        className={buttonCls}
        style={buttonStyle}
      >
        {busy === 'hide' ? (
          <Loader2 className="animate-spin" style={iconStyle} />
        ) : (
          <EyeOff style={iconStyle} />
        )}
        Hide results
      </button>
      <button
        type="button"
        onClick={() => void run('clear')}
        disabled={busy !== null}
        title="Remove these students' overrides so they see what the class sees."
        className={buttonCls}
        style={buttonStyle}
      >
        {busy === 'clear' ? (
          <Loader2 className="animate-spin" style={iconStyle} />
        ) : (
          <Users style={iconStyle} />
        )}
        Follow class
      </button>
      <button
        type="button"
        onClick={() => void copyNames()}
        className={buttonCls}
        style={buttonStyle}
      >
        <Copy style={iconStyle} />
        Copy names
      </button>
      {onPrint && (
        <button
          type="button"
          onClick={() => onPrint(keys)}
          className={buttonCls}
          style={buttonStyle}
        >
          <Printer style={iconStyle} />
          Print selected
        </button>
      )}
      {onExport && (
        <button
          type="button"
          onClick={() => onExport(keys)}
          className={buttonCls}
          style={buttonStyle}
        >
          <Download style={iconStyle} />
          Export
        </button>
      )}
      {onReopen && (
        <button
          type="button"
          onClick={() => void reopen()}
          disabled={
            busy !== null ||
            reopenBlockedReason !== null ||
            completedKeys.length === 0
          }
          title={
            reopenBlockedReason ??
            (completedKeys.length === 0
              ? 'None of the selected students have submitted'
              : 'Let these students change their answers and submit again')
          }
          className={buttonCls}
          style={buttonStyle}
        >
          {busy === 'reopen' ? (
            <Loader2 className="animate-spin" style={iconStyle} />
          ) : (
            <RotateCcw style={iconStyle} />
          )}
          Reopen
        </button>
      )}
      <button
        type="button"
        onClick={selection.clearSelection}
        aria-label="Clear selection"
        className="rounded-md hover:bg-white/15 transition-colors"
        style={{ padding: 'min(4px, 1cqmin)' }}
      >
        <X style={iconStyle} />
      </button>
      {dialogOpen && (
        <ShowResultsDialog
          targetLabel={
            completedKeys.length === 1
              ? resolveName(
                  selected.find(
                    (r) => getResponseDocKey(r) === completedKeys[0]
                  ) ?? selected[0]
                )
              : plural(completedKeys.length)
          }
          initialVisibility={classVisibility}
          onClose={() => setDialogOpen(false)}
          onConfirm={handleShow}
        />
      )}
    </div>
  );
};
