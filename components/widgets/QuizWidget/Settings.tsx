import React from 'react';
import { WidgetData, QuizConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useQuizSessionTeacher } from '@/hooks/useQuizSession';

// Settings panel (back of the widget) — minimal since all management is front-facing
export const QuizWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast } = useDashboard();
  const { user } = useAuth();
  const { session, endQuizSession } = useQuizSessionTeacher(user?.uid);
  const config = widget.config as QuizConfig;
  const hasActiveSession = !!(session && session.status !== 'ended');

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm font-semibold text-white">Quiz Widget Settings</p>
      <div className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-xl text-xs text-blue-300">
        All quiz management (import, edit, preview, live sessions) is available
        on the front of this widget. Flip back to access it.
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Widget Label
        </label>
        <input
          type="text"
          value={widget.customTitle ?? ''}
          onChange={(e) =>
            updateWidget(widget.id, { customTitle: e.target.value || null })
          }
          placeholder="Quiz"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {hasActiveSession && (
        <button
          onClick={async () => {
            await endQuizSession();
            addToast('Active session ended.', 'success');
          }}
          className="w-full py-2 bg-brand-red-primary hover:bg-brand-red-dark text-white text-sm rounded-xl transition-colors font-bold"
        >
          Force End Active Session
        </button>
      )}

      <button
        onClick={() =>
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              selectedQuizId: null,
              selectedQuizTitle: null,
              activeLiveSessionCode: null,
              resultsSessionId: null,
            } as QuizConfig,
          })
        }
        className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-xl transition-colors"
      >
        Reset to Manager View
      </button>
    </div>
  );
};
