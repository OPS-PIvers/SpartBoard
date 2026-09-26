import React from 'react';
import { Archive } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import { tourAttr } from '@/config/tourAnchors';

export const QuizManagementField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { updateWidget } = useDashboard();

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
        {ctx.t('widgetSettings.quiz.widgetLabel')}
        <input
          type="text"
          value={ctx.widget.customTitle ?? ''}
          onChange={(event) =>
            updateWidget(ctx.widget.id, {
              customTitle: event.target.value || null,
            })
          }
          placeholder={ctx.t('widgetSettings.quiz.widgetLabelPlaceholder')}
          {...tourAttr('quiz-settings.widget-label', ctx.widget.id, 'quiz')}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <button
        type="button"
        onClick={() =>
          ctx.updateConfig({ view: 'manager', managerTab: 'archive' })
        }
        {...tourAttr('quiz-settings.assignment-archive', ctx.widget.id, 'quiz')}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
      >
        <Archive className="h-4 w-4" />
        {ctx.t('widgetSettings.quiz.assignmentArchive')}
      </button>
      <button
        type="button"
        onClick={() =>
          ctx.updateConfig({
            view: 'manager',
            managerTab: 'library',
            selectedQuizId: null,
            selectedQuizTitle: null,
            activeAssignmentId: null,
            activeLiveSessionCode: null,
            resultsSessionId: null,
          })
        }
        {...tourAttr('quiz-settings.manager-view', ctx.widget.id, 'quiz')}
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
      >
        {ctx.t('widgetSettings.quiz.managerView')}
      </button>
    </div>
  );
};
