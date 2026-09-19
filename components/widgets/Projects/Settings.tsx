import React from 'react';
import type { ProjectsConfig, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { TypographySettings } from '@/components/common/TypographySettings';

/**
 * R1 — authoring moved to the widget body. This panel only points back at it,
 * the way Guided Learning's does.
 */
export const ProjectsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { enabled } = useProjectsWidgetSettings();
  const config = widget.config as ProjectsConfig;

  if (!enabled) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-600">
          Projects is switched off for this district. An admin turns it on under
          Admin Settings, Rollouts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold text-white">Projects</h3>
      <p className="text-xs text-slate-400">
        Build projects, set up groups and grade them from the main widget panel.
        Each project&apos;s steps and rubric live in its own editor.
      </p>
      <button
        type="button"
        onClick={() =>
          updateWidget(widget.id, {
            config: { ...config, view: 'manager', managerTab: 'library' },
          })
        }
        className="w-full rounded-lg bg-brand-blue-primary px-3 py-2 text-sm text-white transition-colors hover:bg-brand-blue-dark"
      >
        Go to Library
      </button>
    </div>
  );
};

export const ProjectsAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ProjectsConfig;
  const update = (updates: Partial<ProjectsConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="space-y-6 p-1">
      <p className="text-xs text-slate-400">
        These style the project board — the group rows you project.
      </p>
      <TypographySettings
        config={config}
        updateConfig={update}
        showColorPicker={false}
      />
      <SurfaceColorSettings
        config={config}
        updateConfig={update}
        label="Group rows"
      />
    </div>
  );
};
