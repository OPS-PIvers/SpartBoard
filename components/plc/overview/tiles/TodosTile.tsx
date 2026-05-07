import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import { Plc } from '@/types';
import { usePlcTodos } from '@/hooks/usePlcTodos';
import { logError } from '@/utils/logError';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface TodosTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 6;

export const TodosTile: React.FC<TodosTileProps> = ({ plc, onNavigateTab }) => {
  const { t } = useTranslation();
  const { todos, loading, toggleDone } = usePlcTodos(plc.id);
  const incomplete = todos.filter((todo) => !todo.done);
  const preview = incomplete.slice(0, PREVIEW_LIMIT);
  const remaining = Math.max(0, incomplete.length - preview.length);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
          <ListChecks className="w-3.5 h-3.5 text-violet-600" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.todos.heading', {
            defaultValue: 'To-do list',
          })}
        </h4>
        {incomplete.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {incomplete.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-2">
            <ListChecks className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.todos.empty', {
                defaultValue: 'Nothing to do',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t('plcDashboard.overview.tiles.todos.emptySubtitle', {
                defaultValue: 'Add action items in the To-Do tab.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-1 py-1">
            {preview.map((todo) => (
              <li
                key={todo.id}
                className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={(e) => {
                    void toggleDone(todo.id, e.target.checked).catch(
                      (err: unknown) => {
                        logError('TodosTile.toggleDone', err, {
                          plcId: plc.id,
                          todoId: todo.id,
                        });
                      }
                    );
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer"
                  aria-label={t('plcDashboard.overview.tiles.todos.toggle', {
                    defaultValue: 'Mark "{{text}}" complete',
                    text: todo.text,
                  })}
                />
                <span className="flex-1 text-xs text-slate-700 leading-snug">
                  {todo.text}
                </span>
              </li>
            ))}
            {remaining > 0 && (
              <li className="px-1.5 pt-1 text-xxs text-slate-400 italic">
                {t('plcDashboard.overview.tiles.todos.moreCount', {
                  defaultValue: '+{{count}} more',
                  count: remaining,
                })}
              </li>
            )}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('todos')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-violet-700 hover:bg-violet-50/60 transition-colors"
      >
        {t('plcDashboard.overview.tiles.todos.openAll', {
          defaultValue: 'Open list',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};
