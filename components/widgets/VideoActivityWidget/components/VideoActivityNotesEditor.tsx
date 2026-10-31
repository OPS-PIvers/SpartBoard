// Note stops in the video activity editor (docs/plans/IMPORT.md D32).
import React, { useState } from 'react';
import { ChevronDown, Plus, StickyNote, Trash2 } from 'lucide-react';
import type { VideoActivityNote } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { VideoActivityPictureField } from './VideoActivityPictureField';
import { useAuth } from '@/context/useAuth';
import { mmSsToSeconds, secondsToMmSs } from './useVideoActivityEditorState';

interface VideoActivityNotesEditorProps {
  notes: VideoActivityNote[];
  onChange: (next: VideoActivityNote[]) => void;
  /** Playhead of the editor's timeline, for "Add note". */
  getCurrentTime?: () => number | null;
}

const byTime = (a: VideoActivityNote, b: VideoActivityNote) =>
  a.timestamp - b.timestamp;

const NoteTimeInput: React.FC<{
  seconds: number;
  onCommit: (seconds: number) => void;
}> = ({ seconds, onCommit }) => {
  const shown = secondsToMmSs(seconds);
  const [draft, setDraft] = useState(shown);
  const [prevShown, setPrevShown] = useState(shown);
  if (shown !== prevShown) {
    setPrevShown(shown);
    setDraft(shown);
  }
  const commit = () => {
    const parsed = mmSsToSeconds(draft.trim());
    if (isNaN(parsed)) setDraft(shown);
    else onCommit(parsed);
  };
  return (
    // no-tour-anchor: per-note row field; tours stop at Add note
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      aria-label="Note time"
      className="w-16 shrink-0 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
    />
  );
};

export const VideoActivityNotesEditor: React.FC<
  VideoActivityNotesEditorProps
> = ({ notes, onChange, getCurrentTime }) => {
  const { canAccessFeature } = useAuth();
  const [open, setOpen] = useState(false);
  if (!canAccessFeature('video-activity-stops')) return null;

  const update = (id: string, patch: Partial<VideoActivityNote>) =>
    onChange(
      notes.map((n) => (n.id === id ? { ...n, ...patch } : n)).sort(byTime)
    );
  const add = () => {
    const note: VideoActivityNote = {
      id: crypto.randomUUID(),
      timestamp: getCurrentTime?.() ?? 0,
      text: '',
    };
    onChange([...notes, note].sort(byTime));
    setOpen(true);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          {...tourAttr('video-activity.editor-notes-toggle')}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-brand-blue-primary"
        >
          <StickyNote className="w-4 h-4 text-amber-600" aria-hidden />
          Notes ({notes.length})
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <button
          {...tourAttr('video-activity.editor-add-note')}
          type="button"
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-lighter/40"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Add note
        </button>
      </div>
      {open && notes.length > 0 && (
        <ul className="max-h-48 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2">
              <NoteTimeInput
                seconds={n.timestamp}
                onCommit={(timestamp) => update(n.id, { timestamp })}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {/* no-tour-anchor: per-note row field; tours stop at Add note */}
                <textarea
                  value={n.text}
                  onChange={(e) => update(n.id, { text: e.target.value })}
                  rows={2}
                  placeholder="What students read here"
                  aria-label="Note text"
                  className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 resize-y"
                />
                <VideoActivityPictureField
                  fileId={n.imageDriveFileId}
                  onRemove={() => update(n.id, { imageDriveFileId: undefined })}
                />
              </div>
              {/* no-tour-anchor: per-note row control */}
              <button
                type="button"
                onClick={() => onChange(notes.filter((x) => x.id !== n.id))}
                aria-label="Delete note"
                className="p-2 rounded-lg text-slate-400 hover:text-brand-red-primary hover:bg-brand-red-lighter/40"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
