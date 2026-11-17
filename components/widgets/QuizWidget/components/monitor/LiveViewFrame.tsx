// The Live view frame shared by the Quiz and Writing monitors: top bar, redrawn work, side panel, Notify and Nudge.
import React from 'react';
import { createPortal } from 'react-dom';
import { BellRing, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import type { QuizNudgeNoteId } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { Z_INDEX } from '@/config/zIndex';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { NUDGE_NOTE_IDS, NUDGE_NOTE_TEXT } from '@/utils/quizNudgeNotes';

export const LiveViewStat: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-semibold tabular-nums text-slate-800">
      {children}
    </dd>
  </div>
);

const navButton =
  'flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent';

/** The portal, top bar and two panes; `body` and `aside` are null while the student is gone. */
export const LiveViewFrame: React.FC<{
  name: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
  anchors: {
    previous: TourAnchorAttrs;
    next: TourAnchorAttrs;
    close: TourAnchorAttrs;
  };
  /** Shown instead of the panes when the student can no longer be watched. */
  gone: { title: string; line: string } | null;
  body: React.ReactNode;
  aside: React.ReactNode;
}> = ({ name, onPrevious, onNext, onClose, anchors, gone, body, aside }) =>
  createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live view"
      className="fixed inset-0 flex flex-col bg-slate-100"
      style={{ zIndex: Z_INDEX.modalDeep }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap bg-slate-900 px-3 text-xs text-slate-300">
        <div className="flex items-center gap-1.5 border-r border-slate-700 pr-2 font-bold text-white">
          <Eye className="h-4 w-4" aria-hidden />
          Live view
        </div>
        <span className="truncate text-sm font-semibold text-white">
          {name}
        </span>
        <div className="ml-auto flex items-center gap-1 pl-2">
          <button
            type="button"
            {...anchors.previous}
            onClick={onPrevious}
            disabled={!onPrevious}
            className={navButton}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Previous
          </button>
          <button
            type="button"
            {...anchors.next}
            onClick={onNext}
            disabled={!onNext}
            className={navButton}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            {...anchors.close}
            onClick={onClose}
            className="ml-1 flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-bold text-slate-900 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Close
          </button>
        </div>
      </div>

      {gone ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="text-base font-semibold text-slate-800">{gone.title}</p>
          <p className="text-sm text-slate-600">{gone.line}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {body}
          <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 pb-8 text-sm md:w-80 md:border-l md:border-t-0">
            {aside}
          </aside>
        </div>
      )}
    </div>,
    document.body
  );

/** Notify student when viewing, and Nudge with an optional note. */
export const LiveViewControls: React.FC<{
  /** Hidden when the admin setting always tells the student. */
  showTell: boolean;
  tell: boolean;
  onTell: (next: boolean) => void;
  /** The banner text the student sees, shown while they are told. */
  notifyText: string | null;
  canNudge: boolean;
  canNudgeNote: boolean;
  noteId: QuizNudgeNoteId | '';
  onNoteId: (id: QuizNudgeNoteId | '') => void;
  nudging: boolean;
  onNudge: () => void;
  anchors: {
    tell: TourAnchorAttrs;
    note: TourAnchorAttrs;
    nudge: TourAnchorAttrs;
  };
  children?: React.ReactNode;
}> = ({
  showTell,
  tell,
  onTell,
  notifyText,
  canNudge,
  canNudgeNote,
  noteId,
  onNoteId,
  nudging,
  onNudge,
  anchors,
  children,
}) => (
  <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
    {showTell && (
      <label className="flex items-center justify-between gap-3 font-semibold text-slate-800">
        Notify student when viewing
        <span {...anchors.tell}>
          <Toggle
            checked={tell}
            onChange={onTell}
            size="sm"
            showLabels={false}
            label="Notify student when viewing"
          />
        </span>
      </label>
    )}
    {notifyText && (
      <p className="text-xs text-slate-600">
        The student sees &quot;{notifyText}&quot;.
      </p>
    )}
    {canNudge && (
      <div className="flex items-center gap-2">
        {canNudgeNote && (
          <select
            {...anchors.note}
            aria-label="Nudge note"
            value={noteId}
            onChange={(e) => onNoteId(e.target.value as QuizNudgeNoteId | '')}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
          >
            <option value="">No note</option>
            {NUDGE_NOTE_IDS.map((id) => (
              <option key={id} value={id}>
                {NUDGE_NOTE_TEXT[id]}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          {...anchors.nudge}
          onClick={onNudge}
          disabled={nudging}
          className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-brand-blue-primary px-3 font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-60 ${canNudgeNote ? '' : 'flex-1'}`}
        >
          <BellRing className="h-4 w-4" aria-hidden />
          Nudge
        </button>
      </div>
    )}
    {children}
  </div>
);
