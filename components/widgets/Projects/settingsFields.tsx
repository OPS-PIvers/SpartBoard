import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { ManagedNotice } from '@/components/settings/ManagedNotice';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { tourAttr } from '@/config/tourAnchors';

export const ProjectsLibraryField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { enabled } = useProjectsWidgetSettings();

  if (!enabled) {
    return (
      <ManagedNotice
        ctx={ctx}
        text={ctx.t('widgetSettings.projects.rolloutOff')}
      />
    );
  }

  return (
    <button
      id={ctx.id}
      type="button"
      onClick={() =>
        ctx.updateConfig({ view: 'manager', managerTab: 'library' })
      }
      className="w-full rounded-lg bg-brand-blue-primary px-3 py-2 text-sm text-white transition-colors hover:bg-brand-blue-dark focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:ring-offset-2"
      {...tourAttr(
        'widget-settings.projects.library',
        ctx.widget.id,
        ctx.widget.type
      )}
    >
      {ctx.t('widgetSettings.projects.goToLibrary')}
    </button>
  );
};
