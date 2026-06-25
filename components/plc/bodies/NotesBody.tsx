import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  Eye,
  Loader2,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { Plc, PlcNote } from '@/types';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { PlcNoteVersionConflictError, usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcSoftDelete } from '@/hooks/usePlcTrash';
import { logError } from '@/utils/logError';
import { NotesMarkdown } from './notesMarkdown';
import { buildMeetingNoteTemplate } from './notesTemplate';
import { PlcViewerReadOnlyBadge } from '@/components/plc/viewer/PlcViewerReadOnlyBadge';

interface NotesBodyProps {
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
 * Two-pane shared notebook for the PLC — the native structured meeting-notes
 * surface (Decision 2.5/2.5b), wired live into the Notes & Docs section.
 *
 * Editor writes are debounced (~500ms) and patch-only per field. Each write
 * carries the optimistic version precondition (Decision 2.4): if a teammate's
 * edit wins the race, `updateNote` throws `PlcNoteVersionConflictError` — we
 * surface a conflict toast (with a "Reload note" action) and reload the
 * canonical note into the draft WITHOUT dropping the user's unsaved text (it
 * stays in the editor until they choose to reload).
 *
 * A `kind === 'meeting'` note renders the agenda → decisions → action-items
 * template; the body supports lightweight markdown previewed via the eye/pencil
 * toggle.
 */
