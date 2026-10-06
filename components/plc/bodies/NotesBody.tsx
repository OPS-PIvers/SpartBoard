import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  PanelLeftClose,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { Plc, PlcActionItem, PlcDoc, PlcNote, PlcRecording } from '@/types';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { usePlcNoteGoogleDoc } from '@/hooks/usePlcNoteGoogleDoc';
import { useClickOutside } from '@/hooks/useClickOutside';
import { PlcAddDocModal } from '@/components/plc/docs/PlcAddDocModal';
import {
  convertToEmbedUrl,
  ensureProtocol,
  withGoogleDocsToolbar,
} from '@/utils/urlHelpers';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { PlcNoteVersionConflictError, usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcNoteCollabSettings } from '@/hooks/usePlcNoteCollabSettings';
import { usePlcNoteCrdt } from '@/hooks/usePlcNoteCrdt';
import { noteBody, noteTitle } from '@/utils/plcNoteCrdt';
import {
  captureCaret,
  restoreCaret,
  type CapturedCaret,
} from '@/utils/plcNoteCaret';
import { usePlcSoftDelete } from '@/hooks/usePlcTrash';
import { logError } from '@/utils/logError';
import { getPlcMembers } from '@/utils/plc';
import { NotesMarkdown } from './notesMarkdown';
import { PlcNoteRichEditor } from './PlcNoteRichEditor';
import { buildMeetingNoteTemplate } from './notesTemplate';
import { PlcViewerReadOnlyBadge } from '@/components/plc/viewer/PlcViewerReadOnlyBadge';
import { NoteActionItems } from '@/components/plc/notes/NoteActionItems';
import {
  ActionItemsPanel,
  ActionItemsRail,
  NotesRail,
  PanelResizer,
} from '@/components/plc/notes/NotesSidePanels';
import { useActionPanelWidth } from '@/hooks/usePlcActionPanelWidth';
import {
  useMeetingRecorder,
  type UseMeetingRecorderResult,
} from '@/hooks/useMeetingRecorder';
import { usePlcRecordings } from '@/hooks/usePlcRecordings';
import {
  livePlcRecordingForNote,
  plcRecordingDraftPending,
  plcRecordingsForNote,
} from '@/utils/plcRecording';
import {
  applyDraftToActionItems,
  applyDraftToBody,
  type MeetingNotesApplyMode,
} from '@/utils/plcMeetingNotes';
import { NoteRecordControl } from '@/components/plc/recording/NoteRecordControl';
import { NoteRecordings } from '@/components/plc/recording/NoteRecordings';
import { RecordingMeetingNotes } from '@/components/plc/notes/meetingNotes/RecordingMeetingNotes';

interface NotesBodyProps {
  plc: Plc;
  /** Externally-driven note selection (e.g. from the rollup panel). */
  selectNoteId?: string | null;
  /** Selects this linked Google Doc once it loads. */
  selectDocId?: string | null;
  /** Side panels: replaces the Action items panel heading (the open items menu). */
  actionItemsHeading?: React.ReactNode;
}

type NotesListEntry =
  | { type: 'note'; id: string; at: number; note: PlcNote }
  | { type: 'doc'; id: string; at: number; doc: PlcDoc };

const SAVE_DEBOUNCE_MS = 500;

// Editable fields only — createdBy/createdAt never change under the editor.
function actionItemsSignature(items: PlcActionItem[]): string {
  return items
    .map((i) =>
      [
        i.id,
        i.text,
        i.done ? 1 : 0,
        i.assigneeUid ?? '',
        i.dueAt ?? '',
        i.doneAt ?? '',
      ].join(':')
    )
    .join('|');
}

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

// Notes open formatted; an empty one opens ready to type.
const openModeFor = (body: string): 'edit' | 'preview' =>
  body.trim() ? 'preview' : 'edit';

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
// The recorder lives above the editor so switching notes doesn't stop a recording.
export const NotesBody: React.FC<NotesBodyProps> = (props) => {
  const { canAccessFeature } = useAuth();
  return canAccessFeature('plc-meeting-recording') ? (
    <NotesBodyWithRecorder {...props} />
  ) : (
    <NotesBodyInner {...props} recorder={null} />
  );
};

const NotesBodyWithRecorder: React.FC<NotesBodyProps> = (props) => {
  const recorder = useMeetingRecorder();
  return <NotesBodyInner {...props} recorder={recorder} />;
};

const NotesBodyInner: React.FC<
  NotesBodyProps & { recorder: UseMeetingRecorderResult | null }
