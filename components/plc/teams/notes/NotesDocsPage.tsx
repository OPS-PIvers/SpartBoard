// Notes & Docs team page (TEAMS_REDESIGN T11 to T15): meeting notes from the team template, docs, old meeting records.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, StickyNote, Trash2 } from 'lucide-react';
import type { PlcDoc, PlcNote } from '@/types';
import { getPlcGroupType } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { usePlcMeetings } from '@/hooks/usePlcMeetings';
import { usePlcAssessments } from '@/hooks/usePlcAssessments';
import { usePlcAggregate } from '@/hooks/usePlcAggregate';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { usePlcNoteCollabSettings } from '@/hooks/usePlcNoteCollabSettings';
import { usePlcNoteGoogleDoc } from '@/hooks/usePlcNoteGoogleDoc';
import { usePlcSoftDelete } from '@/hooks/usePlcTrash';
import {
  useMeetingRecorder,
  type UseMeetingRecorderResult,
} from '@/hooks/useMeetingRecorder';
import { usePlcRecordings } from '@/hooks/usePlcRecordings';
import { canEditPlcContent, getPlcMembers } from '@/utils/plc';
import { logError } from '@/utils/logError';
import {
  buildMeetingNoteFromTemplate,
  latestAssessmentWithResults,
} from '@/utils/meetingNoteBuild';
import { ensureMeetingNote } from '@/utils/plcNoteWrites';
import {
  livePlcRecordingForNote,
  plcRecordingsForNote,
} from '@/utils/plcRecording';
import {
  convertToEmbedUrl,
  ensureProtocol,
  withGoogleDocsToolbar,
} from '@/utils/urlHelpers';
import { PlcAddDocModal } from '@/components/plc/docs/PlcAddDocModal';
import { PlcMeetingRecordView } from '@/components/plc/meeting/PlcMeetingRecordView';
import { NoteRecordControl } from '@/components/plc/recording/NoteRecordControl';
import { NoteRecordings } from '@/components/plc/recording/NoteRecordings';
import { RecordingMeetingNotes } from '@/components/plc/notes/meetingNotes/RecordingMeetingNotes';
import { IconButton } from '@/components/common/IconButton';
import { META } from '@/components/plc/redesignMockup/ui';
import { NotesDocsView, type NotesListEntry } from './NotesDocsView';
import { NoteEditorPane } from './NoteEditorPane';
import { TeamTemplateEditor } from './TeamTemplateEditor';
import { useTeamMeetingTemplate } from './useTeamNotes';
import { selectNextMeeting } from './nextMeeting';
import { meetingNoteTitle } from './meetingNoteTitle';
import { formatShortDate, isSameDay } from './noteFormat';
import { openTeamPage, takePendingNotesItem } from './teamNotesNavigation';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import type { TeamPageProps } from '@/components/plc/teams/types';

type Selection =
  | { kind: 'note'; id: string }
  | { kind: 'doc'; id: string }
  | { kind: 'record'; id: string };

export default function NotesDocsPage(props: TeamPageProps) {
  const { canAccessFeature } = useAuth();
  if (!canAccessFeature('teams-redesign')) return null;
  return canAccessFeature('plc-meeting-recording') ? (
    <NotesDocsWithRecorder {...props} />
  ) : (
    <NotesDocsInner {...props} recorder={null} />
  );
}

// The recorder lives above the open note so switching notes never stops a recording.
const NotesDocsWithRecorder: React.FC<TeamPageProps> = (props) => {
  const recorder = useMeetingRecorder();
  return <NotesDocsInner {...props} recorder={recorder} />;
};

const DocPane: React.FC<{
  doc: PlcDoc;
  canEdit: boolean;
  toolbar: boolean;
  onRemove: () => void;
}> = ({ doc, canEdit, toolbar, onRemove }) => {
  const { t } = useTranslation();
  const url = convertToEmbedUrl(ensureProtocol(doc.url));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-8 pb-3 pt-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-extrabold text-slate-800">
            {doc.title}
          </h2>
          <p className={`${META} mt-1`}>
            {t('teams.notes.docMeta', {
              defaultValue: 'Google Doc · updated {{date}} by {{name}}',
              date: formatShortDate(doc.updatedAt),
              name: doc.createdByName,
            })}
          </p>
        </div>
        <a
          href={ensureProtocol(doc.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-xxs font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-300"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {t('plcDashboard.notes.googleDoc.open', {
            defaultValue: 'Open in Docs',
          })}
        </a>
        {canEdit && (
          <IconButton
            icon={<Trash2 className="h-4 w-4" />}
            label={t('plcDashboard.docs.remove', {
              defaultValue: 'Remove doc',
            })}
            size="sm"
            onClick={onRemove}
          />
        )}
      </div>
      <iframe
        key={doc.id}
        src={toolbar ? withGoogleDocsToolbar(url) : url}
        title={doc.title}
        className="min-h-[480px] w-full flex-1 border-0 border-t border-slate-200"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
        allow="clipboard-write"
      />
    </div>
  );
};

