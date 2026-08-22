import React from 'react';
import { WidgetData, QuizConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Info, Archive } from 'lucide-react';

// Settings panel (back of the widget) — minimal since all management is front-facing
export const QuizWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as QuizConfig;

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
        <SettingsLabel htmlFor={`quiz-widget-label-${widget.id}`}>
          Widget Label
        </SettingsLabel>
        <input
          id={`quiz-widget-label-${widget.id}`}
          type="text"
          value={widget.customTitle ?? ''}
          onChange={(e) =>
            updateWidget(widget.id, { customTitle: e.target.value || null })
          }
          placeholder="Quiz"
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
      </div>

      <button
        onClick={() =>
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              managerTab: 'archive',
            } as QuizConfig,
          })
        }
        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg transition-colors border border-slate-200 flex items-center justify-center gap-2"
      >
        <Archive className="w-4 h-4" />
        View Assignment Archive
      </button>

      <button
        onClick={() =>
          updateWidget(widget.id, {
            config: {
              ...config,
              view: 'manager',
              managerTab: 'library',
              selectedQuizId: null,
              selectedQuizTitle: null,
              activeAssignmentId: null,
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
