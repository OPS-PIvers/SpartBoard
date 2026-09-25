import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';

export const ProjectsLibraryField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { enabled } = useProjectsWidgetSettings();

  if (!enabled) {
    return (
      <p
        id={ctx.id}
        role="note"
        aria-labelledby={ctx.labelId}
        className="text-sm text-slate-600"
      >
        {ctx.t('widgetSettings.projects.rolloutOff')}
      </p>
    );
  }

  const helpId = `${ctx.id}-library-help`;
  return (
    <div className="flex flex-col gap-2">
      <p id={helpId} className="text-xs text-slate-600">
        {ctx.t('widgetSettings.projects.libraryHelp')}
      </p>
      <button
        id={ctx.id}
        type="button"
        onClick={() =>
          ctx.updateConfig({ view: 'manager', managerTab: 'library' })
        }
        aria-describedby={helpId}
        className="w-full rounded-lg bg-brand-blue-primary px-3 py-2 text-sm text-white transition-colors hover:bg-brand-blue-dark focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:ring-offset-2"
      >
        {ctx.t('widgetSettings.projects.goToLibrary')}
      </button>
    </div>
  );
};