const NotesDocsInner: React.FC<
  TeamPageProps & { recorder: UseMeetingRecorderResult | null }
> = ({ plc, isLead, recorder }) => {
  const { t } = useTranslation();
  const { user, canAccessFeature } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const uid = user?.uid ?? '';
  const canEdit = !!uid && canEditPlcContent(plc, uid);
  const groupType = getPlcGroupType(plc);
  const members = useMemo(() => getPlcMembers(plc), [plc]);

  const { notes, loading, createNote, updateNote, deleteNote, restoreNote } =
    usePlcNotes(plc.id);
  const { docs, deleteDoc, restoreDoc } = usePlcDocs(plc.id);
  const { meetings } = usePlcMeetings(plc.id);
  const showData = groupType === 'plc';
  const { assessments } = usePlcAssessments(showData ? plc.id : null);
  const { aggregates } = usePlcAggregate(showData ? plc.id : null);
  const { list: targetList } = usePlcLearningTargets(showData ? plc.id : null);
  const template = useTeamMeetingTemplate(plc);
  const collabSettings = usePlcNoteCollabSettings();
  const noteGoogleDoc = usePlcNoteGoogleDoc(plc);
  const { softDelete } = usePlcSoftDelete(plc.id);
  const { recordings, deleteAudio } = usePlcRecordings(
    recorder ? plc.id : null
  );
  const [recorderNoteId, setRecorderNoteId] = useState<string | null>(null);

  const { docId: routeDocId, meetingId: routeMeetingId } = useTeamNav();
  const [selection, setSelection] = useState<Selection | null>(
    () =>
      takePendingNotesItem(plc.id) ??
      (routeDocId
        ? { kind: 'doc', id: routeDocId }
        : routeMeetingId
          ? { kind: 'record', id: routeMeetingId }
          : null)
  );
  const [creating, setCreating] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [now] = useState(() => Date.now());

  const records = useMemo(
    () =>
      meetings
        .filter((m) => m.status === 'completed')
        .sort((a, b) => b.heldAt - a.heldAt),
    [meetings]
  );

  const sorted = useMemo(() => {
    type Entry =
      | { kind: 'note'; at: number; note: PlcNote }
      | { kind: 'doc'; at: number; doc: PlcDoc };
    const list: Entry[] = [
      ...notes.map(
        (note): Entry => ({
          kind: 'note',
          at: note.meetingAt ?? note.lastEditedAt,
          note,
        })
      ),
      ...docs.map((doc): Entry => ({ kind: 'doc', at: doc.updatedAt, doc })),
    ];
    return list.sort((a, b) => b.at - a.at);
  }, [notes, docs]);

  // Open the newest note once the list loads.
  if (!selection && !loading && sorted.length > 0) {
    const first = sorted[0];
    setSelection(
      first.kind === 'note'
        ? { kind: 'note', id: first.note.id }
        : { kind: 'doc', id: first.doc.id }
    );
  }

  const selectedNote =
    selection?.kind === 'note'
      ? (notes.find((n) => n.id === selection.id) ?? null)
      : null;
  const selectedDoc =
    selection?.kind === 'doc'
      ? (docs.find((d) => d.id === selection.id) ?? null)
      : null;

  const untitled = t('plcDashboard.notes.untitled', {
    defaultValue: 'Untitled',
  });
  const entries: NotesListEntry[] = sorted.map((entry) =>
    entry.kind === 'note'
      ? {
          key: entry.note.id,
          title: entry.note.title || untitled,
          meta:
            entry.note.meetingAt != null && isSameDay(entry.note.meetingAt, now)
              ? t('teams.notes.today', { defaultValue: 'Today' })
              : formatShortDate(entry.at),
          active: selectedNote?.id === entry.note.id,
          onSelect: () => setSelection({ kind: 'note', id: entry.note.id }),
        }
      : {
          key: `doc-${entry.doc.id}`,
          title: entry.doc.title,
          meta: t('teams.notes.docRow', {
            defaultValue: 'Doc · {{date}}',
            date: formatShortDate(entry.doc.updatedAt),
          }),
          active: selectedDoc?.id === entry.doc.id,
          icon: true,
          onSelect: () => setSelection({ kind: 'doc', id: entry.doc.id }),
        }
  );
  const recordEntries: NotesListEntry[] = records.map((m) => ({
    key: `record-${m.id}`,
    title: t('teams.notes.record', {
      defaultValue: 'Meeting record {{date}}',
      date: formatShortDate(m.heldAt),
    }),
    meta: t('teams.notes.readOnly', { defaultValue: 'Read-only' }),
    active: selection?.kind === 'record' && selection.id === m.id,
    icon: true,
    onSelect: () => setSelection({ kind: 'record', id: m.id }),
  }));

  const handleNewMeetingNote = async () => {
    if (!canEdit || creating) return;
    setCreating(true);
    try {
      const next = selectNextMeeting(plc, notes, Date.now());
      if (next?.kind === 'note' && isSameDay(next.meetingAt, Date.now())) {
        setSelection({ kind: 'note', id: next.note.id });
        return;
      }
      const draft = buildMeetingNoteFromTemplate(template.parsed, {
        uid,
        now: Date.now(),
        latestAssessmentId: latestAssessmentWithResults(
          aggregates,
          assessments
        ),
      });
      if (next?.kind === 'planned' && isSameDay(next.meetingAt, Date.now())) {
        await ensureMeetingNote(plc.id, uid, {
          id: next.noteId,
          title: meetingNoteTitle(t, groupType, next.meetingAt),
          body: draft.body,
          blocks: draft.blocks,
          meetingAt: next.meetingAt,
        });
        setSelection({ kind: 'note', id: next.noteId });
        return;
      }
      const meetingAt = Date.now();
      const id = await createNote({
        title: meetingNoteTitle(t, groupType, meetingAt),
        body: draft.body,
        kind: 'meeting',
        blocks: draft.blocks,
        meetingAt,
        actionItems: [],
      });
      setSelection({ kind: 'note', id });
    } catch (err) {
      logError('NotesDocsPage.newMeetingNote', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.notes.createFailed', {
          defaultValue: "Couldn't create that note. Please try again.",
        }),
        'error'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleBlankNote = async () => {
    try {
      const id = await createNote({ title: '', body: '', kind: 'freeform' });
      setSelection({ kind: 'note', id });
    } catch (err) {
      logError('NotesDocsPage.blankNote', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.notes.createFailed', {
          defaultValue: "Couldn't create that note. Please try again.",
        }),
        'error'
      );
    }
  };

  const handleDeleteNote = async (note: PlcNote) => {
    const ok = await showConfirm(
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
    if (!ok) return;
    try {
      const base = note.version;
      await softDelete({
        type: 'note',
        id: note.id,
        title: note.title,
        runDelete: () => deleteNote(note.id, base),
        runRestore: () =>
          restoreNote(note.id, base === undefined ? undefined : base + 1),
      });
      setSelection(null);
    } catch (err) {
      logError('NotesDocsPage.deleteNote', err, { plcId: plc.id });
    }
  };

  const handleRemoveDoc = async (doc: PlcDoc) => {
    try {
      await softDelete({
        type: 'doc',
        id: doc.id,
        title: doc.title,
        runDelete: () => deleteDoc(doc.id),
        runRestore: () => restoreDoc(doc.id),
      });
      setSelection(null);
    } catch (err) {
      logError('NotesDocsPage.removeDoc', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.docs.deleteFailed', {
          defaultValue: "Couldn't remove that doc. Please try again.",
        }),
        'error'
      );
    }
  };

  const handleOpenInDocs = async (
    note: PlcNote,
    content: Parameters<typeof noteGoogleDoc.getOrCreateDocUrl>[1]
  ) => {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await noteGoogleDoc.getOrCreateDocUrl(note, content);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      tab?.close();
      logError('NotesDocsPage.openInDocs', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.notes.googleDoc.failed', {
          defaultValue: "Couldn't open the Google Doc. Please try again.",
        }),
        'error'
      );
    }
  };

  const newMenu = [
    {
      key: 'blank',
      label: t('plcDashboard.notes.newMenu.note', {
        defaultValue: 'Blank note',
      }),
      run: () => void handleBlankNote(),
    },
    {
      key: 'doc',
      label: t('plcDashboard.notes.newMenu.googleDoc', {
        defaultValue: 'Link a Google Doc',
      }),
      run: () => setAddDocOpen(true),
    },
    ...(isLead
      ? [
          {
            key: 'template',
            label: t('teams.notes.template', {
              defaultValue: 'Meeting-note template',
            }),
            run: () => setTemplateOpen(true),
          },
        ]
      : []),
  ];

  const targets = targetList?.targets ?? [];
  const aiNotesEnabled = canAccessFeature('plc-meeting-ai-notes');

  let article: React.ReactNode;
  if (loading) {
    article = (
      <div className="flex flex-1 items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  } else if (selection?.kind === 'record') {
    article = <PlcMeetingRecordView plc={plc} meetingId={selection.id} />;
  } else if (selectedDoc) {
    article = (
      <DocPane
        doc={selectedDoc}
        canEdit={canEdit}
        toolbar={canAccessFeature('plc-docs-toolbar')}
        onRemove={() => void handleRemoveDoc(selectedDoc)}
      />
    );
  } else if (selectedNote) {
    const noteRecordings = recorder
      ? plcRecordingsForNote(recordings, selectedNote.id)
      : [];
    article = (
      <NoteEditorPane
        key={selectedNote.id}
        plc={plc}
        note={selectedNote}
        uid={uid}
        canEdit={canEdit}
        collab={collabSettings.enabled && canEdit}
        richEditor={canAccessFeature('plc-notes-rich-editor')}
        members={members}
        template={template.sections}
        assessments={assessments}
        aggregates={aggregates}
        targets={targets}
        updateNote={updateNote}
        onDelete={() => void handleDeleteNote(selectedNote)}
        onOpenInDocs={
          canAccessFeature('plc-notes-unified')
            ? (content) => void handleOpenInDocs(selectedNote, content)
            : undefined
        }
        onOpenData={
          showData ? () => openTeamPage(plc.id, 'dataOverview') : undefined
        }
        recordControl={
          recorder
            ? (markMeeting) => (
                <NoteRecordControl
                  recorder={recorder}
                  recorderNoteId={recorderNoteId}
                  noteId={selectedNote.id}
                  live={livePlcRecordingForNote(
                    noteRecordings,
                    selectedNote.id
                  )}
                  members={members}
                  canRecord={canEdit}
                  onStart={() => {
                    if (!user) return;
                    setRecorderNoteId(selectedNote.id);
                    markMeeting();
                    void recorder.start({
                      plcId: plc.id,
                      noteId: selectedNote.id,
                      recorderUid: user.uid,
                    });
                  }}
                />
              )
            : undefined
        }
        recordings={
          recorder
            ? (onApply, editable, title) => (
                <NoteRecordings
                  plcId={plc.id}
                  noteTitle={title}
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
                      canEdit={editable}
                      aiEnabled={aiNotesEnabled}
                      onApply={onApply}
                    />
                  )}
                />
              )
            : undefined
        }
      />
    );
  } else {
    article = (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <StickyNote
          className="mb-3 h-10 w-10 text-slate-300"
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-slate-700">
          {canEdit
            ? t('plcDashboard.notes.pickOrCreate', {
                defaultValue: 'Select a note to edit, or create a new one.',
              })
            : t('plcDashboard.notes.pickToRead', {
                defaultValue: 'Select a note to read.',
              })}
        </p>
      </div>
    );
  }

  return (
    <>
      <NotesDocsView
        entries={entries}
        records={recordEntries}
        canEdit={canEdit}
        creating={creating}
        onNewMeetingNote={() => void handleNewMeetingNote()}
        newMenu={newMenu}
        emptyList={
          !loading && (
            <p className="px-3 py-6 text-center text-xs font-semibold text-slate-500">
              {t('plcDashboard.notes.emptyTitle', {
                defaultValue: 'No notes yet',
              })}
            </p>
          )
        }
      >
        {article}
      </NotesDocsView>
      {addDocOpen && (
        <PlcAddDocModal
          plc={plc}
          onClose={() => setAddDocOpen(false)}
          onCreated={(id) => {
            setAddDocOpen(false);
            setSelection({ kind: 'doc', id });
          }}
        />
      )}
      {templateOpen && (
        <TeamTemplateEditor
          plc={plc}
          current={template}
          onClose={() => setTemplateOpen(false)}
        />
      )}
    </>
  );
};