> = ({
  plc,
  selectNoteId,
  selectDocId = null,
  actionItemsHeading = null,
  recorder,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();
  const { user, canAccessFeature } = useAuth();
  const richEditorFlag = canAccessFeature('plc-notes-rich-editor');
  const unified = canAccessFeature('plc-notes-unified');
  const sidePanels = unified && canAccessFeature('plc-notes-side-panels');
  const docsToolbar = unified && canAccessFeature('plc-docs-toolbar');
  // One side panel is open at a time; opening one folds the other.
  const [openPanel, setOpenPanel] = useState<'list' | 'actions'>('list');
  const [actionPanelWidth, setActionPanelWidth] = useActionPanelWidth();
  const currentUid = user?.uid ?? '';
  // Viewers can read notes but can't create / edit / delete (Decision 3.2).
  // Rules hard-deny viewer writes; this gates the UI to match.
  const canEdit = useCanEditPlcContent();
  const { notes, loading, createNote, updateNote, deleteNote, restoreNote } =
    usePlcNotes(plc.id);
  const { softDelete } = usePlcSoftDelete(plc.id);
  const { docs, updateDoc, deleteDoc, restoreDoc } = usePlcDocs(plc.id);
  const noteGoogleDoc = usePlcNoteGoogleDoc(plc);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [appliedSelectDocId, setAppliedSelectDocId] = useState<string | null>(
    null
  );
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(newMenuRef, () => setNewMenuOpen(false));
  if (
    selectDocId != null &&
    selectDocId !== appliedSelectDocId &&
    docs.some((d) => d.id === selectDocId)
  ) {
    setAppliedSelectDocId(selectDocId);
    setSelectedDocId(selectDocId);
    setOpenPanel('actions');
  }
  const selectedDoc = unified
    ? (docs.find((d) => d.id === selectedDocId) ?? null)
    : null;
  const members = useMemo(() => getPlcMembers(plc), [plc]);
  const { recordings, deleteAudio } = usePlcRecordings(
    recorder ? plc.id : null
  );
  // The note the local recorder was started on.
  const [recorderNoteId, setRecorderNoteId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftActionItems, setDraftActionItems] = useState<PlcActionItem[]>([]);
  // Body view mode: notes open rendered; the pencil switches to the raw markdown.
  const [bodyMode, setBodyMode] = useState<'edit' | 'preview'>('preview');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates patches from rapid edits across fields so a same-window
  // title→body sequence doesn't drop the title patch. Reset on flush /
  // cancel.
  const pendingPatchRef = useRef<{
    title?: string;
    body?: string;
    actionItems?: PlcActionItem[];
    kind?: 'meeting';
  }>({});
  const pendingNoteIdRef = useRef<string | null>(null);
  // The optimistic-concurrency base (Decision 2.4) for the pending write — the
  // canonical `version` the draft was loaded from. Captured at scheduleSave time
  // so the debounced flush sends `version: expectedVersion + 1` and a teammate's
  // concurrent edit surfaces the conflict instead of being silently overwritten.
  // `undefined` => legacy un-versioned note (the save omits the precondition).
  const pendingVersionRef = useRef<number | undefined>(undefined);
  // State mirror of `pendingNoteIdRef` for render-time consumption.
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
  // The version our own last landed save produced, so the next save builds on it.
  const ownVersionRef = useRef<{ id: string; version: number } | null>(null);
  // Saves go out one at a time so a follow-up never races its predecessor's version.
  const inFlightSaveRef = useRef<Promise<void> | null>(null);

  // The content the draft last shared with canonical — set when we seed from
  // the server and again when a save lands. A draft still equal to it holds no
  // unsaved work and can absorb a teammate's edit; a diverged one must never be
  // overwritten. Keyed off content rather than `pendingNoteId`, which goes null
  // the moment a write is dispatched and so re-opened the re-seed guard while
  // the write was still in flight — that clobber deleted whatever had been
  // typed during the round-trip.
  const cleanBaselineRef = useRef<{
    title: string;
    body: string;
    actionItems: PlcActionItem[];
  }>({ title: '', body: '', actionItems: [] });

  const seedDraft = (content: {
    title: string;
    body: string;
    actionItems?: PlcActionItem[];
  }) => {
    const actionItems = content.actionItems ?? [];
    setDraftTitle(content.title);
    setDraftBody(content.body);
    setDraftActionItems(actionItems);
    cleanBaselineRef.current = {
      title: content.title,
      body: content.body,
      actionItems,
    };
  };

  const draftRef = useRef({
    title: draftTitle,
    body: draftBody,
    actionItems: draftActionItems,
  });
  // Which note the editor is actually showing when a save resolves.
  const selectedIdRef = useRef(selectedId);

  selectedIdRef.current = selectedId;

  draftRef.current = {
    title: draftTitle,
    body: draftBody,
    actionItems: draftActionItems,
  };

  const draftIsClean =
    draftTitle === cleanBaselineRef.current.title &&
    draftBody === cleanBaselineRef.current.body &&
    actionItemsSignature(draftActionItems) ===
      actionItemsSignature(cleanBaselineRef.current.actionItems);

  // Auto-select the most-recent note once data lands.
  const [seededFromList, setSeededFromList] = useState(false);
  if (!seededFromList && !loading && notes.length > 0 && selectedId === null) {
    setSeededFromList(true);
    const first = notes[0];
    if (first) {
      setSelectedId(first.id);
      seedDraft(first);
      setBodyMode(openModeFor(first.body));
    }
  }

  // External selection (e.g. clicking a note title in the rollup panel).
  const [appliedSelectNoteId, setAppliedSelectNoteId] = useState<string | null>(
    null
  );
  if (
    selectNoteId != null &&
    selectNoteId !== appliedSelectNoteId &&
    notes.some((n) => n.id === selectNoteId)
  ) {
    setAppliedSelectNoteId(selectNoteId);
    const note = notes.find((n) => n.id === selectNoteId);
    if (note) {
      setSelectedDocId(null);
      setSelectedId(note.id);
      seedDraft(note);
      setBodyMode(openModeFor(note.body));
      setOpenPanel('actions');
    }
  }

  const selectedNote = useMemo<PlcNote | null>(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  // Real-time editing rides an admin rollout switch. While it is off, every
  // path below is the original debounced-save editor, untouched. Viewers stay
  // on the legacy read-only path — they have nothing to publish.
  const collabSettings = usePlcNoteCollabSettings();
  const collab = collabSettings.enabled && canEdit && !!selectedId;
  const richEditor = richEditorFlag;

  const titleFieldRef = useRef<HTMLInputElement>(null);
  const bodyFieldRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<{
    title: CapturedCaret | null;
    body: CapturedCaret | null;
  } | null>(null);

  const crdt = usePlcNoteCrdt({
    plcId: plc.id,
    noteId: collab ? selectedId : null,
    enabled: collab,
    onBeforeRemoteApply: (yDoc) => {
      pendingCaretRef.current = {
        title: captureCaret(noteTitle(yDoc), titleFieldRef.current),
        body: captureCaret(noteBody(yDoc), bodyFieldRef.current),
      };
    },
  });

  // Restore the caret only once React has painted the incoming text: setting
  // the range before the value updates would be undone by the re-render.
  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    const yDoc = crdt.doc;
    if (!pending || !yDoc) return;
    pendingCaretRef.current = null;
    restoreCaret(noteTitle(yDoc), titleFieldRef.current, pending.title);
    restoreCaret(noteBody(yDoc), bodyFieldRef.current, pending.body);
  }, [crdt.content, crdt.doc]);

  // Browsers without field-sizing (Firefox, Safari) size the markdown box here.
  useLayoutEffect(() => {
    const el = bodyFieldRef.current;
    if (!el || globalThis.CSS?.supports?.('field-sizing', 'content')) return;
    const scroller = el.parentElement;
    const top = scroller?.scrollTop ?? 0;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (scroller) scroller.scrollTop = top;
  }, [draftBody, crdt.content.body, bodyMode, selectedId]);

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
    seedDraft(selectedNote);
  } else if (
    selectedNote &&
    syncedSnapshot &&
    selectedNote.lastEditedAt > syncedSnapshot.lastEditedAt &&
    pendingNoteId !== selectedNote.id &&
    draftIsClean
  ) {
    setSyncedSnapshot({
      id: selectedNote.id,
      lastEditedAt: selectedNote.lastEditedAt,
      version: selectedNote.version,
    });
    seedDraft(selectedNote);
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
      seedDraft(canonical);
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
    if (
      !id ||
      (toSave.title === undefined &&
        toSave.body === undefined &&
        toSave.actionItems === undefined &&
        toSave.kind === undefined)
    ) {
      return;
    }
    // Snapshot what this write carries: on success THAT becomes the clean
    // baseline, so anything typed during the round-trip still reads as dirty
    // and survives.
    const sent = draftRef.current;
    let sentVersion: number | undefined;
    const send = () => {
      const own = ownVersionRef.current;
      sentVersion =
        expectedVersion !== undefined && own?.id === id
          ? Math.max(expectedVersion, own.version)
          : expectedVersion;
      return updateNote(id, toSave, { expectedVersion: sentVersion });
    };
    const prior = inFlightSaveRef.current;
    const write = prior ? prior.then(send) : send();
    const settled = write.then(
      () => undefined,
      () => undefined
    );
    inFlightSaveRef.current = settled;
    void settled.then(() => {
      if (inFlightSaveRef.current === settled) inFlightSaveRef.current = null;
    });
    void write
      .then(() => {
        if (sentVersion !== undefined) {
          ownVersionRef.current = { id, version: sentVersion + 1 };
        }
        // Selecting another note flushes this save, then re-baselines for the
        // new note — applying a stale capture here would strand the visible
        // draft as dirty forever and silently kill auto-pull.
        if (selectedIdRef.current !== id) return;
        cleanBaselineRef.current = sent;
      })
      .catch((err: unknown) => {
        if (err instanceof PlcNoteVersionConflictError) {
          // A teammate's edit won the race. Surface the conflict toast (with a
          // reload action) — the user's unsaved text stays in the editor until
          // they choose to reload, so there is NO silent data loss.
          addToast(
            t('plcDashboard.notes.conflictMessage', {
              defaultValue:
                'A teammate edited this note while you were writing. Reload to see their changes. Your unsaved text is kept below.',
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
      patch: {
        title?: string;
        body?: string;
        actionItems?: PlcActionItem[];
        kind?: 'meeting';
      },
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

  // A linked doc's action items save after typing pauses, like a note's.
  const [docItemsDraft, setDocItemsDraft] = useState<{
    docId: string;
    items: PlcActionItem[];
  } | null>(null);
  const docItemsPendingRef = useRef<{
    docId: string;
    items: PlcActionItem[];
  } | null>(null);
  const docItemsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDocActionItems = useCallback(() => {
    if (docItemsTimerRef.current) clearTimeout(docItemsTimerRef.current);
    docItemsTimerRef.current = null;
    const pending = docItemsPendingRef.current;
    docItemsPendingRef.current = null;
    if (!pending) return;
    updateDoc(pending.docId, { actionItems: pending.items })
      .then(() =>
        setDocItemsDraft((cur) => (cur?.items === pending.items ? null : cur))
      )
      .catch((err: unknown) => {
        logError('NotesBody.docActionItems', err, {
          plcId: plc.id,
          docId: pending.docId,
        });
        addToast(
          t('plcDashboard.notes.saveFailed', {
            defaultValue: "Couldn't save your changes. Please try again.",
          }),
          'error'
        );
      });
  }, [updateDoc, plc.id, addToast, t]);
  useEffect(() => flushDocActionItems, [flushDocActionItems]);
  const handleDocActionItems = (docId: string, items: PlcActionItem[]) => {
    setDocItemsDraft({ docId, items });
    docItemsPendingRef.current = { docId, items };
    if (docItemsTimerRef.current) clearTimeout(docItemsTimerRef.current);
    docItemsTimerRef.current = setTimeout(
      flushDocActionItems,
      SAVE_DEBOUNCE_MS
    );
  };

  const handleCreate = async (kind: 'freeform' | 'meeting' = 'freeform') => {
    try {
      const body =
        kind === 'meeting'
          ? buildMeetingNoteTemplate({
              agenda: t('plcDashboard.notes.meeting.agenda', {
                defaultValue: 'Agenda',
              }),
              discussionNotes: t('plcDashboard.notes.meeting.discussionNotes', {
                defaultValue: 'Discussion Notes',
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
      setSelectedDocId(null);
      setSelectedId(id);
      seedDraft({ title, body });
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
        seedDraft({ title: '', body: '' });
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
    flushDocActionItems();
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    setOpenPanel('actions');
    setSelectedDocId(null);
    setSelectedId(id);
    seedDraft(note);
    setSyncedSnapshot({
      id,
      lastEditedAt: note.lastEditedAt,
      version: note.version,
    });
    setBodyMode(openModeFor(note.body));
  };

  const handleSelectDoc = (id: string) => {
    flushPendingSave();
    flushDocActionItems();
    setOpenPanel('actions');
    setSelectedDocId(id);
  };

  const handleDeleteDoc = async (doc: PlcDoc) => {
    try {
      await softDelete({
        type: 'doc',
        id: doc.id,
        title: doc.title,
        runDelete: () => deleteDoc(doc.id),
        runRestore: () => restoreDoc(doc.id),
      });
      if (selectedDocId === doc.id) setSelectedDocId(null);
    } catch (err) {
      logError('NotesBody.deleteDoc', err, { plcId: plc.id, docId: doc.id });
      addToast(
        t('plcDashboard.docs.deleteFailed', {
          defaultValue: "Couldn't remove that doc. Please try again.",
        }),
        'error'
      );
    }
  };

  const listEntries: NotesListEntry[] = [
    ...notes.map(
      (note): NotesListEntry => ({
        type: 'note',
        id: note.id,
        at: note.lastEditedAt,
        note,
      })
    ),
    ...(unified ? docs : []).map(
      (doc): NotesListEntry => ({
        type: 'doc',
        id: doc.id,
        at: doc.updatedAt,
        doc,
      })
    ),
  ].sort((a, b) => b.at - a.at);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const isMeeting = selectedNote?.kind === 'meeting';

  // Until the CRDT snapshot has loaded, show the canonical note rather than
  // flashing an empty editor, and hold edits until the doc can accept them.
  const collabReady = collab && crdt.status === 'ready';
  const editorTitle = collab
    ? collabReady
      ? crdt.content.title
      : (selectedNote?.title ?? '')
    : draftTitle;
  const editorBody = collab
    ? collabReady
      ? crdt.content.body
      : (selectedNote?.body ?? '')
    : draftBody;

  const editorActionItems = collab
    ? collabReady
      ? crdt.content.actionItems
      : (selectedNote?.actionItems ?? [])
    : draftActionItems;
  const editorReadOnly = !canEdit || (collab && !collabReady);

  const handleBodyChange = (next: string) => {
    if (editorReadOnly || !selectedNote) return;
    if (collab) {
      crdt.setBody(next);
      return;
    }
    setDraftBody(next);
    scheduleSave(selectedNote.id, { body: next }, syncedSnapshot?.version);
  };

  const handleStartRecording = async () => {
    if (!recorder || !selectedNote || !user || !canEdit) return;
    const note = selectedNote;
    setRecorderNoteId(note.id);
    // Recording a freeform note makes it a meeting note (MR-D4).
    if (note.kind !== 'meeting') {
      if (collab) {
        void updateNote(
          note.id,
          { kind: 'meeting' },
          { expectedVersion: note.version }
        ).catch((err: unknown) =>
          logError('NotesBody.recordingKind', err, { plcId: plc.id })
        );
      } else {
        scheduleSave(note.id, { kind: 'meeting' }, syncedSnapshot?.version);
      }
    }
    await recorder.start({
      plcId: plc.id,
      noteId: note.id,
      recorderUid: user.uid,
    });
  };

  const noteRecordings =
    recorder && selectedNote
      ? plcRecordingsForNote(recordings, selectedNote.id)
      : [];
  const aiNotesEnabled = canAccessFeature('plc-meeting-ai-notes');
  const notesWithDraft = canEdit
    ? new Set(recordings.filter(plcRecordingDraftPending).map((r) => r.noteId))
    : new Set<string>();

  const handleApplyMeetingNotes = (
    recording: PlcRecording,
    mode: MeetingNotesApplyMode,
    owners: Record<string, string | null>
  ): Promise<void> => {
    const draft = recording.draft;
    if (!draft || !selectedNote || editorReadOnly) {
      return Promise.reject(new Error('Note is not editable.'));
    }
    const body = applyDraftToBody(editorBody, draft.markdown, mode);
    const actionItems = applyDraftToActionItems(
      editorActionItems,
      draft,
      owners,
      currentUid,
      Date.now()
    );
    if (collab) {
      crdt.setBody(body);
      crdt.setActionItems(actionItems);
      return Promise.resolve();
    }
    setDraftBody(body);
    setDraftActionItems(actionItems);
    scheduleSave(
      selectedNote.id,
      { body, actionItems },
      syncedSnapshot?.version
    );
    return Promise.resolve();
  };

  const handleOpenInDocs = async (note: PlcNote) => {
    // Open the tab inside the click so the popup blocker allows it.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await noteGoogleDoc.getOrCreateDocUrl(note, {
        title: editorTitle,
        body: editorBody,
        actionItems: editorActionItems,
      });
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      tab?.close();
      logError('NotesBody.openInDocs', err, { plcId: plc.id, noteId: note.id });
      addToast(
        t('plcDashboard.notes.googleDoc.failed', {
          defaultValue: "Couldn't open the Google Doc. Please try again.",
        }),
        'error'
      );
    }
  };

  const recordControl =
    recorder && selectedNote ? (
      <NoteRecordControl
        recorder={recorder}
        recorderNoteId={recorderNoteId}
        noteId={selectedNote.id}
        live={livePlcRecordingForNote(noteRecordings, selectedNote.id)}
        members={members}
        canRecord={canEdit}
        onStart={() => void handleStartRecording()}
      />
    ) : null;

  const noteActionItemsList = selectedNote ? (
    <NoteActionItems
      items={editorActionItems}
      members={members}
      canEdit={!editorReadOnly}
      currentUid={currentUid}
      panel={sidePanels}
      onChange={(next) => {
        if (collab) {
          crdt.setActionItems(next);
          return;
        }
        setDraftActionItems(next);
        scheduleSave(
          selectedNote.id,
          { actionItems: next },
          syncedSnapshot?.version
        );
      }}
    />
  ) : null;
  const selectedDocActionItems = selectedDoc
    ? docItemsDraft?.docId === selectedDoc.id
      ? docItemsDraft.items
      : (selectedDoc.actionItems ?? [])
    : [];
  const sidePanelActionItems = selectedDoc ? (
    <NoteActionItems
      key={selectedDoc.id}
      items={selectedDocActionItems}
      members={members}
      canEdit={canEdit}
      currentUid={currentUid}
      panel
      onChange={(next) => handleDocActionItems(selectedDoc.id, next)}
    />
  ) : selectedNote ? (
    noteActionItemsList
  ) : (
    <p className="px-4 py-6 text-center text-xs text-slate-400">
      {t('plcDashboard.notes.sidePanels.pickNote', {
        defaultValue: 'Pick a note or doc.',
      })}
    </p>
  );
  const listOpen = !sidePanels || openPanel === 'list';

  const notesList = (
    <aside
      className={`flex flex-col overflow-hidden ${
        sidePanels
          ? 'w-[260px] shrink-0 border-r border-slate-200'
          : 'bg-white border border-slate-200 rounded-2xl'
      }`}
    >
      <div
        className={`flex items-center justify-between px-3 border-b gap-1 ${
          sidePanels
            ? 'h-14 shrink-0 border-slate-200'
            : 'py-2.5 border-slate-100'
        }`}
      >
        <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.notes.heading', { defaultValue: 'Notes' })}
        </h3>
        {sidePanels && (
          <button
            type="button"
            onClick={() => setOpenPanel('actions')}
            aria-label={t('plcDashboard.notes.sidePanels.showActionItems', {
              defaultValue: 'Show action items',
            })}
            title={t('plcDashboard.notes.sidePanels.showActionItems', {
              defaultValue: 'Show action items',
            })}
            className="ml-auto p-1 text-slate-400 hover:text-brand-blue-primary hover:bg-slate-100 rounded-md transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
        {canEdit && !unified && (
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
        {canEdit && unified && (
          <div ref={newMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setNewMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={newMenuOpen}
              className="inline-flex items-center gap-1 px-2 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xxs font-bold uppercase tracking-wider rounded-md transition-colors"
            >
              <Plus className="w-3 h-3" />
              {t('plcDashboard.notes.newNote', { defaultValue: 'New' })}
              <ChevronDown className="w-3 h-3" />
            </button>
            {newMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 w-48 py-1 bg-white border border-slate-200 rounded-xl shadow-lg"
              >
                {(
                  [
                    {
                      id: 'meeting',
                      icon: CalendarClock,
                      label: t('plcDashboard.notes.newMenu.meeting', {
                        defaultValue: 'Meeting note',
                      }),
                      run: () => void handleCreate('meeting'),
                    },
                    {
                      id: 'note',
                      icon: StickyNote,
                      label: t('plcDashboard.notes.newMenu.note', {
                        defaultValue: 'Blank note',
                      }),
                      run: () => void handleCreate('freeform'),
                    },
                    {
                      id: 'doc',
                      icon: FileText,
                      label: t('plcDashboard.notes.newMenu.googleDoc', {
                        defaultValue: 'Link a Google Doc',
                      }),
                      run: () => setAddDocOpen(true),
                    },
                  ] as const
                ).map(({ id, icon: Icon, label, run }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setNewMenuOpen(false);
                      run();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-2">
        {listEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center text-xs text-slate-500 py-10 px-4">
            <StickyNote className="w-7 h-7 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.notes.emptyTitle', {
                defaultValue: 'No notes yet',
              })}
            </p>
          </div>
        ) : (
          <ul>
            {listEntries.map((entry) => {
              if (entry.type === 'doc') {
                const doc = entry.doc;
                const isActive = selectedDoc?.id === doc.id;
                return (
                  <li key={`doc-${doc.id}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectDoc(doc.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors ${
                        isActive
                          ? 'bg-brand-blue-lighter/50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <FileText
                          className="w-3 h-3 text-brand-blue-primary shrink-0"
                          aria-hidden
                        />
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {doc.title}
                        </div>
                      </div>
                      <div className="text-xxs text-slate-500 truncate mt-0.5">
                        {t('plcDashboard.notes.googleDocRow', {
                          defaultValue: 'Google Doc',
                        })}
                      </div>
                      <div className="text-xxs text-slate-400 mt-1">
                        {formatDate(doc.updatedAt)}
                      </div>
                    </button>
                  </li>
                );
              }
              const note = entry.note;
              const isActive = !selectedDoc && selectedId === note.id;
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
                      {notesWithDraft.has(note.id) && (
                        <span className="ml-auto shrink-0 text-xxs font-bold text-brand-blue-primary">
                          {t('plcDashboard.notes.meetingNotes.ready', {
                            defaultValue: 'Notes ready',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="text-xxs text-slate-500 truncate mt-0.5">
                      {note.body
                        ? note.body.replace(/[#*_`>\\-]/g, '').slice(0, 60)
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
  );

  const noteOpenInDocs = selectedNote && canEdit && unified && (
    <button
      type="button"
      disabled={noteGoogleDoc.creatingNoteId === selectedNote.id}
      onClick={() => void handleOpenInDocs(selectedNote)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/40 disabled:opacity-60 rounded-lg transition-colors shrink-0`}
    >
      {noteGoogleDoc.creatingNoteId === selectedNote.id ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <ExternalLink className="w-3.5 h-3.5" />
      )}
      {noteGoogleDoc.creatingNoteId === selectedNote.id
        ? t('plcDashboard.notes.googleDoc.creating', {
            defaultValue: 'Creating doc',
          })
        : t('plcDashboard.notes.googleDoc.open', {
            defaultValue: 'Open in Docs',
          })}
    </button>
  );

  const editor = (
    <main
      className={`flex flex-col overflow-hidden ${
        sidePanels
          ? 'flex-1 min-w-0'
          : 'bg-white border border-slate-200 rounded-2xl'
      }`}
    >
      {selectedDoc ? (
        <>
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <FileText className="w-4 h-4 text-brand-blue-primary shrink-0" />
            <h3
              className={`min-w-0 truncate text-base font-bold text-slate-900 ${
                sidePanels ? '' : 'flex-1'
              }`}
            >
              {selectedDoc.title}
            </h3>
            <a
              href={ensureProtocol(selectedDoc.url)}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/40 rounded-lg transition-colors shrink-0`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('plcDashboard.notes.googleDoc.open', {
                defaultValue: 'Open in Docs',
              })}
            </a>
            {sidePanels && <span className="flex-1" />}
            {canEdit && (
              <button
                type="button"
                onClick={() => void handleDeleteDoc(selectedDoc)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                aria-label={t('plcDashboard.docs.remove', {
                  defaultValue: 'Remove doc',
                })}
                title={t('plcDashboard.docs.remove', {
                  defaultValue: 'Remove doc',
                })}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <iframe
            key={selectedDoc.id}
            src={
              docsToolbar
                ? withGoogleDocsToolbar(
                    convertToEmbedUrl(ensureProtocol(selectedDoc.url))
                  )
                : convertToEmbedUrl(ensureProtocol(selectedDoc.url))
            }
            title={selectedDoc.title}
            className="flex-1 min-h-0 w-full border-0"
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            allow="clipboard-write"
          />
        </>
      ) : selectedNote ? (
        <>
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100">
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
              ref={titleFieldRef}
              value={editorTitle}
              readOnly={editorReadOnly}
              onChange={(e) => {
                if (editorReadOnly) return;
                if (collab) {
                  crdt.setTitle(e.target.value);
                  return;
                }
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
              className={`min-w-0 bg-transparent border-0 focus:ring-0 focus:outline-none text-base font-bold text-slate-900 placeholder:text-slate-300 ${
                sidePanels ? 'p-0 max-w-full [field-sizing:content]' : 'flex-1'
              }`}
            />
            {sidePanels && noteOpenInDocs}
            {sidePanels && <span className="flex-1" />}
            {(!richEditor || !canEdit) && recordControl}
            {!richEditor && (
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
            )}
            {!sidePanels && noteOpenInDocs}
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
          {/* Body, action items and recordings scroll together as one page. */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
            {richEditor ? (
              <PlcNoteRichEditor
                key={selectedNote.id}
                value={editorBody}
                onChange={handleBodyChange}
                readOnly={editorReadOnly}
                showToolbar={canEdit}
                toolbarEnd={recordControl}
              />
            ) : bodyMode === 'edit' ? (
              <textarea
                ref={bodyFieldRef}
                value={editorBody}
                readOnly={editorReadOnly}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder={t('plcDashboard.notes.bodyPlaceholder', {
                  defaultValue: 'Write your notes… (markdown supported)',
                })}
                className="block min-h-[12rem] w-full p-4 bg-transparent border-0 resize-none [field-sizing:content] focus:ring-0 focus:outline-none text-sm text-slate-700 leading-relaxed font-mono"
              />
            ) : (
              <div className="min-h-[12rem] w-full p-4">
                {editorBody.trim() ? (
                  <NotesMarkdown body={editorBody} />
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    {t('plcDashboard.notes.emptyPreview', {
                      defaultValue: 'Nothing to preview yet.',
                    })}
                  </p>
                )}
              </div>
            )}
            {!sidePanels && noteActionItemsList}
            {recorder && (
              <NoteRecordings
                plcId={plc.id}
                noteTitle={editorTitle}
                recordings={noteRecordings}
                members={members}
                canEdit={canEdit}
                onDeleteAudio={deleteAudio}
                renderExtra={(r) => (
                  <RecordingMeetingNotes
                    plcId={plc.id}
                    recording={r}
                    label={t('plcDashboard.notes.meetingNotes.recordingN', {
                      defaultValue: 'Recording {{n}}',
                      n: noteRecordings.indexOf(r) + 1,
                    })}
                    members={members}
                    canEdit={!editorReadOnly}
                    aiEnabled={aiNotesEnabled}
                    onApply={handleApplyMeetingNotes}
                  />
                )}
              />
            )}
          </div>
          <div className="shrink-0 px-4 py-2 border-t border-slate-100 text-xxs text-slate-400">
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
  );

  const addDocModal = addDocOpen && (
    <PlcAddDocModal
      plc={plc}
      onClose={() => setAddDocOpen(false)}
      onCreated={(id) => {
        setAddDocOpen(false);
        handleSelectDoc(id);
      }}
    />
  );

  if (!sidePanels) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 h-full min-h-[400px]">
        {notesList}
        {editor}
        {addDocModal}
      </div>
    );
  }

  const openItemCount = (
    selectedDoc ? selectedDocActionItems : selectedNote ? editorActionItems : []
  ).filter((i) => !i.done).length;

  return (
    <div className="flex h-full min-h-[400px] bg-white overflow-hidden">
      {listOpen ? (
        notesList
      ) : (
        <NotesRail
          onOpen={() => setOpenPanel('list')}
          entries={listEntries.map((entry) =>
            entry.type === 'doc'
              ? {
                  key: `doc-${entry.id}`,
                  title: entry.doc.title,
                  icon: FileText,
                  active: selectedDoc?.id === entry.id,
                  onSelect: () => handleSelectDoc(entry.id),
                }
              : {
                  key: entry.id,
                  title:
                    entry.note.title ||
                    t('plcDashboard.notes.untitled', {
                      defaultValue: 'Untitled',
                    }),
                  icon:
                    entry.note.kind === 'meeting' ? CalendarClock : StickyNote,
                  active: !selectedDoc && selectedId === entry.id,
                  onSelect: () => handleSelect(entry.id),
                }
          )}
        />
      )}
      {editor}
      {listOpen ? (
        <ActionItemsRail
          count={openItemCount}
          onOpen={() => setOpenPanel('actions')}
        />
      ) : (
        <>
          <PanelResizer
            width={actionPanelWidth}
            onResize={setActionPanelWidth}
          />
          <ActionItemsPanel
            width={actionPanelWidth}
            onClose={() => setOpenPanel('list')}
            heading={actionItemsHeading}
          >
            {sidePanelActionItems}
          </ActionItemsPanel>
        </>
      )}
      {addDocModal}
    </div>
  );
};
