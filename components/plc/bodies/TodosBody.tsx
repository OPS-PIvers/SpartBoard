import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Loader2, Plus, Trash2 } from 'lucide-react';
import { Plc, PlcTodo } from '@/types';
import { useDialog } from '@/context/useDialog';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { usePlcTodos } from '@/hooks/usePlcTodos';
import { usePlcSoftDelete } from '@/hooks/usePlcTrash';
import { logError } from '@/utils/logError';
import { PlcViewerReadOnlyBadge } from '@/components/plc/viewer/PlcViewerReadOnlyBadge';

interface TodosBodyProps {
  plc: Plc;
}

/**
 * Shared to-do list body extracted from the legacy `PlcTodosTab` so the
 * Phase 1+ live-tile renderer can mount the same checklist UI without
 * duplicating the optimistic-toggle / inline-edit logic.
 */
export const TodosBody: React.FC<TodosBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  // Viewers can read the list but can't add / toggle / edit / delete (Decision
  // 3.2). The rules layer hard-denies viewer writes; this gates the UI to match.
  const canEdit = useCanEditPlcContent();
  const {
    todos,
    loading,
    createTodo,
    toggleDone,
    updateText,
    deleteTodo,
    restoreTodo,
  } = usePlcTodos(plc.id);
  const { softDelete } = usePlcSoftDelete(plc.id);

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  // Guards against the stale-onBlur race: pressing Escape calls
  // setEditingId(null) which unmounts the focused input. The browser then
  // fires a synchronous blur carrying the stale onBlur closure (still holding
  // the typed text). Setting this ref before unmounting lets the onBlur
  // handler bail out instead of committing the cancelled edit to Firestore.
  // Same pattern as DraggableWindow's isCancellingTitleRef (Bug #1965).
  const isCancellingEditRef = useRef(false);
  // Reset the flag in the render body whenever an edit is active so it can
  // never leak from one editing session into the next (CLAUDE.md: render-body
  // ref assignment; suppressed because react-hooks/refs fires on conditional
  // render-body mutations).
  if (editingId !== null) {
    // eslint-disable-next-line react-hooks/refs
    isCancellingEditRef.current = false;
  }

  const incomplete = todos.filter((t) => !t.done);
  const complete = todos.filter((t) => t.done);

  const handleAdd = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    try {
      await createTodo(trimmed);
    } catch (err) {
      logError('TodosBody.createTodo', err, { plcId: plc.id });
      setDraft(trimmed);
    }
  };

  const handleSubmitEdit = async (todo: PlcTodo) => {
    const trimmed = editingText.trim();
    setEditingId(null);
    if (!trimmed || trimmed === todo.text) return;
    try {
      await updateText(todo.id, trimmed);
    } catch (err) {
      logError('TodosBody.updateText', err, {
        plcId: plc.id,
        todoId: todo.id,
      });
    }
  };

  const handleDelete = async (todo: PlcTodo) => {
    const confirmed = await showConfirm(
      t('plcDashboard.todos.confirmDelete', {
        defaultValue: 'Delete this to-do?',
      }),
      {
        title: t('plcDashboard.todos.confirmDeleteTitle', {
          defaultValue: 'Delete to-do',
        }),
        variant: 'danger',
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
      }
    );
    if (!confirmed) return;
    try {
      // Soft-delete with undo (Decision 3.1): tombstone the to-do, log
      // `item_deleted`, and pop an Undo toast that restores it.
      await softDelete({
        type: 'todo',
        id: todo.id,
        title: todo.text,
        runDelete: () => deleteTodo(todo.id),
        runRestore: () => restoreTodo(todo.id),
      });
    } catch (err) {
      logError('TodosBody.deleteTodo', err, {
        plcId: plc.id,
        todoId: todo.id,
      });
    }
  };

  const renderRow = (todo: PlcTodo) => {
    const isEditing = editingId === todo.id;
    return (
      <li
        key={todo.id}
        className="group flex items-start gap-3 px-3 py-2.5 bg-white border border-slate-200 hover:border-brand-blue-primary/30 rounded-xl transition-colors"
      >
        <input
          type="checkbox"
          checked={todo.done}
          disabled={!canEdit}
          onChange={(e) => {
            if (!canEdit) return;
            void toggleDone(todo.id, e.target.checked).catch((err: unknown) => {
              logError('TodosBody.toggleDone', err, {
                plcId: plc.id,
                todoId: todo.id,
              });
            });
          }}
          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary cursor-pointer disabled:cursor-default"
          aria-label={t('plcDashboard.todos.toggle', {
            defaultValue: 'Mark "{{text}}" complete',
            text: todo.text,
          })}
        />
        {!canEdit ? (
          <span
            className={`flex-1 text-left text-sm leading-snug ${
              todo.done ? 'text-slate-400 line-through' : 'text-slate-700'
            }`}
          >
            {todo.text}
          </span>
        ) : isEditing ? (
          <input
            type="text"
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={(e) => {
              // Bail out if the input is no longer connected (e.g. Enter
              // committed the edit and React already unmounted it).
              if (!e.currentTarget?.isConnected) return;
              if (isCancellingEditRef.current) {
                isCancellingEditRef.current = false;
                return;
              }
              void handleSubmitEdit(todo);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmitEdit(todo);
              } else if (e.key === 'Escape') {
                // Set the cancellation flag BEFORE calling setEditingId(null)
                // — the state update unmounts the input, which synchronously
                // fires blur with the stale onBlur closure (still holding the
                // typed text). The flag is read in onBlur to skip the write.
                isCancellingEditRef.current = true;
                setEditingId(null);
              }
            }}
            autoFocus
            className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none text-sm text-slate-700"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingId(todo.id);
              setEditingText(todo.text);
            }}
            className={`flex-1 text-left text-sm leading-snug ${
              todo.done ? 'text-slate-400 line-through' : 'text-slate-700'
            }`}
          >
            {todo.text}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => void handleDelete(todo)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
            aria-label={t('plcDashboard.todos.deleteTodo', {
              defaultValue: 'Delete to-do',
            })}
            title={t('plcDashboard.todos.deleteTodo', {
              defaultValue: 'Delete to-do',
            })}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </li>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Add new — viewers get the read-only affordance instead (Decision 3.2). */}
      {canEdit ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder={t('plcDashboard.todos.addPlaceholder', {
              defaultValue: 'Add a to-do for the PLC…',
            })}
            className="flex-1 px-3 py-2 bg-white border border-slate-200 focus:border-brand-blue-primary focus:ring-2 focus:ring-brand-blue-primary/20 rounded-lg text-sm text-slate-700 transition-colors"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('plcDashboard.todos.add', { defaultValue: 'Add' })}
          </button>
        </div>
      ) : (
        <div className="flex">
          <PlcViewerReadOnlyBadge
            note={t('plcDashboard.viewer.todosNote', {
              defaultValue:
                'Viewers can read the to-do list but can’t add or change items.',
            })}
          />
        </div>
      )}

      {/* Open */}
      <section>
        <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-400 px-1 mb-2">
          {t('plcDashboard.todos.openHeading', {
            defaultValue: 'To do',
            count: incomplete.length,
          })}
          {incomplete.length > 0 && (
            <span className="ml-2 text-slate-500">{incomplete.length}</span>
          )}
        </h3>
        {incomplete.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center text-xs text-slate-500 py-8 bg-white rounded-2xl border border-dashed border-slate-200">
            <ListChecks className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.todos.allDone', {
                defaultValue: 'Nothing on the list',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">{incomplete.map(renderRow)}</ul>
        )}
      </section>

      {/* Done */}
      {complete.length > 0 && (
        <section>
          <h3 className="text-xxs font-bold uppercase tracking-widest text-slate-400 px-1 mb-2">
            {t('plcDashboard.todos.doneHeading', { defaultValue: 'Done' })}
            <span className="ml-2 text-slate-500">{complete.length}</span>
          </h3>
          <ul className="space-y-2 opacity-80">{complete.map(renderRow)}</ul>
        </section>
      )}
    </div>
  );
};
