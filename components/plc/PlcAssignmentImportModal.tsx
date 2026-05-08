/**
 * PlcAssignmentImportModal — picker shown when a teacher clicks "Add to
 * my board" on a row in the PLC Assignments → Library sub-tab. Lets them
 * choose:
 *
 *  - Sync — imports the template's settings AND joins the canonical
 *    synced quiz group, so future edits any teammate makes to the source
 *    quiz appear on this teacher's library card with a Sync available
 *    pill. Recommended for PLC work where members want to keep their
 *    copies in lockstep.
 *
 *  - Make a copy — frozen one-time snapshot of the current settings.
 *    Future edits by other PLC members won't appear; the teacher's own
 *    edits stay private.
 *
 * Mirrors `PlcQuizImportModal.tsx` exactly (same Modal primitive, same
 * two ModeOption buttons) so the UX stays consistent across PLC entry
 * points.
 */

import React from 'react';
import { ClipboardList, Cloud, Copy, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { SharedAssignmentImportMode } from '@/hooks/useQuizAssignments';

interface PlcAssignmentImportModalProps {
  /** Title of the PLC assignment template, displayed under the modal header. */
  quizTitle: string;
  /** Optional originator name (the teacher who shared the template). */
  sharedByName?: string;
  onPick: (mode: SharedAssignmentImportMode) => void;
  onClose: () => void;
}

interface ModeOptionProps {
  mode: SharedAssignmentImportMode;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  recommended?: boolean;
  onPick: (mode: SharedAssignmentImportMode) => void;
}

const ModeOption: React.FC<ModeOptionProps> = ({
  mode,
  title,
  body,
  Icon,
  recommended,
  onPick,
}) => (
  <button
    type="button"
    onClick={() => onPick(mode)}
    className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-4 transition-all hover:border-brand-blue-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
  >
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          {recommended && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Recommended for PLCs
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">{body}</p>
      </div>
    </div>
  </button>
);

export const PlcAssignmentImportModal: React.FC<
  PlcAssignmentImportModalProps
> = ({ quizTitle, sharedByName, onPick, onClose }) => {
  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Choose how to import this assignment"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Add to my board
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {quizTitle}
                {sharedByName ? ` · shared by ${sharedByName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-3">
        <p className="text-xs text-slate-600">
          How should this assignment be imported onto your board? The new
          assignment lands paused so you can pick rosters before going live.
        </p>
        <ModeOption
          mode="sync"
          title="Synced"
          body="Stay connected to the PLC version of the source quiz. Edits any teammate publishes show up on your library card with a Sync available pill."
          Icon={Cloud}
          recommended
          onPick={onPick}
        />
        <ModeOption
          mode="copy"
          title="Make a copy"
          body="Take a frozen snapshot of the current settings. Future edits by other PLC members will not appear in your copy, and your edits stay private."
          Icon={Copy}
          onPick={onPick}
        />
      </div>
    </Modal>
  );
};
