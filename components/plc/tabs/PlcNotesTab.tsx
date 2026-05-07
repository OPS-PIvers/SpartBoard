import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, StickyNote, Trash2 } from 'lucide-react';
import { Plc, PlcNote } from '@/types';
import { useDialog } from '@/context/useDialog';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { logError } from '@/utils/logError';

interface PlcNotesTabProps {
  plc: Plc;
}

const SAVE_DEBOUNCE_MS = 500;

function formatDate(ms: number): string {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Two-pane shared notebook for the PLC. Left rail lists notes ordered by
 * `lastEditedAt desc`; right pane edits the selected note's title + body.
 *
 * Editor writes are debounced (~500ms) and last-write-wins per field —
 * matches the rest of the app's collaborative model. The hook stamps
 * `lastEditedBy` to the current user on every write.
 */
export const PlcNotesTab: React.FC<PlcNotesTabProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { notes, loading, createNote, updateNote, deleteNote } = usePlcNotes(
    plc.id
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates patches from rapid edits across fields so a same-window
  // title→body sequence doesn't drop the title patch. Reset on flush /
  // cancel.
  const pendingPatchRef = useRef<{ title?: string; body?: string }>({});
  const pendingNoteIdRef = useRef<string | null>(null);
  // State mirror of `pendingNoteIdRef` for render-time consumption. Refs
  // can't be read during render (react-hooks/refs lint rule), but the
  // remote-edit re-sync below needs to know if the active note has unsaved
  // local edits — otherwise a teammate's snapshot would clobber the user's
  // in-flight typing.
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  // Auto-select the most-recent note once data lands. Same "adjust state
  // during render" pattern used elsewhere in the repo.
  const [seededFromList, setSeededFromList] = useState(false);
  if (!seededFromList && !loading && notes.length > 0 && selectedId === null) {
    setSeededFromList(true);
    const first = notes[0];
    if (first) {
      setSelectedId(first.id);
      setDraftTitle(first.title);
      setDraftBody(first.body);
    }
  }

  const selectedNote = useMemo<PlcNote | null>(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  // When the selection changes (different note picked OR teammate edited
  // the active one), seed the draft fields from the canonical note.
  // `lastSyncedAt` keeps the same note's remote updates from clobbering
  // the user's in-flight typing — once they start editing locally, only
  // a fresher remote `lastEditedAt` re-syncs.
  const [syncedSnapshot, setSyncedSnapshot] = useState<{
    id: string;
    lastEditedAt: number;
  } | null>(null);
  if (selectedNote && selectedNote.id !== syncedSnapshot?.id) {
    setSyncedSnapshot({
      id: selectedNote.id,
      lastEditedAt: selectedNote.lastEditedAt,
    });
    setDraftTitle(selectedNote.title);
    setDraftBody(selectedNote.body);
  } else if (
    selectedNote &&
    syncedSnapshot &&
    selectedNote.lastEditedAt > syncedSnapshot.lastEditedAt &&
    pendingNoteId !== selectedNote.id
  ) {
    // Remote edit landed on the active note AND we have no unsaved local
    // edits for it — accept the remote update. When `pendingNoteId` matches
    // the selection, the user is mid-typing; their drafts win until the
    // debounce flushes (at which point `lastEditedAt` will catch up and
    // this branch becomes a no-op).
    setSyncedSnapshot({
      id: selectedNote.id,
      lastEditedAt: selectedNote.lastEditedAt,
    });
    setDraftTitle(selectedNote.title);
    setDraftBody(selectedNote.body);
  }

  // Stable across renders so the unmount cleanup effect can depend on it
  // without re-running each render. Re-binds only when `updateNote` or
  // `plc.id` changes — both effectively constant for the component's
  // lifetime, since `PlcDashboard` unmounts on PLC switch.
  const flushPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const id = pendingNoteIdRef.current;
    const toSave = pendingPatchRef.current;
    pendingPatchRef.current = {};
    pendingNoteIdRef.current = null;
    setPendingNoteId(null);
    if (!id || (toSave.title === undefined && toSave.body === undefined)) {
      return;
    }
    void updateNote(id, toSave).catch((err: unknown) => {
      logError('PlcNotesTab.updateNote', err, { plcId: plc.id, noteId: id });
    });
  }, [updateNote, plc.id]);

  const cancelPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingPatchRef.current = {};
    pendingNoteIdRef.current = null;
    setPendingNoteId(null);
  }, []);

  // Flush pending debounced writes on unmount so a fast tab close doesn't
  // drop the user's last edit.
  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const scheduleSave = useCallback(
    (id: string, patch: { title?: string; body?: string }) => {
      // If a write is queued for a different note, flush it first so we
      // don't merge title/body across notes.
      if (pendingNoteIdRef.current && pendingNoteIdRef.current !== id) {
        flushPendingSave();
      }
      pendingNoteIdRef.current = id;
      setPendingNoteId(id);
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        flushPendingSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushPendingSave]
  );

  const handleCreate = async () => {
    try {
      const id = await createNote({ title: '', body: '' });
      setSelectedId(id);
      setDraftTitle('');
      setDraftBody('');
    } catch (err) {
      logError('PlcNotesTab.createNote', err, { plcId: plc.id });
    }
  };

  const handleDelete = async (note: PlcNote) => {
    const confirmed = await showConfirm(
      t('plcDashboard.notes.confirmDelete', {
        defaultValue: 'Delete this note? This cannot be undone.',
      }),
      {
        title: t('plcDashboard.notes.confirmDeleteTitle', {
          defaultValue: 'Delete note',
        }),
        variant: 'danger',
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
      }
    );
    if (!confirmed) return;
    // Drop any queued write — the doc is being deleted, no point flushing
    // (and the rule on `notes/{id}` would reject a write to a missing doc).
    if (pendingNoteIdRef.current === note.id) {
      cancelPendingSave();
    }
    try {
      await deleteNote(note.id);
      if (selectedId === note.id) {
        setSelectedId(null);
        setDraftTitle('');
        setDraftBody('');
      }
    } catch (err) {
      logError('PlcNotesTab.deleteNote', err, {
        plcId: plc.id,
        noteId: note.id,
      });
    }
  };

  const handleSelect = (id: string) => {
    // Flush any queued write for the previously-selected note so switching
    // notes mid-debounce doesn't drop the user's last edit.
    flushPendingSave();
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setSelectedId(id);
    setDraftTitle(note.title);
    setDraftBody(note.body);
    setSyncedSnapshot({ id, lastEditedAt: note.lastEditedAt });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-full min-h-[400px]">
      {/* Notes list */}
      <aside className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
          <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
            {t('plcDashboard.notes.heading', { defaultValue: 'Notes' })}
          </h3>
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-1 px-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-md transition-colors"
          >
            <Plus className="w-3 h-3" />
            {t('plcDashboard.notes.newNote', { defaultValue: 'New' })}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-xs text-slate-500 py-10 px-4">
              <StickyNote className="w-7 h-7 text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">
                {t('plcDashboard.notes.emptyTitle', {
                  defaultValue: 'No notes yet',
                })}
              </p>
              <p className="text-xxs text-slate-400 mt-1">
                {t('plcDashboard.notes.emptySubtitle', {
                  defaultValue: 'Create the first one to get started.',
                })}
              </p>
            </div>
          ) : (
            <ul>
              {notes.map((note) => {
                const isActive = selectedId === note.id;
                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(note.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors ${
                        isActive
                          ? 'bg-brand-blue-lighter/50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {note.title || (
                          <span className="italic text-slate-400">
                            {t('plcDashboard.notes.untitled', {
                              defaultValue: 'Untitled',
                            })}
                          </span>
                        )}
                      </div>
                      <div className="text-xxs text-slate-500 truncate mt-0.5">
                        {note.body
                          ? note.body.slice(0, 60)
                          : t('plcDashboard.notes.empty', {
                              defaultValue: 'Empty note',
                            })}
                      </div>
                      <div className="text-xxs text-slate-400 mt-1">
                        {formatDate(note.lastEditedAt)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Editor */}
      <main className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
        {selectedNote ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => {
                  setDraftTitle(e.target.value);
                  scheduleSave(selectedNote.id, { title: e.target.value });
                }}
                placeholder={t('plcDashboard.notes.titlePlaceholder', {
                  defaultValue: 'Note title',
                })}
                className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-base font-bold text-slate-900 placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => void handleDelete(selectedNote)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label={t('plcDashboard.notes.deleteNote', {
                  defaultValue: 'Delete note',
                })}
                title={t('plcDashboard.notes.deleteNote', {
                  defaultValue: 'Delete note',
                })}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea
              value={draftBody}
              onChange={(e) => {
                setDraftBody(e.target.value);
                scheduleSave(selectedNote.id, { body: e.target.value });
              }}
              placeholder={t('plcDashboard.notes.bodyPlaceholder', {
                defaultValue: 'Write your notes…',
              })}
              className="flex-1 w-full p-4 bg-transparent border-0 resize-none focus:ring-0 focus:outline-none text-sm text-slate-700 leading-relaxed"
            />
            <div className="px-4 py-2 border-t border-slate-100 text-xxs text-slate-400">
              {t('plcDashboard.notes.lastEdited', {
                defaultValue: 'Last edited {{when}}',
                when: formatDate(selectedNote.lastEditedAt),
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 p-8">
            <StickyNote className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-700 mb-1">
              {t('plcDashboard.notes.pickOrCreate', {
                defaultValue: 'Select a note to edit, or create a new one.',
              })}
            </p>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('plcDashboard.notes.newNote', { defaultValue: 'New note' })}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
