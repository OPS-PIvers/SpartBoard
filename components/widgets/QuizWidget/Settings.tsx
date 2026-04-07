import React from 'react';
import { WidgetData, QuizConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useQuizSessionTeacher } from '@/hooks/useQuizSession';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Info } from 'lucide-react';

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
    <div className="space-y-5">
      <div className="flex items-start gap-2 p-3 bg-brand-blue-lighter/30 border border-brand-blue-primary/10 rounded-xl text-xs text-brand-blue-primary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          All quiz management (import, edit, preview, live sessions) is
          available on the front of this widget. Flip back to access it.
        </span>
      </div>

      <div>
        <SettingsLabel>Widget Label</SettingsLabel>
        <input
          type="text"
          value={widget.customTitle ?? ''}
          onChange={(e) =>
            updateWidget(widget.id, { customTitle: e.target.value || null })
          }
          placeholder="Quiz"
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>

      {hasActiveSession && (
        <button
          onClick={async () => {
            await endQuizSession();
            addToast('Active session ended.', 'success');
          }}
          className="w-full py-2 bg-brand-red-primary hover:bg-brand-red-dark text-white text-sm rounded-lg transition-colors font-bold"
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
        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors border border-slate-200"
      >
        Reset to Manager View
      </button>
    </div>
  );
};