export const NotesBody: React.FC<NotesBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();
  // Viewers can read notes but can't create / edit / delete (Decision 3.2).
  // Rules hard-deny viewer writes; this gates the UI to match.
  const canEdit = useCanEditPlcContent();
  const { notes, loading, createNote, updateNote, deleteNote, restoreNote } =
    usePlcNotes(plc.id);
  const { softDelete } = usePlcSoftDelete(plc.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  // Body view mode — 'edit' shows the raw markdown textarea; 'preview' renders
  // it. New selections default to edit.
  const [bodyMode, setBodyMode] = useState<'edit' | 'preview'>('edit');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates patches from rapid edits across fields so a same-window
  // title→body sequence doesn't drop the title patch. Reset on flush /
  // cancel.
  const pendingPatchRef = useRef<{ title?: string; body?: string }>({});
  const pendingNoteIdRef = useRef<string | null>(null);
  // The optimistic-concurrency base (Decision 2.4) for the pending write — the
  // canonical `version` the draft was loaded from. Captured at scheduleSave time
  // so the debounced flush sends `version: expectedVersion + 1` and a teammate's
  // concurrent edit surfaces the conflict instead of being silently overwritten.
  // `undefined` => legacy un-versioned note (the save omits the precondition).
  const pendingVersionRef = useRef<number | undefined>(undefined);
  // State mirror of `pendingNoteIdRef` for render-time consumption.
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);

  // Auto-select the most-recent note once data lands.
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
  // the active one), seed the draft fields from the canonical note. We also
  // capture the canonical `version` the draft is based on — the optimistic-
  // concurrency base (Decision 2.4) threaded into every save so a teammate's
  // concurrent edit (which bumps the canonical version) surfaces a conflict
  // instead of being silently overwritten. `version` is `undefined` for a
  // legacy un-versioned note (the save path then omits the precondition).
  const [syncedSnapshot, setSyncedSnapshot] = useState<{
    id: string;
    lastEditedAt: number;
    version: number | undefined;
  } | null>(null);
  if (selectedNote && selectedNote.id !== syncedSnapshot?.id) {
    setSyncedSnapshot({
      id: selectedNote.id,
      lastEditedAt: selectedNote.lastEditedAt,
      version: selectedNote.version,
    });
    setDraftTitle(selectedNote.title);
    setDraftBody(selectedNote.body);
  } else if (
    selectedNote &&
    syncedSnapshot &&
    selectedNote.lastEditedAt > syncedSnapshot.lastEditedAt &&
    pendingNoteId !== selectedNote.id
  ) {
    setSyncedSnapshot({
      id: selectedNote.id,
      lastEditedAt: selectedNote.lastEditedAt,
      version: selectedNote.version,
    });
    setDraftTitle(selectedNote.title);
    setDraftBody(selectedNote.body);
  }

  // Reload the canonical note into the draft, discarding the failed local
  // edit. Wired to the conflict toast's "Reload note" action so a teammate's
  // change isn't silently clobbered — and the user explicitly chooses when to
  // drop their unsaved text.
  const reloadCanonical = useCallback(
    (noteId: string) => {
      const canonical = notes.find((n) => n.id === noteId);
      if (!canonical) return;
      setSelectedId(noteId);
      setDraftTitle(canonical.title);
      setDraftBody(canonical.body);
      setSyncedSnapshot({
        id: noteId,
        lastEditedAt: canonical.lastEditedAt,
        version: canonical.version,
      });
    },
    [notes]
  );
  // Latest-ref so the stable `flushPendingSave` callback can reload the freshest
  // canonical list without re-creating itself (house rule: assign refs in
  // render, no effect — same posture as `usePlcs`/`PlcContext`).
  const reloadRef = useRef(reloadCanonical);

  reloadRef.current = reloadCanonical;

  const flushPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const id = pendingNoteIdRef.current;
    const toSave = pendingPatchRef.current;
    const expectedVersion = pendingVersionRef.current;
    pendingPatchRef.current = {};
    pendingNoteIdRef.current = null;
    pendingVersionRef.current = undefined;
    setPendingNoteId(null);
    if (!id || (toSave.title === undefined && toSave.body === undefined)) {
      return;
    }
    void updateNote(id, toSave, { expectedVersion }).catch((err: unknown) => {
      if (err instanceof PlcNoteVersionConflictError) {
        // A teammate's edit won the race. Surface the conflict toast (with a
        // reload action) — the user's unsaved text stays in the editor until
        // they choose to reload, so there is NO silent data loss.
        addToast(
          t('plcDashboard.notes.conflictMessage', {
            defaultValue:
              'A teammate edited this note while you were writing. Reload to see their changes — your unsaved text is kept below.',
          }),
          'warning',
          {
            label: t('plcDashboard.notes.conflictReload', {
              defaultValue: 'Reload note',
            }),
            onClick: () => reloadRef.current(id),
          }
        );
        return;
      }
      logError('NotesBody.updateNote', err, { plcId: plc.id, noteId: id });
    });
  }, [updateNote, plc.id, addToast, t]);

  const cancelPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingPatchRef.current = {};
    pendingNoteIdRef.current = null;
    pendingVersionRef.current = undefined;
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
    (
      id: string,
      patch: { title?: string; body?: string },
      expectedVersion: number | undefined
    ) => {
      if (pendingNoteIdRef.current && pendingNoteIdRef.current !== id) {
        flushPendingSave();
      }
      pendingNoteIdRef.current = id;
      // Capture the optimistic-concurrency base (the version the draft loaded)
      // for this note's pending write. Keep the FIRST base captured for a given
      // note across a debounce window — re-capturing on each keystroke would
      // advance it to a teammate's just-arrived version and defeat the conflict
      // guard. `flushPendingSave` resets the ref after the note id changes.
      pendingVersionRef.current ??= expectedVersion;
      setPendingNoteId(id);
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        flushPendingSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushPendingSave]
  );

  const handleCreate = async (kind: 'freeform' | 'meeting' = 'freeform') => {
    try {
      const body =
        kind === 'meeting'
          ? buildMeetingNoteTemplate({
              agenda: t('plcDashboard.notes.meeting.agenda', {
                defaultValue: 'Agenda',
              }),
              decisions: t('plcDashboard.notes.meeting.decisions', {
                defaultValue: 'Decisions',
              }),
              actionItems: t('plcDashboard.notes.meeting.actionItems', {
                defaultValue: 'Action items',
              }),
            })
          : '';
      const title =
        kind === 'meeting'
          ? t('plcDashboard.notes.meeting.label', {
              defaultValue: 'Meeting notes',
            })
          : '';
      const id = await createNote({ title, body, kind });
      setSelectedId(id);
      setDraftTitle(title);
      setDraftBody(body);
      setSyncedSnapshot(null);
      // Meeting notes open in preview so the structured template is legible at
      // a glance; freeform notes open in edit to start typing immediately.
      setBodyMode(kind === 'meeting' ? 'preview' : 'edit');
    } catch (err) {
      logError('NotesBody.createNote', err, { plcId: plc.id, kind });
      addToast(
        t('plcDashboard.notes.createFailed', {
          defaultValue: "Couldn't create that note. Please try again.",
        }),
        'error'
      );
    }
  };

  const handleDelete = async (note: PlcNote) => {
    const confirmed = await showConfirm(
      t('plcDashboard.notes.confirmDelete', {
        defaultValue: 'Move this note to Trash? You can restore it later.',
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
    if (pendingNoteIdRef.current === note.id) {
      cancelPendingSave();
    }
    try {
      // Soft-delete with undo (Decision 3.1): tombstone the note (version-aware),
      // log `item_deleted`, and pop an Undo toast that restores it. Thread the
      // note's loaded `version` so the tombstone write respects the optimistic-
      // concurrency precondition (the delete bumps the canonical version to
      // `version + 1`). The undo restore must therefore expect `version + 1` as
      // its base so its own bump (to `version + 2`) satisfies `new == old + 1`.
      // For a legacy un-versioned note (`version === undefined`) both writes omit
      // the precondition (rollout escape hatch). The tombstoned note has dropped
      // out of the live `notes` list by undo time, so we derive the base from the
      // pre-delete `note.version` rather than re-reading the filtered list.
      const baseVersion = note.version;
      await softDelete({
        type: 'note',
        id: note.id,
        title: note.title,
        runDelete: () => deleteNote(note.id, baseVersion),
        runRestore: () =>
          restoreNote(
            note.id,
            baseVersion === undefined ? undefined : baseVersion + 1
          ),
      });
      if (selectedId === note.id) {
        setSelectedId(null);
        setDraftTitle('');
        setDraftBody('');
      }
    } catch (err) {
      logError('NotesBody.deleteNote', err, {
        plcId: plc.id,
        noteId: note.id,
      });
    }
  };

  const handleSelect = (id: string) => {
    flushPendingSave();
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setSelectedId(id);
    setDraftTitle(note.title);
    setDraftBody(note.body);
    setSyncedSnapshot({
      id,
      lastEditedAt: note.lastEditedAt,
      version: note.version,
    });
    setBodyMode('edit');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const isMeeting = selectedNote?.kind === 'meeting';

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-full min-h-[400px]">
      {/* Notes list */}
      <aside className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 gap-1">
          <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
            {t('plcDashboard.notes.heading', { defaultValue: 'Notes' })}
          </h3>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleCreate('meeting')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xxs font-bold uppercase tracking-wider rounded-md transition-colors"
                title={t('plcDashboard.notes.meeting.newMeetingNote', {
                  defaultValue: 'New meeting note',
                })}
              >
                <CalendarClock className="w-3 h-3" />
                {t('plcDashboard.notes.meeting.newMeetingNoteShort', {
                  defaultValue: 'Meeting',
                })}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate('freeform')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-md transition-colors"
              >
                <Plus className="w-3 h-3" />
                {t('plcDashboard.notes.newNote', { defaultValue: 'New' })}
              </button>
            </div>
          )}
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
                      <div className="flex items-center gap-1.5">
                        {note.kind === 'meeting' && (
                          <CalendarClock
                            className="w-3 h-3 text-brand-blue-primary shrink-0"
                            aria-label={t('plcDashboard.notes.meeting.label', {
                              defaultValue: 'Meeting notes',
                            })}
                          />
                        )}
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {note.title || (
                            <span className="italic text-slate-400">
                              {t('plcDashboard.notes.untitled', {
                                defaultValue: 'Untitled',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xxs text-slate-500 truncate mt-0.5">
                        {note.body
                          ? note.body.replace(/[#*_`>-]/g, '').slice(0, 60)
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
              {isMeeting && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-blue-lighter/60 text-brand-blue-primary text-xxs font-bold uppercase tracking-wider shrink-0">
                  <CalendarClock className="w-3 h-3" />
                  {t('plcDashboard.notes.meeting.label', {
                    defaultValue: 'Meeting notes',
                  })}
                </span>
              )}
              <input
                type="text"
                value={draftTitle}
                readOnly={!canEdit}
                onChange={(e) => {
                  if (!canEdit) return;
                  setDraftTitle(e.target.value);
                  scheduleSave(
                    selectedNote.id,
                    { title: e.target.value },
                    syncedSnapshot?.version
                  );
                }}
                placeholder={t('plcDashboard.notes.titlePlaceholder', {
                  defaultValue: 'Note title',
                })}
                className="flex-1 min-w-0 bg-transparent border-0 focus:ring-0 focus:outline-none text-base font-bold text-slate-900 placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() =>
                  setBodyMode((m) => (m === 'edit' ? 'preview' : 'edit'))
                }
                className="p-2 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/40 rounded-lg transition-colors shrink-0"
                aria-label={
                  bodyMode === 'edit'
                    ? t('plcDashboard.notes.previewMarkdown', {
                        defaultValue: 'Preview formatted note',
                      })
                    : t('plcDashboard.notes.editMarkdown', {
                        defaultValue: 'Edit note',
                      })
                }
                title={
                  bodyMode === 'edit'
                    ? t('plcDashboard.notes.previewMarkdown', {
                        defaultValue: 'Preview formatted note',
                      })
                    : t('plcDashboard.notes.editMarkdown', {
                        defaultValue: 'Edit note',
                      })
                }
              >
                {bodyMode === 'edit' ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDelete(selectedNote)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  aria-label={t('plcDashboard.notes.deleteNote', {
                    defaultValue: 'Delete note',
                  })}
                  title={t('plcDashboard.notes.deleteNote', {
                    defaultValue: 'Delete note',
                  })}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {bodyMode === 'edit' ? (
              <textarea
                value={draftBody}
                readOnly={!canEdit}
                onChange={(e) => {
                  if (!canEdit) return;
                  setDraftBody(e.target.value);
                  scheduleSave(
                    selectedNote.id,
                    { body: e.target.value },
                    syncedSnapshot?.version
                  );
                }}
                placeholder={t('plcDashboard.notes.bodyPlaceholder', {
                  defaultValue: 'Write your notes… (markdown supported)',
                })}
                className="flex-1 w-full p-4 bg-transparent border-0 resize-none focus:ring-0 focus:outline-none text-sm text-slate-700 leading-relaxed font-mono"
              />
            ) : (
              <div className="flex-1 w-full p-4 overflow-y-auto custom-scrollbar">
                {draftBody.trim() ? (
                  <NotesMarkdown body={draftBody} />
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    {t('plcDashboard.notes.emptyPreview', {
                      defaultValue: 'Nothing to preview yet.',
                    })}
                  </p>
                )}
              </div>
            )}
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
              {canEdit
                ? t('plcDashboard.notes.pickOrCreate', {
                    defaultValue: 'Select a note to edit, or create a new one.',
                  })
                : t('plcDashboard.notes.pickToRead', {
                    defaultValue: 'Select a note to read.',
                  })}
            </p>
            {canEdit ? (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreate('freeform')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('plcDashboard.notes.newNote', {
                    defaultValue: 'New note',
                  })}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate('meeting')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  {t('plcDashboard.notes.meeting.newMeetingNote', {
                    defaultValue: 'New meeting note',
                  })}
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <PlcViewerReadOnlyBadge
                  note={t('plcDashboard.viewer.notesNote', {
                    defaultValue:
                      'Viewers can read notes and docs but can’t add or change them.',
                  })}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
