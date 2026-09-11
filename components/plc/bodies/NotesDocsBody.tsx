import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Download, FileText, StickyNote } from 'lucide-react';
import type { Plc } from '@/types';
import { NotesBody } from './NotesBody';
import { PlcDocsBody } from '@/components/plc/docs/PlcDocsBody';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcTodos } from '@/hooks/usePlcTodos';
import { logError } from '@/utils/logError';
import {
  buildImportedTodosNote,
  countOpenActionItems,
  IMPORTED_TODOS_NOTE_TITLE,
  mergeActionItems,
  openActionItemsByNote,
} from '@/utils/plcActionItems';

interface NotesDocsBodyProps {
  plc: Plc;
}

type NotesDocsTab = 'notes' | 'docs';

/**
 * Combined "Notes & Docs" surface (Decisions 2.5, 6.5, 7.4). The native
 * structured meeting-notes editor (`NotesBody`) is now the live default; the
 * Google-Doc embed (`PlcDocsBody`) stays one tab away so teams that already
 * keep their agenda in a shared Google Doc aren't cut off.
 *
 * Also hosts the cross-note open action-items rollup and the legacy to-do
 * import banner (§7.4) — the shared to-do list merged into note action items.
 *
 * Both sub-surfaces read PLC subcollections that the Docs section already gates
 * on (`notes` + `docs` in `SLICE_SECTIONS`), so switching tabs mounts no new
 * listeners — the provider already has both slices live for this section.
 *
 * Modal chrome — normal Tailwind sizing (no container-query units).
 */
export const NotesDocsBody: React.FC<NotesDocsBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const canEdit = useCanEditPlcContent();
  const [tab, setTab] = useState<NotesDocsTab>('notes');
  const [rollupOpen, setRollupOpen] = useState(false);
  const [selectNoteId, setSelectNoteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const { notes, createNote, updateNote } = usePlcNotes(plc.id);
  const { todos, loading: todosLoading, archiveTodos } = usePlcTodos(plc.id);

  const openCount = countOpenActionItems(notes);
  const groups = openActionItemsByNote(notes);

  const handleSelectNote = (noteId: string) => {
    setSelectNoteId(noteId);
    setRollupOpen(false);
    setTab('notes');
  };

  const handleImport = async () => {
    if (!user || importing) return;
    setImporting(true);
    try {
      const draft = buildImportedTodosNote(todos, user.uid, Date.now());
      const existing = notes.find(
        (n) => n.title === IMPORTED_TODOS_NOTE_TITLE && n.deletedAt == null
      );
      let targetId: string;
      if (existing) {
        const merged = mergeActionItems(
          existing.actionItems ?? [],
          draft.actionItems
        );
        await updateNote(
          existing.id,
          { actionItems: merged },
          { expectedVersion: existing.version }
        );
        targetId = existing.id;
      } else {
        targetId = await createNote({
          title: draft.title,
          body: draft.body,
          kind: 'freeform',
          actionItems: draft.actionItems,
        });
      }
      await archiveTodos(todos.map((td) => td.id));
      addToast(
        t('plcDashboard.notes.importTodos.success', {
          defaultValue: 'Imported {{count}} to-dos',
          count: todos.length,
        }),
        'success'
      );
      setSelectNoteId(targetId);
      setTab('notes');
    } catch (err) {
      logError('NotesDocsBody.importTodos', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.notes.importTodos.failed', {
          defaultValue: 'Could not import the to-dos',
        }),
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const tabs: Array<{
    id: NotesDocsTab;
    label: string;
    icon: typeof StickyNote;
  }> = [
    {
      id: 'notes',
      label: t('plcDashboard.notesDocs.notesTab', {
        defaultValue: 'Meeting Notes',
      }),
      icon: StickyNote,
    },
    {
      id: 'docs',
      label: t('plcDashboard.notesDocs.docsTab', {
        defaultValue: 'Google Docs',
      }),
      icon: FileText,
    },
  ];

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Tab switcher + open action items rollup */}
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div
          className="flex items-center gap-1"
          role="tablist"
          aria-label={t('plcDashboard.notesDocs.tablistLabel', {
            defaultValue: 'Notes and docs',
          })}
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                id={`plc-notesdocs-tab-${id}`}
                aria-controls={`plc-notesdocs-panel-${id}`}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/60 ${
                  active
                    ? 'bg-brand-blue-primary text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
        {openCount > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setRollupOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              {t('plcDashboard.notes.actionItems.openCount', {
                defaultValue: 'Open action items ({{count}})',
                count: openCount,
              })}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {rollupOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 w-72 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg custom-scrollbar">
                {groups.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400">
                    {t('plcDashboard.notes.actionItems.noneOpen', {
                      defaultValue: 'No open action items',
                    })}
                  </p>
                ) : (
                  groups.map(({ note, items }) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => handleSelectNote(note.id)}
                      className="block w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                    >
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {note.title ||
                          t('plcDashboard.notes.untitled', {
                            defaultValue: 'Untitled',
                          })}
                      </div>
                      <div className="text-xxs text-slate-400 mt-0.5">
                        {items.length}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legacy to-do import banner */}
      {canEdit && !todosLoading && todos.length > 0 && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-blue-lighter/40 border border-brand-blue-light/40 rounded-xl">
          <span className="text-xs font-semibold text-slate-700">
            {t('plcDashboard.notes.importTodos.banner', {
              defaultValue:
                'Import {{count}} to-dos from the old to-do list into a note',
              count: todos.length,
            })}
          </span>
          <button
            type="button"
            disabled={importing}
            onClick={() => void handleImport()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-60 text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('plcDashboard.notes.importTodos.button', {
              defaultValue: 'Import',
            })}
          </button>
        </div>
      )}

      {/* Active panel. Keep both mounted? No — the Docs embed iframe is heavy;
          mount only the active tab. Switching is cheap (no extra listeners). */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'notes' ? (
          <div
            role="tabpanel"
            id="plc-notesdocs-panel-notes"
            aria-labelledby="plc-notesdocs-tab-notes"
            className="h-full"
          >
            <NotesBody plc={plc} selectNoteId={selectNoteId} />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="plc-notesdocs-panel-docs"
            aria-labelledby="plc-notesdocs-tab-docs"
            className="h-full bg-white border border-slate-200 rounded-2xl overflow-hidden"
          >
            <PlcDocsBody plc={plc} />
          </div>
        )}
      </div>
    </div>
  );
};
