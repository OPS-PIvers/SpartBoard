import React from 'react';
import { Archive } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { QuizConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

export const QuizManagementField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { updateWidget } = useDashboard();
  const config = ctx.config as unknown as QuizConfig;

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
      <p className="text-xs text-slate-600">
        {ctx.t('widgetSettings.quiz.managementHelp')}
      </p>
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
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <button
        type="button"
        onClick={() =>
          ctx.updateConfig({ view: 'manager', managerTab: 'archive' })
        }
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
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
      >
        {ctx.t('widgetSettings.quiz.managerView')}
      </button>
      {config.view !== 'manager' && (
        <p className="text-xxs font-semibold text-slate-500">
          {ctx.t('widgetSettings.quiz.currentView', { view: config.view })}
        </p>
      )}
    </div>
  );
};
