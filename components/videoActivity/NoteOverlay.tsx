// A note stop over the paused video: text only, then Continue (docs/plans/IMPORT.md D32).
import React from 'react';
import { StickyNote } from 'lucide-react';
import type { VideoActivityNote } from '@/types';
import { StopPicture } from './StopPicture';

export const NoteOverlay: React.FC<{
  note: VideoActivityNote;
  onContinue: () => void;
}> = ({ note, onContinue }) => (
  <div
    role="dialog"
    aria-label="Note"
    className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4"
  >
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700">
      <StickyNote className="w-4 h-4" aria-hidden />
      Note
    </div>
    <p className="text-base sm:text-lg text-slate-800 whitespace-pre-wrap wrap-break-word">
      {note.text}
    </p>
    <StopPicture fileId={note.imageDriveFileId} className="max-h-72" />
    {/* no-tour-anchor: student-facing note stop, not a teacher control */}
    <button
      type="button"
      autoFocus
      onClick={onContinue}
      className="self-end px-6 py-2.5 bg-brand-blue-primary text-white font-bold rounded-xl active:scale-95 transition-transform focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
    >
      Continue
    </button>
  </div>
);
